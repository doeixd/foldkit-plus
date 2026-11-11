/**
 * A checkbox column in a real browser, where focus and the cascade are real:
 * `GridStyle` draws the box, filled when checked; a press on it, Space and
 * Enter toggle it, the application writes it back, and focus stays on the
 * grid, pointing at the cell, throughout.
 */
import { Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { boxOf, cellOf, grid, mountTasks } from './checkboxGrid.js'

beforeEach(() => {
  const css = document.createElement('style')
  css.id = 'checkbox-css'
  css.textContent = Style.stylesheet(Theme.root(Theme.standard()), GridStyle)
  document.head.appendChild(css)
})
afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelector('#checkbox-css')?.remove()
})

const checked = (row: string) => boxOf(row)?.getAttribute('aria-checked')
const focusIsOn = (row: string) => {
  expect(document.activeElement).toBe(grid())
  expect(grid().getAttribute('aria-activedescendant')).toBe(cellOf(row, 'done')!.id)
}

test('a press, Space and Enter toggle a checkbox, and focus stays on its cell', async () => {
  const mounted = mountTasks()
  try {
    await vi.waitFor(() => expect(boxOf('t0')).not.toBeNull())
    // A box with a size, filled only when checked.
    const fill = (row: string) => getComputedStyle(boxOf(row)!).backgroundColor
    expect(boxOf('t0')!.getBoundingClientRect().width).toBeGreaterThan(8)
    expect(fill('t1')).not.toBe(fill('t0'))
    expect(getComputedStyle(boxOf('t1')!, '::after').content).not.toBe('none')
    expect(getComputedStyle(boxOf('t0')!, '::after').content).toBe('none')

    await userEvent.click(boxOf('t0')!)
    await vi.waitFor(() => expect(checked('t0')).toBe('true'))
    focusIsOn('t0')

    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(checked('t0')).toBe('false'))
    focusIsOn('t0')

    // A key moves on, and Enter toggles there, opening no field.
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => focusIsOn('t1'))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(checked('t1')).toBe('false'))
    focusIsOn('t1')
    expect(document.querySelector('#tasks input')).toBeNull()

    expect(mounted.latest().edits).toEqual(['t0.done=true', 't0.done=false', 't1.done=false'])
    // Space toggled; it did not select the row.
    expect(mounted.latest().grid.selection.rows).toEqual({ _tag: 'Keys', keys: [] })
  } finally {
    mounted.dispose()
  }
})
