/**
 * Boolean primitive operators (`bool.and`, `bool.or`, `bool.not`), three-valued
 * the way SQL's are: `false AND null` is false, `true AND null` is null.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type NullOf } from './core.js'

/** `and` when `decided` is false, `or` when it is true: `decided` wins over null and a refusal. */
const kleene =
  (id: 'bool.and' | 'bool.or', decided: boolean) =>
  (args: ReadonlyArray<unknown>): unknown => {
    if (args.includes(decided)) return decided
    const refused = args.find(Node.isRefusal)
    if (refused !== undefined) return refused
    const other = args.find(arg => arg !== null && typeof arg !== 'boolean')
    if (other !== undefined) return Node.illTyped(id, 'a boolean', other)
    return args.includes(null) ? null : !decided
  }

export const andOp: Node.Op<'bool.and'> = {
  id: 'bool.and',
  returns: 'boolean',
  nulls: 'own',
  evaluate: kleene('bool.and', false),
}

export const orOp: Node.Op<'bool.or'> = {
  id: 'bool.or',
  returns: 'boolean',
  nulls: 'own',
  evaluate: kleene('bool.or', true),
}

export const notOp: Node.Op<'bool.not'> = {
  id: 'bool.not',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: ([value]) =>
    typeof value === 'boolean' ? !value : Node.illTyped('bool.not', 'a boolean', value),
}

/** Conjunction of two boolean expressions. */
export const and = <
  L extends ExprInput<never, boolean | null>,
  R extends ExprInput<never, boolean | null>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> =>
  call(andOp, [left, right])

/** Disjunction of two boolean expressions. */
export const or = <
  L extends ExprInput<never, boolean | null>,
  R extends ExprInput<never, boolean | null>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => call(orOp, [left, right])

/** Logical negation of a boolean expression; the negation of null is null. */
export const not = <X extends ExprInput<never, boolean | null>>(
  value: X,
): Expr<EnvOfInput<X>, boolean | NullOf<X>> => call(notOp, [value])
