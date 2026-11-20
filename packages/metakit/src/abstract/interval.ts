/**
 * Interval abstract domain `[lo, hi]` with sound forward transformers for
 * numeric operators and Kleene $K_3$ comparison verdicts.
 *
 * Every transformer satisfies Galois soundness:
 *   ∀ x ∈ γ(a), f(x) ∈ γ(f#(a))
 * verified by property tests in `metakit/conformance`.
 */
import { Option } from 'effect'
import * as Verdict from '../verdict.js'

export interface Interval {
  readonly lo: number
  readonly hi: number
}

const norm = (n: number): number => (Object.is(n, -0) ? 0 : n)

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

const safeAdd = (a: number, b: number, fallback: number): number => {
  const sum = a + b
  return Number.isNaN(sum) ? fallback : norm(sum)
}

export const add = (a: Interval, b: Interval): Interval => {
  if (isBottom(a) || isBottom(b)) return bottom
  return between(safeAdd(a.lo, b.lo, -Infinity), safeAdd(a.hi, b.hi, Infinity))
}

export const neg = (a: Interval): Interval => {
  if (isBottom(a)) return bottom
  return between(-a.hi, -a.lo)
}

export const sub = (a: Interval, b: Interval): Interval => add(a, neg(b))

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
  if ((a.lo === 0 && a.hi === 0) || (b.lo === 0 && b.hi === 0)) return constant(0)
  const corners = [
    safeMul(a.lo, b.lo),
    safeMul(a.lo, b.hi),
    safeMul(a.hi, b.lo),
    safeMul(a.hi, b.hi),
  ]
  if (corners.some(Option.isNone)) return top
  const values = corners.map(c => (c as Option.Some<number>).value)
  return between(Math.min(...values), Math.max(...values))
}

export const min = (a: Interval, b: Interval): Interval => {
  if (isBottom(a) || isBottom(b)) return bottom
  return between(Math.min(a.lo, b.lo), Math.min(a.hi, b.hi))
}

export const max = (a: Interval, b: Interval): Interval => {
  if (isBottom(a) || isBottom(b)) return bottom
  return between(Math.max(a.lo, b.lo), Math.max(a.hi, b.hi))
}

export const abs = (a: Interval): Interval => {
  if (isBottom(a)) return bottom
  if (a.lo >= 0) return a
  if (a.hi <= 0) return neg(a)
  return between(0, Math.max(-a.lo, a.hi))
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

export const gt = (a: Interval, b: Interval): Verdict.Verdict<never> => lt(b, a)

export const gte = (a: Interval, b: Interval): Verdict.Verdict<never> => lte(b, a)

/** Sound Kleene $K_3$ verdict for `a == b`. */
export const is = (a: Interval, b: Interval): Verdict.Verdict<never> => {
  if (isBottom(a) || isBottom(b)) return Verdict.True(Option.some(Verdict.Proved('interval')))
  if (a.lo === a.hi && b.lo === b.hi && a.lo === b.lo) {
    return Verdict.True(Option.some(Verdict.Proved('interval')))
  }
  if (a.hi < b.lo || b.hi < a.lo) return Verdict.False()
  return Verdict.Unknown('intervals overlap')
}

export const isNot = (a: Interval, b: Interval): Verdict.Verdict<never> => Verdict.not(is(a, b))

// --- Backward narrowing transformers ---
// Given `f(a, b) ∈ target`, return tightened `[a', b']` such that
// ∀ x ∈ a, y ∈ b: f(x, y) ∈ target ==> x ∈ a' ∧ y ∈ b'.

export const narrowAdd = (
  a: Interval,
  b: Interval,
  target: Interval,
): readonly [Interval, Interval] => [meet(a, sub(target, b)), meet(b, sub(target, a))]

export const narrowSub = (
  a: Interval,
  b: Interval,
  target: Interval,
): readonly [Interval, Interval] => [meet(a, add(target, b)), meet(b, sub(a, target))]

export const narrowNeg = (a: Interval, target: Interval): readonly [Interval] => [
  meet(a, neg(target)),
]

const divSafe = (num: Interval, den: Interval): Interval => {
  if (isBottom(num) || isBottom(den)) return bottom
  // If divisor spans 0, division can produce any real number
  if (den.lo <= 0 && den.hi >= 0) return top
  const corners = [num.lo / den.lo, num.lo / den.hi, num.hi / den.lo, num.hi / den.hi]
  if (corners.some(Number.isNaN)) return top
  return between(Math.min(...corners), Math.max(...corners))
}

export const narrowMul = (
  a: Interval,
  b: Interval,
  target: Interval,
): readonly [Interval, Interval] => [meet(a, divSafe(target, b)), meet(b, divSafe(target, a))]

export const narrowLte = (a: Interval, b: Interval): readonly [Interval, Interval] => [
  meet(a, between(-Infinity, b.hi)),
  meet(b, between(a.lo, Infinity)),
]

export const narrowGte = (a: Interval, b: Interval): readonly [Interval, Interval] => {
  const [nb, na] = narrowLte(b, a)
  return [na, nb]
}

export const narrowEq = (a: Interval, b: Interval): readonly [Interval, Interval] => {
  const m = meet(a, b)
  return [m, m]
}
