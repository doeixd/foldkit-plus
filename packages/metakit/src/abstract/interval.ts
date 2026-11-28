/**
 * Interval abstract domain `[lo, hi]` with sound forward transformers for
 * numeric operators and Kleene $K_3$ comparison verdicts.
 *
 * Every transformer satisfies Galois soundness over doubles:
 *   ∀ x ∈ γ(a), f(x) ∈ γ(f#(a))
 * since IEEE rounding is monotone, so the rounded bound of a sum or product
 * still bounds every rounded sum or product inside.
 */
import { Option } from 'effect'
import * as Verdict from '../verdict.js'

export interface Interval {
  readonly lo: number
  readonly hi: number
}

const norm = (n: number): number => (Object.is(n, -0) ? 0 : n)

const bits = new DataView(new ArrayBuffer(8))

/**
 * The least double above `n`: `x > n` is `x >= nextUp(n)` over doubles. Both
 * zeros step to the least subnormal, the largest finite double to +∞, and NaN
 * and +∞ stay as they are.
 */
export const nextUp = (n: number): number => {
  if (Number.isNaN(n) || n === Infinity) return n
  if (n === 0) return Number.MIN_VALUE
  bits.setFloat64(0, n)
  const at = bits.getBigUint64(0)
  // A double's bits, read as an integer, order positive doubles upward and negative ones downward.
  bits.setBigUint64(0, n > 0 ? at + 1n : at - 1n)
  return norm(bits.getFloat64(0))
}

/** The greatest double below `n`: `x < n` is `x <= nextDown(n)` over doubles. */
export const nextDown = (n: number): number => norm(-nextUp(-n))

/** Unbounded interval `[-∞, +∞]`. */
export const top: Interval = Object.freeze({ lo: -Infinity, hi: Infinity })

/** Empty interval (contradiction). */
export const bottom: Interval = Object.freeze({ lo: 1, hi: -1 })

export const isBottom = (iv: Interval): boolean =>
  iv.lo > iv.hi || Number.isNaN(iv.lo) || Number.isNaN(iv.hi)

export const between = (lo: number, hi: number): Interval => {
  const l = norm(lo)
  const h = norm(hi)
  return Number.isNaN(l) || Number.isNaN(h) || l > h ? bottom : { lo: l, hi: h }
}

export const constant = (value: number): Interval => {
  const v = norm(value)
  return Number.isNaN(v) ? top : { lo: v, hi: v }
}

export const contains = (iv: Interval, value: number): boolean =>
  !isBottom(iv) && value >= iv.lo && value <= iv.hi

/** Whether every value of `inner` is one of `outer`; an empty `inner` is within anything. */
export const within = (inner: Interval, outer: Interval): boolean =>
  isBottom(inner) || (!isBottom(outer) && inner.lo >= outer.lo && inner.hi <= outer.hi)

/** Intersection (greatest lower bound). */
export const meet = (a: Interval, b: Interval): Interval => {
  if (isBottom(a) || isBottom(b)) return bottom
  return between(Math.max(a.lo, b.lo), Math.min(a.hi, b.hi))
}

/** Hull (least upper bound). */
export const join = (a: Interval, b: Interval): Interval => {
  if (isBottom(a)) return b
  if (isBottom(b)) return a
  return between(Math.min(a.lo, b.lo), Math.max(a.hi, b.hi))
}

/** At least one unit in the last place of `n`: how far a rounded result may sit from the exact one. */
const ulp = (n: number): number => Math.abs(n) * Number.EPSILON + Number.MIN_VALUE

/**
 * `a + b` rounded away from the exact sum in direction `toward` (-1 down, 1
 * up), so a bound stays a bound of the real sum as well as of the double.
 * The error term of Knuth's TwoSum says which side the double fell on.
 */
export const directedAdd = (a: number, b: number, toward: -1 | 1): number => {
  const sum = a + b
  if (Number.isNaN(sum)) return toward * Infinity
  if (!Number.isFinite(sum)) return sum
  const bPart = sum - a
  const error = a - (sum - bPart) + (b - bPart)
  return norm(error * toward > 0 ? sum + toward * ulp(sum) : sum)
}

