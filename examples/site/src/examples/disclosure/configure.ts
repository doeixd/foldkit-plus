import { Bundles, Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Card = Recipes.Disclosure.style({ variant: 'bordered' })

// What every disclosure of an application starts from: its look, said once.
// A preset is a named set over it, chosen at a use.
const AppDisclosure = Disclosure.configure({
  base: { style: Card },
  presets: { preview: { peek: '2em' } },
})

export default example({
  title: 'Configure once',
  slots: DisclosureSlots,
  recipe: Recipes.Disclosure,
  state: Bundles.Disclosure.with({}),
  view: ({ model, onMessage, h }) =>
    AppDisclosure.view(
      {
        id: 'disc-configure',
        preset: 'preview',
        label: 'Terms of the offer',
        content: 'The offer ends on the last day of the month and cannot be combined with another.',
        ...Disclosure.controls(model, onMessage),
      },
      h,
    ),
})
