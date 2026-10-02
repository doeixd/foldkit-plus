import { Option } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'

import { DatePicker as UiDatePicker } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/popover'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import * as Icon from '../../icon.js'
import { calendarGrid } from '../calendarGrid.js'
import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { PanelCalendarStyle } from '../style/calendarGrid.js'
import { DatePickerPageSlots, DatePickerPageStyle } from '../style/datePicker.js'

type Slots = SlotBuilders<typeof DatePickerPageSlots, UiMessage>

// TRIGGER

const DATE_PICKER_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

const formatTriggerLabel = (date: Readonly<{ year: number; month: number; day: number }>): string =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`

const triggerContent = (
  maybeDate: Option.Option<Readonly<{ year: number; month: number; day: number }>>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  h.div(slots.triggerContent.attrs(), [
    Option.match(maybeDate, {
      onNone: () => h.span(slots.placeholder.attrs(), ['Pick a date']),
      onSome: date => h.span(slots.dateLabel.attrs(), [formatTriggerLabel(date)]),
    }),
    Icon.chevronDown(slots.triggerIcon.attrs(), h),
  ])

// VIEW

const DatePickerPage = SlotView.forMessages<UiMessage>()
  .define(DatePickerPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Date Picker']),
      h.label(
        slots.fieldLabel.attrs([h.For(UiDatePicker.triggerId(model.datePickerBasicDemo.id))]),
        ['Due date'],
      ),
      h.submodel({
        slotId: model.datePickerBasicDemo.id,
        model: model.datePickerBasicDemo,
        view: UiDatePicker.view,
        viewInputs: {
          anchor: DATE_PICKER_ANCHOR,
          maybeSelectedDate: model.maybeDatePickerBasicDemoSelectedDate,
          triggerContent: maybeDate => triggerContent(maybeDate, slots, h),
          attributes: childAttributes(slots.picker.attrs()),
          triggerAttributes: childAttributes(slots.trigger.attrs()),
          panelAttributes: childAttributes(slots.panel.attrs()),
          backdropAttributes: childAttributes(slots.backdrop.attrs()),
          toCalendarView: calendarGrid(PanelCalendarStyle, slots, h),
        },
        toParentMessage: message => UiMessage.GotDatePickerBasicDemoMessage({ message }),
      }),
    ]),
  )
  .pipe(Style.attach(DatePickerPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(DatePickerPage)
