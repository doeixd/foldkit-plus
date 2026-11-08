/**
 * A page of a body's list, as SQLite plans it. SQLite sorts the last term of an
 * order whose terms place nulls against its own default, so an `ORDER BY …,
 * id asc nulls last` sorted its ties though an index held the order; a column
 * declared not null now places none, and the index serves the whole page.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { expect, it } from 'vitest'
import { bind, databaseLayer, query } from '../src/index.js'

const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    created: integer('created').notNull(),
  },
  t => [index('posts_owner_created_id').on(t.owner, sql`${t.created} desc`, t.id)],
)
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, owner: Schema.String, created: Schema.Number }),
)
const Db = bind({ Post }, { Post: { table: posts } })
const ByOwner = Query.define('ByOwner', { owner: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.owner, input.owner)),
    Query.orderBy(Order.desc(Post.fields.created)),
  ),
)
const source = query(ByOwner, { entity: Db.Post })

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(
  'create table posts (id text primary key not null, owner text not null, created integer not null)',
)
// Newest first, ties by id ascending, as the body's order and its tie-break read.
sqlite.exec('create index posts_owner_created_id on posts (owner, created desc, id)')
const insert = sqlite.prepare('insert into posts values (?, ?, ?)')
for (let row = 0; row < 40; row++) insert.run(`p${row}`, `u${row % 4}`, row % 10)

/** The page query a window runs, and how SQLite plans it. */
const planned = async (window: { readonly first: number; readonly after?: string }) => {
  const statements: Array<{ readonly text: string; readonly params: ReadonlyArray<unknown> }> = []
  const database = drizzle({
    client: sqlite,
    logger: { logQuery: (text, params) => void statements.push({ text, params }) },
  })
  const page = await Effect.runPromise(
    source
      .run({ input: { owner: 'u1' }, window, principal: null })
      .pipe(Effect.provide(databaseLayer(database))),
  )
  // The page is the last statement: a cursor's keys are read before it.
  const last = statements.at(-1)!
  const plan = sqlite
    .prepare(`explain query plan ${last.text}`)
    .all(...(last.params as Array<string | number>))
    .map(step => String(step.detail))
  return { page, text: last.text, plan }
}

it('serves a first page from the index, sorting nothing', async () => {
  const { page, text, plan } = await planned({ first: 3 })
  expect(page.edges).toHaveLength(3)
  expect(text).toContain('order by')
  expect(plan.join(' | ')).toContain('posts_owner_created_id')
  expect(plan.filter(step => step.includes('TEMP B-TREE'))).toEqual([])
})

it('serves a later page from the index too', async () => {
  const first = await planned({ first: 3 })
  const { page, plan } = await planned({ first: 3, after: first.page.edges.at(-1)!.id })
  expect(page.edges).toHaveLength(3)
  expect(plan.filter(step => step.includes('TEMP B-TREE'))).toEqual([])
})
