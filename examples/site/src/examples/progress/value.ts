import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

// `showValue` draws the value beside the label: the percentage, or the
// `valueText` when there is one.
export default example({
  title: 'With its value',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  view: ({ style, h }) =>
    stack(h, [
      Progress.view(
        { id: 'copy', label: 'Copying files', value: Option.some(64), showValue: true, style },
        h,
      ),
      Progress.view(
        {
          id: 'upload',
          label: 'Uploading',
          value: Option.some(120),
          max: 200,
          valueText: (value, max) => `${value} of ${max} MB`,
          showValue: true,
          style,
        },
        h,
      ),
    ]),
})
