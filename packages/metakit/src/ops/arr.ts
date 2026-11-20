/**
 * Collection primitives (`arr.count`, `arr.isEmpty`) and derived helper
 * (`Arr.nonEmpty`).
 */
import type * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

export const countOp: Node.Op<'arr.count'> = {
  id: 'arr.count',
  evaluate: args => (Array.isArray(args[0]) ? args[0].length : 0),
}

export const isEmptyOp: Node.Op<'arr.isEmpty'> = {
  id: 'arr.isEmpty',
  evaluate: args => (Array.isArray(args[0]) ? args[0].length === 0 : true),
}

/** Number of elements in an array (always `>= 0`). */
export const count = <A extends ExprInput<never, ReadonlyArray<unknown>>>(
  items: A,
): Expr<EnvOfInput<A>, number> => call(countOp, [items])

/** True when `items` has zero elements. */
export const isEmpty = <A extends ExprInput<never, ReadonlyArray<unknown>>>(
  items: A,
): Expr<EnvOfInput<A>, boolean> => call(isEmptyOp, [items])

/** Derived helper: `Bool.not(Arr.isEmpty(items))` — zero extra tier boilerplate. */
export const nonEmpty = <A extends ExprInput<never, ReadonlyArray<unknown>>>(
  items: A,
): Expr<EnvOfInput<A>, boolean> => Bool.not(isEmpty(items))
