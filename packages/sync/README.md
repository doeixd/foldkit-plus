# `foldkit-sync`

Local-first replication for part of a Foldkit application.

You name a slice of the Model that several devices share, and the existing
Messages that change it. From then on an edit applies at once, is saved in a
local outbox, reaches the server when the network allows, and lands in the same
order on every device. Nothing about the application changes shape: `Model`,
`Message`, and `update` stay the one state machine. Sync wraps them; it never
adds a second reducer.

> **A durable Message is one of your existing Messages, recorded.** It still
> runs through your `update`. Sync adds the outbox, the optimistic view, the
> exchange with the server, and the rebase when the server's answer arrives.

It is the client half of [replicated Foldkit state](../../docs/replication.md).
[`foldkit-durable`](../durable) is the server half, an ordered journal on
SQLite. Either works without the other.

## Is this the right package?

| The state | Owner | Use |
| --- | --- | --- |
| A route, a selection, a transient error | the local Model | plain Foldkit |
| Facts the server owns and the client may refetch | the server | [`foldkit-remote`](../remote) |
| Edits the user makes that must survive offline and converge | the durable log | **`foldkit-sync`** |
| The authoritative order and snapshot on the server | the server journal | [`foldkit-durable`](../durable) |

The Remote and Sync line is the one worth memorizing. Remote caches a fact the
server owns, so refetching is recovery. Sync records an edit the user authored,
so the outbox is user data and replay is recovery.

Sync assumes one server order per document. It is not peer-to-peer and not a
CRDT; every peer accepting writes without a server is a different design.

## The model in one equation

```text
what the user sees = committed snapshot + pending local edits, replayed
```

The server has committed `A B C`; this device has typed `D E` since:

```text
server:    A  B  C
pending:            D  E
visible:   replay(A, B, C, D, E)
```

Another device gets `X` in before `D` reaches the server. After the next
exchange:

```text
server:    A  B  C  X
pending:               D  E
visible:   replay(A, B, C, X, D, E)
```

`D` and `E` never waited. The base moved underneath them and they were replayed
on top. That one move, **rebase**, is also how a rejection rolls back: drop the
rejected edit from `pending` and replay the rest.

An edit passes three milestones, and each means something different:

| Milestone | Where | What it proves |
| --- | --- | --- |
| **visible** | the Model, at once | nothing yet: the user saw it |
| **saved** | the local outbox | a reload or a dropped connection cannot lose it |
| **committed** | the server journal | every other device will see it in this order |

