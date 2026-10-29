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
import { ne, sql, type SQL } from 'drizzle-orm'
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
  relationalCases,
  relationalContext,
  relationalTables,
  Relational,
  rows,
  type RelationalCase,
} from 'foldkit-entity/conformance'
import { bind, databaseLayer, entity, query } from '../src/index.js'

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
      await expect(answer(c, i, binding, layer)).rejects.toThrow(/NUL|NaN/)
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
    await expect(answer(c, i, pgBinding, layer)).rejects.toThrow(/NUL|NaN/)
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
// Declared only when named, so an ordinary run builds no pool from nothing.
if (localePg !== undefined)
  describe('the same on a Postgres that collates by a locale', () => {
    const db = drizzleNodePg(localePg)
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
      await expect(answer(c, i, pgBinding, layer)).rejects.toThrow(/NUL|NaN/)
    })
  })

/**
 * Paths and exists, over tables whose reader may not see every row: each
 * reached table's `visible` hides what the suite says is hidden, and the
 * answer must be `expected`, which `Judge` agrees with wherever it knows
 * (packages/entity/test/judge.test.ts).
 */
const relationalCreate = [
  'create table rel_teams (id text primary key, name text not null, region text)',
  'create table rel_members (id text primary key, handle text not null, rank integer not null, team_id text)',
  'create table rel_badges (id text primary key, kind text not null, member_id text not null)',
  'create table rel_pins (id text primary key, label text not null, team_id text not null)',
]

/** Each table's name, and its columns in insert order, from the suite's keys. */
const relationalColumns: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['rel_teams', ['id', 'name', 'region']],
  ['rel_members', ['id', 'handle', 'rank', 'team']],
  ['rel_badges', ['id', 'kind', 'member']],
  ['rel_pins', ['id', 'label', 'team']],
]

/** Every row the suite stores, visible or not, as `[table, values]`. */
const relationalInserts = relationalTables.flatMap((table, index) => {
  const [name, keys] = relationalColumns[index]!
  return [...table.visible, ...table.hidden].map(
    row => [name, keys.map(key => row[key] ?? null)] as const,
  )
})

const sqliteRelational = (() => {
  const teams = sqliteTable('rel_teams', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    region: text('region'),
  })
  const members = sqliteTable('rel_members', {
    id: text('id').primaryKey(),
    handle: text('handle').notNull(),
    rank: integer('rank').notNull(),
    teamId: text('team_id'),
  })
  const badges = sqliteTable('rel_badges', {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    memberId: text('member_id').notNull(),
  })
  const pins = sqliteTable('rel_pins', {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    teamId: text('team_id').notNull(),
  })
  return bind(Relational, {
    Team: { table: teams, visible: () => ne(teams.name, 'Hidden') },
    Member: { table: members, relations: { team: { field: members.teamId } } },
    Badge: {
      table: badges,
      visible: () => ne(badges.kind, 'secret'),
      relations: { member: { field: badges.memberId } },
    },
    Pin: { table: pins, relations: { team: { field: pins.teamId } } },
  })
})()

const pgRelational = (() => {
  const teams = pgTable('rel_teams', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    region: pgText('region'),
  })
  const members = pgTable('rel_members', {
    id: pgText('id').primaryKey(),
    handle: pgText('handle').notNull(),
    rank: pgInteger('rank').notNull(),
    teamId: pgText('team_id'),
  })
  const badges = pgTable('rel_badges', {
    id: pgText('id').primaryKey(),
    kind: pgText('kind').notNull(),
    memberId: pgText('member_id').notNull(),
  })
  const pins = pgTable('rel_pins', {
    id: pgText('id').primaryKey(),
    label: pgText('label').notNull(),
    teamId: pgText('team_id').notNull(),
  })
  return bind(Relational, {
    Team: { table: teams, visible: () => ne(teams.name, 'Hidden') },
    Member: { table: members, relations: { team: { field: members.teamId } } },
    Badge: {
      table: badges,
      visible: () => ne(badges.kind, 'secret'),
      relations: { member: { field: badges.memberId } },
    },
    Pin: { table: pins, relations: { team: { field: pins.teamId } } },
  })
})()

type Bound = typeof sqliteRelational | typeof pgRelational

/** The binding of the Entity a case queries. */
const boundFor = (bound: Bound, c: RelationalCase) =>
  Object.values(bound).find(binding => binding.name === c.body.entity.name)!

/** The ids a relational case's query answers, through `query` as a server runs it. */
const relationalAnswer = (
  c: RelationalCase,
  i: number,
  bound: Bound,
  layer: ReturnType<typeof databaseLayer>,
) => {
  const descriptor = {
    ...Query.make(`Relational${i}`, { Input: {}, Result: Query.connection(c.body.entity) }),
    body: c.body,
  }
  return Effect.runPromise(
    query(descriptor, { entity: boundFor(bound, c) })
      .run({
        input: c.input,
        window: { first: 50 },
        principal: null,
        viewer: relationalContext(c).viewer,
      })
      .pipe(
        Effect.map(page => page.edges.map(edge => edge.id)),
        Effect.provide(layer),
      ),
  )
}

const relational = relationalCases.map((c, i) => ({ c, i, name: c.what }))

describe('paths and exists compile to what the suite expects, on SQLite', () => {
  const sqlite = new DatabaseSync(':memory:')
  beforeAll(() => {
    for (const statement of relationalCreate) sqlite.exec(statement)
    for (const [name, values] of relationalInserts)
      sqlite
        .prepare(`insert into ${name} values (${values.map(() => '?').join(', ')})`)
        .run(...values)
  })
  afterAll(() => sqlite.close())

  it.each(relational)('$name', async ({ c, i }) => {
    const layer = databaseLayer(drizzle({ client: sqlite }))
    expect(await relationalAnswer(c, i, sqliteRelational, layer)).toEqual(c.expected)
  })
})

/** Seeds the relational tables into a Postgres, through any Drizzle database. */
const seedRelational = async (run: (statement: SQL) => Promise<unknown>) => {
  for (const statement of relationalCreate) await run(sql.raw(statement))
  for (const [name, values] of relationalInserts)
    await run(
      sql`insert into ${sql.identifier(name)} values (${sql.join(
        values.map(value => sql`${value}`),
        sql`, `,
      )})`,
    )
}

describe('paths and exists compile to what the suite expects, on Postgres', () => {
  const pglite = new PGlite()
  const db = drizzlePg({ client: pglite })
  beforeAll(() => seedRelational(statement => db.execute(statement)), 60_000)
  afterAll(() => pglite.close())

  it.each(relational)('$name', async ({ c, i }) => {
    expect(await relationalAnswer(c, i, pgRelational, databaseLayer(db))).toEqual(c.expected)
  })
})

if (localePg !== undefined)
  describe('paths and exists on a Postgres that collates by a locale', () => {
    const db = drizzleNodePg(localePg)
    beforeAll(async () => {
      for (const [name] of relationalColumns)
        await db.execute(sql.raw(`drop table if exists ${name}`))
      await seedRelational(statement => db.execute(statement))
    }, 60_000)
    afterAll(() => db.$client.end())

    it.each(relational)('$name', async ({ c, i }) => {
      expect(await relationalAnswer(c, i, pgRelational, databaseLayer(db))).toEqual(c.expected)
    })
  })
