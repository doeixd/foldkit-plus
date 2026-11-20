/**
 * String primitives (`str.len`, `str.startsWith`, `str.contains`) and derived
 * helper (`Str.isEmpty`).
 *
 * `str.len` counts Unicode code points (`[...s].length`) so JavaScript,
 * Postgres (`char_length`), and SQLite (`length`) agree identically on
 * surrogate pairs and emoji.
 */
import type * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput } from './core.js'
import * as Eq from './eq.js'

/** Count Unicode code points in `s` (matches Postgres `char_length` and SQLite `length`). */
export const codePointLength = (s: string): number => {
  let count = 0
  for (const _ of s) count++
  return count
}

export const lenOp: Node.Op<'str.len'> = {
  id: 'str.len',
  evaluate: args => (typeof args[0] === 'string' ? codePointLength(args[0]) : 0),
}

export const startsWithOp: Node.Op<'str.startsWith'> = {
  id: 'str.startsWith',
  laws: {
    absorbing: { value: '', result: true, side: 'right' },
  },
  evaluate: args =>
    typeof args[0] === 'string' && typeof args[1] === 'string'
      ? args[0].startsWith(args[1])
      : false,
}

export const containsOp: Node.Op<'str.contains'> = {
  id: 'str.contains',
  laws: {
    absorbing: { value: '', result: true, side: 'right' },
  },
  evaluate: args =>
    typeof args[0] === 'string' && typeof args[1] === 'string' ? args[0].includes(args[1]) : false,
}

/** Unicode code-point length of a string (always `>= 0`). */
export const len = <S extends ExprInput<never, string>>(value: S): Expr<EnvOfInput<S>, number> =>
  call(lenOp, [value])

/** True when `value` begins with `prefix`. */
export const startsWith = <S extends ExprInput<never, string>, P extends ExprInput<never, string>>(
  value: S,
  prefix: P,
): Expr<EnvOfInput<S> & EnvOfInput<P>, boolean> => call(startsWithOp, [value, prefix])

/** True when `value` contains `substring`. */
export const contains = <S extends ExprInput<never, string>, Sub extends ExprInput<never, string>>(
  value: S,
  substring: Sub,
): Expr<EnvOfInput<S> & EnvOfInput<Sub>, boolean> => call(containsOp, [value, substring])

/** Derived helper: `Eq.is(Str.len(s), 0)` — zero extra tier boilerplate. */
export const isEmpty = <S extends ExprInput<never, string>>(
  value: S,
): Expr<EnvOfInput<S>, boolean> => Eq.is(len(value), 0)
