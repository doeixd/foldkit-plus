import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Rating, RatingSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ value: Schema.OptionFromNullOr(Schema.Number) })
const Message = defineMessageUnion({ Rated: { value: Schema.Number } })

// The stars given are the application's field. The group's name and the
// native radios under one name are the widget's: the arrows move the choice,
// and a form submits the number.
export default example({
  title: 'Basic',
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
        id: 'stay',
        label: 'Your stay',
        value: model.value,
        onChange: value => onMessage(Message.Rated({ value })),
        style,
      },
      h,
    ),
})
