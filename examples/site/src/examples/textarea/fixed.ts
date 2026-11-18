import { FieldValidation } from 'foldkit'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Textarea, TextareaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const terms = [
  'Terms',
  '',
  '1. You keep what you write.',
  '2. We keep it safe.',
  '3. Either of us may end this.',
].join('\n')

const Model = Schema.Struct({ text: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// Pinned: `Recipes.Textarea({ resize: 'vertical' })`. Four lines whatever
// the text, and the reader drags the corner for more; `resize: 'none'` holds it.
export default example({
  title: 'A fixed height',
  slots: TextareaSlots,
  recipe: Recipes.Textarea,
  pins: { resize: 'vertical' },
  state: {
    Model,
    Message,
    init: () => ({ model: { text: terms } }),
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
            id: 'terms',
            label: 'Terms',
            rows: 4,
            style,
          },
          h,
        ),
      ],
    ),
})
