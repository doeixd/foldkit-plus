# `foldkit-sync`

Local-first replication for part of a Foldkit application.

A durable edit applies locally immediately, is persisted to an outbox, and is
sent when the network allows. The server decides the authoritative order. The
replica then replays that committed order and rebases any still-pending local
edits on top.

The important part is what **does not** change: your application's `Model`,
`Message`, and `update` remain the state machine. Sync does not introduce a
second reducer. You declare which Model slice is shared and which existing
Messages are durable; Sync derives replay, persistence, protocol codecs, and the
server journal contract from that declaration.

> **Sync turns a subset of your existing Foldkit Messages into durable
> operations. They still run through your normal `update`; Sync adds persistence,
> optimistic replay, server ordering, and reconciliation around them.**

**Use it when** a user should keep editing offline, the edit must survive a
reload or network failure, and several replicas must eventually converge under
one authoritative server order. **Do not use it for** server-owned disposable
facts — use [`foldkit-remote`](../remote) for those — or for peer-to-peer / CRDT
replication where every peer independently accepts writes.

It is the client half of [replicated Foldkit state](../../docs/replication.md).
[`foldkit-durable`](../durable) is an optional server-side ordered journal.

## Which state belongs in Sync?

A useful ownership rule is:

| State | Owner |
| --- | --- |
| Route, selected tab, transient errors | ordinary local `Model` / `update` |
| Server-owned data the client may refetch | `foldkit-remote` |
| Client-authored state that must survive offline and converge | `foldkit-sync` |
| Authoritative server ordering, idempotent append, snapshots | `foldkit-durable` |

The difference between Remote and Sync is especially important:

```text
Remote
server owns the fact
client caches it
refetch is recovery

Sync
client creates the durable operation
operation must survive offline
replay + reconciliation is recovery
```

A Surface may read local state, Remote state, and Sync-owned state at the same
time. Those observation boundaries do not change who owns each datum.

## The replica mental model

A replica has two pieces of state:

```text
authoritative committed snapshot
              +
pending local operations
              =
optimistic shared state the UI sees
```

If the server has committed `A B C` and this device has pending `D E`:

```text
server order:   A  B  C
local pending:           D  E

visible state = replay(A, B, C, D, E)
```

If another device gets operation `X` committed before this replica's pending
work, the next exchange may produce:

```text
new server order: A  B  C  X
local pending:                D  E

new visible state = replay(A, B, C, X, D, E)
```

The local edit never needed to wait for that exchange to appear. Reconciliation
changes the base underneath it and replays the still-pending operations on top.

The full lifecycle of one durable Message is:

```text
user dispatches durable Message
            |
            v
replay through application update immediately
            |
            v
persist operation in local outbox
            |
            v
optimistic state is visible now
            |
       network later
            v
server assigns authoritative order
            |
            v
replica adopts committed operations / checkpoint
            |
            v
drop acknowledged or rejected pending operations
            |
            v
replay remaining pending operations on the new base
```

That is the core of `foldkit-sync`. Transport, browser mounting, presence, and
LWW fields are layers around this mechanism.

## Install

```bash
pnpm add foldkit-sync
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the
package.

## Sixty seconds: choose what is shared and what is durable

Start with an ordinary Foldkit application:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

const Model = Schema.Struct({
  todos: Schema.Array(
    Schema.Struct({ id: Schema.String, title: Schema.String }),
  ),
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

const initial: Model = {
  todos: [],
  selectedTodoId: null,
  lastError: null,
}

type Return = Update.Return<Model, Message>

// This is still the application's one transition function.
const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    RenamedTodo: ({ id, title }) => ({
      model: {
        ...model,
        todos: model.todos.map(todo =>
          todo.id === id ? { ...todo, title } : todo,
        ),
      },
    }),
    SelectedTodo: ({ id }) => ({
      model: { ...model, selectedTodoId: id },
    }),
  })

const App = Surface.application({ Model, Message, initial, update })

const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),

  // This slice of Model is replicated.
  // The writable Projection lets Sync install checkpoints/reconciled state back
  // into the application Model without owning a second copy of the schema.
  shared: Projection.pick(App.fields.todos),

  // Only these existing Messages become durable operations.
  durable: MessageSet.make(App, [
    Message.CreatedTodo,
    Message.RenamedTodo,
  ]),
})
```

