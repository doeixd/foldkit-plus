/// <reference types="@vitest/browser-playwright" />
/**
 * A held Repeat on a button that disables itself at its bound, in a real
 * browser with a real pointer and real keys. The release comes after the
 * button went `aria-disabled`; it must still end the hold, or every later press
 * is ignored. Leaving the button with the pointer down ends the hold too.
 */
import { Effect, Match, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Capability, Slot, SlotView, Slots, Behavior } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Repeat } from '../src/interaction/index.js'

const BOUND = 4
const Hold = Bundle.declare(Repeat.bundle, 'hold')
const Model = Schema.Struct({ ...Hold.fields, value: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Hold.cases, Reset: {} })
type Message = typeof Message.Type

const StopRepeat = Command.define('StopRepeat', {
  messages: [Repeat.Message.Stopped],
  execute: Effect.succeed(Repeat.Message.Stopped()),
})
const Parent = Bundle.parent({ Model, Message })
const placed = Parent.at(Hold, {
  args: { delayMs: 40, intervalMs: 20 },
  onOut: (out: Repeat.Out, { liftCommand }: Update.FoldContext<Repeat.Message, Message>) =>
    Match.valueTags(out, {
      Stepped: () => (model: Model) => {
        const value = Math.min(BOUND, model.value + 1)
        return {
          model: { ...model, value },
          commands: value === BOUND ? [liftCommand(StopRepeat())] : [],
        }
      },
      Ended: () => (model: Model) => ({ model }),
    }),
})
const assembly = Parent.assemble(placed)

const Slotted = Slots.define({ button: Slot.make({ capability: Capability.Interactive }) })
const View = SlotView.over(Slotted)<Model, Message>()
const Holds = Repeat.behavior(Hold)(View)({
  target: 'button',
  // Disabled while holding, which is the case under test.
  disabled: model => model.value >= BOUND,
})
const draw = View.define((model, slots, h) =>
  h.div(
    [],
    [
      h.button(slots.button.attrs([h.Id('more'), h.Type('button')]), ['more']),
      h.button([h.Id('reset'), h.Type('button'), h.OnClick(Message.Reset())], ['reset']),
      h.output([h.Id('value')], [String(model.value)]),
    ],
  ),
).pipe(Behavior.attach(Holds))

let handle: { dispose: () => void } | undefined
afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const boot = async () => {
  const container = document.createElement('div')
  container.id = 'host'
  document.body.append(container)
  handle = Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => assembly.initial({ value: 0 }),
        update: assembly.update(model => ({ model: { ...model, value: 0 } })),
        view: (model: Model, h: HtmlBuilder<Message>) => draw(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
  await expect.poll(() => document.getElementById('more')).not.toBeNull()
}

const el = (id: string) => document.getElementById(id)!
const value = () => Number(el('value').textContent)
const centre = (id: string) => {
  const box = el(id).getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, button: 'left' as const }
}
const mouse = (
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
  at: ReturnType<typeof centre>,
) => cdp().send('Input.dispatchMouseEvent', { type, clickCount: 1, ...at })
const reenable = async () => {
  await userEvent.click(el('reset'))
  await vi.waitFor(() => expect(value()).toBe(0))
  await vi.waitFor(() => expect(el('more').hasAttribute('aria-disabled')).toBe(false))
}

it('a pointer released after the button disabled itself ends the hold, so the next press works', async () => {
  await boot()
  const at = centre('more')
  await mouse('mouseMoved', at)
  await mouse('mousePressed', at)
  await vi.waitFor(() => expect(el('more').getAttribute('aria-disabled')).toBe('true'))
  expect(value()).toBe(BOUND)
  await mouse('mouseReleased', at)
  await vi.waitFor(() => expect(el('more').hasAttribute('data-holding')).toBe(false))
  await reenable()
  await mouse('mousePressed', at)
  await vi.waitFor(() => expect(value()).toBeGreaterThan(0))
  await mouse('mouseReleased', at)
})

it.each(['Enter', 'Space'])(
  '%s released after the button disabled itself ends the hold',
  async key => {
    await boot()
    el('more').focus()
    await userEvent.keyboard(`{${key}>}`)
    await vi.waitFor(() => expect(el('more').getAttribute('aria-disabled')).toBe('true'))
    await userEvent.keyboard(`{/${key}}`)
    await vi.waitFor(() => expect(el('more').hasAttribute('data-holding')).toBe(false))
    await reenable()
    el('more').focus()
    await userEvent.keyboard(`{${key}}`)
    await vi.waitFor(() => expect(value()).toBeGreaterThan(0))
  },
)
