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
import {
  Bundles,
  Button,
  ButtonSlots,
  FileUpload,
  FileUploadSlots,
  TagsInput,
  TagsInputSlots,
} from '../src/index.js'

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

test('TagsInput’s words are text, each of the widget’s own', () => {
  TagsInput.configure({ base: { words: { remove: 'Retirer {tag}', full: 'Au plus {max}' } } })
  expectTypeOf(TagsInput.words).toEqualTypeOf<TagsInput.TagsInputWords>()
  // @ts-expect-error a word is text, not a function of the tag.
  TagsInput.configure({ base: { words: { remove: (tag: string) => tag } } })
  TagsInput.view(
    {
      model: TagsInput.init({ id: 'a' }),
      onMessage: () => Message.Clicked(),
      label: 'A',
      // @ts-expect-error `refusalText` is gone: the refusals are words.
      refusalText: () => '',
    },
    h,
  )
  // @ts-expect-error `retry` is no word of a TagsInput.
  TagsInput.configure({ base: { words: { retry: 'again' } } })
})

test('FileUpload’s configured view and parts keep the Message, and a preset holds no Model or sort', () => {
  const zone = Style.forSlots(FileUploadSlots)({ root: Style.class('zone') })
  const Upload = FileUpload.configure({
    base: { style: zone, words: { prompt: 'Drop files here or' } },
    presets: { avatar: { picture: () => h.span([], []) } },
  })
  const model = FileUpload.init({ id: 'files' })
  const field = { model, onMessage: () => Message.Clicked(), label: 'browse' }
  Upload.view({ ...field, preset: 'avatar' }, h)
  expectTypeOf(Upload.parts(field, h)).toEqualTypeOf<FileUpload.FileUploadParts>()
  // @ts-expect-error `avatr` is no preset.
  Upload.view({ ...field, preset: 'avatr' }, h)
  // @ts-expect-error the Model is the call’s, never a preset’s.
  FileUpload.configure({ base: { model } })
  // @ts-expect-error `sort` reads the Model each draw, so it stays at the call.
  FileUpload.configure({ base: { sort: { input: model, mixin: zone.mixin } } })
  // @ts-expect-error a Button style on a FileUpload.
  FileUpload.configure({ base: { style: quiet } })
  // @ts-expect-error `drop` is no word.
  FileUpload.configure({ base: { words: { drop: 'Drop here' } } })
})

test('Bundles.FileUpload’s args are `FileUpload.init`’s options, key for key', () => {
  type Args = NonNullable<typeof Bundles.FileUpload.args>['Type']
  expectTypeOf<keyof Args>().toEqualTypeOf<keyof FileUpload.InitOptions>()
  expectTypeOf<Args>().toExtend<FileUpload.InitOptions>()
})

void Schema
