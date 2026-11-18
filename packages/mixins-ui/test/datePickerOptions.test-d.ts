/**
 * The types of `DatePicker.view`, `DatePicker.configure` and
 * `Bundles.DatePicker`. One defect per refusal.
 */
import { Bundle } from 'foldkit-bundle'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import { expectTypeOf, test } from 'vitest'
import { Bundles, Calendar, CalendarSlots, DatePicker, DatePickerSlots } from '../src/index.js'

const Message = defineMessageUnion({ GotDue: { message: DatePicker.Message } })
type Message = typeof Message.Type
declare const h: HtmlBuilder<Message>
declare const model: DatePicker.Model
declare const drawn: Html

const today = Dates.make(2026, 2, 11)
const onMessage = (message: DatePicker.Message) => Message.GotDue({ message })
const trigger = (selection: Calendar.Selection) => selection._tag
const wiring = { model, onMessage, label: 'Due', trigger }
const look = Style.forSlots(DatePickerSlots)({ trigger: Style.class('due') })
const calendarLook = Style.forSlots(CalendarSlots)({ frame: Style.class('days') })

test('the view takes the state, a trigger text and the Calendar’s options', () => {
  expectTypeOf(
    DatePicker.view({ ...wiring, style: look, calendarStyle: calendarLook, paging: 'end' }, h),
  ).toEqualTypeOf<Html>()
  // @ts-expect-error the trigger's text is required.
  DatePicker.view({ model, onMessage, label: 'Due' }, h)
  // @ts-expect-error the trigger shows text; a drawing is not one.
  DatePicker.view({ ...wiring, trigger: () => drawn }, h)
  // @ts-expect-error `start` is no place for the paging buttons.
  DatePicker.view({ ...wiring, paging: 'start' }, h)
})

test('each style is of its own Slots', () => {
  // @ts-expect-error the calendar's style on the picker.
  DatePicker.view({ ...wiring, style: calendarLook }, h)
  // @ts-expect-error the picker's style on the calendar.
  DatePicker.view({ ...wiring, calendarStyle: look }, h)
})

const Pickers = DatePicker.configure({
  base: { style: look },
  presets: { quick: { today: { label: 'Today', selects: true } } },
})

test('a configured DatePicker keeps its preset names, and a preset holds no wiring or drawing', () => {
  Pickers.view({ ...wiring, preset: 'quick', aside: drawn }, h)
  // @ts-expect-error `quik` is no preset.
  Pickers.view({ ...wiring, preset: 'quik' }, h)
  // @ts-expect-error the trigger's text is one field's.
  DatePicker.configure({ base: { trigger } })
  // @ts-expect-error a drawing made once would be placed in every use.
  DatePicker.configure({ base: { footer: drawn } })
})

test('a placement gives the args and answers `Changed`', () => {
  Bundle.compose({}).pipe(
    Bundle.withChild('due', Bundles.DatePicker, {
      args: { id: 'due', today, closes: 'manual' },
      onOut: out => parent => {
        expectTypeOf(out).toEqualTypeOf<DatePicker.OutMessage>()
        return { model: parent }
      },
    }),
  )
  Bundle.compose({}).pipe(
    Bundle.withChild('due', Bundles.DatePicker, {
      // @ts-expect-error `never` is no closing rule.
      args: { id: 'due', today, closes: 'never' },
      onOut: Bundle.ignore,
    }),
  )
  Bundle.compose({}).pipe(
    // @ts-expect-error `Changed` must be answered, or ignored by name.
    Bundle.withChild('due', Bundles.DatePicker, { args: { id: 'due', today } }),
  )
})