Read that declaration as:

```text
Model
  todos             -> shared / replicated
  selectedTodoId    -> local only
  lastError         -> local only

Messages
  CreatedTodo       -> durable
  RenamedTodo       -> durable
  SelectedTodo      -> local only
```

`Sync.forApplication(App)` derives the shared schema, initial shared snapshot,
replay function, operation codecs, and server journal contract from the same
application declaration. There is no parallel sync-specific version of
`update` to keep aligned.

## What makes a Message durable?

A durable Message must be something another machine can replay later and obtain
the same shared state.

In practice that means it must be a deterministic, state-only transition of the
shared projection.

Derived replay protects that boundary. It refuses a durable Message when the
application's `update`:

- returns a Command — a live external effect cannot be replayed later; or
- changes a field outside the shared projection — that change would disappear
  when only the shared slice is persisted/replayed.

For example:

```text
RequestedChargeCard
  -> runs a Command / talks to a provider
  -> local intent, NOT durable

CardCharged
  -> pure fact about state
  -> durable and replayable
```

A common pattern is therefore:

```text
local intent Message
      |
      v
Command / nondeterministic work
      |
      v
durable fact Message
```

Replay runs the durable fact through the same application `update` on every
replica. If an application genuinely needs different replay semantics, `make`
accepts a custom `replay`, but that custom replay does not get the derived
guardrails.

## Running a replica

The low-level runtime is a `Replica`. It owns the local outbox, committed shared
snapshot, cursor, optimistic projection, and synchronization state.

```ts
import { Effect } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const program = Effect.gen(function* () {
  // One durable storage identity per document + replica/writer.
  const storage = yield* Sync.indexedDb('todos/tab-1')

  const replica = yield* TodoSync.openReplica(
    ReplicaId.make('tab-1'),
    storage,
  )

  // submit validates/replays first, then persists the operation in the outbox.
  yield* replica.submit(
    Message.CreatedTodo({ id: 't1', title: 'Milk' }),
  )

  // This already includes the pending operation. No server round trip required.
  const optimistic = yield* replica.shared

  return optimistic
}).pipe(Effect.scoped)
```

`replica.submit(message)` does not mean “send this now.” It means:

1. verify the Message is valid and durable;
2. replay it against the current optimistic shared state;
3. assign a stable local operation identity;
4. persist it to the local outbox;
5. make the new optimistic projection observable; and
6. wake the exchange loop if one is running.

A Message replay rejects never enters the outbox.

## Optimistic state and rebasing

Internally the replica keeps:

```text
committed
  the authoritative shared snapshot up to cursor N

pending
  locally-authored operations not yet resolved by the server
```

The value returned by `replica.shared` is:

```text
pending.reduce(replay, committed)
```

That simple rule gives optimistic UI and reconciliation the same semantics.
There is no special “optimistic reducer.”

When synchronization advances the committed base, Sync removes pending
operations that became committed, were explicitly acknowledged, or were
rejected, then the remaining outbox is replayed over the new committed state.

This also explains why durable Messages have to be replay-safe: a pending
operation may run many times as the authoritative base changes beneath it.

## Synchronization

A replica exchanges two things with the server:

```text
request
  current cursor
  pending operations

response
  newly committed operations
  acknowledgements
  rejections
  optional checkpoint
```

`replica.synchronize` performs one exchange through the `Transport` Effect
service:

```ts
const once = replica.synchronize.pipe(
  Effect.provide(Sync.transport.socket({ url: 'wss://example.com/sync' })),
)
```

`replica.start` is the long-running convenience loop. It exchanges once, then
wakes after every submit. Transport failures are recorded in
`status.lastError`; the loop survives and retries on the next wake.

```ts
Effect.runFork(
  Effect.provide(
    replica.start,
    Sync.transport.socket({ url: 'wss://example.com/sync' }),
  ),
)
```

The transport does not decide reconciliation. It only carries the exchange;
the replica validates the response and applies the protocol rules.

### Acknowledgements

An acknowledgement says an operation the replica sent is durably accepted, so
it may leave the outbox even if its committed payload is not repeated in this
response.

### Rejections

A rejection says the optimistic operation did not commit. Sync removes it from
the pending set and recomputes the optimistic state from the authoritative base
plus whatever pending operations remain.

