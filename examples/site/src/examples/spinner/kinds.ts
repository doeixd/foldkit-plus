import { Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Kinds = (['ring', 'dots', 'bars', 'pulse', 'orbit'] as const).map(kind =>
  forSlots(SpinnerSlots)(Recipes.Spinner({ kind })),
)

// Five ways to say "still working", each still under reduced motion.
export default example({
  title: 'Kinds',
  slots: SpinnerSlots,
  recipe: Recipes.Spinner,
  pins: { kind: 'ring' },
  view: ({ h }) =>
    row(
      h,
      Kinds.map(style => Spinner.view({ label: 'Loading', style }, h)),
    ),
})
