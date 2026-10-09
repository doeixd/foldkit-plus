/**
 * PlaceAt in a real browser: the popup opens under the trigger that opened
 * it. jsdom lays nothing out, so the geometry assertion lives here; the
 * jsdom test only checks that the mount is registered.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import {
  KeepWithin,
  PlaceAt,
  PlaceAtPoint,
  placeFor,
  placedAbove,
  placedSide,
  placedTop,
} from '../src/interaction/placing.js'

afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelectorAll('style[data-placing]').forEach(style => style.remove())
  document.body.style.margin = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

/** `top` has to be a stylesheet rule. The fit clears an inline `top`, which is
 *  how a flip's `top: auto` gives the variable back. */
const rule = (css: string): void => {
  const style = document.createElement('style')
  style.dataset.placing = ''
  style.textContent = css
  document.head.append(style)
}

const layout = () => {
  rule(`.fk-placed { position: absolute; width: 120px; height: 40px; top: var(${placedTop}, 0px); }`)
  const bar = document.createElement('div')
  bar.style.cssText = 'position: relative; display: flex; margin: 48px 0 0 32px; border: 0;'
  const file = document.createElement('button')
  file.id = 'placing-file'
  file.textContent = 'File'
  file.style.cssText = 'width: 80px; height: 32px;'
  const edit = document.createElement('button')
  edit.id = 'placing-edit'
  edit.textContent = 'Edit'
  edit.style.cssText = 'width: 80px; height: 32px;'
  const popup = document.createElement('div')
  popup.className = 'fk-placed'
  bar.append(file, edit, popup)
  document.body.append(bar)
  return { file, edit, popup }
}

