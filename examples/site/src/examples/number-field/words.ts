import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { NumberField, NumberFieldSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ chairs: Schema.Option(Schema.Number) })
const Message = defineMessageUnion({ Changed: { value: Schema.Option(Schema.Number) } })

// The steppers' names are words, merged over the defaults one by one: a word
// you do not give keeps its English default.
export default example({
  title: 'In French',
  slots: NumberFieldSlots,
  recipe: Recipes.NumberField,
  state: {
    Model,
    Message,
    init: () => ({ model: { chairs: Option.some(6) } }),
    update: (_, { value }) => ({ model: { chairs: value } }),
  },
  view: ({ style, model, onMessage, h }) =>
    NumberField.view(
      {
        id: 'chairs',
        label: 'Chaises',
        value: model.chairs,
        onChange: value => onMessage(Message.Changed({ value })),
        words: { decrease: 'Moins', increase: 'Plus' },
        style,
      },
      h,
    ),
})
