# Upcasting durable Messages (#190, Phase 0 item 6)

Status: designed 2026-11-11 and reviewed in three rounds the same day, with
no blocking finding left; built on the branch 2026-11-11 (Phase 5 item 6),
with the decisions §8 left open recorded in §11. Phase 0 item 6 of
[contract-layer-PLAN.md](./contract-layer-PLAN.md), for its invariant 7
("durable Messages stay readable").

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
| `committedOf` (`sync/src/journal.ts:121-125`, called in `:199-202`) | a row the journal read | a throw inside `Option.match` and `Effect.succeed` in the generator, so a defect, not a typed error |
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

An operation is sent, and kept in the outbox, at the version it was written
at. Every reader of its meaning, Sync's and the application's, sees it
upcast to the current version.

The application declares its history as a chain. Version 1 is the first
Schema; each `next` adds a version, with the Schema of that version and a
function from the previous version's encoded side to its own. Positions are
the version numbers, so none can be skipped or repeated. Steps are written
once and never changed: a later change adds a step after them.

The code below compiled in a `*.test-d.ts` under `examples/kitchen-sink`
(`pnpm exec tsc -b examples/kitchen-sink`, clean; a deliberate type error
in it failed the build, so the file is checked). An earlier version's
`upcast` was run on the cases in §5. The `migrations` sketch is that file's
own implementation, not package code; `define` stands for `Sync.define`
with its other options elided.

```ts
import { Match, Schema } from 'effect'

// ---- Proposed in foldkit-sync (not built) ----

/** The Message history a document's operations may be stored in. Version 1 is the first schema. */
export interface Migrations<Type, Encoded> {
  readonly version: number
  /** The next version: its schema, and how an operation of the previous version becomes one of it. */
  readonly next: <T, E>(
    schema: Schema.Codec<T, E, never, never>,
    up: (previous: Encoded) => NoInfer<E>,
  ) => Migrations<T, E>
  /** The current schema: the document's Message. */
  readonly current: Schema.Codec<Type, Encoded, never, never>
  /** Encoded at `version`, to encoded at the current version; throws when it is not one. */
  readonly upcast: (version: number, encoded: unknown) => Encoded
}

interface Step {
  readonly schema: Schema.Codec<unknown, unknown, never, never>
  readonly up: (previous: unknown) => unknown
}

const chain = <Type, Encoded>(steps: ReadonlyArray<Step>): Migrations<Type, Encoded> => ({
  version: steps.length,
  current: steps[steps.length - 1]!.schema as Schema.Codec<Type, Encoded, never, never>,
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

export const migrations = <T, E>(first: Schema.Codec<T, E, never, never>): Migrations<T, E> =>
  chain([{ schema: first as Step['schema'], up: value => value }])

/** Proposed operation envelope field: absent reads as version 1. */
export const messageVersion = Schema.optionalKey(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
)

/** `Sync.define` reading its Message from the history (the rest of its options elided). */
declare const define: <Message, Encoded>(options: {
  readonly migrations: Migrations<Message, Encoded>
  readonly replay: (shared: number, message: Message) => number
}) => { readonly submit: (message: Message) => void }

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

const notes = define({
  migrations: NoteHistory,
  replay: (count, message) =>
    Match.valueTags(message, { Renamed: () => count + 1, Cleared: () => 0 }),
})
notes.submit(Renamed.make({ name: 'Groceries' }))

// The Message comes from the history, so a wrong one is refused.
// @ts-expect-error a string is not a NoteMessage
notes.submit('anything at all')
// @ts-expect-error version 1's `Renamed` is not the current Message
notes.submit(RenamedV1.make({ title: 'Groceries' }))

// A step that returns the previous shape is refused where it is written.
migrations(NoteMessageV1).next(NoteMessage, previous =>
  // @ts-expect-error `title` is not a field of version 2's `Renamed`
  Match.valueTags(previous, {
    Renamed: ({ title }) => ({ _tag: 'Renamed' as const, title }),
    Cleared: cleared => cleared,
  }),
)

// `forApplication(App).make` takes the history beside `App.Message`, typed by it.
declare const takes: (
  migrations: Migrations<typeof NoteMessage.Type, typeof NoteMessage.Encoded>,
) => void
takes(NoteHistory)
// @ts-expect-error a history that stops short of the current schema
takes(migrations(NoteMessageV1))
```

