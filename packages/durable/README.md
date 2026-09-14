# `foldkit-durable`

The authoritative server journal for local-first Foldkit state.

Clients can edit optimistically and retry when the network is unreliable. The
server still needs one place that says **which operations committed, in what
order, and what state that order produces**. `foldkit-durable` is that place.

For each document it keeps:

```text
ordered operation log
        +
current snapshot
        +
cursor into that log
```

Appending a new operation is atomic: the journal assigns its authoritative
sequence, folds it into the snapshot with your reducer, advances the cursor, and
remembers the operation identity. Sending the same `opId` again does not apply
the operation twice.

It also includes a durable effect ledger for server-side work such as charging a
card or sending an email. That ledger can remember successful outcomes and drive
recovery after a crash, but it **does not promise exactly-once execution at an
external provider**.

**Use it when** several clients or devices write the same server-owned document
and need authoritative ordering, replay, idempotent retries, compaction, and
recoverable external effects. **Do not use it for** peer-to-peer or multi-master
ordering: one server journal decides the order. It is also not a job scheduler;
recovery is a loop your application chooses when to run.

It is the **server half** of [replicated Foldkit state](../../docs/replication.md).
[`foldkit-sync`](../sync) is the client half.

## The mental model

A Journal is intentionally smaller than your application:

```text
client operation
      |
      v
+---------------------------+
|          Journal          |
|                           |
| validate / authorize      |
| assign server sequence    |
| reduce current snapshot   |
| remember opId             |
+-------------+-------------+
              |
       +------+------+
       |             |
       v             v
 operation log    snapshot + cursor
```

The important names are:

| Concept | Meaning |
| --- | --- |
| **Document** | One independently ordered stream of operations, identified by `DocumentId`. |
| **Operation** | One durable change submitted by a client. The application defines its shape. |
| **`opId`** | Stable identity of one operation. Retrying the same operation must reuse it. |
| **Sequence** | The authoritative, gap-free server position assigned when an operation commits. |
| **Cursor** | A position from which a client asks for later committed operations. |
| **Snapshot** | The current reduced document state after the committed prefix represented by its cursor. |

The log and snapshot solve different problems. The snapshot lets a new or
far-behind replica start from current state without replaying history from zero.
The log lets an up-to-date replica ask, “what happened after cursor N?”

```text
sequence:   1      2      3      4
            |      |      |      |
log:       op A   op B   op C   op D
                              ^
                              cursor 3

snapshot at cursor 3
= reduce(reduce(reduce(empty, A), B), C)
```

## Install

```bash
pnpm add foldkit-durable
```

`effect` is a peer dependency, `@effect/sql-sqlite-node` comes with the package,
and Node 22 is required for `node:sqlite`.

## With `foldkit-sync`: the normal Foldkit path

If the journal is backing a `foldkit-sync` contract, **do not rewrite the shared
schema or reducer on the server**. Sync already knows which slice is replicated,
which Messages are durable, what the initial shared value is, and how those
Messages replay through the application's `update`.

Given a Sync contract such as `TodoSync`, the server journal can reuse that
information directly:

```ts
import { Effect } from 'effect'
import { ActorId, DocumentId, Journal, OpId } from 'foldkit-durable'
import { TodoSync } from './sync.js'

type Principal = { readonly actorId: string }

const program = Effect.gen(function* () {
  const journal = yield* Journal.make({
    // Supplied by Sync:
    // - operation codec
    // - snapshot codec
    // - empty snapshot
    // - replay reducer
    // - authorization rules, when the Sync contract declares them
    ...TodoSync.journalContract(),

    file: 'todos.sqlite',

    // Durable and Sync intentionally brand their ids separately.
    // Re-brand them at this boundary instead of sharing an untyped string.
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.scoped)

await Effect.runPromise(program)
```

That relationship is the main architectural seam:

```text
Foldkit application
  Model / Message / update
          |
          v
     foldkit-sync
  "what is durable?"
          |
          | journalContract()
          v
   foldkit-durable
  "what committed, in
   what order, and what
   state does that imply?"
          |
          v
        SQLite
```

`foldkit-sync` owns replication semantics. `foldkit-durable` owns authoritative
storage, order, idempotency, compaction, and effect-recovery records. There is no
second server reducer to keep aligned with the application.

