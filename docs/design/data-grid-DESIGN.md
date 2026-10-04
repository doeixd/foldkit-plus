# DataGrid design

**Status:** Phases 0 to 8 built as `foldkit-data-grid` and
`foldkit-mixins-data-grid` (both private, `0.0.0`), each with the gaps its
"as built" section names, and an in-memory reference application in
`examples/data-grid`. Proposed in
[issue #144](https://github.com/doeixd/foldkit-plus/issues/144) on 2026-10-03,
and checked against the code the same day. The plan below is the issue's,
with its sketches brought in line with this repository's conventions; the
next section records each change and what the check found. Phases are tracked
in [TODO.md](./TODO.md) "Data grid".

This is the DataGrid that [ui-DESIGN.md](./ui-DESIGN.md) §13 and Phase 9 list
as `Collection + Selection + Sorting + Pagination + VirtualList +
ColumnSizing`. That formula is superseded here: a grid is a `RowModel`, typed
`Columns` and a `GridProjection`, with focus, selection, column state and
editing as Bundles over that geometry. The plan's closing "Bottom line" says why.

## Checked against the code (2026-10-03)

Every piece the plan's table names exists:

| Piece | Where | What the grid takes from it |
| --- | --- | --- |
| `Selection` | `foldkit-primitives/interaction` | keyed single/multiple selection with an anchor and Shift ranges |
| `GridNavigation` | `foldkit-primitives/interaction` | kept for calendars and swatches; its Model is one current id and a fixed `columns` count, too weak for a grid (§7) |
| `EditableText`, `Move`, `PointerDrag`, `Targets` | `foldkit-primitives/interaction` and `/dom` | inline text editing, resize deltas, reorder, delegated cell targeting |
| `Behaviors.Collection` | `foldkit-mixins` | ids, indexes and disabled state for repeated Slots |
| `Crud.list`, `Crud.Sort`, `Crud.ListView` | `foldkit-crud`, `foldkit-mixins-crud` | columns and Displays from an Entity Selection, server sort; `mixins-crud`'s Limits section confirms no row selection and no inline editing |
| `VirtualList` | `@foldkit/ui` | one-axis windowing |

The check found three things the plan does not say.

- **This repository already has a windowing primitive.** `Virtual` in
  `foldkit-primitives/state` owns scroll position and measured heights, with
  `Viewport` and `MeasureRow` Mounts. It is one axis over a keys array, with
  prefix sums cached per array identity, so a recompute is O(n) per change of
  heights. VirtualGrid's fixed-height row axis needs no keys array (a window
  is arithmetic), and an unknown row count cannot be a keys array at all. Reuse
  `Virtual`'s Mounts and its `visibleRange` contract; do not route 100k rows
  through its keys.
- **`Selection` does not scale to a grid as it stands.** Its Model is an array
  of ids, a toggle tests membership with `includes`, and `Ranged` carries the
  whole order of items. Select-all over 100k rows puts 100k ids in the Model,
  and over an unknown count it cannot be written at all. Phase 5 decides
  between adapting it and a row selection of its own, with an "all except"
  form for select-all.
- **The existing primitives write absence as `Schema.NullOr`.** They predate
  the `Option` rule. The grid's new Models do not copy them (see below); the
  primitives are not migrated as part of this work.

## Where this departs from the issue

- **Absence is an `Option`.** The issue's sketches write
  `CellAddress | null` for the current cell, a selection's anchor and focus,
  and the edited cell; below they are `Option<CellAddress>`. Grid state is
  meant to be saved (§12, §28), so these fields are
  `Schema.OptionFromNullOr` in the Model: `Option` in code, `null` stored.
- **A row count that may be unknown is a union, not a sentinel.**
  `count: number | "unknown"` makes every reader remember the string. Write
  it as a tagged union with a `Known` and an `Unknown` case and branch through
  its `match`. ARIA's own spelling for unknown, `aria-rowcount="-1"`, belongs
  in the renderer only.
- **Saved column state is untrusted input.** Column ids are the application's,
  but a saved layout is decoded from storage, so a width keyed `constructor`
  must not read `Object.prototype`. Decode with
  `onExcessProperty: 'error'` against the declared column ids, and read with
  `Object.hasOwn`. An order or pin list naming a column that no longer exists
  is dropped, and the drop is reported, not silent.
- **Clipboard goes through the `copy`, `cut` and `paste` events.** Their
  `clipboardData` is synchronous and needs no permission prompt, where
  `navigator.clipboard` is asynchronous and asks for permission to read.
  `Clipboard.copy` and `Clipboard.paste` stay pure functions from selection
  and projection to text, and from text to edits; the events only carry them.
