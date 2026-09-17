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

Committed `A B C` + pending `D E` shows `replay(A,B,C,D,E)`. If another device
commits `X` first, the next exchange shows `replay(A,B,C,X,D,E)`. A rejected op
is dropped and the rest replay on top. Pending ops replay many times, so a
durable Message must be **deterministic and state-only**. If its `update`
returns a Command or writes outside the shared projection, `submit` fails with
`ReplayError` and writes nothing. Pattern: a local intent Message runs a Command
(IDs, clock, provider), which dispatches a durable *fact* Message.

## Minimal contract

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedTodoId: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
type Message = typeof Message.Type
type Return = Update.Return<Model, Message>

const initial: Model = { todos: [], selectedTodoId: null, lastError: null }
const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({ model: { ...model, todos: [...model.todos, { id, title }] } }),
    SelectedTodo: ({ id }) => ({ model: { ...model, selectedTodoId: id } }),
  })

const App = Surface.application({ Model, Message, initial, update })

export const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.fields.todos),                   // replicated slice
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
  each submit. Transport errors land in `status.lastError` and it keeps going.
- Also available: `changes` (a stream of status + shared), `snapshot`,
  `statusChanges`, `committed`, and `close`. Transports: `Sync.transport.socket`
  (reconnecting), `.loopback`, `.fromPromise(client)`, and
  `.serve(socket, { exchange })` for the server.
- `Sync.indexedDb(name, factory?)` is the only built-in storage (pass
  `fake-indexeddb` in Node). A test `Storage` is three members:

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
  onPersistenceFailure: (model, error) => ({ ...model, lastError: error.message }),
})
Effect.runFork(Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })))

mounted.dispatch(Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }))
mounted.model()
await mounted.dispose()                                        // waits for in-flight persists
```

- A durable Message runs through `update` **immediately**, and a Command then
  persists it. A refused or failed persist reverts the edit and calls
  `onPersistenceFailure`. The shared slice is reinstalled only when an exchange
  commits, acknowledges, or rejects something.
- Options: `subscriptions` + `resources` (for example, Mirror entries and their
  Layer) and `url: { init, onUrlChange, onUrlRequest? }`.
- `Mounted` provides `model`, `dispatch`, `subscribe`, `observe`, `committed`,
  and `dispose`. It is the host `foldkit-agent` binds to (add `principal`).
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
  shared: Projection.pick(App.fields.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo]),
  authorize: {
    // `message` is narrowed to this variant; `shared` is the authoritative snapshot
    CreatedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && !shared.todos.some(todo => todo.id === message.id),
  },
})
```

A variant with no rule is allowed, and a non-durable key is a type error. Rules
compile into `journalContract()` and run only on the server. A refused edit
comes back as an exchange rejection, and the replica drops it.

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
- Also: `appendAll`, `compact`/`floor`, `subscribe` (a wake-up signal; catch up
  with `read`), `Journal.define`/`Journal.layer`, and `runEffect`/`recover` (an
  effect ledger, **not** exactly-once at external providers).
- Durable does **not** speak the sync exchange. Your server wires
  `Sync.transport.serve(socket, { exchange })` to a handler that appends pending
  ops, collects `acknowledged`/`rejected`, reads after the cursor, and returns a
  checkpoint on `CompactedCursorError`. See `examples/sync/src/journal.ts`.

**Presence and LWW.** `Sync.presence.make` is a TTL'd peer registry for
ephemeral state ("who is viewing"), never a durable Message.
`Sync.lww.register` (experimental) makes one field last-writer-wins. Allocate
stamps with `Sync.lww.openClock` before dispatch, never in `update`.

## Gotchas

- Durable Messages must not return Commands or write outside `shared`. Mint IDs
  and timestamps in a Command, then dispatch the fact.
- Use one mount per replica, and one storage name + `ReplicaId` per tab. A
  second writer fails the storage compare-and-swap. Losing IndexedDB loses
  unsent edits.
- `foldkit-durable` needs Node >= 22 (`node:sqlite`) and one Journal handle per
  file. `reduce`/`validate`/`authorize` hold the write lock, so keep them pure,
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
