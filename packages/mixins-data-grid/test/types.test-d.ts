import { Option } from 'effect'
import { ColumnLayout, Columns, DataGrid, GridProjection, RowModel } from 'foldkit-data-grid'
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
const projection = GridProjection.make({
  rows: RowModel.fromArray<Item>([], item => item.id),
  columns,
  layout: ColumnLayout.initial(columns),
})
const state = Grid.bundle.init(undefined).model
const h = SlotView.inertBuilder<GridMessage>()

const base = {
  state,
  projection,
  wrap: (message: GridMessage) => message,
  label: 'Items',
  rowHeight: 20,
  headerHeight: 20,
  width: () => 80,
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

const narrow = Columns.define<{ readonly id: string }>()({
  id: { header: 'Id', value: row => row.id },
})
View(
  {
    ...base,
    // @ts-expect-error the projection is over the grid's own rows
    projection: GridProjection.make({
      rows: RowModel.fromArray<{ readonly id: string }>([], row => row.id),
      columns: narrow,
      layout: ColumnLayout.initial(narrow),
    }),
  },
  h,
)
