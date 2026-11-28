/**
 * Three asks of the kernel: `Transition.commutes` reads negation, `Transition.step`
 * runs a transition that calls a foreign operation, and an integer total is
 * refused past the safe range wherever it is kept.
 */
import { PGlite } from '@electric-sql/pglite'
import { DatabaseSync } from 'node:sqlite'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Arr, Expr, Node, Num, Ord, Path, Transition, Verdict } from '@doeixd/metakit'
import * as Rows from '@doeixd/metakit/aggregates'
import * as RowsSql from '@doeixd/metakit/aggregates/sql'
import { call } from '@doeixd/metakit/build'
import * as Machine from '@doeixd/metakit/machine'

const Counter = Schema.Struct({
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  loose: Schema.Int,
})
const Amount = Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
const By = Schema.Struct({ by: Amount })
const Wide = Schema.Struct({ by: Schema.Int })

const increment = Transition.make({
  state: Counter,
  input: By,
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
})
const decrement = Transition.make({
  state: Counter,
  input: By,
  apply: ({ state, input }) => [Transition.add(state.count, Num.neg(input.by))],
})
const looseDecrement = Transition.make({
  state: Counter,
  input: Wide,
  apply: ({ state, input }) => [Transition.add(state.loose, Num.neg(input.by))],
})
const decrementFraction = Transition.make({
  state: Schema.Struct({ ratio: Schema.Finite }),
  input: Schema.Struct({ by: Schema.Finite }),
  apply: ({ state, input }) => [Transition.add(state.ratio, Num.neg(input.by))],
})

describe('Transition.commutes reads negation', () => {
  it.each([
    ['an increment and a decrement', () => Transition.commutes(increment, decrement)],
    ['two decrements', () => Transition.commutes(decrement, decrement)],
    ['a decrement and an increment', () => Transition.commutes(decrement, increment)],
  ] as const)('%s of one bounded integer commute', (_, decide) => {
    expect(Verdict.isTrue(decide())).toBe(true)
  })

  it('does not decide where the total is unbounded, as for two increments', () => {
    expect(Verdict.isTrue(Transition.commutes(looseDecrement, looseDecrement))).toBe(false)
  })

  it('does not decide where the negated amount is not an integer', () => {
    expect(Verdict.isTrue(Transition.commutes(decrementFraction, decrementFraction))).toBe(false)
  })

  it('does not decide where a total plus both amounts could leave the safe range', () => {
    const Near = Schema.Struct({
      n: Schema.Int.check(
        Schema.isBetween({
          minimum: Number.MAX_SAFE_INTEGER - 6,
          maximum: Number.MAX_SAFE_INTEGER - 1,
        }),
      ),
    })
    const down = Transition.make({
      state: Near,
      input: By,
      apply: ({ state, input }) => [Transition.add(state.n, Num.neg(input.by))],
    })
    expect(Verdict.isTrue(Transition.commutes(down, down))).toBe(false)
  })

  it('negates the interval of the amount, not only its sign', () => {
    const Top = Schema.Struct({
      n: Schema.Int.check(
        Schema.isBetween({
          minimum: Number.MAX_SAFE_INTEGER - 10,
          maximum: Number.MAX_SAFE_INTEGER,
        }),
      ),
    })
    const down = Transition.make({
      state: Top,
      input: Schema.Struct({ by: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })) }),
      apply: ({ state, input }) => [Transition.add(state.n, Num.neg(input.by))],
    })
    expect(Verdict.isTrue(Transition.commutes(down, down))).toBe(true)
  })

  it('agrees with a run of both orders', () => {
    const start = { count: 500, loose: 0 }
    for (const [a, b] of [
      [3, -2],
      [-5, -5],
      [4, 4],
    ] as const) {
      const order = (first: number, second: number, firstIsDecrement: boolean) => {
        const one = Result.getOrThrow(
          Transition.run(firstIsDecrement ? decrement : increment, start, { by: first }),
        )
        return Result.getOrThrow(
          Transition.run(firstIsDecrement ? increment : decrement, one, { by: second }),
        )
      }
      expect(order(a, b, true)).toEqual(order(b, a, false))
    }
  })
})

import * as Operation from '../src/operation.js'
const double = Operation.define({
  id: 'app.double',
  version: 1,
  args: [Schema.Number],
  returns: Schema.Number,
  nulls: 'strict',
}).descriptor
const Doubled = Transition.make({
  state: Counter,
  input: By,
  apply: ({ state, input }) => [
    Transition.set(
      state.loose,
      call<{ readonly input: { readonly by: number } }, number>(double, [input.by]),
    ),
  ],
})
const Guarded = Transition.make({
  state: Counter,
  input: By,
  when: ({ input }) =>
    Ord.gt(call<{ readonly input: { readonly by: number } }, number>(double, [input.by]), 2),
  apply: ({ state }) => [Transition.set(state.loose, 1)],
})
const foreign: Expr.ForeignImplementations = {
  'app.double@1': { run: ([n]) => Number(n) * 2 },
}
const start = { count: 1, loose: 0 }

