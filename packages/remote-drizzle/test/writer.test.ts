/**
 * A declared `Write` served with no handler: `RemoteServer.update` binds the
 * input, and `writer` lands it in the table in one `update ... returning`.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { applyEdits, bind, databaseLayer, writer } from '../src/index.js'

const Project = Entity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    revision: Schema.Number,
  }),
)
const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  revision: integer('revision').notNull(),
})
const Db = bind({ Project }, { Project: { table: projects } })

const EditInput = Entity.input(
  Project,
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const Edit = Mutation.update('EditProject', Write.update(EditInput, { id: 'id' }))
const GuardedInput = Entity.input(
  Project,
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)
const Guarded = Mutation.update(
  'RenameProject',
  Write.update(GuardedInput, { id: 'id', expect: 'revision' }),
)

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(
  'create table projects (id text primary key, name text not null, status text not null, revision integer not null)',
)
afterEach(() => {
  sqlite.exec('delete from projects')
})
const seed = () => sqlite.exec("insert into projects values ('p1', 'Apollo', 'active', 1)")
const row = (id: string) => sqlite.prepare('select * from projects where id = ?').get(id)

const server = RemoteServer.make({
  entities: [],
  mutations: [
    RemoteServer.update(Edit, writer(Db.Project)),
    RemoteServer.update(Guarded, writer(Db.Project)),
  ],
})
const handlers = RemoteServer.handlers(server, undefined)
let requests = 0
const mutate = (mutation: string, input: unknown, keys?: ReadonlyArray<string>) =>
  Effect.runPromise(
    handlers
      .FoldkitRemoteMutate({
        requestId: `r${++requests}`,
        mutation,
        input,
        ...(keys === undefined ? {} : { keys }),
      })
      .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )
const refused = (mutation: string, input: unknown) =>
  Effect.runPromise(
    handlers
      .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
      .pipe(Effect.flip, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )

describe('RemoteServer.update over a Drizzle table', () => {
  it('writes the row and answers it as written', async () => {
    seed()
    const answered = await mutate('EditProject', {
      id: 'p1',
      name: 'Apollo II',
      status: 'archived',
    })
    expect(row('p1')).toEqual({ id: 'p1', name: 'Apollo II', status: 'archived', revision: 1 })
    expect(answered.entities).toEqual([
      { entity: 'Project', id: 'p1', values: { id: 'p1', name: 'Apollo II', status: 'archived' } },
    ])
  })

  it('writes only the keys the client named, so two authors of different fields both land', async () => {
    seed()
    // Both read the row as it was; one changed the name, the other the status.
    await mutate('EditProject', { id: 'p1', name: 'Apollo II', status: 'active' }, ['name'])
    await mutate('EditProject', { id: 'p1', name: 'Apollo', status: 'archived' }, ['status'])
    expect(row('p1')).toMatchObject({ name: 'Apollo II', status: 'archived' })
  })

  it('fails for a row that is not there', async () => {
    const failed = await refused('EditProject', { id: 'p9', name: 'x', status: 'y' })
    expect(failed).toMatchObject({ message: 'No Project p9 to update' })
  })
})

describe('A write that expects a revision', () => {
  it('writes the row still at it, and moves the revision on', async () => {
    seed()
    const answered = await mutate('RenameProject', { id: 'p1', name: 'Apollo II', revision: 1 })
    expect(row('p1')).toMatchObject({ name: 'Apollo II', revision: 2 })
    expect(answered.entities[0]?.values).toEqual({ id: 'p1', name: 'Apollo II', revision: 2 })
  })

  it('refuses one read before another write, as a conflict, and writes nothing', async () => {
    seed()
    await mutate('RenameProject', { id: 'p1', name: 'First', revision: 1 })
    const conflict = await refused('RenameProject', { id: 'p1', name: 'Second', revision: 1 })
    expect(conflict).toMatchObject({ refusal: { _tag: 'Conflict' } })
    expect(row('p1')).toMatchObject({ name: 'First', revision: 2 })
  })
})

describe('A writer for another Entity', () => {
  it('is refused where the mutation is served', () => {
    const Other = Entity.define('Other', Schema.Struct({ id: Schema.String, name: Schema.String }))
    const others = sqliteTable('others', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })
    const OtherDb = bind({ Other }, { Other: { table: others } })
    expect(() => RemoteServer.update(Edit, writer(OtherDb.Other))).toThrow('writer is for Other')
  })
})

describe('A write that expects a revision, on Postgres', () => {
  const pgProjects = pgTable('projects', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    status: pgText('status').notNull(),
    revision: pgInteger('revision').notNull(),
  })
  const PgDb = bind({ Project }, { Project: { table: pgProjects } })
  const pglite = new PGlite()
  const pgServer = RemoteServer.make({
    entities: [],
    mutations: [RemoteServer.update(Guarded, writer(PgDb.Project))],
  })
  const pgHandlers = RemoteServer.handlers(pgServer, undefined)
  const pgLayer = databaseLayer(drizzlePg({ client: pglite }))
  const run = (input: unknown) =>
    Effect.runPromise(
      pgHandlers
        .FoldkitRemoteMutate({ requestId: `pg${++requests}`, mutation: 'RenameProject', input })
        .pipe(Effect.result, Effect.provide(pgLayer)),
    )
  afterAll(() => pglite.close())

  it('moves the revision on in the statement, so the second of two writes is a conflict', async () => {
    await pglite.exec(
      'create table projects (id text primary key, name text not null, status text not null, revision integer not null)',
    )
    await pglite.exec("insert into projects values ('p1', 'Apollo', 'active', 1)")
    const first = await run({ id: 'p1', name: 'First', revision: 1 })
    const second = await run({ id: 'p1', name: 'Second', revision: 1 })
    expect(first._tag).toBe('Success')
    expect(second).toMatchObject({ _tag: 'Failure', failure: { refusal: { _tag: 'Conflict' } } })
    const rows = await pglite.query('select name, revision from projects')
    expect(rows.rows).toEqual([{ name: 'First', revision: 2 }])
  })
})

describe('applyEdits, a journal’s apply', () => {
  const apply = applyEdits(Db.Project)
  const run = (change: { id: string; member: string; value: unknown }, at: number) =>
    Effect.runPromise(
      apply(change, at).pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )

  it('writes the cell and the sequence it committed at, and never moves a row back', async () => {
    seed()
    await run({ id: 'p1', member: 'name', value: 'Five' }, 5)
    // An older edit run again, as recovery may: nothing changes.
    await run({ id: 'p1', member: 'name', value: 'Three' }, 3)
    expect(row('p1')).toMatchObject({ name: 'Five', revision: 5 })
    // A second change to the row in the same operation lands too.
    await run({ id: 'p1', member: 'status', value: 'archived' }, 5)
    expect(row('p1')).toMatchObject({ name: 'Five', status: 'archived', revision: 5 })
  })

  it('refuses a member the table has no column for, rather than naming one from the change', async () => {
    seed()
    const failed = await Effect.runPromise(
      apply({ id: 'p1', member: 'name; drop table projects', value: 'x' }, 9).pipe(
        Effect.flip,
        Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
      ),
    )
    expect(failed).toMatchObject({
      message: 'Project has no column for "name; drop table projects" to apply',
    })
    expect(row('p1')).toMatchObject({ name: 'Apollo', revision: 1 })
  })

  it('is refused where it is made for a table with no revision column', () => {
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String, name: Schema.String }))
    const plains = sqliteTable('plains', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })
    const PlainDb = bind({ Plain }, { Plain: { table: plains } })
    expect(() => applyEdits(PlainDb.Plain)).toThrow('no column for its revision "revision"')
  })
})

describe('A write that points a one relation', () => {
  const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
  const Task = Entity.define('Task', Schema.Struct({ id: Schema.String, title: Schema.String }))
  const Work = Entity.relate(
    { User, Task },
    { Task: { owner: Relation.one(User, { optional: true }) } },
  )
  const users = sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() })
  const tasks = sqliteTable('tasks', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    ownerId: text('owner_id'),
  })
  const WorkDb = bind(Work, {
    User: { table: users },
    Task: { table: tasks, relations: { owner: { field: tasks.ownerId } } },
  })
  const Assign = Mutation.update(
    'AssignTask',
    Write.update(
      Entity.input(
        Work.Task,
        Schema.Struct({ id: Schema.String, ownerId: Schema.NullOr(Schema.String) }),
        { ownerId: Relation.input(Work.Task.relations.owner) },
      ),
      { id: 'id' },
    ),
  )
  const db = new DatabaseSync(':memory:')
  db.exec('create table users (id text primary key, name text not null)')
  db.exec('create table tasks (id text primary key, title text not null, owner_id text)')
  db.exec("insert into users values ('u1', 'Ada')")
  db.exec("insert into tasks values ('t1', 'Write', null)")
  const assigned = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [RemoteServer.update(Assign, writer(WorkDb.Task))],
    }),
    undefined,
  )
  const assign = (ownerId: string | null) =>
    Effect.runPromise(
      assigned
        .FoldkitRemoteMutate({
          requestId: `a${++requests}`,
          mutation: 'AssignTask',
          input: { id: 't1', ownerId },
        })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: db })))),
    )

  it('sets its foreign key, and answers it as the ref the store holds', async () => {
    const answered = await assign('u1')
    expect(db.prepare("select owner_id from tasks where id = 't1'").get()).toEqual({
      owner_id: 'u1',
    })
    expect(answered.entities[0]?.values).toEqual({ id: 't1', owner: 'User:u1' })
  })

  it('clears it for none', async () => {
    await assign(null)
    expect(db.prepare("select owner_id from tasks where id = 't1'").get()).toEqual({
      owner_id: null,
    })
  })
})
