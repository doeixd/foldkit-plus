# `foldkit-durable`

When phones or browser tabs edit shared data offline and retry requests over flaky networks, your server needs one authoritative place to decide which edits committed, in what order, and what state those commits produce—without applying a retried request twice.

`foldkit-durable` is a server-side operation journal on SQLite. For each document, it stores a gap-free log of committed operations, the current reduced snapshot, and a sequence cursor, validating, authorizing, reducing, and persisting each append inside one SQLite transaction so retries return the recorded outcome instead of running again.

It is the server half of [replicated Foldkit state](../../docs/replication.md), pairing with [`foldkit-sync`](../sync/README.md) via `journalContract()` or running standalone for any operation schema.

## Choose between Durable, Sync, and a SQL database

Use `foldkit-durable` when several clients or devices write one server-owned document and need an authoritative order, idempotent retries, a snapshot for newcomers, and compaction that preserves history.

- **Arbitrary ad-hoc SQL queries:** use a relational database with [`foldkit-remote-drizzle`](../remote-drizzle/README.md).
- **Client-side outbox and optimistic UI replay:** use [`foldkit-sync`](../sync/README.md).
- **Multi-master peer merging without a central order:** use a CRDT instead (one journal decides order per document).
- **External provider calls after a commit:** run `journal.recover` on your own schedule using the [effect ledger](#external-effects-and-the-crash-gap).

## How documents, sequences, cursors, and snapshots fit together

A document's log is a gap-free sequence of operations: op A at sequence 1, op B at 2, op C at 3, op D at 4. A cursor names a position in that log, and the snapshot at cursor 3 is the result of reducing operations 1 through 3 from `empty`.

| Name | Meaning |
| --- | --- |
| **Document** | One independently ordered stream of operations, keyed by `DocumentId`. |
| **Operation** | One durable change a client submitted. The application defines its shape. |
| **`opId`** | The operation's stable identity. A retry reuses it. |
| **Sequence** | The gap-free position the journal assigns when an operation commits. |
| **Cursor** | A position a reader has reached; "what came after N?" |
| **Snapshot** | The reduced state of the committed prefix its cursor names. |
| **Epoch** | The identity of a document's history; new after a reset. |

A far-behind or brand-new replica starts by loading the snapshot, while an up-to-date replica reads operations after its cursor.

## Install

```bash
pnpm add foldkit-durable
```

`effect` is a peer dependency, `@effect/sql-sqlite-node` comes with the package, and Node 22 is required for `node:sqlite`. For browsers, Cloudflare D1, or custom SQLite drivers, use [`foldkit-durable/core`](#running-in-a-browser-or-custom-sqlite-runtime).

## A first journal: append and load operations

This opens an in-memory SQLite journal, appends one todo operation, and loads both the reduced snapshot and the history after cursor `0`:

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
    file: ':memory:',
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

Running `Effect.runPromise(program)` returns `{ snapshot: { todos: ['Milk'] }, cursor: 1, since: [{ operation: { opId: 'tab-1:1', title: 'Milk' }, opId: 'tab-1:1', sequence: 1, actorId: 'alice' }] }`.

What happened:

- `Journal.make` creates the SQLite schema in `':memory:'` (or a file path, or `Config<string>`) and closes the connection when the `Effect.scoped` block exits. On a long-lived server, keep that scope open for the server's lifetime.
- `append` decodes the payload against `Operation`, checks idempotency on `opId`, runs `reduce`, and persists the operation and new snapshot in one transaction.
- `load` returns the current snapshot (`{ todos: ['Milk'] }`) and `cursor` (`1`), while `read` returns every committed operation after cursor `0`.

Sending `{ opId: 'tab-1:1', title: 'Milk' }` again returns the recorded commit without appending a duplicate; sending different data under `'tab-1:1'` fails with `IdentityConflictError`. Invalid sender payloads fail with `InvalidOperationError`, while stored rows that fail the current schema raise `JournalError`.

## Pairing with `foldkit-sync`

When backing a [`foldkit-sync`](../sync/README.md) contract, pass `...contract.journalContract()` to `Journal.make` so Durable reuses the Sync contract's codecs, empty snapshot, reducer, replica binding, and authorization rules directly:

```ts
import { DocumentId as SyncDocumentId, Sync } from 'foldkit-sync'

const TodoSync = Sync.define({
  documentId: SyncDocumentId.make('todos'),
  message: Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String }),
  shared: Schema.Struct({ titles: Schema.Array(Schema.String) }),
  empty: { titles: [] },
  durable: () => true,
  replay: shared => shared,
})

const syncedProgram = Effect.gen(function* () {
  const journal = yield* Journal.make({
    ...TodoSync.journalContract(),
    file: 'todos.sqlite',
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.scoped)
```

Your Foldkit application owns `Model`, `Message`, and `update`; `foldkit-sync` owns what is shared and durable; `foldkit-durable` owns commit ordering and SQLite storage. Pair this journal with `serveJournal` from `foldkit-sync/journal` to speak the Sync wire protocol; see [Replicated state](../../docs/replication.md#3-the-server-an-exchange-over-the-journal).

## Running in a browser or custom SQLite runtime

In a browser or any runtime without `node:sqlite`, import `foldkit-durable/core` instead. It provides the same journal as an Effect `Layer` requiring a `SqlClient` rather than a `file` path—for example, `@effect/sql-sqlite-wasm` in the browser:

<!-- docs-check
import { type JournalStoreOptions } from 'foldkit-durable/core'
declare const storeOptions: JournalStoreOptions<Operation, Snapshot, Principal>
-->

```ts
import * as WasmClient from '@effect/sql-sqlite-wasm/SqliteClient'
import { Layer } from 'effect'
import { DocumentId as CoreDocumentId, Journal as CoreJournal } from 'foldkit-durable/core'

const Todos = CoreJournal.define<Operation, Snapshot, Principal>('app/Todos')
// `storeOptions` as for `Journal.make`, without `file`.
const live = Todos.layer(storeOptions).pipe(Layer.provide(WasmClient.layerMemory({})))

const wasmProgram = Effect.gen(function* () {
  const journal = yield* Todos.tag
  return yield* journal.cursor(CoreDocumentId.make('todos'))
}).pipe(Effect.provide(live))
```

Because `SqlClient` is provided as a `Layer`, the database opens and closes cleanly with the journal, and you can share one connection with your app's other tables (`Layer.mergeAll(Todos.layer(options), Tables).pipe(Layer.provide(driver))`). Outside Effect, hold the layer in a `ManagedRuntime`. `foldkit-durable/core` imports no `node:` modules and hashes payloads in plain JavaScript with the same canonical algorithm as Node. On Cloudflare D1, pass `@effect/sql-d1` with `d1: true` (see [On Cloudflare D1](#on-cloudflare-d1-d1-true)).

## What `append` guarantees

For each new operation, `append` executes these steps inside one SQLite transaction:

1. Decode the operation against the `Operation` codec.
2. Run `validate` and `authorize` against the current snapshot.
3. Assign the next gap-free `Sequence`.
4. Run `stamp` (if configured), `reduce`, and `judge`.
5. Persist the operation, snapshot, and updated cursor, returning `Committed`.

For a retransmitted operation, `opId` controls the outcome:

- **Same `opId`, same payload and actor:** answered from history without applying `reduce` again.
- **Same `opId`, different payload or actor:** rejected with `IdentityConflictError`.

Payloads are canonicalized before hashing so reordered JSON keys match. This guarantee holds for as long as the identity row exists; see [Retention](#retention).

When using a function-pair codec, you can provide `compared(input)` to normalize older payload versions into the form they were originally written in, ensuring retries across schema upgrades remain recognized while storing the upgraded payload (`Sync`'s `journalContract()` supplies this automatically).

**A commit stamp** writes commit-time facts such as the assigned `sequence` into the operation after `validate` and `authorize` but before `reduce`:

```ts
import { type JournalOptions } from 'foldkit-durable'

type Edit = Operation & { readonly at?: number }
const stamping: Pick<JournalOptions<Edit, Snapshot, Principal>, 'stamp'> = {
  stamp: (operation, { sequence }) => ({ ...operation, at: sequence }),
}
```

Every reader (`reduce`, `read`, `load`, and `recover`) sees the stamped operation, while retry hashing uses the pre-stamp operation as sent (resending the stamped form under the same `opId` fails with `IdentityConflictError`, and changing `opId` inside `stamp` fails with `InvalidOperationError`). See [Editing server data through a journal](../../docs/editing-server-data.md) for using commit sequences to reconcile read models.

Interpret each journal result carefully:

| You observe | It proves | What remains external |
| --- | --- | --- |
| `append` returned `Committed` | The journal accepted and persisted it | Clients may not have synced it yet |
| `load` returned a snapshot and cursor | The snapshot reflects that committed prefix | Uncommitted client edits live in outboxes |
| An effect result is recorded | The journal can reuse that outcome | A crash before recording leaves it uncertain |

`append` returns `AlreadyCommitted` instead of `Committed` when the operation was committed earlier and compaction has already dropped its payload. `appendAll` commits a batch atomically in one SQLite transaction.

On large documents, writing a snapshot on every commit can be costly; pass `snapshotEvery: n` to write snapshots every `n` commits and replay the short tail on `load`. The journal caches the most recent 256 document states in memory (validated against the stored cursor so external writes are noticed); treat values returned by `load` and passed to `reduce` as read-only.

## Validation and authorization

`validate` and `authorize` run inside the append transaction while the write lock is held, so keep them pure, synchronous or local, and free of external Effect services:

```ts
import { InvalidOperationError } from 'foldkit-durable'

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

A refused `authorize` check fails with `OperationRejectedError` (carrying `reason` as `message`). The `principal` comes from your transport authentication rather than the operation payload, preventing callers from spoofing another actor.

**Laws.** `judge` runs after `reduce` over `{ before, after }` and the stamped operation, returning `true` or the first broken law (`OperationRejectedError` with `rule` and `path`):

```ts
const capped: Pick<JournalOptions<Operation, Snapshot, Principal>, 'judge'> = {
  judge: ({ after }) =>
    after.todos.length <= 100 || {
      rule: 'atMost100Todos',
      message: 'A list holds 100 todos',
      path: ['todos'],
    },
}
```

`judge` checks `after` strictly regardless of `before`, so a document already breaking a newly added law accepts only operations that repair it. A throwing `judge` or `reduce` produces `InvalidOperationError`. Sync contracts pass `laws` here via `journalContract()`.

**Replica binding.** When `replicaId` is provided (supplied by `journalContract()`), the first commit from a replica binds that replica id to its actor for that document, and later commits from other actors using that replica id are refused before `validate`. Use unguessable or server-assigned replica ids. If migrating an older compacted database created before schema 6, supply `legacyReplicaId` so existing ids can be recovered.

## Reading history

<!-- docs-check
declare const journal: Journal<Operation, Snapshot, Principal>
declare const key: DocumentId
-->

```ts
const history = Effect.gen(function* () {
  const { snapshot, cursor } = yield* journal.load(key) // the state, and where it is
  const later = yield* journal.read(key, cursor, { limit: 500 }) // what came after
  return { snapshot, later }
})
```

`read` returns up to `limit` operations for paginated catch-up (`Sync` maps this to `more`). `cursor(key)` reads the latest sequence without decoding a snapshot. `Sequence` and `Cursor` have distinct brands so a commit sequence cannot be passed accidentally as a read cursor.

**Compaction and checkpoints.** `compact(key, through)` removes committed payloads up to `through`, advancing `floor(key)`. Reading from below `floor` fails with `CompactedCursorError`, signaling the server to send a `load` checkpoint instead. Identity rows remain so old retries are still recognized.

**Reset and epoch.** `epoch(key)` identifies one linear history and changes after `reset(key)` or on a new database file. Return the epoch with every server reply; when a client presents an old epoch, answer from cursor `0`. `reset` clears the snapshot and operations while keeping replica bindings and effect records.

**Change notification.** `journal.subscribe` is a sliding `Stream` of document keys changed by commits—use it as a wake-up signal and catch up with `read`. Slow subscribers drop intermediate notifications without slowing or failing commits.

## External effects and the crash gap

When a committed operation triggers work outside SQLite—such as sending an email or charging a card—no local database commits atomically with an external provider. If the process crashes **after the provider succeeds but before recording that success**, a restarted server cannot tell whether the provider acted.

The journal's **effect ledger** records a stable intent identity and its outcome (`pending`, `succeeded`, or `failed`) so recovery can reuse known successes and apply an explicit policy for uncertain work.

`runEffect(key, run)` reuses a recorded `succeeded` result without calling `run` again, deduplicates concurrent calls on the same key within one `Journal` instance, and retries `pending` or `failed` records by default (pass `{ retryFailed: false }` to fail with `EffectFailedError`, or pass a custom predicate):

| Record | Recovery can conclude | Policy |
| --- | --- | --- |
| none | No run was recorded; a committed operation may still need work | Derive the intent from the operation and start it |
| `pending` or `failed` | The provider's outcome is unknown | Retry only with provider idempotency; else resolve manually |
| `succeeded` | The result is known | `runEffect` reuses it without contacting the provider |

Derive each effect key from the document, operation id, and semantic action before calling the provider, and pass that same key as the provider's idempotency key:

<!-- docs-check
import { Option } from 'effect'

type Order = { readonly opId: string; readonly id: string }
type OrderSnapshot = { readonly confirmed: ReadonlyArray<string> }
type Orders = Journal<Order, OrderSnapshot, Principal>
declare const provider: {
  sendConfirmation: (input: { orderId: string; idempotencyKey?: string }) => Promise<void>
}
-->

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

Effect keys are database-global. Avoid array-index keys (reordering shifts keys across actions), and choose a new semantic name for distinct new work. Without provider idempotency, a crash right after an external call can cause a duplicate on retry.

**Recovery.** Because `pending` is written when `runEffect` starts rather than at commit time, `journal.recover` scans committed operations after an application-owned cursor, executes or reuses each intent, and stops before the first failed or skipped operation, returning the settled cursor:

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

Your application controls when `recover` runs, which documents it covers (`keys()`), and where the settled cursor is stored (avoid compacting past it). Inspect unresolved items with `unfinished()`, `effect(key)`, and `clearEffect(key)`.

**One executor per database.** The in-flight map lives in one `Journal.make` handle; a `pending` row is a crash marker rather than a distributed lock, so route execution through one handle. See [`test/effectRecovery.test.ts`](./test/effectRecovery.test.ts) for idempotent recovery and crash-window tests.

**Named cursors and parked runs.** Store recovery cursors and set-aside runs beside the ledger via `journal.cursors` (used by `foldkit-sync` reactions):

<!-- docs-check
import type { Committed } from 'foldkit-durable'
declare const orders: Orders
declare const order: Committed<Order>
-->

```ts
const mailer = Effect.gen(function* () {
  const key = DocumentId.make('orders')
  // Once, before serving: starts at the document's cursor (or `from: 'floor'`).
  yield* orders.cursors.track(key, 'mailer')
  const tracked = yield* orders.cursors.settled(key, 'mailer')
  return Option.map(tracked, ({ epoch, cursor, attempts }) => ({ epoch, cursor, attempts }))
})

// After a run of `order` finished, or was set aside:
const advanced = (epoch: string) =>
  orders.cursors.advance(DocumentId.make('orders'), 'mailer', epoch, Cursor.make(order.sequence))
```

- **Lower bound:** `advance` only moves forward and clears failure counts when it advances; moving a cursor back only causes ledger reads without re-running succeeded effects.
- **Failure tracking:** `stalled(key, name, epoch, at)` tracks attempt counts and timestamps persistently across restarts.
- **Parked runs:** `park`, `parked`, and `unpark` store failed runs with retry input (surviving compaction) and error text.
- **Epochs:** Every cursor and parked row is scoped to its epoch; writes against an old epoch become no-ops, and single-statement writes keep these guarantees on D1.
- **Schema 7 tables:** Cursors and parked runs live in `foldkit_durable_cursors` and `foldkit_durable_parked` (older builds refuse migrated databases with `UnsupportedJournalVersionError`).

## Retention

Three tables grow monotonically over the lifetime of a database: one identity row per distinct `opId` (retained across compaction to recognize old retries), one row per effect key, and parked runs until unparked.

Compaction clears payload columns while leaving SQLite free pages in the file; schedule `vacuum()` during maintenance to rebuild the file and checkpoint the WAL (an active reader on another connection can cause `vacuum` to fail with `JournalError`, which succeeds on a later run).

When rotating or recreating a database file, reject stale operations older than your retained window (using a per-document watermark or comparing base cursors against the floor) so lost identity rows cannot be re-applied as new edits.

## Services, codecs, errors, metrics

**As a service.** `Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')` binds the context key and type parameters together and returns `tag` and `layer`:

<!-- docs-check
declare const options: JournalOptions<Operation, Snapshot, Principal>
-->

```ts
const TodoJournal = Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')

const served = Effect.gen(function* () {
  const journal = yield* TodoJournal.tag
  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.provide(TodoJournal.layer(options)))
```

Separate `Journal.define` calls create distinct services (`Journal.layer(options)` uses the default key).

**Codecs.** `operation` and `snapshot` accept any Effect `Schema.Codec` (or `{ encode, decode, compared? }`, see `Codec.fromSchema`) producing JSON-compatible payloads without Effect services.

**Ids.** Construct branded identifiers with `DocumentId.make`, `OpId.make`, `ActorId.make`, `Sequence.make`, and `Cursor.make`.

**Errors.** Tagged errors work with `Effect.catchTag`: `JournalError`, `UnsupportedJournalVersionError`, `InvalidOperationError`, `OperationRejectedError`, `IdentityConflictError`, `InvalidCursorError`, `CompactedCursorError`, `InvalidCompactionError`, and `EffectFailedError`.

**Metrics.** `Journal.metrics` records appends, compactions, owner effect runs, and coalesced effect runs.

**Migrations.** Schema tables upgrade automatically inside transactional `user_version` migrations; your own operation, snapshot, and effect payload schemas remain yours to migrate.

## On Cloudflare D1 (`d1: true`)

Cloudflare D1 speaks SQLite without explicit SQL transactions, `PRAGMA user_version`, or `VACUUM`. Pass `d1: true` to `foldkit-durable/core` with `@effect/sql-d1`:

<!-- docs-check standalone
import { Schema } from 'effect'
import type { D1Database } from '@cloudflare/workers-types'
import { DocumentId as SyncDocumentId, Sync } from 'foldkit-sync'

const TodoSync = Sync.define({
  documentId: SyncDocumentId.make('todos'),
  message: Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String }),
  shared: Schema.Struct({ titles: Schema.Array(Schema.String) }),
  empty: { titles: [] },
  durable: () => true,
  replay: shared => shared,
})
type Contract = ReturnType<typeof TodoSync.journalContract>
type Operation = Parameters<Contract['reduce']>[1]
type Snapshot = ReturnType<Contract['empty']>
type Principal = { readonly actorId: string }
declare const env: { readonly DB: D1Database }
-->

```ts
import * as D1Client from '@effect/sql-d1/D1Client'
import { Layer } from 'effect'
import { ActorId, Journal, OpId } from 'foldkit-durable/core'

const Todos = Journal.define<Operation, Snapshot, Principal>('app/Todos')
const live = Todos.layer({
  ...TodoSync.journalContract(),
  opId: operation => OpId.make(operation.opId),
  actorId: (principal: Principal) => ActorId.make(principal.actorId),
  d1: true,
}).pipe(
  Layer.provide(D1Client.layer({ db: env.DB })),
)
```

How D1 mode behaves:

- Schema versions live in a `durable_meta` table instead of `PRAGMA user_version` using idempotent migrations.
- Concurrent appends retry on uniqueness conflicts, re-reading the cursor and re-running `validate`, `authorize`, `reduce`, and `judge` over the latest committed snapshot so appends stay gap-free.
- `appendAll` commits each operation sequentially rather than in a single multi-statement transaction.
- Snapshot reads replay only up to their target cursor and reject inconsistent mid-compaction reads.
- `vacuum` succeeds as a no-op since D1 manages compaction and storage automatically.
- Route appends through a single Durable Object writer for exact read-your-commit consistency.
- `journal.store` says `serializable` per statement here (`isolates: 'statement'`): D1 runs one statement or batch at a time, but `validate` and `authorize` read in one round trip and the append lands in another, and nothing holds the snapshot still between them, so a rule judged from that read is not held. Over SQLite it says `serializable` per transaction (appends commit as if one at a time). Its fields are those of `StoreCapabilities` in `@doeixd/metakit/store` (`name`, `isolation`, `isolates`, `parentRowLock`).

`Journal.make` (the Node file entrypoint) refuses `d1: true`; use `foldkit-durable/core` with `D1Client` instead.

## Limits

- **SQLite only:** via `@effect/sql-sqlite-node` (Node 22) in `Journal.make`, or any Effect SQLite client (`@effect/sql-sqlite-wasm`, `@effect/sql-d1` with `d1: true`) in `foldkit-durable/core`.
- **In-transaction callbacks:** `reduce`, `validate`, `authorize`, and `judge` hold the write lock; keep them pure, fast, and free of services.
- **Single-writer deployment:** database constraints enforce uniqueness of `[key, op_id]` and `[key, sequence]`, while one authoritative writer per file avoids lock contention.
- **Pre-schema-3 compaction:** payloads compacted before schema 3 lack canonical hashes, so key-reordered retries of those rows cannot be matched by hash.
- **Application-driven recovery:** `recover` runs when your host schedules it rather than spawning a background worker.

## Older spellings

`makeJournal`, `makeJournalLayer`, and `journalMetrics` map to `Journal.make`, `Journal.layer`, and `Journal.metrics`; `documentId`, `opId`, `actorId`, `sequence`, and `cursor` map to `.make` constructors. Prefer `Journal.define` over `JournalService(key)` so generic parameters stay tied to the layer. Plain `{ encode, decode }` function pairs work anywhere `Schema.Codec` is accepted.

## Next

- Connect replicas to this journal: [`foldkit-sync`](../sync/README.md) and [Replicated state](../../docs/replication.md).
- Reconcile journal commits with server read tables: [Editing server data through a journal](../../docs/editing-server-data.md).
- Run a complete journal with compaction and crash-recovery tests: [`examples/sync`](../../examples/sync).
