import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// A value and a `max` make a bar that fills; `Option.none()` is a bar that
// does not know yet, which says "busy" to a screen reader and slides to the
// eye. `valueText` is what is announced beside the percentage.
export default example({
  title: 'Basic',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  view: ({ style, h }) =>
    row(h, [
      Progress.view(
        {
          id: 'upload',
          label: 'Uploading',
          value: Option.some(120),
          max: 200,
          valueText: (value, max) => `${value} of ${max} MB`,
          style,
        },
        h,
      ),
      Progress.view({ id: 'prepare', label: 'Preparing', value: Option.none(), style }, h),
    ]),
})
