import type {
  CalendarAttributes,
  ColumnHeader,
  DayCell,
  DaysModeAttributes,
  Model as CalendarModel,
  MonthCell,
  MonthsModeAttributes,
  Week,
  YearCell,
  YearsModeAttributes,
} from '@foldkit/ui/calendar'
import { focusDate } from '@foldkit/ui/calendar'
import {
  Attr,
  Behavior,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineTaggedUnion } from 'foldkit/schema'
import { ReadingKeys } from './direction.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

/**
 * Calendar is a nested Submodel whose shape depends on `model.viewMode`. The
 * top-level groups (`root`, `grid`, the navigation buttons) and per-item groups
 * (`columnHeaders[]`, `weeks[].attributes`, the day/month/year cells and their
 * buttons) are each resolved with `SlotView.buildersFor`, so a contribution to
 * a cell slot applies to every cell while each cell's base keeps its own event
 * ownership (a disabled day omits `OnClick`). The rest are this package's, so
 * the default drawing puts no markup outside a slot: `header`, the row of the
 * heading and its paging buttons; `heading`, the month and year as text when
 * the caption is a label; `monthSelect` and `yearSelect`, the caption's
 * dropdowns; `weekNumberHeader` and `weekNumber`, a column of ISO week
 * numbers; and `presets` and `preset`, buttons that choose a whole selection
 * (`presetsView`).
 */
export const CalendarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
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
  monthSelect: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Value],
  }),
  yearSelect: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Value],
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
  weekNumberHeader: Slot.make({ capability: Capability.Container }),
  columnHeader: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  weekRow: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  weekNumber: Slot.make({ capability: Capability.Container }),
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
  presets: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  preset: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaPressed],
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
  /** The week's ISO number and its cell, when `weekNumbers` asks for them. */
  readonly weekNumber: Option.Option<{
    readonly number: number
    readonly attributes: SlotAttributes<Message>
  }>
}
export type ResolvedMonthCell<Message> = Omit<MonthCell, 'cellAttributes' | 'buttonAttributes'> & {
  readonly cellAttributes: SlotAttributes<Message>
  readonly buttonAttributes: SlotAttributes<Message>
}
export type ResolvedYearCell<Message> = Omit<YearCell, 'cellAttributes' | 'buttonAttributes'> & {
  readonly cellAttributes: SlotAttributes<Message>
  readonly buttonAttributes: SlotAttributes<Message>
}

/** One choice of a caption dropdown. */
export interface DropdownOption {
  readonly value: number
  readonly label: string
  readonly selected: boolean
  readonly disabled: boolean
}

export interface ResolvedDropdown<Message> {
  readonly attributes: SlotAttributes<Message>
  readonly options: ReadonlyArray<DropdownOption>
}

/** What the days' header holds between its paging buttons. */
export type ResolvedCaption<Message> =
  | { readonly _tag: 'Grid'; readonly headingButton: SlotAttributes<Message> }
  | { readonly _tag: 'Label'; readonly heading: SlotAttributes<Message> }
  | {
      readonly _tag: 'Dropdowns'
      readonly month: ResolvedDropdown<Message>
      readonly year: ResolvedDropdown<Message>
    }