A UI that says "saved" should read the second, and one that says "shared"
the third. Both are observable; see [what to show the user](#what-to-show-the-user).

## Install

```bash
pnpm add foldkit-sync
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the
package. The browser storage is IndexedDB. The server needs
[`foldkit-durable`](../durable) or your own implementation of
[the exchange](#the-exchange).

## Sixty seconds: say what is shared

Start from an ordinary application. The example keeps a todo list and a
selection; only the list is shared.

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
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
  RenamedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
type Message = typeof Message.Type

const initial: Model = { todos: [], selectedTodoId: Option.none(), lastError: Option.none() }

type Return = Update.Return<Model, Message>

const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: modifyFields(model, { todos: () => [...model.todos, { id, title }] }),
    }),
    RenamedTodo: ({ id, title }) => ({
      model: modifyFields(model, {
        todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      }),
    }),
    SelectedTodo: ({ id }) => ({
      model: modifyFields(model, { selectedTodoId: () => Option.some(id) }),
    }),
  })

const App = Surface.application({ Model, Message, initial, update })

const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
})
```

Read the declaration as a table:

```text
todos            shared     replicated, persisted, journaled
selectedTodoId   local      this device only
lastError        local

CreatedTodo      durable    recorded in the outbox, committed by the server
RenamedTodo      durable
SelectedTodo     local      runs through update and goes nowhere
```

From that, `make` derives the shared codec, the initial shared value, the
operation envelope, replay (your `update` on the shared slice), and the
server's [journal contract](#the-server). You write none of them.

`TodoSync` is a value. It has opened no storage, connected to nothing, and
rendered nothing. The next section does that.

## Run it in the browser

Three steps: open storage and a replica, mount the application over it, start
the exchange loop.

```ts
import { Effect, Scope } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const container = document.getElementById('app')!

// One IndexedDB database per document and tab; its connection lives for the page.
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
    body: h.ul([], model.todos.map(todo => h.li([], [todo.title]))),
  }),
  onPersistenceFailure: (model, error) =>
    modifyFields(model, { lastError: () => Option.some(error.message) }),
})

Effect.runFork(
  Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })),
)

mounted.dispatch(Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }))
```

What each call does, and does not do:

- **`Sync.indexedDb(name)`** opens one database. Name it by document and
  writer: two tabs on one name race, and the loser fails its write rather than
  merging two histories.
- **`openReplica(id, storage)`** reads back the committed snapshot, cursor, and
  outbox saved last time, or starts empty. It does no network I/O.
- **`Sync.mount(App, TodoSync, …)`** runs the ordinary Foldkit runtime with
  your `view` and `update`. A durable Message applies through `update` at once,
  then a Command persists it; if the persist fails, the edit is reverted and
  `onPersistenceFailure` says so in the Model. A local Message is untouched.
- **`replica.start`** is the exchange loop: once now, then after every submit
  and every notice from the server. A failed exchange is retried on a backoff
  from 0.5 s to 30 s, or at once on the next edit. The loop never fails; it
  reports through `status`.
- **`mounted.dispatch`** sends a Message the way a view does. The container
  must have an `id`, or `mount` throws.

Reload the page: the todos come back from the outbox and the committed
snapshot, the selection does not. That is the shared/local line, visible.

`mounted` also exposes `model()`, `subscribe`, `observe`, `committed`,
`settled()`, and `dispose()`, which waits for in-flight persists and leaves the
replica open. `settled()` resolves once the Model has caught up with the
replica: every dispatched Message applied, no persist unanswered, and every
replica status applied. It waits for no frame and no I/O, so a test pairs it
with `Frames.track` from `foldkit-mixins/testing`: `await
frames.settle(mounted)`.
Close the replica with its own scope.

## The server

The server answers the exchange: it takes a cursor and pending operations,
commits what it accepts, and returns what the replica is missing. With
`foldkit-durable`, the same contract supplies the journal's codecs, empty
snapshot, reducer, and any [authorization](#authorize-on-the-server):

```ts
import { Effect } from 'effect'
import { ActorId, Journal, OpId } from 'foldkit-durable'
import type { SocketLike } from 'foldkit-sync'
import { serveJournal } from 'foldkit-sync/journal'

type Principal = { readonly actorId: string }

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    ...TodoSync.journalContract(),
    file: 'todos.sqlite',
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })
  // One accepted socket, as the principal its authentication established.
  return (socket: SocketLike, principal: Principal) =>
    serveJournal(socket, { sync: TodoSync, journal, principal })
})
```

`foldkit-sync/journal` is the exchange over the journal (`foldkit-durable`,
an optional peer of this package):

- **`serveJournal(socket, options)`** answers one socket's exchanges and sends
  a notice after each commit, so its replica hears of others' edits.
  `journalExchange(options)` is the same exchange as a `TransportClient`, for
  `Sync.transport.fromPromise` in process; `journalChanges` the notice alone.
- **What cannot be taken is rejected by its id, not left to fail the
  exchange.** An operation whose message does not decode, that names another
  document, that `authorize` or `validate` refuses, or that reuses an id for
  other content fails the same way on every retry, so the replica drops it
  and the edits behind it still go. Only an entry with no id, a cursor ahead
  of the journal's, or the journal failing fails the exchange.
- **`refuse(operation)`** rejects before the journal reads it, by what the
  transport established (a principal that may only read); a rule about the
  document belongs in `authorize`.
- **`settle`** runs after each exchange's appends: apply what committed to
  another store, through `journal.recover`. It runs every exchange, so a
  write that failed is tried again.
- The reply carries what committed since the cursor, a page at a time
  (`limit`, `more`), a checkpoint when that history was compacted, and the
  journal's epoch: a replica of a reset journal is answered from the start.

[The replicated state guide](../../docs/replication.md#3-the-server-an-exchange-over-the-journal)
says why each rule is there, and [`examples/sync`](../../examples/sync) writes
the exchange by hand, with an effect policy per committed operation.

A server that is not Durable implements the same [exchange](#the-exchange).

## What makes a Message durable

Replay runs a durable Message through `update` on another machine, later,
possibly many times as the base beneath it moves. So it has to be a
deterministic, state-only transition of the shared slice. `make` derives replay
from `update` and refuses a durable Message whose transition:

- returns a Command, because an effect cannot be replayed; or
- changes a field outside `shared`, because that change would be lost.

A refused Message fails `submit` with `ReplayError` and writes nothing, so a
mistake shows on the first edit instead of as diverging replicas later.

The consequence is a pattern you will use everywhere: **an intent mints, a fact
records**.

```text
RequestedTodo { title }          local: its update returns a Command
      |                          that reads the clock and mints an id
      v
CreatedTodo { id, title, at }    durable: pure over the shared slice
```

Put every nondeterministic input (ids, timestamps, the result of a provider
call) *inside* the fact. `update` for the fact only applies it.

When the intent needs nothing outside the Model, say an id from a counter in
the shared slice, return the fact as `Sync.fact(message)` instead of an
ordinary Command. The mount applies it in the intent's own transition, before
any later Message, so two intents dispatched together cannot read the same
counter. Outside the mount it is an ordinary Command.

A durable `update` should also be idempotent where a retry could deliver one
operation twice, as in `CreatedTodo` ignoring an id it already holds.

## What to show the user

The three milestones each have a reader.

**Visible** is the Model. Nothing to do.

**Saved** is the persist. `onPersistenceFailure` runs when it fails, after the
edit has been reverted; the Model it returns is what the user sees next. The
error names why: `ReplayError` for a Message that cannot be durable,
`StorageError` for IndexedDB.

**Committed** is the replica's status:

```ts
const status = yield* replica.status
// { pending: number, cursor: Sequence, lastError: string | undefined, rejected: ReadonlyArray<Rejection> }
```

`pending` above zero means edits the server has not confirmed; `lastError` is
the last failed exchange, cleared by the next success; `rejected` lists recent
edits the server refused, most recent first, each `{ opId, reason, operation }`,
where `reason` is an `Option` of the server's words for the person and
`operation` is the refused operation itself, which the replica has dropped
from the outbox, so a page reads what it changed from here. `replica.statusChanges` is a Stream of the same,
emitted now and after every submit and exchange (subscribed before its first
read, so a subscriber slow to take one misses no change); `replica.changes`
pairs it with the optimistic `shared` value so one subscription sees both.

**A refused edit** arrives as a rejection on the next exchange, not as an
error. The replica drops it and replays the rest; the mount re-installs the
shared slice, and the field the user edited reverts. `onPersistenceFailure`
does not run for this, since the local save succeeded. Watch `rejected` to
explain the revert: `journalExchange` gives each rejection a reason, the
`authorize` rule's own when it gave one, and otherwise a fixed sentence
("Not a valid operation"). It never sends an error's message, which may carry
internals, so a rule a person should read about belongs in `authorize` with a
`reason`, not in `validate`.

**Waiting for the server.** The Model shows an edit before the server has it.
Something that must not report success until the edit is committed, an agent
tool for instance, waits on `mounted.committed`: the shared slice as the server
confirmed it, with no pending edit applied. It is a source, `{ get, subscribe }`,
told after every exchange:

```ts
completion: Agent.when({
  source: mounted.committed,
  predicate: (shared, request) => shared.todos.some(todo => todo.id === request.id),
})
```

That completes after the exchange that commits the todo and never for one the
server rejects.

## Growing the application

### Compose a document from features

Each feature declares the fields it shares and the Messages that change them;
`compose` merges them into one document:

```ts
const AppSync = Sync.forApplication(App)

const Todos = AppSync.fragment({
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
})

const Members = AppSync.fragment({
  shared: Projection.pick(App.model.members),
  durable: MessageSet.make(App, [Message.Invited]),
})

const Board = AppSync.make({
  documentId: DocumentId.make('board'),
  ...AppSync.compose(Todos, Members),
})
```

`compose` throws on a field declared twice with different codecs, a Message
declared durable twice, or a fragment from another application. The result is
still one document: one outbox, one cursor, one server order.

### Authorize on the server

Policy belongs on the contract, beside the Messages it governs, and runs on the
server inside the journal's commit. The client never runs it.

```ts
const Authorized = Sync.forApplication(App).withPrincipal<{ readonly role: 'admin' | 'guest' }>()

const Board = Authorized.make({
  documentId: DocumentId.make('board'),
  ...Authorized.compose(Todos, Members),
  authorize: {
    RenamedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && shared.todos.some(todo => todo.id === message.id),
  },
})
```

A rule returns `true`, `false`, or `{ allowed: false, reason }`; the reason
is sent to the replica whose edit it was, as its rejection's `reason`.

`message` is exactly that variant, `shared` is the authoritative snapshot, and
`principal` is whatever the server's transport established for the connection;
it is never read from the operation. A variant without a rule is allowed. A key
that is not a durable variant is a type error. The rules ride in
`journalContract()`, so the server enforces them by spreading the contract.

An edit the policy refuses still shows at once on the client, then comes back
as a rejection, as [above](#what-to-show-the-user).

### Stamp what only the commit decides

A fact carries its own nondeterminism, but a client cannot know where its
operation lands in the server's order. A stamp writes it in, on the server, as
the journal commits:

```ts
const Message = defineMessageUnion({
  // `at` is absent on what a client sends: the server's sequence once committed.
  PriceEdited: { id: Schema.String, cents: Schema.Number, at: Schema.optionalKey(Schema.Number) },
})

const Prices = Sync.forApplication(App).make({
  documentId: DocumentId.make('prices'),
  shared: Projection.pick(App.model.prices),
  durable: MessageSet.make(App, [Message.PriceEdited]),
  stamp: {
    PriceEdited: ({ id, cents }, { sequence }) => Message.PriceEdited({ id, cents, at: sequence }),
  },
})
```

The rule gets that variant and `{ sequence, actorId, replicaId }` (the
replica that sent it, which tells one person's tabs apart), and returns the same
variant; a key that is not durable is a type error, and a rule that returns
another variant has its operation rejected. It rides in `journalContract()` as
Durable's `stamp`, so the journal stores, reduces and sends the stamped
Message. A replica shows what it sent until the exchange, then replays the
stamped Message in its place, the same on every replica. A retry is still
recognized by what was sent.

Use it for what a reader compares with the server's order: a read model that
records the last sequence it applied can tell which edits it holds by comparing
the two. A client that sends the stamped field itself is claiming a commit it
did not get; refuse it in the journal's `validate`.

### Coalesce a burst of typing

Typing makes one durable Message per keystroke. `coalesce(last, next)` is
offered each submit together with the last operation in the outbox; return a
merged Message to replace it, or `undefined` to keep them apart:

```ts
coalesce: (last, next) =>
  last._tag === 'RenamedTodo' && next._tag === 'RenamedTodo' && last.id === next.id
    ? next
    : undefined
```

Replaying the merged Message must equal replaying `last` then `next`. An
operation is only merged into while no exchange has carried it, so there is no
timer to tune: keystrokes typed while a request is out become one operation, and
a lone keystroke goes out as fast as before.

### The URL, mirrors, and agents

`mount` takes the application's own `subscriptions` and the `resources` Layer
they need, and `url: { init, onUrlChange, onUrlRequest? }` to route navigation
through `update`: `init(model, url)` reduces the first URL before the first
render and `onUrlChange(url)` names the Message for every navigation. A
[`foldkit-mirror`](../mirror) URL mirror plugs into exactly that seam.

`Mounted` is also the host an agent binds to: `model`, `dispatch`, `subscribe`,
and `observe`, which reports every application Message the runtime applies.
See [`examples/todo-app`](../../examples/todo-app) for both.

### Carry local state across a reinstall

When an exchange or a failed persist replaces the shared slice outside
`update`, `onReinstall(next, previous, { reset })` returns the transition
instead. Use it to keep a selection that points into the slice, or to return a
Command that patches a DOM the change has to reach. Omitted, the Model is
simply `next`. It is not called for a status that changed nothing the Model
shows. `reset` is true when the server's history is a new one (a new
`status.epoch`: the server was reset), so whatever the application derived
from the old one, such as reads keyed by commit sequence, is to be read again.

### Edit rows a server owns

When rows are too many to replicate but edits to them must survive offline,
let the journal own the edits and the table be its read model, each row
carrying the highest sequence it has applied (`revision`). `foldkit-sync/entity`
keeps such edits one per cell and lays them over the rows Remote reads:

```text
cell shown = the row's value, unless an edit of that cell is pending,
             or committed after the row's revision (at > row.revision)
```

`EditableEntity.make(Product, { members: ['description', 'cents'] })` gives
the schemas (`Change` on the wire, `Edit` in the slice, the Message fields
`edited` and `absorbed`) and pure functions for `update`, the stamp
(`stamped`) and `onReinstall`: `merge`, `absorb`, `overlay` (for
`RowModel.map`), `held` and `settled` (an edit the journal absorbed, kept until
a read of its row reaches it), `replaced` (a cell of this tab's that another's
later commit took) and `cellsOf` (what a refusal undid). It owns no state and
does no I/O. [`examples/registry`](../../examples/registry) is the whole of it.

## Testing without a browser or a server

A `Storage` needs three members, and the loopback transport takes a handler in
place of a socket:

```ts
import { Effect } from 'effect'
import type { Storage } from 'foldkit-sync'

const memoryStorage = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next => Effect.sync(() => void (state = structuredClone(next))),
    close: Effect.void,
  }
}

const program = Effect.gen(function* () {
  const replica = yield* TodoSync.openReplica(ReplicaId.make('test'), memoryStorage())
  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' }))
  yield* replica.synchronize
  return yield* replica.status
}).pipe(
  Effect.provide(
    Sync.transport.loopback((_cursor, pending) => ({
      operations: [],
      acknowledged: pending.map(operation => operation.opId),
      rejected: [],
    })),
  ),
)
```

In Node, `Sync.indexedDb(name, new IDBFactory())` from `fake-indexeddb` tests
the real storage adapter. [`examples/sync`](../../examples/sync) tests every
recovery case below against a real journal.

## When things go wrong

Each case is designed, not incidental. The ones that change how you build the
application come first.

- **The network is gone.** Edits keep applying and keep being saved. `pending`
  grows; the loop retries. Nothing to handle.
- **The server rejects an edit.** Dropped from `pending`, the rest replayed,
  the Model re-installed. Explain it from `status.rejected`.
- **The persist fails.** The edit is reverted and `onPersistenceFailure` runs.
  The user has to redo it.
- **Local storage was evicted.** The replica starts at cursor 0 and catches up
  from the server, but edits that lived only in the outbox are gone. The
  outbox is user data, not a cache.
- **Two tabs share one storage name.** Compare-and-swap fails the stale writer
  with `StorageError`. Give each tab its own name and `ReplicaId`.
- **The replica is far behind.** The server may answer in pages (`more`), and
  `synchronize` asks again at once until caught up. If the server compacted
  the history it needs, it sends a checkpoint instead: a snapshot and cursor
  the replica adopts as its base before replaying its pending edits. A
  checkpoint behind the replica's cursor is refused
  (`CheckpointRegressionError`), never applied backwards.
- **The server lost its history.** A server names its history with an `epoch`;
  a replica that hears a new one rebuilds its committed state from that answer
  and resends its outbox. Everything the old server committed is gone on every
  replica. A replica that never heard an epoch cannot tell, and fails every
  exchange until its storage is cleared.
- **Stored state is from another version.** Opening fails with
  `UnsupportedReplicaVersionError` naming both versions; the bytes are left for
  a deliberate migration or reset. Sync versions its own envelope only; your
  Message and snapshot migrations stay yours.
- **The server answers nonsense.** Malformed exchanges, gaps in the committed
  order, acknowledgements or rejections for operations the replica never sent:
  each fails the exchange rather than touch local work.

## Advanced: the replica

`Sync.mount` is the normal path. Underneath, a `Replica` works on the shared
slice alone, and an application that is not a Foldkit runtime (a worker, a
server-side actor, a test) uses it directly.

```ts
const program = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos/tab-1')
  const replica = yield* TodoSync.openReplica(ReplicaId.make('tab-1'), storage)

  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' }))
  const optimistic = yield* replica.shared // includes the pending edit

  yield* replica.synchronize // one exchange
  return optimistic
}).pipe(Effect.scoped, Effect.provide(Sync.transport.socket({ url: 'wss://example.com/sync' })))
```

`submit(message)` checks that the Message is durable, replays it against the
current optimistic state, gives it a stable operation id, saves it to the
outbox, publishes the new optimistic value, and wakes the loop. It sends
nothing. A Message replay refuses never enters the outbox.

`synchronize` takes one snapshot of the cursor and outbox, performs one
exchange, validates the answer, and reconciles it with the replica's *current*
state, so an edit submitted while the request was in flight survives.

The rest of the surface: `committed` (the base alone), `pending`, `cursor`,
`status`, `statusChanges`, `changes` (status and `shared` from one snapshot),
`snapshot` (the same plus `nextLocalSequence`), `start`, and `close`.

### The exchange

One request, one answer. A custom server implements this; a custom transport
carries it.

```text
request    cursor
           pending operations
           epoch, once the replica has heard one

answer     operations     committed after the cursor, contiguous
           acknowledged   ids the server accepted without repeating them
           rejected       ids the server refused
           reasons?       [{ opId, reason }]: why, for some of rejected; at most 500 characters each
           checkpoint?    { cursor, model } when the history is gone
           more?          true when another page follows
           epoch?         the server's history
```

An acknowledged operation leaves the outbox once its committed copy has
arrived or the last page has been read. A rejected one leaves at once. The
replica validates every field; see [when things go wrong](#when-things-go-wrong).

### Transports

`Transport` is an Effect service with one operation. Sync ships:

- `Sync.transport.socket({ url, … })`: a reconnecting WebSocket client. It
  queues exchanges while connecting, retries on a jittered backoff capped at
  `maxRetryDelay` (5 s), keeps request ids stable across resends, and after
  `maxRetries` (5) consecutive failed connections fails queued work and fails
  new exchanges fast until a socket is healthy again. `maxQueue` (64) bounds
  the queue.
- `Sync.transport.serve(socket, { exchange, changes? })`: the server side of one
  accepted socket. With `changes`, a subscription to the document's commits, it
  sends a notice after each; the client's loop exchanges on every notice, so a
  tab that is only reading still sees others' edits without polling.
- `Sync.transport.loopback(handler)`, `fromPromise(client)`, `toPromise(shape)`,
  and `nativeSocket` for the platform `WebSocket`.

A refusal is data in the answer; only a wire failure is a `TransportError`.

### Presence

"Who is viewing this" and "where is their caret" should vanish when the peer
does, not replay next week. `Sync.presence.make({ id, ttl, decodeValue, channel?,
throttle? })` is a TTL'd peer registry outside the log: values are decoded before
they enter it, a peer that stops refreshing is pruned, and `throttle` sends at
most one value per interval, the latest. `Sync.presence.socketChannel(transport.socket)`
shares the sync socket across reconnects; `Sync.presence.hub` and `.serve` are
the server side. [`examples/pages`](../../examples/pages) shows remote carets.

### Last-writer-wins fields (experimental)

Server order decides concurrent edits. When one field should instead keep the
newest logical write even from a device that reconnects late, `Sync.lww.register(schema)`
gives it a stamped schema and a pure `merge`; `Sync.lww.openClock` allocates
stamps from a persisted counter, before dispatch and never in `update`. It is a
per-field rule, not a CRDT mode: sets, counters, and text stay outside.

```ts
const Title = Sync.lww.register(Schema.String)
const Shared = Schema.Struct({ title: Title.schema })
// in update: title: Title.merge(model.title, message.title)
```

### Without a Foldkit application

`Sync.define({ documentId, message, shared, empty, durable, replay })` is the
protocol primitive `forApplication` compiles to, for a client with no
application to derive from. Its `replay` is unguarded; the author owns its
agreement with whatever applies the Message elsewhere.

### Joining an assembly

`TodoSync.wiring()` adds the contract to a `foldkit-bundle` assembly so
`Module.validate` can report two owners of one field. It routes nothing and
runs nothing; Sync owns its runtime through `mount`.

## What Sync owns, and does not

Owns the replication contract (shared slice, durable set, replay, codecs,
`journalContract`), the replica (outbox, base, cursor, optimistic view, status),
reconciliation, the transport seam, and the optional presence and LWW helpers.

Does not own the rest of the Model, server-derived caches (`foldkit-remote`),
the authoritative order and storage (`foldkit-durable` or your server),
peer-to-peer merging, or migration of your own Messages and snapshots.

## Limits

- IndexedDB is the only built-in storage; `Storage` is three members to
  implement.
- One server order per document; no CRDT and no collaborative text algorithm.
- Binding the socket transport to a platform WebSocket server is glue the
  examples show with `ws`.

## Older spellings

`Sync` groups the exports and wraps nothing; every name is also exported on its
own with the same signature: `defineSync` is `Sync.define`, `syncMetrics` is
`Sync.metrics`, `layerSocket`/`layerLoopback`/`layerFromPromise`/`toPromise`/
`serveSocket`/`nativeSocket` are `Sync.transport.*`, `createPresence`/
`createPresenceHub`/`servePresence`/`socketPresenceChannel`/
`loopbackPresenceChannel` are `Sync.presence.*`, and `lwwRegister`/`openLwwClock`
are `Sync.lww.*`. `documentId('todos')` and `DocumentId.make('todos')` make the
same branded value, as do the other id constructors.

## See also

- [Replicated state](../../docs/replication.md): both halves end to end, with
  the server's exchange handler.
- [`foldkit-durable`](../durable): the journal and what it guarantees.
- [Runtime binding](../../docs/sync-runtime-binding.md): what `Sync.mount` does
  inside the Foldkit runtime, for the curious.
- [`examples/todo-app`](../../examples/todo-app): a whole application over
  `Sync.mount`, with fragments, authorization, mirrors, and an agent.
- [`examples/sync`](../../examples/sync): the replica, the journal, the socket,
  and a test for every failure above.
