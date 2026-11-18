import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A step may state its own state over the one `current` gives it: a later
// step already complete, the one being taken `loading`, one that `error`ed.
// Each says so in words a screen reader reads; `words` changes them.
export default example({
  title: 'Loading and failed',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Deploy',
        steps: [
          { title: 'Build' },
          { title: 'Test', state: 'error', description: 'Two specs failed' },
          { title: 'Release', state: 'loading' },
          { title: 'Announce' },
        ],
        current: 2,
        words: { loading: 'Running', error: 'Needs attention' },
        style,
      },
      h,
    ),
})
