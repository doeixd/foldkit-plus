/**
 * Integer division (`num.div`) with explicit rounding mode and zero handling,
 * truncated remainder (`num.rem`), and decimal/integer rounding conversions
 * (`round`, `toDecimal`, `toInt`) over safe integers.
 *
 * Every rounding mode is computed in exact `bigint` arithmetic so JavaScript,
 * SQLite and Postgres agree on every safe integer input, including exact
 * halves and negatives.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, toNode, wrap, type EnvOfInput, type NullOf } from './core.js'
import { mulOp } from './num.js'
import type { NullableNumber } from './ord.js'

/** Explicit rounding mode for integer/decimal division and conversions. */
export type RoundingMode = 'half-even' | 'half-away-from-zero' | 'floor' | 'ceiling' | 'toward-zero'

/** Behaviour when the divisor is 0. */
export type OnZero = 'null' | 'refuse'

const ROUNDING_MODES: ReadonlySet<string> = new Set<RoundingMode>([
  'half-even',
  'half-away-from-zero',
  'floor',
  'ceiling',
  'toward-zero',
])

export const isRoundingMode = (value: unknown): value is RoundingMode =>
  typeof value === 'string' && ROUNDING_MODES.has(value)

export const isOnZero = (value: unknown): value is OnZero => value === 'null' || value === 'refuse'

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

const notFinite =
  (id: Node.CoreOpId) =>
  (value: unknown): Node.Refusal | undefined =>
    typeof value === 'number' && !Number.isFinite(value)
      ? new Node.Refusal({ reason: 'non-finite', at: id, detail: `an operand is ${value}` })
      : undefined

/** Exact `bigint` division of `n / d` (`d !== 0n`) under `mode`. */
export const divBig = (n: bigint, d: bigint, mode: RoundingMode): bigint => {
  const num = d < 0n ? -n : n
  const den = d < 0n ? -d : d
  const r = ((num % den) + den) % den
  const qFloor = (num - r) / den
  switch (mode) {
    case 'floor':
      return qFloor
    case 'ceiling':
      return r === 0n ? qFloor : qFloor + 1n
    case 'toward-zero':
      return num / den
    case 'half-even': {
      const twice = 2n * r
      if (twice > den) return qFloor + 1n
      if (twice < den) return qFloor
      return qFloor % 2n === 0n ? qFloor : qFloor + 1n
    }
    case 'half-away-from-zero': {
      const twice = 2n * r
      if (twice > den) return qFloor + 1n
      if (twice < den) return qFloor
      return num >= 0n ? qFloor + 1n : qFloor
    }
  }
}

/** Exact division over safe integers, returning a safe integer, `null` (when `onZero: 'null'`), or a `Refusal`. */
export const divInt = (
  a: number,
  b: number,
  mode: RoundingMode,
  onZero: OnZero,
): number | null | Node.Refusal => {
  if (b === 0) {
    return onZero === 'null'
      ? null
      : new Node.Refusal({
          reason: 'ill-typed',
          at: 'num.div',
          detail: 'division by zero',
        })
  }
  const result = divBig(BigInt(a), BigInt(b), mode)
  if (result > MAX_SAFE || result < -MAX_SAFE) {
    return new Node.Refusal({
      reason: 'unsafe-integer',
      at: 'num.div',
      detail: `the quotient of ${a} / ${b} is past ±(2^53−1)`,
    })
  }
  return result === 0n ? 0 : Number(result)
}

const checkSafeInt = (id: Node.CoreOpId, value: unknown): number | Node.Refusal => {
  if (typeof value !== 'number') return Node.illTyped(id, 'a number', value)
  if (!Number.isInteger(value)) return Node.illTyped(id, 'an integer', value)
  if (!Number.isSafeInteger(value)) {
    return new Node.Refusal({
      reason: 'unsafe-integer',
      at: id,
      detail: `the operand ${value} is past ±(2^53−1)`,
    })
  }
  return value
}

export const divOp: Node.Op<'num.div'> = {
  id: 'num.div',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite('num.div'),
  evaluate: args => {
    const [rawA, rawB, mode, onZero] = args
    const a = checkSafeInt('num.div', rawA)
    if (Node.isRefusal(a)) return a
    const b = checkSafeInt('num.div', rawB)
    if (Node.isRefusal(b)) return b
    if (!isRoundingMode(mode)) return Node.illTyped('num.div', 'a rounding mode', mode)
    if (!isOnZero(onZero)) return Node.illTyped('num.div', 'an onZero policy', onZero)
    return divInt(a, b, mode, onZero)
  },
}

