import { Recipes, Separator, SeparatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Pinned: `Recipes.Separator({ line: 'dashed', thickness: 'thick', spacing: 'md' })`.
// Dashed and thick, with room above and below, above a receipt's total.
export default example({
  title: 'Dashed',
  slots: SeparatorSlots,
  recipe: Recipes.Separator,
  pins: { line: 'dashed', thickness: 'thick', spacing: 'md' },
  view: ({ style, h }) => {
    const line = (label: string, amount: string) =>
      h.div(
        [h.Style({ display: 'flex', justifyContent: 'space-between' })],
        [h.span([], [label]), h.span([], [amount])],
      )
    return h.div(
      [h.Style({ inlineSize: 'min(100%, 16rem)' })],
      [
        line('Subtotal', '$40.00'),
        line('Shipping', '$5.00'),
        Separator.view({ style }, h),
        line('Total', '$45.00'),
      ],
    )
  },
})
