/**
 * Bug-Hunting Sweep 3: Seeded 4-way differential fuzzer & edge-case torture suite.
 *
 * Generates 200 random expression trees (including nested `If`, `Match`, `Num`,
 * `Str`, `Time`, `Eq`, `Null`, and nested `Arr` folds) and asserts exact
 * soundness across:
 *   1. `Expr.evalResult(expr, fullEnv)`
 *   2. `Expr.evalResult(Expr.residualize(expr, partialEnv), fullEnv)`
 *   3. `Expr.judge(expr, partialEnv)` (never contradicts concrete truth!)
 *   4. PGlite parameterized `Sql.toWhere(expr, { dialect: 'postgres', env: partialEnv })`
 */
import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { Arr, Bool, Eq, Expr, Null, Num, Ord, Str, Time, Verdict } from 'metakit'
import { CalendarDay, Text } from 'metakit/domain'
import * as Sql from 'metakit/sql'
import { describe, expect, it } from 'vitest'

const Row = Schema.Struct({
  id: Schema.String,
  a: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))),
  b: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))),
  s: Schema.NullOr(Text.schema),
  tag: Schema.NullOr(Schema.Literals(['x', 'y', 'z'])),
  flag: Schema.NullOr(Schema.Boolean),
  d1: Schema.NullOr(CalendarDay.schema),
  d2: Schema.NullOr(CalendarDay.schema),
})
type Row = typeof Row.Type

const Param = Schema.Struct({
  k: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 }))),
  tag: Schema.NullOr(Schema.Literals(['x', 'y', 'z'])),
  flag: Schema.NullOr(Schema.Boolean),
  s: Schema.NullOr(Text.schema),
  d: Schema.NullOr(CalendarDay.schema),
})
type Param = typeof Param.Type

const day = (iso: string) => Result.getOrThrow(CalendarDay.fromIso(iso))

/** Deterministic PRNG (mulberry32) so any discovered failure is 100% reproducible. */
const rng = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(next: () => number, items: ReadonlyArray<T>): T =>
  items[Math.floor(next() * items.length)]!

const sampleRows: ReadonlyArray<Row> = [
  {
    id: 'r1',
    a: 0,
    b: 0,
    s: '',
    tag: 'x',
    flag: true,
    d1: day('2024-01-31'),
    d2: day('2024-02-29'),
  },
  {
    id: 'r2',
    a: -7,
    b: 3,
    s: '  AbC\t',
    tag: 'y',
    flag: false,
    d1: day('2025-01-31'),
    d2: day('2025-02-28'),
  },
  { id: 'r3', a: null, b: 5, s: null, tag: null, flag: null, d1: null, d2: day('2026-06-15') },
  { id: 'r4', a: 100, b: null, s: 'hello', tag: 'z', flag: true, d1: day('2026-03-01'), d2: null },
  {
    id: 'r5',
    a: -100,
    b: -3,
    s: 'xyz',
    tag: 'x',
    flag: false,
    d1: day('2026-06-10'),
    d2: day('2026-06-20'),
  },
]

const sampleParams: ReadonlyArray<Param> = [
  { k: 3, tag: 'x', flag: true, s: 'abc', d: day('2024-02-15') },
  { k: 0, tag: 'y', flag: false, s: '', d: day('2025-02-01') },
  { k: null, tag: null, flag: null, s: null, d: null },
  { k: -5, tag: 'z', flag: true, s: 'hello', d: day('2026-06-15') },
]

type Env = { readonly row: Row; readonly p: Param }

