/**
 * The window's scroll across same-document navigations, in a real browser: a
 * pushed entry starts at the top, and Back returns where the entry was, even
 * when the screen it returns to is short for a moment before its content.
 */
import { beforeAll, expect, it } from 'vitest'
import { keepScroll } from '../src/scroll.js'

const page = document.createElement('div')
const tall = (height: number) => {
  page.style.height = `${height}px`
}

beforeAll(() => {
  document.body.appendChild(page)
  tall(4000)
  keepScroll()
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