See [`examples/sync`](../../examples/sync) for the full path.

## Using Durable directly

`foldkit-durable` does not require Foldkit or Sync. At the lower level, a Journal
only needs an operation codec, a snapshot codec, an empty snapshot, and a pure
reducer:

```ts
import { Effect, Schema } from 'effect'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'

const Operation = Schema.Struct({ opId: Schema.String, title: Schema.String })
const Snapshot = Schema.Struct({ todos: Schema.Array(Schema.String) })

type Operation = typeof Operation.Type
type Snapshot = typeof Snapshot.Type
type Principal = { readonly actorId: string }

const program = Effect.gen(function* () {
  const journal = yield* Journal.make({
    file: 'journal.sqlite',
    operation: Operation,
    snapshot: Snapshot,
    empty: () => ({ todos: [] }),
    reduce: (snapshot, operation) => ({
      todos: [...snapshot.todos, operation.title],
    }),
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  const todos = DocumentId.make('todos')

  yield* journal.append(
    todos,
    { opId: 'tab-1:1', title: 'Milk' },
    { actorId: 'alice' },
  )

  const { snapshot, cursor } = yield* journal.load(todos)
  const afterZero = yield* journal.read(todos, Cursor.make(0))

  return { snapshot, cursor, afterZero }
}).pipe(Effect.scoped)

await Effect.runPromise(program)
```

`Journal.make` is scoped; the SQLite connection closes with the Effect scope.
`file` may be a literal path or a `Config.Config<string>`.

## What happens when an operation is appended

Think of `append` as the authoritative commit boundary.

For a **new** operation, the journal performs the application checks and state
transition inside the SQLite append transaction, assigns the next sequence, and
persists the committed operation together with the new snapshot/cursor.

```text
encoded operation
      |
      v
 decode
      |
      v
 validate + authorize
      |
      v
 reduce(snapshot, operation)
      |
      v
 assign sequence
      |
      v
 persist operation + snapshot + cursor
      |
      v
 Committed
```

The exact authority remains application-defined:

- `reduce` says what the operation means for document state;
- `validate` rejects structurally invalid work against the authoritative
  snapshot;
- `authorize` decides whether the trusted principal may commit it.

For a **retransmission**, the stable `opId` is the key property. The same
operation is acknowledged rather than applied again. Reusing an `opId` with a
different payload or actor fails with `IdentityConflictError`.

Encoded payloads are canonicalized before hashing, so object-key order does not
turn the same JSON data into a different operation.

## Reading state and history

The main read APIs answer two different questions:

```ts
const current = yield* journal.load(documentId)
// current.snapshot -> current document state
// current.cursor   -> committed position represented by that snapshot

const later = yield* journal.read(documentId, cursor)
// committed operations after that cursor
```

A typical replica uses a checkpoint/snapshot when it is far behind, then replays
later operations in authoritative order.

`Sequence` and `Cursor` are separate branded types on purpose. A committed
operation's sequence is not accidentally accepted where a read cursor is
expected.

## Idempotency and append results

A successful first append returns `Committed`, including the operation, `opId`,
server `sequence`, and `actorId`.

Compaction may later delete the operation payload while retaining its identity.
If that old operation is retransmitted, the journal returns
`AlreadyCommitted`: it can prove the `opId` already committed without pretending
it still has the original payload.

`appendAll` performs an ordered batch in one transaction.

The resulting guarantee is stronger than “duplicates are unlikely”:

```text
same opId + same payload/actor
  -> never apply twice

same opId + different payload/actor
  -> IdentityConflictError
```

