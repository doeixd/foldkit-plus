# Upcasting durable Messages (#190, Phase 0 item 6)

Status: designed 2026-11-11, not built. Phase 0 item 6 of
[contract-layer-PLAN.md](./contract-layer-PLAN.md), for its invariant 7
("durable Messages stay readable"). Phase 5 item 6 builds it.

## 1. The problem

Sync stores a durable Message, encoded, inside an operation envelope, in two
places: the replica's outbox (the `pending` array of the replica state, in
IndexedDB or any `Storage`) and the server's journal (`foldkit-durable`'s
`operations` table). Both decode it again later, possibly under a newer
build. When an application changes a durable Message's Schema (renames a
field, splits a variant, changes a unit), what was stored under the old
Schema no longer decodes, and today nothing says which Schema it was written
under.

**No version names the application's Message.** The envelope has
`protocolVersion` and `schemaVersion` (`packages/sync/src/sync.ts:41-55`), both
`Schema.Literal(1)`: they version Sync's own envelope and replica state, and
`unsupportedVersion` (`sync.ts:389-408`) reads them. The Message itself is
`Schema.Unknown` (`sync.ts:54`), decoded against whatever `message` the
current build declares (`sync.ts:345`). The journal versions only its SQL
tables (`packages/durable/src/journal.ts:543-649`, `UnsupportedJournalVersionError`).

**Where a stored operation is decoded, and what a failure does today:**

| Site | Reads | Failure today |
| --- | --- | --- |
| `openReplica`, each pending operation (`sync.ts:527-532`) | the outbox | `InvalidOutboxError`: the replica does not open, and every edit in it waits |
| exchange, each committed operation (`sync.ts:815-821`) | what the server sent | `InvalidReplicaHistoryError`: the exchange fails, `start` retries the same page on a backoff for good |
| projection, `optimistic` (`sync.ts:480-483`) | the outbox | a throw where the outbox is replayed |
| `journalExchange`, each pending entry (`packages/sync/src/journal.ts:118-120`, `:151-158`) | what a replica sent | rejected by its id, "Not an operation this server accepts"; the replica drops it and reports it |
| `prepare` (`durable/src/journal.ts:977-993`) | the same entry, as the journal's operation codec | `InvalidOperationError`, rejected by id (`sync/src/journal.ts:185-186`) |
| a retransmitted id already committed (`durable/src/journal.ts:1031-1034`) | the stored row | `InvalidOperationError`: an edit that **did** commit comes back rejected, "Not a valid operation" |
| `materialize` (`durable/src/journal.ts:812-820`) | stored rows since the last snapshot | `JournalError` "Could not load the snapshot": every exchange of the document fails |
| `read` (`durable/src/journal.ts:938-946`) | stored rows after a cursor | `JournalError` "Could not read the log": the same |
| `committedOf` (`sync/src/journal.ts:121-125`, called in `:202`) | a row the journal read | a throw inside `Effect.map`, so a defect, not a typed error |
| `reduce`, `stamp` (`sync.ts:461`, `:467-472`), `authorize` (`make.ts:458`) | an operation the journal holds | thrown inside the journal's transaction |

So a changed Schema already fails loudly on most paths, but in the wrong
way: a server refuses every exchange for the document, a replica either
cannot open or retries forever, and one path (a retransmission after a lost
acknowledgement) tells the person a committed edit was refused. The AGENTS.md
trap "An exchange that throws on one operation blocks the outbox" is why
`journalExchange` refuses by id; nothing yet lets an old operation be read
instead of refused.

`foldkit-durable` alone takes any `CodecInput` (`durable/src/codec.ts:24-26`)
and has no idea of a Message. Upcasting belongs to whoever supplies that
codec, which for Sync is `sync.journalContract()`.

## 2. Who owns what

- **The application owns its Message history**: which Schemas it has
  shipped and how each becomes the next. Only it knows that `title` became
  `name`, or that cents became a decimal.
- **The replica's outbox owns unsent intent.** A pending operation may be the
  only copy of an edit made offline. Deleting it is data loss, not cache
  eviction.
- **The server's journal owns committed history**, as stored. It decides
  order and acceptance; it does not own the meaning of an old Message.
- **Sync owns the envelope**, and so the version stamped on it, and applies
  the application's history wherever it decodes a Message.

Nothing here owns the shared snapshot's Schema (`shared`); §7.

## 3. Options considered

