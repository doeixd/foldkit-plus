/**
 * Timezone-free `CalendarDay` Schema backed by integer epoch days (days since
 * 1970-01-01), with symbolic arithmetic and ordering lowering directly to
 * integer `num.add`, `num.sub`, and `ord.*`.
 */
import { Data, Result, Schema } from 'effect'
import * as Bool from '../ops/bool.js'
import { call, type EnvOfInput, type ExprInput } from '../ops/core.js'
import * as Eq from '../ops/eq.js'
import * as Num from '../ops/num.js'
import * as Ord from '../ops/ord.js'
import type { Expr } from '../path.js'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

export const CalendarDayBrand: unique symbol = Symbol.for('metakit/CalendarDay')

/** Integer epoch day (0 = `1970-01-01`), timezone-free. */
export type CalendarDayValue = number & { readonly [CalendarDayBrand]: true }

export class InvalidCalendarDayError extends Data.TaggedError('InvalidCalendarDayError')<{
  readonly input: string
}> {}

const MS_PER_DAY = 86_400_000
const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Effect `Schema` for an integer epoch-day `CalendarDay` with `metakit/domain` metadata. */
export const schema: Schema.Codec<CalendarDayValue, number> = Schema.Int.annotate({
  [DOMAIN_ANNOTATION_KEY]: { kind: 'calendarDay' },
} as Schema.Annotations.Annotations) as unknown as Schema.Codec<CalendarDayValue, number>

/** Parse an ISO `YYYY-MM-DD` string into an exact epoch-day `CalendarDayValue`. */
export const fromIso = (iso: string): Result.Result<CalendarDayValue, InvalidCalendarDayError> => {
  const m = ISO_DAY_RE.exec(iso)
  if (m === null) return Result.fail(new InvalidCalendarDayError({ input: iso }))
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return Result.fail(new InvalidCalendarDayError({ input: iso }))
  }
  return Result.succeed(Math.floor(ms / MS_PER_DAY) as CalendarDayValue)
}

/** Parse a known-valid ISO `YYYY-MM-DD` string, throwing on invalid input. */
export const parseIsoUnsafe = (iso: string): CalendarDayValue => {
  const res = fromIso(iso)
  if (Result.isFailure(res)) {
    throw new Error(`[metakit] Invalid CalendarDay ISO string: "${iso}"`)
  }
  return res.success
}

/** Format an epoch-day `CalendarDayValue` as `YYYY-MM-DD`. */
export const toIso = (day: CalendarDayValue): string => {
  const d = new Date(day * MS_PER_DAY)
  const y = String(d.getUTCFullYear()).padStart(4, '0')
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

type DayInput<Env> = ExprInput<Env, CalendarDayValue>

/** Add an integer number of days to a `CalendarDay`. */
export const addDays = <D extends DayInput<never>, N extends ExprInput<never, number>>(
  day: D,
  days: N,
): Expr<EnvOfInput<D> & EnvOfInput<N>, CalendarDayValue> =>
  Num.add(day as ExprInput<never, number>, days) as unknown as Expr<
    EnvOfInput<D> & EnvOfInput<N>,
    CalendarDayValue
  >

/** Signed day difference `a - b` in days. */
export const diffDays = <A extends DayInput<never>, B extends DayInput<never>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, number> =>
  Num.sub(a as ExprInput<never, number>, b as ExprInput<never, number>)

export const before = <A extends DayInput<never>, B extends DayInput<never>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean> =>
  Ord.lt(a as ExprInput<never, number>, b as ExprInput<never, number>)

export const onOrBefore = <A extends DayInput<never>, B extends DayInput<never>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean> =>
  Ord.lte(a as ExprInput<never, number>, b as ExprInput<never, number>)

export const after = <A extends DayInput<never>, B extends DayInput<never>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean> =>
  Ord.gt(a as ExprInput<never, number>, b as ExprInput<never, number>)

export const onOrAfter = <A extends DayInput<never>, B extends DayInput<never>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean> =>
  Ord.gte(a as ExprInput<never, number>, b as ExprInput<never, number>)

export const is = <A extends DayInput<never>, B extends DayInput<never>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean> => call(Eq.isOp, [a, b])

export const between = <
  X extends DayInput<never>,
  Lo extends DayInput<never>,
  Hi extends DayInput<never>,
>(
  value: X,
  lo: Lo,
  hi: Hi,
): Expr<EnvOfInput<X> & EnvOfInput<Lo> & EnvOfInput<Hi>, boolean> =>
  Bool.and(onOrAfter(value, lo), onOrBefore(value, hi))
