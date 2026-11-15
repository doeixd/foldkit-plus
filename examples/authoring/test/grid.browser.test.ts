/// <reference types="@vitest/browser-playwright" />
/**
 * The file grid on a real page. PageUp and PageDown move a page of rows in the
 * same column and focus stays on a cell; Home and End walk the row and, with
 * Ctrl, the grid. A click, Shift+click, Ctrl+click, Space and Shift+arrow choose
 * rows as a file manager does.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { FILES, PAGE } from '../src/grid/app.js'
import { mountGrid } from '../src/grid/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'grid-host'
  document.body.appendChild(container)
  handle = mountGrid(container)
  await vi.waitFor(() => expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(72))
})

afterEach(() => {
  handle?.dispose()
  frames?.dispose()
  document.body.replaceChildren()
})

const name = (row: number) => `file-${String(row).padStart(2, '0')}`
const cell = (row: number, column: number) => document.getElementById(`${name(row)}:${column}`)!
const chosen = () =>
  Array.from(document.querySelectorAll('[role="row"][aria-selected="true"]')).map(row => row.id)
const rowsNamed = (...rows: ReadonlyArray<number>) => rows.map(name)
const status = () => document.querySelector('[role="status"]')?.textContent

/** Focus is compared by id: a failed comparison of elements cannot be written to a JSON report. */
const focusCell = async (row: number, column: number) => {
  cell(row, column).focus()
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(row, column).id))
  // Focus reaches the Model a frame later: a key sooner meets a grid with no current cell.
  await frames?.settle()
}

/** A key, then the frame its answer draws in, as a person pressing at a human pace waits. */
const press = async (keys: string) => {
  await userEvent.keyboard(keys)
  await frames?.settle()
}

test('PageDown moves a page of rows in the same column, and PageUp comes back', async () => {
  await focusCell(1, 1)
  await press('{PageDown}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(1 + PAGE, 1).id))
  expect(document.activeElement?.getAttribute('role')).toBe('gridcell')
  await press('{PageDown}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(1 + 2 * PAGE, 1).id))
  await press('{PageUp}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(1 + PAGE, 1).id))
})

test('the page keys stop at the first and last row, and keep focus on a cell', async () => {
  await focusCell(FILES.length - 2, 2)
  await press('{PageDown}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(FILES.length, 2).id))
  await press('{PageDown}')
  expect(document.activeElement?.id).toBe(cell(FILES.length, 2).id)

  await focusCell(3, 0)
  await press('{PageUp}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(1, 0).id))
})

test('Home and End walk the row, and with Ctrl the whole grid', async () => {
  await focusCell(6, 1)
  await press('{End}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(6, 2).id))
  await press('{Home}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(6, 0).id))
  await press('{Control>}{End}{/Control}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(FILES.length, 2).id))
  await press('{Control>}{Home}{/Control}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(1, 0).id))
})

test('the page keys scroll the grid to keep the cell they land on in view', async () => {
  await focusCell(1, 0)
  const grid = document.querySelector<HTMLElement>('[role="grid"]')!
  expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight)
  await press('{Control>}{End}{/Control}')
  await vi.waitFor(() => expect(grid.scrollTop).toBeGreaterThan(0))
  const box = cell(FILES.length, 0).getBoundingClientRect()
  const view = grid.getBoundingClientRect()
  expect(box.bottom).toBeLessThanOrEqual(view.bottom + 1)
})

test('a click chooses its row alone, Shift+click ranges from it, Ctrl+click toggles', async () => {
  await userEvent.click(cell(3, 0))
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3)))

  await userEvent.keyboard('{Shift>}')
  await userEvent.click(cell(6, 1))
  await userEvent.keyboard('{/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3, 4, 5, 6)))
  expect(status()).toBe('4 of 24 selected')

  await userEvent.keyboard('{Control>}')
  await userEvent.click(cell(10, 0))
  await userEvent.keyboard('{/Control}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3, 4, 5, 6, 10)))

  await userEvent.keyboard('{Control>}')
  await userEvent.click(cell(4, 2))
  await userEvent.keyboard('{/Control}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3, 5, 6, 10)))

  await userEvent.click(cell(8, 0))
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(8)))
})

test('Shift+arrow extends the range from the anchor, and moves focus with it', async () => {
  await userEvent.click(cell(3, 0))
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3)))
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(cell(3, 0).id))
  await frames?.settle()
  await press('{Shift>}{ArrowDown}{/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3, 4)))
  await press('{Shift>}{ArrowDown}{/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3, 4, 5)))
  expect(document.activeElement?.id).toBe(cell(5, 0).id)
  await press('{Shift>}{ArrowUp}{/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(3, 4)))
  // Past the anchor, the other way.
  await press('{Shift>}{ArrowUp}{ArrowUp}{/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(2, 3)))
})

test('Space chooses the current row, Ctrl+Space toggles it, Shift+Space ranges, Ctrl+A chooses all', async () => {
  await focusCell(4, 1)
  await press(' ')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(4)))

  await focusCell(9, 0)
  await press('{Control>} {/Control}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(4, 9)))
  await press('{Shift>} {/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(4, 9)))

  await focusCell(11, 0)
  await press('{Shift>} {/Shift}')
  await vi.waitFor(() => expect(chosen()).toEqual(rowsNamed(4, 9, 10, 11)))

  await press('{Control>}a{/Control}')
  await vi.waitFor(() => expect(chosen()).toHaveLength(FILES.length))
  expect(status()).toBe('24 of 24 selected')
})
