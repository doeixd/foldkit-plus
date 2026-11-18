import { CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import appointment from '../../examples/calendar/appointment.js'
import basic from '../../examples/calendar/basic.js'
import dropdowns from '../../examples/calendar/dropdowns.js'
import presets from '../../examples/calendar/presets.js'
import range from '../../examples/calendar/range.js'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import * as Calendars from '../calendars.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

/** A Message of the Calendar page's examples that are still regions, as the page sends it. */
const calendars = <Message>(live: Live<Message>, message: Calendars.Message): Message =>
  live.onWidget(Widgets.Message.GotCalendars({ message }))

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
    // The four below are drawn through the adapter, with state the page folds by hand.
    {
      name: 'unavailable',
      title: 'Weekends, booked days and bounds',
      draw: (style, live) =>
        Snippet.calendarUnavailable(
          style,
          live.widgets.calendars.unavailable,
          message => calendars(live, Calendars.Message.GotUnavailable({ message })),
          live.h,
        ),
    },
    {
      name: 'several',
      title: 'Several days',
      draw: (style, live) =>
        Snippet.calendarSeveral(
          style,
          live.widgets.calendars.several,
          {
            onCalendar: message => calendars(live, Calendars.Message.GotSeveral({ message })),
            onClear: calendars(live, Calendars.Message.ClearedSeveral()),
          },
          live.h,
        ),
    },
    {
      name: 'prices',
      title: 'A price on each day',
      pins: { detail: 'text' },
      draw: (style, live) =>
        Snippet.calendarPrices(
          style,
          live.widgets.calendars.prices,
          {
            onCalendar: message => calendars(live, Calendars.Message.GotPrices({ message })),
            onPreview: date => calendars(live, Calendars.Message.PreviewedPrices({ date })),
          },
          live.h,
        ),
    },
    {
      name: 'events',
      title: 'Events and a Today button',
      pins: { detail: 'dot' },
      draw: (style, live) =>
        Snippet.calendarEvents(
          style,
          live.widgets.calendars.events,
          {
            onCalendar: message => calendars(live, Calendars.Message.GotEvents({ message })),
            onToday: calendars(live, Calendars.Message.ShowedToday()),
          },
          live.h,
        ),
    },
  ],
)
