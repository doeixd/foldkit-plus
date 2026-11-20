/**
 * Fixed-scale integer-backed `Money` and `Currency` Schemas + symbolic ops.
 *
 * Amounts are stored as exact integer minor units (e.g. cents for scale 2), so
 * Tier 3 Zone and Tier 4 Z3 prove financial invariants in exact linear integer
 * arithmetic without JS float drift. Currency & scale mismatches are compile
 * errors.
 */
import { Schema } from 'effect'
import * as Node from '../node.js'
import * as Bool from '../ops/bool.js'
import {
  call,
  toNode,
  wrap,
  type EnvOfInput,
  type ExprInput,
  type ValueOfInput,
} from '../ops/core.js'
import * as Eq from '../ops/eq.js'
import * as Num from '../ops/num.js'
import * as Ord from '../ops/ord.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

export const MoneyBrand: unique symbol = Symbol.for('metakit/Money')

/** Integer minor-unit amount branded by currency `C` and decimal scale `S`. */
export type MoneyValue<C extends string, S extends number = 2> = number & {
  readonly [MoneyBrand]: readonly [currency: C, scale: S]
}

/** Construct a `Currency` literal union Schema with `metakit/domain` metadata. */
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
  const scale = (options?.scale ?? 2) as S
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) {
    throw new Error(`[metakit] Money.make scale must be an integer between 0 and 12, got ${scale}`)
  }
  return Schema.Int.annotate({
    [DOMAIN_ANNOTATION_KEY]: { kind: 'money', currency: code, scale },
  } as Schema.Annotations.Annotations) as unknown as Schema.Codec<MoneyValue<C, S>, number>
}

/** Construct a typed `MoneyValue<C, S>` constant from integer minor units. */
export const minor = <const C extends string, const S extends number = 2>(
  _currency: C,
  amount: number,
  _scale?: S,
): MoneyValue<C, S> => {
  if (!Number.isInteger(amount)) {
    throw new Error(`[metakit] Money.minor requires an integer minor-unit amount, got ${amount}`)
  }
  return amount as MoneyValue<C, S>
}

/** Format integer minor units as a fixed-decimal string (e.g. `1250` -> `"12.50 USD"`). */
export const format = <C extends string, S extends number = 2>(
  amount: MoneyValue<C, S>,
  code: C,
  scale: S = 2 as S,
): string => {
  const divisor = 10 ** scale
  return `${(amount / divisor).toFixed(scale)} ${code}`
}

type AnyMoneyInput = ExprInput<never, MoneyValue<string, number>>
type MoneyCurrency<T> = ValueOfInput<T> extends MoneyValue<infer C, number> ? C : never
type MoneyScale<T> = ValueOfInput<T> extends MoneyValue<string, infer S> ? S : never
type SameMoneyInput<L> = ExprInput<never, MoneyValue<MoneyCurrency<L>, MoneyScale<L>>>
type MoneyResult<L> = MoneyValue<MoneyCurrency<L>, MoneyScale<L>>

/** Add two `Money` amounts of the same currency and scale. */
export const add = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, MoneyResult<L>> =>
  Num.add(left as ExprInput<never, number>, right as ExprInput<never, number>) as unknown as Expr<
    EnvOfInput<L> & EnvOfInput<R>,
    MoneyResult<L>
  >

/** Subtract two `Money` amounts of the same currency and scale. */
export const sub = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, MoneyResult<L>> =>
  Num.sub(left as ExprInput<never, number>, right as ExprInput<never, number>) as unknown as Expr<
    EnvOfInput<L> & EnvOfInput<R>,
    MoneyResult<L>
  >

/** Multiply a `Money` amount by an integer scalar. */
export const mulInt = <M extends AnyMoneyInput, F extends ExprInput<never, number>>(
  money: M,
  factor: F,
): Expr<EnvOfInput<M> & EnvOfInput<F>, MoneyResult<M>> =>
  Num.mul(money as ExprInput<never, number>, factor) as unknown as Expr<
    EnvOfInput<M> & EnvOfInput<F>,
    MoneyResult<M>
  >

/** Negate a `Money` amount. */
export const neg = <M extends AnyMoneyInput>(money: M): Expr<EnvOfInput<M>, MoneyResult<M>> =>
  Num.neg(money as ExprInput<never, number>) as unknown as Expr<EnvOfInput<M>, MoneyResult<M>>

export const lt = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.lt(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const lte = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.lte(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const gt = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.gt(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const gte = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> =>
  Ord.gte(left as ExprInput<never, number>, right as ExprInput<never, number>)

export const is = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(Eq.isOp, [left, right])

export const between = <
  X extends AnyMoneyInput,
  Lo extends SameMoneyInput<X>,
  Hi extends SameMoneyInput<X>,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, boolean> =>
  Bool.and(gte(value, lo), lte(value, hi))

export const min = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, MoneyResult<L>> =>
  wrap(
    Node.If({
      cond: lte(left, right).node,
      then: toNode(left),
      otherwise: toNode(right),
    }),
  )

export const max = <L extends AnyMoneyInput, R extends SameMoneyInput<L>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, MoneyResult<L>> =>
  wrap(
    Node.If({
      cond: gte(left, right).node,
      then: toNode(left),
      otherwise: toNode(right),
    }),
  )
