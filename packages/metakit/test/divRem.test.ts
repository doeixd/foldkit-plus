import { PGlite } from '@electric-sql/pglite'
import { DatabaseSync } from 'node:sqlite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Num, Ord, Path, Verdict } from '../src/index.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'
import {
  BankAccount,
  bankCorrectionNonNegative,
  bankMonthlyFee,
  Booking,
  bookingCycleDay,
  bookingCycleInRange,
  Order,
  orderCappedDiscount,
  orderQuarterSplit,
  orderSplitWithinTotal,
  orderUnitCents,
  orderWholeDollars,
} from './fixtures/domains601.js'

const Row = Schema.Struct({
  n: Schema.Int,
  d: Schema.Int,
})
const $ = Path.forSchema(Row)

const modes: ReadonlyArray<Num.RoundingMode> = [
  'floor',
  'ceiling',
  'toward-zero',
  'half-even',
  'half-away-from-zero',
]

describe('Num.div, Num.rem, Num.round, Num.toDecimal, Num.toInt', () => {
  it('computes all 5 rounding modes accurately on exact halves, negatives, and negative divisors', () => {
    const cases: ReadonlyArray<
      readonly [n: number, d: number, expected: Record<Num.RoundingMode, number>]
    > = [
      [5, 2, { floor: 2, ceiling: 3, 'toward-zero': 2, 'half-even': 2, 'half-away-from-zero': 3 }],
      [7, 2, { floor: 3, ceiling: 4, 'toward-zero': 3, 'half-even': 4, 'half-away-from-zero': 4 }],
      [
        -5,
        2,
        { floor: -3, ceiling: -2, 'toward-zero': -2, 'half-even': -2, 'half-away-from-zero': -3 },
      ],
      [
        -7,
        2,
        { floor: -4, ceiling: -3, 'toward-zero': -3, 'half-even': -4, 'half-away-from-zero': -4 },
      ],
      [
        -50,
        100,
        { floor: -1, ceiling: 0, 'toward-zero': 0, 'half-even': 0, 'half-away-from-zero': -1 },
      ],
      [
        5,
        -2,
        { floor: -3, ceiling: -2, 'toward-zero': -2, 'half-even': -2, 'half-away-from-zero': -3 },
      ],
    ]
    for (const [n, d, expected] of cases) {
      for (const rounding of modes) {
        const expr = Num.div($.n, $.d, { rounding, onZero: 'null' })
        expect(Expr.eval(expr, { n, d })).toBe(expected[rounding])
      }
    }
  })

  it('handles division/remainder by zero according to onZero and refuses literal 0 on refuse', () => {
    expect(() => Num.div($.n, 0, { rounding: 'floor' })).toThrow(/literal divisor is 0/)
    expect(() => Num.rem($.n, 0)).toThrow(/literal divisor is 0/)

    expect(
      Expr.eval(Num.div($.n, $.d, { rounding: 'floor', onZero: 'null' }), { n: 5, d: 0 }),
    ).toBe(null)
    expect(Expr.eval(Num.rem($.n, $.d, { onZero: 'null' }), { n: 5, d: 0 })).toBe(null)
    expect(() =>
      Expr.eval(Num.div($.n, $.d, { rounding: 'floor', onZero: 'refuse' }), { n: 5, d: 0 }),
    ).toThrow(/division by zero/)
    expect(() => Expr.eval(Num.rem($.n, $.d), { n: 5, d: 0 })).toThrow(/remainder by zero/)

    // Truncated remainder keeps the dividend's sign.
    expect(Expr.eval(Num.rem($.n, 2), { n: -7, d: 2 })).toBe(-1)
    expect(Expr.eval(Num.rem($.n, 2), { n: 7, d: 2 })).toBe(1)
  })

  it('agrees across memory, SQLite and PGlite for all 5 rounding modes and rem', async () => {
    const sqlite = new DatabaseSync(':memory:')
    const pg = new PGlite()
    try {
      sqlite.exec('CREATE TABLE t (n INTEGER, d INTEGER)')
      await pg.exec('CREATE TABLE t (n INTEGER, d INTEGER)')

      const pairs: ReadonlyArray<readonly [number, number]> = [
        [0, 2],
        [5, 2],
        [7, 2],
        [-5, 2],
        [-7, 2],
        [-50, 100],
        [50, 100],
        [150, 100],
        [5, -2],
        [-7, -3],
        [-1, 2_000_000_000],
        [-2_000_000_000, 1_500_000_000],
        [10, 0],
      ]
      for (const [n, d] of pairs) {
        sqlite.prepare('INSERT INTO t VALUES (?, ?)').run(n, d)
        await pg.query('INSERT INTO t VALUES ($1, $2)', [n, d])
      }

      const RowEnv = Schema.Struct({ row: Row })
      const r = Path.forSchema(RowEnv)

      for (const rounding of modes) {
        const expr = Num.div(r.row.n, r.row.d, { rounding, onZero: 'null' })
        for (const [n, d] of pairs) {
          const expected = Expr.eval(expr, { row: { n, d } })
          const eqExpr =
            expected === null
              ? Ord.gte(expr, 0) // null comparison is false
              : Eq.is(expr, expected)
          const sqCheck = Sql.toWhere(eqExpr, { dialect: 'sqlite' })
          const pqCheck = Sql.toWhere(eqExpr, { dialect: 'postgres' })
          expect(Result.isSuccess(sqCheck) && Result.isSuccess(pqCheck)).toBe(true)
          if (Result.isSuccess(sqCheck) && Result.isSuccess(pqCheck)) {
            const sRows = sqlite
              .prepare(
                `SELECT COUNT(*) AS c FROM t WHERE n = ? AND d = ? AND (${sqCheck.success.text})`,
              )
              .get(n, d, ...(sqCheck.success.params as Array<number>)) as { readonly c: number }
            const pRows = await pg.query<{ readonly c: string }>(
              `SELECT COUNT(*)::text AS c FROM t WHERE n = ${n} AND d = ${d} AND (${pqCheck.success.text})`,
              [...pqCheck.success.params],
            )
            expect(sRows.c).toBe(expected === null ? 0 : 1)
            expect(Number(pRows.rows[0]!.c)).toBe(expected === null ? 0 : 1)
          }
        }
      }

      // Remainder parity
      const remExpr = Num.rem(r.row.n, r.row.d, { onZero: 'null' })
      for (const [n, d] of pairs) {
        const expected = Expr.eval(remExpr, { row: { n, d } })
        if (expected === null) continue
        const sqRem = Sql.toWhere(Eq.is(remExpr, expected), { dialect: 'sqlite' })
        const pqRem = Sql.toWhere(Eq.is(remExpr, expected), { dialect: 'postgres' })
        expect(Result.isSuccess(sqRem) && Result.isSuccess(pqRem)).toBe(true)
        if (Result.isSuccess(sqRem) && Result.isSuccess(pqRem)) {
          const sRow = sqlite
            .prepare(
              `SELECT COUNT(*) AS c FROM t WHERE n = ? AND d = ? AND (${sqRem.success.text})`,
            )
            .get(n, d, ...(sqRem.success.params as Array<number>)) as { readonly c: number }
          const pRow = await pg.query<{ readonly c: string }>(
            `SELECT COUNT(*)::text AS c FROM t WHERE n = ${n} AND d = ${d} AND (${pqRem.success.text})`,
            [...pqRem.success.params],
          )
          expect(sRow.c).toBe(1)
          expect(Number(pRow.rows[0]!.c)).toBe(1)
        }
      }
    } finally {
      sqlite.close()
      await pg.close()
    }
  }, 30_000)

  it('proves #601 domain rules in Abstract and Z3', async () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(BankAccount, bankCorrectionNonNegative))).toBe(
      true,
    )
    expect(Verdict.isTrue(Abstract.checkInvariant(Booking, bookingCycleInRange))).toBe(true)
    expect(
      Verdict.isTrue(Abstract.checkInvariant(Order, Ord.lte(orderQuarterSplit, 250_000))),
    ).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Order, Ord.gte(orderUnitCents, 0)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Order, Ord.lte(orderWholeDollars, 10_000)))).toBe(
      true,
    )
    expect(
      Verdict.isTrue(Abstract.checkInvariant(BankAccount, Ord.lte(bankMonthlyFee, 1_000_000))),
    ).toBe(true)
    expect(
      Verdict.isTrue(Abstract.checkInvariant(Order, Ord.lte(orderCappedDiscount, 1_000_000))),
    ).toBe(true)

    // Relational proofs in Z3: quarter split <= totalCents, capped discount <= maxDiscount, cycle day >= 0.
    const z3Split = await Effect.runPromise(Prove.invariant(Order, orderSplitWithinTotal))
    expect(Verdict.isTrue(z3Split)).toBe(true)

    const z3Cap = await Effect.runPromise(
      Prove.invariant(Order, Ord.lte(orderCappedDiscount, Path.forSchema(Order).maxDiscount)),
    )
    expect(Verdict.isTrue(z3Cap)).toBe(true)

    // Z3 proves bookingCycleDay >= 0 for non-negative dayNumber.
    const z3Cycle = await Effect.runPromise(Prove.invariant(Booking, Ord.gte(bookingCycleDay, 0)))
    expect(Verdict.isTrue(z3Cycle)).toBe(true)
  }, 30_000)
})