```text
before response
committed: A B C
pending:             D E
visible:   A B C D E

server rejects D

committed: A B C
pending:               E
visible:   A B C E
```

`replica.status.rejected` keeps recent rejected operation ids so the UI can
explain that an optimistic edit was refused.

### Checkpoints

A server may compact old history. If the replica is too far behind to replay the
missing prefix, the response can include a checkpoint:

```text
checkpoint = authoritative shared snapshot + cursor
```

The replica adopts the checkpoint as its committed base, then rebases its local
pending operations on top. A checkpoint behind the replica's current cursor is
rejected with `CheckpointRegressionError` rather than silently moving history
backwards.

## Replica status and UI state

The public replica surface deliberately exposes enough state for UI and recovery
without exposing the application Messages themselves:

```ts
const status = yield* replica.status
// {
//   pending: number,
//   cursor: Sequence,
//   lastError: string | undefined,
//   rejected: ReadonlyArray<OpId>
// }
```

`replica.statusChanges` emits that status initially and after every submit and
exchange. `replica.changes` emits the status and optimistic `shared` value
together from one replica snapshot, so a UI can subscribe once without racing
two separate reads.

## Sync + Durable

Sync owns **client replication semantics**. Durable can own **server ordering and
persistence**.

```text
client
-----------------------------------------------
Foldkit update
      |
      | durable Message
      v
foldkit-sync Replica
  optimistic shared state
  persistent outbox
      |
      | exchange
      v
-----------------------------------------------
server
foldkit-durable Journal
  authoritative order
  snapshot + cursor
      |
      v
committed operations / checkpoint / rejection
```

The same Sync contract produces the server journal contract, so the two halves
do not duplicate the Message codec, shared schema, initial snapshot, or replay
reducer:

```ts
import { Effect } from 'effect'
import { ActorId, DocumentId, Journal, OpId } from 'foldkit-durable'

type Principal = { readonly actorId: string }

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    // Derived from the same Foldkit application + Sync declaration:
    // operation codec, snapshot codec, empty shared value, replay, and
    // compiled authorization rules when present.
    ...TodoSync.journalContract(),

    file: 'todos.sqlite',
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.scoped)
```

The packages are intentionally separable. A custom server may implement the
exchange without Durable, and Durable can journal a protocol that did not come
from Sync.

## Mounting the full Foldkit application

The raw Replica works with the **shared slice**. `Sync.mount` is the Foldkit
runtime integration that connects that replica back to the whole application
Model.

A mounted durable Message:

```text
dispatch Message
      |
      v
application update immediately
      |
      +--> local fields / render
      |
      v
persist durable Message through replica
      |
exchange changes shared state later
      v
install reconciled shared slice back into Model
```

So the UI still runs one application reducer. Sync does not replace the runtime
with a second state machine.

```ts
import { Effect, Scope } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const container = document.getElementById('app')!

const scope = Effect.runSync(Scope.make())
const storage = Effect.runSync(
  Effect.provideService(
    Sync.indexedDb('todos/tab-1'),
    Scope.Scope,
    scope,
  ),
)
const replica = Effect.runSync(
  TodoSync.openReplica(ReplicaId.make('tab-1'), storage),
)

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
  onPersistenceFailure: (model, error) => ({
    ...model,
    lastError: error.message,
  }),
})

Effect.runFork(
  Effect.provide(
    replica.start,
    Sync.transport.socket({ url: 'wss://example.com/sync' }),
  ),
)

mounted.dispatch(
  Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }),
)

mounted.model()
await mounted.dispose()
```

`dispose()` waits for in-flight persists started by the mount; the Replica itself
remains separately owned and must be closed with its scope/lifecycle.

### URL, Mirror, and agents

The optional `url` option routes navigation through the application:

- `init(model, url)` reduces the initial URL before the first render;
- `onUrlChange(url)` maps browser navigation back to a Message;
- `onUrlRequest` optionally maps link requests to a Message.

A `foldkit-mirror` URL mirror plugs into that seam without becoming another
state owner.

The mounted host also exposes `model`, `dispatch`, `subscribe`, and `observe`.
Agent runtimes bind to those same capabilities; `observe` reports application
Messages the runtime applies, including the completion facts an agent capability
may wait for. See [runtime binding](../../docs/sync-runtime-binding.md).

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

