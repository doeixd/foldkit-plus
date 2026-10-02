import { Submodel } from 'foldkit'

import { Calendar as UiCalendar } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'

import { calendarGrid } from '../calendarGrid.js'
import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { CalendarPageSlots, CalendarPageStyle } from '../style/calendar.js'
import { CardCalendarStyle } from '../style/calendarGrid.js'

const CalendarPage = SlotView.forMessages<UiMessage>()
  .define(CalendarPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Calendar']),
      h.submodel({
        slotId: model.calendarBasicDemo.id,
        model: model.calendarBasicDemo,
        view: UiCalendar.view,
        viewInputs: {
          maybeSelectedDate: model.maybeCalendarBasicDemoSelectedDate,
          toView: calendarGrid(CardCalendarStyle, slots, h),
        },
        toParentMessage: message => UiMessage.GotCalendarBasicDemoMessage({ message }),
      }),
    ]),
  )
  .pipe(Style.attach(CalendarPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(CalendarPage)