That guarantee lasts as long as the retained identity row does; database
rotation is discussed under [Retention](#retention).

## Validation and authorization

`validate` is for structural/application checks against the current snapshot.
`authorize` is for policy. Both execute inside the append transaction, so they
must stay local and fast and cannot require Effect services.

```ts
import { Effect } from 'effect'
import { InvalidOperationError, type JournalOptions } from 'foldkit-durable'

const hooks: Pick<
  JournalOptions<Operation, Snapshot, Principal>,
  'validate' | 'authorize'
> = {
  validate: ({ operation }) =>
    operation.title.length === 0
      ? Effect.fail(new InvalidOperationError({ message: 'title is empty' }))
      : Effect.void,

  authorize: ({ principal, operation }) =>
    principal.actorId === operation.opId.split(':')[0] || {
      allowed: false,
      reason: 'an operation must be committed by the tab that created it',
    },
}
```

Authorization may return `true` / `false`, a refusal carrying a reason, or an
Effect producing either. A refusal becomes `OperationRejectedError`; a supplied
reason is available on `.reason` and repeated in `.message` so a server can
explain why an optimistic edit was rejected.

With `foldkit-sync`, per-Message authorization declared on the Sync contract is
compiled into `journalContract()` and runs here against the authoritative
snapshot.

## What Durable guarantees

For one journal database and its authoritative writer:

- **Atomic append:** a new operation, its resulting snapshot, and the new cursor
  commit together.
- **Stable, gap-free order:** every committed operation has one authoritative
  sequence.
- **Idempotent operation identity:** a retained `opId` cannot be applied twice;
  conflicting reuse is rejected.
- **Canonical payload comparison:** object key order does not create false
  identity conflicts for retained canonical rows.
- **Safe compaction:** dropping old operation payloads does not change the
  document state produced by the compacted prefix, and operation identities are
  retained.
- **Non-blocking change notification:** subscriber failure or slowness does not
  fail or delay a commit.
- **Recorded effect reuse:** a successfully recorded effect result is reused
  across restarts, and concurrent calls for one key coalesce within a single
  Journal instance.

The last guarantee is deliberately narrower than exactly-once execution at an
external provider. See [Effect recovery](#effect-recovery).

## Compaction and change notification

A journal can retain the current state and operation identities without keeping
every old operation payload forever.

`compact` drops committed payloads through a floor; `floor` reports the highest
sequence whose payload has been removed. Identity rows remain so an old retry
can still be recognized.

`journal.subscribe` is a `Stream.Stream<string>` of document keys whose commits
changed. It is a wake-up signal, not a history transport: the channel slides,
slow subscribers may drop old wake-ups, and a subscriber never slows or fails a
commit. Recover missed history with `read`, not with the subscription itself.

## Durable external effects

Some committed operations imply server-side work outside SQLite:

```text
operation commits
      |
      v
send email / charge card / call provider
```

The difficult case is a crash between the external provider succeeding and the
journal recording that success:

```text
provider succeeds
      |
   CRASH HERE
      |
      v
record success in SQLite
```

No local database can atomically commit with an arbitrary external provider.
`foldkit-durable` therefore does **not** claim exactly-once external execution.
Instead, its effect ledger records stable intent identities and outcomes so the
application can distinguish known success from uncertain work and recover with
an explicit policy.

`runEffect(key, run)`:

- writes/uses the durable record for one stable effect key;
- reuses a recorded success without invoking `run` again;
- shares concurrent calls for the same key within one Journal instance;
- may retry `pending` or `failed` records according to the supplied policy.

`unfinished`, `effect`, `clearEffect`, and `recover` support inspection and
recovery.

### What the effect ledger can know

| Durable record | What recovery can conclude | Application policy |
| --- | --- | --- |
| None | No run was recorded for this key. A committed operation may still require work. | Discover the intent from retained application data, then start it. |
| `pending` or `failed` | The external outcome may be unknown. | Retry only with provider idempotency or proof that repeating is safe; otherwise reconcile with the provider or require manual resolution. |
| `succeeded` | The result was recorded. | Call `runEffect` to reuse it without contacting the provider. |

Calling `runEffect` again retries both `pending` and `failed` records by default.
Pass `{ retryFailed: false }` to fail with `EffectFailedError` instead of
retrying a recorded failure, or provide a predicate
`(record: EffectRecord) => boolean` to decide from the record itself.

### Choose a stable semantic identity

Choose the effect key **before** executing the action. Effect keys are global to
the database, so include enough application identity to make collisions
impossible: document, operation, semantic action, and any additional stable
subject when needed.

```ts
import { Effect } from 'effect'
import type { Journal } from 'foldkit-durable'

type Order = { readonly opId: string; readonly id: string }
type OrderSnapshot = { readonly confirmed: ReadonlyArray<string> }
type Orders = Journal<Order, OrderSnapshot, Principal>

declare const provider: {
  sendConfirmation: (input: {
    orderId: string
    idempotencyKey?: string
  }) => Promise<void>
}

const confirmationKey = (order: Order) =>
  JSON.stringify(['orders', order.opId, 'send-confirmation:v1'])

const sendConfirmation = (journal: Orders, order: Order) => {
  const key = confirmationKey(order)

  return journal.runEffect(
    key,
    Effect.tryPromise(() =>
      provider.sendConfirmation({
        orderId: order.id,
        idempotencyKey: key,
      }),
    ),
  )
}
```

The provider must durably associate that key with the action and result for
provider-level idempotency to close the retry gap. Keep the key and request
payload stable across retries, and account for the provider's retention window.
An expired provider idempotency key is an uncertain outcome, not permission to
repeat a non-idempotent action.

Without provider support or another way to query the outcome, an email sent just
before a crash can be sent twice. The journal cannot prove otherwise.

Do not derive effect identities from Command array positions. Reordering
Commands could assign an old result to a different semantic action. Preserve
existing semantic names across application upgrades; a new name denotes new
work, not merely a retry of old work. Multiple effects of the same kind need an
additional stable identity such as recipient id.

### Discovering unfinished work

`journal.effect(key)` is a lookup, not an intent queue. A `pending` record is
created when `runEffect` starts, separately from the operation append. Recovery
must therefore also find committed operations whose effect settlement never
started.

A robust recovery loop is:

1. Read committed operations after an application-owned recovery cursor and
   derive their stable effect intents.
2. Inspect each intent record and apply the recovery policy. Advance the cursor
   only after every intent for that operation is resolved.
3. Keep unresolved operation payloads available by not compacting past the
   recovery cursor, or retain equivalent intent identity in application snapshot
   state.

`journal.recover` implements that scan-and-settle loop. It stops before an
operation whose intent failed or was skipped and returns the cursor through
which all intents settled:

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
    // Default: retry. `skip` stops before this operation so it can be resolved
    // manually without incorrectly advancing the recovery cursor.
    onUnresolved: (_intent, record) =>
      Option.isSome(record) && record.value.status === 'failed'
        ? 'skip'
        : 'retry',
  })
