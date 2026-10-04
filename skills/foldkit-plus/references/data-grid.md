# foldkit-data-grid and foldkit-mixins-data-grid

**In development, not published.** Phases 0 to 8 of the DataGrid design are
built: the pure model, focus, two-axis virtualization, the accessible view in
`foldkit-mixins-data-grid`, column state, selection, editing as text, Remote
and CRUD rows, the clipboard, header drag and a column menu. Typed editors
and fill are not.

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
- Column order, visibility, pinning and widths live in the `DataGrid` Model
  (`model.grid.columns`); change them with `ColumnResized`, `ColumnHidden`,
  `ColumnShown` and `ColumnMoved`. Restore a saved layout with
  `Grid.columnState.restore(saved)`, which lists the ids it dropped; do not
  decode it as the Model, whose Schema refuses an id the grid no longer has.
- Place `DataGrid.make({ id, columns }).bundle`: focus and the viewport in
  one Model. Send `Moved({ address, reveal })` for a key (with `reveal` from
  `VirtualGrid.reveal`) and `Focused({ address })` for the pointer; the
  update scrolls the container whose DOM id is `id`.
- The parts are `GridFocus.make(columns)`, a Bundle with one Message, `Focused`.
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

## Drawing it

`DataGridView<Message>().define(Grid)` from `foldkit-mixins-data-grid` is a
SlotView; attach `GridStyle` for the default look. Its input is the placed
`DataGrid` Model as `state`, the application's `rows` (a `RowModel`, kept
between renders), `wrap` (the placement's wrapper), a `label`, `rowHeight`
and `headerHeight`; widths come from the column state. The view's README has
the whole wiring, compiled.

- The view sends the grid's own Messages through `wrap`; place
  `DataGrid.make(...).bundle` with `Bundle.declare` and pass its wrapper.
- `root` is the scroll container: give it a height with a Style. A Style that
  sets a cell's `width`, `position`, `insetInlineStart` or `boxSizing`, or a
  row's `height`, throws `slot "cell" protects style property`.
- A grid has an OutMessage, `Grid.Out`: `Edited({ row, column, text })` or
  `Pasted({ accepted, refused })` (match it with `Grid.Out.match`). Place it
  with `onOut` (`Bundle.ignore` if no column has `edit`). An edit is text;
  the application parses and writes it. Copy, cut and paste are TSV.
- Over a `Crud.list`: `foldkit-data-grid/crud`'s `GridCrud.columns(list,
  { columns })`, where `columns` gives a member `pinned`, `width` or `edit`,
  `GridCrud.rows(page, key)` and `GridCrud.status(page)`; give the view
  `status`, `onRetry` (`list.refresh`), `onMore` (`list.more`) and `sort`
  (`foldkit-crud`'s `Sort`). Sorting stays the query's. `moreOnScroll: true`
  also sends `onMore` as the end comes into view.
- Selection is opt-in: `DataGrid.make({ ..., rowSelection: 'multiple',
  cellSelection: true })`. Ask `GridSelection.isSelected(model.grid.selection.rows)`
  once per render; select-all is `AllExcept`, so it holds rows not loaded.
  The view handles the clicks and keys (Shift ranges, Space, Ctrl+A, Escape);
  a Shift click over rows does not extend a row range, Shift+Space does.
- Resizable columns get a drag handle (`resizeHandle`, a `role="separator"`),
  out of the tab order. By keyboard: ArrowUp from the first row reaches the
  header, where Shift+Arrow resizes and Ctrl/Meta+Shift+Arrow reorders. A
  header dragged with the pointer reorders too. `columnMenu: true` on the
  view adds a menu to each header to pin, unpin, hide and show columns.
- ARIA is logical: `aria-rowindex` and `aria-colindex` count every row and
  visible column, drawn or not; `aria-rowcount` is `-1` for an unknown count.

See also: [the 100,000-row registry example](https://github.com/doeixd/foldkit-plus/blob/main/examples/data-grid),
[the view's README](https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-data-grid/README.md),
[the package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/data-grid/README.md)
and [the DataGrid design](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/data-grid-DESIGN.md).
