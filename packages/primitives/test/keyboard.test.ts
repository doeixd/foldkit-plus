// @vitest-environment jsdom
/**
 * Keyboard entry: presses (with repeat) and releases off the real window,
 * and a press's default cancelled when the predicate picks it.
 */
import { Effect, Fiber, type Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  KeyboardMessage,
  isTypingTarget,
  keyboardEvents,
  matchHotkey,
} from '../src/events/index.js'
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
        code: '',
        typing: false,
        key: 'a',
        repeat: false,
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      }),
      KeyboardMessage.Pressed({
        code: '',
        typing: false,
        key: 'a',
        repeat: true,
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      }),
      KeyboardMessage.Released({ key: 'a' }),
      KeyboardMessage.Pressed({
        code: '',
        typing: false,
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

  const pressed = (events: ReadonlyArray<() => void>, count = events.length) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(keyboardEvents(), count))
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        for (const dispatch of events) {
          dispatch()
          for (let i = 0; i < 10; i++) yield* Effect.yieldNow
        }
        return yield* Fiber.join(fiber)
      }),
    )

  const inField = (tag: string, type?: string) => {
    const field = document.createElement(tag)
    if (type !== undefined) field.setAttribute('type', type)
    document.body.append(field)
    return field
  }

  it('reports the physical key, and whether the press was made typing in a field', async () => {
    const input = inField('input', 'text')
    const button = inField('input', 'button')
    const messages = await pressed([
      () =>
        input.dispatchEvent(
          new window.KeyboardEvent('keydown', {
            key: 'n',
            code: 'KeyN',
            bubbles: true,
            composed: true,
          }),
        ),
      () =>
        button.dispatchEvent(
          new window.KeyboardEvent('keydown', {
            key: 'n',
            code: 'KeyN',
            bubbles: true,
            composed: true,
          }),
        ),
    ])
    expect(
      messages.map(message => [
        message._tag === 'Pressed' ? message.code : '',
        message._tag === 'Pressed' && message.typing,
      ]),
    ).toEqual([
      ['KeyN', true],
      ['KeyN', false],
    ])
    input.remove()
    button.remove()
  })

  it('does not report a press made during a composition', async () => {
    const messages = await pressed(
      [
        () => key('keydown', { key: 'Process', isComposing: true }),
        () => key('keydown', { key: 'a', keyCode: 229 }),
        () => key('keydown', { key: 'b' }),
      ],
      1,
    )
    expect(messages.map(message => (message._tag === 'Pressed' ? message.key : ''))).toEqual(['b'])
  })
})

describe('isTypingTarget', () => {
  const make = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild
  }

  it.each([
    ['<input>', true],
    ['<input type="search">', true],
    ['<textarea></textarea>', true],
    ['<select></select>', true],
    ['<div contenteditable="true"></div>', true],
    ['<input type="checkbox">', false],
    ['<input type="range">', false],
    ['<input type="submit">', false],
    ['<button></button>', false],
    ['<div></div>', false],
  ])('%s is %s', (html, expected) => {
    // jsdom has no layout, so isContentEditable is read from the attribute below.
    const element = make(html)
    if (element instanceof HTMLElement && element.getAttribute('contenteditable') === 'true') {
      Object.defineProperty(element, 'isContentEditable', { value: true })
    }
    expect(isTypingTarget(element)).toBe(expected)
  })

  it('is false for no target', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
  })
})
