import { Style } from 'foldkit-mixins'
import { Bundles, Marquee, MarqueeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Upright, a marquee is as tall as you make it: `extend` gives the root a
// height, and `side: 'top'` moves the lines up.
const Tall = Recipes.Marquee.extend({ base: { root: Style.self({ blockSize: '8rem' }) } })

export default example({
  title: 'Vertical',
  slots: MarqueeSlots,
  recipe: Tall,
  state: Bundles.Marquee.with({ id: 'news' }),
  view: ({ style, model, onMessage, h }) =>
    Marquee.view(
      {
        model,
        onMessage,
        label: 'Latest news',
        items: ['Release 1.2 is out', 'New docs site', 'Meetup on Friday'].map(line =>
          h.span([], [line]),
        ),
        side: 'top',
        speed: 20,
        style,
      },
      h,
    ),
})
