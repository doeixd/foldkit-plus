import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Rating, RatingSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ value: Schema.OptionFromNullOr(Schema.Number) })
const Message = defineMessageUnion({ Rated: { value: Schema.Number } })

// `labels` names each whole number of stars, from one up: read aloud for
// each radio, and shown beside the stars with `showValue`.
export default example({
  title: 'A word per value',
  slots: RatingSlots,
  recipe: Recipes.Rating,
  state: {
    Model,
    Message,
    init: () => ({ model: { value: Option.none() } }),
    update: (_, { value }) => ({ model: { value: Option.some(value) } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Rating.view(
      {
        id: 'support',
        label: 'Your support call',
        value: model.value,
        labels: ['Useless', 'Poor', 'Ok', 'Good', 'Excellent'],
        showValue: true,
        onChange: value => onMessage(Message.Rated({ value })),
        style,
      },
      h,
    ),
})
