# foldkit-data-grid

The model under a Foldkit data grid: which cells exist, in what order, and
where a move or a range lands. It is pure geometry over rows the application
supplies, so focus, selection, virtualization and the clipboard all ask one
value instead of reading positions from the DOM.

> **Status:** experimental, `0.1.0`, on npm from the 0.15.0 release. The gaps are
> under [Limits](#limits). This package draws nothing;
> [`foldkit-mixins-data-grid`](../mixins-data-grid/README.md) draws it.
> [`examples/data-grid`](../../examples/data-grid/README.md) is a 100,000-row
> product registry built on both, and
> [`examples/registry`](../../examples/registry/README.md) the same with a
> server: read through Remote, edited through Sync.

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
application hands it. A column can draw a filter control
([Filtering from a column](#filtering-from-a-column)), but the value it sets is
the application's, and so is applying it.

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
- **`RowModel.map(rows, input, make)`** transforms each row as it is read,
  for local state laid over rows a server sent. `make` turns `input` (the
  edits, say) into the per-row function once per `rows` and `input`, and the
  result is the same model while both are, so the grid's projection is kept.
  Keys, count and order are `rows`' own.
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
- **`Grid.window({ rows, state, rowHeight, headerHeight, overscan })`** is
  that window for a placed grid, as `foldkit-mixins-data-grid`'s view works
  it out from the same input: to say how many rows are drawn, read it here
  rather than estimating.
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
  drag on a resize handle. `ResizeStarted` names the column by its header's
  DOM id (`GridFocus.headerId`), since it comes from the page: an id that is
  not a resizable column of this grid starts nothing. The grid records the
  width the drag began at, so each move is measured from there, not summed;
  a cancelled drag puts the width back.
- **`MountStarted`** changes nothing: the view's Mounts send it when they
  start (its pointer listeners, and what holds focus in an open editor,
  choice list or column menu), so a Scene test resolves them with what the
  runtime sends (`foldkit-mixins-data-grid`'s `resolveMounts` and
  `resolveOpened`).

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
import { GridSelection } from 'foldkit-data-grid'

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
- **A Shift click** in a `'multiple'` grid without `cellSelection` focuses
  the cell and reports `Out.RowsRequested({ from, to })`: from the anchor, or
  the row focused before it, to the row clicked. A click reaches the grid
  through a Mount, which cannot read the rows the view last drew, so the
  application, which holds them, adds the range:
  `Grid.extendRows(rows, model.grid, request)` is the grid's Model with it
  added, the rows between taken in the order they are drawn. With
  `cellSelection`, a Shift click spans cells instead.
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
commit as the grid's OutMessage. The column's `schema` says what its text
means, from the text typed to the value: a draft is committed only when it
decodes, and the failure's message is the cell's error. A schema that
decodes to a date (`Schema.DateFromString`) is `CellEditor.Date` and edits in
a date field. The draft the field opens on is the local calendar day,
`YYYY-MM-DD`. `toISOString` is the UTC day, so a local midnight used to open
the field on the wrong one. A column `draft` that returns a string still
wins. Committing decodes the field's text through the schema.

```ts
import { Schema, SchemaGetter } from 'effect'

// Dollars as typed, with at most two decimals, and the number they mean.
const Price = Schema.String.check(
  Schema.isPattern(/^\d+(\.\d{1,2})?$/, { message: 'A price, like 4.99' }),
).pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform(text => Number(text)),
    encode: SchemaGetter.transform(price => price.toFixed(2)),
  }),
)
const priced = Columns.define<Product>()({
  sku: { header: 'SKU', value: product => product.sku },
  price: {
    header: 'Price',
    value: product => product.price,
    edit: { schema: Price, draft: product => Schema.encodeSync(Price)(product.price) },
  },
})
const Prices = DataGrid.make({ id: 'prices', columns: priced })
// Edited({ row, column, text }) | Pasted({ accepted, refused }) | Filled({ source, to })
// | UndoRequested | RedoRequested | RowsRequested({ from, to })
type Out = typeof Prices.Out.Type

// In `onOut`: the committed text read back as its column's value, a number here.
const repriced = (cell: Extract<Out, { _tag: 'Edited' }>) =>
  Prices.matchEdit(cell, { price: ({ row, value }) => ({ row, price: value }) })
```

- **`EditStarted({ address, draft })`** opens an edit on an editable cell;
  `EditChanged` keeps the draft; `EditCancelled` drops it.
- **`EditCommitted({ next, reveal })`** decodes the draft with the column's
  `schema` (any text, without one). A draft it refuses keeps the edit with
  the error, and nothing is reported. One it accepts ends the edit, moves
  focus to `next`, and the update returns the OutMessage `Out.Edited({ row,
  column, text })`, unless it is unchanged: the text the edit began from, or
  text that decodes to the same value (`09.0` for `9.00`). An unchanged edit
  closes as a changed one does and reports nothing. It is judged against the
  text the edit began from, not the cell as it is now, so leaving an editor
  as it opened never writes over a change another device made meanwhile.
- **`Grid.matchEdit(cell, handlers)`** reads a reported cell's value back:
  one handler per editable column, each given its column's decoded type, so
  the application parses nothing itself. The OutMessage stays text, which a
  parent can store or send; a cell that does not decode, or names a column
  that does not edit, was not the grid's, and throws.
- **A key typed on the grid is `EditTyped({ address, text, from })`:** it
  starts the edit from `from`, the text the cell showed, or adds to the one
  open on that cell, so keys faster than the editor opens all count. On a
  choice column it finds the next option the key starts instead.
  `EditStepped({ by })` moves a choice's draft through its options (`next`,
  `previous`, `first`, `last`, `pageNext`, `pagePrevious`), and
  `EditChosen({ draft })` keeps one a pointer chose. The grid's Messages carry what the user did and
  `update` works out what it means, for the reason in
  [Messages carry intent](../../docs/state-model.md#messages-carry-intent-not-results-worked-out-from-the-last-frame).
- **Place the grid with `onOut`.** Every placement handles the OutMessage, as
  any Bundle's must; a grid that edits nothing passes `onOut: Bundle.ignore`.
- **A click on another cell commits first;** a refused draft keeps the edit
  and the click waits. Hiding the edited column ends the edit.

### Checkboxes

A column whose `schema` decodes to a boolean is `CellEditor.Checkbox`: its
cells are checkboxes drawn from the column's value, toggled in place, and no
draft opens. `Columns.checkbox` is that schema for the text `true` and
`false`, which is what a boolean shows as; any schema from text to a boolean
works the same way.

```ts
interface Task {
  readonly id: string
  readonly title: string
  readonly done: boolean
}
const tasks = Columns.define<Task>()({
  title: { header: 'Title', value: task => task.title },
  done: { header: 'Done', value: task => task.done, edit: { schema: Columns.checkbox } },
})
const Tasks = DataGrid.make({ id: 'tasks', columns: tasks })

// In `onOut`, as any edit: the text read back as a boolean.
const checked = (cell: Extract<typeof Tasks.Out.Type, { _tag: 'Edited' }>) =>
  Tasks.matchEdit(cell, { done: ({ row, value }) => ({ row, done: value }) })
```

- **`EditToggled({ cell, checked, by })`** commits the column's text for the
  other value at once and reports `Out.Edited`, as a commit does; the
  application writes the row. `cell` is the cell's DOM id and `checked` the
  value as drawn. The view sends it for a press on the box
  (`by: Grid.Toggle.Press()`) and for Space or Enter on the cell holding the
  grid's tab stop (`by: Grid.Toggle.Key({ drawn })`, `drawn` the focus that
  frame was drawn from). Before anything is focused the tab stop is the
  first cell, so a keyboard user who tabs in can toggle it at once.
- **`update` refuses it,** changing nothing, on a cell whose column does not
  edit or is no checkbox, while an edit is open, and for a key whose `drawn`
  is no longer the Model's focus: the key's frame was drawn before focus
  moved, and it would toggle the cell focus left. `EditStarted` and
  `EditTyped` on a checkbox change nothing.
- **The value must be a boolean.** The checkbox is drawn from it, so
  `Columns.define` refuses a column with `Columns.checkbox` whose `value`
  returns anything else, at the `value`. `GridCrud.columns` refuses a
  checkbox outright: a listed member's value is its text.
- **Paste and fill** judge its text by the schema, as on any column: `true`
  and `false` pass. A cut or Delete leaves a checkbox as it is, since it has
  no empty value, and clears the other cells in its range.
- **Every toggle sends the opposite of the value drawn,** so until the
  application's write of the last one is drawn, each further press or key
  sends the same value again. Where the row changes only when a server
  answers, every toggle before the answer asks for the same value, and a
  second press does not take the first one back.

## The clipboard

Copy and paste speak the tab-separated text spreadsheets do. `Clipboard` is
pure: it writes and reads that text and lays a paste onto the grid; the view
wires it to the browser's copy, cut and paste events. A copy also carries the
same cells as an HTML table, for a target that reads `text/html`.

```ts
import { Clipboard } from 'foldkit-data-grid'

Clipboard.toTsv([['SKU', 'Price'], ['A-1', '9']]) // 'SKU\tPrice\nA-1\t9'
Clipboard.parseTsv('a\t"b\tc"\r\n') // [['a', 'b\tc']]
Clipboard.toHtml([['a<b', 'x\ny']]) // '<table><tbody><tr><td>a&lt;b</td><td>x<br>y</td></tr></tbody></table>'
```

- **`Clipboard.toHtml(rows)`** is the same matrix as a `<table>`. Every cell
  is escaped (`&`, `<`, `>`, `"`) and a line break becomes `<br>`, so nothing
  a cell holds is markup. The view derives it from the TSV it wrote, so the
  two cannot disagree. Paste still reads `text/plain` only: HTML pasted from
  elsewhere is not parsed.
- **`Clipboard.copy(projection, box, textOf)`** is a box's cells as TSV,
  rows in the projection's order and columns in display order.
- **`Clipboard.pasteAt(projection, anchor, matrix, { editable, from })`** is
  where pasted text lands: laid from the anchor, dropping cells past the
  edges, on columns that do not edit, or on rows not loaded. Each cell keeps
  `from(address)`, the text it showed, as an edit would begin from.
- **`Fill`** carries a range on, as a spreadsheet's fill does, and is pure.
  `Fill.plan(projection, { source, to })` is the source's box and the box
  beyond it toward `to`, along one axis (`toward`: down, up, right or left;
  rows win a diagonal). `Fill.cells(projection, plan, { editable, from })`
  is the cells it writes, each lane of the source carried on by
  `Fill.series(texts, count, backward)`: two or more numbers a constant step
  apart continue their step, keeping the finest decimals; two or more
  `YYYY-MM-DD` days continue by months when they share a day of the month a
  constant number of months apart (a 31st clamps to a shorter month and comes
  back: Jan 31, Feb 28, Mar 31), else by days when a constant number of days
  apart, and when both fit months win; anything else repeats in order. The
  inference reads text, not the column, so a text column that happens to hold
  ISO days steps where it once repeated. A column's own series is
  `edit: { fill }`, below. Like a paste, it drops columns that do not edit and rows
  not loaded, and keeps each cell's `from`.
- **`Pasted({ cells })`** hands those cells to the grid, which drops each one
  its text leaves unchanged (as an edit judges it), checks the rest against
  their columns' `schema`, and reports one `Out.Pasted({ accepted, refused
  })`: one change for the application to apply, and say what it refused. A
  paste or cut that changes no cell reports nothing. A paste while a cell is
  edited is the field's.
- **`UndoRequested` and `RedoRequested`** (Ctrl or Meta with Z, with Shift or
  Ctrl+Y to redo) report `Out.UndoRequested` and `Out.RedoRequested`. They
  carry nothing: the grid keeps no history, since what an edit meant and how
  to take it back are the application's, read from its Model when the
  request arrives. While a cell is edited they are the field's.
- **A fill** comes from Ctrl or Meta with D (down) or R (right) over a range,
  `FillRequested`, or from dragging the range's fill handle (`FillStarted`,
  `FillDragged`, `FillEnded`, the drag held in the Model's `filling`), and
  reports `Out.Filled({ source, to })`: the range, and the cell it was
  carried to. The grid holds no rows, so the application works out what it
  writes when it arrives, `Grid.fill(rows, model.grid, request)`, with the
  rows it draws: `{ accepted, refused }`, judged as a paste's cells are
  (`Fill.plan` and `Fill.cells`, above). A fill from a lone cell, or by key
  from a range one row tall, carries on the cell above (or before) it.
- **A column's own series**, `edit: { fill: lane => Option<ReadonlyArray<string>> }`,
  replaces `Fill.series` for a fill down or up in that column. It is called
  once per lane with `{ source, count, toward }`: the source's drafts top to
  bottom, how many cells to write, and the direction. Return the texts, the
  first next to the source, or `Option.none()` for the default. Of a longer
  answer the first `count` are taken; for each cell past a shorter one the
  fill reports a refusal in `refused` (empty `text`, the error "The column’s
  series gave no text here") rather than padding or repeating. A fill right
  or left crosses columns and keeps `Fill.series`. The texts are judged by
  the column's `schema` like any fill.

```ts
import { Option } from 'effect'
import { Columns } from 'foldkit-data-grid'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