**A. No version; the application's `message` Schema accepts old shapes**
(`Schema.Union([Current, Old.pipe(Schema.decodeTo(Current, …))])`, which
Effect 4.1 supports, with `SchemaGetter.forbidden` to refuse encoding back).
Rejected: decoding picks by structure, so a change of meaning with no change
of shape (cents to decimal) is read wrongly and silently; the old shapes stay
acceptable from every new client, in a Port, and anywhere else the Message
union is decoded; and nothing can tell an operation from a newer build
(which must wait) from a malformed one (which may be refused).

**B. A version per variant** (each tag carries its own number). Rejected:
every reader needs a table per tag, a split or merge of variants has no
single tag to number, and one document-wide number already says everything a
reader needs. A step may still touch only the variants it changes (§4).

**C. Rewrite stored operations at deploy** (a migration over the journal and
each outbox). Rejected: the outbox lives on devices the server cannot reach,
so its copies would be upcast on read anyway; and rewriting the journal
changes stored rows that `payload_hash` (`durable/src/journal.ts:1023-1025`)
compares a retransmission against.

**D. Refuse every operation of an old version.** Rejected as the default: an
offline edit made before a deploy would be lost for a rename the application
could have described. It remains what happens to an operation no step can
read (§5).

**E. Chosen: a version per operation, and a typed chain of steps applied on
read.**

## 4. The chosen shape

An operation keeps the version it was written at. Whoever reads its meaning
upcasts it.

The application declares its history as a chain. Version 1 is the first
Schema; each `next` adds a version, with the Schema of that version and a
function from the previous version's encoded side to its own. Positions are
the version numbers, so none can be skipped or repeated. Steps are written
once and never changed: a later change adds a step after them.

The code below compiled in a `*.test-d.ts` under `examples/kitchen-sink`
(`pnpm exec tsc -b examples/kitchen-sink`; a misplaced `@ts-expect-error` in
it failed the build, so the file is checked) and its `upcast` was run on the
cases in §5. The `migrations` sketch is that file's own implementation, not
package code.

```ts
import { Match, Schema } from 'effect'

// ---- Proposed in foldkit-sync (not built) ----

/** The Message history a document's operations may be stored in. Version 1 is the first schema. */
export interface Migrations<Encoded> {
  readonly version: number
  /** The next version: its schema, and how an operation of the previous version becomes one of it. */
  readonly next: <T, E>(
    schema: Schema.Codec<T, E, never, never>,
    up: (previous: Encoded) => NoInfer<E>,
  ) => Migrations<E>
  /** The current schema, which `Sync.make` checks is its own `message`. */
  readonly current: Schema.Codec<unknown, Encoded, never, never>
  /** Encoded at `version`, to encoded at the current version; throws when it is not one. */
  readonly upcast: (version: number, encoded: unknown) => Encoded
}

interface Step {
  readonly schema: Schema.Codec<unknown, unknown, never, never>
  readonly up: (previous: unknown) => unknown
}

const chain = <Encoded>(steps: ReadonlyArray<Step>): Migrations<Encoded> => ({
  version: steps.length,
  current: steps[steps.length - 1]!.schema as Schema.Codec<unknown, Encoded, never, never>,
  next: (schema, up) =>
    chain([...steps, { schema: schema as Step['schema'], up: up as Step['up'] }]),
  upcast: (version, encoded) => {
    if (!Number.isSafeInteger(version) || version < 1 || version > steps.length)
      throw new Error(`No Message version ${version}`)
    let value = encoded
    for (let at = version - 1; at < steps.length; at++) {
      if (at > version - 1) value = steps[at]!.up(value)
      // Validate against the whole schema, checks included, then pass the encoded value on.
      Schema.decodeUnknownSync(steps[at]!.schema, { onExcessProperty: 'error' })(value)
    }
    return value as Encoded
  },
})

export const migrations = <T, E>(first: Schema.Codec<T, E, never, never>): Migrations<E> =>
  chain([{ schema: first as Step['schema'], up: value => value }])

/** Proposed operation envelope field: absent reads as version 1. */
export const messageVersion = Schema.optionalKey(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
)

// ---- An application's use ----

const Cleared = Schema.TaggedStruct('Cleared', {})

/** Version 1: a note had a `title`. Kept as long as a stored operation may hold it. */
const RenamedV1 = Schema.TaggedStruct('Renamed', { title: Schema.String })
const NoteMessageV1 = Schema.Union([RenamedV1, Cleared])

/** Version 2, the current one: `title` became `name`. */
const Renamed = Schema.TaggedStruct('Renamed', { name: Schema.String })
const NoteMessage = Schema.Union([Renamed, Cleared])

export const NoteHistory = migrations(NoteMessageV1).next(NoteMessage, previous =>
  Match.valueTags(previous, {
    Renamed: ({ title }) => ({ _tag: 'Renamed' as const, name: title }),
    Cleared: cleared => cleared,
  }),
)

// `Sync.define({ …, message: NoteMessage, migrations: NoteHistory })` would take:
declare const takes: (
  migrations: Migrations<typeof NoteMessage.Encoded>,
) => void
takes(NoteHistory)

// A step that returns the previous shape is refused where it is written.
migrations(NoteMessageV1).next(NoteMessage, previous =>
  // @ts-expect-error `title` is not a field of version 2's `Renamed`
  Match.valueTags(previous, {
    Renamed: ({ title }) => ({ _tag: 'Renamed' as const, title }),
    Cleared: cleared => cleared,
  }),
)

// A history that stops short of the current schema is refused by `Sync.define`.
// @ts-expect-error version 1's encoded side is not the current one
takes(migrations(NoteMessageV1))
```

