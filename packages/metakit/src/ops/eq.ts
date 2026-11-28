/**
 * Equality and set-membership primitive operators: `eq.is`, `eq.isNot` and
 * `eq.in`, and SQL's `=` and `in` (`eq.equals`, `eq.among`).
 *
 * `eq.is`, `eq.isNot` and `eq.in` are null-safe: null equals null and nothing
 * else, so these never give null; `eq.equals` and `eq.among` give null as SQL
 * does, and refuse NaN as the orders do. Uses Effect `Equal.equals` (with `Object.is` and `±0`
 * normalization). SQL lowering emits `IS NOT DISTINCT FROM` / `IS` on nullable
 * columns so JS and SQL never diverge.
 */
import { Equal } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type NullOf, type ValueOfInput } from './core.js'

const sameValue = (a: unknown, b: unknown): boolean => {
  const left = Node.textIdentity(a)
  const right = Node.textIdentity(b)
  return Object.is(left, right) || (left === 0 && right === 0) || Equal.equals(left, right)
}

const nullSafe =
  (id: 'eq.is' | 'eq.isNot', decide: (a: unknown, b: unknown) => boolean) =>
  (args: ReadonlyArray<unknown>): unknown =>
    args.find(Node.isRefusal) ??
    (Node.holdsNul(args) ? Node.unportable(id) : decide(args[0], args[1]))

export const isOp: Node.Op<'eq.is'> = {
  id: 'eq.is',
  returns: 'boolean',
  nulls: 'own',
  evaluate: nullSafe('eq.is', sameValue),
}

export const isNotOp: Node.Op<'eq.isNot'> = {
  id: 'eq.isNot',
  returns: 'boolean',
  nulls: 'own',
  evaluate: nullSafe('eq.isNot', (a, b) => !sameValue(a, b)),
}

export const inOp: Node.Op<'eq.in'> = {
  id: 'eq.in',
  returns: 'boolean',
  nulls: 'own',
  evaluate: args => {
    const refused = args.find(Node.isRefusal)
    if (refused !== undefined) return refused
    const [needle, haystack] = args
    if (!Array.isArray(haystack)) return Node.illTyped('eq.in', 'an array of candidates', haystack)
    if (Node.holdsNul([needle, ...haystack])) return Node.unportable('eq.in')
    return haystack.some(item => sameValue(needle, item === undefined ? null : item))
  },
}

/**
 * SQL's `=`: refused for text holding a NUL or for NaN, on either side and
 * before null; then null where either side is null.
 */
export const equalsOp: Node.Op<'eq.equals'> = {
  id: 'eq.equals',
  returns: 'boolean',
  nulls: 'strict',
  refuses: value => Node.refusedForEquality('eq.equals', value),
  evaluate: args => sameValue(args[0], args[1]),
}

/**
 * SQL's `in`. In order: a refused operand refuses; a null list gives null; no candidate gives false,
 * whatever the value, null included (SQLite's `x in ()`, and what Drizzle
 * writes for an empty `inArray`); text holding a NUL or NaN, in the value or a
 * candidate, refuses; a null value gives null; then true for a match, null
 * where none matches beside a null candidate, and false.
 */
export const amongOp: Node.Op<'eq.among'> = {
  id: 'eq.among',
  returns: 'boolean',
  nulls: 'own',
  evaluate: args => {
    const refused = args.find(Node.isRefusal)
    if (refused !== undefined) return refused
    const [needle, candidates] = args
    // A list not given (an optional filter's input) is null, as a strict operand is.
    if (candidates === null) return null
    if (!Array.isArray(candidates)) {
      return Node.illTyped('eq.among', 'an array of candidates', candidates)
    }
    if (candidates.length === 0) return false
    const screened = Node.refusedForEquality('eq.among', [needle, candidates])
    if (screened !== undefined) return screened
    if (needle === null) return null
    const present = candidates.filter(item => item !== null && item !== undefined)
    if (present.some(item => sameValue(needle, item))) return true
    return present.length < candidates.length ? null : false
  },
}

/**
 * Equality between two values of the same type; null equals only null.
 * The right operand is constrained by the left operand's type so literal unions
 * get autocomplete and typos (e.g. `Eq.is(row.status, 'typo')`) fail to compile.
 */
export const is = <
  L extends ExprInput<never, unknown>,
  R extends ExprInput<never, NoInfer<ValueOfInput<L>> | null>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(isOp, [left, right])

/** Inequality between two values of the same type. */
export const isNot = <
  L extends ExprInput<never, unknown>,
  R extends ExprInput<never, NoInfer<ValueOfInput<L>> | null>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(isNotOp, [left, right])

/**
 * Equality as SQL's `=` answers it: null where either side is null, so a rule
 * over a missing value does not hold; NaN and text holding a NUL are refused.
 * `Eq.is` is the equality where null equals null.
 */
export const equals = <
  L extends ExprInput<never, unknown>,
  R extends ExprInput<never, NoInfer<ValueOfInput<L>> | null>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> =>
  call(equalsOp, [left, right])

/**
 * Membership as SQL's `in` answers it: false among no candidate, null for a
 * null `value` among some, and null where nothing matches and a candidate is
 * null. Text holding a NUL and NaN are refused. `Eq.oneOf` never gives null.
 */
export const among = <
  X extends ExprInput<never, unknown>,
  const C extends ReadonlyArray<NoInfer<Exclude<ValueOfInput<X>, null>> | null>,
>(
  value: X,
  candidates: C,
): Expr<EnvOfInput<X>, boolean | NullOf<X> | (null extends C[number] ? null : never)> =>
  call(amongOp, [value, candidates])

/** True when `value` equals one of the literal `candidates`. */
export const inSet = <X extends ExprInput<never, unknown>>(
  value: X,
  candidates: ReadonlyArray<NoInfer<ValueOfInput<X>>>,
): Expr<EnvOfInput<X>, boolean> => call(inOp, [value, candidates])

export { inSet as in, inSet as oneOf }
