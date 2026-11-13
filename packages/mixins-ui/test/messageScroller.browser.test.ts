/**
 * A message scroller on a real runtime, inside a ScrollArea with its
 * overlay bars: it opens at the newest message and stays there as messages
 * arrive and an answer streams in; scrolled up, it stays put as messages
 * arrive and its jump button counts them; the jump scrolls back to the end,
 * where the button goes and the focus it held passes to the scrolling area;
 * and older messages loaded above leave the message the reader looks at
 * where it was.
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
import { userEvent } from 'vitest/browser'
import { ChatMessageGroupSlots, ChatMessageSlots, group } from '../src/chatMessage.js'
import * as MessageScroller from '../src/messageScroller.js'
import { MessageScrollerSlots } from '../src/messageScroller.js'
import { ChatMessage, ChatMessageGroup } from '../src/recipes/chatMessage.js'
import { MessageScroller as ScrollerRecipe } from '../src/recipes/messageScroller.js'
import { ScrollArea as AreaRecipe } from '../src/recipes/scrollArea.js'
import { overlayBars, ScrollAreaSlots } from '../src/scrollArea.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const scrollerStyle = Style.forSlots(MessageScrollerSlots)(ScrollerRecipe({}))
const areaStyle = Style.forSlots(ScrollAreaSlots)(AreaRecipe({}))
const messageStyle = Style.forSlots(ChatMessageSlots)(ChatMessage({}))
const groupStyle = Style.forSlots(ChatMessageGroupSlots)(ChatMessageGroup({}))

const Entry = Schema.Struct({
  key: Schema.String,
  from: Schema.Literals(['user', 'assistant']),
  text: Schema.String,
})
const Model = Schema.Struct({
  scroller: MessageScroller.Model,
  entries: Schema.Array(Entry),
  older: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Appended: {},
  Prepended: {},
  Streamed: {},
  Got: { message: MessageScroller.Message },
})
type Message = typeof Message.Type

const entry = (key: string, from: 'user' | 'assistant' = 'assistant') => ({
  key,
  from,
  text: `Message ${key}, long enough to take a line or two in a narrow column.`,
})

type Return = Update.Return<Model, Message>

const scrolled = (model: Model, message: MessageScroller.Message): Return => {
  const next = MessageScroller.update(model.scroller, message)
  return {
    model:
      next.model === model.scroller ? model : modifyFields(model, { scroller: () => next.model }),
    commands: Command.mapMessages(next.commands ?? [], inner => Message.Got({ message: inner })),
  }
}

const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    Appended: () =>
      scrolled(
        modifyFields(model, {
          entries: () => [...model.entries, entry(`n${model.entries.length}`)],
        }),
        MessageScroller.Message.Appended({ count: 1 }),
      ),
    // A page of older messages, which the application does not count as new.
    Prepended: () => ({
      model: modifyFields(model, {
        older: () => model.older + 5,
        entries: () => [
          ...Array.from({ length: 5 }, (_, at) =>
            entry(`o${model.older + at}`, at % 2 === 0 ? 'user' : 'assistant'),
          ),
          ...model.entries,
        ],
      }),
    }),
    Streamed: () => {
      const last = model.entries.at(-1)
      if (last === undefined) return { model }
      return {
        model: modifyFields(model, {
          entries: () => [
            ...model.entries.slice(0, -1),
            {
              ...last,
              text: `${last.text} And more words, which run on past the end of the line.`,
            },
          ],
        }),
      }
    },
    Got: ({ message: inner }) => scrolled(model, inner),
  })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`)
  return found
}

const button = (name: string) => element(`#${name}`)

const mount = (count: number) => {
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
  container.id = 'message-scroller-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          scroller: MessageScroller.init({ id: 'chat' }),
          entries: Array.from({ length: count }, (_, at) =>
            entry(String(at), at % 3 === 0 ? 'user' : 'assistant'),
          ),
          older: 0,
        },
      }),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            ...(['Appended', 'Prepended', 'Streamed'] as const).map(name =>
              h.button([h.Id(name), h.Type('button'), h.OnClick(Message[name]())], [name]),
            ),
            h.div(
              [h.Id('frame'), h.Style({ width: '320px', height: '300px' })],
              [
                MessageScroller.view(
                  {
                    model: model.scroller,
                    label: 'Conversation with Ada',
                    content: [
                      group(
                        {
                          items: model.entries.map(({ key, from, text }) => ({
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
          ],
        ),
    }),
  )
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
const jump = () => document.querySelector('#chat-jump')

test('it opens at the newest message and follows what arrives and streams in', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => element('#m-29'))
    const scroller = viewport()
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight * 3)
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    for (let turn = 0; turn < 3; turn++) {
      button('Appended').click()
      await vi.waitFor(() => element(`#m-n${30 + turn}`))
      await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    }
    for (let turn = 0; turn < 6; turn++) {
      const height = scroller.scrollHeight
      button('Streamed').click()
      await vi.waitFor(() => expect(scroller.scrollHeight).toBeGreaterThan(height))
      await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    }
    expect(jump()).toBeNull()
  } finally {
    handle.dispose()
  }
})

test('scrolled up, it stays put as messages arrive, and the jump counts them', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const scroller = viewport()
    scroller.scrollTo({ top: scroller.scrollTop - 400, behavior: 'instant' })
    await vi.waitFor(() => expect(jump()).not.toBeNull())
    const top = scroller.scrollTop
    button('Appended').click()
    button('Appended').click()
    await vi.waitFor(() =>
      expect(jump()?.getAttribute('aria-label')).toBe('Jump to latest, 2 new messages'),
    )
    await vi.waitFor(() => element('#m-n31'))
    expect(scroller.scrollTop).toBe(top)
    expect(fromEnd()).toBeGreaterThan(300)
  } finally {
    handle.dispose()
  }
})

test('the jump scrolls to the end, and its focus passes to the scrolling area', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const scroller = viewport()
    scroller.scrollTo({ top: 0, behavior: 'instant' })
    await vi.waitFor(() => expect(jump()).not.toBeNull())
    button('Appended').click()
    await vi.waitFor(() => expect(jump()?.textContent).toBe('1'))
    const pressed = element('#chat-jump')
    const area = scroller.getBoundingClientRect()
    const place = pressed.getBoundingClientRect()
    // Over the area's bottom, in its middle.
    expect(area.bottom - place.bottom).toBeGreaterThan(0)
    expect(area.bottom - place.bottom).toBeLessThan(24)
    expect(Math.abs(place.left + place.width / 2 - (area.left + area.width / 2))).toBeLessThan(1)
    await userEvent.click(pressed)
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    await vi.waitFor(() => expect(jump()).toBeNull())
    expect(document.activeElement).toBe(scroller)
  } finally {
    handle.dispose()
  }
})

test('older messages loaded above leave the message in view where it was', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const scroller = viewport()
    scroller.scrollTo({ top: 600, behavior: 'instant' })
    await vi.waitFor(() => expect(jump()).not.toBeNull())
    // The messages' entrance moves them by a transform until it ends, which a reader's eye does not follow.
    // Transitions only: the area's scroll fade is a scroll-driven animation, which never ends.
    await vi.waitFor(() =>
      expect(document.getAnimations().filter(each => each instanceof CSSTransition)).toEqual([]),
    )
    const watched = [...document.querySelectorAll('#chat-log p')].find(
      paragraph =>
        paragraph.getBoundingClientRect().top > scroller.getBoundingClientRect().top + 20,
    )
    if (watched === undefined) throw new Error('nothing in view')
    const before = watched.getBoundingClientRect().top
    const height = scroller.scrollHeight
    button('Prepended').click()
    await vi.waitFor(() => element('#m-o0'))
    expect(scroller.scrollHeight).toBeGreaterThan(height + 100)
    await vi.waitFor(() =>
      expect(Math.abs(watched.getBoundingClientRect().top - before)).toBeLessThan(1),
    )
    // Still where it was a frame later: nothing else moves it.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(Math.abs(watched.getBoundingClientRect().top - before)).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})

test('an upward wheel stops following before the scroll, so a message in between stays below', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const scroller = viewport()
    const top = scroller.scrollTop
    scroller.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -80, bubbles: true, cancelable: true }),
    )
    button('Appended').click()
    await vi.waitFor(() => expect(jump()).not.toBeNull())
    expect(Math.abs(scroller.scrollTop - top)).toBeLessThan(1)
    expect(fromEnd()).toBeGreaterThan(16)
  } finally {
    handle.dispose()
  }
})

test('ArrowUp stops following before the scroll, and ArrowDown does not', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const scroller = viewport()
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    button('Appended').click()
    await vi.waitFor(() => element('#m-n30'))
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    expect(jump()).toBeNull()
    const top = scroller.scrollTop
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    button('Appended').click()
    await vi.waitFor(() => expect(jump()).not.toBeNull())
    expect(Math.abs(scroller.scrollTop - top)).toBeLessThan(1)
    expect(fromEnd()).toBeGreaterThan(16)
  } finally {
    handle.dispose()
  }
})

/** Leaving attempts that scroll nothing: following must go on, so a message still lands in view. */
const ignored: ReadonlyArray<readonly [string, (scroller: HTMLElement) => void]> = [
  [
    'a Ctrl wheel',
    scroller =>
      scroller.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -80, ctrlKey: true, bubbles: true, cancelable: true }),
      ),
  ],
  [
    'a wheel over a nested element that scrolls up itself',
    scroller => {
      const inner = document.createElement('div')
      inner.style.cssText = 'height: 40px; overflow-y: auto'
      const tall = document.createElement('div')
      tall.style.height = '200px'
      inner.append(tall)
      element('#m-29').append(inner)
      inner.scrollTop = 50
      inner.dispatchEvent(new WheelEvent('wheel', { deltaY: -80, bubbles: true, cancelable: true }))
      expect(scroller.contains(inner)).toBe(true)
    },
  ],
  ...(['ctrlKey', 'metaKey', 'altKey'] as const).map(
    (modifier): readonly [string, (scroller: HTMLElement) => void] => [
      `ArrowUp with ${modifier}`,
      scroller =>
        scroller.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowUp', [modifier]: true, bubbles: true }),
        ),
    ],
  ),
  [
    'a key a child handler prevented',
    scroller => {
      const child = element('#m-29')
      child.addEventListener('keydown', event => event.preventDefault(), { once: true })
      child.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      )
      expect(scroller.contains(child)).toBe(true)
    },
  ],
  ...(['input', 'textarea', 'select'] as const).map(
    (tag): readonly [string, (scroller: HTMLElement) => void] => [
      `ArrowUp typed into a ${tag}`,
      () => {
        const field = document.createElement(tag)
        element('#m-29').append(field)
        field.focus({ preventScroll: true })
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      },
    ],
  ),
  [
    'Home typed into an editable element',
    () => {
      const editable = document.createElement('div')
      editable.contentEditable = 'true'
      editable.textContent = 'draft'
      element('#m-29').append(editable)
      editable.focus({ preventScroll: true })
      editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    },
  ],
]

