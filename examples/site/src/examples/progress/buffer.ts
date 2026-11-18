import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// What has loaded ahead of what has played: `buffer` draws a fainter fill
// under the value.
export default example({
  title: 'Buffered',
  slots: ProgressSlots,
  recipe: Recipes.Progress,
  pins: { shape: 'bar' },
  view: ({ style, h }) =>
    Progress.view(
      {
        id: 'video',
        label: 'Played',
        value: Option.some(35),
        buffer: 70,
        valueText: '1:45 of 5:00, loaded to 3:30',
        style,
      },
      h,
    ),
})
