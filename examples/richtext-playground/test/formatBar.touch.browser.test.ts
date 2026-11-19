/**
 * The playground's formatting bar on a touch phone, in Chromium with a coarse pointer: its
 * controls are 44px targets, and what stays beside More and the export button fits one row at
 * the narrowest phones, every control whole and on the screen. It was two rows of the bar and a
 * third for the export button, about 145px of the first screen.
 */
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { Model, init, update } from '../src/app.js'
import { stylesheet } from '../src/style.js'
import { PlaygroundView } from '../src/view.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = stylesheet
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'playground'
  document.body.append(container)
  Runtime.embed(Runtime.makeElement({ Model, container, init, update, view: PlaygroundView }))
  await vi.waitFor(() => expect(document.querySelector('[role="toolbar"]')).not.toBeNull())
}

it.each([390, 360])(
  'at %ipx the bar and the export button are one row of whole 44px controls',
  async width => {
    await page.viewport(width, 844)
    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    await mount()
    const bar = document.querySelector('[role="toolbar"][aria-label="Formatting"]')!
    // The row the bar and the page's own actions share, which is as tall as its tallest control.
    const row = bar.parentElement!
    // The bar compacts once its width is measured, a frame after the first drawing.
    await vi.waitFor(() => expect(bar.querySelector('[data-item="more"]')).not.toBeNull())
    const root = document.documentElement
    const edge = row.getBoundingClientRect()
    const buttons = [...row.querySelectorAll('button')]
      .map(button => button.getBoundingClientRect())
      // What the phone hides for the slash menu has no box.
      .filter(({ width: drawn }) => drawn > 0)
    expect(new Set(buttons.map(({ top }) => Math.round(top))).size).toBe(1)
    expect(edge.height).toBeLessThan(44 + 24)
    for (const button of buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44)
      expect(button.height).toBeGreaterThanOrEqual(44)
      expect(button.left).toBeGreaterThanOrEqual(edge.left)
      expect(button.right).toBeLessThanOrEqual(edge.right)
    }
    expect(edge.right).toBeLessThanOrEqual(root.clientWidth)
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
)