interface Shift {
  readonly day: string
}

Columns.define<Shift>()({
  day: {
    header: 'Day',
    value: shift => shift.day,
    edit: {
      fill: ({ source, count, toward }) => {
        const last = weekdays.indexOf(toward === 'down' ? source[source.length - 1]! : source[0]!)
        return last === -1
          ? Option.none()
          : Option.some(
              Array.from({ length: count }, (_, index) => {
                const step = toward === 'down' ? index + 1 : -(index + 1)
                return weekdays[(((last + step) % 5) + 5) % 5]!
              }),
            )
      },
    },
  },
})
```

## Over a `foldkit-crud` list

`foldkit-data-grid/crud` reads a `Crud.list` and the Remote page it reads in
the grid's terms. Remote still owns the page, its loading, its retries and
its next page; this subpath fetches nothing and holds nothing.

<!-- docs-check standalone
import { Schema } from 'effect'
import { Display, Crud } from 'foldkit-crud'
import { DataGrid } from 'foldkit-data-grid'
import { Entity } from 'foldkit-entity'
import { Query, type Page, type RemoteData } from 'foldkit-remote'
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, cents: Schema.Number }),
)
const PostRow = Entity.select(Post, { id: true, title: true, cents: true })
const Posts = Crud.list('Posts', {
  query: Query.make('Posts', { Input: {}, Result: Query.connection(Post) }),
  selection: PostRow,
})
type Row = typeof PostRow.schema.Type
declare const page: RemoteData<Page<Row>>
-->
```ts
import { GridCrud } from 'foldkit-data-grid/crud'

