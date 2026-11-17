/**
 * The month a Calendar shows, moved without a press on its grid: by the
 * caption's dropdowns, or to stand beside another month. A module of its
 * own, re-exported by the adapter (`../calendar.ts`), so the Calendar's
 * state reads it without importing the adapter.
 */
import type { Model as CalendarModel } from '@foldkit/ui/calendar'
import { focusDate } from '@foldkit/ui/calendar'
import { Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import { defineTaggedUnion } from 'foldkit/schema'

export const firstOf = (year: number, month: number) => Dates.make(year, month, 1)

/**
 * A month the caption's dropdowns move to: a month of the year shown, or the
 * month shown in another year. Each says only what changed, so two changes
 * before a redraw both land; `show` reads the rest from the Model.
 */
export const Shown = defineTaggedUnion({
  Month: { month: Schema.Int },
  Year: { year: Schema.Int },
})
export type Shown = typeof Shown.Type

/**
 * The calendar showing `shown`: another month of the year shown, or the
 * month shown in another year. The focused day keeps its number where the
 * month has it, and stays inside the bounds. The same Model when that month
 * is already shown.
 */
export const show = (model: CalendarModel, shown: Shown): CalendarModel => {
  const [year, month] = Shown.match(shown, {
    Month: ({ month }) => [model.viewYear, month] as const,
    Year: ({ year }) => [year, model.viewMonth] as const,
  })
  if (year === model.viewYear && month === model.viewMonth) return model
  const focused = Option.getOrElse(model.maybeFocusedDate, () => firstOf(year, month))
  const wanted = Dates.make(year, month, Math.min(focused.day, Dates.daysInMonth(year, month)))
  const atLeast = Option.match(model.maybeMinDate, {
    onNone: () => wanted,
    onSome: min => Dates.max(wanted, min),
  })
  const within = Option.match(model.maybeMaxDate, {
    onNone: () => atLeast,
    onSome: max => Dates.min(atLeast, max),
  })
  return focusDate(model, within)
}

/**
 * `model` showing the month `offset` months from the one `other` shows, for
 * two months side by side: after either changes its month, set the other
 * from it (the second with `1`, the first with `-1`). The same Model when it
 * already shows that month.
 */
export const alongside = (
  model: CalendarModel,
  other: CalendarModel,
  offset: number,
): CalendarModel => {
  const month = Dates.addMonths(firstOf(other.viewYear, other.viewMonth), offset)
  return show(show(model, Shown.Year({ year: month.year })), Shown.Month({ month: month.month }))
}
