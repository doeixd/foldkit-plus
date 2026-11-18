import { Bundles, Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// An `icon` stands before the label, and a ghost button fills under the pointer.
export default example({
  title: 'With an icon',
  slots: DisclosureSlots,
  recipe: Recipes.Disclosure,
  pins: { variant: 'ghost' },
  state: Bundles.Disclosure.with({}),
  view: ({ style, model, onMessage, h }) =>
    Disclosure.view(
      {
        id: 'disc-icon',
        label: 'Notification settings',
        icon: outline(
          h,
          'M8 2a4 4 0 0 0-4 4v3l-1 2h10l-1-2V6a4 4 0 0 0-4-4zM6.5 13a1.5 1.5 0 0 0 3 0',
        ),
        content: 'Email me when someone replies, and once a week with what I missed.',
        ...Disclosure.controls(model, onMessage),
        style,
      },
      h,
    ),
})
