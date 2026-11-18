import { Bundles, Marquee, MarqueeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const TAGS = ['#design', '#effect', '#foldkit', '#typescript', '#accessibility', '#css']

// `side: 'end'` moves toward the inline end, rightward left to right; under
// `dir="rtl"` both sides turn with the page.
export default example({
  title: 'The other way',
  slots: MarqueeSlots,
  recipe: Recipes.Marquee,
  state: Bundles.Marquee.with({ id: 'tags' }),
  view: ({ style, model, onMessage, h }) =>
    Marquee.view(
      {
        model,
        onMessage,
        label: 'Trending topics',
        items: TAGS.map(tag => h.span([], [tag])),
        side: 'end',
        speed: 30,
        style,
      },
      h,
    ),
})
