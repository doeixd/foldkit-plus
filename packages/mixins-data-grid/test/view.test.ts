/**
 * The grid as drawn: a WAI-ARIA grid of the viewport's window of cells, each
 * with its logical row and column, the one tab stop on the container, and the
 * geometry the window depends on protected from attachments.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import {
  type CellAddress,
  type CellRange,
  Columns,
  DataGrid,
  GridFocus,
  GridSelection,
  RowCount,
  RowModel,
  type Viewport,
} from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'
import { DataGridView, type GridInput, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'

interface Item {
  readonly id: string
  readonly name: string
  readonly qty: number
}

const items: ReadonlyArray<Item> = Array.from({ length: 50 }, (_, index) => ({
  id: `r${index}`,
  name: `Item ${index}`,
  qty: index * 2,
}))
const itemKey = (item: Item) => item.id

const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, pinned: 'start', width: 80 },
  name: { header: 'Name', value: item => item.name, width: 200 },
  notes: { header: 'Notes', value: () => 'hidden', hidden: true, width: 80 },
  qty: { header: 'Qty', value: item => item.qty, width: 80 },
})
type Id = keyof typeof columns.byId

const Grid = DataGrid.make({ id: 'items', columns })
type GridMessage = typeof Grid.Message.Type
const View = DataGridView<GridMessage>().define(Grid)

const allRows = RowModel.fromArray(items, itemKey)

// A 20px header and five 20px rows fit the 120px viewport.
const input = (
  overrides: Partial<GridInput<Item, Id, GridMessage, GridMessage>> = {},
  viewport: Partial<Viewport> = {},
  current: Option.Option<CellAddress<Id>> = Option.none(),
): GridInput<Item, Id, GridMessage, GridMessage> => ({
  state: {
    ...Grid.bundle.init(undefined).model,
    focus: { current: current },
    viewport: { top: 0, left: 0, width: 400, height: 120, ...viewport },
  },
  rows: allRows,
  wrap: message => message,
  label: 'Items',
  rowHeight: 20,
  headerHeight: 20,
  ...overrides,
})

const draw = (given: GridInput<Item, Id, GridMessage, GridMessage>) => Inert.draw(View, given)
const rowsOf = (drawn: ReturnType<typeof draw>) =>
  Inert.byRole(drawn, 'row').filter(row => Inert.value(row, 'aria-rowindex') !== '1')
const textsOf = (nodes: ReturnType<typeof Inert.children>) => nodes.map(node => Inert.text(node))

describe('DataGridView', () => {
  test('is a grid named by its label, with every row and visible column counted', () => {
    const [grid] = Inert.byRole(draw(input()), 'grid')
    expect(Inert.value(grid, 'id')).toBe('items')
    expect(Inert.value(grid, 'aria-label')).toBe('Items')
    expect(Inert.value(grid, 'tabIndex')).toBe(0)
    // Fifty rows and the header row; the hidden column is not counted.
    expect(Inert.value(grid, 'aria-rowcount')).toBe('51')
    expect(Inert.value(grid, 'aria-colcount')).toBe('3')
  })

  test('heads each visible column in display order', () => {
    const headers = Inert.byRole(draw(input()), 'columnheader')
    expect(textsOf(headers)).toEqual(['Id', 'Name', 'Qty'])
    expect(headers.map(header => Inert.value(header, 'aria-colindex'))).toEqual(['1', '2', '3'])
  })

  test('draws only the rows the viewport shows, each at its place among all rows', () => {
    const rows = rowsOf(draw(input()))
    expect(rows.map(row => Inert.value(row, 'aria-rowindex'))).toEqual(['2', '3', '4', '5', '6'])
    expect(textsOf(Inert.byRole(rows[0], 'gridcell'))).toEqual(['r0', 'Item 0', '0'])
  })

  test('a scrolled viewport draws the rows below, after a spacer of the rows above', () => {
    const drawn = draw(input({}, { top: 200 }))
    const rows = rowsOf(drawn)
    expect(rows.map(row => Inert.value(row, 'aria-rowindex'))).toEqual([
      '12',
      '13',
      '14',
      '15',
      '16',
    ])
    const [body] = Inert.bySlot(drawn, 'body')
    expect(Inert.style(Inert.children(body)[0]).height).toBe('200px')
  })

  test('names each cell for the active descendant and gives it its column’s place', () => {
    const [first] = Inert.byRole(draw(input()), 'gridcell')
    expect(Inert.value(first, 'id')).toBe(GridFocus.cellId('items', { row: 'r0', column: 'id' }))
    expect(Inert.value(first, 'aria-colindex')).toBe('1')
  })

  test('points at the tab stop while it is drawn', () => {
    const [grid] = Inert.byRole(draw(input()), 'grid')
    expect(Inert.value(grid, 'aria-activedescendant')).toBe(
      GridFocus.cellId('items', { row: 'r0', column: 'id' }),
    )
    const focused = Option.some({ row: 'r12', column: 'qty' as const })
    const scrolled = draw(input({}, { top: 200 }, focused))
    expect(Inert.value(Inert.byRole(scrolled, 'grid')[0], 'aria-activedescendant')).toBe(
      GridFocus.cellId('items', { row: 'r12', column: 'qty' }),
    )
    const marked = Inert.byRole(scrolled, 'gridcell').filter(
      cell => Inert.value(cell, 'data-focused') === 'true',
    )
    expect(marked.map(cell => Inert.value(cell, 'id'))).toEqual([
      GridFocus.cellId('items', { row: 'r12', column: 'qty' }),
    ])
  })

  test('points at nothing while the focused cell is scrolled out of the window', () => {
    const focused = Option.some({ row: 'r12', column: 'qty' as const })
    const [grid] = Inert.byRole(draw(input({}, {}, focused)), 'grid')
    expect(Inert.value(grid, 'aria-activedescendant')).toBeUndefined()
  })

  test('holds a pinned column at its edge', () => {
    const [pinned, center] = Inert.byRole(draw(input()), 'gridcell')
    expect(Inert.value(pinned, 'data-pinned')).toBe('start')
    expect(Inert.style(pinned)).toMatchObject({
      position: 'sticky',
      'inset-inline-start': '0px',
      width: '80px',
    })
    expect(Inert.value(center, 'data-pinned')).toBeUndefined()
    expect(Inert.style(center).position).toBeUndefined()
  })

  test('holds each end-pinned column its neighbours’ width from the end edge', () => {
    const ends = Columns.define<Item>()({
      name: { header: 'Name', value: item => item.name, width: 80 },
      qty: { header: 'Qty', value: item => item.qty, pinned: 'end', width: 80 },
      total: { header: 'Total', value: item => item.qty * 3, pinned: 'end', width: 60 },
    })
    const EndGrid = DataGrid.make({ id: 'ends', columns: ends })
    const EndView = DataGridView<typeof EndGrid.Message.Type>().define(EndGrid)
    const drawn = Inert.draw(EndView, {
      state: {
        ...EndGrid.bundle.init(undefined).model,
        focus: { current: Option.none() },
        viewport: { top: 0, left: 0, width: 400, height: 60 },
      },
      rows: allRows,
      wrap: message => message,
      label: 'Ends',
      rowHeight: 20,
      headerHeight: 20,
    })
    const [, qty, total] = Inert.byRole(drawn, 'columnheader')
    expect(Inert.text(qty)).toBe('Qty')
    expect(Inert.style(qty)['inset-inline-end']).toBe('60px')
    expect(Inert.style(total)['inset-inline-end']).toBe('0px')
  })

  test('draws only the center columns the viewport shows, with spacers for the rest', () => {
    const wide = Columns.define<Item>()({
      id: { header: 'Id', value: item => item.id, pinned: 'start', width: 80 },
      c0: { header: 'C0', value: () => 0, width: 100 },
      c1: { header: 'C1', value: () => 1, width: 100 },
      c2: { header: 'C2', value: () => 2, width: 100 },
      c3: { header: 'C3', value: () => 3, width: 100 },
      c4: { header: 'C4', value: () => 4, width: 100 },
      c5: { header: 'C5', value: () => 5, width: 100 },
    })
    const WideGrid = DataGrid.make({ id: 'wide', columns: wide })
    const WideView = DataGridView<typeof WideGrid.Message.Type>().define(WideGrid)
    // 80 pinned leaves 200 of center; scrolled 250 in, C2 to C4 meet it.
    type WideId = keyof typeof wide.byId
    const drawWith = (current: Option.Option<CellAddress<WideId>>) =>
      Inert.draw(WideView, {
        state: {
          ...WideGrid.bundle.init(undefined).model,
          focus: { current: current },
          viewport: { top: 0, left: 250, width: 280, height: 60 },
        },
        rows: allRows,
        wrap: message => message,
        label: 'Wide',
        rowHeight: 20,
        headerHeight: 20,
      })
    const drawn = drawWith(Option.none())
    const headers = Inert.byRole(drawn, 'columnheader')
    expect(textsOf(headers)).toEqual(['Id', 'C2', 'C3', 'C4'])
    expect(headers.map(header => Inert.value(header, 'aria-colindex'))).toEqual([
      '1',
      '4',
      '5',
      '6',
    ])
    const [headerRow] = Inert.bySlot(drawn, 'headerRow')
    const spacers = Inert.children(headerRow).filter(
      child => Inert.value(child, 'role') === undefined,
    )
    expect(spacers.map(spacer => Inert.style(spacer).width)).toEqual(['200px', '100px'])
    // A focused column scrolled out sideways is not drawn, so nothing is pointed at.
    const descendant = (column: WideId) =>
      Inert.value(
        Inert.byRole(drawWith(Option.some({ row: 'r0', column })), 'grid')[0],
        'aria-activedescendant',
      )
    expect(descendant('c0')).toBeUndefined()
    expect(descendant('c3')).toBe(GridFocus.cellId('wide', { row: 'r0', column: 'c3' }))
  })

  test('draws the column state it is given: a resize and a hidden column', () => {
    const { columnState } = Grid
    const state = columnState.hide(columnState.resize(columnState.initial(), 'qty', 150), 'name')
    const given = input()
    const drawn = draw({ ...given, state: { ...given.state, columns: state } })
    expect(textsOf(Inert.byRole(drawn, 'columnheader'))).toEqual(['Id', 'Qty'])
    const [, qty] = Inert.byRole(drawn, 'gridcell')
    expect(Inert.style(qty).width).toBe('150px')
  })

  test('gives each resizable column a handle that says its width', () => {
    const handles = Inert.byRole(draw(input()), 'separator')
    expect(handles.map(handle => Inert.value(handle, 'aria-label'))).toEqual([
      'Resize Id',
      'Resize Name',
      'Resize Qty',
    ])
    const [, name] = handles
    expect(Inert.value(name, 'aria-valuenow')).toBe('200')
    expect(Inert.value(name, 'aria-valuemin')).toBe(String(Columns.minWidth))
    expect(Inert.value(name, 'aria-orientation')).toBe('vertical')
    expect(Inert.value(name, 'tabIndex')).toBe(-1)
    const [, nameHeader] = Inert.byRole(draw(input()), 'columnheader')
    expect(Inert.style(nameHeader).position).toBe('relative')
  })

  test('a column that does not resize has no handle', () => {
    const fixed = Columns.define<Item>()({
      id: { header: 'Id', value: item => item.id, resizable: false },
      name: { header: 'Name', value: item => item.name, maxWidth: 300 },
    })
    const FixedGrid = DataGrid.make({ id: 'fixed', columns: fixed })
    const FixedView = DataGridView<typeof FixedGrid.Message.Type>().define(FixedGrid)
    const drawn = Inert.draw(FixedView, {
      state: {
        ...FixedGrid.bundle.init(undefined).model,
        focus: { current: Option.none() },
        viewport: { top: 0, left: 0, width: 400, height: 60 },
      },
      rows: allRows,
      wrap: message => message,
      label: 'Fixed',
      rowHeight: 20,
      headerHeight: 20,
    })
    const handles = Inert.byRole(drawn, 'separator')
    expect(handles.map(handle => Inert.value(handle, 'aria-label'))).toEqual(['Resize Name'])
    expect(Inert.value(handles[0], 'aria-valuemax')).toBe('300')
  })

  test('a grid that does not select says no selected state', () => {
    const drawn = draw(input())
    expect(Inert.value(Inert.byRole(drawn, 'grid')[0], 'aria-multiselectable')).toBeUndefined()
    expect(rowsOf(drawn).map(row => Inert.value(row, 'aria-selected'))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expect(Inert.value(Inert.byRole(drawn, 'gridcell')[0], 'aria-selected')).toBeUndefined()
  })

  test('says which rows and cells are selected', () => {
    const Picking = DataGrid.make({
      id: 'picking',
      columns,
      rowSelection: 'multiple',
      cellSelection: true,
    })
    const PickingView = DataGridView<typeof Picking.Message.Type>().define(Picking)
    const start = Picking.bundle.init(undefined).model
    const drawn = Inert.draw(PickingView, {
      state: {
        ...start,
        viewport: { top: 0, left: 0, width: 400, height: 120 },
        selection: {
          ...start.selection,
          rows: GridSelection.add(start.selection.rows, ['r1', 'r3']),
          cells: Option.some<CellRange<Id>>({
            anchor: { row: 'r0', column: 'name' },
            focus: { row: 'r1', column: 'qty' },
          }),
        },
      },
      rows: allRows,
      wrap: message => message,
      label: 'Picking',
      rowHeight: 20,
      headerHeight: 20,
    })
    expect(Inert.value(Inert.byRole(drawn, 'grid')[0], 'aria-multiselectable')).toBe('true')
    expect(rowsOf(drawn).map(row => Inert.value(row, 'aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'true',
      'false',
    ])
    // The range spans rows r0 and r1, columns Name and Qty.
    const selectedCells = Inert.byRole(drawn, 'gridcell').filter(
      cell => Inert.value(cell, 'aria-selected') === 'true',
    )
    expect(selectedCells.map(cell => Inert.value(cell, 'id'))).toEqual([
      GridFocus.cellId('picking', { row: 'r0', column: 'name' }),
      GridFocus.cellId('picking', { row: 'r0', column: 'qty' }),
      GridFocus.cellId('picking', { row: 'r1', column: 'name' }),
      GridFocus.cellId('picking', { row: 'r1', column: 'qty' }),
    ])
    const [first] = Inert.byRole(drawn, 'gridcell')
    expect(Inert.value(first, 'aria-selected')).toBe('false')
  })

  test('counts an open-ended result as unknown', () => {
    const open: RowModel<Item> = {
      ...RowModel.fromArray(items, itemKey),
      count: RowCount.Unknown({ atLeast: 50 }),
    }
    const [grid] = Inert.byRole(draw(input({ rows: open })), 'grid')
    expect(Inert.value(grid, 'aria-rowcount')).toBe('-1')
  })

  test('holds the place of rows counted but not loaded', () => {
    const loaded = RowModel.fromArray(items.slice(0, 2), itemKey)
    const partly: RowModel<Item> = { ...loaded, count: RowCount.Known({ total: 50 }) }
    const drawn = draw(input({ rows: partly }))
    expect(rowsOf(drawn)).toHaveLength(2)
    const placeholders = Inert.bySlot(drawn, 'placeholder')
    expect(placeholders).toHaveLength(3)
    expect(placeholders.map(node => Inert.value(node, 'aria-hidden'))).toEqual([
      'true',
      'true',
      'true',
    ])
    expect(Inert.value(Inert.byRole(drawn, 'grid')[0], 'aria-rowcount')).toBe('51')
  })

  test('says when there are no rows, in the application’s words', () => {
    const none = RowModel.fromArray([], itemKey)
    expect(Inert.text(Inert.byRole(draw(input({ rows: none })), 'status')[0])).toBe('No rows.')
    const worded = draw(input({ rows: none, words: { empty: 'Nothing in stock.' } }))
    expect(Inert.text(Inert.byRole(worded, 'status')[0])).toBe('Nothing in stock.')
  })

  test('draws a cell the application’s way when it asks', () => {
    const cell = (column: Id, row: Item, h: HtmlBuilder<GridMessage>) =>
      column === 'qty' ? h.strong([], [`${row.qty} left`]) : row.name
    const [row] = rowsOf(draw(input({ cell })))
    expect(textsOf(Inert.byRole(row, 'gridcell'))).toEqual(['Item 0', 'Item 0', '0 left'])
  })

  test.each([
    ['width', { width: '10px' }],
    ['insetInlineStart', { insetInlineStart: '5px' }],
    ['position', { position: 'static' }],
  ] as const)(
    'refuses a Style that sets a cell’s %s, which the window depends on',
    (property, declarations) => {
      const Moved = View.pipe(
        Style.attach(Style.forSlots(GridSlots)({ cell: Style.inline(declarations) })),
      )
      expect(() => Inert.draw(Moved, input())).toThrow(
        `slot "cell" protects style property "${property}"`,
      )
    },
  )

  test('the default style attaches without touching the geometry', () => {
    const Styled = View.pipe(Style.attach(GridStyle))
    const [cell] = Inert.byRole(Inert.draw(Styled, input()), 'gridcell')
    // Padding stays inside the width the window was worked out from.
    expect(Inert.style(cell)).toMatchObject({ 'box-sizing': 'border-box', width: '80px' })
    expect(Style.stylesheet(GridStyle)).toContain('[data-pinned]')
  })

  test('takes the height the application gives the scroll container', () => {
    const Tall = View.pipe(
      Style.attach(Style.forSlots(GridSlots)({ root: Style.inline({ height: '24rem' }) })),
    )
    const [grid] = Inert.byRole(Inert.draw(Tall, input()), 'grid')
    expect(Inert.style(grid)).toMatchObject({ height: '24rem', overflow: 'auto' })
  })

  test('takes a Style that only paints', () => {
    const Painted = View.pipe(
      Style.attach(Style.forSlots(GridSlots)({ cell: Style.inline({ color: 'teal' }) })),
    )
    const [cell] = Inert.byRole(Inert.draw(Painted, input()), 'gridcell')
    expect(Inert.style(cell).color).toBe('teal')
  })
})
