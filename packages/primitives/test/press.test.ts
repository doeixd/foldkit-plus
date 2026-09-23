// @vitest-environment jsdom
/**
 * Press: the placed transitions (primary button only, one pointer at a time,
 * cancel, keyboard without repeat, virtual clicks, the ghost-click window
 * and its timer on TestClock), the events Mount (facts, Space prevented,
 * aria-disabled silence, teardown), and the Behavior's attributes.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Press } from '../src/interaction/index.js'
import { takeMessages } from './support.js'

const Button = Bundle.declare(Press.bundle, 'button')
const Model = Schema.Struct({ ...Button.fields, presses: Schema.Array(Press.PointerType) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Button.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const onOut: (out: Press.Pressed) => (model: Model) => { readonly model: Model } =
  out => model => ({ model: { ...model, presses: [...model.presses, out.pointerType] } })
const placed = Page.at(Button, { args: { clickSuppressionMs: 50 }, onOut })
const fresh: Model = {
  button: { pressed: false, pointerId: null, key: null, suppressing: null, generation: 0 },
  presses: [],
}
const send = (model: Model, ...messages: ReadonlyArray<Press.Message>) => {
  let last = {
    model,
    commands: undefined as ReadonlyArray<{ readonly effect: unknown }> | undefined,
  }
  for (const message of messages) {
    const next = Option.getOrThrow(placed.update(last.model, Button.wrapper.make(message)))
    last = { model: next.model, commands: next.commands }
  }
  return last
}
const M = Press.Message

describe('Press placement', () => {
  it('a primary pointer down and up is one press, and opens the ghost-click window', () => {
    const down = send(fresh, M.PointerDown({ pointerId: 1, button: 0, pointerType: 'touch' }))
    expect(down.model.button).toMatchObject({ pressed: true, pointerId: 1 })
    const up = send(
      down.model,
      M.PointerUp({ pointerId: 1, pointerType: 'touch', shiftKey: false }),
    )
    expect(up.model.presses).toEqual(['touch'])
    expect(up.model.button).toMatchObject({ pressed: false, pointerId: null, suppressing: 1 })
    expect(up.commands).toHaveLength(1)
  })

  it('ignores a secondary button, another pointer, and a cancelled press', () => {
    expect(
      send(fresh, M.PointerDown({ pointerId: 1, button: 2, pointerType: 'mouse' })).model.button
        .pressed,
    ).toBe(false)
    const down = send(fresh, M.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' })).model
    expect(
      send(down, M.PointerUp({ pointerId: 2, pointerType: 'mouse', shiftKey: false })).model
        .presses,
    ).toEqual([])
    const cancelled = send(down, M.PointerCancelled({ pointerId: 1 })).model
    expect(cancelled.button.pressed).toBe(false)
    expect(cancelled.presses).toEqual([])
    expect(
      send(cancelled, M.PointerUp({ pointerId: 1, pointerType: 'mouse', shiftKey: false })).model
        .presses,
    ).toEqual([])
  })

  it('Enter or Space down then up is a keyboard press; a repeat is not a second one', () => {
    const down = send(fresh, M.KeyDown({ key: ' ', repeat: false })).model
    expect(down.button).toMatchObject({ pressed: true, key: ' ' })
    expect(send(down, M.KeyDown({ key: ' ', repeat: true })).model.button.key).toBe(' ')
    const up = send(down, M.KeyUp({ key: ' ', shiftKey: false })).model
    expect(up.presses).toEqual(['keyboard'])
    expect(up.button.pressed).toBe(false)
    expect(send(fresh, M.KeyDown({ key: 'a', repeat: false })).model.button.pressed).toBe(false)
    expect(send(fresh, M.KeyUp({ key: 'Enter', shiftKey: false })).model.presses).toEqual([])
  })

  it('a click with no pointer is a virtual press; a ghost click inside the window is not', () => {
    expect(send(fresh, M.Clicked({ detail: 0, shiftKey: false })).model.presses).toEqual([
      'virtual',
    ])
    const after = send(
      fresh,
      M.PointerDown({ pointerId: 1, button: 0, pointerType: 'touch' }),
      M.PointerUp({ pointerId: 1, pointerType: 'touch', shiftKey: false }),
    ).model
    expect(send(after, M.Clicked({ detail: 1, shiftKey: false })).model.presses).toEqual(['touch'])
    const stale = send(after, M.Unsuppressed({ generation: 0 })).model
    expect(stale.button.suppressing).toBe(1)
    const open = send(after, M.Unsuppressed({ generation: 1 })).model
    expect(open.button.suppressing).toBeNull()
    expect(send(open, M.Clicked({ detail: 1, shiftKey: false })).model.presses).toEqual([
      'touch',
      'mouse',
    ])
  })

  it('the window closes on the clock', async () => {
    const effect = send(
      fresh,
      M.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' }),
      M.PointerUp({ pointerId: 1, pointerType: 'mouse', shiftKey: false }),
    ).commands![0]! as { readonly effect: Effect.Effect<Message> }
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(effect.effect)
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(fact).toEqual(Button.wrapper.make(M.Unsuppressed({ generation: 1 })))
  })
})

const fire = (element: Element, type: string, init: Record<string, unknown> = {}) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  element.dispatchEvent(event)
  return event
}

describe('Press.events', () => {
  it('reports pointer, key, and click facts, preventing Space and Enter', async () => {
    const button = document.createElement('div')
    document.body.appendChild(button)
    try {
      const facts = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Press.events().f(button, Mount.liveViewStateChanges), 5),
          )
          for (let i = 0; i < 50; i++) yield* Effect.yieldNow
          fire(button, 'pointerdown', { pointerId: 7, button: 0, pointerType: 'pen' })
          fire(button, 'pointerup', { pointerId: 7, pointerType: 'pen' })
          const space = fire(button, 'keydown', { key: ' ', repeat: false })
          expect(space.defaultPrevented).toBe(true)
          const letter = fire(button, 'keydown', { key: 'a', repeat: false })
          expect(letter.defaultPrevented).toBe(false)
          fire(button, 'click', { detail: 0 })
          return yield* Fiber.join(fiber)
        }),
      )
      expect(facts).toEqual([
        M.PointerDown({ pointerId: 7, button: 0, pointerType: 'pen' }),
        M.PointerUp({ pointerId: 7, pointerType: 'pen', shiftKey: false }),
        M.KeyDown({ key: ' ', repeat: false }),
        M.KeyDown({ key: 'a', repeat: false }),
        M.Clicked({ detail: 0, shiftKey: false }),
      ])
    } finally {
      button.remove()
    }
  })

  it('reports nothing while aria-disabled, and nothing after teardown', async () => {
    const button = document.createElement('div')
    document.body.appendChild(button)
    try {
      const facts = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Press.events().f(button, Mount.liveViewStateChanges), 1),
          )
          for (let i = 0; i < 50; i++) yield* Effect.yieldNow
          button.setAttribute('aria-disabled', 'true')
          fire(button, 'click', { detail: 0 })
          button.removeAttribute('aria-disabled')
          fire(button, 'click', { detail: 0 })
          const collected = yield* Fiber.join(fiber)
          fire(button, 'click', { detail: 0 })
          return collected
        }),
      )
      expect(facts).toEqual([M.Clicked({ detail: 0, shiftKey: false })])
    } finally {
      button.remove()
    }
  })
})

describe('Press.behavior', () => {
  const CardSlots = Slots.define({
    root: Slot.make({ capability: Capability.Container }),
    action: Slot.make({ capability: Capability.Interactive }),
  })
  interface CardInput extends Model {
    readonly locked: boolean
  }
  const h = SlotView.inertBuilder<Message>()
  const Activate = Press.behavior(Button)(CardSlots)<CardInput, Message>({
    target: 'action',
    disabled: input => input.locked,
  })
  const attrs = (input: CardInput) =>
    SlotView.buildersFor(CardSlots, [Activate.mixin], { input, h }).action.attrs()

  it('mounts the events on the target and marks it pressed while down', () => {
    const idle = attrs({ ...fresh, locked: false })
    expect(Attributes.find(idle, 'OnMount')?.action.name).toContain('PressEvents')
    expect(Attributes.find(idle, 'DataAttribute')).toBeUndefined()
    const down = attrs({ ...fresh, button: { ...fresh.button, pressed: true }, locked: false })
    expect(Attributes.find(down, 'DataAttribute')).toMatchObject({ key: 'pressed', value: 'true' })
  })

  it('marks a disabled target aria-disabled, which the Mount honors', () => {
    expect(Attributes.find(attrs({ ...fresh, locked: true }), 'AriaDisabled')?.value).toBe(true)
  })
})
