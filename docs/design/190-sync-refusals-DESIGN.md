# Sync rejections as typed refusals (#190, Phase 0 item 5)

Status: designed 2026-11-11, revised after one review round the same day;
built on the branch (see contract-layer-PLAN §6.0 item 5). `Unreadable`'s
producer landed with Phase 5 item 6 (upcasting note §11). Phase 0 item 5 of
[contract-layer-PLAN.md](./contract-layer-PLAN.md), building decision 12 of
[remote-improvement-plan.md](./remote-improvement-plan.md) ("a Sync rejection
reads as a `Refusal`") with the case
[190-upcasting-DESIGN.md](./190-upcasting-DESIGN.md) §9 asks for.

## 1. The problem

A replica learns that the server refused one of its operations from the
exchange reply: `rejected` (ids) and `reasons` (`[{ opId, reason }]`, a
string of at most 500 characters, `packages/sync/src/sync.ts:364-374`). It
keeps the latest 32 as `status.rejected`, each a `Rejection`
`{ opId, reason: Option<string>, operation }` (`sync.ts:167-171`,
`:870-884`). The words are all a page gets: it cannot tell "you may not"
from "this edit breaks a rule" from "this server cannot read what you sent"
without comparing sentences. The registry does exactly that kind of
reading: it shows `Option.getOrElse(reason, () => 'Refused by the server')`
(`examples/registry/src/sync.ts:175-182`), and its page test asserts the
sentence `Not a valid operation` (`examples/registry/test/page.test.ts:894`).

Remote already answers the same question with data. A mutation's refusal is
a value of a declared codec (`Refusal.field`, `conflict`, `unmet`, `taken`,
`invalid`, `referenced`, `packages/remote/src/mutationDescriptor.ts:31-103`),
and a refusal of who is asking is `Denied.Forbidden { reason: Option<string> }`
or `Denied.Unauthenticated` (`packages/remote/src/remoteData.ts:20-31`).
Decision 12 asks for one shape of "not saved" across both paths, so a cell
shows a reason without knowing which path refused it.

## 2. Where a rejection comes from today

Every Sync server in the repository answers through `journalExchange`
(`packages/sync/src/journal.ts:111-226`; the todo-app, sync, pages, registry
and kitchen-sink examples and `serveJournal`, which `foldkit-sync/do` uses).
Its `reject(opId, reason)` (`journal.ts:146-149`) is called from five sites,
which cover six sources:

| # | Source | Today's `reason` | Case |
| --- | --- | --- | --- |
| 1 | the entry does not decode as an operation of this document: envelope, version literals, identity, a local-only or undecodable Message, another `documentId` (`journal.ts:152-158`, `sync.ts:421-436`) | "Not an operation this server accepts" | `Invalid` |
| 2 | `admit` answered `false` (`journal.ts:160-168`) | "This connection may not make changes" | `Forbidden`, no reason |
| 3 | `admit` answered `{ allowed: false, reason }`, as `foldkit-guard/sync` does with a rule's `Explain` (`packages/guard/src/sync.ts:41`) | the rule's words | `Forbidden`, its reason |
| 4 | `OperationRejectedError`: the journal's `authorize` refused (`packages/durable/src/journal.ts:1097-1112`), or the operation's replica is bound to another actor (`:1066-1073`) | the rule's words, or "Refused by the server" | `Forbidden`, its reason when it gave one |
| 5 | every `InvalidOperationError`: `validate` threw or failed, `authorize` threw (`durable/src/journal.ts:1088-1096`), `stamp` threw or changed the identity (`:1124`), the operation codec's decode or canonical encode failed (`:957`, `:981`), `opId`, `actorId` or `replicaId` threw (`:985`, `:989`, `:1060`), a stored row would not parse (`:1028`, `:1033`), or the reducer could not apply it | "Not a valid operation" | `Invalid` |
| 6 | `IdentityConflictError`: the id was used for other content (`journal.ts:187-188`) | "Its id was already used for another" | `Invalid` |

A rejection with no reason reaches the replica from a server that sends
none (any custom server, or `rejected` without `reasons`).

Two of these read as the person's fault when they are not, as they do today:
source 5 includes server faults (`actorId` throwing, a stored row that will
not parse), and source 4's replica binding is met by a shared browser whose
user switched accounts, which reads as `Forbidden`. Telling those apart
needs the journal to type its own errors, which it does not; this note
keeps today's sentences for them and does not add a case.

**Which source has no case in Remote's vocabulary.**

- Source 1 is the case §9 of the upcasting note names: an operation this
  server cannot read. Remote has none for it. Today it cannot be told apart
  from a malformed envelope or another document's operation, because
  `operationFrom` throws one error for all of them, and no operation carries
  a Message version, so there is no version to report. It reads as `Invalid`
  with its fixed sentence until Phase 5 item 6 adds the version and splits
  the Message decode out; `Unreadable { version }` is declared now (§5) so
  that split adds no case to a union applications already match.
- Source 6 fits no case well. `Refusal.taken` (`{ entity, id }`) means "the
  id an insert names is taken", and its `entity` names an Entity, which an
  operation id is not; filling it with the document id would be a forced
  fit. The cause is a replica fault (ids reused after its storage was lost),
  which a person cannot act on differently from an invalid edit, so it reads
  as `Invalid` with its fixed sentence.
- `Forbidden` is not one of Remote's `Refusal` cases: Remote keeps "who is
  asking may not" apart, as `Denied`. Sources 2 to 4 are exactly that, so
  they take `Denied.Forbidden`'s shape rather than squeezing into `invalid`.

`Conflict`, `Unmet`, `Taken`, `Referenced` and `Field` have no source in Sync:
the journal has no row versions, no `when`, no inserts by id, no relations,
and no per-field rule. They are left out (§8).

## 3. Who owns what

- **The server owns the decision.** `journalExchange` decides the case; the
  replica only reads it. Nothing in this change moves a decision.
- **Sync owns the wire.** The exchange reply is Sync's protocol, so the
  refusal codec is Sync's.
- **Remote owns the vocabulary's meaning**: what `Forbidden` and `Invalid`
  say. Sync's cases have the same tags and the same decoded types, and a
  test pins that (§5), so a page handles both with one function.
- **Not owned here:** a per-Message refusal union an application declares
  (Phase 5 item 5), and a persisted list of refused operations (upcasting
  note §5, Phase 5 item 6).

## 4. Options considered

**A. `foldkit-sync` imports Remote's `Refusal`.** Rejected. `foldkit-remote`
is an optional peer of `foldkit-sync` (`packages/sync/package.json`), read
today only by the `./remote` subpath and as a type by `./journal` and
`./do`. The replica in the core entry must decode refusals at run time, so
the core would import `foldkit-remote`'s index: an optional peer made
required for every Sync application, and Remote's module-level schemas in
every Sync bundle. And `Denied` is a Schema whose `reason` is
`Schema.Option(Schema.String)`, which encodes to an `Option`, not JSON, so it
cannot cross the wire as it is: there is no wire codec to import for three of
the six sources.

**B. Move the case schemas into a package both depend on.** Both depend on
`foldkit-surface` only. Rejected: Surface observes and owns no write
vocabulary, `Refusal.invalid` is tied to `foldkit-entity`'s invariants
(`isInvalidBy`), and it would move published exports across three packages
for two schemas, one of which Remote has only in a form that is not JSON.

**C. A new Sync vocabulary** (`NotAllowed`, `Broken`, ...). Rejected: two
words for one meaning is what decision 12 exists to remove.

**D. Chosen: Sync's own codec, in Remote's vocabulary.** `SyncRefusal` is a
`defineTaggedUnion` whose `Forbidden` has `Denied.Forbidden`'s decoded type
and whose `Invalid` has `Refusal.invalid`'s decoded type and encoded form
(the same `Option` codecs), plus `Unreadable`. No dependency edge is added.
The copy is two field lists; a test in `packages/sync` (which has
`foldkit-remote` as a dev dependency) checks that Remote's `Refusal.isInvalid`
accepts Sync's `Invalid`, that Remote's `invalid` decodes Sync's encoded
`Invalid`, and that the decoded types are mutually assignable, so a drift
fails a test rather than a page.

**E. A mapping in `foldkit-sync/remote`**, the subpath that already imports
`foldkit-remote`, from a Sync rejection to Remote's types. Not instead of D:
the replica in the core entry decodes the reply, so Sync needs its own wire
codec whatever the subpath adds, and the field lists exist either way. Not
beside it either: with the decoded types already equal, a mapping would be
the identity, and the one page that bridges Sync's status (the registry)
reads the refusal directly.

## 5. The chosen shape

`packages/sync/src/refusal.ts`, exported from `foldkit-sync`:

```ts
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

/** Words for a person, bounded where they are decoded: a refusal is not a document. */
const Words = Schema.String.check(Schema.isMaxLength(500))

/**
 * Why the server refused an operation: Remote's vocabulary for "not saved",
 * so one function shows a refusal whichever path made it.
 */
export const SyncRefusal = defineTaggedUnion({
  /** Who sent it may not make it: `authorize` or `admit` refused, with its words when it gave some. Remote's `Denied.Forbidden`. */
  Forbidden: { reason: Schema.OptionFromOptionalKey(Words) },
  /** It breaks a rule, or the server could not apply it. Remote's `Refusal.invalid`. */
  Invalid: {
    entity: Schema.OptionFromOptionalNullOr(Words),
    rule: Schema.OptionFromNullOr(Words),
    message: Words,
    path: Schema.Array(Words).check(Schema.isMaxLength(16)),
  },
  /** Written at a Message version no step of the document's history reads (upcasting, Phase 5). */
  Unreadable: { version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)) },
})
export type SyncRefusal = typeof SyncRefusal.Type
```

`Rejection` gains the refusal and keeps `reason` for one release:

```ts
export interface Rejection {
  readonly opId: OpId
  /**
   * Why, typed. None when the server named no refusal (an older server, or a
   * custom one), or named one this build cannot read (reported as
   * `UnknownRefusal`).
   */
  readonly refusal: Option.Option<SyncRefusal>
  /** @deprecated Read `refusal`. The server's words, from its `reasons`; removed in the next release. */
  readonly reason: Option.Option<string>
  readonly operation: Operation
}
```

The reply gains `refusals`, and `reasons` is deprecated:

```ts
export interface Exchange<Shared> {
  // ...as today
  /** @deprecated Send `refusals`. Removed in the next release. */
  readonly reasons?: ReadonlyArray<{ readonly opId: OpId; readonly reason: string }> | undefined
  /** Why some of `rejected` were refused: each an encoded `SyncRefusal`, one per operation. */
  readonly refusals?:
    | ReadonlyArray<{ readonly opId: OpId; readonly refusal: typeof SyncRefusal.Encoded }>
    | undefined
}
```

A page reads it through the union's `match`:

```ts
const shown = (rejection: Rejection): string =>
  Option.match(rejection.refusal, {
    onNone: () => 'Refused by the server',
    onSome: SyncRefusal.match({
      Forbidden: ({ reason }) => Option.getOrElse(reason, () => 'You may not change this'),
      Invalid: ({ message }) => message,
      Unreadable: () => 'Made by another version of the app, so not saved',
    }),
  })
```

The type says `Encoded` for a custom server's sake; the replica still decodes
each one as untrusted (§6). `Invalid`'s `entity`, `rule` and `path` are
always empty from `journalExchange`, which knows no Entity: they are there
because Remote's `invalid` has them, so a server that does know one (Phase 5's
row rules) can say so in the same shape.

