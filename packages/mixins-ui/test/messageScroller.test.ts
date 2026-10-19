/**
 * MessageScroller as a Model and markup: it follows until the reader
 * leaves the end, counts what arrives only while they are away, clears the
 * count once the end is back in view, asks for the scroll on a jump, and
 * returns the Model it was given when nothing changes; the log is named and
 * the jump button drawn only away from the end, named with the count.
 */
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import {
  FollowEnd,
  Message,
  MessageScrollerSlots,
  ScrollToEnd,
  init,
  update,
  view,
  type Model,
  type MessageScrollerView,
} from '../src/messageScroller.js'
import { MessageScroller } from '../src/recipes/messageScroller.js'

const Sent = defineMessageUnion({ Got: { message: Message } })
type Sent = typeof Sent.Type
const got = (message: Message): Sent => Sent.Got({ message })
const h = SlotView.inertBuilder<Sent>()

const style = Style.forSlots(MessageScrollerSlots)(MessageScroller({}))
const start = init({ id: 'chat' })
const away = update(start, Message.LeftEnd()).model

const fold = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

describe('MessageScroller update', () => {
  it('follows from the start, and stops when the reader leaves the end', () => {
    expect(start.following).toBe(true)
    expect(away.following).toBe(false)
  })

  it('counts what arrives only while away, and clears it back at the end', () => {
    expect(update(start, Message.Appended({ count: 2 })).model).toBe(start)
    const counted = fold(away, Message.Appended({ count: 2 }), Message.Appended({ count: 1 }))
    expect(counted.unseen).toBe(3)
    const back = update(counted, Message.ReachedEnd()).model
    expect(back.following).toBe(true)
    expect(back.unseen).toBe(0)
  })

  it('asks for the scroll on a jump and changes nothing until the end is reached', () => {
    const counted = fold(away, Message.Appended({ count: 1 }))
    const jumped = update(counted, Message.Jumped())
    expect(jumped.model).toBe(counted)
    expect((jumped.commands ?? []).map(command => [command.name, command.args])).toEqual([
      [ScrollToEnd.name, { id: 'chat' }],
    ])
  })

  it('returns the Model it was given when nothing changes', () => {
    expect(update(start, Message.ReachedEnd()).model).toBe(start)
    expect(update(away, Message.LeftEnd()).model).toBe(away)
    expect(update(away, Message.Appended({ count: 0 })).model).toBe(away)
    expect(update(away, Message.CompletedScrollToEnd()).model).toBe(away)
  })
})

const options = (model: Model): MessageScrollerView<Sent> => ({
  model,
  label: 'Conversation with Ada',
  content: [h.p([], ['Hello'])],
  onMessage: got,
  style,
})

describe('MessageScroller view', () => {
  it('names the log, holding the messages, inside a scrolling area', () => {
    const tree = view(options(start), h)
    const [log] = Inert.byRole(tree, 'log')
    expect(Inert.value(log, 'aria-label')).toBe('Conversation with Ada')
    expect(Inert.value(log, 'id')).toBe('chat-log')
    expect(Inert.text(log)).toBe('Hello')
  })

  it('draws the jump button only away from the end, named with the count', () => {
    expect(Inert.byTag(view(options(start), h), 'button')).toEqual([])
    const [plain] = Inert.byTag(view(options(away), h), 'button')
    expect(Inert.value(plain, 'aria-label')).toBe('Jump to latest')
    expect(Inert.text(plain)).toBe('')
    const counted = fold(away, Message.Appended({ count: 3 }))
    const [button] = Inert.byTag(view(options(counted), h), 'button')
    expect(Inert.value(button, 'aria-label')).toBe('Jump to latest, 3 new messages')
    expect(Inert.text(button)).toBe('3')
    const one = fold(away, Message.Appended({ count: 1 }))
    const [single] = Inert.byTag(
      view({ ...options(one), jumpLabel: 'Latest', unseenLabel: count => `${count} neu` }, h),
      'button',
    )
    expect(Inert.value(single, 'aria-label')).toBe('Latest, 1 neu')
  })

  it('sends Jumped when the button is pressed', () => {
    Scene.scene(
      {
        update: (model: Model, sent: Sent) => ({ model, outMessage: sent }),
        view: (model: Model, h) => view({ ...options(model), onMessage: got }, h),
      },
      Scene.given(away),
      Scene.Mount.resolve(FollowEnd, Message.ReachedEnd()),
      Scene.click(Scene.role('button', { name: 'Jump to latest' })),
      Scene.expectOutMessage(got(Message.Jumped())),
    )
  })

  it('draws every element in a Slot', () => {
    const Drawn = SlotView.forMessages<Sent>().define(MessageScrollerSlots, (_: undefined, __, h) =>
      view({ ...options(fold(away, Message.Appended({ count: 2 }))), content: [] }, h),
    )
    expect(Inert.unslotted(Inert.draw(Drawn, undefined))).toEqual([])
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.standard(Theme.make({ accent: { hue: 260, chroma: 0.15, lightness: 55 } }))
    const tree = view(options(fold(away, Message.Appended({ count: 2 }))), h)
    expect(Inert.css([tree]).length).toBeGreaterThan(0)
    expect(Inert.missingTokens(tree, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})
