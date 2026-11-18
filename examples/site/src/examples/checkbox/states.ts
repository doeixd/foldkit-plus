import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Model = Schema.Struct({ checked: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean } })

// `disabled` and `readOnly` refuse the press and say so (`aria-disabled`,
// `aria-readonly`); `invalid` shows the error edge and `aria-invalid`.
export default example({
  title: 'Disabled, read-only and invalid',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: false } }),
    update: (model, { checked }) => ({ model: model.checked === checked ? model : { checked } }),
  },
  view: ({ style, model, onMessage, h }) => {
    const common = {
      checked: model.checked,
      onToggle: (checked: boolean) => onMessage(Message.Toggled({ checked })),
      style,
    }
    return stack(h, [
      Checkbox.view({ id: 'off', label: 'Disabled', disabled: true, ...common }, h),
      Checkbox.view({ id: 'locked', label: 'Read-only', readOnly: true, ...common }, h),
      Checkbox.view({ id: 'bad', label: 'Accept the terms', invalid: true, ...common }, h),
    ])
  },
})
