import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A list of sections in place of one value: each part takes its tone, and
// the bar draws them end to end.
export default example({
  title: 'Stacked',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  pins: { shape: 'bar' },
  view: ({ style, h }) =>
    Progress.view(
      {
        id: 'storage',
        label: 'Storage',
        value: [
          { label: 'Photos', value: 38, tone: 'accent' },
          { label: 'Mail', value: 21, tone: 'success' },
          { label: 'Backups', value: 14, tone: 'warning' },
        ],
        showValue: true,
        style,
      },
      h,
    ),
})
