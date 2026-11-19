import { ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column, GroupStyle } from '../../snippets/chat.js'

const Outlined = Recipes.ChatMessage.style({ bubble: 'outline' })

// What every message of an application starts from: its look and its words in
// its language. One use names a preset that changes how the actions show.
const AppChat = ChatMessage.configure({
  base: {
    style: Outlined,
    words: {
      sending: 'Wird gesendet…',
      sent: 'Gesendet',
      failed: 'Nicht gesendet',
      retry: 'Nochmal',
    },
    pinActions: true,
  },
  presets: { quiet: { pinActions: false } },
})

export default example({
  title: 'Configure once',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  view: ({ h }) =>
    column(h, [
      AppChat.group(
        {
          preset: 'quiet',
          items: [
            { key: 'a', from: 'user', content: 'Sind wir bereit?', status: 'sent' },
            { key: 'b', from: 'user', content: 'Und die Notizen?', status: 'sending' },
          ],
          style: GroupStyle,
        },
        h,
      ),
    ]),
})
