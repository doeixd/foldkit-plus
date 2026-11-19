import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { copyText } from 'foldkit-primitives/dom'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// `Copied` and `CopyFailed` are the Command's own Messages, named alike here so it needs no mapping.
const Message = defineMessageUnion({
  Pressed: {},
  Copied: {},
  CopyFailed: { message: Schema.String },
})

export default primitiveExample({
  title: 'copyText',
  text: '`copyText` is a Command, returned from `update`; the clipboard is not application state, so the answer is a Message and nothing is stored. Press, then paste somewhere.',
  state: {
    Model: Schema.Struct({ answer: Schema.OptionFromNullOr(Schema.String) }),
    Message,
    init: () => ({ model: { answer: Option.none() } }),
    update: (model, message) =>
      Message.match(message, {
        Pressed: () => ({ model, commands: [copyText('foldkit-primitives')] }),
        Copied: () => ({ model: { answer: Option.some('Copied.') } }),
        CopyFailed: ({ message }) => ({
          model: { answer: Option.some(`Not copied: ${message}.`) },
        }),
      }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(Message.Pressed()))]),
          ['Copy “foldkit-primitives”'],
        ),
        Option.getOrElse(model.answer, () => ''),
      ],
    ),
})
