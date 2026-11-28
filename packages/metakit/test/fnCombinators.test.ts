import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Eq from '../src/ops/eq.js'
import * as Fn from '../src/fn.js'
import * as Num from '../src/ops/num.js'
import * as Path from '../src/path.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'
import * as Verdict from '../src/verdict.js'

const NonNegInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const BoundedInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))

describe('metakit/fn composition & combinators', () => {
  it('composes unary functions with andThen / compose, propagating where, returns, and ensures into Z3 Prove.fn', async () => {
    const double = Fn.params({ x: BoundedInt })
      .returns(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2000 })))
      .ensures(({ params, result }) => Num.gte(result, params.x))
      .body(({ x }) => Num.mul(x, 2))

    const addTen = Fn.params({
      y: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2000 })),
    })
      .where(({ y }) => Num.gte(y, 10))
      .returns(Schema.Int.check(Schema.isBetween({ minimum: 20, maximum: 2010 })))
      .ensures(({ params, result }) => Num.gt(result, params.y))
      .body(({ y }) => Num.add(y, 10))

    const pipeline = double.andThen(addTen)

    expect(pipeline.run({ x: 5 })).toBe(20)
    expect(Result.isSuccess(pipeline.runChecked({ x: 5 }))).toBe(true)
    expect(Result.isFailure(pipeline.runChecked({ x: 2 }))).toBe(true) // 2*2 = 4 < 10 violates addTen's where

    // Proves returnSchema + rewritten ensures in Z3!
    const proof = await Effect.runPromise(Prove.fn(pipeline))
    expect(Verdict.isTrue(proof)).toBe(true)
  })

  it('supports multi-parameter Fn.compose with explicit mapper', () => {
    const subtotal = Fn.make({ price: NonNegInt, qty: NonNegInt }, ({ price, qty }) =>
      Num.mul(price, qty),
    )
    const addShipping = Fn.make({ base: NonNegInt, flatFee: NonNegInt }, ({ base, flatFee }) =>
      Num.add(base, flatFee),
    )
    const orderTotal = Fn.compose(subtotal, addShipping, (out, { qty }) => ({
      base: out,
      flatFee: Num.mul(qty, 5),
    }))

    expect(orderTotal.run({ price: 20, qty: 3 })).toBe(75)
  })

  it('specializes parameters via partial(), keeps contracts, and lowers cleanly to SQL', async () => {
    const applyDiscount = Fn.params({ price: BoundedInt, off: BoundedInt })
      .where(({ price, off }) => Num.gte(price, off))
      .returns(NonNegInt)
      .ensures(({ params, result }) => Num.lte(result, params.price))
      .body(({ price, off }) => Num.sub(price, off))

    const tenOff = applyDiscount.partial({ off: 10 })

    expect(Object.keys(tenOff.params)).toEqual(['price'])
    expect(tenOff.run({ price: 50 })).toBe(40)
    expect(Result.isFailure(tenOff.runChecked({ price: 5 }))).toBe(true) // violates price >= 10
    expect(Result.isSuccess(tenOff.runChecked({ price: 10 }))).toBe(true)

    const proof = await Effect.runPromise(Prove.fn(tenOff))
    expect(Verdict.isTrue(proof)).toBe(true)

    // Lowers straight to SQL with zero new CoreOpIds
    const Row = Schema.Struct({ price: BoundedInt })
    const { row } = Path.forEnv({ row: Row })
    const whereSql = Sql.toWhere(Num.gte(tenOff({ price: row.price }), 25), {
      dialect: 'postgres',
    })
    expect(Result.isSuccess(whereSql)).toBe(true)
  })

  it('supports map and contramap profunctor adapters', () => {
    const inc = Fn.make({ n: Schema.Int }, ({ n }) => Num.add(n, 1))
    const incThenNegate = inc.map(res => Num.neg(res))
    expect(incThenNegate.run({ n: 4 })).toBe(-5)

    const adapted = Fn.contramap(inc, { count: Schema.Int }, ({ count }) => ({ n: count }))
    expect(adapted.run({ count: 9 })).toBe(10)
  })

  it('combines boolean predicates with and, or, not, implies and branches with ifElse', () => {
    const isPositive = Fn.make({ x: Schema.Int }, ({ x }) => Num.gt(x, 0))
    const isSmall = Fn.make({ x: Schema.Int }, ({ x }) => Num.lte(x, 10))
    const isZero = Fn.make({ x: Schema.Int }, ({ x }) => Eq.is(x, 0))

    const inRange = Fn.and(isPositive, isSmall)
    const nonNegSmall = Fn.or(inRange, isZero)
    const notPositive = Fn.not(isPositive)
    const imp = Fn.implies(inRange, isPositive)

    expect(inRange.run({ x: 5 })).toBe(true)
    expect(inRange.run({ x: 0 })).toBe(false)
    expect(nonNegSmall.run({ x: 0 })).toBe(true)
    expect(notPositive.run({ x: -1 })).toBe(true)
    expect(imp.run({ x: 5 })).toBe(true)
    expect(imp.run({ x: -3 })).toBe(true)

    const absFn = Fn.ifElse(
      isPositive,
      Fn.make({ x: Schema.Int }, ({ x }) => x),
      Fn.make({ x: Schema.Int }, ({ x }) => Num.neg(x)),
    )
    expect(absFn.run({ x: 7 })).toBe(7)
    expect(absFn.run({ x: -7 })).toBe(7)
  })

  it('supports identity, constant, and static iterate(f, n)', () => {
    const id = Fn.identity(Schema.Int)
    expect(id.run({ value: 42 })).toBe(42)

    const c = Fn.constant({ x: Schema.Int }, 99)
    expect(c.run({ x: 1 })).toBe(99)

    const step = Fn.make({ x: Schema.Int }, ({ x }) => Num.add(Num.mul(x, 2), 1))
    expect(Fn.iterate(step, 0).run({ x: 3 })).toBe(3)
    expect(Fn.iterate(step, 1).run({ x: 3 })).toBe(7)
    expect(Fn.iterate(step, 3).run({ x: 1 })).toBe(15) // 1 -> 3 -> 7 -> 15
    expect(() => Fn.iterate(step, -1)).toThrow(/non-negative integer/)
  })

  it('validates fixed values in partial, rejects conflicting shared param schemas, and short-circuits untaken ifElse preconditions', () => {
    const applyDiscount = Fn.params({ price: BoundedInt, off: BoundedInt }).body(({ price, off }) =>
      Num.sub(price, off),
    )
    expect(() => applyDiscount.partial({ off: -5 })).toThrow(
      /does not satisfy its parameter Schema/,
    )

    const f1 = Fn.make({ x: Schema.Int }, ({ x }) => Num.gt(x, 0))
    const f2 = Fn.make({ x: NonNegInt }, ({ x }) => Num.lte(x, 10))
    expect(() => Fn.and(f1, f2)).toThrow(/conflicting parameter Schemas/)

    // Untaken branch's `where` divides by `x`: must NOT evaluate when `x === 0`
    const isPos = Fn.make({ x: Schema.Int }, ({ x }) => Num.gt(x, 0))
    const divBranch = Fn.params({ x: Schema.Int })
      .where(({ x }) => Num.gt(Num.div(100, x, { rounding: 'toward-zero', onZero: 'refuse' }), 0))
      .body(({ x }) => Num.div(100, x, { rounding: 'toward-zero', onZero: 'refuse' }))
    const fallback = Fn.make({ x: Schema.Int }, () => 0)

    const safe = Fn.ifElse(isPos, divBranch, fallback)
    expect(Result.getOrThrow(safe.runChecked({ x: 0 }))).toBe(0)
    expect(Result.getOrThrow(safe.runChecked({ x: 4 }))).toBe(25)
  })

  it('preserves intermediate returnSchema, ensures, and narrower param Schema obligations across compose, map, and Prove.fn (#648 P0)', async () => {
    const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

    // 1. First fn violates its returnSchema, second fn ignores its input -> compose must still fail & Prove.fn must refute!
    const badReturn = Fn.params({ x: BoundedInt })
      .returns(NonNegInt)
      .body(({ x }) => Num.sub(x, 10))
    const ignoreInput = Fn.constant({ y: Schema.Int }, 42)
    const pipeBadRet = Fn.compose(badReturn, ignoreInput)

    const retRes = pipeBadRet.runChecked({ x: 5 })
    expect(Result.isFailure(retRes)).toBe(true)
    if (Result.isFailure(retRes)) expect(retRes.failure.phase).toBe('returns')
    expect(Verdict.isFalse(await Effect.runPromise(Prove.fn(pipeBadRet)))).toBe(true)

    // 2. First fn violates its ensures, second fn ignores its input -> compose must fail & Prove.fn must refute!
    const badEnsures = Fn.make({ x: BoundedInt }, ({ x }) => x).ensures(({ params, result }) =>
      Num.gt(result, params.x),
    )
    const pipeBadEns = badEnsures.andThen(ignoreInput)

    const ensRes = pipeBadEns.runChecked({ x: 5 })
    expect(Result.isFailure(ensRes)).toBe(true)
    if (Result.isFailure(ensRes)) expect(ensRes.failure.phase).toBe('ensures')
    expect(Verdict.isFalse(await Effect.runPromise(Prove.fn(pipeBadEns)))).toBe(true)

    // 3. Second fn has narrower param Schema (PositiveInt) while first fn can return -1 -> fail with phase: 'params' & refute!
    const producesNeg = Fn.make({ x: BoundedInt }, ({ x }) => Num.sub(x, 10))
    const needsPos = Fn.make({ y: PositiveInt }, ({ y }) => y)
    const pipeBadParam = producesNeg.andThen(needsPos)

    const paramRes = pipeBadParam.runChecked({ x: 5 })
    expect(Result.isFailure(paramRes)).toBe(true)
    if (Result.isFailure(paramRes)) expect(paramRes.failure.phase).toBe('params')
    expect(Verdict.isFalse(await Effect.runPromise(Prove.fn(pipeBadParam)))).toBe(true)

    // 4. map() preserves intermediate return/ensures obligations too!
    const mappedBad = badReturn.map(() => 99)
    const mapRes = mappedBad.runChecked({ x: 5 })
    expect(Result.isFailure(mapRes)).toBe(true)
    if (Result.isFailure(mapRes)) expect(mapRes.failure.phase).toBe('returns')
    expect(Verdict.isFalse(await Effect.runPromise(Prove.fn(mappedBad)))).toBe(true)
  })

  it('handles nullable ifElse condition without triggering untaken branch where/obligations and widens return type with null (#648 P0)', () => {
    const nullableCond = Fn.make({ flag: Schema.NullOr(Schema.Boolean) }, ({ flag }) => flag)
    const posOnly = Fn.params({ x: Schema.Int })
      .where(({ x }) => Num.gt(x, 0))
      .returns(NonNegInt)
      .body(({ x }) => x)
    const negOnly = Fn.params({ x: Schema.Int })
      .where(({ x }) => Num.lt(x, 0))
      .returns(NonNegInt)
      .body(({ x }) => Num.neg(x))

    const branched = Fn.ifElse(nullableCond, posOnly, negOnly)

    // When flag === null, neither branch runs -> returns null cleanly instead of failing `where`!
    expect(branched.runChecked({ flag: null, x: 0 })).toEqual(Result.succeed(null))
    expect(branched.runChecked({ flag: true, x: 5 })).toEqual(Result.succeed(5))
    expect(branched.runChecked({ flag: false, x: -5 })).toEqual(Result.succeed(5))
    expect(Result.isFailure(branched.runChecked({ flag: true, x: -5 }))).toBe(true)
    expect(Result.isFailure(branched.runChecked({ flag: false, x: 5 }))).toBe(true)

    // Compile-time check: nullable condition widens output to `number | null`, not `number`.
    const checkNullable: number | null = branched.run({ flag: null, x: 0 })
    expect(checkNullable).toBeNull()
    // @ts-expect-error nullable ifElse result cannot be assigned to non-null number
    const _mustFailNonNull: number = branched.run({ flag: null, x: 0 })
    void _mustFailNonNull
  })

  it('rejects unsound return schemas and incompatible compositions at compile time (#648 P0)', () => {
    const _typechecks = () => {
      Fn.params({ x: Schema.Int })
        .returns(Schema.String)
        // @ts-expect-error number body is not compatible with Schema.String return
        .body(({ x }) => x)

      Fn.params({ x: Schema.Int })
        .returns(Schema.Int)
        // @ts-expect-error nullable division result cannot silently strip null
        .body(({ x }) => Num.div(x, 0, { rounding: 'floor', onZero: 'null' }))

      Fn.make({ x: Schema.Int }, ({ x }) => x).returns(
        // @ts-expect-error cannot cast number Fn to Schema.String
        Schema.String,
      )

      Fn.make({ x: Schema.Int }, ({ x }) =>
        Num.div(x, 0, { rounding: 'floor', onZero: 'null' }),
      ).returns(
        // @ts-expect-error cannot strip null from number | null via returns(Schema.Int)
        Schema.Int,
      )

      Fn.make({ s: Schema.String }, ({ s }) => s).returns(
        // @ts-expect-error cannot silently narrow arbitrary string to literal union
        Schema.Literals(['a', 'b']),
      )

      const strFn = Fn.make({ x: Schema.Int }, () => 'hello')
      const intFn = Fn.make({ y: Schema.Int }, ({ y }) => y)
      // @ts-expect-error cannot compose string-returning Fn into Int-taking Fn
      Fn.compose(strFn, intFn)
      // @ts-expect-error cannot chain string-returning Fn into Int-taking Fn via andThen
      strFn.andThen(intFn)
    }
    expect(typeof _typechecks).toBe('function')
  })
})
