import { Bundles, Marquee, MarqueeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const CUSTOMERS = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark']

// What it measured and whether it is paused are the marquee's Model, placed by
// `Bundles.Marquee`. It draws as many copies as fill the strip, pauses under
// the pointer or focus, and keeps a press to pause it for good.
export default example({
  title: 'Basic',
  slots: MarqueeSlots,
  recipe: Recipes.Marquee,
  state: Bundles.Marquee.with({ id: 'customers' }),
  view: ({ style, model, onMessage, h }) =>
    Marquee.view(
      {
        model,
        onMessage,
        label: 'Our customers',
        items: CUSTOMERS.map(name => h.strong([], [name])),
        speed: 40,
        style,
      },
      h,
    ),
})
