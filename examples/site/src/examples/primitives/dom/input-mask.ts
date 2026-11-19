import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { InputMask } from 'foldkit-primitives/dom'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Message = defineMessageUnion({ Typed: { value: Schema.String, raw: Schema.String } })

// The Mount rewrites the field and keeps the caret; the Model keeps what it reported.
export default primitiveExample({
  title: 'InputMask',
  text: '`InputMask` is a Mount with a pattern: `#` takes a digit, anything else is written in once typing reaches it. Type a phone number.',
  state: {
    Model: Schema.Struct({ value: Schema.String, raw: Schema.String }),
    Message,
    init: () => ({ model: { value: '', raw: '' } }),
    update: (_, message) =>
      Message.match(message, { Typed: ({ value, raw }) => ({ model: { value, raw } }) }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      [],
      [
        h.input(
          slots.liveField.attrs([
            h.Type('text'),
            h.AriaLabel('Phone'),
            h.Attribute('inputmode', 'numeric'),
            h.OnMount(
              Mount.mapMessage(InputMask({ pattern: '(###) ###-####' }), ({ value, raw }) =>
                onMessage(Message.Typed({ value, raw })),
              ),
            ),
          ]),
        ),
        h.p([], [`Shown “${model.value}”, typed ${model.raw.length} digits.`]),
      ],
    ),
})
