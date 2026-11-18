// @vitest-environment jsdom
/**
 * A DatePicker's own state (`DatePicker.init`, `fold`, `set`), and the same
 * state placed as `Bundles.DatePicker`: a pick folded into the selection, the
 * popover closed by the pick that makes the selection whole or left open by
 * `closes: 'manual'`, the caption's dropdowns, a range's preview, presets and
 * the today button. Each no-op is asserted by identity.
 */
import { Effect, Option } from 'effect'
import * as UiCalendar from '@foldkit/ui/calendar'
import * as UiDatePicker from '@foldkit/ui/datePicker'
import { Bundle } from 'foldkit-bundle'
import * as Dates from 'foldkit/calendar'
import { describe, expect, it } from 'vitest'
import { Bundles, Calendar, DatePicker } from '../src/index.js'

const { Message } = DatePicker
const feb = (date: number) => Dates.make(2026, 2, date)
const today = feb(11)
const start = (more: Partial<DatePicker.Args> = {}) =>
  DatePicker.init({ id: 'due', today, ...more })

const picker = (message: UiDatePicker.Message) => Message.GotPickerMessage({ message })
const click = (date: Dates.CalendarDate) =>
  picker(
    UiDatePicker.Message.GotCalendarMessage({ message: UiCalendar.Message.ClickedDay({ date }) }),
  )
const send = (model: DatePicker.Model, message: DatePicker.Message) =>
  DatePicker.fold(model, message)
const opened = (model: DatePicker.Model) => send(model, picker(UiDatePicker.Message.Opened())).model
const isOpen = (model: DatePicker.Model) => model.picker.popover.isOpen
const shownOf = (model: DatePicker.Model) => [
  model.picker.calendar.viewYear,
  model.picker.calendar.viewMonth,
]
const changedTo = (selection: Calendar.Selection) => DatePicker.OutMessage.Changed({ selection })

describe('DatePicker.init', () => {
  it('starts closed on today’s month, nothing chosen, closing when the selection is whole', () => {
    expect(start()).toEqual({
      picker: UiDatePicker.init({ id: 'due', today }),
      selection: Calendar.empty('Single'),
      preview: Option.none(),
      closes: 'complete',
    })
  })

  it('opens on the first day chosen at the start, and gives the other args to upstream', () => {
    const model = start({
      selection: Calendar.day(Dates.make(2026, 5, 30)),
      closes: 'manual',
      animated: true,
      minDate: feb(2),
    })
    expect(shownOf(model)).toEqual([2026, 5])
    expect(model.closes).toBe('manual')
    expect(model.picker).toEqual(
      UiDatePicker.init({
        id: 'due',
        today,
        isAnimated: true,
        minDate: feb(2),
        initialViewDate: Dates.make(2026, 5, 30),
      }),
    )
  })
})

describe('a pick', () => {
  it('is folded into the selection and reported, and closes the popover once whole', () => {
    const next = send(opened(start()), click(feb(14)))
    expect(next.model.selection).toEqual(Calendar.day(feb(14)))
    expect(next.outMessage).toEqual(changedTo(Calendar.day(feb(14))))
    expect(isOpen(next.model)).toBe(false)
  })

  it('leaves the popover open while a range waits for its end, and closes on the end', () => {
    const waiting = send(opened(start({ selection: Calendar.empty('Range') })), click(feb(14)))
    expect(isOpen(waiting.model)).toBe(true)
    expect(Calendar.rangeOf(waiting.model.selection)).toEqual(Option.none())
    const ended = send(waiting.model, click(feb(10)))
    expect(isOpen(ended.model)).toBe(false)
    expect(Calendar.rangeOf(ended.model.selection)).toEqual(
      Option.some({ start: feb(10), end: feb(14) }),
    )
    expect(ended.outMessage).toEqual(changedTo(ended.model.selection))
  })

  it('never closes the popover where `closes` is `manual`', () => {
    const next = send(opened(start({ closes: 'manual' })), click(feb(14)))
    expect(next.model.selection).toEqual(Calendar.day(feb(14)))
    expect(isOpen(next.model)).toBe(true)
  })

  it('on a disabled day changes nothing', () => {
    const model = opened(start({ disabledDates: [feb(14)] }))
    const next = send(model, click(feb(14)))
    expect(next.model).toBe(model)
    expect(next.outMessage).toBeUndefined()
  })

  it('lifts upstream’s Commands to its own Message', async () => {
    const [command] = send(opened(start()), click(feb(14))).commands ?? []
    const sent = await Effect.runPromise(Option.getOrThrow(Option.fromNullishOr(command)).effect)
    expect(sent._tag).toBe('GotPickerMessage')
  })

  it('cleared by upstream empties the selection in its own mode', () => {
    const range = Calendar.nextDays(feb(3), 4)
    const next = send(start({ selection: range }), picker(UiDatePicker.Message.Cleared()))
    expect(next.model.selection).toEqual(Calendar.empty('Range'))
    expect(next.outMessage).toEqual(changedTo(Calendar.empty('Range')))
  })
})

