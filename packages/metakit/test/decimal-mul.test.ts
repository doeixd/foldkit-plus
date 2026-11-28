/**
 * `num.mulScaled`, the product `Decimal.mul` and `Money.mul` build: exact and
 * half-even in integers, refused where the product of units leaves the safe
 * range, and read by the evaluator, the judge, the checker, the solver and
 * `Rows.sum`. SQL's agreement is in `decimal-mul-parity.test.ts`.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Node, Num, Ord, Path, Verdict, opProperties } from 'metakit'
import * as Rows from 'metakit/aggregates'
import { Decimal, Money } from 'metakit/domain'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'

const MAX = Number.MAX_SAFE_INTEGER
const MAX_BIG = BigInt(MAX)

/** mulberry32: a failing case reproduces. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Written apart from the implementation: the nearest of the two integers
 * around `p / d` by comparing distances, an exact half to the even one.
 */
const reference = (a: number, b: number, shift: number): number | 'refused' => {
  const p = BigInt(a) * BigInt(b)
  if (p > MAX_BIG || p < -MAX_BIG) return 'refused'
  if (shift < 0) {
    const up = p * 10n ** BigInt(-shift)
    return up > MAX_BIG || up < -MAX_BIG ? 'refused' : Number(up)
  }
  const d = 10n ** BigInt(shift)
  let below = p / d
  if (p % d !== 0n && p < 0n) below -= 1n
  const rest = p - below * d
  const nearest =
    2n * rest < d ? below : 2n * rest > d ? below + 1n : below % 2n === 0n ? below : below + 1n
  return Number(nearest)
}

const Pair = Schema.Struct({ a: Schema.Int, b: Schema.Int })
const $ = Path.forSchema(Pair)

/** `a * b` with its third argument replaced: a node the constructor would not build. */
const withShift = (shift: Node.Node): Expr.Expr<typeof Pair.Type, number> => {
  const made = Num.mulScaled($.a, $.b, { shift: 2 })
  const call = made.node
  if (!Node.$is('Call')(call)) throw new Error('not a call')
  return { ...made, node: Node.Call({ op: call.op, args: [call.args[0]!, call.args[1]!, shift] }) }
}
const product = (shift: number) => Num.mulScaled($.a, $.b, { shift })
const outcome = (
  expr: Expr.Expr<typeof Pair.Type, number | null>,
  a: number | null,
  b: number | null,
) => Expr.evalResult(expr, { a, b } as typeof Pair.Type)

