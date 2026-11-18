import { FieldValidation } from 'foldkit'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Textarea, TextareaSlots, Button, ButtonSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Ghost = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)
const Send = forSlots(ButtonSlots)(Recipes.Button({ size: 'sm' }))

const Model = Schema.Struct({ text: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// A `footer` draws the field as one box, its controls under the text and
// the count at their end; the ring shows while the text has focus.
export default example({
  title: 'With a footer',
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
            id: 'reply',
            label: 'Reply',
            rows: 2,
            maxRows: 8,
            maxLength: 500,
            placeholder: 'Write a reply…',
            footer: [
              Button.view({ label: 'Attach', style: Ghost }, h),
              Button.view({ label: 'Send', disabled: model.text.trim() === '', style: Send }, h),
            ],
            style,
          },
          h,
        ),
      ],
    ),
})
