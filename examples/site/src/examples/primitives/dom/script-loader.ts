import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { loadScript } from 'foldkit-primitives/dom'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Message = defineMessageUnion({
  Pressed: {},
  Loaded: {},
  LoadFailed: { message: Schema.String },
})

// A data: URL stands in for a library's address; a second press shares the first's tag.
const SRC = 'data:text/javascript,void 0'

export default primitiveExample({
  title: 'loadScript',
  text: '`loadScript` is a Command that adds a script tag once per address and answers when it has run. Press twice: the second answer comes from the first tag.',
  state: {
    Model: Schema.Struct({ loads: Schema.Number, failure: Schema.OptionFromNullOr(Schema.String) }),
    Message,
    init: () => ({ model: { loads: 0, failure: Option.none() } }),
    update: (model, message) =>
      Message.match(message, {
        Pressed: () => ({ model, commands: [loadScript(SRC)] }),
        Loaded: () => ({ model: { loads: model.loads + 1, failure: Option.none() } }),
        LoadFailed: ({ message }) => ({ model: { ...model, failure: Option.some(message) } }),
      }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(Message.Pressed()))]),
          ['Load the script'],
        ),
        ` Answered ${model.loads} times.`,
        Option.getOrElse(model.failure, () => ''),
      ],
    ),
})
