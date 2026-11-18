import { Recipes, ThinkingIndicator, ThinkingIndicatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A polite status: three dots and shimmering words, and what it is doing.
export default example({
  title: 'Basic',
  slots: ThinkingIndicatorSlots,
  recipe: Recipes.ThinkingIndicator,
  view: ({ style, h }) => ThinkingIndicator.view({ detail: 'Searching the web', style }, h),
})
