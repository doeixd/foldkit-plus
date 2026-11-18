import { ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column, GroupStyle, person } from '../../snippets/chat.js'

// A channel: everyone at the start beside their picture, and a sender's next
// messages continued under the first.
export default example({
  title: 'A thread',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  pins: { layout: 'thread' },
  view: ({ style, h }) =>
    column(h, [
      ChatMessage.group(
        {
          items: [
            {
              key: 'deploy',
              from: 'assistant',
              author: 'Grace',
              avatar: person(h, 'Grace Hopper', 20),
              content: 'Deploy is green.',
              time: { at: '2026-10-17T10:02', label: '10:02' },
            },
            {
              key: 'noon',
              from: 'assistant',
              author: 'Grace',
              avatar: person(h, 'Grace Hopper', 20),
              content: 'Shipping at noon.',
            },
            {
              key: 'thanks',
              from: 'user',
              author: 'Me',
              avatar: person(h, 'Me', 140),
              content: 'Great, thanks.',
            },
          ],
          style: GroupStyle,
          messageStyle: style,
        },
        h,
      ),
    ]),
})
