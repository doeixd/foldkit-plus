/**
 * Calendar-day time operations (`time.*`): `addDays`, `addMonths` (clamped to
 * month-end), `daysBetween`, `startOfMonth`, and half-open `overlaps`.
 *
 * Dates are integer epoch days (days since `1970-01-01`, matching
 * `CalendarDay`). Calendar arithmetic (`addMonths`, `startOfMonth`) uses
 * Howard Hinnant's exact proleptic Gregorian integer formulas over years
 * 0001–9999 (`-719_162 .. 2_932_896`), matching SQLite and Postgres with zero
 * timezone dependence.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import { call, type EnvOfInput, type ExprInput, type NullOf } from './core.js'
import type { NullableNumber } from './ord.js'

/** `0001-01-01` as an epoch day. */
export const EARLIEST_DAY = -719_162
/** `9999-12-31` as an epoch day. */
export const LATEST_DAY = 2_932_896

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

const daysInMonth = (y: number, m: number): number =>
  m === 2 ? (isLeapYear(y) ? 29 : 28) : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31

/** Convert an epoch day (`0 = 1970-01-01`) to proleptic Gregorian `[year, month, day]`. */
export const daysToCivil = (z: number): readonly [number, number, number] => {
  const g = z + 719468
  const era = Math.floor(g / 146097)
  const doe = g - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return [y + (m <= 2 ? 1 : 0), m, d] as const
}

