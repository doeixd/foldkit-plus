import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  Button,
  ButtonSlots,
  ChatMessage,
  ChatMessageSlots,
  Recipes,
  ThinkingIndicator,
  ThinkingIndicatorSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column } from '../../snippets/chat.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({}))
const Dots = forSlots(ThinkingIndicatorSlots)(Recipes.ThinkingIndicator({}))

const Stage = Schema.Literals(['thinking', 'typing', 'settled'])
const Model = Schema.Struct({ stage: Stage })
const Message = defineMessageUnion({ Advanced: {} })

const next = (stage: typeof Stage.Type): typeof Stage.Type =>
  stage === 'thinking' ? 'typing' : stage === 'typing' ? 'settled' : 'thinking'

// One row from thinking to typing to settled: the indicator is the content
// while the assistant works, the words replace it as they stream, and
// `streaming` keeps the row `aria-busy` until they are whole.
export default example({
  title: 'Thinking, typing, settled',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  state: {
    Model,
    Message,
    init: () => ({ model: { stage: 'thinking' } }),
    update: (model, message) =>
      Message.match(message, { Advanced: () => ({ model: { stage: next(model.stage) } }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    column(h, [
      ChatMessage.view(
        {
          from: 'assistant',
          author: 'Ada',
          streaming: model.stage !== 'settled',
          content:
            model.stage === 'thinking'
              ? ThinkingIndicator.view({ detail: 'Reading the release notes', style: Dots }, h)
              : h.p(
                  [],
                  [
                    model.stage === 'typing'
                      ? 'Version 0.41 changes the default look and adds'
                      : 'Version 0.41 changes the default look and adds a Bundle and a configure to every stateful widget.',
                  ],
                ),
          style,
        },
        h,
      ),
      Button.view(
        { label: 'Next stage', onClick: onMessage(Message.Advanced()), style: Action },
        h,
      ),
    ]),
})
