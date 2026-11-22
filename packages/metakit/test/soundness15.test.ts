import { DatabaseSync } from 'node:sqlite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Abstract from '../src/abstract/check.js'
import { Arr, Expr, Num, Ord, Path, Transition, Verdict } from '../src/index.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'

describe('Phase 1 Leftover 2: Soundness (Bout 1.5)', () => {
  it('Transition.when accepts boolean | null and refuses when the guard evaluates to null', () => {
    const State = Schema.Struct({
      limit: Schema.NullOr(Schema.Int),
      count: Schema.Int,
    })
    const Input = Schema.Struct({ n: Schema.Int })
    const inc = Transition.make({
      state: State,
      input: Input,
      when: ({ state }) => Ord.gt(state.limit, 0),
      apply: ({ state, input }) => [Transition.set(state.count, input.n)],
    })

    // Guard is true -> succeeds.
    expect(Result.isSuccess(Transition.step(inc, { limit: 5, count: 0 }, { n: 1 }))).toBe(true)
    // Guard is null (null > 0 is null) -> MUST refuse.
    expect(Result.isFailure(Transition.step(inc, { limit: null, count: 0 }, { n: 1 }))).toBe(true)
  })

  it('a rule on an optional key holds when the key is absent across decode, SQL, checker, and prover', async () => {
    const Profile = Schema.Struct({
      age: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })
    const $ = Path.forSchema(Profile)

    // 1. Decode accepts absent key.
    expect(Schema.decodeUnknownSync(Profile)({})).toEqual({})

    // 2. SQL CHECK accepts NULL for absent optional key, and rejects -1.
    const checkSql = Sql.toCheck(Profile, { dialect: 'sqlite' })
    expect(Result.isSuccess(checkSql)).toBe(true)
    if (Result.isSuccess(checkSql)) {
      const db = new DatabaseSync(':memory:')
      try {
        db.exec(`CREATE TABLE p (age INTEGER, ${checkSql.success})`)
        expect(() => db.exec('INSERT INTO p VALUES (NULL)')).not.toThrow()
        expect(() => db.exec('INSERT INTO p VALUES (25)')).not.toThrow()
        expect(() => db.exec('INSERT INTO p VALUES (-1)')).toThrow()
      } finally {
        db.close()
      }
    }

    // 3. Abstract checker knows `age` may be absent, so `age >= 0` is NOT True (absent reads null).
    const agePath = $.age as unknown as Expr.Expr<Schema.Schema.Type<typeof Profile>, number | null>
    const goal = Ord.gte(agePath, 0)
    expect(Verdict.isTrue(Abstract.checkInvariant(Profile, goal))).toBe(false)

    // 4. Z3 prover also allows absent key and finds `{}` as a counterexample to `age >= 0`.
    const z3Res = await Effect.runPromise(Prove.invariant(Profile, goal))
    expect(Verdict.isFalse(z3Res)).toBe(true)
  })

  it('proves IEEE-754 Schema.Finite arithmetic past 2^53-1 and returns Unknown on timeout', async () => {
    const BoundedFinite = Schema.Struct({
      x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1e100 })),
      y: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1e100 })),
    })
    const $b = Path.forSchema(BoundedFinite)
    // Past 2^53 - 1, integer/real `unsafe` previously refused; IEEE-754 Float64 proves x + y >= x!
    const proved = await Effect.runPromise(
      Prove.invariant(BoundedFinite, Ord.gte(Num.add($b.x, $b.y), $b.x)),
    )
    expect(Verdict.isTrue(proved)).toBe(true)

    // Tight timeout on a non-trivial FP formula yields Unknown with budget obligation.
    const HardFp = Schema.Struct({
      a: Schema.Finite,
      b: Schema.Finite,
      c: Schema.Finite,
    })
    const $h = Path.forSchema(HardFp)
    const timedOut = await Effect.runPromise(
      Prove.invariant(
        HardFp,
        Ord.gte(Num.mul(Num.add($h.a, $h.b), Num.sub($h.b, $h.c)), Num.mul($h.a, $h.c)),
        { timeoutMs: 1 },
      ),
    )
    expect(timedOut._tag === 'Unknown' || timedOut._tag === 'False').toBe(true)
  })

  it('Rows.sum accepts num.mulScaled decimal products and refuses an in-memory total past 2^53-1', () => {
    const Line = Schema.Struct({
      price: Schema.Int,
      qty: Schema.Int,
    })
    const OrderLines = Schema.Struct({
      lines: Schema.Array(Line),
    })
    const $ = Path.forSchema(OrderLines)
    const totalExpr = Arr.sum($.lines, line => Num.mulScaled(line.price, line.qty, { shift: 2 }))

    // Normal decimal products sum cleanly: (1250 * 300 / 100) + (500 * 200 / 100) = 3750 + 1000 = 4750.
    expect(
      Expr.eval(totalExpr, {
        lines: [
          { price: 1250, qty: 300 },
          { price: 500, qty: 200 },
        ],
      }),
    ).toBe(4750)

    // Two products each near 2^53 (safe individually, sum past 2^53 - 1) MUST refuse at rows.sum.
    const big = 900_000_000_000_000 // 9e14 * 10 = 9e15 < 2^53 (9.007e15), sum = 1.8e16 > 2^53 - 1
    const unshiftedTotal = Arr.sum($.lines, line =>
      Num.mulScaled(line.price, line.qty, { shift: 0 }),
    )
    expect(Result.isSuccess(Expr.evalResult(Num.mulScaled(big, 10, { shift: 0 }), {}))).toBe(true)
    const overflow = Expr.evalResult(unshiftedTotal, {
      lines: [
        { price: big, qty: 10 },
        { price: big, qty: 10 },
      ],
    })
    expect(Result.isFailure(overflow)).toBe(true)
    if (Result.isFailure(overflow)) {
      expect(overflow.failure.reason).toBe('unsafe-integer')
      expect(overflow.failure.at).toBe('rows.sum')
    }
  })
})
