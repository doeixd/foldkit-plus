/**
 * String primitives (`str.len`, `str.startsWith`, `str.contains`) and derived
 * helper (`Str.isEmpty`). Null-strict: a null string gives null.
 *
 * `str.len` counts Unicode code points (`[...s].length`) so JavaScript,
 * Postgres (`char_length`), and SQLite (`length`) agree identically on
 * surrogate pairs and emoji.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type NullOf } from './core.js'
import * as Eq from './eq.js'

/** A text operand; where it may be null, so may the result. */
export type NullableText = ExprInput<never, string | null>

/** Count Unicode code points in `s` (matches Postgres `char_length` and SQLite `length`). */
export const codePointLength = (s: string): number => {
  let count = 0
  for (const _ of s) count++
  return count
}

export const lenOp: Node.Op<'str.len'> = {
  id: 'str.len',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([text]) =>
    typeof text === 'string' ? codePointLength(text) : Node.illTyped('str.len', 'a string', text),
}

const search =
  (id: 'str.startsWith' | 'str.contains', decide: (text: string, part: string) => boolean) =>
  ([text, part]: ReadonlyArray<unknown>): unknown => {
    if (typeof text !== 'string') return Node.illTyped(id, 'a string', text)
    if (typeof part !== 'string') return Node.illTyped(id, 'a string', part)
    return decide(text, part)
  }

// Neither declares `op(x, '') -> true`: over a null `x` it is null.
export const startsWithOp: Node.Op<'str.startsWith'> = {
  id: 'str.startsWith',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: search('str.startsWith', (text, part) => text.startsWith(part)),
}

export const containsOp: Node.Op<'str.contains'> = {
  id: 'str.contains',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: search('str.contains', (text, part) => text.includes(part)),
}

/** Unicode code-point length of a string (always `>= 0`). */
export const len = <S extends NullableText>(value: S): Expr<EnvOfInput<S>, number | NullOf<S>> =>
  call(lenOp, [value])

/** True when `value` begins with `prefix`. */
export const startsWith = <S extends NullableText, P extends NullableText>(
  value: S,
  prefix: P,
): Expr<EnvOfInput<S> & EnvOfInput<P>, boolean | NullOf<S> | NullOf<P>> =>
  call(startsWithOp, [value, prefix])

/** True when `value` contains `substring`. */
export const contains = <S extends NullableText, Sub extends NullableText>(
  value: S,
  substring: Sub,
): Expr<EnvOfInput<S> & EnvOfInput<Sub>, boolean | NullOf<S> | NullOf<Sub>> =>
  call(containsOp, [value, substring])

/** Derived helper: `Eq.is(Str.len(s), 0)`; false for a null string, whose length is null. */
export const isEmpty = <S extends NullableText>(value: S): Expr<EnvOfInput<S>, boolean> =>
  call(Eq.isOp, [len(value), 0])
