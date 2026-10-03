// @vitest-environment jsdom
/**
 * Selection driven on the real runtime: Shift with a click or a key spans a
 * range of cells, Ctrl or Meta with a click toggles a row, Space selects the
 * focused row and Shift+Space extends to it, Ctrl+A selects every row, and
 * Escape lets a range go.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
}
const items: ReadonlyArray<Item> = Array.from({ length: 20 }, (_, index) => ({
  id: `r${index}`,
  name: `Item ${index}`,
}))
const rows = RowModel.fromArray(items, item => item.id)
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100 },
})

const Grid = DataGrid.make({ id: 'items', columns, rowSelection: 'multiple', cellSelection: true })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement),
])
const View = DataGridView<Message>().define(Grid)
const view = (model: Model, h: HtmlBuilder<Message>) =>
  View(
    {
      state: model.grid,
      rows,
      wrap: message => Placement.wrapper.make(message),
      label: 'Items',
      rowHeight: 20,
      headerHeight: 20,
    },
    h,
  )

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const cellOf = (row: string, column: 'id' | 'name') =>
  document.getElementById(GridFocus.cellId('items', { row, column }))!
const selectedCells = () =>
  Array.from(
    document.querySelectorAll('#items [role="gridcell"][aria-selected="true"]'),
    cell => cell.id,
  )
const selectedRows = () =>
  Array.from(document.querySelectorAll('#items [role="row"][aria-selected="true"]'), row =>
    row.getAttribute('aria-rowindex'),
  )

test('the pointer and the keyboard select rows and ranges of cells', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  // Ten 20px rows under a 20px header.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(220)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const container = document.createElement('div')
  container.id = 'grid-selection'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view,
    }),
  )
  const grid = () => document.getElementById('items')!
  const click = (row: string, column: 'id' | 'name', modifiers: MouseEventInit = {}) =>
    cellOf(row, column).dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers }))
  const press = (key: string, modifiers: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    grid().dispatchEvent(event)
    return event
  }
  const id = (row: string, column: 'id' | 'name') => GridFocus.cellId('items', { row, column })
  try {
    await vi.waitFor(() => expect(document.getElementById(id('r2', 'id'))).not.toBeNull())
    expect(grid().getAttribute('aria-multiselectable')).toBe('true')

    // A click focuses; a Shift click spans from there.
    click('r1', 'id')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(id('r1', 'id')),
    )
    click('r3', 'name', { shiftKey: true })
    await vi.waitFor(() =>
      expect(selectedCells()).toEqual([
        id('r1', 'id'),
        id('r1', 'name'),
        id('r2', 'id'),
        id('r2', 'name'),
        id('r3', 'id'),
        id('r3', 'name'),
      ]),
    )
    expect(grid().getAttribute('aria-activedescendant')).toBe(id('r1', 'id'))

    // Shift with an arrow moves the range's far corner.
    expect(press('ArrowDown', { shiftKey: true }).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(selectedCells()).toContain(id('r4', 'name')))
    expect(press('Escape').defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(selectedCells()).toEqual([]))
    // With no range, Escape is the page's.
    expect(press('Escape').defaultPrevented).toBe(false)

    // Space selects the focused row; Shift+Space extends to the row focus moved to.
    press(' ')
    await vi.waitFor(() => expect(selectedRows()).toEqual(['3']))
    // Each key reads the state the last render drew, as a person's keys do.
    press('ArrowDown')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(id('r2', 'id')),
    )
    press('ArrowDown')
    await vi.waitFor(() =>
      expect(grid().getAttribute('aria-activedescendant')).toBe(id('r3', 'id')),
    )
    press(' ', { shiftKey: true })
    await vi.waitFor(() => expect(selectedRows()).toEqual(['3', '4', '5']))

    // Ctrl with a click toggles a row.
    click('r2', 'name', { ctrlKey: true })
    await vi.waitFor(() => expect(selectedRows()).toEqual(['3', '5']))
    click('r8', 'id', { metaKey: true })
    await vi.waitFor(() => expect(selectedRows()).toEqual(['3', '5', '10']))

    // Ctrl+A selects every row, drawn or not.
    expect(press('a', { ctrlKey: true }).defaultPrevented).toBe(true)
    await vi.waitFor(() =>
      expect(selectedRows()).toHaveLength(
        document.querySelectorAll('#items [role="row"][aria-selected]').length,
      ),
    )
    expect(selectedRows()).toContain('2')
  } finally {
    handle.dispose()
  }
})