const columns = GridCrud.columns(Posts) // a Crud.list
const Grid = DataGrid.make({ id: 'posts', columns })

const rows = GridCrud.rows(page, post => post.id) // page: RemoteData<Page<Row>>
const status = GridCrud.status(page) // RowStatus: Ready, Loading, Refreshing, Failed
```

- **`GridCrud.columns(list, { columns, words })`** is a column per listed
  member, headed by its label, its value the member's text as its Display
  says it; a hidden Display (usually the id) starts hidden. `columns` adds
  what only the grid knows, per member: `pinned`, `width`, `edit`, a
  `header` of its own, or `hidden: false`. The value stays the Display's.
- **`GridCrud.rows(page, key)`** is the page's rows in its order. A page
  with more after it counts as unknown, at least its rows; a failed read
  keeps the rows it had. The same page value gives the same row model, so
  what is built from it is kept across renders.
- **`GridCrud.status(page)`** is a `RowStatus` for the view to say.
- **Sorting stays the query's.** Pass `foldkit-crud`'s sort state to the
  view's `sort`; a header sends its Message, and the application changes the
  query input. `list.more` is the view's `onMore`, `list.refresh` behind its
  `onRetry`.

The subpath needs `foldkit-crud` and `foldkit-remote`, optional peers of this
package; the core works without them.

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

<!-- docs-check standalone
import { Columns, DataGrid } from 'foldkit-data-grid'
interface Product {
  readonly id: string
  readonly sku: string
  readonly price: number
}
const columns = Columns.define<Product>()({
  sku: { header: 'SKU', value: product => product.sku },
  price: { header: 'Price', value: product => product.price },
})
const Grid = DataGrid.make({ id: 'products', columns })
-->
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
- **`dropAt(state, column, delta)`** is where a column dragged `delta`
  pixels toward its region's end lands, as the `index` `move` takes: past
  the middle of each shown neighbour it crossed. The grid's
  `ColumnDragStarted`, `ColumnDragged` and `ColumnDragEnded` hold the drag
  as the column and its delta, and work the drop out when it is let go,
  from the widths and order as they are then.
- **A column's menu** gathers these for the pointer and the keyboard:
  `Grid.menuItems(state, column)` lists pinning the column to each other
  region, hiding it, and showing each hidden column, each only when it
  changes something. `MenuOpened`, `MenuMoved`, `MenuChosen` and
  `MenuClosed` hold which menu is open and its active item; a chosen item
  is read from the menu as it stands then and sent as the column Message it
  stands for, so hiding from the menu ends an edit on the column, takes its
  header's focus and closes its menu, as `ColumnHidden` always does.
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

## Filtering from a column

A column with `filter` draws a filter form on its header
(`foldkit-mixins-data-grid`). The grid holds only the form while it is open;
the filter value is the application's, as a sort or a search is, and the
grid reports each change for the application to store and apply.

```text
header form (grid) -> Out.Filtered({ change }) -> application Model (filters)
                                                   -> held rows: Grid.keeps
                                                   -> Remote: the query's input
