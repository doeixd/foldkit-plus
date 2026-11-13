/**
 * A checkbox's checked state in the document, from a native input and from
 * the toggle behavior. The slot contract publishing an attribute is not this.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Attr, Behaviors, Capability, Slot, Slots, SlotView } from '../src/index.js'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

const Model = Schema.Struct({ on: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Toggled: {} })
type Message = typeof Message.Type
const Box = Slots.define({
  box: Slot.make({ capability: Capability.Interactive, attributes: [Attr.Role] }),
})
const toggle = Behaviors.ToggleState.behavior(Box)<Model, Message>({
  control: 'box',
  state: model => model.on,
  as: 'checked',
})

const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(Box, [toggle.mixin], { input: model, h })
  return h.div(
    [],
    [
      h.button(builders.box.attrs([h.Id('box'), h.Role('checkbox')]), ['Save']),
      h.input([h.Id('native'), h.Type('checkbox'), h.AriaLabel('Native save')]),
    ],
  )
}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

it('renders aria-checked from the model and toggles a native checkbox', async () => {
  const container = document.createElement('div')
  container.id = 'checkbox-obligation'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { on: true } }),
      update: model => ({ model }),
      view,
      slow: false,
    }),
  ).dispose

  await vi.waitFor(() => expect(document.getElementById('box')).not.toBeNull())
  expect(document.getElementById('box')?.getAttribute('aria-checked')).toBe('true')
  const input = document.querySelector<HTMLInputElement>('#native')
  if (input === null) throw new Error('no native checkbox')
  expect(input.checked).toBe(false)
  await userEvent.click(input)
  expect(input.checked).toBe(true)
})
