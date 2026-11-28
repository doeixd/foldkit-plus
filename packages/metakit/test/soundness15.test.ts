import { DatabaseSync } from 'node:sqlite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Abstract from '../src/abstract/check.js'
import { Arr, Bool, Eq, Expr, Null, Num, Ord, Path, Transition, Verdict } from '../src/index.js'
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

  it('matches Float64 arithmetic refusals and reports its solver budget', async () => {
    const BoundedFinite = Schema.Struct({
      x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1e100 })),
      y: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1e100 })),
    })
    const $b = Path.forSchema(BoundedFinite)
    const increasing = Ord.gte(Num.add($b.x, $b.y), $b.x)
    expect(Result.isFailure(Expr.evalResult(increasing, { x: 2 ** 60, y: 1 }))).toBe(true)
    const checked = await Effect.runPromise(Prove.invariant(BoundedFinite, increasing))
    expect(
      Verdict.isFalse(checked),
      Verdict.isUnknown(checked) ? checked.reason : 'unsafe operand',
    ).toBe(true)

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

    // C1: Float64 equality equates -0 and +0, so -x != x MUST NOT be proved True (x = 0 is a counterexample).
    const OneFinite = Schema.Struct({ x: Schema.Finite })
    const $f = Path.forSchema(OneFinite)
    const negEq = await Effect.runPromise(Prove.invariant(OneFinite, Eq.isNot(Num.neg($f.x), $f.x)))
    expect(Verdict.isFalse(negEq)).toBe(true)

    // C2: Schema.Number >= 0 admits Infinity, so x + 0 >= 0 MUST NOT be proved True.
    const NonNegWithInf = Schema.Struct({
      x: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    })
    const $inf = Path.forSchema(NonNegWithInf)
    const withInf = await Effect.runPromise(
      Prove.invariant(NonNegWithInf, Ord.gte(Num.add($inf.x, 0), 0)),
    )
    expect(Verdict.isTrue(withInf)).toBe(false)

    // M1: If (min/max/abs) and Null.coalesce work over Schema.Finite (ZFP).
    const NullableFinite = Schema.Struct({
      x: Schema.NullOr(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1e100 }))),
    })
    const $nf = Path.forSchema(NullableFinite)
    const coalesced = await Effect.runPromise(
      Prove.invariant(NullableFinite, Ord.gte(Null.coalesce($nf.x, 0), 0)),
    )
    expect(Verdict.isTrue(coalesced)).toBe(true)
    const absFinite = await Effect.runPromise(
      Prove.invariant(BoundedFinite, Ord.gte(Num.abs($b.x), 0)),
    )
    expect(Verdict.isTrue(absFinite)).toBe(true)

    // H2: NullOr-level refinement rejecting null MUST NOT be bypassed in SQL CHECK or Z3.
    const NonNullViaRefine = Schema.Struct({
      x: Schema.NullOr(Schema.Int).pipe(Expr.refine(x => Bool.not(Null.isNull(x)))),
    })
    const nonNullSql = Sql.toCheck(NonNullViaRefine, { dialect: 'sqlite' })
    expect(Result.isSuccess(nonNullSql)).toBe(true)
    if (Result.isSuccess(nonNullSql)) {
      const db = new DatabaseSync(':memory:')
      try {
        db.exec(`CREATE TABLE nn (x INTEGER, ${nonNullSql.success})`)
        expect(() => db.exec('INSERT INTO nn VALUES (NULL)')).toThrow()
        expect(() => db.exec('INSERT INTO nn VALUES (1)')).not.toThrow()
      } finally {
        db.close()
      }
    }
    const $nn = Path.forSchema(NonNullViaRefine)
    const z3NonNull = await Effect.runPromise(
      Prove.invariant(NonNullViaRefine, Bool.not(Null.isNull($nn.x))),
    )
    expect(Verdict.isTrue(z3NonNull)).toBe(true)

    // H3: Z3 num.div / num.rem refuse unsafe integer literal dividend (1e20).
    const Empty = Schema.Struct({})
    const unsafeDiv = await Effect.runPromise(
      Prove.invariant(Empty, Eq.is(Num.div(1e20, 100_000, { rounding: 'floor' }), 1e15)),
    )
    expect(Verdict.isTrue(unsafeDiv)).toBe(false)

    // M3: Z3 arr.has refuses literal array containing NaN.
    const nanHas = await Effect.runPromise(
      Prove.invariant(Empty, Bool.not(Arr.has([Number.NaN], 1))),
    )
    expect(Verdict.isTrue(nanHas)).toBe(false)
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
