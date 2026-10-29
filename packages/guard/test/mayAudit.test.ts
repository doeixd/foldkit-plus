// @vitest-environment node
/**
 * What `may` tells a reader (#284), over real SQLite through Remote's
 * handlers: nothing of a row they cannot see, the same names for every reader
 * and row, and an `explain`'s sentence as the shared declaration words it.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, Remote } from 'foldkit-remote'
import { bind, databaseLayer, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards, MaySchema } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'member']) })
type User = typeof User.Type

const projects = sqliteTable('projects', { id: text('id').primaryKey() })
const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  projectId: text('project_id').notNull(),
})

const ProjectFields = Entity.define('Project', Schema.Struct({ id: Schema.String }))
const Related = Entity.relate(
  {
    Project: ProjectFields,
    Todo: Entity.define(
      'Todo',
      Schema.Struct({ id: Schema.String, ownerId: Schema.String, title: Schema.String }),
    ),
  },
  { Todo: { project: Relation.one(ProjectFields) } },
)

const G = Guards.declare(
  'Audit',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isOwner: guard.row(Related.Todo, p => Expr.eq(Related.Todo.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

const ONLY_ADMINS = 'Only an admin may delete a todo.'
const Todo = Related.Todo.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.isAdmin],
      Update: [G.isOwner, G.isAdmin],
      Delete: Guards.on([G.isAdmin], Guards.explain(ONLY_ADMINS)),
    },
    members: { title: { Update: [G.isAdmin] } },
    relations: { project: { Link: [G.isAdmin], Unlink: [G.isOwner, G.isAdmin] } },
  }),
  Guards.may,
)
const Project = Related.Project.pipe(Guards.attach(G, { row: { Read: [Guards.anyone] } }))

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
      derived: { may: { supplied: true } },
      visible: visible.Todo,
    },
    Project: { table: projects, visible: visible.Project },
  },
)
const server = RemoteServer.make({
  entities: [source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) }), source(Db.Project)],
})

const ada = Option.some<User>({ id: 'ada', role: 'member' })
const root = Option.some<User>({ id: 'root', role: 'admin' })
const visitor = Option.none<User>()

/** Remote's read of `ids`, as `principal` sends it, on a fresh database. */
const read = (principal: Option.Option<User>, ids: ReadonlyArray<string>, fields: string[]) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table projects (id text primary key);
    create table todos (id text primary key, owner_id text not null, title text not null, project_id text not null);
    insert into projects values ('p1');
    insert into todos values ('t1', 'ada', 'Own', 'p1'), ('t2', 'grace', 'Hidden', 'p1');
  `)
  return Effect.runPromise(
    RemoteServer.handlers(server, principal)
      .FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: ids.map(id => ({ entity: 'Todo', id, fields })),
      })
      .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  ).finally(() => sqlite.close())
}

const mayOf = async (principal: Option.Option<User>, id: string) => {
  const answer = await read(principal, [id], ['may'])
  return Schema.decodeUnknownSync(MaySchema)(answer.entities[0]?.values.may)
}

describe('may, as its reader receives it', () => {
  it('answers a row its reader cannot see as it answers one that does not exist', async () => {
    for (const fields of [['may'], ['title', 'may'], ['id']]) {
      const hidden = JSON.stringify(await read(ada, ['t2'], fields))
      const missing = JSON.stringify(await read(ada, ['t9'], fields))
      expect(hidden.replaceAll('t2', 't9')).toEqual(missing)
      expect(hidden).not.toContain('may')
    }
    // The same request answers the row to whom it may see it.
    expect((await read(root, ['t2'], ['may'])).entities.map(entity => entity.id)).toEqual(['t2'])
  })

  it('names the same interactions, members and relations for every reader and row', async () => {
    const shapes = new Set<string>()
    for (const [principal, id] of [
      [ada, 't1'],
      [root, 't1'],
      [root, 't2'],
    ] as const) {
      const may = await mayOf(principal, id)
      shapes.add(
        JSON.stringify([
          Object.keys(may.row).sort(),
          Object.keys(may.members).sort(),
          Object.keys(may.relations).sort(),
        ]),
      )
    }
    expect([...shapes]).toEqual([JSON.stringify([['Delete', 'Update'], ['title'], ['project']])])
  })

  it('gives a reason only as the shared declaration words it, and only to whom it refuses', async () => {
    expect((await mayOf(ada, 't1')).reasons).toEqual({ Delete: ONLY_ADMINS })
    expect((await mayOf(root, 't1')).reasons).toEqual({})
  })

  it('reads no row to a visitor', async () => {
    expect((await read(visitor, ['t1', 't2'], ['may'])).entities).toEqual([])
  })
})

describe('GuardServer.validate over a Source sharing may', () => {
  it('refuses it: may is answered per reader, though every reader may read the row', () => {
    const Open = Related.Todo.pipe(Guards.attach(G, { row: { Read: [Guards.anyone] } }), Guards.may)
    const OpenDb = bind(
      { Todo: Open, Project },
      {
        Todo: {
          table: todos,
          relations: { project: { field: todos.projectId } },
          derived: { may: { supplied: true } },
          visible: GuardDrizzle.visible(Policy, [Open]).Todo,
        },
        Project: { table: projects, visible: visible.Project },
      },
    )
    const sharing = (shared: ReadonlyArray<string>) => () =>
      GuardServer.validate(Policy, {
        entities: [Open],
        domain: Remote.define({ entities: [Open, Project] }),
        server: RemoteServer.make({
          entities: [source(OpenDb.Todo, { filter: GuardServer.filter(Open, Policy), shared })],
        }),
      })
    expect(sharing(['title'])).not.toThrow()
    expect(sharing(['title', 'may'])).toThrow(
      "Todo's Source shares may, which is answered for each reader",
    )
  })
})
