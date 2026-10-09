/**
 * The compiling interpreter against the shared conformance suite, over a real
 * SQLite and a real Postgres (PGlite, Postgres compiled to WebAssembly, under
 * its default UTF-8 character type). The same cases run against
 * `foldkit-remote-server`'s `evaluate`; a body that means two things, in one
 * dialect or between them, fails in whichever is wrong.
 */
import { PGlite } from '@electric-sql/pglite'
import { Effect } from 'effect'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Query } from 'foldkit-remote'
import { Subject, cases, refusals, rows } from 'foldkit-entity/conformance'
import { databaseLayer, entity, query } from '../src/index.js'

const table = sqliteTable('conformance_rows', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  rank: integer('rank').notNull(),
  tag: text('tag'),
  at: text('at').notNull(),
})

const binding = entity('Subject', table)

/** The ids one case's query answers with, over one binding and database. */
const answer = (
  { body, input }: Pick<(typeof cases)[number], 'body' | 'input'>,
  i: number,
  target: typeof binding | typeof pgBinding,
  layer: ReturnType<typeof databaseLayer>,
) => {
  const descriptor = {
    ...Query.make(`Case${i}`, { Input: {}, Result: Query.connection(Subject) }),
    body,
  }
  return Effect.runPromise(
    query(descriptor, { entity: target })
      .run({ input, window: { first: 50 }, principal: null })
      .pipe(
        Effect.map(page => page.edges.map(edge => edge.id)),
        Effect.provide(layer),
      ),
  )
}

const named = cases.map((c, i) => ({ c, i, name: c.what }))

const create =
  'create table conformance_rows (id text primary key, label text not null, rank integer not null, tag text, at text not null)'

describe('foldkit-remote-drizzle conforms to the query semantics', () => {
  it.each(named)('$name', async ({ c, i }) => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(create)
      const insert = sqlite.prepare('insert into conformance_rows values (?, ?, ?, ?, ?)')
      for (const row of rows) insert.run(row.id, row.label, row.rank, row.tag, row.at)
      const layer = databaseLayer(drizzle({ client: sqlite }))
      expect(await answer(c, i, binding, layer)).toEqual(c.expected)
    } finally {
      sqlite.close()
    }
  })
})

const refused = refusals.map((c, i) => ({ c, i: cases.length + i, name: c.what }))

describe('foldkit-remote-drizzle refuses what no two interpreters agree on', () => {
  it.each(refused)('$name', async ({ c, i }) => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(create)
      const layer = databaseLayer(drizzle({ client: sqlite }))
      await expect(answer(c, i, binding, layer)).rejects.toThrow(/NUL/)
    } finally {
      sqlite.close()
    }
  })
})

const pgRows = pgTable('conformance_rows', {
  id: pgText('id').primaryKey(),
  label: pgText('label').notNull(),
  rank: pgInteger('rank').notNull(),
  tag: pgText('tag'),
  at: pgText('at').notNull(),
})
const pgBinding = entity('Subject', pgRows)

describe('foldkit-remote-drizzle conforms to the query semantics on Postgres', () => {
  // One database for every case: they only read.
  const pglite = new PGlite()
  beforeAll(async () => {
    await pglite.exec(create)
    for (const row of rows)
      await pglite.query('insert into conformance_rows values ($1, $2, $3, $4, $5)', [
        row.id,
        row.label,
        row.rank,
        row.tag,
        row.at,
      ])
  })
  afterAll(() => pglite.close())

  it.each(named)('$name', async ({ c, i }) => {
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    expect(await answer(c, i, pgBinding, layer)).toEqual(c.expected)
  })
  it.each(refused)('refuses on Postgres too: $name', async ({ c, i }) => {
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    await expect(answer(c, i, pgBinding, layer)).rejects.toThrow(/NUL/)
  })
})
