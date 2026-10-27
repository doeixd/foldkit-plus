/**
 * The Cloudflare example's server: one todos table, read by Remote and written
 * two ways. The page's writes are Remote mutations. Sync still journals intents
 * through the Durable Object; `pnpm demo` and the tests speak that path.
 *
 * - `todos`, a Drizzle table, bound to the domain's `Todo`.
 * - `AllTodos`, the list query, answered by `remote-drizzle` over D1.
 * - `CreateTodo`, `RenameTodo`, `ToggleTodo`, `DeleteTodo`: the page's writes.
 *   Toggle stores the given 0 or 1, so a retry is the same write. Create does
 *   nothing when the id is already there.
 * - `App`/`Message`/`update` and `Todos`, the Sync contract: intents mint,
 *   facts record, and the journal orders them.
 * - `openTodosJournal`, a D1 journal through `foldkit-durable/core`.
 * - `settleTodos`, the exchange's `settle`: committed operations land in the
 *   table, crash-safe through `recover`.
 * - `TodoLive`, the live source: it polls D1 from inside the subscriber's own
 *   request, because a worker cannot wake another request's stream. An
 *   in-memory hub push reaches no one once the publisher is a different
 *   request — in production not even the same isolate — so what crosses
 *   requests here is D1, and each live stream re-reads it. A field change is
 *   a patch. The list's own ids are diffed too, so a row can join or leave.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { D1Database } from '@cloudflare/workers-types'
import { Context, Effect, Layer, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import * as D1Client from '@effect/sql-d1/D1Client'
import {
  actorId,
  Cursor,
  documentId as durableDocumentId,
  Journal,
  opId,
} from 'foldkit-durable/core'
import type { Journal as JournalShape } from 'foldkit-durable/core'
import { Remote } from 'foldkit-remote'
import {
  bind,
  databaseLayer,
  drizzleWrites,
  pollLive,
  query,
  returning,
  rowLog,
  runStatement,
  source,
  writer,
  DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Sync, documentId, type Operation, type Sync as SyncContract } from 'foldkit-sync'
import { LIST_WATCH } from './cache.js'
import { Domain } from './domain.js'
import {
  AllTodos,
  CreateTodo,
  DeleteTodo,
  RenameTodo,
  TODO_PAGE_SIZE,
  ToggleTodo,
} from './operations.js'

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  done: integer('done').notNull().default(0),
})

export const Db = bind(Domain, { Todo: { table: todos } })

const Model = Schema.Struct({
  todos: Schema.Array(
    Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean }),
  ),
})
type Model = typeof Model.Type
export const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  DeletedTodo: { id: Schema.String },
})
export type Message = typeof Message.Type
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { todos: [...model.todos, { id, title, done: false }] },
    }),
    RenamedTodo: ({ id, title }) => ({
      model: {
        todos: model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      },
    }),
    ToggledTodo: ({ id }) => ({
      model: {
        todos: model.todos.map(todo => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
      },
    }),
    DeletedTodo: ({ id }) => ({
      model: { todos: model.todos.filter(todo => todo.id !== id) },
    }),
  })
const App = Surface.application({ Model, Message, initial: { todos: [] }, update })
export const Todos: SyncContract<Message, Model> = Sync.forApplication(App).make({
  documentId: documentId('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [
    Message.CreatedTodo,
    Message.RenamedTodo,
    Message.ToggledTodo,
    Message.DeletedTodo,
  ]),
})

export type Shared = typeof Todos extends Sync<Message, infer S> ? S : never
export type TodoJournal = JournalShape<Operation, Shared, string, Operation>

const TODOS_KEY = 'todos'
const SETTLED_KEY = 'todos-settled'

/** Opens the document's journal on D1. The scope outlives the open. */
export const openTodosJournal = async (db: D1Database): Promise<TodoJournal> => {
  const TodosJournal = Journal.define<Operation, Shared, string>('app/todos')
  const live = TodosJournal.layer({
    ...Todos.journalContract(),
    d1: true,
    opId: operation => opId(operation.opId),
    actorId: principal => actorId(principal),
  }).pipe(Layer.provide(D1Client.layer({ db })))
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(Layer.buildWithScope(live, scope))
  return Context.get(context, TodosJournal.tag)
}

/**
 * Applies what committed to the todos table, crash-safe through `recover`.
 * The cursor persists in `durable_meta`, so a restarted settle resumes where
 * the last one settled. Live streams learn of the rows by re-reading D1
 * themselves (see `TodoLive`); nothing here pushes across requests.
 */
