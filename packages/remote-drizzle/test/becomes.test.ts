/**
 * A write's `becomes` that enumeration could not prove where it was declared,
 * held where it commits: the postcondition is compiled into the update's
 * statement beside the invariants, judged over an insert's values, and a
 * write it refuses is answered as Invalid with rule `becomes:<State>`, never
 * as a conflict or unmet. Each case runs on SQLite and on Postgres; D1 is in
 * `d1.test.ts`.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Refusal } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    stock: Schema.Int,
    reserved: Schema.Int,
    revision: Schema.Int,
  }),
)
const InStock = Entity.refine(Item, 'InStock', ({ row }) => Expr.gt(row.stock, row.reserved))

const Sell = Mutation.write(
  'Sell',
  Write.update(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { stock: 'quantity' }, becomes: InStock },
  ),
)
/** Sells only from an open item: a precondition the postcondition must not speak over. */
const SellOpen = Mutation.write(
  'SellOpen',
  Write.update(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      increment: { stock: 'quantity' },
      when: () => Expr.eq(Item.fields.status, 'open'),
      becomes: InStock,
    },
  ),
)
const Stock = Mutation.write(
  'Stock',
  Write.insert(
    Entity.input(
      Item,
      Schema.Struct({
        id: Schema.String,
        status: Schema.Literals(['open', 'closed']),
        stock: Schema.Int,
        reserved: Schema.Int,
        revision: Schema.Int,
      }),
    ),
    { id: 'id', becomes: InStock },
  ),
)

const create =
  'create table items (id text primary key, status text not null, stock integer not null, reserved integer not null, revision integer not null)'
const sqliteItems = sqliteTable('items', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  reserved: integer('reserved').notNull(),
  revision: integer('revision').notNull(),
})
const pgItems = pgTable('items', {
  id: pgText('id').primaryKey(),
  status: pgText('status').notNull(),
  stock: pgInteger('stock').notNull(),
  reserved: pgInteger('reserved').notNull(),
  revision: pgInteger('revision').notNull(),
})

interface Backend {
  readonly exec: (statement: string) => Promise<void>
  readonly rows: () => Promise<ReadonlyArray<unknown>>
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly Db: ReturnType<typeof bindItems>
}
const bindItems = (table: typeof sqliteItems | typeof pgItems) =>
  bind({ Item }, { Item: { table } })

const selectAll = 'select id, stock, revision from items order by id'
const sqlite = new DatabaseSync(':memory:')
let pglite: PGlite
const backends: ReadonlyArray<readonly [string, Backend]> = [
  [
    'SQLite',
    {
      exec: async statement => sqlite.exec(statement),
      rows: async () => sqlite.prepare(selectAll).all(),
      layer: databaseLayer(drizzle({ client: sqlite })),
      Db: bindItems(sqliteItems),
    },
  ],
  [
    'Postgres',
    {
      exec: async statement => {
        await pglite.exec(statement)
      },
      rows: async () => (await pglite.query(selectAll)).rows,
      layer: Layer.suspend(() => databaseLayer(drizzlePg({ client: pglite }))),
      Db: bindItems(pgItems),
    },
  ],
]
beforeAll(async () => {
  pglite = await PGlite.create()
}, 60_000)
afterAll(() => pglite.close())

const refusedAs = (refusal: Record<string, unknown>) => ({ _tag: 'Failure', failure: { refusal } })
const outOfStock = refusedAs({
  _tag: 'Invalid',
  entity: 'Item',
  rule: 'becomes:InStock',
  path: ['stock', 'reserved'],
})

