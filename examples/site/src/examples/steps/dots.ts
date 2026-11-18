import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Dots for a light stepper; `size` sets a numbered marker on the Avatar's sizes.
export default example({
  title: 'Dots',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  pins: { marker: 'dot' },
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Onboarding',
        steps: [{ title: 'Profile' }, { title: 'Team' }, { title: 'Billing' }, { title: 'Launch' }],
        current: 2,
        style,
      },
      h,
    ),
})
