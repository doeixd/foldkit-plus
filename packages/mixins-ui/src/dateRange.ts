import type { CalendarAttributes } from '@foldkit/ui/calendar'
import { Match, Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotAttributes } from 'foldkit-mixins'
import { draw, toView as calendarView, type ResolvedCalendar } from './calendar.js'
import type { MixinList, ResolveContext } from './resolve.js'

/**
 * A start and an end day, chosen on the Calendar (shadcn's `mode="range"`).
 * The range is the application's, as the Calendar's single date is: it folds
 * each `SelectedDate` through `picked` and draws the Calendar with `toView`,
 * which marks the range's days. The Calendar keeps the month shown and the
 * focus. `Schema.Option` holds the ends, so store the range through
 * `Schema.OptionFromNullOr` fields instead.
 */
export const Range = Schema.Struct({
  start: Schema.Option(Dates.CalendarDate),
  end: Schema.Option(Dates.CalendarDate),
})
export type Range = typeof Range.Type

export const empty: Range = { start: Option.none(), end: Option.none() }

/**
 * The range after a day is picked. A start waiting for its end takes the day
 * as its other end, the earlier of the two becoming the start; otherwise,
 * with nothing chosen or a range already whole, the day starts a new range.
 */
export const picked = (range: Range, date: Dates.CalendarDate): Range =>
  Option.match(
    Option.filter(range.start, () => Option.isNone(range.end)),
    {
      onNone: () => ({ start: Option.some(date), end: Option.none() }),
      onSome: start => ({
        start: Option.some(Dates.min(start, date)),
        end: Option.some(Dates.max(start, date)),
      }),
    },
  )

/**
 * Marks a day `data-range-start`, `data-range-end`, and `data-in-range` from
 * start to end inclusive once both are chosen. Every chosen day is
 * `aria-selected`, which overrides upstream's, since upstream marks only the
 * one date it is given.
 */
const marksOf = <Message>(range: Range, h: HtmlBuilder<Message>) => {
  const bounds = Option.all({ minimum: range.start, maximum: range.end })
  return (date: Dates.CalendarDate): SlotAttributes<Message> => {
    const starts = Option.exists(range.start, Dates.isEqual(date))
    const ends = Option.exists(range.end, Dates.isEqual(date))
    const within = Option.exists(bounds, between => Dates.between(date, between))
    return [
      ...(starts ? [h.DataAttribute('range-start', '')] : []),
      ...(ends ? [h.DataAttribute('range-end', '')] : []),
      ...(within ? [h.DataAttribute('in-range', '')] : []),
      ...(starts || within ? [h.AriaSelected(true)] : []),
    ]
  }
}

const marked = <Message>(
  calendar: ResolvedCalendar<Message>,
  range: Range,
  h: HtmlBuilder<Message>,
): ResolvedCalendar<Message> =>
  Match.valueTags(calendar, {
    Days: days => {
      const marks = marksOf(range, h)
      return {
        ...days,
        weeks: days.weeks.map(week => ({
          ...week,
          cells: week.cells.map(cell => ({
            ...cell,
            cellAttributes: [...cell.cellAttributes, ...marks(cell.date)],
          })),
        })),
      }
    },
    Months: months => months,
    Years: years => years,
  })

/**
 * The Calendar's `toView` with the range's days marked, for `Recipes.DateRange`
 * to draw. Give the Calendar `maybeSelectedDate: Option.none()`: the marks
 * show the chosen days. `render` receives the marked bundles.
 */
export const toView = <Message>(
  range: Range,
  mixins: MixinList<Message>,
  context: ResolveContext<unknown, Message>,
  render: (resolved: ResolvedCalendar<Message>) => Html = resolved => draw(resolved, context.h),
): ((attributes: CalendarAttributes) => Html) =>
  calendarView(mixins, context, resolved => render(marked(resolved, range, context.h)))
