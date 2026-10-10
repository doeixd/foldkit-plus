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
import { Entity, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer } from '../src/index.js'

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
