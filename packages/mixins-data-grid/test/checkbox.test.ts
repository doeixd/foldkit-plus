// @vitest-environment jsdom
/**
 * A checkbox column on the real runtime: its cells draw the value as a
 * `role="checkbox"`, a plain press on the box, Space or Enter toggles it and
 * the application writes it back, and nothing opens a draft. A press with a
 * modifier, or on a checkbox the application drew itself, is the cell's;
 * Delete leaves a checkbox as it is; a row not loaded has nothing to toggle.
 */
import { Option } from 'effect'
import { GridFocus } from 'foldkit-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { boxOf, cellOf, grid, mountTasks } from './checkboxGrid.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const mount = (unloaded: Option.Option<string> = Option.none()) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  return mountTasks(unloaded)
}
const press = (key: string, modifiers: KeyboardEventInit = {}) =>
  grid().dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  )
const click = (target: Element, modifiers: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers }))
const checked = (row: string) => boxOf(row)?.getAttribute('aria-checked')
// On a checkbox the grid points at the box, whose state is what is said.
const focusedOn = (row: string, column: 'title' | 'done' | 'seen') =>
  vi.waitFor(() =>
    expect(grid().getAttribute('aria-activedescendant')).toBe(
      column === 'done' ? boxOf(row)!.id : cellOf(row, column)!.id,
    ),
  )
const selected = (mounted: ReturnType<typeof mount>) => mounted.latest().grid.selection.rows

test('a checkbox draws its value, the column’s header names it, and it is no text to edit', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(boxOf('t0')).not.toBeNull())
    expect(['t0', 't1', 't2'].map(checked)).toEqual(['false', 'true', 'false'])
    expect(boxOf('t0')!.getAttribute('aria-label')).toBe('Done')
    // No text cursor and no double-click edit: there is no text.
    expect(cellOf('t0', 'done')!.hasAttribute('data-editable')).toBe(false)
    expect(cellOf('t0', 'title')!.hasAttribute('data-editable')).toBe(true)
    // A boolean column that does not edit draws what the application's `cell` gives.
    expect(boxOf('t1', 'seen')!.getAttribute('aria-checked')).toBe('true')
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
    await focusedOn('t0', 'done')
    // Space toggles it back, ahead of selecting the row.
    press(' ')
    await vi.waitFor(() => expect(checked('t0')).toBe('false'))
    expect(selected(mounted)).toEqual({ _tag: 'Keys', keys: [] })
    press('Enter')
    await vi.waitFor(() => expect(checked('t0')).toBe('true'))
    expect(mounted.latest().edits).toEqual([
      't1.done=false',
      't0.done=true',
      't0.done=false',
      't0.done=true',
    ])
    // Neither a typed key, F2 nor a double-click opens a draft on it. A
    // Space after them is the settle: an edit they opened would refuse it.
    press('x')
    press('F2')
    cellOf('t0', 'done')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    press(' ')
    await vi.waitFor(() => expect(checked('t0')).toBe('false'))
    expect(editor()).toBeNull()
    expect(mounted.latest().edits.at(-1)).toBe('t0.done=false')
  } finally {
    mounted.dispose()
  }
})

test('Space on a grid nothing has focused yet toggles its first cell, the tab stop', async () => {
  const mounted = mount()
  try {
    await focusedOn('t0', 'done')
    expect(mounted.latest().grid.focus.current).toEqual(Option.none())
    press(' ')
    await vi.waitFor(() => expect(checked('t0')).toBe('true'))
    expect(mounted.latest().edits).toEqual(['t0.done=true'])
  } finally {
    mounted.dispose()
  }
})

test('a press with a modifier, beside the box, or on the application’s own checkbox is the cell’s', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(boxOf('t2')).not.toBeNull())
    click(boxOf('t2')!, { ctrlKey: true })
    await vi.waitFor(() => expect(selected(mounted)).toEqual({ _tag: 'Keys', keys: ['t2'] }))
    // Alt with a press is no plain press either: it focuses the cell.
    click(cellOf('t1', 'title')!)
    await focusedOn('t1', 'title')
    click(boxOf('t0')!, { altKey: true })
    await focusedOn('t0', 'done')
    click(cellOf('t1', 'title')!)
    await focusedOn('t1', 'title')
    click(cellOf('t0', 'done')!)
    await focusedOn('t0', 'done')
    // A checkbox the application drew is no control of the grid's: a press
    // on it focuses its cell, as a press anywhere in a cell does.
    click(boxOf('t1', 'seen')!)
    await focusedOn('t1', 'seen')
    // Space on a cell that is no checkbox still selects its row.
    press(' ')
    await vi.waitFor(() => expect(selected(mounted)).toEqual({ _tag: 'Keys', keys: ['t2', 't1'] }))
    expect(mounted.latest().edits).toEqual([])
    expect(['t0', 't1', 't2'].map(checked)).toEqual(['false', 'true', 'false'])
  } finally {
    mounted.dispose()
  }
})

test('Delete leaves a checkbox as it is, and clears the text beside it', async () => {
  const mounted = mount()
  try {
    await vi.waitFor(() => expect(boxOf('t0')).not.toBeNull())
    click(cellOf('t1', 'done')!)
    await focusedOn('t1', 'done')
    press('Delete')
    // The text cell beside it is cleared, as a cut clears it.
    press('ArrowRight')
    await focusedOn('t1', 'title')
    press('Delete')
    await vi.waitFor(() => expect(mounted.latest().edits).toEqual(['t1.title=']))
    expect(checked('t1')).toBe('true')
  } finally {
    mounted.dispose()
  }
})

test('Space on a row not loaded yet toggles nothing: it selects the row', async () => {
  const mounted = mount(Option.some('t2'))
  try {
    await vi.waitFor(() => expect(boxOf('t1')).not.toBeNull())
    click(cellOf('t1', 'done')!)
    await focusedOn('t1', 'done')
    press('ArrowDown')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(
        GridFocus.cellId('tasks', { row: 't2', column: 'done' }),
      ),
    )
    press(' ')
    await vi.waitFor(() => expect(selected(mounted)).toEqual({ _tag: 'Keys', keys: ['t2'] }))
    expect(mounted.latest().edits).toEqual([])
  } finally {
    mounted.dispose()
  }
})
