# foldkit-sync + foldkit-durable

Local-first replication of part of a Foldkit Model. `foldkit-sync` is the client
replica, and `foldkit-durable` is the optional SQLite server journal that owns
the order.

Use it for client-authored edits that must survive offline and converge; see the ownership table in [SKILL.md](../SKILL.md) for the other packages.

Sync adds **no second reducer**. `Model`/`Message`/`update` stay the only state
machine. You name the shared slice and the durable Messages, and Sync derives
replay, codecs, the outbox, and the journal contract. It is not for P2P/CRDT
replication or collaborative text.

## Mental model

```text
optimistic shared state = committed snapshot + pending local operations
visible = pending.reduce(replay, committed)      replay = app update on the shared slice
```

Remote means the same four words over its cache by a different mechanism:
`Data.confirmed(projection)` is its committed, optimistic layers are its
pending, and the projection itself is its visible. See
`docs/state-model.md#what-a-reader-sees-while-a-change-is-in-flight`.

Committed `A B C` + pending `D E` shows `replay(A,B,C,D,E)`. If another device
commits `X` first, the next exchange shows `replay(A,B,C,X,D,E)`. A rejected op
is dropped and the rest replay on top. Pending ops replay many times, so a
durable Message must be **deterministic and state-only**. If its `update`
returns a Command or writes outside the shared projection, `submit` fails with
`ReplayError` and writes nothing. Pattern: a local intent Message runs a Command
(IDs, clock, provider), which dispatches a durable *fact* Message. When the fact
needs only the Model (an id from a local counter), return `Sync.fact(message)`:
the mount applies it in the intent's own transition, before any later Message.

## Minimal contract

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedTodoId: Schema.Option(Schema.String),
  lastError: Schema.Option(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
type Message = typeof Message.Type
type Return = Update.Return<Model, Message>

const initial: Model = { todos: [], selectedTodoId: Option.none(), lastError: Option.none() }
const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({ model: { ...model, todos: [...model.todos, { id, title }] } }),
    SelectedTodo: ({ id }) => ({ model: { ...model, selectedTodoId: Option.some(id) } }),
  })

const App = Surface.application({ Model, Message, initial, update })

export const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),                   // replicated slice
  durable: MessageSet.make(App, [Message.CreatedTodo]),        // SelectedTodo stays local
})

// The contract joins an assembly contract-only, so the Module sees it.
const wiring = TodoSync.wiring()
```

A custom `replay` option loses those guards. For large apps, declare one
`AppSync.fragment({ shared, durable })` per feature, then call
`AppSync.make({ documentId, ...AppSync.compose(A, B) })`.

## Replica: open, submit, synchronize

```ts
import { Effect } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const program = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos/tab-1')        // scoped; one per document + writer
  const replica = yield* TodoSync.openReplica(ReplicaId.make('tab-1'), storage)

  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' }))
  const optimistic = yield* replica.shared                    // already includes the pending op
  const status = yield* replica.status                        // { pending, cursor, lastError, rejected }

  // one exchange with the server
  yield* replica.synchronize.pipe(
    Effect.provide(Sync.transport.socket({ url: 'wss://example.com/sync' })),
  )
  return { optimistic, status }
}).pipe(Effect.scoped)
```

- `submit` validates, replays, assigns an `opId`, and persists to the outbox. It
  **sends nothing**. `replica.start` is the loop: one exchange, then one after
  each submit and each server notice on `Transport.changes`. A failed exchange lands in `status.lastError` and is retried on
  a backoff (0.5 s to 30 s), or at once on the next submit. A contract's
  `durable(message)` says whether a Message is recorded. The optional
  `coalesce(last, next)` merges a submit into the last operation while
  no exchange has carried it (a burst of typing becomes one operation).
- Also available: `changes` (a stream of status + shared), `snapshot`,
  `statusChanges`, `committed`, and `close`. Transports: `Sync.transport.socket`
  (reconnecting), `.loopback`, `.fromPromise(client)`, and
  `.serve(socket, { exchange, changes? })` for the server, where `changes`
  subscribes to commits and sends a notice that wakes the client's `start`. The
  socket transport's `transport.socket` shares its connection, across reconnects,
  with `Sync.presence.socketChannel`.
- `Sync.indexedDb(name, factory?)` is the only built-in storage (pass
  `fake-indexeddb` in Node). Its submit writes only the new operation, through
  the optional `Storage.append`. A test `Storage` needs just three members:

```ts
import { Effect } from 'effect'
import type { Storage } from 'foldkit-sync'

