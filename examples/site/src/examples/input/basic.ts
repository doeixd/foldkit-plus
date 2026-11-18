import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ email: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// With a `label` the field draws itself: label, control, description. The text
// is the application's, folded by hand: no Bundle is needed.
export default example({
  title: 'Basic',
  slots: InputSlots,
  recipe: Recipes.Input,
  state: {
    Model,
    Message,
    init: () => ({ model: { email: '' } }),
    update: (model, { value }) => ({ model: modifyFields(model, { email: () => value }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    Input.view(
      {
        id: 'email',
        label: 'Email',
        description: 'We send the receipt here.',
        type: 'email',
        autocomplete: 'email',
        placeholder: 'ada@example.com',
        value: model.email,
        onInput: value => onMessage(Message.Typed({ value })),
        style,
      },
      h,
    ),
})