```

The application still owns scheduling, document enumeration, and persistence of
the recovery cursor. `journal.unfinished()` lists every pending/failed effect
record, `journal.keys()` enumerates documents, and `journal.clearEffect(key)`
removes one effect record after application-specific resolution.

There is no atomic append-and-enqueue API today.

### Execution ownership

The in-flight registry exists only inside one `Journal.make` instance. Two
journal handles or two processes can both execute the same effect key; a
`pending` row is not an exclusive claim.

Route effect execution to one owner for a database. Multi-owner execution needs
a persistent claim/lease protocol with fencing and its own recovery policy,
which this package does not supply. Even such a lease cannot eliminate the gap
between an external provider succeeding and SQLite recording success.

Process-crash tests in
[`test/effectRecovery.test.ts`](./test/effectRecovery.test.ts) exercise exits
after append, before provider work, after provider success, and after recording
success but before acknowledgement. They demonstrate both provider-idempotent
recovery and the duplicate that remains possible without it. They test process
termination, not machine power loss.

## Retention

Compaction removes operation payloads, not the identities needed to recognize
old retries. Two classes of rows therefore grow with the lifetime of the
database:

- **Operation identities:** one per distinct `opId`, retained after payload
  compaction.
- **Effect records:** one per durable effect key, retained so a replay can reuse
  the recorded outcome.

Neither is garbage-collected automatically. Storage growth is therefore tied to
the number of distinct operations/effects, not only to retained payload size.

That retention is part of the retry guarantee. As long as an identity row
exists, an old retransmission is recognized. If the application rotates or
recreates the database, an operation whose identity disappeared is
indistinguishable from new work.

After rotation, the application must therefore reject work older than its
retained trust window instead of silently applying it as new. For example, keep
a per-document watermark or reject an operation whose base cursor predates the
retained floor.

## Services and Layers

Use `Journal.make` directly when one scoped Journal is enough. Use
`Journal.define` when the Journal should be a named Effect service whose key and
type parameters are fixed once:

```ts
import { Effect } from 'effect'
import { DocumentId, Journal, type JournalOptions } from 'foldkit-durable'

const TodoJournal = Journal.define<Operation, Snapshot, Principal>(
  'app/TodoJournal',
)

