// @vitest-environment node
/**
 * A query over a state (`Query.from(Draft)`), compiled for SQLite and
 * Postgres and run by the reference interpreter over held rows, as the memory
 * backend runs it: each lists the rows in the state. One state reaches
 * another row (an item on an open shelf), and is queried the same way.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import {
  Collation,
  Entity,
  Expr,
  Order,
  Held,
  Judge,
  Query as Relational,
  Relation,
  Write,
  type Refinement,
} from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, query } from '../src/index.js'

postgres()

const Shelf = Entity.define(
  'Shelf',
  Schema.Struct({ id: Schema.String, kind: Schema.Literals(['open', 'shut']) }),
)
const Store = Entity.relate(
  {
    Shelf,
    Item: Entity.define(
      'Item',
      Schema.Struct({ id: Schema.String, status: Schema.Literals(['draft', 'published']) }),
    ),
  },
  { Item: { shelf: Relation.one(Shelf) } },
)
const { Item } = Store

const Draft = Entity.refine(Item, 'Draft', { status: 'draft' })
const OnOpenShelf = Entity.refine(Item, 'OnOpenShelf', () =>
  Expr.eq(Expr.path(Item.relations.shelf, Shelf.fields.kind), 'open'),
)

const shelves = [
  { id: 's1', kind: 'open' },
  { id: 's2', kind: 'shut' },
] as const
// Every draft is on an open shelf but one, and one item on an open shelf is no draft.
const items = [
  { id: 'i1', status: 'draft', shelf: 's1' },
  { id: 'i2', status: 'published', shelf: 's1' },
  { id: 'i3', status: 'draft', shelf: 's2' },
  { id: 'i4', status: 'published', shelf: 's2' },
] as const

const create = [
  'create table ref_shelves (id text primary key, kind text not null)',
  'create table ref_items (id text primary key, status text not null, shelf_id text not null)',
]
const inserts = [
  ...shelves.map(row => ['ref_shelves', [row.id, row.kind]] as const),
  ...items.map(row => ['ref_items', [row.id, row.status, row.shelf]] as const),
]

const sqliteBound = bind(Store, {
  Shelf: {
    table: sqliteTable('ref_shelves', {
      id: text('id').primaryKey(),
      kind: text('kind').notNull(),
    }),
  },
  Item: (() => {
    const table = sqliteTable('ref_items', {
      id: text('id').primaryKey(),
      status: text('status').notNull(),
      shelfId: text('shelf_id').notNull(),
    })
    return { table, relations: { shelf: { field: table.shelfId } } }
  })(),
})
const pgBound = bind(Store, {
  Shelf: {
    table: pgTable('ref_shelves', {
      id: pgText('id').primaryKey(),
      kind: pgText('kind').notNull(),
    }),
  },
  Item: (() => {
    const table = pgTable('ref_items', {
      id: pgText('id').primaryKey(),
      status: pgText('status').notNull(),
      shelfId: pgText('shelf_id').notNull(),
    })
    return { table, relations: { shelf: { field: table.shelfId } } }
  })(),
})

const states = [
  ['Draft', Draft, ['i1', 'i3']],
  ['OnOpenShelf', OnOpenShelf, ['i1', 'i2']],
] as const

const listed = (
  name: string,
  state: Refinement<typeof Item, string, unknown>,
  bound: typeof sqliteBound | typeof pgBound,
  layer: ReturnType<typeof databaseLayer>,
) =>
  Effect.runPromise(
    query(
      {
        ...Query.make(name, { Input: {}, Result: Query.connection(Item) }),
        body: Relational.from(state).pipe(
          Relational.orderBy(Order.asc(Item.fields.id, { collation: Collation.binary })),
        ),
      },
      { entity: bound.Item },
    )
      .run({ input: {}, window: { first: 50 }, principal: null })
      .pipe(
        Effect.map(page => page.edges.map(edge => edge.id)),
        Effect.provide(layer),
      ),
  )

const sqlite = new DatabaseSync(':memory:')
let pglite: PGlite
beforeAll(async () => {
  pglite = await PGlite.create()
  for (const statement of create) {
    sqlite.exec(statement)
    await pglite.exec(statement)
  }
  for (const [table, values] of inserts) {
    sqlite
      .prepare(`insert into ${table} values (?, ?${values.length === 3 ? ', ?' : ''})`)
      .run(...values)
    await pglite.query(`insert into ${table} values ($1, $2${values.length === 3 ? ', $3' : ''})`, [
      ...values,
    ])
  }
}, 60_000)
afterAll(async () => {
  sqlite.close()
  await pglite.close()
})

describe('a query over a state', () => {
  it.each(states)('%s, on SQLite', async (name, state, expected) => {
    expect(
      await listed(name, state, sqliteBound, databaseLayer(drizzle({ client: sqlite }))),
    ).toEqual(expected)
  })

  it.each(states)('%s, on Postgres', async (name, state, expected) => {
    expect(
      await listed(name, state, pgBound, databaseLayer(drizzlePg({ client: pglite }))),
    ).toEqual(expected)
  })

  it.each(states)('%s, by the reference interpreter over held rows', (_, state, expected) => {
    const held = Held.rows([
      { entity: Shelf, rows: shelves },
      { entity: Item, rows: items },
    ])
    const body = Relational.from(state)
    const ids = held
      .rows(Item)
      .filter(row => {
        const verdict = Judge.query(body, {}, row, { rows: held })
        return verdict._tag === 'Known' && verdict.truth
      })
      .map(row => Held.match(row.field('id'), { onHeld: id => id, onUnheld: () => '' }))
      .sort()
    expect(ids).toEqual(expected)
  })

  it("refuses the state reaching another row as a write's from", () => {
    expect(() =>
      Write.update(
        Entity.input(Item, Schema.Struct({ id: Schema.String, status: Schema.Literal('draft') })),
        { id: 'id', from: OnOpenShelf },
      ),
    ).toThrow(/reaches another row/)
  })
})