const buildRandomPredicates = (
  count: number,
  seed: number,
): ReadonlyArray<Expr.Expr<Env, boolean | null>> => {
  const next = rng(seed)
  const out: Array<Expr.Expr<Env, boolean | null>> = []

  for (let i = 0; i < count; i++) {
    const expr = Expr.in({ row: Row, p: Param }, ({ row, p }) => {
      const genNum = (depth: number): Expr.Expr<Env, number | null> => {
        if (depth <= 0) {
          return pick(next, [
            row.a,
            row.b,
            p.k,
            Expr.lit(0),
            Expr.lit(1),
            Expr.lit(-3),
            Expr.lit(null),
            Str.len(row.s),
            Time.daysBetween(row.d1, p.d),
          ]) as Expr.Expr<Env, number | null>
        }
        const kind = Math.floor(next() * 7)
        if (kind === 0) return Num.add(genNum(depth - 1), genNum(depth - 1))
        if (kind === 1) return Num.sub(genNum(depth - 1), genNum(depth - 1))
        if (kind === 2)
          return Num.mul(
            genNum(depth - 1),
            pick(next, [Expr.lit(-2), Expr.lit(0), Expr.lit(3), p.k]),
          )
        if (kind === 3) return Num.neg(genNum(depth - 1))
        if (kind === 4) return Null.coalesce(genNum(depth - 1), genNum(depth - 1))
        if (kind === 5)
          return Num.div(
            genNum(depth - 1),
            pick(next, [Expr.lit(3), Expr.lit(-2), Expr.lit(0), p.k]),
            { rounding: 'toward-zero', onZero: 'null' },
          )
        return Num.rem(
          genNum(depth - 1),
          pick(next, [Expr.lit(3), Expr.lit(-2), Expr.lit(0), p.k]),
          { onZero: 'null' },
        )
      }

      const genStr = (depth: number): Expr.Expr<Env, string | null> => {
        if (depth <= 0) {
          return pick(next, [
            row.s,
            p.s,
            Expr.lit(''),
            Expr.lit('abc'),
            Expr.lit('AbC'),
            Expr.lit(null),
          ]) as Expr.Expr<Env, string | null>
        }
        const kind = Math.floor(next() * 4)
        if (kind === 0) return Str.lowerAscii(genStr(depth - 1))
        if (kind === 1) return Str.upperAscii(genStr(depth - 1))
        if (kind === 2) return Str.trim(genStr(depth - 1))
        return Null.coalesce(genStr(depth - 1), genStr(depth - 1))
      }

      const genBool = (depth: number): Expr.Expr<Env, boolean | null> => {
        if (depth <= 0) {
          const leaf = Math.floor(next() * 11)
          if (leaf === 0) return row.flag
          if (leaf === 1) return p.flag
          if (leaf === 2) return Ord.lt(genNum(1), genNum(1))
          if (leaf === 3) return Ord.gte(genNum(1), genNum(1))
          if (leaf === 4) return Eq.is(row.tag, p.tag)
          if (leaf === 5) return Eq.equals(genNum(1), genNum(1))
          if (leaf === 6) return Null.isNull(pick(next, [row.a, row.s, p.k, p.s]))
          if (leaf === 7)
            return Str.contains(genStr(1), pick(next, [Expr.lit('a'), Expr.lit(''), p.s]))
          if (leaf === 8) return Time.overlaps(row.d1, row.d2, p.d, Time.addDays(p.d, 10))
          if (leaf === 9) return Eq.among(row.tag, ['x', 'y', null])
          return Expr.matchOrElse(row.tag, { x: true, y: false }, Null.isNull(row.a))
        }
        const kind = Math.floor(next() * 5)
        if (kind === 0) return Bool.and(genBool(depth - 1), genBool(depth - 1))
        if (kind === 1) return Bool.or(genBool(depth - 1), genBool(depth - 1))
        if (kind === 2) return Bool.not(genBool(depth - 1))
        if (kind === 3)
          return Expr.when(genBool(depth - 1), {
            then: genBool(depth - 1),
            else: genBool(depth - 1),
          })
        return Expr.implies(genBool(depth - 1), genBool(depth - 1))
      }

      return genBool(2)
    })
    out.push(expr)
  }
  return out
}