describe('evaluation', () => {
  it.each([
    // [a, b, shift, result]: exact halves go to the even neighbour, either side of zero.
    [5, 50, 2, 2],
    [7, 50, 2, 4],
    [-5, 50, 2, -2],
    [-7, 50, 2, -4],
    [1, 50, 2, 0],
    [3, 50, 2, 2],
    [-1, 50, 2, 0],
    [249, 1, 2, 2],
    [251, 1, 2, 3],
    [-251, 1, 2, -3],
    [-249, 1, 2, -2],
    [12, 34, 0, 408],
    [12, 34, -2, 40_800],
    [0, 5, 3, 0],
    [-1, 1, 4, 0],
  ])('%i * %i moved %i places is %i', (a, b, shift, expected) => {
    const result = outcome(product(shift), a, b)
    expect(result).toEqual(Result.succeed(expected))
    // Never a negative zero: SQL has none.
    expect(Object.is(Result.getOrThrow(result), -0)).toBe(false)
  })

  it('is null for a missing operand, and does not take either order to matter', () => {
    const Maybe = Schema.Struct({ a: Schema.NullOr(Schema.Int), b: Schema.NullOr(Schema.Int) })
    const m = Path.forSchema(Maybe)
    const expr = Num.mulScaled(m.a, m.b, { shift: 2 })
    expect(Expr.evalResult(expr, { a: null, b: 4 })).toEqual(Result.succeed(null))
    expect(Expr.evalResult(expr, { a: 4, b: null })).toEqual(Result.succeed(null))
    expect(Expr.evalResult(expr, { a: null, b: null })).toEqual(Result.succeed(null))
  })

  it('refuses a product past the safe range even where the rounded result fits', () => {
    const at = (a: number, b: number, shift: number) => outcome(product(shift), a, b)
    expect(at(MAX, 1, 0)).toEqual(Result.succeed(MAX))
    expect(at(-MAX, 1, 0)).toEqual(Result.succeed(-MAX))
    expect(Result.isFailure(at(MAX, 2, 0))).toBe(true)
    expect(Result.isFailure(at(-MAX, 2, 0))).toBe(true)
    // 100 * MAX is past the range though its result at two places is MAX.
    const past = at(MAX, 100, 2)
    expect(Result.isFailure(past) && past.failure.reason).toBe('unsafe-integer')
    expect(at(MAX, 100, 2)).not.toEqual(Result.succeed(MAX))
    // Moved up, it is the result that leaves the range.
    expect(at(900_719_925_474_099, 10, -1)).toSatisfy(Result.isFailure)
    expect(at(900_719_925_474_099, 1, -1)).toEqual(Result.succeed(9_007_199_254_740_990))
  })

  it('refuses an operand that is not an integer count of units', () => {
    const Loose = Schema.Struct({ a: Schema.Number, b: Schema.Number })
    const l = Path.forSchema(Loose)
    const expr = Num.mulScaled(l.a, l.b, { shift: 1 })
    const reasonOf = (a: number, b: number) => {
      const result = Expr.evalResult(expr, { a, b })
      return Result.isFailure(result) ? result.failure.reason : 'a value'
    }
    expect(reasonOf(0.5, 4)).toBe('ill-typed')
    expect(reasonOf(4, 1.25)).toBe('ill-typed')
    expect(reasonOf(2 ** 60, 1)).toBe('unsafe-integer')
    // Beside a zero the product is in range, so it is the operand that is refused.
    expect(reasonOf(2 ** 60, 0)).toBe('unsafe-integer')
    expect(reasonOf(0, -(2 ** 60))).toBe('unsafe-integer')
    expect(reasonOf(NaN, 4)).toBe('non-finite')
    expect(reasonOf(4, Infinity)).toBe('non-finite')
  })

  it('takes a shift between -12 and 24 and refuses any other when it is built', () => {
    expect(() => Num.mulScaled(1, 1, { shift: 25 })).toThrow(/shift/)
    expect(() => Num.mulScaled(1, 1, { shift: -13 })).toThrow(/shift/)
    expect(() => Num.mulScaled(1, 1, { shift: 1.5 })).toThrow(/shift/)
    expect(Expr.evalResult(Num.mulScaled(10 ** 6, 10 ** 6, { shift: 24 }), {})).toEqual(
      Result.succeed(0),
    )
  })

  it('agrees with a BigInt reference over seeded operands, ties and the boundary included', () => {
    const random = seeded(2026)
    const magnitudes = [10, 1_000, 100_000, 10 ** 8, 10 ** 10, MAX]
    const operand = () => {
      const sign = random() < 0.5 ? -1 : 1
      const top = magnitudes[Math.floor(random() * magnitudes.length)]!
      return sign * Math.floor(random() * top)
    }
    let refused = 0
    let tied = 0
    for (let i = 0; i < 6_000; i++) {
      const shift = Math.floor(random() * 14) - 3
      // Every third case is built to land on an exact half.
      const [a, b] =
        i % 3 === 0 && shift > 0
          ? [Math.floor(random() * 2_000_000) - 1_000_000, 5 * 10 ** (shift - 1)]
          : [operand(), operand()]
      const expected = reference(a, b, shift)
      const got = outcome(product(shift), a, b)
      if (expected === 'refused') {
        refused++
        expect(Result.isFailure(got), `${a} * ${b} at ${shift}`).toBe(true)
        continue
      }
      if (
        shift > 0 &&
        (BigInt(a) * BigInt(b)) % 10n ** BigInt(shift) === 5n * 10n ** BigInt(shift - 1)
      ) {
        tied++
      }
      expect(got, `${a} * ${b} at ${shift}`).toEqual(Result.succeed(expected))
      // The two operands may be given in either order.
      expect(outcome(Num.mulScaled($.b, $.a, { shift }), a, b)).toEqual(got)
    }
    expect(refused).toBeGreaterThan(100)
    expect(tied).toBeGreaterThan(100)
  })
})

const Bill = Schema.Struct({ net: Money.make('USD'), vat: Decimal.make({ scale: 3 }) })

