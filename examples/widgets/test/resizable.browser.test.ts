/**
 * The resizable split at a phone's width in a real browser: its status line sits
 * below the panels, not in their row where it squeezed the second panel to a
 * letter's width, and the thin handle is a finger's target to press.
 */
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import * as Resizable from '../src/resizable/app.js'
import { Resizable as ResizableView } from '../src/resizable/view.js'

afterEach(() => {
  document.body.replaceChildren()
})

test('at a phone’s width the panels keep their room, and the handle can be pressed', async () => {
  await page.viewport(390, 844)
  const container = document.createElement('div')
  container.id = 'resizable'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model: Resizable.Model,
      init: () => ({ model: Resizable.initial }),
      update: Resizable.update,
      view: (model, h) => ResizableView(model, h),
      container,
    }),
  )
  const separator = () => document.querySelector<HTMLElement>('[role="separator"]')
  await vi.waitFor(() => expect(separator()).not.toBeNull())
  const handle = separator()!
  const [first, second] = [handle.previousElementSibling!, handle.nextElementSibling!]
  const status = second.nextElementSibling!
  // The panels share the row; the status is below them, not a third column.
  expect(status.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    second.getBoundingClientRect().bottom,
  )
  expect(second.getBoundingClientRect().width).toBeGreaterThan(100)
  expect(first.getBoundingClientRect().top).toBe(second.getBoundingClientRect().top)
  // The handle draws thin; what a finger can press around it is 24px or more.
  const pressable = getComputedStyle(handle, '::before')
  const box = handle.getBoundingClientRect()
  const reach = box.width - parseFloat(pressable.left) - parseFloat(pressable.right)
  expect(reach).toBeGreaterThanOrEqual(24)
})