describe('a transition that calls a foreign operation', () => {
  it('runs with the implementations, through step, run and a Machine', () => {
    expect(
      Result.getOrThrow(Transition.step(Doubled, start, { by: 4 }, undefined, { foreign })).state,
    ).toEqual({ count: 1, loose: 8 })
    expect(
      Result.getOrThrow(Transition.run(Doubled, start, { by: 3 }, undefined, { foreign })),
    ).toEqual({
      count: 1,
      loose: 6,
    })
    const machine = Machine.make({ state: Counter, transitions: { Doubled } })
    const message = { _tag: 'Doubled', input: { by: 2 } } as const
    expect(Result.getOrThrow(machine.dispatch(start, message, { foreign })).state.loose).toBe(4)
    expect(machine.update(start, message, { foreign })[0].loose).toBe(4)
  })

  it('runs a guard that calls one, and does not fire it without', () => {
    expect(
      Result.getOrThrow(Transition.run(Guarded, start, { by: 2 }, undefined, { foreign })).loose,
    ).toBe(1)
    expect(
      Result.isFailure(Transition.run(Guarded, start, { by: 1 }, undefined, { foreign })),
    ).toBe(true)
    expect(Result.isFailure(Transition.run(Guarded, start, { by: 2 }))).toBe(true)
  })

  it('is refused by name without them, or with another version', () => {
    const missing = Transition.step(Doubled, start, { by: 4 })
    expect(Result.isFailure(missing) && missing.failure.reason).toContain('no implementation')
    expect(Result.isFailure(missing) && missing.failure.reason).toContain('app.double@1')
    const stale = { 'app.double@2': { run: () => 0 } }
    expect(
      Result.isFailure(Transition.step(Doubled, start, { by: 4 }, undefined, { foreign: stale })),
    ).toBe(true)
    const machine = Machine.make({ state: Counter, transitions: { Doubled } })
    const message = { _tag: 'Doubled', input: { by: 2 } } as const
    expect(Result.isFailure(machine.dispatch(start, message))).toBe(true)
    expect(machine.update(start, message)[0]).toBe(start)
  })
})

const Entry = Schema.Struct({ id: Schema.String, amount: Schema.Int })
type Entry = typeof Entry.Type
const Total = Rows.sum(Entry, $ => $.amount)
const Tally = Rows.count(Entry)
const MAX = Number.MAX_SAFE_INTEGER
const entry = (id: string, amount: number): Entry => ({ id, amount })
const refusal = (run: () => unknown): string | undefined => {
  try {
    run()
  } catch (thrown) {
    return Node.isRefusal(thrown) ? thrown.reason : `threw ${String(thrown)}`
  }
  return undefined
}

describe('a total past the safe range is refused', () => {
  it('in the list fold Arr.sum, by the final total', () => {
    const Items = Schema.Struct({ items: Schema.Array(Schema.Struct({ n: Schema.Int })) })
    const { state } = Path.forEnv({ state: Items })
    const sum = Arr.sum(state.items, each => each.n)
    const over = (...ns: ReadonlyArray<number>) =>
      Result.match(Expr.evalResult(sum, { state: { items: ns.map(n => ({ n })) } }), {
        onSuccess: found => found,
        onFailure: failed => failed.reason,
      })
    expect(over(MAX, 1, -1)).toBe(MAX)
    expect(over(MAX, 1)).toBe('unsafe-integer')
    expect(over(-MAX, -1)).toBe('unsafe-integer')
  })

  it('in an aggregate evaluated over rows, by the final total', () => {
    expect(Total.evaluate([entry('a', MAX), entry('b', 1), entry('c', -1)])).toBe(MAX)
    expect(refusal(() => Total.evaluate([entry('a', MAX), entry('b', 1)]))).toBe('unsafe-integer')
    expect(Total.evaluate([entry('a', -MAX), entry('b', -1), entry('c', 1)])).toBe(-MAX)
    expect(refusal(() => Total.evaluate([entry('a', -MAX), entry('b', -1)]))).toBe('unsafe-integer')
  })

  it('in an aggregate kept by deltas, when a delta takes it past the range', () => {
    const total = Total.apply(Total.identity, Total.insertDelta(entry('a', MAX)))
    expect(total).toBe(MAX)
    expect(refusal(() => Total.apply(total, Total.insertDelta(entry('b', 1))))).toBe(
      'unsafe-integer',
    )
    expect(
      refusal(() => Total.apply(total, Total.updateDelta(entry('a', MAX), entry('a', MAX)))),
    ).toBe(undefined)
    expect(Total.apply(total, Total.deleteDelta(entry('a', MAX)))).toBe(0)
    expect(refusal(() => Total.apply(-MAX, Total.deleteDelta(entry('a', 1))))).toBe(
      'unsafe-integer',
    )
    expect(Tally.apply(2, Tally.insertDelta(entry('a', 1)))).toBe(3)
  })
})

