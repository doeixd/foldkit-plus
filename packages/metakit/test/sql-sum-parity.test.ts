/**
 * `num.add` and `num.sub` over integer columns on a database: for every row,
 * the value SQL stores or filters on is what `Expr.evalResult` gives, a refusal
 * (a result past ±(2^53−1)) being NULL, on Postgres (PGlite) and SQLite
 * (`node:sqlite`), as text and through Drizzle. SQLite would return such a sum
 * as a float and Postgres would raise on an `integer` sum of its own. The rows
 * sit at the boundary and one step either side of it, past an `int4`, past
 * int64 where SQLite turns to floating point, hold nulls, and a seeded spread.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import { bigint, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Bool, Expr, Null, Num, Ord, Path, Transition } from 'metakit'
import * as Drizzle from 'metakit/drizzle'
import * as Sql from 'metakit/sql'

const MAX = Number.MAX_SAFE_INTEGER

const State = Schema.Struct({
  id: Schema.String,
  a: Schema.NullOr(Schema.Int),
  b: Schema.NullOr(Schema.Int),
  c: Schema.NullOr(Schema.Int),
  r: Schema.NullOr(Schema.Int),
})
const at = Path.forSchema(State)

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

interface Held {
  readonly id: string
  readonly a: number | null
  readonly b: number | null
  readonly c: number | null
}

const rows: ReadonlyArray<Held> = (() => {
  const made: Array<readonly [number | null, number | null, number | null]> = [
    [null, null, null],
    [null, 5, 1],
    [5, null, 1],
    [5, 1, null],
    [0, 0, 0],
    // The boundary, one step inside it and one step past it, each sign and each operator.
    [MAX, 0, 0],
    [MAX, 1, 0],
    [MAX - 1, 1, 0],
    [MAX - 1, 2, 0],
    [-MAX, 0, 0],
    [-MAX, -1, 0],
    [-MAX + 1, -1, 0],
    [-MAX + 1, -2, 0],
    [MAX, MAX, 0],
    [-MAX, -MAX, 0],
    [MAX, -MAX, 0],
    [-MAX, MAX, 0],
    [MAX, -1, 0],
    [-MAX, 1, 0],
    [MAX, -2, 0],
    [-MAX, 2, 0],
    [MAX - 1, -2, 0],
    [-MAX + 1, 2, 0],
    [-2, MAX, 0],
    [0, MAX, 0],
    [0, -MAX, 0],
    [1, MAX, 0],
    [-1, -MAX, 0],
    // A sum whose first step is past the range and whose second brings it back, and the reverse.
    [MAX, 1, -1],
    [MAX, 1, 1],
    [-MAX, -1, 1],
    [MAX, 0, MAX],
    [1, MAX, MAX],
    [2, 3, MAX - 5],
    [2, 3, MAX - 4],
    // Past an int4 and within int64, which Postgres raises on if it sums in `integer`.
    [2_147_483_647, 1, 0],
    [2_147_483_647, 2_147_483_647, 2_147_483_647],
    [-2_147_483_648, -1, 0],
    [4_294_967_296, 4_294_967_296, 4_294_967_296],
    // Where the sum is past int64: SQLite carries it on as a float.
    [4_611_686_018_427_387, 4_611_686_018_427_387, 4_611_686_018_427_387],
    [9_007_199_254_740_990, 9_007_199_254_740_990, 9_007_199_254_740_990],
  ]
  const random = seeded(2027)
  const magnitudes = [10, 1_000, 100_000, 10 ** 8, 10 ** 12, MAX]
  const operand = (): number => {
    const sign = random() < 0.5 ? -1 : 1
    const top = magnitudes[Math.floor(random() * magnitudes.length)]!
    return sign * Math.floor(random() * top)
  }
  for (let i = 0; i < 200; i++) made.push([operand(), operand(), operand()])
  return made.map(([a, b, c], index) => ({ id: `r${String(index).padStart(3, '0')}`, a, b, c }))
})()

const asState = (row: Held) => ({ ...row, r: null })

interface Columns<E> {
  readonly a: Expr.Expr<E, number | null>
  readonly b: Expr.Expr<E, number | null>
  readonly c: Expr.Expr<E, number | null>
}

/** Sums over the columns of a row, written over whichever paths the reader is given. */
const sums = {
  'a + b': <E>({ a, b }: Columns<E>) => Num.add(a, b),
  'a - b': <E>({ a, b }: Columns<E>) => Num.sub(a, b),
  'a + 1': <E>({ a }: Columns<E>) => Num.add(a, 1),
  'a - 1': <E>({ a }: Columns<E>) => Num.sub(a, 1),
  '1 - a': <E>({ a }: Columns<E>) => Num.sub(1, a),
  '(a + b) + c': <E>({ a, b, c }: Columns<E>) => Num.add(Num.add(a, b), c),
  '(a + b) - c': <E>({ a, b, c }: Columns<E>) => Num.sub(Num.add(a, b), c),
  'a - (b - c)': <E>({ a, b, c }: Columns<E>) => Num.sub(a, Num.sub(b, c)),
  '(-a) + b': <E>({ a, b }: Columns<E>) => Num.add(Num.neg(a), b),
} as const
const names = Object.keys(sums) as ReadonlyArray<keyof typeof sums>