- **Server-rendered grid markup must survive a parse.** If the renderer draws
  a native `<table>`, its rows go in a `<tbody>`, or a parser inserts one and
  Foldkit refuses the view (see AGENTS.md, "Server markup has to be what a
  parser builds from it"). Test the renderer through `renderToString`.
- **An editor's Message types the column.** `Editor.text({ message })` returns
  an application Message, so `Column.make` and `DataGrid.columns` are generic
  over the Message universe. Infer it from the `message` callbacks and pin it
  with a negative type test: issue #80 found `SlotView.define` inferring its
  Message only from the render callback.

## Phase 0 as built (2026-10-03)

The pure model is `packages/data-grid`: `Columns`, `RowModel` with
`RowCount`, `ColumnLayout` and `GridProjection`. Where it departs from §4 to §6:

- **No `Column.make` and no branded keys.** Columns are plain specs inside
  `Columns.define<Row>()({...})`, which infers each id as a literal and each
  value's type; a separate constructor would be a second way to write one.
  Column ids are that literal union, so a row key, a plain `string`, cannot
  stand in for one, and a brand would only add constructor calls.
- **A layout is three regions and a hidden list,** not an order plus two pin
  lists: every column stands in exactly one of start, center and end, so no
  two lists can disagree about its place. Hidden keeps the place.
- **`moveBy(address, { rows, columns })` and the edges** replace
  `nextCell(address, direction)`: arrows are one step, PageUp and PageDown
  are a viewport's worth of rows, and RTL is Phase 1 swapping the sign.
- **`RowModel.indexOf` is required.** Focus and ranges name rows by key, so
  every source must find one.
- **`Columns.define` refuses numeric ids and `__proto__`.** JavaScript
  enumerates integer keys first, which would reorder the columns, and a
  `__proto__` key sets the prototype, which would drop the column silently.

## Phase 1 as built (2026-10-03)

`GridFocus` in `packages/data-grid/src/focus.ts`. Where it departs from §7
and §21's Phase 1:

- **One Message, `Focused`.** The view works out the target with
  `GridFocus.target` over the projection it already holds and dispatches the
  address, as `GridNavigation` does; `Moved` would carry the same fact.
  `RequestedFocus` waits for something to request it.
- **`GridFocus.make(columns)`, one Bundle per grid.** The Model's column is
  `Schema.Literals(columns.ids)`, so a focus saved before a column was
  removed fails to decode instead of naming nothing.
- **Active descendant, not roving tabindex.** DOM focus stays on the
  container and `aria-activedescendant` names the current cell by
  `GridFocus.cellId`. A cell scrolled out of a virtual window is removed from
  the DOM; with roving tabindex the browser would drop focus to the body.
- **A cell that disappears keeps its place in the Model.** `tabStop` moves to
  the first cell while the focused column is hidden or its row is gone, and
  focus returns when the cell does. Nothing is written for it.
- **The Behavior and ensure-visible move.** Wiring keys onto Slots needs the
  Slots, so it is built with the view in Phase 3; revealing a target outside
  the window needs the window, so it is Phase 2's.

## Phase 2 as built (2026-10-03)

`VirtualGrid` (pure) in `src/virtual.ts`, and `GridViewport` (state, Mount,
Command) in `src/viewport.ts`. Where it departs from §9 and §21's Phase 2:

- **Its own Mount, not `Virtual`'s.** `Virtual.Viewport` reports only
  `scrollTop`; a grid needs both offsets and the container's size, so
  `GridViewport.Measure` reports all four on mount, scroll and resize.
  Nothing else of `Virtual` fits: its row axis is a keys array with measured
  heights, and this one is arithmetic on one height.
- **Widths are a function the caller passes.** No width is stored yet:
  Phase 4's column state owns widths, and the window reads whatever it is
  given. The column window sums the center's widths per call, which costs the
  column count; at 40 columns a window is about a microsecond.
- **A reveal is two steps.** `VirtualGrid.reveal` works out the offsets, and
  the `scrollTo` Command moves the container and reports `Revealed`, so the
  Model has the new offsets before the scroll event confirms them. Wiring a
  focus change to a reveal is the composed grid's, in Phase 3.
- **The benchmarks** are in [benchmarks.md](../benchmarks.md#foldkit-data-grid-100000-rows).

## Phase 3 as built (2026-10-03)

`DataGrid.make` in `foldkit-data-grid` (`src/grid.ts`), and
`foldkit-mixins-data-grid`: `GridSlots`, `DataGridView`, `GridStyle`. Where
it departs from §10, §13 and §21's Phase 3:

- **Foldkit's row and column ARIA builders are spelled lower-case after the
  first word:** `AriaRowcount`, `AriaRowindex`, `AriaColcount`,
  `AriaColindex`, as §10 says they exist. (A search for `AriaRowCount`
  missed them, and the first build wrote the attributes with `h.Attribute`.)
  The slots declare `Attr` tokens for them so attachments cannot write them
  twice.
- **One Bundle for the grid.** `DataGrid.make({ id, columns })` joins
  `GridFocus` and `GridViewport`; its `Moved` carries the reveal the view
  worked out, and its update issues `GridViewport.scrollTo`. That is §19's
  "DataGrid core" without `.with(...)`: selection and column state join it
  when they exist.
- **Divs with roles, not a `<table>`.** Sticky pinned cells, spacers and a
  body the height of every row are layout a table fights, and a server
  render of a table needs its `tbody` (AGENTS.md); the roles are the grid's
  semantics.
- **The Slots are fewer than §13's.** `root`, `header`, `headerRow`,
  `headerCell`, `body`, `row`, `cell`, `placeholder` and `status`. `viewport`
  is `root`, which is the scroll container; `headerLabel`, `sortIndicator`,
  `resizeHandle`, `rowSelector`, `cellContent`, `cellEditor`,
  `selectionOverlay` and `fillHandle` arrive with the phases that draw them.
- **The geometry is protected.** A cell's `width`, `position`,
  `insetInlineStart` and `boxSizing`, a row's `height`, and the root's
  `overflow` are the view's; a Style that sets one is refused. Cells are
  `border-box`, or a padded cell would be wider than the window assumed.
  The root's `height` is the application's.
- **Per-cell `mousedown`, not `Targets`.** A window is a few hundred cells,
  and each handler is a Message value; delegation can replace it if a
  profile asks.
- **No loading or error state yet.** The view says "No rows." for an empty
  grid and draws a placeholder for a row counted but not loaded; Remote's
  loading and failure are Phase 7's to map.

## Phase 7 as built so far (2026-10-03)

`foldkit-data-grid/crud`, a subpath with `foldkit-crud` and `foldkit-remote`
as optional peers, and `status`, `onRetry`, `onMore` and `sort` on the view.
Where it departs from §18:

- **A subpath, not `DataGrid.fromCrud`.** The core keeps no dependency on
  CRUD or Remote; `GridCrud` reads a list and a page into columns, a row
  model and a `RowStatus`, and the application places the grid as any
  other.
- **A column's value is its Display text,** so copy, paste and a plain cell
  say the same thing; a cell renderer can still draw the row its own way.
- **Loading and failure are a `RowStatus` the source's owner gives.** The
  grid holds none: Remote's `RemoteData` maps to it, and so can a store.
- **Load-more is a button**, offered while the count is unknown, and with
  `moreOnScroll` an IntersectionObserver on it, rooted at the grid, sends
  `onMore` within 200px of view. The button is keyed by the rows loaded,
  so after a load it observes afresh and asks again while still in view; it
  watches nothing while `status` is busy. A view cannot send a Message as
  it draws, so the window's own end is no trigger: an element coming into
  view is.
- **Not built:** the reference application over Remote with local-first
  writes; the in-memory registry is below.

## The reference application as built so far (2026-10-03)

`examples/data-grid`: 100,000 products in the application's Model, the UPC
pinned, descriptions and prices editable with validation, multiple row
selection and cell ranges, and copy and paste. `onOut` writes `Edited` and
`Pasted` into the products; the grid writes none. A jsdom test drives an edit,
a refused edit, a paste with a refused cell and select-all; a Chromium test
scrolls to the last product and checks the pinned column at full size.

`examples/registry` is the same registry over Remote and Sync: a Drizzle
server on SQLite seeded with 100,000 products, read a page at a time through
a `Crud.list` (`GridCrud.rows` and `status`), sorted by the server through
the query input, loaded more on scroll (`moreOnScroll`), with the column
menu. The edits are a Sync document: its slice is every product edited and
the fields edited, its durable Message `EditedProducts`, and the server's
journal applies each committed edit to the table through `recover`. A row is
drawn as Remote read it with the replica's edits over it, pending ones
included, so an edit shows at once, survives a reload while offline, and
another device's shows on the next exchange. Tested on the real runtime over
the in-process server and journal, over real HTTP and a WebSocket against the
full seed, and checked by hand in Chromium.

- **What building it found:** `GridCrud.columns` could not pin, size or edit
  a column (it now takes per-member options); `GridStyle` left the sort
  button native, with no direction shown (it now draws one from
  `data-sort`); and a test clicking twice within a frame resent the first
  click's Message, since a click acts on the button drawn last.
- **Two owners avoided, not merged.** The products are Remote's (server
  facts, refetch is recovery); the edits are the journal's (user intent,
  losing the outbox loses edits). The table is the journal's derivation, not
  a second owner of an edit, and the grid lays edits over rows rather than
  writing them into Remote's cache.
