# `foldkit-sync`

Keeps part of a Foldkit application's Model working offline and converging with
a server. An edit applies to the local Model immediately, is written to a
persistent outbox, and is sent to the server when the network allows. The
server decides the order; every replica replays that order and ends up with the
same state.

The trick is that it is still your application. You declare which Model fields
replicate and which Messages are durable; the shared codec, the initial
snapshot, the replay reducer, and the server journal's contract are all derived
from the `update` you already wrote. There is no second reducer to keep in sync
with the first.

**Use it when** clients must keep working offline, several devices or tabs edit
the same document, and you have (or can run) a server that orders operations —
[`foldkit-durable`](https://github.com/doeixd/foldkit-plus/tree/main/packages/durable)
is one. **Not for** peer-to-peer collaboration: this is server-ordered and
single-writer-per-document, not a CRDT mesh. Concurrent edits to the same field
resolve by server arrival order unless you opt that field into the
[last-writer-wins register](#last-writer-wins-fields-experimental) below, and
there is no operational transform for collaborative text.

It is the **client half** of [replicated Foldkit state](https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md);
the [guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md)
covers the mental model and when not to use it.

## Install

```bash
pnpm add foldkit-sync
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with it.
`foldkit-durable` is the server half.

## Quick start

`Sync.forApplication` is the Foldkit-facing layer. From one
`Surface.application` and a writable projection it derives the shared schema,
the durable Message subset, the initial snapshot, and replay, and exposes a
read-only Surface over the same projection.

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
  RenamedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
type Message = typeof Message.Type

const initial: Model = { todos: [], selectedTodoId: null, lastError: null }

type Return = Update.Return<Model, Message>
// The application's ordinary transition. Sync does not add a second one.
const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    RenamedTodo: ({ id, title }) => ({
      model: {
        ...model,
        todos: model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      },
    }),
    SelectedTodo: ({ id }) => ({ model: { ...model, selectedTodoId: id } }),
  })

const App = Surface.application({ Model, Message, initial, update })

const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.fields.todos), // the codec, read, and write
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
})
```

Only `todos` is replicated; `selectedTodoId` and `lastError` stay local. The
derived `replay` installs the shared slice into the application's initial Model,
applies the durable Message through `update`, and reads the shared slice back.

A durable Message must therefore be a deterministic, state-only transition of
the shared projection. Replay refuses one whose `update` returns a Command (a
live effect cannot be replayed) or changes a field outside the projection (the
change would be silently lost), naming the Message and the fields. A Message that
needs an effect stays local and emits a durable fact once the effect settles:
`RequestedChargeCard` runs the Command; `CardCharged` is what replicates.
Pass `replay` to `make` when an application needs a custom reducer over the
shared slice; a custom replay is not guarded.

On the server, the same contract produces the journal's codecs and reducer, so
neither is written twice:

```ts
import { Effect } from 'effect'
import { ActorId, DocumentId, Journal, OpId } from 'foldkit-durable'

type Principal = { readonly actorId: string }

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    // Operation and snapshot codecs, `empty`, `reduce`, and `authorize` if declared.
    ...TodoSync.journalContract(),
    file: 'todos.sqlite',
    // The two packages brand their ids separately, so re-brand at the seam.
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })
  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.scoped)
```

### Mounting

`Sync.mount` runs the application over an open replica with one reducer. A
durable Message is applied at once through the application's `update` and
persisted afterwards in a Command; the shared slice is re-installed from the
replica when an exchange or a rejection changes it, or when a persist fails.

```ts
import { Effect, Scope } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const container = document.getElementById('app')! // Foldkit needs the element to have an id

const scope = Effect.runSync(Scope.make())
const storage = Effect.runSync(
  Effect.provideService(Sync.indexedDb('todos/tab-1'), Scope.Scope, scope),
)
const replica = Effect.runSync(TodoSync.openReplica(ReplicaId.make('tab-1'), storage))

const mounted = Sync.mount(App, TodoSync, {
  replica,
  container,
  view: (model, h) => ({
    title: 'Todos',
    body: h.ul(
      [],
      model.todos.map(todo => h.li([], [todo.title])),
    ),
  }),
  onPersistenceFailure: (model, error) => ({ ...model, lastError: error.message }),
})

// The exchange loop: once, then after every submit, retrying a failed exchange.
Effect.runFork(
  Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })),
)

mounted.dispatch(Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }))
mounted.model() // the Model after the last transition
await mounted.dispose() // waits for in-flight persists; the replica stays open
```

The optional `url` option routes the URL through the application:
`init(model, url)` reduces it into the Model before the first render,
`onUrlChange(url)` names the Message for every navigation, and `onUrlRequest`
the Message for a link click (omitted, the mount follows the link itself: an
internal one pushed, an external one loaded). A `foldkit-mirror` URL mirror
plugs in there as
`url: { init: (model, url) => Filters.reduce(model, url), onUrlChange: url => Message.UrlChanged({ url }) }`;
`subscriptions` and `resources` carry its write entry and the store layer.

`mounted.model`, `mounted.dispatch`, `mounted.subscribe`, and `mounted.observe`
are the host an agent binds to; `observe` reports every application Message the
runtime applies, which a capability with a `completion` contract needs. See
[docs/sync-runtime-binding.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/sync-runtime-binding.md) for what the
mount guarantees and why no Foldkit change is required.

The Model shows a durable edit at once, before the server has it. An agent that
must not report success until the server commits the edit waits on
`mounted.committed` instead, the shared slice as confirmed:

```ts
completion: Agent.when({
  source: mounted.committed,
  predicate: (shared, request) => shared.todos.some(todo => todo.id === request.id),
})
```

It completes after the exchange that commits the edit, and never for one the
server rejects. The agent learns nothing about cursors or operations.
`mounted.committed` is a source (`{ get, subscribe }`), not a Projection: it reads
the replica, not the Model, and tells subscribers after every exchange.

### Fragments

A large application declares one fragment per feature and composes them. `App`
below is a wider application than the quick start's: it also has a `members`
field and an `Invited` Message.

```ts
const AppSync = Sync.forApplication(App)
const Todos = AppSync.fragment({
  shared: Projection.pick(App.fields.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
})
const Members = AppSync.fragment({
  shared: Projection.pick(App.fields.members),
  durable: MessageSet.make(App, [Message.Invited]),
})
const Board = AppSync.make({
  documentId: DocumentId.make('board'),
  ...AppSync.compose(Todos, Members),
})
```

`compose` merges the shared projections and the durable subsets and infers the
merged shape. A field declared twice with a different codec, a Message declared
durable twice, or a fragment from another application throws. Two contracts
over the same field are a different mistake, which `Module.validate` reports.

### Authorization

Policy attaches to the contract per durable variant and compiles into the
journal contract, so the server applies it with no glue. This is the same
`Board` as above, with a principal fixed and one rule added:

```ts
const Authorized = Sync.forApplication(App).withPrincipal<{ readonly role: 'admin' | 'guest' }>()
const Board = Authorized.make({
  documentId: DocumentId.make('board'),
  ...Authorized.compose(Todos, Members),
  authorize: {
    // `message` is exactly `RenamedTodo`; `shared` is the authoritative snapshot.
    RenamedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && shared.todos.some(todo => todo.id === message.id),
  },
})
```

`Board.journalContract()` then carries the compiled rules in the shape
`makeJournal` takes. A durable variant without a rule is allowed; a key that is
not a durable tag is a compile error. The rule runs inside the append
transaction against the snapshot, so keep it synchronous and local. The client
does not run it: a replica has no principal, and a refused operation comes back
as a rejection.

### Lower level

`Sync.forApplication(App).make` compiles down to `Sync.define`, the protocol
primitive. Use `Sync.define` directly when there is no Foldkit application to
derive the contract from — a non-Foldkit client, or a hand-written projection.

```ts
import { Effect, Schema } from 'effect'
import { DocumentId, ReplicaId, Sync, type TransportClient } from 'foldkit-sync'

const Shared = Schema.Struct({ todos: Schema.Array(Schema.String) })
const Renamed = Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String })
declare const transport: TransportClient // the application's own server client

const Protocol = Sync.define({
  documentId: DocumentId.make('todos'),
  message: Renamed,
  shared: Shared,
  empty: { todos: [] },
  durable: () => true,
  replay: (shared, message) => ({ todos: [...shared.todos, message.title] }),
})

const program = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos-tab-1')
  const replica = yield* Protocol.openReplica(ReplicaId.make('tab-1'), storage)
  yield* replica.submit({ _tag: 'Renamed', title: 'Milk' })
  yield* Effect.provide(replica.synchronize, Sync.transport.fromPromise(transport))
  return yield* replica.shared
}).pipe(Effect.scoped)
```

## What it owns

- The Foldkit-facing contract (`Sync.forApplication(App).make`, optionally with
  a custom `replay`): derives the shared projection, the durable Message subset, the
  initial snapshot, and the journal contract from the application, so none is
  declared twice. `Projection.pick`/`Projection.compose` build the writable projection;
  `TodoSync.journalContract()` builds the durable codecs and reducer.
- The operation envelope: `replicaId:localSequence` identity, `baseCursor`, and
  protocol/schema versions. The contract's `codec` (`normalizeOperation`,
  `operationFrom`, `committedFrom`, `decodeExchange`) is there for a custom
  transport or server; a server-committed operation is a `CommittedOperation`.
- A persisted outbox and optimistic projection: a durable Message is visible
  immediately and rebased onto the authoritative order.
- Reconciliation: committed operations are replayed in order, acknowledged or
  refused pending entries are dropped, and a checkpoint replaces the compacted
  prefix. `replica.start` is the exchange loop: fork it to exchange once and then
  after every `submit`, with a transport failure recorded in `status.lastError`
  and retried on the next wake, so the application does not hand-roll it.
- A redacted status (`replica.status`): the pending count, the cursor, the last
  exchange failure, and the operations the server refused — enough for a UI to
  explain and recover without exposing Messages or the Model. `statusChanges` is
  the same status, emitted on subscribe and re-emitted after every submit and
  exchange. `changes` carries the status and the optimistic shared value together
  from one read, so a UI holds one subscription instead of two.
- Strict decoding: an operation is always validated with the application's
  Message schema, and a Message the contract does not call durable is refused.
- Branded positions: `Sequence` (a committed document position) and
  `LocalSequence` (a replica's own 1-based counter) cannot be confused, so a
  client counter is never passed where a committed position is expected.
- Presence (`Sync.presence.make`): an ephemeral, TTL'd peer registry,
  deliberately outside the durable log. A peer that stops refreshing is dropped, not
  replayed. It is an Effect driven by the `Clock` (so a `TestClock` makes the
  TTL deterministic), peers live in a `Ref`, and the channel is a `PubSub`.
  Every value is decoded through the required `decodeValue` before it is stored,
  so a hostile peer cannot inject a value your `Update` type does not describe.
  Presence can travel over a socket — `Sync.presence.socketChannel` on the
  client and `Sync.presence.serve` fanning through a `Sync.presence.hub` on the
  server — or in-process via `Sync.presence.loopbackChannel`.
  `presence.changes` is a `Stream` that emits the current peers and re-emits
  them on every change, alongside the `subscribe` callback.
- The transport seam (`Transport`): an Effect service with a loopback layer, a
  bridge to and from the promise client the replica speaks, and a WebSocket
  client layer. The socket reconnects on an exponential, jittered backoff and
  re-sends queued and in-flight frames with their original ids, so a lost reply
  is answered rather than dropped; retries (`maxRetries`) and the queue
  (`maxQueue`) are bounded, and `Sync.transport.serve` is the server side of a
  connection. A refusal is an exchange result; only a wire failure is a
  `TransportError`.

## Limits

- IndexedDB is the only storage adapter.
- It assumes an authoritative, single-writer-per-document server that orders
  operations; there is no peer-to-peer replication. Applications can opt individual
  fields into the specialized merge helper below.
- Binding the socket transport and presence server to a platform WebSocket
  server is left to the application; the sync example shows a `ws` one for the
  transport (presence over `ws` is not wired there yet).

## Last-writer-wins fields (experimental)

Use `Sync.lww.register` when a field's winner should depend on a write's
logical time instead of the order offline clients reconnect. It returns a schema and a pure
`merge` function to call inside the application's existing `update`:

```ts
import { Schema } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const Title = Sync.lww.register(Schema.String)
const Shared = Schema.Struct({ title: Title.schema })
const Renamed = Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Title.schema })

const update = (model: typeof Shared.Type, message: typeof Renamed.Type) => ({
  ...model,
  title: Title.merge(model.title, message.title),
})

const message: typeof Renamed.Type = {
  _tag: 'Renamed',
  title: { stamp: { counter: 1, replicaId: ReplicaId.make('tab-a') }, value: 'Milk' },
}
```

Higher `counter` wins; equal counters use lexicographic UTF-16 `replicaId`
order, independent of locale. This is logical ordering, not wall-clock time.
The rule follows the total-order register model described in
[Replicated Data Types: Specification, Verification, Optimality](https://www.microsoft.com/en-us/research/publication/replicated-data-types-specification-verification-optimality/).

Allocate stamps **before dispatch**, never in `update` or replay.
`Sync.lww.openClock` persists a counter independently of the outbox, so a
rejected or unsubmitted write cannot cause timestamp reuse after reload:

```ts
import { Effect } from 'effect'
import { DocumentId, ReplicaId, Sync, type Replica } from 'foldkit-sync'

type Shared = typeof Shared.Type
type Renamed = typeof Renamed.Type

const rename = (replica: Replica<Renamed, Shared>, title: string) =>
  Effect.gen(function* () {
    // A separate database from the replica's outbox; one clock per document/writer.
    const storage = yield* Sync.indexedDb('todos-tab-a-clock')
    const clock = yield* Sync.lww.openClock({
      documentId: DocumentId.make('todos'),
      replicaId: ReplicaId.make('tab-a'),
      storage,
    })
    const shared = yield* replica.shared
    const stamp = yield* clock.next(shared.title.stamp.counter)
    yield* replica.submit({ _tag: 'Renamed', title: { stamp, value: title } })
    yield* clock.close
  }).pipe(Effect.scoped)
```

`next(observedCounter)` returns only after persisting a counter greater than
both its saved value and the supplied observation. Pass the latest observed
counter for the field being edited; when causality spans several registers, pass
their maximum. Calling `next()` without an observation advances only the saved
local counter. The clock does not inspect application state.

Allocations on one handle are serialized. Separate handles use storage's
compare-and-swap check; a stale handle fails and must be closed and reopened.
Storage failures reject allocation without returning a stamp. Counter gaps after
a crash or failed submission are harmless. Counters are nonnegative safe
integers; exhaustion fails before writing. `close` waits for accepted
allocations and refuses new ones. Opening takes ownership of storage and closes
it on initialization failure too.

Keep the clock database across reloads and outbox resets. If it is lost or
deleted, use a fresh replica id instead of resetting the same writer's counter.
For applications that allocate stamps themselves, preserve this same durable
high-water mark, including refused writes.

A stamp identifies one immutable write within a register. Repeated delivery of
the same value is harmless; different values with the same stamp throw. Value
equality comes from the supplied schema. `merge` takes decoded values, while
the Message and shared-state schemas perform validation at the normal sync
boundaries. Transforming value codecs retain both their encoded and decoded
types.

Keep the **whole register**, including the winning stamp, in shared snapshots.
For deletion, `Sync.lww.register(Schema.NullOr(Entity))` can retain a `null`
tombstone: dropping its stamp would allow an old offline write to resurrect the
value. A newer write may intentionally replace that tombstone.

The journal still orders and authorizes every operation, including losing writes.
Replica ids and counters in Messages are client-authored data, not authenticated
identity. Applications must enforce writer ownership and clock policy at admission
where needed. A losing write can still trigger a Command if the application's
update produces one; this helper only resolves state.

These helpers do not claim arbitrary Messages commute. Specialized sets,
counters, and collaborative text remain future work.

## Older spellings

`Sync` groups this package's exports; it does not wrap them. Every name is still
exported on its own with the same signature, so code written against the older
spellings keeps working:

- `forApplication`, `mount`, `indexedDb` — same names on the namespace.
- `defineSync` is `Sync.define`; `syncMetrics` is `Sync.metrics`.
- `layerSocket`, `layerLoopback`, `layerFromPromise`, `toPromise`, `serveSocket`
  and `nativeSocket` are `Sync.transport.socket`, `.loopback`, `.fromPromise`,
  `.toPromise`, `.serve` and `.nativeSocket`.
- `createPresence`, `createPresenceHub`, `servePresence`,
  `socketPresenceChannel` and `loopbackPresenceChannel` are
  `Sync.presence.make`, `.hub`, `.serve`, `.socketChannel` and
  `.loopbackChannel`.
- `lwwRegister` and `openLwwClock` are `Sync.lww.register` and
  `Sync.lww.openClock`.
- `documentId('todos')` and `DocumentId.make('todos')` return the same value,
  and likewise for `replicaId`, `opId`, `sequence` and `localSequence`.

## See also

- [Replicated state](https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md) — the mental model, and
  when not to use it.
- [Runtime binding](https://github.com/doeixd/foldkit-plus/blob/main/docs/sync-runtime-binding.md) — what
  `Sync.mount` guarantees, and why no Foldkit change is required.
- [`foldkit-durable`](https://github.com/doeixd/foldkit-plus/tree/main/packages/durable) — the server half; [`foldkit-mirror`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mirror) plugs into the mount's
  `url` option.
- [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) — two fragments, owner-only rules, and a browser mount;
  [`examples/sync`](https://github.com/doeixd/foldkit-plus/tree/main/examples/sync) is the in-process trace.
