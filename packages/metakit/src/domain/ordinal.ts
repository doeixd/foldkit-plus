/**
 * `Ordinal`: lexicographic fractional-index ordering keys (`@doeixd/metakit/domain`).
 *
 * Uses base-62 ASCII digits (`0-9A-Za-z`, strictly ascending by Unicode code
 * point), so JavaScript (`Str.lt`), Postgres (`ORDER BY col COLLATE "C"` /
 * code-point), SQLite (`ORDER BY col`), and Z3 agree identically.
 *
 * `Ordinal.between(a, b)` generates a key strictly between `a` and `b` in
 * O(max(|a|, |b|)) without renumbering sibling rows.
 */
import { Schema } from 'effect'
import * as Bool from '../ops/bool.js'
import type { EnvOfInput, ExprInput, NullOf } from '../ops/core.js'
import * as Str from '../ops/str.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

declare const OrdinalBrand: unique symbol

/** A base-62 lexicographic ordinal key (`0-9A-Za-z`, non-empty). */
export type OrdinalValue = string & { readonly [OrdinalBrand]: true }

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = ALPHABET.length // 62
const MID = ALPHABET[Math.floor(BASE / 2)]! // 'V'
const MIN_DIGIT = ALPHABET[0]! // '0'
const MAX_DIGIT = ALPHABET[BASE - 1]! // 'z'
const VALID_RE = /^[0-9A-Za-z]+$/

const digitOf = (ch: string): number => {
  const idx = ALPHABET.indexOf(ch)
  if (idx < 0) throw new Error(`[metakit] Ordinal: invalid digit "${ch}"`)
  return idx
}

/** Effect Schema for base-62 ordinal keys (`nulFree`, non-empty). */
export const schema: Schema.Codec<OrdinalValue, string> = Schema.String.check(
  Schema.isMinLength(1),
  Schema.makeFilter<string>(
    value => {
      if (value.includes('\u0000') || !VALID_RE.test(value)) {
        return 'ordinal must be a non-empty base-62 string (0-9A-Za-z)'
      }
      return undefined
    },
    {
      [DOMAIN_ANNOTATION_KEY]: { kind: 'ordinal' },
      expected: 'base-62 ordinal key',
    } as Schema.Annotations.Filter,
  ),
) as unknown as Schema.Codec<OrdinalValue, string>

/** Initial midpoint ordinal key for the first item in an ordered collection. */
export const initial: OrdinalValue = `${MID}` as OrdinalValue

/** Validate and brand a raw base-62 ordinal string. */
export const from = (raw: string): OrdinalValue => {
  if (raw.length === 0 || !VALID_RE.test(raw)) {
    throw new Error(`[metakit] Ordinal.from: invalid ordinal "${raw}"`)
  }
  return raw as OrdinalValue
}

/** Generate an ordinal key strictly between `a` and `b` (`a < result < b`). */
export const between = (a: OrdinalValue, b: OrdinalValue): OrdinalValue => {
  if (a >= b) {
    throw new Error(`[metakit] Ordinal.between: expected a < b, got "${a}" >= "${b}"`)
  }
  let i = 0
  let prefix = ''
  while (true) {
    const da = i < a.length ? digitOf(a[i]!) : 0
    const db = i < b.length ? digitOf(b[i]!) : BASE
    if (da === db) {
      prefix += i < a.length ? a[i]! : MIN_DIGIT
      i++
      continue
    }
    if (db - da > 1) {
      return (prefix + ALPHABET[Math.floor((da + db) / 2)]!) as OrdinalValue
    }
    // Adjacent digits (db === da + 1): extend under `a`'s branch so result > a and result < b
    prefix += i < a.length ? a[i]! : MIN_DIGIT
    i++
    while (i < a.length) {
      const nextA = digitOf(a[i]!)
      if (nextA < BASE - 1) {
        return (prefix + ALPHABET[Math.floor((nextA + BASE) / 2)]!) as OrdinalValue
      }
      prefix += a[i]!
      i++
    }
    return (prefix + MID) as OrdinalValue
  }
}

/** Generate an ordinal key strictly greater than `a` (`result > a`). */
export const after = (a: OrdinalValue): OrdinalValue => {
  for (let i = a.length - 1; i >= 0; i--) {
    const d = digitOf(a[i]!)
    if (d < BASE - 1) {
      return (a.slice(0, i) + ALPHABET[Math.floor((d + BASE) / 2)]!) as OrdinalValue
    }
  }
  return (a + MID) as OrdinalValue
}

/** Generate an ordinal key strictly less than `a` (`result < a`). */
export const before = (a: OrdinalValue): OrdinalValue => {
  for (let i = a.length - 1; i >= 0; i--) {
    const d = digitOf(a[i]!)
    if (d > 0) {
      const lower = Math.floor(d / 2)
      if (lower > 0 || i > 0) {
        return (a.slice(0, i) + ALPHABET[lower]!) as OrdinalValue
      }
      // Leading digit is 1 -> '0' + MID is strictly less than '1...'
      return `${MIN_DIGIT}${MID}` as OrdinalValue
    }
  }
  // All '0's (e.g. '0' or '00'): prepend impossible? No: '0' < '00', so shorten if len > 1,
  // otherwise fail loudly since '0' is the minimum non-empty base-62 key.
  if (a.length > 1) return a.slice(0, -1) as OrdinalValue
  throw new Error(`[metakit] Ordinal.before: "${a}" is the minimum base-62 ordinal key`)
}

export type NullableOrdinal = ExprInput<never, OrdinalValue | null>

export const lt = <L extends NullableOrdinal, R extends NullableOrdinal>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => Str.lt(left, right)

export const lte = <L extends NullableOrdinal, R extends NullableOrdinal>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => Str.lte(left, right)

export const gt = <L extends NullableOrdinal, R extends NullableOrdinal>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => Str.gt(left, right)

export const gte = <L extends NullableOrdinal, R extends NullableOrdinal>(
  left: L,
  right: R,
): Expr<EnvOfInput<L> & EnvOfInput<R>, boolean | NullOf<L> | NullOf<R>> => Str.gte(left, right)

export const inRange = <
  X extends NullableOrdinal,
  Lo extends NullableOrdinal,
  Hi extends NullableOrdinal,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<
  EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>,
  boolean | NullOf<X> | NullOf<Lo> | NullOf<Hi>
> =>
  Bool.and(gte(value, lo), lte(value, hi)) as Expr<
    EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>,
    boolean | NullOf<X> | NullOf<Lo> | NullOf<Hi>
  >

export { MAX_DIGIT, MIN_DIGIT }
