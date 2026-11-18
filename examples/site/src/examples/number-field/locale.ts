import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { NumberField, NumberFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ price: Schema.Option(Schema.Number) })
const Message = defineMessageUnion({ Changed: { value: Schema.Option(Schema.Number) } })

// `locale` draws and reads that locale's marks (`1.234,5`), with the unit
// beside the number in `end`: the box is one field, the number the Model's.
export default example({
  title: 'In a locale, with a unit',
  slots: NumberFieldSlots,
  recipe: Recipes.NumberField,
  state: {
    Model,
    Message,
    init: () => ({ model: { price: Option.some(1234.5) } }),
    update: (_, { value }) => ({ model: { price: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    NumberField.view(
      {
        id: 'price',
        label: 'Preis',
        value: model.price,
        onChange: value => onMessage(Message.Changed({ value })),
        locale: 'de-DE',
        step: 0.5,
        min: 0,
        end: h.span([], ['EUR']),
        style,
      },
      h,
    ),
})
