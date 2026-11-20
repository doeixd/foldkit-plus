/**
 * Boolean operators (`and`, `or`, `not`) with size-reducing Kleene $K_3$ folds.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

const litBool = (node: Node.Node): Option.Option<boolean> =>
  Node.$is('Lit')(node) && typeof node.value === 'boolean' ? Option.some(node.value) : Option.none()

export const andOp: Node.Op<'and'> = {
  id: 'and',
  evaluate: args => Boolean(args[0]) && Boolean(args[1]),
  fold: args => {
    const left = args[0]!
    const right = args[1]!
    const l = litBool(left)
    if (Option.isSome(l)) return Option.some(l.value ? right : Node.Lit({ value: false }))
    const r = litBool(right)
    if (Option.isSome(r)) return Option.some(r.value ? left : Node.Lit({ value: false }))
    if (Node.key(left) === Node.key(right)) return Option.some(left)
    return Option.none()
  },
}

export const orOp: Node.Op<'or'> = {
  id: 'or',
  evaluate: args => Boolean(args[0]) || Boolean(args[1]),
  fold: args => {
    const left = args[0]!
    const right = args[1]!
    const l = litBool(left)
    if (Option.isSome(l)) return Option.some(l.value ? Node.Lit({ value: true }) : right)
    const r = litBool(right)
    if (Option.isSome(r)) return Option.some(r.value ? Node.Lit({ value: true }) : left)
    if (Node.key(left) === Node.key(right)) return Option.some(left)
    return Option.none()
  },
}

export const notOp: Node.Op<'not'> = {
  id: 'not',
  evaluate: args => !Boolean(args[0]),
  fold: args => {
    const inner = args[0]!
    const v = litBool(inner)
    if (Option.isSome(v)) return Option.some(Node.Lit({ value: !v.value }))
    if (Node.$is('Call')(inner) && inner.op.id === 'not' && inner.args.length === 1) {
      return Option.some(inner.args[0]!)
    }
    return Option.none()
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
