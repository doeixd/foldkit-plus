# foldkit-sync + foldkit-durable

Checked against `foldkit-sync` 0.16.0 and `foldkit-durable` 0.13.0.

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
[what a reader sees while a change is in flight](https://github.com/doeixd/foldkit-plus/blob/main/docs/state-model.md#what-a-reader-sees-while-a-change-is-in-flight).

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
import { DocumentId, forApplication } from 'foldkit-sync'

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

export const TodoSync = forApplication(App).make({
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
import { Sync } from 'foldkit-sync'

const program = Effect.gen(function* () {
  const storage = yield* Sync.tabStorage('todos')             // scoped; this tab's store, kept across reloads
  const replica = yield* TodoSync.openReplica(storage)        // the store's id: read back, or minted

  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' })) // durable only: a local Message does not compile
  const optimistic = yield* replica.shared                    // already includes the pending op
  const status = yield* replica.status                        // { pending, cursor, lastError, rejected, refused, epoch }

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
  a backoff (0.5 s to 30 s), or at once on the next submit. It is also reported on
  `Diagnostics` (`foldkit-surface`) as `ExchangeFailed`, a reset server history as
  `HistoryRebuilt`, and a presence or socket listener of yours that threw as
  `ListenerFailed` (`journalChanges`' listener too, which the next commit calls
  again). A contract's
  `durable(message)` says whether a Message is recorded. The optional
  `coalesce(last, next)` merges a submit into the last operation while
  no exchange has carried it (a burst of typing becomes one operation).
- Also available: `changes` (a stream of status + shared), `snapshot`,
  `statusChanges`, `committed`, and `close`. Transports: `Sync.transport.socket`
  (reconnecting; a `url`, or `makeSocket` for any other socket), `.portSocket(port,
  { signal? })` over a `MessagePort`, `.loopback`, `.fromPromise(client)`, and
  `.serve(socket, { exchange, changes? })` for the server, where `changes`
  subscribes to commits and sends a notice that wakes the client's `start`. The
  socket transport also provides `TransportSocket` (`Context.get(built, TransportSocket)`
  or `yield* TransportSocket`), its connection across reconnects, for
  `Sync.presence.socketChannel`; only a socket transport's layer has it in its type.
- A replica's id is its store's: `openReplica(storage)` reads it back, or mints
  one for an empty store, so two stores never share one. `{ replicaId }` names
  it for a test or a server; never name it after a person, whose second browser
  would reuse its operation ids. `Sync.tabStorage(name)` is this tab's store
  (`sessionStorage` key, IndexedDB `${name}/${key}`; a duplicated tab mints its
  own); `Sync.indexedDb(name, factory?)` opens a database by name (pass
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
import { Effect, Option, Scope } from 'effect'
import { Sync } from 'foldkit-sync'

const scope = Effect.runSync(Scope.make())                    // the store's connection lives for the page
const replica = await Effect.runPromise(
  Sync.tabStorage('todos').pipe(Effect.flatMap(TodoSync.openReplica), Effect.provideService(Scope.Scope, scope)),
)

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
  persists it. While a shown edit is not stored yet, the browser asks before the
  page unloads. A refused or failed persist reverts the edit and calls
  `onPersistenceFailure`. Outside `update`, the shared slice is reinstalled only
  when an exchange commits, acknowledges, or rejects something, and when a
  failed persist reverts.
- Options: `subscriptions` + `resources` (for example, Mirror entries and their
  Layer), `url: { onUrlChange, init?, onUrlRequest? }`, and `onReinstall(next,
  previous, { reset })`, which returns the transition when an exchange or a
  failed persist replaces the shared slice (carry a selection across, patch a
  DOM); `reset` says the server's history is a new one (`status.epoch` changed).
  `afterUpdate(model)` runs after every live update (durable and reinstall
  included), never in replay: local state derived from the slice goes here,
  since a replayed durable Message may change only the slice.
- `Mounted` provides `model`, `dispatch`, `subscribe`, `observe`, `committed`,
  `settled` and `dispose`. `settled()` resolves once the Model has caught up
  with the replica (in a test: `await frames.settle(mounted)`, with
  `Frames.track` from `foldkit-mixins/testing`). `Mounted` is a `foldkit-agent`
  host as it is; add a `principal` resolver when the agent's rules read one.
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
import { forApplication } from 'foldkit-sync'

type Principal = { readonly actorId: string; readonly role: 'admin' | 'guest' }
const Authorized = forApplication(App).withPrincipal<Principal>()

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
`[{ opId, refusal: Option<SyncRefusal>, operation, message }]`: why, in Remote's
vocabulary, the refused operation as sent, and its Message encoded at the
current version, to read what it changed.
`Forbidden { reason }` is `authorize` or `admit` refusing, with the rule's
words (Remote's `Denied.Forbidden`); `Invalid { message, ... }` is the
operation failing, with a fixed sentence from `journalExchange`, never an
error's message (Remote's `Refusal.invalid`); `Unreadable { version }` is an
older Message version no step of the history reads (below), which the replica
also keeps in `status.refused`. None means the server named no refusal, or one
this build cannot read (reported as `UnknownRefusal`). `reason`, the words
alone, and the exchange reply's `reasons` are deprecated, removed in the following release.

```ts
import { Option } from 'effect'
import { SyncRefusal, type Rejection } from 'foldkit-sync'

const said = (rejection: Rejection): string =>
  Option.match(rejection.refusal, {
    onNone: () => 'Refused by the server',
    onSome: SyncRefusal.match({
      Forbidden: ({ reason }) => Option.getOrElse(reason, () => 'You may not change this'),
      Invalid: ({ message }) => message,
      Unreadable: () => 'Made by another version of the app, so not saved',
    }),
  })
```

## Changing a durable Message

A stored operation outlives its build, so a shipped durable Message's Schema
is a stored format. Declare its history; every reader sees old operations
upcast:

```ts
import { Match, Schema } from 'effect'
import { migrations } from 'foldkit-sync'

// Version 1 called `title` `text`; copy only changed variants, and durable ones only.
const CreatedTodoV1 = Schema.TaggedStruct('CreatedTodo', { id: Schema.String, text: Schema.String })
const TodoHistory = migrations(Schema.Union([CreatedTodoV1])).next(
  Schema.Union([Message.CreatedTodo]),
  ({ id, text }) => ({ _tag: 'CreatedTodo' as const, id, title: text }),
)
```

`Sync.define({ migrations, … })` takes it in place of `message`;
`Sync.forApplication(App).make({ …, migrations })` takes one whose last Schema
is `App.Message` itself (checked by identity; with no `migrations`, version 1,
written as before). Each step's input is typed by the version before, given
normalized by that version's Schema; a step must be pure (no clock, no random
id), since the server reads an entry more than once.

- An operation keeps its `messageVersion` (absent for 1) in the outbox and on
  the wire (`WrittenOperation`: `replica.pending`, a rejection's
  `operation`); `admit`, `validate`, `authorize`, `reduce`, `stamp` and replay
  see the current Message. The journal stores the current version and still
  recognizes a pre-deploy retransmission (Durable's codec `compared`).
- Older, no step reads it: a pending one moves to `status.refused` (kept, with
  its payload, until `replica.dismiss(opId)`; the rest sends); the server
  rejects one as `Unreadable`; a committed one fails, with
  `UnreadableHistoryError` on the server, whatever reads it: exchanges from a
  cursor before it, a retransmission of it, a rebuild from an older snapshot.
  A replica past it is served; the replica is told no operation id.
- Newer (a rollback, an old client): `UnsupportedMessageVersionError` refuses
  to open the replica, fails the exchange that receives one (in `lastError`,
  retried; reload the page), and a server fails an exchange carrying one
  before appending, so the client waits. Nothing is removed.
- Deploy the Sync release everywhere first, or lose edits: an older server
  rejects an operation carrying `messageVersion`, and an older replica drops
  one refused as `Unreadable`. Then the app's version, server first. Never
  clear storage on `InvalidReplicaHistoryError` after rolling Sync back (a
  state with `refused`): the outbox is in it.
- A server appending its own operation (`editsJournal`'s `absorbed`) writes
  it with `journalContract().operation.encode`: the journal takes a branded
  `WrittenOperation`, so a decoded `Operation` (read as version 1) does not
  type-check. A custom exchange fails the whole exchange on an entry newer
  than `codec.messageVersion` before appending, as `journalExchange` does. The shared slice's own
  Schema has no history: changing it is yours.

## Server: foldkit-durable Journal

```ts
import { Effect } from 'effect'
import { ActorId, DocumentId as JournalDocumentId, Journal, OpId } from 'foldkit-durable' // its own brand, not Sync's

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    ...Board.journalContract(),       // codecs, empty snapshot, replay reducer, compiled authorize
    file: 'board.sqlite',             // path or Config<string>; ':memory:' for tests
    opId: operation => OpId.make(operation.opId),                    // re-brand Sync ids
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })
  const board = JournalDocumentId.make('board')
  const { snapshot, cursor } = yield* journal.load(board)
  return { snapshot, later: yield* journal.read(board, cursor) }
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
- `foldkit-sync/entity`'s `EditableEntity.make(entity, { members })` keeps
  edits to server-owned rows one per cell (`{ id, member, value, at, by }`),
  with `merge`, `absorb`, `replaced`, `cellsOf` and `changeAt` (a cell's
  value as a change, for an undo) for `update` and `onReinstall`; pure, no
  state of its own. `foldkit-sync/remote`'s `RemoteEdits.make(Data, Edits)`
  shows them as Remote overlays, so every read of a row draws them:
  `reconcile(model, edits, replica)` from `afterUpdate` returns `{ model, held,
  replaced }` (refresh the rows of `held`; say `replaced`: this replica's
  edits a read reached with another value, held or not), `shown(model)` for
  cell marks, `clear(model)` on a reset. On the server,
  `editsJournal({ documentId, journal, editsOf, apply, tableRevision,
  holdsThrough, asServer: { journal: server, absorbed: through => … } })`
  (`foldkit-sync/journal`) gives `settle`, which applies each committed
  change to the table from a cursor the journal stores (started at its
  floor), keyed by its epoch, and refuses a table past the journal's cursor
  (`TableAheadOfJournalError`), and `absorb`, which appends the server-only
  `absorbed(through)` under the key `absorbed/<through>` and compacts no
  further than `server.settledThrough`. Its `absorbed`/`server` pair is
  deprecated. Refuse an edit to a row the table lacks in the journal's
  `validate`. The registry example uses both. For a Drizzle table, `apply` is
  `applyEdits(binding, { revision?, live? })` from `foldkit-remote-drizzle`
  (`revision` a field of the binding, `revision` by default): the member's
  column and the sequence as revision, never moving a row back, and told to a
  live hub when it wrote the row.
- Durable does **not** speak the sync exchange; `foldkit-sync/journal` does
  (`foldkit-durable` an optional peer): `serveJournal(socket, { sync, journal,
  principal, admit?, opens?, settle?, diagnostics? })` answers one socket and notifies it of each
  commit; `admit(operation)` (true, false, a refusal with a reason, or an Effect of one) decides
  before the journal reads an operation, `opens` (an Effect of a boolean) whether the connection
  may exchange at all; `journalExchange(options)` is the same as a `TransportClient` for an
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

**Serving from a Durable Object.** `defineDocumentHost(DurableObject, { sync,
openJournal, resolvePrincipal, settle })` (`foldkit-sync/do`) defines the
single-writer class: each accepted socket exchanges against one journal,
opened once on the first upgrade (D1 with `d1: true`, or object storage),
non-upgrades are 404s, and the replica side is the socket transport it
already speaks (`Sync.transport.socket({ url })`). `resolvePrincipal` is an
Effect refusing with `RemoteUnauthenticated` (a 401), whose services come
from `layer: env => Layer` (kept while the socket is open); `revalidate: { every,
key? }` asks it again while the socket is open, closing with 4401 on a
refusal and 1012 on a changed principal. `settle: (env, journal) =>
Effect` runs after each exchange's appends to apply what committed elsewhere
(`journal.recover` makes it idempotent). A failure answered 500 (or 1011, or
a notice unsent, or a commit stream broken: stage `Changes`) is reported as a `HostDefect` with its `stage` and `cause`, to
`diagnostics: (diagnostic, request) => Effect` when given, else
`Diagnostics.Reporter`. `Sync.transport.workerSocket` wraps an
accepted pair end anywhere else a platform hands one over. Off Cloudflare,
`server: { principal, reactions: env => [...] }` gives the object its
reactions (below): registered on open, the alarm set before the reply to an
exchange that committed, a pass after it, and `alarm()` (which never throws)
running them and setting the alarm from their answer. Off Cloudflare,
`documentHost({ sync, journal, resolvePrincipal, layer?, revalidate?, … })`
(`foldkit-sync/journal`) answers each upgrade request (`Result`: the refusal's
`Response`, or `{ serve, abandon }`: serve the opened `HostSocket`, or abandon
an upgrade whose socket never opens, which releases its layer), which a Node
`ws` upgrade handler calls before `handleUpgrade`. Remote's live reads on a
Worker are another matter (`pollLive`): see [remote.md](remote.md).

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
Server side, `Sync.presence.serve(socket, hub, { peerId, opens? })` stamps the
connection's id and joins only a connection `opens` lets (the exchange's own).
`Sync.lww.register` (experimental) makes one field last-writer-wins. Allocate
stamps with `Sync.lww.openClock` before dispatch, never in `update`.

## Server-only Messages and reactions

<!-- docs-check standalone
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync, type Operation, type WrittenOperation } from 'foldkit-sync'
import type { Journal } from 'foldkit-durable/core'
const Model = Schema.Struct({ orders: Schema.Array(Schema.Struct({ id: Schema.String })) })
const Message = defineMessageUnion({
  PlacedOrder: { id: Schema.String },
  ConfirmedPayment: { id: Schema.String, charge: Schema.String },
  SentReceipt: { id: Schema.String },
})
const App = Surface.application({ Model, Message, initial: { orders: [] }, update: model => ({ model }) })
declare const journal: Journal<Operation, { readonly orders: ReadonlyArray<{ readonly id: string }> }, { readonly actorId: string }, WrittenOperation>
declare const sendReceipt: (order: string, idempotencyKey: string) => Effect.Effect<void, Error>
-->
```ts
import { reaction, serverJournal } from 'foldkit-sync/journal'

const Confirmed = MessageSet.make(App, [Message.ConfirmedPayment])
const Receipted = MessageSet.make(App, [Message.SentReceipt])

const Orders = Sync.forApplication(App).make({
  documentId: DocumentId.make('orders'),
  shared: Projection.pick(App.model.orders),
  durable: MessageSet.make(App, [Message.PlacedOrder]), // what a replica submits
  serverOnly: MessageSet.union(Confirmed, Receipted),   // what only the server appends
})

const receipt = reaction(Orders, {
  name: 'receipt',             // part of every run's key: renaming it is a new reaction
  on: Confirmed,
  appends: Receipted,          // what its answer may hold, checked at run time too
  run: ({ message, key }) =>   // `key`: the provider's idempotency key, the same on every retry
    sendReceipt(message.id, key).pipe(Effect.as([Message.SentReceipt({ id: message.id })])),
})

const serving = Effect.gen(function* () {
  // Before the journal's first exchange: a reaction sees every commit after this.
  const server = yield* serverJournal({
    sync: Orders,
    journal,
    server: { actorId: 'orders' },   // never resolved from a request, never changed
    reactions: [receipt],
  })
  yield* Effect.forkScoped(server.follow) // a long-lived process; or `react` from a host
  return (event: { readonly id: string; readonly order: string; readonly charge: string }) =>
    server.appendAsServer(Message.ConfirmedPayment({ id: event.order, charge: event.charge }), {
      key: `payment/${event.id}`,    // a redelivered webhook commits once
    })
})
```

- A Message in both sets is a type error. A replica's `submit` of a
  server-only one is a type error and refused; every reader of a sent entry
  (`codec.writtenFrom`, `normalizeOperation`, `operationFrom`) refuses one
  after upcasting (`ServerOnlyMessageError`), and `journalExchange` rejects it
  as `Forbidden` and reports `ServerOnlySubmitted`. Replica ids under
  `server/` and past 128 characters are refused (`Invalid`).
  `journalContract().operation.decode` reads history, server-only included:
  a hand-made journal's `decode` must be it, not `normalizeOperation`.
- `appendAsServer(message, { key })` takes server-only Messages, a key of at
  most 200 characters; the same key with another Message is
  `ServerKeyReusedError`. It goes through the journal's `validate` and
  `authorize`.
- **At least once.** An external call may run twice (a crash or timeout
  between the call and the ledger's record); the appends commit once. Never
  claim exactly once.
- `react` is one pass: `Option<Duration>`, none when caught up. It never
  fails: a failing run waits on a stored backoff (0.5 s to 30 s) and blocks
  only its reaction (`ReactionFailed`); one whose append the journal refuses,
  or whose answer is outside `appends` or over 16, parks at once; one failing
  `attempts` (8) times *and* for `parkAfter` (1 hour) parks; a `JournalError`
  counts toward neither. `parked`, `retry` (reuses the recorded answer),
  `dismiss`; a run parked before a `reset` is `stale`. Compact no further
  than `settledThrough`.
- Cursors and parked runs live in `foldkit-durable` schema 7
  (`journal.cursors`: `track`, `settled`, `advance`, `stalled`, `park`,
  `parked`, `unpark`), each row tagged with the epoch.
- Hosts: Node forks `follow`; a Durable Object takes `server` (above); a
  stateless Worker calls `ctx.waitUntil(server.react)` with `runsPerPass` 1
  or 2 and a Cron Trigger, and its reactions' commits reach other replicas
  only on their next exchange. `settle` stays for a read model the reply
  needs.

## Gotchas

- Durable Messages must not return Commands or write outside `shared`. Mint IDs
  and timestamps in a Command, then dispatch the fact.
- Use one mount per replica, on its own store (`Sync.tabStorage`). A second
  writer on one store fails its compare-and-swap. Losing IndexedDB loses unsent
  edits.
- `foldkit-durable`'s `Journal.make` needs Node >= 22 (`node:sqlite`);
  `foldkit-durable/core`'s `Journal.layer(options)` (or `Journal.define(key)
  .layer`) is a layer that needs any `effect/sql` SQLite `SqlClient`,
  `@effect/sql-sqlite-wasm` in a browser: `Layer.provide` the driver, and the
  database lives as long as the journal. One Journal handle per
  database. `reduce`/`validate`/`authorize` hold the write lock, so keep them pure,
  fast, and service-free. Ops must be JSON.
- Sync and Durable ids are branded separately, so re-brand with
  `OpId.make(operation.opId)`. A durable Message's versions are its history
  (above); the shared slice's Schema migration is yours.
- With no Foldkit app, use `Sync.define({ documentId, message, shared, empty,
  durable, replay })`, or `migrations` in place of `message`.

## Known traps

Met in applications on this stack: what failed, and what to do instead.

- **State derived from the shared slice belongs in `afterUpdate`.** Replay runs
  the durable Message through `update` and refuses any other field it changes,
  so reconciling another field at the end of `update` failed every replica
  ("changed Model fields outside the shared projection"). Derive it in
  `Sync.mount`'s `afterUpdate`.
- **A durable edit shows before it is stored.** `Sync.mount` applies it to the
  Model at once and persists it in a Command, so a test that reloaded on what
  the page drew lost the edit on slow runs. Wait for the `ReplicaStatus`'s
  `pending` count, which moves only once storage holds the operation.
- **A hand-written exchange that throws on one operation blocks the outbox**:
  the replica sends it again on every exchange, and every edit behind it waits.
  Use `foldkit-sync/journal`'s `journalExchange` or `serveJournal`, which refuse
  such an operation by id so the replica drops it.
- **A worker resolves its dependencies with the page's conditions.** A
  SharedWorker loaded a package's `browser` build, which touched `document`,
  and died before answering; the tabs showed only edits that never arrived.
  Add `worker` to Vite's `resolve.conditions` for it.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/sync/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/durable/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/errors.md (what a
  rejected, failed or reset exchange looks like to the reader)
- https://github.com/doeixd/foldkit-plus/blob/main/docs/editing-server-data.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/sync-runtime-binding.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/sync
- https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app
- https://github.com/doeixd/foldkit-plus/tree/main/examples/registry (Remote
  reads the rows, Sync keeps the edits, and the journal applies committed
  edits to the table through `recover`)