An old version's Schema reuses the variants that did not change (`Cleared`
above), so keeping one costs the changed variants only. It lists only
durable variants: nothing else is stored.

`Sync.define` and `Sync.forApplication(App).make` take `migrations` as an
option. The type requires its encoded side to be the current Message's; at
definition time Sync also checks `migrations.current === message` by
identity, since a structurally equal Schema of an older version would pass
the type. Without the option, the history is the current Schema alone, at
version 1.

**Where it applies.** Sync's `shape` (`sync.ts:426-429`) changes in one
respect: it reads `messageVersion` (absent is 1), refuses a version above
the current one, and normalizes the Message **at its own version**, by
decoding and encoding it with that version's Schema, instead of the current
one. A stored or sent operation is therefore never rewritten by reading it.
Every site that reads a Message's meaning (`reduce`, `stamp`, `authorize`,
`optimistic`, the exchange's `replay`, `coalesce`) calls
`upcast(version, message)` and then decodes with the current Schema. A
new operation is written at the current version, with the field omitted
while that is 1 (§6). `stamp` re-encodes at the current version, so a stamped
row is stored at the current version; its hash is taken before stamping
(`durable/src/journal.ts:992`, `:1114-1126`), as today. A `Rejection`
carries its operation as stored (`sync.ts:167-171`), so an application
reading `rejection.operation.message` gets it at its own version; the
contract should offer the upcast Message beside it.

Normalizing at the operation's own version keeps the payload hash stable
across a deploy: a retransmission of an operation committed under the old
build hashes as the old build hashed it, so it reads as already committed,
not as an id reused for another (`IdentityConflictError`). This holds only
if the kept Schema of that version normalizes as the old build's did; §8.

## 5. Failure semantics

An operation's version is either one this build has, one above it, or not a
version at all. One at a known version may still fail its step (the step's
Schema refuses it, or `up` throws).

| Where | A newer version | A known version no step reads |
| --- | --- | --- |
| Outbox, at `openReplica` | The replica refuses to open with a typed `UnsupportedMessageVersionError` (found, supported). Nothing is removed: a newer build reads it. | Refused by its id **locally**: moved from `pending` to a persisted `refused` list in the replica state, in the same write, and reported in `status.rejected` until the application dismisses it. The rest of the outbox opens and sends. |
| Server, a pending entry in `journalExchange` | The exchange fails with a typed error before anything is appended, so the replica keeps it and retries on its backoff. A rolling deploy that reached the client first is temporary. | Rejected by its id with a typed reason (`Unreadable`, §9), as an undecodable entry is today. The replica moves it to `refused`. |
| Server, a committed row (`materialize`, `read`, an already-committed id) | The document refuses to open: a typed `UnreadableHistoryError` (document, sequence, version), a `JournalError` case, for every exchange of that document. Other documents are unaffected. | The same. Committed history is the base every replica builds on; skipping a row would give replicas a different snapshot than the server. |
| Replica, a committed operation from the server | `UnsupportedMessageVersionError`: the client is older than the server and must reload. | `InvalidReplicaHistoryError`, as today. A server with the same chain refuses the document first, so this means client and server disagree on a step. |

The outbox refuses locally, rather than sending what it cannot read, because
the server applies the same chain, so the round trip could only refuse it
too, and because the replica cannot build its optimistic view while the
operation sits in it. The `refused` list keeps the encoded operation, so its
payload is never lost: an application can show it, offer to retry it under a
corrected step, or discard it.

`committedOf` (`sync/src/journal.ts:121-125`) moves inside a typed `Effect.try`,
so an unreadable row is the error above, not a defect.

