import { Bundles, Recipes, ThinkingSteps, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Each tool call's input and output under its own row, which a press shows
// and hides: `multiple` is the Bundle's arg, so any number are open.
export default example({
  title: 'Tool calls',
  slots: ThinkingStepsSlots,
  recipe: Recipes.ThinkingSteps,
  pins: { variant: 'card' },
  state: Bundles.ThinkingSteps.with({ openSteps: ['weather'], multiple: true }),
  view: ({ style, model, onMessage, h }) => {
    const call = (input: string, output: string) =>
      h.pre(
        [h.Style({ margin: '0', whiteSpace: 'pre-wrap', fontSize: '0.8125rem' })],
        [`→ ${input}`, h.br([]), `← ${output}`],
      )
    return h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        ThinkingSteps.view(
          {
            id: 'steps-tools',
            summary: 'Used 2 tools',
            steps: [
              {
                id: 'weather',
                title: 'get_weather',
                state: 'done',
                duration: 640,
                detail: call('{ "city": "Lisbon" }', '{ "high": 24, "sky": "clear" }'),
              },
              {
                id: 'calendar',
                title: 'list_events',
                state: 'done',
                duration: 1200,
                detail: call('{ "day": "Saturday" }', '2 events'),
                steps: [
                  { id: 'calendar-work', title: 'Work calendar', state: 'done', duration: 500 },
                  { id: 'calendar-home', title: 'Home calendar', state: 'done', duration: 700 },
                ],
              },
            ],
            ...ThinkingSteps.controls(model, onMessage),
            style,
          },
          h,
        ),
      ],
    )
  },
})
