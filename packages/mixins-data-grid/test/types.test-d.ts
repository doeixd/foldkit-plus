import { Option } from 'effect'
import { Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { SlotView } from 'foldkit-mixins'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { expectTypeOf } from 'vitest'

interface Item {
  readonly id: string
  readonly qty: number
}
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id },
  qty: { header: 'Qty', value: item => item.qty },
})
const Grid = DataGrid.make({ id: 'items', columns })
type GridMessage = typeof Grid.Message.Type
const View = DataGridView<GridMessage>().define(Grid)
const rows = RowModel.fromArray<Item>([], item => item.id)
const state = Grid.bundle.init(undefined).model
const h = SlotView.inertBuilder<GridMessage>()

const base = {
  state,
  rows,
  wrap: (message: GridMessage) => message,
  label: 'Items',
  rowHeight: 20,
  headerHeight: 20,
}
View(base, h)

// The row and column types come from the grid: a cell renderer is typed by them.
View(
  {
    ...base,
    cell: (column, row) => {
      expectTypeOf(column).toEqualTypeOf<'id' | 'qty'>()
      expectTypeOf(row).toEqualTypeOf<Item>()
      return String(row.qty)
    },
  },
  h,
)

View(
  {
    ...base,
    state: {
      ...state,
      // @ts-expect-error a focused cell names a column the grid defines
      focus: { current: Option.some({ row: 'a', column: 'name' }) },
    },
  },
  h,
)

View(
  {
    ...base,
    // @ts-expect-error the rows are the type the grid's columns read
    rows: RowModel.fromArray<{ readonly id: string }>([], row => row.id),
  },
  h,
)

// Filters: given exactly when a column filters.
{
  const filtering = Columns.define<Item>()({
    id: { header: 'Id', value: item => item.id, filter: true },
    qty: { header: 'Qty', value: item => item.qty },
  })
  const Filtering = DataGrid.make({ id: 'filtering', columns: filtering })
  type FilteringMessage = typeof Filtering.Message.Type
  const FilteringView = DataGridView<FilteringMessage>().define(Filtering)
  const filteringH = SlotView.inertBuilder<FilteringMessage>()
  const given = {
    state: Filtering.bundle.init(undefined).model,
    rows,
    wrap: (message: FilteringMessage) => message,
    label: 'Items',
    rowHeight: 20,
    headerHeight: 20,
  }
  FilteringView({ ...given, filters: Filtering.noFilters }, filteringH)
  // @ts-expect-error a grid whose column filters needs the application's filters
  FilteringView(given, filteringH)
  // @ts-expect-error a grid with no filtering column takes no filters
  View({ ...base, filters: Filtering.noFilters }, h)
  // @ts-expect-error filters name only the filtering columns
  FilteringView({ ...given, filters: { ...Filtering.noFilters, qty: Option.none() } }, filteringH)

  // A grid that filters nothing reports no `Filtered`, so a match needs no arm for it.
  Grid.Out.match(Grid.Out.UndoRequested(), {
    Edited: () => 0,
    Pasted: () => 0,
    UndoRequested: () => 0,
    RedoRequested: () => 0,
    Filled: () => 0,
    RowsRequested: () => 0,
  })
  Grid.Out.match(Grid.Out.UndoRequested(), {
    Edited: () => 0,
    Pasted: () => 0,
    UndoRequested: () => 0,
    RedoRequested: () => 0,
    Filled: () => 0,
    RowsRequested: () => 0,
    // @ts-expect-error a grid that filters nothing has no `Filtered` to match
    Filtered: () => 0,
  })
}

// A grid that filters must match its `Filtered` arm.
{
  const filtering = Columns.define<Item>()({
    id: { header: 'Id', value: item => item.id, filter: true },
  })
  const Filtering = DataGrid.make({ id: 'filtering-out', columns: filtering })
  // @ts-expect-error a grid with a filtering column reports `Filtered`, so its match needs the arm
  Filtering.Out.match(Filtering.Out.UndoRequested(), {
    Edited: () => 0,
    Pasted: () => 0,
    UndoRequested: () => 0,
    RedoRequested: () => 0,
    Filled: () => 0,
    RowsRequested: () => 0,
  })
}
