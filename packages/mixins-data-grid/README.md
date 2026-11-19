# foldkit-mixins-data-grid

Drawing 100,000 rows straight into HTML crashes the browser layout, and
building a virtualized table by hand still leaves you wiring WAI-ARIA grid
roles, `aria-activedescendant` focus across scrolled windows, sticky pinned
columns, resize handles, and inline cell editors.

`foldkit-mixins-data-grid` renders a [`foldkit-data-grid`](../data-grid/README.md)
model as an accessible, virtualized WAI-ARIA `grid`. Only the rows and columns
inside the scroll viewport reach the DOM, while logical row counts, keyboard
movement, selection, clipboard shortcuts, and styling Slots work out of the box.

See 100,000 virtualized rows rendered with it in the
[live data grid demo](https://foldkit-grid-demo.pages.dev/).

## Install

```sh
pnpm add effect foldkit foldkit-data-grid foldkit-mixins foldkit-mixins-data-grid
```

## A first virtualized grid

This defines a two-column `DataGrid`, attaches the default `GridStyle`, and
renders the virtualized `grid` view:

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridStyle } from 'foldkit-mixins-data-grid'

interface Item { readonly id: string; readonly name: string }
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, pinned: 'start', width: 96 },
  name: { header: 'Name', value: item => item.name, width: 240 },
})
const Grid = DataGrid.make({ id: 'items', columns })
const ItemsGrid = DataGridView<typeof Grid.Message.Type>().define(Grid).pipe(Style.attach(GridStyle))
const rows = RowModel.fromArray([{ id: 'a', name: 'Anchor' }, { id: 'b', name: 'Bolt' }], i => i.id)
const wrap = (message: typeof Grid.Message.Type) => message

const view = (state: typeof Grid.Model.Type, h: HtmlBuilder<typeof Grid.Message.Type>) =>
  ItemsGrid({ state, rows, wrap, label: 'Items', rowHeight: 32, headerHeight: 36 }, h)
