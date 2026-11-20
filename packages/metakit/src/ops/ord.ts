/**
 * Ordering primitives (`ord.lt`, `ord.lte`, `ord.gt`, `ord.gte`) and derived
 * range helper (`Ord.between`). Null-strict: a comparison with null is null.
 * NaN has no order, so a comparison over it is refused.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput, type NullOf } from './core.js'

/** A number operand; where it may be null, so may the result. */
export type NullableNumber = ExprInput<never, number | null>

const comparison =
  (id: Node.CoreOpId, decide: (a: number, b: number) => boolean) =>
  ([a, b]: ReadonlyArray<unknown>): unknown => {
    if (typeof a !== 'number') return Node.illTyped(id, 'a number', a)
    if (typeof b !== 'number') return Node.illTyped(id, 'a number', b)
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return new Node.Refusal({ reason: 'non-finite', at: id, detail: 'NaN has no order' })
    }
    return decide(a, b)
  }

export const ltOp: Node.Op<'ord.lt'> = {
  id: 'ord.lt',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: comparison('ord.lt', (a, b) => a < b),
}

export const lteOp: Node.Op<'ord.lte'> = {
  id: 'ord.lte',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: comparison('ord.lte', (a, b) => a <= b),
}

export const gtOp: Node.Op<'ord.gt'> = {
  id: 'ord.gt',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: comparison('ord.gt', (a, b) => a > b),
}

export const gteOp: Node.Op<'ord.gte'> = {
  id: 'ord.gte',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: comparison('ord.gte', (a, b) => a >= b),
}

export const lt = <L extends NullableNumber, R extends NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => call(ltOp, [left, right])

export const lte = <L extends NullableNumber, R extends NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> =>
  call(lteOp, [left, right])

export const gt = <L extends NullableNumber, R extends NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => call(gtOp, [left, right])

export const gte = <L extends NullableNumber, R extends NullableNumber>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> =>
  call(gteOp, [left, right])

/** Derived helper: `Bool.and(Ord.gte(x, lo), Ord.lte(x, hi))`. */
export const between = <
  X extends NullableNumber,
  Lo extends NullableNumber,
  Hi extends NullableNumber,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<
  EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>,
  boolean | NullOf<X> | NullOf<Lo> | NullOf<Hi>
> => call(Bool.andOp, [gte(value, lo), lte(value, hi)])
