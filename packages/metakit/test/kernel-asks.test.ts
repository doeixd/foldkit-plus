/**
 * Three asks of the kernel: `Transition.commutes` reads negation, `Transition.step`
 * runs a transition that calls a foreign operation, and an integer total is
 * refused past the safe range wherever it is kept.
 */
import { PGlite } from '@electric-sql/pglite'
import { DatabaseSync } from 'node:sqlite'
import { Result, Schema } from 'effect'
import { afterAll, describe, expect, it } from 'vitest'
import { Arr, Expr, Node, Num, Ord, Path, Transition, Verdict } from 'metakit'
import * as Rows from 'metakit/aggregates'
import * as RowsSql from 'metakit/aggregates/sql'
import { call } from 'metakit/build'
import * as Machine from 'metakit/machine'

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

const double = Node.foreign({ id: 'app.double', version: 1, returns: 'number', nulls: 'strict' })
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
  const rows = [entry('a', MAX - 1), entry('b', 1), entry('c', 1)]
  const sum = Result.getOrThrow(RowsSql.toSql(Total, { dialect: 'sqlite' }))
  const sumPg = Result.getOrThrow(RowsSql.toSql(Total))
  const lite = new DatabaseSync(':memory:')
  lite.exec(`CREATE TABLE "entries" ("id" TEXT PRIMARY KEY, "amount" INTEGER NOT NULL)`)
  const pg = new PGlite()
  afterAll(async () => {
    lite.close()
    await pg.close()
  })

  it('disagrees with memory: SQLite and Postgres answer past 2^53 where memory refuses', async () => {
    expect(refusal(() => Total.evaluate(rows))).toBe('unsafe-integer')
    await pg.exec(`CREATE TABLE "entries" ("id" TEXT PRIMARY KEY, "amount" BIGINT NOT NULL)`)
    for (const row of rows) {
      lite.prepare(`INSERT INTO "entries" VALUES (?, ?)`).run(row.id, row.amount)
      await pg.query(`INSERT INTO "entries" VALUES ($1, $2)`, [row.id, row.amount])
    }
    // The driver reads an integer past 2^53 only as a bigint: it too refuses it as a number.
    const statement = lite.prepare(`SELECT ${sum.text} AS total FROM "entries"`)
    expect(() => statement.get(...(sum.params as ReadonlyArray<never>))).toThrow(RangeError)
    statement.setReadBigInts(true)
    const answered = statement.get(...(sum.params as ReadonlyArray<never>)) as { total: bigint }
    const answeredPg = await pg.query<{ total: number }>(
      `SELECT ${sumPg.text} AS total FROM "entries"`,
      [...sumPg.params],
    )
    // Neither raises: SQLite sums int64 exactly and Postgres sums bigint as numeric.
    expect(answered.total).toBe(BigInt(MAX) + 1n)
    expect(answeredPg.rows[0]!.total).toBe(MAX + 1)
  })
})
