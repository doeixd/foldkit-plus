/**
 * Ordering primitives (`ord.lt`, `ord.lte`, `ord.gt`, `ord.gte`) and derived
 * range helper (`Ord.between`).
 */
import type * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

export const ltOp: Node.Op<'ord.lt'> = {
  id: 'ord.lt',
  evaluate: args => (args[0] as number) < (args[1] as number),
  laws: { reflexive: { value: false } },
}

export const lteOp: Node.Op<'ord.lte'> = {
  id: 'ord.lte',
  evaluate: args => (args[0] as number) <= (args[1] as number),
  laws: { reflexive: { value: true } },
}

export const gtOp: Node.Op<'ord.gt'> = {
  id: 'ord.gt',
  evaluate: args => (args[0] as number) > (args[1] as number),
  laws: { reflexive: { value: false } },
}

export const gteOp: Node.Op<'ord.gte'> = {
  id: 'ord.gte',
  evaluate: args => (args[0] as number) >= (args[1] as number),
  laws: { reflexive: { value: true } },
}

export const lt = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(ltOp, [left, right])

export const lte = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(lteOp, [left, right])

export const gt = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(gtOp, [left, right])

export const gte = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean> => call(gteOp, [left, right])

/** Derived helper: `Bool.and(Ord.gte(x, lo), Ord.lte(x, hi))` — zero extra tier boilerplate. */
export const between = <
  X extends ExprInput<never, number>,
  Lo extends ExprInput<never, number>,
  Hi extends ExprInput<never, number>,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, boolean> =>
  Bool.and(gte(value, lo), lte(value, hi))
