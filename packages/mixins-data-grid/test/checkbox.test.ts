// @vitest-environment jsdom
/**
 * A checkbox column on the real runtime: its cells draw the value as a
 * `role="checkbox"`, a plain press on the box, Space or Enter toggles it and
 * the application writes it back, and nothing opens a draft. A press with
 * Shift is the cell's, and a boolean column that does not edit is its text.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { boxOf, cellOf, grid, mountTasks } from './checkboxGrid.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const mount = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  return mountTasks()
}
const press = (key: string, modifiers: KeyboardEventInit = {}) =>
  grid().dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  )
const click = (target: Element, modifiers: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers }))
const checked = (row: string) => boxOf(row)?.getAttribute('aria-checked')

test('a checkbox draws its value, and the column’s header names it', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(boxOf('t0')).not.toBeNull())
    expect(['t0', 't1', 't2'].map(checked)).toEqual(['false', 'true', 'false'])
    expect(boxOf('t0')!.getAttribute('aria-label')).toBe('Done')
    // A boolean column that does not edit is read-only text.
    expect(cellOf('t1', 'seen')!.textContent).toBe('true')
    expect(cellOf('t1', 'seen')!.querySelector('[role="checkbox"]')).toBeNull()
  } finally {
    mounted.dispose()
  }
})

test('a press on the box, Space and Enter toggle it, and no draft opens', async () => {
  const mounted = mount()
  const editor = () => document.querySelector('#tasks input, #tasks [role="combobox"]')
  try {
    await vi.waitFor(() => expect(boxOf('t0')).not.toBeNull())
    // A press on a checked box unchecks it.
    click(boxOf('t1')!)
    await vi.waitFor(() => expect(checked('t1')).toBe('false'))
    click(boxOf('t0')!)
    await vi.waitFor(() => expect(checked('t0')).toBe('true'))
    expect(grid().getAttribute('aria-activedescendant')).toBe(cellOf('t0', 'done')!.id)
    // Space toggles it back, ahead of selecting the row.
    press(' ')
    await vi.waitFor(() => expect(checked('t0')).toBe('false'))
    expect(mounted.latest().grid.selection.rows).toEqual({ _tag: 'Keys', keys: [] })
    press('Enter')
    await vi.waitFor(() => expect(checked('t0')).toBe('true'))
    expect(mounted.latest().edits).toEqual([
      't1.done=false',
      't0.done=true',
      't0.done=false',
      't0.done=true',
    ])
    // Neither a typed key, F2 nor a double-click opens a draft on it.
    press('x')
    press('F2')
    cellOf('t0', 'done')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(editor()).toBeNull()
    expect(mounted.latest().grid.editing._tag).toBe('None')
  } finally {
    mounted.dispose()
  }
})

test('a press with a modifier, or beside the box, is the cell’s', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(boxOf('t2')).not.toBeNull())
    click(boxOf('t2')!, { ctrlKey: true })
    await vi.waitFor(() =>
      expect(mounted.latest().grid.selection.rows).toEqual({ _tag: 'Keys', keys: ['t2'] }),
    )
    click(cellOf('t0', 'done')!)
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cellOf('t0', 'done')!.id),
    )
    // Space on a cell that is no checkbox still selects its row.
    click(cellOf('t1', 'seen')!)
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(cellOf('t1', 'seen')!.id),
    )
    press(' ')
    await vi.waitFor(() =>
      expect(mounted.latest().grid.selection.rows).toEqual({ _tag: 'Keys', keys: ['t2', 't1'] }),
    )
    expect(mounted.latest().edits).toEqual([])
    expect(['t0', 't1', 't2'].map(checked)).toEqual(['false', 'true', 'false'])
  } finally {
    mounted.dispose()
  }
})
