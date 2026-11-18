import { Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A spinner says work is ongoing where a bar would mislead about progress.
// With a label it is a polite status; without one it is hidden from assistive
// technology.
export default example({
  title: 'Basic',
  slots: SpinnerSlots,
  recipe: Recipes.Spinner,
  view: ({ style, h }) => Spinner.view({ label: 'Saving', style }, h),
})
