/**
 * Equality and set-membership primitive operators: `eq.is`, `eq.isNot` and
 * `eq.in`, and SQL's `=` and `in` (`eq.equals`, `eq.among`).
 *
 * `eq.is`, `eq.isNot` and `eq.in` are null-safe: null equals null and nothing
 * else, so these never give null; `eq.equals` and `eq.among` give null as SQL does. Uses Effect `Equal.equals` (with `Object.is` and `±0`
 * normalization). SQL lowering emits `IS NOT DISTINCT FROM` / `IS` on nullable
 * columns so JS and SQL never diverge.
 */
import { Equal, Option } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type NullOf, type ValueOfInput } from './core.js'
import { isPortableRead } from './kind.js'

const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (a === 0 && b === 0) || Equal.equals(a, b)

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
  fold: args => {
    const needle = args[0]!
    const haystack = args[1]!
    if (!Node.$is('Lit')(haystack) || !Array.isArray(haystack.value)) return Option.none()
    // A refused needle is refused, not false: only a read of no NUL text is known not to be.
    if (haystack.value.length === 0 && isPortableRead(needle)) {
      return Option.some(Node.Lit({ value: false }))
    }
    if (haystack.value.length === 1) {
      return Option.some(
        Node.Call({ op: isOp, args: [needle, Node.Lit({ value: haystack.value[0] })] }),
      )
    }
    return Option.none()
  },
}

/** SQL's `=`: null where either side is null, and refused for text holding a NUL. */
export const equalsOp: Node.Op<'eq.equals'> = {
  id: 'eq.equals',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: args =>
    Node.holdsNul(args) ? Node.unportable('eq.equals') : sameValue(args[0], args[1]),
}

/**
 * SQL's `in`: null for a null value, true for a match, and otherwise null
 * where a candidate is null and false where none is.
 */
export const amongOp: Node.Op<'eq.among'> = {
  id: 'eq.among',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: ([needle, candidates]) => {
    if (!Array.isArray(candidates)) {
      return Node.illTyped('eq.among', 'an array of candidates', candidates)
    }
    if (Node.holdsNul([needle, ...candidates])) return Node.unportable('eq.among')
    const present = candidates.filter(item => item !== null && item !== undefined)
    if (present.some(item => sameValue(needle, item))) return true
    return present.length < candidates.length ? null : false
  },
  fold: args => {
    const candidates = args[1]!
    if (!Node.$is('Lit')(candidates) || !Array.isArray(candidates.value)) return Option.none()
    const [only] = candidates.value
    return candidates.value.length === 1 && only !== null && only !== undefined
      ? Option.some(Node.Call({ op: equalsOp, args: [args[0]!, Node.Lit({ value: only })] }))
      : Option.none()
  },
}

/**
 * Equality between two values of the same type; null equals only null.
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

/**
 * Equality as SQL's `=` answers it: null where either side is null, so a rule
 * over a missing value does not hold. `Eq.is` is the equality where null
 * equals null.
 */
export const equals = <
  L extends ExprInput<never, unknown>,
  R extends ExprInput<never, NoInfer<ValueOfInput<L>>>,
>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> =>
  call(equalsOp, [left, right])

/**
 * Membership as SQL's `in` answers it: null for a null `value`, and null
 * where nothing matches and a candidate is null. `Eq.oneOf` never gives null.
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
