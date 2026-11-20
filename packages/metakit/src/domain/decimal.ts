/**
 * Fixed-scale integer-backed `Decimal` Schema (`metakit/domain`) with
 * compile-time scale safety, exact decimal string parsing/formatting, pinned
 * half-even integer rounding, and symbolic arithmetic lowering directly to
 * `num.*` / `ord.*` / `eq.*`.
 */
import { Data, Result, Schema } from 'effect'
import * as Bool from '../ops/bool.js'
import { call, type EnvOfInput, type ExprInput, type ValueOfInput } from '../ops/core.js'
import * as Eq from '../ops/eq.js'
import * as Num from '../ops/num.js'
import * as Ord from '../ops/ord.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

export const DecimalScaleBrand: unique symbol = Symbol.for('metakit/DecimalScale')

/** Integer count of fixed-scale decimal units (`10^-S`). */
export type DecimalValue<S extends number = 2> = number & {
  readonly [DecimalScaleBrand]: S
}

export class InvalidDecimalError extends Data.TaggedError('InvalidDecimalError')<{
  readonly input: string
  readonly reason: string
}> {}

type ScaleOf<V> = V extends DecimalValue<infer S> ? S : never
type AnyDecimalInput = ExprInput<never, DecimalValue<number>>

const assertScale = (scale: number): void => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) {
    throw new Error(`[metakit] Decimal scale must be an integer between 0 and 12, got ${scale}`)
  }
}

/**
 * Construct an integer-backed fixed-scale `Decimal` Schema (default `scale: 2`).
 * Two `Decimal` values with different scales cannot be mixed in arithmetic or
 * comparisons at compile time.
 */
export const make = <const S extends number = 2>(options?: {
  readonly scale?: S
}): Schema.Codec<DecimalValue<S>, number> => {
  const scale = (options?.scale ?? 2) as S
  assertScale(scale)
  return Schema.Int.annotate({
    [DOMAIN_ANNOTATION_KEY]: { kind: 'decimal', scale },
  } as Schema.Annotations.Annotations) as unknown as Schema.Codec<DecimalValue<S>, number>
}

/** Construct a typed `DecimalValue<S>` from an exact integer unit count. */
export const units = <const S extends number = 2>(amount: number, scale?: S): DecimalValue<S> => {
  const s = (scale ?? 2) as S
  assertScale(s)
  if (!Number.isInteger(amount)) {
    throw new Error(`[metakit] Decimal.units requires an integer unit count, got ${amount}`)
  }
  return (Object.is(amount, -0) ? 0 : amount) as DecimalValue<S>
}

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?$/

/**
 * Parse an exact base-10 decimal string (e.g. `"-12.50"`) into integer units at
 * `scale` with zero floating-point drift. Refuses strings with more fractional
 * digits than `scale`.
 */
export const parse = <const S extends number = 2>(
  text: string,
  options?: { readonly scale?: S },
): Result.Result<DecimalValue<S>, InvalidDecimalError> => {
  const scale = (options?.scale ?? 2) as S
  assertScale(scale)
  const trimmed = text.trim()
  const match = DECIMAL_RE.exec(trimmed)
  if (match === null) {
    return Result.fail(new InvalidDecimalError({ input: text, reason: 'invalid decimal syntax' }))
  }
  const neg = match[1] === '-'
  const whole = match[2]!
  const frac = match[3] ?? ''
  if (frac.length > scale) {
    return Result.fail(
      new InvalidDecimalError({
        input: text,
        reason: `expected at most ${scale} fractional digit(s), got ${frac.length}`,
      }),
    )
  }
  const padded = frac.padEnd(scale, '0')
  const combined = BigInt(`${whole}${padded}`)
  const signed = neg ? -combined : combined
  const num = Number(signed)
  if (!Number.isSafeInteger(num)) {
    return Result.fail(
      new InvalidDecimalError({ input: text, reason: 'decimal value exceeds safe integer range' }),
    )
  }
  return Result.succeed((Object.is(num, -0) ? 0 : num) as DecimalValue<S>)
}

