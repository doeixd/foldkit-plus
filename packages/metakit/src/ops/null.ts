/**
 * Nullability primitive (`null.isNull`) and derived helper (`Null.isNotNull`).
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

export const isNullOp: Node.Op<'null.isNull'> = {
  id: 'null.isNull',
  returns: 'boolean',
  nulls: 'own',
  evaluate: ([value]) => (Node.isRefusal(value) ? value : value === null),
}

/** True when `value` is null, which an absent key also reads as. Never null itself. */
export const isNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => call(isNullOp, [value])

/** Derived helper: `Bool.not(Null.isNull(x))`. */
export const isNotNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => Bool.not(isNull(value))
