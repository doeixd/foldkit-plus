import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column } from '../../snippets/chat.js'

const Reply = Recipes.Button.style({ size: 'sm' })

const Model = Schema.Struct({ chosen: Schema.String })
const Message = defineMessageUnion({ Chose: { reply: Schema.String } })

// Anything is `content`: quick replies are Buttons in the body, and the
// actions row would still sit under them.
export default example({
  title: 'Quick replies',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  state: {
    Model,
    Message,
    init: () => ({ model: { chosen: '' } }),
    update: (_, message) =>
      Message.match(message, { Chose: ({ reply }) => ({ model: { chosen: reply } }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    column(h, [
      ChatMessage.view(
        {
          from: 'assistant',
          author: 'Ada',
          content: h.div(
            [h.Style({ display: 'grid', gap: '0.5rem' })],
            [
              h.p(
                [],
                [
                  model.chosen === ''
                    ? 'When should I schedule it?'
                    : `Scheduled for ${model.chosen}.`,
                ],
              ),
              ...(model.chosen === ''
                ? [
                    h.div(
                      [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' })],
                      ['Tonight', 'Tomorrow', 'Next week'].map(reply =>
                        Button.view(
                          {
                            label: reply,
                            onClick: onMessage(Message.Chose({ reply })),
                            style: Reply,
                          },
                          h,
                        ),
                      ),
                    ),
                  ]
                : []),
            ],
          ),
          style,
        },
        h,
      ),
    ]),
})
