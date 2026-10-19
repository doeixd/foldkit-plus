/**
 * ChatMessage as markup: the regions a message earns, its sender and state
 * on the root for a style, a failed message's retry, actions that each send
 * their own Message and are named, a streaming message kept busy, a run that
 * draws a sender's following messages as continued, and a recipe whose body
 * wraps without re-balancing earlier lines.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import {
  ChatMessageGroupSlots,
  ChatMessageSlots,
  group,
  view as drawMessage,
  type ChatMessageItem,
  type ChatMessageView,
} from '../src/chatMessage.js'
import { ChatMessage, ChatMessageGroup } from '../src/recipes/chatMessage.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const style = Style.forSlots(ChatMessageSlots)(ChatMessage({}))
/** Drawn through `Inert.draw`, which alone marks the Slots that `bySlot` reads. */
const marked = (draw: (h: HtmlBuilder<TestMessage>) => Html) =>
  Inert.draw(
    SlotView.forMessages<TestMessage>().define(ChatMessageSlots, (_: undefined, __, h) => draw(h)),
    undefined,
  )
const view = (
  options: Omit<ChatMessageView<TestMessage>, 'content'> & { readonly text?: string },
) => marked(h => drawMessage({ style, content: options.text ?? 'Hello', ...options }, h))
const slot = Inert.bySlot

describe('ChatMessage view', () => {
  it('draws the author, the time for the machine and the reader, and the content', () => {
    const tree = view({
      from: 'assistant',
      author: 'Ada',
      time: { at: '2026-10-17T09:30', label: '9:30' },
      text: 'Here is the plan.',
    })
    expect(Inert.text(tree)).toBe('Ada9:30Here is the plan.')
    const [time] = Inert.byTag(tree, 'time')
    expect(Inert.value(time, 'datetime')).toBe('2026-10-17T09:30')
    expect(Inert.value(tree, 'data-from')).toBe('assistant')
  })

  it('draws no header, footer or picture it has nothing for', () => {
    const tree = view({ from: 'user' })
    expect(Inert.text(tree)).toBe('Hello')
    expect(Inert.children(tree)).toHaveLength(1)
    expect(Inert.byTag(tree, 'button')).toEqual([])
  })

  it('draws every element in a Slot', () => {
    const Drawn = SlotView.forMessages<TestMessage>().define(
      ChatMessageSlots,
      (_: undefined, __, h) =>
        drawMessage(
          {
            from: 'user',
            author: 'Me',
            avatar: h.span([], ['M']),
            time: { at: '2026-10-17T09:30', label: '9:30' },
            content: 'Hi',
            status: 'failed',
            onRetry: message('Other'),
            actions: [{ key: 'copy', label: 'Copy', onClick: message('Clicked') }],
          },
          h,
        ),
    )
    expect(Inert.unslotted(Inert.draw(Drawn, undefined), { inside: ['avatar'] })).toEqual([])
  })

  it('says where a sent message stands, in its own words when given', () => {
    expect(Inert.text(slot(view({ from: 'user', status: 'sending' }), 'status')[0])).toBe(
      'Sending…',
    )
    const failed = view({ from: 'user', status: 'failed', statusLabel: 'Could not send' })
    expect(Inert.text(slot(failed, 'status')[0])).toBe('Could not send')
    expect(Inert.value(failed, 'data-status')).toBe('failed')
  })

  it('offers a retry beside a failed message only', () => {
    const failed = (h: HtmlBuilder<TestMessage>) =>
      drawMessage({ from: 'user', content: 'Hi', status: 'failed', onRetry: message('Other') }, h)
    sends(
      failed,
      Scene.click(Scene.role('button', { name: 'Retry' })),
      Scene.expectOutMessage(message('Other')),
    )
    const sending = view({ from: 'user', status: 'sending', onRetry: message('Other') })
    expect(Inert.byTag(sending, 'button')).toEqual([])
  })

  it('names each action and sends its own Message, a disabled one nothing', () => {
    const tree = (h: HtmlBuilder<TestMessage>) =>
      drawMessage(
        {
          from: 'assistant',
          content: 'Answer',
          actions: [
            { key: 'copy', label: 'Copy', icon: h.span([], ['⧉']), onClick: message('Clicked') },
            { key: 'again', label: 'Regenerate', onClick: message('Other') },
            { key: 'good', label: 'Good answer', onClick: message('Other'), pressed: true },
            { key: 'edit', label: 'Edit', onClick: message('Other'), disabled: true },
          ],
        },
        h,
      )
    sends(
      tree,
      Scene.click(Scene.role('button', { name: 'Copy' })),
      Scene.expectOutMessage(message('Clicked')),
      Scene.click(Scene.role('button', { name: 'Regenerate' })),
      Scene.expectOutMessage(message('Other')),
    )
    const drawn = marked(tree)
    const [actions] = slot(drawn, 'actions')
    expect(Inert.value(actions, 'role')).toBe('group')
    expect(Inert.value(actions, 'aria-label')).toBe('Message actions')
    const buttons = slot(drawn, 'action')
    expect(buttons.map(button => button.key)).toEqual(['copy', 'again', 'good', 'edit'])
    expect(Inert.text(buttons[0])).toBe('⧉')
    expect(Inert.value(buttons[2], 'aria-pressed')).toBe('true')
    expect(Inert.value(buttons[3], 'aria-disabled')).toBe('true')
    expect(buttons[0]?.data?.on?.['click']).toBeDefined()
    expect(buttons[3]?.data?.on?.['click']).toBeUndefined()
  })

  it('keeps a streaming message busy, so a log reads it once whole', () => {
    expect(Inert.value(view({ from: 'assistant', streaming: true }), 'aria-busy')).toBe('true')
    expect(Inert.value(view({ from: 'assistant' }), 'aria-busy')).toBeUndefined()
  })

  it('pins the actions only when asked', () => {
    const actions = [{ key: 'copy', label: 'Copy', onClick: message('Clicked') }]
    const pinned = view({ from: 'assistant', actions, pinActions: true })
    expect(Inert.value(slot(pinned, 'actions')[0], 'data-pinned')).toBe('true')
    expect(
      Inert.value(slot(view({ from: 'assistant', actions }), 'actions')[0], 'data-pinned'),
    ).toBe('false')
  })
})