declare const options: JournalOptions<Operation, Snapshot, Principal>

const program = Effect.gen(function* () {
  const journal = yield* TodoJournal.tag
  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.provide(TodoJournal.layer(options)))
```

Two `Journal.define` calls create two separately typed services. Each tag can
only be satisfied by its corresponding layer. `Journal.layer(options)` remains
the default-key form when the application does not need a named definition.

## Codecs, branded identities, and errors

`operation` and `snapshot` accept an Effect `Schema.Codec`, or throwing
`encode`/`decode` function pairs for applications that do not use Schema.
`Codec.fromSchema(schema)` spells out the Schema conversion explicitly.

The operation schema determines the encoded input accepted by `append`; a
transforming Schema is therefore checked at the call site rather than degrading
the boundary to `unknown`. Decode failures become `InvalidOperationError`.

Journal identities are branded Schema values:

```ts
DocumentId.make('todos')
OpId.make('tab-1:1')
ActorId.make('alice')
Sequence.make(5)
Cursor.make(5)
```

The brands prevent one kind of identity/position from being passed where another
is expected.

Failures are Schema-backed tagged errors, so `Effect.catchTag` narrows them.
Important tags include:

```text
JournalError
UnsupportedJournalVersionError
InvalidOperationError
OperationRejectedError
IdentityConflictError
InvalidCursorError
CompactedCursorError
InvalidCompactionError
EffectFailedError
```

## Maintenance, migrations, and metrics

The Journal also exposes operational tooling:

- `keys` enumerates documents;
- `reset` removes one document's snapshot and operations;
- `effect`, `unfinished`, and `clearEffect` inspect/manage effect records;
- `compact` and `floor` manage retained operation payloads;
- `Journal.metrics` counts appends, compactions, owner effect runs, and coalesced
  effect runs.

Effect records are globally keyed, not owned by a document, so `reset` does not
remove them.

Database tables are created/upgraded with a transactional SQLite `user_version`
migration. An interrupted migration can be retried safely.

## Limits and production constraints

- SQLite through `@effect/sql-sqlite-node` is the only adapter today, and Node 22
  (`node:sqlite`) is required. The internal storage contract is `SqlClient`, so a
  different SQL backend is an adapter concern rather than a Journal semantic.
- The SQL module is under `unstable` in the pinned Effect release candidate.
- `reduce` runs inside the append transaction while the SQLite write lock is
  held. Keep it pure and fast.
- `validate` and `authorize` run in that transaction as well. They may return an
  Effect, but cannot require services and should remain local to the snapshot.
- Encoded operations must be JSON-compatible.
- Schema 3 recomputes retained operations' `payload_hash` from canonical JSON.
  Payloads compacted before that migration cannot be re-hashed because their
  content is gone, so only those legacy rows can reject a key-reordered retry.
- `[key, op_id]` and `[key, sequence]` uniqueness is enforced by the database,
  but the intended deployment is still one authoritative writer per SQLite file.
  Use one Journal handle per file.
- `recover` is application-driven; the package does not run a background worker.
- The effect ledger records/reuses outcomes but cannot create an atomic
  transaction with an external provider.

## Older spellings

Existing names remain compatible. `Journal.make`, `Journal.layer`, and
`Journal.metrics` correspond to `makeJournal`, `makeJournalLayer`, and
`journalMetrics`; the branded `.make` constructors correspond to the older
`documentId`, `opId`, `actorId`, `sequence`, and `cursor` functions.

`JournalService<...>(key)` also remains available, but `Journal.define` is safer:
with `JournalService`, generic arguments are supplied again at each use site and
nothing ties them to the layer that satisfied the key. `Journal.define` fixes the
key and Journal shape together.

A codec supplied as throwing `encode` / `decode` functions remains accepted
wherever a `Schema.Codec` is accepted.

## See also

- [Replicated state](../../docs/replication.md) — the mental model for Sync and
  Durable together, and when not to use either.
- [`foldkit-sync`](../sync) — the client half; `journalContract()` supplies the
  journal's operation/snapshot codecs, reducer, initial state, and compiled
  authorization rules.
- [`examples/sync`](../../examples/sync) — a SQLite Journal, multiple replicas,
  server policy, compaction, and the effect ledger working together.
