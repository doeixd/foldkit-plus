// @vitest-environment jsdom
/**
 * Scroll entry: positions off the real window.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { ScrollMessage, scrollEvents } from '../src/events/index.js'
import { takeMessages } from './support.js'

describe('scrollEvents', () => {
  it('reports positions on scroll', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(scrollEvents(), 2))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        // jsdom never lays out, so scrollTo is a no-op: stub the offsets.
        // Yield between scrolls: the entry reads the offsets lazily, so a
        // synchronous burst would read the last stub twice.
        const scrollTo = function* (y: number) {
          Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
          window.dispatchEvent(new window.Event('scroll'))
          for (let i = 0; i < 10; i++) {
            yield* Effect.yieldNow
          }
        }
        Object.defineProperty(window, 'scrollX', { value: 0, configurable: true })
        yield* scrollTo(100)
        yield* scrollTo(200)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      ScrollMessage.Scrolled({ x: 0, y: 100 }),
      ScrollMessage.Scrolled({ x: 0, y: 200 }),
    ])
  })
})
