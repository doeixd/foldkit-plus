import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column, GroupStyle, person } from '../../snippets/chat.js'

const Model = Schema.Struct({ liked: Schema.Boolean })
const Message = defineMessageUnion({ Copied: {}, Liked: {} })

// A question and its answer. What an action sends is the application's: copy
// would run a clipboard Command, and a toggle such as "Good answer" is
// `pressed` from the Model.
export default example({
  title: 'Basic',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  state: {
    Model,
    Message,
    init: () => ({ model: { liked: false } }),
    update: (model, message) =>
      Message.match(message, {
        Copied: () => ({ model }),
        Liked: () => ({ model: { liked: !model.liked } }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    column(h, [
      ChatMessage.group(
        {
          items: [
            {
              key: 'question',
              from: 'user',
              content: 'Which sizes does the ladder have?',
              time: { at: '2026-10-17T09:30', label: '9:30' },
            },
            {
              key: 'answer',
              from: 'assistant',
              author: 'Ada',
              avatar: person(h, 'Ada Lovelace', 210),
              content: 'Two ends, 36px and 28px, with the step knob between them.',
              actions: [
                { key: 'copy', label: 'Copy', onClick: onMessage(Message.Copied()) },
                {
                  key: 'like',
                  label: 'Good answer',
                  onClick: onMessage(Message.Liked()),
                  pressed: model.liked,
                },
              ],
              pinActions: true,
            },
          ],
          style: GroupStyle,
          messageStyle: style,
        },
        h,
      ),
    ]),
})
