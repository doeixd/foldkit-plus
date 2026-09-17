// @vitest-environment jsdom
/**
 * Idle: starts active, idles after silence, wakes on activity, rejects a
 * non-positive timeout, and places through a real assembly. Time runs on
 * TestClock: no waiting.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Idle, IdleMessage, type IdleModel } from '../src/events/index.js'
import { takeMessages } from './support.js'

const Away = Bundle.declare(Idle, 'away')
const Model = Schema.Struct({ ...Away.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Away.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { timeoutMs: 60_000 }
const placed = Page.at(Away, { args })

const watchStream = (model: IdleModel) => {
  const entry = Idle.subscriptions!({ timeoutMs: 60_000 }).watch!
  return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
}

describe('Idle transitions', () => {
  it('starts active and flips on its Messages', () => {
    expect(placed.init({ away: { idle: true } }).model.away).toEqual({ idle: false })
    const idle = Option.getOrThrow(
      placed.update({ away: { idle: false } }, Away.wrapper.make(IdleMessage.BecameIdle())),
    ).model.away
    expect(idle).toEqual({ idle: true })
    const active = Option.getOrThrow(
      placed.update({ away: idle }, Away.wrapper.make(IdleMessage.BecameActive())),
    ).model.away
    expect(active).toEqual({ idle: false })
  })

  it('rejects a non-positive timeout at placement', () => {
    expect(() => Page.at(Away, { args: { timeoutMs: 0 } })).toThrow(/args do not match/)
  })
})

describe('Idle stream', () => {
  it('idles after silence from subscribe', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(watchStream({ idle: false }), 1, '5 minutes'),
        )
        yield* TestClock.adjust('61 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values).toEqual([IdleMessage.BecameIdle()])
  })

  it('activity before the timeout restarts the silence', async () => {
    // t=50 activity, then race the take against 11 more virtual seconds:
    // restarted silence fires at t=110, so t=61 still waits; an unrestarted
    // seed would have fired at t=60.
    const winner = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(watchStream({ idle: false }), 1, '5 minutes'),
        )
        // Settle first: the window listeners must be registered before
        // virtual time moves, or the activity below hits nothing.
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        yield* TestClock.adjust('50 seconds')
        window.dispatchEvent(new window.MouseEvent('mousemove'))
        // Room for the event to cross the merge into the debounce before
        // virtual time jumps past the seed's deadline.
        for (let i = 0; i < 20; i++) {
          yield* Effect.yieldNow
        }
        return yield* Effect.race(
          Fiber.join(fiber),
          Effect.as(TestClock.adjust('11 seconds'), 'waited' as const),
        )
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(winner).toBe('waited')
  })

  it('wakes on the first activity while idle', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(watchStream({ idle: true }), 1, '5 minutes'),
        )
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a' }))
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values).toEqual([IdleMessage.BecameActive()])
  })

  it('emits nothing while idle without activity', async () => {
    const entry = Idle.subscriptions!({ timeoutMs: 60_000 }).watch!
    const stream = entry.dependenciesToStream(entry.modelToDependencies({ idle: true }), () => ({}))
    // take(0) would vacuate; race the stream against a clock advance and
    // prove silence by timeout.
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(takeMessages(stream, 1, '10 seconds'))
          yield* TestClock.adjust('10 seconds')
          return yield* Fiber.join(fiber)
        }).pipe(Effect.provide(TestClock.layer())),
      ),
    ).rejects.toThrow(/stream stalled/)
  })
})

describe('Idle in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const idle = update({ away: { idle: false } }, Away.wrapper.make(IdleMessage.BecameIdle()))
    expect(idle.model.away).toEqual({ idle: true })
    expect(Object.keys(assembly.subscriptions())).toEqual(['Idle@away/watch'])
  })
})
