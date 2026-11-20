/**
 * Nullability primitive (`null.isNull`) and derived helper (`Null.isNotNull`).
 */
import type * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

export const isNullOp: Node.Op<'null.isNull'> = {
  id: 'null.isNull',
  evaluate: args => args[0] === null || args[0] === undefined,
}

/** True when `value` is `null` (or `undefined` at an optional boundary). */
export const isNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => call(isNullOp, [value])

/** Derived helper: `Bool.not(Null.isNull(x))` — zero extra tier boilerplate. */
export const isNotNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => Bool.not(isNull(value))
