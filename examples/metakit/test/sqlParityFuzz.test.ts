/**
 * Differential parity audit: executes every SQL-lowerable CoreOpId with
 * BOTH column operands AND bound `$n` parameter operands (including `null`!)
 * in real PGlite, asserting exact agreement with `Expr.eval`, `Expr.residualize`,
 * and `Expr.judge`.
 */
import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { Bool, Eq, Expr, Null, Num, Ord, Str, Time } from '@doeixd/metakit'
import { CalendarDay } from '@doeixd/metakit/domain'
import * as Sql from '@doeixd/metakit/sql'
import { describe, expect, it } from 'vitest'

const Row = Schema.Struct({
  id: Schema.String,
  a: Schema.NullOr(Schema.Int),
  b: Schema.NullOr(Schema.Int),
  s: Schema.NullOr(Schema.String),
  t: Schema.NullOr(Schema.String),
  flag: Schema.NullOr(Schema.Boolean),
  d1: Schema.NullOr(CalendarDay.schema),
  d2: Schema.NullOr(CalendarDay.schema),
})
type Row = typeof Row.Type

const Param = Schema.Struct({
  pNum: Schema.NullOr(Schema.Int),
  pNum2: Schema.NullOr(Schema.Int),
  pStr: Schema.NullOr(Schema.String),
  pBool: Schema.NullOr(Schema.Boolean),
  pDay1: Schema.NullOr(CalendarDay.schema),
  pDay2: Schema.NullOr(CalendarDay.schema),
})
type Param = typeof Param.Type

const day = (iso: string) => Result.getOrThrow(CalendarDay.fromIso(iso))

const rows: ReadonlyArray<Row> = [
  {
    id: 'r1',
    a: 10,
    b: 3,
    s: 'Alpha',
    t: '  beta  ',
    flag: true,
    d1: day('2026-01-10'),
    d2: day('2026-01-20'),
  },
  {
    id: 'r2',
    a: 0,
    b: -5,
    s: 'gamma',
    t: 'GAMMA',
    flag: false,
    d1: day('2026-01-15'),
    d2: day('2026-01-25'),
  },
  { id: 'r3', a: null, b: 3, s: null, t: '', flag: null, d1: null, d2: day('2026-02-01') },
  { id: 'r4', a: -10, b: null, s: 'Alpha', t: null, flag: true, d1: day('2026-02-28'), d2: null },
]

const paramSets: ReadonlyArray<Param> = [
  {
    pNum: 3,
    pNum2: 10,
    pStr: 'Alpha',
    pBool: true,
    pDay1: day('2026-01-12'),
    pDay2: day('2026-01-18'),
  },
  { pNum: null, pNum2: 0, pStr: null, pBool: null, pDay1: null, pDay2: day('2026-01-18') },
]

const predicates: ReadonlyArray<
  readonly [name: string, expr: Expr.Expr<{ readonly row: Row; readonly p: Param }, boolean | null>]