```

Passing `Grid.bundle.init(undefined).model` to `view` renders a `role="grid"`
scroll container (`aria-rowcount="3"`, `aria-colcount="2"`) with a sticky `Id`
header and body rows sized to fit the viewport. Give `root` a height via `Style`
(such as `height: '24rem'`) so the grid container scrolls.

- **`DataGridView<Message>().define(Grid)`** creates a SlotView typed to `Grid`'s
  row and column types so custom cell renderers and focused addresses are
  type-checked.
- **`state`** is the `DataGrid` Model holding the focused cell, viewport
  geometry, and column layout used to compute `VirtualGrid.window`.
- **`rows`** is your `RowModel` in display order; keep the `RowModel` reference
  stable between renders so the projection stays cached.
- **`wrap`** lifts grid Messages into your application Message union when
  placed with `foldkit-bundle`.
- **Per-row memoization** skips redrawing unchanged rows when focus moves or
  the grid scrolls, as long as `wrap`, `cell`, and `marks` keep stable function
  identities across renders.
- **`GridStyle`** provides the default styling in the `components` layer.

## Where rows, grid state, and view markup live

| Fact | Owner |
| --- | --- |
| the rows, their order | your application |
| the focused cell, the scroll offsets and size | `DataGrid`, in your Model |
| which cells to draw, and their ARIA | this view, derived each render |

Your application owns the rows and places the `DataGrid` Bundle in its Model;
this view reads both and dispatches grid Messages through `wrap`.

## What it draws

| Slot | Role and key attributes |
| --- | --- |
| `root` | `role="grid"`, `tabindex="0"`, `aria-rowcount`, `aria-colcount`, `aria-activedescendant` |
| `header` | `role="rowgroup"`, sticky at top of the scroll container |
| `headerRow` | `role="row"`, `aria-rowindex="1"` |
| `headerCell` | `role="columnheader"`, `aria-colindex` |
| `resizeHandle` | `role="separator"`, column width as `aria-valuenow` |
| `body` | `role="rowgroup"`, full virtual height of all rows |
| `row` | `role="row"`, logical `aria-rowindex` (`2` for first data row) |
| `cell` | `role="gridcell"`, `aria-colindex`, cell DOM id |
| `placeholder` | placeholder row while counted rows are still loading |
| `status` | status banner (shows `"No rows."` when empty) |

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
  resizes from where it began (the header row's one listener follows it, as
  it follows a header dragged to reorder), and a cancelled pointer (`pointercancel`, or
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
- **A checkbox**, for a column whose schema decodes to a boolean
  (`Columns.checkbox`): the cell holds a `role="checkbox"` (the `checkbox`
  slot) whose `aria-checked` is the column's value and whose name is the
  column's header, in place of the cell's text (and of `cell`). A plain press
  on the box, or Space or Enter on the focused cell, sends `EditToggled`, and
  no field opens; Space toggles here rather than selecting the row. A press
  with Shift, Ctrl, Meta or Alt is the cell's, as on any cell, and so is a
  press on a `role="checkbox"` an application draws with `cell`: only the
  grid's own box toggles. Focus stays on the grid, so the box is never a tab
  stop; while its cell is the focused one, `aria-activedescendant` names the
  box rather than the cell, since the cell has no checked state to say. A
  checkbox cell has no `data-editable` (no text cursor) and no double-click
  edit. `GridStyle` draws a box the size of the text, filled with the accent
  and ticked when checked.
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
  the clipboard as tab-separated text, as spreadsheets read it, and as an
  HTML table (`text/html`, cells escaped) for a target that reads that, and the
  application hears one `Out.Copied({ rows, columns })`; paste lays
  text from the range's corner onto editable cells and the application
  hears one `Out.Pasted`; cut copies and clears the editable cells, and
  Delete or Backspace clears them without copying. While a
  cell is edited, the field has the clipboard.
- **Where the rows stand**, from `status` (`GridCrud.status` for a Remote
  page): the grid is `aria-busy` while loading or refreshing; with no rows
  it says loading, or the failure with a retry when `onRetry` is given; with
  rows, a failure is said in the `footer`, below them. `GridStyle` shows the
  loading line only once the wait is noticeable (`Utilities.busyReveal` from
  `foldkit-mixins/utilities`), its space held. While there are no rows and no
  answer (loading, or failed with nothing kept), `aria-rowcount` is `-1`, the
  count not known, rather than an empty grid's. `onMore` puts a More
  button in the footer while the count is not known. Attach `MoreOnScroll`
  (`DataGridView<Message>().define(Grid).pipe(MoreOnScroll)`) and the button
  also sends it when it comes within 200px of the grid's visible box, and
  again after each load while it stays there. Nothing is asked while the
  grid is busy, so give `status` too: without it, the button asks again each
  time it comes back into view before the page lands.
- **The column menu**, with `columnMenu: true`: each header has a button
  (`menuButton`, `aria-haspopup="menu"`) that opens a `role="menu"` below
  it, listing `Grid.menuItems`: pin to the start or the end or unpin, hide,
  and show each hidden column. On a focused header Shift+F10 or the menu key
  opens it, and Alt+ArrowDown on a column that does not filter (on one that
  does, Alt+ArrowDown opens its filter). The menu takes focus and points at its active
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
- **Filters** are the application's, as sorting is: a column with
  `filter` (`foldkit-data-grid`) needs `filters`, the application's
  `Grid.Filters` value, and a grid with none refuses it (`FiltersInput`).
  Each such header draws a `filterButton` (`aria-haspopup="dialog"`, named
  "Filter {column}", out of the tab order), and Alt+ArrowDown on the focused
  header opens the same form, advertised as the header's
  `aria-keyshortcuts`. The form is a `filter` Slot, a non-modal
  `role="dialog"` in the header cell, holding native fields for the column's
  kind: a text field ("Contains"), two bounds ("At least", "At most", typed
  with a decimal keypad), a choice's checkboxes in a `role="group"`, a
  checkbox column's radios (Any, Checked, Unchecked) in a
  `role="radiogroup"`, or two days ("From", "To"). Its first field takes
  focus; it applies as it is typed, with no Apply button; a bound that is no
  number, or an upper bound below the lower, is `aria-invalid` and described
  by a `filterError`; `filterClear` empties it while a filter holds. Escape
  closes it, focus going back to the grid on its header, and so does focus
  leaving the header; a press on the filter button while it is open stays
  inside and closes it. While a column is filtered its header and button
  carry `data-filtered`, and the header says "Filtered" as its
  `aria-description` ("Read-only, Filtered" on a column that does not edit,
  whose title's description it replaces; `words.readOnly` is that word, here
  and in the `title` a column that does not edit shows on hover). Every header is named by its own words
  (`aria-label`), so neither its buttons nor an open form join its name.
  While the form is open the grid's clipboard handlers are off, so copy, cut
  and paste in its fields are the fields' own. The words are `words.filters`; the Slots are
  `filterButton`, `filter`, `filterLabel`, `filterField`, `filterGroup`,
  `filterCheck`, `filterError` and `filterClear`, styled by `GridStyle`.
  Like the menu, the form is drawn inside the grid's scroll box, so a grid
  too short to hold it clips it.
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

## Testing in Scene

The grid starts three Mounts as it is drawn: the root's measure of its
scroll container, and one pointer listener each on the header row and the
body. Each sends a Message when it starts (`Measured`, and `MountStarted`), so
Scene can resolve them with `resolveMounts`. For the grid of the first example:

```ts
import { Scene } from 'foldkit/test'

