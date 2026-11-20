/**
 * Numeric comparison and arithmetic operators (`lt`, `lte`, `gt`, `gte`, `add`,
 * `sub`, `mul`, `neg`, `min`, `max`, `abs`).
 *
 * Each operator is a standalone export holding its own descriptor and
 * size-reducing fold, so a page importing `Num.lte` keeps only `lte`.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

const litNum = (node: Node.Node): Option.Option<number> =>
  Node.$is('Lit')(node) && typeof node.value === 'number' ? Option.some(node.value) : Option.none()

export const ltOp: Node.Op<'lt'> = {
  id: 'lt',
  evaluate: args => (args[0] as number) < (args[1] as number),
  fold: args =>
    Node.key(args[0]!) === Node.key(args[1]!)
      ? Option.some(Node.Lit({ value: false }))
      : Option.none(),
}

export const lteOp: Node.Op<'lte'> = {
  id: 'lte',
  evaluate: args => (args[0] as number) <= (args[1] as number),
  fold: args =>
    Node.key(args[0]!) === Node.key(args[1]!)
      ? Option.some(Node.Lit({ value: true }))
      : Option.none(),
}

export const gtOp: Node.Op<'gt'> = {
  id: 'gt',
  evaluate: args => (args[0] as number) > (args[1] as number),
  fold: args =>
    Node.key(args[0]!) === Node.key(args[1]!)
      ? Option.some(Node.Lit({ value: false }))
      : Option.none(),
}

export const gteOp: Node.Op<'gte'> = {
  id: 'gte',
  evaluate: args => (args[0] as number) >= (args[1] as number),
  fold: args =>
    Node.key(args[0]!) === Node.key(args[1]!)
      ? Option.some(Node.Lit({ value: true }))
      : Option.none(),
}

export const addOp: Node.Op<'add'> = {
  id: 'add',
  evaluate: args => (args[0] as number) + (args[1] as number),
  fold: args => {
    const l = litNum(args[0]!)
    if (Option.isSome(l) && l.value === 0) return Option.some(args[1]!)
    const r = litNum(args[1]!)
    if (Option.isSome(r) && r.value === 0) return Option.some(args[0]!)
    return Option.none()
  },
}

export const subOp: Node.Op<'sub'> = {
  id: 'sub',
  evaluate: args => (args[0] as number) - (args[1] as number),
  fold: args => {
    const r = litNum(args[1]!)
    if (Option.isSome(r) && r.value === 0) return Option.some(args[0]!)
    if (Node.key(args[0]!) === Node.key(args[1]!)) return Option.some(Node.Lit({ value: 0 }))
    return Option.none()
  },
}

export const mulOp: Node.Op<'mul'> = {
  id: 'mul',
  evaluate: args => (args[0] as number) * (args[1] as number),
  fold: args => {
    const l = litNum(args[0]!)
    if (Option.isSome(l)) {
      if (l.value === 0) return Option.some(Node.Lit({ value: 0 }))
      if (l.value === 1) return Option.some(args[1]!)
    }
    const r = litNum(args[1]!)
    if (Option.isSome(r)) {
      if (r.value === 0) return Option.some(Node.Lit({ value: 0 }))
      if (r.value === 1) return Option.some(args[0]!)
    }
    return Option.none()
  },
}

export const negOp: Node.Op<'neg'> = {
  id: 'neg',
  evaluate: args => -(args[0] as number),
  fold: args => {
    const inner = args[0]!
    if (Node.$is('Call')(inner) && inner.op.id === 'neg' && inner.args.length === 1) {
      return Option.some(inner.args[0]!)
    }
    return Option.none()
  },
}

export const minOp: Node.Op<'min'> = {
  id: 'min',
  evaluate: args => Math.min(args[0] as number, args[1] as number),
  fold: args => (Node.key(args[0]!) === Node.key(args[1]!) ? Option.some(args[0]!) : Option.none()),
}

export const maxOp: Node.Op<'max'> = {
  id: 'max',
  evaluate: args => Math.max(args[0] as number, args[1] as number),
  fold: args => (Node.key(args[0]!) === Node.key(args[1]!) ? Option.some(args[0]!) : Option.none()),
}

export const absOp: Node.Op<'abs'> = {
  id: 'abs',
  evaluate: args => Math.abs(args[0] as number),
  fold: args => {
    const inner = args[0]!
    if (Node.$is('Call')(inner) && inner.op.id === 'abs' && inner.args.length === 1) {
      return Option.some(inner)
    }
    return Option.none()
  },
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

export const min = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> => call(minOp, [left, right])

export const max = <L extends ExprInput<never, number>, R extends ExprInput<never, number>>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, number> => call(maxOp, [left, right])

export const abs = <X extends ExprInput<never, number>>(value: X): Expr<EnvOfInput<X>, number> =>
  call(absOp, [value])
