import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { NumberField, NumberFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ servings: Schema.Option(Schema.Number) })
const Message = defineMessageUnion({ Changed: { value: Schema.Option(Schema.Number) } })

// The number is the application's, and `Option.none()` is an empty field.
// The arrows step it, Page Up and Page Down step by ten, and Home and End
// take it to the bounds; a typed number commits on blur or Enter.
export default example({
  title: 'Basic',
  slots: NumberFieldSlots,
  recipe: Recipes.NumberField,
  state: {
    Model,
    Message,
    init: () => ({ model: { servings: Option.some(4) } }),
    update: (_, { value }) => ({ model: { servings: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    NumberField.view(
      {
        id: 'servings',
        label: 'Servings',
        description: 'From 1 to 12; the arrow keys step it.',
        value: model.servings,
        onChange: value => onMessage(Message.Changed({ value })),
        min: 1,
        max: 12,
        style,
      },
      h,
    ),
})
