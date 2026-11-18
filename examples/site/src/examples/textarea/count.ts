import { FieldValidation } from 'foldkit'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Textarea, TextareaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ text: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// With a `maxLength` the field counts toward it, in the warning's ink from
// nine tenths and the error's at the limit, and the count describes the field.
export default example({
  title: 'A character count',
  slots: TextareaSlots,
  recipe: Recipes.Textarea,
  state: {
    Model,
    Message,
    init: () => ({ model: { text: 'Arriving Thursday, two nights.' } }),
    update: (_, { value }) => ({ model: { text: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(100%, 24rem)' })],
      [
        Textarea.field(
          {
            field: FieldValidation.NotValidated({ value: model.text }),
            changed: value => onMessage(Message.Typed({ value })),
            id: 'request',
            label: 'Requests for your host',
            maxLength: 60,
            style,
          },
          h,
        ),
      ],
    ),
})
