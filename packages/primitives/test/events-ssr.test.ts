// @vitest-environment node
/**
 * Event entries without a window (SSR): the pure entries subscribe to
 * nothing instead of throwing. Idle is the exception that proves the rule:
 * its seed still settles after the timeout, documenting that subscription
 * start counts as last-known-alive.
 */
import { Effect, Fiber, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import {
  Idle,
  IdleMessage,
  activeElementEvents,
  keyboardEvents,
  pointerEvents,
  scrollEvents,
} from '../src/events/index.js'
import { takeMessages } from './support.js'

describe('event entries without a window', () => {
  it('subscribe to nothing', async () => {
    const streams: Array<Stream.Stream<unknown>> = [
      keyboardEvents(),
      pointerEvents(),
      scrollEvents(),
      activeElementEvents(),
    ]
    for (const stream of streams) {
      expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
    }
  })

  it('idle still settles from its seed', async () => {
    const entry = Idle.subscriptions!({ timeoutMs: 1000 }).watch!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ idle: false }),
      () => ({}),
    )
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, 1, '1 minute'))
        yield* TestClock.adjust('2 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(values).toEqual([IdleMessage.BecameIdle()])
  })
})
