import type {
  CalendarAttributes,
  ColumnHeader,
  DayCell,
  DaysModeAttributes,
  MonthCell,
  MonthsModeAttributes,
  Week,
  YearCell,
  YearsModeAttributes,
} from '@foldkit/ui/calendar'
import { Attr, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineTaggedUnion } from 'foldkit/schema'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

/**
 * Calendar is a nested Submodel whose shape depends on `model.viewMode`. The
 * top-level groups (`root`, `grid`, the navigation buttons) and per-item groups
 * (`columnHeaders[]`, `weeks[].attributes`, the day/month/year cells and their
 * buttons) are each resolved with `SlotView.buildersFor`, so a contribution to
 * a cell slot applies to every cell while each cell's base keeps its own event
 * ownership (a disabled day omits `OnClick`). `header`, the row of the
 * heading and its paging buttons, has no upstream bundle: it is this package's,
 * so the default drawing puts no markup outside a slot.
 */
export const CalendarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  previousMonthButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  nextMonthButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  headingButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role],
  }),
  previousPageButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  nextPageButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  grid: Slot.make({
    capability: Capability.Container,
    events: [Event.Focus, Event.Blur],
    attributes: [Attr.Role],
  }),
  headerRow: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  columnHeader: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  weekRow: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  dayCell: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  dayButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  monthCell: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  monthButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  yearCell: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  yearButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
})

export type ResolvedColumnHeader<Message> = Omit<ColumnHeader, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}
export type ResolvedDayCell<Message> = Omit<DayCell, 'cellAttributes' | 'buttonAttributes'> & {
  readonly cellAttributes: SlotAttributes<Message>
  readonly buttonAttributes: SlotAttributes<Message>
}
export type ResolvedWeek<Message> = Omit<Week, 'attributes' | 'cells'> & {
  readonly attributes: SlotAttributes<Message>
  readonly cells: ReadonlyArray<ResolvedDayCell<Message>>
}
export type ResolvedMonthCell<Message> = Omit<MonthCell, 'cellAttributes' | 'buttonAttributes'> & {
  readonly cellAttributes: SlotAttributes<Message>
  readonly buttonAttributes: SlotAttributes<Message>
}
export type ResolvedYearCell<Message> = Omit<YearCell, 'cellAttributes' | 'buttonAttributes'> & {
  readonly cellAttributes: SlotAttributes<Message>
  readonly buttonAttributes: SlotAttributes<Message>
}

export interface ResolvedDays<Message> {
  readonly _tag: 'Days'
  readonly root: SlotAttributes<Message>
  readonly header: SlotAttributes<Message>
  readonly previousMonthButton: SlotAttributes<Message>
  readonly nextMonthButton: SlotAttributes<Message>
  readonly headingButton: SlotAttributes<Message>
  readonly heading: DaysModeAttributes['heading']
  readonly grid: SlotAttributes<Message>
  readonly headerRow: SlotAttributes<Message>
  readonly columnHeaders: ReadonlyArray<ResolvedColumnHeader<Message>>
  readonly weeks: ReadonlyArray<ResolvedWeek<Message>>
}
export interface ResolvedMonths<Message> {
  readonly _tag: 'Months'
  readonly root: SlotAttributes<Message>
  readonly header: SlotAttributes<Message>
  readonly headingButton: SlotAttributes<Message>
  readonly heading: MonthsModeAttributes['heading']
  readonly grid: SlotAttributes<Message>
  readonly cells: ReadonlyArray<ResolvedMonthCell<Message>>
}
export interface ResolvedYears<Message> {
  readonly _tag: 'Years'
  readonly root: SlotAttributes<Message>
  readonly header: SlotAttributes<Message>
  readonly previousPageButton: SlotAttributes<Message>
  readonly nextPageButton: SlotAttributes<Message>
  readonly heading: YearsModeAttributes['heading']
  readonly grid: SlotAttributes<Message>
  readonly cells: ReadonlyArray<ResolvedYearCell<Message>>
}
export type ResolvedCalendar<Message> =
  | ResolvedDays<Message>
  | ResolvedMonths<Message>
  | ResolvedYears<Message>

