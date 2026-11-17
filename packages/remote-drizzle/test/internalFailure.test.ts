// @vitest-environment node
/**
 * What a caller learns when a Drizzle-backed server's database fails (#573):
 * "Internal error" and an incident, on SQLite and Postgres alike. The driver's
 * words (the table, the constraint, the statement) are nowhere in the encoded
 * answer, and the report holds them under the incident the caller was given.
 * What the adapter wrote about the caller's own request (a cursor, a window)
 * still arrives as written.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema, type Layer } from 'effect'
import { Entity, Order, Write } from 'foldkit-entity'
import { Diagnostics, Mutation, Query, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { RemoteServer, type ServerDefinition } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, source, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const fields = Schema.Struct({ id: Schema.String, name: Schema.String })
const Account = Entity.define('Account', fields)
/** Bound to a table no database here has. */
const Ghost = Entity.define('Ghost', fields)

const Accounts = Query.define('Accounts', {}, () =>
  Query.from(Account).pipe(Query.orderBy(Order.asc(Account.fields.id))),
)
const Ghosts = Query.define('Ghosts', {}, () =>
  Query.from(Ghost).pipe(Query.orderBy(Order.asc(Ghost.fields.id))),
)
const CreateAccount = Mutation.write(
  'CreateAccount',
  Write.insert(Entity.input(Account, fields), { id: 'id' }),
)

/** A CHECK the write below breaks, named so the driver's error quotes it. */
const schema = `create table canary_accounts (
  id text primary key,
  name text not null,
  constraint canary_secret_check check (length(name) < 5)
)`

interface Backend {
  readonly name: string
  readonly server: ServerDefinition<string, DrizzleDatabase>
  readonly layer: () => Layer.Layer<DrizzleDatabase>
}

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(schema)
let pglite: PGlite
// Started here, not as the file is collected: its start holds the thread for seconds.
beforeAll(async () => {
  pglite = await PGlite.create()
  await pglite.exec(schema)
}, 60_000)
afterAll(() => pglite.close())

const serverOf = (Db: {
  readonly Account: Parameters<typeof source>[0]
  readonly Ghost: Parameters<typeof source>[0]
}): ServerDefinition<string, DrizzleDatabase> =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities: [source(Db.Account), source(Db.Ghost)],
    queries: [query(Accounts, { entity: Db.Account }), query(Ghosts, { entity: Db.Ghost })],
    mutations: [RemoteServer.write(CreateAccount, writer<string>(Db.Account))],
  })

const columns = { id: text('id').primaryKey(), name: text('name').notNull() }
const pgColumns = { id: pgText('id').primaryKey(), name: pgText('name').notNull() }
const backends: ReadonlyArray<Backend> = [
  {
    name: 'SQLite',
    server: serverOf(
      bind(
        { Account, Ghost },
        {
          Account: { table: sqliteTable('canary_accounts', columns) },
          Ghost: { table: sqliteTable('canary_ghosts', columns) },
        },
      ),
    ),
    layer: () => databaseLayer(drizzle({ client: sqlite })),
  },
  {
    name: 'Postgres',
    server: serverOf(
      bind(
        { Account, Ghost },
        {
          Account: { table: pgTable('canary_accounts', pgColumns) },
          Ghost: { table: pgTable('canary_ghosts', pgColumns) },
        },
      ),
    ),
    layer: () => databaseLayer(drizzlePg({ client: pglite })),
  },
]

type Ask = Parameters<typeof RemoteServer.answer>[1]

const read: Ask = {
  operation: 'read',
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Ghost', id: 'a', fields: ['name'] }],
  },
}
const list = (name: string, window: object = { first: 5 }): Ask => ({
  operation: 'query',
  payload: { query: name, input: {}, window },
})
const write: Ask = {
  operation: 'mutate',
  payload: {
    requestId: 'r1',
    mutation: 'CreateAccount',
    input: { id: 'a1', name: 'far too long a name' },
  },
}

const Body = Schema.Struct({ error: Schema.String, incident: Schema.optional(Schema.String) })

/** What one failed call answered, as its encoded bytes too, and what it reported. */
const ask = async (backend: Backend, asked: Ask) => {
  const collected = Diagnostics.collect()
  const answered = await Effect.runPromise(
    RemoteServer.answer(RemoteServer.handlers(backend.server, 'ada'), asked).pipe(
      Effect.provide(backend.layer()),
      Effect.provideService(Diagnostics.Reporter, collected.report),
    ),
  )
  return {
    status: answered.status,
    sent: JSON.stringify(answered),
    body: Schema.decodeUnknownSync(Body)(answered.body),
    reported: collected.reported,
  }
}

/** Each way the database fails, and what only its driver says of it. */
const failures: ReadonlyArray<{
  readonly name: string
  readonly asked: Ask
  readonly during: string
  readonly canary: string
}> = [
  { name: 'a read of a missing table', asked: read, during: 'read Ghost', canary: 'canary_ghosts' },
  {
    name: 'a list over a missing table',
    asked: list('Ghosts'),
    during: 'query Ghosts',
    canary: 'canary_ghosts',
  },
  {
    name: 'a write a constraint refuses',
    asked: write,
    during: 'mutate CreateAccount',
    canary: 'canary_secret_check',
  },
]

describe.each(backends)('a database failure, on $name', backend => {
  it.each(failures)(
    '$name answers "Internal error" and an incident, with nothing of the driver’s',
    async ({ asked }) => {
      const failed = await ask(backend, asked)
      expect(failed.status).toBe(500)
      expect(failed.body.error).toBe('Internal error')
      expect(failed.body.incident).toMatch(/^[0-9a-f]{16}$/)
      // The table, the constraint, the statement, the adapter's own name for what failed.
      expect(failed.sent).not.toMatch(/canary|select |insert |constraint|Database/i)
    },
  )

  it.each(failures)(
    '$name is reported with the driver’s words, under the incident answered',
    async ({ asked, during, canary }) => {
      const failed = await ask(backend, asked)
      expect(failed.reported.filter(report => report._tag === 'ServerDefect')).toEqual([
        expect.objectContaining({
          incident: failed.body.incident,
          during,
          message: expect.stringContaining(canary),
        }),
      ])
    },
  )

  it.each([
    {
      name: 'a cursor that names no row',
      window: { first: 5, after: 'nobody' },
      told: 'The query cursor no longer resolves to a row',
    },
    {
      name: 'a window that asks both ends',
      window: { first: 5, last: 5 },
      told: 'A query window cannot combine after with before, or first with last',
    },
  ])('$name is answered in the adapter’s own words, with no incident', async ({ window, told }) => {
    const failed = await ask(backend, list('Accounts', window))
    expect(failed.status).toBe(500)
    expect(failed.body).toStrictEqual({ error: told })
    expect(failed.reported).toEqual([])
  })
})
