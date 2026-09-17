/**
 * Tween: pure transitions, interpolation to the exact end value on TestClock
 * time (both directions), silence while stopped, and placement through a
 * real assembly.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Tween, TweenMessage, type TweenModel } from '../src/motion/index.js'
import { takeMessages } from './support.js'

const Slide = Bundle.declare(Tween, 'slide')
const Model = Schema.Struct({ ...Slide.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slide.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { from: 0, to: 100, ms: 1000 }

const tweenStream = (model: TweenModel) => {
  const entry = Tween.subscriptions!({ ...args }).ticks!
  return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
}

describe('Tween transitions', () => {
  it('starts at from, follows ticks, and rests exactly at to', () => {
    const placed = Page.at(Slide, { args })
    expect(placed.init({ slide: { value: 9, running: true } }).model.slide).toEqual({
      value: 0,
      running: false,
    })
    const offset = Page.at(Slide, { args: { from: 50, to: 100, ms: 1000 } })
    expect(offset.init({ slide: { value: 0, running: false } }).model.slide).toEqual({
      value: 50,
      running: false,
    })
    const running = Option.getOrThrow(
      placed.update(
        { slide: { value: 0, running: false } },
        Slide.wrapper.make(TweenMessage.Started()),
      ),
    ).model.slide
    expect(running).toEqual({ value: 0, running: true })
    const ticked = Option.getOrThrow(
      placed.update({ slide: running }, Slide.wrapper.make(TweenMessage.Ticked({ value: 40 }))),
    ).model.slide
    expect(ticked).toEqual({ value: 40, running: true })
    const finished = Option.getOrThrow(
      placed.update({ slide: ticked }, Slide.wrapper.make(TweenMessage.Finished({ value: 100 }))),
    ).model.slide
    expect(finished).toEqual({ value: 100, running: false })
  })

  it('rejects a non-positive duration at placement', () => {
    expect(() => Page.at(Slide, { args: { ...args, ms: 0 } })).toThrow(/args do not match/)
  })
})

describe('Tween stream', () => {
  it('interpolates to exactly to, on TestClock time', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(tweenStream({ value: 0, running: true }), 100, '10 seconds'),
        )
        yield* TestClock.adjust('10 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    const last = values[values.length - 1]!
    expect(last).toEqual(TweenMessage.Finished({ value: 100 }))
    expect(values.length).toBeGreaterThan(2)
    const amount = (message: (typeof values)[number]): number => {
      switch (message._tag) {
        case 'Ticked':
        case 'Finished':
          return message.value
        default:
          throw new Error(`unexpected ${message._tag} in the tick stream`)
      }
    }
    for (let i = 1; i < values.length; i++) {
      expect(amount(values[i]!)).toBeGreaterThanOrEqual(amount(values[i - 1]!))
    }
    // Intermediate ticks actually travel: a constant stream would also be monotone.
    const ticks = values.slice(0, -1)
    expect(Math.max(...ticks.map(amount))).toBeGreaterThan(0)
    expect(Math.min(...ticks.map(amount))).toBeLessThan(100)
  })

  it('runs a descending tween to exactly to', async () => {
    const down = Tween.subscriptions!({ from: 100, to: 0, ms: 1000 }).ticks!
    const stream = down.dependenciesToStream(
      down.modelToDependencies({ value: 100, running: true }),
      () => ({}),
    )
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, 100, '10 seconds'))
        yield* TestClock.adjust('10 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values[values.length - 1]).toEqual(TweenMessage.Finished({ value: 0 }))
    const ticks = values.slice(0, -1)
    expect(ticks.length).toBeGreaterThan(1)
    expect(
      Math.min(...ticks.map(tick => (tick._tag === 'Ticked' ? tick.value : NaN))),
    ).toBeLessThan(100)
  })

  it('emits nothing while stopped', async () => {
    const entry = Tween.subscriptions!({ ...args }).ticks!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ value: 0, running: false }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
  })
})

describe('Tween in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(Page.at(Slide, { args }))
    const update = assembly.update(model => ({ model }))
    const started = update(
      { slide: { value: 0, running: false } },
      Slide.wrapper.make(TweenMessage.Started()),
    )
    expect(started.model.slide.running).toBe(true)
    expect(Object.keys(assembly.subscriptions())).toEqual(['Tween@slide/ticks'])
  })
})
