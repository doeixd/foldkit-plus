import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Rating, RatingSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ value: Schema.OptionFromNullOr(Schema.Number) })
const Message = defineMessageUnion({ Rated: { value: Schema.Number } })

// Hearts are a look: `glyph`, `tone` and `size` of the recipe, pinned here.
// What the group reads aloud is the words.
export default example({
  title: 'Hearts',
  slots: RatingSlots,
  recipe: Recipes.Rating,
  pins: { glyph: 'heart', tone: 'danger', size: 'lg' },
  state: {
    Model,
    Message,
    init: () => ({ model: { value: Option.some(4) } }),
    update: (_, { value }) => ({ model: { value: Option.some(value) } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Rating.view(
      {
        id: 'hearts',
        label: 'How much you liked it',
        value: model.value,
        words: { one: '{value} heart', other: '{value} hearts' },
        onChange: value => onMessage(Message.Rated({ value })),
        style,
      },
      h,
    ),
})