/** What evaluation gives for each row: a value, or null for a null operand and for a refusal. */
const expected = (name: keyof typeof sums): ReadonlyMap<string, number | null> =>
  new Map(
    rows.map(row => {
      const result = Expr.evalResult(sums[name](at), asState(row))
      return [row.id, Result.isSuccess(result) ? result.success : null] as const
    }),
  )

const update = (name: keyof typeof sums) =>
  Transition.make({
    state: State,
    input: Schema.Struct({}),
    apply: ({ state }) => [Transition.set(state.r, sums[name](state))],
  })

/** A condition over a sum: the rows evaluation holds it for are those where it is not refused. */
const conditions = {
  'a + b > 0': Expr.in({ row: State }, ({ row }) => Ord.gt(Num.add(row.a, row.b), 0)),
  'a - b <= 0': Expr.in({ row: State }, ({ row }) => Ord.lte(Num.sub(row.a, row.b), 0)),
  'not (a + b > 0)': Expr.in({ row: State }, ({ row }) =>
    Bool.not(Ord.gt(Num.add(row.a, row.b), 0)),
  ),
  '(a + b) + c >= 0': Expr.in({ row: State }, ({ row }) =>
    Ord.gte(Num.add(Num.add(row.a, row.b), row.c), 0),
  ),
} as const
const conditionNames = Object.keys(conditions) as ReadonlyArray<keyof typeof conditions>

const holding = (name: keyof typeof conditions): ReadonlyArray<string> =>
  rows.filter(row => Expr.holds(conditions[name], { row: asState(row) })).map(row => row.id)

/**
 * The one place SQL and memory part, as for `num.mulScaled`: a refusal is NULL
 * in SQL, so a test of nullness holds of a refused sum there and is itself
 * refused in memory.
 */
const nullness = Expr.in({ row: State }, ({ row }) => Null.isNull(Num.add(row.a, row.b)))
const refusedSums = rows
  .filter(row => row.a !== null && row.b !== null && expected('a + b').get(row.id) === null)
  .map(row => row.id)
const heldWhereRefused = [
  ...rows.filter(row => Expr.holds(nullness, { row: asState(row) })).map(row => row.id),
  ...refusedSums,
].sort()

const UNTOUCHED = 4_611_686_018_427_387_904n

describe('what the fixtures are', () => {
  it.each(names)('hold refused rows and values for %s', name => {
    const answers = [...expected(name).values()]
    expect(answers.filter(value => value === null).length).toBeGreaterThan(8)
    expect(answers.filter(value => value !== null).length).toBeGreaterThan(50)
  })

  it('refuse a sum past the range and keep the one at it', () => {
    const sum = expected('a + b')
    const find = (a: number, b: number) =>
      sum.get(rows.find(row => row.a === a && row.b === b && row.c === 0)!.id)
    expect(find(MAX - 1, 1)).toBe(MAX)
    expect(find(MAX, 1)).toBeNull()
    expect(find(-MAX + 1, -1)).toBe(-MAX)
    expect(find(-MAX, -1)).toBeNull()
  })

  it.each(conditionNames)('give a condition both held and refused rows: %s', name => {
    expect(holding(name).length).toBeGreaterThan(20)
    expect(holding(name).length).toBeLessThan(rows.length - 20)
  })
})

const read = (found: ReadonlyArray<{ readonly id: unknown; readonly r: unknown }>) =>
  new Map(found.map(row => [String(row.id), row.r === null ? null : Number(row.r)] as const))

