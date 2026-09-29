// @vitest-environment jsdom
/**
 * What a read says before it has an answer: Loading is busy, Empty is not,
 * Failure interrupts, and the delayed fade keeps a quick answer from
 * flashing.
 */
import { Schema } from 'effect'
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Empty, Failure, Loading } from '../src/index.js'

const Message = defineMessageUnion({ Ticked: {} })
type Message = typeof Message.Type

const StatusSlots = Slots.define({
  status: Slot.make({ capability: Capability.Base }),
})
type Slots = SlotView.SlotBuilders<typeof StatusSlots, Message>

const Model = Schema.Struct({ text: Schema.String })
type Model = typeof Model.Type

const draw = (
  view: (status: SlotView.SlotBuilder<Message>, h: HtmlBuilder<Message>, text: string) => Html,
  text: string,
) => {
  const View = SlotView.define(StatusSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
    view(slots.status, h, model.text),
  )
  return View({ text }, SlotView.inertBuilder<Message>())
}

const shownSheet = (): string =>
  Style.stylesheet(
    Layers.standard.declare,
    Style.forSlots(StatusSlots)({ status: Loading.shown }, { layer: Layers.standard.layer('app') }),
  )

describe('Loading', () => {
  it('says busy text as a status marked busy', () => {
    const paragraph = draw(Loading.view, 'Loading…')
    expect(Inert.value(paragraph, 'role')).toBe('status')
    expect(Inert.value(paragraph, 'aria-busy')).toBe('true')
    expect(Inert.children(paragraph)[0]?.text).toBe('Loading…')
  })

  it('shows busy text only once the wait is noticeable', () => {
    const sheet = shownSheet()
    expect(sheet).toContain('[aria-busy="true"]')
    expect(sheet).toContain('0.6s')
    expect(sheet).toContain('both')
    expect(sheet).toContain('@keyframes')
    expect(sheet).toContain('opacity')
  })
})

describe('Empty', () => {
  it('says missing text as a status never marked busy', () => {
    const paragraph = draw(Empty.view, 'Nothing yet.')
    expect(Inert.value(paragraph, 'role')).toBe('status')
    expect(Inert.value(paragraph, 'aria-busy')).toBeUndefined()
    expect(Inert.children(paragraph)[0]?.text).toBe('Nothing yet.')
  })
})

describe('Failure', () => {
  it('says failed text as an alert', () => {
    const paragraph = draw(Failure.view, 'The pages could not be read.')
    expect(Inert.value(paragraph, 'role')).toBe('alert')
    expect(Inert.value(paragraph, 'aria-busy')).toBeUndefined()
    expect(Inert.children(paragraph)[0]?.text).toBe('The pages could not be read.')
  })
})
