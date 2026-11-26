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
      columns: { price: 'price' },
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
})
