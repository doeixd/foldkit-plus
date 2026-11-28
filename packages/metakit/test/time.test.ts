import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Abstract from '../src/abstract/check.js'
import * as Conformance from '../src/conformance.js'
import * as CalendarDay from '../src/domain/calendarDay.js'
import { Expr, Ord, Path, Time, Verdict } from '../src/index.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'
import {
  BankAccount,
  bankFeeMonth,
  bankNextFeeOn,
  Booking,
  bookingDaysLeft,
  bookingNoAdjacentOverlap,
  bookingTrialEnd,
  bookingTrialEndsAfterStart,
  bookingTrialOverlaps,
} from './fixtures/domains601.js'

const day = (iso: string): number => CalendarDay.parseIsoUnsafe(iso)
const iso = (d: number): string => {
  const res = CalendarDay.toIso(d as CalendarDay.CalendarDayValue)
  if (Result.isFailure(res)) throw new Error(res.failure.reason)
  return res.success
}

const Row = Schema.Struct({
  d: Schema.NullOr(Schema.Int),
  n: Schema.NullOr(Schema.Int),
  s1: Schema.NullOr(Schema.Int),
  e1: Schema.NullOr(Schema.Int),
  s2: Schema.NullOr(Schema.Int),
  e2: Schema.NullOr(Schema.Int),
})
const $ = Path.forSchema(Schema.Struct({ row: Row }))

const evalSqlTerm = (
  dialect: 'sqlite' | 'postgres',
  expr: Expr.Expr<{ readonly row: Schema.Schema.Type<typeof Row> }, number | boolean | null>,
): { readonly sql: string; readonly params: ReadonlyArray<unknown> } => {
  const lowered = Sql.lowerNode(expr.node, { dialect, rowPrefix: ['row'] })
  if (Result.isFailure(lowered)) throw new Error(lowered.failure.reason)
  const params: Array<unknown> = []
  const text = lowered.success
    .map(piece =>
      Sql.SqlPiece.$match(piece, {
        Text: ({ text: t }) => t,
        Value: ({ value }) => {
          params.push(value)
          return dialect === 'postgres' ? `$${params.length}` : '?'
        },
        Column: ({ segments }) => `"${segments.join('_')}"`,
        Foreign: () => {
          throw new Error('unexpected foreign')
        },
        Each: () => {
          throw new Error('unexpected each')
        },
        Rows: () => {
          throw new Error('unexpected rows')
        },
      }),
    )
    .join('')
  return { sql: `SELECT ${text} AS ans FROM t`, params }
}

