/**
 * A Calendar's selection and its readers, in a module that imports no
 * widget: the adapter (`../calendar.ts`), the Calendar's state and the
 * DatePicker all read it, and the adapter re-exports every name here.
 */
import { Array as Arr, Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import { defineTaggedUnion } from 'foldkit/schema'

const MaybeDate = Schema.OptionFromNullOr(Dates.CalendarDate)

/**
 * What the application has chosen on a Calendar: one day, a start and an end,
 * or any number of days. The selection is the application's; the Calendar
 * keeps only the month shown and the focus. Fold each `SelectedDate` through
 * `picked`, and draw with `toView(selection, …)`. The ends are stored as
 * `null`, so a selection round-trips through JSON.
 */
export const Selection = defineTaggedUnion({
  Single: { date: MaybeDate },
  Range: { start: MaybeDate, end: MaybeDate },
  Multiple: { dates: Schema.Array(Dates.CalendarDate) },
})
export type Selection = typeof Selection.Type

const emptyOf = {
  Single: Selection.Single({ date: Option.none() }),
  Range: Selection.Range({ start: Option.none(), end: Option.none() }),
  Multiple: Selection.Multiple({ dates: [] }),
}

/** A selection of `mode` with nothing chosen. */
export const empty = (mode: Selection['_tag']): Selection => emptyOf[mode]

/**
 * The selection after a day is picked. Single takes the day. Range takes it
 * as the other end of a start waiting for one, the earlier of the two
 * becoming the start; otherwise the day starts a new range. Multiple adds the
 * day, or removes it when it is chosen already, keeping the days in order.
 */
export const picked = (selection: Selection, date: Dates.CalendarDate): Selection =>
  Selection.match(selection, {
    Single: () => Selection.Single({ date: Option.some(date) }),
    Range: ({ start, end }) =>
      Option.match(
        Option.filter(start, () => Option.isNone(end)),
        {
          onNone: () => Selection.Range({ start: Option.some(date), end: Option.none() }),
          onSome: from =>
            Selection.Range({
              start: Option.some(Dates.min(from, date)),
              end: Option.some(Dates.max(from, date)),
            }),
        },
      ),
    Multiple: ({ dates }) =>
      Selection.Multiple({
        dates: Arr.some(dates, Dates.isEqual(date))
          ? dates.filter(chosen => !Dates.isEqual(chosen, date))
          : Arr.sort([...dates, date], Dates.Order),
      }),
  })

/**
 * Whether the selection is whole: a day chosen, or both ends of a range. A
 * Multiple selection never is, so a picker showing one stays open until it is
 * dismissed.
 */
export const isComplete = (selection: Selection): boolean =>
  Selection.match(selection, {
    Single: ({ date }) => Option.isSome(date),
    Range: ({ start, end }) => Option.isSome(start) && Option.isSome(end),
    Multiple: () => false,
  })

/**
 * The one day a Single selection holds, for upstream's `maybeSelectedDate`:
 * a DatePicker shows it on its trigger and submits it under `name`. Nothing
 * for a Range or Multiple selection, whose days `toView` marks.
 */
export const selectedDate = (selection: Selection): Option.Option<Dates.CalendarDate> =>
  Selection.match(selection, {
    Single: ({ date }) => date,
    Range: () => Option.none(),
    Multiple: () => Option.none(),
  })

/** The selection's first day: where a calendar shows it from, as after a preset. */
export const firstDate = (selection: Selection): Option.Option<Dates.CalendarDate> =>
  Selection.match(selection, {
    Single: ({ date }) => date,
    Range: ({ start }) => start,
    Multiple: ({ dates }) => Arr.head(dates),
  })

/** A first and a last day, both chosen. */
export interface DateRange {
  readonly start: Dates.CalendarDate
  readonly end: Dates.CalendarDate
}

/** The range a Range selection holds once it has both ends; nothing for any other selection. */
export const rangeOf = (selection: Selection): Option.Option<DateRange> =>
  Selection.match(selection, {
    Single: () => Option.none(),
    Range: ({ start, end }) => Option.all({ start, end }),
    Multiple: () => Option.none(),
  })

/**
 * Every day the selection holds, in order: the one day, each day from a
 * range's start to its end (only its start while it waits for an end), or the
 * days chosen.
 */
export const datesOf = (selection: Selection): ReadonlyArray<Dates.CalendarDate> =>
  Selection.match(selection, {
    Single: ({ date }) => Option.toArray(date),
    Range: ({ start, end }) =>
      Option.match(start, {
        onNone: () => [],
        onSome: from =>
          Option.match(end, {
            onNone: () => [from],
            onSome: to =>
              Arr.makeBy(Dates.daysUntil(from, to) + 1, index => Dates.addDays(from, index)),
          }),
      }),
    Multiple: ({ dates }) => dates,
  })

const sameDay = Option.makeEquivalence(Dates.Equivalence)

/** Whether two selections hold the same days the same way. */
export const isSame = (left: Selection, right: Selection): boolean =>
  Selection.match(left, {
    Single: ({ date }) => right._tag === 'Single' && sameDay(date, right.date),
    Range: ({ start, end }) =>
      right._tag === 'Range' && sameDay(start, right.start) && sameDay(end, right.end),
    Multiple: ({ dates }) =>
      right._tag === 'Multiple' &&
      dates.length === right.dates.length &&
      dates.every((date, index) => Option.exists(Arr.get(right.dates, index), Dates.isEqual(date))),
  })

/** A Range of the `days` days that end on `today`: "Last 7 days" is `lastDays(today, 7)`. */
export const lastDays = (today: Dates.CalendarDate, days: number): Selection =>
  Selection.Range({
    start: Option.some(Dates.subtractDays(today, Math.max(1, days) - 1)),
    end: Option.some(today),
  })

/** A Range of the `days` days that start on `today`. */
export const nextDays = (today: Dates.CalendarDate, days: number): Selection =>
  Selection.Range({
    start: Option.some(today),
    end: Option.some(Dates.addDays(today, Math.max(1, days) - 1)),
  })

/** A Range of the whole month `today` is in, moved by `offset` months (`-1` for last month). */
export const monthOf = (today: Dates.CalendarDate, offset = 0): Selection => {
  const first = Dates.addMonths(Dates.firstOfMonth(today), offset)
  return Selection.Range({
    start: Option.some(first),
    end: Option.some(Dates.lastOfMonth(first)),
  })
}

/** A Single selection of `date`, as "Today" or "In a week" choose. */
export const day = (date: Dates.CalendarDate): Selection =>
  Selection.Single({ date: Option.some(date) })
