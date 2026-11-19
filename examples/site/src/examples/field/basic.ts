import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Field, FieldSlots, Input, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Control = Recipes.Input.style({})
const Model = Schema.Struct({ email: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// The shell draws the label, the description and the errors; the control is
// drawn by the application, with the id the label names and the `describedBy`
// the shell's description is reached by. It owns no state.
export default example({
  title: 'A label, a description and a mark',
  slots: FieldSlots,
  recipe: Recipes.Field,
  state: {
    Model,
    Message,
    init: () => ({ model: { email: '' } }),
    update: (_, { value }) => ({ model: { email: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Field.view(
      {
        id: 'email',
        label: 'Email',
        required: true,
        description: 'We send the receipt here.',
        control: Input.view(
          {
            id: 'email',
            type: 'email',
            required: true,
            value: model.email,
            onInput: value => onMessage(Message.Typed({ value })),
            attributes: { input: Field.describedBy(h, 'email', { description: true }) },
            style: Control,
            draw: ({ input }, h) => h.input(input),
          },
          h,
        ),
        style,
      },
      h,
    ),
})
