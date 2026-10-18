/**
 * `KeyboardInset` on a real page. No browser here opens a keyboard, and a test runs in a
 * frame whose visual viewport no page zoom reaches, so the visual viewport's height is set
 * on the page's own object and its own `resize` sent: the Mount follows it, and takes its
 * property away when it ends. What the height means is `keyboardInset`'s unit test.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { KEYBOARD_INSET, KeyboardInset } from '../src/dom/keyboard-inset.js'

const viewport = window.visualViewport!

/** The keyboard opening (`covered` pixels) or closing (0), as the visual viewport reports it. */
const keyboard = (covered: number) => {
  Object.defineProperty(viewport, 'height', {
    configurable: true,
    get: () => window.innerHeight - covered,
  })
  viewport.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  // Back to the prototype's own getter.
  Reflect.deleteProperty(viewport, 'height')
  document.body.replaceChildren()
})

it('writes what the keyboard covers, follows it, and clears it when it ends', async () => {
  const panel = document.createElement('div')
  document.body.append(panel)
  const fiber = Effect.runFork(Stream.runDrain(KeyboardInset({}).f(panel, liveViewStateChanges)))
  const written = () => panel.style.getPropertyValue(KEYBOARD_INSET)
  await vi.waitFor(() => expect(written()).toBe('0px'))
  keyboard(300)
  expect(written()).toBe('300px')
  keyboard(0)
  expect(written()).toBe('0px')
  await Effect.runPromise(Fiber.interrupt(fiber))
  expect(written()).toBe('')
  // Ended: a later change writes nothing.
  keyboard(300)
  expect(written()).toBe('')
})