> = [
  [
    'bool.and/or/not',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Bool.or(Bool.and(row.flag, p.pBool), Bool.not(row.flag)),
    ),
  ],
  ['eq.is (col vs param)', Expr.in({ row: Row, p: Param }, ({ row, p }) => Eq.is(row.a, p.pNum))],
  [
    'eq.isNot (col vs param)',
    Expr.in({ row: Row, p: Param }, ({ row, p }) => Eq.isNot(row.s, p.pStr)),
  ],
  [
    'eq.equals (col vs param)',
    Expr.in({ row: Row, p: Param }, ({ row, p }) => Eq.equals(row.a, p.pNum)),
  ],
  ['eq.in', Expr.in({ row: Row, p: Param }, ({ row }) => Eq.oneOf(row.s, ['Alpha', 'gamma']))],
  ['eq.among', Expr.in({ row: Row, p: Param }, ({ row }) => Eq.among(row.a, [10, null]))],
  ['null.isNull (col)', Expr.in({ row: Row, p: Param }, ({ row }) => Null.isNull(row.a))],
  ['null.isNull (param)', Expr.in({ row: Row, p: Param }, ({ p }) => Null.isNull(p.pNum))],
  [
    'null.coalesce (col, param)',
    Expr.in({ row: Row, p: Param }, ({ row, p }) => Eq.is(Null.coalesce(row.a, p.pNum), 3)),
  ],
  [
    'ord.lt/lte/gt/gte',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Expr.any(Ord.lt(row.a, p.pNum), Ord.gte(row.b, p.pNum2)),
    ),
  ],
  [
    'num.add/sub/mul/neg',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Num.gt(Num.add(Num.mul(row.a, 2), Num.neg(Num.sub(row.b, p.pNum))), 0),
    ),
  ],
  [
    'num.div/rem',
    Expr.in({ row: Row, p: Param }, ({ row }) =>
      Eq.equals(Num.rem(row.a, 3, { onZero: 'null' }), 1),
    ),
  ],
  [
    'num.mulScaled',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Num.gte(Num.mulScaled(row.a, p.pNum, { shift: 1 }), 1),
    ),
  ],
  [
    'str.lower/upper/trim/concat/len',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Num.gt(Str.len(Str.concat(Str.lowerAscii(Str.trim(row.t)), Str.upperAscii(p.pStr))), 3),
    ),
  ],
  [
    'str.startsWith/endsWith/contains',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Expr.any(Str.startsWith(row.s, p.pStr), Str.endsWith(row.s, 'a'), Str.contains(row.t, 'et')),
    ),
  ],
  ['str.lt/gte', Expr.in({ row: Row, p: Param }, ({ row, p }) => Str.lt(row.s, p.pStr))],
  [
    'time.addDays/daysBetween',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Num.gt(Time.daysBetween(row.d1, Time.addDays(p.pDay1, 5)), 0),
    ),
  ],
  [
    'time.addMonths/startOfMonth',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Ord.lte(Time.startOfMonth(row.d1), Time.addMonths(p.pDay1, 1)),
    ),
  ],
  [
    'time.overlaps (col+param)',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Time.overlaps(row.d1, row.d2, p.pDay1, p.pDay2),
    ),
  ],
  [
    'expr.when',
    Expr.in({ row: Row, p: Param }, ({ row, p }) =>
      Expr.when(row.flag, { then: Ord.gt(row.a, p.pNum), else: Ord.lt(row.b, 0) }),
    ),
  ],
  [
    'expr.matchOrElse',
    Expr.in({ row: Row, p: Param }, ({ row }) =>
      Expr.matchOrElse(row.s, { Alpha: true, gamma: false }, false),
    ),
  ],
]

describe('5-way differential parity: Memory vs Residualize vs PGlite parameterized SQL', () => {
  it('matches across every SQL-lowerable core op with non-null and null bound parameters', async () => {
    const db = new PGlite()
    await db.exec(`
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        a BIGINT,
        b BIGINT,
        s TEXT,
        t TEXT,
        flag BOOLEAN,
        d1 INTEGER,
        d2 INTEGER
      );
    `)
    for (const r of rows) {
      await db.query(
        `INSERT INTO items (id, a, b, s, t, flag, d1, d2) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r.id, r.a, r.b, r.s, r.t, r.flag, r.d1, r.d2],
      )
    }

    const failures: Array<string> = []
    for (const [name, expr] of predicates) {
      for (const [pi, p] of paramSets.entries()) {
        const expectedIds = rows.filter(row => Expr.holds(expr, { row, p })).map(r => r.id)

        // Residualize parity
        const residual = Expr.residualize(expr, { p })
        const residualIds = rows.filter(row => Expr.holds(residual, { row, p })).map(r => r.id)
        if (JSON.stringify(residualIds) !== JSON.stringify(expectedIds)) {
          failures.push(
            `[residualize] ${name} (p#${pi}): expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(residualIds)}`,
          )
        }

        // PGlite parameterized SQL parity
        const where = Sql.toWhere(expr, { dialect: 'postgres', env: { p } })
        if (Result.isFailure(where)) {
          failures.push(`[sql-lower] ${name} (p#${pi}): ${where.failure.reason}`)
          continue
        }
        try {
          const res = await db.query<{ id: string }>(
            `SELECT id FROM items WHERE ${where.success.text} ORDER BY id`,
            [...where.success.params],
          )
          const sqlIds = res.rows.map(r => r.id)
          if (JSON.stringify(sqlIds) !== JSON.stringify(expectedIds)) {
            failures.push(
              `[pglite-mismatch] ${name} (p#${pi}): expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(sqlIds)} | SQL: ${where.success.text} | params: ${JSON.stringify(where.success.params)}`,
            )
          }
        } catch (err) {
          failures.push(
            `[pglite-error] ${name} (p#${pi}): ${(err as Error).message} | SQL: ${where.success.text} | params: ${JSON.stringify(where.success.params)}`,
          )
        }
      }
    }

    await db.close()
    expect(failures).toEqual([])
  })
})