describe('Time operations (Bout 1.2)', () => {
  it('evaluates addDays, addMonths (clamped), daysBetween, startOfMonth, and overlaps in memory', () => {
    expect(iso(Expr.eval(Time.addDays(day('2024-01-31'), 30), {})!)).toBe('2024-03-01')
    expect(iso(Expr.eval(Time.addMonths(day('2024-01-31'), 1), {})!)).toBe('2024-02-29')
    expect(iso(Expr.eval(Time.addMonths(day('2025-01-31'), 1), {})!)).toBe('2025-02-28')
    expect(iso(Expr.eval(Time.addMonths(day('2024-03-31'), -1), {})!)).toBe('2024-02-29')
    expect(iso(Expr.eval(Time.addMonths(day('2024-01-31'), 2), {})!)).toBe('2024-03-31')
    expect(Expr.eval(Time.daysBetween(day('2024-03-01'), day('2024-01-31')), {})).toBe(30)
    expect(iso(Expr.eval(Time.startOfMonth(day('2024-02-29')), {})!)).toBe('2024-02-01')

    expect(Expr.eval(Time.overlaps(10, 20, 15, 25), {})).toBe(true)
    // Half-open: touching endpoints [10, 20) and [20, 30) do NOT overlap.
    expect(Expr.eval(Time.overlaps(10, 20, 20, 30), {})).toBe(false)
    // Strict null propagation even when the other pair is false.
    expect(Expr.eval(Time.overlaps(null, 5, 10, 5), {})).toBe(null)
    // Refuses non-integer operands.
    expect(Result.isFailure(Expr.evalResult(Time.addDays(0.5, 1), {}))).toBe(true)
  })

  it('satisfies partial evaluation laws and core property checks', () => {
    const reports = Conformance.checkAllProperties()
    for (const id of [
      'time.addDays',
      'time.addMonths',
      'time.daysBetween',
      'time.startOfMonth',
      'time.overlaps',
    ] as const) {
      const rep = reports.find(r => r.op === id)
      expect(rep?.ok, `${id}: ${JSON.stringify(rep?.failures)}`).toBe(true)
    }

    const $b = Path.forSchema(Booking)
    expect(Expr.residualize(Time.addDays($b.start, 0), {}).node).toEqual($b.start.node)
    expect(Expr.residualize(Time.addMonths($b.start, 0), {}).node).toEqual($b.start.node)
    expect(Expr.residualize(Time.startOfMonth(Time.startOfMonth($b.start)), {}).node).toEqual(
      Time.startOfMonth($b.start).node,
    )
  })

  it('proves #601 §2 booking and bank rules in Abstract and Z3', async () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Booking, bookingTrialEndsAfterStart))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Booking, bookingNoAdjacentOverlap))).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(BankAccount, Ord.gte(bankNextFeeOn, day('2020-02-01'))),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(BankAccount, Ord.gte(bankFeeMonth, day('2020-01-01'))),
      ),
    ).toBe(true)

    const z3Trial = await Effect.runPromise(Prove.invariant(Booking, bookingTrialEndsAfterStart))
    expect(Verdict.isTrue(z3Trial)).toBe(true)
    const z3Overlap = await Effect.runPromise(Prove.invariant(Booking, bookingNoAdjacentOverlap))
    expect(Verdict.isTrue(z3Overlap)).toBe(true)

    expect(
      Expr.eval(bookingTrialEnd, {
        dayNumber: 0,
        start: day('2025-01-01'),
        today: day('2025-01-10'),
        otherStart: day('2025-02-01'),
        otherEnd: day('2025-02-10'),
      }),
    ).toBe(day('2025-01-31'))
    expect(
      Expr.eval(bookingDaysLeft, {
        dayNumber: 0,
        start: day('2025-01-01'),
        today: day('2025-01-10'),
        otherStart: day('2025-02-01'),
        otherEnd: day('2025-02-10'),
      }),
    ).toBe(21)
    expect(
      Expr.eval(bookingTrialOverlaps, {
        dayNumber: 0,
        start: day('2025-01-01'),
        today: day('2025-01-10'),
        otherStart: day('2025-01-20'),
        otherEnd: day('2025-02-10'),
      }),
    ).toBe(true)
  })

  it('matches memory 100% on real SQLite and PGlite across leap years, month-end clamping, negatives, and nulls', async () => {
    const cases: ReadonlyArray<Schema.Schema.Type<typeof Row>> = [
      { d: day('2024-01-31'), n: 1, s1: 10, e1: 20, s2: 15, e2: 25 },
      { d: day('2025-01-31'), n: 1, s1: 10, e1: 20, s2: 20, e2: 30 },
      { d: day('2024-02-29'), n: 12, s1: 10, e1: 10, s2: 10, e2: 20 },
      { d: day('2024-03-31'), n: -1, s1: 20, e1: 30, s2: 10, e2: 25 },
      { d: day('2024-01-31'), n: 2, s1: null, e1: 5, s2: 10, e2: 5 },
      { d: day('2000-02-29'), n: -12, s1: 1, e1: 5, s2: 2, e2: 3 },
      { d: day('1970-01-01'), n: 0, s1: -5, e1: 0, s2: -2, e2: 2 },
      { d: day('2026-12-31'), n: -10, s1: 5, e1: 10, s2: 10, e2: 15 },
      { d: day('9999-12-15'), n: 0, s1: 1, e1: 2, s2: 1, e2: 2 },
      { d: day('9999-11-30'), n: 1, s1: 1, e1: 2, s2: 2, e2: 3 },
      { d: null, n: 1, s1: 1, e1: 2, s2: null, e2: 3 },
      { d: day('2024-05-15'), n: null, s1: 1, e1: 2, s2: 1, e2: null },
    ]

    const exprs: ReadonlyArray<{
      readonly name: string
      readonly expr: Expr.Expr<
        { readonly row: Schema.Schema.Type<typeof Row> },
        number | boolean | null
      >
    }> = [
      { name: 'addDays', expr: Time.addDays($.row.d, $.row.n) },
      { name: 'addMonths', expr: Time.addMonths($.row.d, $.row.n) },
      { name: 'daysBetween', expr: Time.daysBetween($.row.d, $.row.n) },
      { name: 'startOfMonth', expr: Time.startOfMonth($.row.d) },
      { name: 'overlaps', expr: Time.overlaps($.row.s1, $.row.e1, $.row.s2, $.row.e2) },
    ]

    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(
      'CREATE TABLE t (d INTEGER, n INTEGER, s1 INTEGER, e1 INTEGER, s2 INTEGER, e2 INTEGER)',
    )
    const pg = new PGlite()
    await pg.exec(
      'CREATE TABLE t (d INTEGER, n INTEGER, s1 INTEGER, e1 INTEGER, s2 INTEGER, e2 INTEGER)',
    )

    try {
      for (const row of cases) {
        sqlite.exec('DELETE FROM t')
        sqlite
          .prepare('INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)')
          .run(row.d, row.n, row.s1, row.e1, row.s2, row.e2)
        await pg.exec('DELETE FROM t')
        await pg.query('INSERT INTO t VALUES ($1, $2, $3, $4, $5, $6)', [
          row.d,
          row.n,
          row.s1,
          row.e1,
          row.s2,
          row.e2,
        ])

        for (const { name, expr } of exprs) {
          const expected = Expr.eval(expr, { row })

          const sq = evalSqlTerm('sqlite', expr)
          const sqRaw = (
            sqlite.prepare(sq.sql).get(...(sq.params as Array<number | string | null>)) as {
              ans: number | null
            }
          ).ans
          const sqVal = name === 'overlaps' && sqRaw !== null ? sqRaw !== 0 : sqRaw

          const pq = evalSqlTerm('postgres', expr)
          const pgRes = await pg.query<{ ans: number | boolean | null }>(pq.sql, [...pq.params])
          const pgVal = pgRes.rows[0]!.ans

          expect(sqVal, `sqlite ${name} on ${JSON.stringify(row)}`).toBe(expected)
          expect(pgVal, `postgres ${name} on ${JSON.stringify(row)}`).toBe(expected)
        }
      }
    } finally {
      sqlite.close()
      await pg.close()
    }
  })
})