describe('ChatMessage group', () => {
  const items: ReadonlyArray<ChatMessageItem<TestMessage>> = [
    { key: 'a', from: 'user', author: 'Me', avatar: h.span([], ['M']), content: 'One' },
    { key: 'b', from: 'user', author: 'Me', avatar: h.span([], ['M']), content: 'Two' },
    { key: 'c', from: 'assistant', author: 'Ada', avatar: h.span([], ['A']), content: 'Three' },
    { key: 'd', from: 'assistant', author: 'Grace', avatar: h.span([], ['G']), content: 'Four' },
  ]
  const run = (
    more: {
      readonly continues?: (
        a: ChatMessageItem<TestMessage>,
        b: ChatMessageItem<TestMessage>,
      ) => boolean
    } = {},
  ) =>
    group(
      {
        items,
        style: Style.forSlots(ChatMessageGroupSlots)(ChatMessageGroup({})),
        messageStyle: style,
        ...more,
      },
      h,
    )

  it('keys each message and continues a sender only after themselves', () => {
    const messages = Inert.children(run())
    expect(messages.map(each => each.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(messages.map(each => Inert.value(each, 'data-continued'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
    // A continued message keeps its picture's room, empty.
    expect(Inert.text(messages[1])).toBe('MeTwo')
    expect(Inert.text(messages[0])).toBe('MMeOne')
  })

  it('asks `continues` in place of the same sender', () => {
    const messages = Inert.children(run({ continues: () => true }))
    expect(messages.map(each => Inert.value(each, 'data-continued'))).toEqual([
      'false',
      'true',
      'true',
      'true',
    ])
  })
})

describe('ChatMessage recipe', () => {
  const css = (selection: Parameters<typeof ChatMessage>[0]): string =>
    Style.forSlots(ChatMessageSlots)(ChatMessage(selection)).css

  it('wraps the body greedily, over the reset’s pretty paragraphs', () => {
    const sheet = css({})
    expect(sheet).toMatch(/:where\(p, li[^{]*\{[^}]*text-wrap:wrap/)
  })

  it('sets the user at the end in a bubble only in the chat layout', () => {
    expect(css({})).toContain('flex-direction:row-reverse')
    expect(css({ layout: 'thread' })).not.toContain('flex-direction:row-reverse')
    expect(css({ bubble: 'accent' })).toContain('var(--fk-accent-on-fill)')
  })

  it('spaces a Markdown body as prose, and keeps a plain one’s line breaks', () => {
    expect(css({ content: 'markdown' })).toContain('--fk-prose-paragraph')
    expect(css({})).toContain('white-space:pre-wrap')
    expect(css({ content: 'markdown' })).not.toContain('white-space:pre-wrap')
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.standard(Theme.make({ accent: { hue: 260, chroma: 0.15, lightness: 55 } }))
    const tree = view({
      from: 'user',
      author: 'Me',
      status: 'failed',
      onRetry: message('Other'),
      actions: [{ key: 'copy', label: 'Copy', onClick: message('Clicked') }],
    })
    expect(Inert.missingTokens(tree, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})
