import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// The same options draw a ring: the arc is the value, shown inside it, and a
// value not known yet turns a quarter arc.
export default example({
  title: 'A ring with its value',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  pins: { shape: 'ring', size: 'lg' },
  view: ({ style, h }) =>
    row(h, [
      Progress.view(
        { id: 'done', label: 'Done', value: Option.some(72), showValue: true, style },
        h,
      ),
      Progress.view({ id: 'waiting', label: 'Waiting', value: Option.none(), style }, h),
    ]),
})