/** Format integer units as an exact fixed-decimal string (e.g. `1250`, scale 2 -> `"12.50"`). */
export const format = <S extends number = 2>(
  value: DecimalValue<S>,
  options?: { readonly scale?: S },
): string => {
  const scale = (options?.scale ?? 2) as number
  assertScale(scale)
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (scale === 0) return `${sign}${abs}`
  const factor = 10 ** scale
  const whole = Math.floor(abs / factor)
  const frac = String(abs % factor).padStart(scale, '0')
  return `${sign}${whole}.${frac}`
}

/**
 * Exact integer half-even (banker's) rounding of `numerator / divisor`
 * (`divisor > 0`). Uses pure integer arithmetic (zero float drift, pinned to
 * match integer SQL lowering on both Postgres and SQLite).
 */
export const roundHalfEven = (numerator: number, divisor: number): number => {
  if (!Number.isInteger(numerator) || !Number.isInteger(divisor) || divisor <= 0) {
    throw new Error(
      `[metakit] Decimal.roundHalfEven requires integer numerator and positive integer divisor, got (${numerator}, ${divisor})`,
    )
  }
  const q = Math.trunc(numerator / divisor)
  const r = numerator % divisor
  const absTwoR = Math.abs(r) * 2
  if (absTwoR < divisor) return Object.is(q, -0) ? 0 : q
  const step = numerator < 0 ? -1 : 1
  if (absTwoR > divisor) return q + step
  // Exact tie: round to the nearest even integer
  const result = q % 2 === 0 ? q : q + step
  return Object.is(result, -0) ? 0 : result
}

/** Add two `Decimal` expressions of the same scale. */
export const add = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, DecimalValue<ScaleOf<ValueOfInput<L>>>> =>
  Num.add(left as ExprInput<never, number>, right as ExprInput<never, number>) as unknown as Expr<
    EnvOfInput<L> & EnvOfInput<R>,
    DecimalValue<ScaleOf<ValueOfInput<L>>>
  >

/** Subtract two `Decimal` expressions of the same scale. */
export const sub = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, DecimalValue<ScaleOf<ValueOfInput<L>>>> =>
  Num.sub(left as ExprInput<never, number>, right as ExprInput<never, number>) as unknown as Expr<
    EnvOfInput<L> & EnvOfInput<R>,
    DecimalValue<ScaleOf<ValueOfInput<L>>>
  >

/** Negate a `Decimal` expression, preserving its scale brand. */
export const neg = <X extends AnyDecimalInput>(
  x: X,
): Expr<EnvOfInput<X>, DecimalValue<ScaleOf<ValueOfInput<X>>>> =>
  Num.neg(x as ExprInput<never, number>) as unknown as Expr<
    EnvOfInput<X>,
    DecimalValue<ScaleOf<ValueOfInput<X>>>
  >

/** Multiply a `Decimal` expression by a dimensionless integer factor (e.g. quantity). */
export const mulInt = <L extends AnyDecimalInput, R extends ExprInput<never, number>>(
  amount: L,
  factor: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, DecimalValue<ScaleOf<ValueOfInput<L>>>> =>
  Num.mul(amount as ExprInput<never, number>, factor) as unknown as Expr<
    EnvOfInput<L> & EnvOfInput<R>,
    DecimalValue<ScaleOf<ValueOfInput<L>>>
  >

export const lt = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.lt(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const lte = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.lte(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const gt = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.gt(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const gte = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.gte(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const is = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(Eq.isOp, [left, right])

export const isNot = <
  L extends AnyDecimalInput,
  R extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<L>>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(Eq.isNotOp, [left, right])

export const between = <
  X extends AnyDecimalInput,
  Lo extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<X>>>>,
  Hi extends ExprInput<never, DecimalValue<ScaleOf<ValueOfInput<X>>>>,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, boolean> =>
  Bool.and(gte(value, lo), lte(value, hi))