export interface ResolvedDays<Message> {
  readonly _tag: 'Days'
  readonly root: SlotAttributes<Message>
  readonly header: SlotAttributes<Message>
  /** A paging button the options hide is none. */
  readonly previousMonthButton: Option.Option<SlotAttributes<Message>>
  readonly nextMonthButton: Option.Option<SlotAttributes<Message>>
  readonly caption: ResolvedCaption<Message>
  readonly heading: DaysModeAttributes['heading']
  readonly grid: SlotAttributes<Message>
  readonly headerRow: SlotAttributes<Message>
  /** The week numbers' column header, when `weekNumbers` asks for them. */
  readonly weekNumberHeader: Option.Option<SlotAttributes<Message>>
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

/**
 * Arrow keys read by the direction the calendar is drawn in: right to left,
 * ArrowLeft goes to the next day, month or year, as the APG asks. Upstream's
 * keys know no direction, and its bundles no view option reaches, so this is a Mount
 * (`ReadingKeys`) that reads the key before upstream's handler does. Pass it
 * beside the style where the page may be right to left. It is not built in
 * because a Scene test must resolve every Mount with a Message, and this one
 * has none to give.
 */
export const readingKeys = Behavior.forSlots(CalendarSlots)<unknown, never>(
  {
    root: Behavior.slot({
      requires: { capability: Capability.Container },
      mount: () => ReadingKeys(),
    }),
  },
  { name: 'CalendarReadingKeys' },
).mixin

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

/** The month and year selects in place of the heading. */
export interface Dropdowns<Message> {
  /** The calendar's Model, for its names, the month shown and its bounds. */
  readonly model: CalendarModel
  /** Sent for a choice; answer it with `show`. */
  readonly onShow: (shown: Shown) => Message
  /** The years offered; default the bounds' years, or ten either side of the year shown. */
  readonly years?: { readonly from: number; readonly to: number } | undefined
  /** The selects' names; default `Month` and `Year`. */
  readonly labels?: { readonly month: string; readonly year: string } | undefined
}

/** A range's preview: the day the pointer is on, while the range waits for its end. */
export interface Preview<Message> {
  readonly date: Option.Option<Dates.CalendarDate>
  /** Sent as the pointer enters a day, and with none as it leaves the grid. */
  readonly onPreview: (date: Option.Option<Dates.CalendarDate>) => Message
}

/** What a Calendar draws beyond upstream's grid. Every option is off by default. */
export interface CalendarOptions<Message> {
  /** Draws the resolved bundles; default `draw`. */
  readonly render?: ((resolved: ResolvedCalendar<Message>) => Html) | undefined
  /** A column of ISO 8601 week numbers before the days. */
  readonly weekNumbers?: boolean | undefined
  /**
   * The days' heading: `grid` (default) is a button opening a grid of months,
   * then of years; `label` the month and year as text. `dropdowns` replaces
   * either.
   */
  readonly caption?: 'grid' | 'label' | undefined
  readonly dropdowns?: Dropdowns<Message> | undefined
  /**
   * Which paging buttons are drawn; default both. Two months side by side
   * draw `previous` on the first and `next` on the second.
   */
  readonly paging?: 'both' | 'previous' | 'next' | 'none' | undefined
  readonly preview?: Preview<Message> | undefined
}

const DAY = 86_400_000

/** The ISO 8601 week of `date`: the week of its Thursday, counted in that Thursday's year. */
export const isoWeek = (date: Dates.CalendarDate): number => {
  const at = Date.UTC(date.year, date.month - 1, date.day)
  // Monday 1 through Sunday 7.
  const weekday = ((new Date(at).getUTCDay() + 6) % 7) + 1
  const thursday = new Date(at + (4 - weekday) * DAY)
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - yearStart) / DAY / 7) + 1
}

const firstOf = (year: number, month: number) => Dates.make(year, month, 1)
const lastOf = (year: number, month: number) =>
  Dates.make(year, month, Dates.daysInMonth(year, month))

const outside = (
  model: CalendarModel,
  first: Dates.CalendarDate,
  last: Dates.CalendarDate,
): boolean =>
  Option.exists(model.maybeMinDate, min => Dates.isBefore(last, min)) ||
  Option.exists(model.maybeMaxDate, max => Dates.isAfter(first, max))

const dropdownsOf = <Message>(
  dropdowns: Dropdowns<Message>,
  builders: ReturnType<typeof buildersOf<typeof CalendarSlots, unknown, Message>>,
  context: ResolveContext<unknown, Message>,
): ResolvedCaption<Message> => {
  const { h } = context
  const { model, onShow } = dropdowns
  const year = model.viewYear
  const labels = dropdowns.labels ?? { month: 'Month', year: 'Year' }
  const span = dropdowns.years ?? {
    from: Option.match(model.maybeMinDate, { onNone: () => year - 10, onSome: min => min.year }),
    to: Option.match(model.maybeMaxDate, { onNone: () => year + 10, onSome: max => max.year }),
  }
  const years = Arr.range(Math.min(span.from, year), Math.max(span.to, year))
  return {
    _tag: 'Dropdowns',
    month: {
      attributes: builders.monthSelect.attrs([
        h.AriaLabel(labels.month),
        h.Value(String(model.viewMonth)),
        h.OnChange(value => onShow(Shown.Month({ month: Number(value) }))),
      ]),
      options: model.locale.monthNames.map((label, index) => ({
        value: index + 1,
        label,
        selected: index + 1 === model.viewMonth,
        disabled: outside(model, firstOf(year, index + 1), lastOf(year, index + 1)),
      })),
    },
    year: {
      attributes: builders.yearSelect.attrs([
        h.AriaLabel(labels.year),
        h.Value(String(year)),
        h.OnChange(value => onShow(Shown.Year({ year: Number(value) }))),
      ]),
      options: years.map(each => ({
        value: each,
        label: String(each),
        selected: each === year,
        disabled: outside(model, firstOf(each, 1), lastOf(each, 12)),
      })),
    },
  }
}

