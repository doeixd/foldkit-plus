import { Option } from 'effect'
import type { PastedCell } from './clipboard.js'
import type { FillLane } from './columns.js'
import type { CellAddress, CellBox, GridProjection } from './projection.js'

/** A fill: the range whose cells are carried on, and the cell it was carried to. */
export interface FillRequest<Id extends string> {
  readonly source: { readonly anchor: CellAddress<Id>; readonly focus: CellAddress<Id> }
  readonly to: CellAddress<Id>
}

/**
 * Where a fill lands: the source's box, and the box it fills beyond it, down,
 * up, right or left, whichever way `to` lies further outside the source. A
 * fill carries on along one axis only, as spreadsheets do.
 */
export interface FillPlan<Id extends string> {
  readonly source: CellBox<Id>
  readonly target: CellBox<Id>
  /** Rows (`down`/`up`) or columns (`right`/`left`), away from the source. */
  readonly toward: 'down' | 'up' | 'right' | 'left'
}

const number = /^-?\d+(?:\.(\d+))?$/
const day = /^(\d{4})-(\d{2})-(\d{2})$/

const msPerDay = 86_400_000

// `Date.UTC` maps years 0 to 99 to 1900 and up, and normalizes a day that does
// not exist, so the date is built by its fields and read back.
const utcDate = (year: number, month: number, date: number): Date => {
  const made = new Date(0)
  made.setUTCFullYear(year, month, date)
  return made
}

const daysInMonth = (year: number, month: number): number =>
  utcDate(year, month + 1, 0).getUTCDate()

interface CalendarDay {
  readonly year: number
  readonly month: number
  readonly date: number
  /** Whole days since 1970-01-01. */
  readonly epoch: number
}

const calendarDay = (text: string): CalendarDay | undefined => {
  const match = day.exec(text.trim())
  if (match === null) return undefined
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const made = utcDate(year, month, date)
  if (made.getUTCMonth() !== month || made.getUTCDate() !== date) return undefined
  return { year, month, date, epoch: made.getTime() / msPerDay }
}

const dayText = (made: Date): string =>
  `${String(made.getUTCFullYear()).padStart(4, '0')}-${String(made.getUTCMonth() + 1).padStart(2, '0')}-${String(made.getUTCDate()).padStart(2, '0')}`

/**
 * Calendar days continued by months when they share a day of the month and
 * are a constant number of months apart, else by days when a constant
 * number of days apart. Each month's day is the source's, clamped to the
 * month's length. None when the source is not such a series.
 */
const daySeries = (
  source: ReadonlyArray<string>,
  count: number,
  backward: boolean,
): ReadonlyArray<string> | undefined => {
  const days = source.map(calendarDay)
  if (days.some(found => found === undefined)) return undefined
  const known = days as ReadonlyArray<CalendarDay>
  const steps = (read: (found: CalendarDay) => number) =>
    known.slice(1).map((found, index) => read(found) - read(known[index]!))
  const constant = (diffs: ReadonlyArray<number>) =>
    diffs[0] !== 0 && diffs.every(diff => diff === diffs[0])
  const first = known[0]!
  const last = known[known.length - 1]!
  const months = steps(found => found.year * 12 + found.month)
  if (known.every(found => found.date === first.date) && constant(months)) {
    const step = months[0]!
    const from = backward ? first : last
    const origin = from.year * 12 + from.month
    return Array.from({ length: count }, (_, index) => {
      const at = origin + (backward ? -step : step) * (index + 1)
      const year = Math.floor(at / 12)
      const month = at - year * 12
      return dayText(utcDate(year, month, Math.min(first.date, daysInMonth(year, month))))
    })
  }
  const dayDiffs = steps(found => found.epoch)
  if (!constant(dayDiffs)) return undefined
  const step = dayDiffs[0]!
  const from = backward ? first : last
  return Array.from({ length: count }, (_, index) =>
    dayText(new Date((from.epoch + (backward ? -step : step) * (index + 1)) * msPerDay)),
  )
}

/**
 * The texts that carry `source` on for `count` cells, the first of them next
 * to it. Two or more numbers a constant step apart continue their step, with
 * as many decimals as the most precise of them. Two or more `YYYY-MM-DD`
 * days continue by months when they share a day of the month a constant number
 * of months apart (a 31st clamps to a shorter month and comes back), else by
 * a constant number of days. Anything else repeats, in order. `backward` carries the source on before its first text, as filling
 * up or left does.
 */
