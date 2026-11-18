import { Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Levels = (['0', '1', '2', '3'] as const).map(elevation =>
  forSlots(CardSlots)(Recipes.Card({ surface: 'elevated', elevation })),
)

// Each level one more step above what holds it: lighter on a dark page, a
// deeper contact and ambient shadow on a light one.
export default example({
  title: 'Elevation',
  slots: CardSlots,
  recipe: Recipes.Card,
  view: ({ h }) =>
    h.div(
      [
        h.Style({
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
          gap: '1.5rem',
        }),
      ],
      Levels.map((style, level) =>
        Card.view({ title: `Level ${level}`, description: `elevation: '${level}'`, style }, h),
      ),
    ),
})
