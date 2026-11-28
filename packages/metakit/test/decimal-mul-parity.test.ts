/**
 * `num.mulScaled` on a database: for every row, the value SQL stores equals
 * what `Expr.evalResult` gives (a refusal is NULL), on Postgres (PGlite) and
 * SQLite (`node:sqlite`), as text and through Drizzle. The rows hold exact
 * halves of either sign at each shift, the safe-range boundary and its two
 * neighbours, products past int64 (which Postgres would raise on as `bigint`
 * and SQLite would carry on in floating point), operands past the safe range,
 * nulls, and a seeded spread.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import { bigint, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Expr, Null, Num, Path, Transition } from '@doeixd/metakit'
import * as Drizzle from '@doeixd/metakit/drizzle'
import * as Sql from '@doeixd/metakit/sql'

const MAX = Number.MAX_SAFE_INTEGER
const INT64_MAX = 9_223_372_036_854_775_807n

const State = Schema.Struct({
  id: Schema.String,
  a: Schema.NullOr(Schema.Int),
  b: Schema.NullOr(Schema.Int),
  r: Schema.NullOr(Schema.Int),
})

/** A row as the database holds it: operands that may be past the safe range, exactly. */
interface Held {
  readonly id: string
  readonly a: bigint | null
  readonly b: bigint | null
}

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const shifts = [0, 1, 2, 4, 8, 12, 16, 17, -1, -3, 24] as const

const rows: ReadonlyArray<Held> = (() => {
  const made: Array<readonly [bigint | null, bigint | null]> = [
    [null, null],
    [null, 5n],
    [5n, null],
    // Exact halves, either sign, at every positive shift: odd * 5 * 10^(s-1) / 10^s.
    ...[1, 2, 4, 8, 12].flatMap(places =>
      [1n, 3n, 5n, 7n, -1n, -3n, -5n, -7n].map(
        odd => [odd, 5n * 10n ** BigInt(places - 1)] as const,
      ),
    ),
    // A tie with the factors the other way round, and a tie at zero.
    [50n, 5n],
    [-50n, 7n],
    // Where the divisor is the last power of ten SQLite can write: a half, past it, and the range's end.
    [1n, 5n * 10n ** 15n],
    [-1n, 5n * 10n ** 15n],
    [1n, 5n * 10n ** 15n + 1n],
    [-1n, 5n * 10n ** 15n + 1n],
    // The boundary of the safe range, and one step past it in each direction.
    [BigInt(MAX), 1n],
    [BigInt(MAX), -1n],
    [BigInt(MAX), 2n],
    [-BigInt(MAX), 2n],
    [BigInt(MAX), 100n],
    [BigInt(MAX), 10n],
    [900_719_925_474_099n, 10n],
    [900_719_925_474_099n, 1n],
    [94_906_265n, 94_906_266n],
    [94_906_265n, 94_906_267n],
    [94_906_266n, -94_906_266n],
    [94_906_267n, -94_906_267n],
    // Past int64: Postgres `bigint` would raise, SQLite would continue in floating point.
    [3_037_000_500n, 3_037_000_500n],
    [-3_037_000_500n, 3_037_000_500n],
    [4_294_967_296n, 2_147_483_648n],
    [-4_294_967_296n, 2_147_483_648n],
    [1_000_000_000_000n, 1_000_000_000_000n],
    // Operands that are not safe integers at all.
    [INT64_MAX, 1n],
    [INT64_MAX, INT64_MAX],
    [-INT64_MAX, 3n],
    [BigInt(MAX) + 1n, 1n],
    [BigInt(MAX) + 2n, 0n],
  ]
  const random = seeded(2026)
  const magnitudes = [10, 1_000, 100_000, 10 ** 8, 10 ** 10, MAX]
  const operand = (): bigint => {
    const sign = random() < 0.5 ? -1n : 1n
    const top = magnitudes[Math.floor(random() * magnitudes.length)]!
    return sign * BigInt(Math.floor(random() * top))
  }
  for (let i = 0; i < 160; i++) made.push([operand(), operand()])
  return made.map(([a, b], index) => ({ id: `r${String(index).padStart(3, '0')}`, a, b }))
})()

const numberOf = (value: bigint | null): number | null => (value === null ? null : Number(value))

/** What evaluation gives for each row at `shift`: a value, or null for a null operand and for a refusal. */
const expected = (shift: number): ReadonlyMap<string, number | null> => {
  const product = Num.mulScaled(Path.forSchema(State).a, Path.forSchema(State).b, { shift })
  return new Map(
    rows.map(row => {
      const result = Expr.evalResult(product, {
        id: row.id,
        a: numberOf(row.a),
        b: numberOf(row.b),
        r: null,
      })
      return [row.id, Result.isSuccess(result) ? result.success : null] as const
    }),
  )
}

const update = (shift: number) =>
  Transition.make({
    state: State,
    input: Schema.Struct({}),
    apply: ({ state }) => [Transition.set(state.r, Num.mulScaled(state.a, state.b, { shift }))],
  })

const UNTOUCHED = 4_611_686_018_427_387_904n

describe('what the fixtures are', () => {
  it.each(shifts)('hold refused rows, exact halves and values at shift %i', shift => {
    const answers = [...expected(shift).values()]
    expect(answers.filter(value => value === null).length).toBeGreaterThan(8)
    expect(answers.filter(value => value !== null).length).toBeGreaterThan(30)
    if (shift > 0 && shift <= 12) {
      const half = 5n * 10n ** BigInt(shift - 1)
      const halves = rows.filter(
        row =>
          row.a !== null &&
          row.b !== null &&
          ((row.a * row.b) % 10n ** BigInt(shift) === half ||
            (row.a * row.b) % 10n ** BigInt(shift) === -half),
      )
      expect(halves.filter(row => row.a! * row.b! > 0n).length).toBeGreaterThan(3)
      expect(halves.filter(row => row.a! * row.b! < 0n).length).toBeGreaterThan(3)
    }
  })
})

