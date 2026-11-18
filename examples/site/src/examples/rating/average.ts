import { Option } from 'effect'
import { Rating, RatingSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Read-only, the group is one image whose name says the rating, and a
// fraction fills the last star as far as it goes. It sends nothing, so it
// takes no Message.
export default example({
  title: 'A read-only average',
  slots: RatingSlots,
  recipe: Recipes.Rating,
  view: ({ style, h }) =>
    Rating.view(
      {
        id: 'average',
        label: 'Average of 1,204 reviews',
        value: Option.some(4.3),
        readOnly: true,
        showValue: true,
        style,
      },
      h,
    ),
})
