import { Option, Schema } from 'effect'
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
  type RowSelection,
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
  readonly header: Option.Option<'sku' | 'price'>
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
    readonly header: Option.Option<'sku' | 'price'>
  }
  readonly viewport: {
    readonly top: number
    readonly left: number
    readonly width: number
    readonly height: number
  }
  readonly columns: {
    readonly start: ReadonlyArray<'sku' | 'price'>
    readonly center: ReadonlyArray<'sku' | 'price'>
    readonly end: ReadonlyArray<'sku' | 'price'>
    readonly hidden: ReadonlyArray<'sku' | 'price'>
    readonly widths: ReadonlyArray<{ readonly column: 'sku' | 'price'; readonly width: number }>
  }
  readonly resizing: Option.Option<{ readonly column: 'sku' | 'price'; readonly from: number }>
  readonly dragging: Option.Option<{ readonly column: 'sku' | 'price'; readonly delta: number }>
  readonly menu: Option.Option<{ readonly column: 'sku' | 'price'; readonly active: number }>
  readonly selection: {
    readonly rows: RowSelection
    readonly anchor: Option.Option<string>
    readonly cells: Option.Option<{
      readonly anchor: { readonly row: string; readonly column: 'sku' | 'price' }
      readonly focus: { readonly row: string; readonly column: 'sku' | 'price' }
    }>
  }
  readonly editing: Option.Option<{
    readonly address: { readonly row: string; readonly column: 'sku' | 'price' }
    readonly draft: string
    readonly error: Option.Option<string>
  }>
}>()

// @ts-expect-error row selection is single or multiple
DataGrid.make({ id: 'bad', columns, rowSelection: 'many' })

// @ts-expect-error a resize names a column the grid defines
Grid.Message.ColumnResized({ column: 'name', width: 10 })

// @ts-expect-error a column moves to a region the grid has
Grid.Message.ColumnMoved({ column: 'sku', region: 'left', index: 0 })

// @ts-expect-error a move names a column the grid defines
Grid.Message.Moved({ address: { row: 'p:1', column: 'name' }, reveal: Option.none() })

// @ts-expect-error a reveal is offsets, not a cell
Grid.Message.Moved({ address: { row: 'p:1', column: 'sku' }, reveal: Option.some({ row: 1 }) })

// Columns written inline in DataGrid.make keep their row type: without
// NoInfer on Columns.define's return, the outer call's inference made `row`
// unknown.
const Inline = DataGrid.make({
  id: 'inline',
  columns: Columns.define<{ readonly id: string; readonly n: number }>()({
    id: { header: 'Id', value: row => row.id },
    n: { header: 'N', value: row => row.n },
  }),
})
expectTypeOf(Inline.columns.byId.n.value).returns.toEqualTypeOf<number>()
// @ts-expect-error an inline grid's columns are its own
Inline.Message.Focused({ address: { row: 'r', column: 'sku' } })

// A column's edit schema types the value `matchEdit` hands its handler: a
// price decodes to a number, a schema-less name to its text, and only the
// columns that edit take a handler, each of them required.
const Cents = Schema.NumberFromString
const Editing = DataGrid.make({
  id: 'editing',
  columns: Columns.define<{ readonly id: string; readonly name: string; readonly cents: number }>()(
    {
      id: { header: 'Id', value: row => row.id },
      name: { header: 'Name', value: row => row.name, edit: {} },
      cents: { header: 'Price', value: row => row.cents, edit: { schema: Cents } },
    },
  ),
})
const cell = { row: 'r', column: 'cents' as const, text: '4' }
expectTypeOf(
  Editing.matchEdit(cell, {
    name: ({ value }) => value,
    cents: ({ value }) => value,
  }),
).toEqualTypeOf<string | number>()
Editing.matchEdit(cell, {
  name: ({ value }) => expectTypeOf(value).toEqualTypeOf<string>(),
  cents: ({ value }) => expectTypeOf(value).toEqualTypeOf<number>(),
})
// @ts-expect-error every editable column needs a handler
Editing.matchEdit(cell, { name: () => 0 })
Editing.matchEdit(cell, {
  name: () => 0,
  cents: () => 0,
  // @ts-expect-error a column that does not edit takes no handler
  id: () => 0,
})
Columns.define<{ readonly n: number }>()({
  n: {
    header: 'N',
    value: row => row.n,
    // @ts-expect-error an edit schema reads text
    edit: { schema: Schema.Number },
  },
})
