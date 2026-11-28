/**
 * `OrderedEnum`: an Effect `Schema.Literals` with a total order
 * (e.g. `draft < pending < paid < refunded`).
 *
 * Symbolic comparisons lower via `Match` to integer ranks `0..k-1`, so Tier 1
 * JS, Tier 1 SQL (`CASE ... WHEN`), Tier 2 `residualize`, and Tier 4 Z3 all
 * understand ordered enums with zero new `CoreOpId`s.
 */
import { Option, Schema } from 'effect'
import * as Node from '../node.js'
import * as Bool from '../ops/bool.js'
import { isExpr, toNode, wrap, type EnvOfInput, type ExprInput } from '../ops/core.js'
import * as Num from '../ops/num.js'
import * as Ord from '../ops/ord.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

export interface OrderedEnum<Values extends readonly [string, ...Array<string>]> {
  readonly schema: Schema.Literals<Values>
  readonly values: Values
  /** Smallest value in the order (`values[0]`). */
  readonly min: Values[number]
  /** Largest value in the order (`values[values.length - 1]`). */
  readonly max: Values[number]
  /** Lower an enum expression or literal to its integer rank `0..values.length - 1`. */
  readonly rank: <X extends ExprInput<never, Values[number]>>(
    value: X,
  ) => Expr<EnvOfInput<X>, number>
  /** Next value in the order, or `null` at `max`. */
  readonly next: <X extends ExprInput<never, Values[number]>>(
    value: X,
  ) => Expr<EnvOfInput<X>, Values[number] | null>
  /** Previous value in the order, or `null` at `min`. */
  readonly prev: <X extends ExprInput<never, Values[number]>>(
    value: X,
  ) => Expr<EnvOfInput<X>, Values[number] | null>
  /** Signed rank difference `rank(a) - rank(b)`. */
  readonly distance: <
    L extends ExprInput<never, Values[number]>,
    R extends ExprInput<never, Values[number]>,
  >(
    left: L,
    right: R,
  ) => Expr<EnvOfInput<L> & EnvOfInput<R>, number>
  readonly lt: <
    L extends ExprInput<never, Values[number]>,
    R extends ExprInput<never, Values[number]>,
  >(
    left: L,
    right: R,
  ) => Expr<EnvOfInput<L> & EnvOfInput<R>, boolean>
  readonly lte: <
    L extends ExprInput<never, Values[number]>,
    R extends ExprInput<never, Values[number]>,
  >(
    left: L,
    right: R,
  ) => Expr<EnvOfInput<L> & EnvOfInput<R>, boolean>
  readonly gt: <
    L extends ExprInput<never, Values[number]>,
    R extends ExprInput<never, Values[number]>,
  >(
    left: L,
    right: R,
  ) => Expr<EnvOfInput<L> & EnvOfInput<R>, boolean>
  readonly gte: <
    L extends ExprInput<never, Values[number]>,
    R extends ExprInput<never, Values[number]>,
  >(
    left: L,
    right: R,
  ) => Expr<EnvOfInput<L> & EnvOfInput<R>, boolean>
  readonly between: <
    X extends ExprInput<never, Values[number]>,
    Lo extends ExprInput<never, Values[number]>,
    Hi extends ExprInput<never, Values[number]>,
  >(
    value: X,
    lo: Lo,
    hi: Hi,
  ) => Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, boolean>
}

/** Construct an `OrderedEnum` from a non-empty ordered tuple of string literals. */
export const make = <const Values extends readonly [string, ...Array<string>]>(
  values: Values,
): OrderedEnum<Values> => {
  if (values.length === 0) {
    throw new Error('[metakit] OrderedEnum.make requires at least one value')
  }
  const rankMap = new Map<string, number>()
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (v.includes('\u0000')) {
      throw new Error(
        `[metakit] OrderedEnum.make: value ${JSON.stringify(v)} holds a NUL character, which Postgres cannot store`,
      )
    }
    if (rankMap.has(v)) {
      throw new Error(`[metakit] OrderedEnum.make duplicate value "${v}"`)
    }
    rankMap.set(v, i)
  }

  const schema = Schema.Literals(values).annotate({
    [DOMAIN_ANNOTATION_KEY]: { kind: 'orderedEnum', order: values },
  } as Schema.Annotations.Annotations)

  const rank = <X extends ExprInput<never, Values[number]>>(
    value: X,
  ): Expr<EnvOfInput<X>, number> => {
    if (!isExpr(value)) {
      const idx = rankMap.get(value as string)
      if (idx === undefined) {
        throw new Error(`[metakit] OrderedEnum value "${String(value)}" is not in enum`)
      }
      return wrap(Node.Lit({ value: idx }))
    }
    const cases: Array<readonly [string, Node.Node]> = values.map(
      (v, i) => [v, Node.Lit({ value: i })] as const,
    )
    return wrap(
      Node.Match({
        on: toNode(value),
        cases,
        otherwise: Option.none(),
      }),
    )
  }

  const min: Values[number] = values[0]
  const max: Values[number] = values[values.length - 1]!

  const shift =
    (delta: 1 | -1) =>
    <X extends ExprInput<never, Values[number]>>(
      value: X,
    ): Expr<EnvOfInput<X>, Values[number] | null> => {
      if (!isExpr(value)) {
        const idx = rankMap.get(value as string)
        if (idx === undefined) {
          throw new Error(`[metakit] OrderedEnum value "${String(value)}" is not in enum`)
        }
        const target = values[idx + delta]
        return wrap(Node.Lit({ value: target ?? null }))
      }
      const cases: Array<readonly [string, Node.Node]> = values.map(
        (v, i) => [v, Node.Lit({ value: values[i + delta] ?? null })] as const,
      )
      return wrap(
        Node.Match({
          on: toNode(value),
          cases,
          otherwise: Option.none(),
        }),
      )
    }

  const next = shift(1)
  const prev = shift(-1)
  const distance: OrderedEnum<Values>['distance'] = (left, right) =>
    Num.sub(rank(left), rank(right))

  const lt: OrderedEnum<Values>['lt'] = (left, right) => Ord.lt(rank(left), rank(right))
  const lte: OrderedEnum<Values>['lte'] = (left, right) => Ord.lte(rank(left), rank(right))
  const gt: OrderedEnum<Values>['gt'] = (left, right) => Ord.gt(rank(left), rank(right))
  const gte: OrderedEnum<Values>['gte'] = (left, right) => Ord.gte(rank(left), rank(right))
  const between: OrderedEnum<Values>['between'] = (value, lo, hi) =>
    Bool.and(gte(value, lo), lte(value, hi))

  return { schema, values, min, max, rank, next, prev, distance, lt, lte, gt, gte, between }
}
