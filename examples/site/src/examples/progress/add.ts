import { Style } from 'foldkit-mixins'
import { Option } from 'effect'
import { Progress, ProgressSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The shipped sizes stop at `lg`. `add` gives the recipe one more: the track
// reads its thickness from the custom property the sizes set.
const Progresses = Recipes.Progress.add({
  size: { xl: { root: Style.self({ '--_fk-progress-thick': '1.25rem' }) } },
})

export default example({
  title: 'A size of your own',
  slots: ProgressSlots,
  recipe: Progresses,
  pins: { shape: 'bar', size: 'xl' },
  view: ({ style, h }) =>
    Progress.view(
      { id: 'import', label: 'Importing', value: Option.some(35), showValue: true, style },
      h,
    ),
})
