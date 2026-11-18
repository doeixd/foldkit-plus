import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { NumberField, NumberFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Model = Schema.Struct({ seats: Schema.Option(Schema.Number) })
const Message = defineMessageUnion({ Changed: { value: Schema.Option(Schema.Number) } })

// `invalid` draws the error edge and marks the input. `readOnly` can be read
// and selected but not changed, and its steppers are disabled.
export default example({
  title: 'Invalid, read only and disabled',
  slots: NumberFieldSlots,
  recipe: Recipes.NumberField,
  state: {
    Model,
    Message,
    init: () => ({ model: { seats: Option.some(40) } }),
    update: (_, { value }) => ({ model: { seats: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(
      h,
      [
        { id: 'seats', label: 'Seats (12 at most)', max: 12, invalid: true },
        { id: 'floor', label: 'Floor', readOnly: true },
        { id: 'rooms', label: 'Rooms', disabled: true },
      ].map(options =>
        NumberField.view(
          {
            ...options,
            value: model.seats,
            onChange: value => onMessage(Message.Changed({ value })),
            style,
          },
          h,
        ),
      ),
      [h.Style({ alignItems: 'stretch' })],
    ),
})
