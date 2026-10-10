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
import { Context, Effect, Layer, Schedule, Schema, Scope, Stream, type Duration } from 'effect'
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
import { Remote, entityKey, type LiveChange } from 'foldkit-remote'
import {
  bind,
  databaseLayer,
  drizzleWrites,
  query,
  returning,
  source,
  writer,
  DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer, RemoteServerError } from 'foldkit-remote-server'
import type { EntitySource, LiveSource } from 'foldkit-remote-server'
import { Sync, documentId, type Operation, type Sync as SyncContract } from 'foldkit-sync'
import { LIST_WATCH } from './cache.js'
import { Domain } from './domain.js'
import { membershipChange } from './live.js'
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

/** One row: how many writes `todos` has taken, kept by triggers (`migrations/0002_changes.sql`). */
const todoChanges = sqliteTable('todo_changes', {
  id: integer('id').primaryKey(),
  count: integer('count').notNull(),
})

const decodeCount = Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Number }))

/** The write count of `todos`, for the live source to tell a quiet tick from a busy one. */
const changeCount: Effect.Effect<number, RemoteServerError, DrizzleDatabase> = Effect.gen(
  function* () {
    const db = yield* DrizzleDatabase
    const [row] = yield* Effect.tryPromise({
      try: () => Promise.resolve(db.select({ count: todoChanges.count }).from(todoChanges)),
      catch: () => new RemoteServerError({ message: 'The change count could not be read' }),
    })
    const decoded = yield* decodeCount(row).pipe(
      Effect.mapError(() => new RemoteServerError({ message: 'The change count is not a number' })),
    )
    return decoded.count
  },
)

const Db = bind(Domain, { Todo: { table: todos } })

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

type LivePatch = Schema.Schema.Type<typeof LiveChange>

/** The columns the list paints. A membership diff compares these, not relations. */
const LIST_FIELDS = ['id', 'title', 'done'] as const

interface ListedEdge {
  readonly entity: string
  readonly id: string
  readonly key: string
}

/**
 * The list the page's stream diffs, besides the rows it subscribed to. The
 * page watches one stable id, so this is how a row it has never seen can join.
 */
interface ListWatch {
  readonly identity: string
  readonly watchId: string
  readonly edges: (
    principal: string,
  ) => Effect.Effect<ReadonlyArray<ListedEdge>, RemoteServerError, DrizzleDatabase>
}

/** A failed list read is a skipped tick, not a dead stream. */
const orSkip = <A, R>(effect: Effect.Effect<A, RemoteServerError, R>) =>
  effect.pipe(
    Effect.catchTag('RemoteServerError', () => Effect.succeed(undefined as A | undefined)),
  )

const picked = (
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = Object.create(null)
  for (const field of fields) out[field] = values[field]
  return out
}

/**
 * A live source that polls D1 from inside the subscriber's own request.
 * Each tick re-reads every subscribed row through the entity's own source,
 * under the subscriber's principal, and emits a patch for what moved since
 * the last tick: a row absent at one tick and present at the next patches
 * whole (so a subscription opened before the row existed still sees it
 * appear), and one that was present and is gone deletes. Scalar fields
 * compare by identity; relations are out of scope for the poll.
 *
 * With a list watch it also re-reads that query's window. A field change on
 * a listed row is a patch. An id that joined is a patch, then a connection
 * insert; one that left is a delete, then a connection remove. The first
 * read is silent. Subscribed rows are reported before the list, so a stream
 * opened on one row still sees that row's event first.
 *
 * When every requirement is the watch id, the open emits one
 * `ConnectionInvalidate` after that silent read. A query that started before
 * the stream was watching can answer with the old page; the invalidate makes
 * the page ask again once the stream is already open. Later ticks do not
 * invalidate: that would mark the list busy on every change.
 *
 * With `changes`, the table's write count, a tick reads it first and reads
 * nothing else while it has not moved: most ticks are one small query. It is
 * read before the rows it guards, so a write between the two shows on the
 * next tick. A count that cannot be read counts as moved.
 */
