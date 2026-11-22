/**
 * The checker's reading of `num.mulScaled`, from its operands' intervals.
 *
 * The evaluator refuses a product `a * b` outside the safe range before it
 * rounds, so what bounds a value is the product within that range, moved by a
 * function that never decreases (half-even rounding, or a multiple), and
 * whether the call has a value turns on the product and not on the result.
 */
import { isShift, roundHalfEvenBig } from '../ops/mulScaled.js'
import { SAFE } from './fields.js'
import * as Interval from './interval.js'

const MAX = BigInt(Number.MAX_SAFE_INTEGER)

/** The call's shift, where the third operand is one number of places. */
const shiftOf = (places: Interval.Interval): number | undefined =>
  places.lo === places.hi && isShift(places.lo) ? places.lo : undefined

const clamped = (value: bigint): number => Number(value > MAX ? MAX : value < -MAX ? -MAX : value)

/**
 * The interval of the result from the operands' intervals. Only an integer
 * product has a value, so the ends of the product's interval are taken in
 * toward the integers; a product nowhere in the safe range is always refused,
 * and any interval is then sound.
 */
export const forward = ([a, b, places]: ReadonlyArray<Interval.Interval>): Interval.Interval => {
  if (Interval.isBottom(a!) || Interval.isBottom(b!)) return Interval.bottom
  const shift = shiftOf(places!)
  const product = Interval.meet(Interval.mul(a!, b!), SAFE)
  const lo = Math.ceil(product.lo)
  const hi = Math.floor(product.hi)
  if (shift === undefined || Interval.isBottom(product) || lo > hi) return Interval.top
  const ends = [BigInt(lo), BigInt(hi)]
  if (shift < 0) {
    const up = 10n ** BigInt(-shift)
    return Interval.between(clamped(ends[0]! * up), clamped(ends[1]! * up))
  }
  const down = 10n ** BigInt(shift)
  return Interval.between(
    Number(roundHalfEvenBig(ends[0]!, down)),
    Number(roundHalfEvenBig(ends[1]!, down)),
  )
}

/**
 * Whether the evaluator surely refuses nothing: the operands are integers and
 * the product, and the result where it moves up, stay in the safe range.
 */
export const unrefused = (
  args: ReadonlyArray<Interval.Interval>,
  integers: ReadonlyArray<boolean>,
): boolean => {
  const shift = shiftOf(args[2]!)
  if (shift === undefined || !integers[0] || !integers[1]) return false
  const product = Interval.mul(args[0]!, args[1]!)
  if (!Interval.within(product, SAFE)) return false
  return shift >= 0 || Interval.within(Interval.mul(product, Interval.constant(10 ** -shift)), SAFE)
}
