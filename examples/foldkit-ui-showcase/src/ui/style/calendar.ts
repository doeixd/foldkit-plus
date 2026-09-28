import { Slots } from 'foldkit-mixins'

import { forSlots } from '../../style.js'
import { calendarGridSlots, calendarGridStyles } from './calendarGrid.js'
import { demoSlots, demoStyles } from './shared.js'

export const CalendarPageSlots = Slots.define({ ...demoSlots, ...calendarGridSlots })

export const CalendarPageStyle = forSlots(CalendarPageSlots)(
  { ...demoStyles, ...calendarGridStyles },
  { name: 'CalendarPageStyle' },
)