/**
 * The one place SQL and memory part, which the docs name: a refusal is NULL in
 * SQL, so a test of nullness holds of a refused product there and is itself
 * refused in memory. Every consumer that is null-strict (an order, arithmetic,
 * `Eq.equals`) agrees, as the rows above show.
 */
const nullness = Expr.in(
  { row: Schema.Struct({ a: Schema.NullOr(Schema.Int), b: Schema.NullOr(Schema.Int) }) },
  ({ row }) => Null.isNull(Num.mulScaled(row.a, row.b, { shift: 2 })),
)
const inMemory = rows
  .filter(row => Expr.holds(nullness, { row: { a: numberOf(row.a), b: numberOf(row.b) } }))
  .map(row => row.id)
const refusedAtTwo = rows
  .filter(row => row.a !== null && row.b !== null && expected(2).get(row.id) === null)
  .map(row => row.id)
const heldWhereRefused = [...inMemory, ...refusedAtTwo].sort()

const pgRows = pgTable('rows', {
  id: pgText('id').primaryKey(),
  a: bigint('a', { mode: 'bigint' }),
  b: bigint('b', { mode: 'bigint' }),
  r: bigint('r', { mode: 'bigint' }),
})

const sqliteRows = sqliteTable('rows', {
  id: sqliteText('id').primaryKey(),
  a: integer('a', { mode: 'number' }),
  b: integer('b', { mode: 'number' }),
  r: integer('r', { mode: 'number' }),
})

const read = (found: ReadonlyArray<{ readonly id: unknown; readonly r: unknown }>) =>
  new Map(found.map(row => [String(row.id), row.r === null ? null : Number(row.r)] as const))

describe('Postgres stores what Expr.evalResult gives', () => {
  let pg: PGlite
  beforeAll(async () => {
    pg = new PGlite()
    await pg.exec(`CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "a" BIGINT, "b" BIGINT, "r" BIGINT)`)
    for (const row of rows) {
      await pg.query(`INSERT INTO "rows" VALUES ($1, $2, $3, NULL)`, [
        row.id,
        row.a === null ? null : String(row.a),
        row.b === null ? null : String(row.b),
      ])
    }
  }, 60_000)
  afterAll(() => pg.close())

  it.each(shifts)('as text, at shift %i', async shift => {
    await pg.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const fragment = Result.getOrThrow(Sql.toUpdate('rows', update(shift), {}))
    await pg.query(fragment.text, [...fragment.params])
    const found = await pg.query<{ id: string; r: unknown }>(`SELECT "id", "r" FROM "rows"`)
    expect(read(found.rows)).toEqual(expected(shift))
  })

  it('holds a nullness test of a refused product, which memory refuses', async () => {
    expect(refusedAtTwo.length).toBeGreaterThan(8)
    const where = Result.getOrThrow(Sql.toWhere(nullness))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(found.rows.map(row => row.id)).toEqual(heldWhereRefused)
  })

  it.each(shifts)('through Drizzle, at shift %i', async shift => {
    await pg.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const built = Result.getOrThrow(Drizzle.toUpdate(update(shift), {}, pgRows))
    const db = drizzlePg({ client: pg })
    await db.update(pgRows).set(built.set).where(built.where)
    const found = await db.select({ id: pgRows.id, r: pgRows.r }).from(pgRows)
    expect(read(found)).toEqual(expected(shift))
  })
})

describe('SQLite stores what Expr.evalResult gives', () => {
  let db: DatabaseSync
  beforeAll(() => {
    db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "a" INTEGER, "b" INTEGER, "r" INTEGER)`)
    const insert = db.prepare(`INSERT INTO "rows" VALUES (?, ?, ?, NULL)`)
    for (const row of rows) insert.run(row.id, row.a, row.b)
  })
  afterAll(() => db.close())

  it.each(shifts)('as text, at shift %i', shift => {
    db.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const fragment = Result.getOrThrow(
      Sql.toUpdate('rows', update(shift), {}, { dialect: 'sqlite' }),
    )
    db.prepare(fragment.text).run(...(fragment.params as Array<SQLInputValue>))
    const select = db.prepare(`SELECT "id", "r" FROM "rows"`)
    // An untouched or a wrong value past the safe range reads as itself, not as an error.
    select.setReadBigInts(true)
    const found = select.all()
    expect(read(found.map(row => ({ id: row['id'], r: row['r'] })))).toEqual(expected(shift))
  })

  it('holds a nullness test of a refused product, which memory refuses', () => {
    const where = Result.getOrThrow(Sql.toWhere(nullness, { dialect: 'sqlite' }))
    const found = db
      .prepare(`SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`)
      .all(...(where.params as Array<SQLInputValue>))
    expect(found.map(row => row['id'])).toEqual(heldWhereRefused)
  })

  it.each(shifts)('through Drizzle, at shift %i', async shift => {
    db.exec(`UPDATE "rows" SET "r" = ${UNTOUCHED}`)
    const built = Result.getOrThrow(
      Drizzle.toUpdate(update(shift), {}, sqliteRows, { dialect: 'sqlite' }),
    )
    const orm = drizzleSqlite({ client: db })
    await orm.update(sqliteRows).set(built.set).where(built.where)
    const found = await orm.select({ id: sqliteRows.id, r: sqliteRows.r }).from(sqliteRows)
    expect(read(found)).toEqual(expected(shift))
  })
})
