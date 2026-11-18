/**
 * The choice controls' options-level views and `configure`: what each
 * refuses at the mistake. One defect per refusal.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Option, Schema } from 'effect'
import { Style } from 'foldkit-mixins'
import { expectTypeOf, test } from 'vitest'
import {
  Checkbox,
  IconSlots,
  RadioGroup,
  Select,
  Switch,
  SwitchSlots,
  type RadioGroupView,
} from '../src/index.js'

const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean }, Picked: {} })
type Message = typeof Message.Type
declare const h: HtmlBuilder<Message>
declare const toggled: (checked: boolean) => Message

const tracks = Style.forSlots(SwitchSlots)({ button: Style.class('track') })
const glyphs = Style.forSlots(IconSlots)({ glyph: Style.class('glyph') })
declare const plan: Option.Option<'free' | 'team'>
declare const common: Pick<RadioGroupView<string, Message>, 'model' | 'onMessage' | 'legend'>

test('a checkbox needs its words', () => {
  Checkbox.view({ id: 'a', checked: true, onToggle: toggled, label: 'Terms' }, h)
  // @ts-expect-error `label` is missing.
  Checkbox.view({ id: 'a', checked: true, onToggle: toggled }, h)
})

test('a position is start or end', () => {
  Checkbox.view(
    // @ts-expect-error `middle` is no position.
    { id: 'a', checked: true, onToggle: toggled, label: 'Terms', position: 'middle' },
    h,
  )
})

test('onToggle sends a Message of the builder’s', () => {
  // @ts-expect-error a string is not a Message.
  Checkbox.view({ id: 'a', checked: true, onToggle: () => 'toggled', label: 'Terms' }, h)
})

test('a switch takes a switch’s style, not a checkbox’s', () => {
  Switch.view({ id: 's', checked: true, onToggle: toggled, label: 'On', style: tracks }, h)
  // @ts-expect-error an Icon style on a Switch.
  Switch.view({ id: 's', checked: true, onToggle: toggled, label: 'On', style: glyphs }, h)
})

test('a switch has no indeterminate state', () => {
  // @ts-expect-error `indeterminate` is a checkbox’s.
  Switch.view({ id: 's', checked: true, onToggle: toggled, label: 'On', indeterminate: true }, h)
})

test('a select’s option names its value and its words', () => {
  Select.view({ id: 'r', label: 'Region', options: [{ value: 'fr', label: 'France' }] }, h)
  // @ts-expect-error `label` is missing from the option.
  Select.view({ id: 'r', label: 'Region', options: [{ value: 'fr' }] }, h)
})

test('a radio’s options and value are strings of one type', () => {
  RadioGroup.view(
    {
      ...common,
      options: [
        { value: 'free', label: 'Free' },
        { value: 'team', label: 'Team' },
      ],
      value: plan,
    },
    h,
  )
  RadioGroup.view(
    {
      ...common,
      // @ts-expect-error a number is no value.
      options: [{ value: 1, label: 'One' }],
      value: Option.none(),
    },
    h,
  )
})

test('configure keeps the Message and refuses a preset that was not declared', () => {
  const App = Checkbox.configure({ presets: { end: { position: 'end' } } })
  App.view({ id: 'a', checked: true, onToggle: toggled, label: 'Terms', preset: 'end' }, h)
  expectTypeOf(App.view).parameter(0).toHaveProperty('preset').toEqualTypeOf<'end' | undefined>()
  // @ts-expect-error `start` was not declared.
  App.view({ id: 'a', checked: true, onToggle: toggled, label: 'Terms', preset: 'start' }, h)
})

test('a preset holds no one use’s content', () => {
  // @ts-expect-error a label is one use’s.
  Checkbox.configure({ base: { label: 'Terms' } })
  // @ts-expect-error the checked state is one use’s.
  Switch.configure({ base: { checked: true } })
  // @ts-expect-error an Icon style on a Checkbox.
  Checkbox.configure({ base: { style: glyphs } })
})
