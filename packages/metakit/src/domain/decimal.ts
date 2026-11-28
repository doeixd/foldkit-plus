/**
 * Fixed-scale integer-backed `Decimal` Schema (`@doeixd/metakit/domain`) with
 * compile-time scale safety, exact decimal text parsing and formatting,
 * half-even integer rounding, and symbolic arithmetic lowering to `num.*`,
 * `ord.*` and `eq.*`.
 */
import { Option, Result, Schema } from 'effect'
import type { EnvOfInput, ExprInput, ValueOfInput } from '../ops/core.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'
import * as Fixed from './fixed.js'

export const DecimalScaleBrand: unique symbol = Symbol.for('metakit/DecimalScale')

/** Integer count of fixed-scale decimal units (`10^-S`). */
export type DecimalValue<S extends number = 2> = number & {
  readonly [DecimalScaleBrand]: S
}

export { InvalidDecimalError, roundHalfEven } from './fixed.js'

type ScaleOf<V> = V extends DecimalValue<infer S> ? S : never
type MaybeDecimalInput = ExprInput<never, DecimalValue<number> | null>

/**
 * Construct an integer-backed fixed-scale `Decimal` Schema (default `scale: 2`).
 * Two `Decimal` values with different scales cannot be mixed in arithmetic or
 * comparisons at compile time.
 */
export const make = <const S extends number = 2>(options?: {
  readonly scale?: S
}): Schema.Codec<DecimalValue<S>, number> => {
  const scale = options?.scale ?? 2
  Fixed.assertScale(scale, 'Decimal.make')
  return Schema.Int.annotate({
    [DOMAIN_ANNOTATION_KEY]: { kind: 'decimal', scale },
  } as Schema.Annotations.Annotations) as unknown as Schema.Codec<DecimalValue<S>, number>
}

/** Construct a typed `DecimalValue<S>` from a safe integer unit count (default `scale: 2`). */
export const units = <const S extends number = 2>(amount: number, scale?: S): DecimalValue<S> => {
  Fixed.assertScale(scale ?? 2, 'Decimal.units')
  return Fixed.assertUnits(amount, 'Decimal.units') as DecimalValue<S>
}

/**
 * Parse an exact base-10 decimal string (e.g. `"-12.50"`) into integer units at
 * `scale` (default 2) with no floating-point drift. Refuses text with more
 * fractional digits than `scale` and a result outside the safe integer range.
 */
export const parse = <const S extends number = 2>(
  text: string,
  options?: { readonly scale?: S },
): Result.Result<DecimalValue<S>, Fixed.InvalidDecimalError> => {
  const scale = options?.scale ?? 2
  Fixed.assertScale(scale, 'Decimal.parse')
  return Fixed.parseUnits(text, scale) as Result.Result<DecimalValue<S>, Fixed.InvalidDecimalError>
}

/**
 * Format integer units as exact fixed-decimal text (`1250` at scale 2 is
 * `"12.50"`). The scale is required and must be the value's own: a
 * `DecimalValue<4>` formatted at scale 2 does not compile. Throws on a value
 * that is not a safe integer.
 */
export const format = <S extends number>(
  value: DecimalValue<S>,
  options: { readonly scale: NoInfer<S> },
): string => Fixed.formatUnits(value, options.scale, 'Decimal.format')

const ops = Fixed.ops<DecimalValue<number>>()

/** Add two `Decimal` expressions of the same scale. */
export const add = ops.add
/** Subtract two `Decimal` expressions of the same scale. */
export const sub = ops.sub
/** Negate a `Decimal` expression, keeping its scale. */
export const neg = ops.neg
/** Multiply a `Decimal` expression by a dimensionless integer factor (e.g. quantity). */
export const mulInt = ops.mulInt
/** The smaller of two `Decimal` expressions of the same scale. */
export const min = ops.min
/** The larger of two `Decimal` expressions of the same scale. */
export const max = ops.max
export const lt = ops.lt
export const lte = ops.lte
export const gt = ops.gt
export const gte = ops.gte
export const is = ops.is
export const isNot = ops.isNot
/** `lo <= value <= hi`, all at one scale. */
export const between = ops.between

/**
 * Multiply two decimals into a decimal at `scale`, rounding half-even. The
 * product is computed exactly in integers; `leftScale` and `rightScale` must be
 * the operands' own scales (checked by their types, and against a field's
 * Schema). It builds `num.mulScaled`, which evaluation, SQL (SQLite and
 * Postgres), the checkers and Z3 read or refuse by name. A missing operand
 * evaluates to `null` (typed so when an operand may be null); a product of
 * units outside the safe integer range is refused.
 */
export const mul = <
  L extends MaybeDecimalInput,
  R extends MaybeDecimalInput,
  const T extends number,
>(
  left: L,
  right: R,
  options: {
    readonly leftScale: NoInfer<ScaleOf<ValueOfInput<L>>>
    readonly rightScale: NoInfer<ScaleOf<ValueOfInput<R>>>
    readonly scale: T
  },
): Expr<EnvOfInput<L> & EnvOfInput<R>, DecimalValue<T> | Fixed.NullIn<L | R>> => {
  Fixed.assertScale(options.leftScale, 'Decimal.mul')
  Fixed.assertScale(options.rightScale, 'Decimal.mul')
  Fixed.assertScale(options.scale, 'Decimal.mul')
  return Fixed.mulExpr(
    'decimal.mul',
    { value: left, scale: Option.some(options.leftScale) },
    { value: right, scale: Option.some(options.rightScale) },
    options.leftScale + options.rightScale - options.scale,
  )
}