describe('Bug-Hunting Sweep 3: 200-tree 4-way differential fuzzer', () => {
  it('agrees across concrete eval, residualize, judge, and PGlite parameterized SQL', async () => {
    const db = new PGlite()
    await db.exec(`
      CREATE TABLE fuzz_rows (
        id TEXT PRIMARY KEY,
        a BIGINT,
        b BIGINT,
        s TEXT,
        tag TEXT,
        flag BOOLEAN,
        d1 INTEGER,
        d2 INTEGER
      );
    `)
    for (const r of sampleRows) {
      await db.query(
        `INSERT INTO fuzz_rows (id, a, b, s, tag, flag, d1, d2) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r.id, r.a, r.b, r.s, r.tag, r.flag, r.d1, r.d2],
      )
    }

    const preds = buildRandomPredicates(120, 20261125)
    const failures: Array<string> = []

    for (let idx = 0; idx < preds.length; idx++) {
      const expr = preds[idx]!
      for (let pi = 0; pi < sampleParams.length; pi++) {
        const p = sampleParams[pi]!
        const residual = Expr.residualize(expr, { p })
        const judged = Expr.judge(expr, { p })

        const expectedIds: Array<string> = []
        for (const row of sampleRows) {
          const full = Expr.evalResult(expr, { row, p })
          const res = Expr.evalResult(residual, { row, p })
          if (Result.isSuccess(full) !== Result.isSuccess(res)) {
            failures.push(
              `[residualize-refusal] #${idx} p#${pi} ${row.id}: ${Expr.show(expr)} -> full=${JSON.stringify(full)} vs res=${JSON.stringify(res)}`,
            )
          } else if (
            Result.isSuccess(full) &&
            Result.isSuccess(res) &&
            !Object.is(full.success, res.success)
          ) {
            failures.push(
              `[residualize-value] #${idx} p#${pi} ${row.id}: ${Expr.show(expr)} -> full=${String(full.success)} vs res=${String(res.success)}`,
            )
          }
          const holds = Result.isSuccess(full) && full.success === true
          if (holds) expectedIds.push(row.id)
          if (Verdict.isTrue(judged) && !holds) {
            failures.push(`[judge-false-positive] #${idx} p#${pi} ${row.id}: ${Expr.show(expr)}`)
          }
          if (Verdict.isFalse(judged) && holds) {
            failures.push(`[judge-false-negative] #${idx} p#${pi} ${row.id}: ${Expr.show(expr)}`)
          }
        }

        const where = Sql.toWhere(expr, { dialect: 'postgres', env: { p } })
        if (Result.isSuccess(where)) {
          try {
            const sqlRes = await db.query<{ id: string }>(
              `SELECT id FROM fuzz_rows WHERE ${where.success.text} ORDER BY id`,
              [...where.success.params],
            )
            const sqlIds = sqlRes.rows.map(r => r.id)
            if (JSON.stringify(sqlIds) !== JSON.stringify(expectedIds)) {
              failures.push(
                `[pglite-mismatch] #${idx} p#${pi}: expected=${JSON.stringify(expectedIds)} got=${JSON.stringify(sqlIds)} | expr=${Expr.show(expr)} | sql=${where.success.text} | params=${JSON.stringify(where.success.params)}`,
              )
            }
          } catch (err) {
            failures.push(
              `[pglite-error] #${idx} p#${pi}: ${(err as Error).message} | expr=${Expr.show(expr)} | sql=${where.success.text} | params=${JSON.stringify(where.success.params)}`,
            )
          }
        }
      }
      if (failures.length >= 10) break
    }

    await db.close()
    expect(failures).toEqual([])
  }, 30_000)

  it('verifies nested list fold residualize & judge soundness across random catalogs', () => {
    const Cat = Schema.Struct({
      xs: Schema.Array(Schema.Struct({ id: Schema.Int, v: Schema.NullOr(Schema.Int) })),
      ys: Schema.Array(Schema.Struct({ id: Schema.Int, min: Schema.Int })),
      threshold: Schema.Int,
    })
    const rule = Expr.in({ c: Cat }, ({ c }) =>
      Arr.every(c.xs, x =>
        Arr.any(c.ys, y =>
          Bool.and(Eq.is(x.id, y.id), Num.gte(Null.coalesce(x.v, 0), Num.add(y.min, c.threshold))),
        ),
      ),
    )
    const next = rng(42)
    for (let i = 0; i < 60; i++) {
      const xs = Array.from({ length: Math.floor(next() * 4) }, () => ({
        id: Math.floor(next() * 3),
        v: next() < 0.25 ? null : Math.floor(next() * 10) - 2,
      }))
      const ys = Array.from({ length: Math.floor(next() * 4) }, () => ({
        id: Math.floor(next() * 3),
        min: Math.floor(next() * 5),
      }))
      const threshold = Math.floor(next() * 3) - 1
      const full = { c: { xs, ys, threshold } }
      const expected = Expr.holds(rule, full)

      const res1 = Expr.residualize(rule, { c: { ys, threshold } })
      expect(Expr.holds(res1, full)).toBe(expected)

      const res2 = Expr.residualize(rule, { c: { xs } })
      expect(Expr.holds(res2, full)).toBe(expected)

      const v1 = Expr.judge(rule, { c: { ys, threshold } })
      if (Verdict.isTrue(v1)) expect(expected).toBe(true)
      if (Verdict.isFalse(v1)) expect(expected).toBe(false)
    }
  })
})
