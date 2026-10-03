# foldkit-data-grid

The model under a Foldkit data grid: which cells exist, in what order, and
where a move or a range lands. It is pure geometry over rows the application
supplies, so focus, selection, virtualization and the clipboard all ask one
value instead of reading positions from the DOM.

> **Status:** private, `0.0.0`. Phases 0 to 2 of
> [the DataGrid design](../../docs/design/data-grid-DESIGN.md): the pure model,
> focus as a Bundle, and two-axis virtualization. Selection, column state,
> editing and the view come in later phases. Nothing here renders yet.

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

## Focus

Focus is the grid's first piece of state: which cell is current, held in the
Model by identity. Make it once per grid, then place its Bundle like any
other.

```ts
import { Option } from 'effect'
import { GridFocus } from 'foldkit-data-grid'

const Focus = GridFocus.make(columns)
// Focus.bundle is placed with foldkit-bundle; Focus.Model holds
// { current: Option<CellAddress> }, stored as null when nothing is focused.

const next = GridFocus.target(grid, {
  current: Option.some({ row: 'p1', column: 'sku' }),
  key: 'ArrowDown',
  modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
  pageRows: 10,
})
// Option.some({ row: 'p2', column: 'sku' }): dispatch Focus.Message.Focused with it
```

- **`GridFocus.make(columns)`** builds the Bundle, its Model and its one
  Message, `Focused`. The stored column is one of these columns' ids, so a
  saved focus naming a removed column fails to decode. Focusing the focused
  cell again returns the Model it was given.
- **`GridFocus.target(projection, options)`** is the cell a key moves to:
  arrows, Home and End (with Ctrl, the grid's corners), and PageUp and
  PageDown by `pageRows`. Under `direction: 'rtl'` left and right swap. It
  returns none for a key the grid leaves to the page, such as Enter, Tab, or
  anything with Shift, Alt or Meta; a key it handles always lands somewhere,
  staying put at an edge or before a row that has not loaded.
- **`GridFocus.tabStop(projection, current)`** is the cell holding the grid's
  one tab stop: the focused cell while it is shown, else the first cell. A
  focused cell in a hidden column stays in the Model, so focus comes back
  when the column does.
- **`GridFocus.cellId(gridId, address)`** is a cell's DOM id, unique across
  cells whatever their keys hold. The grid keeps DOM focus on its container
  and points at the current cell with `aria-activedescendant`, so a cell can
  scroll out of a virtual window without losing focus.

The keyboard wiring onto the drawn grid arrives with the view in Phase 3.

## Virtualization

A grid draws only what its scroll container shows. The container's scroll
offsets and size are the fact; `GridViewport` keeps them in the Model, and
`VirtualGrid.window` turns them into the rows and columns to draw.

```ts
import { VirtualGrid } from 'foldkit-data-grid'

const shown = VirtualGrid.window({
  projection: grid,
  rowHeight: 32,
  width: column => (column === 'sku' ? 120 : 80),
  viewport: { top: 0, left: 0, width: 600, height: 320 },
  overscan: { rows: 4, columns: 1 },
})
// shown.rows: { start: 0, end: 2, before: 0, after: 0 }: draw rows [start, end)
// shown.start, shown.centerColumns, shown.end: the columns to draw, in order
// shown.width, shown.height: the size of the scrollable content
```

- **`VirtualGrid.window(options)`** is pure. Rows are one fixed height, so the
  row window is arithmetic on the scroll offset and never walks the rows; the
  center columns are found by binary search over their widths. Pinned
  columns are always drawn, outside the horizontal window. `before` and
  `after` are the space the undrawn rows and columns take, for spacers.
  `headerHeight` leaves header rows inside the container out of the body.
  It throws for a row height that is not a positive number.
- **`VirtualGrid.reveal(options)`** is the least scroll that shows a cell,
  as `{ top, left }`, or none when it is already in view. A pinned column
  never scrolls, so only its row is brought in.
- **`GridViewport.bundle`** holds `{ top, left, width, height }`.
  `GridViewport.Measure` is a Mount for the scroll container: it reports the
  geometry when it mounts and on every scroll and resize. Readings that are
  not numbers are ignored, and an overscroll reads as the edge.
- **`GridViewport.scrollTo(viewportId, offsets)`** is the Command that
  applies a reveal: it scrolls the container and reports `Revealed`, so the
  next window is drawn from the new offsets without waiting for the scroll
  event.

`packages/data-grid/bench` measures this at 100,000 rows; see
[the benchmarks](../../docs/benchmarks.md#foldkit-data-grid-100000-rows).

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

- No view yet, and no state beyond focus and the viewport: selection, column
  state, editing and the accessible renderer are later phases.
- Every row is one height. Column widths are a function the caller passes;
  resizing and saving them is Phase 4's column state.
