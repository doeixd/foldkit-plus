import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ checked: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean } })

// A line under the label that also describes the control to a screen reader.
export default example({
  title: 'Label and description',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: true } }),
    update: (model, { checked }) => ({ model: model.checked === checked ? model : { checked } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Checkbox.view(
      {
        id: 'marketing',
        checked: model.checked,
        onToggle: checked => onMessage(Message.Toggled({ checked })),
        label: 'Product updates',
        description: 'A short email when something ships, never more than once a month.',
        style,
      },
      h,
    ),
})
