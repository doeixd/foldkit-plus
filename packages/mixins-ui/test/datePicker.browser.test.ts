/**
 * A range picked in a popover, on a real runtime: `DatePicker.update` with
 * the application's selection keeps the popover open on the first day and
 * closes it on the second, and the trigger and the hidden inputs show both
 * ends.
 */
import { Option, Schema } from 'effect'
import * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import * as Dates from 'foldkit/calendar'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Calendar, DatePicker, DatePickerView } from '../src/index.js'

const Model = Schema.Struct({ picker: UpstreamDatePicker.Model, selection: Calendar.Selection })
type Model = typeof Model.Type
type Message = UpstreamDatePicker.Message

afterEach(() => {
  document.body.replaceChildren()
})

const iso = (date: Dates.CalendarDate) =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`

const face = (selection: Calendar.Selection) =>
  Calendar.Selection.match(selection, {
    Single: ({ date }) => Option.match(date, { onNone: () => 'Pick a day', onSome: iso }),
    Range: ({ start, end }) =>
      Option.match(start, {
        onNone: () => 'Pick a range',
        onSome: from => `${iso(from)} – ${Option.match(end, { onNone: () => '…', onSome: iso })}`,
      }),
    Multiple: ({ dates }) => dates.map(iso).join(', '),
  })

const mount = () => {
  const container = document.createElement('div')
  container.id = 'date-picker-browser'
  document.body.append(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    DatePickerView.view(
      model.picker,
      {
        anchor: { placement: 'bottom-start' },
        selection: model.selection,
        triggerContent: selection => h.span([], [face(selection)]),
        toCalendarView: Calendar.toView(model.selection, [], { h }),
        name: 'trip',
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          picker: UpstreamDatePicker.init({ id: 'trip', today: Dates.make(2026, 3, 11) }),
          selection: Calendar.empty('Range'),
        },
      }),
      update: (model: Model, message: Message) => {
        const next = DatePicker.update(model.selection)(model.picker, message)
        const selection = Option.match(Option.fromNullishOr(next.outMessage), {
          onNone: () => model.selection,
          onSome: out =>
            UpstreamDatePicker.OutMessage.match<Calendar.Selection>(out, {
              SelectedDate: ({ date }) => Calendar.picked(model.selection, date),
              ClearedDate: () => Calendar.empty('Range'),
              ChangedViewMonth: () => model.selection,
            }),
        })
        return {
          model: modifyFields(model, { picker: () => next.model, selection: () => selection }),
          commands: next.commands ?? [],
        }
      },
      view,
    }),
  )
}

const trigger = () => document.getElementById('trip-popover-button')!
const panel = () => document.getElementById('trip-popover-panel')
const day = (date: number) =>
  document.querySelector<HTMLElement>(`#trip-calendar-cell-2026-3-${date} button`)
const submitted = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
    input => `${input.name}=${input.value}`,
  )

test('the first day keeps the popover open, the second closes it, and both are shown and submitted', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger()).toBeTruthy())
    expect(submitted()).toEqual(['trip='])
    await userEvent.click(trigger())
    await vi.waitFor(() => expect(day(10)).toBeTruthy())
    await userEvent.click(day(10)!)
    await vi.waitFor(() => expect(trigger().textContent).toBe('2026-03-10 – …'))
    expect(panel()).not.toBeNull()
    expect(submitted()).toEqual(['trip=2026-03-10'])
    await userEvent.click(day(14)!)
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(trigger().textContent).toBe('2026-03-10 – 2026-03-14')
    expect(submitted()).toEqual(['trip=2026-03-10', 'trip=2026-03-14'])
  } finally {
    handle.dispose()
  }
})
