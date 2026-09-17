/**
 * Throttle: the first Attempted in an interval surfaces Throttled, the rest
 * are dropped; the interval is measured on TestClock time. Placement
 * requires onOut, like Debounce.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Throttle, ThrottleMessage, Throttled } from '../src/time/index.js'

const Save = Bundle.declare(Throttle, 'save')
const Model = Schema.Struct({ ...Save.fields, fired: Schema.Array(Schema.Number) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Save.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { intervalMs: 1000 }
const onOut = (out: Throttled) => (model: Model) => ({
  model: { ...model, fired: [...model.fired, out.at] },
})
const placed = Page.at(Save, { args, onOut })
const fresh: Model = { save: { lastAt: null }, fired: [] }

// Attempted reads the clock through a Command; run it inside one shared
// TestClock so virtual time actually passes between attempts.
const runAttempts = (attempts: number, advanceMs: number) =>
  Effect.gen(function* () {
    let model: Model = fresh
    for (let i = 0; i < attempts; i++) {
      if (i > 0) yield* TestClock.adjust(advanceMs)
      const step = Option.getOrThrow(
        placed.update(model, Save.wrapper.make(ThrottleMessage.Attempted())),
      )
      const fiber = yield* Effect.forkChild(step.commands![0]!.effect)
      yield* Effect.yieldNow
      // The placed command already lifts to the parent variant.
      const fact = yield* Fiber.join(fiber)
      model = Option.getOrThrow(placed.update(model, fact)).model
    }
    return model
  }).pipe(Effect.provide(TestClock.layer()))

describe('Throttle transitions', () => {
  it('fires the first attempt, drops attempts inside the interval', async () => {
    expect(placed.init(fresh).model.save).toEqual({ lastAt: null })
    // Two attempts at the same virtual instant: one fire, one drop.
    const same = await Effect.runPromise(runAttempts(2, 0))
    expect(same.fired).toHaveLength(1)
    const at = same.save.lastAt
    expect(at).not.toBe(null)

    // Past the interval: fires again and re-stamps.
    const later = await Effect.runPromise(runAttempts(2, 2000))
    expect(later.fired).toHaveLength(2)
    // Exactly on the boundary counts as past: >=, not >.
    const edge = await Effect.runPromise(runAttempts(2, 1000))
    expect(edge.fired).toHaveLength(2)
  })

  it('rejects a non-positive interval at placement', () => {
    expect(() => Page.at(Save, { args: { intervalMs: 0 }, onOut })).toThrow(/args do not match/)
  })
})

describe('Throttle in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(Page.at(Save, { args, onOut }))
    const update = assembly.update(model => ({ model }))
    const attempted = update(fresh, Save.wrapper.make(ThrottleMessage.Attempted()))
    expect(attempted.model.save).toEqual({ lastAt: null })
    expect(Object.keys(assembly.subscriptions())).toEqual([])
  })
})
