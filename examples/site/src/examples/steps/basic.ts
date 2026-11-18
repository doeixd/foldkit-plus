import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `current` is the application's: the steps before it are complete, the ones
// after it upcoming, and the list marks the current one `aria-current`.
export default example({
  title: 'Basic',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Checkout',
        steps: [
          { title: 'Account', description: 'Your details' },
          { title: 'Plan', description: 'Pick a tier' },
          { title: 'Payment', description: 'Card or invoice' },
          { title: 'Review' },
        ],
        current: 2,
        style,
      },
      h,
    ),
})
