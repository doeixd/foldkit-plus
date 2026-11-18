import { Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'

// `lift: 'zoom'` grows the picture inside its frame under the pointer; the
// card stays put. The reader's reduced-motion setting stills it.
export default example({
  title: 'A picture that grows',
  slots: CardSlots,
  recipe: Recipes.Card,
  pins: { lift: 'zoom' },
  view: ({ style, h }) =>
    Card.view(
      {
        image: h.img([h.Src(portrait(40)), h.Alt('')]),
        title: 'Porto in autumn',
        description: 'Four days along the river.',
        press: { href: '#' },
        style,
      },
      h,
    ),
})
