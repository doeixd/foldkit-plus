/// <reference types="@vitest/browser-playwright" />
/**
 * The stepper on a real page: a held press steps again and again, ends when the
 * press does, and stops at a bound; Enter and Space hold the same way.
 * Progress is read from the drawn value; the one negative claim (nothing steps
 * after a release) waits out several intervals.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { MAX, MIN, START, repeatArgs } from '../src/stepper/app.js'
import { mountStepper } from '../src/stepper/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'stepper-host'
  document.body.appendChild(container)
  handle = mountStepper(container)
  await vi.waitFor(() => expect(value()).toBe(START))
})

afterEach(() => {
  handle?.dispose()
  frames?.dispose()
  document.body.replaceChildren()
})

const button = (name: 'Less' | 'More') =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
const value = () => Number(document.querySelector('output')?.textContent)

const pointer = (target: HTMLElement, type: string) =>
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, button: 0, pointerType: 'mouse', bubbles: true }),
  )

/** Several repeat intervals, for a claim that nothing happens. */
const quiet = () => new Promise(resolve => setTimeout(resolve, repeatArgs.intervalMs * 6))

test('a held press steps again and again, and a release ends it', async () => {
  pointer(button('More'), 'pointerdown')
  await vi.waitFor(() => expect(value()).toBeGreaterThan(START + 3))
  expect(button('More').getAttribute('data-holding')).toBe('true')
  pointer(button('More'), 'pointerup')
  await vi.waitFor(() => expect(button('More').hasAttribute('data-holding')).toBe(false))
  await frames?.settle()
  const rested = value()
  await quiet()
  expect(value()).toBe(rested)
})

test('the pointer leaving the button ends the hold', async () => {
  pointer(button('Less'), 'pointerdown')
  await vi.waitFor(() => expect(value()).toBeLessThan(START - 1))
  pointer(button('Less'), 'pointerleave')
  await vi.waitFor(() => expect(button('Less').hasAttribute('data-holding')).toBe(false))
  await frames?.settle()
  const rested = value()
  await quiet()
  expect(value()).toBe(rested)
})

test('a hold runs to the bound and stops there, and the button works again after it', async () => {
  pointer(button('More'), 'pointerdown')
  await vi.waitFor(() => expect(value()).toBe(MAX), { timeout: 8000 })
  await frames?.settle()
  await quiet()
  expect(value()).toBe(MAX)
  pointer(button('More'), 'pointerup')
  await vi.waitFor(() => expect(button('More').getAttribute('aria-disabled')).toBe('true'))

  // Back off by one press: the first step moves by one, from the bound.
  pointer(button('Less'), 'pointerdown')
  await vi.waitFor(() => expect(value()).toBeLessThan(MAX))
  pointer(button('Less'), 'pointerup')
  await vi.waitFor(() => expect(button('Less').hasAttribute('data-holding')).toBe(false))
  const lowered = value()
  // The More button must step again: a release it never heard would leave it held for good.
  pointer(button('More'), 'pointerdown')
  await vi.waitFor(() => expect(value()).toBeGreaterThan(lowered))
  pointer(button('More'), 'pointerup')
})

test('a hold down to the lower bound stops at it', async () => {
  pointer(button('Less'), 'pointerdown')
  await vi.waitFor(() => expect(value()).toBe(MIN), { timeout: 8000 })
  await quiet()
  expect(value()).toBe(MIN)
  pointer(button('Less'), 'pointerup')
})

test.each([['Enter'], ['Space']])(
  '%s held on the focused button steps and a release ends it',
  async key => {
    button('More').focus()
    await frames?.settle()
    await userEvent.keyboard(`{${key}>}`)
    await vi.waitFor(() => expect(value()).toBeGreaterThan(START + 3))
    await userEvent.keyboard(`{/${key}}`)
    await vi.waitFor(() => expect(button('More').hasAttribute('data-holding')).toBe(false))
    await frames?.settle()
    const rested = value()
    await quiet()
    expect(value()).toBe(rested)
    expect(document.activeElement).toBe(button('More'))
  },
)
