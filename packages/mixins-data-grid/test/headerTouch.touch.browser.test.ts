/// <reference types="@vitest/browser-playwright" />
/**
 * On a touch screen a header's funnel and menu buttons keep a finger's reach
 * (a pseudo-element, so the header does not grow), a tap on each does its job,
 * and the buttons beside each other do not take each other's taps. The same
 * grid under a fine pointer is in `headerTarget.browser.test.ts`.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { form, mountTasks } from './filterGrid.js'
import { reach } from './headerReach.js'

beforeEach(() => {
  const css = document.createElement('style')
  css.id = 'header-touch-css'
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
  document.head.querySelector('#header-touch-css')?.remove()
})

const titleButtons = () =>
  buttons().filter(button => button.closest('[role="columnheader"]')?.id === 'tasks:title')
const buttons = () => [
  ...document.querySelectorAll<HTMLButtonElement>('#tasks [role="columnheader"] button'),
]

test('every header button reaches 40px across the row, and a funnel 32px along it', async () => {
  const mounted = mountTasks({ columnMenu: true, headerHeight: 36 })
  try {
    await expect.poll(() => buttons().length).toBe(8)
    // The Title column is wide enough to hold its label and both buttons; in the narrower ones the
    // next header is drawn over what overflows, which is the column's width, not the reach.
    const reaches = titleButtons().map(button => ({
      name: button.getAttribute('aria-label'),
      ...reach(button),
    }))
    for (const each of reaches) {
      expect(each.block, `${each.name} across the row`).toBeGreaterThanOrEqual(40)
      // A menu button keeps its own 24px: the resize handle covers the cell's edge beside it.
      expect(each.inline, `${each.name} along the row`).toBeGreaterThanOrEqual(
        String(each.name).startsWith('Filter') ? 32 : 24,
      )
    }
    // A tap lands on the button it is over, never on a neighbour: reaches do not overlap.
    for (const button of titleButtons()) {
      const box = button.getBoundingClientRect()
      const hit = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)[0]
      expect(hit).toBe(button)
    }
  } finally {
    mounted.dispose()
  }
})

test('a tap on a funnel opens its filter and a tap on a menu button opens its menu', async () => {
  const mounted = mountTasks({ columnMenu: true, headerHeight: 36 })
  try {
    await expect.poll(() => buttons().length).toBe(8)
    const funnel = buttons().find(button => button.getAttribute('aria-label') === 'Filter Title')!
    // Just above the glyph's own box, inside the reach the pseudo-element adds.
    const box = funnel.getBoundingClientRect()
    await userEvent.click(funnel, { position: { x: box.width / 2, y: box.height + 6 } })
    await expect.poll(() => form()).not.toBeNull()
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => form()).toBeNull()
    const menu = buttons().find(button => button.getAttribute('aria-label') === 'Title menu')!
    const menuBox = menu.getBoundingClientRect()
    await userEvent.click(menu, { position: { x: menuBox.width / 2, y: menuBox.height + 6 } })
    await expect.poll(() => document.querySelector('#tasks [role="menu"]')).not.toBeNull()
  } finally {
    mounted.dispose()
  }
})