describe('Decimal.mul and Money.mul build the operation', () => {
  const Line = Schema.Struct({
    price: Decimal.make({ scale: 2 }),
    rate: Decimal.make({ scale: 4 }),
    net: Money.make('USD'),
  })

  it('is a core call that every reader can read, not an opaque term', () => {
    const decimal = Expr.in({ row: Line }, ({ row }) =>
      Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
    )
    const money = Expr.in({ row: Line }, ({ row }) =>
      Money.mul(row.net, row.rate, { rateScale: 4 }),
    )
    const opOf = (node: Node.Node) => Node.$is('Call')(node) && node.op.id
    expect(opOf(decimal.node)).toBe('num.mulScaled')
    expect(opOf(money.node)).toBe('num.mulScaled')
    expect(Option.isSome(Expr.reads(decimal))).toBe(true)
    expect(Option.isSome(Expr.reads(money))).toBe(true)
    expect(Expr.show(decimal)).toBe('num.mulScaled(row.price, row.rate, 4)')
    expect(Expr.show(money)).toBe('num.mulScaled(row.net, row.rate, 4)')
  })

  it('refuses where a product of units leaves the safe range', () => {
    const decimal = Expr.in({ row: Line }, ({ row }) =>
      Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
    )
    const row = {
      price: Decimal.units(MAX, 2),
      rate: Decimal.units(10_000, 4),
      net: Money.minor('USD', 1),
    }
    expect(Expr.evalResult(decimal, { row })).toSatisfy(Result.isFailure)
  })

  it('is read by Rows.sum as an integer contribution, and totals it by deltas', () => {
    const total = Rows.sum(Line, $ =>
      Decimal.mul($.price, $.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
    )
    const row = (price: number, rate: number) => ({
      price: Decimal.units(price, 2),
      rate: Decimal.units(rate, 4),
      net: Money.minor('USD', 0),
    })
    // 12.50 * 0.0825 = 1.03125 -> 1.03; 0.50 * 0.0100 = 0.005 -> 0.00 (a tie to even).
    const rows = [row(1250, 825), row(50, 100), row(1000, 2500)]
    expect(total.evaluate(rows)).toBe(103 + 0 + 250)
    let value: number = total.evaluate(rows)
    value += total.deleteDelta(rows[0]!)
    value += total.updateDelta(rows[1]!, row(50, 300))
    value += total.insertDelta(row(7, 5000))
    expect(value).toBe(total.evaluate([row(50, 300), row(1000, 2500), row(7, 5000)]))
    // The amount and rate sum the docs show: 12.35 USD at 0.200.
    const totalVat = Rows.sum(Bill, $ => Money.mul($.net, $.vat, { rateScale: 3 }))
    expect(
      totalVat.evaluate([{ net: Money.minor('USD', 12_35), vat: Decimal.units(200, 3) }]),
    ).toBe(247)
    const loose = Schema.Struct({ n: Schema.Finite, m: Schema.Int })
    expect(() => Rows.sum(loose, $ => Num.mulScaled($.n, $.m, { shift: 2 }))).toThrow(
      /integer-valued/,
    )
  })

  it('judges a held row and leaves an open one open', () => {
    const state = Schema.Struct({
      price: Decimal.make({ scale: 2 }),
      rate: Decimal.make({ scale: 4 }),
    })
    const rule = Expr.in({ row: state }, ({ row }) =>
      Decimal.gt(
        Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
        Decimal.units(100, 2),
      ),
    )
    const held = (price: number, rate: number) =>
      Expr.judge(rule, { row: { price: Decimal.units(price, 2), rate: Decimal.units(rate, 4) } })
    expect(Verdict.isTrue(held(1250, 10_000))).toBe(true)
    expect(Verdict.isFalse(held(50, 100))).toBe(true)
    // A refused product is unknown to the judge, as every refusal is.
    expect(Verdict.isUnknown(held(MAX, 10_000))).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(rule, { row: { price: Decimal.units(1250, 2) } }))).toBe(
      true,
    )
  })
})