- **What the Sync step found:** `Mounted.dispatch` decoded what it was given,
  so a Message with an Option field never reached `update` (fixed in
  `foldkit-sync`); a random replica id per page load met a fixed storage name
  on reload and the page went blank; and an exchange that threw on one bad
  operation would have blocked every edit behind it, so a refused operation
  is now reported as rejected.
- **A tab closed for good while offline** keeps its unsent edits in
  IndexedDB under an id no tab opens again; one replica per profile with one
  writer would keep them, and is not built.
- **Not built from §22:** search and filter, saved column layout, custom
  columns and bulk edits beyond a paste.

## Phase 8 as built so far (2026-10-03)

`Clipboard` in `src/clipboard.ts` (pure), `Pasted` in the `DataGrid` Bundle,
and the copy, cut and paste handlers in the view. Where it departs from §14:

- **Foldkit's copy builder takes the text at draw time** (`OnCopyText`), and
  `clipboardData` must be filled while the event runs, so the copied text is
  worked out with the view. It is built once per projection and box, not per
  frame; a very large range costs its size each time the range changes.
  `navigator.clipboard` would be asynchronous and ask for permission.
- **One OutMessage union, `Out.Edited | Out.Pasted`.** A paste is one change
  to the application with what each column refused, the transaction §16
  asks for; turning text into values is still the application's.
- **Cut is a paste of empty text** over the copied range's editable cells,
  so a column that refuses empty text refuses the cut there.
- **Not built:** fill (§15), HTML clipboard data, multi-range copy.

## Phase 6 as built (2026-10-03)

Editing in the `DataGrid` Bundle, and the editor in the view. Where it
departs from §11:

- **One Bundle, not `Editing.bundle` beside it.** A commit moves focus, so
  the edit and the focus have to change in one update; two Bundles would
  need the parent to relay between them.
- **The commit is an OutMessage, `Edited { row, column, text }`.** §11's
  `Editor.text({ message })` would put the application's Message in the
  column, making columns generic over it; an OutMessage keeps the columns the
  application's data and hands the commit to the parent's `onOut`, the
  Bundle way. The cost is that every placement names an `onOut`.
- **An edit is text, and the column's schema says what it means.**
  `edit: { draft?, schema? }`, the schema from the text typed to the value:
  the grid commits a draft only when it decodes, the failure's message is
  the cell's error, and `Grid.matchEdit` reads a reported cell's value back,
  typed per column. The OutMessage stays text, which a parent can store or
  send. Writing the value is the application's.
- **The editor is read from the schema** (`CellEditor`, worked out once per
  column): a text side that is a union of string literals is a `select` of
  them, opened on the cell's value even by a typed key (a letter is no
  option); a schema that decodes to a number is a text field with
  `inputmode="decimal"`, not `type="number"`, which drops an invalid draft
  instead of showing why it is refused; anything else is text. A date
  editor is not built: Effect's date schemas are declarations, and reading
  their text format from the AST would be a guess.
- **A pointer leaving an edit commits it,** as a spreadsheet does; a refused
  draft keeps the edit and the click waits.

## Phase 5 as built so far (2026-10-03)

`GridSelection` and `RowSelection` in `src/selection.ts`, held in the
`DataGrid` Model as `selection: { rows, anchor, cells }`. Where it departs
from §8:

- **Not the `Selection` primitive.** It keeps an array of ids and takes the
  whole order with every Shift click; select-all over 100,000 rows would be
  100,000 ids, and over an unknown count it cannot be written. `RowSelection`
  is `Keys` or `AllExcept`, and membership is a `Set` built once per value.
- **A Shift range is worked out by the view** (`rowsBetween` over the
  projection it drew) and added in the same tick; the Model keeps keys, so a
  re-sort keeps the rows, not the positions.
- **One cell range, named by its corners.** `cells: Option<{ anchor, focus }>`;
  multi-range is §8's follow-up. A plain click or key clears it.
- **Single mode replaces,** as a radio group does; `RowsCleared` empties it.
- **Opt-in by option,** not `.with({...})`: `rowSelection` and
  `cellSelection` on `DataGrid.make`; without them the Messages are no-ops.
- **The pointer is one delegated listener** (`CellPress` on the body, per
  §24), because Foldkit's mouse builders carry no modifier keys. It reports
  the cell's DOM id and the update parses and checks it, so the mapping
  holds no state: a Mount reads its args once, and a mapping that closed
  over the projection would read the first render's rows forever.
- **So a Shift click over rows is not a row range.** The rows between the
  anchor and the click need the row order, which the update does not have;
  Shift+Space, from the root's key handler (bound fresh each render), does
  it. Carrying the order into the Model, or a range resolved at read time,
  is the open choice.
- **A key reads the last render's state,** as `GridNavigation`'s do: two keys
  inside one frame start from the same cell.

## Phase 4 as built so far (2026-10-03)

`ColumnState` in `src/columnState.ts`, held in the `DataGrid` Model. Where it
departs from §12:

- **Three regions and a hidden list, plus widths,** not `order`, `hidden`,
  `widths` as a record, `pinnedStart`, `pinnedEnd`. Every column stands in one
  region, so pinning is a move between regions and no two lists can
  disagree. Widths list only the columns resized, as entries, because a
  `Schema.Record` drops a key its key schema refuses without saying so
  (AGENTS.md); an entry's column is `Schema.Literals` of the grid's ids.
- **Two readers of a saved state.** The Model's Schema is strict, so a
  stored Model naming a removed column fails; `restore` is lenient and
  reports the ids it dropped, for a layout saved separately (local storage,
  a user preference row).
