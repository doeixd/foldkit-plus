import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, ButtonSlots, ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column } from '../../snippets/chat.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({}))

const ANSWER =
  'The ladder has two ends, 36 pixels and 28, and the step knob moves every control between them at once, so a region set compact shrinks its buttons, fields and rows together.'.split(
    ' ',
  )

const Model = Schema.Struct({ shown: Schema.Number })
const Message = defineMessageUnion({ More: {} })

// The same message drawn again as each word arrives: its body wraps greedily,
// so the words already shown stay on their lines, and it is aria-busy until
// the answer is whole. Here a press brings the next words; in an application,
// a stream does.
export default example({
  title: 'Streaming',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  state: {
    Model,
    Message,
    init: () => ({ model: { shown: 6 } }),
    update: (model, message) =>
      Message.match(message, {
        More: () => ({
          model: {
            shown: model.shown >= ANSWER.length ? 3 : Math.min(model.shown + 4, ANSWER.length),
          },
        }),
      }),
  },
  view: ({ style, model, onMessage, h }) => {
    const done = model.shown >= ANSWER.length
    return column(h, [
      ChatMessage.view(
        {
          from: 'assistant',
          author: 'Ada',
          content: h.p([], [ANSWER.slice(0, model.shown).join(' ')]),
          streaming: !done,
          style,
        },
        h,
      ),
      Button.view(
        {
          label: done ? 'Start over' : 'Next words',
          onClick: onMessage(Message.More()),
          style: Action,
        },
        h,
      ),
    ])
  },
})
