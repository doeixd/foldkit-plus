/**
 * Collection primitives (`arr.count`, `arr.isEmpty`) and derived helper
 * (`Arr.nonEmpty`). Both are null-strict: a null array gives null.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput, type NullOf } from './core.js'

/** An array operand; where it may be null, so may the result. */
export type NullableItems = ExprInput<never, ReadonlyArray<unknown> | null>

export const countOp: Node.Op<'arr.count'> = {
  id: 'arr.count',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([items]) =>
    Array.isArray(items) ? items.length : Node.illTyped('arr.count', 'an array', items),
}

export const isEmptyOp: Node.Op<'arr.isEmpty'> = {
  id: 'arr.isEmpty',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: ([items]) =>
    Array.isArray(items) ? items.length === 0 : Node.illTyped('arr.isEmpty', 'an array', items),
}

/** Number of elements in an array (always `>= 0`). */
export const count = <A extends NullableItems>(items: A): Expr<EnvOfInput<A>, number | NullOf<A>> =>
  call(countOp, [items])

/** True when `items` has zero elements. */
export const isEmpty = <A extends NullableItems>(
  items: A,
): Expr<EnvOfInput<A>, boolean | NullOf<A>> => call(isEmptyOp, [items])

/** Derived helper: `Bool.not(Arr.isEmpty(items))`. */
export const nonEmpty = <A extends NullableItems>(
  items: A,
): Expr<EnvOfInput<A>, boolean | NullOf<A>> => call(Bool.notOp, [isEmpty(items)])
