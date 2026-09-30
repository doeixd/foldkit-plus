/**
 * The window's scroll across same-document navigations, in a real browser: a
 * pushed entry starts at the top, and Back returns where the entry was, even
 * when the screen it returns to is short for a moment before its content.
 * The stream is held as a runtime would hold its persistent entry: forked
 * once, interrupted when the page goes.
 */
import { Effect, Fiber, Stream } from 'effect'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { keepScroll } from '../src/dom/scroll.js'

const page = document.createElement('div')
const tall = (height: number) => {
  page.style.height = `${height}px`
}

let held: Fiber.Fiber<void> | null = null

beforeAll(async () => {
  document.body.appendChild(page)
  tall(4000)
  held = Effect.runFork(Stream.runDrain(keepScroll()))
  // The fork attaches a moment later; attaching sets manual restoration, so
  // that is the live signal. A throwaway navigation then proves events flow.
  const deadline = Date.now() + 5000
  while (window.history.scrollRestoration !== 'manual' && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 25))
  if (window.history.scrollRestoration !== 'manual')
    throw new Error(
      `scroll keeping did not attach (restoration is ${window.history.scrollRestoration})`,
    )
  window.scrollTo({ top: 111, behavior: 'instant' })
  document.body.click()
  window.history.pushState({}, '', '?probe')
  const settled = Date.now() + 5000
  while (window.scrollY !== 0 && Date.now() < settled)
    await new Promise(resolve => setTimeout(resolve, 25))
  if (window.scrollY !== 0) throw new Error('scroll keeping ignores navigations')
})

afterAll(async () => {
  if (held !== null) await Effect.runPromise(Fiber.interrupt(held))
  document.body.innerHTML = ''
})

const traversed = () =>
  new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }))

/** Scrolls to `top` as a reader would, and presses something there, as a link is followed. */
const readTo = (top: number) => {
  window.scrollTo({ top, behavior: 'instant' })
  document.body.click()
}

it('starts a pushed entry at the top, and returns to where the last one was on Back', async () => {
  readTo(500)
  window.history.pushState({}, '', '?opened=1')
  await expect.poll(() => window.scrollY).toBe(0)
  readTo(200)
  const back = traversed()
  window.history.back()
  await back
  await expect.poll(() => window.scrollY).toBe(500)
})

it('holds the place through a short loading screen that the content then fills', async () => {
  readTo(800)
  window.history.pushState({}, '', '?opened=2')
  await expect.poll(() => window.scrollY).toBe(0)
  const back = traversed()
  window.history.back()
  await back
  // What is drawn first is short: the window is clamped to it, then the content comes.
  tall(900)
  await new Promise(resolve => setTimeout(resolve, 100))
  tall(4000)
  await expect.poll(() => window.scrollY).toBe(800)
})

it('lets the reader scroll away while it would hold the place', async () => {
  readTo(600)
  window.history.pushState({}, '', '?opened=3')
  await expect.poll(() => window.scrollY).toBe(0)
  const back = traversed()
  window.history.back()
  await back
  await expect.poll(() => window.scrollY).toBe(600)
  window.dispatchEvent(new WheelEvent('wheel'))
  window.scrollTo({ top: 100, behavior: 'instant' })
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(window.scrollY).toBe(100)
})
