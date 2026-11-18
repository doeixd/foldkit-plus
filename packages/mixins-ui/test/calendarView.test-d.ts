/**
 * The types of `Calendar.view`, `Calendar.configure` and `Bundles.Calendar`:
 * the view keeps the application's Message, each option takes only its own
 * values, a preset holds no Message and no drawing, and a placement gives
 * the args and answers `Changed`. One defect per refusal.
 */
import { Bundle } from 'foldkit-bundle'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import { expectTypeOf, test } from 'vitest'
import { Bundles, ButtonSlots, Calendar, CalendarSlots } from '../src/index.js'

const Message = defineMessageUnion({
  GotTripMessage: { message: Calendar.Message },
})
type Message = typeof Message.Type
declare const h: HtmlBuilder<Message>
declare const model: Calendar.Model
declare const drawn: Html

const today = Dates.make(2026, 2, 11)
const onMessage = (message: Calendar.Message) => Message.GotTripMessage({ message })
const wiring = { model, onMessage, label: 'Trip' }
const look = Style.forSlots(CalendarSlots)({ frame: Style.class('trip') })
const button = Style.forSlots(ButtonSlots)({ button: Style.class('quiet') })

test('the view takes the state and lifts its Messages to the application’s', () => {
  expectTypeOf(Calendar.view({ ...wiring, style: look }, h)).toEqualTypeOf<Html>()
  // @ts-expect-error not a Message of the builder’s.
  Calendar.view({ model, label: 'Trip', onMessage: (message: Calendar.Message) => message }, h)
})

test('upstream’s Model alone is not the Calendar’s state', () => {
  // @ts-expect-error the month shown without a selection.
  Calendar.view({ ...wiring, model: model.calendar }, h)
})

test('each option takes only its own values', () => {
  Calendar.view({ ...wiring, paging: 'end', caption: { dropdowns: { month: 'label' } } }, h)
  // @ts-expect-error `start` is no place for the paging buttons.
  Calendar.view({ ...wiring, paging: 'start' }, h)
  // @ts-expect-error the month is a select or a label.
  Calendar.view({ ...wiring, caption: { dropdowns: { month: 'grid' } } }, h)
  // @ts-expect-error `dropdown` is no caption.
  Calendar.view({ ...wiring, caption: 'dropdown' }, h)
  // @ts-expect-error a today button needs its label.
  Calendar.view({ ...wiring, today: { selects: true } }, h)
  // @ts-expect-error a preset’s selection is a `Selection`, not a date.
  Calendar.view({ ...wiring, presets: [{ label: 'Today', selection: today }] }, h)
  // @ts-expect-error `nextMonht` is no word.
  Calendar.view({ ...wiring, words: { nextMonht: 'Later' } }, h)
})

test('a style of another widget’s Slots is refused', () => {
  // @ts-expect-error a Button style on a Calendar.
  Calendar.view({ ...wiring, style: button }, h)
})

const Trips = Calendar.configure({
  base: { style: look, weekNumbers: true },
  presets: { booking: { today: { label: 'Today', selects: true } }, plain: {} },
})
const Bare = Calendar.configure({ base: { style: look } })

test('a configured Calendar keeps the application’s Message and its preset names', () => {
  Trips.view({ ...wiring, preset: 'booking', aside: drawn }, h)
  expectTypeOf(Trips.view)
    .parameter(0)
    .toHaveProperty('preset')
    .toEqualTypeOf<'booking' | 'plain' | undefined>()
  // @ts-expect-error `bookin` is no preset.
  Trips.view({ ...wiring, preset: 'bookin' }, h)
})

test('`preset` is no option where none was declared', () => {
  Bare.view(wiring, h)
  // @ts-expect-error no presets were given.
  Bare.view({ ...wiring, preset: 'booking' }, h)
})

test('a preset holds no wiring, no Message and no drawing', () => {
  // @ts-expect-error `wekNumbers` is no option.
  Calendar.configure({ presets: { booking: { wekNumbers: true } } })
  // @ts-expect-error the label is one use’s.
  Calendar.configure({ base: { label: 'Trip' } })
  // @ts-expect-error a drawing made once would be placed in every use.
  Calendar.configure({ base: { aside: drawn } })
  // @ts-expect-error the Message wrapper is the call’s.
  Calendar.configure({ base: { onMessage } })
})

test('a placement gives the args and answers `Changed`', () => {
  const placed = Bundle.compose({}).pipe(
    Bundle.withChild('trip', Bundles.Calendar, {
      args: { id: 'trip', today, months: 2, selection: Calendar.empty('Range') },
      onOut: out => parent => {
        expectTypeOf(out).toEqualTypeOf<Calendar.OutMessage>()
        return { model: parent }
      },
    }),
  )
  expectTypeOf<typeof placed.Model.Type>().toEqualTypeOf<{ readonly trip: Calendar.Model }>()
  Bundle.compose({}).pipe(
    Bundle.withChild('trip', Bundles.Calendar, {
      // @ts-expect-error three months are not offered.
      args: { id: 'trip', today, months: 3 },
      onOut: Bundle.ignore,
    }),
  )
  Bundle.compose({}).pipe(
    // @ts-expect-error a calendar needs to know today.
    Bundle.withChild('trip', Bundles.Calendar, { args: { id: 'trip' }, onOut: Bundle.ignore }),
  )
  Bundle.compose({}).pipe(
    // @ts-expect-error `Changed` must be answered, or ignored by name.
    Bundle.withChild('trip', Bundles.Calendar, { args: { id: 'trip', today } }),
  )
})
