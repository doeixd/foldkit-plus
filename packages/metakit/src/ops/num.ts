/**
 * Numeric arithmetic primitives (`num.add`, `num.sub`, `num.mul`, `num.neg`)
 * and derived helpers (`min`, `max`, `abs`, `clamp`) built over `If` + `Ord`.
 *
 * `Ord` comparisons (`lt`, `lte`, `gt`, `gte`) are also re-exported here for
 * ergonomic `Num.lte(...)` call sites.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, toNode, wrap, type EnvOfInput, type ExprInput } from './core.js'
import * as Ord from './ord.js'

export { gt, gte, gtOp, gteOp, lt, lte, ltOp, lteOp } from './ord.js'

export const addOp: Node.Op<'num.add'> = {
  id: 'num.add',
  evaluate: args => (args[0] as number) + (args[1] as number),
  laws: {
    identity: { value: 0, side: 'both' },
  },
}

export const subOp: Node.Op<'num.sub'> = {
  id: 'num.sub',
  evaluate: args => (args[0] as number) - (args[1] as number),
  laws: {
    identity: { value: 0, side: 'right' },
    reflexive: { value: 0 },
  },
}

export const mulOp: Node.Op<'num.mul'> = {
  id: 'num.mul',
  evaluate: args => (args[0] as number) * (args[1] as number),
  laws: {
    identity: { value: 1, side: 'both' },
    absorbing: { value: 0, result: 0, side: 'both' },
  },
}

export const negOp: Node.Op<'num.neg'> = {
  id: 'num.neg',
  evaluate: args => -(args[0] as number),
  laws: {
    involution: true,
  },
}

export const add = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> => call(addOp, [left, right])

export const sub = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> => call(subOp, [left, right])

export const mul = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> => call(mulOp, [left, right])

export const neg = <X extends ExprInput<never, number>>(value: X): Expr<EnvOfInput<X>, number> =>
  call(negOp, [value])

/** Derived helper: `if (a <= b) then a else b` — lowers to SQL, Zone, and Z3 automatically. */
export const min = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> =>
  wrap(
    Node.If({
      cond: Ord.lte(left, right).node,
      then: toNode(left),
      otherwise: toNode(right),
    }),
  )

/** Derived helper: `if (a >= b) then a else b` — lowers to SQL, Zone, and Z3 automatically. */
export const max = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> =>
  wrap(
    Node.If({
      cond: Ord.gte(left, right).node,
      then: toNode(left),
      otherwise: toNode(right),
    }),
  )

/** Derived helper: `if (x < 0) then -x else x` — lowers to SQL, Zone, and Z3 automatically. */
export const abs = <X extends ExprInput<never, number>>(value: X): Expr<EnvOfInput<X>, number> =>
  wrap(
    Node.If({
      cond: Ord.lt(value, 0).node,
      then: neg(value).node,
      otherwise: toNode(value),
    }),
  )

/** Derived helper: `min(hi, max(lo, x))` — lowers to SQL, Zone, and Z3 automatically. */
export const clamp = <
  X extends ExprInput<never, number>,
  Lo extends ExprInput<never, number>,
  Hi extends ExprInput<never, number>,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, number> => min(hi, max(lo, value))
