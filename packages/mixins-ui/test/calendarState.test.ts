// @vitest-environment jsdom
/**
 * A Calendar's own state (`Calendar.init`, `update`, `set`), and the same
 * state placed as `Bundles.Calendar`: the selection folded from either
 * month's picks, the second month kept a month on, the caption's dropdowns,
 * a range's preview, presets and the today button. Each no-op is asserted by
 * identity, since Foldkit draws again for any new Model.
 */
import { Effect, Option, Schema } from 'effect'
import * as UiCalendar from '@foldkit/ui/calendar'
import { Bundle } from 'foldkit-bundle'
import * as Dates from 'foldkit/calendar'
import { describe, expect, it } from 'vitest'
import { Bundles, Calendar } from '../src/index.js'

const { Message, Selection } = Calendar
const feb = (date: number) => Dates.make(2026, 2, date)
const today = feb(11)
const start = (more: Partial<Calendar.Args> = {}) => Calendar.init({ id: 'trip', today, ...more })

const first = (message: UiCalendar.Message) => Message.GotCalendarMessage({ message })
const second = (message: UiCalendar.Message) => Message.GotSecondMessage({ message })
const click = (date: Dates.CalendarDate) => UiCalendar.Message.ClickedDay({ date })
const shownOf = (calendar: UiCalendar.Model) => [calendar.viewYear, calendar.viewMonth]
const secondOf = (model: Calendar.Model) => shownOf(Option.getOrThrow(model.second))

describe('Calendar.init', () => {
  it('starts on today’s month with nothing chosen, one month, no preview', () => {
    expect(start()).toEqual({
      calendar: UiCalendar.init({ id: 'trip', today }),
      second: Option.none(),
      selection: Calendar.empty('Single'),
      preview: Option.none(),
    })
  })

  it('opens on the first day of what is chosen at the start', () => {
    const model = start({ selection: Calendar.nextDays(Dates.make(2026, 5, 30), 4) })
    expect(shownOf(model.calendar)).toEqual([2026, 5])
    expect(model.selection._tag).toBe('Range')
  })

  it('gives every other arg to upstream', () => {
    const bounds = {
      minDate: feb(2),
      maxDate: Dates.make(2026, 6, 1),
      disabledDaysOfWeek: ['Sunday'],
      disabledDates: [feb(13)],
      locale: Calendar.localeOf('fr'),
    } as const
    expect(start(bounds).calendar).toEqual(UiCalendar.init({ id: 'trip', today, ...bounds }))
  })

  it('makes a second month a month on, under an id of its own, with the same bounds', () => {
    const model = start({ months: 2, minDate: feb(2) })
    const other = Option.getOrThrow(model.second)
    expect(shownOf(other)).toEqual([2026, 3])
    expect(other.id).toBe(Calendar.secondId('trip'))
    expect(other.maybeMinDate).toEqual(Option.some(feb(2)))
    expect(start({ months: 1 }).second).toEqual(Option.none())
  })
})

describe('Calendar.update', () => {
  it('folds a picked day into the selection and reports it', () => {
    const next = Calendar.update(start(), first(click(feb(14))))
    expect(next.model.selection).toEqual(Calendar.day(feb(14)))
    expect(next.outMessage).toEqual(
      Calendar.OutMessage.Changed({ selection: Calendar.day(feb(14)) }),
    )
  })

  it('keeps its Model, and reports nothing, for the day already chosen', () => {
    const chosen = Calendar.update(start(), first(click(feb(14)))).model
    const again = Calendar.update(chosen, first(click(feb(14))))
    expect(again.model).toBe(chosen)
    expect(again.outMessage).toBeUndefined()
  })

  it('folds by the selection’s mode: a range takes a start, then an end', () => {
    const range = start({ selection: Calendar.empty('Range') })
    const started = Calendar.update(range, first(click(feb(14)))).model
    expect(Calendar.rangeOf(started.selection)).toEqual(Option.none())
    const ended = Calendar.update(started, first(click(feb(10))))
    expect(Calendar.rangeOf(ended.model.selection)).toEqual(
      Option.some({ start: feb(10), end: feb(14) }),
    )
    expect(ended.outMessage).toEqual(
      Calendar.OutMessage.Changed({ selection: ended.model.selection }),
    )
  })

  it('refuses a disabled day: the same Model, nothing reported', () => {
    const model = start({ disabledDates: [feb(14)] })
    const next = Calendar.update(model, first(click(feb(14))))
    expect(next.model).toBe(model)
    expect(next.outMessage).toBeUndefined()
  })

  it('moves the month without touching the selection', () => {
    const chosen = Calendar.update(start(), first(click(feb(14)))).model
    const next = Calendar.update(chosen, first(UiCalendar.Message.ClickedNextMonthButton()))
    expect(shownOf(next.model.calendar)).toEqual([2026, 3])
    expect(next.model.selection).toBe(chosen.selection)
    expect(next.outMessage).toBeUndefined()
  })

  it('lifts upstream’s Commands to the month they came from', async () => {
    const two = start({ months: 2 })
    const sent = async (message: Calendar.Message) => {
      const [command] = Calendar.update(two, message).commands ?? []
      return Effect.runPromise(Option.getOrThrow(Option.fromNullishOr(command)).effect)
    }
    const done = UiCalendar.Message.CompletedFocusGrid()
    expect(await sent(first(UiCalendar.Message.ClickedHeading()))).toEqual(first(done))
    expect(await sent(second(UiCalendar.Message.ClickedHeading()))).toEqual(second(done))
  })
})