/** Resolves every mode's nested groups, preserving the `_tag` and heading data. */
export const resolve = <Input, Message>(
  render: CalendarAttributes,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedCalendar<Message> => {
  const builders = buildersOf(CalendarSlots, mixins, context)
  const root = builders.root.attrs(render.root)
  const header = builders.header.attrs()
  const grid = builders.grid.attrs(render.grid)
  switch (render._tag) {
    case 'Days':
      return {
        _tag: 'Days',
        root,
        header,
        grid,
        heading: render.heading,
        previousMonthButton: builders.previousMonthButton.attrs(render.previousMonthButton),
        nextMonthButton: builders.nextMonthButton.attrs(render.nextMonthButton),
        headingButton: builders.headingButton.attrs(render.headingButton),
        headerRow: builders.headerRow.attrs(render.headerRow),
        columnHeaders: render.columnHeaders.map(column => ({
          ...column,
          attributes: builders.columnHeader.attrs(column.attributes),
        })),
        weeks: render.weeks.map(week => ({
          ...week,
          attributes: builders.weekRow.attrs(week.attributes),
          cells: week.cells.map(cell => ({
            ...cell,
            cellAttributes: builders.dayCell.attrs(cell.cellAttributes),
            buttonAttributes: builders.dayButton.attrs(cell.buttonAttributes),
          })),
        })),
      }
    case 'Months':
      return {
        _tag: 'Months',
        root,
        header,
        grid,
        heading: render.heading,
        headingButton: builders.headingButton.attrs(render.headingButton),
        cells: render.cells.map(cell => ({
          ...cell,
          cellAttributes: builders.monthCell.attrs(cell.cellAttributes),
          buttonAttributes: builders.monthButton.attrs(cell.buttonAttributes),
        })),
      }
    case 'Years':
      return {
        _tag: 'Years',
        root,
        header,
        grid,
        heading: render.heading,
        previousPageButton: builders.previousPageButton.attrs(render.previousPageButton),
        nextPageButton: builders.nextPageButton.attrs(render.nextPageButton),
        cells: render.cells.map(cell => ({
          ...cell,
          cellAttributes: builders.yearCell.attrs(cell.cellAttributes),
          buttonAttributes: builders.yearButton.attrs(cell.buttonAttributes),
        })),
      }
  }
}

/** The month grid in every mode, as upstream lays it out, with a header row of its own. */
export const draw = <Message>(calendar: ResolvedCalendar<Message>, h: HtmlBuilder<Message>): Html =>
  Match.valueTags(calendar, {
    Days: days =>
      h.div(days.root, [
        h.div(days.header, [
          h.button(days.previousMonthButton, ['‹']),
          h.button(days.headingButton, [days.heading.text]),
          h.button(days.nextMonthButton, ['›']),
        ]),
        h.div(days.grid, [
          h.div(
            days.headerRow,
            days.columnHeaders.map(column => h.div(column.attributes, [column.name])),
          ),
          ...days.weeks.map(week =>
            h.div(
              week.attributes,
              week.cells.map(cell =>
                h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
              ),
            ),
          ),
        ]),
      ]),
    Months: months =>
      h.div(months.root, [
        h.div(months.header, [h.button(months.headingButton, [months.heading.text])]),
        h.div(
          months.grid,
          months.cells.map(cell =>
            h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.shortLabel])]),
          ),
        ),
      ]),
    Years: years =>
      h.div(years.root, [
        h.div(years.header, [
          h.button(years.previousPageButton, ['‹']),
          years.heading.text,
          h.button(years.nextPageButton, ['›']),
        ]),
        h.div(
          years.grid,
          years.cells.map(cell =>
            h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
          ),
        ),
      ]),
  })

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

interface Mark<Message> {
  readonly chosen: boolean
  readonly attributes: SlotAttributes<Message>
}

const dayKey = (date: Dates.CalendarDate): string => `${date.year}-${date.month}-${date.day}`

/**
 * How each day is marked. A chosen day, and a range's either end, is
 * `data-selected`, as upstream marks its one date; a range's ends are
 * `data-range-start` and `data-range-end`, and every day from start to end is
 * `data-in-range`. Every chosen day is `aria-selected`, which overrides
 * upstream's, since upstream knows only the date it is given.
 */
const marksOf = <Message>(
  selection: Selection,
  h: HtmlBuilder<Message>,
): ((date: Dates.CalendarDate) => Mark<Message>) => {
  const unmarked: Mark<Message> = { chosen: false, attributes: [] }
  const chosen: Mark<Message> = {
    chosen: true,
    attributes: [h.DataAttribute('selected', ''), h.AriaSelected(true)],
  }
  return Selection.match(selection, {
    Single:
      ({ date }) =>
      (day: Dates.CalendarDate) =>
        Option.exists(date, Dates.isEqual(day)) ? chosen : unmarked,
    Multiple: ({ dates }) => {
      const keys = new Set(dates.map(dayKey))
      return (day: Dates.CalendarDate) => (keys.has(dayKey(day)) ? chosen : unmarked)
    },
    Range: ({ start, end }) => {
      const bounds = Option.all({ minimum: start, maximum: end })
      return (day: Dates.CalendarDate) => {
        const starts = Option.exists(start, Dates.isEqual(day))
        const ends = Option.exists(end, Dates.isEqual(day))
        const within = Option.exists(bounds, between => Dates.between(day, between))
        if (!starts && !ends && !within) return unmarked
        return {
          chosen: true,
          attributes: [
            ...(starts ? [h.DataAttribute('range-start', '')] : []),
            ...(ends ? [h.DataAttribute('range-end', '')] : []),
            ...(within ? [h.DataAttribute('in-range', '')] : []),
            ...(starts || ends ? [h.DataAttribute('selected', '')] : []),
            h.AriaSelected(true),
          ],
        }
      }
    },
  })
}

const marked = <Message>(
  calendar: ResolvedCalendar<Message>,
  selection: Selection,
  h: HtmlBuilder<Message>,
): ResolvedCalendar<Message> =>
  Match.valueTags(calendar, {
    Days: days => {
      const markOf = marksOf(selection, h)
      return {
        ...days,
        weeks: days.weeks.map(week => ({
          ...week,
          cells: week.cells.map(cell => {
            const mark = markOf(cell.date)
            return {
              ...cell,
              isSelected: cell.isSelected || mark.chosen,
              cellAttributes: [...cell.cellAttributes, ...mark.attributes],
            }
          }),
        })),
      }
    },
    Months: months => months,
    Years: years => years,
  })

/**
 * The calendar's `toView`, with the days `selection` holds marked: `render`
 * receives its bundles with `mixins` applied and the marks added; without
 * one, they are drawn by `draw` above. Give the Calendar
 * `maybeSelectedDate: selectedDate(selection)`. A Mixin that reads the mode
 * needs `resolve`, whose `input` can be `_tag`.
 */
export const toView =
  <Message>(
    selection: Selection,
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    render: (resolved: ResolvedCalendar<Message>) => Html = resolved => draw(resolved, context.h),
  ) =>
  (attributes: CalendarAttributes): Html =>
    render(marked(resolve(attributes, mixins, context), selection, context.h))
