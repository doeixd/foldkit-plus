/**
 * String primitives (`str.len`, `str.startsWith`, `str.contains`,
 * `str.lowerAscii`, `str.trim`, the code-point orders `str.lt`, `str.lte`,
 * `str.gt`, `str.gte`) and derived helper (`Str.isEmpty`). Null-strict: a null string gives null, and text
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

export const wellFormed = (text: string): string => text.replace(LONE_SURROGATE, REPLACEMENT)

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

export const lowerAsciiOp: Node.Op<'str.lowerAscii'> = {
  id: 'str.lowerAscii',
  returns: 'text',
  nulls: 'strict',
  evaluate: textual('str.lowerAscii', ([text]) =>
    text!.replace(/[A-Z]/g, letter => letter.toLowerCase()),
  ),
}

/** The white space every database trims alike: space, tab, line feed, carriage return. */
const EDGE_SPACE = /^[ \t\n\r]+|[ \t\n\r]+$/g

export const trimOp: Node.Op<'str.trim'> = {
  id: 'str.trim',
  returns: 'text',
  nulls: 'strict',
  evaluate: textual('str.trim', ([text]) => text!.replace(EDGE_SPACE, '')),
}

/** -1, 0 or 1 as `a` is before, at or after `b` by code point, which UTF-16 order is not. */
export const byCodePoint = (a: string, b: string): number => {
  const [left, right] = [Array.from(a), Array.from(b)]
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const [x, y] = [left[index]!.codePointAt(0)!, right[index]!.codePointAt(0)!]
    if (x !== y) return x < y ? -1 : 1
  }
  return Math.sign(left.length - right.length)
}

const order = <Id extends 'str.lt' | 'str.lte' | 'str.gt' | 'str.gte'>(
  id: Id,
  holds: (sign: number) => boolean,
): Node.Op<Id> => ({
  id,
  returns: 'boolean',
  nulls: 'strict',
  evaluate: textual(id, ([a, b]) => holds(byCodePoint(a!, b!))),
})

export const ltOp = order('str.lt', sign => sign < 0)
export const lteOp = order('str.lte', sign => sign <= 0)
export const gtOp = order('str.gt', sign => sign > 0)
export const gteOp = order('str.gte', sign => sign >= 0)

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

/** `value` with A to Z lowered and every other character kept: no locale's casing. */
export const lowerAscii = <S extends NullableText>(
  value: S,
): Expr<EnvOfInput<S>, string | NullOf<S>> => call(lowerAsciiOp, [value])

/** `value` without leading or trailing space, tab, line feed or carriage return. */
export const trim = <S extends NullableText>(value: S): Expr<EnvOfInput<S>, string | NullOf<S>> =>
  call(trimOp, [value])

type TextOrder = <L extends NullableText, R extends NullableText>(
  left: L,
  right: R,
) => Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>>

/** `left` sorts before `right` by code point (a database's binary, or `COLLATE "C"`, order). */
export const lt: TextOrder = (left, right) => call(ltOp, [left, right])
/** `left` sorts before `right`, or is it, by code point. */
export const lte: TextOrder = (left, right) => call(lteOp, [left, right])
/** `left` sorts after `right` by code point. */
export const gt: TextOrder = (left, right) => call(gtOp, [left, right])
/** `left` sorts after `right`, or is it, by code point. */
export const gte: TextOrder = (left, right) => call(gteOp, [left, right])

/** Derived helper: `Eq.is(Str.len(s), 0)`; false for a null string, whose length is null. */
export const isEmpty = <S extends NullableText>(value: S): Expr<EnvOfInput<S>, boolean> =>
  call(Eq.isOp, [len(value), 0])