## Fragments: compose one document from features

Large applications do not need one giant Sync declaration. Declare feature
fragments and compose them into one document:

```ts
const AppSync = Sync.forApplication(App)

const Todos = AppSync.fragment({
  shared: Projection.pick(App.fields.todos),
  durable: MessageSet.make(App, [
    Message.CreatedTodo,
    Message.RenamedTodo,
  ]),
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

`compose` merges the shared projections and durable Message subsets. It rejects
incompatible duplicate field declarations, duplicate durable variants, and
fragments from another application. `Module.validate` catches the separate
architectural mistake of two contracts claiming the same field ownership.

## Authorization and optimistic rejection

Authorization belongs on the Sync contract because it is policy over a durable
Message against the authoritative shared snapshot. The rule compiles into
`journalContract()` and is enforced by the server journal — not trusted to the
client.

```ts
const Authorized = Sync.forApplication(App)
  .withPrincipal<{ readonly role: 'admin' | 'guest' }>()

const Board = Authorized.make({
  documentId: DocumentId.make('board'),
  ...Authorized.compose(Todos, Members),
  authorize: {
    RenamedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' &&
      shared.todos.some(todo => todo.id === message.id),
  },
})
```

A durable variant without a rule is allowed. A key that is not one of the
contract's durable Message variants is a type error.

The client does not run authorization. It may optimistically show the edit;
when the server refuses it, reconciliation drops that pending operation and
rebases the remaining ones. This is why rejection is a normal exchange result,
not a transport failure.

## Persistence and recovery

The local outbox is part of the feature, not an incidental cache. Losing it can
lose edits that never reached the server.

The built-in browser storage adapter is IndexedDB:

```ts
const storage = yield* Sync.indexedDb('todos/tab-1')
```

Stored replica state includes protocol/schema versions, document/replica
identity, cursor, committed snapshot, local sequence, and pending operations.
Persisted and remote operations are decoded strictly against the application
Message Schema.

Important recovery cases:

- **Storage absent or evicted.** The replica starts at cursor 0 and can catch up
  from the server, but edits that existed only in the lost outbox are gone.
- **Two writers use one replica storage.** Compare-and-swap detects the stale
  writer. Give each tab/writer its own replica/storage identity.
- **Replay refuses a Message.** `submit` fails and writes nothing, so invalid
  durable work never enters the outbox.
- **Malformed stored data.** Opening fails rather than silently replacing bytes;
  the application can offer an explicit reset/recovery path.
- **Unsupported storage version.** `UnsupportedReplicaVersionError` names the
  persisted and supported versions so migration/reset can be explicit.
- **Server compaction.** A checkpoint replaces history the replica can no longer
  replay and pending local work is rebased on it.

Application Message/shared-state migrations remain application policy; Sync
versioning protects its own persisted envelope.

## Transport

`Transport` is an Effect service for the one exchange operation. Sync ships
helpers under `Sync.transport`:

```text
Sync.transport.socket(...)
Sync.transport.loopback(...)
Sync.transport.fromPromise(...)
Sync.transport.toPromise(...)
Sync.transport.serve(...)
Sync.transport.nativeSocket(...)
```

The reconnecting socket transport uses bounded retries/queueing, exponential
jittered backoff, and keeps request identities stable when resending queued or
in-flight exchanges. A server rejection is protocol data; only a wire failure is
a `TransportError`.

Transport is deliberately below reconciliation. A custom transport can carry
the same exchange without changing replica semantics.

## Presence: ephemeral collaboration state

Presence is intentionally **not** a durable Message log. “Alice is viewing this
page” or a cursor position should expire when the peer disappears, not replay
next week.

`Sync.presence.make` creates a TTL'd peer registry. Values are decoded before
they enter the registry; a peer that stops refreshing is removed. Changes are
available both as a callback subscription and as a Stream.

Presence can travel through:

```text
Sync.presence.socketChannel(...)
Sync.presence.loopbackChannel(...)
```

with server fan-out through:

```text
Sync.presence.hub(...)
Sync.presence.serve(...)
```

The registry uses Effect's `Clock`, so `TestClock` can make TTL behavior
deterministic in tests.

The conceptual rule is simple:

```text
shared application fact that must replay later -> durable Message / Sync
peer status that should disappear when stale   -> Presence
```

## Last-writer-wins fields (experimental)

Server arrival order is the default conflict rule: whichever operation the
server commits first is replayed first. Sometimes one field needs a different
rule — for example, the newest logical title write should win even if an offline
device reconnects later.

`Sync.lww.register` supplies a schema and pure merge rule for that specialized
case. It is a field-level helper, **not a general CRDT mode for arbitrary
Messages**.

```ts
import { Schema } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const Title = Sync.lww.register(Schema.String)
const Shared = Schema.Struct({ title: Title.schema })
const Renamed = Schema.Struct({
  _tag: Schema.Literal('Renamed'),
  title: Title.schema,
})