describe('the same total in SQL', () => {
  let lite: DatabaseSync
  let pg: PGlite
  beforeAll(async () => {
    lite = new DatabaseSync(':memory:')
    lite.exec('CREATE TABLE entries (amount INTEGER NOT NULL)')
    pg = await PGlite.create()
  })
  afterAll(async () => {
    lite.close()
    await pg.close()
  })

  it('requires SQLite bounds that rule out intermediate integer overflow', () => {
    for (const sqliteSum of [undefined, { maxRows: 2050, maxAbsContribution: MAX }]) {
      const lowered = RowsSql.toSql(Total, { dialect: 'sqlite', ...(sqliteSum && { sqliteSum }) })
      expect(Result.isFailure(lowered) && lowered.failure.reason).toContain('signed 64-bit')
    }
  })

  const grouped = [...Array<number>(32).fill(MAX), ...Array<number>(32).fill(-MAX)]
  const interleaved = Array.from({ length: 32 }, () => [MAX, -MAX]).flat()
  it.each([
    { group: 'positive boundary', amounts: [MAX - 1, 1], expected: MAX },
    { group: 'negative boundary', amounts: [-MAX + 1, -1], expected: -MAX },
    { group: 'positive overflow', amounts: [MAX, 2], expected: null },
    { group: 'negative overflow', amounts: [-MAX, -2], expected: null },
    { group: 'grouped cancellation', amounts: grouped, expected: 0 },
    { group: 'interleaved cancellation', amounts: interleaved, expected: 0 },
  ])('agrees with exact evaluation for $group', async ({ amounts, expected }) => {
    const entries = amounts.map((amount, index) => entry(String(index), amount))
    if (expected === null) expect(refusal(() => Total.evaluate(entries))).toBe('unsafe-integer')
    else expect(Total.evaluate(entries)).toBe(expected)

    const sum = Result.getOrThrow(
      RowsSql.toSql(Total, {
        dialect: 'sqlite',
        sqliteSum: { maxRows: 64, maxAbsContribution: MAX },
      }),
    )
    lite.exec('DELETE FROM entries')
    const insert = lite.prepare('INSERT INTO entries VALUES (?)')
    for (const amount of amounts) insert.run(amount)
    const statement = lite.prepare(`SELECT ${sum.text} AS total FROM entries`)
    const decode = Schema.decodeUnknownSync(Schema.NullOr(Schema.Int))
    expect(decode(statement.get()!['total'])).toBe(expected)
    statement.setReadBigInts(true)
    expect(statement.get()!['total']).toBe(expected === null ? null : BigInt(expected))

    const sumPg = Result.getOrThrow(RowsSql.toSql(Total))
    const result = await pg.query<{ total: unknown }>(
      `SELECT ${sumPg.text} AS total FROM unnest($1::bigint[]) AS entries(amount)`,
      [amounts.map(String)],
    )
    expect(decode(result.rows[0]!.total)).toBe(expected)
  })

  it('cancels a grouped PostgreSQL sum whose intermediate total exceeds int64', async () => {
    const sum = Result.getOrThrow(RowsSql.toSql(Total))
    const result = await pg.query<{ total: number }>(
      `SELECT ${sum.text} AS total FROM (
        SELECT ${MAX}::bigint AS amount FROM generate_series(1, 1025)
        UNION ALL
        SELECT ${-MAX}::bigint AS amount FROM generate_series(1, 1025)
      ) AS entries`,
    )
    expect(result.rows[0]!.total).toBe(0)
  })

  it('binds the SQLite contribution in each occurrence of the sum', () => {
    const incremented = Rows.sum(Entry, row => Num.add(row.amount, 1))
    const sum = Result.getOrThrow(
      RowsSql.toSql(incremented, {
        dialect: 'sqlite',
        sqliteSum: { maxRows: 1, maxAbsContribution: 10 },
      }),
    )
    const statement = lite.prepare(`SELECT ${sum.text} AS total FROM (SELECT 5 AS amount)`)
    expect(statement.get(...sum.params.map(param => Number(param)))!['total']).toBe(6)
  })
})