- **The view reads the state.** It takes `rows`, not a projection and a
  width function: the layout and widths are the grid's, and
  `Grid.project(rows, state)` is the one projection for them.
- **Resize handles** are `role="separator"` elements at each resizable
  column's end edge, dragged through the `Move` Mount. The drag is a session
  in the Model (`resizing: { column, from }`), so every move is measured
  from the width it began at, and a cancelled drag restores it. A focused
  handle steps with the arrows, mirrored for right-to-left. The handles are
  `tabindex="-1"`: with `0`, Tab walked into every handle and the grid was no
  longer one tab stop (the browser test caught it).
- **The keyboard reaches columns through the header row.** Focus has a
  `header` beside `current`: ArrowUp from the first row puts it on the
  column's header, as WAI-ARIA's grid counts headers as cells. There Shift
  with an arrow resizes and Ctrl or Meta with Shift and an arrow reorders
  within the region: keys a header has no other use for, where Alt with an
  arrow is browser history on Windows and Linux and Ctrl with Option is
  VoiceOver's. Header ids have two parts and cell ids three, so they never
  meet.
- **Drag reordering is its own Mount, not `PointerDrag`.** `PointerDrag`
  hit-tests drop targets; a header moves along one axis among neighbours of
  known widths, so the drop is arithmetic, `ColumnState.dropAt`: past the
  middle of each shown neighbour crossed, within the column's region. The
  Model holds the drag as `{ column, delta }`, and the drop is worked out on
  release from the columns as they are then, so a resize mid-drag counts;
  the view marks the neighbour it would land beside from the same function.
  `HeaderDrag` is one delegated listener on the header row that captures
  the pointer only past 4px, since capturing on press would send a sort
  button's click to the row; a press on a resize handle is the handle's,
  and Escape cancels. On touch, the browser's scroll takes the gesture.
- **The column menu is the grid's own.** The Model holds `menu: { column,
  active }`, and `menuItems` derives what it offers from the column state,
  each item only when its operation changes something. A choice is an index
  into the menu as it stands when chosen, run as the column Message it
  stands for through the grid's own update, so hiding from the menu does
  what `ColumnHidden` does (now also clearing that header's focus and its
  menu). The menu is drawn in the header cell, takes focus (the editor's
  `HoldFocus`, renamed) and uses `aria-activedescendant`, the grid's own
  model; `OnFocusLeave` on its header closes it, so no document listener or
  DismissLayer is needed. On the header, not the menu: a press on the
  menu's own button moves focus there first, and with the leave on the menu
  that closed it and the click, drawn a frame later, opened it again. Its ids have four parts, never a cell's three or a header's
  two.
- **Still to build:** a drag across regions to pin; the menu pins.

---

## Summary

Build a first-class, Foldkit-native data grid for `foldkit-plus`.

The goal is **not** to turn the existing CRUD table into an AG Grid clone, and not to copy TanStack Table's API. The goal is to build an interactive grid/spreadsheet surface out of concepts that already fit Foldkit:

- application-owned data
- explicit Model state
- Messages for transitions
- Bundles for opt-in stateful capabilities
- pure projections over rows/columns
- Slots as the public anatomy
- Behaviors for DOM interaction
- Mixins/Recipes for presentation
- Remote/CRUD integration without making the grid own fetching
- virtualization as an orthogonal concern

The central design principle should be:

> **The grid owns interaction state and geometry; the application owns the records and domain mutations.**

This should eventually support the UPC-manager class of application: fast local-first tables, 100k-ish rows, keyboard navigation, range selection, inline editing, copy/paste, fill, sorting/filtering, column configuration, and remote/local data sources without coupling the grid to one persistence model.

---

## Why this deserves its own package

There is currently no dedicated DataGrid package in `foldkit-plus`.

However, much of the required machinery already exists across the repo:

| Existing piece | Useful grid capability |
| --- | --- |
| `foldkit-crud` | typed columns from Entity Selections, Display metadata, Remote pages, query inputs, server sorting, loading/error/refresh |
| `foldkit-mixins-crud` | accessible native `<table>` rendering, sort headers, `aria-sort`, row keys, load-more |
| `Behaviors.Collection` | stable IDs / disabled-state / index metadata for repeated slots |
| `Selection` | keyed single/multiple selection + Shift ranges |
| `GridNavigation` | 2-D arrow/Home/End navigation |
| `EditableText` | delegated inline text editing, IME handling, commit/cancel |
| `Move` | pointer deltas, useful for column resize |
| `PointerDrag` | reorder/drop mechanics |
| `Targets` | delegated row/cell pointer targeting |
| upstream `@foldkit/ui/VirtualList` | viewport measurement, vertical windowing, overscan, fixed/variable height |

The missing piece is the **composition layer and logical grid model** that makes these parts work together coherently.

---

# 1. Preserve the distinction between Table and DataGrid

Do **not** grow `Crud.ListView` into the data grid.

Keep three concepts distinct:

```text
Table
  semantic tabular content

Crud.ListView
  application-facing sortable/readable table

DataGrid
  interactive grid / spreadsheet-like surface
```

`Crud.ListView` is already a good default for:

- loading records
- showing typed columns
- sorting
- opening a row
- pagination/load-more
- accessible native table markup

Its current limits are useful and explicit:

- no row selection
- no inline editing
- no spreadsheet-style navigation
- no range selection
- no column state
- no two-axis virtualization

Those should remain DataGrid concerns rather than making the simple list path increasingly stateful.

---

# 2. Proposed package boundaries

Initial target:

```text
foldkit-data-grid
    headless grid definitions, state, projections, operations

foldkit-mixins-data-grid
    Slots, Behaviors, accessible renderer, recipes

foldkit-crud
    remains independent
```

Then add a thin integration layer that adapts `Crud.list` / Entity selections into grid row/column sources.

Do **not** initially create a separate `foldkit-data-grid-crud` package unless the integration becomes substantial enough to justify it.

## Dependency direction

```text
foldkit-data-grid
  ├─ foldkit
  ├─ foldkit-bundle
  └─ foldkit-primitives where useful

foldkit-mixins-data-grid
  ├─ foldkit-data-grid
  └─ foldkit-mixins

foldkit-crud
  └─ remains unaware of data-grid
