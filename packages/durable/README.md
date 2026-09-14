# `foldkit-durable`

An append-only operation log on SQLite, with a snapshot and a cursor per
document. Clients hand you operations; the journal decides their order, folds
each one into the document's snapshot with the `reduce` you supply, and
remembers every operation's identity so a retransmission is answered with the
original outcome instead of applied a second time.

That is what a server owes a local-first or multi-device application: one
authoritative order every client can replay, retries that are safe to send, and
a durable record of the external effects (a charge, an email) an operation
caused, so a crash between "the provider accepted it" and "we wrote that down"
is something you can reconcile rather than guess at. The journal understands
storage and ordering only — every application rule lives in the `reduce`,
`validate`, and `authorize` callbacks you pass it.

**Use it when** a server must sequence operations from several clients or
devices, replay or compact them, and not repeat an effect on retry. **Not for**
peer-to-peer or multi-master writes: ordering is the server's, and one journal
handle owns one SQLite file. It is also not a job scheduler — `recover` is a
loop you call, not a worker it runs for you.

It is the **server half** of [replicated Foldkit state](https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md);
[`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync)
is the client half. The [guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md)
covers the mental model and when not to use either.

```ts
import { Effect, Schema } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'

const Operation = Schema.Struct({ opId: Schema.String, title: Schema.String })
const Snapshot = Schema.Struct({ todos: Schema.Array(Schema.String) })
type Operation = typeof Operation.Type
type Snapshot = typeof Snapshot.Type
type Principal = { readonly actorId: string }

const program = Effect.gen(function* () {
  // The schemas decide the types: `append` takes `Operation`'s encoded side.
  const journal = yield* Journal.make({
    file: 'journal.sqlite',
    operation: Operation,
    snapshot: Snapshot,
    empty: () => ({ todos: [] }),
    reduce: (snapshot, operation) => ({ todos: [...snapshot.todos, operation.title] }),
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  const todos = DocumentId.make('todos')
  yield* journal.append(todos, { opId: 'tab-1:1', title: 'Milk' }, { actorId: 'alice' })
  const { snapshot } = yield* journal.load(todos)
  const since = yield* journal.read(todos, Cursor.make(0))
  return { snapshot, since }
}).pipe(Effect.scoped)

await Effect.runPromise(program)
```

`Journal.make` is scoped: the SQLite connection is released when the scope
closes. `file` accepts a literal or a `Config.Config<string>`, so the path can
come from the environment.

`operation` and `snapshot` take an Effect `Schema.Codec`, as above, or a pair of
throwing `encode`/`decode` functions for an application that does not use
`Schema`. A schema decides the encoded side: `append` takes
`Operation`'s `Encoded` type, so a transforming schema is checked at the call
site rather than accepting `unknown`. `Codec.fromSchema(schema)` is the same
conversion spelled out, for handing the function pair somewhere else. Decode
failures are `InvalidOperationError`s either way.

The identities are branded `Schema` types, so `DocumentId.make('todos')`,
`OpId.make(...)`, `ActorId.make(...)`, `Sequence.make(n)`, and `Cursor.make(n)`
build them and reject a value the brand refuses (an empty string, for one).
Failures are `Schema.TaggedError`s (`JournalError`,
`UnsupportedJournalVersionError`, `InvalidOperationError`,
`OperationRejectedError`, `IdentityConflictError`, `InvalidCursorError`,
`CompactedCursorError`, `InvalidCompactionError`, `EffectFailedError`), so
`Effect.catchTag` narrows them.

`append` answers with `{ _tag: 'Committed' }` carrying the operation, its
`opId`, `sequence`, and `actorId`, or with `{ _tag: 'AlreadyCommitted' }` when
the `opId` is known but compaction has already dropped its payload. `read` and `load`
speak in branded `Sequence` and `Cursor` values, so one cannot be passed where
the other is expected. `appendAll` commits an ordered batch in one transaction;
`compact` and `floor` bound what payloads are retained; and `keys`, `reset`,
`unfinished`, `effect`, `clearEffect`, and `recover` support maintenance and
recovery.

## Install

```bash
pnpm add foldkit-durable
```

`effect` is a peer dependency, `@effect/sql-sqlite-node` comes with it, and
Node 22 is required for `node:sqlite`. `foldkit-sync` is the client half.

## The journal as a service

`Journal.define` names a journal once — its service key and its type parameters
together — and hands back the tag to read it with and the layer that satisfies
that tag:

```ts
import { Effect } from 'effect'
import { DocumentId, Journal, type JournalOptions } from 'foldkit-durable'

const TodoJournal = Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')

// The same object `Journal.make` takes.
declare const options: JournalOptions<Operation, Snapshot, Principal>

const program = Effect.gen(function* () {
  const journal = yield* TodoJournal.tag
  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.provide(TodoJournal.layer(options)))
```

Two journals are two definitions with two keys; each tag can only be satisfied
by its own layer, and neither can be read back as a journal of the other shape.
`Journal.layer(options)` still provides one under the default key for an
application that does not need a definition.

## Validation and policy

`validate` runs first, for structural checks against the snapshot; `authorize`
decides policy. Both run inside the append transaction, so neither can require a
service.

```ts
import { Effect } from 'effect'
import { InvalidOperationError, type JournalOptions } from 'foldkit-durable'

const hooks: Pick<JournalOptions<Operation, Snapshot, Principal>, 'validate' | 'authorize'> = {
  // Throw, or return an Effect that fails with InvalidOperationError.
  validate: ({ operation }) =>
    operation.title.length === 0
      ? Effect.fail(new InvalidOperationError({ message: 'title is empty' }))
      : Effect.void,
  // `true`/`false`, a refusal carrying its reason, or an Effect of either.
  authorize: ({ principal, operation }) =>
    principal.actorId === operation.opId.split(':')[0] || {
      allowed: false,
      reason: 'an operation must be committed by the tab that created it',
    },
}
```

A refusal fails with `OperationRejectedError`. The reason, when the rule gave
one, is on `.reason` and repeated in `.message`, so a server that forwards the
message to the client that sent the operation shows the person whose edit
reverted why. A plain `false` refuses with no reason, as before.

## What it owns

- **Atomic, idempotent append.** A repeated `opId` is answered from the log; a
  reuse with a different payload or actor is an `IdentityConflictError`. Encoded
  payloads are canonicalized (object keys sorted) before they are stored and
  hashed, so a retransmission with a different key order is the same operation.
  Once compaction removes the payload, the append returns `AlreadyCommitted` (the
  identity, not the content) rather than fabricating a committed operation.
  `appendAll` commits an ordered batch in one transaction.
- **A snapshot and cursor per key**, written together in one transaction, read as
  branded `Cursor`/`Sequence` values.
- **Compaction.** Payloads below a floor are dropped without changing the state
  a replay of the compacted prefix would produce; identity rows remain, and
  `floor` reports the highest sequence whose payload is gone.
- **A change stream.** `journal.subscribe` is a `Stream.Stream<string>` of the
  keys a commit changed. It is a sliding channel: a subscriber never fails or
  slows a commit, and a slow one drops the oldest wake-ups rather than growing
  memory.
- **A durable effect ledger.** `runEffect(key, run)` reuses recorded successes
  and shares concurrent calls within one journal instance. `unfinished` lists the
  pending and failed records, `effect` reads one, `clearEffect` removes one, and
  `recover` drives the scan-and-settle loop over a document.
- **Maintenance.** `keys` lists the documents, and `reset` drops a document's
  snapshot and operations. Effect records are keyed globally, not per document,
  so `reset` leaves them; `clearEffect` removes one.
- **Migrations.** The tables are created or upgraded by a transactional
  `user_version` migration, so an existing database is upgraded in place and an
  interrupted run is safe to repeat.
- **Metrics.** `Journal.metrics` counts appends, compactions, owner effect runs,
  and coalesced effect runs.
- **Branded identities.** `DocumentId`, `OpId`, `ActorId`, `Sequence`, and
  `Cursor` are `Schema.brand`s, built with `.make`, so they cannot be swapped.

## Guarantees

- Append is atomic.
- A repeated `opId` is idempotent, including after compaction, where the payload
  is gone and the result is `AlreadyCommitted`; reuse with a different payload or
  actor is an identity conflict, proven by a retained payload hash. Encoded
  payloads are canonical, so the same data in a different key order is the same
  operation, not a conflict.
- Committed order is stable and gap-free.
- The snapshot and cursor are written together.
- Compaction drops committed payloads but never changes the state a replay of
  the compacted prefix would produce.
- A subscriber's failure never fails a commit.
- A successful effect record is reused across restarts without invoking `run`.
  Concurrent calls with the same key share a run within one journal instance.
  These guarantees do not establish exactly-once execution at an external provider.

## Effect recovery

The external action and the journal's success record are separate commits.
If the process exits between them, the action may have happened even though
the ledger still says `pending`. A `failed` record can also be uncertain: a
provider may have accepted a request before the response or local save failed.
Calling `runEffect` again retries both `pending` and `failed` records. It does
not decide whether retrying is safe, and it does not restart work automatically.
Pass `{ retryFailed: false }` to fail fast with an `EffectFailedError` (carrying
the recorded message) instead of retrying a `failed` record, or a predicate
`(record: EffectRecord) => boolean` to decide from the record itself — retry a
recorded timeout, refuse a recorded decline. `unfinished()` lists those records
so a recovery worker can decide per intent.

| Durable record | What recovery can conclude | Application policy |
| --- | --- | --- |
| None | No run was recorded for this key. A committed operation may still require work. | Discover the intent from retained application data, then start it. |
| `pending` or `failed` | The external outcome may be unknown. | Retry only with provider idempotency or proof that repeating is safe; otherwise reconcile with the provider or require manual resolution. |
| `succeeded` | The result was recorded. | Call `runEffect` to reuse it without contacting the provider. |

Choose the identity before executing the action. The effect ledger's keys are
global to the database, so include the document as well as the operation and
a stable semantic name. The orders journal and `provider` below stand in for
the application's own:

```ts
import { Effect } from 'effect'
import type { Journal } from 'foldkit-durable'

type Order = { readonly opId: string; readonly id: string }
type OrderSnapshot = { readonly confirmed: ReadonlyArray<string> }
type Orders = Journal<Order, OrderSnapshot, Principal>
declare const provider: {
  sendConfirmation: (input: { orderId: string; idempotencyKey?: string }) => Promise<void>
}

const confirmationKey = (order: Order) =>
  JSON.stringify(['orders', order.opId, 'send-confirmation:v1'])

const sendConfirmation = (journal: Orders, order: Order) => {
  const key = confirmationKey(order)
  return journal.runEffect(
    key,
    Effect.tryPromise(() => provider.sendConfirmation({ orderId: order.id, idempotencyKey: key })),
  )
}
```

The provider must durably associate that key with the action and its result.
Keep the key and request payload stable across retries, and account for the
provider's idempotency retention period. An expired provider key is an uncertain
outcome, not permission to repeat a non-idempotent action. Without provider
support or a way to query the outcome, an email sent just before a crash can
be sent twice; the journal cannot rule that out.

Do not derive identities from Command array positions: reordering Commands
would assign an old result to a different action. Preserve semantic names for
existing intents across application upgrades. A new name denotes new work;
it must not be used merely to retry an old intent. Multiple effects of the
same kind need an additional stable identity, such as the recipient id.

### Discovering unfinished work

`journal.effect(key)` is a lookup, not an intent queue. Recording `pending`
happens when `runEffect` starts, separately from `append`. Recovery must also
find operations committed before settlement started:

1. For each application-owned document, read operations after an application
   recovery cursor and derive their stable effect intents.
2. Inspect each intent's record and apply the policy above. Advance the recovery
   cursor only once the operation's intents are resolved. If the cursor is lost,
   rescanning is safe for recorded successes and provider-idempotent actions.
3. Keep unresolved operation payloads available: do not compact past the recovery
   cursor. Alternatively, retain intents and their identities in application
   snapshot state through the same reducer/append transaction, and discover them
   from `load` after compaction. Re-derive old intents with their original semantics.

`journal.recover` runs that loop. It reads the committed operations after
`from`, derives each one's effect intents, reuses recorded successes, and stops
before any operation whose intent failed or was skipped. It returns the cursor
up to which every intent settled, so the caller persists it and resumes:

```ts
import { Effect, Option } from 'effect'
import { DocumentId, type Cursor } from 'foldkit-durable'

const settle = (journal: Orders, from: Cursor) =>
  journal.recover({
    key: DocumentId.make('orders'),
    from,
    intents: order => [
      {
        key: confirmationKey(order),
        run: Effect.tryPromise(() =>
          provider.sendConfirmation({
            orderId: order.id,
            idempotencyKey: confirmationKey(order),
          }),
        ),
      },
    ],
    // The default is `retry`. `skip` stops the loop and leaves the returned
    // cursor at the previous operation, for manual resolution.
    onUnresolved: (_intent, record) =>
      Option.isSome(record) && record.value.status === 'failed' ? 'skip' : 'retry',
  })
```

Scheduling and discovery stay with the application: it owns document
enumeration, the recovery cursor or snapshot intents, and running this on
startup. `journal.unfinished()` lists every pending and failed record,
`journal.keys()` enumerates the documents, and `journal.clearEffect(key)` drops
a record once it is resolved. A subscription is only a wake-up signal; it cannot
recover missed commits by itself. There is no atomic append-and-enqueue API
today.

### Execution ownership

The in-flight registry belongs to one `Journal.make` instance. Two journal
handles or processes can both execute the same key; writing `pending` is not
an exclusive claim. Route execution to one owner for the database. Multi-owner
execution requires a persistent claim/lease protocol with fencing and a recovery
policy, which this package does not supply. Such ownership still cannot close
the gap between external success and recording it locally.

Process-crash tests in
[`test/effectRecovery.test.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/durable/test/effectRecovery.test.ts)
exercise exits after append, before provider work, after provider success, and
after recording success but before acknowledgement. They use a separate SQLite
provider emulator with durable idempotency receipts and also demonstrate the
duplicate without them. These tests cover process termination, not machine
power loss.

## Retention

Compaction drops payloads, not identities. Two tables grow for the life of the
database:

- **Operation identities.** One row per distinct `opId`, kept after its payload
  is compacted, so a retransmission is acknowledged instead of reapplied.
- **Effect records.** One row per settled effect key, kept so a replay reuses the
  result without invoking `run`.

Neither is garbage-collected, so storage grows with the number of distinct
operations and effects rather than with the payload size you compact away.

Old retries are therefore safe: a replica that reconnects below the compaction
floor still has its operation acknowledged from the identity row, and its effect
is not repeated. That holds for as long as the row exists.

The package does not supply a garbage collector. To bound storage an application
rotates or recreates the database. After that, a retry whose identity row is gone
is indistinguishable from new work, so the application must refuse it rather than
reapply it — for example, reject an operation whose `baseCursor` is below the
floor the application retains, or keep a per-document watermark and refuse
anything older. State the retained window and the refusal explicitly; do not let
a rotated journal silently turn an old retry into a new commit.

## Limits

- SQLite through `@effect/sql-sqlite-node` is the only adapter today, and it
  needs Node 22 (`node:sqlite`). The storage contract is `SqlClient`, so a
  Postgres adapter is a driver swap.
- The SQL module is under `unstable` in the pinned Effect release candidate.
- `reduce` runs inside the append transaction, holding the SQLite write lock; it
  must be pure and fast. `validate` and `authorize` may each return an `Effect`,
  but they run there too, so neither has a service requirement and both must
  stay local to the snapshot. An encoded operation must be JSON-compatible.
- Schema 3 recomputes retained operations' `payload_hash` from canonical JSON, so
  a payload compacted after the upgrade compares canonically. A payload already
  compacted before it keeps its pre-canonical hash — its content is gone and
  cannot be re-hashed — so only that legacy row can reject a reordered retry.
- The `[key, op_id]` and `[key, sequence]` uniqueness is enforced by the table
  schema; a server-authoritative deployment is still a single writer per database
  file. Use one `Journal` handle per file.

## The older spellings still work

Every name this package has ever exported still does the same thing.
`Journal.make`, `Journal.layer`, and `Journal.metrics` are `makeJournal`,
`makeJournalLayer`, and `journalMetrics`; `DocumentId.make` and its siblings are
`documentId`, `opId`, `actorId`, `sequence`, and `cursor`. `JournalService<...>(key)`
still reads a journal back from a key, though `Journal.define` is the safer
form: `JournalService`'s type arguments are supplied at each use site and
nothing checks them against the layer that satisfied the tag, so reading the
same key back as a journal of another shape compiles. A codec given as a pair of
`encode`/`decode` functions is still accepted wherever a `Schema.Codec` now is.

## See also

- [Replicated state](https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md) — the mental model for
  both halves, and when not to use them.
- [`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync) — the client half, whose `journalContract()` supplies this
  journal's codecs, reducer, and authorization rules.
- [`examples/sync`](https://github.com/doeixd/foldkit-plus/tree/main/examples/sync) — a SQLite journal, two replicas converging, and the effect
  ledger.
