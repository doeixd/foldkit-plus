// @vitest-environment jsdom
/**
 * Keyboard entry: presses (with repeat) and releases off the real window,
 * and teardown on stream end.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { KeyboardMessage, keyboardEvents } from '../src/events/index.js'
import { takeMessages } from './support.js'

const key = (type: string, init: KeyboardEventInit) =>
  window.dispatchEvent(new window.KeyboardEvent(type, init))

describe('keyboardEvents', () => {
  it('reports presses, repeats, and releases with their keys', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(keyboardEvents(), 4))
        // One at a time with room to propagate: a synchronous burst can
        // outrun the merge and close the take before a keyup arrives.
        const press = function* (type: string, init: KeyboardEventInit) {
          key(type, init)
          for (let i = 0; i < 10; i++) {
            yield* Effect.yieldNow
          }
        }
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        yield* press('keydown', { key: 'a', repeat: false })
        yield* press('keydown', { key: 'a', repeat: true })
        yield* press('keyup', { key: 'a' })
        yield* press('keydown', { key: 'Enter', ctrlKey: true })
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      KeyboardMessage.Pressed({
        key: 'a',
        repeat: false,
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      }),
      KeyboardMessage.Pressed({
        key: 'a',
        repeat: true,
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      }),
      KeyboardMessage.Released({ key: 'a' }),
      KeyboardMessage.Pressed({
        key: 'Enter',
        repeat: false,
        ctrl: true,
        shift: false,
        alt: false,
        meta: false,
      }),
    ])
  })
})
