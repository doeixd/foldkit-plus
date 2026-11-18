import { Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Sizes = (['sm', 'md', 'lg'] as const).map(size =>
  forSlots(SpinnerSlots)(Recipes.Spinner({ size, tone: 'current' })),
)

// Three sizes in the ink of the text around them, as inside a button or a badge.
export default example({
  title: 'Sizes',
  slots: SpinnerSlots,
  recipe: Recipes.Spinner,
  pins: { size: 'md', tone: 'current' },
  view: ({ h }) =>
    row(
      h,
      Sizes.map(style => Spinner.view({ label: 'Loading', style }, h)),
    ),
})
