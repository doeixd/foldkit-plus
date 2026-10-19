/**
 * The Calendar page's further examples, through their own `update`: a day
 * picked on the appointment calendar keeps a time it has free and drops one
 * it has taken, Today shows and chooses today, Clear empties several days,
 * and a price calendar's preview of the same day changes nothing.
 */
import { Array as Arr, Option } from 'effect'
import { Calendar } from 'foldkit'
import { Calendar as UiCalendar } from '@foldkit/ui'
import { Calendar as DateSelection } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import * as Calendars from '../src/gallery/calendars.js'
import { TIMES, TODAY, takenOn } from '../src/snippets/components.js'

const { Message } = Calendars

const weekdays = Arr.range(1, 60)
  .map(days => Calendar.addDays(TODAY, days))
  .filter(date => !['Saturday', 'Sunday'].includes(Calendar.dayOfWeek(date)))

const clicked = (date: Calendar.CalendarDate) =>
  Message.GotAppointment({ message: UiCalendar.Message.ClickedDay({ date }) })

describe('the appointment', () => {
  // A time one weekday has taken and another has free, so each case can only pass for its reason.
  const [time, taken, free] = Arr.flatMap(TIMES, time => {
    const takenDay = weekdays.find(date => takenOn(date).includes(time))
    const freeDay = weekdays.find(date => !takenOn(date).includes(time))
    return takenDay === undefined || freeDay === undefined
      ? []
      : [[time, takenDay, freeDay] as const]
  })[0]!

  const withTime = Calendars.update(Calendars.init(), Message.PickedTime({ time })).model

  it('keeps a time the day picked has free', () => {
    const next = Calendars.update(withTime, clicked(free)).model
    expect(next.appointment.time).toEqual(Option.some(time))
    expect(DateSelection.firstDate(next.appointment.day)).toEqual(Option.some(free))
  })

  it('drops a time the day picked has taken', () => {
    const next = Calendars.update(withTime, clicked(taken)).model
    expect(next.appointment.time).toEqual(Option.none())
    expect(DateSelection.firstDate(next.appointment.day)).toEqual(Option.some(taken))
  })
})

describe('the events', () => {
  it('Today shows today’s month and chooses today, from another month', () => {
    const later = Calendar.addMonths(TODAY, 3)
    const start = Calendars.init()
    const away = {
      ...start,
      events: {
        calendar: UiCalendar.focusDate(start.events.calendar, later),
        day: DateSelection.day(later),
      },
    }
    const next = Calendars.update(away, Message.ShowedToday()).model
    expect([next.events.calendar.viewYear, next.events.calendar.viewMonth]).toEqual([
      TODAY.year,
      TODAY.month,
    ])
    expect(DateSelection.firstDate(next.events.day)).toEqual(Option.some(TODAY))
  })
})

describe('several days', () => {
  it('Clear chooses none', () => {
    const start = Calendars.init()
    const chosen = {
      ...start,
      several: { ...start.several, days: DateSelection.picked(start.several.days, TODAY) },
    }
    const next = Calendars.update(chosen, Message.ClearedSeveral()).model
    expect(next.several.days).toEqual(DateSelection.empty('Multiple'))
  })
})

describe('the prices', () => {
  it('previewing the day previewed already returns the same Model', () => {
    const previewed = Calendars.update(
      Calendars.init(),
      Message.PreviewedPrices({ date: Option.some(TODAY) }),
    ).model
    expect(previewed.prices.preview).toEqual(Option.some(TODAY))
    const again = Calendars.update(previewed, Message.PreviewedPrices({ date: Option.some(TODAY) }))
    expect(again.model).toBe(previewed)
  })
})
