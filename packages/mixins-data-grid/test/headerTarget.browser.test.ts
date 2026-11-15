/// <reference types="@vitest/browser-playwright" />
/** Under a fine pointer a header button answers only where it is drawn: the touch reach is not added. */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { mountTasks } from './filterGrid.js'
import { reach } from './headerReach.js'

beforeEach(() => {
  const css = document.createElement('style')
  css.id = 'header-target-css'
  css.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(Theme.standard())),
    ) + GridStyle.css
  document.head.appendChild(css)
})
afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelector('#header-target-css')?.remove()
})

// One pixel over: a box on a half pixel is sampled at one more whole pixel than it is high.
test('a header button answers the pointer only inside its own box', async () => {
  const mounted = mountTasks({ columnMenu: true, headerHeight: 36 })
  try {
    await expect
      .poll(() => document.querySelectorAll('#tasks [role="columnheader"] button').length)
      .toBe(8)
    for (const button of document.querySelectorAll<HTMLElement>(
      '#tasks [role="columnheader"] button',
    )) {
      const box = button.getBoundingClientRect()
      const found = reach(button)
      expect(found.block).toBeLessThanOrEqual(Math.ceil(box.height) + 1)
      expect(found.inline).toBeLessThanOrEqual(Math.ceil(box.width) + 1)
    }
  } finally {
    mounted.dispose()
  }
})
