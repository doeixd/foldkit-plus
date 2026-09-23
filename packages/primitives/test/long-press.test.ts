/**
 * LongPress: the threshold fires only while still held and only for the
 * current generation; pointer and keyboard both hold; a release cancels; the
 * Command runs on TestClock; the Behavior marks holding and mounts the Press
 * events.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { LongPress } from '../src/interaction/index.js'

const Hold = Bundle.declare(LongPress.bundle, 'hold')
const Model = Schema.Struct({ ...Hold.fields, held: Schema.Array(LongPress.LongPressed) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Hold.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const onOut: (out: LongPress.LongPressed) => (model: Model) => { readonly model: Model } =
  out => model => ({ model: { ...model, held: [...model.held, out] } })
const placed = Page.at(Hold, { args: { thresholdMs: 500 }, onOut })
const fresh: Model = {
  hold: { holding: false, pointerId: null, key: null, generation: 0 },
  held: [],
}
const M = LongPress.Message
const send = (model: Model, ...messages: ReadonlyArray<LongPress.Message>) => {
  let last = {
    model,
    commands: undefined as ReadonlyArray<{ readonly effect: unknown }> | undefined,
  }
  for (const message of messages) {
    const next = Option.getOrThrow(placed.update(last.model, Hold.wrapper.make(message)))
    last = { model: next.model, commands: next.commands }
  }
  return last
}

describe('LongPress placement', () => {
  it('holds on a primary pointer down and fires when the threshold elapses', () => {
    const down = send(fresh, M.PointerDown({ pointerId: 1, button: 0, pointerType: 'touch' }))
    expect(down.model.hold).toMatchObject({ holding: true, pointerId: 1, generation: 1 })
    expect(down.commands).toHaveLength(1)
    const fired = send(down.model, M.Elapsed({ generation: 1, pointerType: 'touch' })).model
    expect(fired.held).toEqual([LongPress.LongPressed.make({ pointerType: 'touch' })])
    expect(fired.hold.holding).toBe(false)
  })

  it('a release before the threshold cancels: the late Elapsed is a no-op', () => {
    const released = send(
      fresh,
      M.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' }),
      M.PointerUp({ pointerId: 1, pointerType: 'mouse' }),
    ).model
    expect(released.hold.holding).toBe(false)
    expect(send(released, M.Elapsed({ generation: 1, pointerType: 'mouse' })).model.held).toEqual(
      [],
    )
  })

  it('a second hold invalidates the first threshold', () => {
    const second = send(
      fresh,
      M.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' }),
      M.PointerCancelled({ pointerId: 1 }),
      M.PointerDown({ pointerId: 2, button: 0, pointerType: 'pen' }),
    ).model
    expect(second.hold.generation).toBe(2)
    expect(send(second, M.Elapsed({ generation: 1, pointerType: 'mouse' })).model.held).toEqual([])
    expect(send(second, M.Elapsed({ generation: 2, pointerType: 'pen' })).model.held).toEqual([
      LongPress.LongPressed.make({ pointerType: 'pen' }),
    ])
  })

  it('ignores a secondary button, a repeat, and a click', () => {
    expect(
      send(fresh, M.PointerDown({ pointerId: 1, button: 1, pointerType: 'mouse' })).model.hold
        .holding,
    ).toBe(false)
    const key = send(fresh, M.KeyDown({ key: 'Enter', repeat: false })).model
    expect(key.hold).toMatchObject({ holding: true, key: 'Enter' })
    expect(send(key, M.KeyDown({ key: 'Enter', repeat: true })).model.hold.generation).toBe(1)
    expect(send(fresh, M.Clicked({ detail: 1 })).model.hold.holding).toBe(false)
    expect(send(key, M.KeyUp({ key: 'Enter' })).model.hold.holding).toBe(false)
  })

  it('the threshold runs on the clock', async () => {
    const effect = send(fresh, M.KeyDown({ key: ' ', repeat: false })).commands![0]! as {
      readonly effect: Effect.Effect<Message>
    }
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(effect.effect)
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(fact).toEqual(Hold.wrapper.make(M.Elapsed({ generation: 1, pointerType: 'keyboard' })))
  })
})

describe('LongPress.behavior', () => {
  const CardSlots = Slots.define({ card: Slot.make({ capability: Capability.Interactive }) })
  const h = SlotView.inertBuilder<Message>()
  const Behavior_ = LongPress.behavior(Hold)(CardSlots)<Model, Message>({ target: 'card' })
  const attrs = (model: Model) =>
    SlotView.buildersFor(CardSlots, [Behavior_.mixin], { input: model, h }).card.attrs()

  it('mounts the Press events and marks the element while holding', () => {
    expect(Attributes.find(attrs(fresh), 'OnMount')?.action.name).toContain('PressEvents')
    expect(Attributes.find(attrs(fresh), 'DataAttribute')).toBeUndefined()
    const holding = { ...fresh, hold: { ...fresh.hold, holding: true } }
    expect(Attributes.find(attrs(holding), 'DataAttribute')).toMatchObject({
      key: 'holding',
      value: 'true',
    })
  })
})
