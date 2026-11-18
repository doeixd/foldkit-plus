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
                title: 'Tide, Wikipedia',
                state: 'done',
                href: 'https://en.wikipedia.org/wiki/Tide',
                detail: 'The moon and the sun raise the tides.',
              },
              {
                id: 'moon',
                title: 'Lunar phase, Wikipedia',
                state: 'done',
                href: 'https://en.wikipedia.org/wiki/Lunar_phase',
                detail: 'Spring tides follow a full or new moon.',
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