const pgRows = pgTable('rows', {
  id: pgText('id').primaryKey(),
  a: bigint('a', { mode: 'number' }),
  b: bigint('b', { mode: 'number' }),
  c: bigint('c', { mode: 'number' }),
  r: bigint('r', { mode: 'bigint' }),
})

const sqliteRows = sqliteTable('rows', {
  id: sqliteText('id').primaryKey(),
  a: integer('a', { mode: 'number' }),
  b: integer('b', { mode: 'number' }),
  c: integer('c', { mode: 'number' }),
  r: integer('r', { mode: 'number' }),
})

describe('Postgres stores and filters as Expr.evalResult does', () => {
  let pg: PGlite
  beforeAll(async () => {
    pg = new PGlite()
    await pg.exec(
      `CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "a" BIGINT, "b" BIGINT, "c" BIGINT, "r" BIGINT)`,
    )
    await pg.exec(
      `CREATE TABLE "small" ("id" TEXT PRIMARY KEY, "a" INTEGER, "b" INTEGER, "r" BIGINT)`,
    )
    for (const row of rows) {
      await pg.query(`INSERT INTO "rows" VALUES ($1, $2, $3, $4, NULL)`, [
        row.id,
        row.a,
        row.b,
        row.c,
      ])
    }
  }, 60_000)
  afterAll(() => pg.close())

  it.each(names)('stores %s, as text', async name => {
    await pg.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const fragment = Result.getOrThrow(Sql.toUpdate('rows', update(name), {}))
    await pg.query(fragment.text, [...fragment.params])
    const found = await pg.query<{ id: string; r: unknown }>(`SELECT "id", "r" FROM "rows"`)
    expect(read(found.rows)).toEqual(expected(name))
  })

  it.each(names)('stores %s, through Drizzle', async name => {
    await pg.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const built = Result.getOrThrow(Drizzle.toUpdate(update(name), {}, pgRows))
    const db = drizzlePg({ client: pg })
    await db.update(pgRows).set(built.set).where(built.where)
    const found = await db.select({ id: pgRows.id, r: pgRows.r }).from(pgRows)
    expect(read(found)).toEqual(expected(name))
  })

  it.each(conditionNames)('holds %s for the rows evaluation holds it for', async name => {
    const where = Result.getOrThrow(Sql.toWhere(conditions[name]))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(found.rows.map(row => row.id)).toEqual(holding(name))
  })

  it('holds a nullness test of a refused sum, which memory refuses', async () => {
    expect(refusedSums.length).toBeGreaterThan(8)
    const where = Result.getOrThrow(Sql.toWhere(nullness))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(found.rows.map(row => row.id)).toEqual(heldWhereRefused)
  })

  it('sums two int4 columns past int4 without raising', async () => {
    const Small = Schema.Struct({
      id: Schema.String,
      a: Schema.Int,
      b: Schema.Int,
      r: Schema.NullOr(Schema.Int),
    })
    await pg.exec(`INSERT INTO "small" VALUES ('x', 2147483647, 2147483647, NULL)`)
    const sum = Transition.make({
      state: Small,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.r, Num.add(state.a, state.b))],
    })
    const fragment = Result.getOrThrow(Sql.toUpdate('small', sum, {}))
    await pg.query(fragment.text, [...fragment.params])
    const found = await pg.query<{ r: unknown }>(`SELECT "r" FROM "small"`)
    expect(found.rows.map(row => Number(row.r))).toEqual([4_294_967_294])
  })
})

