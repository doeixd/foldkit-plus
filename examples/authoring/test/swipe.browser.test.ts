/// <reference types="@vitest/browser-playwright" />
/**
 * The swipeable row on a real page: a pointer swipe reveals the actions and a
 * press on one fires it; the keyboard reaches the same actions and fires the
 * same Message; Escape and focus leaving put them away.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { mountSwipe } from '../src/swipe/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  const outside = document.createElement('button')
  outside.id = 'outside'
  outside.textContent = 'Elsewhere'
  const container = document.createElement('div')
  container.id = 'swipe-host'
  document.body.append(container, outside)
  handle = mountSwipe(container)
  await vi.waitFor(() => expect(face()).not.toBeNull())
})

afterEach(() => {
  handle?.dispose()
  frames?.dispose()
  document.body.replaceChildren()
})

const face = () => document.querySelector<HTMLElement>('[aria-label="Invoice from Acme"]')!
const status = () => document.querySelector('[role="status"]')?.textContent
const action = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    button => button.textContent === name,
  )!
/** What has focus, by name: a failed comparison of elements cannot be written to a JSON report. */
const focused = () =>
  document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent

const side = () => face().getAttribute('data-swipe')

const pointer = (type: string, x: number) =>
  face().dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      button: 0,
      pointerType: 'mouse',
      clientX: x,
      clientY: 10,
      bubbles: true,
    }),
  )

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Drag the face by `by` pixels, then rest before letting go, so the release has
 * no speed (the swipe reads the last 100ms) and its distance alone decides.
 */
const drag = async (by: number) => {
  const from = face().getBoundingClientRect().left + 200
  pointer('pointerdown', from)
  pointer('pointermove', from + by / 2)
  pointer('pointermove', from + by)
  await vi.waitFor(() => expect(face().hasAttribute('data-dragging')).toBe(true))
  await pause(150)
  pointer('pointerup', from + by)
}

/**
 * A short, fast drag: the release speed decides, not the distance. The speed is read from the
 * events' own time stamps, which a run of synchronous dispatches may stamp alike (a speed of 0)
 * and a sleep between them can stretch past the 100ms the swipe reads, so the waits spin: 30px
 * in 8ms is far over the 0.4px a millisecond that makes a flick.
 */
const flick = (by: number) => {
  const spin = (ms: number) => {
    const until = performance.now() + ms
    while (performance.now() < until) {}
  }
  const from = face().getBoundingClientRect().left + 200
  pointer('pointerdown', from)
  spin(4)
  pointer('pointermove', from + by / 2)
  spin(4)
  pointer('pointermove', from + by)
  pointer('pointerup', from + by)
}

test('a swipe past half of the end actions reveals them, and a press on Archive fires it', async () => {
  await drag(-80)
  await vi.waitFor(() => expect(side()).toBe('end'))
  // Playwright refuses to press an element another one covers: the face has moved off it.
  await userEvent.click(action('Archive'))
  await vi.waitFor(() => expect(status()).toBe('Archived'))
  await vi.waitFor(() => expect(side()).toBeNull())
})

test('a short swipe closes again, a fast one opens, and a long one runs the first action', async () => {
  await drag(-30)
  await frames?.settle()
  expect(side()).toBeNull()
  expect(face().hasAttribute('data-dragging')).toBe(false)

  flick(-30)
  await vi.waitFor(() => expect(side()).toBe('end'))
  // A fast drag back the other way closes it.
  await frames?.settle()
  flick(30)
  await vi.waitFor(() => expect(side()).toBeNull())

  await drag(-340)
  await vi.waitFor(() => expect(status()).toBe('Archived'))
  expect(side()).toBeNull()
})

test('the start side holds Pin, which a press on it fires', async () => {
  await drag(80)
  await vi.waitFor(() => expect(side()).toBe('start'))
  await userEvent.click(action('Pin'))
  await vi.waitFor(() => expect(status()).toBe('Pinned'))
})

test('the actions behind a closed row take neither a press nor Tab', async () => {
  expect(action('Archive').closest('[inert]')).not.toBeNull()
  face().focus()
  await frames?.settle()
  await userEvent.keyboard('{Tab}')
  await vi.waitFor(() => expect(focused()).toBe('Elsewhere'))
})

test('the keyboard reveals the end actions, reaches Archive by Tab, and fires the same action', async () => {
  face().focus()
  await frames?.settle()
  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(side()).toBe('end'))
  expect(action('Archive').closest('[inert]')).toBeNull()
  await frames?.settle()
  await userEvent.keyboard('{Tab}')
  await vi.waitFor(() => expect(focused()).toBe('Archive'))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(status()).toBe('Archived'))
  // The action that held focus is inert now: focus goes back to the row, not to the page.
  await vi.waitFor(() => expect(focused()).toBe('Invoice from Acme'))
  expect(side()).toBeNull()
})

test('the right arrow reveals the start actions, and the opposite arrow closes what is open', async () => {
  face().focus()
  await frames?.settle()
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(side()).toBe('start'))
  await frames?.settle()
  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(side()).toBeNull())
})

test('Escape closes the row from the face, and from an action focus returns to the face', async () => {
  face().focus()
  await frames?.settle()
  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(side()).toBe('end'))
  await frames?.settle()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(side()).toBeNull())
  expect(focused()).toBe('Invoice from Acme')

  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(side()).toBe('end'))
  await frames?.settle()
  await userEvent.keyboard('{Tab}')
  await vi.waitFor(() => expect(focused()).toBe('Archive'))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(side()).toBeNull())
  await vi.waitFor(() => expect(focused()).toBe('Invoice from Acme'))
})

test('Escape on a closed row is left alone, for whatever closes the page around it', async () => {
  face().focus()
  await frames?.settle()
  const escape = () =>
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  const closed = escape()
  face().dispatchEvent(closed)
  expect(closed.defaultPrevented).toBe(false)

  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(side()).toBe('end'))
  await frames?.settle()
  const open = escape()
  face().dispatchEvent(open)
  expect(open.defaultPrevented).toBe(true)
})

test('focus leaving the row for the page closes it, and moving between its parts does not', async () => {
  face().focus()
  await frames?.settle()
  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(side()).toBe('end'))
  await frames?.settle()
  await userEvent.keyboard('{Tab}')
  await vi.waitFor(() => expect(focused()).toBe('Archive'))
  await frames?.settle()
  expect(side()).toBe('end')
  await userEvent.keyboard('{Tab}{Tab}')
  await vi.waitFor(() => expect(focused()).toBe('Elsewhere'))
  await vi.waitFor(() => expect(side()).toBeNull())
})
