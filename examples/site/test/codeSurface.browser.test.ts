/**
 * The site's code blocks in a real browser: in the light scheme the box is a
 * quiet step off the page, not a slab, and the same holds for a diagram. The
 * two painted colors are compared with each other, never with a knob value.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { mount } from './codeSurfaceMount.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

/** Where the box's fill is painted: the nearest ancestor of `pre` with one. */
const fillOf = (el: Element): string => {
  for (let at: Element | null = el; at !== null; at = at.parentElement) {
    const color = getComputedStyle(at).backgroundColor
    if (color !== 'rgba(0, 0, 0, 0)') return color
  }
  return 'rgb(255, 255, 255)'
}

/** OKLab lightness (0 to 1) of what the browser painted, read through a canvas. */
const lightnessOf = (css: string): number => {
  const context = document.createElement('canvas').getContext('2d')!
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data, channel => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!)
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!)
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

test.each(['ts', 'text'] as const)(
  'a %s code block is barely off the page in the light scheme',
  async lang => {
    const pre = await mount(lang)
    const page = lightnessOf(fillOf(document.body))
    const box = lightnessOf(fillOf(pre))
    expect(page).toBeGreaterThan(0.95)
    expect(Math.abs(page - box)).toBeLessThan(0.025)
  },
)

const LONG_FIRST_LINE = `const ${'a'.repeat(120)} = 1\nconst b = 2`

test.each([1440, 390])(
  'at %i an untitled panel has no header band, and its Copy button floats clear of the first line',
  async width => {
    await page.viewport(width, 800)
    const pre = await mount('ts', LONG_FIRST_LINE, 'ts')
    const root = pre.closest('figure')!
    const button = root.querySelector('button')!
    const header = button.parentElement!
    expect(getComputedStyle(header).position).toBe('absolute')
    expect(getComputedStyle(header).borderBottomWidth).toBe('0px')
    const box = root.getBoundingClientRect()
    // The code starts at the top of the panel, with no band above it.
    expect(pre.getBoundingClientRect().top - box.top).toBeLessThan(4)
    const corner = button.getBoundingClientRect()
    expect(corner.right).toBeLessThanOrEqual(box.right)
    expect(box.right - corner.right).toBeLessThan(16)
    expect(corner.top - box.top).toBeLessThan(16)
    // Quiet at rest, shown on hover or focus, and still a tab stop. The test
    // files share one pointer, which another may have left over the panel, so
    // it is parked on a spot of its own and the fade is waited out.
    const spot = document.createElement('div')
    spot.id = 'code-surface-spot'
    spot.style.cssText =
      'position:fixed;inset-block-end:0;inset-inline-start:0;inline-size:8px;block-size:8px'
    document.body.appendChild(spot)
    await userEvent.hover(spot)
    await vi.waitFor(() => expect(getComputedStyle(header).opacity).toBe('0'))
    button.focus()
    await vi.waitFor(() => expect(getComputedStyle(header).opacity).toBe('1'))
    // Scrolled to the end of the first line, its text stops short of the button.
    pre.scrollLeft = pre.scrollWidth
    const first = pre.querySelector('code')!.firstElementChild!
    const text = document.createRange()
    text.selectNodeContents(first)
    const ends = Array.from(text.getClientRects()).map(rect => rect.right)
    expect(Math.max(...ends)).toBeLessThanOrEqual(button.getBoundingClientRect().left)
  },
)