describe('two months', () => {
  const two = start({ months: 2, selection: Calendar.empty('Range') })

  it('keeps the second a month after the first, whichever is paged', () => {
    const back = Calendar.update(two, first(UiCalendar.Message.ClickedPreviousMonthButton())).model
    expect([shownOf(back.calendar), secondOf(back)]).toEqual([
      [2026, 1],
      [2026, 2],
    ])
    const on = Calendar.update(two, second(UiCalendar.Message.ClickedNextMonthButton())).model
    expect([shownOf(on.calendar), secondOf(on)]).toEqual([
      [2026, 3],
      [2026, 4],
    ])
  })

  it('folds a pick in either month into the one selection', () => {
    const started = Calendar.update(two, first(click(feb(20)))).model
    const ended = Calendar.update(started, second(click(Dates.make(2026, 3, 5))))
    expect(Calendar.rangeOf(ended.model.selection)).toEqual(
      Option.some({ start: feb(20), end: Dates.make(2026, 3, 5) }),
    )
    expect(ended.outMessage).toEqual(
      Calendar.OutMessage.Changed({ selection: ended.model.selection }),
    )
    // The months stay where they were: the pick was in the month each shows.
    expect([shownOf(ended.model.calendar), secondOf(ended.model)]).toEqual([
      [2026, 2],
      [2026, 3],
    ])
  })

  it('keeps its Model for a second-month Message that changes nothing', () => {
    const blurred = Calendar.update(two, second(UiCalendar.Message.BlurredGrid()))
    expect(blurred.model).toBe(two)
  })

  it('ignores a second-month Message where there is one month', () => {
    const one = start()
    expect(Calendar.update(one, second(click(feb(20)))).model).toBe(one)
  })

  it('moves both months for the caption’s dropdowns, and neither for the month shown', () => {
    const moved = Calendar.update(
      two,
      Message.Showed({ shown: Calendar.Shown.Month({ month: 6 }) }),
    ).model
    expect([shownOf(moved.calendar), secondOf(moved)]).toEqual([
      [2026, 6],
      [2026, 7],
    ])
    expect(
      Calendar.update(two, Message.Showed({ shown: Calendar.Shown.Month({ month: 2 }) })).model,
    ).toBe(two)
  })
})

describe('a range’s preview', () => {
  const waiting = Calendar.update(
    start({ selection: Calendar.empty('Range') }),
    first(click(feb(10))),
  ).model
  const previewed = Calendar.update(waiting, Message.Previewed({ date: Option.some(feb(13)) }))

  it('holds the day the pointer is on, keeping its Model for the same day', () => {
    expect(previewed.model.preview).toEqual(Option.some(feb(13)))
    expect(previewed.outMessage).toBeUndefined()
    expect(
      Calendar.update(previewed.model, Message.Previewed({ date: Option.some(feb(13)) })).model,
    ).toBe(previewed.model)
  })

  it('ends with the range it was made for', () => {
    const ended = Calendar.update(previewed.model, first(click(feb(13)))).model
    expect(ended.preview).toEqual(Option.none())
  })
})