const update = (
  model: typeof Shared.Type,
  message: typeof Renamed.Type,
) => ({
  ...model,
  title: Title.merge(model.title, message.title),
})

const message: typeof Renamed.Type = {
  _tag: 'Renamed',
  title: {
    stamp: { counter: 1, replicaId: ReplicaId.make('tab-a') },
    value: 'Milk',
  },
}
```

Higher `counter` wins; equal counters use lexicographic UTF-16 `replicaId`
order, independent of locale. This is logical ordering, not wall-clock time.
The rule follows the total-order register model described in
[Replicated Data Types: Specification, Verification, Optimality](https://www.microsoft.com/en-us/research/publication/replicated-data-types-specification-verification-optimality/).

Allocate stamps **before dispatch**, never inside `update` or replay.
`Sync.lww.openClock` persists the high-water mark independently of the outbox,
so rejected or never-submitted writes cannot cause timestamp reuse after reload:

```ts
import { Effect } from 'effect'
import { DocumentId, ReplicaId, Sync, type Replica } from 'foldkit-sync'

type Shared = typeof Shared.Type
type Renamed = typeof Renamed.Type

const rename = (replica: Replica<Renamed, Shared>, title: string) =>
  Effect.gen(function* () {
    const storage = yield* Sync.indexedDb('todos-tab-a-clock')
    const clock = yield* Sync.lww.openClock({
      documentId: DocumentId.make('todos'),
      replicaId: ReplicaId.make('tab-a'),
      storage,
    })

    const shared = yield* replica.shared
    const stamp = yield* clock.next(shared.title.stamp.counter)

    yield* replica.submit({
      _tag: 'Renamed',
      title: { stamp, value: title },
    })

    yield* clock.close
  }).pipe(Effect.scoped)
```

`next(observedCounter)` persists a counter greater than both its previous saved
value and the supplied observation before returning the stamp. Pass the latest
observed counter for the field being edited; if causality spans several
registers, pass their maximum. Calling `next()` without an observation advances
only the saved local counter.

Allocations on one handle are serialized. Separate handles use storage's
compare-and-swap check; a stale handle fails and should be closed/reopened.
Storage failures do not return a stamp. Counter gaps after a crash or rejected
submission are harmless.

Keep the clock storage across reloads and outbox resets. If it is lost, use a
fresh `ReplicaId` rather than reusing the same writer identity from counter zero.

A stamp identifies one immutable write within a register. Repeated delivery of
the same value is harmless; a different value with the same stamp throws. Keep
the **whole register, including its winning stamp**, in shared snapshots. For
deletion, a nullable register can retain a stamped `null` tombstone so an old
offline write cannot resurrect deleted state.

The server still orders and authorizes every operation, including writes that
lose the LWW merge. Replica ids and counters carried in Messages are
client-authored data, not authenticated identity; enforce writer/clock policy at
admission when needed.

Specialized sets, counters, collaborative text, and arbitrary commutative
Messages remain outside this helper.

## Lower level: `Sync.define`

`Sync.forApplication(App).make(...)` is the Foldkit-facing compiler. It builds
on `Sync.define`, the lower-level protocol primitive.

Use `Sync.define` directly when there is no Foldkit application to derive the
contract from — for example, a non-Foldkit client or a hand-written shared
projection:

```ts
import { Effect, Schema } from 'effect'
import {
  DocumentId,
  ReplicaId,
  Sync,
  type TransportClient,
} from 'foldkit-sync'

