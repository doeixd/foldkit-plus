import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The look and the words every stepper of the application starts from, and a
// named preset over them. A use gives only what differs.
const Wizard = Recipes.Steps.style({ connector: 'segments', size: 'sm' })

const AppSteps = Steps.configure({
  base: { style: Wizard, words: { complete: 'Done', upcoming: 'Not yet' } },
  presets: { failing: { words: { error: 'Stopped' } } },
})

export default example({
  title: 'Configure once',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  view: ({ h }) =>
    AppSteps.view(
      {
        label: 'Import',
        steps: [{ title: 'Read' }, { title: 'Check', state: 'error' }, { title: 'Save' }],
        current: 1,
        preset: 'failing',
      },
      h,
    ),
})
