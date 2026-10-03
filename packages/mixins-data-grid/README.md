# foldkit-mixins-data-grid

Draws a [`foldkit-data-grid`](../data-grid/README.md) grid as an accessible,
virtualized WAI-ARIA `grid`. Only the rows and columns the viewport shows
reach the DOM; every drawn cell still says its place among all of them, the
keyboard moves focus, and every element is a Slot to style.

> **Status:** private, `0.0.0`. Phase 3 of
> [the DataGrid design](../../docs/design/data-grid-DESIGN.md). Selection,
> column state and editing come in later phases.

## Who owns what

This package draws and holds nothing. The grid's state is the `DataGrid`
Bundle from `foldkit-data-grid`, placed in the application's Model; the rows
are the application's. The view reads both and sends the grid's own Messages
through the placement's wrapper.

| Fact | Owner |
| --- | --- |
| the rows, their order | the application |
| the focused cell, the scroll offsets and size | `DataGrid`, in the Model |
| which cells to draw, and their ARIA | this view, worked out each render |

## Sixty seconds

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridStyle } from 'foldkit-mixins-data-grid'

interface Item {
  readonly id: string
  readonly name: string
}
const items: ReadonlyArray<Item> = [
  { id: 'a', name: 'Anchor' },
  { id: 'b', name: 'Bolt' },
]
const itemKey = (item: Item) => item.id

const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, pinned: 'start', width: 96 },
  name: { header: 'Name', value: item => item.name, width: 240 },
})
const Grid = DataGrid.make({ id: 'items', columns })

// The grid's state is one field of the application's Model.
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement),
])

const ItemsGrid = DataGridView<Message>().define(Grid).pipe(Style.attach(GridStyle))
const rows = RowModel.fromArray(items, itemKey)

const view = (model: Model, h: HtmlBuilder<Message>) =>
  ItemsGrid(
    {
      state: model.grid,
      rows,
      wrap: message => Placement.wrapper.make(message),
      label: 'Items',
      rowHeight: 32,
      headerHeight: 36,
    },
    h,
  )
```

`application.initial(...)` and `application.update()` run the grid's state
like any other placement; `view` draws it. Give the grid a height with a
Style on `root` (`height: '24rem'`, say): it is the scroll container.

- **`DataGridView<Message>().define(Grid)`** is a SlotView for that grid. Its
  row and column types come from the grid, so a cell renderer and the focused
  cell are checked against them.
- **`state`** is the placed `DataGrid` Model. The view reads the focused cell,
  the viewport and the column state from it, and works out the window with
  `VirtualGrid.window`.
- **`rows`** is the application's rows, in its order; the view draws them
  through the column state (`Grid.project`) and never sorts. Keep the rows
  model between renders, or the projection is rebuilt every time.
- **`wrap`** lifts the grid's Messages into the application's: keys send
  `Moved` (with the scroll that reveals the cell), a pressed cell sends
  `Focused`, and the scroll container sends `Measured`.
- **`GridStyle`** is the default look, in the `components` layer.

## What it draws

```text
root     role="grid", tabindex 0, aria-rowcount, aria-colcount, aria-activedescendant
  header   role="rowgroup", sticky at the top
    headerRow  role="row" aria-rowindex="1"
      headerCell  role="columnheader" aria-colindex
        resizeHandle  role="separator", its width as aria-valuenow
  body     role="rowgroup", the full height of every row
    row        role="row" aria-rowindex (2 for the first data row)
      cell       role="gridcell" aria-colindex, id for the active descendant
    placeholder  a row counted but not loaded yet
  status   "No rows." when there are none
```

- **Counts and indexes are logical.** `aria-rowcount` is every row plus the
  header, or `-1` when the count is unknown; `aria-rowindex` and
  `aria-colindex` are a cell's place among all rows and visible columns, so a
  screen reader says "row 5,002" of a window that holds twenty.
- **One tab stop.** DOM focus stays on `root`, and `aria-activedescendant`
  names the current cell while it is drawn. A cell scrolled out of the window
  is gone from the DOM, so the attribute is left off until it is back.
- **Keys** are `GridFocus.target`'s: arrows, Home and End, Ctrl for the
  corners, PageUp and PageDown by the rows the viewport holds. A key the grid
  does not handle (Enter, Tab, anything with Shift, Alt or Meta) keeps its
  default.
- **Resize handles** sit at each resizable column's end edge. A pointer drag
  resizes from where it began, and a cancelled pointer (`pointercancel`, or
  a lost capture) puts the width back; a focused handle steps 16px with the
  arrow keys, its
  own keys only, so the grid's focus stays put. Handles are out of the tab
  order, so the grid stays one tab stop.
- **Pinned columns** stick to their edge with `position: sticky` and carry
  `data-pinned="start"` or `"end"`; the focused cell carries
  `data-focused="true"`.

## Styling

Every element above is a Slot. A Style may paint anything, but the geometry
the window is worked out from is the view's: a Style that sets a cell's
`width`, `position`, `insetInlineStart` or `boxSizing`, a row's `height`, or
the root's `overflow` is refused with `slot "cell" protects style property`.
Cells are `border-box`, so padding stays inside the width the window assumed.

## Limits

- Every row is one height.
- A keyboard user cannot reach a resize handle yet: it is out of the tab
  order, and the grid has no key that resizes or reorders the focused
  column. Reordering, hiding and pinning have no built-in control either;
  the column Messages are sent by the application's own controls.
- No selection or editing yet.
- Cells say their value as text unless `cell` draws them; the Display
  vocabulary of `foldkit-crud` arrives with the CRUD adapter in Phase 7.