export const add = (a: Interval, b: Interval): Interval => {
  if (isBottom(a) || isBottom(b)) return bottom
  return between(directedAdd(a.lo, b.lo, -1), directedAdd(a.hi, b.hi, 1))
}

export const neg = (a: Interval): Interval => {
  if (isBottom(a)) return bottom
  return between(-a.hi, -a.lo)
}

export const sub = (a: Interval, b: Interval): Interval => add(a, neg(b))

/**
 * The result of an operation that is monotone in each argument, in the
 * direction given for it: the low end from the operands' ends those
 * directions pick for a low result, the high end likewise. `at` computes one
 * end from the chosen operand ends, rounded away from the exact result
 * toward `toward`.
 */
export const monotone =
  (
    directions: ReadonlyArray<'up' | 'down'>,
    at: (ends: ReadonlyArray<number>, toward: -1 | 1) => number,
  ) =>
  (args: ReadonlyArray<Interval>): Interval => {
    if (args.some(isBottom)) return bottom
    const end = (toward: -1 | 1): number =>
      at(
        args.map((iv, index) => ((directions[index] === 'up') === (toward === -1) ? iv.lo : iv.hi)),
        toward,
      )
    return between(end(-1), end(1))
  }

const safeMul = (x: number, y: number): Option.Option<number> => {
  if (x === 0 || y === 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Option.none()
    return Option.some(0)
  }
  const prod = x * y
  return Number.isNaN(prod) ? Option.none() : Option.some(norm(prod))
}

export const mul = (a: Interval, b: Interval): Interval => {
  if (isBottom(a) || isBottom(b)) return bottom
  const corners = Option.all([
    safeMul(a.lo, b.lo),
    safeMul(a.lo, b.hi),
    safeMul(a.hi, b.lo),
    safeMul(a.hi, b.hi),
  ])
  return Option.match(corners, {
    onNone: () => top,
    onSome: values => {
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      // A product of safe integers that is one is exact; any other may have rounded.
      const factors = [a.lo, a.hi, b.lo, b.hi]
      if ([...factors, lo, hi].every(Number.isSafeInteger)) return between(lo, hi)
      // A zero end beside a zero factor is that factor's exact product, not an underflow.
      const slack = (end: number): number => (end === 0 && factors.includes(0) ? 0 : ulp(end))
      return between(lo - slack(lo), hi + slack(hi))
    },
  })
}

/** Sound Kleene $K_3$ verdict for `a < b`. */
export const lt = (a: Interval, b: Interval): Verdict.Verdict<never> => {
  if (isBottom(a) || isBottom(b)) return Verdict.True(Option.some(Verdict.Proved('interval')))
  if (a.hi < b.lo) return Verdict.True(Option.some(Verdict.Proved('interval')))
  if (a.lo >= b.hi) return Verdict.False()
  return Verdict.Unknown('intervals overlap')
}

/** Sound Kleene $K_3$ verdict for `a <= b`. */
export const lte = (a: Interval, b: Interval): Verdict.Verdict<never> => {
  if (isBottom(a) || isBottom(b)) return Verdict.True(Option.some(Verdict.Proved('interval')))
  if (a.hi <= b.lo) return Verdict.True(Option.some(Verdict.Proved('interval')))
  if (a.lo > b.hi) return Verdict.False()
  return Verdict.Unknown('intervals overlap')
}

/** Sound Kleene $K_3$ verdict for `a == b`. */
export const is = (a: Interval, b: Interval): Verdict.Verdict<never> => {
  if (isBottom(a) || isBottom(b)) return Verdict.True(Option.some(Verdict.Proved('interval')))
  if (a.lo === a.hi && b.lo === b.hi && a.lo === b.lo) {
    return Verdict.True(Option.some(Verdict.Proved('interval')))
  }
  if (a.hi < b.lo || b.hi < a.lo) return Verdict.False()
  return Verdict.Unknown('intervals overlap')
}
