import { DatePicker as UiDatePicker } from '@foldkit/ui'
import type { CalendarAttributes } from '@foldkit/ui/calendar'
import { Match, Option } from 'effect'
import type { CalendarDate } from 'foldkit/calendar'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { Calendar } from 'foldkit-mixins-ui'

import { CalendarStyle, DatePickerPart } from '../style.js'
import { fullDate } from './format.js'
import * as Icon from './icon.js'

type Slots<Message> = SlotBuilders<typeof DatePickerPart.slots, Message>

const ANCHOR = { placement: 'bottom-start' as const, gap: 4, padding: 8 }

const face = <Message>(
  maybeDate: Option.Option<CalendarDate>,
  placeholder: string,
  slots: Slots<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.face.attrs(), [
    Option.match(maybeDate, {
      onNone: () => h.span(slots.placeholder.attrs(), [placeholder]),
      onSome: date => h.span(slots.value.attrs(), [fullDate(date)]),
    }),
    Icon.chevronDown(slots.chevron.attrs(), h),
  ])

/** The calendar in the picker's panel, in whichever mode it is showing. */
const calendarView = <Message>(
  attributes: CalendarAttributes,
  slots: Slots<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const calendar = Calendar.resolve(attributes, [CalendarStyle.mixin], {
    input: attributes._tag,
    h,
  })
  const headingChevron = Icon.chevronDown(slots.headingChevron.attrs(), h)
  return Match.value(calendar).pipe(
    Match.tagsExhaustive({
      Days: days =>
        h.div(days.root, [
          h.div(slots.calendarBar.attrs(), [
            h.button(days.previousMonthButton, ['‹']),
            h.button(
              [h.Id(days.heading.id), ...days.headingButton],
              [days.heading.text, headingChevron],
            ),
            h.button(days.nextMonthButton, ['›']),
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
          h.div(slots.calendarBar.attrs(), [
            h.button(
              [h.Id(months.heading.id), ...months.headingButton],
              [months.heading.text, headingChevron],
            ),
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
          h.div(slots.calendarBar.attrs(), [
            h.button(years.previousPageButton, ['‹']),
            h.h2([h.Id(years.heading.id), ...slots.yearsHeading.attrs()], [years.heading.text]),
            h.button(years.nextPageButton, ['›']),
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
}

/** A labelled `@foldkit/ui` DatePicker, its trigger showing the date or a placeholder. */
export const view = <Message>(
  config: Readonly<{
    label: string
    placeholder: string
    model: UiDatePicker.Model
    maybeSelectedDate: Option.Option<CalendarDate>
    toParentMessage: (message: UiDatePicker.Message) => Message
  }>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = SlotView.buildersFor(DatePickerPart.slots, [DatePickerPart.style.mixin], {
    input: undefined,
    h,
  })
  return h.keyed('div')(config.model.id, slots.field.attrs(), [
    h.label(slots.label.attrs(), [config.label]),
    h.submodel({
      slotId: config.model.id,
      model: config.model,
      view: UiDatePicker.view,
      viewInputs: {
        anchor: ANCHOR,
        maybeSelectedDate: config.maybeSelectedDate,
        triggerContent: maybeDate => face(maybeDate, config.placeholder, slots, h),
        toCalendarView: attributes => calendarView(attributes, slots, h),
        attributes: childAttributes(slots.picker.attrs()),
        triggerAttributes: childAttributes(slots.trigger.attrs()),
        panelAttributes: childAttributes(slots.panel.attrs()),
        backdropAttributes: childAttributes(slots.backdrop.attrs()),
      },
      toParentMessage: config.toParentMessage,
    }),
  ])
}