export const remOp: Node.Op<'num.rem'> = {
  id: 'num.rem',
  returns: 'number',
  nulls: 'strict',
  refuses: notFinite('num.rem'),
  evaluate: args => {
    const [rawA, rawB, onZero = 'refuse'] = args
    const a = checkSafeInt('num.rem', rawA)
    if (Node.isRefusal(a)) return a
    const b = checkSafeInt('num.rem', rawB)
    if (Node.isRefusal(b)) return b
    if (!isOnZero(onZero)) return Node.illTyped('num.rem', 'an onZero policy', onZero)
    if (b === 0) {
      return onZero === 'null'
        ? null
        : new Node.Refusal({
            reason: 'ill-typed',
            at: 'num.rem',
            detail: 'remainder by zero',
          })
    }
    const r = Number(BigInt(a) % BigInt(b))
    return r === 0 ? 0 : r
  },
}

/**
 * Integer/decimal division `left / right` with explicit `rounding` mode and
 * `onZero` policy (`'refuse'` or `'null'`). Refuses a literal divisor of `0`
 * when `onZero` is `'refuse'`.
 */
export const div = <
  L extends NullableNumber,
  R extends NullableNumber,
  Z extends OnZero = 'refuse',
>(
  left: L,
  right: R,
  options: { readonly rounding: RoundingMode; readonly onZero?: Z },
): Expr<
  EnvOfInput<L> & EnvOfInput<R>,
  number | NullOf<L> | NullOf<R> | (Z extends 'null' ? null : never)
> => {
  const onZero: OnZero = options.onZero ?? 'refuse'
  if (typeof right === 'number' && right === 0 && onZero === 'refuse') {
    throw new Error(
      '[metakit] Num.div: literal divisor is 0; pass a non-zero divisor or { onZero: "null" }.',
    )
  }
  return call(divOp, [left, right, options.rounding, onZero])
}

/**
 * Truncated integer remainder `left % right` (sign of the dividend, matching
 * JS, SQLite and Postgres). Refuses a literal divisor of `0` when `onZero` is
 * `'refuse'`.
 */
export const rem = <
  L extends NullableNumber,
  R extends NullableNumber,
  Z extends OnZero = 'refuse',
>(
  left: L,
  right: R,
  options?: { readonly onZero?: Z },
): Expr<
  EnvOfInput<L> & EnvOfInput<R>,
  number | NullOf<L> | NullOf<R> | (Z extends 'null' ? null : never)
> => {
  const onZero: OnZero = options?.onZero ?? 'refuse'
  if (typeof right === 'number' && right === 0 && onZero === 'refuse') {
    throw new Error(
      '[metakit] Num.rem: literal divisor is 0; pass a non-zero divisor or { onZero: "null" }.',
    )
  }
  return call(remOp, [left, right, onZero])
}

const checkScale = (name: string, scale: number): void => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) {
    throw new Error(`[metakit] ${name}: scale must be an integer from 0 to 12, got ${scale}.`)
  }
}

/** Convert an integer `value` to decimal units at `scale` (`value * 10^scale`), exact. */
export const toDecimal = <X extends NullableNumber>(
  value: X,
  scale: number,
): Expr<EnvOfInput<X>, number | NullOf<X>> => {
  checkScale('Num.toDecimal', scale)
  return scale === 0 ? wrap(toNode(value)) : call(mulOp, [value, 10 ** scale])
}

/** Convert decimal units at `scale` to an integer using explicit `rounding`. */
export const toInt = <X extends NullableNumber>(
  value: X,
  options: { readonly scale: number; readonly rounding: RoundingMode },
): Expr<EnvOfInput<X>, number | NullOf<X>> => {
  checkScale('Num.toInt', options.scale)
  return options.scale === 0
    ? wrap(toNode(value))
    : call(divOp, [value, 10 ** options.scale, options.rounding, 'refuse'])
}

/** Round decimal units from `fromScale` to `toScale` using explicit `rounding`. */
export const round = <X extends NullableNumber>(
  value: X,
  options: {
    readonly fromScale: number
    readonly toScale: number
    readonly rounding: RoundingMode
  },
): Expr<EnvOfInput<X>, number | NullOf<X>> => {
  checkScale('Num.round(fromScale)', options.fromScale)
  checkScale('Num.round(toScale)', options.toScale)
  const diff = options.fromScale - options.toScale
  if (diff === 0) return wrap(toNode(value))
  if (diff > 0) return call(divOp, [value, 10 ** diff, options.rounding, 'refuse'])
  return call(mulOp, [value, 10 ** -diff])
}
