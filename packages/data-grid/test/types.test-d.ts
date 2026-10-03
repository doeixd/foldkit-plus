import { Option } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  type CellAddress,
  type ColumnId,
  ColumnLayout,
  Columns,
  DataGrid,
  GridFocus,
  GridProjection,
  RowModel,
  VirtualGrid,
} from 'foldkit-data-grid'

interface Product {
  readonly id: string
  readonly sku: string
  readonly price: number
}

const columns = Columns.define<Product>()({
  sku: { header: 'SKU', value: product => product.sku },
  price: { header: 'Price', value: product => product.price },
})

// Ids come from the spec's keys; each value keeps its own type.
expectTypeOf<ColumnId<typeof columns>>().toEqualTypeOf<'sku' | 'price'>()
expectTypeOf(columns.byId.price.value).returns.toEqualTypeOf<number>()
expectTypeOf(columns.byId.sku.id).toEqualTypeOf<'sku'>()

Columns.define<Product>()({
  // @ts-expect-error a value reads the declared row type
  sku: { header: 'SKU', value: product => product.missing },
})

Columns.define<Product>()({
  // @ts-expect-error a column needs a header
  sku: { value: (product: Product) => product.sku },
})

Columns.define<Product>()({
  // @ts-expect-error a column pins to the start or the end
  sku: { header: 'SKU', value: (product: Product) => product.sku, pinned: 'left' },
})

const rows = RowModel.fromArray<Product>([], product => product.id)
const projection = GridProjection.make({ rows, columns, layout: ColumnLayout.initial(columns) })

expectTypeOf(projection.columns).toEqualTypeOf<ReadonlyArray<'sku' | 'price'>>()
expectTypeOf(projection.first()).toEqualTypeOf<Option.Option<CellAddress<'sku' | 'price'>>>()

// @ts-expect-error an address names a column the grid defines
projection.moveBy({ row: 'p:1', column: 'name' }, { columns: 1 })

GridProjection.make({
  rows,
  columns,
  // @ts-expect-error a layout names the grid's own columns
  layout: { start: ['name'], center: [], end: [], hidden: [] },
})

interface Order {
  readonly id: string
  readonly total: number
}

GridProjection.make({
  // @ts-expect-error the rows are the type the columns read
  rows: RowModel.fromArray<Order>([], order => order.id),
  columns,
  layout: ColumnLayout.initial(columns),
})

// A column over a wider row type reads a narrower row: only `id` is needed.
const idOnly = Columns.define<{ readonly id: string }>()({
  id: { header: 'Id', value: row => row.id },
})
GridProjection.make({ rows, columns: idOnly, layout: ColumnLayout.initial(idOnly) })

const Focus = GridFocus.make(columns)
expectTypeOf<typeof Focus.Model.Type>().toEqualTypeOf<{
  readonly current: Option.Option<{ readonly row: string; readonly column: 'sku' | 'price' }>
}>()

// @ts-expect-error a focused cell names a column the grid defines
Focus.Message.Focused({ address: { row: 'p:1', column: 'name' } })

GridFocus.target(projection, {
  current: Option.none(),
  key: 'ArrowDown',
  modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
  // @ts-expect-error a direction is ltr or rtl
  direction: 'up',
  pageRows: 10,
})

// @ts-expect-error PageUp and PageDown need the rows a page shows
GridFocus.target(projection, {
  current: Option.none(),
  key: 'ArrowDown',
  modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
})

const viewport = { top: 0, left: 0, width: 300, height: 100 }
VirtualGrid.window({ projection, rowHeight: 32, width: () => 100, viewport })

VirtualGrid.window({
  projection,
  rowHeight: 32,
  // @ts-expect-error a width is asked of the grid's own columns
  width: (column: 'name') => column.length,
  viewport,
})

// @ts-expect-error a viewport has a size as well as offsets
VirtualGrid.window({ projection, rowHeight: 32, width: () => 100, viewport: { top: 0, left: 0 } })

const Grid = DataGrid.make({ id: 'products', columns })
expectTypeOf<typeof Grid.Model.Type>().toEqualTypeOf<{
  readonly focus: {
    readonly current: Option.Option<{ readonly row: string; readonly column: 'sku' | 'price' }>
  }
  readonly viewport: {
    readonly top: number
    readonly left: number
    readonly width: number
    readonly height: number
  }
}>()

// @ts-expect-error a move names a column the grid defines
Grid.Message.Moved({ address: { row: 'p:1', column: 'name' }, reveal: Option.none() })

// @ts-expect-error a reveal is offsets, not a cell
Grid.Message.Moved({ address: { row: 'p:1', column: 'sku' }, reveal: Option.some({ row: 1 }) })