const series = (
  source: ReadonlyArray<string>,
  count: number,
  backward: boolean,
): ReadonlyArray<string> => {
  const at = (index: number) => source[((index % source.length) + source.length) % source.length]!
  const repeated = Array.from({ length: count }, (_, index) =>
    backward ? at(-1 - index) : at(source.length + index),
  )
  if (source.length < 2) return repeated
  const days = daySeries(source, count, backward)
  if (days !== undefined) return days
  const parsed = source.map(text => number.exec(text.trim()))
  if (parsed.some(match => match === null)) return repeated
  const decimals = Math.max(...parsed.map(match => match![1]?.length ?? 0))
  // Whole units of the finest decimal, so a step of 0.1 adds up exactly.
  const scale = 10 ** decimals
  const units = source.map(text => Math.round(Number(text.trim()) * scale))
  const step = units[1]! - units[0]!
  if (units.some((unit, index) => index > 0 && unit - units[index - 1]! !== step)) return repeated
  const from = backward ? units[0]! : units[units.length - 1]!
  return Array.from({ length: count }, (_, index) =>
    ((from + (backward ? -step : step) * (index + 1)) / scale).toFixed(decimals),
  )
}

/** The source's box and the box beyond it toward `to`; none when `to` is inside it. */
const plan = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  request: FillRequest<Id>,
): Option.Option<FillPlan<Id>> =>
  Option.flatMap(projection.box(request.source.anchor, request.source.focus), source =>
    Option.flatMap(projection.positionOf(request.to), to => {
      const first = projection.columns.indexOf(source.columns[0]!)
      const last = first + source.columns.length - 1
      const below = to.row - (source.rows.end - 1)
      const above = source.rows.start - to.row
      const right = to.column - last
      const left = first - to.column
      const rows = Math.max(below, above)
      const columns = Math.max(right, left)
      if (rows <= 0 && columns <= 0) return Option.none()
      if (rows >= columns) {
        const target =
          below > 0
            ? { start: source.rows.end, end: to.row + 1 }
            : { start: to.row, end: source.rows.start }
        return Option.some({
          source,
          target: { rows: target, columns: source.columns },
          toward: below > 0 ? 'down' : 'up',
        })
      }
      const columnsOf = (start: number, end: number) => projection.columns.slice(start, end)
      return Option.some({
        source,
        target: {
          rows: source.rows,
          columns: right > 0 ? columnsOf(last + 1, to.column + 1) : columnsOf(to.column, first),
        },
        toward: right > 0 ? 'right' : 'left',
      })
    }),
  )

/** A cell a fill writes, or one it could not: `refusal` is why no text was given. */
export interface FilledCell<Id extends string> extends PastedCell<Id> {
  readonly refusal?: string
}

const noSeriesText = 'The column’s series gave no text here'

/**
 * The cells a fill writes: each lane of the source (a column for a fill down
 * or up, a row for one right or left) carried on through the target by
 * `series`, or by the column's `custom` series when it answers (fills down
 * and up only). A custom answer shorter than the target leaves the cells past
 * it with a `refusal`. Cells on a column that does not edit, or on a row not loaded, are
 * dropped; each kept cell has `from`, the text it showed.
 */
const cells = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  fill: FillPlan<Id>,
  options: {
    readonly editable: (column: Id) => boolean
    readonly from: (address: CellAddress<Id>) => string
    readonly custom?: (column: Id, lane: FillLane) => Option.Option<ReadonlyArray<string>>
  },
): ReadonlyArray<FilledCell<Id>> => {
  const rowsOf = (box: { readonly start: number; readonly end: number }) =>
    Array.from({ length: box.end - box.start }, (_, offset) => box.start + offset)
  const keyAt = (index: number) => projection.rows.keyAt(index)
  const textAt = (index: number, column: Id) =>
    Option.match(keyAt(index), { onNone: () => '', onSome: row => options.from({ row, column }) })
  const cell = (
    index: number,
    column: Id,
    text: string | undefined,
  ): ReadonlyArray<FilledCell<Id>> =>
    options.editable(column)
      ? Option.match(keyAt(index), {
          onNone: () => [],
          onSome: row => {
            const from = options.from({ row, column })
            return [
              text === undefined
                ? { row, column, text: '', from, refusal: noSeriesText }
                : { row, column, text, from },
            ]
          },
        })
      : []
  const backward = fill.toward === 'up' || fill.toward === 'left'
  // Away from the source, so the series' first text lands next to it.
  const away = <A>(items: ReadonlyArray<A>) => (backward ? [...items].reverse() : items)
  if (fill.toward === 'down' || fill.toward === 'up') {
    const targetRows = away(rowsOf(fill.target.rows))
    return fill.source.columns.flatMap(column => {
      const source = rowsOf(fill.source.rows).map(index => textAt(index, column))
      const count = targetRows.length
      const texts = Option.getOrElse(
        options.custom?.(column, { source, count, toward: backward ? 'up' : 'down' }) ??
          Option.none(),
        () => series(source, count, backward),
      )
      return targetRows.flatMap((index, at) => cell(index, column, texts[at]))
    })
  }
  const targetColumns = away(fill.target.columns)
  return rowsOf(fill.source.rows).flatMap(index => {
    const texts = series(
      fill.source.columns.map(column => textAt(index, column)),
      targetColumns.length,
      backward,
    )
    return targetColumns.flatMap((column, at) => cell(index, column, texts[at]))
  })
}

export const Fill = { series, plan, cells }
