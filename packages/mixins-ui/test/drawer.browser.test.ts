/// <reference types="@vitest/browser-playwright" />
/**
 * The Drawer on a real page: docked, it peeks with its handle showing and
 * opens to its height; the handle's bar bends into a chevron going down; a
 * drag follows the finger and lets go open or down, and the click a browser
 * sends after a drag toggles nothing; peeking, its body is hidden.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { belowLg, down, mount, panel, settled } from './drawerFixture.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const bend = (handle: Element) => getComputedStyle(handle, '::before').rotate
const body = (element: Element) => getComputedStyle(element.querySelector('#drawer-body')!)

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** A touch pointer on the handle's middle, `dy` pixels below it. */
const touch = (handle: HTMLElement) => {
  const box = handle.getBoundingClientRect()
  return (type: string, dy: number) =>
    handle.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 9,
        button: 0,
        pointerType: 'touch',
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2 + dy,
      }),
    )
}

/** Moves the handle `by` pixels down in eight steps `pause` apart, and lets go. */
const drag = async (handle: HTMLElement, by: number, pause = 16) => {
  const at = touch(handle)
  at('pointerdown', 0)
  for (let step = 1; step <= 8; step++) {
    await wait(pause)
    at('pointermove', (by * step) / 8)
  }
  await wait(pause)
  at('pointerup', by)
}

test('peeks with its handle showing, and opens to its height on a press', async () => {
  const runtime = mount(false)
  try {
    const element = await panel()
    await settled(element)
    // Down by all of it but the 80px that peek.
    expect(down(element)).toBe(320)
    const handle = element.querySelector<HTMLElement>('button')!
    expect(body(element).visibility).toBe('hidden')
    expect(handle.getAttribute('aria-label')).toBe('Show the tools')
    handle.click()
    await vi.waitFor(() => expect(element.dataset['open']).toBe('true'))
    await settled(element)
    expect(down(element)).toBe(0)
    expect(body(element).visibility).toBe('visible')
    expect(handle.getAttribute('aria-expanded')).toBe('true')
  } finally {
    runtime.dispose()
  }
})

test('bends its handle into a chevron going down, and flat when open', async () => {
  const runtime = mount(false)
  try {
    const element = await panel()
    const handle = element.querySelector<HTMLElement>('button')!
    await settled(element)
    expect(bend(handle)).toBe('-22deg')
    handle.click()
    await vi.waitFor(() => expect(element.dataset['open']).toBe('true'))
    await settled(element)
    expect(bend(handle)).toBe('0deg')
  } finally {
    runtime.dispose()
  }
})

test('follows a drag, lets go down past a quarter of it, and the click after toggles nothing', async () => {
  const runtime = mount(true)
  try {
    const element = await panel()
    const handle = element.querySelector<HTMLElement>('button')!
    await settled(element)
    const at = touch(handle)
    at('pointerdown', 0)
    await wait(20)
    at('pointermove', 200)
    // Where the finger is, and the bar bent by the share of the panel it came.
    await vi.waitFor(() => expect(down(element)).toBe(200))
    expect(Number.parseFloat(bend(handle))).toBeCloseTo(-11, 0)
    // Still before letting go, so it reads as a slow release, not a flick.
    await wait(150)
    at('pointerup', 200)
    await vi.waitFor(() => expect(element.dataset['open']).toBe('false'))
    // The click a browser sends after the drag is no press.
    handle.click()
    await wait(50)
    expect(element.dataset['open']).toBe('false')
    // The next press is one.
    handle.click()
    await vi.waitFor(() => expect(element.dataset['open']).toBe('true'))
  } finally {
    runtime.dispose()
  }
})

test('a short slow drag rests where it was; dragged up from the peek, it opens', async () => {
  const runtime = mount(false)
  try {
    const element = await panel()
    const handle = element.querySelector<HTMLElement>('button')!
    await settled(element)
    await drag(handle, -40, 40)
    await settled(element)
    expect(element.dataset['open']).toBe('false')
    // What a browser sends after that drag.
    handle.click()
    await drag(handle, -200, 30)
    await vi.waitFor(() => expect(element.dataset['open']).toBe('true'))
  } finally {
    runtime.dispose()
  }
})

test('docked below lg only: wider, it is the column it sits in, its body shown though down', async () => {
  await page.viewport(1200, 800)
  const runtime = mount(false, belowLg)
  try {
    const element = await panel()
    const handle = element.querySelector<HTMLElement>('button')!
    expect(getComputedStyle(element).position).toBe('static')
    expect(getComputedStyle(handle).display).toBe('none')
    expect(body(element).visibility).toBe('visible')
    await page.viewport(400, 800)
    await vi.waitFor(() => expect(getComputedStyle(element).position).toBe('fixed'))
    expect(getComputedStyle(handle).display).toBe('block')
    expect(body(element).visibility).toBe('hidden')
  } finally {
    runtime.dispose()
    await page.viewport(414, 896)
  }
})

test('a swipe down the grip drags it as the handle does, and a sideways one leaves it', async () => {
  const runtime = mount(true)
  try {
    const element = await panel()
    const grip = element.querySelector<HTMLElement>('#grip')!
    await settled(element)
    expect(getComputedStyle(grip).touchAction).toBe('pan-x')
    await drag(grip, 200, 30)
    await vi.waitFor(() => expect(element.dataset['open']).toBe('false'))
    // Then a press on the handle is one, not the end of that swipe.
    element.querySelector<HTMLElement>('button')!.click()
    await vi.waitFor(() => expect(element.dataset['open']).toBe('true'))
  } finally {
    runtime.dispose()
  }
})

test('a click on a control in the grip reaches it, and drags nothing', async () => {
  const runtime = mount(true)
  try {
    const element = await panel()
    await settled(element)
    const inGrip = element.querySelector<HTMLElement>('#in-grip')!
    const clicked = vi.fn()
    inGrip.addEventListener('click', clicked)
    // A real press: a capture taken on the way down would send the click to the grip.
    await userEvent.click(inGrip)
    expect(clicked).toHaveBeenCalledOnce()
    expect(element.dataset['dragging']).toBeUndefined()
    expect(element.dataset['open']).toBe('true')
  } finally {
    runtime.dispose()
  }
})

test('takes a finger-sized handle, drawn into the space around it', async () => {
  const runtime = mount(true)
  try {
    const element = await panel()
    const handle = element.querySelector<HTMLElement>('button')!
    expect(handle.getBoundingClientRect().height).toBe(44)
    // Most of it overlaps what is above and below: it takes 20px of the column.
    const grip = element.querySelector<HTMLElement>('#grip')!
    expect(grip.getBoundingClientRect().top - element.getBoundingClientRect().top).toBeLessThan(40)
  } finally {
    runtime.dispose()
  }
})
