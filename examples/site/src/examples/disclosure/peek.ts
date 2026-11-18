import { Bundles, Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A shut panel can keep a height as a preview of its content. The preview is
// inert, out of the tab order and the accessibility tree, until the panel opens.
export default example({
  title: 'A preview while shut',
  slots: DisclosureSlots,
  recipe: Recipes.Disclosure,
  state: Bundles.Disclosure.with({}),
  view: ({ style, model, onMessage, h }) =>
    Disclosure.view(
      {
        id: 'disc-peek',
        label: 'Read the full note',
        peek: '3em',
        content:
          'We moved the weekly review to Thursdays so that it lands after the release is cut. Notes from the last review are in the shared folder; please add yours before the meeting, and bring one thing you would change about how we ship.',
        ...Disclosure.controls(model, onMessage),
        style,
      },
      h,
    ),
})
