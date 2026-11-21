/**
 * String primitives (`str.len`, `str.startsWith`, `str.contains`) and derived
 * helper (`Str.isEmpty`). Null-strict: a null string gives null, and text
 * holding a NUL character is refused (`unportable`).
 *
 * `str.len` counts Unicode code points (`[...s].length`) so JavaScript,
 * Postgres (`char_length`), and SQLite (`length`) agree identically on
 * surrogate pairs and emoji. Text is compared by character, as a database
 * holds it: a lone surrogate, which UTF-8 cannot encode, reads as U+FFFD.
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

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** `text` as SQLite's and Postgres's drivers hold it: each lone surrogate as U+FFFD. */
const REPLACEMENT = String.fromCharCode(0xfffd)

const wellFormed = (text: string): string => text.replace(LONE_SURROGATE, REPLACEMENT)

/**
 * A text operation over its operands, each a string without a NUL. Over
 * well-formed text a match by UTF-16 unit starts and ends on a character.
 */
const textual =
  <A>(id: Node.CoreOpId, decide: (texts: ReadonlyArray<string>) => A) =>
  (args: ReadonlyArray<unknown>): unknown => {
    const other = args.find(arg => typeof arg !== 'string')
    if (other !== undefined) return Node.illTyped(id, 'a string', other)
    if (Node.holdsNul(args)) return Node.unportable(id)
    return decide((args as ReadonlyArray<string>).map(wellFormed))
  }

export const lenOp: Node.Op<'str.len'> = {
  id: 'str.len',
  returns: 'number',
  nulls: 'strict',
  evaluate: textual('str.len', ([text]) => codePointLength(text!)),
}

// Neither declares `op(x, '') -> true`: over a null `x` it is null.
export const startsWithOp: Node.Op<'str.startsWith'> = {
  id: 'str.startsWith',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: textual('str.startsWith', ([text, part]) => text!.startsWith(part!)),
}

export const containsOp: Node.Op<'str.contains'> = {
  id: 'str.contains',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: textual('str.contains', ([text, part]) => text!.includes(part!)),
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
