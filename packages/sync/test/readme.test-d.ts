/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API. Sections that the README writes over the same
 * names are renamed here so they can share one module; `transport` stands in
 * for the application's own server client.
 */
import { Effect, Option, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface, type Wiring } from 'foldkit-surface'
import {
  DocumentId,
  ReplicaId,
  Sync,
  type Replica,
  type SocketLike,
  type Storage,
  type TransportClient,
} from '../src/index.js'
import { serveJournal } from '../src/journal.js'
import { ActorId, Journal, OpId } from 'foldkit-durable'

// Sixty seconds: say what is shared
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

// Run it in the browser
const container = document.getElementById('app')!

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
  onPersistenceFailure: (model, error) =>
    modifyFields(model, { lastError: () => Option.some(error.message) }),
})

Effect.runFork(
  Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })),
)

mounted.dispatch(Message.CreatedTodo({ id: crypto.randomUUID(), title: 'Milk' }))
mounted.model()
await mounted.dispose()

// The server
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
void server

// What to show the user
const status = Effect.runSync(replica.status)
const _status: {
  pending: number
  lastError: string | undefined
  rejected: ReadonlyArray<string>
} = status
void _status
mounted.committed.get()

// Compose a document from features: a wider application than the quick
// start's, with a `members` field and an `Invited` Message.
const WideModel = Schema.Struct({ ...Model.fields, members: Schema.Array(Schema.String) })
type WideModel = typeof WideModel.Type
const WideMessage = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
  Invited: { email: Schema.String },
})
const WideApp = Surface.application({
  Model: WideModel,
  Message: WideMessage,
  initial: { ...initial, members: [] },
  update: (model: WideModel) => ({ model }),
})

const AppSync = Sync.forApplication(WideApp)
const Todos = AppSync.fragment({
  shared: Projection.pick(WideApp.model.todos),
  durable: MessageSet.make(WideApp, [WideMessage.CreatedTodo, WideMessage.RenamedTodo]),
})
const Members = AppSync.fragment({
  shared: Projection.pick(WideApp.model.members),
  durable: MessageSet.make(WideApp, [WideMessage.Invited]),
})
const Board = AppSync.make({
  documentId: DocumentId.make('board'),
  ...AppSync.compose(Todos, Members),
})
void Board

// Authorize on the server: the same Board, with a principal fixed and one rule.
const Authorized = Sync.forApplication(WideApp).withPrincipal<{
  readonly role: 'admin' | 'guest'
}>()
const AuthorizedBoard = Authorized.make({
  documentId: DocumentId.make('board'),
  ...Authorized.compose(Todos, Members),
  authorize: {
    RenamedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && shared.todos.some(todo => todo.id === message.id),
  },
})
void AuthorizedBoard.journalContract()

// Stamp what only the commit decides: a small price app of its own.
const PriceModel = Schema.Struct({
  prices: Schema.Array(Schema.Struct({ id: Schema.String, cents: Schema.Number })),
})
const PriceMessage = defineMessageUnion({
  PriceEdited: { id: Schema.String, cents: Schema.Number, at: Schema.optionalKey(Schema.Number) },
})
type PriceMessage = typeof PriceMessage.Type
const PriceApp = Surface.application({
  Model: PriceModel,
  Message: PriceMessage,
  initial: { prices: [] },
  update: (
    model: typeof PriceModel.Type,
    message: PriceMessage,
  ): Update.Return<typeof PriceModel.Type, PriceMessage> => ({
    model: { prices: [...model.prices, { id: message.id, cents: message.cents }] },
  }),
})
const Prices = Sync.forApplication(PriceApp).make({
  documentId: DocumentId.make('prices'),
  shared: Projection.pick(PriceApp.model.prices),
  durable: MessageSet.make(PriceApp, [PriceMessage.PriceEdited]),
  stamp: {
    PriceEdited: ({ id, cents }, { sequence }) =>
      PriceMessage.PriceEdited({ id, cents, at: sequence }),
  },
})
void Prices.journalContract().stamp

// Coalesce a burst of typing
const Coalesced = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
  coalesce: (last, next) =>
    last._tag === 'RenamedTodo' && next._tag === 'RenamedTodo' && last.id === next.id
      ? next
      : undefined,
})
void Coalesced

// Testing without a browser or a server
const memoryStorage = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next => Effect.sync(() => void (state = structuredClone(next))),
    close: Effect.void,
  }
}

const tested = Effect.gen(function* () {
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
void tested

// Advanced: the replica
const program = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos/tab-1')
  const replica = yield* TodoSync.openReplica(ReplicaId.make('tab-1'), storage)

  yield* replica.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' }))
  const optimistic = yield* replica.shared

  yield* replica.synchronize
  return optimistic
}).pipe(Effect.scoped, Effect.provide(Sync.transport.socket({ url: 'wss://example.com/sync' })))
void program

// Last-writer-wins fields
const Title = Sync.lww.register(Schema.String)
const Shared = Schema.Struct({ title: Title.schema })
const Renamed = Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Title.schema })

const lwwUpdate = (model: typeof Shared.Type, message: typeof Renamed.Type) => ({
  ...model,
  title: Title.merge(model.title, message.title),
})
void lwwUpdate

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
    yield* replica.submit({ _tag: 'Renamed', title: { stamp, value: title } })
    yield* clock.close
  }).pipe(Effect.scoped)
void rename

// Without a Foldkit application
const LowerShared = Schema.Struct({ todos: Schema.Array(Schema.String) })
const LowerRenamed = Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String })
declare const transport: TransportClient

const Protocol = Sync.define({
  documentId: DocumentId.make('todos'),
  message: LowerRenamed,
  shared: LowerShared,
  empty: { todos: [] },
  durable: () => true,
  replay: (shared, message) => ({ todos: [...shared.todos, message.title] }),
})

const lower = Effect.gen(function* () {
  const storage = yield* Sync.indexedDb('todos-tab-1')
  const replica = yield* Protocol.openReplica(ReplicaId.make('tab-1'), storage)
  yield* replica.submit({ _tag: 'Renamed', title: 'Milk' })
  yield* Effect.provide(replica.synchronize, Sync.transport.fromPromise(transport))
  return yield* replica.shared
}).pipe(Effect.scoped)
void lower

// Joining an assembly
const syncWiring: Wiring<Model, never> = TodoSync.wiring()
void syncWiring
