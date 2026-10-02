# `foldkit-durable`

The authoritative server journal for local-first Foldkit state.

Clients edit optimistically and retry when the network is unreliable. The server
still needs one place that says **which operations committed, in what order,
and what state that order produces**. A Journal is that place: for each document
it keeps an ordered operation log, the current snapshot, and a cursor into the
log, on SQLite.

> **`append` is the commit boundary.** It decodes, validates, authorizes,
> reduces, assigns the next sequence, and persists the operation with the new
> snapshot in one transaction. Send the same operation twice and it is answered,
> not applied again.

It is the server half of [replicated Foldkit state](../../docs/replication.md).
[`foldkit-sync`](../sync) is the client half, and hands the journal its codecs
and reducer so the server never restates the application.

## Is this the right package?

Use it when several clients or devices write one server-owned document and
need an authoritative order, idempotent retries, a snapshot for newcomers, and
compaction that cannot change what the history means.

Do not use it as a database for arbitrary queries (it is an operation journal),
for multi-master ordering (one journal decides), or as a job scheduler (the
recovery loop is one your application chooses when to run). It also does not
promise exactly-once execution at an external provider; see
[external effects](#external-effects-and-the-crash-gap).

## The model

```text
sequence:   1      2      3      4
log:       op A   op B   op C   op D
                          ^
                          cursor 3

snapshot at cursor 3 = reduce(reduce(reduce(empty, A), B), C)
```

| Name | Meaning |
| --- | --- |
| **Document** | One independently ordered stream of operations, a `DocumentId`. |
| **Operation** | One durable change a client submitted. The application defines its shape. |
| **`opId`** | The operation's stable identity. A retry reuses it. |
| **Sequence** | The gap-free position the journal assigns when an operation commits. |
| **Cursor** | A position a reader has reached; "what came after N?" |
| **Snapshot** | The reduced state of the committed prefix its cursor names. |
| **Epoch** | The identity of a document's history; new after a reset. |

The log and the snapshot answer different questions. A far-behind or brand-new
replica starts from the snapshot; an up-to-date one asks for the log after its
cursor.

## Install

```bash
pnpm add foldkit-durable
```

`effect` is a peer dependency, `@effect/sql-sqlite-node` comes with the
package, and Node 22 is required for `node:sqlite`.

## Sixty seconds, with `foldkit-sync`

If the journal backs a Sync contract, do not restate the shared schema or the
reducer. The contract already knows the slice, the durable Messages, the
initial value, and how they replay through `update`:

```ts
import { Effect } from 'effect'
import { ActorId, DocumentId, Journal, OpId } from 'foldkit-durable'
import { TodoSync } from './sync.js'

type Principal = { readonly actorId: string }

const program = Effect.gen(function* () {
  const journal = yield* Journal.make({
    // From the Sync contract: operation and snapshot codecs, the empty
    // snapshot, the reducer, each operation's replica, and any `authorize`.
    ...TodoSync.journalContract(),

    file: 'todos.sqlite',

    // Sync and Durable brand their ids separately; re-brand at the boundary.
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.scoped)
```

`Journal.make` is scoped: the SQLite connection closes with the scope, so keep
it open for the server's lifetime. `file` is a path, `:memory:` for tests, or a
`Config<string>`.

What the two packages each own:

```text
Foldkit application        Model · Message · update
        |
   foldkit-sync            what is shared, what is durable, how it replays
        |  journalContract()
   foldkit-durable         what committed, in what order, what state follows
        |
      SQLite
```

The journal does not speak Sync's exchange. Your server's handler does, with
`append` for each pending operation, `read` for what follows the cursor, and
`load` for a checkpoint. [The guide](../../docs/replication.md#3-the-server-an-exchange-over-the-journal)
shows that handler whole; the rest of this README explains each call.

## Using Durable directly

Without Sync, a Journal needs an operation codec, a snapshot codec, an empty
snapshot, and a pure reducer:

```ts
import { Effect, Schema } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'

const Operation = Schema.Struct({ opId: Schema.String, title: Schema.String })
const Snapshot = Schema.Struct({ todos: Schema.Array(Schema.String) })
type Principal = { readonly actorId: string }

const program = Effect.gen(function* () {
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
  const { snapshot, cursor } = yield* journal.load(todos)
  const since = yield* journal.read(todos, Cursor.make(0))
  return { snapshot, cursor, since }
}).pipe(Effect.scoped)
```

The operation schema decides what `append` accepts: its *encoded* side, so a
transforming schema is checked at the call site rather than degrading the
boundary to `unknown`. A payload that does not decode is an `InvalidOperationError`.

## What `append` guarantees

For a new operation, inside one SQLite transaction:

```text
decode → validate → authorize → reduce → assign sequence → persist op + snapshot + cursor → Committed
```

For a retransmission, the stable `opId` is what matters:

```text
same opId, same payload and actor        answered from history, never applied twice
same opId, different payload or actor    IdentityConflictError
```

Payloads are canonicalized before hashing, so reordered JSON keys are the same
operation. The guarantee lasts as long as the identity row does; see
[retention](#retention).

Read the results as three separate facts:

| You observe | It proves | It does not prove |
| --- | --- | --- |
| `append` returned `Committed` | the journal accepted and persisted it | any client has seen it |
| `load` returned a snapshot and cursor | the snapshot is that committed prefix | pending client edits are in it |
| an effect result is recorded | the journal can reuse that outcome | the provider did not act before a crash |

`append` returns `AlreadyCommitted` instead of `Committed` when the operation
was committed before and compaction has since removed its payload: the journal
can prove the id committed without pretending to still have its content.
`appendAll` commits several in order in one transaction.

Snapshot writes are the expensive part of an append on a large document.
`snapshotEvery: n` writes one every `n` commits; `load` replays the few since.
The journal keeps each document's current state in memory (the most recent
256), checked against the stored cursor, so a commit or reset through another
connection is noticed. `load` hands out that remembered value, so treat it as
read-only, as `reduce` must.

## Validation and authorization

Both run inside the append transaction, while the write lock is held, so they
stay local to the snapshot, cannot require services, and should be fast.

```ts
import { Effect } from 'effect'
import { InvalidOperationError, type JournalOptions } from 'foldkit-durable'

const hooks: Pick<JournalOptions<Operation, Snapshot, Principal>, 'validate' | 'authorize'> = {
  // Structural checks: throw, or fail with InvalidOperationError.
  validate: ({ operation }) =>
    operation.title.length === 0
      ? Effect.fail(new InvalidOperationError({ message: 'title is empty' }))
      : Effect.void,
  // Policy: true, false, a refusal with its reason, or an Effect of either.
  authorize: ({ principal, operation }) =>
    principal.actorId === operation.opId.split(':')[0] || {
      allowed: false,
      reason: 'an operation must be committed by the tab that created it',
    },
}
```

A refusal is an `OperationRejectedError`; its `reason` is also repeated in
`message`, so a server can tell the client why an optimistic edit was undone.
With Sync, the rules declared per Message on the contract arrive here through
`journalContract()`.

The `principal` is whatever your transport established for the connection. It is
never decoded from the operation, which is why a client cannot claim to be
someone else.

**Replica binding.** When operations carry the replica that made them
(`replicaId: operation => …`, which `journalContract()` supplies), the first
commit from a replica binds it to that actor for the document, and any other
actor's operation from it is refused before `validate` runs. The first actor to
use an id claims it, even across `reset`, so replica ids should be unguessable
or assigned per actor. Opening an existing journal with `replicaId` recovers the
bindings from retained operations; if some were compacted before schema 6,
supply `legacyReplicaId` to read the replica from their ids, or opening is
refused.

## Reading history

```ts
const { snapshot, cursor } = yield* journal.load(key) // the state, and where it is
const later = yield* journal.read(key, cursor, { limit: 500 }) // what came after
```

`read` returns at most `limit` operations, so a server answers a far-behind
replica in pages; Sync's exchange carries `more` for this. `cursor(key)` reads
the last sequence without decoding a snapshot, for checking a client's cursor
before anything is appended.

`Sequence` and `Cursor` are different brands on purpose: a committed
operation's position cannot be passed where a read position is expected.

**Compaction and checkpoints.** `compact(key, through)` drops committed
payloads up to `through`; `floor(key)` is the highest dropped sequence. A `read`
from below the floor fails with `CompactedCursorError`, which tells the server to
send a checkpoint, `load`'s snapshot and cursor, instead of a misleading
partial tail. Identity rows stay, so an old retry is still recognized.

**Reset and epoch.** A cursor only means something within one history.
`epoch(key)` names it: the same while the operations are kept, new after
`reset(key)` or on a new database file. Hand it to clients with every answer; a
client that comes back with another epoch holds a cursor into history this
journal does not have, and has to be answered from `0`. `reset` drops a
document's snapshot and operations but keeps replica bindings and effect
records.

**Change notification.** `journal.subscribe` is a `Stream` of document keys a
commit changed. It is a wake-up, not a history transport: it slides, a slow
subscriber may miss wake-ups, and a subscriber never slows or fails a commit.
Catch up with `read`.

## External effects and the crash gap

A committed operation may imply work outside SQLite: send an email, charge a
card. No local database can commit atomically with an external provider, and
the dangerous window is:

```text
provider succeeds
      |
   CRASH
      |
record the success
```

After a restart the application cannot know whether the provider acted. The
journal does not claim exactly-once. Its **effect ledger** records a stable
intent identity and its outcome, so recovery can tell known success from
uncertain work and apply an explicit policy.

`runEffect(key, run)` reuses a recorded success without calling `run` again,
shares concurrent calls for one key within one Journal instance, and by default
retries `pending` and `failed` records. Pass `{ retryFailed: false }` to fail a
recorded failure with `EffectFailedError` instead, or a predicate over the
record.

| Record | Recovery can conclude | Policy |
| --- | --- | --- |
| none | no run was recorded; a committed operation may still need work | derive the intent from the operation and start it |
| `pending` or `failed` | the provider's outcome is unknown | retry only with provider idempotency or proof repeating is safe; else reconcile or resolve by hand |
| `succeeded` | the result is known | `runEffect` reuses it without contacting the provider |

**Choose the key before acting**, from the document, the operation, and the
semantic action, and hand the same key to the provider as its idempotency key:

```ts
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

Effect keys are global to the database. Never derive one from a Command's
array position: reordering would hand an old result to a different action. A
new semantic name denotes new work, not a retry. Without provider idempotency,
an email sent just before a crash can be sent twice; the journal cannot prove
otherwise.

**Recovery.** A `pending` record is created when `runEffect` starts, not when
the operation commits, so recovery must also find committed operations whose
effects never started. `journal.recover` walks a document's committed
operations after an application-owned cursor, runs or reuses each intent, stops
before the first one that failed or was skipped, and returns the cursor through
which everything settled:

```ts
const settle = (journal: Orders, from: Cursor) =>
  journal.recover({
    key: DocumentId.make('orders'),
    from,
    intents: order => [
      {
        key: confirmationKey(order),
        run: Effect.tryPromise(() =>
          provider.sendConfirmation({ orderId: order.id, idempotencyKey: confirmationKey(order) }),
        ),
      },
    ],
    // Default: retry. `skip` stops before this operation for manual resolution.
    onUnresolved: (_intent, record) =>
      Option.isSome(record) && record.value.status === 'failed' ? 'skip' : 'retry',
  })
```

The application owns when that runs, which documents it covers (`keys()`), and
where the cursor is persisted. Do not compact past it, or keep the intent
identity in the snapshot. `unfinished()` lists pending and failed records;
`effect(key)` reads one; `clearEffect(key)` removes one after resolution.

**One executor per database.** The in-flight registry lives in one `Journal.make`
instance; a `pending` row is not a lease. Two handles or two processes can run
the same key. Route execution to one owner. Process-crash tests in
[`test/effectRecovery.test.ts`](./test/effectRecovery.test.ts) show both the
idempotent recovery and the duplicate that remains possible without it.

## Retention

Two kinds of row grow for the life of the database and are never collected:
one identity row per distinct `opId`, kept after compaction so an old retry is
recognized, and one record per effect key. Growth follows the number of distinct
operations and effects, not only retained payload size.

Compaction empties payloads but SQLite keeps their pages. `vacuum()` rebuilds
the file and checkpoints its write-ahead log; it holds the database while it
runs, so schedule it as maintenance. A reader on another connection can block
the log truncation, in which case `vacuum` fails with `JournalError` and a later
run finishes the job.

If you rotate or recreate the database, an operation whose identity row is gone
is indistinguishable from new work. Reject work older than the retained window
instead of applying it as new: keep a per-document watermark, or refuse an
operation whose base cursor predates the floor.

## Services, codecs, errors, metrics

**As a service.** `Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')`
fixes the key and the type parameters together and returns `tag` and `layer`:

```ts
const TodoJournal = Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')

const served = Effect.gen(function* () {
  const journal = yield* TodoJournal.tag
  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.provide(TodoJournal.layer(options)))
```

Two definitions are two services; each tag is satisfied only by its own layer.
`Journal.layer(options)` is the default-key form.

**Codecs.** `operation` and `snapshot` take an Effect `Schema.Codec`, or a pair
of throwing `encode`/`decode` functions; `Codec.fromSchema` spells out the
conversion. Encoded operations must be JSON. A schema that needs services to
decode is refused, because the codec runs inside the transaction.

**Ids** are branded Schema values: `DocumentId.make`, `OpId.make`,
`ActorId.make`, `Sequence.make`, `Cursor.make`.

**Errors** are tagged, so `Effect.catchTag` narrows them: `JournalError` (storage),
`UnsupportedJournalVersionError`, `InvalidOperationError`, `OperationRejectedError`,
`IdentityConflictError`, `InvalidCursorError`, `CompactedCursorError`,
`InvalidCompactionError`, `EffectFailedError`.

**Metrics.** `Journal.metrics` counts appends, compactions, owner effect runs,
and coalesced effect runs.

**Migrations.** Tables are created and upgraded with a transactional SQLite
`user_version` migration; an interrupted one is retried safely. Your own
operation, snapshot, and effect payloads are not migrated.

## Limits

- SQLite through `@effect/sql-sqlite-node` is the only adapter, and Node 22 is
  required. The storage contract is `SqlClient`, so another SQL backend is an
  adapter, not a change to journal semantics. The SQL module is `unstable` in
  the pinned Effect release candidate.
- `reduce`, `validate`, and `authorize` hold the write lock. Keep them pure,
  fast, and service-free.
- One Journal handle per file. Uniqueness of `[key, op_id]` and
  `[key, sequence]` is enforced by the database, but the intended deployment is
  one authoritative writer.
- Payloads compacted before schema 3 have no canonical hash, so only those rows
  cannot reject a key-reordered retry.
- `recover` is application-driven; there is no background worker and no atomic
  append-and-enqueue.

## Older spellings

`makeJournal`, `makeJournalLayer`, and `journalMetrics` are `Journal.make`,
`Journal.layer`, and `Journal.metrics`; `documentId`, `opId`, `actorId`,
`sequence`, and `cursor` are the branded `.make` constructors. `JournalService(key)`
still works, but its generic arguments are supplied again at each use site with
nothing tying them to the layer; `Journal.define` fixes both together. A codec
given as a function pair is accepted wherever a `Schema.Codec` is.

## See also

- [Replicated state](../../docs/replication.md): both halves end to end,
  including the exchange handler over this journal.
- [`foldkit-sync`](../sync): the client half; `journalContract()` supplies the
  codecs, reducer, initial state, replica binding, and compiled authorization.
- [`examples/sync`](../../examples/sync): a SQLite journal, several replicas,
  server policy, compaction, and the effect ledger, with a test per failure.
