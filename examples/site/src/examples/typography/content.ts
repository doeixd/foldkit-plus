import { Typography, TypographySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `content` takes the place of `text` where the voice holds a link or
// emphasis. Give one or the other: both is a type error.
export default example({
  title: 'A link inside a paragraph',
  slots: TypographySlots,
  recipe: Recipes.Typography,
  view: ({ style, h }) =>
    Typography.view(
      {
        level: 'body',
        content: [
          'See the ',
          h.a([h.Href('/components/button')], ['button page']),
          ' for ',
          h.strong([], ['every']),
          ' knob.',
        ],
        style,
      },
      h,
    ),
})
