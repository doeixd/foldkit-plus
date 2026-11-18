import { Button, ButtonSlots, Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({}))

// A picture across the top, bled to the card's edges.
export default example({
  title: 'Media',
  slots: CardSlots,
  recipe: Recipes.Card,
  view: ({ style, h }) =>
    Card.view(
      {
        image: h.img([h.Src(portrait(200)), h.Alt('')]),
        title: 'Lisbon in spring',
        description: 'Six days of trams, tiles and long lunches.',
        footer: Button.view({ label: 'Read the guide', style: Action }, h),
        style,
      },
      h,
    ),
})
