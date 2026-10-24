/**
 * A declared write's `increment`, added in the statement that writes: the
 * field moves by the amount once, and a retry of a write that landed is a
 * conflict, never a second increment.
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

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    stock: Schema.Number,
    revision: Schema.Number,
  }),
)
const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const Db = bind({ Item }, { Item: { table: items } })

const RestockInput = Entity.input(
  Item,
  Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Number }),
  { quantity: Entity.unmapped },
)
const Restock = Mutation.write(
  'Restock',
  Write.update(RestockInput, { id: 'id', expect: 'revision', increment: { stock: 'quantity' } }),
)
// Sells only what is in stock: the precondition reads the row the increment moves.
const Sell = Mutation.write(
  'Sell',
  Write.update(RestockInput, {
    id: 'id',
    expect: 'revision',
    increment: { stock: 'quantity' },
    when: () => Expr.gte(Item.fields.stock, 1),
  }),
)

// Renames as it sells: a value set beside the increment.
const SellNamed = Mutation.write(
  'SellNamed',
  Write.update(
    Entity.input(
      Item,
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        revision: Schema.Number,
        quantity: Schema.Number,
      }),
      { quantity: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      increment: { stock: 'quantity' },
      when: () => Expr.gte(Item.fields.stock, 1),
    },
  ),
)

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(
  'create table items (id text primary key, name text not null, stock integer not null, revision integer not null)',
)
afterEach(() => {
  sqlite.exec('delete from items')
})
const seed = (stock: number) => sqlite.exec(`insert into items values ('i1', 'Bolt', ${stock}, 1)`)
const row = () => sqlite.prepare("select stock, revision from items where id = 'i1'").get()

const handlers = RemoteServer.handlers(
  RemoteServer.make({
    entities: [],
    mutations: [Restock, Sell, SellNamed].map(mutation =>
      RemoteServer.write(mutation, writer(Db.Item)),
    ),
  }),
  undefined,
)
let requests = 0
const run = (mutation: string, input: unknown) =>
  Effect.runPromise(
    handlers
      .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
      .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )
const refusedAs = (tag: string) => ({ _tag: 'Failure', failure: { refusal: { _tag: tag } } })

describe('A write that increments a field', () => {
  it('adds the amount in the statement, moves the revision, and answers the sum', async () => {
    seed(10)
    const done = await run('Restock', { id: 'i1', revision: 1, quantity: 5 })
    expect(done).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'i1', values: { stock: 15, revision: 2 } }] },
    })
    expect(row()).toEqual({ stock: 15, revision: 2 })
  })

  it('answers a retry of a write that landed as a conflict, and adds once', async () => {
    seed(10)
    await run('Restock', { id: 'i1', revision: 1, quantity: 5 })
    // The answer was lost; the same request comes again.
    expect(await run('Restock', { id: 'i1', revision: 1, quantity: 5 })).toMatchObject(
      refusedAs('Conflict'),
    )
    expect(row()).toEqual({ stock: 15, revision: 2 })
  })

  it('takes away a negative amount', async () => {
    seed(10)
    await run('Restock', { id: 'i1', revision: 1, quantity: -3 })
    expect(row()).toEqual({ stock: 7, revision: 2 })
  })

  it('moves nothing when its precondition does not hold', async () => {
    seed(0)
    expect(await run('Sell', { id: 'i1', revision: 1, quantity: -1 })).toMatchObject(
      refusedAs('Unmet'),
    )
    expect(row()).toEqual({ stock: 0, revision: 1 })
  })

  it('is unmet though the row already holds the value it sets beside the increment', async () => {
    seed(0)
    // The name is already Bolt, but the stock was never moved: this is no retry of a write that landed.
    expect(
      await run('SellNamed', { id: 'i1', name: 'Bolt', revision: 1, quantity: -1 }),
    ).toMatchObject(refusedAs('Unmet'))
    expect(row()).toEqual({ stock: 0, revision: 1 })
  })

  it('refuses a writer that does not add increments, where the write is declared', () => {
    const { increments: _, ...unadding } = writer(Db.Item)
    expect(() => RemoteServer.write(Restock, unadding)).toThrow(
      'write "Restock" increments a field, but its writer for Item does not add one',
    )
  })
})

describe('A write that increments a field, on Postgres', () => {
  const pgItems = pgTable('items', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    stock: pgInteger('stock').notNull(),
    revision: pgInteger('revision').notNull(),
  })
  const PgDb = bind({ Item }, { Item: { table: pgItems } })
  const pglite = new PGlite()
  beforeAll(() => pglite.waitReady, 60_000)
  afterAll(() => pglite.close())
  const pgHandlers = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [RemoteServer.write(Restock, writer(PgDb.Item))],
    }),
    undefined,
  )
  const pgRun = (input: unknown) =>
    Effect.runPromise(
      pgHandlers
        .FoldkitRemoteMutate({ requestId: `pg${++requests}`, mutation: 'Restock', input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzlePg({ client: pglite })))),
    )

  it('adds once, and a retry is a conflict', async () => {
    await pglite.exec(
      'create table items (id text primary key, name text not null, stock integer not null, revision integer not null)',
    )
    await pglite.exec("insert into items values ('i1', 'Bolt', 10, 1)")
    expect((await pgRun({ id: 'i1', revision: 1, quantity: 5 }))._tag).toBe('Success')
    expect(await pgRun({ id: 'i1', revision: 1, quantity: 5 })).toMatchObject(refusedAs('Conflict'))
    const rows = await pglite.query('select stock, revision from items')
    expect(rows.rows).toEqual([{ stock: 15, revision: 2 }])
  })
})
