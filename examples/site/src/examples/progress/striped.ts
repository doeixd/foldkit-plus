import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `stripes: 'moving'` is a recipe value, so this page pins it; the bands
// hold still under reduced motion.
export default example({
  title: 'Striped and moving',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  pins: { shape: 'bar', stripes: 'moving', size: 'lg' },
  view: ({ style, h }) =>
    Progress.view(
      { id: 'sync', label: 'Syncing', value: Option.some(55), showValue: true, style },
      h,
    ),
})