describe('the caption’s dropdowns and a range’s preview', () => {
  it('move the month, and keep the Model for the month shown', () => {
    const model = start()
    const moved = send(model, Message.Showed({ shown: Calendar.Shown.Month({ month: 6 }) }))
    expect(shownOf(moved.model)).toEqual([2026, 6])
    expect(send(model, Message.Showed({ shown: Calendar.Shown.Month({ month: 2 }) })).model).toBe(
      model,
    )
  })

  it('hold the previewed day, keep the Model for the same day, and end with the range', () => {
    const waiting = send(opened(start({ selection: Calendar.empty('Range') })), click(feb(10)))
    const previewed = send(waiting.model, Message.Previewed({ date: Option.some(feb(13)) }))
    expect(previewed.model.preview).toEqual(Option.some(feb(13)))
    expect(send(previewed.model, Message.Previewed({ date: Option.some(feb(13)) })).model).toBe(
      previewed.model,
    )
    expect(send(previewed.model, click(feb(13))).model.preview).toEqual(Option.none())
  })
})

describe('presets and today', () => {
  const lastWeek = Calendar.lastDays(Dates.make(2026, 1, 20), 7)

  it('take a preset whole, turn to its first day, report it and close the popover', () => {
    const next = send(opened(start()), Message.PickedPreset({ selection: lastWeek }))
    expect(next.model.selection).toEqual(lastWeek)
    expect(shownOf(next.model)).toEqual([2026, 1])
    expect(next.outMessage).toEqual(changedTo(lastWeek))
    expect(isOpen(next.model)).toBe(false)
    expect((next.commands ?? []).length).toBeGreaterThan(0)
  })

  it('leave the popover open for a preset that is not whole, or where `closes` is `manual`', () => {
    const half = Calendar.Selection.Range({ start: Option.some(feb(3)), end: Option.none() })
    expect(isOpen(send(opened(start()), Message.PickedPreset({ selection: half })).model)).toBe(
      true,
    )
    expect(
      isOpen(
        send(opened(start({ closes: 'manual' })), Message.PickedPreset({ selection: lastWeek }))
          .model,
      ),
    ).toBe(true)
  })

  it('ask a closed popover for nothing', () => {
    const next = send(start(), Message.PickedPreset({ selection: lastWeek }))
    expect(next.model.selection).toEqual(lastWeek)
    expect(next.commands).toBeUndefined()
  })

  it('turn back to today’s month choosing nothing, keeping the Model when already there', () => {
    const away = send(
      opened(start()),
      Message.Showed({ shown: Calendar.Shown.Month({ month: 6 }) }),
    ).model
    const back = send(away, Message.PressedToday({ selects: false }))
    expect(shownOf(back.model)).toEqual([2026, 2])
    expect(back.model.selection).toBe(away.selection)
    expect(back.outMessage).toBeUndefined()
    expect(isOpen(back.model)).toBe(true)
    expect(send(back.model, Message.PressedToday({ selects: false })).model).toBe(back.model)
  })

  it('pick today when asked to, by the closing rule, and not where the bounds disable it', () => {
    const picked = send(opened(start()), Message.PressedToday({ selects: true }))
    expect(picked.model.selection).toEqual(Calendar.day(today))
    expect(picked.outMessage).toEqual(changedTo(Calendar.day(today)))
    expect(isOpen(picked.model)).toBe(false)
    const later = opened(start({ minDate: feb(20) }))
    const refused = send(later, Message.PressedToday({ selects: true }))
    expect(refused.model.selection).toBe(later.selection)
    expect(refused.outMessage).toBeUndefined()
  })
})

describe('DatePicker.set', () => {
  it('holds the selection given, turns to its first day and leaves the popover as it is', () => {
    const march = Calendar.day(Dates.make(2026, 3, 9))
    const model = DatePicker.set(opened(start()), march)
    expect(model.selection).toEqual(march)
    expect(shownOf(model)).toEqual([2026, 3])
    expect(isOpen(model)).toBe(true)
    expect(DatePicker.set(model, march)).toBe(model)
  })

  it('drops a preview made for the selection before', () => {
    const previewing = send(
      start({
        selection: Calendar.Selection.Range({ start: Option.some(feb(3)), end: Option.none() }),
      }),
      Message.Previewed({ date: Option.some(feb(6)) }),
    ).model
    expect(DatePicker.set(previewing, Calendar.empty('Range')).preview).toEqual(Option.none())
  })
})

describe('Bundles.DatePicker', () => {
  const App = Bundle.compose({}).pipe(
    Bundle.withChild('due', Bundles.DatePicker, {
      args: { id: 'due', today, closes: 'manual', minDate: feb(2) },
      onOut: Bundle.ignore,
    }),
  )
  const update = App.placements.update(model => ({ model }))
  const placed = App.placements.initial({}).model

  it('starts from its args, folds its Messages, and sets from the parent', () => {
    expect(placed.due).toEqual(start({ closes: 'manual', minDate: feb(2) }))
    const next = update(placed, App.Message.GotDueMessage({ message: click(feb(14)) }))
    expect(next.model.due.selection).toEqual(Calendar.day(feb(14)))
    const set = App.children.due.helpers.set(Calendar.day(feb(20)))(placed)
    expect(set.model.due.selection).toEqual(Calendar.day(feb(20)))
  })
})
