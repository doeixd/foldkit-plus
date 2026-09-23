// @vitest-environment jsdom
/**
 * Motion: absent, motion is full; `reduced` makes a presence exit at once
 * and a tween or spring jump to its end in the same Messages; `live` reads
 * the media query, false where jsdom has none.
 */
import { Effect, Fiber, Layer, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import {
  Motion,
  Presence,
  PresenceMessage,
  Spring,
  SpringMessage,
  Tween,
  TweenMessage,
} from '../src/motion/index.js'

const Overlay = Bundle.declare(Presence, 'overlay')
const Model = Schema.Struct({ ...Overlay.fields })
const Message = defineMessageUnion({ ...Overlay.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Overlay, { args: { durationMs: 300 } })

const hideEffect = () =>
  Option.getOrThrow(
    placed.update(
      { overlay: { phase: 'shown', generation: 1 } },
      Overlay.wrapper.make(PresenceMessage.Hide()),
    ),
  ).commands![0]!.effect as Effect.Effect<typeof Message.Type>

const streamOf = <A>(
  entries: Record<
    string,
    {
      readonly dependenciesToStream: (
        d: { readonly running: boolean },
        r: () => { readonly running: boolean },
      ) => Stream.Stream<A>
    }
  >,
) => entries['ticks']!.dependenciesToStream({ running: true }, () => ({ running: true }))

describe('Motion', () => {
  it('reducedMotion is false without the service, and follows a provided layer', async () => {
    expect(await Effect.runPromise(Motion.reducedMotion)).toBe(false)
    expect(await Effect.runPromise(Motion.reducedMotion.pipe(Effect.provide(Motion.reduced)))).toBe(
      true,
    )
    expect(await Effect.runPromise(Motion.reducedMotion.pipe(Effect.provide(Motion.full)))).toBe(
      false,
    )
    expect(await Effect.runPromise(Motion.reducedMotion.pipe(Effect.provide(Motion.live)))).toBe(
      false,
    )
  })

  it('a presence exits at once under reduced motion, and after its duration otherwise', async () => {
    const immediate = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(hideEffect())
        yield* Effect.yieldNow
        // No clock adjustment: the exit must not wait.
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(Layer.mergeAll(TestClock.layer(), Motion.reduced))),
    )
    expect(immediate).toEqual(Overlay.wrapper.make(PresenceMessage.Hidden({ generation: 2 })))

    const pending = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(hideEffect())
        yield* Effect.yieldNow
        // At 100ms of a 300ms exit, joining still loses a race against a shorter sleep.
        const racer = yield* Effect.forkChild(
          Effect.raceFirst(
            Effect.as(Fiber.join(fiber), 'exited'),
            Effect.as(Effect.sleep('100 millis'), 'waiting'),
          ),
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust('100 millis')
        const early = yield* Fiber.join(racer)
        yield* TestClock.adjust('1 second')
        yield* Fiber.join(fiber)
        return early === 'waiting'
      }).pipe(Effect.provide(Layer.mergeAll(TestClock.layer(), Motion.full))),
    )
    expect(pending).toBe(true)
  })

  it('a tween and a spring jump to their end under reduced motion', async () => {
    const tween = Tween.subscriptions!({ from: 0, to: 100, ms: 1000 }) as never
    const spring = Spring.subscriptions!({ from: 0, to: 100, stiffness: 100, damping: 10 }) as never
    const [tweened, sprung] = await Effect.runPromise(
      Effect.all([
        Stream.runCollect(streamOf<TweenMessage>(tween)),
        Stream.runCollect(streamOf<SpringMessage>(spring)),
      ]).pipe(Effect.provide(Motion.reduced)),
    )
    expect([...tweened]).toEqual([TweenMessage.Finished({ value: 100 })])
    expect([...sprung]).toEqual([SpringMessage.Finished({ value: 100 })])
  })
})
