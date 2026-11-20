/**
 * String operators (`len`, `startsWith`, `contains`).
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'

const litStr = (node: Node.Node): Option.Option<string> =>
  Node.$is('Lit')(node) && typeof node.value === 'string' ? Option.some(node.value) : Option.none()

export const lenOp: Node.Op<'len'> = {
  id: 'len',
  evaluate: args => (args[0] as string).length,
}

export const startsWithOp: Node.Op<'startsWith'> = {
  id: 'startsWith',
  evaluate: args => (args[0] as string).startsWith(args[1] as string),
  fold: args => {
    const prefix = litStr(args[1]!)
    if (Option.isSome(prefix) && prefix.value === '') {
      return Option.some(Node.Lit({ value: true }))
    }
    return Option.none()
  },
}

export const containsOp: Node.Op<'contains'> = {
  id: 'contains',
  evaluate: args => (args[0] as string).includes(args[1] as string),
  fold: args => {
    const needle = litStr(args[1]!)
    if (Option.isSome(needle) && needle.value === '') {
      return Option.some(Node.Lit({ value: true }))
    }
    return Option.none()
  },
}

export const len = <X extends ExprInput<never, string>>(value: X): Expr<EnvOfInput<X>, number> =>
  call(lenOp, [value])

export const startsWith = <S extends ExprInput<never, string>, P extends ExprInput<never, string>>(
  value: S,
  prefix: P,
): Expr<EnvOfInput<S> & EnvOfInput<P>, boolean> => call(startsWithOp, [value, prefix])

export const contains = <S extends ExprInput<never, string>, N extends ExprInput<never, string>>(
  value: S,
  needle: N,
): Expr<EnvOfInput<S> & EnvOfInput<N>, boolean> => call(containsOp, [value, needle])