```

The data-grid package must work without CRUD or Remote.

---

# 3. State ownership

This should be treated as a hard architectural rule.

| Fact | Owner |
| --- | --- |
| actual records | application / Remote / local store |
| loading/cache/network state | Remote/data source |
| search/filter query | application Model |
| server sort | application Model/query input |
| current cell | DataGrid |
| row selection | DataGrid |
| cell/range selection | DataGrid |
| column widths | DataGrid |
| column order | DataGrid |
| hidden columns | DataGrid |
| pinned columns | DataGrid |
| active edit session | DataGrid |
| committed edited value | application/domain |
| scroll/measurement | virtualization state/runtime |
| domain undo/redo | application/history |
| temporary interaction history | optionally DataGrid |

The grid should not become a second state/cache/query framework.

---

# 4. Core data model

## 4.1 RowModel

Do not overload `Behaviors.Collection` into the data engine.

`Behaviors.Collection` is good at describing repeated interactive items:

```text
stable id
index
disabled state
```

The grid needs a separate logical row abstraction.

Start with something close to:

```ts
export interface RowModel<Row> {
  readonly count: RowCount // Known { count } | Unknown

  rowAt(index: number): Option.Option<Row>
  keyAt(index: number): Option.Option<string>

  indexOf?(key: string): Option.Option<number>
}
```

The important property is that this describes **logical row space**, not DOM nodes.

It should be possible to adapt:

- `ReadonlyArray<Row>`
- local-first stores
- Remote pages
- cursor/infinite queries
- viewport-fed data
- live collections
- CMS/entity sources

without the grid knowing how the source fetches or stores records.

### Possible later capability interfaces

Only add these if actual use cases require them:

```text
SortableRows
FilterableRows
GroupedRows
MutableRows
LoadableRows
```

Do not front-load a giant data-source protocol.

---

# 5. Columns as first-class typed objects

Columns should be one of the strongest parts of the public API.

Sketch:

```ts
const Columns = DataGrid.columns<Product>()({
  sku: Column.make({
    header: "SKU",
    value: product => product.sku,
    width: 140,
  }),

  name: Column.make({
    header: "Name",
    value: product => product.name,
    editable: Editor.text({
      message: (product, value) =>
        ProductRenamed({ id: product.id, name: value }),
    }),
  }),

  price: Column.make({
    header: "Price",
    value: product => product.price,
    display: Display.currency("USD"),
    sortable: true,
    editable: Editor.number(...),
  }),
})
```

A column must have a stable ID independent of visible order.

Everything should reference that stable column ID:

- order
- visibility
- sizing
- pinning
- current cell
- cell selection
- clipboard coordinates
- editing
- saved views

Never make array position the identity.

## Column responsibilities

A column may describe:

```text
id
header
value projection
display/formatter
width / min / max
resizable
sortable
filterable
editable/editor
alignment
metadata
```

But it should **not** own application sorting/filtering state.

---

# 6. GridProjection: logical 2-D geometry

Introduce a pure projection that combines:

```text
RowModel
+
Columns
+
column visibility/order/pinning
+
row ordering as supplied by the application
```

into the logical grid currently presented to the user.

Conceptually:

```ts
type CellAddress = {
  readonly row: RowKey
  readonly column: ColumnKey
}
```

The projection should answer pure questions such as:

```text
rowCount
visibleColumns
scrollableColumns
pinnedStartColumns
pinnedEndColumns

cellAt(rowIndex, columnIndex)
rowIndex(rowKey)
columnIndex(columnKey)

nextCell(address, direction)
firstCellInRow(...)
lastCellInRow(...)
firstCell(...)
lastCell(...)
range(anchor, focus)
```

This becomes the authoritative geometry for focus, selection, virtualization metadata, clipboard ranges, etc.

The DOM should be a projection of this geometry, not the source of truth for it.

---

# 7. GridFocus instead of overloading GridNavigation

Keep the existing `GridNavigation` primitive.

It is appropriate for fixed matrix-like controls:

- calendars
- color swatches
- emoji pickers
- small regular grids

Its current model is intentionally simple:

```text
current item id
+ fixed number of columns
```

That is too weak for a data grid with:

- hidden columns
- reordered columns
- pinned columns
- partially loaded rows
- horizontally virtualized columns
- future grouped/tree rows

Create a data-grid-specific `GridFocus`.

Example model:

```ts
Model = {
  current: Option<CellAddress>
}
```

Messages might include:

```text
Focused
Moved
RequestedFocus
```

Movement should use `GridProjection`, not flattened DOM position.

Important behaviors:

- Arrow keys move one logical cell
- Home/End move within row
- Ctrl/Cmd+Home/End move to logical start/end where platform conventions permit
- PageUp/PageDown move by viewport-sized row windows
- focus survives row/column reorder because identity is keyed
- hidden columns are skipped
- pinned columns participate in logical order
- movement can request virtualization to reveal the target cell

---

# 8. Row selection and cell selection are separate concepts

## 8.1 RowSelection

Reuse/adapt existing `Selection`.

It already supports:

- single
- multiple
- stable keyed selection
- anchor
- Shift ranges

This maps naturally to selecting rows.

## 8.2 CellSelection

Add a dedicated grid-coordinate selection primitive.

Initial model:

```ts
type CellRange = {
  readonly anchor: CellAddress
  readonly focus: CellAddress
}

Model = {
  anchor: Option<CellAddress>
  focus: Option<CellAddress>
  ranges: ReadonlyArray<CellRange>
}
```

V1 can support one range; multi-range can be added behind the same model shape.

Interactions:

```text
click               select one cell
Shift+click         rectangular range
Shift+Arrow         grow/shrink range
Ctrl/Cmd+click      additional range (later)
Ctrl/Cmd+A          all cells
Shift+Space         row
Ctrl/Cmd+Space      column
```

The range should remain keyed by row/column identity and be projected to visible coordinates as needed.

Do not force row selection and cell range selection into one abstraction.

---

# 9. VirtualGrid: two-axis virtualization

Upstream Foldkit's `VirtualList` is a good foundation, but it is one-dimensional.

A real data grid needs:

```text
row virtualizer
      ×
column virtualizer
```

Introduce a virtualization abstraction that is independent from data transformation.

Possible API:

```ts
VirtualGrid.window({
  rows,
  columns,
  viewport,
  overscan,
})
```

returning:

```ts
{
  rows: {
    start,
    end,
    before,
    after,
  },

  columns: {
    start,
    end,
    before,
    after,
  },
}
```

## V1 performance constraints

Optimize the first implementation for:

- fixed row height
- known/controlled column widths
- 100k-ish rows
- horizontal column virtualization
- pinned columns outside the horizontal virtual window
- small overscan
- coalesced scroll/resize processing

Do **not** make variable row heights a v1 blocker.

## Later variable-size implementation

If needed, hide it behind the same axis abstraction:

```text
VirtualAxis.Variable
  cached measurements
  prefix-sum tree / Fenwick tree
  binary index lookup