```

```ts
import { Schema } from 'effect'
import { CellEditor } from 'foldkit-data-grid'

interface Job {
  readonly id: string
  readonly title: string
  readonly status: 'Open' | 'Done'
  readonly hours: number
}
const Status = Schema.Literals(['Open', 'Done'])
const jobColumns = Columns.define<Job>()({
  title: { header: 'Title', value: job => job.title, filter: true },
  status: { header: 'Status', value: job => job.status, edit: { schema: Status }, filter: true },
  // Shown as text, filtered as a number: a range.
  hours: { header: 'Hours', value: job => job.hours.toFixed(1), filter: CellEditor.Number() },
})
const JobGrid = DataGrid.make({ id: 'jobs', columns: jobColumns })

// The application's value, stored as `JobGrid.Filters` (`JobGrid.noFilters` to start).
type JobFilters = typeof JobGrid.Filters.Type
// In `onOut`: one column's change written in.
const filtered = (filters: JobFilters, out: typeof JobGrid.Out.Type) =>
  JobGrid.Out.match(out, {
    Filtered: ({ change }) => JobGrid.setFilter(filters, change),
    Edited: () => filters,
    Pasted: () => filters,
    UndoRequested: () => filters,
    RedoRequested: () => filters,
    Filled: () => filters,
    RowsRequested: () => filters,
  })
