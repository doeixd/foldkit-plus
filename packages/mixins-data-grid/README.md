# foldkit-mixins-data-grid

Draws a [`foldkit-data-grid`](../data-grid/README.md) grid as an accessible,
virtualized WAI-ARIA `grid`. Only the rows and columns the viewport shows
reach the DOM; every drawn cell still says its place among all of them, the
keyboard moves focus, and every element is a Slot to style.

> **Status:** experimental, `0.1.0`, on npm from the 0.15.0 release. Phases 3 to 8 of
> [the DataGrid design](../../docs/design/data-grid-DESIGN.md): the grid
> drawn, its header, selection, editing, status and clipboard.
> [`examples/data-grid`](../../examples/data-grid/README.md) draws 100,000
> rows with it.

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
  // A grid reports edits as an OutMessage; this one edits nothing, so it ignores them.
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
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
- **Selection**, when the grid has it: rows say `aria-selected` with
  `rowSelection`, cells in the range say it with `cellSelection`, and the
  grid is `aria-multiselectable` for either kind of several. The pointer
  goes through one listener on the body: a click focuses a cell, Shift with
  a click spans a range from the focused cell, and Ctrl or Meta with a
  click toggles the cell's row. On the keyboard, Shift with an arrow, a page,
  Home or End moves a range's far corner (scrolling it into view), Space
  selects the focused row and Shift+Space extends the rows to it, Ctrl or
  Meta with A selects every row (or every cell), and Escape lets a range go.
- **Undo and redo keys.** Ctrl or Meta with Z sends `UndoRequested`, with
  Shift (or Ctrl+Y) `RedoRequested`; the application keeps the history. Keys
  in an open editor stay the input's.
- **Fill**, in a grid that edits. Ctrl or Meta with D carries the range's
  first row down it (a lone cell or one row, the row above), with R its
  first column across it. The `fillHandle` Slot, a square at the end corner
  of the range or the focused cell, is dragged to fill along one axis; the
  cells it would write say `data-fill="target"` until it is let go, and
  Escape lets it go back. The handle is pointer-only and hidden from
  assistive technology, since the keys do the same. Held near the grid's
  edge or past it, the drag scrolls the grid that way and fills on into the
  rows it brings in.
- **The header row is part of the grid.** ArrowUp from the first row goes up
  to the header (`aria-activedescendant` names the header cell), the arrows
  and Home and End walk it, ArrowDown or Escape go back to the row focus came
  from. On a header, Shift with an arrow resizes the column 16px, and Ctrl or
  Meta with Shift and an arrow moves it within its region; both are mirrored
  in right-to-left text.
- **The editor follows the column's schema** (`Grid.editorFor`): a schema
  whose text is one of a few literals (`Schema.Literals`) is a choice of
  them: a `role="combobox"` showing the draft (the `choice` slot) beside
  its `role="listbox"` (`choiceList`, `choiceOption`), drawn by the grid and
  styled with the page. It opens on the cell's value, below the cell or
  above it when the cell is low in the view; the arrows, Home, End and the
  page keys walk it, a letter finds the next option it starts, Enter and
  Tab keep the draft and move on, Alt+ArrowUp keeps it in place, Escape
  drops it, and a press on an option chooses it. With `choiceEditor:
  'native'` it is the platform's `select`, whose picker suits a touch
  screen, its list open at once where the browser allows (`showPicker`).
  One that decodes to a number is a text field with a decimal keypad on
  touch; anything else is text (`editor`).
- **Editing**, for a column with `edit`: Enter, F2 or a double-click opens a
  text field in the cell on its text, and a printable key opens it on that
  character (`EditTyped`); keys typed before the field is drawn add to it,
  and Escape before then cancels it. In the field, Enter commits and moves down (Shift+Enter up), Tab
  commits and moves across (Shift+Tab back), and Escape cancels; the arrows
  are the field's own. Focus leaving the field (a click elsewhere) commits
  it, as Enter does without moving. A draft the column's `schema` refuses
  stays open with `aria-invalid`, and its error is shown below the field
  (`editorError`, `role="alert"`, which the field names with
  `aria-describedby`), until the draft is fixed or Escape drops it. Focus
  comes back to the grid when the field goes. Clicking another cell commits
  first. In a grid where some columns edit, the others' headers and cells
  carry `aria-readonly`, which `GridStyle` draws as a padlock before the
  header's label and muted text in the cells (a grid where nothing edits
  marks nothing). An
  editable cell carries `data-editable` (`GridStyle` gives it a text cursor),
  and the cell being edited `data-editing`, which `GridStyle` lifts with a
  shadow and hands its padding to the field, outlined in the focus colour
  with a caret of it, so an edit does not look like a cell that only has focus.
