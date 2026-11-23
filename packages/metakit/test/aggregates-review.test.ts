import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { Option, Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Eq, Expr, Num } from 'metakit'
import * as Rows from 'metakit/aggregates'
import * as RowsSql from 'metakit/aggregates/sql'
import { Decimal, Money } from 'metakit/domain'

const Entry = Schema.Struct({
  id: Schema.String,
  amount: Schema.NullOr(Schema.Int),
  settled: Schema.NullOr(Schema.Boolean),
})
type Entry = typeof Entry.Type

const aggregates = {
  sum: Rows.sum(Entry, $ => $.amount),
  count: Rows.count(Entry),
  countSettled: Rows.count(Entry, $ => $.settled),
  min: Rows.min(Entry, $ => $.amount),
  max: Rows.max(Entry, $ => $.amount),
  every: Rows.every(Entry, $ => $.settled),
  any: Rows.any(Entry, $ => Eq.is($.settled, false)),
} as const
type Name = keyof typeof aggregates
const names: ReadonlyArray<Name> = ['sum', 'count', 'countSettled', 'min', 'max', 'every', 'any']

/** The in-memory value as SQL spells it: `null` for no extremum, `0`/`1` never (booleans stay). */
const inMemory = (rows: ReadonlyArray<Entry>): Record<Name, unknown> => ({
  sum: aggregates.sum.evaluate(rows),
  count: aggregates.count.evaluate(rows),
  countSettled: aggregates.countSettled.evaluate(rows),
  min: Option.getOrNull(aggregates.min.evaluate(rows)),
  max: Option.getOrNull(aggregates.max.evaluate(rows)),
  every: aggregates.every.evaluate(rows),
  any: aggregates.any.evaluate(rows),
})

