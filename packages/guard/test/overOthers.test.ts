// @vitest-environment node
/**
 * A guard that reads another row decides authorization from a row a
 * concurrent write can change, so it is held to its writer's store as a data
 * rule over other rows is. `RemoteServer.write` refuses it, naming the guard,
 * on a store that does not run the writers under one parent one at a time
 * (Postgres at read committed), and registers it on one that does (SQLite and
 * D1, Postgres said to run serializable): for an update, a delete, and each
 * row a delete takes or unlinks. On SQLite two requests race against such
 * guards, each passing a rule the other's write breaks, and exactly one lands.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { boolean as pgBoolean, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Result, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { postgres } from 'foldkit-remote-drizzle/pg'
import { RemoteServer, type StoreCapabilities } from 'foldkit-remote-server'
import { afterAll, describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

postgres()

const User = Schema.Struct({ id: Schema.String })
const Fields = {
  Project: Entity.define('Project', Schema.Struct({ id: Schema.String, open: Schema.Boolean })),
  Task: Entity.define('Task', Schema.Struct({ id: Schema.String, active: Schema.Boolean })),
}
const Related = Entity.relate(Fields, { Task: { project: Relation.one(Fields.Project) } })
const G = Guards.declare(
  'Work',
  User,
  guard => ({
    // Over the parent row: a task changes only while its project is open.
    projectOpen: guard.row(Related.Task, () =>
      Expr.eq(Expr.path(Related.Task.relations.project, Related.Project.fields.open), true),
    ),
    // Over the rows under it: a project changes only while none of its tasks is active.
    noActiveTask: guard.row(Related.Project, () =>
      Expr.not(
        Expr.exists(Related.Task.relations.project, Expr.eq(Related.Task.fields.active, true)),
      ),
    ),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Task = Related.Task.pipe(
  Guards.attach(G, { row: { Update: [G.projectOpen], Delete: [G.projectOpen] } }),
)
const Project = Related.Project.pipe(Guards.attach(G, { row: { Update: [G.noActiveTask] } }))
const Policy = G.implement({})

const Activate = Mutation.write(
  'Activate',
  Write.update(Entity.input(Task, Schema.Struct({ id: Schema.String, active: Schema.Boolean })), {
    id: 'id',
  }),
)
const Close = Mutation.write(
  'Close',
  Write.update(Entity.input(Project, Schema.Struct({ id: Schema.String, open: Schema.Boolean })), {
    id: 'id',
  }),
)
const DropTask = Mutation.write(
  'DropTask',
  Write.delete(Entity.input(Task, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
const AddTask = Mutation.write(
  'AddTask',
  Write.insert(
    Entity.input(
      Task,
      Schema.Struct({ id: Schema.String, active: Schema.Boolean, projectId: Schema.String }),
      { projectId: Relation.input(Related.Task.relations.project) },
    ),
    { id: 'id' },
  ),
)

const sqlite = (() => {
  const projects = sqliteTable('projects', {
    id: text('id').primaryKey(),
    open: integer('open', { mode: 'boolean' }).notNull(),
  })
  const tasks = sqliteTable('tasks', {
    id: text('id').primaryKey(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    projectId: text('project_id').notNull(),
  })
  const visible = GuardDrizzle.visible(Policy, [Task, Project])
  return bind(
    { Project, Task },
    {
      Project: { table: projects, visible: visible.Project },
      Task: {
        table: tasks,
        visible: visible.Task,
        relations: { project: { field: tasks.projectId } },
      },
    },
  )
})()
const pg = (() => {
  const projects = pgTable('projects', {
    id: pgText('id').primaryKey(),
    open: pgBoolean('open').notNull(),
  })
  const tasks = pgTable('tasks', {
    id: pgText('id').primaryKey(),
    active: pgBoolean('active').notNull(),
    projectId: pgText('project_id').notNull(),
  })
  const visible = GuardDrizzle.visible(Policy, [Task, Project])
  return bind(
    { Project, Task },
    {
      Project: { table: projects, visible: visible.Project },
      Task: {
        table: tasks,
        visible: visible.Task,
        relations: { project: { field: tasks.projectId } },
      },
    },
  )
})()

describe('a guard over another row, at registration', () => {
  it('is refused on Postgres at read committed, naming the guard, the capability and the store', () => {
    const guarded = GuardServer.writer(Task, Policy, writer(pg.Task))
    expect(() => RemoteServer.write(Activate, guarded)).toThrow(
      `store "Postgres" (read-committed per transaction, does not lock the parent row) cannot hold:\n  - "Activate guard "projectOpen" (Task's Update rule)" needs parent-serialized (writers of the rows under one parent run one at a time), judged in the statement that writes: it reads another row, which a concurrent write can change`,
    )
    expect(() => RemoteServer.write(DropTask, guarded)).toThrow(
      `"DropTask guard "projectOpen" (Task's Delete rule)" needs parent-serialized`,
    )
    expect(() =>
      RemoteServer.write(Close, GuardServer.writer(Project, Policy, writer(pg.Project))),
    ).toThrow(`"Close guard "noActiveTask" (Project's Update rule)" needs parent-serialized`)
  })

  it('registers on Postgres said to run serializable, and on SQLite and D1', () => {
    const serializable = { isolation: 'serializable' } as const
    for (const guarded of [
      GuardServer.writer(Task, Policy, writer(pg.Task, serializable)),
      GuardServer.writer(Task, Policy, writer(sqlite.Task)),
    ]) {
      expect(() => RemoteServer.write(Activate, guarded)).not.toThrow()
      expect(() => RemoteServer.write(DropTask, guarded)).not.toThrow()
    }
  })

  it('is refused on SQLite and D1 through a writer that does not say it judges in its statement', () => {
    const { judgesInStatement: _, ...readFirst } = writer(sqlite.Task)
    expect(() => RemoteServer.write(Activate, GuardServer.writer(Task, Policy, readFirst))).toThrow(
      `store "SQLite" (serializable per statement, does not lock the parent row) cannot hold:\n  - "Activate guard "projectOpen" (Task's Update rule)" needs parent-serialized (writers of the rows under one parent run one at a time), judged from a read before the write`,
    )
  })

  it('asks nothing of the store for a write its rules over other rows do not judge', () => {
    // An insert is judged by the Create rule, which reads no other row.
    expect(() =>
      RemoteServer.write(AddTask, GuardServer.writer(Task, Policy, writer(pg.Task))),
    ).not.toThrow()
  })

  it("keeps what the writer's own needs say", () => {
    const store: StoreCapabilities = {
      name: 'locking',
      isolation: 'read-committed',
      isolates: 'transaction',
      parentRowLock: true,
    }
    const inner = {
      ...writer(sqlite.Task),
      store,
      needs: () => [
        { rule: 'its own rule', needs: 'parent-serialized' as const, because: 'it says so' },
      ],
    }
    const locking = GuardServer.writer(Task, Policy, inner)
    expect(() => RemoteServer.write(Activate, locking)).not.toThrow()
    const statement = GuardServer.writer(Task, Policy, {
      ...inner,
      store: { ...store, isolates: 'statement' },
    })
    expect(() => RemoteServer.write(Activate, statement)).toThrow(
      '"Activate its own rule" needs parent-serialized (writers of the rows under one parent run one at a time), judged from a read before the write',
    )
  })
})

// A delete takes rows under their own Delete rule and clears links under their Update
// rule: such a rule that reads another row is held to the store as the row's own is.
describe('the rules of the rows a delete takes or unlinks', () => {
  const Base = {
    Board: Entity.define('Board', Schema.Struct({ id: Schema.String, open: Schema.Boolean })),
    Card: Entity.define('Card', Schema.Struct({ id: Schema.String })),
    Pin: Entity.define('Pin', Schema.Struct({ id: Schema.String })),
  }
  const Linked = Entity.relate(Base, {
    Card: { board: Relation.one(Base.Board, { onDelete: 'cascade', authorizedBy: 'child' }) },
    Pin: { board: Relation.one(Base.Board, { optional: true, onDelete: 'setNull' }) },
  })
  const B = Guards.declare(
    'Boards',
    User,
    guard => ({
      cardBoardOpen: guard.row(Linked.Card, () =>
        Expr.eq(Expr.path(Linked.Card.relations.board, Linked.Board.fields.open), true),
      ),
      pinBoardOpen: guard.row(Linked.Pin, () =>
        Expr.eq(Expr.path(Linked.Pin.relations.board, Linked.Board.fields.open), true),
      ),
    }),
    { key: user => user.id, unguarded: 'allow' },
  )
  const Board = Linked.Board.pipe(Guards.attach(B, { row: {} }))
  const Card = Linked.Card.pipe(Guards.attach(B, { row: { Delete: [B.cardBoardOpen] } }))
  const Pin = Linked.Pin.pipe(Guards.attach(B, { row: { Update: [B.pinBoardOpen] } }))
  const BoardPolicy = B.implement({})
  const boards = pgTable('boards', {
    id: pgText('id').primaryKey(),
    open: pgBoolean('open').notNull(),
  })
  const cards = pgTable('cards', {
    id: pgText('id').primaryKey(),
    boardId: pgText('board_id').notNull(),
  })
  const pins = pgTable('pins', { id: pgText('id').primaryKey(), boardId: pgText('board_id') })
  const visible = GuardDrizzle.visible(BoardPolicy, [Board, Card, Pin])
  const Db = bind(
    { Board, Card, Pin },
    {
      Board: { table: boards, visible: visible.Board },
      Card: { table: cards, visible: visible.Card, relations: { board: { field: cards.boardId } } },
      Pin: { table: pins, visible: visible.Pin, relations: { board: { field: pins.boardId } } },
    },
  )
  const DropBoard = Mutation.write(
    'DropBoard',
    Write.delete(Entity.input(Board, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )
  const dropping = (options: { readonly isolation?: 'serializable' }) => () =>
    RemoteServer.write(
      DropBoard,
      GuardServer.writer(Board, BoardPolicy, writer(Db.Board, options), {
        children: [Card, Pin],
      }),
    )

  it('holds a taken row’s Delete rule to the store', () => {
    expect(dropping({})).toThrow(
      `"DropBoard guard "cardBoardOpen" (Card's Delete rule)" needs parent-serialized`,
    )
  })

  it('holds an unlinked row’s Update rule to the store', () => {
    expect(dropping({})).toThrow(
      `"DropBoard guard "pinBoardOpen" (Pin's Update rule)" needs parent-serialized`,
    )
  })

  it('registers both where the store serializes', () => {
    expect(dropping({ isolation: 'serializable' })).not.toThrow()
  })
})

describe('two requests racing against guards over each other’s rows, on SQLite', () => {
  const client = new DatabaseSync(':memory:')
  client.exec('create table projects (id text primary key, open integer not null)')
  client.exec(
    'create table tasks (id text primary key, active integer not null, project_id text not null)',
  )
  afterAll(() => client.close())

  // Made on first send, so a registration that refuses fails the test rather than the file.
  const handlers = () =>
    RemoteServer.handlers(
      RemoteServer.make<Option.Option<{ readonly id: string }>, DrizzleDatabase>({
        entities: [],
        mutations: [
          RemoteServer.write(Activate, GuardServer.writer(Task, Policy, writer(sqlite.Task))),
          RemoteServer.write(Close, GuardServer.writer(Project, Policy, writer(sqlite.Project))),
        ],
      }),
      Option.some({ id: 'ada' }),
    )
  const send = (requestId: string, mutation: string, input: unknown) =>
    Effect.runPromise(
      handlers()
        .FoldkitRemoteMutate({ requestId, mutation, input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client })))),
    )
  const state = Schema.decodeUnknownSync(
    Schema.Struct({ open: Schema.Number, active: Schema.Number }),
  )

  it('lands exactly the write the guards allow: never a closed project with an active task', async () => {
    const outcomes: Array<string> = []
    for (let round = 0; round < 12; round++) {
      client.exec('delete from tasks')
      client.exec('delete from projects')
      client.exec("insert into projects values ('p1', 1)")
      client.exec("insert into tasks values ('t1', 0, 'p1')")
      const answers = await Promise.all([
        send(`a${round}`, 'Activate', { id: 't1', active: true }),
        send(`c${round}`, 'Close', { id: 'p1', open: false }),
      ])
      const landed = answers.map(
        Result.match({ onSuccess: () => 'landed', onFailure: error => error._tag }),
      )
      const left = state(
        client
          .prepare(
            'select p.open as open, t.active as active from projects p join tasks t on t.project_id = p.id',
          )
          .get(),
      )
      expect(left).toEqual({
        open: landed[1] === 'landed' ? 0 : 1,
        active: landed[0] === 'landed' ? 1 : 0,
      })
      outcomes.push(landed.join(' / '))
    }
    for (const outcome of outcomes) {
      expect(['landed / Forbidden', 'Forbidden / landed']).toContain(outcome)
    }
  })
})
