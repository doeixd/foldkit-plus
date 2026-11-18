import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Rating, RatingSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ value: Schema.OptionFromNullOr(Schema.Number) })
const Message = defineMessageUnion({ Rated: { value: Schema.Number }, Cleared: {} })

// Each star is two radios. A press on the star already chosen sends
// `onClear`; without it, the press keeps the rating.
export default example({
  title: 'Half stars, cleared by a second press',
  slots: RatingSlots,
  recipe: Recipes.Rating,
  state: {
    Model,
    Message,
    init: () => ({ model: { value: Option.some(3.5) } }),
    update: (model, message) =>
      Message.match(message, {
        Rated: ({ value }) => ({ model: { value: Option.some(value) } }),
        Cleared: () => ({ model: Option.isNone(model.value) ? model : { value: Option.none() } }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    Rating.view(
      {
        id: 'film',
        label: 'The film',
        value: model.value,
        precision: 0.5,
        onChange: value => onMessage(Message.Rated({ value })),
        onClear: () => onMessage(Message.Cleared()),
        style,
      },
      h,
    ),
})
