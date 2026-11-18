import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column, GroupStyle } from '../../snippets/chat.js'

const Model = Schema.Struct({ retried: Schema.Boolean })
const Message = defineMessageUnion({ Retried: {} })

// A message the server refused offers a retry; one still on its way says so.
// `words` renames the status and the button for the application's language.
export default example({
  title: 'Status and retry',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
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
    column(h, [
      ChatMessage.group(
        {
          items: [
            { key: 'sent', from: 'user', content: 'Book the room for Friday.', status: 'sent' },
            model.retried
              ? { key: 'failed', from: 'user', content: 'And invite Grace.', status: 'sent' }
              : {
                  key: 'failed',
                  from: 'user',
                  content: 'And invite Grace.',
                  status: 'failed',
                  onRetry: onMessage(Message.Retried()),
                  words: { failed: 'Not delivered', retry: 'Send again' },
                },
            { key: 'sending', from: 'user', content: 'Thanks!', status: 'sending' },
          ],
          style: GroupStyle,
          messageStyle: style,
        },
        h,
      ),
    ]),
})