// Held rows: what the filters keep, read from each row's own field.
const shown = (all: ReadonlyArray<Job>, filters: JobFilters) =>
  all.filter(
    JobGrid.keeps(filters, {
      title: job => job.title,
      status: job => job.status,
      hours: job => job.hours,
    }),
  )
```

- **`filter: true`** reads the kind from `edit.schema`'s decoded side
  (`filterKindOf`): a boolean is a checkbox, a `Date` a range of days, a
  number a range, text literals or a text enum a choice of them, a number
  enum a number, anything else text (a branded text, a template literal, a
  mixed enum). A column with no schema filters text; a `CellEditor` names the
  kind for one that does not edit.
- **`ColumnFilter`** is the value, one variant per kind: `Contains`,
  `Range`, `OneOf`, `Is`, `Between`. A filter that keeps every row (empty
  text, no bound, nothing ticked, any) is reported as none, never an empty
  variant. Each column's is typed by its spec (`FilterOf`), so
  `JobGrid.Filters.Type['status']` is `Option<OneOf<'Open' | 'Done'>>`.
- **`Out.Filtered({ change })`** carries one column's new filter or none;
  `setFilter` writes it in. Only a grid with a filtering column has this arm,
  so a grid that filters nothing matches no `Filtered`.
- **`keeps(filters, read)`** is a predicate over held rows. `read` names
  each filtering column's own field, typed by its variant, never the text a
  cell shows: `hours: job => job.hours.toFixed(1)` does not compile.
  `Contains` folds ASCII case only, as `Expr.contains` does on every backend;
  a `Between` compares a `Date` by its local day, so a server applying the
  same filter must store or compare local days too to agree with it. Build it
  once per filters value: the predicate is a function of the filters alone.
- **`Filters`** is the stored form: `null` for none, and each column only
  its own variant, never empty, a choice only of its literals each once,
  bounds finite numbers or `YYYY-MM-DD` days. A key no filtering column has
  is refused whatever the decode is given, so a URL or a saved view naming a
  removed column fails to decode rather than being dropped silently.
- **Over a Remote list,** the application maps its filters onto the
  query's input, and the query's body filters what is given
  (`Expr.whenGiven(input.statuses, statuses => Expr.in(fields.status,
  statuses))`, `Expr.whenGiven(input.min, min => Expr.gte(fields.cents,
  min))`), with null for a column not filtered. `examples/registry` filters
  statuses and prices that way, its prices typed in dollars and rounded inward
  to cents so the server keeps what the range says.

The form's update:

- **`FilterOpened({ column, drawn })`** opens the form seeded with the
  application's filter as the view drew it; it is refused for a column that
  does not filter or is hidden, or a `drawn` its column refuses. Opening
  focuses the header and closes the menu, as `MenuOpened` does.
- **A field's change** (`FilterTyped`, `FilterOptionToggled`,
  `FilterChecked`) is applied to the form as it is now, so keys faster than a
  frame add up. It is reported when the form reads as a valid filter other
  than the last reported. A bound that is no number (`1x`, `0x10`, or 309
  digits, past every finite number) is not reported, so the rows stay
  filtered by the last filter that held; crossed bounds are reported, and keep
  nothing.
- **The form's draft is the grid's while it is open.** The application may
  store each `Out.Filtered` change whenever it likes (in the same update, on
  a `UrlChanged`, debounced) and may clean it (trim a text): the form keeps
  what was typed. The grid remembers every filter the form opened with or
  reported since it was last seeded, and the application's filter is the
  form's own echo while it is one of these, a `Contains` compared with its
  text trimmed (`isEcho`). Anything else is a write from outside the form
  (a saved view, a URL navigation, a value the application changed beyond
  trimming, such as a clamped `Range`): the view draws that frame stale,
  showing the written filter, and every change it sends (Clear included)
  carries the form's generation when it was drawn. The first such change
  seeds the form from the written filter before it applies; the reseed and
  each report move the generation on, so the frame's later changes add to
  the first rather than seeding again. An outside write that equals a filter
  the form already sent cannot be told from its echo, so it leaves the form
  as typed.
- **While the form is open,** a paste, a fill, an undo and a redo are
  refused, as during an edit; whatever focuses a cell or opens an edit, the
  menu or a fill closes the form, and so does hiding its column (a column
  hidden by a write to the Model closes it on the next Message).

## Limits

- Not built: a drag across regions to pin a column (the view's column
  menu pins), and more than one cell range.
- Every row is one height.
- Filters: one condition per column, all columns joined by "and"; no
  operators beyond the five (`Contains`, `Range`, `OneOf`, `Is`, `Between`);
  options are a choice's literals, not read from the data. A hidden column
  still filters, and its header cannot say so.