export const pollLive = (
  binding: EntitySource<string, DrizzleDatabase>,
  options: {
    readonly interval?: Duration.Input | undefined
    readonly list?: ListWatch | undefined
    readonly changes?: Effect.Effect<number, RemoteServerError, DrizzleDatabase> | undefined
  } = {},
): LiveSource<string, DrizzleDatabase> => ({
  entity: binding.entity,
  subscribe: ({ requirements, after, principal }) => {
    const wanted = new Map<string, Set<string>>()
    for (const requirement of requirements) {
      if (requirement.entity !== binding.entity) continue
      const fields = wanted.get(requirement.id) ?? new Set<string>()
      for (const field of requirement.fields) fields.add(field)
      wanted.set(requirement.id, fields)
    }
    const { list, changes } = options
    if (wanted.size === 0 && list === undefined) return Stream.never
    const onlyWatch =
      list !== undefined &&
      requirements.length > 0 &&
      requirements.every(
        requirement => requirement.entity === binding.entity && requirement.id === list.watchId,
      )
    return Stream.unwrap(
      Effect.gen(function* () {
        const read = (id: string, fields: ReadonlyArray<string>) =>
          binding.read({ ids: [id], fields: [...fields], principal })
        const countNow = changes === undefined ? Effect.void : orSkip(changes)
        // The count the rows were last read at; none reads every tick.
        let readAt = yield* countNow
        // The baseline: what each subscribed row looks like when the
        // subscription opens. A change that landed before it is already in
        // it, so open the stream before the change you wait for.
        const previous = new Map<string, Record<string, unknown>>()
        for (const [id, fields] of wanted) {
          const [record] = yield* read(id, [...fields])
          if (record !== undefined) previous.set(id, record.values)
        }
        let knownIds: Set<string> | undefined
        const rowValues = new Map<string, Readonly<Record<string, unknown>>>()
        let cursor = after
        let invalidated = false

        const loadList = Effect.gen(function* () {
          if (list === undefined) return undefined
          const edges = yield* orSkip(list.edges(principal))
          if (edges === undefined) return undefined
          const readable = new Map<string, Readonly<Record<string, unknown>>>()
          if (edges.length === 0) return { edges, readable }
          const records = yield* orSkip(
            binding.read({
              ids: edges.map(edge => edge.id),
              fields: [...LIST_FIELDS],
              principal,
            }),
          )
          if (records === undefined) return undefined
          for (const record of records) readable.set(record.id, record.values)
          return { edges, readable }
        })

        const seed = (loaded: {
          readonly edges: ReadonlyArray<ListedEdge>
          readonly readable: ReadonlyMap<string, Readonly<Record<string, unknown>>>
        }) => {
          const ids = new Set<string>()
          for (const edge of loaded.edges) {
            const values = loaded.readable.get(edge.id)
            if (values === undefined) continue
            ids.add(edge.id)
            rowValues.set(edge.id, values)
          }
          knownIds = ids
        }

        const invalidate = (): LivePatch | undefined => {
          if (list === undefined || !onlyWatch || invalidated) return undefined
          invalidated = true
          return {
            _tag: 'ConnectionInvalidate',
            connection: list.identity,
            cursor: (cursor += 1),
          }
        }

        const opening: LivePatch[] = []
        const baseline = yield* loadList
        if (baseline !== undefined) {
          seed(baseline)
          const marked = invalidate()
          if (marked !== undefined) opening.push(marked)
        }

        const tick = Effect.gen(function* () {
          const count = yield* countNow
          if (count !== undefined && count === readAt) return []
          readAt = count
          const patches: LivePatch[] = []
          const patched = new Set<string>()
          const deleted = new Set<string>()
          for (const [rowId, fields] of wanted) {
            const [record] = yield* read(rowId, [...fields])
            const before = previous.get(rowId)
            if (record === undefined) {
              if (before !== undefined) {
                previous.delete(rowId)
                deleted.add(rowId)
                patches.push({
                  _tag: 'EntityDeleted',
                  entity: binding.entity,
                  id: rowId,
                  cursor: (cursor += 1),
                })
              }
              continue
            }
            const changed = [...fields].filter(field => before?.[field] !== record.values[field])
            if (changed.length === 0) continue
            previous.set(rowId, record.values)
            patched.add(rowId)
            patches.push({
              _tag: 'EntityPatched',
              entity: binding.entity,
              id: rowId,
              values: picked(record.values, changed),
              changed,
              cursor: (cursor += 1),
            })
          }
          const loaded = yield* loadList
          if (loaded === undefined || list === undefined) return patches
          if (knownIds === undefined) {
            seed(loaded)
            const marked = invalidate()
            if (marked !== undefined) patches.push(marked)
            return patches
          }
          const current = knownIds
          const next = new Set<string>()
          for (const edge of loaded.edges) {
            if (loaded.readable.has(edge.id) || current.has(edge.id)) next.add(edge.id)
          }
          for (const id of current) {
            if (!next.has(id) || patched.has(id)) {
              const values = loaded.readable.get(id)
              if (patched.has(id) && values !== undefined) rowValues.set(id, values)
              continue
            }
            const values = loaded.readable.get(id)
            if (values === undefined) continue
            const before = rowValues.get(id)
            const changed = LIST_FIELDS.filter(field => before?.[field] !== values[field])
            if (changed.length > 0) {
              patches.push({
                _tag: 'EntityPatched',
                entity: binding.entity,
                id,
                values: picked(values, changed),
                changed: [...changed],
                cursor: (cursor += 1),
              })
            }
            rowValues.set(id, values)
          }
          const change = membershipChange(current, next)
          if (change !== undefined) {
            for (const id of change.added) {
              const edge = loaded.edges.find(item => item.id === id)
              const values = loaded.readable.get(id)
              // No row to assemble from: leave it unknown so the next tick retries.
              if (edge === undefined || values === undefined) {
                next.delete(id)
                continue
              }
              if (!patched.has(id)) {
                patches.push({
                  _tag: 'EntityPatched',
                  entity: binding.entity,
                  id,
                  values: picked(values, LIST_FIELDS),
                  changed: [...LIST_FIELDS],
                  cursor: (cursor += 1),
                })
              }
              patches.push({
                _tag: 'ConnectionInsert',
                connection: list.identity,
                position: 'prepend',
                edge: { entity: edge.entity, id: edge.id, key: edge.key },
                cursor: (cursor += 1),
              })
              rowValues.set(id, values)
            }
            for (const id of change.removed) {
              if (!deleted.has(id)) {
                patches.push({
                  _tag: 'EntityDeleted',
                  entity: binding.entity,
                  id,
                  cursor: (cursor += 1),
                })
              }
              patches.push({
                _tag: 'ConnectionRemove',
                connection: list.identity,
                edge: { entity: binding.entity, id, key: entityKey(binding.entity, id) },
                cursor: (cursor += 1),
              })
              rowValues.delete(id)
            }
          }
          knownIds = next
          return patches
        })

        return Stream.concat(
          Stream.fromIterable(opening),
          Stream.fromSchedule(Schedule.spaced(options.interval ?? '250 millis')).pipe(
            Stream.flatMap(() => Stream.fromIterableEffect(tick)),
          ),
        )
      }),
    )
  },
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
  const AllTodosSource = query(AllTodos, {
    entity: Db.Todo,
    // Title, then id. The page sorts the same way (`order.ts`).
    orderBy: [
      { column: todos.title, direction: 'asc' },
      { column: todos.id, direction: 'asc' },
    ],
  })
  const list = AllTodos.ref({}).identity
  // The page subscribes only to LIST_WATCH, so the stream stays open across
  // local edits. This re-read is how another tab's row joins or leaves.
  const TodoLive = pollLive(TodoSource, {
    list: {
      identity: list,
      watchId: LIST_WATCH,
      edges: principal =>
        AllTodosSource.run({
          input: {},
          window: { first: TODO_PAGE_SIZE },
          principal,
        }).pipe(Effect.map(page => page.edges)),
    },
    changes: changeCount,
  })
  const written = returning(Db.Todo, ['id', 'title', 'done'])

  const Create = RemoteServer.mutation(CreateTodo, ({ input }) =>
    Effect.gen(function* () {
      const db = (yield* DrizzleDatabase) as unknown as InsertOnConflict
      const inserted = yield* Effect.promise(() =>
        Promise.resolve(
          db
            .insert(todos)
            .values({ id: input.id, title: input.title, done: 0 })
            .onConflictDoNothing()
            .returning(written.columns),
        ),
      )
      // No row back means the id was already there: answer with the row as it is.
      const entities =
        inserted.length > 0 ? written.patches(inserted) : yield* returning.row(Db.Todo, input.id)
      return {
        output: { id: input.id },
        entities,
        connections: [RemoteServer.prepend(list, { entity: 'Todo', id: input.id })],
      }
    }),
  )

  // Declared writes: the binding's writer lands them, and the row as written answers.
  const Rename = RemoteServer.write(RenameTodo, writer(Db.Todo))
  const Toggle = RemoteServer.write(ToggleTodo, writer(Db.Todo))

  const Delete = RemoteServer.mutation(DeleteTodo, ({ input }) =>
    Effect.gen(function* () {
      const writes = yield* drizzleWrites
      yield* Effect.promise(() =>
        Promise.resolve(writes.delete(todos).where(eq(todos.id, input.id))),
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
