/**
 * The snippets in `docs/replication.md`, type-checked so the guide cannot
 * drift from the two packages. The guide's application is the README's todo
 * list, declared here once; `socket` and `principal` stand in for what a
 * server's transport establishes per connection.
 */
import { Effect, Fiber, Option, Schema, Scope, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Agent } from 'foldkit-agent'
import { ActorId, Cursor, DocumentId, Journal, OpId } from 'foldkit-durable'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import {
  DocumentId as SyncDocumentId,
  ReplicaId,
  Sync,
  type Operation,
  type SocketLike,
} from 'foldkit-sync'

// 1. Declare what is shared
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

type Principal = { readonly actorId: string; readonly canWrite: boolean }

const TodoSync = Sync.forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: SyncDocumentId.make('todos'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
    authorize: {
      RenamedTodo: ({ message, shared }) => shared.todos.some(todo => todo.id === message.id),
    },
  })

// 2. The client
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

// 3. The server: an exchange over the journal
const PAGE = 500

const server = Effect.gen(function* () {
  const contract = TodoSync.journalContract()
  const journal = yield* Journal.make({
    ...contract,
    file: 'todos.sqlite',
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
    validate: ({ key, operation, cursor }) => {
      if (String(operation.documentId) !== String(key)) throw new Error('Wrong document')
      if (operation.baseCursor > cursor) throw new Error('Operation is ahead of the server')
    },
  })
  const key = DocumentId.make('todos')

  const exchange = (
    principal: Principal,
    cursor: number,
    pending: ReadonlyArray<Operation>,
    seen?: string,
  ) =>
    Effect.gen(function* () {
      // A replica that last saw another history is answered from the start.
      const epoch = yield* journal.epoch(key)
      const from = seen !== undefined && seen !== epoch ? 0 : cursor
      if (from > (yield* journal.cursor(key)))
        return yield* Effect.fail(new Error(`Cursor ${cursor} is ahead of the server`))

      const acknowledged: Array<string> = []
      const rejected: Array<string> = []
      for (const operation of pending) {
        if (!principal.canWrite) {
          rejected.push(operation.opId)
          continue
        }
        // A refusal, a payload that cannot apply, and an id reused for other content
        // fail the same way on every retry, so they are rejected rather than resent.
        const result = yield* journal
          .append(key, operation, principal)
          .pipe(
            Effect.catchTag(
              ['OperationRejectedError', 'InvalidOperationError', 'IdentityConflictError'],
              () => Effect.void,
            ),
          )
        if (result === undefined) rejected.push(operation.opId)
        else acknowledged.push(result._tag === 'Committed' ? result.committed.opId : result.opId)
      }

      // Below the compaction floor there is no tail to send: send a checkpoint.
      const read = yield* journal.read(key, Cursor.make(from), { limit: PAGE }).pipe(
        Effect.map(Option.some),
        Effect.catchTag('CompactedCursorError', () => Effect.succeed(Option.none())),
      )
      if (Option.isNone(read)) {
        const { snapshot, cursor: at } = yield* journal.load(key)
        return {
          operations: [],
          acknowledged,
          rejected,
          checkpoint: { cursor: at, model: contract.snapshot.encode(snapshot) },
          epoch,
        }
      }
      return {
        operations: read.value.map(committed => ({
          ...committed.operation,
          serverSequence: committed.sequence,
          actorId: committed.actorId,
        })),
        acknowledged,
        rejected,
        more: read.value.length === PAGE,
        epoch,
      }
    })

  // One accepted socket; `principal` is what authenticating the connection established.
  const serve = (socket: SocketLike, principal: Principal) =>
    Sync.transport.serve(socket, {
      exchange: (cursor, pending, epoch) =>
        Effect.runPromise(exchange(principal, cursor, pending, epoch)),
      // A commit to this document wakes every connected replica.
      changes: listener => {
        const fiber = Effect.runFork(
          Stream.runForEach(journal.subscribe, changed =>
            Effect.sync(() => {
              if (changed === key) listener()
            }),
          ),
        )
        return () => Effect.runSync(Fiber.interrupt(fiber))
      },
    })

  return serve
}).pipe(Effect.scoped)
void server

// 4. Waiting for the commit
const TodoAgent = Agent.forApplication(App)
const agent = TodoAgent.make({
  messages: TodoAgent.expose(Message, {
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
void agent
