/**
 * Chat messages on a real runtime over the reset and the shipped palette:
 * an answer that grows a word at a time never moves a word off a line it
 * already sat on, which the reset's `text-wrap: pretty` does; the user's
 * message stands at the end and an answer at the start, mirrored right to
 * left; the actions appear under the pointer without moving anything; and a
 * continued message sits closer to the one before than a new sender's.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ChatMessageGroupSlots, ChatMessageSlots, group } from '../src/chatMessage.js'
import { ChatMessage, ChatMessageGroup } from '../src/recipes/chatMessage.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const style = Style.forSlots(ChatMessageSlots)(ChatMessage({}))
const groupStyle = Style.forSlots(ChatMessageGroupSlots)(ChatMessageGroup({}))

const Message = defineMessageUnion({ Grew: {}, Acted: {} })
type Message = typeof Message.Type
const Model = Schema.Struct({ words: Schema.Number })
type Model = typeof Model.Type

// Words of unlike lengths, so a balancing wrap has reason to move one.
const WORDS =
  'a streamed answer arrives word by word and each one must land after the last without moving any word that a reader already saw on an earlier line of this reply so the eye can keep its place'.split(
    ' ',
  )

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`)
  return found
}

const mount = (words: number, dir: 'ltr' | 'rtl' = 'ltr') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css +
    groupStyle.css
  document.head.append(sheet)
  const away = document.createElement('div')
  away.id = 'away'
  away.style.cssText = 'height: 60px'
  document.body.appendChild(away)
  const container = document.createElement('div')
  container.id = 'chat-message-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { words } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Grew: () => ({ model: { words: model.words + 1 } }),
          Acted: () => ({ model }),
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Id('frame'), h.Dir(dir), h.Style({ width: '320px' })],
          [
            h.button([h.Id('grow'), h.Type('button'), h.OnClick(Message.Grew())], ['Grow']),
            group(
              {
                items: [
                  { key: 'q', from: 'user', author: 'Me', content: h.p([], ['Explain it']) },
                  {
                    key: 'q2',
                    from: 'user',
                    author: 'Me',
                    content: h.p([], ['Briefly']),
                    status: 'failed',
                    onRetry: Message.Acted(),
                  },
                  {
                    key: 'a',
                    from: 'assistant',
                    author: 'Ada',
                    streaming: true,
                    content: h.p([h.Id('answer')], [WORDS.slice(0, model.words).join(' ')]),
                    actions: [{ key: 'copy', label: 'Copy', onClick: Message.Acted() }],
                  },
                ],
                style: groupStyle,
                messageStyle: style,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

/** The words of the answer by the line they sit on, from the top. */
const lines = (): ReadonlyArray<string> => {
  const paragraph = element('#answer')
  const text = paragraph.firstChild
  if (text === null) return []
  const words = (text.textContent ?? '').split(' ')
  const range = document.createRange()
  const byTop = new Map<number, Array<string>>()
  let offset = 0
  for (const word of words) {
    range.setStart(text, offset)
    range.setEnd(text, offset + word.length)
    const top = Math.round(range.getBoundingClientRect().top)
    byTop.set(top, [...(byTop.get(top) ?? []), word])
    offset += word.length + 1
  }
  return [...byTop.entries()].sort(([a], [b]) => a - b).map(([, line]) => line.join(' '))
}

test('an answer growing a word at a time keeps every word on the line it sat on', async () => {
  const handle = mount(8)
  try {
    await vi.waitFor(() => element('#answer'))
    for (let words = 9; words <= WORDS.length; words++) {
      const before = lines()
      element('#grow').click()
      await vi.waitFor(() => expect(element('#answer').textContent?.split(' ')).toHaveLength(words))
      const after = lines()
      // Every full line before stays as it was; only the last may gain words.
      expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, -1))
      expect(after[before.length - 1]?.startsWith(before.at(-1) ?? '')).toBe(true)
    }
    expect(lines().length).toBeGreaterThan(3)
  } finally {
    handle.dispose()
  }
})

const box = (selector: string) => element(selector).getBoundingClientRect()

test('the user’s message stands at the end, an answer at the start, mirrored right to left', async () => {
  for (const dir of ['ltr', 'rtl'] as const) {
    const handle = mount(12, dir)
    try {
      await vi.waitFor(() => element('#answer'))
      const frame = box('#frame')
      const mine = box('[data-from="user"] p')
      const answer = box('#answer')
      if (dir === 'ltr') {
        expect(frame.right - mine.right).toBeLessThan(16)
        expect(mine.left - frame.left).toBeGreaterThan(100)
        expect(answer.left - frame.left).toBeLessThan(1)
      } else {
        expect(mine.left - frame.left).toBeLessThan(16)
        expect(frame.right - mine.right).toBeGreaterThan(100)
        expect(frame.right - answer.right).toBeLessThan(1)
      }
    } finally {
      handle.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(each => each.remove())
      document.body.replaceChildren()
    }
  }
})

test('the actions appear under the pointer, and nothing moves when they do', async () => {
  const handle = mount(12)
  try {
    await vi.waitFor(() => element('[aria-label="Copy"]'))
    await userEvent.hover(element('#away'))
    const actions = element('[aria-label="Message actions"]')
    const footer = actions.parentElement
    if (footer === null) throw new Error('no footer')
    await vi.waitFor(() => expect(getComputedStyle(actions).opacity).toBe('0'))
    const height = footer.getBoundingClientRect().height
    await userEvent.hover(element('#answer'))
    await vi.waitFor(() => expect(getComputedStyle(actions).opacity).toBe('1'))
    expect(footer.getBoundingClientRect().height).toBe(height)
  } finally {
    handle.dispose()
  }
})

test('a continued message sits closer to the one before than a new sender’s', async () => {
  const handle = mount(4)
  try {
    await vi.waitFor(() => element('#answer'))
    const [first, second, third] = [...document.querySelectorAll('[data-from]')].map(each =>
      each.getBoundingClientRect(),
    )
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('three messages')
    }
    const within = second.top - first.bottom
    const between = third.top - second.bottom
    expect(within).toBeGreaterThanOrEqual(0)
    expect(between).toBeGreaterThan(within + 4)
  } finally {
    handle.dispose()
  }
})

test('a failed message says so in the error ink', async () => {
  const handle = mount(4)
  try {
    await vi.waitFor(() => element('#answer'))
    const probe = document.createElement('span')
    probe.style.color = 'var(--fk-error-ink)'
    document.body.append(probe)
    const status = [...document.querySelectorAll('[data-status="failed"] span')].find(
      each => each.textContent === 'Not sent',
    )
    if (status === undefined) throw new Error('no status')
    expect(getComputedStyle(status).color).toBe(getComputedStyle(probe).color)
    expect(getComputedStyle(status).color).not.toBe(getComputedStyle(element('#answer')).color)
  } finally {
    handle.dispose()
  }
})
