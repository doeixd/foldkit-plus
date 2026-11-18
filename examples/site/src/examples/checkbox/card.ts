import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ checked: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean } })

// The card is a look over the same markup: `variant: 'card'` boxes the row,
// fills it while checked, and stretches the label over it, so a press
// anywhere on the card toggles the box.
export default example({
  title: 'Card',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  pins: { variant: 'card' },
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: true } }),
    update: (model, { checked }) => ({ model: model.checked === checked ? model : { checked } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Checkbox.view(
      {
        id: 'plan-team',
        checked: model.checked,
        onToggle: checked => onMessage(Message.Toggled({ checked })),
        label: 'Team',
        description: 'Ten editors and every page.',
        style,
      },
      h,
    ),
})
