import { Bundles, Recipes, ThinkingSteps, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Open while it runs, its summary the running step's title, shimmering. A
// skipped step counts as finished and says so in words.
export default example({
  title: 'Running',
  slots: ThinkingStepsSlots,
  recipe: Recipes.ThinkingSteps,
  state: Bundles.ThinkingSteps.with({}),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        ThinkingSteps.view(
          {
            id: 'steps-running',
            steps: [
              { id: 'search', title: 'Searched the web', state: 'done', duration: 2300 },
              { id: 'fetch', title: 'Fetching tides.example', state: 'failed', duration: 400 },
              { id: 'cache', title: 'Check the cache', state: 'skipped' },
              { id: 'read', title: 'Reading 3 sources', state: 'running' },
              { id: 'write', title: 'Write the answer', state: 'pending' },
            ],
            ...ThinkingSteps.controls(model, onMessage),
            style,
          },
          h,
        ),
      ],
    ),
})
