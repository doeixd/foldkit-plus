/**
 * An Entity's invariants, judged over the row a declared write leaves: compiled
 * into the update's statement (values set read as their new values, amounts as
 * the column moved), judged over an insert's values, and refused as Invalid
 * after a stale revision and an unmet precondition. Each case runs on SQLite and
 * on Postgres.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

const StockFields = Entity.define(
  'Stock',
  Schema.Struct({
    id: Schema.String,
    status: Schema.String,
    quantity: Schema.Number,
    reserved: Schema.NullOr(Schema.Number),
    shippedTo: Schema.NullOr(Schema.String),
    revision: Schema.Number,
  }),
)
const Stock = StockFields.pipe(
  Entity.invariant('reservedWithinQuantity', f => Expr.lte(f.reserved, Expr.field(f.quantity)), {
    message: 'Reserved stock cannot exceed the quantity',
    path: ['reserved'],
  }),
  // Eq, Null, Not and Or, so a value set is substituted through each.
  Entity.invariant(
    'shippedHasAddress',
    f => Expr.or(Expr.not(Expr.eq(f.status, 'shipped')), Expr.isNotNull(f.shippedTo)),
    { message: 'A shipped order needs an address' },
  ),
)

const SetQuantity = Mutation.write(
  'SetQuantity',
  Write.update(Entity.input(Stock, Schema.Struct({ id: Schema.String, quantity: Schema.Number })), {
    id: 'id',
  }),
)
const SetReserved = Mutation.write(
  'SetReserved',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, reserved: Schema.NullOr(Schema.Number) }),
    ),
    { id: 'id' },
  ),
)
const Ship = Mutation.write(
  'Ship',
  Write.update(
    Entity.input(Stock, Schema.Struct({ id: Schema.String, status: Schema.Literal('shipped') })),
    { id: 'id', when: () => Expr.eq(Stock.fields.status, 'packed') },
  ),
)
// Takes from the quantity in the statement: the invariant reads the column moved.
const Take = Mutation.write(
  'Take',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, amount: Schema.Number }),
      { amount: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { quantity: 'amount' } },
  ),
)
const Create = Mutation.write(
  'Create',
  Write.insert(
    Entity.input(
      Stock,
      Schema.Struct({
        id: Schema.String,
        status: Schema.String,
        quantity: Schema.Number,
        reserved: Schema.NullOr(Schema.Number),
        shippedTo: Schema.NullOr(Schema.String),
        revision: Schema.Number,
      }),
    ),
    { id: 'id' },
  ),
)

const create =
  'create table stock (id text primary key, status text not null, quantity integer not null, reserved integer, shipped_to text, revision integer not null)'

interface Backend {
  readonly exec: (statement: string) => Promise<void>
  readonly rows: () => Promise<ReadonlyArray<unknown>>
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly Db: ReturnType<typeof bindStock>
}
const bindStock = (table: typeof sqliteStock | typeof pgStock) =>
  bind({ Stock }, { Stock: { table, fields: { shippedTo: table.shippedTo } } })
const sqliteStock = sqliteTable('stock', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  quantity: integer('quantity').notNull(),
  reserved: integer('reserved'),
  shippedTo: text('shipped_to'),
  revision: integer('revision').notNull(),
})
const pgStock = pgTable('stock', {
  id: pgText('id').primaryKey(),
  status: pgText('status').notNull(),
  quantity: pgInteger('quantity').notNull(),
  reserved: pgInteger('reserved'),
  shippedTo: pgText('shipped_to'),
  revision: pgInteger('revision').notNull(),
})

const selectAll = 'select id, status, quantity, reserved, revision from stock order by id'
const sqlite = new DatabaseSync(':memory:')
const pglite = new PGlite()
const backends: ReadonlyArray<readonly [string, Backend]> = [
  [
    'SQLite',
    {
      exec: async statement => sqlite.exec(statement),
      rows: async () => sqlite.prepare(selectAll).all(),
      layer: databaseLayer(drizzle({ client: sqlite })),
      Db: bindStock(sqliteStock),
    },
  ],
  [
    'Postgres',
    {
      exec: async statement => {
        await pglite.exec(statement)
      },
      rows: async () => (await pglite.query(selectAll)).rows,
      layer: databaseLayer(drizzlePg({ client: pglite })),
      Db: bindStock(pgStock),
    },
  ],
]
beforeAll(() => pglite.waitReady, 60_000)
afterAll(() => pglite.close())

const refusedAs = (refusal: Record<string, unknown>) => ({
  _tag: 'Failure',
  failure: { refusal },
})
const invalid = (rule: string, path: ReadonlyArray<string>) =>
  refusedAs({ _tag: 'Invalid', rule, path })

describe.each(backends)('Invariants over %s', (_, backend) => {
  const handlers = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [
        RemoteServer.write(SetQuantity, writer(backend.Db.Stock)),
        RemoteServer.write(SetReserved, writer(backend.Db.Stock)),
        RemoteServer.write(Ship, writer(backend.Db.Stock)),
        RemoteServer.write(Take, writer(backend.Db.Stock)),
        RemoteServer.write(Create, writer(backend.Db.Stock)),
      ],
    }),
    undefined,
  )
  let requests = 0
  const send = (mutation: string, given: unknown) =>
    Effect.runPromise(
      handlers
        .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input: given })
        .pipe(Effect.result, Effect.provide(backend.layer)),
    )
  const fresh = async (...rows: ReadonlyArray<string>) => {
    await backend.exec(`drop table if exists stock; ${create}`)
    for (const row of rows) await backend.exec(`insert into stock values ${row}`)
  }

  it('refuses an update whose input is valid and whose row would not be, and writes nothing', async () => {
    await fresh("('s1', 'packed', 10, 5, null, 1)")
    expect(await send('SetQuantity', { id: 's1', quantity: 3 })).toMatchObject(
      invalid('reservedWithinQuantity', ['reserved']),
    )
    expect(await send('SetQuantity', { id: 's1', quantity: 6 })).toMatchObject({ _tag: 'Success' })
    expect(await backend.rows()).toEqual([
      { id: 's1', status: 'packed', quantity: 6, reserved: 5, revision: 1 },
    ])
  })

  it('judges the row the statement writes, not one read before it', async () => {
    await fresh("('s1', 'packed', 10, 5, null, 1)")
    // Another writer reserves more after the client read the row.
    await backend.exec("update stock set reserved = 7 where id = 's1'")
    expect(await send('SetQuantity', { id: 's1', quantity: 6 })).toMatchObject(
      invalid('reservedWithinQuantity', ['reserved']),
    )
  })

  it('fails a null, which SQL cannot call true', async () => {
    await fresh("('s1', 'packed', 10, 5, null, 1)")
    expect(await send('SetReserved', { id: 's1', reserved: null })).toMatchObject(
      invalid('reservedWithinQuantity', ['reserved']),
    )
  })

  it('moves a column by its amount in the judgement, as the statement does', async () => {
    await fresh("('s1', 'packed', 10, 5, null, 1)")
    expect(await send('Take', { id: 's1', revision: 1, amount: -6 })).toMatchObject(
      invalid('reservedWithinQuantity', ['reserved']),
    )
    expect(await send('Take', { id: 's1', revision: 1, amount: -5 })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { quantity: 5, revision: 2 } }] },
    })
  })

  it('substitutes a value set through every operation that reads it', async () => {
    await fresh("('s1', 'packed', 10, 5, null, 1)", "('s2', 'packed', 10, 5, 'Leeds', 1)")
    expect(await send('Ship', { id: 's1', status: 'shipped' })).toMatchObject(
      invalid('shippedHasAddress', ['status', 'shippedTo']),
    )
    expect(await send('Ship', { id: 's2', status: 'shipped' })).toMatchObject({ _tag: 'Success' })
  })

  it('answers a stale revision, then an unmet precondition, before an invariant', async () => {
    await fresh("('s1', 'packed', 10, 10, null, 1)", "('s2', 'draft', 10, 5, null, 1)")
    // Stale and invalid: the conflict speaks first.
    expect(await send('Take', { id: 's1', revision: 9, amount: -1 })).toMatchObject(
      refusedAs({ _tag: 'Conflict' }),
    )
    // Not packed, and shipping it would leave no address: the precondition speaks first.
    expect(await send('Ship', { id: 's2', status: 'shipped' })).toMatchObject(
      refusedAs({ _tag: 'Unmet' }),
    )
  })

  it('lets a write repair a row already invalid, and refuses one that leaves it so', async () => {
    await fresh("('s1', 'packed', 3, 5, null, 1)")
    expect(await send('SetQuantity', { id: 's1', quantity: 4 })).toMatchObject(
      invalid('reservedWithinQuantity', ['reserved']),
    )
    expect(await send('SetQuantity', { id: 's1', quantity: 5 })).toMatchObject({ _tag: 'Success' })
  })

  it('judges an insert over its values before writing it', async () => {
    await fresh()
    const row = {
      id: 's1',
      status: 'shipped',
      quantity: 2,
      reserved: 1,
      shippedTo: null,
      revision: 1,
    }
    expect(await send('Create', row)).toMatchObject(
      invalid('shippedHasAddress', ['status', 'shippedTo']),
    )
    expect(await backend.rows()).toEqual([])
    expect(await send('Create', { ...row, shippedTo: 'Leeds' })).toMatchObject({ _tag: 'Success' })
  })
})

describe('A writer over an Entity with invariants', () => {
  it('refuses, where it is made, an invariant its database cannot compile', () => {
    // Text holding a NUL, which no SQL text holds portably.
    const Unwritable = StockFields.pipe(
      Entity.invariant('notNul', f => Expr.not(Expr.eq(f.status, `a${String.fromCharCode(0)}b`)), {
        message: 'x',
      }),
    )
    const Db = bind(
      { Stock: Unwritable },
      { Stock: { table: sqliteStock, fields: { shippedTo: sqliteStock.shippedTo } } },
    )
    expect(() => writer(Db.Stock)).toThrow(`Stock's invariant "notNul"`)
  })
})

describe('A declared write over an Entity with invariants', () => {
  it('is refused where it is served when an insert leaves a field one reads unset', () => {
    const Partial = Mutation.write(
      'Partial',
      Write.insert(
        Entity.input(
          Stock,
          Schema.Struct({
            id: Schema.String,
            status: Schema.String,
            quantity: Schema.Number,
            revision: Schema.Number,
          }),
        ),
        { id: 'id' },
      ),
    )
    expect(() => RemoteServer.write(Partial, writer(bindStock(sqliteStock).Stock))).toThrow(
      'reservedWithinQuantity reads reserved',
    )
  })
})
