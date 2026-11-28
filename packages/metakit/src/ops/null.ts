/**
 * Nullability primitives (`null.isNull`, `null.coalesce`) and derived helper (`Null.isNotNull`).
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput, type ValueOfInput } from './core.js'

export const isNullOp: Node.Op<'null.isNull'> = {
  id: 'null.isNull',
  returns: 'boolean',
  nulls: 'own',
  evaluate: ([value]) => (Node.isRefusal(value) ? value : value === null),
}

/**
 * `a`, or `b` where `a` is null, as SQL's `coalesce`: where `a` has a value
 * the answer is `a` whatever `b` is, so `b`'s refusal does not reach it.
 */
export const coalesceOp: Node.Op<'null.coalesce'> = {
  id: 'null.coalesce',
  returns: 'operand',
  nulls: 'own',
  evaluate: ([value, fallback]) => (value === null ? fallback : value),
}

/** True when `value` is null, which an absent key also reads as. Never null itself. */
export const isNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => call(isNullOp, [value])

/** `value`, or `fallback` where it is null (`coalesce` in SQL). */
export const coalesce = <
  A extends ExprInput<never, unknown>,
  B extends ExprInput<never, NoInfer<Exclude<ValueOfInput<A>, null>> | null>,
>(
  value: A,
  fallback: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, Exclude<ValueOfInput<A>, null> | ValueOfInput<B>> =>
  call(coalesceOp, [value, fallback])

/** Derived helper: `Bool.not(Null.isNull(x))`. */
export const isNotNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => Bool.not(isNull(value))
