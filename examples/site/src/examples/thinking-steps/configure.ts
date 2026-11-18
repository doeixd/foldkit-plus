import { Bundles, Recipes, ThinkingSteps, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Cards = forSlots(ThinkingStepsSlots)(Recipes.ThinkingSteps({ variant: 'card' }))

// What every trace of an application starts from: its look and its words in
// its language. Which steps are open stays the Bundle's.
const AppSteps = ThinkingSteps.configure({
  base: {
    style: Cards,
    words: {
      thinking: 'Denkt nach',
      thoughtFor: 'Nachgedacht, {time}',
      done: 'fertig',
      running: 'läuft',
      pending: 'wartet',
    },
  },
})

export default example({
  title: 'Configure once',
  slots: ThinkingStepsSlots,
  recipe: Recipes.ThinkingSteps,
  state: Bundles.ThinkingSteps.with({}),
  view: ({ model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        AppSteps.view(
          {
            id: 'steps-configure',
            steps: [
              { id: 'a', title: 'Suchen', state: 'done', duration: 1800 },
              { id: 'b', title: 'Lesen', state: 'done', duration: 2400 },
            ],
            ...ThinkingSteps.controls(model, onMessage),
          },
          h,
        ),
      ],
    ),
})
