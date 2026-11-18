import { Bundles, Recipes, ThinkingSteps, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A step with an `href` is a link, as a citation or a source is: such a step
// is no toggle, so its detail always shows. The rest still open and shut.
export default example({
  title: 'Sources as links',
  slots: ThinkingStepsSlots,
  recipe: Recipes.ThinkingSteps,
  state: Bundles.ThinkingSteps.with({}),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        ThinkingSteps.view(
          {
            id: 'steps-sources',
            summary: 'Read 2 sources',
            steps: [
              {
                id: 'tides',
                title: 'Tide tables, Lisbon',
                state: 'done',
                href: '#tides',
                detail: 'High water at 14:10, 3.4 m.',
              },
              {
                id: 'moon',
                title: 'Lunar calendar',
                state: 'done',
                href: '#moon',
                detail: 'Full moon on Saturday.',
              },
              { id: 'notes', title: 'Cross-checked the two', state: 'done', detail: 'They agree.' },
            ],
            ...ThinkingSteps.controls(model, onMessage),
            style,
          },
          h,
        ),
      ],
    ),
})
