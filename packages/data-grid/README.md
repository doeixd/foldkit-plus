# foldkit-data-grid

The model under a Foldkit data grid: which cells exist, in what order, and
where a move or a range lands. It is pure geometry over rows the application
supplies, so focus, selection, virtualization and the clipboard all ask one
value instead of reading positions from the DOM.

> **Status:** private, `0.0.0`. This is Phase 0 of
> [the DataGrid design](../../docs/design/data-grid-DESIGN.md): the pure model.
> Focus, selection, column state, editing, virtualization and the view come in
> later phases. Nothing here renders or holds state yet.

## Who owns what

**The grid owns interaction state and geometry; the application owns the
records and domain mutations.**

| Fact | Owner |
| --- | --- |
| the records, their loading and caching | the application, Remote, or a local store |
| row order: a sort, a filter, a search | the application's Model or query input |
| column order, visibility and pinning | the grid, as a `ColumnLayout` |
| which cells exist and where they stand | `GridProjection`, derived from the three above |

The grid never sorts, filters or fetches. A sorted result is the order the
application hands it.

Use this package for an interactive grid: keyboard movement between cells,
ranges, editing. A readable, sortable list of records is
[`foldkit-crud`](../crud/README.md)'s `Crud.list` with
[`foldkit-mixins-crud`](../mixins-crud/README.md)'s table, which stays the
simple path.

## Mental model

```text
RowModel (rows by index, each with a stable key)
   ×
Columns (typed, by stable id)  +  ColumnLayout (start | center | end, hidden)
   ↓
GridProjection: visible cells in display order
   ↓
moves, ranges, positions: every answer an Option
```

A cell is named by identity, `{ row: key, column: id }`, never by position. A
re-sort moves a row to another index, and the address still names the same
cell; the projection says where it stands now.

## Sixty seconds

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

grid.columns // ['sku', 'price']
grid.moveBy({ row: 'p1', column: 'sku' }, { rows: 1, columns: 1 })
// Option.some({ row: 'p2', column: 'price' })
grid.box({ row: 'p2', column: 'price' }, { row: 'p1', column: 'sku' })
// Option.some({ rows: { start: 0, end: 2 }, columns: ['sku', 'price'] })
```

What each call does:

- **`Columns.define<Product>()({...})`** declares columns. Each key is a
  column's stable id, typed as a literal, and each `value` keeps its own type.
  It is called twice so the row type is given and the ids are inferred. It
  throws for an id that is a number, which JavaScript would enumerate first,
  and for `__proto__`.
- **`RowModel.fromArray(rows, key)`** reads an in-memory array. It indexes the
  keys once per array and key function, so keep both stable across renders,
  and it throws when two rows share a key. A paged or cursor source implements
  the `RowModel` interface itself.
- **`ColumnLayout.initial(columns)`** is the layout the columns declare. A
  layout is plain data, column ids only, so it can be saved.
- **`GridProjection.make(...)`** combines the three. It performs no I/O and
  holds no state; rebuild it when any input changes.

## Movement and ranges

`moveBy(address, { rows, columns })` steps in display order: it crosses from
the pinned start into the center, skips hidden columns, and stops at the
edges. `rowStart`, `rowEnd`, `first` and `last` jump to the edges.
`box(anchor, focus)` is the rectangle two cells span, from either corner, as
row indexes `[start, end)` and the columns it covers.

Every answer is an `Option`. A cell is absent when its column is hidden, its
row is gone, or its row is counted but not loaded yet.

## Row counts

A `RowModel`'s `count` is a `RowCount`:

- **`Known({ total })`**: every row is counted. Rows past the loaded ones are
  in range, but have no key until they load, so a move onto one finds no cell.
- **`Unknown({ atLeast })`**: a cursor that may have more. Movement stops at
  the rows seen so far.

## Layouts from storage

A saved layout may be older than the columns. The projection places a column
the layout omits at the end of the center region, in definition order. It
drops an id the columns no longer define, `constructor` included, and keeps
only the first place of an id named twice.

## Limits

- No state or view yet: focus, selection, column state, editing, two-axis
  virtualization and the accessible renderer are later phases of the design.
- Rows have no variable heights and columns no widths yet; both arrive with
  virtualization.
