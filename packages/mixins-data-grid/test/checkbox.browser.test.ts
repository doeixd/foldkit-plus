/// <reference types="@vitest/browser-playwright" />
/**
 * A checkbox column in a real browser, where focus and the cascade are real:
 * `GridStyle` draws the box, filled when checked; a press on it, Space and
 * Enter toggle it, the application writes it back, and focus stays on the
 * grid, pointing at the box, throughout. A keyboard user tabbing in can
 * toggle the first cell before anything is focused, and Chrome's own
 * accessibility tree says the active checkbox's state as it changes.
 */
import { Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
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
  expect(cellOf(row, 'done')!.contains(document.getElementById(activeId()))).toBe(true)
}
const activeId = () => grid().getAttribute('aria-activedescendant') ?? ''

type Frame = {
  readonly frame: { readonly id: string }
  readonly childFrames?: ReadonlyArray<Frame>
}
type AxNode = {
  readonly nodeId: string
  readonly parentId?: string
  readonly backendDOMNodeId?: number
  readonly name?: { readonly value?: unknown }
  readonly role?: { readonly value?: string }
  readonly properties?: ReadonlyArray<{
    readonly name: string
    readonly value: {
      readonly value?: unknown
      readonly relatedNodes?: ReadonlyArray<{ readonly backendDOMNodeId: number }>
    }
  }>
}
/**
 * The node Chrome's accessibility tree takes the grid's active descendant to
 * be, with its role and checked state, and the cell and row it sits in: what
 * a screen reader is told. Chrome's properties carry no row or column index
 * for these nodes; the context is the tree, the box a child of its gridcell.
 */
const activeInChrome = async () => {
  await cdp().send('Accessibility.enable')
  const { frameTree } = (await cdp().send('Page.getFrameTree')) as { frameTree: Frame }
  const frames: Array<Frame> = []
  const walk = (frame: Frame) => {
    frames.push(frame)
    frame.childFrames?.forEach(walk)
  }
  walk(frameTree)
  for (const { frame } of frames) {
    const { nodes } = (await cdp().send('Accessibility.getFullAXTree', { frameId: frame.id })) as {
      nodes: ReadonlyArray<AxNode>
    }
    const property = (node: AxNode, name: string) =>
      node.properties?.find(each => each.name === name)?.value
    const gridNode = nodes.find(node => node.role?.value === 'grid')
    const target = gridNode && property(gridNode, 'activedescendant')?.relatedNodes?.[0]
    const active = nodes.find(node => node.backendDOMNodeId === target?.backendDOMNodeId)
    if (active !== undefined) {
      const parentOf = (node: AxNode) => nodes.find(each => each.nodeId === node.parentId)
      const cell = parentOf(active)
      const row = cell && parentOf(cell)
      return {
        role: active.role?.value,
        checked: property(active, 'checked')?.value,
        // The context a screen reader says around it: the cell it is in, and that cell's row.
        cell: { role: cell?.role?.value, name: cell?.name?.value },
        row: row?.role?.value,
      }
    }
  }
  return undefined
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

test('tabbing in and pressing Space toggles the first cell, and Chrome says the new state', async () => {
  const mounted = mountTasks()
  try {
    await vi.waitFor(() => expect(boxOf('t0')).not.toBeNull())
    // No click first: the grid's tab stop is its first cell, a checkbox.
    await userEvent.tab()
    expect(document.activeElement).toBe(grid())
    await vi.waitFor(async () =>
      expect(await activeInChrome()).toEqual({
        role: 'checkbox',
        checked: 'false',
        cell: { role: 'gridcell', name: 'Done' },
        row: 'row',
      }),
    )
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(checked('t0')).toBe('true'))
    focusIsOn('t0')
    await vi.waitFor(async () =>
      expect(await activeInChrome()).toEqual({
        role: 'checkbox',
        checked: 'true',
        cell: { role: 'gridcell', name: 'Done' },
        row: 'row',
      }),
    )
    expect(mounted.latest().edits).toEqual(['t0.done=true'])
  } finally {
    mounted.dispose()
  }
})