describe('the checker', () => {
  const Bounded = Schema.Struct({
    a: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000 })),
    b: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 })),
    c: Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 0 })),
  })
  const f = Path.forSchema(Bounded)
  const mul = (shift: number) => Num.mulScaled(f.a, f.b, { shift })
  const decides = (goal: Expr.Expr<typeof Bounded.Type, boolean | null>) =>
    Abstract.checkInvariant(Bounded, goal)

  it('bounds the result by the rounded interval of the product, which is exact where it can be', () => {
    expect(Verdict.isTrue(decides(Ord.lte(mul(4), 1_000)))).toBe(true)
    expect(Verdict.isTrue(decides(Ord.gte(mul(4), 0)))).toBe(true)
    expect(Verdict.isTrue(decides(Ord.lte(mul(0), 10_000_000)))).toBe(true)
    // 1000 * 10000 at four places is 1000, so 999 does not hold of every row.
    expect(Verdict.isTrue(decides(Ord.lte(mul(4), 999)))).toBe(false)
    expect(Verdict.isTrue(decides(Ord.lte(Num.mulScaled(f.a, 50, { shift: 2 }), 500)))).toBe(true)
    expect(Verdict.isTrue(decides(Ord.lte(Num.mulScaled(f.a, 50, { shift: 2 }), 499)))).toBe(false)
  })

  it('rounds an end that is an exact half to the even integer, either side of zero', () => {
    const half = Schema.Struct({
      a: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
      c: Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 0 })),
    })
    const h = Path.forSchema(half)
    // 1 * 50 at two places is 0.5, which goes to 0 (half-up would give 1, and -1 for the negative).
    const settles = (from: Expr.Expr<typeof half.Type, number | null>) =>
      Verdict.isTrue(Abstract.checkInvariant(half, Eq.is(from, 0)))
    expect(settles(Num.mulScaled(h.a, 50, { shift: 2 }))).toBe(true)
    expect(settles(Num.mulScaled(h.c, 50, { shift: 2 }))).toBe(true)
    // 1 * 51 is past the half, so it rounds up.
    expect(settles(Num.mulScaled(h.a, 51, { shift: 2 }))).toBe(false)
  })

  it('bounds a rounded end by the even neighbour of an exact half, below and above', () => {
    const half = Schema.Struct({
      d: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 150 })),
      c: Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 0 })),
    })
    const h = Path.forSchema(half)
    const proves = (goal: Expr.Expr<typeof half.Type, boolean | null>) =>
      Verdict.isTrue(Abstract.checkInvariant(half, goal))
    // 150 * 1 at two places is 1.5, which goes up to 2, so 1 is not a bound and 2 is.
    expect(proves(Ord.lte(Num.mulScaled(h.d, 1, { shift: 2 }), 1))).toBe(false)
    expect(proves(Ord.lte(Num.mulScaled(h.d, 1, { shift: 2 }), 2))).toBe(true)
    // -50 * 3 at two places is -1.5, which goes down to -2.
    expect(proves(Ord.gte(Num.mulScaled(h.c, 3, { shift: 2 }), -1))).toBe(false)
    expect(proves(Ord.gte(Num.mulScaled(h.c, 3, { shift: 2 }), -2))).toBe(true)
  })

  it('does not say a product moved up has a value when its result may be refused', () => {
    const Big = Schema.Struct({
      a: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX })),
    })
    const g = Path.forSchema(Big)
    const goal = Ord.gte(Num.mulScaled(g.a, 1, { shift: -1 }), 0)
    expect(Verdict.isTrue(Abstract.checkInvariant(Big, goal))).toBe(false)
    expect(Expr.evalResult(Num.mulScaled(g.a, 1, { shift: -1 }), { a: MAX })).toSatisfy(
      Result.isFailure,
    )
  })

  it('does not say a product of fractions has a value, which evaluation refuses', () => {
    const Floats = Schema.Struct({
      x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 10 })),
    })
    const x = Path.forSchema(Floats)
    const goal = Ord.gte(Num.mulScaled(x.x, 2, { shift: 0 }), 0)
    expect(Verdict.isTrue(Abstract.checkInvariant(Floats, goal))).toBe(false)
    expect(Expr.evalResult(Num.mulScaled(x.x, 2, { shift: 0 }), { x: 0.5 })).toSatisfy(
      Result.isFailure,
    )
  })

  it('does not say a product has a value when it may be refused', () => {
    const Wide = Schema.Struct({ a: Schema.Int, b: Schema.Int })
    const w = Path.forSchema(Wide)
    const goal = Ord.gte(Num.mulScaled(w.a, w.b, { shift: 2 }), -MAX)
    // 2^53 * 2^20 is refused, and a refused goal is not true.
    expect(Verdict.isTrue(Abstract.checkInvariant(Wide, goal))).toBe(false)
    // The result at two places is within the range while the product is not.
    const small = Schema.Struct({
      a: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX })),
      b: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
    })
    const s = Path.forSchema(small)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(small, Ord.gte(Num.mulScaled(s.a, s.b, { shift: 2 }), 0)),
      ),
    ).toBe(false)
    expect(Expr.evalResult(Num.mulScaled(s.a, s.b, { shift: 2 }), { a: MAX, b: 100 })).toSatisfy(
      Result.isFailure,
    )
  })
})

