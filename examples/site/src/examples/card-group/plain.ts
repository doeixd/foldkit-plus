import { Card, CardGroupSlots, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Tile = forSlots(CardSlots)(Recipes.Card({ lift: 'hover' }))

// No `fluid`: the group draws no highlight element and no Mount, and each
// card lifts by its own `lift`. A page that never passes `Card.fluid` ships
// none of it.
export default example({
  title: 'Without the highlight',
  slots: CardGroupSlots,
  recipe: Recipes.CardGroup,
  pins: { layout: 'separated' },
  view: ({ style, h }) =>
    Card.group(
      {
        label: 'Guides',
        columns: 2,
        cards: ['Tokens', 'Recipes', 'Bundles', 'Themes'].map(title => ({
          key: title,
          title,
          description: 'Read the guide',
          press: { href: '#' },
        })),
        style,
        cardStyle: Tile,
      },
      h,
    ),
})