```

Avoid recomputing an O(N) prefix sum on every hot scroll path at large scales.

---

# 10. Accessibility

This must be designed in, not patched in later.

The interactive renderer should follow the WAI-ARIA grid pattern.

The key architectural advantage is that logical geometry is independent from the rendered virtual window.

Example:

```text
logical row = 50,002
rendered row = 8

logical column = 17
rendered column = 4
```

The renderer can therefore emit correct virtualized-grid metadata:

```text
role="grid"
role="row"
role="columnheader"
role="gridcell"

aria-rowcount
aria-colcount
aria-rowindex
aria-colindex
aria-selected
aria-sort
aria-activedescendant where appropriate
```

Foldkit's HTML layer already exposes the necessary row/column ARIA attributes.

When the total row count is genuinely unknown, support the appropriate unknown-count semantics rather than fabricating a count.

## Keyboard model

Navigation mode:

```text
Arrow keys        move grid focus
Home / End        row boundaries
Ctrl+Home/End     grid boundaries
PageUp/PageDown   viewport movement
Enter / F2        enter editor
typing            optionally begin text editing
```

Editing mode:

```text
Enter             commit
Tab / Shift+Tab   commit and move
Escape            cancel
Arrow keys        belong to the editor where appropriate
```

The grid should have one tab stop / active-descendant model rather than putting thousands of cells into the page Tab order.

---

# 11. Editing

`EditableText` should be reusable, but editing needs a higher-level grid protocol.

Introduce an editing Bundle.

Sketch:

```ts
Editing.Model = {
  cell: Option<CellAddress>,
  mode: "viewing" | "editing",
}
```

Then define an editor contract:

```ts
interface Editor<Value, Row, Message> {
  readonly view: ...
  readonly begin?: ...
  readonly parse?: ...
  readonly commit: (context, value) => Message
  readonly cancel?: ...
}
```

Built-ins can include:

```text
Editor.text
Editor.number
Editor.checkbox
Editor.select
Editor.date
Editor.custom
```

Important rule:

> The grid owns the edit session, not the committed domain value.

Commit produces the application's Message / operation. The application/domain remains authoritative for the record.

This makes editing compatible with:

- local writes
- optimistic Remote mutations
- validation
- domain-level invariants
- history/undo
- collaborative updates

---

# 12. Column state

Add a dedicated column-state Bundle rather than scattering fields through the grid.

Possible state:

```ts
ColumnState.Model = {
  order: ReadonlyArray<ColumnKey>,
  hidden: ReadonlyArray<ColumnKey>,
  widths: Readonly<Record<ColumnKey, number>>,
  pinnedStart: ReadonlyArray<ColumnKey>,
  pinnedEnd: ReadonlyArray<ColumnKey>,
}
```

Capabilities:

### Sizing

Reuse `Move` for resize handles.

Requirements:

- min/max widths
- pointer resize
- keyboard-accessible resize
- double-click autosize later
- persisted controlled width state

### Ordering

Reuse `PointerDrag` where possible.

Requirements:

- stable column IDs
- drag reorder
- keyboard reorder equivalent
- pinned boundary rules

### Visibility

- show/hide columns
- required/non-hideable columns
- visibility reflected in projection

### Pinning

- start/end pinned regions
- pinned columns do not participate in horizontal virtual scrolling
- pinning preserves logical focus identity

---

# 13. Slots and Behaviors

The default interactive view should publish rich anatomy.

Suggested initial Slots:

```text
root
viewport

header
headerRow
headerCell
headerLabel
sortIndicator
resizeHandle

body
row
rowSelector
cell
cellContent
cellEditor

selectionOverlay
fillHandle

empty
loading
error

footer
```

Behaviors then attach independently:

```text
GridFocus       -> viewport + cell
RowSelection    -> row
CellSelection   -> viewport + cell + selectionOverlay
ColumnSizing    -> resizeHandle
ColumnReorder   -> header/headerCell
Editing         -> cell/cellEditor
Clipboard       -> viewport
```

This is exactly the sort of component where the Slots/Behavior resolver is more valuable than a monolithic prop API.

The resolver should catch incompatible ownership of:

- key events
- click/pointer events
- structural ARIA attributes
- sizing styles
- protected grid roles

rather than silently letting feature order decide.

---

# 14. Clipboard

Add clipboard as an operation layer over selected grid coordinates.

Core operations:

```ts
Clipboard.copy(selection, projection)
Clipboard.cut(selection, projection)
Clipboard.paste(target, text)
```

V1 format:

- TSV/plain text compatible with Excel/Google Sheets
- rectangular matrix parsing
- preserve empty cells
- normalize line endings

Paste should produce **domain edit operations/messages**, not mutate a hidden grid-owned row store.

For example:

```text
paste 5 × 8 matrix
    ↓
40 typed cell edits
    ↓
one application transaction/message
```

Later:

- HTML clipboard representation
- typed coercion
- paste validation errors
- partial acceptance policy

---

# 15. Fill / drag-fill

Treat fill as another pure operation over ranges.

```ts
Fill.apply(sourceRange, targetRange, projection)
```

Start with:

- copy pattern
- numeric sequences
- dates if column type supports them

Later:

- repeating patterns
- formula/reference adjustment
- custom per-column fill strategy

Again, output changes rather than mutating grid-owned data.

---

# 16. Undo/redo

Do not create a disconnected spreadsheet history if the changes are domain mutations.

Example:

```text
Paste changed 40 UPC records
```

should ideally be one application/history transaction.

The grid should expose enough operation metadata for a history layer to treat:

- paste
- fill
- bulk delete
- multi-cell edit
- column-state changes

as coherent transactions.

Grid-only ephemeral changes such as focus do not need domain history.

---

# 17. Sorting and filtering

Keep current `foldkit-crud` philosophy:

> Sorting/filtering state belongs to the application/query input.

A grid column can declare:

```ts
sortable: true
filter: Filter.text()
```

but interaction should produce application Messages/state transitions.

This allows:

```text
local array
  -> local projection sort/filter

Remote query
  -> server sort/filter input

local-first DB
  -> indexed local query
```

without a second hidden sort/filter state inside the grid.

The existing `Crud.Sort` should be reused/adapted where it fits rather than duplicated.

---

# 18. CRUD / Entity / Remote integration

A `Crud.list` should be adaptable into a grid without changing CRUD's ownership model.

Potential shape:

```ts
const Products = Crud.list("Products", {
  query: ProductsQuery,
  selection: Entity.select(Product, {
    id: true,
    sku: true,
    name: true,
    price: true,
  }),
})

