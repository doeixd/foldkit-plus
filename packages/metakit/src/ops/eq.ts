/**
 * Equality and set-membership primitive operators (`eq.is`, `eq.isNot`, `eq.in`).
 *
 * Equality is null-safe: null equals null and nothing else, so these never
 * give null. Uses Effect `Equal.equals` (with `Object.is` and `±0`
 * normalization). SQL lowering emits `IS NOT DISTINCT FROM` / `IS` on nullable
 * columns so JS and SQL never diverge.
 */
import { Equal, Option } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type ValueOfInput } from './core.js'

const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (a === 0 && b === 0) || Equal.equals(a, b)

const nullSafe =
  (decide: (a: unknown, b: unknown) => boolean) =>
  (args: ReadonlyArray<unknown>): unknown =>
    args.find(Node.isRefusal) ?? decide(args[0], args[1])

export const isOp: Node.Op<'eq.is'> = {
  id: 'eq.is',
  returns: 'boolean',
  nulls: 'own',
  evaluate: nullSafe(sameValue),
  laws: {
    reflexive: { value: true },
  },
}

export const isNotOp: Node.Op<'eq.isNot'> = {
  id: 'eq.isNot',
  returns: 'boolean',
  nulls: 'own',
  evaluate: nullSafe((a, b) => !sameValue(a, b)),
  laws: {
    reflexive: { value: false },
  },
}

/** A literal or a path: a term evaluation reads and cannot refuse. */
const isRead = (node: Node.Node): boolean => Node.$is('Lit')(node) || Node.$is('Path')(node)

export const inOp: Node.Op<'eq.in'> = {
  id: 'eq.in',
  returns: 'boolean',
  nulls: 'own',
  evaluate: args => {
    const refused = args.find(Node.isRefusal)
    if (refused !== undefined) return refused
    const [needle, haystack] = args
    if (!Array.isArray(haystack)) return Node.illTyped('eq.in', 'an array of candidates', haystack)
    return haystack.some(item => sameValue(needle, item === undefined ? null : item))
  },
  fold: args => {
    const needle = args[0]!
    const haystack = args[1]!
    if (!Node.$is('Lit')(haystack) || !Array.isArray(haystack.value)) return Option.none()
    // A refused needle is refused, not false: only a read is known not to be.
    if (haystack.value.length === 0 && isRead(needle)) {
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

/** True when `value` equals one of the literal `candidates`. */
export const inSet = <X extends ExprInput<never, unknown>>(
  value: X,
  candidates: ReadonlyArray<NoInfer<ValueOfInput<X>>>,
): Expr<EnvOfInput<X>, boolean> => call(inOp, [value, candidates])

export { inSet as in, inSet as oneOf }