`journalExchange` builds each case with the union's constructors and sends
both fields, `reasons` with today's sentences. A rule's reason has no bound
of its own (`AuthorizeDecision`, `foldkit-guard/sync`'s `Explain`), so it is
cut to 500 UTF-16 units, with an ellipsis and never inside a surrogate pair,
before either field is built. Today an unfit reason fails every exchange that
carries it at the replica; cut, it reaches the person.

| Source | `refusal` |
| --- | --- |
| 1 | `Invalid({ entity: none, rule: none, message: 'Not an operation this server accepts', path: [] })` |
| 2 | `Forbidden({ reason: none })` |
| 3, 4 | `Forbidden({ reason: Option.fromUndefinedOr(reason) })` |
| 5 | `Invalid({ ..., message: 'Not a valid operation' })` |
| 6 | `Invalid({ ..., message: 'Its id was already used for another' })` |

The `Invalid` messages are today's fixed sentences, never an error's message,
which may carry internals. A `validate` refusal therefore still reads "Not a
valid operation", as `docs/replication.md`'s "Choosing document boundaries"
says; a rule a person should read about still belongs in `authorize`.

## 6. Failure semantics

The reply is untrusted, so the replica checks it before acting:

- **A refusal for an operation the reply did not reject** fails the exchange
  with `ForeignRejectionError`, as a reason does today (`sync.ts:809-814`).
- **Two refusals for one operation** fail it with `ForeignRejectionError`
  too. With every entry naming a rejected id, there are then no more entries
  to decode than operations rejected, which were all sent.
- **The `refusals` entries** are decoded strictly (`{ opId, refusal }`, no
  other key). Each `refusal` is then decoded on its own against `SyncRefusal`
  with `onExcessProperty: 'error'`, every string at most 500 characters and
  `path` at most 16 of them. One that does not decode (a newer server's case,
  a Phase 5 application refusal, or garbage) does not fail the exchange: the
  server has already rejected the operation, and failing would resend it
  forever. The rejection stands, its `refusal` is none, and the replica
  reports `UnknownRefusal` (`documentId`, `replicaId`, `opId`, and why it did
  not decode, cut to 500 characters, never the value, which is the server's
  and of any size) through `Diagnostics.report`.
- **A rejection with no refusal** reads `refusal: none`, as it reads
  `reason: none` today.

## 7. Wire compatibility and migration

**No version moves.** `protocolVersion` and `schemaVersion` sit on the
operation envelope and the stored replica state (`sync.ts:41-55`,
`ReplicaStateSchema`, read by `unsupportedVersion`), and neither changes:
operations are as before, and `status.rejected` is held in memory only
(`rejectedOps`, a `Ref`), never in the stored state. Moving either would make
every pending operation of the other side "Not an operation this server
accepts" and every stored replica refuse to open, far worse than what follows.

- **A new replica against an old server** (or a custom server): the reply
  has `reasons` and no `refusals`. Each rejection reads `refusal: none` and
  `reason` as today. Nothing fails.
- **An old replica against a new server.** The old replica decodes the reply
  strictly (`decodeExchange`, `onExcessProperty: 'error'`), so a reply holding
  `refusals` is an `InvalidExchangeError` there. `journalExchange` sends
  `refusals` only when it refused something, so an old tab exchanges as
  before until the server refuses one of its own operations. From then, every
  exchange of that tab fails (the refused operation is still in its outbox and
  is refused again), and the tab shows `lastError` and adopts no commit until
  it runs the new build. Each commit notice on its socket wakes it to
  exchange again at once, ahead of its backoff (`sync.ts`'s start loop races
  the two), so the server runs the append and the refusal again for every
  commit anyone makes to the document. A tab reloads into the new build; an installed or
  service-worker-cached client may keep the old one past a reload. Nothing
  is lost: the operations the server took are committed and are
  acknowledged again on the retry, and the new build sends the refused one
  and reads its refusal.

  Shipping the reader a release before the writer would avoid this, and is
  rejected: it delays decision 12 a release, and the release that writes
  would then meet the same stale clients of the release before it. Sync is
  0.x, where a minor release may break, and the changelog says so under
  Changed. What this release does instead is make the replica tolerant of
  every later refusal case (§6), so Phase 5's application refusals do not
  break it the same way.
- **Deprecation, one release.** `Rejection.reason` and `Exchange.reasons`
  stay, marked `@deprecated`; `journalExchange` keeps sending `reasons` with
  today's sentences, so code reading `reason` reads what it did. The release
  after removes `Rejection.reason` and stops `journalExchange` writing
  `reasons`, but the replica's reply schema keeps accepting `reasons` and
  ignores it: today's server sends it on every reply, empty or not, so a
  replica that refused the key would fail every exchange against a server a
  release behind (a rollback, or a client deployed before its server). A
  key once sent on the reply is accepted for good. The changelog says to
  read `refusal` through `SyncRefusal.match` instead of `reason`, and that a
  custom server sends `refusals` (each `Schema.encodeSync(SyncRefusal)` of a
  case) instead of `reasons`.
- `AuthorizeDecision` (`{ allowed: false, reason }`) does not change: its
  reason becomes `Forbidden`'s.

## 8. What it leaves out

- **`Unreadable`'s producer.** Declared, decoded and matched now; nothing
  sends it until Phase 5 item 6 gives operations a Message version and splits
  "the Message does not decode" out of source 1. Doing it now would need a
  version that does not exist, or a finer `operationFrom` with no other user.
- **Application refusals** (`Field`, `Conflict` and the rest, declared per
  durable Message, returned by `validate`): Phase 5 item 5. They will reach a
  replica of this release as an `UnknownRefusal` with no refusal, not as a
  failed exchange (§6).
- **A persisted `refused` list.** Server rejections stay in memory, the
  latest 32, as today; the upcasting note's persisted list lands with Phase 5
  item 6.
- **The registry's hand-bridged `EditsRefused`** stays hand-bridged:
  remote-improvement-plan §8's "Not built, and why" paragraph (a Sync
  rejection names an operation, a Remote refusal a request, and no page
  here refuses the same cell both ways) still holds. Decision 12 is met by
  the shape: the registry reads a `SyncRefusal` whose cases a Remote page
  handles with the same function. It now reads the refusal.
