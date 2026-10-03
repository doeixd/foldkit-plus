# foldkit-data-grid

The model under a Foldkit data grid: which cells exist, in what order, and
where a move or a range lands. It is pure geometry over rows the application
supplies, so focus, selection, virtualization and the clipboard all ask one
value instead of reading positions from the DOM.

> **Status:** private, `0.0.0`. Phases 0 to 3 of
> [the DataGrid design](../../docs/design/data-grid-DESIGN.md): the pure model,
> focus, two-axis virtualization, and the grid's state as one Bundle. This
> package draws nothing; [`foldkit-mixins-data-grid`](../mixins-data-grid/README.md)
> draws it. Selection, column state and editing come in later phases.

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

[`foldkit-mixins-data-grid`](../mixins-data-grid/README.md) wires these keys
onto the drawn grid.

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

## One grid's state

`DataGrid.make({ id, columns })` joins focus, the viewport and the column
state into the one Bundle an application places for a grid. Its update is
the parts' own; what it adds is the seam between them: a key that moves
focus off screen scrolls the container.

```ts
import { Option } from 'effect'
import { DataGrid } from 'foldkit-data-grid'

const Grid = DataGrid.make({ id: 'products', columns })

Grid.Message.Moved({
  address: { row: 'p2', column: 'price' },
  reveal: Option.some({ top: 64, left: 0 }),
})
// update focuses the cell and returns GridViewport.scrollTo('products', ...)
```

- **`Focused`** is a cell focused by the pointer or the browser; it scrolls
  nothing.
- **`Moved`** is a key's move, with `reveal` from `VirtualGrid.reveal`, worked
  out by the view from the viewport it drew. When it is some, the update
  issues the Command that scrolls the container whose DOM id is `id`.
- **`Measured`** and **`Revealed`** are the viewport's, from
  `GridViewport.Measure` and the scroll Command.
- **`ColumnResized`**, **`ColumnHidden`**, **`ColumnShown`** and
  **`ColumnMoved`** change the column state (below).
- **`ResizeStarted`**, **`ResizeMoved`** and **`ResizeEnded`** are a pointer
  drag on a resize handle. The grid records the width the drag began at, so
  each move is measured from there, not summed; a cancelled drag puts the
  width back. A column that does not resize starts no drag.

The Model is `{ focus, viewport, columns, resizing }` and encodes to plain
data.
`Grid.project(rows, model.columns)` is the projection for that state, built
once per rows model and state, so the view and the application share it.
`GridFocus` and `GridViewport` stay available for a grid that composes its
own state.

## Selection

