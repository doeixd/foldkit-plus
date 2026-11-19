import { Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

const Tones = (['accent', 'neutral', 'info', 'success', 'warning', 'danger'] as const).map(tone =>
  Recipes.Spinner.style({ tone }),
)

// The status tones say which kind of work is under way: a retry, a deploy,
// something that may fail.
export default example({
  title: 'Tones',
  slots: SpinnerSlots,
  recipe: Recipes.Spinner,
  pins: { tone: 'accent' },
  view: ({ h }) =>
    row(
      h,
      Tones.map(style => Spinner.view({ label: 'Working', style }, h)),
    ),
})
