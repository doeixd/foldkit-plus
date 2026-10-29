// @vitest-environment node
/**
 * A Postgres enum ordered under a collation (#300): Postgres orders an enum by
 * the order its labels were declared in, so a column of one is ordered, and
 * paged, by its labels as text under the term's collation, as the reference
 * interpreter orders them. SQLite, with no enums, stores the labels as text.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { pgEnum, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Collation, Entity, Order, Query as Relational, evaluate } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseLayer, entity, query } from '../src/index.js'

// Declared in neither code point nor folded order, so each of the three reads differently.
const labels = ['b', 'C', 'a'] as const
const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(labels) }),
)
const status = pgEnum('item_status', labels)
const pgItems = pgTable('items', {
  id: pgText('id').primaryKey(),
  status: status('status').notNull(),
})
const sqliteItems = sqliteTable('items', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
})

const rows = [
  { id: 'i1', status: 'a' },
  { id: 'i2', status: 'C' },
  { id: 'i3', status: 'b' },
] as const

const bodies = {
  Binary: Relational.from(Item).pipe(
    Relational.orderBy(Order.asc(Item.fields.status, { collation: Collation.binary })),
  ),
  Folded: Relational.from(Item).pipe(
    Relational.orderBy(Order.asc(Item.fields.status, { collation: Collation.asciiFold })),
  ),
}
const descriptorOf = (name: keyof typeof bodies) => ({
  ...Query.make(name, { Input: {}, Result: Query.connection(Item) }),
  body: bodies[name],
})

const sqlite = new DatabaseSync(':memory:')
sqlite.exec('create table items (id text primary key, status text not null)')
for (const row of rows) sqlite.prepare('insert into items values (?, ?)').run(row.id, row.status)
const pglite = new PGlite()
beforeAll(async () => {
  await pglite.exec(
    "create type item_status as enum ('b', 'C', 'a'); create table items (id text primary key, status item_status not null)",
  )
  for (const row of rows)
    await pglite.query('insert into items values ($1, $2)', [row.id, row.status])
}, 60_000)
afterAll(async () => {
  sqlite.close()
  await pglite.close()
})

const backends = [
  [
    'SQLite',
    () => ({
      binding: entity('Item', sqliteItems),
      layer: databaseLayer(drizzle({ client: sqlite })),
    }),
  ],
  [
    'Postgres',
    () => ({
      binding: entity('Item', pgItems),
      layer: databaseLayer(drizzlePg({ client: pglite })),
    }),
  ],
] as const

/** Every id the query lists, a page of `size` at a time, each after the last one's cursor. */
const paged = async (
  name: keyof typeof bodies,
  backend: (typeof backends)[number][1],
  size: number,
) => {
  const { binding, layer } = backend()
  const run = query(descriptorOf(name), { entity: binding })
  const ids: Array<string> = []
  let after: string | undefined
  for (let page = 0; page < rows.length + 1; page++) {
    const answer = await Effect.runPromise(
      run
        .run({
          input: {},
          window: after === undefined ? { first: size } : { first: size, after },
          principal: null,
        })
        .pipe(Effect.provide(layer)),
    )
    ids.push(...answer.edges.map(edge => edge.id))
    if (answer.end._tag !== 'Cursor') return ids
    after = answer.end.cursor
  }
  throw new Error('the pages never ended')
}

describe.each(backends)('An enum ordered under a collation, on %s', (_, backend) => {
  it.each([
    ['Binary', ['i2', 'i1', 'i3']],
    ['Folded', ['i1', 'i3', 'i2']],
  ] as const)('orders and pages %s as the reference does', async (name, expected) => {
    expect(evaluate(bodies[name], {}, rows).map(row => row.id)).toEqual(expected)
    for (const size of [1, 2, 3]) expect(await paged(name, backend, size)).toEqual(expected)
  })
})
