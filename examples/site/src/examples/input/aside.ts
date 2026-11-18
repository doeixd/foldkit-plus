import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ handle: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })

// `labelAside` stands beside the label, at its end, and not inside it, so an
// interactive one is not part of what names the control.
export default example({
  title: 'Beside the label',
  slots: InputSlots,
  recipe: Recipes.Input,
  state: {
    Model,
    Message,
    init: () => ({ model: { handle: '' } }),
    update: (model, { value }) => ({ model: modifyFields(model, { handle: () => value }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    Input.view(
      {
        id: 'handle',
        label: 'Handle',
        labelAside: h.span([], [`${model.handle.length} / 15`]),
        description: 'Shown on your public profile.',
        maxLength: 15,
        value: model.handle,
        onInput: value => onMessage(Message.Typed({ value })),
        style,
      },
      h,
    ),
})
