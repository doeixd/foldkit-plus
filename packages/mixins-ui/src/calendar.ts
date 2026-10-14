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
import { Match } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
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
  ResolvedDays<Message> | ResolvedMonths<Message> | ResolvedYears<Message>

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

/**
 * The calendar's `toView`: `draw` receives its bundles with `mixins` applied;
 * without one, they are drawn by `draw` above. A Mixin that reads the mode
 * needs `resolve`, whose `input` can be `_tag`.
 */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    render: (resolved: ResolvedCalendar<Message>) => Html = resolved => draw(resolved, context.h),
  ) =>
  (attributes: CalendarAttributes): Html =>
    render(resolve(attributes, mixins, context))
