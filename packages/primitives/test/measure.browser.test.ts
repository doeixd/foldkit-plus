/**
 * `Measure` in a real browser: what jsdom cannot lay out. The properties it
 * writes place a box over the marked element, wherever the container scrolls.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { Measure, measured } from '../src/dom/measure.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/** A scrolling container of four 100px rows, the second marked, measured as `selected`. */
const mount = () => {
  const container = document.createElement('div')
  container.style.cssText = 'position: relative; height: 150px; overflow: auto; border: 3px solid'
  for (const index of [0, 1, 2, 3]) {
    const row = document.createElement('div')
    row.style.cssText = 'height: 100px; margin-left: 10px'
    if (index === 1) row.dataset['mark'] = ''
    container.appendChild(row)
  }
  document.body.appendChild(container)
  const fiber = Effect.runFork(
    Stream.runDrain(
      Measure({ targets: { selected: '[data-mark]' } }).f(container, liveViewStateChanges),
    ),
  )
  const read = (part: keyof ReturnType<typeof measured>) =>
    container.style.getPropertyValue(measured('selected')[part])
  return { container, rows: Array.from(container.children) as Array<HTMLElement>, read, fiber }
}

it('places the marked element within the scroll box, and keeps it there through a scroll', async () => {
  const { container, read, fiber } = mount()
  try {
    await vi.waitFor(() => expect(read('display')).toBe('block'))
    expect([read('x'), read('y'), read('h')]).toEqual(['10px', '100px', '100px'])
    container.scrollTop = 80
    container.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    // Where it is in the content: a box placed there scrolls with it.
    expect(read('y')).toBe('100px')
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('follows the mark, a change of size, and hides when nothing is marked', async () => {
  const { rows, read, fiber } = mount()
  try {
    await vi.waitFor(() => expect(read('y')).toBe('100px'))
    delete rows[1]!.dataset['mark']
    rows[2]!.dataset['mark'] = ''
    await vi.waitFor(() => expect(read('y')).toBe('200px'))
    rows[2]!.style.height = '40px'
    await vi.waitFor(() => expect(read('h')).toBe('40px'))
    delete rows[2]!.dataset['mark']
    await vi.waitFor(() => expect(read('display')).toBe('none'))
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('measures again when a marked element changes size with no change to the DOM', async () => {
  const { read, fiber } = mount()
  // As a stylesheet arriving does, or an image loading.
  const sheet = document.createElement('style')
  try {
    await vi.waitFor(() => expect(read('h')).toBe('100px'))
    sheet.textContent = '[data-mark] { height: 30px !important }'
    document.head.appendChild(sheet)
    await vi.waitFor(() => expect(read('h')).toBe('30px'))
  } finally {
    sheet.remove()
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('measures again when the container is resized and moves what it holds', async () => {
  const { container, rows, read, fiber } = mount()
  // Right-aligned, so a narrower container moves it without changing its size.
  rows[1]!.style.cssText = 'height: 100px; width: 50px; margin-left: auto'
  container.id = 'narrowed'
  const sheet = document.createElement('style')
  const expected = () =>
    `${rows[1]!.getBoundingClientRect().left - container.getBoundingClientRect().left - container.clientLeft}px`
  try {
    await vi.waitFor(() => expect(read('x')).toBe(expected()))
    const before = read('x')
    sheet.textContent = '#narrowed { width: 200px }'
    document.head.appendChild(sheet)
    await vi.waitFor(() => expect(read('x')).not.toBe(before))
    expect(read('x')).toBe(expected())
  } finally {
    sheet.remove()
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('measures again when the window is resized and a media query moves what it holds', async () => {
  const { page } = await import('vitest/browser')
  const { container, rows, read, fiber } = mount()
  // A fixed container and a fixed-size target: only the media query moves it.
  container.style.width = '300px'
  rows[1]!.style.width = '50px'
  const sheet = document.createElement('style')
  sheet.textContent = '@media (max-width: 600px) { [data-mark] { margin-left: 40px !important } }'
  document.head.appendChild(sheet)
  try {
    await vi.waitFor(() => expect(read('x')).toBe('10px'))
    await page.viewport(500, 900)
    await vi.waitFor(() => expect(read('x')).toBe('40px'))
  } finally {
    await page.viewport(1440, 900)
    sheet.remove()
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('rests once nothing changes, though writing its properties changes the container', async () => {
  const { container, read, fiber } = mount()
  try {
    await vi.waitFor(() => expect(read('display')).toBe('block'))
    const measure = vi.spyOn(container, 'getBoundingClientRect')
    for (const _ of [1, 2, 3, 4, 5]) await new Promise(resolve => requestAnimationFrame(resolve))
    expect(measure).not.toHaveBeenCalled()
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('measures a change as its records arrive, before the frame is painted', async () => {
  const { rows, read, fiber } = mount()
  try {
    await vi.waitFor(() => expect(read('y')).toBe('100px'))
    delete rows[1]!.dataset['mark']
    rows[2]!.dataset['mark'] = ''
    // The records' microtask runs before this one: no frame has passed.
    await Promise.resolve()
    expect(read('y')).toBe('200px')
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('measures again when something moves the target without a change or a resize', async () => {
  const { container, rows, read, fiber } = mount()
  const sheet = document.createElement('style')
  try {
    await vi.waitFor(() => expect(read('y')).toBe('100px'))
    // An image above it loads: its height arrives with no change to the DOM.
    const image = document.createElement('img')
    image.style.display = 'block'
    container.insertBefore(image, rows[0]!)
    await vi.waitFor(() => expect(read('y')).toBe('100px'))
    image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="30"/>')}`
    await vi.waitFor(() => expect(read('y')).toBe('130px'))
    image.remove()
    await vi.waitFor(() => expect(read('y')).toBe('100px'))

    // A row above it shrinks over a transition: measured to where it ends.
    rows[0]!.style.transition = 'height 150ms linear'
    await new Promise(resolve => requestAnimationFrame(resolve))
    rows[0]!.style.height = '60px'
    await vi.waitFor(() => expect(read('y')).toBe('60px'))
    // The transition can still have a frame to run after the height reads its
    // end value, and Measure measures on every frame of one: wait until it has
    // ended, so the next step sees only the stylesheet.
    await vi.waitFor(() => expect(rows[0]!.getAnimations()).toHaveLength(0))
    for (const _ of [1, 2]) await new Promise(resolve => requestAnimationFrame(resolve))

    // A font arrives: a stylesheet moved it first, as a font's metrics would.
    sheet.textContent = '[data-mark] { margin-top: 5px }'
    document.head.appendChild(sheet)
    for (const _ of [1, 2, 3]) await new Promise(resolve => requestAnimationFrame(resolve))
    expect(read('y')).toBe('60px')
    document.fonts.dispatchEvent(new Event('loadingdone'))
    await vi.waitFor(() => expect(read('y')).toBe('65px'))

    // And over an animation's frames, to where it ends.
    sheet.textContent += '@keyframes shrink { to { height: 20px } }'
    await vi.waitFor(() => expect(read('y')).toBe('65px'))
    rows[0]!.style.animation = 'shrink 150ms linear forwards'
    await vi.waitFor(() => expect(read('y')).toBe('25px'))
  } finally {
    sheet.remove()
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})
