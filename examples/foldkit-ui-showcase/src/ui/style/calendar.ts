import { Slots, Style } from 'foldkit-mixins'

import { app } from '../../style.js'
import { calendarGridSlots, calendarGridStyles } from './calendarGrid.js'
import { demoSlots, demoStyles } from './shared.js'

export const CalendarPageSlots = Slots.define({ ...demoSlots, ...calendarGridSlots })

export const CalendarPageStyle = Style.forSlots(CalendarPageSlots)(
  { ...demoStyles, ...calendarGridStyles },
  { name: 'CalendarPageStyle', layer: app },
)
