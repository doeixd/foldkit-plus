/**
 * Fixed-scale integer-backed `Money` and `Currency` Schemas + symbolic ops.
 *
 * Amounts are stored as exact integer minor units (e.g. cents for scale 2), so
 * Tier 3 Zone and Tier 4 Z3 prove financial invariants in exact linear integer
 * arithmetic without JS float drift. Currency & scale mismatches are compile
 * errors. `Money` shares its implementation and its operations with `Decimal`.
 */
import { Option, Result, Schema } from 'effect'
import * as Node from '../node.js'
import { toNode, type EnvOfInput, type ExprInput, type ValueOfInput } from '../ops/core.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY, domainOfAst } from './annotation.js'
import type { DecimalValue } from './decimal.js'
import * as Fixed from './fixed.js'

export const MoneyBrand: unique symbol = Symbol.for('metakit/Money')

/** Integer minor-unit amount branded by currency `C` and decimal scale `S`. */
export type MoneyValue<C extends string, S extends number = 2> = number & {
  readonly [MoneyBrand]: readonly [currency: C, scale: S]
}

/** Construct a `Currency` literal union Schema with `@doeixd/metakit/domain` metadata. */
export const currency = <const Codes extends readonly [string, ...Array<string>]>(
  codes: Codes,
): Schema.Literals<Codes> =>
  Schema.Literals(codes).annotate({
    [DOMAIN_ANNOTATION_KEY]: { kind: 'currency', allowed: codes },
  } as Schema.Annotations.Annotations)

/**
 * Construct an integer-backed `Money` Schema for currency `C` and decimal
 * `scale` (default `2`, i.e. minor units like cents).
 */
export const make = <const C extends string, const S extends number = 2>(
  code: C,
  options?: { readonly scale?: S },
): Schema.Codec<MoneyValue<C, S>, number> => {
  if (code.trim().length === 0) {
    throw new Error('[metakit] Money.make requires a non-empty currency code')
  }
  const scale = options?.scale ?? 2
  Fixed.assertScale(scale, 'Money.make')
  return Schema.Int.annotate({
    [DOMAIN_ANNOTATION_KEY]: { kind: 'money', currency: code, scale },
  } as Schema.Annotations.Annotations) as unknown as Schema.Codec<MoneyValue<C, S>, number>
}

/** Construct a typed `MoneyValue<C, S>` constant from a safe integer of minor units (default `scale: 2`). */
export const minor = <const C extends string, const S extends number = 2>(
  _currency: C,
  amount: number,
  scale?: S,
): MoneyValue<C, S> => {
  Fixed.assertScale(scale ?? 2, 'Money.minor')
  return Fixed.assertUnits(amount, 'Money.minor') as MoneyValue<C, S>
}

/**
 * Parse exact base-10 text (`"12.50"`) into minor units of `code` at `scale`
 * (default 2). Refuses text with more fractional digits than `scale` and a
 * result outside the safe integer range.
 */
export const parse = <const C extends string, const S extends number = 2>(
  _currency: C,
  text: string,
  options?: { readonly scale?: S },
): Result.Result<MoneyValue<C, S>, Fixed.InvalidDecimalError> => {
  const scale = options?.scale ?? 2
  Fixed.assertScale(scale, 'Money.parse')
  return Fixed.parseUnits(text, scale) as Result.Result<MoneyValue<C, S>, Fixed.InvalidDecimalError>
}

/**
 * Format minor units as exact fixed-decimal text with the currency code
 * (`1250` USD at scale 2 is `"12.50 USD"`). The currency and the scale must be
 * the amount's own: a mismatch does not compile. Throws on an amount that is
 * not a safe integer.
 */
export const format = <C extends string, S extends number>(
  amount: MoneyValue<C, S>,
  code: NoInfer<C>,
  options: { readonly scale: NoInfer<S> },
): string => `${Fixed.formatUnits(amount, options.scale, 'Money.format')} ${code}`

const ops = Fixed.ops<MoneyValue<string, number>>()

/** Add two `Money` amounts of the same currency and scale. */
export const add = ops.add
/** Subtract two `Money` amounts of the same currency and scale. */
export const sub = ops.sub
/** Negate a `Money` amount. */
export const neg = ops.neg
/** Multiply a `Money` amount by an integer scalar. */
export const mulInt = ops.mulInt
/** The smaller of two amounts of the same currency and scale. */
export const min = ops.min
/** The larger of two amounts of the same currency and scale. */
export const max = ops.max
export const lt = ops.lt
export const lte = ops.lte
export const gt = ops.gt
export const gte = ops.gte
export const is = ops.is
export const isNot = ops.isNot
/** `lo <= value <= hi`, all of one currency and scale. */
export const between = ops.between

type RateScale<R> = ValueOfInput<R> extends DecimalValue<infer S> ? S : never

/**
 * Multiply an amount by a `Decimal` rate (a tax rate, an exchange rate) into
 * an amount of the same currency and scale, rounding half-even. `rateScale`
 * must be the rate's own scale. Exact in integers: it builds `num.mulScaled`,
 * which evaluation, SQL (SQLite and Postgres), the checkers and Z3 read or
 * refuse by name. A missing operand evaluates to `null` (typed so when an
 * operand may be null); a product outside the safe integer range is refused.
 */
export const mul = <
  M extends ExprInput<never, MoneyValue<string, number> | null>,
  R extends ExprInput<never, DecimalValue<number> | null>,
>(
  amount: M,
  rate: R,
  options?: { readonly rateScale?: NoInfer<RateScale<R>> },
): Expr<EnvOfInput<M> & EnvOfInput<R>, NonNullable<ValueOfInput<M>> | Fixed.NullIn<M | R>> => {
  let rateScale: number | undefined = options?.rateScale
  if (rateScale === undefined) {
    const rateNode = toNode(rate)
    if (Node.$is('Path')(rateNode) && Option.isSome(rateNode.ast)) {
      const meta = domainOfAst(rateNode.ast.value)
      if (Option.isSome(meta) && meta.value.kind === 'decimal') {
        rateScale = meta.value.scale
      }
    }
  }
  if (rateScale === undefined) {
    throw new Error(
      '[metakit] Money.mul: pass { rateScale } when the rate is not a Schema-backed Decimal path',
    )
  }
  Fixed.assertScale(rateScale, 'Money.mul')
  return Fixed.mulExpr(
    'money.mul',
    { value: amount, scale: Option.none() },
    { value: rate, scale: Option.some(rateScale) },
    rateScale,
  )
}