/** Convert a proleptic Gregorian `[year, month, day]` to an epoch day (`0 = 1970-01-01`). */
export const civilToDays = (y: number, m: number, d: number): number => {
  const yr = m <= 2 ? y - 1 : y
  const era = Math.floor(yr / 400)
  const yoe = yr - era * 400
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

const checkSafeInt = (id: Node.CoreOpId, value: unknown): number | Node.Refusal => {
  if (typeof value !== 'number') return Node.illTyped(id, 'a number', value)
  if (!Number.isFinite(value)) {
    return new Node.Refusal({ reason: 'non-finite', at: id, detail: `an operand is ${value}` })
  }
  if (!Number.isSafeInteger(value)) {
    return Node.illTyped(id, 'a safe integer', value)
  }
  return Object.is(value, -0) ? 0 : value
}

const checkCalendarDay = (id: Node.CoreOpId, value: unknown): number | Node.Refusal => {
  const day = checkSafeInt(id, value)
  if (Node.isRefusal(day)) return day
  if (day < EARLIEST_DAY || day > LATEST_DAY) {
    return new Node.Refusal({
      reason: 'unsafe-integer',
      at: id,
      detail: `calendar day ${day} is outside 0001-01-01..9999-12-31 (${EARLIEST_DAY}..${LATEST_DAY})`,
    })
  }
  return day
}

/** Add `months` to epoch day `day`, clamping to the target month's last day. */
export const addMonthsInt = (day: number, months: number): number | Node.Refusal => {
  const d = checkCalendarDay('time.addMonths', day)
  if (Node.isRefusal(d)) return d
  const n = checkSafeInt('time.addMonths', months)
  if (Node.isRefusal(n)) return n
  const [year, month, dom] = daysToCivil(d)
  const totalMonths = year * 12 + (month - 1) + n
  if (!Number.isSafeInteger(totalMonths)) {
    return new Node.Refusal({
      reason: 'unsafe-integer',
      at: 'time.addMonths',
      detail: `month offset ${n} from ${d} overflows safe integer range`,
    })
  }
  const ny = Math.floor(totalMonths / 12)
  const nm = totalMonths - ny * 12 + 1
  if (ny < 1 || ny > 9999) {
    return new Node.Refusal({
      reason: 'unsafe-integer',
      at: 'time.addMonths',
      detail: `resulting year ${ny} is outside 0001..9999`,
    })
  }
  const nd = Math.min(dom, daysInMonth(ny, nm))
  const result = civilToDays(ny, nm, nd)
  return Object.is(result, -0) ? 0 : result
}

/** First day of the calendar month holding epoch day `day`. */
export const startOfMonthInt = (day: number): number | Node.Refusal => {
  const d = checkCalendarDay('time.startOfMonth', day)
  if (Node.isRefusal(d)) return d
  const [year, month] = daysToCivil(d)
  const result = civilToDays(year, month, 1)
  return Object.is(result, -0) ? 0 : result
}

export const addDaysOp: Node.Op<'time.addDays'> = {
  id: 'time.addDays',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([day, days]) => {
    const d = checkSafeInt('time.addDays', day)
    if (Node.isRefusal(d)) return d
    const n = checkSafeInt('time.addDays', days)
    if (Node.isRefusal(n)) return n
    const sum = d + n
    if (!Number.isSafeInteger(sum)) {
      return new Node.Refusal({
        reason: 'unsafe-integer',
        at: 'time.addDays',
        detail: `${d} + ${n} is past ±(2^53−1)`,
      })
    }
    return Object.is(sum, -0) ? 0 : sum
  },
}

export const addMonthsOp: Node.Op<'time.addMonths'> = {
  id: 'time.addMonths',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([day, months]) => {
    const d = checkCalendarDay('time.addMonths', day)
    if (Node.isRefusal(d)) return d
    const n = checkSafeInt('time.addMonths', months)
    if (Node.isRefusal(n)) return n
    return addMonthsInt(d, n)
  },
}

export const daysBetweenOp: Node.Op<'time.daysBetween'> = {
  id: 'time.daysBetween',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([a, b]) => {
    const da = checkSafeInt('time.daysBetween', a)
    if (Node.isRefusal(da)) return da
    const db = checkSafeInt('time.daysBetween', b)
    if (Node.isRefusal(db)) return db
    const diff = da - db
    if (!Number.isSafeInteger(diff)) {
      return new Node.Refusal({
        reason: 'unsafe-integer',
        at: 'time.daysBetween',
        detail: `${da} - ${db} is past ±(2^53−1)`,
      })
    }
    return Object.is(diff, -0) ? 0 : diff
  },
}

export const startOfMonthOp: Node.Op<'time.startOfMonth'> = {
  id: 'time.startOfMonth',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([day]) => {
    const d = checkCalendarDay('time.startOfMonth', day)
    if (Node.isRefusal(d)) return d
    return startOfMonthInt(d)
  },
}

export const overlapsOp: Node.Op<'time.overlaps'> = {
  id: 'time.overlaps',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: ([s1, e1, s2, e2]) => {
    const a = checkSafeInt('time.overlaps', s1)
    if (Node.isRefusal(a)) return a
    const b = checkSafeInt('time.overlaps', e1)
    if (Node.isRefusal(b)) return b
    const c = checkSafeInt('time.overlaps', s2)
    if (Node.isRefusal(c)) return c
    const d = checkSafeInt('time.overlaps', e2)
    if (Node.isRefusal(d)) return d
    return a < d && c < b
  },
}

/** Add an integer number of days to a calendar day. */
export const addDays = <D extends NullableNumber, N extends NullableNumber>(
  day: D,
  days: N,
): Expr<EnvOfInput<D> & EnvOfInput<N>, number | NullOf<D> | NullOf<N>> =>
  call(addDaysOp, [day, days])

/** Add an integer number of months to a calendar day, clamping to the target month's end. */
export const addMonths = <D extends NullableNumber, N extends NullableNumber>(
  day: D,
  months: N,
): Expr<EnvOfInput<D> & EnvOfInput<N>, number | NullOf<D> | NullOf<N>> =>
  call(addMonthsOp, [day, months])

/** Signed day difference `a - b` in days. */
export const daysBetween = <A extends NullableNumber, B extends NullableNumber>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, number | NullOf<A> | NullOf<B>> =>
  call(daysBetweenOp, [a, b])

/** First day of the calendar month holding `day`. */
export const startOfMonth = <D extends NullableNumber>(
  day: D,
): Expr<EnvOfInput<D>, number | NullOf<D>> => call(startOfMonthOp, [day])

/** Whether half-open ranges `[s1, e1)` and `[s2, e2)` overlap (`s1 < e2 && s2 < e1`). */
export const overlaps = <
  S1 extends ExprInput<never, number | null>,
  E1 extends ExprInput<never, number | null>,
  S2 extends ExprInput<never, number | null>,
  E2 extends ExprInput<never, number | null>,
>(
  s1: S1,
  e1: E1,
  s2: S2,
  e2: E2,
): Expr<
  EnvOfInput<S1> & EnvOfInput<E1> & EnvOfInput<S2> & EnvOfInput<E2>,
  boolean | NullOf<S1> | NullOf<E1> | NullOf<S2> | NullOf<E2>
> => call(overlapsOp, [s1, e1, s2, e2])
