import type { NamedStyle } from 'foldkit-mixins'
import { CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import * as Calendars from '../calendars.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

/** A Message of the Calendar page's further examples, as the page sends it. */
const calendars = <Message>(live: Live<Message>, message: Calendars.Message): Message =>
  live.onWidget(Widgets.Message.GotCalendars({ message }))

const calendarBasic = <Message>(style: NamedStyle<typeof CalendarSlots>, live: Live<Message>) =>
  Snippet.calendar(
    style,
    {
      calendar: live.widgets.calendar,
      selection: live.widgets.selection,
      trip: live.widgets.trip,
      tripDates: live.widgets.tripDates,
    },
    message => live.onWidget(Widgets.Message.GotCalendar({ message })),
    message => live.onWidget(Widgets.Message.GotTripCalendar({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('calendar'),
  CalendarSlots,
  Recipes.Calendar,
  (style, live) =>
    Snippet.calendar(
      style,
      {
        calendar: live.widgets.calendar,
        selection: live.widgets.selection,
        trip: live.widgets.trip,
        tripDates: live.widgets.tripDates,
      },
      message => live.onWidget(Widgets.Message.GotCalendar({ message })),
      message => live.onWidget(Widgets.Message.GotTripCalendar({ message })),
      live.h,
    ),
  undefined,
  [
    { name: 'single-range', title: 'A day and a range', draw: calendarBasic },
    {
      name: 'two-months',
      title: 'Two months and presets',
      draw: (style, live) =>
        Snippet.calendarTwoMonths(
          style,
          live.widgets.twoMonths,
          {
            onFirst: message => live.onWidget(Widgets.Message.GotTripFirst({ message })),
            onSecond: message => live.onWidget(Widgets.Message.GotTripSecond({ message })),
            onPreview: date => live.onWidget(Widgets.Message.PreviewedTrip({ date })),
            onPreset: selection => live.onWidget(Widgets.Message.PickedTripPreset({ selection })),
          },
          live.h,
        ),
    },
    {
      name: 'dropdowns',
      title: 'Month and year selects, week numbers',
      draw: (style, live) =>
        Snippet.calendarDropdowns(
          style,
          { calendar: live.widgets.dropdownCalendar, selection: live.widgets.dropdownDay },
          message => live.onWidget(Widgets.Message.GotDropdownCalendar({ message })),
          shown => live.onWidget(Widgets.Message.ShowedCalendar({ shown })),
          live.h,
        ),
    },
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
    {
      name: 'appointment',
      title: 'A day and a time',
      draw: (style, live) =>
        Snippet.calendarAppointment(
          style,
          live.widgets.calendars.appointment,
          {
            onCalendar: message => calendars(live, Calendars.Message.GotAppointment({ message })),
            onTime: time => calendars(live, Calendars.Message.PickedTime({ time })),
          },
          live.h,
        ),
    },
  ],
)
