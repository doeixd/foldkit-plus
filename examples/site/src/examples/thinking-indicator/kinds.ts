import { Recipes, ThinkingIndicator, ThinkingIndicatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const kinds = [
  { mark: 'dots', label: 'shimmer' },
  { mark: 'pulse', label: 'plain' },
  { mark: 'none', label: 'shimmer' },
  { mark: 'dots', label: 'hidden' },
] as const

const styles = kinds.map(selection => Recipes.ThinkingIndicator.style(selection))

// Dots or a pulse beside the words, the words alone, or the dots alone with
// the words said, not shown. Each holds still under reduced motion.
export default example({
  title: 'Kinds',
  slots: ThinkingIndicatorSlots,
  recipe: Recipes.ThinkingIndicator,
  view: ({ h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '1rem', justifyItems: 'start' })],
      styles.map(style => ThinkingIndicator.view({ label: 'Thinking', style }, h)),
    ),
})
