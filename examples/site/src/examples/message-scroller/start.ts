import {
  Bundles,
  ChatMessage,
  MessageScroller,
  MessageScrollerSlots,
  Recipes,
  ScrollArea,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { GroupStyle } from '../../snippets/chat.js'

const Area = Recipes.ScrollArea.style({})
const Bubble = Recipes.ChatMessage.style({})

const lines = Array.from({ length: 14 }, (_, at) => ({
  key: `line-${at}`,
  from: 'assistant' as const,
  content: `Line ${at + 1} of a transcript the reader opens at the top.`,
}))

// `opens: 'start'` is the Bundle's arg: a transcript is read from its top, so
// nothing is followed until the reader reaches the end, and the jump button
// shows meanwhile.
export default example({
  title: 'Opens at the start',
  slots: MessageScrollerSlots,
  recipe: Recipes.MessageScroller,
  state: Bundles.MessageScroller.with({ id: 'scroller-start', opens: 'start' }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '16rem', inlineSize: 'min(32rem, 100%)' })],
      [
        MessageScroller.view(
          {
            model,
            label: 'Transcript',
            content: [
              ChatMessage.group({ items: lines, style: GroupStyle, messageStyle: Bubble }, h),
            ],
            onMessage,
            style,
            areaStyle: Area,
            areaMixins: ScrollArea.overlayBars,
          },
          h,
        ),
      ],
    ),
})
