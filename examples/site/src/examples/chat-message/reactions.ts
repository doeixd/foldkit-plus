import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column, GroupStyle, person } from '../../snippets/chat.js'

const Model = Schema.Struct({ up: Schema.Boolean })
const Message = defineMessageUnion({ ToggledUp: {} })

// Reactions sit under the bubble. One with an `onClick` is a toggle button (its
// count is the application's to change); one without is only shown.
export default example({
  title: 'Reactions',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  state: {
    Model,
    Message,
    init: () => ({ model: { up: false } }),
    update: (model, message) =>
      Message.match(message, { ToggledUp: () => ({ model: { up: !model.up } }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    column(h, [
      ChatMessage.group(
        {
          items: [
            {
              key: 'plan',
              from: 'assistant',
              author: 'Grace',
              avatar: person(h, 'Grace Hopper', 20),
              content: 'The release is cut and the notes are up.',
              reactions: [
                {
                  key: 'up',
                  mark: '👍',
                  label: 'Thumbs up',
                  count: model.up ? 4 : 3,
                  pressed: model.up,
                  onClick: onMessage(Message.ToggledUp()),
                },
                { key: 'party', mark: '🎉', label: 'Party', count: 2 },
              ],
            },
          ],
          style: GroupStyle,
          messageStyle: style,
        },
        h,
      ),
    ]),
})
