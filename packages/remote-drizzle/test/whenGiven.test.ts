/**
 * `Expr.whenGiven` over every operator that takes an input: a null input keeps
 * every row and a given one filters, as `evaluate` does in memory.
 */
import { Effect, Schema } from 'effect'
import { Entity as DomainEntity, Expr, Order, type InputExpr, type Predicate } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { DrizzleDatabase, entity, query, type DrizzleDatabaseService } from '../src/index.js'
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { DatabaseSync } from 'node:sqlite'

const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  cents: integer('cents').notNull(),
})
const Item = DomainEntity.define(
  'Item',
  Schema.Struct({ id: Schema.String, status: Schema.String, cents: Schema.Number }),
)
const Binding = entity('Item', items)

const rows = [
  { id: 'a', status: 'open', cents: 100 },
  { id: 'b', status: 'shut', cents: 200 },
  { id: 'c', status: 'open', cents: 300 },
]

const database = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'create table items (id text primary key, status text not null, cents integer not null)',
  )
  for (const row of rows)
    sqlite.exec(`insert into items values ('${row.id}', '${row.status}', ${row.cents})`)
  return drizzle({ client: sqlite }) as unknown as DrizzleDatabaseService
}

const cases: ReadonlyArray<{
  readonly name: string
  readonly Input: Schema.Struct.Fields
  readonly body: (input: { readonly v: InputExpr<any> }) => Predicate
  readonly given: Record<string, unknown>
  readonly keeps: ReadonlyArray<string>
  readonly none: Record<string, unknown>
}> = [
  {
    name: 'in',
    Input: { v: Schema.NullOr(Schema.Array(Schema.String)) },
    body: input => Expr.whenGiven(input.v, v => Expr.in(Item.fields.status, v)),
    given: { v: ['shut'] },
    keeps: ['b'],
    none: { v: null },
  },
  {
    name: 'gte',
    Input: { v: Schema.NullOr(Schema.Number) },
    body: input => Expr.whenGiven(input.v, v => Expr.gte(Item.fields.cents, v)),
    given: { v: 200 },
    keeps: ['b', 'c'],
    none: { v: null },
  },
  {
    name: 'lte',
    Input: { v: Schema.NullOr(Schema.Number) },
    body: input => Expr.whenGiven(input.v, v => Expr.lte(Item.fields.cents, v)),
    given: { v: 200 },
    keeps: ['a', 'b'],
    none: { v: null },
  },
  {
    name: 'contains',
    Input: { v: Schema.NullOr(Schema.String) },
    body: input => Expr.whenGiven(input.v, v => Expr.contains(Item.fields.status, v)),
    given: { v: 'hu' },
    keeps: ['b'],
    none: { v: null },
  },
  {
    name: 'eq',
    Input: { v: Schema.NullOr(Schema.String) },
    body: input => Expr.whenGiven(input.v, v => Expr.eq(Item.fields.status, v)),
    given: { v: 'open' },
    keeps: ['a', 'c'],
    none: { v: null },
  },
]

describe('whenGiven on SQLite', () => {
  for (const c of cases) {
    const Q = Query.define(`WhenGiven_${c.name}`, c.Input, ({ input }) =>
      Query.from(Item).pipe(
        Query.where(c.body(input as { readonly v: InputExpr<any> })),
        Query.orderBy(Order.asc(Item.fields.id)),
      ),
    )
    const run = (input: Record<string, unknown>) =>
      Effect.runPromise(
        query(Q, { entity: Binding })
          .run({ input, window: { first: 10 }, principal: null })
          .pipe(Effect.provideService(DrizzleDatabase, database())),
      )
    const ids = (page: { edges: ReadonlyArray<{ id: string }> }) => page.edges.map(e => e.id)

    it(`${c.name}: a null input keeps every row`, async () => {
      expect(ids(await run(c.none))).toEqual(['a', 'b', 'c'])
    })
    it(`${c.name}: a given input filters`, async () => {
      expect(ids(await run(c.given))).toEqual(c.keeps)
    })
  }
})
