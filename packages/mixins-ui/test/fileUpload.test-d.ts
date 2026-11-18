/**
 * Compile-time: the recipe's axes, the slots a style and a mixin may name, the
 * view's required Message and the options it refuses, a lane's send, the words
 * and an exhaustive OutMessage match. Type-checked, not executed.
 */
import { Option, Stream } from 'effect'
import { Behavior, Style } from 'foldkit-mixins'
import { defineMessageUnion } from 'foldkit/message'
import { FileUpload, FileUploadSlots, Recipes } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

// @ts-expect-error the layout is one of button, zone, avatar and cover
Recipes.FileUpload({ layout: 'nope' })

// @ts-expect-error the list is rows or grid
Recipes.FileUpload({ list: 'cards' })

export const styled = Style.forSlots(FileUploadSlots)(Recipes.FileUpload({ layout: 'cover' }))

Behavior.forSlots(FileUploadSlots)<unknown, never>({
  // @ts-expect-error the field publishes no trigger slot: the picker is the label
  trigger: Behavior.slot({}),
})

const model = FileUpload.init({ id: 'up' })
const field = { model, onMessage: () => message('Clicked'), label: 'Files' } as const

export const plain = FileUpload.view(field, h)

// A style's slots are covariant: a style of FileInputSlots stands where one of FileUploadSlots is
// asked for, since it names fewer slots. The type cannot refuse it, so no case here.

export const noMessage = FileUpload.view(
  // @ts-expect-error onMessage is required
  { model, label: 'Files' },
  h,
)

export const foreignMessage = FileUpload.view(
  {
    ...field,
    // @ts-expect-error onMessage cannot answer with a Message the view does not send
    onMessage: () => 'nope',
  },
  h,
)

export const unknownWord = FileUpload.view(
  {
    ...field,
    // @ts-expect-error the words are a closed set
    words: { drop: 'Drop here' },
  },
  h,
)

export const sortNeedsInput = FileUpload.view(
  {
    ...field,
    // @ts-expect-error sort names the Model its Behavior reads
    sort: { mixin: undefined },
  },
  h,
)

export const picture = FileUpload.view(
  {
    ...field,
    picture: (url: Option.Option<string>) => h.span([], [Option.getOrElse(url, () => '')]),
  },
  h,
)

const Mine = defineMessageUnion({ Elsewhere: {} })
type Mine = typeof Mine.Type

// A lane's send answers with the application's Message, the one the Subscription is typed for.
export const lane = FileUpload.lane<{ readonly upload: FileUpload.Model }, TestMessage>({
  lane: 0,
  model: parent => parent.upload,
  send: () => Stream.make(message('Clicked')),
})

FileUpload.lane<{ readonly upload: FileUpload.Model }, TestMessage>({
  lane: 0,
  model: parent => parent.upload,
  // @ts-expect-error the stream yields a Message the application does not have
  send: () => Stream.make(Mine.Elsewhere()),
})

export const exhaustive = (out: FileUpload.OutMessage): number =>
  FileUpload.OutMessage.match(out, {
    Picked: ({ added }) => added.length,
    Removed: ({ ids }) => ids.length,
  })

export const partial = (out: FileUpload.OutMessage): number =>
  // @ts-expect-error Removed is not handled
  FileUpload.OutMessage.match(out, {
    Picked: ({ added }) => added.length,
  })
