/**
 * A list page selects each column once (#568): the id is the row's identity
 * and is also the order's tie-break, so listing it for both put it in the
 * statement twice.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, queryPlans } from '../src/index.js'
import { postgres } from '../src/pg.js'

postgres()

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, owner: Schema.String, created: Schema.Number }),
)
const { fields } = Post
const listing = (name: string, orders: ReadonlyArray<ReturnType<typeof Order.asc>>) =>
  Query.define(name, {}, () => Query.from(Post).pipe(Query.orderBy(...orders)))

const orders = {
  // The tie-break the library adds: id after the keys.
  ByCreated: listing('ByCreated', [Order.asc(fields.created)]),
  ByOwnerCreated: listing('ByOwnerCreated', [Order.asc(fields.owner), Order.desc(fields.created)]),
  ById: listing('ById', [Order.desc(fields.id)]),
  RepeatedKey: listing('RepeatedKey', [Order.asc(fields.owner), Order.desc(fields.owner)]),
}

const rows = Array.from({ length: 9 }, (_, row) => [`p${row}`, `u${row % 3}`, row % 4])

/** The names a select list holds, in order. */
const selected = (statement: string) =>
  statement
    .slice('select '.length, statement.indexOf(' from '))
    .split(', ')
    .map(name => name.replaceAll('"', '').replace(/^\w+\./, ''))

const expected = {
  ByCreated: ['id', 'created'],
  ByOwnerCreated: ['id', 'owner', 'created'],
  ById: ['id'],
  RepeatedKey: ['id', 'owner'],
} as const

const check = (
  run: (name: keyof typeof orders) => Promise<ReadonlyArray<{ statement: string }>>,
  walk: (name: keyof typeof orders) => Promise<ReadonlyArray<string>>,
) => {
  it.each(Object.keys(expected) as Array<keyof typeof orders>)(
    'selects each column of %s once',
    async name => {
      const plans = await run(name)
      expect(plans.length).toBeGreaterThan(0)
      for (const plan of plans) expect(selected(plan.statement)).toEqual(expected[name])
    },
  )
  // The cursor a page ends on and the rows it returns are what they were with the id listed twice.
  it.each([
    ['ByCreated', ['p0', 'p4', 'p8', 'p1', 'p5', 'p2', 'p6', 'p3', 'p7']],
    ['ByOwnerCreated', ['p3', 'p6', 'p0', 'p7', 'p1', 'p4', 'p2', 'p5', 'p8']],
    ['ById', ['p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'p0']],
    ['RepeatedKey', ['p0', 'p3', 'p6', 'p1', 'p4', 'p7', 'p2', 'p5', 'p8']],
  ] as const)('walks %s to the same rows by its cursors', async (name, ids) => {
    expect(await walk(name)).toEqual(ids)
  })
}

describe('on SQLite', () => {
  const posts = sqliteTable('posts', {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    created: integer('created').notNull(),
  })
  const Db = bind({ Post }, { Post: { table: posts } })
  const client = new DatabaseSync(':memory:')
  client.exec(
    'create table posts (id text primary key not null, owner text not null, created integer not null)',
  )
  const insert = client.prepare('insert into posts values (?, ?, ?)')
  for (const row of rows) insert.run(...row)
  const layer = databaseLayer(drizzle({ client }))
  check(
    name =>
      Effect.runPromise(
        queryPlans([
          { source: query(orders[name], { entity: Db.Post }), input: {}, principal: null },
        ]).pipe(Effect.provide(layer)),
      ),
    walkWith(Db.Post, layer),
  )
})

describe('on Postgres', () => {
  const posts = pgTable('posts', {
    id: pgText('id').primaryKey(),
    owner: pgText('owner').notNull(),
    created: pgInteger('created').notNull(),
  })
  const Db = bind({ Post }, { Post: { table: posts } })
  const client = new PGlite()
  const layer = databaseLayer(drizzlePg({ client }))
  beforeAll(async () => {
    await client.exec(
      'create table posts (id text primary key not null, owner text not null, created integer not null)',
    )
    for (const row of rows) {
      await client.query('insert into posts values ($1, $2, $3)', row)
    }
  })
  afterAll(() => client.close())
  check(
    name =>
      Effect.runPromise(
        queryPlans([
          { source: query(orders[name], { entity: Db.Post }), input: {}, principal: null },
        ]).pipe(Effect.provide(layer)),
      ),
    walkWith(Db.Post, layer),
  )
})

function walkWith(
  binding: Parameters<typeof query>[1]['entity'],
  layer: ReturnType<typeof databaseLayer>,
) {
  return async (name: keyof typeof orders) => {
    const run = query(orders[name], { entity: binding })
    const ids: Array<string> = []
    let after: string | undefined
    for (let page = 0; page < rows.length; page++) {
      const answer = await Effect.runPromise(
        run
          .run({
            input: {},
            window: after === undefined ? { first: 2 } : { first: 2, after },
            principal: null,
          })
          .pipe(Effect.provide(layer)),
      )
      ids.push(...answer.edges.map(edge => edge.id))
      if (answer.end._tag !== 'Cursor') return ids
      // A cursor of key values, not the id fallback: the id term's key is read from the row's own id.
      expect(answer.end.cursor.startsWith('k:[')).toBe(true)
      after = answer.end.cursor
    }
    throw new Error('the pages never ended')
  }
}
