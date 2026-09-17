/**
 * Spring: pure transitions, physics to the exact end value on TestClock time
 * (both directions, overshoot on the way), silence while stopped, arg
 * validation, and placement through a real assembly.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Spring, SpringMessage, type SpringModel } from '../src/motion/index.js'
import { takeMessages } from './support.js'

const Bounce = Bundle.declare(Spring, 'bounce')
const Model = Schema.Struct({ ...Bounce.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Bounce.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { from: 0, to: 100, stiffness: 170, damping: 26 }
const placed = Page.at(Bounce, { args })

const springStream = (
  model: SpringModel,
  args = { from: 0, to: 100, stiffness: 170, damping: 26 },
) => {
  const entry = Spring.subscriptions!(args).ticks!
  return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
}

describe('Spring transitions', () => {
  it('starts at from with no velocity, follows ticks, and rests exactly at to', () => {
    expect(placed.init({ bounce: { value: 9, velocity: 9, running: true } }).model.bounce).toEqual({
      value: 0,
      velocity: 0,
      running: false,
    })
    const running = Option.getOrThrow(
      placed.update(
        { bounce: { value: 0, velocity: 0, running: false } },
        Bounce.wrapper.make(SpringMessage.Started()),
      ),
    ).model.bounce
    expect(running).toEqual({ value: 0, velocity: 0, running: true })
    const ticked = Option.getOrThrow(
      placed.update(
        { bounce: running },
        Bounce.wrapper.make(SpringMessage.Ticked({ value: 40, velocity: 5 })),
      ),
    ).model.bounce
    expect(ticked).toEqual({ value: 40, velocity: 5, running: true })
    const finished = Option.getOrThrow(
      placed.update(
        { bounce: ticked },
        Bounce.wrapper.make(SpringMessage.Finished({ value: 100 })),
      ),
    ).model.bounce
    expect(finished).toEqual({ value: 100, velocity: 0, running: false })
  })

  it('stops without settling', () => {
    const stopped = Option.getOrThrow(
      placed.update(
        { bounce: { value: 40, velocity: 5, running: true } },
        Bounce.wrapper.make(SpringMessage.Stopped()),
      ),
    ).model.bounce
    expect(stopped).toEqual({ value: 40, velocity: 5, running: false })
  })

  it('rejects non-positive physics at placement', () => {
    expect(() => Page.at(Bounce, { args: { ...args, stiffness: 0 } })).toThrow(/args do not match/)
    expect(() => Page.at(Bounce, { args: { ...args, damping: -1 } })).toThrow(/args do not match/)
  })
})

describe('Spring stream', () => {
  it('settles to exactly to, on TestClock time', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(springStream({ value: 0, velocity: 0, running: true }), 10000, '60 seconds'),
        )
        yield* TestClock.adjust('60 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values[values.length - 1]).toEqual(SpringMessage.Finished({ value: 100 }))
    const ticks = values.slice(0, -1)
    expect(ticks.length).toBeGreaterThan(2)
    // The scan seed (no movement yet) is dropped: the first tick already moved.
    const first = ticks[0]
    if (first === undefined || first._tag !== 'Ticked') throw new Error('expected a first tick')
    expect(first.value).toBeGreaterThan(0)
    // The spring actually travels: intermediate ticks move off the start.
    expect(
      Math.max(...ticks.map(tick => (tick._tag === 'Ticked' ? tick.value : NaN))),
    ).toBeGreaterThan(0)
  })

  it('overshoots when underdamped, then still rests at to', async () => {
    const stream = springStream(
      { value: 0, velocity: 0, running: true },
      { from: 0, to: 100, stiffness: 170, damping: 8 },
    )
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, 10000, '60 seconds'))
        yield* TestClock.adjust('60 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values[values.length - 1]).toEqual(SpringMessage.Finished({ value: 100 }))
    const ticks = values.slice(0, -1)
    expect(
      Math.max(...ticks.map(tick => (tick._tag === 'Ticked' ? tick.value : NaN))),
    ).toBeGreaterThan(100)
  })

  it('runs a descending spring to exactly to', async () => {
    const stream = springStream(
      { value: 100, velocity: 0, running: true },
      { from: 100, to: 0, stiffness: 170, damping: 26 },
    )
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, 10000, '60 seconds'))
        yield* TestClock.adjust('60 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values[values.length - 1]).toEqual(SpringMessage.Finished({ value: 0 }))
  })

  it('emits nothing while stopped', async () => {
    const entry = Spring.subscriptions!(args).ticks!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ value: 0, velocity: 0, running: false }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
  })
})

describe('Spring in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(Page.at(Bounce, { args }))
    const update = assembly.update(model => ({ model }))
    const started = update(
      { bounce: { value: 0, velocity: 0, running: false } },
      Bounce.wrapper.make(SpringMessage.Started()),
    )
    expect(started.model.bounce.running).toBe(true)
    expect(Object.keys(assembly.subscriptions())).toEqual(['Spring@bounce/ticks'])
  })
})
