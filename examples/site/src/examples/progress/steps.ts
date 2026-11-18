import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The steps done of the steps there are, the track cut into one segment each.
export default example({
  title: 'Steps as progress',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  pins: { shape: 'bar' },
  view: ({ style, h }) =>
    Progress.view(
      {
        id: 'setup',
        label: 'Setting up',
        value: Option.some(2),
        max: 4,
        segments: 4,
        valueText: (value, max) => `Step ${value} of ${max}`,
        showValue: true,
        style,
      },
      h,
    ),
})
