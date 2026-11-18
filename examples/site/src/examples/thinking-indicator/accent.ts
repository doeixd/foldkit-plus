import { Recipes, ThinkingIndicator, ThinkingIndicatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// In the accent's ink: the recipe's `tone` axis, held here.
export default example({
  title: 'Accent',
  slots: ThinkingIndicatorSlots,
  recipe: Recipes.ThinkingIndicator,
  pins: { tone: 'accent' },
  view: ({ style, h }) => ThinkingIndicator.view({ detail: 'Searching the web', style }, h),
})
