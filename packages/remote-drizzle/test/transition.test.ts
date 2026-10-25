/**
 * An Entity's transition invariants, judged by the Drizzle writer over the change an
 * update makes, in the statement that makes it: the row before as the columns,
 * the row after with the write's values set and its amounts added. A create is
 * not judged. Each case runs on SQLite and on Postgres.
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
import { bind, databaseLayer, invariantChecks, writer, type DrizzleDatabase } from '../src/index.js'

const Order = Entity.define(
  'Order',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['placed', 'shipped']),
    total: Schema.Number,
    revision: Schema.Number,
  }),
).pipe(
  Entity.invariant(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
  Entity.invariant('totalNeverFalls', ({ before, after }) => Expr.gte(after.total, before.total), {
    message: 'The total cannot fall',
  }),
  // Reads a field before that a status write does not set.
  Entity.invariant(
    'shipsWithTotal',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(after.status, 'shipped')), Expr.gt(before.total, 0)),
    { message: 'An order ships with something in it' },
  ),
)
const SetStatus = Mutation.write(
  'SetStatus',
  Write.update(
    Entity.input(
      Order,
      Schema.Struct({ id: Schema.String, status: Schema.Literals(['placed', 'shipped']) }),
    ),
    { id: 'id' },
  ),
)
const SetTotal = Mutation.write(
  'SetTotal',
  Write.update(Entity.input(Order, Schema.Struct({ id: Schema.String, total: Schema.Number })), {
    id: 'id',
  }),
)
const Adjust = Mutation.write(
  'Adjust',
  Write.update(
    Entity.input(
      Order,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, by: Schema.Number }),
      { by: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { total: 'by' } },
  ),
)
const Place = Mutation.write(
  'Place',
  Write.insert(
    Entity.input(
      Order,
      Schema.Struct({
        id: Schema.String,
        status: Schema.Literals(['placed', 'shipped']),
        total: Schema.Number,
        revision: Schema.Number,
      }),
    ),
    { id: 'id' },
  ),
)

const sqliteOrders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  total: integer('total').notNull(),
  revision: integer('revision').notNull(),
})
const pgOrders = pgTable('orders', {
  id: pgText('id').primaryKey(),
  status: pgText('status').notNull(),
  total: pgInteger('total').notNull(),
  revision: pgInteger('revision').notNull(),
})
const create =
  'create table orders (id text primary key, status text not null, total integer not null, revision integer not null)'
const selectAll = 'select id, status, total from orders order by id'

const sqlite = new DatabaseSync(':memory:')
const pglite = new PGlite()
beforeAll(() => pglite.waitReady, 60_000)
afterAll(() => pglite.close())

interface Backend {
  readonly exec: (statement: string) => Promise<void>
  readonly rows: () => Promise<ReadonlyArray<unknown>>
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly Db: ReturnType<typeof bindOrders>
}
const bindOrders = (table: typeof sqliteOrders | typeof pgOrders) =>
  bind({ Order }, { Order: { table } })
const backends: ReadonlyArray<readonly [string, Backend]> = [
  [
    'SQLite',
    {
      exec: async statement => sqlite.exec(statement),
      rows: async () => sqlite.prepare(selectAll).all(),
      layer: databaseLayer(drizzle({ client: sqlite })),
      Db: bindOrders(sqliteOrders),
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
      Db: bindOrders(pgOrders),
    },
  ],
]

const refused = (rule: string) => ({
  _tag: 'Failure',
  failure: { refusal: { _tag: 'Invalid', rule } },
})

describe.each(backends)('Transition invariants over %s', (_, backend) => {
  const handlers = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [
        RemoteServer.write(SetStatus, writer(backend.Db.Order)),
        RemoteServer.write(SetTotal, writer(backend.Db.Order)),
        RemoteServer.write(Adjust, writer(backend.Db.Order)),
        RemoteServer.write(Place, writer(backend.Db.Order)),
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
    await backend.exec(`drop table if exists orders; ${create}`)
    for (const row of rows) await backend.exec(`insert into orders values ${row}`)
  }

  it('refuses a change between two valid rows that it forbids, and writes nothing', async () => {
    await fresh("('o1', 'shipped', 10, 1)", "('o2', 'placed', 10, 1)")
    expect(await send('SetStatus', { id: 'o1', status: 'placed' })).toMatchObject(
      refused('shippedStaysShipped'),
    )
    expect((await send('SetStatus', { id: 'o2', status: 'shipped' }))._tag).toBe('Success')
    expect(await backend.rows()).toEqual([
      { id: 'o1', status: 'shipped', total: 10 },
      { id: 'o2', status: 'shipped', total: 10 },
    ])
  })

  it('reads, to say why, a field the write does not set', async () => {
    await fresh("('o1', 'placed', 0, 1)")
    expect(await send('SetStatus', { id: 'o1', status: 'shipped' })).toMatchObject(
      refused('shipsWithTotal'),
    )
  })

  it('judges the row before as the statement finds it, not as the client read it', async () => {
    await fresh("('o1', 'placed', 10, 1)")
    // Another request raised the total after the client read 10.
    await backend.exec("update orders set total = 15 where id = 'o1'")
    expect(await send('SetTotal', { id: 'o1', total: 12 })).toMatchObject(
      refused('totalNeverFalls'),
    )
    expect((await send('SetTotal', { id: 'o1', total: 16 }))._tag).toBe('Success')
  })

  it('reads a field the write leaves alone as unchanged, and one it moves as moved', async () => {
    await fresh("('o1', 'placed', 10, 1)")
    // The status write leaves the total alone, so the total cannot have fallen.
    expect((await send('SetStatus', { id: 'o1', status: 'shipped' }))._tag).toBe('Success')
    expect(await send('Adjust', { id: 'o1', revision: 1, by: -1 })).toMatchObject(
      refused('totalNeverFalls'),
    )
    expect(await send('Adjust', { id: 'o1', revision: 1, by: 2 })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { total: 12 } }] },
    })
  })

  it('answers as written a write the row already holds, as a retry of one that landed finds it', async () => {
    // Read as a change, shipping again with no total breaks shipsWithTotal; but it changes nothing.
    await fresh("('o1', 'shipped', 0, 1)")
    expect(await send('SetStatus', { id: 'o1', status: 'shipped' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { status: 'shipped' } }] },
    })
    // A change it does make is judged as one still.
    expect(await send('SetStatus', { id: 'o1', status: 'placed' })).toMatchObject(
      refused('shippedStaysShipped'),
    )
  })

  it('does not judge a create, which has no row before', async () => {
    await fresh()
    expect((await send('Place', { id: 'o1', status: 'shipped', total: 0, revision: 1 }))._tag).toBe(
      'Success',
    )
  })
})

describe('A writer over an Entity with transition invariants', () => {
  it('refuses, where it is made, a transition invariant its database cannot compile', () => {
    const Unwritable = Order.pipe(
      Entity.invariant(
        'notNul',
        ({ before, after }) =>
          Expr.or(
            Expr.eq(after.status, 'placed'),
            // @ts-expect-error: no status holds text with a NUL, which no SQL text holds portably
            Expr.not(Expr.eq(before.status, `a${String.fromCharCode(0)}b`)),
          ),
        { message: 'x' },
      ),
    )
    const Db = bind({ Order: Unwritable }, { Order: { table: sqliteOrders } })
    expect(() => writer(Db.Order)).toThrow(`Order's invariant "notNul"`)
  })

  it('makes no constraint of one, which a CHECK seeing one row cannot hold', () => {
    expect(invariantChecks(bindOrders(sqliteOrders).Order)).toEqual([])
  })
})
