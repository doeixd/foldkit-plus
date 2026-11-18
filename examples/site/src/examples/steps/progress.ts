import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The connector is the Progress bar's track: full after each step done and,
// after the current one, filled by `progress`, how far it has gone.
export default example({
  title: 'A progress connector',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  pins: { connector: 'progress' },
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Upload',
        steps: [{ title: 'Choose' }, { title: 'Upload' }, { title: 'Process' }, { title: 'Done' }],
        current: 1,
        progress: 0.6,
        style,
      },
      h,
    ),
})