- **The clipboard** works on the range, or the focused cell. Copy puts it on
  the clipboard as tab-separated text, as spreadsheets read it; paste lays
  text from the range's corner onto editable cells and the application
  hears one `Out.Pasted`; cut copies and clears the editable cells. While a
  cell is edited, the field has the clipboard.
- **Where the rows stand**, from `status` (`GridCrud.status` for a Remote
  page): the grid is `aria-busy` while loading or refreshing; with no rows
  it says loading, or the failure with a retry when `onRetry` is given; with
  rows, a failure is said in the `footer`, below them. `onMore` puts a More
  button in the footer while the count is not known. Attach `MoreOnScroll`
  (`DataGridView<Message>().define(Grid).pipe(MoreOnScroll)`) and the button
  also sends it when it comes within 200px of the grid's visible box, and
  again after each load while it stays there. Nothing is asked while the
  grid is busy, so give `status` too: without it, the button asks again each
  time it comes back into view before the page lands.
- **The column menu**, with `columnMenu: true`: each header has a button
  (`menuButton`, `aria-haspopup="menu"`) that opens a `role="menu"` below
  it, listing `Grid.menuItems`: pin to the start or the end or unpin, hide,
  and show each hidden column. On a focused header Alt+ArrowDown, Shift+F10
  or the menu key opens it. The menu takes focus and points at its active
  item with `aria-activedescendant`; the arrows, Home and End walk it, Enter
  or Space or a click runs an item, and Escape, a choice, or focus leaving
  closes it, focus going back to the grid unless the user sent it
  elsewhere. Its words are `menu`, `pinStart`, `pinEnd`, `unpin`, `hide`
  and `show` in `words`.
- **Marks** are the application's states on single cells, such as an edit
  not yet saved: `marks: address => Option.some({ name, description })`.
  The name is drawn as `data-mark` on the cell's Slot, which the default
  style gives a dot in the corner and an application styles by name
  (`&[data-mark="refused"]` in its own `Style.forSlots(GridSlots)`), and the
  description is the cell's `aria-description`, so a screen reader says what
  the dot shows. It is asked only for the cells drawn. Five names are shared,
  for a grid over a server (`GridMarks`: `pending`, `saved`, `refused`,
  `replaced`, `peer`): `GridMarkStyle`, attached after `GridStyle`, draws
  them on the theme's tokens, a shape for each, not only a colour (and an
  outline where colours are forced), with a peer's colour from
  `--fk-grid-peer` when the application sets one. `GridLegend<Message>()`
  draws what they mean, each beside a swatch `GridLegendStyle` paints with
  the cells' own rules, so the two cannot disagree.
- **Sorting** is the application's: `sort` gives a column its direction and
  the Message that sorts it next (`foldkit-crud`'s `Sort` has this shape).
  The header says `aria-sort`, and its label is a button the pointer sorts
  with, marked `data-sort` (`asc` or `desc`) while sorted, which `GridStyle`
  draws as a small chevron after the label; its place is kept while
  unsorted, so sorting moves nothing, and a header label never wraps. Enter
  on the focused header sends it too. `GridStyle` parts columns with a faint
  line, which on a header is the resize handle, darker under the pointer.
- **Pinned columns** stick to their edge with `position: sticky` and carry
  `data-pinned="start"` or `"end"`; the pinned column next to the scrolling
  ones also carries `data-pinned-edge`, header and cells, where `GridStyle`
  draws the divider they pass under. The focused cell carries
  `data-focused="true"`.

## Styling

Every element above is a Slot. A Style may paint anything, but the geometry
the window is worked out from is the view's: a Style that sets a cell's
`width`, `position`, `insetInlineStart` or `boxSizing`, a row's `height`, or
the root's `overflow` is refused with `slot "cell" protects style property`.
Cells are `border-box`, so padding stays inside the width the window assumed.

## Limits

- Every row is one height.
- A Shift click over rows does not extend a row range yet: the click's
  Message carries the cell, not the rows between, and the grid's update
  holds no row order. Shift+Space does it from the keyboard.
- Keys read the state the last render drew, so two keys inside one frame
  both start from the same cell, as `GridNavigation`'s do. Where a Message
  could carry a stale result it carries the intent instead (`EditTyped`,
  `MenuChosen`, a drag's offset), and `update` works it out from the Model;
  see [Messages carry intent](../../docs/state-model.md#messages-carry-intent-not-results-worked-out-from-the-last-frame).
- A header dragged with the pointer reorders within its region; pinning
  goes through the column menu. On touch the browser's scroll takes the
  gesture.
- A column menu opens below its header, inside the scroll container: a grid
  shorter than the menu clips it.
- There is no date editor: a column whose schema decodes to a date is
  edited as text.
- A copy's text is drawn with the grid, built once per range and rows, so
  copying a very large range costs its size each time the range changes.
- No fill handle yet.
- Cells say their value as text unless `cell` draws them; the Display
  vocabulary of `foldkit-crud` arrives with the CRUD adapter in Phase 7.
