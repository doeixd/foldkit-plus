/**
 * A declared write's `when`, compiled into the statement that writes: the
 * row is written only while it holds it, and a miss says why.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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

const active = () => Expr.eq(Project.fields.status, 'active')
const StatusInput = Entity.input(
  Project,
  Schema.Struct({ id: Schema.String, status: Schema.String }),
)
const Archive = Mutation.write('Archive', Write.update(StatusInput, { id: 'id', when: active }))
const ArchiveAt = Mutation.write(
  'ArchiveAt',
  Write.update(
    Entity.input(
      Project,
      Schema.Struct({ id: Schema.String, status: Schema.String, revision: Schema.Number }),
    ),
    { id: 'id', expect: 'revision', when: active },
  ),
)
// The input names the name it expects to replace: a precondition read from the input.
const Rename = Mutation.write(
  'Rename',
  Write.update(
    Entity.input(
      Project,
      Schema.Struct({ id: Schema.String, name: Schema.String, from: Schema.String }),
      { from: Entity.unmapped },
    ),
    { id: 'id', when: ({ input }) => Expr.eq(Project.fields.name, input.from) },
  ),
)
const IdInput = Entity.input(Project, Schema.Struct({ id: Schema.String }))
const Drop = Mutation.write(
  'Drop',
  Write.delete(IdInput, { id: 'id', when: () => Expr.eq(Project.fields.status, 'archived') }),
)
const DropAt = Mutation.write(
  'DropAt',
  Write.delete(
    Entity.input(Project, Schema.Struct({ id: Schema.String, revision: Schema.Number })),
    {
      id: 'id',
      expect: 'revision',
      when: () => Expr.eq(Project.fields.status, 'archived'),
    },
  ),
)

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(
  'create table projects (id text primary key, name text not null, status text not null, revision integer not null)',
)
afterEach(() => {
  sqlite.exec('delete from projects')
})
const seed = (status: string) =>
  sqlite.exec(`insert into projects values ('p1', 'Apollo', '${status}', 1)`)
const row = () => sqlite.prepare("select * from projects where id = 'p1'").get()

const server = RemoteServer.make({
  entities: [],
  mutations: [Archive, ArchiveAt, Rename, Drop, DropAt].map(mutation =>
    RemoteServer.write(mutation, writer(Db.Project)),
  ),
})
const handlers = RemoteServer.handlers(server, undefined)
let requests = 0
const run = (mutation: string, input: unknown, keys?: ReadonlyArray<string>) =>
  Effect.runPromise(
    handlers
      .FoldkitRemoteMutate({
        requestId: `r${++requests}`,
        mutation,
        input,
        ...(keys === undefined ? {} : { keys }),
      })
      .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )
const refusedAs = (tag: string) => ({ _tag: 'Failure', failure: { refusal: { _tag: tag } } })

describe('A write with a precondition', () => {
  it('writes a row that holds it', async () => {
    seed('active')
    expect((await run('Archive', { id: 'p1', status: 'archived' }))._tag).toBe('Success')
    expect(row()).toMatchObject({ status: 'archived' })
  })

  it('refuses a row that does not hold it as unmet, and writes nothing', async () => {
    seed('paused')
    expect(await run('Archive', { id: 'p1', status: 'archived' })).toMatchObject(refusedAs('Unmet'))
    expect(row()).toMatchObject({ status: 'paused', revision: 1 })
  })

  it('reads the input it is given', async () => {
    seed('active')
    expect(await run('Rename', { id: 'p1', name: 'Gemini', from: 'Mercury' })).toMatchObject(
      refusedAs('Unmet'),
    )
    expect((await run('Rename', { id: 'p1', name: 'Gemini', from: 'Apollo' }))._tag).toBe('Success')
    expect(row()).toMatchObject({ name: 'Gemini' })
  })

  it('says a row that is not there is not there, not unmet', async () => {
    const missing = await run('Archive', { id: 'p9', status: 'archived' })
    expect(missing).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'No Project p9 to update' },
    })
  })

  it('refuses a moved revision as a conflict, whatever the precondition says', async () => {
    seed('paused')
    expect(await run('ArchiveAt', { id: 'p1', status: 'archived', revision: 7 })).toMatchObject(
      refusedAs('Conflict'),
    )
    expect(await run('ArchiveAt', { id: 'p1', status: 'archived', revision: 1 })).toMatchObject(
      refusedAs('Unmet'),
    )
  })

  it('answers a retry of a write that landed with the row, not unmet', async () => {
    seed('active')
    await run('Archive', { id: 'p1', status: 'archived' })
    // The answer was lost; the row no longer holds the precondition, and holds the write.
    const retried = await run('Archive', { id: 'p1', status: 'archived' })
    expect(retried).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'p1', values: { status: 'archived' } }] },
    })
  })

  it('deletes a row that holds it, and keeps one that does not', async () => {
    seed('active')
    expect(await run('Drop', { id: 'p1' })).toMatchObject(refusedAs('Unmet'))
    expect(row()).toBeDefined()
    expect(await run('DropAt', { id: 'p1', revision: 4 })).toMatchObject(refusedAs('Conflict'))
    sqlite.exec("update projects set status = 'archived'")
    expect((await run('Drop', { id: 'p1' }))._tag).toBe('Success')
    expect(row()).toBeUndefined()
    // Gone is gone: a retry of the delete succeeds.
    expect((await run('Drop', { id: 'p1' }))._tag).toBe('Success')
  })

  it('is unmet with nothing to set, not answered as a retry of itself', async () => {
    seed('paused')
    // No key named: the row holds every value the write sets, vacuously.
    expect(await run('Archive', { id: 'p1', status: 'archived' }, [])).toMatchObject(
      refusedAs('Unmet'),
    )
  })

  it('takes an unmet from a writer for a write with no precondition as the server’s error', async () => {
    seed('active')
    const Plain = Mutation.write('Plain', Write.update(StatusInput, { id: 'id' }))
    const wrong = { ...writer(Db.Project), update: () => Effect.fail(RemoteServer.unmet()) }
    const failed = await Effect.runPromise(
      RemoteServer.handlers(
        RemoteServer.make({ entities: [], mutations: [RemoteServer.write(Plain, wrong)] }),
        undefined,
      )
        .FoldkitRemoteMutate({
          requestId: 'wrong',
          mutation: 'Plain',
          input: { id: 'p1', status: 'x' },
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: { message: "Project's writer refused Plain, which has no precondition, as unmet" },
    })
  })

  it('refuses a writer that does not check preconditions, where the write is declared', () => {
    const { preconditions: _, ...unchecking } = writer(Db.Project)
    expect(() => RemoteServer.write(Archive, unchecking)).toThrow(
      'write "Archive" has a precondition, but its writer for Project does not check one',
    )
    // A write without one needs nothing of its writer.
    const Plain = Mutation.write('Plain', Write.update(StatusInput, { id: 'id' }))
    expect(() => RemoteServer.write(Plain, unchecking)).not.toThrow()
  })
})

describe('A write with a precondition, on Postgres', () => {
  const pgProjects = pgTable('projects', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    status: pgText('status').notNull(),
    revision: pgInteger('revision').notNull(),
  })
  const PgDb = bind({ Project }, { Project: { table: pgProjects } })
  let pglite: PGlite
  beforeAll(async () => {
    pglite = await PGlite.create()
  }, 60_000)
  afterAll(() => pglite.close())
  const pgHandlers = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [RemoteServer.write(Rename, writer(PgDb.Project))],
    }),
    undefined,
  )
  const pgRun = (input: unknown) =>
    Effect.runPromise(
      pgHandlers
        .FoldkitRemoteMutate({ requestId: `pg${++requests}`, mutation: 'Rename', input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzlePg({ client: pglite })))),
    )

  it('compiles it into the statement, with the input in it', async () => {
    await pglite.exec(
      'create table projects (id text primary key, name text not null, status text not null, revision integer not null)',
    )
    await pglite.exec("insert into projects values ('p1', 'Apollo', 'active', 1)")
    expect(await pgRun({ id: 'p1', name: 'Gemini', from: 'Mercury' })).toMatchObject(
      refusedAs('Unmet'),
    )
    expect((await pgRun({ id: 'p1', name: 'Gemini', from: 'Apollo' }))._tag).toBe('Success')
    const rows = await pglite.query('select name from projects')
    expect(rows.rows).toEqual([{ name: 'Gemini' }])
  })
})
