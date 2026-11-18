import { Bundles, Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// One button that shows and hides one panel. Whether it is open is the
// Bundle's Model; `controls` hands the view that flag and the press's Message.
export default example({
  title: 'Basic',
  slots: DisclosureSlots,
  recipe: Recipes.Disclosure,
  state: Bundles.Disclosure.with({}),
  view: ({ style, model, onMessage, h }) =>
    Disclosure.view(
      {
        id: 'disc-basic',
        label: 'Shipping details',
        content: 'Shipped in two days, tracked to your door.',
        ...Disclosure.controls(model, onMessage),
        style,
      },
      h,
    ),
})
