/**
 * Boolean primitive operators (`bool.and`, `bool.or`, `bool.not`) with
 * declarative size-reducing `laws`.
 */
import type * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

export const andOp: Node.Op<'bool.and'> = {
  id: 'bool.and',
  evaluate: args => Boolean(args[0]) && Boolean(args[1]),
  laws: {
    identity: { value: true, side: 'both' },
    absorbing: { value: false, result: false, side: 'both' },
    idempotent: true,
  },
}

export const orOp: Node.Op<'bool.or'> = {
  id: 'bool.or',
  evaluate: args => Boolean(args[0]) || Boolean(args[1]),
  laws: {
    identity: { value: false, side: 'both' },
    absorbing: { value: true, result: true, side: 'both' },
    idempotent: true,
  },
}

export const notOp: Node.Op<'bool.not'> = {
  id: 'bool.not',
  evaluate: args => !Boolean(args[0]),
  laws: {
    involution: true,
  },
}

/** Conjunction of two boolean expressions. */
export const and = <L extends ExprInput<never, boolean>, R extends ExprInput<never, boolean>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(andOp, [left, right])

/** Disjunction of two boolean expressions. */
export const or = <L extends ExprInput<never, boolean>, R extends ExprInput<never, boolean>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(orOp, [left, right])

/** Logical negation of a boolean expression. */
export const not = <X extends ExprInput<never, boolean>>(value: X): Expr<EnvOfInput<X>, boolean> =>
  call(notOp, [value])
