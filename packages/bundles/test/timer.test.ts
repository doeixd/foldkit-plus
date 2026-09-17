/**
 * Timer: pure transitions, the tick stream driven by TestClock (no waiting),
 * silence while stopped, and placement through a real assembly.
 */
import { Effect, Fiber, Layer, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Timer, TimerMessage, type TimerModel } from '../src/time/index.js'
import { takeMessages } from './support.js'

const Ticks = Bundle.declare(Timer, 'ticks')
const Model = Schema.Struct({ ...Ticks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Ticks.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const ticksStream = (model: TimerModel) => {
  const entry = Timer.subscriptions!({ intervalMs: 1000 }).ticks!
  return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
}

describe('Timer transitions', () => {
  it('starts stopped at zero and counts ticks while running', () => {
    const placed = Page.at(Ticks, { args: { intervalMs: 1000 } })
    expect(placed.init({ ticks: { count: 9, running: true } }).model.ticks).toEqual({
      count: 0,
      running: false,
    })
    const running = Option.getOrThrow(
      placed.update(
        { ticks: { count: 0, running: false } },
        Ticks.wrapper.make(TimerMessage.Started()),
      ),
    ).model.ticks
    expect(running).toEqual({ count: 0, running: true })
    const counted = Option.getOrThrow(
      placed.update({ ticks: running }, Ticks.wrapper.make(TimerMessage.Ticked())),
    ).model.ticks
    expect(counted).toEqual({ count: 1, running: true })
    const stopped = Option.getOrThrow(
      placed.update({ ticks: counted }, Ticks.wrapper.make(TimerMessage.Stopped())),
    ).model.ticks
    expect(stopped).toEqual({ count: 1, running: false })
    // Restarting keeps the count; only Ticked advances it.
    const restarted = Option.getOrThrow(
      placed.update({ ticks: stopped }, Ticks.wrapper.make(TimerMessage.Started())),
    ).model.ticks
    expect(restarted).toEqual({ count: 1, running: true })
  })

  it('rejects a non-positive interval at placement', () => {
    expect(() => Page.at(Ticks, { args: { intervalMs: 0 } })).toThrow(/args do not match/)
  })
})

describe('Timer stream', () => {
  it('ticks on the interval, on TestClock time', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        // Three ticks need 3 virtual seconds; the stall timeout sits past them.
        const fiber = yield* Effect.forkChild(
          takeMessages(ticksStream({ count: 0, running: true }), 3, '10 seconds'),
        )
        yield* TestClock.adjust('11 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values).toEqual([TimerMessage.Ticked(), TimerMessage.Ticked(), TimerMessage.Ticked()])
  })

  it('emits nothing while stopped', async () => {
    expect(
      await Effect.runPromise(Stream.runCollect(ticksStream({ count: 0, running: false }))),
    ).toEqual([])
  })
})

describe('Timer in an assembly', () => {
  it('routes its Messages and carries init and subscriptions', () => {
    const assembly = Page.assemble(Page.at(Ticks, { args: { intervalMs: 1000 } }))
    const update = assembly.update(model => ({ model }))
    const started = update(
      { ticks: { count: 0, running: false } },
      Ticks.wrapper.make(TimerMessage.Started()),
    )
    expect(started.model.ticks.running).toBe(true)
    expect(Object.keys(assembly.subscriptions())).toEqual(['Timer@ticks/ticks'])
  })
})
