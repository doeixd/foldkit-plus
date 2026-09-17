// @vitest-environment jsdom
/**
 * Pointer entry: moves off the real window with their coordinates.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { PointerMessage, pointerEvents } from '../src/events/index.js'
import { takeMessages } from './support.js'

describe('pointerEvents', () => {
  it('reports moves with coordinates', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(pointerEvents(), 2))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        // jsdom has no PointerEvent constructor; MouseEvent carries the
        // same clientX/clientY the entry reads.
        const move = (x: number, y: number) =>
          window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: x, clientY: y }))
        move(10, 20)
        move(30, 40)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      PointerMessage.Moved({ x: 10, y: 20 }),
      PointerMessage.Moved({ x: 30, y: 40 }),
    ])
  })
})
