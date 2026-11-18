import { FieldValidation } from 'foldkit'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Textarea, TextareaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ text: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// `resize: 'auto'` (the default): two lines empty, a line more with each
// line written, and from six lines on it scrolls.
export default example({
  title: 'Grows with its text',
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
            id: 'notes',
            label: 'Notes',
            rows: 2,
            maxRows: 6,
            placeholder: 'Write a line, then another…',
            style,
          },
          h,
        ),
      ],
    ),
})
