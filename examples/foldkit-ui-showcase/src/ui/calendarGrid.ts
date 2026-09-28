/**
 * The calendar the Calendar and Date Picker pages both draw, through the
 * Calendar adapter: the day grid, and the month and year pickers its heading
 * opens. Upstream repeats it in both pages; here it is drawn once.
 */
import { Match } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { Calendar as UiCalendar } from '@foldkit/ui'
import type { NamedStyle, SlotAttributes, SlotBuilders } from 'foldkit-mixins'
import { Calendar, type CalendarSlots, type ResolvedCalendar } from 'foldkit-mixins-ui'

import * as Icon from '../icon.js'
import type { Message as UiMessage } from './message.js'
import type { calendarGridSlots } from './style/calendarGrid.js'

type Slots = SlotBuilders<typeof calendarGridSlots, UiMessage>

type Heading = UiCalendar.DaysModeAttributes['heading']

const navButton = (
  attributes: SlotAttributes<UiMessage>,
  icon: typeof Icon.chevronLeft,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => h.button(attributes, [icon(slots.navIcon.attrs(), h)])

const headingButton = (
  heading: Heading,
  attributes: SlotAttributes<UiMessage>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  h.button(
    [h.Id(heading.id), ...attributes],
    [heading.text, Icon.chevronDown(slots.headingIcon.attrs(), h)],
  )

const draw = (
  calendar: ResolvedCalendar<UiMessage>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  Match.value(calendar).pipe(
    Match.tagsExhaustive({
      Days: days =>
        h.div(days.root, [
          h.div(slots.calendarHeader.attrs(), [
            navButton(days.previousMonthButton, Icon.chevronLeft, slots, h),
            headingButton(days.heading, days.headingButton, slots, h),
            navButton(days.nextMonthButton, Icon.chevronRight, slots, h),
          ]),
          h.div(days.grid, [
            h.div(
              days.headerRow,
              days.columnHeaders.map(header => h.div(header.attributes, [header.name])),
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
          h.div(slots.monthsHeader.attrs(), [
            headingButton(months.heading, months.headingButton, slots, h),
          ]),
          h.div(
            months.grid,
            months.cells.map(cell =>
              h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.shortLabel])]),
            ),
          ),
        ]),
      Years: years =>
        h.div(years.root, [
          h.div(slots.calendarHeader.attrs(), [
            navButton(years.previousPageButton, Icon.chevronLeft, slots, h),
            h.h2(slots.yearsHeading.attrs([h.Id(years.heading.id)]), [years.heading.text]),
            navButton(years.nextPageButton, Icon.chevronRight, slots, h),
          ]),
          h.div(
            years.grid,
            years.cells.map(cell =>
              h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
            ),
          ),
        ]),
    }),
  )

/** A `toView` for a Calendar, or a Date Picker's `toCalendarView`, in `style`. */
export const calendarGrid =
  (style: NamedStyle<typeof CalendarSlots>, slots: Slots, h: HtmlBuilder<UiMessage>) =>
  (attributes: UiCalendar.CalendarAttributes): Html =>
    draw(Calendar.resolve(attributes, [style.mixin], { input: undefined, h }), slots, h)
