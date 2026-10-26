// @vitest-environment node
/**
 * A guard set's read rules compiled to SQL: one Todo read as its owner, a
 * member of its project (through an inherited Read), an admin and a visitor,
 * by id, as a ref's target and through a query, over real SQLite.
 */
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Operators, Relation } from 'foldkit-entity'
import { Query, REMOTE_PROTOCOL_VERSION, Remote } from 'foldkit-remote'
import {
  DrizzleOperators,
  bind,
  databaseLayer,
  query,
  source,
  type AnyEntityBinding,
  type DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type ServerDefinition } from 'foldkit-remote-server'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(Schema.String),
})
type User = typeof User.Type

const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
})

const ProjectBase = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const NoteBase = Entity.define('Note', Schema.Struct({ id: Schema.String }))
const Related = Entity.relate(
  {
    Project: ProjectBase,
    Note: NoteBase,
    Todo: Entity.define(
      'Todo',
      Schema.Struct({ id: Schema.String, ownerId: Schema.String, title: Schema.String }),
    ),
  },
  { Todo: { project: Relation.one(ProjectBase) }, Note: { parent: Relation.one(NoteBase) } },
)

const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isMember: guard.row(Related.Project, p => Expr.in(Related.Project.fields.id, p.projectIds)),
    isOwner: guard.row(Related.Todo, p => Expr.eq(Related.Todo.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

const Project = Related.Project.pipe(Guards.attach(G, { row: { Read: [G.isMember, G.isAdmin] } }))
const Todo = Related.Todo.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, Guards.inherit('project'), G.isAdmin],
      Update: [G.isOwner, G.isAdmin],
    },
    members: { title: { Read: Guards.on([G.isOwner], Guards.redact('(private)')) } },
  }),
  Guards.may,
)

const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

const visible = GuardDrizzle.visible(Policy, [Todo, Project])
const Db = bind(
  { Todo, Project },
  {
    Todo: {
      table: todos,
      relations: { project: { field: todos.projectId } },
      // Not a column: `GuardServer.filter` answers it.
      derived: { may: { supplied: true } },
      visible: visible.Todo,
    },
    Project: { table: projects, visible: visible.Project },
  },
)