test.each(ignored)('%s does not stop following', async (_name, leave) => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    leave(viewport())
    button('Appended').click()
    await vi.waitFor(() => element('#m-n30'))
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    expect(jump()).toBeNull()
  } finally {
    handle.dispose()
  }
})

// A nested element that cannot take the wheel up leaves it to the log, which then does scroll.
test.each([
  ['a nested scroller already at its top', 'overflow-y: auto', 0],
  ['a nested element that scrolls only by script', 'overflow-y: hidden', 50],
])('a wheel over %s stops following', async (_name, overflow, scrollTop) => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const inner = document.createElement('div')
    inner.style.cssText = `height: 40px; ${overflow}`
    const tall = document.createElement('div')
    tall.style.height = '200px'
    inner.append(tall)
    element('#m-29').append(inner)
    inner.scrollTop = scrollTop
    inner.dispatchEvent(new WheelEvent('wheel', { deltaY: -80, bubbles: true, cancelable: true }))
    button('Appended').click()
    await vi.waitFor(() => expect(jump()).not.toBeNull())
  } finally {
    handle.dispose()
  }
})

test('a shorter viewport stays at the end while following', async () => {
  const handle = mount(30)
  try {
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    const scroller = viewport()
    const before = scroller.clientHeight
    element('#frame').style.height = '140px'
    await vi.waitFor(() => expect(scroller.clientHeight).toBeLessThan(before - 40))
    await vi.waitFor(() => expect(fromEnd()).toBeLessThan(1))
    expect(jump()).toBeNull()
  } finally {
    handle.dispose()
  }
})