Invariant 7 reads "the journal and the replica refuse to open with a typed
error". This note keeps that for committed history and for a newer version,
and refuses a pending operation by its id instead: one person's unreadable
edit should not stop every other edit on that device. The invariant's
wording should say so (§10).

## 6. Migration

- **The Sync release that adds this** writes no `messageVersion` while an
  application is at version 1, so its envelope is byte-for-byte today's. The
  current `decodeOperation` refuses excess keys (`sync.ts:67`); a field
  written by default would get every new client's edits refused by a server
  still on the old release.
- **An application's first `next`** is deployed server first: a server on
  version 2 reads version 1 and 2; a version-1 client still talking to it is
  fine. A version-2 client reaching a version-1 server (after this release)
  waits and retries (§5). Before this release, such a server rejects it by
  id, which is why the release itself goes everywhere first.
- **A rollback** to an older build meets operations above its version: the
  replica refuses to open, and the server refuses the document, with typed
  errors, and nothing is deleted. Rolling forward again reads them.
- **`SCHEMA_VERSION` does not change.** `messageVersion` is an optional key in
  the envelope and in the replica state's `pending`, and a new optional
  `refused` key in the replica state; an older build would refuse a state
  holding either (`onExcessProperty: 'error'`), which is the rollback case.
- Nothing public is removed, so there is no deprecation.

## 7. What it leaves out

- **The shared snapshot.** A change to `shared` breaks the replica's
  `committed`, a checkpoint, and the journal's snapshot
  (`sync.ts:363`, `:503-511`; `durable/src/journal.ts:817`) the same way.
  The same chain could carry a `shared` history, or a journal could rebuild
  its snapshot from an uncompacted log. Not decided here.
- **Downcasting.** An older build never reads a newer operation; it waits or
  reloads.
- **Pruning old versions.** A step is kept while anything may store its
  version. Knowing that needs every outbox, which no server sees; compaction
  removes a payload (`durable/src/journal.ts:1043-1045`) but devices may
  still hold one. A chain starting above 1 is possible later.
- **A change of `update` with no change of Schema.** Replay through a new
  `update` of an old Message is the application's responsibility, as the
  comment at `sync.ts:663-665` already notes.
- **`foldkit-durable` used without Sync.** Its codec is the application's;
  option A is available there.
- **Rejections from the server persisting.** Today they live in a 32-entry
  in-memory list (`sync.ts:564`, `:883`). Whether they join `refused` is item
  5's decision.

## 8. Unknowns

- Whether an application's kept copy of an old Schema normalizes exactly as
  the old build's did. If not, a retransmission across the deploy reads as
  an identity conflict. A test helper could compare stored rows' hashes with
  the chain's normalization; not designed.
- What `UnsupportedMessageVersionError` on the client should do beyond
  stopping the exchange: reload by itself, or leave it to the application.
- Whether the server should tell a replica its current version in the
  exchange, so an old client learns it is old before receiving an operation
  it cannot read. Not needed for correctness here.
- The cost of `upcast` on every `materialize` of a long uncompacted log at an
  old version. Not measured.
- Whether `tsc` time stays within invariant 12's budget for a long chain;
  each `next` is one generic call, so it is expected to, but Phase 0 has not
  set the budget yet.

## 9. How it feeds item 5 and Phase 5

- **Item 5 (typed rejections).** An unreadable operation is a refusal the
  server and the replica both make, so item 5's `Refusal` union needs a case
  for it: `Unreadable { version }`. Remote's `Refusal` vocabulary
  (`packages/remote/src/mutationDescriptor.ts:77-103`: field, conflict,
  unmet, taken, invalid, referenced) has none that fits. Item 5 decides
  whether it joins that vocabulary or is Sync's own; it should also decide
  whether server rejections persist in `refused` (§7).
- **Phase 5 item 6** builds `Sync.migrations` as above, at every site in
  §1's table. Its "done when" ("a renamed durable Message replays from an old
  journal") needs, beyond that: an outbox written by the old build opening
  under the new one, an acknowledgement lost across the deploy reading as
  already committed, a client ahead of its server waiting rather than losing
  the edit, and an unreadable pending operation landing in `refused` with
  the rest of the outbox sent.
- **Phase 5 items 1 and 3** (server-only Messages and state) store Messages
  in the same journal, so they take the same chain; a server-only Message's
  versions are the same document-wide number.

## 10. To record

- contract-layer-PLAN invariant 7: committed history and newer versions
  refuse to open; an unreadable pending operation is refused by its id into
  a persisted list.
