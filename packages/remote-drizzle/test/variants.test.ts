/**
 * Variants of an Entity (#357) over a real SQLite and a real Postgres (PGlite):
 * one table with a `_tag` column and a nullable column per case field. The
 * conformance set's answers come from the SQL `Expr.is` compiles to, and the
 * CHECK each case's invariant becomes refuses a row mixing cases.
 */
import { PGlite } from '@electric-sql/pglite'
import { Effect } from 'effect'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  Variant,
  variantCases,
  variantRows,
  type ConformanceCase,
} from 'foldkit-entity/conformance'
import { Query } from 'foldkit-remote'
import { bind, checkConstraints, databaseLayer, entityChecks, query } from '../src/index.js'

const sqliteRows = sqliteTable(
  'variant_rows',
  {
    _tag: text('_tag').notNull(),
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    cents: integer('cents'),
    until: text('until'),
  },
  t => entityChecks(Variant, t),
)
const pgRows = pgTable(
  'variant_rows',
  {
    _tag: pgText('_tag').notNull(),
    id: pgText('id').primaryKey(),
    label: pgText('label').notNull(),
    cents: pgInteger('cents'),
    until: pgText('until'),
  },
  t => entityChecks(Variant, t),
)
const Sqlite = bind({ Variant }, { Variant: { table: sqliteRows } })
const Pg = bind({ Variant }, { Variant: { table: pgRows } })

/** The table as a migration writes it: its columns, and every CHECK the binding asks of it. */
const create = (binding: typeof Sqlite.Variant | typeof Pg.Variant) =>
  `create table variant_rows (_tag text not null, id text primary key, label text not null, cents integer, until text, ${checkConstraints(
    binding,
  )
    .constraints.map(each => each.constraint)
    .join(', ')})`

const columns = ['_tag', 'id', 'label', 'cents', 'until'] as const
const valuesOf = (row: Readonly<Record<string, unknown>>) =>
  columns.map(column => row[column] as string | number | null)

const answer = (
  { body, input }: ConformanceCase,
  i: number,
  binding: typeof Sqlite.Variant | typeof Pg.Variant,
  layer: ReturnType<typeof databaseLayer>,
) =>
  Effect.runPromise(
    query(
      {
        ...Query.make(`Variant${i}`, { Input: {}, Result: Query.connection(Variant) }),
        body,
      },
      { entity: binding },
    )
      .run({ input, window: { first: 50 }, principal: null })
      .pipe(
        Effect.map(page => page.edges.map(edge => edge.id)),
        Effect.provide(layer),
      ),
  )

const named = variantCases.map((c, i) => ({ c, i, name: c.what }))

describe('variants on SQLite', () => {
  let sqlite: DatabaseSync
  const insert = (row: Readonly<Record<string, unknown>>) =>
    sqlite.prepare(`insert into variant_rows values (?, ?, ?, ?, ?)`).run(...valuesOf(row))
  beforeAll(() => {
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(create(Sqlite.Variant))
    for (const row of variantRows) insert(row)
  })
  afterAll(() => sqlite.close())

  it.each(named)('$name', async ({ c, i }) => {
    const layer = databaseLayer(drizzle({ client: sqlite }))
    expect(await answer(c, i, Sqlite.Variant, layer)).toEqual(c.expected)
  })

  it('names a CHECK per case with fields to hold', () => {
    expect(checkConstraints(Sqlite.Variant).constraints.map(each => each.name)).toEqual([
      'variant_rows__tag_check',
      'variant_rows_variant_Priced',
      'variant_rows_variant_Free',
      'variant_rows_variant_Held',
    ])
  })

  it.each([
    ['a Free holding a price', { _tag: 'Free', id: 'x', label: 'x', cents: 5, until: null }],
    ['a Priced without one', { _tag: 'Priced', id: 'y', label: 'y', cents: null, until: null }],
    ['a Priced holding until', { _tag: 'Priced', id: 'z', label: 'z', cents: 5, until: 'later' }],
  ])('refuses %s', (_, row) => {
    expect(() => insert(row)).toThrow('CHECK constraint failed')
  })
})

describe('variants on Postgres', () => {
  let pglite: PGlite
  const insert = (row: Readonly<Record<string, unknown>>) =>
    pglite.query(`insert into variant_rows values ($1, $2, $3, $4, $5)`, valuesOf(row))
  // Postgres compiled to WebAssembly takes seconds to start on a busy machine.
  beforeAll(async () => {
    pglite = await PGlite.create()
    await pglite.exec(create(Pg.Variant))
    for (const row of variantRows) await insert(row)
  }, 60_000)
  afterAll(() => pglite.close())

  it.each(named)('$name', async ({ c, i }) => {
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    expect(await answer(c, i, Pg.Variant, layer)).toEqual(c.expected)
  })

  it.each([
    ['a Free holding a price', { _tag: 'Free', id: 'x', label: 'x', cents: 5, until: null }],
    ['a Priced without one', { _tag: 'Priced', id: 'y', label: 'y', cents: null, until: null }],
  ])('refuses %s', async (_, row) => {
    await expect(insert(row)).rejects.toThrow('violates check constraint')
  })
})