const setup = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table projects (id text primary key, name text not null);
    create table todos (id text primary key, owner_id text not null, project_id text not null, title text not null);
    insert into projects values ('p1', 'Borealis'), ('p2', 'Apollo');
    insert into todos values
      ('t1', 'ada', 'p2', 'Own'),
      ('t2', 'grace', 'p1', 'Shared'),
      ('t3', 'grace', 'p2', 'Hidden');
  `)
  return { sqlite, database: drizzle({ client: sqlite }) }
}

const ada = Option.some<User>({ id: 'ada', role: 'member', projectIds: ['p1'] })
const root = Option.some<User>({ id: 'root', role: 'admin', projectIds: [] })
const visitor = Option.none<User>()

const run = async <A>(effect: Effect.Effect<A, unknown, never>) => Effect.runPromise(effect)

const read = async (
  principal: Option.Option<User>,
  binding: AnyEntityBinding,
  ids: string[],
  fields: string[],
) => {
  const { sqlite, database } = setup()
  try {
    const records = await run(
      source<Option.Option<User>>(binding)
        .read({ ids, fields, principal })
        .pipe(Effect.provide(databaseLayer(database))),
    )
    return Object.fromEntries(
      records.map(record => {
        const { id: _, ...asked } = record.values as Record<string, unknown>
        return [record.id, asked]
      }),
    )
  } finally {
    sqlite.close()
  }
}

const AllTodos = Query.make('AllTodos', {
  Input: Schema.Struct({}),
  Result: Query.connection({ name: 'Todo' }),
})
const orderBy = [{ key: todos.id, direction: 'asc' as const }]
const listed = query<Option.Option<User>, {}>(AllTodos, { entity: Db.Todo, orderBy })
const list = async (principal: Option.Option<User>) => {
  const { sqlite, database } = setup()
  try {
    const page = await run(
      listed
        .run({ input: {}, window: { first: 10 }, principal })
        .pipe(Effect.provide(databaseLayer(database))),
    )
    return page.edges.map(edge => edge.id)
  } finally {
    sqlite.close()
  }
}

describe('GuardDrizzle.visible', () => {
  it('reads by id, and lists, the same rows for each principal', async () => {
    const ids = ['t1', 't2', 't3']
    // Own, and through a project ada is a member of.
    expect(Object.keys(await read(ada, Db.Todo, ids, ['title']))).toEqual(['t1', 't2'])
    expect(await list(ada)).toEqual(['t1', 't2'])
    expect(await list(root)).toEqual(['t1', 't2', 't3'])
    expect(await list(visitor)).toEqual([])
    expect(Object.keys(await read(visitor, Db.Todo, ids, ['title']))).toEqual([])
  })

  it('hides a ref to a row the principal may not read', async () => {
    expect(await read(ada, Db.Todo, ['t1', 't2'], ['project'])).toEqual({
      t1: { project: null },
      t2: { project: 'Project:p1' },
    })
  })

  it('refuses a principal of another shape, rather than reading it as a visitor', async () => {
    // @ts-expect-error a principal of another shape
    const stranger: Option.Option<User> = Option.some({ id: 'ada' })
    await expect(read(stranger, Db.Todo, ['t1'], ['title'])).rejects.toThrow(
      /not an Option of the guard set's/,
    )
  })
})

describe('GuardServer.filter on a Drizzle source', () => {
  it('decides a member per record, reading the fields its rule needs', async () => {
    const server = RemoteServer.make({
      entities: [source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })],
    })
    const { sqlite, database } = setup()
    try {
      // `ownerId` is not asked for: the rule reads it all the same.
      const result = await run(
        RemoteServer.handlers(server, ada)
          .FoldkitRemoteRead({
            version: REMOTE_PROTOCOL_VERSION,
            requests: ['t1', 't2'].map(id => ({ entity: 'Todo', id, fields: ['title'] })),
          })
          .pipe(Effect.provide(databaseLayer(database))),
      )
      expect(result.entities.map(entity => [entity.id, entity.values])).toEqual([
        ['t1', { title: 'Own' }],
        ['t2', { title: '(private)' }],
      ])
    } finally {
      sqlite.close()
    }
  })
})

describe('may on a Drizzle source', () => {
  it('answers it from the row as its reader sees it, asked alone', async () => {
    const server = RemoteServer.make({
      entities: [source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })],
    })
    const mayOf = async (principal: Option.Option<User>) => {
      const { sqlite, database } = setup()
      try {
        const result = await run(
          RemoteServer.handlers(server, principal)
            .FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: ['t1', 't2'].map(id => ({ entity: 'Todo', id, fields: ['may'] })),
            })
            .pipe(Effect.provide(databaseLayer(database))),
        )
        return result.entities.map(entity => [entity.id, entity.values.may])
      } finally {
        sqlite.close()
      }
    }
    const may = (update: boolean) => ({
      row: { Update: update, Delete: true },
      reasons: {},
      members: {},
      relations: {},
    })
    expect(await mayOf(ada)).toEqual([
      ['t1', may(true)],
      ['t2', may(false)],
    ])
    // An admin's rules read nothing of the row: it is read all the same.
    expect(await mayOf(root)).toEqual([
      ['t1', may(true)],
      ['t2', may(true)],
    ])
  })
})

describe('GuardDrizzle.visible at registration', () => {
  it('refuses an inherited Read whose Entity is not listed, or has no Read rule', () => {
    expect(() => GuardDrizzle.visible(Policy, [Todo])).toThrow(
      /Todo inherits Project's Read, but Project is not listed/,
    )
    expect(() => GuardDrizzle.visible(Policy, [Todo, Related.Project])).toThrow(
      /Project has no Read rule/,
    )
  })

  it('refuses a loop of inherited Reads', () => {
    const Note = Related.Note.pipe(Guards.attach(G, { row: { Read: [Guards.inherit('parent')] } }))
    expect(() => GuardDrizzle.visible(Policy, [Note])).toThrow(/inherited Reads loop: Note → Note/)
  })
})

describe('GuardServer.validate over Drizzle', () => {
  const Data = Remote.define({ entities: [Todo, Project], queries: [AllTodos] })
  const Open = bind(
    { Todo, Project },
    {
      Todo: {
        table: todos,
        relations: { project: { field: todos.projectId } },
        derived: { may: { supplied: true } },
      },
      Project: { table: projects },
    },
  )
  const filter = GuardServer.filter(Todo, Policy)
  const check = (server: ServerDefinition<Option.Option<User>, DrizzleDatabase>) => () =>
    GuardServer.validate(Policy, { entities: [Todo, Project], domain: Data, server })

  it('passes bindings, a filter and a query built from the guard set', () => {
    expect(
      check(
        RemoteServer.make({
          entities: [
            source(Db.Todo, { filter }),
            source(Db.Project, { filter: GuardServer.filter(Project, Policy) }),
          ],
          queries: [listed],
        }),
      ),
    ).not.toThrow()
  })

  it('refuses a binding without the rule, a Source without the filter, and such a query', () => {
    expect(
      check(
        RemoteServer.make({
          entities: [source(Open.Todo, { filter }), source(Db.Project)],
          queries: [query<Option.Option<User>, {}>(AllTodos, { entity: Open.Todo, orderBy })],
        }),
      ),
    ).toThrow(
      "Todo's Source does not apply its Read rules; query AllTodos lists Todo without its Read rules",
    )
    expect(check(RemoteServer.make({ entities: [source(Db.Todo), source(Db.Project)] }))).toThrow(
      "Todo's Source does not apply its members' Read rules",
    )
    // Another Entity's filter does not decide this one's members.
    const projectFilter = GuardServer.filter(Project, Policy)
    expect(
      check(
        RemoteServer.make({
          entities: [source(Db.Todo, { filter: projectFilter }), source(Db.Project)],
        }),
      ),
    ).toThrow("Todo's Source does not apply its members' Read rules")
  })
})

describe('GuardDrizzle.visible over a rule calling a primitive operator', () => {
  const short = Expr.operator('acme.short', { input: [Schema.String], output: Schema.Boolean })
  const operators = {
    memory: Operators.memory(Operators.implement(short, name => name.length < 5)),
    sql: DrizzleOperators.make(
      DrizzleOperators.implement(short, ({ args: [name] }) => sql`length(${name}) < 5`),
    ),
  }
  const items = sqliteTable('items', { id: text('id').primaryKey(), name: text('name').notNull() })
  const PlainFields = Entity.define(
    'Plain',
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  )
  const P = Guards.declare(
    'Plains',
    User,
    guard => ({ isShort: guard.row(PlainFields, () => short(PlainFields.fields.name)) }),
    { key: user => user.id, unguarded: 'allow' },
  )
  const Plain = PlainFields.pipe(Guards.attach(P, { row: { Read: [P.isShort] } }))
  const policy = P.implement({}, { operators: operators.memory })

  it('is refused at startup when its SQL table does not run the operator', () => {
    expect(() => GuardDrizzle.visible(policy, [Plain])).toThrow(
      "Plain's isShort needs acme.short, which SQL here does not run",
    )
  })

  it('compiles by the binding’s table, so the database reads only the rows it allows', async () => {
    const visible = GuardDrizzle.visible(policy, [Plain], { operators: operators.sql })
    const Db = bind({ Plain }, { Plain: { table: items, visible: visible.Plain } }, { operators })
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('create table items (id text primary key, name text not null)')
    sqlite.exec("insert into items values ('x1', 'Bolt'), ('x2', 'Bolt cutter')")
    const read = await Effect.runPromise(
      source<Option.Option<User>>(Db.Plain)
        .read({ ids: ['x1', 'x2'], fields: ['name'], principal: Option.none() })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(read.map(row => row.id)).toEqual(['x1'])
    sqlite.close()
  })
})