/** Resolves every mode's nested groups, preserving the `_tag` and heading data. */
export const resolve = <Input, Message>(
  render: CalendarAttributes,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
  options: NoInfer<CalendarOptions<Message>> = {},
): ResolvedCalendar<Message> => {
  const builders = buildersOf(CalendarSlots, mixins, context)
  const root = builders.root.attrs(render.root)
  const header = builders.header.attrs()
  const grid = builders.grid.attrs(render.grid)
  switch (render._tag) {
    case 'Days': {
      const paging = options.paging ?? 'both'
      const caption: ResolvedCaption<Message> =
        options.dropdowns !== undefined
          ? dropdownsOf(options.dropdowns, builders, { input: undefined, h: context.h })
          : options.caption === 'label'
            ? {
                _tag: 'Label',
                // Said when the month changes, as the heading button would be read when pressed.
                heading: builders.heading.attrs([
                  context.h.Id(render.heading.id),
                  context.h.AriaLive('polite'),
                ]),
              }
            : { _tag: 'Grid', headingButton: builders.headingButton.attrs(render.headingButton) }
      const numbered = options.weekNumbers === true
      return {
        _tag: 'Days',
        root,
        header,
        grid,
        heading: render.heading,
        caption,
        previousMonthButton: Option.liftPredicate(
          builders.previousMonthButton.attrs(render.previousMonthButton),
          () => paging === 'both' || paging === 'previous',
        ),
        nextMonthButton: Option.liftPredicate(
          builders.nextMonthButton.attrs(render.nextMonthButton),
          () => paging === 'both' || paging === 'next',
        ),
        headerRow: builders.headerRow.attrs(render.headerRow),
        weekNumberHeader: numbered
          ? Option.some(builders.weekNumberHeader.attrs([context.h.AriaHidden(true)]))
          : Option.none(),
        columnHeaders: render.columnHeaders.map(column => ({
          ...column,
          attributes: builders.columnHeader.attrs(column.attributes),
        })),
        weeks: render.weeks.map(week => ({
          ...week,
          attributes: builders.weekRow.attrs(week.attributes),
          // The row's fourth day shares its ISO week with every day of the row but one end.
          weekNumber: numbered
            ? Option.map(Arr.get(week.cells, 3), cell => ({
                number: isoWeek(cell.date),
                // The row is named by its first day; the number is a picture of it.
                attributes: builders.weekNumber.attrs([context.h.AriaHidden(true)]),
              }))
            : Option.none(),
          cells: week.cells.map(cell => ({
            ...cell,
            cellAttributes: builders.dayCell.attrs(cell.cellAttributes),
            buttonAttributes: builders.dayButton.attrs(cell.buttonAttributes),
          })),
        })),
      }
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

const drawDropdown = <Message>(dropdown: ResolvedDropdown<Message>, h: HtmlBuilder<Message>) =>
  h.select(
    dropdown.attributes,
    dropdown.options.map(option =>
      h.option(
        [
          h.Key(String(option.value)),
          h.Value(String(option.value)),
          h.Selected(option.selected),
          ...(option.disabled ? [h.Disabled(true)] : []),
        ],
        [option.label],
      ),
    ),
  )

/**
 * The month grid in every mode, as upstream lays it out, with a header row of
 * its own. The paging buttons hold `‹` and `›`, which the Unicode bidi
 * algorithm mirrors right to left, where the buttons also swap sides.
 */
export const draw = <Message>(calendar: ResolvedCalendar<Message>, h: HtmlBuilder<Message>): Html =>
  Match.valueTags(calendar, {
    Days: days =>
      h.div(days.root, [
        h.div(days.header, [
          ...Option.match(days.previousMonthButton, {
            onNone: () => [],
            onSome: attributes => [h.button(attributes, ['‹'])],
          }),
          ...Match.valueTags(days.caption, {
            Grid: ({ headingButton }) => [h.button(headingButton, [days.heading.text])],
            Label: ({ heading }) => [h.span(heading, [days.heading.text])],
            Dropdowns: ({ month, year }) => [drawDropdown(month, h), drawDropdown(year, h)],
          }),
          ...Option.match(days.nextMonthButton, {
            onNone: () => [],
            onSome: attributes => [h.button(attributes, ['›'])],
          }),
        ]),
        h.div(days.grid, [
          h.div(days.headerRow, [
            ...Option.match(days.weekNumberHeader, {
              onNone: () => [],
              onSome: attributes => [h.div(attributes, ['#'])],
            }),
            ...days.columnHeaders.map(column => h.div(column.attributes, [column.name])),
          ]),
          ...days.weeks.map(week =>
            h.div(week.attributes, [
              ...Option.match(week.weekNumber, {
                onNone: () => [],
                onSome: ({ number, attributes }) => [h.div(attributes, [String(number)])],
              }),
              ...week.cells.map(cell =>
                h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
              ),
            ]),
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

/** The selection's first day: where a calendar shows it from, as after a preset. */
export const firstDate = (selection: Selection): Option.Option<Dates.CalendarDate> =>
  Selection.match(selection, {
    Single: ({ date }) => date,
    Range: ({ start }) => start,
    Multiple: ({ dates }) => Arr.head(dates),
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
 * upstream's, since upstream knows only the date it is given. A range waiting
 * for its end, previewed at a day, marks the days it would hold
 * `data-preview`, and its far end `data-preview-end`.
 */
const marksOf = <Message>(
  selection: Selection,
  preview: Option.Option<Dates.CalendarDate>,
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
      const previewed = Option.flatMap(
        Option.filter(start, () => Option.isNone(end)),
        from =>
          Option.map(preview, to => ({
            to,
            between: { minimum: Dates.min(from, to), maximum: Dates.max(from, to) },
          })),
      )
      return (day: Dates.CalendarDate) => {
        const starts = Option.exists(start, Dates.isEqual(day))
        const ends = Option.exists(end, Dates.isEqual(day))
        const within = Option.exists(bounds, between => Dates.between(day, between))
        const shown = Option.filter(previewed, ({ between }) => Dates.between(day, between))
        const previewAttributes = Option.match(shown, {
          onNone: () => [],
          onSome: ({ to }) => [
            h.DataAttribute('preview', ''),
            ...(Dates.isEqual(day, to) ? [h.DataAttribute('preview-end', '')] : []),
          ],
        })
        if (!starts && !ends && !within) return { chosen: false, attributes: previewAttributes }
        return {
          chosen: true,
          attributes: [
            ...(starts ? [h.DataAttribute('range-start', '')] : []),
            ...(ends ? [h.DataAttribute('range-end', '')] : []),
            ...(within ? [h.DataAttribute('in-range', '')] : []),
            ...(starts || ends ? [h.DataAttribute('selected', '')] : []),
            ...previewAttributes,
            h.AriaSelected(true),
          ],
        }
      }
    },
  })
}

/** Whether a range waits for its end, when the pointer previews one. */
const awaitsEnd = (selection: Selection): boolean =>
  Selection.match(selection, {
    Single: () => false,
    Range: ({ start, end }) => Option.isSome(start) && Option.isNone(end),
    Multiple: () => false,
  })

const marked = <Message>(
  calendar: ResolvedCalendar<Message>,
  selection: Selection,
  options: CalendarOptions<Message>,
  h: HtmlBuilder<Message>,
): ResolvedCalendar<Message> =>
  Match.valueTags(calendar, {
    Days: days => {
      const preview = Option.fromNullishOr(options.preview)
      const markOf = marksOf(
        selection,
        Option.flatMap(preview, ({ date }) => date),
        h,
      )
      // Only a range waiting for its end listens, so a hover sends nothing otherwise.
      const listening = Option.filter(preview, () => awaitsEnd(selection))
      return {
        ...days,
        // A grid holding many chosen days says so, or a reader announces a single choice.
        grid: [
          ...days.grid,
          ...Selection.match(selection, {
            Single: () => [],
            Range: () => [h.AriaMultiSelectable(true)],
            Multiple: () => [h.AriaMultiSelectable(true)],
          }),
          ...Option.match(listening, {
            onNone: () => [],
            onSome: ({ onPreview }) => [h.OnMouseLeave(onPreview(Option.none()))],
          }),
        ],
        weeks: days.weeks.map(week => ({
          ...week,
          cells: week.cells.map(cell => {
            const mark = markOf(cell.date)
            return {
              ...cell,
              isSelected: cell.isSelected || mark.chosen,
              cellAttributes: [...cell.cellAttributes, ...mark.attributes],
              buttonAttributes: Option.match(
                Option.filter(listening, () => !cell.isDisabled),
                {
                  onNone: () => cell.buttonAttributes,
                  onSome: ({ onPreview }) => [
                    ...cell.buttonAttributes,
                    h.OnMouseEnter(onPreview(Option.some(cell.date))),
                  ],
                },
              ),
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
 * one, they are drawn by `draw` above. A Mixin that reads the mode needs
 * `resolve`, whose `input` can be `_tag`. `inputs` gives it with the
 * `maybeSelectedDate` that agrees with it. `options` adds week numbers, a
 * caption of dropdowns or a label, hides a paging button, and previews a
 * range.
 */
export const toView =
  <Message>(
    selection: Selection,
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    options: NoInfer<CalendarOptions<Message>> = {},
  ) =>
  (attributes: CalendarAttributes): Html =>
    (options.render ?? (resolved => draw(resolved, context.h)))(
      marked(resolve(attributes, mixins, context, options), selection, options, context.h),
    )

/**
 * The Calendar's view inputs from one `selection`: `toView` above, and
 * upstream's `maybeSelectedDate` read from the same selection, so the two
 * cannot mark different days. Spread them into upstream `Calendar.view`'s inputs.
 */
export const inputs = <Message>(
  selection: Selection,
  mixins: MixinList<Message>,
  context: ResolveContext<unknown, Message>,
  options: NoInfer<CalendarOptions<Message>> = {},
): {
  readonly maybeSelectedDate: Option.Option<Dates.CalendarDate>
  readonly toView: (attributes: CalendarAttributes) => Html
} => ({
  maybeSelectedDate: selectedDate(selection),
  toView: toView(selection, mixins, context, options),
})

/** A named selection one press away, such as "Last 7 days". */
export interface Preset {
  readonly label: string
  readonly selection: Selection
}

export interface PresetsView<Message> {
  readonly presets: ReadonlyArray<Preset>
  /** The selection now, so the preset holding it is pressed. */
  readonly selection: Selection
  /** Sent with a preset's selection; show its `firstDate` on the calendar beside it. */
  readonly onPick: (selection: Selection) => NoInfer<Message>
  /** The group's name; default `Presets`. */
  readonly label?: string | undefined
  /** A style of `CalendarSlots`, the same the calendar takes. */
  readonly style?: NamedStyle<typeof CalendarSlots> | undefined
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * Presets beside a calendar, as shadcn and Zag draw them: a group of buttons,
 * each choosing its whole selection, the one equal to the selection now
 * pressed.
 */
export const presetsView = <Message>(
  options: PresetsView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    CalendarSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(
    builders.presets.attrs([h.Role('group'), h.AriaLabel(options.label ?? 'Presets')]),
    options.presets.map(preset =>
      h.button(
        builders.preset.attrs([
          h.Key(preset.label),
          h.Type('button'),
          h.AriaPressed(String(isSame(preset.selection, options.selection))),
          h.OnClick(options.onPick(preset.selection)),
        ]),
        [preset.label],
      ),
    ),
  )
}

const dayNamesOrder = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Intl's week starts Monday 1 through Sunday 7. */
const firstDayOf = (tag: string): Dates.DayOfWeek => {
  const locale = new Intl.Locale(tag)
  // `getWeekInfo` in today's engines, a `weekInfo` getter in older ones; neither is in every lib.
  const read: unknown = Reflect.get(locale, 'getWeekInfo')
  const info: unknown =
    typeof read === 'function' ? Reflect.apply(read, locale, []) : Reflect.get(locale, 'weekInfo')
  const first = typeof info === 'object' && info !== null ? Reflect.get(info, 'firstDay') : 1
  return typeof first === 'number' ? (dayNamesOrder[first % 7] ?? 'Monday') : 'Monday'
}

type Part = Dates.DatePart

/** A date's parts as Intl writes them for `tag`, read as the calendar's `DatePart`s. */
const partsOf = (tag: string, options: Intl.DateTimeFormatOptions): ReadonlyArray<Part> =>
  new Intl.DateTimeFormat(tag, { ...options, timeZone: 'UTC' })
    .formatToParts(Date.UTC(2026, 1, 11))
    .flatMap((part): ReadonlyArray<Part> => {
      switch (part.type) {
        case 'month':
          return [
            options.month === 'long'
              ? Dates.DatePart.MonthName()
              : options.month === 'short'
                ? Dates.DatePart.ShortMonthName()
                : Dates.DatePart.MonthNumber(),
          ]
        case 'day':
          return [Dates.DatePart.DayNumber()]
        case 'weekday':
          return [Dates.DatePart.DayName()]
        case 'year':
          return [Dates.DatePart.YearNumber()]
        case 'literal':
          return [Dates.DatePart.LiteralText({ text: part.value })]
        default:
          // An era or a related year has no part of its own; the calendar is Gregorian.
          return []
      }
    })

const formatOf = (
  tag: string,
  options: Intl.DateTimeFormatOptions,
  fallback: Dates.DateFormat,
): Dates.DateFormat => {
  const parts = partsOf(tag, options)
  return Arr.isReadonlyArrayNonEmpty(parts) ? parts : fallback
}

const monthYearOf = (tag: string): Dates.MonthYearFormat => {
  const parts = new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .formatToParts(Date.UTC(2026, 1, 11))
    .flatMap((part): ReadonlyArray<Dates.MonthYearFormat[number]> => {
      switch (part.type) {
        case 'month':
          return [Dates.DatePart.MonthName()]
        case 'year':
          return [Dates.DatePart.YearNumber()]
        case 'literal':
          return [Dates.DatePart.LiteralText({ text: part.value })]
        default:
          return []
      }
    })
  return Arr.isReadonlyArrayNonEmpty(parts) ? parts : Dates.defaultEnglishLocale.monthYearFormat
}

/**
 * The calendar's locale for a BCP 47 tag, from the engine's Intl: month and
 * weekday names, the first day of the week (Intl's week info; Monday where
 * the engine has none), and dates written in the language's own order. Pass
 * it as upstream `Calendar.init`'s `locale`.
 */
export const localeOf = (tag: string): Dates.LocaleConfig => {
  const name = (options: Intl.DateTimeFormatOptions) => (at: number) =>
    new Intl.DateTimeFormat(tag, { ...options, timeZone: 'UTC' }).format(at)
  const month = (format: Intl.DateTimeFormatOptions['month']) => (index: number) =>
    name({ month: format })(Date.UTC(2026, index, 15))
  // 1 February 2026 is a Sunday: day names are kept Sunday first.
  const weekday = (format: Intl.DateTimeFormatOptions['weekday']) => (index: number) =>
    name({ weekday: format })(Date.UTC(2026, 1, 1 + index))
  const twelve = <A>(f: (index: number) => A) =>
    [f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7), f(8), f(9), f(10), f(11)] as const
  const seven = <A>(f: (index: number) => A) => [f(0), f(1), f(2), f(3), f(4), f(5), f(6)] as const
  const english = Dates.defaultEnglishLocale
  return {
    firstDayOfWeek: firstDayOf(tag),
    monthNames: twelve(month('long')),
    shortMonthNames: twelve(month('short')),
    dayNames: seven(weekday('long')),
    shortDayNames: seven(weekday('short')),
    longFormat: formatOf(
      tag,
      { year: 'numeric', month: 'long', day: 'numeric' },
      english.longFormat,
    ),
    shortFormat: formatOf(
      tag,
      { year: 'numeric', month: 'short', day: 'numeric' },
      english.shortFormat,
    ),
    ariaLabelFormat: formatOf(
      tag,
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
      english.ariaLabelFormat,
    ),
    monthYearFormat: monthYearOf(tag),
  }
}
