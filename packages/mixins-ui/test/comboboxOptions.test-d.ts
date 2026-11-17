/**
 * The types of `Combobox.view` and `Combobox.configure`: the value is the
 * choice's, a row function is given the choice's items, and a preset holds
 * no wiring, no value and no drawing. One defect per refusal.
 */
import { Option } from 'effect'
import type * as UiCombobox from '@foldkit/ui/combobox'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import { expectTypeOf, test } from 'vitest'
import { ButtonSlots, Combobox, ComboboxSlots } from '../src/index.js'

declare const Upstream: typeof UiCombobox
const Message = defineMessageUnion({ GotBox: { message: Upstream.Message } })
type Message = typeof Message.Type
declare const h: HtmlBuilder<Message>
declare const model: UiCombobox.Model
declare const drawn: Html

const cities = ['lis', 'opo'] as const
const One = Combobox.one(cities)
const Many = Combobox.many(cities)
const onMessage = (message: UiCombobox.Message) => Message.GotBox({ message })
const wiring = { model, onMessage, label: 'City' }
const none = Option.none<'lis' | 'opo'>()
const look = Style.forSlots(ComboboxSlots)({ input: Style.class('field') })
const button = Style.forSlots(ButtonSlots)({ button: Style.class('quiet') })

test('the value is the choice’s own', () => {
  expectTypeOf(Combobox.view({ ...wiring, choice: One, value: none }, h)).toEqualTypeOf<Html>()
  Combobox.view({ ...wiring, choice: Many, value: ['lis'] }, h)
  // @ts-expect-error a list is no value of a choice of one.
  Combobox.view({ ...wiring, choice: One, value: ['lis'] }, h)
  // @ts-expect-error `fao` is no item of the choice.
  Combobox.view({ ...wiring, choice: Many, value: ['fao'] }, h)
})

test('rows and offered items are the choice’s items', () => {
  Combobox.view(
    {
      ...wiring,
      choice: One,
      value: none,
      option: item => {
        expectTypeOf(item).toEqualTypeOf<'lis' | 'opo'>()
        return { label: item }
      },
    },
    h,
  )
  // @ts-expect-error `fao` is not offered by this choice.
  Combobox.view({ ...wiring, choice: One, value: none, items: ['fao'] }, h)
  // @ts-expect-error a row needs its label.
  Combobox.view({ ...wiring, choice: One, value: none, option: () => ({ icon: drawn }) }, h)
})

test('the view lifts upstream’s Messages to the application’s', () => {
  Combobox.view(
    {
      model,
      label: 'City',
      choice: One,
      value: none,
      // @ts-expect-error not a Message of the builder’s.
      onMessage: (message: UiCombobox.Message) => message,
    },
    h,
  )
})

test('a style of another widget’s Slots is refused', () => {
  Combobox.view({ ...wiring, choice: One, value: none, style: look }, h)
  // @ts-expect-error a Button style on a Combobox.
  Combobox.view({ ...wiring, choice: One, value: none, style: button }, h)
})

const Cities = Combobox.configure({
  base: { style: look, filter: Combobox.contains },
  presets: { clearable: { clear: true }, plain: {} },
})
const Bare = Combobox.configure({ base: { style: look } })

test('a configured Combobox keeps its preset names and the choice’s types', () => {
  Cities.view({ ...wiring, choice: One, value: none, preset: 'clearable', empty: drawn }, h)
  // @ts-expect-error `clearble` is no preset.
  Cities.view({ ...wiring, choice: One, value: none, preset: 'clearble' }, h)
  // @ts-expect-error a list is no value of a choice of one.
  Cities.view({ ...wiring, choice: One, value: ['lis'] }, h)
})

test('`preset` is no option where none was declared', () => {
  Bare.view({ ...wiring, choice: One, value: none }, h)
  // @ts-expect-error no presets were given.
  Bare.view({ ...wiring, choice: One, value: none, preset: 'clearable' }, h)
})

test('a preset holds no wiring, no value and no drawing', () => {
  // @ts-expect-error `placeholdr` is no option.
  Combobox.configure({ presets: { clearable: { placeholdr: 'Where to?' } } })
  // @ts-expect-error the choice is one field’s.
  Combobox.configure({ base: { choice: One } })
  // @ts-expect-error a drawing made once would be placed in every use.
  Combobox.configure({ base: { empty: drawn } })
  // @ts-expect-error a clear mark of its own is a drawing; a preset takes `true`.
  Combobox.configure({ base: { clear: { content: drawn } } })
})
