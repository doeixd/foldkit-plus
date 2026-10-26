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
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import {
  Subject,
  cases,
  primitiveCases,
  primitiveRefusals,
  refusals,
  rows,
} from 'foldkit-entity/conformance'
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

// The kernel's primitive operators too: the binding's tables are both kernels.
const all = [...cases, ...primitiveCases]
const named = all.map((c, i) => ({ c, i, name: c.what }))

/**
 * The ids a case's query answers two at a time, each page after the last's
 * cursor: the keyset predicate has to agree with the order, nulls included,
 * or a page skips or repeats a row.
 */
const paged = async (
  { body, input }: Pick<(typeof cases)[number], 'body' | 'input'>,
  i: number,
  target: typeof binding | typeof pgBinding,
  layer: ReturnType<typeof databaseLayer>,
) => {
  const descriptor = {
    ...Query.make(`Paged${i}`, { Input: {}, Result: Query.connection(Subject) }),
    body,
  }
  const source = query(descriptor, { entity: target })
  const ids: Array<string> = []
  let after: string | undefined
  for (let page = 0; page < rows.length + 1; page++) {
    const read = await Effect.runPromise(
      source
        .run({
          input,
          window: { first: 2, ...(after === undefined ? {} : { after }) },
          principal: null,
        })
        .pipe(Effect.provide(layer)),
    )
    ids.push(...read.edges.map(edge => edge.id))
    if (read.end._tag !== 'Cursor') return ids
    after = read.end.cursor
  }
  return ids
}

/** The cases that order rows, the ones paging can get wrong. */
const ordered = named.filter(({ c }) => c.body.orderBy.length > 0)

const create =
  'create table conformance_rows (id text primary key, label text not null, rank integer not null, tag text, at text not null)'

const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(create)
  const insert = sqlite.prepare('insert into conformance_rows values (?, ?, ?, ?, ?)')
  for (const row of rows) insert.run(row.id, row.label, row.rank, row.tag, row.at)
  return sqlite
}

describe('foldkit-remote-drizzle conforms to the query semantics', () => {
  it.each(named)('$name', async ({ c, i }) => {
    const sqlite = seeded()
    try {
      const layer = databaseLayer(drizzle({ client: sqlite }))
      expect(await answer(c, i, binding, layer)).toEqual(c.expected)
    } finally {
      sqlite.close()
    }
  })

  it.each(ordered)('pages to the same answer, two rows at a time: $name', async ({ c, i }) => {
    const sqlite = seeded()
    try {
      const layer = databaseLayer(drizzle({ client: sqlite }))
      expect(await paged(c, i, binding, layer)).toEqual(c.expected)
    } finally {
      sqlite.close()
    }
  })
})

const refused = [...refusals, ...primitiveRefusals].map((c, i) => ({
  c,
  i: all.length + i,
  name: c.what,
}))

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
  // Postgres compiled to WebAssembly takes seconds to start on a busy machine.
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
  }, 60_000)
  afterAll(() => pglite.close())

  it.each(named)('$name', async ({ c, i }) => {
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    expect(await answer(c, i, pgBinding, layer)).toEqual(c.expected)
  })
  it.each(ordered)('pages on Postgres too: $name', async ({ c, i }) => {
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    expect(await paged(c, i, pgBinding, layer)).toEqual(c.expected)
  })
  it.each(refused)('refuses on Postgres too: $name', async ({ c, i }) => {
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    await expect(answer(c, i, pgBinding, layer)).rejects.toThrow(/NUL/)
  })
})

// The suite's rows hold no accented text, and its accented cases read no field,
// so the compiler decides them without SQL: this is the one that folds a row.
describe('foldkit-remote-drizzle folds a stored row as the evaluator does, on Postgres', () => {
  const pglite = new PGlite()
  // Postgres compiled to WebAssembly takes seconds to start on a busy machine.
  beforeAll(async () => {
    await pglite.exec(create)
    await pglite.query('insert into conformance_rows values ($1, $2, $3, $4, $5)', [
      'f',
      'Élan',
      1,
      null,
      '2026-01-01T00:00:00.000Z',
    ])
  }, 60_000)
  afterAll(() => pglite.close())

  it.each([
    { search: 'é', expected: [] },
    { search: 'Él', expected: ['f'] },
    { search: 'LAN', expected: ['f'] },
  ])('finds "$search" in "Élan" only as ASCII folds', async ({ search, expected }) => {
    const body = Query.from(Subject).pipe(
      Query.where(Expr.contains(Subject.fields.label, search)),
      Query.orderBy(Order.asc(Subject.fields.id)),
    )
    const layer = databaseLayer(drizzlePg({ client: pglite }))
    expect(await answer({ body, input: {} }, 900, pgBinding, layer)).toEqual(expected)
  })
})

/**
 * PGlite's database collates by `C`, so the suite above cannot show that the
 * collation each comparison and order names is what decides, not the
 * database's (expr-operations-DESIGN §15, question 11). This runs it on a
 * Postgres that collates by a locale, when `FOLDKIT_LOCALE_PG` names one:
 *
 *   docker run -d -e POSTGRES_PASSWORD=probe -p 55432:5432 \
 *     -e POSTGRES_INITDB_ARGS="--locale=en_US.UTF-8" postgres:18
 *   FOLDKIT_LOCALE_PG=postgres://postgres:probe@localhost:55432/postgres
 */
const localePg = process.env.FOLDKIT_LOCALE_PG
describe.runIf(localePg !== undefined)('the same on a Postgres that collates by a locale', () => {
  const db = drizzleNodePg(localePg ?? '')
  const layer = databaseLayer(db)
  beforeAll(async () => {
    await db.execute(sql.raw('drop table if exists conformance_rows'))
    await db.execute(sql.raw(create))
    for (const row of rows)
      await db.execute(
        sql`insert into conformance_rows values (${row.id}, ${row.label}, ${row.rank}, ${row.tag}, ${row.at})`,
      )
  }, 60_000)
  afterAll(() => db.$client.end())

  const ids = async (statement: string) =>
    (await db.execute<{ id: string }>(statement, 'objects')).map(row => row.id)

  it('collates by the locale where nothing names a collation, so the run proves something', async () => {
    // `intro to sql` sorts among the capitals under en_US, after them under C.
    expect(await ids('select id from conformance_rows order by label')).toEqual([
      'd',
      'a',
      'b',
      'c',
      'e',
    ])
    expect(await ids('select id from conformance_rows order by label collate "C"')).toEqual([
      'd',
      'a',
      'c',
      'b',
      'e',
    ])
  })
  it.each(named)('$name', async ({ c, i }) => {
    expect(await answer(c, i, pgBinding, layer)).toEqual(c.expected)
  })
  it.each(ordered)('pages: $name', async ({ c, i }) => {
    expect(await paged(c, i, pgBinding, layer)).toEqual(c.expected)
  })
  it.each(refused)('refuses: $name', async ({ c, i }) => {
    await expect(answer(c, i, pgBinding, layer)).rejects.toThrow(/NUL/)
  })
})
