import { Button, Empty, EmptySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Action = Recipes.Button.style({})

// No results: say what was looked for, and offer the way out.
export default example({
  title: 'No results',
  slots: EmptySlots,
  recipe: Recipes.Empty,
  view: ({ style, h }) =>
    Empty.view(
      {
        icon: outline(h, 'M7 12.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM11 11l3.5 3.5'),
        title: 'No results for “invoices 2019”',
        description: 'Check the spelling, or search every folder.',
        action: Button.view({ label: 'Search everywhere', style: Action }, h),
        style,
      },
      h,
    ),
})
