import { ChatMessage, ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { column, GroupStyle } from '../../snippets/chat.js'

// The user's bubble is a recipe axis: muted, accent, outline or ghost. The
// markup does not change; pick another in the panel.
export default example({
  title: 'Bubble looks',
  slots: ChatMessageSlots,
  recipe: Recipes.ChatMessage,
  pins: { bubble: 'outline' },
  view: ({ style, h }) =>
    column(h, [
      ChatMessage.group(
        {
          items: [
            { key: 'q', from: 'user', content: 'Summarise the week in one line.' },
            {
              key: 'a',
              from: 'assistant',
              author: 'Ada',
              content: 'Two releases, one incident, no regrets.',
            },
          ],
          style: GroupStyle,
          messageStyle: style,
        },
        h,
      ),
    ]),
})
