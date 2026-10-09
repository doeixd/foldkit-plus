/**
 * PlaceAt in a real browser: the popup opens under the trigger that opened
 * it. jsdom lays nothing out, so the geometry assertion lives here; the
 * jsdom test only checks that the mount is registered.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { PlaceAt, placedTop } from '../src/interaction/placing.js'

afterEach(() => {
  document.body.replaceChildren()
})

const layout = () => {
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
  popup.style.cssText = `position: absolute; width: 120px; height: 40px; top: var(${placedTop}, 0px);`
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
