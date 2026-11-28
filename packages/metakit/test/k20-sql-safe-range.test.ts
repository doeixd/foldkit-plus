/**
 * K20 (#674): `num.add`, `num.sub` and `num.mul` over `Schema.Finite` (and `Schema.Int`)
 * fields on PGlite and `node:sqlite` agree with `Expr.evalResult` / `Expr.holds`:
 * a result past ±(2^53−1) is refused in evaluation and `NULL` in SQL, while in-range
 * integer and fractional results keep their exact values.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Bool, Eq, Expr, Num, Ord, Path, Transition } from '@doeixd/metakit'
import * as Sql from '@doeixd/metakit/sql'

const MAX = Number.MAX_SAFE_INTEGER

const Row = Schema.Struct({
  id: Schema.String,
  f: Schema.NullOr(Schema.Finite),
  n: Schema.NullOr(Schema.Int),
  outF: Schema.NullOr(Schema.Finite),
})
type Row = typeof Row.Type

interface Seed {
  readonly id: string
  readonly f: number | null
  readonly n: number | null
}

const rows: ReadonlyArray<Seed> = [
  { id: 'max', f: MAX, n: 1 },
  { id: 'negmax', f: -MAX, n: 1 },
  { id: 'half_max', f: 4_503_599_627_370_495.5, n: 2 },
  { id: 'big_int', f: 100_000_000, n: 100_000_000 },
  { id: 'neg_big_int', f: -100_000_000, n: -100_000_000 },
  { id: 'small', f: 3, n: 5 },
  { id: 'neg_small', f: -3, n: -5 },
  { id: 'null', f: null, n: null },
]

const asRow = (seed: Seed): Row => ({ ...seed, outF: null })

const at = Path.forSchema(Row)

interface Columns<E> {
  readonly f: Expr.Expr<E, number | null>
  readonly n: Expr.Expr<E, number | null>
}

const expressions: ReadonlyArray<
  readonly [name: string, build: <E>(cols: Columns<E>) => Expr.Expr<E, number | null>]
> = [
  ['f * 1.5', ({ f }) => Num.mul(f, 1.5)],
  ['f * 0.5', ({ f }) => Num.mul(f, 0.5)],
  ['f + 0.5', ({ f }) => Num.add(f, 0.5)],
  ['f + 0.4', ({ f }) => Num.add(f, 0.4)],
  ['f + 4503599627370497', ({ f }) => Num.add(f, 4_503_599_627_370_497)],
  ['f - 0.5', ({ f }) => Num.sub(f, 0.5)],
  ['f - 0.4', ({ f }) => Num.sub(f, 0.4)],
  ['f + n', ({ f, n }) => Num.add(f, n)],
  ['f - n', ({ f, n }) => Num.sub(f, n)],
  ['f * n', ({ f, n }) => Num.mul(f, n)],
  ['n * n', ({ n }) => Num.mul(n, n)],
  ['n + 1', ({ n }) => Num.add(n, 1)],
]

const predicates: ReadonlyArray<
  readonly [name: string, expr: Expr.Expr<{ readonly row: Row }, boolean | null>]
> = [
  ['f * 1.5 > 0', Expr.in({ row: Row }, ({ row }) => Ord.gt(Num.mul(row.f, 1.5), 0))],
  ['f * 1.5 < 0', Expr.in({ row: Row }, ({ row }) => Ord.lt(Num.mul(row.f, 1.5), 0))],
  [
    'not (f * 1.5 > 0)',
    Expr.in({ row: Row }, ({ row }) => Bool.not(Ord.gt(Num.mul(row.f, 1.5), 0))),
  ],
  ['f * 0.5 = 1.5', Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.mul(row.f, 0.5), 1.5))],
  ['f + 0.5 > 0', Expr.in({ row: Row }, ({ row }) => Ord.gt(Num.add(row.f, 0.5), 0))],
  ['f + 0.4 = MAX', Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.add(row.f, 0.4), MAX))],
  [
    'f + 4503599627370497 > 0',
    Expr.in({ row: Row }, ({ row }) => Ord.gt(Num.add(row.f, 4_503_599_627_370_497), 0)),
  ],
  ['f - 0.5 < 0', Expr.in({ row: Row }, ({ row }) => Ord.lt(Num.sub(row.f, 0.5), 0))],
  ['f - 0.4 = -MAX', Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.sub(row.f, 0.4), -MAX))],
  ['n * n > 0', Expr.in({ row: Row }, ({ row }) => Ord.gt(Num.mul(row.n, row.n), 0))],
  ['n + 1 = 6', Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.add(row.n, 1), 6))],
]

const expectedValues = (
  build: <E>(cols: Columns<E>) => Expr.Expr<E, number | null>,
): ReadonlyMap<string, number | null> =>
  new Map(
    rows.map(seed => {
      const result = Expr.evalResult(build(at), asRow(seed))
      return [seed.id, Result.isSuccess(result) ? result.success : null] as const
    }),
  )

const expectedHolding = (
  predicate: Expr.Expr<{ readonly row: Row }, boolean | null>,
): ReadonlyArray<string> =>
  rows
    .filter(seed => Expr.holds(predicate, { row: asRow(seed) }))
    .map(seed => seed.id)
    .sort()

const toSqliteParams = (params: ReadonlyArray<unknown>): ReadonlyArray<SQLInputValue> =>
  params.map(value => {
    if (value === null || typeof value === 'number' || typeof value === 'string') return value
    throw new Error(`unexpected SQLite param: ${String(value)}`)
  })

const readStored = (
  found: ReadonlyArray<{ readonly id: unknown; readonly outF: unknown }>,
): ReadonlyMap<string, number | null> =>
  new Map(found.map(row => [String(row.id), row.outF === null ? null : Number(row.outF)] as const))

const writeTransition = (build: <E>(cols: Columns<E>) => Expr.Expr<E, number | null>) =>
  Transition.make({
    state: Row,
    input: Schema.Struct({}),
    apply: ({ state }) => [Transition.set(state.outF, build(state))],
  })

describe('evaluation baseline for K20 rows', () => {
  it('refuses unsafe integer results from Finite and Int arithmetic and keeps in-range values', () => {
    const evalRow = (id: string, build: <E>(cols: Columns<E>) => Expr.Expr<E, number | null>) => {
      const seed = rows.find(r => r.id === id)
      if (seed === undefined) throw new Error(`missing row ${id}`)
      return Expr.evalResult(build(at), asRow(seed))
    }

    expect(evalRow('max', ({ f }) => Num.mul(f, 1.5))).toMatchObject({
      failure: { reason: 'unsafe-integer', at: 'num.mul' },
    })
    expect(evalRow('negmax', ({ f }) => Num.mul(f, 1.5))).toMatchObject({
      failure: { reason: 'unsafe-integer', at: 'num.mul' },
    })
    expect(evalRow('max', ({ f }) => Num.add(f, 0.5))).toMatchObject({
      failure: { reason: 'unsafe-integer', at: 'num.add' },
    })
    expect(evalRow('half_max', ({ f }) => Num.add(f, 4_503_599_627_370_497))).toMatchObject({
      failure: { reason: 'unsafe-integer', at: 'num.add' },
    })
    expect(evalRow('negmax', ({ f }) => Num.sub(f, 0.5))).toMatchObject({
      failure: { reason: 'unsafe-integer', at: 'num.sub' },
    })
    expect(evalRow('big_int', ({ n }) => Num.mul(n, n))).toMatchObject({
      failure: { reason: 'unsafe-integer', at: 'num.mul' },
    })

    // In-range fractional, integer, and boundary results stay intact.
    expect(evalRow('small', ({ f }) => Num.mul(f, 0.5))).toEqual(Result.succeed(1.5))
    expect(evalRow('max', ({ f }) => Num.mul(f, 0.5))).toEqual(
      Result.succeed(4_503_599_627_370_495.5),
    )
    expect(evalRow('max', ({ f }) => Num.add(f, 0.4))).toEqual(Result.succeed(MAX))
    expect(evalRow('negmax', ({ f }) => Num.sub(f, 0.4))).toEqual(Result.succeed(-MAX))
    expect(evalRow('small', ({ n }) => Num.add(n, 1))).toEqual(Result.succeed(6))
  })
})

describe('Postgres (PGlite) safe-range parity for Finite and Int arithmetic', () => {
  let pg: PGlite

  beforeAll(async () => {
    pg = await PGlite.create()
    await pg.exec(
      `CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "f" DOUBLE PRECISION, "n" BIGINT, "outF" DOUBLE PRECISION)`,
    )
    for (const seed of rows) {
      await pg.query(`INSERT INTO "rows" VALUES ($1, $2, $3, NULL)`, [seed.id, seed.f, seed.n])
    }
  }, 60_000)

  afterAll(() => pg.close())

  it.each(predicates)('WHERE %s matches Expr.holds', async (_, predicate) => {
    const where = Result.getOrThrow(Sql.toWhere(predicate))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(found.rows.map(row => row.id)).toEqual(expectedHolding(predicate))
  })

  it.each(expressions)('UPDATE storing %s matches Expr.evalResult', async (_, build) => {
    await pg.exec(`UPDATE "rows" SET "outF" = -12345`)
    const update = Result.getOrThrow(Sql.toUpdate('rows', writeTransition(build), {}))
    await pg.query(update.text, [...update.params])
    const found = await pg.query<{ id: string; outF: unknown }>(`SELECT "id", "outF" FROM "rows"`)
    expect(readStored(found.rows)).toEqual(expectedValues(build))
  })

  it('CHECK over Finite product refuses unsafe integer result as Schema.is does', async () => {
    const Checked = Schema.Struct({ f: Schema.Finite }).pipe(
      Expr.refine($ => Ord.gt(Num.mul($.f, 1.5), 0)),
    )
    const check = Result.getOrThrow(Sql.toCheck(Checked))
    await pg.exec(`CREATE TABLE "checked" ("f" DOUBLE PRECISION, ${check})`)
    for (const value of [3, -3, MAX, -MAX]) {
      const stored = await pg.query(`INSERT INTO "checked" VALUES ($1)`, [value]).then(
        () => true,
        () => false,
      )
      expect([value, stored]).toEqual([value, Schema.is(Checked)({ f: value })])
    }
  })
})

describe('SQLite (node:sqlite) safe-range parity for Finite and Int arithmetic', () => {
  let db: DatabaseSync

  beforeAll(() => {
    db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "f" REAL, "n" INTEGER, "outF" REAL)`)
    const insert = db.prepare(`INSERT INTO "rows" VALUES (?, ?, ?, NULL)`)
    for (const seed of rows) insert.run(seed.id, seed.f, seed.n)
  })

  afterAll(() => db.close())

  it.each(predicates)('WHERE %s matches Expr.holds', (_, predicate) => {
    const where = Result.getOrThrow(Sql.toWhere(predicate, { dialect: 'sqlite' }))
    const found = db
      .prepare(`SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`)
      .all(...toSqliteParams(where.params))
    expect(found.map(row => String(row['id']))).toEqual(expectedHolding(predicate))
  })

  it.each(expressions)('UPDATE storing %s matches Expr.evalResult', (_, build) => {
    db.exec(`UPDATE "rows" SET "outF" = -12345`)
    const update = Result.getOrThrow(
      Sql.toUpdate('rows', writeTransition(build), {}, { dialect: 'sqlite' }),
    )
    db.prepare(update.text).run(...toSqliteParams(update.params))
    const found = db.prepare(`SELECT "id", "outF" FROM "rows"`).all()
    expect(readStored(found.map(row => ({ id: row['id'], outF: row['outF'] })))).toEqual(
      expectedValues(build),
    )
  })

  it('CHECK over Finite product refuses unsafe integer result as Schema.is does', () => {
    const Checked = Schema.Struct({ f: Schema.Finite }).pipe(
      Expr.refine($ => Ord.gt(Num.mul($.f, 1.5), 0)),
    )
    const check = Result.getOrThrow(Sql.toCheck(Checked, { dialect: 'sqlite' }))
    db.exec(`CREATE TABLE "checked" ("f" REAL, ${check})`)
    const insert = db.prepare(`INSERT INTO "checked" VALUES (?)`)
    for (const value of [3, -3, MAX, -MAX]) {
      let stored = true
      try {
        insert.run(value)
      } catch {
        stored = false
      }
      expect([value, stored]).toEqual([value, Schema.is(Checked)({ f: value })])
    }
  })
})
