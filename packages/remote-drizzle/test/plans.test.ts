/**
 * `queryPlans`: each page a source reads, as SQLite and Postgres plan it, for
 * every order a body offers its reader (#437).
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, queryPlans, type QueryPlan } from '../src/index.js'
import { postgres } from '../src/pg.js'

postgres()

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    owner: Schema.String,
    created: Schema.Number,
    title: Schema.String,
  }),
)
const ByOwner = Query.define('ByOwner', { owner: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.owner, input.owner)),
    Query.orderBy(Order.desc(Post.fields.created)),
  ),
)
const ByTitle = Query.define('ByTitle', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.title))),
)
const Chosen = Query.define(
  'Chosen',
  {
    sort: Schema.NullOr(
      Schema.Struct({
        by: Schema.Literals(['created']),
        direction: Schema.Literals(['asc', 'desc']),
      }),
    ),
  },
  ({ input }) =>
    Query.from(Post).pipe(
      Query.orderBy(Order.chosen(input.sort, { created: Post.fields.created })),
    ),
)

/** Each plan's query, input and page beside its verdict, to compare whole. */
const verdicts = (plans: ReadonlyArray<QueryPlan>) =>
  plans.map(({ query: name, input, page, verdict }) => ({ name, input, page, verdict }))

const rows = Array.from({ length: 12 }, (_, row) => [
  `p${String(row).padStart(2, '0')}`,
  `u${row % 3}`,
  row % 5,
  `t${row}`,
])

describe('on SQLite', () => {
  const posts = sqliteTable('posts', {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    created: integer('created').notNull(),
    title: text('title').notNull(),
  })
  const Db = bind({ Post }, { Post: { table: posts } })
  const client = new DatabaseSync(':memory:')
  client.exec(
    'create table posts (id text primary key not null, owner text not null, created integer not null, title text not null)',
  )
  // Newest first by owner, ties by id, as `ByOwner` reads; and oldest first overall.
  client.exec('create index posts_owner_created on posts (owner, created desc, id)')
  client.exec('create index posts_created on posts (created, id)')
  const insert = client.prepare('insert into posts values (?, ?, ?, ?)')
  for (const row of rows) insert.run(...row)
  const planned = (cases: Parameters<typeof queryPlans<null>>[0]) =>
    Effect.runPromise(queryPlans(cases).pipe(Effect.provide(databaseLayer(drizzle({ client })))))

  it('serves an order an index holds, on its first page and a later one', async () => {
    const plans = await planned([
      { source: query(ByOwner, { entity: Db.Post }), input: { owner: 'u1' }, principal: null },
    ])
    expect(verdicts(plans)).toEqual([
      { name: 'ByOwner', input: { owner: 'u1' }, page: 'first', verdict: 'served' },
      { name: 'ByOwner', input: { owner: 'u1' }, page: 'later', verdict: 'served' },
    ])
    expect(plans[0]!.plan.join(' | ')).toContain('posts_owner_created')
    expect(plans[0]!.statement).toContain('order by')
  })

  it('reports the sort an order no index holds pays', async () => {
    const [first] = await planned([
      { source: query(ByTitle, { entity: Db.Post }), input: {}, principal: null },
    ])
    expect(first).toMatchObject({ page: 'first', verdict: 'sorted' })
    expect(first!.plan.join(' | ')).toContain('TEMP B-TREE')
  })

  it('plans each order a body lets its reader choose', async () => {
    const plans = await planned([
      { source: query(Chosen, { entity: Db.Post }), input: { sort: null }, principal: null },
    ])
    const firsts = verdicts(plans).filter(plan => plan.page === 'first')
    expect(firsts).toEqual([
      { name: 'Chosen', input: { sort: null }, page: 'first', verdict: 'served' },
      {
        name: 'Chosen',
        input: { sort: { by: 'created', direction: 'asc' } },
        page: 'first',
        verdict: 'served',
      },
      // Newest first, ties by id ascending: no direction of `(created, id)` reads both.
      {
        name: 'Chosen',
        input: { sort: { by: 'created', direction: 'desc' } },
        page: 'first',
        verdict: 'sorted',
      },
    ])
  })

  it('refuses a source query() did not make', async () => {
    const source = { ...query(ByTitle, { entity: Db.Post }) }
    await expect(planned([{ source, input: {}, principal: null }])).rejects.toThrow(
      /not made by query\(\)/,
    )
  })
})

describe('on Postgres', () => {
  const posts = pgTable('posts', {
    id: pgText('id').primaryKey(),
    owner: pgText('owner').notNull(),
    created: pgInteger('created').notNull(),
    title: pgText('title').notNull(),
  })
  const Db = bind({ Post }, { Post: { table: posts } })
  let client: PGlite
  beforeAll(async () => {
    client = await PGlite.create()
    await client.exec(
      'create table posts (id text primary key, owner text not null, created integer not null, title text not null)',
    )
    for (const row of rows)
      await client.query('insert into posts values ($1, $2, $3, $4)', row as Array<unknown>)
  })
  afterAll(() => client.close())
  const planned = (cases: Parameters<typeof queryPlans<null>>[0]) =>
    Effect.runPromise(queryPlans(cases).pipe(Effect.provide(databaseLayer(drizzlePg({ client })))))

  it('reports a text key sorted unless its index column says collate "C", as the order does', async () => {
    // The order reads text under `collate "C"`, which lets the client place
    // rows as the server orders them. An index column of the default
    // collation cannot serve it, even where the default is "C": Postgres adds
    // an Incremental Sort for the ties.
    await client.exec('create index posts_owner_created on posts (owner, created desc, id)')
    const plain = await planned([
      { source: query(ByOwner, { entity: Db.Post }), input: { owner: 'u1' }, principal: null },
    ])
    expect(plain.map(plan => plan.verdict)).toEqual(['sorted', 'sorted'])
    await client.exec('drop index posts_owner_created')
    await client.exec(
      'create index posts_owner_created on posts (owner, created desc, id collate "C")',
    )
    const collated = await planned([
      { source: query(ByOwner, { entity: Db.Post }), input: { owner: 'u1' }, principal: null },
      { source: query(ByTitle, { entity: Db.Post }), input: {}, principal: null },
    ])
    expect(verdicts(collated)).toEqual([
      { name: 'ByOwner', input: { owner: 'u1' }, page: 'first', verdict: 'served' },
      { name: 'ByOwner', input: { owner: 'u1' }, page: 'later', verdict: 'served' },
      { name: 'ByTitle', input: {}, page: 'first', verdict: 'sorted' },
      { name: 'ByTitle', input: {}, page: 'later', verdict: 'sorted' },
    ])
    expect(collated[0]!.plan.join(' | ')).toContain('posts_owner_created')
  })
})
