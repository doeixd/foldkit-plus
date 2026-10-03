# foldkit-data-grid

The model under a Foldkit data grid: which cells exist, in what order, and
where a move or a range lands. It is pure geometry over rows the application
supplies, so focus, selection, virtualization and the clipboard all ask one
value instead of reading positions from the DOM.

> **Status:** private, `0.0.0`. Phases 0 and 1 of
> [the DataGrid design](../../docs/design/data-grid-DESIGN.md): the pure model,
> and focus as a Bundle. Selection, column state, editing, virtualization and
> the view come in later phases. Nothing here renders yet.

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

- No view yet, and no state beyond focus: selection, column state, editing,
  two-axis virtualization and the accessible renderer are later phases.
- Rows have no variable heights and columns no widths yet; both arrive with
  virtualization.