const Shared = Schema.Struct({ todos: Schema.Array(Schema.String) })
const Renamed = Schema.Struct({
  _tag: Schema.Literal('Renamed'),
  title: Schema.String,
})

declare const transport: TransportClient

const Protocol = Sync.define({
  documentId: DocumentId.make('todos'),
  message: Renamed,
  shared: Shared,
  empty: { todos: [] },
  durable: () => true,
  replay: (shared, message) => ({
    todos: [...shared.todos, message.title],
  }),
})

const program = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos-tab-1')
  const replica = yield* Protocol.openReplica(
    ReplicaId.make('tab-1'),
    storage,
  )

  yield* replica.submit({ _tag: 'Renamed', title: 'Milk' })

  yield* Effect.provide(
    replica.synchronize,
    Sync.transport.fromPromise(transport),
  )

  return yield* replica.shared
}).pipe(Effect.scoped)
```

Most Foldkit applications should prefer `Sync.forApplication`: it keeps the
shared schema and replay semantics derived from the application rather than
re-declaring them.

## What Sync owns

- **The replication contract.** Shared projection, durable Message subset,
  initial shared value, replay, operation codecs, and `journalContract()`.
- **The replica.** Persisted outbox, committed base, cursor, optimistic shared
  projection, local operation sequence, synchronization, status, and recovery
  validation.
- **Reconciliation.** Adopt committed operations/checkpoints, drop
  acknowledged/rejected pending operations, and replay what remains.
- **The transport seam.** Effect `Transport` plus loopback/promise/WebSocket
  adapters; transport carries exchanges but does not own conflict semantics.
- **Optional collaboration primitives.** Ephemeral Presence and the specialized
  LWW register/clock helpers.

Sync does **not** own:

- unrelated local Model fields;
- server-derived disposable caches (`foldkit-remote`);
- authoritative server storage/order (`foldkit-durable` or your own server);
- peer-to-peer CRDT convergence;
- application Message/shared-state migrations.

## Limits

- IndexedDB is the built-in storage adapter today.
- Sync assumes an authoritative server order for each document; it is not a
  peer-to-peer replication protocol.
- Ordinary concurrent writes resolve by that server order. `Sync.lww.register`
  changes the merge rule for individual fields only; it does not make arbitrary
  Messages commutative.
- There is no operational transform / collaborative text algorithm.
- Binding the socket transport and presence server to a platform WebSocket
  server remains application/platform glue. The sync example demonstrates a
  `ws` transport binding; presence over that server is not wired there today.
- Application schema migration remains application policy. Sync versions and
  validates its own persisted/wire envelope.

## Older spellings

`Sync` groups the package exports; it does not wrap them. Existing top-level
spellings remain available with the same signatures:

- `forApplication`, `mount`, `indexedDb` — same names on the namespace;
- `defineSync` -> `Sync.define`; `syncMetrics` -> `Sync.metrics`;
- `layerSocket`, `layerLoopback`, `layerFromPromise`, `toPromise`, `serveSocket`,
  `nativeSocket` -> `Sync.transport.socket`, `.loopback`, `.fromPromise`,
  `.toPromise`, `.serve`, `.nativeSocket`;
- `createPresence`, `createPresenceHub`, `servePresence`,
  `socketPresenceChannel`, `loopbackPresenceChannel` -> `Sync.presence.make`,
  `.hub`, `.serve`, `.socketChannel`, `.loopbackChannel`;
- `lwwRegister`, `openLwwClock` -> `Sync.lww.register`, `Sync.lww.openClock`;
- `documentId('todos')` and `DocumentId.make('todos')` produce the same branded
  value, and likewise for `replicaId`, `opId`, `sequence`, and
  `localSequence`.

## See also

- [Replicated state](../../docs/replication.md) — Sync and Durable together,
  including the server exchange and recovery model.
- [Runtime binding](../../docs/sync-runtime-binding.md) — what `Sync.mount`
  guarantees and why no Foldkit core change is required.
- [`foldkit-durable`](../durable) — the authoritative server journal commonly
  paired with Sync.
- [`foldkit-remote`](../remote) — server-owned disposable state rather than
  client-authored durable state.
- [`examples/todo-app`](../../examples/todo-app) — browser mount, fragments,
  authorization, Mirror, and agent integration.
- [`examples/sync`](../../examples/sync) — focused replica/server/transport trace.