Scene.scene(
  { update: (model, message) => Grid.bundle.update(model, message, undefined), view },
  Scene.given(Grid.bundle.init(undefined).model),
  Scene.Mount.resolveAll(
    ...DataGridView<typeof Grid.Message.Type>().resolveMounts(Grid, {
      wrap,
      viewport: { top: 0, left: 0, width: 400, height: 300 },
    }),
  ),
  Scene.keydown(Scene.role('grid'), 'ArrowDown'),
)
```

`wrap` is the one the view is given. Scene skips DOM Mounts, so pointer clicks
and drags are tested on a live runtime while keyboard flows run in Scene.

An open editor, choice list or column menu holds focus with a Mount of its
own, which sends `MountStarted` too, so a Scene test opens one, resolves what
it starts with `resolveOpened`, and acknowledges that it ended once it
closes. `opened` is `'editor'` (a cell's field, a native select included),
`'choice'` (a choice's combobox and its list) or `'menu'` (a column's menu).
With the Name column editable (`edit: {}` in its spec):

```ts
const editor = DataGridView<typeof Grid.Message.Type>().resolveOpened(Grid, { wrap, opened: 'editor' })
const field = Scene.role('textbox', { name: 'Name' })

Scene.scene(
  { update: (model, message) => Grid.bundle.update(model, message, undefined), view },
  Scene.given(Grid.bundle.init(undefined).model),
  Scene.Mount.resolveAll(
    ...DataGridView<typeof Grid.Message.Type>().resolveMounts(Grid, {
      wrap,
      viewport: { top: 0, left: 0, width: 400, height: 300 },
    }),
  ),
  Scene.keydown(Scene.role('grid'), 'ArrowRight'),
  Scene.keydown(Scene.role('grid'), 'Enter'),
  Scene.Mount.resolveAll(...editor),
  Scene.type(field, 'Anvil'),
  Scene.keydown(field, 'Escape'),
  Scene.Mount.expectEnded(...editor.map(([mount]) => mount)),
)
```

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
- A `DateFromString` column is `CellEditor.Date` and edits in a date field.
  The draft is the local calendar day, `YYYY-MM-DD`, unless the column's
  `draft` returns a string. Committing decodes that text through the schema.
- A copy's text is drawn with the grid, built once per range and rows, so
  copying a very large range costs its size each time the range changes.
- Cells render their value as text unless `cell` draws custom markup.

## Next

- Configure columns, virtualization math, editing, and filters:
  [`foldkit-data-grid`](../data-grid/README.md).
- Explore a 100,000-row product registry using both packages:
  [`examples/data-grid`](../../examples/data-grid/README.md).
- Style Slots and attach Behaviors across your app:
  [`foldkit-mixins`](../mixins/README.md).
