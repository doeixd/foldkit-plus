/// <reference types="@vitest/browser-playwright" />
/**
 * `pointedLinks` on a touch screen, with the touches Chromium sends for a
 * real finger: a tap reads its link at once. A finger lifts within a few
 * milliseconds and the browser then sends `pointerout`, which would cancel a
 * mouse's wait; only reading the finger's link without one keeps it, before
 * the click that follows.
 */
import { Effect, Fiber, Stream } from 'effect'
import { toString as urlToString } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
import { cdp } from 'vitest/browser'
import { pointedLinks } from '../src/dom/index.js'

/** Where an element's middle is on the top page, which is where CDP's touches land. */
const middleOnPage = (element: Element): { readonly x: number; readonly y: number } => {
  const box = element.getBoundingClientRect()
  let x = box.left + box.width / 2
  let y = box.top + box.height / 2
  for (let frame = window.frameElement; frame !== null;) {
    const outer = frame.getBoundingClientRect()
    x += outer.left
    y += outer.top
    frame = frame.ownerDocument.defaultView?.frameElement ?? null
  }
  return { x, y }
}

afterEach(() => document.body.replaceChildren())

it('reads the link a finger taps at once, though the finger lifts before any wait', async () => {
  const link = document.createElement('a')
  link.href = '/tapped'
  link.textContent = 'tapped'
  link.style.cssText = 'display: block; width: 200px; padding: 40px'
  // A tap that navigates would take the test page away.
  link.addEventListener('click', event => event.preventDefault())
  // A tap also focuses the link once the finger lifts, and focus counts after
  // its own wait; held off here, only the finger can read the link.
  link.addEventListener('mousedown', event => event.preventDefault())
  document.body.append(link)
  const kinds: Array<string> = []
  link.addEventListener('pointerover', event => kinds.push(event.pointerType))
  const read: Array<string> = []
  const fiber = Effect.runFork(
    Stream.runForEach(pointedLinks(), url => Effect.sync(() => read.push(urlToString(url)))),
  )
  try {
    // The stream listens once its scope is open: let it start.
    await new Promise(resolve => setTimeout(resolve, 50))
    const point = middleOnPage(link)
    await cdp().send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await cdp().send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => read).toEqual([`${window.location.origin}/tapped`])
    expect(kinds).toEqual(['touch'])
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})
