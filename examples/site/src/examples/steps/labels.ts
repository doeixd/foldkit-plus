import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `labels: 'current'` keeps the words of the step under way beside its
// marker and leaves the rest to a screen reader; `'hidden'` leaves them all.
export default example({
  title: 'Only the current label',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  pins: { labels: 'current', marker: 'dot' },
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Onboarding',
        steps: [{ title: 'Profile' }, { title: 'Team' }, { title: 'Billing' }, { title: 'Launch' }],
        current: 1,
        style,
      },
      h,
    ),
})
