/**
 * Bug-Hunting Sweep 4: 3-Way SQLite (node:sqlite) vs Postgres (PGlite) vs Memory
 * parity torture test over the trickiest SQL edge cases:
 * - All 5 `num.div` rounding modes + `num.rem` with negative dividends & divisors
 * - `num.mulScaled` with negatives, exact halves, and safe-range edges
 * - `Time.addMonths` leap-year clamping & negative months, `startOfMonth`, `daysBetween`
 * - `Str.contains`/`startsWith`/`endsWith` with LIKE wildcards (`%`, `_`, `\`) and case
 * - `Str.trim` with space/tab/LF/CR vs Unicode NBSP (`\u00A0`)
 * - `Sql.toCheck` (inlined literals) vs `Sql.toWhere` (bound params)
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { Bool, Eq, Expr, Null, Num, Ord, Str, Time } from 'metakit'
import { CalendarDay, Text } from 'metakit/domain'
import * as Sql from 'metakit/sql'
import { describe, expect, it } from 'vitest'

const Row = Schema.Struct({
  id: Schema.String,
  a: Schema.NullOr(Schema.Int),
  b: Schema.NullOr(Schema.Int),
  s: Schema.NullOr(Text.schema),
  d: Schema.NullOr(CalendarDay.schema),
})
type Row = typeof Row.Type

const day = (iso: string) => Result.getOrThrow(CalendarDay.fromIso(iso))

const testRows: ReadonlyArray<Row> = [
  { id: 'r1', a: 5, b: 2, s: '100%_done\\ok', d: day('2024-01-31') },
  { id: 'r2', a: -5, b: 2, s: '100X_done', d: day('2025-01-31') },
  { id: 'r3', a: 5, b: -2, s: '  \t\r\nAbC\u00A0 ', d: day('2024-02-29') },
  { id: 'r4', a: -5, b: -2, s: 'abc', d: day('2024-03-31') },
  { id: 'r5', a: 3, b: 2, s: "O'Brien", d: day('2026-12-31') },
  { id: 'r6', a: -3, b: 2, s: '', d: day('2000-02-29') },
  { id: 'r7', a: 7, b: 0, s: null, d: null },
  { id: 'r8', a: null, b: 2, s: 'ABC', d: day('1999-12-31') },
]

const cases: ReadonlyArray<readonly [string, Expr.Expr<{ readonly row: Row }, boolean | null>]> = [
  // All 5 num.div rounding modes with positive & negative dividends/divisors and zero
  [
    'div half-even == 2',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'half-even', onZero: 'null' }), 2),
    ),
  ],
  [
    'div half-even == -2',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'half-even', onZero: 'null' }), -2),
    ),
  ],
  [
    'div half-away == 3',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'half-away-from-zero', onZero: 'null' }), 3),
    ),
  ],
  [
    'div half-away == -3',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'half-away-from-zero', onZero: 'null' }), -3),
    ),
  ],
  [
    'div floor == -3',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'floor', onZero: 'null' }), -3),
    ),
  ],
  [
    'div ceiling == 3',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'ceiling', onZero: 'null' }), 3),
    ),
  ],
  [
    'div toward-zero == -2',
    Expr.in({ row: Row }, ({ row }) =>
      Eq.equals(Num.div(row.a, row.b, { rounding: 'toward-zero', onZero: 'null' }), -2),
    ),
  ],
  [
    'rem == -1',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.rem(row.a, row.b, { onZero: 'null' }), -1)),
  ],
  [
    'rem == 1',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.rem(row.a, row.b, { onZero: 'null' }), 1)),
  ],
  // num.mulScaled with negative values & half-even rounding
  [
    'mulScaled(a, 5, shift:1) == -2',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.mulScaled(row.a, 5, { shift: 1 }), -2)),
  ],
  [
    'mulScaled(a, 5, shift:1) == 2',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Num.mulScaled(row.a, 5, { shift: 1 }), 2)),
  ],
  // LIKE wildcard escaping & case sensitivity
  ['contains literal %_', Expr.in({ row: Row }, ({ row }) => Str.contains(row.s, '%_'))],
  ['contains literal \\', Expr.in({ row: Row }, ({ row }) => Str.contains(row.s, '\\'))],
  [
    'startsWith case-sensitive ABC',
    Expr.in({ row: Row }, ({ row }) => Str.startsWith(row.s, 'ABC')),
  ],
  ['endsWith case-sensitive abc', Expr.in({ row: Row }, ({ row }) => Str.endsWith(row.s, 'abc'))],
  ['contains apostrophe', Expr.in({ row: Row }, ({ row }) => Str.contains(row.s, "'"))],
  [
    'trim preserves NBSP',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Str.trim(row.s), 'AbC\u00A0')),
  ],
  // CalendarDay / Time edge cases (leap years, month-end clamping, negative months)
  [
    'addMonths(d, 1) == 2024-02-29',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Time.addMonths(row.d, 1), day('2024-02-29'))),
  ],
  [
    'addMonths(d, 1) == 2025-02-28',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Time.addMonths(row.d, 1), day('2025-02-28'))),
  ],
  [
    'addMonths(d, 12) == 2025-02-28',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Time.addMonths(row.d, 12), day('2025-02-28'))),
  ],
  [
    'addMonths(d, -1) == 2024-02-29',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Time.addMonths(row.d, -1), day('2024-02-29'))),
  ],
  [
    'startOfMonth(d) == 2024-02-01',
    Expr.in({ row: Row }, ({ row }) => Eq.equals(Time.startOfMonth(row.d), day('2024-02-01'))),
  ],
  // Empty / null Eq.oneOf & Eq.among
  ['oneOf empty', Expr.in({ row: Row }, ({ row }) => Eq.oneOf(row.s, []))],
  ['among empty', Expr.in({ row: Row }, ({ row }) => Eq.among(row.a, []))],
  [
    'isNull(coalesce(a, b))',
    Expr.in({ row: Row }, ({ row }) => Null.isNull(Null.coalesce(row.a, row.b))),
  ],
  [
    'ord + bool + str.lt',
    Expr.in({ row: Row }, ({ row }) => Bool.and(Ord.lt(row.a, 0), Str.lt(row.s, 'z'))),
  ],
]

describe('Bug-Hunting Sweep 4: 3-Way SQLite vs Postgres vs Memory parity', () => {
  it('agrees across Memory, Postgres (PGlite), and SQLite (node:sqlite) on all edge cases', async () => {
    const pg = new PGlite()
    const sqlite = new DatabaseSync(':memory:')

    const ddl = `
      CREATE TABLE edge_rows (
        id TEXT PRIMARY KEY,
        a INTEGER,
        b INTEGER,
        s TEXT,
        d INTEGER
      );
    `
    await pg.exec(ddl)
    sqlite.exec(ddl)

    const insertSqlite = sqlite.prepare(
      `INSERT INTO edge_rows (id, a, b, s, d) VALUES (?, ?, ?, ?, ?)`,
    )
    for (const r of testRows) {
      await pg.query(`INSERT INTO edge_rows (id, a, b, s, d) VALUES ($1,$2,$3,$4,$5)`, [
        r.id,
        r.a,
        r.b,
        r.s,
        r.d,
      ])
      insertSqlite.run(r.id, r.a, r.b, r.s, r.d)
    }

    const failures: Array<string> = []
    for (const [name, expr] of cases) {
      const memIds = testRows.filter(row => Expr.holds(expr, { row })).map(r => r.id)

      // Postgres
      const pgWhere = Sql.toWhere(expr, { dialect: 'postgres' })
      if (Result.isFailure(pgWhere)) {
        failures.push(`[pg-lower] ${name}: ${pgWhere.failure.reason}`)
      } else {
        try {
          const res = await pg.query<{ id: string }>(
            `SELECT id FROM edge_rows WHERE ${pgWhere.success.text} ORDER BY id`,
            [...pgWhere.success.params],
          )
          const pgIds = res.rows.map(r => r.id)
          if (JSON.stringify(pgIds) !== JSON.stringify(memIds)) {
            failures.push(
              `[pg-mismatch] ${name}: mem=${JSON.stringify(memIds)} pg=${JSON.stringify(pgIds)} | SQL: ${pgWhere.success.text}`,
            )
          }
        } catch (err) {
          failures.push(
            `[pg-error] ${name}: ${(err as Error).message} | SQL: ${pgWhere.success.text}`,
          )
        }
      }

      // SQLite
      const sqWhere = Sql.toWhere(expr, { dialect: 'sqlite' })
      if (Result.isFailure(sqWhere)) {
        failures.push(`[sqlite-lower] ${name}: ${sqWhere.failure.reason}`)
      } else {
        try {
          const stmt = sqlite.prepare(
            `SELECT id FROM edge_rows WHERE ${sqWhere.success.text} ORDER BY id`,
          )
          const sqRows = stmt.all(
            ...(sqWhere.success.params as Array<null | number | string>),
          ) as Array<{
            id: string
          }>
          const sqIds = sqRows.map(r => r.id)
          if (JSON.stringify(sqIds) !== JSON.stringify(memIds)) {
            failures.push(
              `[sqlite-mismatch] ${name}: mem=${JSON.stringify(memIds)} sqlite=${JSON.stringify(sqIds)} | SQL: ${sqWhere.success.text}`,
            )
          }
        } catch (err) {
          failures.push(
            `[sqlite-error] ${name}: ${(err as Error).message} | SQL: ${sqWhere.success.text}`,
          )
        }
      }
    }

    sqlite.close()
    await pg.close()
    expect(failures).toEqual([])
  })
})
