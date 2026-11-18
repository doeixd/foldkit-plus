import {
  Bundles,
  ChatMessage,
  ChatMessageSlots,
  MessageScroller,
  MessageScrollerSlots,
  Recipes,
  ScrollArea,
  ScrollAreaSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { GroupStyle } from '../../snippets/chat.js'
import { forSlots } from '../../snippets/theme.js'

const Area = forSlots(ScrollAreaSlots)(Recipes.ScrollArea({}))
const Bubble = forSlots(ChatMessageSlots)(Recipes.ChatMessage({}))

// What every conversation of an application starts from: the scroll area it
// sits in and its words. The Model and the content stay each use's.
const AppScroller = MessageScroller.configure({
  base: {
    areaStyle: Area,
    areaMixins: ScrollArea.overlayBars,
    words: { jump: 'Zum Ende', one: '{count} neue Nachricht', other: '{count} neue Nachrichten' },
  },
})

export default example({
  title: 'Configure once',
  slots: MessageScrollerSlots,
  recipe: Recipes.MessageScroller,
  state: Bundles.MessageScroller.with({ id: 'scroller-configure', opens: 'start' }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '14rem', inlineSize: 'min(32rem, 100%)' })],
      [
        AppScroller.view(
          {
            model,
            label: 'Unterhaltung',
            content: [
              ChatMessage.group(
                {
                  items: Array.from({ length: 12 }, (_, at) => ({
                    key: `m-${at}`,
                    from: 'assistant' as const,
                    content: `Nachricht ${at + 1}`,
                  })),
                  style: GroupStyle,
                  messageStyle: Bubble,
                },
                h,
              ),
            ],
            onMessage,
            style,
          },
          h,
        ),
      ],
    ),
})