it('opens under the named trigger and clears the offset when it goes', async () => {
  const { file, edit, popup } = layout()
  const fiber = Effect.runFork(
    Stream.runDrain(PlaceAt({ triggerId: 'placing-edit', gap: 4 }).f(popup, liveViewStateChanges)),
  )
  try {
    await vi.waitFor(() => expect(popup.style.left).not.toBe(''))
    const placed = popup.getBoundingClientRect()
    const trigger = edit.getBoundingClientRect()
    expect(placed.left).toBeCloseTo(trigger.left, 0)
    expect(placed.top).toBeCloseTo(trigger.bottom + 4, 0)
    expect(placed.left).toBeGreaterThan(file.getBoundingClientRect().left + 40)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
  expect(popup.style.left).toBe('')
  expect(popup.style.getPropertyValue(placedTop)).toBe('')
})

it('opens with its top-left on a viewport point', async () => {
  const { popup } = layout()
  const point = { x: 140, y: 90 }
  const fiber = Effect.runFork(Stream.runDrain(PlaceAtPoint(point).f(popup, liveViewStateChanges)))
  try {
    await vi.waitFor(() => expect(popup.style.left).not.toBe(''))
    const placed = popup.getBoundingClientRect()
    expect(placed.left).toBeCloseTo(point.x, 0)
    expect(placed.top).toBeCloseTo(point.y, 0)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
  expect(popup.style.left).toBe('')
  expect(popup.style.getPropertyValue(placedTop)).toBe('')
})

const pinViewport = (): void => {
  document.documentElement.style.overflow = 'hidden'
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'
}

const popupIn = (fallbackTop: string): HTMLElement => {
  pinViewport()
  rule(
    `.fk-overflow { position: absolute; width: 120px; height: 100px; left: 0; top: var(${placedTop}, ${fallbackTop}); }`,
  )
  const host = document.createElement('div')
  host.style.cssText = 'position: relative; height: 24px;'
  const popup = document.createElement('div')
  popup.className = 'fk-overflow'
  host.append(popup)
  document.body.append(host)
  return popup
}

const settled = async (popup: HTMLElement): Promise<void> => {
  await vi.waitFor(() => expect(popup.style.left).not.toBe(''))
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

const compose = (popup: HTMLElement, point: { x: number; y: number }, withinFirst: boolean) => {
  const placed = PlaceAtPoint(point).f(popup, liveViewStateChanges)
  const fitted = KeepWithin().f(popup, liveViewStateChanges)
  return Stream.mergeAll(withinFirst ? [fitted, placed] : [placed, fitted], {
    concurrency: 'unbounded',
  })
}

it('judges the placed box, not the fallback, whichever mount starts first', async () => {
  for (const withinFirst of [false, true]) {
    const popup = popupIn(`${window.innerHeight - 40}px`)
    const before = popup.getBoundingClientRect()
    expect(
      placeFor(
        { top: before.top, right: before.right, bottom: before.bottom, height: before.height },
        { width: document.documentElement.clientWidth, height: window.innerHeight },
      ).flip,
    ).toBe(true)
    const fiber = Effect.runFork(Stream.runDrain(compose(popup, { x: 48, y: 36 }, withinFirst)))
    try {
      await settled(popup)
      const placed = popup.getBoundingClientRect()
      expect(placed.top, `withinFirst ${withinFirst}`).toBeCloseTo(36, 0)
      expect(placed.left, `withinFirst ${withinFirst}`).toBeCloseTo(48, 0)
      expect(popup.style.bottom, `withinFirst ${withinFirst}`).toBe('')
      expect(popup.getAttribute(placedSide), `withinFirst ${withinFirst}`).toBeNull()
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      popup.parentElement?.remove()
    }
  }
})

it('shifts a point up when the menu would hang off the bottom', async () => {
  for (const withinFirst of [false, true]) {
    const popup = popupIn('0px')
    const point = { x: 48, y: window.innerHeight - 20 }
    const fiber = Effect.runFork(Stream.runDrain(compose(popup, point, withinFirst)))
    try {
      await settled(popup)
      const placed = popup.getBoundingClientRect()
      expect(placed.bottom, `withinFirst ${withinFirst}`).toBeCloseTo(window.innerHeight - 8, 0)
      expect(placed.left, `withinFirst ${withinFirst}`).toBeCloseTo(48, 0)
      expect(popup.style.bottom, `withinFirst ${withinFirst}`).toBe('')
      expect(popup.style.top, `withinFirst ${withinFirst}`).not.toBe('auto')
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      popup.parentElement?.remove()
    }
  }
})

it('flips a trigger placed past the bottom even when the fit ran first', async () => {
  pinViewport()
  rule(
    `.fk-trigger-popup { position: absolute; width: 120px; height: 80px; top: var(${placedTop}, 0px); }`,
  )
  const host = document.createElement('div')
  host.style.cssText = 'position: relative; height: 20px;'
  const trigger = document.createElement('button')
  trigger.id = 'placing-low'
  trigger.textContent = 'Low'
  trigger.style.cssText = `position: absolute; left: 0; top: ${window.innerHeight - 30}px; width: 40px; height: 20px;`
  const popup = document.createElement('div')
  popup.className = 'fk-trigger-popup'
  host.append(trigger, popup)
  document.body.append(host)
  const before = popup.getBoundingClientRect()
  expect(before.bottom).toBeLessThan(window.innerHeight)
  const placed = PlaceAt({ triggerId: 'placing-low', gap: 4 }).f(popup, liveViewStateChanges)
  const fitted = KeepWithin().f(popup, liveViewStateChanges)
  const fiber = Effect.runFork(
    Stream.runDrain(Stream.mergeAll([fitted, placed], { concurrency: 'unbounded' })),
  )
  try {
    await settled(popup)
    expect(popup.style.bottom).toBe('calc(100% + 4px)')
    expect(popup.style.top).toBe('auto')
    expect(popup.getAttribute(placedSide)).toBe(placedAbove)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('flips an overflowing panel above its anchor', async () => {
  const popup = popupIn(`${window.innerHeight - 40}px`)
  const fiber = Effect.runFork(Stream.runDrain(KeepWithin().f(popup, liveViewStateChanges)))
  try {
    await vi.waitFor(() => expect(popup.style.bottom).toBe('calc(100% + 4px)'))
    expect(popup.style.top).toBe('auto')
    expect(popup.getAttribute(placedSide)).toBe(placedAbove)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})