describe('SQLite stores and filters as Expr.evalResult does', () => {
  let db: DatabaseSync
  beforeAll(() => {
    db = new DatabaseSync(':memory:')
    db.exec(
      `CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "a" INTEGER, "b" INTEGER, "c" INTEGER, "r" INTEGER)`,
    )
    const insert = db.prepare(`INSERT INTO "rows" VALUES (?, ?, ?, ?, NULL)`)
    for (const row of rows) insert.run(row.id, row.a, row.b, row.c)
  })
  afterAll(() => db.close())

  it.each(names)('stores %s, as text', name => {
    db.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const fragment = Result.getOrThrow(
      Sql.toUpdate('rows', update(name), {}, { dialect: 'sqlite' }),
    )
    db.prepare(fragment.text).run(...(fragment.params as Array<SQLInputValue>))
    const select = db.prepare(`SELECT "id", "r" FROM "rows"`)
    // A float past the safe range, or an untouched value, reads as itself and not as an error.
    select.setReadBigInts(true)
    const found = select.all()
    expect(read(found.map(row => ({ id: row['id'], r: row['r'] })))).toEqual(expected(name))
    // An integer, never a float that happens to be whole.
    const kinds = db
      .prepare(`SELECT DISTINCT typeof("r") AS kind FROM "rows" WHERE "r" IS NOT NULL`)
      .all()
    expect(kinds).toEqual([{ kind: 'integer' }])
  })

  it.each(names)('stores %s, through Drizzle', async name => {
    db.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const built = Result.getOrThrow(
      Drizzle.toUpdate(update(name), {}, sqliteRows, { dialect: 'sqlite' }),
    )
    const orm = drizzleSqlite({ client: db })
    await orm.update(sqliteRows).set(built.set).where(built.where)
    const found = await orm.select({ id: sqliteRows.id, r: sqliteRows.r }).from(sqliteRows)
    expect(read(found)).toEqual(expected(name))
  })

  it.each(conditionNames)('holds %s for the rows evaluation holds it for', name => {
    const where = Result.getOrThrow(Sql.toWhere(conditions[name], { dialect: 'sqlite' }))
    const found = db
      .prepare(`SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`)
      .all(...(where.params as Array<SQLInputValue>))
    expect(found.map(row => row['id'])).toEqual(holding(name))
  })

  it('holds a nullness test of a refused sum, which memory refuses', () => {
    const where = Result.getOrThrow(Sql.toWhere(nullness, { dialect: 'sqlite' }))
    const found = db
      .prepare(`SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`)
      .all(...(where.params as Array<SQLInputValue>))
    expect(found.map(row => row['id'])).toEqual(heldWhereRefused)
  })
})

/** A sum with a fraction in it is left as SQL adds it: the guard is for integers alone. */
const Fractions = Schema.Struct({ id: Schema.String, x: Schema.Finite, n: Schema.Int })
const fractionRows = [
  { id: 'a', x: 0.1, n: 0 },
  { id: 'b', x: 0.6, n: 0 },
  { id: 'c', x: 0.9, n: 1 },
  { id: 'd', x: 1.4, n: -1 },
  { id: 'e', x: -0.4, n: 2 },
]
const fractionSums = {
  'x + 0.5 > 1': Expr.in({ row: Fractions }, ({ row }) => Ord.gt(Num.add(row.x, 0.5), 1)),
  'x + n > 1': Expr.in({ row: Fractions }, ({ row }) => Ord.gt(Num.add(row.x, row.n), 1)),
  'x - n < 0.5': Expr.in({ row: Fractions }, ({ row }) => Ord.lt(Num.sub(row.x, row.n), 0.5)),
}
const fractionHolds = (predicate: (typeof fractionSums)[keyof typeof fractionSums]) =>
  fractionRows.filter(row => Expr.holds(predicate, { row })).map(row => row.id)

describe('a sum with a fraction in it', () => {
  it.each(Object.entries(fractionSums))(
    '%s holds on Postgres as in memory',
    async (_, predicate) => {
      const pg = new PGlite()
      await pg.exec(`CREATE TABLE "f" ("id" TEXT PRIMARY KEY, "x" DOUBLE PRECISION, "n" BIGINT)`)
      for (const row of fractionRows) {
        await pg.query(`INSERT INTO "f" VALUES ($1, $2, $3)`, [row.id, row.x, row.n])
      }
      const where = Result.getOrThrow(Sql.toWhere(predicate))
      const found = await pg.query<{ id: string }>(
        `SELECT "id" FROM "f" WHERE ${where.text} ORDER BY "id"`,
        [...where.params],
      )
      await pg.close()
      expect(found.rows.map(row => row.id)).toEqual(fractionHolds(predicate))
      expect(fractionHolds(predicate).length).toBeGreaterThan(0)
    },
  )

  it.each(Object.entries(fractionSums))('%s holds on SQLite as in memory', (_, predicate) => {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "f" ("id" TEXT PRIMARY KEY, "x" REAL, "n" INTEGER)`)
    const insert = db.prepare(`INSERT INTO "f" VALUES (?, ?, ?)`)
    for (const row of fractionRows) insert.run(row.id, row.x, row.n)
    const where = Result.getOrThrow(Sql.toWhere(predicate, { dialect: 'sqlite' }))
    const found = db
      .prepare(`SELECT "id" FROM "f" WHERE ${where.text} ORDER BY "id"`)
      .all(...(where.params as Array<SQLInputValue>))
    db.close()
    expect(found.map(row => row['id'])).toEqual(fractionHolds(predicate))
  })
})
