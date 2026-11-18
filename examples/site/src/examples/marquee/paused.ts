import { Bundles, Marquee, MarqueeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SPONSORS = ['Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Woodgrove']

// `paused: true` places it held, until a reader presses play; `words` names
// the press. `delay` waits before the first move once it plays, and
// `loopCount` stops it after three rounds.
export default example({
  title: 'Starts paused',
  slots: MarqueeSlots,
  recipe: Recipes.Marquee,
  state: Bundles.Marquee.with({ id: 'sponsors', paused: true }),
  view: ({ style, model, onMessage, h }) =>
    Marquee.view(
      {
        model,
        onMessage,
        label: 'Sponsors',
        items: SPONSORS.map(name => h.strong([], [name])),
        delay: 1,
        loopCount: 3,
        words: { pause: 'Hold the sponsors', play: 'Run the sponsors' },
        style,
      },
      h,
    ),
})
