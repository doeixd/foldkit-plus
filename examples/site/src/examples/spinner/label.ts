import { Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The label shown beside the wheel is the status's words.
export default example({
  title: 'A label',
  slots: SpinnerSlots,
  recipe: Recipes.Spinner,
  view: ({ style, h }) => Spinner.view({ label: 'Saving your changes', showLabel: true, style }, h),
})
