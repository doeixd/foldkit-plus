/**
 * `num.mulScaled`: the product of two integer counts of units, moved `shift`
 * decimal places down (half-even) or up, in integers. It is what `Decimal.mul`
 * and `Money.mul` build, and it is a module of its own so that a page naming
 * no decimal product ships none of it.
 *
 * The third argument is the shift, a literal integer the constructor writes;
 * a reader takes it from there. The operands must be safe integers, the
 * product `a * b` must stay within ±(2^53−1), and so must the result: any
 * other value is refused (`unsafe-integer`, or `ill-typed` for a fraction).
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type NullOf } from './core.js'
import type { NullableNumber } from './ord.js'

/** The most places a product moves: two scales of 12 digits down to none. */
export const MAX_SHIFT = 24
/** The most places a product moves up: scale 12 from two scale-0 operands. */
export const MIN_SHIFT = -12

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** Half-even rounding of `n / d` for `d > 0`, exact in `bigint`. */
export const roundHalfEvenBig = (n: bigint, d: bigint): bigint => {
  const r = n % d
  const q = (n - r) / d
  const twiceR = 2n * (r < 0n ? -r : r)
  const step = n < 0n ? -1n : 1n
  if (twiceR < d) return q
  if (twiceR > d) return q + step
  return q % 2n === 0n ? q : q + step
}

/** Whether `shift` is a number of places `num.mulScaled` takes. */
export const isShift = (shift: unknown): shift is number =>
  Number.isInteger(shift) && (shift as number) >= MIN_SHIFT && (shift as number) <= MAX_SHIFT

const refused = (detail: string): Node.Refusal =>
  new Node.Refusal({ reason: 'unsafe-integer', at: 'num.mulScaled', detail })

/** NaN or an infinity, refused before null as every numeric operand of that kind is. */
const notFinite = (value: unknown): Node.Refusal | undefined =>
  typeof value === 'number' && !Number.isFinite(value)
    ? new Node.Refusal({
        reason: 'non-finite',
        at: 'num.mulScaled',
        detail: `an operand is ${value}`,
      })
    : undefined

/** `a * b` (safe integers) in units moved `shift` places, or the refusal where it leaves the safe range. */
export const mulScaledUnits = (a: number, b: number, shift: number): number | Node.Refusal => {
  const product = BigInt(a) * BigInt(b)
  if (product > MAX_SAFE || product < -MAX_SAFE) {
    return refused(`the product of ${a} and ${b} is past ±(2^53−1)`)
  }
  const result =
    shift >= 0 ? roundHalfEvenBig(product, 10n ** BigInt(shift)) : product * 10n ** BigInt(-shift)
  if (result > MAX_SAFE || result < -MAX_SAFE) {
    return refused(`the result of ${a} * ${b} moved ${shift} places is past ±(2^53−1)`)
  }
  return result === 0n ? 0 : Number(result)
}

const evaluate = (args: ReadonlyArray<unknown>): unknown => {
  const [a, b, shift] = args
  for (const operand of [a, b]) {
    if (typeof operand !== 'number') return Node.illTyped('num.mulScaled', 'a number', operand)
    if (!Number.isInteger(operand)) {
      return Node.illTyped('num.mulScaled', 'an integer count of units', operand)
    }
    if (!Number.isSafeInteger(operand)) return refused(`${operand} is past ±(2^53−1)`)
  }
  if (!isShift(shift)) {
    return Node.illTyped('num.mulScaled', `a shift of ${MIN_SHIFT} to ${MAX_SHIFT} places`, shift)
  }
  return mulScaledUnits(a as number, b as number, shift)
}

export const mulScaledOp: Node.Op<'num.mulScaled'> = {
  id: 'num.mulScaled',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite,
  evaluate,
}

/**
 * The product of two integer counts of units, moved `shift` places down with
 * half-even rounding (up where `shift` is negative); null where an operand is.
 */
export const mulScaled = <L extends NullableNumber, R extends NullableNumber>(
  left: L,
  right: R,
  options: { readonly shift: number },
): Expr<EnvOfInput<L> & EnvOfInput<R>, number | NullOf<L> | NullOf<R>> => {
  if (!isShift(options.shift)) {
    throw new Error(
      `[metakit] Num.mulScaled: shift must be an integer from ${MIN_SHIFT} to ${MAX_SHIFT}, got ${options.shift}`,
    )
  }
  return call(mulScaledOp, [left, right, options.shift])
}
