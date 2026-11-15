/**
 * What an application asks of the grid from outside its view: bring a row into
 * view, count the selected range, count the filters, and hear a copy.
 */
import { Option } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { CellEditor, ColumnFilter, Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'

interface Item {
  readonly id: string
  readonly name: string
  readonly qty: number
}
const items: ReadonlyArray<Item> = Array.from({ length: 100 }, (_, index) => ({
  id: `i${index}`,
  name: `Item ${index}`,
  qty: index,
}))
const rows = RowModel.fromArray(items, item => item.id)

const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, pinned: 'start', width: 60 },
  name: { header: 'Name', value: item => item.name, width: 100, filter: true },
  qty: { header: 'Qty', value: item => item.qty, width: 100, filter: CellEditor.Number() },
  far: { header: 'Far', value: () => '', width: 100 },
})
const Grid = DataGrid.make({ id: 'outside', columns, cellSelection: true })
const init = Grid.bundle.init(undefined).model
const sized = (viewport: Partial<typeof init.viewport>): typeof init => ({
  ...init,
  viewport: { top: 0, left: 0, width: 200, height: 100, ...viewport },
})
const target = { rowHeight: 20, headerHeight: 20 }
const { reveal } = Bundle.helpersOf(Grid.bundle)

describe('the reveal helper', () => {
  test('scrolls the least that shows the row, and moves no focus', () => {
    const model = sized({})
    const result = reveal(model, rows, { ...target, row: 50 })
    // 80px of body: row 50 ends at 1020, so the top is 940.
    expect(result.commands?.map(({ name, args }) => ({ name, args }))).toEqual([
      { name: 'GridViewport.scrollTo', args: { viewportId: 'outside', top: 940, left: 0 } },
    ])
    expect(result.model).toBe(model)
    expect(result.model.focus).toBe(model.focus)
    // Above the window it brings the row's own top to the edge.
    const above = reveal(sized({ top: 940 }), rows, { ...target, row: 3 })
    expect(above.commands?.[0]?.args).toEqual({ viewportId: 'outside', top: 60, left: 0 })
  })

  test('does nothing for a row in view or one the rows do not have', () => {
    const model = sized({})
    for (const row of [0, 3, -1, 100]) {
      const result = reveal(model, rows, { ...target, row })
      expect(result.model).toBe(model)
      expect(result.commands).toBeUndefined()
    }
  })

  test('scrolls sideways only to a column that is named', () => {
    const model = sized({ left: 40 })
    // With nothing pinned, the first column is a scrolled one: leaving it out must not scroll to it.
    const unpinned: typeof init = {
      ...model,
      columns: { ...model.columns, start: [], center: ['id', 'name', 'qty', 'far'] },
    }
    const kept = reveal(unpinned, rows, { ...target, row: 50 })
    expect(kept.commands?.[0]?.args).toEqual({ viewportId: 'outside', top: 940, left: 40 })
    // The center is 140 wide after the pinned 60: `far` ends at 300 of 240.
    const named = reveal(model, rows, { ...target, row: 50, column: 'far' })
    expect(named.commands?.[0]?.args).toEqual({ viewportId: 'outside', top: 940, left: 160 })
  })
})

describe('Grid.rangeSize', () => {
  const ranged = (anchor: string, far: string, hidden: ReadonlyArray<'name'> = []) =>
    Grid.bundle.update(
      {
        ...init,
        columns: { ...init.columns, hidden },
      },
      Grid.Message.CellsSelected({
        anchor: { row: anchor, column: 'name' },
        focus: { row: far, column: 'far' },
        reveal: Option.none(),
      }),
      undefined,
    ).model

  test('counts the rows and columns of the range, and its cells', () => {
    expect(Grid.rangeSize(rows, ranged('i2', 'i5'))).toEqual(
      Option.some({ rows: 4, columns: 3, cells: 12 }),
    )
    expect(Grid.rangeSize(rows, ranged('i5', 'i2'))).toEqual(
      Option.some({ rows: 4, columns: 3, cells: 12 }),
    )
  })

  test('is none with no range, and counts only the columns drawn', () => {
    expect(Grid.rangeSize(rows, init)).toEqual(Option.none())
    expect(Grid.rangeSize(rows, ranged('i2', 'i2'))).toEqual(
      Option.some({ rows: 1, columns: 3, cells: 3 }),
    )
    // The range's corner column is hidden: it names no box now.
    const model = ranged('i2', 'i5')
    expect(
      Grid.rangeSize(rows, { ...model, columns: { ...model.columns, hidden: ['name'] } }),
    ).toEqual(Option.none())
  })
})

describe('Grid.hasFilters and Grid.filterCount', () => {
  test('say how many columns are filtered', () => {
    expect(Grid.hasFilters(Grid.noFilters)).toBe(false)
    expect(Grid.filterCount(Grid.noFilters)).toBe(0)
    const one = Grid.setFilter(Grid.noFilters, {
      column: 'name',
      filter: Option.some(ColumnFilter.Contains({ text: 'a' })),
    })
    expect([Grid.hasFilters(one), Grid.filterCount(one)]).toEqual([true, 1])
    const two = Grid.setFilter(one, {
      column: 'qty',
      filter: Option.some(ColumnFilter.Range({ min: Option.some(1), max: Option.none() })),
    })
    expect(Grid.filterCount(two)).toBe(2)
    // Taking a filter off again is none.
    expect(Grid.hasFilters(Grid.setFilter(one, { column: 'name', filter: Option.none() }))).toBe(
      false,
    )
  })
})

describe('Copied', () => {
  test('reports the copy as it came, and not while a filter form has the clipboard', () => {
    const copied = Grid.bundle.update(init, Grid.Message.Copied({ rows: 2, columns: 3 }), undefined)
    expect(copied.outMessage).toEqual(Grid.Out.Copied({ rows: 2, columns: 3 }))
    expect(copied.model).toBe(init)
    const open = Grid.bundle.update(
      init,
      Grid.Message.FilterOpened({ column: 'name', drawn: Option.none() }),
      undefined,
    ).model
    const held = Grid.bundle.update(open, Grid.Message.Copied({ rows: 2, columns: 3 }), undefined)
    expect(held.outMessage).toBeUndefined()
    expect(held.model).toBe(open)
  })
})