Selection is the grid's and opt-in: `DataGrid.make({ id, columns, rowSelection:
'multiple', cellSelection: true })`. Without the options the selection
Messages change nothing.

```ts
const Picking = DataGrid.make({ id: 'picking', columns, rowSelection: 'multiple' })
const start = Picking.bundle.init(undefined).model
const picked = Picking.bundle.update(start, Picking.Message.RowSelected({ row: 'p1' }), undefined).model
GridSelection.isSelected(picked.selection.rows)('p1') // true
```

- **Rows** are a `RowSelection`: `Keys({ keys })`, or `AllExcept({ except })`
  after `AllRowsSelected`, so select-all holds every row whether loaded or
  counted at all. `RowSelected` toggles a row in `'multiple'` mode and is the
  selection in `'single'` mode; either way it becomes the anchor.
  `RowsExtended({ rows, to })` adds a Shift range the view worked out with
  `GridSelection.rowsBetween`; `RowsCleared` empties it.
- **Cells** are one rectangle, `CellsSelected({ anchor, focus })`, named by
  its corners, so it survives a re-sort as the same two cells and
  `GridSelection.boxOf(projection, range)` is what it covers now. A plain
  click or key (`Focused`, `Moved`) lets it go: one focused cell is the
  default selection. `GridSelection.extend` is the range a Shift key makes.
- **`GridSelection.isSelected(selection)`** indexes a selection once; call it
  once per render, not per row.

## Editing

A column with `edit` is editable. The grid owns the edit session (which
cell, the draft, an error); the application owns the value, and hears of a
commit as the grid's OutMessage:

```ts
const priced = Columns.define<Product>()({
  sku: { header: 'SKU', value: product => product.sku },
  price: {
    header: 'Price',
    value: product => product.price,
    edit: {
      draft: product => product.price.toFixed(2),
      validate: text =>
        Number.isFinite(Number(text)) ? Option.none() : Option.some('Not a number'),
    },
  },
})
const Prices = DataGrid.make({ id: 'prices', columns: priced })
type Out = typeof Prices.Out.Type // Edited({ row, column, text }) | Pasted({ accepted, refused })
```

- **`EditStarted({ address, draft })`** opens an edit on an editable cell;
  `EditChanged` keeps the draft; `EditCancelled` drops it.
- **`EditCommitted({ next, reveal })`** asks the column's `validate`. A draft
  it refuses keeps the edit with the error, and nothing is reported. One it
  accepts ends the edit, moves focus to `next`, and the update returns the
  OutMessage `Out.Edited({ row, column, text })`.
- **Place the grid with `onOut`.** Every placement handles the OutMessage, as
  any Bundle's must; a grid that edits nothing passes `onOut: Bundle.ignore`.
- **A click on another cell commits first;** a refused draft keeps the edit
  and the click waits. Hiding the edited column ends the edit.

## The clipboard

Copy and paste speak the tab-separated text spreadsheets do. `Clipboard` is
pure: it writes and reads that text and lays a paste onto the grid; the view
wires it to the browser's copy, cut and paste events.

```ts
Clipboard.toTsv([['SKU', 'Price'], ['A-1', '9']]) // 'SKU\tPrice\nA-1\t9'
Clipboard.parseTsv('a\t"b\tc"\r\n') // [['a', 'b\tc']]
```

- **`Clipboard.copy(projection, box, textOf)`** is a box's cells as TSV,
  rows in the projection's order and columns in display order.
- **`Clipboard.pasteAt(projection, anchor, matrix, editable)`** is where
  pasted text lands: laid from the anchor, dropping cells past the edges, on
  columns that do not edit, or on rows not loaded.
- **`Pasted({ cells })`** hands those cells to the grid, which checks each
  against its column's `validate` and reports one `Out.Pasted({ accepted,
  refused })`: one change for the application to apply, and say what it
  refused. A paste while a cell is edited is the field's.

## Row counts

A `RowModel`'s `count` is a `RowCount`:

- **`Known({ total })`**: every row is counted. Rows past the loaded ones are
  in range, but have no key until they load, so a move onto one finds no cell.
- **`Unknown({ atLeast })`**: a cursor that may have more. Movement stops at
  the rows seen so far.

## Column state

The grid owns where its columns stand and how wide they are: a
`ColumnLayout` plus the widths of the columns resized. A column's spec says
how it starts and what it allows: `width`, `minWidth`, `maxWidth`,
`resizable` and `hideable`.

```ts
const State = Grid.columnState

const resized = State.resize(State.initial(), 'price', 90)
State.widthOf(resized)('price') // 90
State.move(resized, 'price', 'start', 0) // pinned first
const saved = JSON.stringify(State.hide(resized, 'sku'))

const { state, dropped } = State.restore(JSON.parse(saved))
// state is what was saved; dropped lists ids these columns no longer define
```

- **Each operation returns the state it was given when it changes nothing**:
  a resize to the width a column has, hiding a hidden column, a move to where
  a column stands. A resize is clamped to the column's limits; a column that
  is not `resizable` or `hideable` refuses.
- **The last column shown stays shown,** so the grid always has a cell to
  focus.
- **`move(state, column, region, index)`** is a reorder within a region, or a
  pin or an unpin across them; `index` counts the region with the column
  taken out.
- **`restore(saved)`** reads a saved state leniently: an id the columns no
  longer define, or one named twice, is dropped and listed in `dropped`; a
  column the save predates takes its declared place; a width is clamped.
  Input that is not a saved state is the initial state. The Model's own
  Schema, by contrast, decodes only these columns' ids, so a stored Model
  naming a removed column fails to decode: restore a saved layout with
  `restore`, not by decoding it as the Model.
- **`widthOf(state)`** is the width each column is drawn at. Call it once per
  state: it indexes the widths.

A projection built from a hand-written layout is lenient too: a column the
layout omits joins the center, an unknown id is dropped, and an id named
twice keeps its first place.

## Limits

- No selection or editing yet; both are later phases. The view is
  [`foldkit-mixins-data-grid`](../mixins-data-grid/README.md).
- Every row is one height.