const ProductGrid = DataGrid.fromCrud(Products, {
  rowKey: row => row.id,
})
```

The integration can derive:

- default column IDs
- labels
- `Display`
- hidden fields
- default renderers
- server sort options

Remote remains responsible for:

- current pages
- loading state
- stale/refresh state
- retry
- mutation settlement

The grid remains responsible for:

- focus
- selection
- column state
- edit mode
- viewport

## Cursor/infinite mode

Do not force Remote data into numbered pagination.

Support:

```text
known count
unknown count
loaded window
append/load-more
viewport-triggered requirements later
```

---

# 19. Public composition API

Do not invent a second plugin framework.

TanStack's explicit feature model is useful prior art, but Foldkit already has Bundles.

The grid should compose ordinary Foldkit capabilities.

Underlying representation should be equivalent to:

```ts
Bundle.compose({
  focus: GridFocus.bundle,
  rows: RowSelection.bundle,
  cells: CellSelection.bundle,
  columns: ColumnState.bundle,
  editing: Editing.bundle,
})
```

A convenience API can make that pleasant:

```ts
const ProductsGrid = DataGrid.make("products", {
  Row: Product,
  rowKey: row => row.id,
  columns: ProductColumns,
}).with({
  focus: DataGrid.focus(),

  rowSelection: DataGrid.rowSelection({
    mode: "multiple",
  }),

  cellSelection: DataGrid.cellSelection({
    mode: "range",
  }),

  columns: DataGrid.columnState({
    sizing: true,
    ordering: true,
    visibility: true,
    pinning: true,
  }),

  editing: DataGrid.editing(),
})
```

But this should remain understandable as ordinary:

```text
Model fields
Message cases
Bundle placements
Behaviors
pure projections
```

No opaque runtime plugin registry.

---

# 20. Suggested internal architecture

```text
                         APPLICATION
                             │
          query / mutations / Remote / local data
                             │
                             ▼
                         RowModel
                logical ordered row space
                             │
         ┌───────────────────┴──────────────────┐
         │                                      │
      Columns                              GridProjection
 stable typed IDs                   rows × visible columns
 value/display/editor               after hide/order/pin
         │                                      │
         └───────────────────┬──────────────────┘
                             │
                        DataGrid Core
                             │
        ┌────────────┬───────┼────────┬──────────────┐
        │            │       │        │              │
     GridFocus   Selection  Editing  ColumnState   Operations
                  row/cell             size/order   copy/paste
                                      hide/pin      fill/etc.
        │            │       │        │              │
        └────────────┴───────┼────────┴──────────────┘
                             │
                        VirtualGrid
                     rows × columns window
                             │
                             ▼
                      DataGrid Slots
                             │
               Behaviors / Styles / Recipes
                             │
                             ▼
                  Accessible DOM Grid
