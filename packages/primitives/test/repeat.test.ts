/**
 * Repeat: a held stepper. A mouse or a key steps as it goes down and repeats
 * after the delay; a finger steps on a tap or once held; a click no pointer
 * made steps once; a release or a bound ends it; a late timer changes nothing;
 * the clock is Effect's; the Behavior marks holding and mounts the Press events.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Repeat } from '../src/interaction/index.js'

const Hold = Bundle.declare(Repeat.bundle, 'hold')
const Model = Schema.Struct({ ...Hold.fields, out: Schema.Array(Schema.Unknown) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Hold.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const onOut: (out: Repeat.Out) => (model: Model) => { readonly model: Model } = out => model => ({
  model: { ...model, out: [...model.out, out] },
})
const placed = Page.at(Hold, { args: { delayMs: 400, intervalMs: 60 }, onOut })
const fresh: Model = {
  hold: {
    holding: false,
    pointerId: Option.none(),
    key: Option.none(),
    input: 'mouse',
    count: 0,
    stopped: false,
    generation: 0,
  },
  out: [],
}
const M = Repeat.Message
const send = (model: Model, ...messages: ReadonlyArray<Repeat.Message>) => {
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
const mouseDown = M.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' })
const mouseUp = M.PointerUp({ pointerId: 1, pointerType: 'mouse', shiftKey: false })
const touchDown = M.PointerDown({ pointerId: 7, button: 0, pointerType: 'touch' })
const touchUp = M.PointerUp({ pointerId: 7, pointerType: 'touch', shiftKey: false })
const stepped = (count: number, input: Repeat.Stepped['input']) =>
  Repeat.Stepped.make({ count, input })

describe('Repeat placement', () => {
  it('a mouse steps as it goes down, then every interval once the delay passes', () => {
    const down = send(fresh, mouseDown)
    expect(down.model.out).toEqual([stepped(1, 'mouse')])
    expect(down.commands).toHaveLength(1)
    const held = send(down.model, M.Elapsed({ generation: 1 }), M.Elapsed({ generation: 1 }))
    expect(held.model.out).toEqual([stepped(1, 'mouse'), stepped(2, 'mouse'), stepped(3, 'mouse')])
    expect(held.commands).toHaveLength(1)
  })

  it('a release ends the hold with its count, and a late timer changes nothing', () => {
    const released = send(fresh, mouseDown, M.Elapsed({ generation: 1 }), mouseUp)
    expect(released.model.out.at(-1)).toEqual(Repeat.Ended.make({ count: 2 }))
    expect(released.model.hold.holding).toBe(false)
    const late = send(released.model, M.Elapsed({ generation: 1 }))
    expect(late.model).toBe(released.model)
  })

  it('a short press is a single step and ends with it, since the count is 1', () => {
    const tap = send(fresh, mouseDown, mouseUp).model.out
    expect(tap).toEqual([stepped(1, 'mouse'), Repeat.Ended.make({ count: 1 })])
  })

  it('a second press starts over, and the first one’s timer is stale', () => {
    const second = send(fresh, mouseDown, mouseUp, mouseDown).model
    expect(second.hold.generation).toBe(2)
    expect(send(second, M.Elapsed({ generation: 1 })).model).toBe(second)
  })

  it('another pointer, a secondary button and a held press’s second down change nothing', () => {
    const down = send(fresh, mouseDown).model
    expect(send(down, M.PointerDown({ pointerId: 2, button: 0, pointerType: 'mouse' })).model).toBe(
      down,
    )
    expect(
      send(down, M.PointerUp({ pointerId: 2, pointerType: 'mouse', shiftKey: false })).model,
    ).toBe(down)
    expect(
      send(fresh, M.PointerDown({ pointerId: 1, button: 2, pointerType: 'mouse' })).model,
    ).toBe(fresh)
  })

  it('a finger steps on a tap, not on the way down', () => {
    const down = send(fresh, touchDown)
    expect(down.model.out).toEqual([])
    expect(send(down.model, touchUp).model.out).toEqual([stepped(1, 'touch')])
  })

  it('a finger held past the delay steps and repeats, and its release ends it', () => {
    const held = send(fresh, touchDown, M.Elapsed({ generation: 1 }), M.Elapsed({ generation: 1 }))
    expect(held.model.out).toEqual([stepped(1, 'touch'), stepped(2, 'touch')])
    const released = send(held.model, touchUp).model.out
    expect(released.at(-1)).toEqual(Repeat.Ended.make({ count: 2 }))
    expect(released).toHaveLength(3)
  })

  it('a key cancelled by a disabled element ends its hold, and another key does not', () => {
    const down = send(fresh, M.KeyDown({ key: 'Enter', repeat: false })).model
    expect(send(down, M.KeyCancelled({ key: ' ' })).model).toBe(down)
    const ended = send(down, M.KeyCancelled({ key: 'Enter' })).model
    expect(ended.hold.holding).toBe(false)
    expect(ended.out.at(-1)).toEqual(Repeat.Ended.make({ count: 1 }))
  })

  it('a cancelled finger steps nothing', () => {
    expect(send(fresh, touchDown, M.PointerCancelled({ pointerId: 7 })).model.out).toEqual([])
  })

  it('Enter and Space step as they go down; a held key’s repeats do not step by themselves', () => {
    const down = send(fresh, M.KeyDown({ key: 'Enter', repeat: false }))
    expect(down.model.out).toEqual([stepped(1, 'keyboard')])
    const repeated = send(down.model, M.KeyDown({ key: 'Enter', repeat: true }))
    expect(repeated.model).toBe(down.model)
    const ended = send(
      down.model,
      M.Elapsed({ generation: 1 }),
      M.KeyUp({ key: 'Enter', shiftKey: false }),
    )
    expect(ended.model.out).toEqual([
      stepped(1, 'keyboard'),
      stepped(2, 'keyboard'),
      Repeat.Ended.make({ count: 2 }),
    ])
    expect(send(fresh, M.KeyDown({ key: 'a', repeat: false })).model).toBe(fresh)
    expect(send(down.model, M.KeyUp({ key: ' ', shiftKey: false })).model).toBe(down.model)
  })

  it('a click no pointer made steps once; the click after a press does not', () => {
    expect(send(fresh, M.Clicked({ detail: 0, shiftKey: false })).model.out).toEqual([
      stepped(1, 'virtual'),
    ])
    expect(send(fresh, M.Clicked({ detail: 1, shiftKey: false })).model).toBe(fresh)
    const down = send(fresh, mouseDown).model
    expect(send(down, M.Clicked({ detail: 0, shiftKey: false })).model).toBe(down)
  })

  it('the parent stopping at a bound ends the stepping but not the press', () => {
    const down = send(fresh, mouseDown, M.Stopped()).model
    expect(down.hold).toMatchObject({ holding: true, stopped: true })
    const later = send(down, M.Elapsed({ generation: 1 }))
    expect(later.model).toBe(down)
    expect(send(down, mouseUp).model.out.at(-1)).toEqual(Repeat.Ended.make({ count: 1 }))
    // A stop with nothing held, or twice, is nothing.
    expect(send(fresh, M.Stopped()).model).toBe(fresh)
    expect(send(down, M.Stopped()).model).toBe(down)
  })

  it('a finger stopped before it lifts does not tap', () => {
    const lifted = send(fresh, touchDown, M.Stopped(), touchUp).model
    expect(lifted.out).toEqual([])
  })

  it('the timers run on the clock: the delay, then the interval', async () => {
    const down = send(fresh, mouseDown)
    const delay = (down.commands![0] as { readonly effect: Effect.Effect<Message> }).effect
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(delay)
        yield* Effect.yieldNow
        yield* TestClock.adjust('399 millis')
        const early = fiber.pollUnsafe()
        yield* TestClock.adjust('1 millis')
        return { early, fact: yield* Fiber.join(fiber) }
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(fact.early).toBeUndefined()
    expect(fact.fact).toEqual(Hold.wrapper.make(M.Elapsed({ generation: 1 })))
    const interval = send(down.model, M.Elapsed({ generation: 1 }))
    const next = (interval.commands![0] as { readonly effect: Effect.Effect<Message> }).effect
    const after = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(next)
        yield* Effect.yieldNow
        yield* TestClock.adjust('60 millis')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(after).toEqual(Hold.wrapper.make(M.Elapsed({ generation: 1 })))
  })
})

describe('Repeat arguments', () => {
  it.each([0, -1, Number.NaN, Infinity])('refuse a delay or interval of %s', value => {
    expect(() =>
      Schema.decodeUnknownSync(Repeat.Args)({ delayMs: value, intervalMs: 60 }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Repeat.Args)({ delayMs: 400, intervalMs: value }),
    ).toThrow()
  })
})

describe('Repeat.behavior', () => {
  const ButtonSlots = Slots.define({
    root: Slot.make({ capability: Capability.Container }),
    button: Slot.make({ capability: Capability.Interactive }),
  })
  type ParentMessage = { readonly _tag: 'Other' }
  const h = SlotView.inertBuilder<ParentMessage>()
  const behavior = Repeat.behavior(Hold)(ButtonSlots)<Model, ParentMessage>({ target: 'button' })
  const attrs = (model: Model) =>
    SlotView.buildersFor(ButtonSlots, [behavior.mixin], { input: model, h }).button.attrs()

  it('mounts the Press events and marks the press while it is down', () => {
    expect(Attributes.find(attrs(fresh), 'OnMount')?.action.name).toContain('Press')
    expect(Attributes.find(attrs(fresh), 'DataAttribute')).toBeUndefined()
    const down = send(fresh, mouseDown).model
    expect(Attributes.find(attrs(down), 'DataAttribute')).toBeDefined()
  })
})
