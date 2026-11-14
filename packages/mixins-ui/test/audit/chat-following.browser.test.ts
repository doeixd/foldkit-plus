/**
 * Audit of #558 item 5 for bottom-following chat, on the shipped
 * MessageScroller: the end stays in view while the reader follows and a
 * message above it grows, or the frame that holds the log changes height.
 * The shipped tests cover arrival, streaming, jumping and prepending.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ChatMessageGroupSlots, ChatMessageSlots, group } from '../../src/chatMessage.js'
import * as MessageScroller from '../../src/messageScroller.js'
import { MessageScrollerSlots } from '../../src/messageScroller.js'
import { ChatMessage, ChatMessageGroup } from '../../src/recipes/chatMessage.js'
import { MessageScroller as ScrollerRecipe } from '../../src/recipes/messageScroller.js'
import { ScrollArea as AreaRecipe } from '../../src/recipes/scrollArea.js'
import { overlayBars, ScrollAreaSlots } from '../../src/scrollArea.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const scrollerStyle = Style.forSlots(MessageScrollerSlots)(ScrollerRecipe({}))
const areaStyle = Style.forSlots(ScrollAreaSlots)(AreaRecipe({}))
const messageStyle = Style.forSlots(ChatMessageSlots)(ChatMessage({}))
const groupStyle = Style.forSlots(ChatMessageGroupSlots)(ChatMessageGroup({}))

const Model = Schema.Struct({ scroller: MessageScroller.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Got: { message: MessageScroller.Message } })
type Message = typeof Message.Type
type Return = Update.Return<Model, Message>

const entries = Array.from({ length: 30 }, (_, at) => ({
  key: String(at),
  from: at % 3 === 0 ? ('user' as const) : ('assistant' as const),
  text: `Message ${at}, long enough to take a line or two in a narrow column.`,
}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    scrollerStyle.css +
    areaStyle.css +
    messageStyle.css +
    groupStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'chat-audit'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { scroller: MessageScroller.init({ id: 'chat' }) } }),
      update: (model: Model, message: Message): Return => {
        const next = MessageScroller.update(model.scroller, message.message)
        return {
          model:
            next.model === model.scroller
              ? model
              : modifyFields(model, { scroller: () => next.model }),
          commands: Command.mapMessages(next.commands ?? [], inner =>
            Message.Got({ message: inner }),
          ),
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Id('frame'), h.Style({ width: '320px', height: '300px' })],
          [
            MessageScroller.view(
              {
                model: model.scroller,
                label: 'Conversation',
                content: [
                  group(
                    {
                      items: entries.map(({ key, from, text }) => ({
                        key,
                        from,
                        content: h.p([h.Id(`m-${key}`)], [text]),
                      })),
                      style: groupStyle,
                      messageStyle,
                    },
                    h,
                  ),
                ],
                onMessage: message => Message.Got({ message }),
                style: scrollerStyle,
                areaStyle,
                areaMixins: overlayBars,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`)
  return found
}
const viewport = () => {
  const scroller = element('#chat-log').parentElement
  if (scroller === null) throw new Error('no viewport')
  return scroller
}
const fromEnd = () => {
  const scroller = viewport()
  return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
}
const settle = () => new Promise(resolve => setTimeout(resolve, 300))

test('a message above the end growing while the reader follows keeps the end in view', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    // An image loading, or a code block opening, in a message that is not the last.
    element('#m-10').style.paddingBottom = '200px'
    await settle()
    expect(fromEnd()).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})

test('the frame shrinking while the reader follows (a keyboard opening) keeps the end in view', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    element('#frame').style.height = '120px'
    await settle()
    expect(fromEnd()).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})
