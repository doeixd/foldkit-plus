/**
 * `X.configure`'s types: the preset names come from the keys given, a preset
 * holds only what the widget's preset type lists, and the view it returns
 * keeps the application's Message. One defect per refusal.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Schema } from 'effect'
import { Style } from 'foldkit-mixins'
import { expectTypeOf, test } from 'vitest'
import { Button, ButtonSlots, TagsInput, TagsInputSlots } from '../src/index.js'

const Message = defineMessageUnion({
  Clicked: {},
  GotTagsMessage: { message: TagsInput.Message },
})
type Message = typeof Message.Type
declare const h: HtmlBuilder<Message>

const quiet = Style.forSlots(ButtonSlots)({ button: Style.class('quiet') })
const chips = Style.forSlots(TagsInputSlots)({ root: Style.class('chips') })

const App = Button.configure({
  base: { style: quiet },
  presets: { danger: { type: 'submit' }, plain: {} },
})
const Bare = Button.configure({ base: { style: quiet } })

test('the returned view keeps the application’s Message', () => {
  App.view({ label: 'Delete', preset: 'danger', onClick: Message.Clicked() }, h)
  expectTypeOf(App.view)
    .parameter(0)
    .toHaveProperty('preset')
    .toEqualTypeOf<'danger' | 'plain' | undefined>()
  // @ts-expect-error not a Message of the builder's.
  App.view({ label: 'Delete', onClick: 'Clicked' }, h)
})

test('a preset name that was not declared is refused', () => {
  // @ts-expect-error `dangr` is no preset.
  App.view({ label: 'Delete', preset: 'dangr' }, h)
})

test('`preset` is no option where none was declared', () => {
  Bare.view({ label: 'Save' }, h)
  // @ts-expect-error no presets were given.
  Bare.view({ label: 'Save', preset: 'danger' }, h)
})

test('a preset holds only the widget’s preset options', () => {
  // @ts-expect-error `stile` is no option.
  Button.configure({ presets: { danger: { stile: quiet } } })
  // @ts-expect-error a label is one use’s content, not a preset’s.
  Button.configure({ base: { label: 'Save' } })
  // @ts-expect-error a Message is the call’s.
  Button.configure({ base: { onClick: Message.Clicked() } })
})

test('a style of another widget’s Slots is refused', () => {
  // @ts-expect-error a TagsInput style on a Button.
  Button.configure({ base: { style: chips } })
  // @ts-expect-error and in a preset.
  Button.configure({ presets: { danger: { style: chips } } })
})

test('TagsInput’s configured view takes the Model and lifts its Messages', () => {
  const Tags = TagsInput.configure({
    base: { style: chips, addOnBlur: true },
    presets: { rtl: { direction: 'rtl' } },
  })
  const model = TagsInput.init({ id: 'topics' })
  Tags.view(
    {
      model,
      onMessage: message => {
        expectTypeOf(message).toEqualTypeOf<TagsInput.Message>()
        return Message.GotTagsMessage({ message })
      },
      label: 'Topics',
      preset: 'rtl',
    },
    h,
  )
  // @ts-expect-error the Model is the call’s, never a preset’s.
  TagsInput.configure({ base: { model } })
  // @ts-expect-error `ltl` is no direction.
  TagsInput.configure({ presets: { odd: { direction: 'ltl' } } })
})

void Schema
