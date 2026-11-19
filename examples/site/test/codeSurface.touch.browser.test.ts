/**
 * The site's code block on a touch screen, where nothing hovers: the Copy
 * button is always shown, so it must not lie over the code. It takes a band of
 * its own above the first line.
 */
import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'

import { mount } from './codeSurfaceMount.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const LONG_FIRST_LINE = `const ${'a'.repeat(120)} = 1\nconst b = 2`

test('on a touch screen the Copy button sits above the code, over none of the first line', async () => {
  expect(matchMedia('(hover: none)').matches).toBe(true)
  await page.viewport(390, 800)
  const pre = await mount('ts', LONG_FIRST_LINE, 'ts')
  const button = pre.closest('figure')!.querySelector('button')!
  const first = pre.querySelector('code')!.firstElementChild!
  const text = document.createRange()
  text.selectNodeContents(first)
  const line = text.getBoundingClientRect()
  const copy = button.getBoundingClientRect()
  // Whatever the first line's scroll offset, no part of it is under the button.
  expect(copy.bottom).toBeLessThanOrEqual(line.top)
  expect(getComputedStyle(button.parentElement!).opacity).toBe('1')
  // In the panel's inline-end corner, where the floating one is on a pointer screen.
  expect(pre.closest('figure')!.getBoundingClientRect().right - copy.right).toBeLessThan(16)
  // A finger's target.
  expect(copy.height).toBeGreaterThanOrEqual(44)
  expect(copy.width).toBeGreaterThanOrEqual(44)
})
