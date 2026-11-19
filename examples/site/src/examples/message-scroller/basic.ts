import { Match, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import {
  Bundles,
  Button,
  ChatMessage,
  MessageScroller,
  MessageScrollerSlots,
  Recipes,
  ScrollArea,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { GroupStyle } from '../../snippets/chat.js'
import { row } from '../../snippets/layout.js'

const Area = Recipes.ScrollArea.style({})
const Bubble = Recipes.ChatMessage.style({})
const Action = Recipes.Button.style({})
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

const Entry = Schema.Struct({
  id: Schema.String,
  from: Schema.Literals(['user', 'assistant']),
  text: Schema.String,
})
type Entry = typeof Entry.Type

const first: ReadonlyArray<Entry> = [
  'What is a recipe?',
  'Pieces of style for each slot of a component, picked by its axes.',
  'And a slot?',
  'A named part of the component, which a style or a Mixin reaches.',
  'Can I change one?',
  'Extend the recipe, or add a rule in your app layer.',
  'Which layer wins?',
  'The app layer, after components and variants.',
].map((text, at) => ({ id: `chat-${at}`, from: at % 2 === 0 ? 'user' : 'assistant', text }))

// Whether the scroller follows the end is the Bundle's Model. The application
// sends it `Appended` when a message lands at the end, and nothing when older
// ones load above: it holds the reader's place and counts nothing.
const App = Bundle.compose({
  entries: Schema.Array(Entry),
  sent: Schema.Number,
  loaded: Schema.Number,
}).pipe(
  Bundle.withMessages({ Sent: {}, LoadedOlder: {} }),
  Bundle.withChild('chat', Bundles.MessageScroller, { args: { id: 'scroller-basic' } }),
)

export default example({
  title: 'Follows the end',
  slots: MessageScrollerSlots,
  recipe: Recipes.MessageScroller,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { entries: first, sent: 0, loaded: 0 },
    update: App.placements.update((model, message) =>
      Match.value(message).pipe(
        Match.tagsExhaustive({
          Sent: () => {
            const sent = model.sent + 1
            return {
              model: modifyFields(model, {
                sent: () => sent,
                entries: entries => [
                  ...entries,
                  { id: `sent-${sent}`, from: 'user', text: `Message ${sent}` },
                  { id: `reply-${sent}`, from: 'assistant', text: `Reply ${sent}` },
                ],
                chat: chat =>
                  MessageScroller.update(chat, MessageScroller.Message.Appended({ count: 2 }))
                    .model,
              }),
            }
          },
          LoadedOlder: () => {
            const loaded = model.loaded + 1
            const older = Array.from({ length: 4 }, (_, at): Entry => ({
              id: `older-${loaded}-${at}`,
              from: at % 2 === 0 ? 'user' : 'assistant',
              text: `An older message, ${loaded}.${at + 1}`,
            }))
            return {
              model: modifyFields(model, {
                loaded: () => loaded,
                entries: entries => [...older, ...entries],
              }),
            }
          },
        }),
      ),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(32rem, 100%)' })],
      [
        h.div(
          [h.Style({ blockSize: '20rem' })],
          [
            MessageScroller.view(
              {
                model: model.chat,
                label: 'Conversation with Ada',
                content: [
                  ChatMessage.group(
                    {
                      items: model.entries.map(({ id, from, text }) => ({
                        key: id,
                        from,
                        content: text,
                      })),
                      style: GroupStyle,
                      messageStyle: Bubble,
                    },
                    h,
                  ),
                ],
                onMessage: message => onMessage(App.Message.GotChatMessage({ message })),
                style,
                areaStyle: Area,
                areaMixins: ScrollArea.overlayBars,
              },
              h,
            ),
          ],
        ),
        row(h, [
          Button.view({ label: 'Send', onClick: onMessage(App.Message.Sent()), style: Action }, h),
          Button.view(
            { label: 'Load older', onClick: onMessage(App.Message.LoadedOlder()), style: Quiet },
            h,
          ),
        ]),
      ],
    ),
})