An old version's Schema reuses the variants that did not change (`Cleared`
above), so keeping one costs the changed variants only. It lists only
durable variants: nothing else is stored.

`Sync.define` takes the history in place of `message` and reads the Message
from it, Type and Encoded both, so the two cannot disagree and the Message
is still inferred where `submit` and `replay` use it (the
`@ts-expect-error` cases above go unused if it is not). Without the option,
`message` stays as today and the history is that Schema alone, at version 1.
`Sync.forApplication(App).make` cannot derive its Message, which is
`App.Message`, so there the option is typed by `App.Message`'s two sides and
the definition checks `migrations.current === App.Message` by identity,
since a structurally equal Schema of an older version would pass the type.

**The operation codec's two sides.** Sync's operation codec (the one
`journalContract` hands `foldkit-durable`, and `codec.operationFrom`)
becomes a transforming codec:

- Its **encoded side** is the operation as written: the envelope with
  `messageVersion` and the Message at that version. This is what a replica
  sends, and what its outbox holds: the replica state's `pending` is already
  the encoded envelope (`sync.ts:360`), and Sync reads each one's meaning
  where it needs it (`optimistic`, `sync.ts:480-483`), so pending operations
  stay as written, through every save, until they commit.
- Its **decoded side**, the `Operation` every caller receives, holds the
  Message upcast to the current version, and nothing else of the as-written
  form. Encoding it writes the current version, with `messageVersion`
  omitted when that is 1. An operation built by spreading one and replacing
  `message` (`shape`, `sync.ts:428`; `stamp`, `:468-475`; `coalesce`'s
  merge, `:654`; an application's own stamp) therefore encodes what it
  holds; there is no second copy to win.

What each party sees:

- **Every application-facing hook sees the current Message.** That is
  `journalExchange`'s `admit` (`sync/src/journal.ts:84-86`, `:161`),
  including `GuardSync.admit`'s `changesOf` (`guard/src/sync.ts:194-207`);
  the journal's `validate` and `authorize` (`durable/src/journal.ts:1088`,
  `:1093`); `reduce` and `stamp`; and `codec.operationFrom`
  (`sync.ts:281-285`). Without this, an application reader that decodes
  `operation.message` with the current Message would misread an old one:
  the registry's `changesOf` returns `[]` on a decode failure
  (`examples/registry/src/journal.ts:72-80`) and `[]` is admitted
  (`:109-112`), so a client claiming version 1 would pass the guard and
  `authorize`, and `reduce` would then apply the upcast edit.
- **`Rejection`** is built on the client from the operation it sent
  (`sync.ts:167-171`, `:878-882`), so its `operation` stays as written; it
  gains the upcast `message` beside it, which is what an application reads.
- **Tag checks run on the current Message**, including the durable check in
  `decodeDurable` (`sync.ts:421-425`) and Phase 5's server-only check, so a
  step that maps an old variant into a server-only one is refused like a
  server-only Message sent today (invariant 8).
- **`journal.append` is given the entry as received**, the encoded side
  (`durable/src/journal.ts:277-281`). `journalExchange` passes it the
  decoded operation today (`sync/src/journal.ts:170`), which works only
  because Sync's codec is the identity now; it changes to pass the raw entry
  it decoded for `admit`.
- **Storage holds the current version.** The journal stores
  `encode(operation)`, stamped or not (`durable/src/journal.ts:1126`), so
  every row appended after the deploy is at the current version, and a row
  committed before it is upcast whenever it is read.
- **`coalesce` sees one version.** It merges only an operation in `unsent`,
  submitted since this replica opened (`sync.ts:567`, `:628-634`), so
  written by this build at the current version.