describe('the solver', () => {
  const run = Effect.runPromise
  const Small = Schema.Struct({
    a: Schema.Int.check(Schema.isBetween({ minimum: -1_000, maximum: 1_000 })),
  })
  const s = Path.forSchema(Small)
  const half = Num.mulScaled(s.a, 50, { shift: 2 })

  it('proves a half-even answer, ties either side of zero, in exact integers', async () => {
    for (const [a, expected] of [
      [5, 2],
      [7, 4],
      [-5, -2],
      [-7, -4],
      [1, 0],
    ] as const) {
      const goal = Expr.implies(Eq.is(s.a, a), Eq.is(half, expected))
      expect(Verdict.isTrue(await run(Prove.invariant(Small, goal))), `${a}`).toBe(true)
    }
  }, 60_000)

  it('proves a bound the intervals cannot, and refutes a wrong tie with a witness that replays', async () => {
    const bound = Ord.lte(Num.add(half, half), Num.add(s.a, 1))
    expect(Verdict.isTrue(await run(Prove.invariant(Small, bound)))).toBe(true)
    const wrong = Expr.implies(Eq.is(s.a, 5), Eq.is(half, 3))
    const verdict = await run(Prove.invariant(Small, wrong))
    expect(Verdict.isFalse(verdict)).toBe(true)
    expect(Verdict.isFalse(verdict) && Option.isSome(verdict.witness)).toBe(true)
  }, 60_000)

  it('refutes a goal a refused product breaks, and does not read a fraction as an integer', async () => {
    const Wide = Schema.Struct({
      a: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      b: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    })
    const w = Path.forSchema(Wide)
    const verdict = await run(
      Prove.invariant(Wide, Ord.gte(Num.mulScaled(w.a, w.b, { shift: 2 }), 0)),
    )
    expect(Verdict.isFalse(verdict)).toBe(true)
    const Floats = Schema.Struct({ x: Schema.Finite })
    const x = Path.forSchema(Floats)
    const undecided = await run(
      Prove.invariant(Floats, Ord.gte(Num.mulScaled(x.x, 2, { shift: 1 }), -1)),
    )
    expect(Verdict.isUnknown(undecided)).toBe(true)
  }, 60_000)
})

describe('SQL lowering refuses by name what it cannot state exactly', () => {
  it('lowers over Int columns and refuses a column that is not known to be an integer', () => {
    const known = Sql.toWhere(
      Expr.in({ row: Pair }, ({ row }) => Ord.gt(Num.mulScaled(row.a, row.b, { shift: 2 }), 0)),
    )
    expect(Result.isSuccess(known)).toBe(true)
    const Loose = Schema.Struct({ a: Schema.Finite, b: Schema.Int })
    const loose = Sql.toWhere(
      Expr.in({ row: Loose }, ({ row }) => Ord.gt(Num.mulScaled(row.a, row.b, { shift: 2 }), 0)),
    )
    expect(Result.isFailure(loose) && loose.failure.reason).toMatch(/num\.mulScaled needs operands/)
  })

  it('lowers a product of products', () => {
    const nested = Sql.toWhere(
      Expr.in({ row: Pair }, ({ row }) =>
        Ord.gt(Num.mulScaled(Num.mulScaled(row.a, row.b, { shift: 1 }), row.b, { shift: 1 }), 0),
      ),
    )
    expect(Result.isSuccess(nested)).toBe(true)
  })

  it('refuses a call whose shift is not a literal number of places', () => {
    const bad = Sql.toWhere(
      Ord.gt(withShift(Node.Path({ segments: ['a'], ast: Option.none() })), 0),
    )
    expect(Result.isFailure(bad) && bad.failure.reason).toMatch(/shift is not a literal/)
  })
})

describe('a call built outside the constructor', () => {
  it('is refused in evaluation where its shift is not a number of places', () => {
    const at = (shift: unknown) =>
      Expr.evalResult(withShift(Node.Lit({ value: shift })), { a: 3, b: 4 })
    expect(at(2)).toEqual(Result.succeed(0))
    for (const shift of [25, -13, 1.5, '2']) {
      const result = at(shift)
      expect(Result.isFailure(result) && result.failure.reason, String(shift)).toBe('ill-typed')
    }
  })
})

describe('what is declared of it', () => {
  it('declares no algebraic property: none can be stated per call, and no reader would read one', () => {
    expect(opProperties['num.mulScaled']).toEqual({})
  })
})