export const settleTodos = (journal: TodoJournal, db: D1Database): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const saved = yield* Effect.promise(() =>
      db
        .prepare('SELECT value FROM durable_meta WHERE key = ?')
        .bind(SETTLED_KEY)
        .first<string>('value'),
    )
    // `recover` runs the intent once and records it by the application's own
    // effect identity, so an interrupted intent is retried rather than
    // applied twice, and a failed one refuses to settle instead of advancing.
    const settled = yield* journal.recover({
      key: durableDocumentId(TODOS_KEY),
      from: Cursor.make(Number(saved ?? 0)),
      intents: operation => [
        {
          key: `todos:${String(operation.opId)}`,
          run: applyTodo(db, operation),
        },
      ],
    })
    yield* Effect.promise(() =>
      db
        .prepare(
          'INSERT INTO durable_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .bind(SETTLED_KEY, String(Number(settled)))
        .run(),
    )
  })

const applyTodo = (db: D1Database, operation: Operation): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const decoded = Schema.decodeUnknownSync(Message)(operation.message)
    yield* Message.match(decoded, {
      CreatedTodo: ({ id, title }) =>
        Effect.promise(() =>
          db
            .prepare(
              'INSERT INTO todos (id, title, done) VALUES (?, ?, 0) ON CONFLICT(id) DO NOTHING',
            )
            .bind(id, title)
            .run(),
        ),
      RenamedTodo: ({ id, title }) =>
        Effect.promise(() =>
          db.prepare('UPDATE todos SET title = ? WHERE id = ?').bind(title, id).run(),
        ),
      ToggledTodo: ({ id }) =>
        Effect.promise(() =>
          db.prepare('UPDATE todos SET done = 1 - done WHERE id = ?').bind(id).run(),
        ),
      DeletedTodo: ({ id }) =>
        Effect.promise(() => db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run()),
    })
  })

/**
 * Inserts that can say "already there". `drizzleWrites` has no conflict
 * clause, so this is the drizzle client the layer holds, seen with one.
 */
interface InsertOnConflict {
  insert(table: typeof todos): {
    values(values: { id: string; title: string; done: number }): {
      onConflictDoNothing(): {
        returning(
          columns: Record<string, unknown>,
        ): PromiseLike<ReadonlyArray<Record<string, unknown>>>
      }
    }
  }
}

/** Builds the Remote server over D1: sources, the page's mutations, a polling live source. */
export const makeServer = () => {
  // Principals are pinned explicitly: every caller is an authenticated actor
  // name, and every field is readable to one.
  const TodoSource = source<string>(Db.Todo)
  // The body's order, title then id, which the page places rows by too.
  const AllTodosSource = query(AllTodos, { entity: Db.Todo })
  const list = AllTodos.ref({}).identity
  // The page subscribes only to LIST_WATCH, so the stream stays open across
  // local edits. This re-read is how another tab's row joins or leaves.
  const TodoLive = pollLive(TodoSource, {
    lists: [
      {
        identity: list,
        watchId: LIST_WATCH,
        // The columns the list paints: what a row's join and patch carry.
        fields: ['id', 'title', 'done'],
        edges: principal =>
          AllTodosSource.run({
            input: {},
            window: { first: TODO_PAGE_SIZE },
            principal,
          }).pipe(Effect.map(page => page.edges)),
      },
    ],
    changes: rowLog(Db.Todo),
  })
  const written = returning(Db.Todo, ['id', 'title', 'done'])

  const Create = RemoteServer.mutation(CreateTodo, ({ input }) =>
    Effect.gen(function* () {
      const db = (yield* DrizzleDatabase) as unknown as InsertOnConflict
      const inserted = yield* runStatement(
        () =>
          db
            .insert(todos)
            .values({ id: input.id, title: input.title, done: 0 })
            .onConflictDoNothing()
            .returning(written.columns),
        'Database write failed',
      )
      // No row back means the id was already there: answer with the row as it is.
      const entities =
        inserted.length > 0 ? written.patches(inserted) : yield* returning.row(Db.Todo, input.id)
      // No list named: the client places the row by the list's body.
      return { output: { id: input.id }, entities }
    }),
  )

  // Declared writes: the binding's writer lands them, and the row as written answers.
  const Rename = RemoteServer.write(RenameTodo, writer(Db.Todo))
  const Toggle = RemoteServer.write(ToggleTodo, writer(Db.Todo))

  const Delete = RemoteServer.mutation(DeleteTodo, ({ input }) =>
    Effect.gen(function* () {
      const writes = yield* drizzleWrites
      yield* runStatement(
        () => writes.delete(todos).where(eq(todos.id, input.id)),
        'Database write failed',
      )
      return { output: {}, deleted: [{ entity: 'Todo', id: input.id }] }
    }),
  )

  const server = RemoteServer.make({
    entities: [TodoSource],
    queries: [AllTodosSource],
    mutations: [Create, Rename, Toggle, Delete],
    live: [TodoLive],
  })
  const Data = Remote.define({
    entities: [Db.Todo],
    queries: [AllTodos],
    mutations: [CreateTodo, RenameTodo, ToggleTodo, DeleteTodo],
  })
  RemoteServer.validate(Data, server)
  return { server }
}

/** Provides the D1-backed database for one request's environment. */
export const databaseFrom = (db: D1Database) => databaseLayer(drizzle(db))
