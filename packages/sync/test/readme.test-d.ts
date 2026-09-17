/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API. Sections that the README writes over the same
 * names are renamed here so they can share one module; `transport` stands in
 * for the application's own server client.
 */
import { Effect, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface, type Wiring } from 'foldkit-surface'
import { DocumentId, ReplicaId, Sync, type Replica, type TransportClient } from '../src/index.js'

// Quick start
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

// The server's journal options. `makeJournal` is `foldkit-durable`'s, which is
// not a dependency here, so only the half this package supplies is checked.
const journalOptions = {
  ...TodoSync.journalContract(),
  file: 'todos.sqlite',
  opId: (operation: { readonly opId: string }) => operation.opId,
  actorId: (principal: { readonly actorId: string }) => principal.actorId,
}
void journalOptions

// Mounting
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

// Fragments: a wider application than the quick start's, with a `members` field
// and an `Invited` Message.
const WideModel = Schema.Struct({
  ...Model.fields,
  members: Schema.Array(Schema.String),
})
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
  shared: Projection.pick(WideApp.fields.todos),
  durable: MessageSet.make(WideApp, [WideMessage.CreatedTodo, WideMessage.RenamedTodo]),
})
const Members = AppSync.fragment({
  shared: Projection.pick(WideApp.fields.members),
  durable: MessageSet.make(WideApp, [WideMessage.Invited]),
})
const Board = AppSync.make({
  documentId: DocumentId.make('board'),
  ...AppSync.compose(Todos, Members),
})
void Board

// Authorization: the same Board, with a principal fixed and one rule added.
const Authorized = Sync.forApplication(WideApp).withPrincipal<{
  readonly role: 'admin' | 'guest'
}>()
const AuthorizedBoard = Authorized.make({
  documentId: DocumentId.make('board'),
  ...Authorized.compose(Todos, Members),
  authorize: {
    // `message` is exactly `RenamedTodo`; `shared` is the authoritative snapshot.
    RenamedTodo: ({ principal, message, shared }) =>
      principal.role === 'admin' && shared.todos.some(todo => todo.id === message.id),
  },
})
void AuthorizedBoard.journalContract()

// Lower level: `Sync.define` without a Foldkit application to derive from.
const LowerShared = Schema.Struct({ todos: Schema.Array(Schema.String) })
const LowerRenamed = Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String })
declare const transport: TransportClient // the application's own server client

const Protocol = Sync.define({
  documentId: DocumentId.make('todos'),
  message: LowerRenamed,
  shared: LowerShared,
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

const message: typeof Renamed.Type = {
  _tag: 'Renamed',
  title: { stamp: { counter: 1, replicaId: ReplicaId.make('tab-a') }, value: 'Milk' },
}
void message

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

void rename

// The contract joins an assembly contract-only, so the Module sees it.
const syncWiring: Wiring<Model, never> = TodoSync.wiring()

void syncWiring