const memoryStorage = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next => Effect.sync(() => { state = structuredClone(next) }),   // ignores the CAS revision
    close: Effect.void,
  }
}
```

## Mount the Foldkit app over a replica

```ts
import { Effect, Scope } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const scope = Effect.runSync(Scope.make())
const storage = Effect.runSync(Effect.provideService(Sync.indexedDb('todos/tab-1'), Scope.Scope, scope))
const replica = Effect.runSync(TodoSync.openReplica(ReplicaId.make('tab-1'), storage))

const mounted = Sync.mount(App, TodoSync, {
  replica,
  container: document.getElementById('app')!,                 // must have an id, or mount throws
  view: (model, h) => ({ title: 'Todos', body: h.ul([], model.todos.map(t => h.li([], [t.title]))) }),
  onPersistenceFailure: (model, error) => ({ ...model, lastError: Option.some(error.message) }),
})
Effect.runFork(Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })))

mounted.dispatch(Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }))
mounted.model()
await mounted.dispose()                                        // waits for in-flight persists
```

- A durable Message runs through `update` **immediately**, and a Command then
  persists it. A refused or failed persist reverts the edit and calls
  `onPersistenceFailure`. Outside `update`, the shared slice is reinstalled only
  when an exchange commits, acknowledges, or rejects something, and when a
  failed persist reverts.
- Options: `subscriptions` + `resources` (for example, Mirror entries and their
  Layer), `url: { init, onUrlChange, onUrlRequest? }`, and `onReinstall(next,
  previous)`, which returns the transition when an exchange or a failed persist
  replaces the shared slice (carry a selection across, patch a DOM).
- `Mounted` provides `model`, `dispatch`, `subscribe`, `observe`, `committed`,
  `settled` and `dispose`. `settled()` resolves once the Model has caught up
  with the replica (in a test: `await frames.settle(mounted)`, with
  `Frames.track` from `foldkit-mixins/testing`). It is the host `foldkit-agent` binds to (add `principal`).
  `dispose()` does not close the replica.

**Waiting for the server.** The Model shows an edit before the server commits
it. If an agent must wait for the commit, wait on `mounted.committed`, a
`{ get, subscribe }` source over the confirmed slice (not a Projection). It
never completes for a rejected edit:

```ts
import { Agent } from 'foldkit-agent'

const agent = Agent.make({
  messages: Agent.expose(Message, {
    CreatedTodo: {
      name: 'create_todo',
      description: 'Create a shared todo',
      completion: Agent.when({
        source: mounted.committed,
        predicate: (shared, request) => shared.todos.some(todo => todo.id === request.id),
      }),
    },
  }),
})
```

## Authorization (enforced on the server)

```ts
type Principal = { readonly actorId: string; readonly role: 'admin' | 'guest' }
const Authorized = Sync.forApplication(App).withPrincipal<Principal>()