const selectList = (dialect: 'postgres' | 'sqlite') => {
  const params: Array<unknown> = []
  const columns = names.map(name => {
    const fragment = Result.getOrThrow(RowsSql.toSql(aggregates[name], { dialect }))
    // Each fragment numbers its own parameters from 1; renumber them in order.
    const text =
      dialect === 'postgres'
        ? fragment.text.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + params.length}`)
        : fragment.text
    params.push(...fragment.params)
    return `${text} AS "${name}"`
  })
  return { text: columns.join(', '), params }
}

const sets: ReadonlyArray<readonly [string, ReadonlyArray<Entry>]> = [
  ['no rows', []],
  ['only nulls', [{ id: 'a', amount: null, settled: null }]],
  [
    'nulls among values',
    [
      { id: 'a', amount: 5, settled: true },
      { id: 'b', amount: null, settled: null },
      { id: 'c', amount: -7, settled: true },
      { id: 'd', amount: 40, settled: false },
    ],
  ],
  [
    'every settled, one unknown',
    [
      { id: 'a', amount: 1, settled: true },
      { id: 'b', amount: 2, settled: null },
    ],
  ],
  [
    'every settled',
    [
      { id: 'a', amount: 3_000_000_000, settled: true },
      { id: 'b', amount: 4_000_000_000, settled: true },
    ],
  ],
]

/** SQLite has no boolean: bind it as `0`/`1`. */
const toSqlite = (param: unknown): number | string | null => {
  if (typeof param === 'boolean') return Number(param)
  if (typeof param === 'number' || typeof param === 'string') return param
  if (param === null) return null
  throw new Error(`unexpected parameter ${String(param)}`)
}

let pg: PGlite
const sqlite = new DatabaseSync(':memory:')

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(
    `CREATE TABLE "entries" ("id" TEXT PRIMARY KEY, "amount" BIGINT, "settled" BOOLEAN)`,
  )
  sqlite.exec(`CREATE TABLE "entries" ("id" TEXT PRIMARY KEY, "amount" INTEGER, "settled" INTEGER)`)
})

afterAll(async () => {
  await pg.close()
  sqlite.close()
})

describe('metakit/aggregates/sql agrees with evaluate on Postgres and SQLite', () => {
  for (const [label, rows] of sets) {
    it(`${label}`, async () => {
      await pg.exec(`DELETE FROM "entries"`)
      sqlite.exec(`DELETE FROM "entries"`)
      for (const row of rows) {
        await pg.query(`INSERT INTO "entries" VALUES ($1, $2, $3)`, [
          row.id,
          row.amount,
          row.settled,
        ])
        sqlite
          .prepare(`INSERT INTO "entries" VALUES (?, ?, ?)`)
          .run(row.id, row.amount, row.settled === null ? null : Number(row.settled))
      }
      const expected = inMemory(rows)

      const pgQuery = selectList('postgres')
      const pgRow = (
        await pg.query<Record<Name, unknown>>(
          `SELECT ${pgQuery.text} FROM "entries"`,
          pgQuery.params,
        )
      ).rows[0]!
      // Postgres hands back numbers for every numeric column: `sum` is cast, so no bigint text.
      expect(pgRow).toEqual(expected)

      const liteQuery = selectList('sqlite')
      const liteRow = sqlite
        .prepare(`SELECT ${liteQuery.text} FROM "entries"`)
        .get(...liteQuery.params.map(toSqlite))!
      expect({
        ...liteRow,
        every: liteRow['every'] === 1,
        any: liteRow['any'] === 1,
      }).toEqual(expected)
    })
  }
})

describe('min and max follow SQL', () => {
  const Reading = Schema.Struct({ x: Schema.NullOr(Schema.Number) })
  const lowest = Rows.min(Reading, $ => $.x)
  const highest = Rows.max(Reading, $ => $.x)

  it('skip a null, as SQL MIN and MAX do', () => {
    expect(lowest.evaluate([{ x: 5 }, { x: null }])).toEqual(Option.some(5))
    expect(highest.evaluate([{ x: null }, { x: 5 }])).toEqual(Option.some(5))
    expect(lowest.evaluate([{ x: null }])).toEqual(Option.none())
    expect(lowest.insertStep(Option.some(3), { x: null })).toEqual(Option.some(3))
  })

  it('give one answer whatever the order of a NaN', () => {
    for (const agg of [lowest, highest]) {
      const a = agg.evaluate([{ x: Number.NaN }, { x: 1 }])
      const b = agg.evaluate([{ x: 1 }, { x: Number.NaN }])
      expect(a).toEqual(b)
      expect(Option.map(a, Number.isNaN)).toEqual(Option.some(true))
      expect(Option.map(agg.insertStep(Option.some(Number.NaN), { x: 1 }), Number.isNaN)).toEqual(
        Option.some(true),
      )
    }
  })
})

describe('every and any count an unknown predicate as false', () => {
  const Flag = Schema.Struct({ ok: Schema.NullOr(Schema.Boolean) })
  it('in evaluate and in insertStep', () => {
    const all = Rows.every(Flag, $ => $.ok)
    const some = Rows.any(Flag, $ => $.ok)
    expect(all.evaluate([{ ok: true }, { ok: null }])).toBe(false)
    expect(all.insertStep(true, { ok: null })).toBe(false)
    expect(some.evaluate([{ ok: null }])).toBe(false)
    expect(some.insertStep(false, { ok: null })).toBe(false)
    expect(all.evaluate([])).toBe(true)
  })
})

describe('sum keeps exact deltas by reading only integers', () => {
  it('refuses a contribution that may not be an integer', () => {
    const Reading = Schema.Struct({ x: Schema.Number, n: Schema.Int })
    expect(() => Rows.sum(Reading, $ => $.x)).toThrow(/integer-valued/)
    const Maybe = Schema.Struct({ x: Schema.NullOr(Schema.Number) })
    expect(() => Rows.sum(Maybe, $ => $.x)).toThrow(/integer-valued/)
    expect(() => Rows.sum(Reading, $ => Num.add($.n, 0.5))).toThrow(/integer-valued/)
    expect(() => Rows.sum(Reading, $ => Num.mul($.n, $.x))).toThrow(/integer-valued/)
    expect(() =>
      Rows.sum(Reading, $ => Expr.opaque({ name: 'n' }, (row: typeof Reading.Type) => row.n)),
    ).toThrow(/integer-valued/)
  })

  it('accepts Int, Money and Decimal fields and integer arithmetic over them', () => {
    const Line = Schema.Struct({
      qty: Schema.Int,
      net: Money.make('USD'),
      weight: Decimal.make({ scale: 3 }),
      flag: Schema.Boolean,
      size: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })
    const totalNet = Rows.sum(Line, $ => Money.mulInt($.net, $.qty))
    const row = {
      qty: 3,
      net: Money.minor('USD', 250),
      weight: Decimal.units(1500, 3),
      flag: true,
      size: null,
    }
    expect(totalNet.evaluate([row, row])).toBe(1500)
    expect(Rows.sum(Line, $ => Decimal.neg($.weight)).evaluate([row])).toBe(-1500)
    expect(Rows.sum(Line, $ => Expr.when($.flag, { then: $.qty, else: 0 })).evaluate([row])).toBe(3)
    expect(Rows.sum(Line, $ => $.size).evaluate([row, { ...row, size: 4 }])).toBe(4)
  })

  it('moves by its deltas to what a rescan gives', () => {
    const Line = Schema.Struct({ cents: Schema.NullOr(Schema.Int) })
    const total = Rows.sum(Line, $ => $.cents)
    const rows = [{ cents: 10 }, { cents: 20 }, { cents: null }, { cents: 30 }]
    let value = total.evaluate(rows)
    value += total.deleteDelta({ cents: 20 })
    value += total.updateDelta({ cents: null }, { cents: 7 })
    value += total.insertDelta({ cents: null })
    expect(value).toBe(total.evaluate([{ cents: 10 }, { cents: 7 }, { cents: 30 }]))
    expect(total.insertDelta({ cents: null })).toBe(0)
    expect(total.updateDelta({ cents: 5 }, { cents: null })).toBe(-5)
  })

  it('replaces two totals whose difference is not a safe integer', () => {
    const Line = Schema.Struct({ cents: Schema.Int })
    const total = Rows.sum(Line, $ => $.cents)
    const min = Number.MIN_SAFE_INTEGER
    const max = Number.MAX_SAFE_INTEGER
    const before = { cents: min }
    const after = { cents: max - 1 }

    expect(total.replaceTotal(total.evaluate([before]), before, after)).toBe(
      total.evaluate([after]),
    )
    expect(total.replaceTotal(total.evaluate([after]), after, before)).toBe(
      total.evaluate([before]),
    )
    expect(total.replaceTotal(0, { cents: 0 }, { cents: 0 })).toBe(0)
    expect(() => total.updateDelta(before, after)).toThrow(/update delta is past/)
    expect(() => total.replaceTotal(max, { cents: 0 }, { cents: 1 })).toThrow(/total is past/)
  })

  it('gives a symbolic delta the identity for a missing contribution', () => {
    const Line = Schema.Struct({ cents: Schema.NullOr(Schema.Int) })
    const total = Rows.sum(Line, $ => $.cents)
    const pairs = [
      [{ cents: null }, { cents: 7 }],
      [{ cents: 7 }, { cents: null }],
      [{ cents: null }, { cents: null }],
      [{ cents: 3 }, { cents: 9 }],
    ] as const

    for (const [before, after] of pairs) {
      expect(Expr.eval(total.symbolicUpdateDelta, { before, after })).toBe(
        total.updateDelta(before, after),
      )
      expect(Expr.eval(total.symbolicInsertDelta, { row: before })).toBe(total.insertDelta(before))
      expect(Expr.eval(total.symbolicInsertDelta, { row: after })).toBe(total.insertDelta(after))
    }

    const tally = Rows.count(Entry, $ => $.settled)
    const unknown = { id: 'a', amount: null, settled: null }
    expect(Expr.eval(tally.symbolicInsertDelta, { row: unknown })).toBe(tally.insertDelta(unknown))
  })
})

describe('metakit/aggregates imports no SQL', () => {
  it('reaches no SQL module through its static imports', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src')
    const seen = new Set<string>()
    const visit = (file: string): void => {
      if (seen.has(file)) return
      seen.add(file)
      const text = readFileSync(file, 'utf8')
      for (const [, spec] of text.matchAll(/^(?:import|export)\b[^'"]*'(\.[^']+)'/gm)) {
        visit(resolve(dirname(file), spec!.replace(/\.js$/, '.ts')))
      }
    }
    visit(resolve(src, 'aggregates.ts'))
    const reached = [...seen].map(file => file.slice(src.length + 1).replaceAll('\\', '/'))
    expect(reached).toContain('expr.ts')
    expect(reached.filter(file => /sql|drizzle|prove/i.test(file))).toEqual([])
  })
})
