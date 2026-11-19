import { Button, Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'

const Action = Recipes.Button.style({ size: 'sm' })

// `orientation: 'overlay'` makes the picture the card's ground, with the
// text over its foot on a fade to the card's own surface.
export default example({
  title: 'Text over a picture',
  slots: CardSlots,
  recipe: Recipes.Card,
  pins: { orientation: 'overlay' },
  view: ({ style, h }) =>
    Card.view(
      {
        image: h.img([h.Src(portrait(300)), h.Alt('')]),
        title: 'Autumn collection',
        description: 'Wool, linen and the first cold mornings.',
        footer: Button.view({ label: 'Shop now', style: Action }, h),
        style,
      },
      h,
    ),
})
