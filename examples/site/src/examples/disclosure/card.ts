import { Bundles, Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A box round the button and the panel, open at the start. The panel's height
// is animated by `@foldkit/ui`, over the same time the theme gives every
// disclosure.
export default example({
  title: 'In a card, open at the start',
  slots: DisclosureSlots,
  recipe: Recipes.Disclosure,
  pins: { variant: 'bordered' },
  state: Bundles.Disclosure.with({ isOpen: true }),
  view: ({ style, model, onMessage, h }) =>
    Disclosure.view(
      {
        id: 'disc-card',
        label: 'What is in the box',
        content: 'The kettle, its base, a cord that winds away, and a short manual.',
        ...Disclosure.controls(model, onMessage),
        style,
      },
      h,
    ),
})
