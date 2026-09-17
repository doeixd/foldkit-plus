// @vitest-environment jsdom
/**
 * Scroll entry: positions off the real window.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { ScrollMessage, scrollEvents } from '../src/events/index.js'
import { takeMessages } from './support.js'

describe('scrollEvents', () => {
  it('reports positions on scroll, including container scrolls', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(scrollEvents(), 3))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        // jsdom never lays out, so scrollTo is a no-op: stub the offsets.
        // Yield between scrolls: the entry reads the offsets lazily, so a
        // synchronous burst would read the last stub repeatedly.
        const scrollTo = function* (y: number, target: EventTarget) {
          Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
          target.dispatchEvent(new window.Event('scroll'))
          for (let i = 0; i < 10; i++) {
            yield* Effect.yieldNow
          }
        }
        Object.defineProperty(window, 'scrollX', { value: 0, configurable: true })
        yield* scrollTo(100, window)
        yield* scrollTo(200, window)
        // Container scrolls do not bubble: only capture hears this one.
        const box = document.createElement('div')
        document.body.appendChild(box)
        yield* scrollTo(300, box)
        box.remove()
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      ScrollMessage.Scrolled({ x: 0, y: 100 }),
      ScrollMessage.Scrolled({ x: 0, y: 200 }),
      ScrollMessage.Scrolled({ x: 0, y: 300 }),
    ])
  })
})