```

---

# 21. Implementation phases

## Phase 0 — design spikes / pure model

Implement and test the geometry before building the DOM layer.

Deliver:

- [ ] `Column`
- [ ] `RowModel`
- [ ] `RowKey` / `ColumnKey`
- [ ] `CellAddress`
- [ ] `CellRange`
- [ ] `GridProjection`
- [ ] static array row adapter
- [ ] pure tests for hide/order/pin/reorder geometry

Acceptance:

- focus/range logic never needs to query the DOM for logical coordinates
- stable row/column keys survive reorder
- hidden columns disappear without invalidating unrelated cells

---

## Phase 1 — GridFocus

Deliver:

- [ ] `GridFocus.bundle`
- [ ] pure movement rules
- [ ] Behavior for viewport/cell
- [ ] LTR/RTL handling
- [ ] Home/End
- [ ] Ctrl/Cmd+Home/End where appropriate
- [ ] PageUp/PageDown hook
- [ ] ensure-visible request when target is virtualized

Acceptance:

- a grid with reordered/hidden columns navigates correctly
- focus remains attached to row/column IDs through reorder
- one grid tab stop / active-descendant model

---

## Phase 2 — VirtualGrid

Deliver:

- [ ] fixed-height row axis
- [ ] fixed/controlled-width column axis
- [ ] two-axis visible window
- [ ] overscan
- [ ] viewport measurement
- [ ] scroll state
- [ ] programmatic ensure-visible
- [ ] pinned-column exclusion from horizontal virtual window

Performance target:

- smooth interaction with ~100k logical rows and ordinary business-table column counts
- DOM size proportional to viewport + overscan, not dataset size

Add benchmarks for:

- visible-window calculation
- projection lookup
- 100k-row scroll updates
- column hide/order operations

---

## Phase 3 — accessible DataGridView

Deliver `foldkit-mixins-data-grid`.

- [ ] Slots
- [ ] headless/default renderer
- [ ] grid/row/gridcell semantics
- [ ] virtualized `aria-rowindex` / `aria-colindex`
- [ ] total/unknown row count handling
- [ ] `aria-sort`
- [ ] loading/empty/error states
- [ ] default Recipe

Acceptance:

- keyboard-only traversal works
- screen-reader semantics survive virtualization
- inaccessible interactive descendants are not accidentally placed into the grid's navigation model

---

## Phase 4 — column state

- [ ] `ColumnState.bundle`
- [ ] widths
- [ ] resize handles using `Move`
- [ ] visibility
- [ ] ordering using `PointerDrag`
- [ ] keyboard reorder equivalent
- [ ] start/end pinning
- [ ] min/max width constraints
- [ ] serialization/persistence-friendly schema

---

## Phase 5 — selection

### Row selection

- [ ] adapt existing `Selection`
- [ ] single/multiple
- [ ] Shift range
- [ ] select-all over current logical result policy

### Cell selection

- [ ] `CellSelection.bundle`
- [ ] one cell
- [ ] rectangular range
- [ ] Shift+Arrow
- [ ] Shift+click
- [ ] row/column selection shortcuts
- [ ] selection overlay
- [ ] multi-range as follow-up

---

## Phase 6 — editing

- [ ] `Editing.bundle`
- [ ] viewing/editing mode
- [ ] Enter/F2
- [ ] Escape cancel
- [ ] Enter/Tab commit-and-move
- [ ] `Editor.text`
- [ ] `Editor.number`
- [ ] checkbox editor
- [ ] generic custom editor
- [ ] validation/error hooks
- [ ] reuse `EditableText` where appropriate

Acceptance:

- committed values leave the grid as application Messages
- grid does not keep a second authoritative copy of edited records

---

## Phase 7 — CRUD / Remote adapter

- [ ] derive columns from Entity Selection
- [ ] carry labels + `Display`
- [ ] hidden Display support
- [ ] Remote page/connection RowModel adapter
- [ ] server sort integration via existing query state
- [ ] retry/loading/refresh mapping
- [ ] load-more/infinite mode
- [ ] unknown total count path

Use this phase to build a real reference application rather than only unit fixtures.

---

## Phase 8 — spreadsheet operations

- [ ] clipboard copy as TSV
- [ ] paste rectangular matrices
- [ ] cut
- [ ] bulk typed edits
- [ ] fill handle
- [ ] simple sequence inference
- [ ] operation grouping for undo/history
- [ ] bulk delete hooks

Later:

- [ ] HTML clipboard
- [ ] formulas
- [ ] custom fill strategies
- [ ] multi-range clipboard

---

# 22. Reference application

Build a realistic example that exercises the architecture.

The UPC registry use case is ideal:

```text
100k-ish products
SKU / UPC / description / business line / status / dates
custom columns
fast search/filter
pinned identifier columns
inline editing
multi-row selection
copy/paste from Excel
bulk edits
saved column layout
local-first writes
Remote/server reconciliation
```

This is a much stronger proving ground than a toy 20-row table.

---

# 23. Testing strategy

## Pure-model tests

Heavy table-driven tests for:

- projection
- keyed cell coordinates
- hidden/reordered/pinned columns
- movement
- range selection
- selection persistence through reorder
- clipping ranges when rows disappear
- unknown row counts

## Behavior tests

- keyboard ownership
- focus movement
- pointer selection
- resizing
- editing mode transitions
- clipboard events

## Accessibility tests

Verify emitted:

- roles
- row/column counts
- logical row/column indexes
- selected state
- sort state
- active-descendant/tabstop behavior

## Virtualization tests

- scroll into unloaded/unrendered regions
- ensure-visible
- pinned columns
- viewport resize
- overscan boundaries

## Mutation/integration tests

- edit -> application Message -> source changes -> grid projection updates
- paste grouped as one transaction
- optimistic Remote mutation
- failed mutation leaves application policy in control

---

# 24. Performance principles

Avoid premature canvas rendering.

A DOM grid with correct two-axis virtualization should be the default because it preserves:

- native semantics
- inspectability
- Slots/Mixins
- ordinary controls/editors
- accessibility

Only consider a canvas renderer later behind the same core/projection contracts if profiling proves it necessary.

Important performance rules:

- stable row/column keys
- viewport-bounded DOM
- memoized/pure projections where useful
- no O(N) row walk on every scroll frame at 100k scale
- delegated interaction handlers where possible
- avoid one subscription/mount per logical cell
- column measurements cached by ID
- grid operations work on ranges/operations rather than cloning entire datasets

---

# 25. Explicit non-goals for v1

Do not block the first useful grid on:

- pivot tables
- aggregation engine
- formulas
- Excel parity
- tree data
- grouped columns
- merged cells
- canvas rendering
- arbitrary variable-height rows
- enterprise charting
- full multi-range behavior
- every AG Grid feature

The v1 target is a **fast, accessible, editable business data grid**.

---

# 26. Design principles / invariants

1. **Rows are not owned by the grid.**
2. **Committed domain values are not owned by the grid.**
3. **Row and column identity are stable keys, never positions.**
4. **Logical geometry exists independently from rendered DOM geometry.**
5. **Virtualization does not change semantic coordinates.**
6. **Sorting/filtering remain application/query state.**
7. **Grid capabilities compose as ordinary Foldkit Bundles/Behaviors.**
8. **No new plugin runtime when Bundle composition already solves the problem.**
9. **The simple CRUD table remains simple.**
10. **Accessible keyboard behavior is part of the core model.**
11. **Pointer-only interactions must have keyboard equivalents where required.**
12. **Bulk spreadsheet actions produce application operations/messages rather than mutating hidden internal data.**
13. **The default renderer should remain DOM-based and headless/stylable through Slots/Mixins.**

---

# 27. Desired end-state API

The precise spelling can evolve, but using the grid should eventually feel approximately like:

```ts
const ProductColumns = DataGrid.columns<Product>()({
  upc: Column.make({
    header: "UPC",
    value: row => row.upc,
    width: 150,
    pinned: "start",
  }),

  description: Column.make({
    header: "Description",
    value: row => row.description,
    editable: Editor.text({
      message: (row, value) =>
        ProductDescriptionChanged({ id: row.id, value }),
    }),
  }),

  status: Column.make({
    header: "Status",
    value: row => row.status,
    display: StatusDisplay,
  }),
})

const Grid = DataGrid.make("products", {
  rowKey: row => row.id,
  columns: ProductColumns,
}).with({
  focus: DataGrid.focus(),
  rowSelection: DataGrid.rowSelection({ mode: "multiple" }),
  cellSelection: DataGrid.cellSelection({ mode: "range" }),
  columnState: DataGrid.columnState({
    sizing: true,
    ordering: true,
    visibility: true,
    pinning: true,
  }),
  editing: DataGrid.editing(),
  clipboard: DataGrid.clipboard(),
})

const ProductGrid = Grid.at({
  rows: ProductsRows,
})
```

and its state remains ordinary inspectable Foldkit state:

```text
model.productsGrid.focus
model.productsGrid.rowSelection
model.productsGrid.cellSelection
model.productsGrid.columns
model.productsGrid.editing
```

That is the differentiator.

---

# 28. Definition of done for the first production-capable release

A first production-capable version should be able to:

- [ ] render local or Remote-backed typed rows
- [ ] handle ~100k logical rows with viewport-bounded DOM
- [ ] virtualize rows and columns
- [ ] pin columns
- [ ] hide/reorder/resize columns
- [ ] sort through application/query state
- [ ] navigate entirely by keyboard
- [ ] expose correct virtualized grid ARIA metadata
- [ ] select rows
- [ ] select a rectangular cell range
- [ ] edit text/number/select-like cells
- [ ] copy/paste rectangular ranges to/from spreadsheet apps
- [ ] surface bulk edits as application operations
- [ ] preserve grid state via ordinary Foldkit Model serialization
- [ ] work with Slots, Behaviors, Styles and Recipes
- [ ] demonstrate the design in a realistic large-data example

---

## Bottom line

The useful abstraction is not:

```text
one giant DataTable component
```

and not merely:

```text
Collection + Selection + Sorting + Pagination + VirtualList
```

The better shape is:

```text
RowModel
+ typed Columns
+ GridProjection
+ opt-in Foldkit state Bundles
+ two-axis virtualization
+ Slot/Behavior composition
+ application-owned data and mutations
```

That gives Foldkit-plus a grid that is both genuinely capable and genuinely native to the architecture of the rest of the project.
