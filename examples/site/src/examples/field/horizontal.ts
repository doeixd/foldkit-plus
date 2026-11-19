import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Field, FieldSlots, Input, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Control = Recipes.Input.style({})
const Model = Schema.Struct({ name: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// `horizontal` puts the label in a column of its own beside the control, the
// description under the control; `labelAside` stands beside the label.
export default example({
  title: 'Beside the control',
  slots: FieldSlots,
  recipe: Recipes.Field,
  state: {
    Model,
    Message,
    init: () => ({ model: { name: 'Ada Lovelace' } }),
    update: (_, { value }) => ({ model: { name: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Field.view(
      {
        id: 'name',
        label: 'Full name',
        orientation: 'horizontal',
        description: 'As on your passport.',
        control: Input.view(
          {
            id: 'name',
            value: model.name,
            onInput: value => onMessage(Message.Typed({ value })),
            attributes: { input: Field.describedBy(h, 'name', { description: true }) },
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
