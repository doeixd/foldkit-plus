# foldkit-data-grid

**In development, not published.** Phases 0 to 2 of the DataGrid design are
built: the pure model, focus as a Bundle, and two-axis virtualization.
Selection, column state, editing and the view are later phases; nothing here
renders.

## What it owns

Geometry: which cells exist and where they stand, given rows the application
supplies, typed columns, and a column layout. The grid never sorts, filters or
fetches; row order is the application's (its Model or Remote query). For a
plain sortable list of records, use `foldkit-crud`'s `Crud.list` with
`foldkit-mixins-crud` instead.

## Basic use

```ts
import { ColumnLayout, Columns, GridProjection, RowModel } from 'foldkit-data-grid'

interface Product {
  readonly id: string
  readonly sku: string
  readonly price: number
}

const columns = Columns.define<Product>()({
  sku: { header: 'SKU', value: product => product.sku, pinned: 'start' },
  price: { header: 'Price', value: product => product.price },
})

const products: ReadonlyArray<Product> = [
  { id: 'p1', sku: 'A-1', price: 9 },
  { id: 'p2', sku: 'B-2', price: 2 },
]
const productKey = (product: Product) => product.id

const grid = GridProjection.make({
  rows: RowModel.fromArray(products, productKey),
  columns,
  layout: ColumnLayout.initial(columns),
})

grid.moveBy({ row: 'p1', column: 'sku' }, { rows: 1, columns: 1 })
// Option.some({ row: 'p2', column: 'price' })
```

## Gotchas

- A cell is `{ row: key, column: id }`, never a position, so it survives a
  re-sort. Ask `positionOf` where it stands now.
- Every lookup returns an `Option`: a hidden column, a removed row, or a
  counted row not loaded yet has no cell.
- `Columns.define` is called twice (`<Row>()` then the specs) so ids and
  value types are inferred. It throws for a numeric id and for `__proto__`.
- `RowModel.fromArray` caches per array and key function; keep both stable
  across renders, or it re-indexes every time. It throws on a duplicate key.
- A `ColumnLayout` is ids only: start, center and end regions plus a hidden
  list. A saved layout that omits a column gets it appended to the center.
- Focus is `GridFocus.make(columns)`: a Bundle with one Message, `Focused`.
  `GridFocus.target(projection, { current, key, modifiers, pageRows })` is
  the cell a key moves to, or none for a key the grid leaves to the page
  (Enter, Tab, anything with Shift, Alt or Meta). Dispatch `Focused` with it.
- DOM focus stays on the grid's container; point at the current cell with
  `aria-activedescendant` and `GridFocus.cellId(gridId, address)`.
- Draw only `VirtualGrid.window({ projection, rowHeight, width, viewport })`:
  rows `[rows.start, rows.end)`, then `start`, `centerColumns` and `end`, with
  `before`/`after` as spacers. Every row is one height.
- The viewport is `GridViewport`: place its Bundle and attach
  `GridViewport.Measure` to the scroll container. To bring a cell into view,
  emit `GridViewport.scrollTo(viewportId, offsets)` with the offsets from
  `VirtualGrid.reveal`.

See also: [the package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/data-grid/README.md)
and [the DataGrid design](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/data-grid-DESIGN.md).
