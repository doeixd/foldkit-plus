/**
 * Interval: pure transitions, the tick stream stamped with TestClock time
 * (no waiting), silence while stopped, and placement through a real assembly.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Interval, IntervalMessage, type IntervalModel } from '../src/time/index.js'
import { takeMessages } from './support.js'

const Clock = Bundle.declare(Interval, 'clock')
const Model = Schema.Struct({ ...Clock.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Clock.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const ticksStream = (model: IntervalModel) => {
  const entry = Interval.subscriptions!({ intervalMs: 1000 }).ticks!
  return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
}

describe('Interval transitions', () => {
  it('starts stopped with no stamp and records tick times', () => {
    const placed = Page.at(Clock, { args: { intervalMs: 1000 } })
    expect(placed.init({ clock: { running: true, lastAt: 9 } }).model.clock).toEqual({
      running: false,
      lastAt: null,
    })
    const running = Option.getOrThrow(
      placed.update(
        { clock: { running: false, lastAt: null } },
        Clock.wrapper.make(IntervalMessage.Started()),
      ),
    ).model.clock
    expect(running).toEqual({ running: true, lastAt: null })
    const stamped = Option.getOrThrow(
      placed.update({ clock: running }, Clock.wrapper.make(IntervalMessage.Ticked({ at: 5000 }))),
    ).model.clock
    expect(stamped).toEqual({ running: true, lastAt: 5000 })
    const stopped = Option.getOrThrow(
      placed.update({ clock: stamped }, Clock.wrapper.make(IntervalMessage.Stopped())),
    ).model.clock
    expect(stopped).toEqual({ running: false, lastAt: 5000 })
  })

  it('rejects a non-positive interval at placement', () => {
    expect(() => Page.at(Clock, { args: { intervalMs: 0 } })).toThrow(/args do not match/)
  })
})

describe('Interval stream', () => {
  it('stamps ticks on the interval, on TestClock time', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(ticksStream({ running: true, lastAt: null }), 3, '10 seconds'),
        )
        yield* TestClock.adjust('11 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values).toHaveLength(3)
    const ats = values.map(message => {
      if (message._tag !== 'Ticked') throw new Error('expected Ticked')
      return message.at
    })
    for (let i = 1; i < ats.length; i++) {
      expect(ats[i]!).toBeGreaterThan(ats[i - 1]!)
    }
  })

  it('emits nothing while stopped', async () => {
    expect(
      await Effect.runPromise(Stream.runCollect(ticksStream({ running: false, lastAt: null }))),
    ).toEqual([])
  })
})

describe('Interval in an assembly', () => {
  it('routes its Messages and carries init and subscriptions', () => {
    const assembly = Page.assemble(Page.at(Clock, { args: { intervalMs: 1000 } }))
    const update = assembly.update(model => ({ model }))
    const started = update(
      { clock: { running: false, lastAt: null } },
      Clock.wrapper.make(IntervalMessage.Started()),
    )
    expect(started.model.clock.running).toBe(true)
    expect(Object.keys(assembly.subscriptions())).toEqual(['Interval@clock/ticks'])
  })
})
