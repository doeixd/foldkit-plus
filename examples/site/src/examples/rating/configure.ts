import { Option } from 'effect'
import { Rating, RatingSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// The words and the scale every rating of the application starts from, said
// once; the preset changes only the scale. A call gives what is its own.
const AppRating = Rating.configure({
  base: { max: 10, words: { one: '{value} point', other: '{value} points' } },
  presets: { five: { max: 5 } },
})

export default example({
  title: 'Configure once',
  slots: RatingSlots,
  recipe: Recipes.Rating,
  view: ({ style, h }) =>
    row(h, [
      AppRating.view(
        { id: 'quality', label: 'Quality', value: Option.some(7), readOnly: true, style },
        h,
      ),
      AppRating.view(
        {
          id: 'service',
          label: 'Service',
          preset: 'five',
          value: Option.some(4),
          readOnly: true,
          style,
        },
        h,
      ),
    ]),
})
