// @vitest-environment jsdom
/**
 * Keyboard entry: presses (with repeat) and releases off the real window,
 * and a press's default cancelled when the predicate picks it.
 */
import { Effect, Fiber, type Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { KeyboardMessage, keyboardEvents, matchHotkey } from '../src/events/index.js'
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

  /** Whether each event's default was cancelled once dispatched, and the keys reported. */
  const dispatched = (
    stream: Stream.Stream<KeyboardMessage>,
    events: ReadonlyArray<KeyboardEvent>,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, events.length))
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        // `dispatchEvent` returns once every listener has run: a default
        // cancelled later, as a mapped stream would, is too late to count.
        const prevented = events.map(event => !window.dispatchEvent(event))
        const messages = yield* Fiber.join(fiber)
        return { prevented, keys: messages.map(message => message.key) }
      }),
    )

  const events = () => [
    new window.KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }),
    new window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }),
    new window.KeyboardEvent('keydown', { key: 's', cancelable: true }),
    new window.KeyboardEvent('keyup', { key: 'ArrowUp', cancelable: true }),
  ]

  it('cancels the default of the presses the predicate picks, and reports every key', async () => {
    const result = await dispatched(
      keyboardEvents({
        preventDefault: press => press.key === 'ArrowUp' || matchHotkey('ctrl+s', press),
      }),
      events(),
    )
    expect(result).toEqual({
      prevented: [true, true, false, false],
      keys: ['ArrowUp', 's', 's', 'ArrowUp'],
    })
  })

  it('cancels nothing without a predicate', async () => {
    expect((await dispatched(keyboardEvents(), events())).prevented).toEqual([
      false,
      false,
      false,
      false,
    ])
  })
})