describe('presets and today', () => {
  const lastWeek = Calendar.lastDays(Dates.make(2026, 1, 20), 7)

  it('takes a preset’s selection whole, turns to its first day, and reports it', () => {
    const next = Calendar.update(start(), Message.PickedPreset({ selection: lastWeek }))
    expect(next.model.selection).toEqual(lastWeek)
    expect(shownOf(next.model.calendar)).toEqual([2026, 1])
    expect(next.outMessage).toEqual(Calendar.OutMessage.Changed({ selection: lastWeek }))
    const again = Calendar.update(next.model, Message.PickedPreset({ selection: lastWeek }))
    expect(again.model).toBe(next.model)
    expect(again.outMessage).toBeUndefined()
  })

  it('turns back to today’s month, out of the months grid, choosing nothing', () => {
    const away = Calendar.update(
      Calendar.update(start(), first(UiCalendar.Message.ClickedNextMonthButton())).model,
      first(UiCalendar.Message.ClickedHeading()),
    ).model
    expect([away.calendar.viewMonth, away.calendar.viewMode]).toEqual([3, 'Months'])
    const back = Calendar.update(away, Message.PressedToday({ selects: false }))
    expect([back.model.calendar.viewMonth, back.model.calendar.viewMode]).toEqual([2, 'Days'])
    expect(back.model.calendar.maybeFocusedDate).toEqual(Option.some(today))
    expect(back.model.selection).toBe(away.selection)
    expect(back.outMessage).toBeUndefined()
  })

  it('keeps its Model when today is shown and focused already', () => {
    const there = Calendar.update(start(), Message.PressedToday({ selects: false })).model
    expect(Calendar.update(there, Message.PressedToday({ selects: false })).model).toBe(there)
  })

  it('picks today when asked to, and only shows it where the bounds disable it', () => {
    const picked = Calendar.update(start(), Message.PressedToday({ selects: true }))
    expect(picked.model.selection).toEqual(Calendar.day(today))
    expect(picked.outMessage).toEqual(
      Calendar.OutMessage.Changed({ selection: Calendar.day(today) }),
    )
    const later = start({ minDate: feb(20) })
    const refused = Calendar.update(later, Message.PressedToday({ selects: true }))
    expect(refused.model.selection).toBe(later.selection)
    expect(refused.outMessage).toBeUndefined()
  })
})

describe('Calendar.set', () => {
  it('holds the selection given and turns to its first day', () => {
    const march = Selection.Multiple({ dates: [Dates.make(2026, 3, 3), Dates.make(2026, 3, 9)] })
    const model = Calendar.set(start({ months: 2 }), march)
    expect(model.selection).toEqual(march)
    expect([shownOf(model.calendar), secondOf(model)]).toEqual([
      [2026, 3],
      [2026, 4],
    ])
  })

  it('keeps its Model for the selection it holds, shown already', () => {
    const model = Calendar.set(start(), Calendar.day(feb(14)))
    expect(Calendar.set(model, Calendar.day(feb(14)))).toBe(model)
  })

  it('drops a preview made for the selection before', () => {
    const previewing = Calendar.update(
      start({ selection: Selection.Range({ start: Option.some(feb(3)), end: Option.none() }) }),
      Message.Previewed({ date: Option.some(feb(6)) }),
    ).model
    expect(Calendar.set(previewing, Calendar.empty('Range')).preview).toEqual(Option.none())
  })
})

describe('Bundles.Calendar', () => {
  const App = Bundle.compose({}).pipe(
    Bundle.withChild('trip', Bundles.Calendar, {
      args: { id: 'trip', today, selection: Calendar.empty('Range'), months: 2, minDate: feb(2) },
      onOut: Bundle.ignore,
    }),
  )
  const update = App.placements.update(model => ({ model }))
  const placed = App.placements.initial({}).model

  it('starts from its args, in the field the application named', () => {
    expect(placed.trip).toEqual(
      start({ selection: Calendar.empty('Range'), months: 2, minDate: feb(2) }),
    )
  })

  it('folds its Messages through the placement', () => {
    const next = update(placed, App.Message.GotTripMessage({ message: first(click(feb(14))) }))
    expect(Calendar.firstDate(next.model.trip.selection)).toEqual(Option.some(feb(14)))
  })

  it('reports `Changed` to a parent that answers it', () => {
    const Booking = Bundle.compose({ nights: Schema.Number }).pipe(
      Bundle.withChild('stay', Bundles.Calendar, {
        args: { id: 'stay', today, selection: Calendar.empty('Range') },
        onOut: out => model => ({
          model: { ...model, nights: Calendar.datesOf(out.selection).length },
        }),
      }),
    )
    const fold = Booking.placements.update(model => ({ model }))
    const pick = (model: typeof Booking.Model.Type, date: number) =>
      fold(model, Booking.Message.GotStayMessage({ message: first(click(feb(date))) })).model
    const booked = pick(pick(Booking.placements.initial({ nights: 0 }).model, 10), 13)
    expect(booked.nights).toBe(4)
  })

  it('sets the selection from the parent through its helper', () => {
    const chosen = Calendar.nextDays(Dates.make(2026, 4, 1), 3)
    const next = App.children.trip.helpers.set(chosen)(placed)
    expect(next.model.trip.selection).toEqual(chosen)
    expect(shownOf(next.model.trip.calendar)).toEqual([2026, 4])
  })
})
