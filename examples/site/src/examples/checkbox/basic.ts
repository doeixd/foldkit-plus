import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ checked: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean } })

// The checked state is the application's field. The label is the control's
// name, and a press on it toggles the box; `name` submits it with a form.
export default example({
  title: 'Basic',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: false } }),
    update: (model, { checked }) => ({ model: model.checked === checked ? model : { checked } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Checkbox.view(
      {
        id: 'terms',
        checked: model.checked,
        onToggle: checked => onMessage(Message.Toggled({ checked })),
        label: 'Accept the terms',
        name: 'terms',
        style,
      },
      h,
    ),
})