**The payload hash needs the as-written form, and nothing else does.**
`prepare` hashes `canonicalJson(operationCodec.encode(operation))`
(`durable/src/journal.ts:950-958`, `:992`), and a retransmission of a
committed id is compared by that hash (`:1022-1025`). Hashing the decoded
side would hash the upcast form, so an operation committed under the old
build, whose acknowledgement was lost across the deploy, would be resent as
written, hash differently, and come back an `IdentityConflictError`: an
edit that committed reported as refused. So `foldkit-durable`'s operation
codec gains one optional member, the form a payload is compared by
(*Sketch*: `compared?: (input: Encoded) => Encoded`, defaulting to
`encode(decode(input))`, today's form). Sync supplies the entry normalized
**at its own version** (decoded and encoded with that version's Schema, no
upcast): what the old build hashed, since its `shape` normalized the same
way. `prepare` hashes `compared(input)`; the legacy comparison for a row
with no hash (`:1025-1029`) compares `compared` of both. An explicit
`messageVersion: 1` is dropped by `compared` too, so it and an absent field
hash alike (today's `shape` would keep it, `sync.ts:428`).

So `prepare` keeps two strings where it keeps one today
(`durable/src/journal.ts:991-992`, `:1126`): the canonical
`encode(operation)`, which is stored (or the stamped one), and the canonical
`compared(input)`, which is hashed. In the legacy comparison for a row with
no hash, `compared(JSON.parse(row.input))` throwing on an unreadable old row
is a `JournalError`, not the `InvalidOperationError` it maps to today
(`:1025-1029`), for the same reason as the already-committed path in §5: a
stored row that will not read is not the sender's fault.

**The as-written form gets its own type.** `Replica.pending`
(`sync.ts:201`, `:945`), `Transport`'s `pending` (`transport.ts:16`, `:39`)
and `Rejection.operation` are public and typed `Operation`, but hold what
was written. They become `WrittenOperation`, the codec's encoded side, so
one name never means two forms. Upcasting them on the way out was rejected:
the transport must send exactly what was written, or the hash above breaks,
and a reader that wants the meaning has `Rejection.message` or the codec.

The as-written form therefore lives in exactly two places, both outside the
decoded `Operation`: the replica's outbox and what it sends
(`WrittenOperation`), and the payload hash (as compared). The hash argument
holds on one condition: the application's kept Schema of an old version must normalize as the old build's Schema did.
§8.

## 5. Failure semantics

An operation's version is either one this build has, one above it, or not a
version at all. One at a known version may still fail its step (the step's
Schema refuses it, or `up` throws).

| Where | A newer version | A known version no step reads |
| --- | --- | --- |
| Outbox, at `openReplica` | The replica refuses to open with a typed `UnsupportedMessageVersionError` (found, supported). Nothing is removed: a newer build reads it. | Refused by its id **locally**: moved from `pending` to a persisted `refused` list in the replica state, and reported in `status.rejected` until the application dismisses it. The rest of the outbox opens and sends. |
| Server, pending entries in `journalExchange` | The exchange fails with a typed error before anything is appended, so the replica keeps them and retries on its backoff. Today's loop appends as it goes (`sync/src/journal.ts:151-191`), so this needs a scan of every entry's version before the loop. | Rejected by its id with a typed reason (`Unreadable`, §9), as an undecodable entry is today. The replica moves it to `refused`. |
| Server, a committed row (`materialize`, `read`, an already-committed id) | The document refuses to open with a typed `UnreadableHistoryError` (document, sequence, version) for every exchange of that document. Other documents are unaffected. | The same. Committed history is the base every replica builds on; skipping a row would give replicas a different snapshot than the server. |
| Replica, a committed operation from the server | `UnsupportedMessageVersionError`: the client is older than the server and must reload. | `InvalidReplicaHistoryError`, as today. A server with the same chain refuses the document first, so this means client and server disagree on a step. |

**Who builds `UnreadableHistoryError`.** `foldkit-durable` knows no Message
or version, so it cannot. Sync's codec throws a typed `UnreadableMessage`
(opId, version) when a stored row will not decode; `foldkit-durable` reports
any failure to decode a **stored** row as a `JournalError` carrying that
cause, and Sync's `journalExchange` turns such a `JournalError` into
`UnreadableHistoryError`. That needs one change in `foldkit-durable`: the
already-committed path decodes the stored row after the hashes match
(`durable/src/journal.ts:1022-1034`) and maps a failure to
`InvalidOperationError` (`:1033`), which `journalExchange` rejects by id
(`sync/src/journal.ts:185-186`). An unreadable stored row is not the
sender's fault, so it becomes a `JournalError` there, as in `materialize`
(`:819`) and `read` (`:945`). `foldkit-durable`'s README, which says a
payload that does not decode is an `InvalidOperationError`
(`packages/durable/README.md:212-214`), then needs "a payload sent"; a
stored one is a `JournalError`.

`journalExchange` tells this `JournalError` from one wrapping a `SqlError`
by its cause (an `UnreadableMessage` instance), not by its message.

**What the replica sees.** No typed error crosses the transport: a failing
exchange fails with a plain `Error` (`sync/src/journal.ts:130`, `:140`), and
the replica records a failed exchange in `status.lastError` and retries it
on its backoff (`sync.ts:892-905`). So `UnreadableHistoryError` stays on the
server, for its logs and diagnostics; the replica sees its exchanges failing
with the error's message, and keeps its outbox. Carrying the typed error to
the replica is item 5's wire, not this note's.

`committedOf` (`sync/src/journal.ts:121-125`) runs inside `Option.match` and
`Effect.succeed` in the generator (`:199-202`), so a throw there is a defect
today; it moves inside a typed `Effect.try`.

**The local refusal.** The outbox refuses locally, rather than sending what
it cannot read, because the server applies the same chain, so the round trip
could only refuse it too, and because the replica cannot build its optimistic
view while the operation sits in it. The `refused` list keeps the encoded
operation, so its payload is never lost: an application can show it, offer
to retry it under a corrected step, or discard it. Two consequences:

- `openReplica` writes nothing on open today (`sync.ts:559`, only for an
  empty store). Moving an entry to `refused` is a new write, made through
  `store` with the loaded revision, so a second tab that opened the same
  store meanwhile fails it as a revision conflict.
- A `refused` entry says "this build cannot read it", never "the server
  refused it". Under one chain shared by client and server it cannot have
  committed: a server that cannot read it would have refused it, or, if an
  older build committed it, now refuses the whole document (the third row).
  Only a client and server whose chains differ could disagree, and that is
  already an error (the fourth row).

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
- **An application's first `next`** is deployed server first. A server on
  version 2 reads versions 1 and 2. A version-1 client keeps syncing with it
  only until the first version-2 operation commits: from then on the client
  receives an operation it cannot read, gets `UnsupportedMessageVersionError`,
  and stops syncing until it reloads the new build. Its pending edits stay in
  its outbox and are sent after the reload. A version-2 client reaching a
  version-1 server (after this release) waits and retries (§5). Before this
  release, such a server rejects it by id, which is why the release itself
  goes everywhere first.
- **A rollback** to an older build meets operations above its version: the
  replica refuses to open, and the server refuses the document, with typed
  errors, and nothing is deleted. Rolling forward again reads them.
- **`SCHEMA_VERSION` does not change.** `messageVersion` is an optional key in
  the envelope and in the replica state's `pending`, and `refused` a new
  optional key in the replica state; an older build would refuse a state
  holding either (`onExcessProperty: 'error'`), which is the rollback case.
- Nothing public is removed, so there is no deprecation. The decoded
  `Operation`'s `message` is now always at the current version;
  `Replica.pending`, `Transport`'s `pending` and `Rejection.operation` are
  typed `WrittenOperation`; `Rejection` gains `message`; `foldkit-durable`'s codec gains the optional `compared`.

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

## 8. Unknowns and what is still vague

- Whether an application's kept copy of an old Schema normalizes exactly as
  the old build's did. If not, a retransmission across the deploy reads as
  an identity conflict, and a committed edit is reported refused. A test
  helper could compare stored rows' hashes with the chain's normalization;
  not designed.
- **`UnsupportedMessageVersionError` on the client**: whether it joins
  `ReplicaError` and ends `start`'s retries, or is recorded in
  `status.lastError` and retried on the backoff like other exchange failures
  (`sync.ts:892-905`); and whether the replica reloads by itself or leaves
  that to the application. Undecided.
- **Who decodes a `refused` entry for display.** It holds the encoded,
  unreadable form by definition, so no Schema of this build reads it. An
  application shows it raw, or not at all; nothing here decides which.
- **An unreadable committed row stops every replica of the document**, and
  only a new build with a step that reads it recovers it. No tool here edits
  or removes a committed row.
- Whether the server should tell a replica its current version in the
  exchange, so an old client learns it is old before receiving an operation
  it cannot read. Not needed for correctness here.
- The cost of upcasting every row on a `materialize` of a long uncompacted
  log at an old version. Not measured.
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
- **Phase 5 item 6** builds the chain, the transforming operation codec,
  `foldkit-durable`'s `compared`, the
  version scan in `journalExchange` and the `foldkit-durable` change in §5.
  Its "done when" ("a renamed durable Message replays from an old journal")
  needs, beyond that: an outbox written by the old build opening under the
  new one; an acknowledgement lost across the deploy reading as already
  committed; a client ahead of its server waiting rather than losing the
  edit; an unreadable pending operation landing in `refused` with the rest of
  the outbox sent; a stamped old operation stored at the current version;
  and a client claiming an old version refused by `admit` and `authorize`
  exactly as the current Message would be.
- **Phase 5 items 1 and 3** (server-only Messages and state) store Messages
  in the same journal, so they take the same chain; a server-only Message's
  versions are the same document-wide number, and its tag check runs after
  upcasting (§4).

## 10. Recorded in the plan

Both are now in contract-layer-PLAN (invariant 7, Phase 5 item 6).

- contract-layer-PLAN invariant 7: committed history and newer versions
  refuse to open; an unreadable pending operation is refused by its id into
  a persisted list.
- contract-layer-PLAN Phase 5 item 6 (`contract-layer-PLAN.md:359`) names
  `Sync.migrations([...])`, a list. This note changes it to a chain,
  `Sync.migrations(V1).next(V2, up)`, so each step's input is typed by the
  step before it; and applies it in the operation codec rather than at each
  decode site, so every hook sees the current Message.

## 11. Decisions made while building

Built in `packages/sync/src/migrations.ts`, `sync.ts`, `journal.ts`,
`make.ts` and `packages/durable/src/codec.ts`, `journal.ts`; tested in
`packages/sync/test/upcasting.test.ts` (mutations in
`upcasting.mutations.ts`), `migrations.test-d.ts` and Durable's
`journal.test.ts` ("the compared form").

- **`UnsupportedMessageVersionError` on the client** (§8) joins
  `ReplicaError`, with `opId`, `found` and `supported`. Received in an
  exchange it is recorded in `status.lastError` and retried on the backoff
  like any failed exchange; it does not end `start`, and the replica does not
  reload by itself. The application tells it from other failures by the
  typed error on the `ExchangeFailed` diagnostic and reloads the page. A
  retry costs one exchange every 30 s at most, and a deploy that reaches the
  client clears it. `journalExchange` fails with the same error when its scan
  finds an entry newer than the server.
- **What "a known version no step reads" covers.** Only an operation written
  below the current version whose chain fails (its version's Schema refuses
  it, `up` throws, or the result fails the current Schema). A Message written
  at the current version that does not decode is malformed, as today: the
  outbox fails to open with `InvalidOutboxError`, and the server rejects it as
  `Invalid`. So an application with no migrations behaves exactly as before.
  A step that maps an old variant onto a local-only one fails the durable
  check after upcasting, and is `Invalid` like a local-only Message sent
  today.
- **The persisted list is `status.refused`**, `WrittenOperation`s as written,
  read from the replica state's optional `refused` key (absent when empty, so
  a state with none is byte-for-byte today's), and dismissed by
  `replica.dismiss(opId)`, a revision-checked write. Not `status.rejected`:
  that is the server's in-memory list of 32, whose entries carry a server
  refusal and can be pushed out.
- **Server rejections persisting** (§7): an `Unreadable` rejection also moves
  its operation to `refused`, since its payload is the only copy and no
  build may read it yet; every other rejection stays in memory, as item 5
  left it.
- **Who decodes a `refused` entry for display** (§8): nobody here. No Schema
  of the build reads it by definition, so a page shows `operation.message`
  and `operation.messageVersion` raw, or a count. The README says so.
- **`Rejection.message`** is the Message encoded at the current version
  (`unknown`, like `Operation.message`): `Rejection` is not generic, and every
  operation a replica sends is one it read on open or wrote itself.
- **The codec's error is `UnreadableMessageError`** (`opId`, `version`), the
  note's `UnreadableMessage`, named like the package's other errors.
  `UnreadableHistoryError` carries `documentId`, `opId` and `version`, not a
  sequence: the codec knows the operation's id, and Durable's `JournalError`
  does not carry the row's sequence. A newer committed row (a rollback) is
  the same error with its version.
- **Steps are not public.** `Migrations` exposes `version`, `current` and
  `next`; the steps live in a module-private `WeakMap`, and a `Migrations`
  not made by `Sync.migrations` is refused when the contract is defined.
  Each older version's Schema checks the value strictly before its `up`; the
  current version is decoded once, by the Message's own codec.
- **An operation a server builds itself** is appended as written: an
  `Operation` with no `messageVersion` reads as version 1, so a step would
  run on it again (cents multiplied twice, committed with no error; review
  round 1, blocking). `WrittenOperation` is branded: only decoding an entry
  and `journalContract().operation.encode` make one, so `journal.append` and
  `editsJournal`'s `absorbed` refuse a decoded `Operation` by type. A server
  that typed its journal `Journal<Operation, S, P, Operation>` writes
  `WrittenOperation` there. `codec.committedFrom` and `normalizeOperation`
  take `unknown`, so a server flattening a decoded operation for them encodes
  it first, as the sync example's `toCommitted` now does.
- **What a step is given**: its version's value checked and normalized by
  that version's Schema, the form the payload is compared by, so the hashed
  form and the meaning cannot diverge under one id. A step must be pure: the
  server reads an entry for `admit` and again in the journal.
- **What an unreadable committed row stops** (the note's §5 said "the
  document"): the journal reads a stored row only when it needs it, so it
  fails exchanges from a cursor before the row, a retransmission of its id,
  and an append or load that rebuilds from a stored snapshot older than it.
  A replica past the row is served. An exchange from before the row appends
  what the replica sent before its read fails; that is kept, not reordered:
  the commits are idempotent, are acknowledged on the retry once a build
  reads the row, and checking every row first would decode the whole tail
  on each exchange. `UnreadableHistoryError`'s message, which a socket sends,
  is fixed; its id and version stay in its fields for the server's logs.
- **Durable does not learn of versions.** Making a newer entry a retryable
  failure inside Durable would need a protocol between codec and journal
  (an error class Durable recognizes) for one caller; `journalExchange`'s
  scan covers Sync's path, and the README's exchange section tells a custom
  server to scan too.
- **An `Unreadable` refusal for an id the reply did not reject** cannot
  reach `refused`: any refusal naming an unrejected id already fails the
  exchange (`ForeignRejectionError`). A test pins it.
- **Deploy order loses edits when skipped**, both ways (an older server
  rejects `messageVersion`; an older replica drops an `Unreadable` refusal),
  and a rollback of the release meets `refused` as
  `InvalidReplicaHistoryError`, on which storage must not be cleared. The
  README and the replication guide say so.
- **Durable alone.** A `compared` that throws (Sync's, for a newer version)
  is an `InvalidOperationError`, as a decode failure is; only
  `journalExchange`'s scan keeps such an entry from being rejected, so a
  custom server calling `append` directly should scan as it does.
- **The shared snapshot's Schema** stays out of scope (§7).

