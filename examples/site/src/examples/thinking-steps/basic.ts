import { Bundles, Recipes, ThinkingSteps, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Shut once done, saying how long it took; a press opens it. Whether it is
// open is the Bundle's Model: none follows the work, and a press keeps what
// the reader asked for.
export default example({
  title: 'Done',
  slots: ThinkingStepsSlots,
  recipe: Recipes.ThinkingSteps,
  state: Bundles.ThinkingSteps.with({}),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        ThinkingSteps.view(
          {
            id: 'steps-basic',
            steps: [
              { id: 'plan', title: 'Planned the answer', state: 'done', duration: 900 },
              {
                id: 'search',
                title: 'Searched the web',
                state: 'done',
                duration: 2300,
                detail: 'Found four sources on tide tables.',
              },
              { id: 'read', title: 'Read the sources', state: 'done', duration: 1100 },
            ],
            ...ThinkingSteps.controls(model, onMessage),
            style,
          },
          h,
        ),
      ],
    ),
})