describe.each(backends)('A becomes held where the write commits, over %s', (_, backend) => {
  const handlers = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [
        RemoteServer.write(Sell, writer(backend.Db.Item)),
        RemoteServer.write(SellOpen, writer(backend.Db.Item)),
        RemoteServer.write(Stock, writer(backend.Db.Item)),
      ],
    }),
    undefined,
  )
  let requests = 0
  const send = (mutation: string, input: unknown) =>
    Effect.runPromise(
      handlers
        .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
        .pipe(Effect.result, Effect.provide(backend.layer)),
    )
  const fresh = async (...rows: ReadonlyArray<string>) => {
    await backend.exec(`drop table if exists items; ${create}`)
    for (const row of rows) await backend.exec(`insert into items values ${row}`)
  }

  it('lands a sale that leaves stock, and refuses one that leaves none, writing nothing', async () => {
    await fresh("('i1', 'open', 5, 2, 1)")
    expect(await send('Sell', { id: 'i1', revision: 1, quantity: -2 })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { stock: 3, revision: 2 } }] },
    })
    const refused = await send('Sell', { id: 'i1', revision: 2, quantity: -1 })
    expect(refused).toMatchObject(outOfStock)
    expect(await backend.rows()).toEqual([{ id: 'i1', stock: 3, revision: 2 }])
    if (refused._tag !== 'Failure') throw new Error('the sale landed')
    const { refusal } = refused.failure as { readonly refusal: unknown }
    expect(
      Refusal.isInvalidBy(
        Schema.decodeUnknownSync(Sell.Refusal)(refusal),
        Write.ensured(Sell.write),
      ),
    ).toBe(true)
  })

  it('judges the row the statement writes, not one read before it', async () => {
    await fresh("('i1', 'open', 5, 2, 1)")
    // Another writer reserves more after the client read the row.
    await backend.exec("update items set reserved = 4 where id = 'i1'")
    expect(await send('Sell', { id: 'i1', revision: 1, quantity: -1 })).toMatchObject(outOfStock)
  })

  it('answers a stale revision and an unmet precondition before the postcondition', async () => {
    await fresh("('i1', 'open', 2, 2, 1)", "('i2', 'closed', 2, 2, 1)")
    expect(await send('Sell', { id: 'i1', revision: 9, quantity: -1 })).toMatchObject(
      refusedAs({ _tag: 'Conflict' }),
    )
    expect(await send('SellOpen', { id: 'i2', revision: 1, quantity: -1 })).toMatchObject(
      refusedAs({ _tag: 'Unmet' }),
    )
  })

  it('judges an insert over its values before writing it', async () => {
    await fresh()
    const row = { id: 'i1', status: 'open', stock: 2, reserved: 2, revision: 1 }
    expect(await send('Stock', row)).toMatchObject(outOfStock)
    expect(await backend.rows()).toEqual([])
    expect(await send('Stock', { ...row, stock: 3 })).toMatchObject({ _tag: 'Success' })
  })
})

describe('A writer handed a postcondition its database cannot run', () => {
  const Odd = Entity.define(
    'Odd',
    Schema.Struct({ id: Schema.String, label: Schema.String, stock: Schema.Int }),
  )
  const odds = sqliteTable('odds', {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    stock: integer('stock').notNull(),
  })
  const Db = bind({ Odd }, { Odd: { table: odds } })
  const positive = Expr.operator('acme.positive', { input: [Schema.Int], output: Schema.Boolean })
  // Text holding a NUL, which no SQL text holds portably.
  const Unwritable = Entity.refine(Odd, 'Unwritable', ({ row }) =>
    Expr.and(Expr.gt(row.stock, 0), Expr.not(Expr.eq(row.label, `a${String.fromCharCode(0)}b`))),
  )
  const Uncalled = Entity.refine(Odd, 'Uncalled', ({ row }) => Expr.eq(positive(row.stock), true))
  const restock = (state: typeof Unwritable | typeof Uncalled, name: string) =>
    Mutation.write(
      name,
      Write.update(
        Entity.input(Odd, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
          quantity: Entity.unmapped,
        }),
        { id: 'id', increment: { stock: 'quantity' }, becomes: state },
      ),
    )

  it.each([
    ['cannot compile', Unwritable, 'its postcondition "becomes:Unwritable"'],
    ['calls an operator it does not run', Uncalled, 'its postcondition "becomes:Uncalled" needs'],
  ])('is refused where the write is served when it %s', (_, state, message) => {
    const ledgered = writer(Db.Odd, {
      ledger: {
        table: sqliteTable('write_ledger', {
          scope: text('scope').notNull(),
          operation: text('operation').notNull(),
          target: text('target').notNull(),
          answer: text('answer').notNull(),
          at: integer('at').notNull(),
          request: text('request'),
        }),
        scope: () => '',
      },
    })
    expect(() => RemoteServer.write(restock(state, `Restock${state.name}`), ledgered)).toThrow(
      message,
    )
  })
})
