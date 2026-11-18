import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, ButtonSlots, Recipes, ThinkingSteps, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Again = forSlots(ButtonSlots)(Recipes.Button({ size: 'sm', variant: 'outline' }))

const Model = Schema.Struct({ retried: Schema.Boolean })
const Message = defineMessageUnion({ Retried: {} })

// `trigger: 'none'` draws the steps alone, a list that does not shut. A
// step's `trailing` stands beside its row, outside its button: here the
// action that retries the one that failed.
export default example({
  title: 'A flat list with an action',
  slots: ThinkingStepsSlots,
  recipe: Recipes.ThinkingSteps,
  state: {
    Model,
    Message,
    init: () => ({ model: { retried: false } }),
    update: (model, message) =>
      Message.match(message, {
        Retried: () => (model.retried ? { model } : { model: { retried: true } }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(28rem, 100%)' })],
      [
        ThinkingSteps.view(
          {
            id: 'steps-flat',
            trigger: 'none',
            open: Option.none(),
            onToggle: () => onMessage(Message.Retried()),
            words: { steps: 'Build steps' },
            steps: [
              { id: 'install', title: 'Install', state: 'done', duration: 4200 },
              model.retried
                ? { id: 'test', title: 'Test', state: 'running' }
                : {
                    id: 'test',
                    title: 'Test',
                    state: 'failed',
                    duration: 9100,
                    trailing: Button.view(
                      { label: 'Retry', onClick: onMessage(Message.Retried()), style: Again },
                      h,
                    ),
                  },
              { id: 'publish', title: 'Publish', state: 'skipped' },
            ],
            style,
          },
          h,
        ),
      ],
    ),
})
