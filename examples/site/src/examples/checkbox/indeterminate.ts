import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Toppings = ['Cheese', 'Olives', 'Basil'] as const
const Model = Schema.Struct({ on: Schema.Array(Schema.Literals(Toppings)) })
const Message = defineMessageUnion({ ToggledAll: { checked: Schema.Boolean } })

// A dash while only some are chosen: `indeterminate` is the application's
// reading of its own state, and a press leaves the box checked or not.
export default example({
  title: 'Indeterminate',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  state: {
    Model,
    Message,
    init: () => ({ model: { on: ['Cheese'] } }),
    update: (_, { checked }) => ({ model: { on: checked ? [...Toppings] : [] } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Checkbox.view(
      {
        id: 'toppings',
        checked: model.on.length === Toppings.length,
        indeterminate: model.on.length > 0 && model.on.length < Toppings.length,
        onToggle: checked => onMessage(Message.ToggledAll({ checked })),
        label: `Toppings (${model.on.length} of ${Toppings.length})`,
        style,
      },
      h,
    ),
})
