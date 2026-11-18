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

it('writes where the entry was as the page is left, for a reload to read', () => {
  readTo(350)
  // A reload runs `beforeunload`; Foldkit's runtime is gone by `pagehide`, so this is the write that counts.
  window.dispatchEvent(new Event('beforeunload'))
  const stored: ReadonlyArray<readonly [string, number]> = JSON.parse(
    sessionStorage.getItem('foldkit:scroll') ?? '[]',
  )
  const here = window.navigation.currentEntry?.key
  expect(stored.find(([key]) => key === here)?.[1]).toBe(350)
})

it('lets go once the page stands still at the offset, not after a fixed time', async () => {
  readTo(700)
  window.history.pushState({}, '', '?opened=4')
  await expect.poll(() => window.scrollY).toBe(0)
  const back = traversed()
  window.history.back()
  await back
  await expect.poll(() => window.scrollY).toBe(700)
  await new Promise(resolve => setTimeout(resolve, 200))
  // Not a reader's act, so a hold still running (it ran for two seconds) would put it back at once.
  window.scrollTo({ top: 120, behavior: 'instant' })
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(window.scrollY).toBe(120)
})

it('gives the window back when the holding fiber ends', async () => {
  const fiber = held
  if (fiber === null) throw new Error('scroll keeping never attached')
  await Effect.runPromise(Fiber.interrupt(fiber))
  // The afterAll interrupts the same fiber: it must not run twice.
  held = null
  expect(window.history.scrollRestoration).toBe('auto')
  window.scrollTo({ top: 400, behavior: 'instant' })
  document.body.click()
  window.history.pushState({}, '', '?released=1')
  window.history.pushState({}, '', '?released=2')
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(window.scrollY).toBe(400)
})

it('keeps a scrolling element the same way, where the window does not scroll', async () => {
  const box = document.createElement('div')
  box.style.cssText =
    'height: 200px; overflow: auto; position: fixed; inset: 0 auto auto 0; width: 200px;'
  const inner = document.createElement('div')
  inner.style.height = '3000px'
  box.appendChild(inner)
  document.body.appendChild(box)
  const fiber = Effect.runFork(
    Stream.runDrain(keepScroll({ scroller: () => box, storageKey: 'foldkit:scroll-box' })),
  )
  await new Promise(resolve => setTimeout(resolve, 100))
  try {
    box.scrollTo({ top: 600, behavior: 'instant' })
    box.click()
    window.history.pushState({}, '', '?box=1')
    await expect.poll(() => box.scrollTop).toBe(0)
    box.scrollTo({ top: 50, behavior: 'instant' })
    box.click()
    const back = traversed()
    window.history.back()
    await back
    await expect.poll(() => box.scrollTop).toBe(600)
    box.dispatchEvent(new Event('wheel'))
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
    box.remove()
  }
})
