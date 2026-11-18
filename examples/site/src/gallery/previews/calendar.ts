import { CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import appointment from '../../examples/calendar/appointment.js'
import basic from '../../examples/calendar/basic.js'
import dropdowns from '../../examples/calendar/dropdowns.js'
import events from '../../examples/calendar/events.js'
import presets from '../../examples/calendar/presets.js'
import prices from '../../examples/calendar/prices.js'
import range from '../../examples/calendar/range.js'
import several from '../../examples/calendar/several.js'
import unavailable from '../../examples/calendar/unavailable.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('calendar'),
  CalendarSlots,
  Recipes.Calendar,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'range', example: range },
    { name: 'dropdowns', example: dropdowns },
    { name: 'presets', example: presets },
    { name: 'appointment', example: appointment },
    { name: 'unavailable', example: unavailable },
    { name: 'several', example: several },
    { name: 'prices', example: prices },
    { name: 'events', example: events },
  ],
)
