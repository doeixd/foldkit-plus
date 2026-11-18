import { FieldValidation } from 'foldkit'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Textarea, TextareaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ text: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// A field from a `FieldValidation.Field`: the label, the text, and what it says
// under itself. The text is the application's own.
export default example({
  title: 'Basic',
  slots: TextareaSlots,
  recipe: Recipes.Textarea,
  state: {
    Model,
    Message,
    init: () => ({ model: { text: '' } }),
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
            id: 'message',
            label: 'Message',
            rows: 3,
            placeholder: 'What should we know?',
            style,
          },
          h,
        ),
      ],
    ),
})
