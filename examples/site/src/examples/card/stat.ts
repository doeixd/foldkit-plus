import { Badge, Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Tag = Recipes.Badge.style()

// A number with what it counts and how it moved: the content is the figure.
export default example({
  title: 'A figure',
  slots: CardSlots,
  recipe: Recipes.Card,
  view: ({ style, h }) =>
    Card.view(
      {
        title: 'Monthly revenue',
        description: 'Up 12% on September',
        action: Badge.view({ text: '+12%', tone: 'live', style: Tag }, h),
        content: h.p([h.Style({ margin: '0', fontSize: '2rem', fontWeight: '600' })], ['$48,210']),
        style,
      },
      h,
    ),
})