const Board = Authorized.make({
  documentId: DocumentId.make('board'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo]),
  authorize: {
    // `message` is narrowed to this variant; `shared` is the authoritative snapshot
    CreatedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && !shared.todos.some(todo => todo.id === message.id),
  },
})
```

A variant with no rule is allowed, and a non-durable key is a type error. Rules
compile into `journalContract()` and run only on the server. A rule returns
`true`, `false`, or `{ allowed: false, reason }`. A refused edit comes back as
an exchange rejection, and the replica drops it; `status.rejected` is
`[{ opId, reason: Option<string>, operation }]`, the reason the rule gave, or a
fixed sentence from `journalExchange` (never an error's message), and the
refused operation itself, to read what it changed.

## Server: foldkit-durable Journal

```ts
import { Effect } from 'effect'
import { ActorId, DocumentId, Journal, OpId } from 'foldkit-durable'

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    ...Board.journalContract(),       // codecs, empty snapshot, replay reducer, compiled authorize
    file: 'board.sqlite',             // path or Config<string>; ':memory:' for tests
    opId: operation => OpId.make(operation.opId),                    // re-brand Sync ids
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })
  const { snapshot, cursor } = yield* journal.load(DocumentId.make('board'))
  return { snapshot, later: yield* journal.read(DocumentId.make('board'), cursor) }
}).pipe(Effect.scoped)                // the SQLite connection closes with the scope
```

- `append(documentId, op, principal)` is one transaction: decode,
  `validate`/`authorize`, reduce, assign a gap-free sequence, persist. It
  returns `Committed`, or `AlreadyCommitted` if the payload was compacted. A
  resent `opId` is never applied twice. The same `opId` with a different
  payload fails with `IdentityConflictError`, and a refusal with
  `OperationRejectedError`.
- `snapshotEvery: n` writes the snapshot every `n` commits rather than each (the
  journal keeps it in memory; `load` replays the few since).
- `read(key, cursor, { limit })` pages history; set the exchange's `more: true`
  and the replica asks again at once. `vacuum()` shrinks the file after `compact`.
- Also: `appendAll`, `compact`/`floor`, `cursor` (no snapshot decode), `epoch`, `subscribe` (a wake-up signal; catch up
  with `read`), `Journal.define`/`Journal.layer`, and `runEffect`/`recover` (an
  effect ledger, **not** exactly-once at external providers).
- Durable does **not** speak the sync exchange; `foldkit-sync/journal` does
  (`foldkit-durable` an optional peer): `serveJournal(socket, { sync, journal,
  principal, refuse?, settle? })` answers one socket and notifies it of each
  commit; `journalExchange(options)` is the same as a `TransportClient` for an
  in-process replica. An op that does not decode, names another document, or
  is refused, invalid or a reused id is **rejected by id**, so it cannot block
  the outbox; only a cursor ahead of the journal's or a `JournalError` fails
  the exchange. `settle` (run every exchange) applies commits elsewhere via
  `recover`. Written by hand: `docs/replication.md` (section 3) and
  `examples/sync/src/journal.ts`.
- `Journal.make({ stamp: (operation, { sequence, actorId }) => … })` writes what
  only the commit decides into the operation, after `validate`/`authorize` and
  before `reduce`; the stamped operation is what is stored, read and recovered,
  and a retry is still recognized by what was sent. A stamp must keep `opId`.
  From Sync, declare it per durable variant on the contract:
  `make({ …, stamp: { PriceEdited: ({ id, cents }, { sequence }) =>
  Message.PriceEdited({ id, cents, at: sequence }) } })`; it rides in
  `journalContract()`, and replicas replay the stamped Message in place of
  what they sent. Refuse a client-sent stamped field in `validate`.

**Server reset.** A server returns `epoch: journal.epoch(key)` from every
exchange; the replica sends it back as `exchange`'s third argument. When it
differs, the server answers from sequence 0 (skipping its cursor-ahead check)
and the replica rebuilds its committed state, keeping its outbox: everything the
old server committed is lost, only pending work survives. A replica that never
heard an epoch cannot detect a reset. `journalContract()` also passes
`replicaId`, so Durable binds each replica to its first committing actor.
It also supplies `legacyReplicaId`, which recovers those bindings from compacted
operation ids when a schema-5 journal upgrades to schema 6.

**Presence and LWW.** `Sync.presence.make` is a TTL'd peer registry for
ephemeral state ("who is viewing"), never a durable Message; its `throttle`
option sends at most one value per interval: the first at once, then the latest.
`Sync.lww.register` (experimental) makes one field last-writer-wins. Allocate
stamps with `Sync.lww.openClock` before dispatch, never in `update`.

## Gotchas

- Durable Messages must not return Commands or write outside `shared`. Mint IDs
  and timestamps in a Command, then dispatch the fact.
- Use one mount per replica, and one storage name + `ReplicaId` per tab. A
  second writer fails the storage compare-and-swap. Losing IndexedDB loses
  unsent edits.
- `foldkit-durable`'s `Journal.make` needs Node >= 22 (`node:sqlite`);
  `foldkit-durable/core`'s `Journal.layer(options)` (or `Journal.define(key)
  .layer`) is a layer that needs any `effect/sql` SQLite `SqlClient`,
  `@effect/sql-sqlite-wasm` in a browser: `Layer.provide` the driver, and the
  database lives as long as the journal. One Journal handle per
  database. `reduce`/`validate`/`authorize` hold the write lock, so keep them pure,
  fast, and service-free. Ops must be JSON.
- Sync and Durable ids are branded separately, so re-brand with
  `OpId.make(operation.opId)`. App schema migration is yours to handle.
- With no Foldkit app, use `Sync.define({ documentId, message, shared, empty,
  durable, replay })`.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/sync/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/durable/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/sync-runtime-binding.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/sync
- https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app
- https://github.com/doeixd/foldkit-plus/tree/main/examples/registry (Remote
  reads the rows, Sync keeps the edits, and the journal applies committed
  edits to the table through `recover`)
