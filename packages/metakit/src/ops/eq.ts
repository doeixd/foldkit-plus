/**
 * Equality, null-check and set-membership operators (`is`, `isNot`, `isNull`,
 * `oneOf`).
 *
 * Equality uses strict value equality where `null` is a regular runtime value
 * (`is(null, null)` is `true`, `isNull(null)` is `true`). SQL lowering maps
 * this to `IS NOT DISTINCT FROM` / `IS NULL` so runtime and SQL agree on
 * nullable columns.
 */
import { Equal, Option } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type ValueOfInput } from './core.js'

const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (a === 0 && b === 0) || Equal.equals(a, b)

export const isOp: Node.Op<'is'> = {
  id: 'is',
  evaluate: args => sameValue(args[0], args[1]),
  fold: args => {
    const left = args[0]!
    const right = args[1]!
    if (Node.key(left) === Node.key(right)) return Option.some(Node.Lit({ value: true }))
    return Option.none()
  },
}

export const isNotOp: Node.Op<'isNot'> = {
  id: 'isNot',
  evaluate: args => !sameValue(args[0], args[1]),
  fold: args => {
    const left = args[0]!
    const right = args[1]!
    if (Node.key(left) === Node.key(right)) return Option.some(Node.Lit({ value: false }))
    return Option.none()
  },
}

export const isNullOp: Node.Op<'isNull'> = {
  id: 'isNull',
  evaluate: args => args[0] === null || args[0] === undefined,
}

export const oneOfOp: Node.Op<'oneOf'> = {
  id: 'oneOf',
  evaluate: args => {
    const needle = args[0]
    const haystack = args[1]
    if (!Array.isArray(haystack)) return false
    return haystack.some(item => sameValue(needle, item))
  },
  fold: args => {
    const haystack = args[1]!
    if (Node.$is('Lit')(haystack) && Array.isArray(haystack.value) && haystack.value.length === 0) {
      return Option.some(Node.Lit({ value: false }))
    }
    return Option.none()
  },
}

/**
 * Equality between two values of the same type.
 * The right operand is constrained by the left operand's type so literal unions
 * get autocomplete and typos (e.g. `Eq.is(row.status, 'typo')`) fail to compile.
 */
export const is = <
  L extends ExprInput<never, unknown>,
  R extends ExprInput<never, NoInfer<ValueOfInput<L>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(isOp, [left, right])

/** Inequality between two values of the same type. */
export const isNot = <
  L extends ExprInput<never, unknown>,
  R extends ExprInput<never, NoInfer<ValueOfInput<L>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(isNotOp, [left, right])

/** True when `value` is `null` (or `undefined` at an optional boundary). */
export const isNull = <X extends ExprInput<never, unknown>>(
  value: X,
): Expr<EnvOfInput<X>, boolean> => call(isNullOp, [value])

/** True when `value` equals one of the literal `candidates`. */
export const oneOf = <X extends ExprInput<never, unknown>>(
  value: X,
  candidates: ReadonlyArray<NoInfer<ValueOfInput<X>>>,
): Expr<EnvOfInput<X>, boolean> => call(oneOfOp, [value, candidates])
