# Changelog

All notable changes to this project are recorded here. The project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) per package and is
released from a version tag (`vX.Y.Z`). A release only republishes packages whose
version changed; `pnpm` skips versions already in the registry.

## Unreleased

### Added

- **`foldkit-sync/journal`: `editsJournal`, the table as the journal's read
  model.** Its `settle` applies each committed change through the
  application's `apply` as a recovery intent and its `absorb` records what
  the table holds and compacts behind it. Recovery starts at the journal's
  floor, so a server restarted over a compacted journal no longer fails
  every exchange asking for history that is gone; intents are keyed by the
  journal's epoch, so an operation sent again after a reset is applied
  again. The registry's journal is built on it (#166).
- **`foldkit-sync/entity`: edits to rows a server owns.** `EditableEntity.make(
  entity, { members })` keeps edits one per cell, each value typed by its
  member, committed `at` a sequence `by` an author (`{ actor, replica }`),
  and lays them over Remote's rows by each row's `revision`. Pure functions
  merge and absorb them, hold an absorbed edit while its cached row is
  behind it and settle it when a read reaches it, report a cell another
  tab's later commit replaced, and name a refusal's cells. `examples/registry`
  is built on it: a change is one cell and the server writes the one column
  it names. Another editable column is an entry in `members`, its grid
  column, its arm in `changeOf` and its table column; none of the edit rules
  is written per field any more (#166).
- **`foldkit-sync`: a reinstall says when the server was reset.**
  `ReplicaStatus.epoch` is the server history the cursor points into, and
  `Sync.mount`'s `onReinstall(next, previous, { reset })` is told when it
  changed. `examples/registry` reads its rows again on a reset: their
  revisions counted the old history, so an edit committed since at a low
  sequence looked as if the rows already held it (#166).
- **`foldkit-mixins-data-grid`: a choice is a list the grid draws.** A
  column of literals edits as a `role="combobox"` beside its `role="listbox"`
  (new `choiceList` Slot), styled with the page, opening below the cell or
  above it near the bottom of the view; arrows, Home, End and the page keys
  walk it (`EditStepped` in `foldkit-data-grid`), a letter finds an option
  (`EditTyped` on a choice), and a press chooses one (`EditChosen`) without
  the blur committing the old draft first. `choiceEditor: 'native'` keeps
  the platform's `select` (#168).
- **`foldkit-mixins-data-grid`: shared cell marks and their legend.**
  `GridMarks` names five marks (`pending`, `saved`, `refused`, `replaced`,
  `peer`); `GridMarkStyle`, attached after `GridStyle`, draws each on the
  theme's tokens with a shape of its own and an outline under forced
  colours; `GridLegend` draws what they mean beside swatches
  `GridLegendStyle` paints with the cells' rules. `examples/registry` uses
  them in place of its hex colours and hand-drawn legend (#168).
- **`foldkit-mixins/theme`: shadow tokens.** `Theme.tokens.shadow` is a
  scale (`xs`, `sm`, `md`, `lg`, `xl`, `inset`) drawn in one color,
  `--fk-shadow-color`, falling back to a faint black; `Theme.oklch` sets it,
  a near-black of the neutral hue that is denser in a dark scheme, where a
  shadow mixed from the text glowed. `GridStyle`'s editing lift and error
  bubble and the dialog and segmented recipes use the scale (#168).
- **`foldkit-data-grid`: an unchanged edit reports nothing.** The edit keeps
  the text it began from (`editing.from`); a commit of that text, or of text
  that decodes to the same value (`Equal.equals`), closes the edit and moves
  focus with no `Out.Edited`. Leaving an editor as it opened, after another
  device changed the cell beneath it, no longer sends the old value over the
  new one (#174). `EditTyped` carries `from`, the text the cell showed.
  A paste does the same per cell: `Clipboard.pasteAt` takes `{ editable,
  from }` (was a positional `editable`), each `Pasted` cell carries `from`,
  unchanged cells are dropped, and a paste or cut that changes nothing
  reports nothing. `examples/registry` drops its own `holds` check.
- **`foldkit-mixins-data-grid`: clicking away saves, and a refused draft
  says why.** Focus leaving the editor commits it, as Enter does without
  moving; a draft the column refuses stays open, its field in the error
  colour, with the column's message shown below it in a new `editorError`
  Slot (`role="alert"`, named by the field's `aria-describedby`, which
  replaces its `aria-description`). `GridStyle` draws the sort direction as
  a small chevron whose place is kept while unsorted, so sorting no longer
  wraps a narrow header or moves its label, keeps header labels on one
  line, and parts columns with a faint line that is, on a header, the
  resize handle. The registry's page is in neutral greys.
- **A mark says what it means, and an unchanged edit is none.** A cell's
  mark is also its `title`, shown on hover (the description a screen
  reader hears was there already). The registry draws a legend of its marks
  above the grid, presence in violet so it is not taken for a replacement,
  and a cell committed with the value it already shows (the same text, or
  `01.73` for 1.73) makes no edit: nothing is sent and nothing marked.
- **`foldkit-mixins-data-grid`: a column that does not edit says so.** In a
  grid where some columns edit, the others' headers and cells carry
  `aria-readonly`, and `GridStyle` draws a padlock before the header's
  label (with a Read-only title) and the cells' text muted, with the
  ordinary pointer. A grid where nothing edits marks nothing.
- **`foldkit-mixins-data-grid`: a choice opens its list.** The `select` a
  column of literals edits in opens its list as it opens (`showPicker`,
  where the browser allows), so a double-click shows the choices without
  another click. The registry's status column is wide enough for its
  longest.
- **`foldkit-mixins-data-grid`: an edit looks like one, and a pin shows.**
  A double-click opens an editable cell's editor, as Enter does. The cell
  being edited carries `data-editing`, and `GridStyle` lifts it with a
  shadow and gives the field the whole cell, outlined and with a caret in
  the focus colour, where before it was the browser's bare input inside the
  cell's padding; an editable cell carries `data-editable` and shows a text
  cursor. The pinned column next to the scrolling ones carries
  `data-pinned-edge`, drawn as a divider, so a pinned column is seen to be.
  The registry sorts every column the server can order, UPC, line and
  status too, and edits the line and the status as well (a choice of the
  Product's statuses), so a double-click on any column but the UPC edits.
- **`foldkit-durable/core`: the journal without Node.** `Journal.layer(options)`
  and `Journal.define(key).layer(options)` give the journal as a layer that
  needs a `SqlClient`, any `effect/sql` SQLite client, such as
  `@effect/sql-sqlite-wasm` in a browser, where a browser test runs append,
  retry, refusal, recovery, compaction and reset over it. Provide the driver
  to the layer, and the database opens and closes with the journal; a
  journal handed out as a value could keep a connection already closed
  (#169). Payloads are hashed with `@noble/hashes` instead of
  `node:crypto`, to the same digest, and epochs come from
  `globalThis.crypto.randomUUID`. The main entry's `Journal.make` over a
  `node:sqlite` file is unchanged (#162).
- **`examples/registry` says where each edit is.** A cell's mark shows an
  edit not yet sent, one the journal has and the table does not yet, and one
  the server refused, edged until its line (naming the cells and the
  server's reason) is dismissed. A *Work offline* switch pauses the
  transport, and switching back exchanges at once (#161).
- **`examples/registry` says when another device's edit won.** The journal
  stamps who committed each edit (`by`); a field this device last wrote that
  another device's later commit replaced is edged amber, with a line naming
  the device and the value it had, until dismissed. A connection names its
  device (`?device=` on the socket). The registry's server and journal no
  longer import Node (an SQLite seam, and `foldkit-durable/core`), so a
  sandbox can run them in the page (#162).
- **`examples/registry` runs in the browser: two devices, one page.**
  `build:sandbox` builds Device A and Device B side by side, each a page in a
  frame with its own replica, against one server in a SharedWorker: the
  products table on sql.js and the journal on SQLite compiled to WebAssembly,
  over `MessagePort`s. An e2e test builds it, serves the files, and drives a
  shared edit, a conflict the losing device is told of, and an offline edit
  that survives a reload (#162).
- **`examples/registry`: presence, and each device's status on its card.**
  A device announces the cell it has focused over Sync's presence, on the
  same socket the journal is served on, and the other draws it outlined in
  violet; a device working offline leaves. In the sandbox, each card's dot
  and badge say where that device's edits stand, from a status its frame
  posts to the page.
- **`foldkit-sync`: why an edit was refused.** An exchange may carry
  `reasons: [{ opId, reason }]` beside `rejected` (each at most 500
  characters; a reason for an operation not rejected fails the exchange),
  and `journalExchange` gives each rejection one: an `authorize` rule's own,
  now that a rule may return `{ allowed: false, reason }` as Durable's does,
  or a fixed sentence ("Not a valid operation", "This connection may not
  make changes"), never an error's message. **Breaking:**
  `ReplicaStatus.rejected` is `ReadonlyArray<Rejection>`, `{ opId, reason:
  Option<string>, operation }`, in place of the ids: the refused operation
  comes with its refusal, so what it changed is read from it rather than
  looked up while it was pending, which a page that heard late could miss. The todo-app's rules give their
  reasons (#161).

- **`foldkit-mixins-data-grid`: cell marks.** `marks: address =>
  Option.some({ name, description })` gives a cell a state of the
  application's: `data-mark` on its Slot, which the default style shows as a
  dot in the corner and an application styles by name, and the description
  as its `aria-description`. Asked only for the cells drawn (#161).

- **`foldkit-durable`: a commit stamp.** `JournalOptions.stamp(operation,
  { sequence, actorId })` writes what the commit decided into the operation,
  after `validate` and `authorize` and before `reduce`. The stamped operation
  is what is stored, read, loaded and recovered; a retry is still recognized
  by what was sent, since a retransmission is now compared by the hash of
  the operation as sent rather than by the stored text. A stamp that changes
  the `opId` is refused. For a read model that must know which commits it
  holds (#159).
- **`foldkit-sync`: commit stamps on the contract.** `make({ stamp: {
  Variant: (message, { sequence, actorId, replicaId }) => … } })` writes what the
  server's commit decided into a durable Message, per variant, and returns
  that variant (another is rejected by id; a non-durable key is a type
  error). It rides in `journalContract()` as Durable's `stamp`, so replicas
  replay the stamped Message in place of what they sent. `defineSync` takes
  the same as `stamp(message, commit)`. New types `CommitStamp` and
  `StampPolicy`. A replica exposes its `replicaId`, the one its commits
  are stamped with.

- **`foldkit-data-grid`, the grid's pure model (private, `0.0.0`).** Phase 0
  of [the DataGrid design](docs/design/data-grid-DESIGN.md): typed `Columns`
  by stable id, a `RowModel` with a `Known` or `Unknown` `RowCount`, a
  saveable `ColumnLayout` of start, center and end regions with hidden
  columns, and a `GridProjection` that answers moves, edges and rectangular
  ranges in display order, each as an `Option`. A cell is named by row key
  and column id, so it survives a re-sort or a reorder.
- **`foldkit-data-grid`, focus (Phase 1).** `GridFocus.make(columns)` is a
  Bundle holding the focused cell as an `Option`, stored as `null`, and
  decoded only against the grid's own column ids. `GridFocus.target` is the
  cell a key moves to (arrows, Home and End, Ctrl for the corners, PageUp and
  PageDown, RTL), `tabStop` the cell holding the one tab stop, and `cellId` a
  DOM id for `aria-activedescendant` that no two cells share.
- **`foldkit-data-grid`, virtualization (Phase 2).** `VirtualGrid.window` is
  the rows and center columns a viewport shows, with overscan and spacers;
  rows are one height, so it never walks them, and pinned columns are always
  drawn. `VirtualGrid.reveal` is the least scroll that shows a cell.
  `GridViewport` keeps the container's offsets and size in the Model, its
  `Measure` Mount reports them on mount, scroll and resize, and `scrollTo` is
  the Command that applies a reveal. A benchmark at 100,000 rows is in
  `docs/benchmarks.md`.
- **`foldkit-data-grid`, `DataGrid.make({ id, columns })`.** Focus and the
  viewport as the one Bundle a grid places. A key's `Moved` carries the
  reveal the view worked out, and the update issues the scroll for the
  container named `id`.
- **`foldkit-mixins-data-grid` (private, `0.0.0`), the grid drawn (Phase 3).**
  `DataGridView<Message>().define(Grid)` draws a `DataGrid` as a WAI-ARIA
  grid of the viewport's window of cells: `aria-rowcount` (or `-1` when the
  count is unknown), each cell's logical `aria-rowindex` and `aria-colindex`,
  one tab stop with `aria-activedescendant` while the focused cell is drawn,
  sticky pinned columns, a placeholder for rows not loaded, and the keyboard
  through `GridFocus.target`. Every element is a Slot; a Style that sets the
  geometry the window depends on is refused. `GridStyle` is a default look in
  the `components` layer. It renders on a server as markup a parser reads
  back the same.
- **`foldkit-data-grid`, column state (Phase 4).** A column spec takes
  `width`, `minWidth`, `maxWidth`, `resizable` and `hideable`. The
  `DataGrid` Model holds the column state, a `ColumnLayout` plus the widths
  resized, with `ColumnResized`, `ColumnHidden`, `ColumnShown` and
  `ColumnMoved` (a reorder, a pin or an unpin) to change it; each returns the
  Model it was given when it changes nothing, and the last column shown
  stays. `columnState.restore` reads a saved state back leniently and lists
  the ids it dropped. `Grid.project(rows, state)` is the projection for a
  column state, built once per rows model and state. The view takes `rows`
  in place of `projection` and `width`, and draws the column state.
- **`foldkit-mixins-data-grid`, resize handles.** Each resizable column has a
  `role="separator"` handle with its width in `aria-valuenow`: a pointer drag
  resizes from where it began (`ResizeStarted`, `ResizeMoved`,
  `ResizeEnded`; a cancelled drag puts the width back), and a focused handle
  steps with the arrow keys, mirrored in right-to-left text. The grid now
  takes only keys aimed at itself, so a handle's keys do not move focus.
- **`foldkit-data-grid`, selection (Phase 5, the state).** Opt-in with
  `rowSelection: 'single' | 'multiple'` and `cellSelection: true`. Rows are a
  `RowSelection` of `Keys` or `AllExcept`, so select-all holds rows not
  loaded; `RowSelected`, `RowsExtended`, `AllRowsSelected` and
  `RowsCleared` change it, with an anchor for Shift ranges. One rectangle of
  cells is held by its corners (`CellsSelected`, `CellsCleared`); a plain
  click or key lets it go. `GridSelection.extend` is the range a Shift key
  makes and `rowsBetween` a Shift range of rows.
- **`foldkit-mixins-data-grid`, selection drawn and driven.** Rows say
  `aria-selected` and cells in the range say it; the grid is
  `aria-multiselectable`. One click listener on the body (`CellPressed`,
  parsed and checked in the grid's update) focuses a cell, spans a range
  with Shift and toggles a row with Ctrl or Meta. Shift with a move extends
  a range and scrolls its far corner in, Space and Shift+Space select rows,
  Ctrl or Meta with A selects all, and Escape lets a range go. The per-cell
  `mousedown` handlers are gone.
- **Over Remote and CRUD (Phase 7).** `foldkit-data-grid/crud` (optional
  peers `foldkit-crud` and `foldkit-remote`): `GridCrud.columns(list, {
  columns, words })` from a `Crud.list`'s members and Displays, with the
  grid's own per-member options (pinning, widths, `edit`, a header), `rows(page, key)` a row model of a
  Remote page (unknown while there are more; the rows a failed read had),
  and `status(page)` a `RowStatus`. The view takes `status` (busy while
  loading or refreshing, a failure with `onRetry`), `onMore` while the count
  is unknown, and `sort` for `aria-sort` and a sort button, Enter on a
  header sending it too.
- **The clipboard (Phase 8).** `Clipboard.toTsv` and `parseTsv` write and
  read spreadsheet text (quoted cells, any line end); `copy` is a box's cells
  and `pasteAt` where pasted text lands. The grid's OutMessage is now a union,
  `Out.Edited | Out.Pasted`: a paste is checked cell by cell against each
  column and reported once, with what was refused. The view copies the range
  (or the focused cell), pastes from the range's corner, and cuts by copying
  and clearing, leaving the clipboard to a cell being edited.
- **`pnpm e2e`, the examples with a server end to end.** A Vitest project
  of its own (`vitest.e2e.config.ts`), kept out of `pnpm test`, and a CI job:
  each test starts the example's server and Vite and drives Chromium with
  Playwright. The registry's covers reading on scroll, a server sort, an
  edit read back from the table and kept across a reload, and the column
  menu. The todo app's covers a todo reaching a second person's page without
  a reload, written to the journal, and kept across one. The CMS's covers a
  writer's draft that the site does not show, and an editor's publish that
  it does. The entity example's covers a title saved from the form, read
  back from the table and kept across a reload; the pages example's, two
  tabs typing into one page, read back by a browser with nothing stored.
  `examples/pages` gains `startPagesServer` (run by `serverMain.ts`) and a
  Vite config: the page connects to `/sync` on its own origin, proxied to
  the server, and the workspace packages resolve to their source, so it no
  longer needs `pnpm build`.
- **Messages carry intent: the guide, and `Frames.track` to test it.**
  `docs/state-model.md` says why a Message should carry what the user did
  and `update` work out what it means, with the cases that were bugs.
  `Frames.track()` (`foldkit-mixins/testing`) tracks the page's frames:
  `hold()` keeps them back so a test's events meet the view as last drawn,
  and `settle()` waits until everything asked for is drawn, instead of a
  sleep. `Sync.mount`'s handle gains `settled()`, which waits until the Model
  has caught up with the replica (#170). `Sort.inputs`'s callback also
  gets the column clicked (`foldkit-crud`), so a sort header sends it and
  `update` toggles; the entity and registry examples do, and two clicks
  inside one frame now sort descending.
- **`App.runnable({ initial, update })` (`foldkit-surface`).** An
  application made from its Model and Messages is made runnable afterwards,
  with the same references and owner, for an update built over those
  references (a Remote domain, a placed Bundle) that Sync replays. The
  registry had two applications with two owners for this; it has one.
- **`foldkit-sync/journal`, the server's exchange over a journal.**
  `serveJournal(socket, options)` answers one socket's exchanges over a
  `foldkit-durable` journal (an optional peer) and notifies it of each
  commit; `journalExchange(options)` is the same as a `TransportClient`, and
  `journalChanges` the notice alone. An operation that does not decode,
  names another document, is refused by `authorize` or `validate`, or reuses
  an id is rejected by its id, so one bad operation no longer blocks the
  outbox; a cursor ahead of the journal's fails before anything is appended,
  and a replica of another epoch is answered from the start. `refuse`
  rejects by what the transport established, and `settle` applies commits
  elsewhere after each exchange. The todo-app, registry and kitchen-sink
  servers use it; todo-app's replicas now hear of each other's commits.
- **Remote over plain JSON (`foldkit-remote`, `foldkit-remote-server`).**
  `Remote.http(url, { headers })` is Remote's client over `POST`ed JSON,
  `Remote.json(send)` the same over any way of sending it (a worker, a
  server in the page), and `RemoteServer.answer(handlers, body)` the server's
  side: it decodes the request and payload by the protocol's own schemas
  before a handler sees them, and answers 200, 400 for a body that is not a
  request (an operation named `constructor` included), or 500, a defect
  saying only `Internal error`. `RemoteJsonRequest` and `RemoteJsonAnswer`
  are the wire. The entity, CMS and registry examples use them in place of
  their own copies.
- **Typed editing from Schema (`foldkit-data-grid`).** A column's `edit`
  takes a `schema` from the text typed to its value, in place of
  `validate`: a draft is committed only when it decodes, and the failure's
  message is the cell's error. `Grid.matchEdit(cell, handlers)` reads a
  reported cell's value back, one handler per editable column, each typed
  by its column's schema. `GridCrud.columns` keeps each member's options in
  its type, and `Columns` carries its specs type-only, so a grid infers a
  column's schema exactly. The editor is read from the schema
  (`CellEditor`, `Grid.editorFor`): a union of string literals is a `select`
  of them (new `choice` and `choiceOption` slots), a number a text field
  with `inputmode="decimal"`, anything else text.
- **`RowModel.map(rows, input, make)` (`foldkit-data-grid`).** Transforms
  each row as it is read, with the per-row function made from `input` once
  per `rows` and `input`, and the same model while both are. The registry's
  edits over Remote's rows are one call.
- **`examples/registry`, the registry over Remote and Sync.** 100,000
  products in SQLite behind a Drizzle `RemoteServer`, read a page at a time
  through a `Crud.list`, sorted on the server, loaded more on scroll. Edits
  are a Sync document kept on the device until the server's journal commits
  them; the journal applies each to the table through `recover`, and the
  grid draws a row with the replica's edits over it, so an edit survives a
  reload while offline and another device's shows on the next exchange.
- **A sorted header shows its direction (`foldkit-mixins-data-grid`).** The
  sort button carries `data-sort` (`asc` or `desc`), and `GridStyle` now
  styles the `sort` slot as the header's text with an arrow after it; it
  had been left a native button.
- **Fast typing on a grid keeps every key (`foldkit-data-grid`).** A key
  typed on the grid itself is now `EditTyped({ address, text })`: it starts
  the edit, or adds to the one open on that cell. Typing "Dowel" faster than
  a frame used to restart the edit on each key that reached the grid before
  its editor took focus, leaving "l"; Escape in that gap now cancels.
- **A column menu (`foldkit-mixins-data-grid`).** `columnMenu: true` puts a
  menu button on each header (`menuButton`) opening a `role="menu"`
  (`menu`, `menuItem`) of `Grid.menuItems`; Alt+ArrowDown, Shift+F10 or the
  menu key opens it from a focused header. It takes focus, walks with the
  arrows, Home and End, runs an item on Enter, Space or a click, and closes
  on Escape, a choice or focus leaving it. Words: `menu`, `pinStart`,
  `pinEnd`, `unpin`, `hide`, `show`.
- **A column menu's state (`foldkit-data-grid`).** `menu` in the Model
  holds the column whose menu is open and its active item; `MenuOpened`,
  `MenuMoved`, `MenuChosen` and `MenuClosed` drive it. `Grid.menuItems`
  lists pin to another region, hide, and show each hidden column, each only
  when it changes something, as `Grid.MenuItem`s; a chosen item runs the
  column Message it stands for. Hiding a column now also takes its header's
  focus and closes its menu, as it already ended its edit.
- **More rows as the end comes into view (`foldkit-mixins-data-grid`).**
  `moreOnScroll: true` beside `onMore` sends it when the More button comes
  within 200px of the grid's visible box (an IntersectionObserver rooted at
  the grid), and again after each load while the button stays in view; it
  asks nothing while `status` is busy.
- **A column header dragged to reorder it (`foldkit-data-grid`).** The grid
  holds a drag as its column and the pointer's delta (`dragging`), from
  `ColumnDragStarted` with the header's DOM id (`GridFocus.headerOf` reads
  it back), `ColumnDragged` and `ColumnDragEnded`. Let go, the column moves
  within its region past the middle of each shown neighbour it crossed,
  worked out then by `ColumnState.dropAt` from the columns as they stand; a
  cancelled drag moves nothing. `ColumnState.regionOf` says which region a
  column is in. `foldkit-mixins-data-grid` draws it: a press on a header
  moved past 4px drags it (a click, on a sort button too, stays a click),
  the header follows the pointer with `data-dragging`, the neighbour it
  would land beside has `data-drop`, and Escape lets it go back.
- **`examples/data-grid`, a 100,000-row product registry.** The UPC
  pinned, descriptions and prices edited with validation, rows and ranges
  selected, and copy and paste; the products are the application's, written
  by `onOut` from the grid's `Edited` and `Pasted`. Tested in jsdom and, at
  full size, in Chromium.
- **Editing (Phase 6).** A column with `edit: { draft?, schema? }` is
  editable as text. The `DataGrid` Model holds the session (`editing`), with
  `EditStarted`, `EditChanged`, `EditCommitted` and `EditCancelled`; a commit
  the column accepts moves focus and returns the OutMessage `Edited({ row,
  column, text })`, so every grid is now placed with `onOut`
  (`Bundle.ignore` for one that edits nothing). A refused draft stays with
  its error; a click elsewhere commits first; hiding the column ends it. The
  view opens a focused field on Enter, F2 or a typed key, commits with Enter
  and Tab, cancels with Escape, marks a refused draft `aria-invalid`, and
  hands focus back to the grid.
- **The header row by keyboard.** Focus holds a `header` beside the current
  cell (`HeaderFocused`, revealing a header scrolled away): ArrowUp from the
  first row reaches it, the arrows and Home and End walk it, and ArrowDown or
  Escape return. On a header, Shift with an arrow resizes the column and Ctrl
  or Meta with Shift and an arrow reorders it. `GridFocus.headerId` names a
  header cell.
- **`foldkit-data-grid`, `GridFocus.cellOf`** reads a cell id back into an
  address; an id from another grid, or with a malformed escape, is none.
- **`foldkit-data-grid`, `Columns.define` written inline keeps its row type.**
  Inside `DataGrid.make({ columns: Columns.define<Row>()({...}) })` every
  `row` was `unknown`; the return type is `NoInfer` now.
- **`foldkit-data-grid`, `GridViewport.scrollTo` on a container that cannot
  scroll** still reports `Revealed`: a DOM with no layout has no `scrollTo`,
  and the Command threw there.

### Fixed

- **`foldkit-sync`: `statusChanges` and `changes` miss no change.** Each
  emitted the current value and subscribed to later changes only once that
  value was taken, so a subscriber slow to take it, and any change between
  the read and the subscription, went untold. They subscribe first now.
- **`examples/registry`: an edit lost while offline is said.** When the
  journal absorbed another device's later edit of a cell before this device
  heard of it, the page kept showing its own value as saved until some read,
  then changed it silently. A newly retired edit now asks for its rows again,
  and a read at or past an edit's revision holding another value says "a
  later edit replaced yours" (`Replacement.by` is an `Option`). The page names
  its device in the Model (`DeviceNamed`), so `replacedOf` reads it there (#173).
- **`foldkit-sync/journal` no longer reaches Node.** It imported
  `foldkit-durable`'s main entry, which brings `node:sqlite`, so a browser
  bundle of it failed; it imports `foldkit-durable/core`.
- **`foldkit-remote-drizzle` and `foldkit-cms-drizzle` take `drizzle-orm` as
  a peer.** As a dependency, an application whose Drizzle resolved with other
  optional peers got a second copy, and its tables did not type-check against
  the adapter's. Install `drizzle-orm` beside them.
- **`examples/registry`: a committed edit no longer hides the table for good.**
  Every edit a device knew of was laid over every row Remote read, with
  nothing to say when the table had it, so a row changed afterwards by any
  other commit kept showing the old edit. The table is the journal's read
  model: each row carries the `revision` it has read the journal to, written
  with the change in one statement that never moves a row back; the journal
  stamps each edit with the sequence it committed at; and a row shows an edit
  only while it is pending or committed after the row's revision. A table
  write that throws now fails its recovery intent and is retried on the next
  exchange, where it died before; an operation that says when it committed
  is refused. Every few seconds the server records, as its own operation
  (`AbsorbedEdits`, refused from a client), that the table holds every edit
  through its recovery cursor: replicas drop those edits and the log is
  compacted, so the replicated slice is what the table lacks. A page keeps an
  absorbed edit in `retired`, set by `onReinstall`, until its cached row is
  read at the edit's revision. The document is `registry-edits-2`, since
  `edits` changed shape, so a replica stored under the old one is not opened
  (#159).
- **`examples/cms` starts its studio again.** Since the studio's sections
  share one runtime, the entry drew it into a new element in place of `#app`
  that had no id, which the runtime refuses before drawing, so `pnpm dev` and
  the sandbox build showed a blank studio. The element takes `#app`'s id.
- **`examples/todo-app` adds what was typed, and keeps edits from a second
  browser.** The composer sent `RequestedTodo({ title: model.draft })`, the
  draft of the frame last drawn, so Enter pressed before the next frame
  added nothing; it sends `DraftSubmitted` and `update` reads the draft, and
  an agent's `RequestedTodo` no longer clears it. The replica was named by
  the token, so a second browser signed in as the same person restarted its
  operation ids and the journal refused each new one as reused; each tab is
  its own replica now. The end-to-end test found both.
- **`foldkit-sync`, `Mounted.dispatch` takes a Message as its type is.** It
  handed the value to a Foldkit inbound Port, which decodes what it is sent,
  so a Message with a transforming field (`Schema.OptionFromNullOr`, a
  `NumberFromString`) failed with a `SchemaError` and never reached
  `update`. It encodes the Message first now.

## 0.14.0

`foldkit-entity` 0.7.0; `foldkit-remote` 0.11.0; `foldkit-remote-server`
0.11.0; `foldkit-remote-drizzle` 0.9.1. Republished to re-pin:
`foldkit-cms` 0.4.1, `foldkit-cms-drizzle` 0.4.1, `foldkit-crud` 0.5.1,
`foldkit-form` 0.4.1, `foldkit-mixins-crud` 0.6.1 and `foldkit-mixins-form`
0.4.1, each of which pins a bumped package exactly. Every other package is
unchanged.

**Queries mean the same thing everywhere.** Nine reports from testing a second,
independent implementation against the published packages: a query is now a
frozen value, a shared node costs one visit, dependencies are reported per
Entity identity, `contains` folds the same way in memory and in SQL, and an
ordering refusal reads the same on every engine. On the server, related
entities serve their relations, field names from `Object.prototype` are
refused, and the memory backend can be served over a real transport. On the
client, `Remote.clientLayer` takes the stock `RpcClient` as it is.

### Upgrading from 0.13

- **A dependency's field names its owner.** `dependenciesOf` and
  `Query.dependencies` return `{ entity, key, owner }` per field. Code that
  compares the whole entry with `toEqual` needs the `owner` too, or compares
  `entity` and `key` alone. `Data.explain` is unchanged.
- **`Expr` nodes are frozen.** Code that changed a node after building it
  now throws in strict mode. Build a new node instead.
- **`evaluate` refuses more, the same way every time.** A null order key is
  refused wherever it is, including where an earlier term already separates
  the rows, and `contains` refuses text holding a NUL character, as the SQL
  compiler now does. `contains` folds ASCII letters only, so a search that
  relied on `É` matching `é` in memory no longer does; it never did in SQL.

### Added

- **`foldkit-remote-server`, `MemoryBackend.server`:** the server definition
  a memory backend answers through, so it can be served over a real
  transport, `RemoteRpc.toLayer(RemoteServer.handlers(backend.server,
  undefined))`, instead of copying the backend's private read and query
  closures (#140).

### Changed

- **`foldkit-entity`, a field's dependency names its owner:**
  `dependenciesOf` and `Query.dependencies` report each field as
  `{ entity, key, owner }` and keep one entry per Entity identity, so two
  Entities defined with the same name are no longer one dependency.
  `Data.explain` keeps the plain `{ entity, key }` form, which serializes and
  is unambiguous for a query reading one Entity (#139).
- **`foldkit-entity`, `evaluate` checks an ordering before sorting:** every
  term over every matched row, in row order. A refusal now names the first row
  that breaks the order, the same on every engine, rather than whichever pair
  the engine's sort compared first; and a null key is refused wherever it is,
  even where an earlier term already separates the rows. One matched row is
  never refused (#142).

### Fixed

- **`foldkit-entity`, `Expr` nodes are frozen:** a predicate could be changed
  after `Query.where` checked it, changing a built query's results or slipping
  another Entity's field past the ownership check. Every node is frozen as it
  is built (#138).
- **`foldkit-entity`, a shared expression node is visited once:** the
  ownership check and the dependency walk followed every path to a node, so
  `Expr.eq(n, n)` nested a dozen deep took thousands of visits. Each walk keeps
  the nodes it has seen (#137).
- **`foldkit-entity`, `contains` in `evaluate` folds ASCII only:** it folded
  full Unicode while the compiled SQL folds ASCII, so `É` matched `é` in one
  and not the other. It folds ASCII letters only now, as `Expr.contains`
  documents, and text holding a NUL character is refused by both
  interpreters. Two conformance cases pin the folding (#136).
- **`foldkit-remote`, `Remote.clientLayer` with the stock `RpcClient`:** it
  refused the client `RpcClient.make(RemoteRpc)` builds, whose calls can also
  fail with `RpcClientError`, so every application wrote an adapter. It takes
  that client as it is now, and a transport failure becomes the call's own
  Remote error (`RemoteReadError`, `RemoteQueryError`, `RemoteMutationError`,
  `RemoteLiveError`), which the UI shows and retries, rather than a defect.
  `RemoteRpcClient` gained a `TransportError` parameter, `never` by default,
  so in-process handlers are unchanged (#141).
- **`foldkit-remote-server`, `RemoteServer.entity` with a related Entity:** it
  declared only the Entity's scalar `fields`, so a relation such as `owner`
  was settled as withheld and a nested selection through it returned nothing.
  It declares the Entity's `members` now: fields, relations and derived
  members (#135).
- **`foldkit-remote-server`, requested fields named like `Object.prototype`
  members:** a request for `constructor` or `toString` was answered from the
  prototype by the memory source and renamed to it by the read path, so the
  field was neither answered nor settled. Field presence is an own-property
  check, renames are looked up the same way, and the alias maps have no
  prototype, so `__proto__@first=1` is an alias like any other (#143).

## 0.13.0

`foldkit-agent` 0.6.0; `foldkit-agent-a2a`, `foldkit-agent-mcp`,
`foldkit-agent-native` and `foldkit-agent-webmcp` 0.5.0; `foldkit-bundle`
0.5.0; `foldkit-bundle-surface` 0.3.0; `foldkit-cms` 0.4.0;
`foldkit-cms-drizzle` 0.4.0; `foldkit-crud` 0.5.0; `foldkit-durable` 0.6.0;
`foldkit-entity` 0.6.0; `foldkit-form` 0.4.0; `foldkit-mirror` 0.5.0;
`foldkit-mixins` 0.6.0; `foldkit-mixins-crud` 0.6.0; `foldkit-mixins-form`
0.4.0; `foldkit-mixins-richtext` 0.2.0; `foldkit-mixins-surface` 0.5.0;
`foldkit-mixins-ui` 0.6.0; `foldkit-primitives` 0.5.0; `foldkit-react` 0.3.0;
`foldkit-remote` 0.10.0; `foldkit-remote-drizzle` 0.9.0;
`foldkit-remote-server` 0.10.0; `foldkit-richtext` 0.3.0;
`foldkit-richtext-code`, `foldkit-richtext-code-shiki` and
`foldkit-richtext-markdown` 0.2.0; `foldkit-richtext-dom` 0.3.0; `foldkit-ssr`
0.3.0; `foldkit-surface` 0.6.0; `foldkit-sync` 0.8.0. `foldkit-metadata` and
`foldkit-react-codegen` are unchanged.

Every package moves a minor version, including those whose only change is
the new requirement. A `0.x` caret range accepts any patch of its minor, so a
patch that now needs Effect 4.0.0 would install itself into an application
still on the release candidate; a minor is the step an application takes on
purpose.

**On stable Effect.** Every package now requires Effect 4.0.0, the first
stable release of Effect 4, and Foldkit 0.165.0, the first Foldkit on it. The
code changes that follow from it are import paths and two type fixes; nothing
here changes behaviour on its own account.

**Smaller additions.** `form.value` reads a whole decoded form or nothing,
`Link.child` states a plain child once, `RowListView` draws a list as rows,
and the CMS history card can retry.

### Upgrading from 0.12

- **Effect 4.0.0 stable and Foldkit 0.165.0.** Every package now
  peer-depends on `effect@^4.0.0` (from `>=4.0.0-rc.116 <4.0.0-rc.118`) and
  `foldkit@^0.165.0` (from `^0.163.0`); `foldkit-mixins-ui` peers
  `@foldkit/ui@^0.165.0`. Foldkit 0.165.0 is the first release on stable
  Effect and pins it exactly, so an application moves `effect`,
  `@effect/platform-browser`, any other `@effect/*` package, `foldkit`, and
  `@foldkit/ui` together, and `@foldkit/vite-plugin` to 0.26.0.
  `foldkit-durable`'s `@effect/sql-sqlite-node@4.0.0` needs Node 22.16 or newer.
  - Effect 4.0.0 removed `effect/unstable/*`. Import `effect/http`,
    `effect/persistence`, `effect/rpc`, and `effect/sql`; `effect/unstable/httpapi`
    is now `effect/http-api`. Every import here has moved.
  - Effect 4.0.0 reversed `partition` in `Array`, `Chunk`, `Effect`, and
    `Record`, and `Option.partitionMap`: successes now come first. A call
    site written for the rc still type-checks and swaps its results. Nothing
    in this repository calls them; check your own.
  - `@foldkit/ui` 0.164.0 added a `transitionGeneration` field to
    `Animation.Model` and a `generation` to its Messages; a test fixture that
    builds an Animation Model by hand needs it.
  - `examples/livestore` keeps `effect@4.0.0-rc.112`: LiveStore's Effect 4
    build still imports the removed `effect/unstable/*` paths.

### Added

- **`foldkit-form`, `form.value(model)`:** the decoded input as `Some` when
  every key and row is valid as the form stands, `None` otherwise. All or
  nothing (unlike `partial`), so a parent that submits several forms reads one
  complete value per form without the nesting engine. Job Application composes
  its `ApplicationPayload` from it.
- **`foldkit-mixins-form/ui`, `field`:** an optional FormView override for
  Text/Multiline fields drawn through the styled UI adapters, preserving
  Changed/Blurred dispatch, names, required state, descriptions, checking and
  errors. Form and Auth adopt it while keeping their application-owned layouts
  and styled submit buttons. The main entry retains its plain-HTML renderer.
- **`foldkit-bundle`, `Link.child(link, update, view, slotId)`:** a child
  that is not a Bundle, stated once: the Link names where its Model lives
  and how its Messages wrap, and the pair yields the fold for `update` and
  the drawing for `view` (branded once, absent draws nothing). The studio's
  two sections adopt it, deleting a fold and a submodel apiece. Children
  with view inputs or OutMessages of their own stay hand-rolled.
- **`foldkit-cms`, `historyCard` retry and announced states:** an optional
  `onRetry` with `retry` words draws a retry button on a failed history
  read, on the restore slot so no new builder is required; the Failed and
  Loading states draw as an alert and a busy status instead of plain text.
  The body now branches through `Match.tagsExhaustive`.
- **`foldkit-mixins-crud`, `RowListView`:** a list drawn as `ul`/`li` rows
  over the same state contract `ListView` carries (busy, empty, failed with
  the caller's retry, a failed refresh kept above its rows). The application
  draws each row's content through `RowListInput.row`; `onOpen` makes the
  whole row a button. Both lists share one implementation, so their states
  cannot drift.

### Fixed

- **`foldkit-primitives`, the socket and SSE bundles under Foldkit 0.165:**
  the private `unlessSame` helper inferred its type from both arguments, and
  Foldkit 0.165's `match` no longer passes the declared return type into each
  arm, so `{ ...model, status: 'connecting' }` widened `status` to `string`
  and failed to type-check. It infers from the current Model alone now.
- **`foldkit-primitives`, `PointerDrag`'s drop target:** a drop named the
  place the last move reported, so a scroll or a layout change between the
  final move and the release dropped onto a stale target. The release is
  hit-tested again when it carries a position; one without keeps the last
  move's answer.
- **`foldkit-mixins-ui`, `Recipes.Dialog`:** restores the modal's
  `margin: auto`, which `Defaults.reset` zeroes, so a dialog opens centered
  rather than in the top corner.
- **`foldkit-bundle`, `Bundle.withServices` in a `compose` pipe:** it refused
  a composition whose placements were already readable (every child
  configured, or none), because its parameter typed the incoming services as
  `any` and `Composition` is invariant there. It is generic now, so
  `Bundle.compose(fields).pipe(Bundle.withServices<S>(), Bundle.withChild(…))`
  type-checks as the README says.

### Changed

- **`examples/foldkit/ui-showcase`, on `@foldkit/ui`'s own Meter, Progress
  and vertical Slider.** The showcase drew local ports of Meter and Progress
  because `@foldkit/ui` had neither, and showed "Fractional steps" where
  upstream shows a vertical Slider because the Slider had no orientation. Both
  arrived in 0.164.0: the pages now draw upstream's components through the
  page's Slots, the volume slider stands upright (`orientation: 'Vertical'`,
  styled by the `data-vertical` the Slider writes), and the ports are deleted.
  Their tests went with them; the new ones check what the page configures:
  each meter's value, label and thresholds, both progress states, and the
  slider's orientation.
- **`foldkit-primitives`, broken out into one reference per subpath.** The
  package README is onboarding and a map: which of the five forms a primitive
  takes (bundle, bundle plus Behavior, entry, Mount, Command, or function),
  one placement walked through, the three other ways in, the rules every
  primitive keeps, and a table pointing at ten subpath pages. Each subpath
  README (`media`, `net`, `time`, `state`, `motion`, `device`, `events`,
  `observers`, `dom`, and a new `interaction`) now holds its primitives'
  Model shapes, Messages, args, a placement in `Bundle.compose` form, and the
  detail that used to sit in one 1000-line page. Every snippet is type-checked
  in `test/readme.test-d.ts` and `test/readme/<subpath>.test-d.ts`, which
  caught two snippets the old page could not keep: a `SlotView.define` whose
  input was unannotated, and a `withChild` config whose `onOut` returns
  Commands (written against `Base.Model` and given through `configure`).

- **`foldkit-sync`, `foldkit-durable`, and the replicated-state guide,
  rewritten for the reader who has an application and wants it to work
  offline.** Both READMEs now lead with the normal path (declare, mount, run
  the loop; spread the contract into the journal) and keep the replica API,
  transports, presence, and LWW under an advanced section. The Sync README
  adds the three milestones an edit passes (visible, saved, committed) and
  which reader shows each, a section on testing with a memory `Storage` and
  the loopback transport, and a failure list ordered by what changes the
  design. The guide (`docs/replication.md`) is now one feature end to end
  and carries the server's exchange handler in full, which neither README
  could show: cursor check, append with deterministic rejections, paging,
  checkpoint below the floor, epoch, and `Sync.transport.serve` with a
  change notice. Every snippet is type-checked: the READMEs' in each
  package's `test/readme.test-d.ts`, the guide's in
  `examples/sync/test/guide.test-d.ts`.

## 0.12.0

`foldkit-agent` 0.5.0; `foldkit-bundle` 0.4.0; `foldkit-cms` 0.3.0;
`foldkit-cms-drizzle` 0.3.0; `foldkit-durable` 0.5.0; `foldkit-entity` 0.5.0;
`foldkit-form` 0.3.0; `foldkit-mirror` 0.4.0; `foldkit-mixins` 0.5.0;
`foldkit-mixins-crud` 0.5.0; `foldkit-mixins-form` 0.3.0;
`foldkit-mixins-ui` 0.5.0; `foldkit-primitives` 0.4.0; `foldkit-remote`
0.9.0; `foldkit-remote-server` 0.9.0; `foldkit-richtext` 0.2.0;
`foldkit-richtext-dom` 0.2.0; `foldkit-ssr` 0.2.0; `foldkit-surface` 0.5.1;
`foldkit-sync` 0.7.0; `foldkit-remote-drizzle` 0.8.1. Republished to re-pin:
`foldkit-bundle-surface` 0.2.1, `foldkit-crud` 0.4.1,
`foldkit-mixins-richtext` 0.1.1, `foldkit-mixins-surface` 0.4.1, `foldkit-react`
0.2.1 and the four agent adapters 0.4.1. Three packages are published for the first time at
0.1.0: `foldkit-richtext-code`, `foldkit-richtext-code-shiki` and
`foldkit-richtext-markdown`. `foldkit-metadata` and `foldkit-react-codegen`
are unchanged.

**A page is assembled, not spread.** `assembly.runtime` builds the runtime
config in one call from an update that already routes every placement, and
derived args come from the parent seed — so a routed page takes its search
text without a second fetch, and `assembly.config` is gone.

**Remote asks once and says when.** A query carries its selection and comes
back with the fields (`Data.meta` says when it arrived and whether it is
stale), and `Data.satisfy` prepares a Model for a render, which is what the
static build runs per page.

**Static sites end to end.** The browser entry loads no server renderer, a
takeover is an explicit decision (`when`/`otherwise`/`fresh`), a
determinism check renders every page across zones and locales, and the
`staticSite` plugin turns `vite build` into the whole static build.

**An editor that replicates.** `Replicated` folds character-identified ops
in any order to the same state, `patchTo` redraws a remote keystroke without
remounting, and task lists, overlays and decorations round out the canvas.

**Views with less machinery.** `Input.field` draws a validated field in one
call, `FormView.fields` draws per key with overrides, `Button.view` is one
call, and every adapter has `toView`; forms validate all without
submitting, and a submit waits or disables explicitly.

**Styling without stylesheets.** Slots declared by their style, cascade
layers as a value, a theme from a few knobs, `Style.install`,
`Style.usedIn` for the first paint, and a `foundations` plugin that writes
the sheet into the head.

**State that survives.** The journal pages history, vacuums itself, and
binds replicas to actors across schema 6; Sync exchanges over a socket that
reconnects, persists its outbox in IndexedDB v2, and takes server resets.

### New packages

- **`foldkit-richtext-code` 0.1.0.** Total grammars as tokenizers over the
  shared `syntax-*` kinds: a JSON lexer that never throws, for
  `codeDecorations`.
- **`foldkit-richtext-code-shiki` 0.1.0.** Shiki grammars as tokenizers over
  the same kinds (colours discarded, scopes mapped, one stylesheet); the
  application owns the highlighter.
- **`foldkit-richtext-markdown` 0.1.0.** Markdown round-trips for the editor
  document: task items, tight lists, and the words around them.

### Upgrading from 0.11

- Replace `assembly.config` with `assembly.runtime` (compose a narrow
  `assembly.update(own)` first where the parent adds Messages); placement
  factories now take the seed without the placement's own field.
- Handle `Loading` and `Failed` from `Cms.revisionsOf` instead of an empty
  list; pass the `RevisionHistory`, not rows.
- Send mutations with `now`, read answers as `MutationAnswer`, and read
  `Data.more` as an `Option` (`Data.next`/`previous`/`fetch` are gone);
  entry dependencies are typed, and an overlaid-missing field reads
  `Failed`, not `Initial`.
- Expect Timer/Interval's first tick one interval after `Started`; match the
  new `TimedOut`/`GoTo` variants and the History `group` field.
- Serve the envelope on the stamped root (not a pre-`</body>` script);
  `SSR.entry` takes no `template`/`containerId`/`head` and refuses `meta`
  plans at construction; the `foldkit-ssr/replay` entry is gone.
- Open IndexedDB v2 fresh (old code cannot open it) and migrate durable to
  schema 6 (`legacyReplicaId` recovers actor-less replicas); the socket
  reconnects for as long as its layer lives.
- Rebuild hand-built `StyleValue`s through the brand; move the family
  `text` token to `on-fill`/`ink` (`text['on-accent']` is gone).
- Upgrade `foldkit-mixins-surface` with `foldkit-mixins` (its peer moved to
  `^0.5.0`), and the agent adapters with `foldkit-agent` (`^0.5.0`).
- A hand-written form control now satisfies `Record<FormTag, …>`; unknown
  `FormView.fields` keys are compile errors.
- Stay on Effect `4.0.0-rc.116` (rc.117 is admitted untested); the peer range
  stops below rc.118, whose `effect/rpc` move breaks our
  `effect/unstable/rpc` import. The import moves with the workspace Effect
  upgrade, which widens the range again.

### Breaking

- `foldkit-bundle`: `assembly.config` is removed; shared tags reach every
  claimant and the parent (first-claimant-wins is gone).
- `foldkit-cms`: `revisionsOf` returns `RevisionHistory`; `historyCard`
  takes it, not rows.
- `foldkit-remote`, `foldkit-remote-server`: `MutationSucceeded` carries
  `now`; `settleSuccess`/`reconcileMutation` take `MutationAnswer`; query
  windowing is `Data.more: Option` with `WindowGrown` (`next`/`previous`/
  `fetch` removed); entry dependencies are typed; overlay-missing reads
  `Failed`.
- `foldkit-primitives`: Timer/Interval tick late; `TimedOut`/`GoTo` break
  exhaustive matches; `HistoryModel` gains `group`.
- `foldkit-ssr`: the envelope rides the stamped root; `SSR.entry` answers
  `Rendered` with a new contract; the `replay` entry is gone.
- `foldkit-sync`, `foldkit-durable`: IndexedDB v2 and durable schema 6 do
  not open older stores; the socket reconnects while its layer lives.
- `foldkit-mixins`: `StyleValue` is branded; the family `text` token is
  `on-fill`/`ink`.

### Added

- **`foldkit-mixins-ui`, Badge recipe:** a status pill with a dot, toned by
  an attribute's value — `Recipes.Badge({ attribute: 'data-state', tones: {
  Published: 'success' } }).badge`. Unlike the variant recipes every tone is
  present at once (one style serves badges in every state), so it takes the
  attribute and the value-to-tone map instead of a variant selection; values
  the map leaves out keep the base. The CMS demo adopts it for both badges
  and keeps only the state-to-tone map.

- **`foldkit-mixins-crud`, Loading/Empty/Failure views:** what a read says
  before it has an answer, over any status slot — `Loading.view` is
  `role="status"` with `aria-busy`, `Empty.view` is `role="status"`,
  `Failure.view` is `role="alert"`, and `Loading.shown` fades busy text in
  late so a quick answer never flashes. `ListView` and `DetailView` draw
  these for their own states; the CMS demo adopts them for its lists, site
  reads, and editor branches.

- **`foldkit-cms`, entry views:** the studio cards every CMS draws, on its
  own slot builders — `Cms.stateBadge`, `Cms.revisionsOf`, `Cms.historyCard`,
  `Cms.moreCard`, with `HistoryCardSlots`/`MoreCardSlots`/`RevisionRow`
  types. Who published and the archive icon stay the application's; words
  for states come from `Cms.Display`. The CMS demo adopts them and keeps
  only its slots, styles, and chair names.

- **`foldkit-cms`, entry views fixes:** `Cms.stateBadge` writes a custom
  attribute for a new entry too, and `Cms.revisionsOf`/`Cms.historyCard`
  read a `RevisionHistory` so a failed or still-loading history no longer
  draws as nothing published. The CMS demo's `stateIs` copy is deleted in
  favor of `Cms.stateIs`.

- **`foldkit-mixins-ui`, Touch/Icons mechanisms:** no slots, no views —
  `Touch.target`/`Touch.targets` floor controls at 44px where the pointer is
  coarse, `Icons.glyph(size)` draws the icon in `--icon`, and
  `Icons.byAttribute(attribute, icons)` sets it per value from resolved
  `url(…)` strings. The CMS demo adopts them and keeps only its Lucide
  paths.

- **`foldkit-mixins-ui`, Button `primary`/`icon` variants:** the main action
  in ink (`variant: 'primary'`, tone-independent) and the square icon-only
  button (`variant: 'icon'` with `size: null`, words as the accessible name).
  The CMS demo adopts them with `ghost` for its buttons and deletes its
  bespoke `primaryButton`/`iconButton`.

- **`foldkit-mixins-ui`, Segmented recipe:** a tray of toggle buttons where
  pressing selects (`role="group"` + `aria-pressed`, not `Tabs`) — `tray`
  picks a muted tray or a plain row, `size` the text density, and the pressed
  option rises from the group so icon tiles share the rule. The CMS demo
  adopts it for its worklist tabs, viewport switcher, panel tabs, and
  inspector choices.

- **`foldkit-mixins-ui`, `Input.view`/`Textarea.view`:** one call drawing a
  field — the value and Messages, a style, `type`/`placeholder` (`rows` for a
  textarea), and a `draw` placing the resolved bundles. The job application's
  button fork is deleted in the same spirit: its views call the package
  `Button.view` instead of their subset copy.

- **`foldkit-mixins-ui`, `Input.field`/`Textarea.field`:** a text field in
  one call — a field's state drawn with its label, control, and description
  placed (first error, or the check while it runs), `type`/`placeholder`
  (`rows` for a textarea) riding through, and a `draw` placing the parts
  for layouts the default stack does not own. The waitlist example's
  per-kind overrides and the job application's field view adopt them and
  keep only their layouts and status marks; both now read the platform
  `Checking…` spelling.

- **`foldkit-mixins-form`, per-key element attrs:** `FormView.fields` takes
  `attrs` beside `overrides` and `styles` — what one key's element takes
  beyond the base field view (`type`, `placeholder`, textarea `rows`). The
  default renderers forward what fits their element and ignore the rest, and
  overrides receive the same map. The waitlist example moves its email type
  there and drops the thread-through.

- **`foldkit-mixins-form`, submit gating:** `FormView.submodel` takes the
  submit gate explicitly — `canSubmit` (a submit waits), a strict predicate
  (disabled through checks), or `() => true` (never pre-disable). The lenient
  default is unchanged.

- **`foldkit-primitives`, SSE view parity:** `SseView` with `isLive` and
  `viewOfSse(model, wanted)`, the same shape as the socket's `SocketView` —
  a page derives what the reader sees instead of keeping its own connection
  state.

- **`foldkit-bundle`, derived args:** a placement's `args` is a static value
  or a factory from the parent seed, `args: parent => ({ searchText:
  searchFromRoute(parent.route) })`. The seed is what
  `assembly.initial(rest)` was given, before any placement initialised; the
  factory's parameter omits the placement's own field, and every factory sees
  the same base seed, so placement order never matters. The result is checked
  against the bundle's args Schema and retained for `update`, helpers,
  Subscriptions, and resources, never re-run against live state — a factory
  runs once per seed it has seen. On a Model
  no initialization produced, `update` derives per use without retaining.

- **Routing example, derived placement args:** the People page is a Bundle
  placed once with its search text derived from the starting route, so
  `init(url)` is `assembly.initial({ route })` with no second fetch and no
  post-init Message. Route changes after startup still arrive as Messages,
  folded through the same placement, and the view keeps its `people` slot.

- **`foldkit-primitives`, scroll keeping:** `keepScroll(options)` in
  `foldkit-primitives/dom` — the window's scroll across an application's own
  navigations (the offset taken when the reader acts, a restore that holds
  while the screen settles, entries keyed by the Navigation API with offsets
  in `sessionStorage`). A stream sending no Messages, lifted with
  `Subscription.persistent`; the default storage key is `foldkit:scroll`.
  The CMS example adopts it in its studio and site subscriptions and deletes
  its hand-rolled `scroll.ts`.

- **SSR S1, browser entry without the server renderer:** the CMS example's
  browser entry takes `SSR` and `FOLDKIT_APP_ATTRIBUTE` from
  `foldkit-ssr/client` — its hand-written root mark is gone, and the takeover
  plan rides the bundle instead of a lazy chunk (cheap now that it draws
  from the client side, with no server renderer). A static import walk from
  the entry fails on reaching `foldkit/experimental/server`.

- **SSR S6, build determinism:** the CMS example renders every page twice
  under one time zone, once under zones at both extremes of the date line,
  and under two default locales in child processes — any difference fails
  the build. Building the check fixed two live leaks: `generateSite` takes
  the build's clock, threading it into the server and, via
  `Data.satisfy`'s `now`, into the read stamps the envelope carries.

- **SSR S7, static site as a build step:** `foldkit-ssr/vite` renders every
  path after the client bundle is written — `generateStaticSite` (paths or
  a thunk closing over what the site serves, per-path configs, template,
  head, `flat`/`directory` file layout, sitemap, robots) behind the `staticSite`
  plugin, which evaluates the site module through a server so the config
  names a file, never application code. `foldkit-mixins/foundations` writes
  the sheet module's stylesheet into the head the same way. The CMS example
  builds through both and deletes its hand-rolled script and plugin. Empty
  paths and two paths naming one file are refused before rendering.

- **SSR S5, deciding whether to take a page over:** `SSR.hydrate` takes
  `when` (asked before anything is adopted), `otherwise: 'render'` (a
  declined page draws afresh where the served page is, replacing its markup
  in place; anything else contains it as a resume failure does), and `fresh`
  over the plan's new `version` (asked once). The CMS example collapses its
  takeover branch into one call: a page for another reader draws afresh
  instead of taking stale facts over as live ones.

- **`foldkit-cms-drizzle`, `ImportItem<P>`:** the input of `cms.import`,
  named and exported — what a seed or a migration passes per entry (`type`,
  `values`, `as`, `at?`, `entry?`). The package's own tests and the CMS
  example's `seed.ts` read it instead of re-declaring it, and the README
  gains the seeding shape beside it: a fixed clock, named entries imported
  dependencies-first, `as` fixed once.

- **`foldkit-bundle`, `assembly.runtime`:** the runtime config in one call for
  an application whose `update` already routes every placement. `initial`
  rest becomes `init`, or an init function returning
  `assembly.initial(...)` is used as `init` when the seed needs runtime
  input, like the URL. The `update` passes through checked (route a narrow
  one with `assembly.update(own)` first, or omit it when the parent adds no
  Messages); the own `subscriptions` and `managedResources` merge with the
  items', defaulting to the items', so an application that adds none passes
   neither. `assembly.config` is removed in its favour; the CMS
   `siteConfig` and the entity client use it. Passing an already-wired
   record (`assembly.subscriptions()`) back as own is a type error instead
   of a later duplicate-key failure.

### Fixed

- **`foldkit-bundle`, placement typing:** `PlacedResources` keeps
  `onAcquired`'s parameters, so `Scene.ManagedResource.acquire` on a placed
  resource needs no stand-in value; a Link carries its top-level field, so
  `placements.initial` keeps its exact check through a custom Link, and an
  `Option` placement field may be given to start `None`.

- **`foldkit-mixins`, a slot named `__proto__`:** `forSlots` kept its piece
  on a plain object, where the name set the prototype instead.

- **`foldkit-remote`, two policies without losing data:** two
  `Data.subscriptions` calls over one domain no longer collect each other's
  data. Retention is the domain's: every call's `retain` entry roots the
  Surfaces and `connections` of every call, so reads under different policies
  can use a call each.
- **`foldkit-remote`, the default clock:** it reads `Date.now` at each use
  instead of capturing it when the domain is made, so fake timers move plans
  and stamps. A read under `staleWhileRevalidate` planned at the exact
  millisecond a value expired no longer stalls.

- **`foldkit-form`, optional and `Option` keys:** a key made with
  `Schema.optionalKey` and left empty is valid and left out of the value, as
  it already was for `Schema.optional` (an optional nested key too). A key
  typed `Option` (`Schema.OptionFromNullOr`) is edited as the value it holds
  and submits `Option.some` / `Option.none()`, instead of throwing "no
  control". A validation that changes nothing (a blur on an empty optional
  key) returns the Model it was given, so nothing redraws.

- **`foldkit-mirror`, a slow restore no longer loses the stored document:** a
  key-value or kernel mirror holds each write until the Model has taken in
  what `restore` answered. Before, the write Subscription started from the
  initial Model and, once the throttle passed, replaced or deleted the stored
  slice while the restore was still reading it. The hold is per runtime and
  applies again on every restore; a failed read counts as an empty store.
- **`foldkit-mixins`, `Inert.missingTokens` reads inline styles:** a
  `var(--fk-…)` in an inline style value is reported when nothing defines it,
  as a compiled rule's read already was; a token set inline still counts as
  defined.

- **`foldkit-remote`, query payloads in one response:** `Data.query(Query,
  input, { select })` sends the selection with the query, and the server
  returns the selected fields of the page's items with the edges. One
  `ConnectionMerged` merges the page and writes the fields, so a fresh list
  lands `Ready` without a second read. Edges-only servers still work: no
  selection sent means edges only, and absent entities read as empty. The
  shared requirement reader is exported as `RemoteServer.readHelper`, so a
  custom handler answers the same settled-fields payload.

- **`foldkit-remote`, `Data.meta(model, projection)`:** when what is shown
  was last received (`updatedAt`, newest server write among it, `undefined`
  when nothing shown was received), and whether any of it is stale or
  loading. Pure, for "updated 5s ago" without I/O.

- **CMS example, one studio application:** posts and pages share a document,
  a runtime and an address (`examples/cms/src/apps/studioApp.ts`); moving
  between them swaps no application. Each section keeps its Model, update,
  view and subscriptions (its Remote domain folds its own Messages); a
  same-document navigation carries the address's query into its target.

- **`foldkit-mixins-form`, `FormView.fields(form, { overrides, styles })`:**
  the whole form as `define` draws it, with per-key overrides and styles, plus
  one flat key's control for a layout the caller owns. Keys with no override
  render by kind, so a new key of a known kind needs nothing new; unknown
  keys are type errors. An override receives the control, field, id, validity,
  errors and Messages, with any `h`.

- **`foldkit-primitives/net`, the socket reads itself:** the WebSocket bundle
  tracks `opened` beside `status` and `lastError`, words its own errors
  (`Failed to connect to WebSocket` before it opened, `Connection error`
  after, `Connection timeout`, `Socket unavailable`), and derives `SocketView`
  (`Disconnected`/`Connecting`/`Connected`/`Error`) from the socket and
  whether the page still wants it, with `isOpen` gating sends and frames. A
  page keeps one `wantConnection` boolean instead of a connection state
  machine; `foldkit-websocket-chat` is the first caller.

- **`foldkit-mixins-ui`, `Button.view({ label, style, ... })`:** a button
  drawn as a button in one call (label, style, `type`, `disabled`, `onClick`),
  without the `UiButton.view` → `Button.toView` → `h.button` ceremony.
  `toView` stays for buttons drawn as something else.

- **`foldkit-remote`, `Data.satisfy(model, actives, { passes? })`:** the Model
  with everything the active Surfaces read, for a render that fetches nothing.
  It prefetches each Surface that plans a read, cache-first, pass after pass
  until a pass plans nothing, so a read that depends on another (a page's
  Blocks on its document) is made too. Past the bound (8 passes) it fails with
  `RemoteUnsatisfied`, naming the Surfaces still reading.

- **`foldkit-ssr`, `SSR.plan({ meta: model => Meta })`:** what a page says of
  itself to a search engine and a link preview (description, `og:*`,
  `twitter:card`, `article:*`, `robots`, alternates, JSON-LD), from the Model.
  The render writes it before `</head>`, escaped, and checks it like the view;
  `SSR.hydrate` replaces it as the Model changes, so a move to another post
  updates its description. `SSR.page` and `SSR.entry` now refuse a render that
  sets `canonical` or `ogUrl` into a template without the tag Foldkit fills,
  which Foldkit would otherwise leave out silently. The CMS example's
  hand-built head is now its plan's `meta`.

- **`foldkit-ssr`, `styles` for the first paint of a served page:**
  `SSR.render`, `SSR.entry` and `SSR.handle` take `styles: rendered =>
  string`, carried as the rendered root's last child where no template head
  can take it. Hydration adopts the nodes around it and drops it on its first
  patch; styles for a void root are refused with `VoidRootWithStyles`. The
  `foldkit-ssr` example ships its stylesheet this way again, as `SSR.generate`
  pages do in the head.

- **`foldkit-ssr`, `SSR.sitemap(pages, { origin })` and
  `SSR.robots({ origin, sitemap?, disallow? })`:** a generated site's sitemap
  (each page's full address, its `modified` date as the UTC day) and the
  `robots.txt` naming it. A duplicate path, a relative one, or a date `Date`
  cannot read is refused. The CMS example drops its own `sitemapOf` and
  `robots`.

- **`foldkit-bundle`, `onMessage`:** a placement's `onMessage` (and
  `(message, key)` on a collection) observes each child Message as a parent
  Step after the child and its `onOut`; `placements.update(own)` types `own`'s
  Message without the placements' wrappers (`Bundle.OwnMessage`).
- **`foldkit-bundle`, Links for `Update.foldChild`:**
  `Link.wrapper(Message.GotXMessage)` builds a wrapper from a variant the union
  already declares, and `Link.field` / `Link.optional` writes return the parent
  when the child is unchanged, so `Update.foldChild({ ...link, update })` no
  longer redraws for a Message the child ignores. `foldkit-ui-showcase` folds
  its 38 components this way. `Link.foldInit(link, rest)` is what
  `Update.foldChildInit` takes: the Link's `toParentMessage` with a
  `toParentModel` that writes the child into the rest of the parent.

- **`foldkit-primitives/time`, `ticks({ intervalMs, onTick })`:** a clock
  entry whose running and interval are functions of the parent Model; a new
  interval applies from the next tick without a restart. Timer and Interval
  are built on it.
- **`foldkit-primitives`, `keyboardEvents({ preventDefault })`** cancels the
  default of the presses a predicate over `KeyPress` picks, decided in the
  listener.
- **`foldkit-primitives`, websocket:** `Sent` carries `{ data }`, and an
  optional `connectTimeoutMs` closes a socket still connecting and reports the
  new `TimedOut`.
- **`foldkit-primitives`, `History.goTo(model, step)`** and the bundle's
  `GoTo { step }` jump to any kept step.

- **`foldkit-mixins`, slots declared by their style:** `Style.slots(pieces)`
  declares an application's own Slots from their styles and returns
  `{ slots, style }`; `Style.slot(options, piece)` gives one a capability,
  events or attributes. `forSlots` stays for a contract someone else published.
- **`foldkit-mixins`, short pieces:** wherever a piece is taken, a
  declarations object means `Style.self` and a list means `Style.compose`.
- **`foldkit-mixins/app`:** `AppStyle.make({ palette, colorScheme?, global? })`
  fixes the theme, the `app` layer and the page stylesheet once, giving `t`,
  `L`, `slots`, `forSlots` and `stylesheet`.
- **`foldkit-mixins/utilities`:** `Utilities` (`p`, `px`, `gap`, `text`,
  `font`, `rounded`, `color`, `bg`, `flex`, `truncate`, …) are pieces over the
  `Theme.tokens` scales and `Theme.oklch` names, so a step the scale lacks is a
  type error.
- **`foldkit-mixins`, `Style.install(css)`** puts a stylesheet in the page's
  head once and returns the element.
- **`foldkit-mixins/testing`:** `Inert.draw` draws views that use
  `h.submodel`; `Inert.css(nodes)` and `Inert.missingTokens(root, stylesheet)`
  replace the checks every view test wrote by hand.

- **`foldkit-mirror`, `Mirror.bootstrap` and `mirror.bootstrap(keys)`:** a
  first-class pre-init seam. When a store's keys are already in hand at boot
  (Flags the server embedded, a synchronous read, a test fixture),
  `Prefs.bootstrap(keys)` folds them into the initial Model before the first
  render — the same conservative read `reduce` applies to a `MirrorRestored`,
  with no Command and no flash — and `Mirror.bootstrap(initial, ...steps)`
  composes store steps with the URL step (`model => Filters.reduce(model,
  url)`), keeping URL > store > initial. This is deliberately not part of
  `Wiring`: a bootstrap runs inside `init` before the Model exists, while
  `Wiring.init` runs startup Commands (such as `restore`) after it.

- **`foldkit-mirror`, `Mirror.routing`:** `Mirror.routing({ mirrors,
  urlChanged, init, update, routing })` returns `init`, `update` and `routing`
  for `Runtime.makeApplication`. URL mirrors read the starting URL and each URL
  Message before the application's own `update` routes it; its `onUrlRequest`
  and `onUrlChange` pass through unchanged. `foldkit-query-sync` uses it.

- **`foldkit-ssr/client`, a browser entry:** `SSR.plan`, `resume`,
  `hydrate`, `static`, `serving`, `Resume` and the attribute names (including
  `FOLDKIT_APP_ATTRIBUTE`), importing nothing from
  `foldkit/experimental/server`: about 200 kB minified (60 kB gzip) less on a
  hydrating page. `foldkit-ssr` still exports everything.

- **`foldkit-mixins-ui`, `toView` on every adapter:**
  `X.toView(mixins, { h }, draw)` fills a component's `toView` slot and hands
  `draw` the bundles with the Mixins applied, in a component's `view` or a
  Submodel's `viewInputs`. `resolve` stays for bundles already in hand, and its
  `input` is now optional. Every adapter exports its result type
  (`ResolvedButton`, `ResolvedInput`, `ResolvedRadioGroup`, …), and
  `Textarea`'s `textarea` bundle is typed for `h.textarea`, so no cast.

- **`foldkit-form`, validating without submitting:**
  `Message.ValidatedAll()` validates every key and row as a submit would and
  submits nothing; `form.isValid(model)` says whether a submit now would hand
  over the value at once (unlike `canSubmit`, a running or unrun check is not
  valid). A nested row's Message that changes nothing keeps the parent Model
  by identity instead of rebuilding its rows, so a no-op in a row renders
  nothing.

- **`foldkit-mixins-form`, a check running and a submit in flight:** a key
  whose check runs shows a `Checking…` line in the new `checking` Slot
  (`role="status"`, named in the control's `aria-describedby`, words
  `words.checking`), and each field's `root` carries `data-validation` with
  its state. While a submit waits for a check, or the new view input
  `submitting` says the application's request is in flight, the `form` is
  `aria-busy` with `data-submitting` and the submit button is disabled and
  reads `words.submitting` (default `Submitting…`).

- **`foldkit-bundle`, a shared tag reaches everyone who shares it:** a Message
  tag wirings declare `shared` is folded by each of them in list order, and
  the parent's own update sees it after them. Before, the first claimant took
  it: of two URL mirrors only the first read the URL, and an application with
  a URL mirror never saw its own `UrlChanged`, so it could not route on it.

- **`foldkit-mixins-crud`, loading told from empty:** a list's or a detail's
  `status` line is `aria-busy` while the first answer is awaited, as the table
  already was while refreshing, so a style can draw a quiet placeholder for
  loading and keep its empty state for empty.

- **`foldkit-agent`, correlating by the call:** a completion's `correlate`
  receives a third argument, `{ invocation }` (type `Correlation`), so a fact
  that carries the invocation's id from `toMessage` is told apart where the
  input is not. The todo app and the root README's example completed `add_todo`
  by matching the trimmed title, which mixed up two todos of one title; they now
  pass `requestId: invocation.id` through `RequestedTodo` to `SubmittedTodo`.

- **CMS example as a static site:** `pnpm --filter foldkit-example-cms
  build:sandbox` builds the studio and the public site with the same server
  running in the page, on SQLite compiled to WebAssembly (`sql.js`), so it
  deploys with no backend. Each visitor's sandbox is kept in the browser's
  storage; `?reset` starts afresh. The server takes its database
  (`openServer(clock, sqlite)`), and one endpoint module answers requests for
  both the HTTP server and the page.
  On a phone the studio's sidebar is a top bar (the brand and who is looking,
  then the sections in a row), the editor's bar wraps its actions under its
  status, the builder's panels scroll within a short height so the page
  shows, and a post list's cards fit a narrow canvas. The posts open with what
  the demo is and what to try, and the page says it is starting while the
  sandbox opens. The address keeps the open post, the search and the Archive
  tab, as it kept the open page, so a reload lands where one was, and opening
  or closing a post or a page is a step Back returns from. A page has its History
  and More (discard, unpublish, archive) under a fold below the editor's bar,
  as a post has them in its aside. The History is a timeline: each revision
  with its date, time and publisher, the newest marked Live while it is on the
  site, and Restore offered only where it would change something. Moving
  between the studio's sections and the site no longer paints white: the
  foundations' stylesheet is in the HTML. A wait says "Loading…" only once it
  is noticeable, an entry being read shows no "New" badge, and the pages list
  no longer says "Nothing yet." before it is read. A new screen starts at the
  top and Back, Forward or a reload return where it was. A chair's avatar is
  centred in its touch target on a phone. The page builder shows its panel
  tabs at every width it stacks at: an editor between 52rem and 64rem wide
  (a 1280px window's) stacked every panel above the page with no tabs, so a
  new page seemed to open without one. The address keeps a post's preview and
  the Builder's panel and preview width, so a reload comes back to them, and
  the worklist's search and tab go through a `foldkit-mirror` URL mirror
  (`?archive=true` where it was `?archive=1`). The blog's eight posts explain
  how the demo is made (the CMS, the page builder, Composition, Form, Crud,
  Entity and Remote, and the styling), and a post's body can hold headings,
  lists and code. The site links to the demo's code on GitHub, and a
  published sandbox kept from the earlier seed is replaced by this one. A new
  post or page is in the address (`new=<id>`) from the moment it is started,
  so a reload comes back to it; its first save turns that into its own key.
  The public site is rendered at build time with `foldkit-ssr`: each
  published page and post is HTML with its text, styles, description, link
  preview, canonical address and article facts, beside a sitemap and
  `robots.txt`. The browser takes a generated page over without drawing or
  reading it again, while the visitor's sandbox still holds the seed. The
  studio is `noindex`. Moving between the studio's Posts and Pages no longer
  reloads the page: the two applications share one document and swap in
  place, keeping the loaded code and the in-page server, about 60 ms a move
  where a load took 220 (and 0.8–1 s on a slowed CPU).

- **Dropping a palette tile on the page's own space:** `PointerDrag`'s facts
  for a drag onto `targets` carry `region`, whether the pointer is inside the
  region, so `over: null` with `region: true` is its empty space.
  `foldkit-builder` gains `DraggedOverPage()`, which lands a tile where a
  press with nothing selected would put it, and `foldkit-mixins-builder` sends
  it; a tile dropped on an empty page, or below the last node, added nothing.

- **`foldkit-primitives`, `FollowTabStop`:** a Mount keeping focus inside a
  container of roving tab stops on its stop, when a transition it did not see
  moves the stop or removes the focused descendant. `TreeNavigation`'s
  Behavior attaches it, so the Builder's layers keep focus through a
  duplicate, a paste or a delete made by key, where focus stayed on the old
  row or fell to `<body>`. **`foldkit-builder`** moves `layers.current` off a
  removed node to the one after it, else before it, else its holder, rather
  than leaving it for the first row.

- **`foldkit-cms`: `Cms.Display.State`'s words include `withSchedule`**
  (`'{state}, {schedule}'`), where a state and its schedule were joined by a
  comma no application could word. A display renderer's context types its
  words as `DisplayWords`, where it had `any`.

- **`foldkit-builder`: its words.** `Builder.make(name, { words })` takes any of
  `EditWords` over `editWords`: what it announces of each edit, its commands'
  labels, and the refusals it makes itself, as text with blanks
  (`'Moved {label}{at}'`); `refusal` words those `apply` makes (`{code}`,
  `{message}`). Announcements name a Block by its label, not its stored name.

- **`foldkit-mixins-builder`: the editor's words.** Every word the drawn
  Builder shows of its own is one of `BuilderWords` (English defaults in
  `builderWords`), given as the view input `words`. Words are text, a value
  a blank in them (`'Add {label}'`), since a view input may hold no nested
  function. `keysOf` takes them, for the named keys (`keyNames`) and Ctrl,
  Alt and Shift, and no longer reads `Object`'s own names for a key called
  `constructor`. A look's blank choice now reads "Default", as its buttons do.

- **`foldkit-mixins`: parts, each drawn again only when what it reads
  changed.** `SlotView.parts(Slots)<Input, Message>()` makes parts that name
  the input keys they read and are given only those; `assemble` places them.
  `slots.row.lazy(item, draw, args)` draws one repeated item again only when
  its arguments or what the Mixins gave it changed. Over 1,000 nodes, a
  hover, a selection and a keystroke in the inspector each went from about
  50 ms to the next frame.
- **`foldkit-mixins-builder`: the editor as parts.** `BuilderView.parts(builder)`
  gives `Panels`, `Palette`, `Layers`, `Inspector`, `Toolbar`, `Crumbs`,
  `Viewports`, `Preview`, `Alert`, `Canvas` and `Live`, each with its own
  Behaviors; `BuilderView.assemble(render)` places them among an
  application's elements, and `define` is the default layout.
- **`foldkit-builder`: the inspector is a form.** A node's props, and the
  input of the action each event runs, are edited through `foldkit-form`
  forms of the Block's settings (`settingsOf`, `inputOf`), drawn by
  `FormView`, so a prop gets the control a form would give it, a value that
  does not decode shows its error and edits nothing, and a control of the
  application's own (`Input.bundle`, such as a color picker) works with no
  Builder code. `BuilderView.define(builder, { settings: { field, form,
  renderers } })` styles the forms and draws the application's control kinds.
- **`foldkit-composition`: a Block's words are its own.**
  `Block.words({ label, description, group })` names a Block and says what it
  is for; the palette, the layers, the inspector, `Catalog.describe`,
  `Composition.describe` and the agent's `operationSchema` all read it.
- **`foldkit-primitives/dom`: `Measure`**, a Mount that writes where marked
  elements are (`--fk-<name>-x/-y/-w/-h/-display`) for an overlay drawn over
  them. The drawn Builder's selection and hover are boxes placed this way.
- **`foldkit-builder`: one table of commands.** `PageBuilder.commands` (`{ id,
  label, keys, placement, run }`) is every key, node action, toolbar button
  and shortcut listed; `keyCommand` is derived from it and `Builder.make`'s
  `commands` changes it. Keys are written for the author's platform
  (`BuilderView.inputs({ platform: 'mac' })`).
- **`foldkit-builder`: a Block dragged from the palette** is added where it
  is dropped (`DragSource` is `Existing` or `New`). **`foldkit-primitives`:**
  `PointerDrag` takes `targets: { attribute, within }`, so a drag may land on
  another region's elements.
- **`foldkit-builder`: copy, cut and paste.** A node and all it holds is kept
  in the Model's `clipboard` and on the system clipboard as tagged JSON; a
  paste reads it back (`readText`, new in `foldkit-primitives/dom`), decodes
  it strictly, gives every node a new id and inserts it whole or refuses it.
- **`foldkit-composition`: Patterns.** `Catalog.make({ patterns })` holds
  arrangements of Blocks, checked where the Catalog is made;
  `Op.usePattern({ pattern, ids, at })` inserts one, and `operationSchema`
  offers each with exactly its ids. The drawn palette offers them in a group
  of their own.
- **Text edited in place.** A Block's view draws a text prop with
  `field(key)`; the editor edits it on the canvas, frozen at the text it had
  when editing began so no redraw moves the caret, one undo step per session
  (`History.close` and `History.revert`, new in `foldkit-primitives/state`).
  `EditableText`, new in `foldkit-primitives`, reads what is typed as text,
  once per composition, and `Renderer.fields` says which props a node draws
  this way.
- **`foldkit-mixins`: container breakpoints.** `Style.responsive` takes an
  at-rule as well as a media query, `Theme.inContainer(name, breakpoints)`
  writes a theme's breakpoints on a named container, and `Style.at(prelude,
  piece)` puts a selector under an at-rule. The Builder's frame is the page's
  container (`PAGE_CONTAINER`), so a look written this way follows a narrow
  preview in a wide window.
- **`foldkit-mixins-builder`: a narrow editor.** `BuilderView.narrow(width)`
  shows one panel at a time, chosen by a group of pressed buttons, below that
  width of the editor itself.

- **`foldkit-mixins`: a Style's rules arrive with the Slot that draws them.**
  Compiling a Style records each class with its CSS; in a browser, a class a
  Slot draws is appended once to one `<style data-foldkit-styles>` element
  (made only when there is something to add, declaring the standard layer
  order unless the page declares its own), unless a stylesheet on the page
  already carries it. A Style left out of an application's `Style.stylesheet` now
  draws instead of silently drawing nothing. `Style.stylesheet` is unchanged.
- **`foldkit-mixins`: `Style.usedIn(html)`**, the CSS of every compiled class a
  page's markup uses, after the layer order: what a server puts in the head.
  **`foldkit-ssr`:** `SSR.page`, `SSR.generate` and `SSR.entry` take
  `head: rendered => string`, put before the template's `</head>` (a template
  without one is refused when there is something to add; `SSR.entry` refuses it
  when it is made, and answers a `head` that throws `500`).
- **`foldkit-composition/foldkit`: `Renderer.render` draws a node again only
  when what it reads changed.** Inside a runtime render, each node's drawing is
  memoized on its node object, drawn children, read, visibility and marks, so
  an edit redraws the node it touched and its ancestors, and an unrelated Model
  change redraws no node. Each node's element is keyed by its id (the edit
  wrapper, or the Block's root in view mode unless the Block set a key).
- **`foldkit-mixins/testing`: `Inert.draw`, `unslotted`, `fixedInline` and
  `bySlot`,** which check a package view's customization contract: every
  element it draws comes from a Slot, however deeply its views nest, and no
  fixed declaration is inline. They found markup outside any Slot in three
  packages, now Slots of their own: `foldkit-mixins-builder`'s `selectOption`,
  `foldkit-mixins-form`'s `option` and `choiceLabel`, and
  `foldkit-mixins-crud`'s `head`, `headRow` and `body`.
- **`foldkit-mixins/testing`: `Inert`, queries over a view drawn with the
  inert builder** (`all`, `children`, `byTag`, `byRole`, `byLabel`, `text`,
  `value`, `classes`, `style`, `pressed`), replacing a tree walker seven test
  files each defined, and the casts to hand-written node types that came with
  them.
- **Fixed declarations are rules, not inline styles**, so a later layer can
  override them: `Prose.style`'s measure and line height (with a new `leading`
  option), `Style.grid`'s template and areas, and `Style.stagger`'s delay (its
  `--fk-index` stays inline). The drawn Builder's frame writes
  `--fk-frame-width`, read by a default rule in `components`.
- **`foldkit-mixins-builder`: what the editor calls a Block.**
  `Block.words({ label, description, group })` (now in `foldkit-composition`) names a
  Block, says what it is for, and files it in a palette group. The palette is
  grouped; each button is named "Add <label>", shows the description, and is
  titled with where it would go ("Adds it inside the Section") or why it
  cannot. A layer row shows the label and the node's first text in brief, and
  a row that holds others has a toggle. New Slots: `paletteGroup`,
  `paletteHeading`, `paletteLabel`, `paletteHint`, `rowToggle`, `rowLabel`,
  `rowSummary`; palette buttons and rows carry `data-block`. A palette button's
  text is now the label, not `Add <Block>`: find it by its accessible name.
- **`foldkit-mixins-builder`: the inspector in parts.** It opens with the
  selected Block's label, description and actions (now drawn there, each
  titled with its shortcut and carrying `data-action`), then its settings under
  Content, Style, Visibility and Interactions. A look of up to four values is a
  row of buttons, one pressed, instead of a `select`. Labels are the key spaced
  when there is no `title` ("Text", "Shown when audience is", "On press"), and
  viewport buttons read "Wide", "Medium", "Narrow". With nothing selected it
  says how to begin and lists the shortcuts. New Slots: `inspectorHead`,
  `inspectorTitle`, `inspectorHint`, `inspectorSection`,
  `inspectorSectionTitle`, `choices`, `choice`, `shortcuts`, `shortcutKeys`,
  `shortcutWhat`, and `label` and `option` for a field's name and a
  many-choice picker's choice, which were drawn outside any Slot.
- **`foldkit-builder`: Escape deselects** in `keyCommand`.
  **`foldkit-mixins-builder`** takes the shortcuts on the canvas as well as the
  layers (the canvas is now focusable), and draws a breadcrumb of where the
  selection is (`crumbs`, one `crumb` button per node holding it, the page
  first, the current one `aria-current="location"`).
- **`foldkit-mixins-builder`: pointing at a layer row marks its node** on the
  page (the Builder's `Hovered` and `Unhovered`), and an empty page says how to
  begin, in the new `empty` Slot.
- **`foldkit-surface`: `Action`, a named capability that ends in a Message.**
  `Action.define({ name, description, input, toMessage })` declares one, and
  `Action.run(action, data)` decodes the data as its input before making the
  Message, so stored or untrusted data never executes.
- **`foldkit-agent`: `Agent.action(action, { available?, authorize? })`** exposes
  an Action as a variant, under the tag of the Message it makes; another tag is
  a type error, and a dispatch through one is refused. `Agent.variant` is
  unchanged.
- **`foldkit-form`: `Input.bundle`, a control with a Model of its own.** A key's
  draft can now be a Bundle's Model, such as a color picker with a popover, a
  page builder, or a rich-text editor. `Input.bundle(kind, { bundle, value, fill, settled? })`
  says how the key's value is read from the Model and written into it. The
  Bundle's Messages travel as the form's new `Control` Message
  (`form.control(key).send`), its Commands answer as `Control` Messages, and
  its Subscriptions and Resources become the form's, keyed under the key. A
  Message is an edit, validated and counted by `authoredChanged`, only when it
  changes the key's value. `model.fields[key].value` is typed as the Bundle's
  Model. The Bundle may have no OutMessage and need no services, the key takes
  no `check`, and a nested form whose control has Subscriptions or Resources is
  refused.
- **`foldkit-mixins-form`: draws a control backed by a Bundle** with the
  Bundle's own view inside a new `control` field slot, unless a renderer names
  its kind. A renderer receives `bundle: { model, send }`, wrapped for its row
  inside a nested form.
- **`foldkit-cms`: the editor runs a form control's Subscriptions and
  Resources** while an entry is open, and stops them when it closes.
- **`foldkit-composition` (in development, not published): what a page is,
  as data.** `Block.define` declares what may exist (a props Schema, Regions,
  the Content it provides), `Catalog.make` gathers a context's Blocks and
  roots, and `Composition.Document` is the tolerant codec of a stored page: any
  Block name, props as JSON. `Composition.validate` reports ten kinds of
  finding, from a missing node to a Region that rejects a child, and
  `Composition.valid(catalog)` asks the same as a Schema check for an operation
  that publishes. `index`, `describe` and `Catalog.describe` read a Document
  and a Catalog. `Composition.apply` edits a Document by Operations (insert,
  insert a tree, remove, move, duplicate, set and unset a prop, the reserved
  fields, a batch), refusing what an Operation would cause with no partial
  result, and never minting an id itself. `History` keeps undo snapshots,
  grouped without a clock. `Composition.migrate` moves stored pages forward
  through named migrations (`renameBlock`, `renameProp`, `promoteUnknown`, or
  one of your own), each rewriting a node or declining, and throws when one
  breaks the Document's structure. `foldkit-composition/foldkit` draws a
  Document with one ordinary Foldkit view per Block (a Block without one is a
  type error), placeholders for what cannot be drawn, and an edit mode that
  marks each node; the same Renderer draws inside a `foldkit-ssr` static
  region, so a served page sends none of the Document. `Url` refuses
  `javascript:` and every scheme but http, https, mailto and tel.
  `foldkit-composition/richtext` holds a rich-text body checked against its
  Kit. Phases 1 to 4 of the page builder design.
- **`foldkit-builder` (in development, not published): the page builder's
  state.** `Builder.make(name, { catalog, renderer, starters })` gives a Bundle
  that edits a composition Document by Operations, mints new ids in a Command,
  keeps a selection and undo History beside the page, and records why an edit
  was refused. `builder.input` places it as a form key's control, so the page is
  the key's value, a selection is not an edit, and a fill starts undo over. Its
  plain view (palette, layers, text props, undo, the page in edit mode) is drawn
  by `foldkit-mixins-form` with the rest of the form. Phase 5 of the page
  builder design.
- **The CMS example builds a page too.** A Page content type whose `document`
  key is the page Builder goes through the post's whole story: autosave, a
  resumed draft, a preview drawn by the site's own views, publish, revisions,
  restore, a schedule and a conflict, with no CMS state added. Phase 6 of the
  page builder design.
- **`foldkit-builder`: the keyboard, the layers and announcements.** The
  Builder places `TreeNavigation` and `LiveAnnounce` in its Model; moving focus
  in the layers selects the node. `keyCommand(model, key, modifiers)` gives the
  shortcuts: Alt with the arrows moves the selected node among its siblings,
  out of its parent or into the node above; Mod+D duplicates; Delete removes;
  Mod+Z, Mod+Shift+Z and Mod+Y undo and redo. Structural edits, undo, redo and
  refusals are announced to assistive technology. A selection made anywhere
  else, such as an insert or a click on the page, is where the layers' keys
  start from. `offered` lists the Blocks the palette offers, and
  `inputWith(view)` is the form control drawn by another view.
- **`foldkit-mixins-builder` (in development, not published): the page
  Builder, drawn.** `BuilderView.define(builder)` draws a palette, the layers
  as an ARIA tree, the selected node's actions and props, undo and redo, a
  viewport picker, a refusal as an alert, a live region, and the page in edit
  mode through the site's own Renderer. Every element is a `BuilderSlots`
  Slot. The layers take `TreeNavigation` and the Builder's shortcuts, and the
  canvas takes `Targets`, so hovering and clicking the page mark and select
  its nodes. It adds no state and no Messages. The CMS example's page form
  draws its Builder this way. Phase 7 of the page builder design.
  The inspector labels a prop with its Schema's `title`, and a Block asks for a
  prop's control with `Block.annotate(Builder.controls({ ... }))`, such as
  `Input.multiline()`, or `Input.hidden()` to leave it out. A row in the
  layers or a node on the page can be dragged onto another with the pointer:
  the Builder's `drag` says where a drop would land (`dropAt`), the target is
  marked only where the page allows it, and a drop is one undoable, announced
  move.
- **`foldkit-composition`: appearance.** A Block offers appearance axes, each a
  list of variant values or token names, and `validate` and
  `Op.setAppearance` check a node's stored names against them
  (`composition:invalid-appearance`, `composition:unknown-token`). The new
  `foldkit-composition/appearance` subpath makes a look from a
  `foldkit-mixins` slot recipe and theme tokens: `Appearance.attach(look)`
  gives a Block its axes, `look.draw({ appearance, h })` gives its view the
  Slots with the chosen Style attached, every piece compiled once, and
  `look.styles` is the stylesheet. A Renderer's views receive `appearance`,
  the choices the Block offers. The drawn Builder's inspector chooses them.
  A token axis given `breakpoints` is responsive: a node stores
  `{ base: 'sm', md: 'lg' }`, drawn as rules the widest matching breakpoint
  wins. `look.draw({ appearance, h, with })` attaches a Block's own Behaviors
  after the look, and a style property a Behavior owns that a choice also sets
  is `mixins:style-property-conflict`. A layout Block is a Mixins layout this way: the test site's Columns is
  `Layout.switcher`, with its ratio, when it stacks, and its gap as choices.
  Phase 8 of the page builder design.
- **`foldkit-composition`: `operationSchema(catalog)`,** the Operations a
  Catalog's pages take as a Schema, inserts naming only its Blocks with their
  stored props, for an agent tool's input. The CMS example's page agent edits
  a page through the Builder's own `Applied`, undoable like any edit, and a
  Block outside the Catalog is refused by the tool's schema.
- **`foldkit-composition`: actions.** A Block names its events, a Catalog lists
  the actions its pages may reference (`foldkit-surface` Actions), and a node
  stores which action an event runs with literal input. `validate` and
  `Op.setAction` check them (`composition:invalid-action`,
  `composition:unknown-action`), and a Renderer's view gets `on(event)`, the
  Message the action makes from input its Schema decoded first;
  `Renderer.forMessages` checks it routes every such Message, and a
  `Renderer.make` view, such as an editor's canvas, gets none. The drawn
  Builder's inspector picks each event's action and edits its input.
- **`foldkit-composition/surface`: Surface Blocks.** `SurfaceBlock.define`
  places a `foldkit-surface` Surface where an author puts it, with params from
  its props; `SurfaceBlock.reads` and `SurfaceBlock.active` read the page's
  Surface Blocks as a Query Block's reads are, and `value(data)` reads a node's
  typed.
- **`foldkit-composition`: stateful Blocks.** A Block marked `stateful` is
  backed by a Bundle the page's parent places once per node, keyed by its id.
  `Composition.statefulNodes` lists them; `Stateful.sync` (in `/foldkit`) keeps
  a placed collection in step with the page shown, adding, removing, and
  starting again a node whose props changed; `Stateful.views` and
  `Stateful.html` draw each node with its own item.
- **`foldkit-form`: a title given before a check names the key.** Effect
  resolves a checked schema to its last check's annotations, so
  `Schema.String.annotate({ title }).check(...)` lost its label; the form now
  falls back to the schema's own annotations.
- **`foldkit-composition`: a Query Block gets its own window,** cut to its
  `first` even when another read of the same query loaded more rows.
  `Composition.valid` describes itself with `expected`, not a `title` a form
  would take for the field's label.
- **`foldkit-cms-drizzle`: a publish patches the whole row back,** as the
  handler left it, so the author's own screen shows what was published without
  the handler returning a patch.
- **`foldkit-mixins-builder`: an optional relation prop stored as `null` and
  decoded to an `Option`** (`Schema.OptionFromNullOr`) offers its blank: the
  inspector asks the stored side.
- **`foldkit-mixins-ui`: `Recipes.Button` on a link** is not underlined.
- **`foldkit-cms`: `placed.storedEntry(model)`,** the entry the server knows, as
  an `Option`: none while something new is not saved yet, so a link names only
  what exists.
- **`foldkit-mixins-builder`: relation pickers for Block props.** A prop asks
  for `Input.relationOne(Entity)` or `Input.relationMany(Entity)` through
  `Builder.controls`, and its choices come in `BuilderView.inputs({ options
  })`, keyed `'Block.prop'`.
- **`foldkit-form`: `Input.relationOne` and `Input.relationMany`,** a picker for
  a key that holds ids without being a relation.
- **`foldkit-mixins-form`: a Bundle control's view takes inputs,** from the
  form view's `controls`, by key. A key given none draws its view as before.
- **`foldkit-mixins-builder`: the canvas draws the page's data.**
  `BuilderView.submodel` takes `BuilderView.inputs({ data })`, each node's read,
  which the page's parent gives through the form's `controls`, so a Query or
  Surface Block on the canvas shows its rows. `builder.inputWith` accepts a
  view with inputs; `QueryBlock.active` and `SurfaceBlock.active` type what they
  read.
- **`foldkit-composition/remote`: Query Blocks.** `QueryBlock.define` makes a
  Block that names a `foldkit-remote` query and derives its input from props;
  `QueryBlock.reads(Data, catalog, document)` is the page's reads as one
  Projection keyed by node, fetched and resumed by Remote like any read; the
  Renderer hands each node its `data`, and the Block's `rows(data)` reads it
  typed. `QueryBlock.active(name, App.owner, Data, …)` is the read as an active Surface, so a
  server-rendered page resumes it with `Remote.resume`. The CMS example's pages can list the site's pages. Phase 9 of the
  page builder design.
- **`foldkit-composition`: conditions.** A Catalog may declare a `context`
  Schema (an audience, a locale, a flag), and a node's `when` is a list of
  conditions over it, `eq`, `isNull`, `isNotNull` and `contains`, meant as
  `foldkit-entity`'s `Expr` means them. `validate` and `Op.setWhen` check them
  (`composition:invalid-condition`, `composition:unknown-context`), and
  `Renderer.render` takes the `context`: a node whose `when` fails is left out,
  or marked `data-composition-hidden` in edit mode, and a page drawn without
  its context fails closed. `Composition.holds(when, context)` is the test.
  The Builder keeps what the author previews the page as (`preview`,
  `PreviewChosen`), and the drawn Builder offers a "Preview as" picker, draws
  the canvas for it, and edits a node's conditions in the inspector.
- **`foldkit-composition/foldkit`: the edit wrappers carry the marks.**
  `render` in edit mode takes `selected`, `hovered` and `drop`, and puts
  `data-composition-selected`, `data-composition-hovered` and
  `data-composition-drop` on those nodes' wrappers, so an editor's CSS draws
  the selection and where a drop lands. A node whose view throws is a
  placeholder, as a node that cannot be drawn is.
- **`foldkit-primitives`: `PointerDrag`, dragging one marked element onto
  another.** A Mount and a Behavior on a container: a press that moves past
  4px starts a drag, the element under the pointer is reported with the third
  of it the pointer is in (`before`, `inside`, `after`), and a release drops
  or Escape cancels. It writes no roles or keys, so it works on a tree's rows
  as on a canvas, and it swallows the click a drop ends with.
- **`foldkit-primitives`: `TreeNavigation`, keyboard navigation of a tree.**
  After the WAI-ARIA tree pattern: Up and Down through the rows showing, Right
  opens or steps in, Left closes or steps out, Home and End. Rows are given in
  tree order with their parent; openness is stored as what was toggled away from
  `openByDefault`. Its Behavior writes the tree's ARIA attributes and a roving
  tab stop. For a file explorer, a page's layers or a nested menu.
- **`foldkit-primitives`: `Targets`, which marked descendant is under the
  pointer or was pressed.** One Mount on a container reports `TargetHovered`
  once per change and `TargetPressed` with its modifiers, for the nearest
  descendant carrying a marking attribute, and can stop a press's default.
- **`foldkit-primitives`: an undo `history` groups steps.** A `Push` may name
  a `group`, and consecutive pushes of the same group are one step, so typing a
  word undoes as a whole without a clock. The steps are exported as pure
  functions (`History.start`, `push`, `undo`, `redo`, `clear`) for a parent
  that records an edit in the same transition that makes it. **Breaking** for
  code that builds a `HistoryModel` by hand: it gains `group`, `null` for none.
- **`foldkit-builder` keeps its page in that history:** its Model's `page` is a
  `foldkit-primitives/state` history whose present is the Document
  (`builder.document(model)` reads it), and `foldkit-composition` no longer has
  a History of its own. Undo is one mechanism in the repository, not two.
- **`foldkit-ssr`: its build configuration references the packages it builds
  from,** so another project can reference it.
- **`foldkit-ssr`: `SSR.render`'s result lists `unnamed`,** each element and
  event whose handler is a function the page cannot name
  (`{ element: 'button#point', event: 'pointerdown' }`). On a page that waits
  to boot, `SSR.entry` and `SSR.generate` warn about each once per process.
- **`foldkit-ssr`: `pnpm bench:manifest`** measures the resume manifest's size
  and decode time at 10, 100 and 1,000 rows; the SSR plan records the table.
  `pnpm bench:manifest:browser` times the same page in Chromium.
- **`foldkit-ssr`: the envelope lists the events its markers name,** and
  `Resume.listen` takes them as `events`, so a deferred page no longer reads
  every element's attributes to find them. The page's list of bindings is
  checked by hand rather than through a Schema. At a thousand rows, decoding
  and listening take 12 ms in Chromium, down from 22.

- **`foldkit-richtext`: `Replicated`, collaborative rich text without a CRDT.** A
  document state where every character has an identity: `translate` restates an
  edit as ops that name characters and blocks, `applyOps` folds them in any
  server order to the same state, `project` gives the editor a `Document`, and
  `anchor`/`resolve` keep a selection by its characters. `invert` gives the ops
  that undo an edit and nothing else. `translate`'s `continues` option and
  `coalesce` make a burst of typing one op, and a `Collect` op removes deleted
  text, in two phases, through the log. `examples/pages` wires it to Sync and
  Durable. Since: `RetypeContainer` retypes the caret's block in place,
  `unionChangeSet` unions held IME patches, `SetProps` is refused only when
  it would make valid props invalid, transactions carry their normalized
  `transactions`, and a cached `nodeIndex` answers block lookups.
- **`foldkit-richtext-dom`: `patchTo`, and an `overlay` Command** for
  decorations from application state, such as other people's carets.
  `patchTo` patches an externally replaced document without remounting (a
  remote keystroke keeps the caret), judging moved runs by both blocks;
  empty runs draw addressable spans, string data draws as
  `data-decoration-*`, input rules match on surrounding node kinds, and a
  non-moving transition keeps the Model by identity instead of clearing it.
- **`foldkit-richtext-markdown`, task items and tight lists:** `- [ ] ` at a
  list item's start makes it a task in place, and the printer records
  CommonMark spread, so tight items keep nested lists under their text.
- **`foldkit-richtext-code` and `foldkit-richtext-code-shiki`, first
  releases:** total JSON and Shiki grammars as tokenizers over the shared
  `syntax-*` kinds, for `codeDecorations` (the application owns the
  highlighter).
- **`foldkit-sync`:**
  - `Sync.fact`, which applies a durable fact in the intent's own transition.
  - `onReinstall` on `Sync.mount`.
  - `Sync.durable(message)`.
  - A contract's `coalesce`, which merges a burst into one unsent operation.
  - `Storage.append`, a one-row write per submit, with an IndexedDB outbox
    store.
  - Server push through `{ notify: true }` frames and `Transport.changes`.
  - Paged exchanges (`more`).
  - `transport.socket`, so presence shares the sync connection.
  - A presence `throttle`.
  - Server-reset recovery: a server's `epoch` goes back as `exchange`'s
    optional third argument, and a new one makes the replica rebuild from the
    server's answer and resend its outbox.
- **`foldkit-durable`:**
  - `Journal.cursor`, `read(key, after, { limit })` and `vacuum()`.
  - An in-memory snapshot with `snapshotEvery`.
  - `Journal.epoch(key)`.
  - A `replicaId` option that binds each replica to the actor of its first
    commit. Sync's `journalContract()` supplies it.

### Changed

- **`foldkit-primitives`, Timer and Interval's first tick** now comes one
  interval after `Started`, not at once. `History.push` keeps an already-empty
  `future`, so a view reading it is not redrawn per push. The new `TimedOut`
  and `GoTo` variants break a match over every variant.

- **`foldkit-mixins`, a branded `StyleValue` (breaking for hand-built
  values):** a `StyleValue` carries a brand, so a declarations object is never
  mistaken for one; `NamedStyle.pieces` and a `recipeFor` selection are
  `StyleValues`.

- **`foldkit-ssr`, Foldkit's config types:** `SSR.hydrate`, `render`,
  `generate`, `entry` and `handle` accept Foldkit's `makeApplication` config
  types; `routing`'s callbacks are checked against `update`'s Message, and
  `resources` is `Layer<never, never, never>` (the old type rejected
  Foldkit's own Layer).
- **`foldkit-ssr`, `SSR.entry` answers OPTIONS (breaking):** `204` with
  `allow: GET, HEAD[, POST], OPTIONS` instead of `405`, and a new
  `headers: request => HeadersInit` sets headers on every response it answers.
- **`examples/foldkit/ssr` serves as upstream does:** Effect's HTTP server on
  `@effect/platform-node` instead of a hand-written `node:http` host.

- **`foldkit-ssr`, the envelope rides the stamped root (breaking):**
  `SSR.render` carries the envelope as `data-foldkit-plus-resume` on the
  rendered root, beside Foldkit's own stamps, instead of a script before
  `</body>`; hydration adopts the nodes and drops the attribute on its first
  patch. `SSR.resume` reads it there, refusing a page with no stamped root or
  more than one. `SSR.entry` answers `Rendered` and takes no `template`,
  `containerId` or `head`: the host owns the template, through `handleRequest`
  or the `foldkit` Vite plugin's dev server, and a plan with `meta` is refused
  at construction (serve it with `SSR.generate`, which keeps the template,
  `head` and `meta`). The build id is the `FOLDKIT_BUILD_ID` deployment both
  bundles are compiled with. The `foldkit-ssg` and `foldkit-ssr` examples serve
  through `foldkit({ ssr })`, and the CMS example stamps pages with the same
  deployment id instead of the entry script's address.
- **`foldkit-remote`, typed entry dependencies:** `Data.subscriptions` and
  `Remote.fold(...).subscriptions` type each entry's dependencies
  (`ReadDependencies`, the new `LiveDependencies`, `RetentionRoots`) instead of
  `any`; the `retain` entry requires no services.

- **`foldkit-cms`, drafts:** a draft stores the form's Model settled, as it is
  shown again, so nothing in flight is saved; a Builder's undo history was,
  up to 200 copies of the page, and a page of about 150 blocks could no
  longer be saved ("This draft is too large to save").

- **`foldkit-mixins-builder`, words:** `selectAHolder` is `nothingHoldsIt`, and
  says what it now means: with nothing selected a tile goes anywhere that can
  hold it, so a disabled one has nowhere yet. The empty page says to begin
  with a block the palette offers.

- **`foldkit-cms`, editor status:** a publish or a schedule the form's own
  checks stop is `Incomplete` (a new `EditorStatus`) until the next edit, and
  one waiting for a check reads `Publishing`; before, the status stayed what
  the last save said, "Saved", so a refused publish read as a success.
  `EditorForm` gains `engine.isValidating`, which `Form.make` provides.

- **`foldkit-builder`, dropping:** where the node dragged over has no place
  for what is dragged, it lands by the nearest node holding it that does,
  before or after it, and `drag.over` names that holder; a Section dragged
  onto a Section's last Heading landed only on the Section's thin bottom edge.
  `dropAt` agrees.

- **`foldkit-mixins-builder`:** a click on a layers row makes it current, as
  the keys do (`TreeNavigation`'s `Focused`), rather than sending `Selected`,
  so a narrow editor keeps the layers showing instead of switching to
  Settings and hiding the row that had just taken focus.

- **CMS example:** a Quote's text and a Callout's body keep the lines broken
  with Shift+Enter once editing ends, in the editor and on the public page
  (`white-space: pre-line` on their looks).

- **`foldkit-primitives`, `PointerDrag`:** an Escape that cancels a drag is
  caught on the way down and stopped there, so the focused element does not
  also act on it; in the Builder, Escape during a canvas drag cancelled the
  drag and deselected the node.

- **`foldkit-mixins-builder`:** the palette's tiles and the command buttons
  are disabled by `aria-disabled` rather than `disabled`, so Undo pressed on
  the last step, or a tile whose place fills, keeps focus instead of dropping
  it to `<body>`. Style `[aria-disabled="true"]`; the CMS example does.

- **`foldkit-primitives`, `EditableText`:** when Enter or Escape ends an edit
  and the view then removes the field or makes it no longer editable, focus
  comes back to the container instead of falling to `<body>`, where the next
  key (an undo, a Delete) did nothing. The Builder's canvas is that container.

- **`foldkit-primitives`, `PointerDrag`:** `targets.within` is looked for
  nearest first, under the container's closest ancestor holding a match,
  not the first on the page, so the second of two editors dropped its tiles
  onto the first's page. **`foldkit-mixins-builder`** finds its canvas by a
  `data-builder-canvas` attribute rather than an id built from the Builder's
  name, which a name with a space or a colon broke (no drop landed, or every
  move threw).

- **`foldkit-primitives`, `Measure`:** a change in the subtree is measured as
  its records arrive, so an editor's selection box moves in the frame the
  selection is drawn in rather than one after; and it measures again when an
  image or a font inside loads and on each frame of a transition or an
  animation inside, which moved a target without resizing it and left the box
  where it was.

- **`foldkit-mixins`, per-item memo (`slots.x.lazy`):** a static Style's
  contribution is compared too, so two views apart only by a Style no longer
  reuse each other's rows (a theme switch kept the old theme's rows); and an
  item drawn with no runtime frame (a test, a server) keeps no bookkeeping.

- **`foldkit-builder`, text edited in place:** Escape puts the text back even
  where another edit came between, a commit writes nothing the page already
  holds, a second ask for the field being edited begins nothing, and an undo
  or a redo ends editing. A session in which nothing was typed writes nothing
  when it ends, so leaving a field untouched keeps an agent's edit made
  meanwhile (the Model's `editing` gains `typed`). A Block named as one of `Object`'s own names is not
  taken for one with starting props, and a pasted tree is checked by its own
  ids, so a refusal names what was copied rather than freshly minted ids.

- **`foldkit-builder`, the inspector:** an optional prop or input emptied is
  taken away (`unsetProp`, or the input written without it) instead of left
  as it was; a value the Block refuses leaves its field showing the node's
  value, not one that looks accepted; an action's input is written with only
  the keys its Schema names; and a held form Message with a key its variant
  lacks is not decoded. `Settings` gains `keys`.

- **`foldkit-builder`, placing and commands:** `placeFor` puts a Block that
  is no root, with nothing near the selection to take it, last in the last
  Region on the page with room that accepts it, so a node cut and pasted
  back comes back rather than being refused with a minted id; a paste with
  no place at all is refused before ids are minted, as `builder:no-place`
  (a new word, `noPlace`). Duplicate is not offered where its Region is
  full. `keyCommand` tries each command a key names in turn, so a command an
  application adds on a built one's key runs where that one has nothing to
  do.

- **`foldkit-composition`:** `field(key)` takes only a prop that is exactly
  `string`; a list of names (`'plain' | 'accent'`) is no longer a field. An
  id that is one of `Object`'s own names (`toString`, `constructor`,
  `__proto__`) is an id as any other: a tree naming one it lacks was a
  `TypeError` from `apply`, and one it held was refused as taken; a stored
  Document naming one it lacks was a `TypeError` from `validate`, `index` and
  `describe`, and is now `composition:missing-node`.
  `Renderer.fields` no longer shares the page's memo, which made a view that
  called it redraw every node on every change. `Composition.treeRefusal` is
  exported, to check a tree by its own ids before it is rekeyed.

- **`foldkit-mixins-builder`: the default layout is four regions.** `define`
  draws `regions` holding `start` (palette, layers), `bar` (toolbar, crumbs,
  viewports, preview), `stage` (alert, canvas) and `end` (inspector), where it
  drew ten sibling panels; `root` is always the container `builder`, so a
  Style may follow the editor's own width. A Style that placed each panel on
  the root's grid places the regions instead.

- **`foldkit-composition/foldkit`: absence is an `Option`.** `RenderContext.on(event)`
  returns an `Option` of the Message, and `Renderer.render`'s edit options
  `selected`, `hovered`, `drop` and `editing` take `Option`s, as an editor's
  Model holds them, rather than `undefined`.

- **`foldkit-mixins-builder`: `BuilderView.describe` and `BuilderView.controls`
  are gone,** for `Block.words` (in `foldkit-composition`) and
  `Builder.controls` (in `foldkit-builder`). The toolbar's `history`, `undo`
  and `redo` Slots are `toolbar` and `toolbarAction`, and `ACTIONS` and
  `SHORTCUTS` are the command table. **`foldkit-builder`:** `DragStarted`
  takes a `source`, and `dropAt` a `DragSource`, not an id.
- **`foldkit-primitives`:** `Measure` attaches nothing when it cannot start.
  Where there is no `ResizeObserver` (jsdom), it had already attached a
  `MutationObserver`, which then threw on every change to the page.

- **A value that may be absent is an `Option`, not `null` or `undefined`,**
  across the read and builder APIs. Breaking:
  - `foldkit-surface`: `Surface.at`'s params function returns
    `Option<Params>` (none: inactive), and `projectionOf` returns
    `Option<Projection>`.
  - `foldkit-remote`: `Data.active(name, projectionOf)` makes an application's
    read of the domain an active Surface; it replaces spelling one out from
    `contract`, and throws for a domain on a raw optic, which names no
    application.
  - `foldkit-crud`: `detail.at`'s `id` and `list.at`'s `input` return an
    `Option`; `more(model)` is an `Option<Command>`. `Crud.options` throws
    without lists.
  - `foldkit-cms`: the editor's `entry`, `pageId`, `resumed`, `state` and
    `error` reads return `Option`s; an editor domain gives `active` instead of
    `contract`.
  - `foldkit-builder`: the Model's `selected`, `hovered`, `refused` and `drag`
    are `Option`s, stored as `null`. `Selected` takes an id and `Deselected`
    clears it; likewise `Hovered`/`Unhovered`, `DraggedOver({ id, zone })`/
    `DraggedOff`, and `PreviewChosen`/`PreviewCleared`. `placeFor`, `moveBy`,
    `dropAt` and `keyCommand` return `Option`s.
  - `foldkit-remote`: a preview (`Data.overlay`) of an entity the server has
    not seen, missing a field its Selection reads, reads `Failed` with an
    `Overlaid` error naming the fields, not `Initial` for good.
  - `foldkit-composition`: `SurfaceBlock.reads`, `QueryBlock.reads`, `value`
    and the `documentOf` of their `active` are `Option`s; the reads gain
    `data(model)`, each node's value as a Renderer takes it. `Block.stored(block,
    key)` is how a prop is stored, and `StoredPropsOf<B>` its type.
- **`foldkit-mixins`: a family's `text` token is `on-fill`, and each family
  gains `ink`.** `accent.text` read as "accent-colored text" and was the text
  *on* the accent's fill. It is now `accent['on-fill']` (`--fk-accent-on-fill`),
  and `accent.ink` is the accent as text on the base surface, for every family.
  `text['on-accent']`, the same value as `accent['on-fill']`, is removed.
  Prose's `mark` drew its text in the on-fill color over the accent's tint; it
  uses `ink`.
- **`foldkit-remote`: a query read shows at most its window, and "load more"
  grows the window.** Remote keeps one connection per query and input, so a
  read of `first: 3` now shows three rows even when a `first: 50` read of the
  same query loaded more, with `hasNext` set when it cut any. Two windows of one
  connection are one query, for the wider; a window wider than what the
  connection holds fetches only the rows it lacks (before, it was never
  fetched). `Data.more(model, projection)` returns the Model with the read's
  window one page larger, an `Option`; `Data.next`, `Data.previous`,
  `Data.fetch` and the fold's `fetch` are removed. `Remote.query` and
  `Remote.queryMessage` still run one page by hand. The store gains `grown`
  and the `WindowGrown` Message.
- **`foldkit-bundle`: `complete`'s `update` error names a common cause:** an
  unannotated parameter on a callback written inline in the config, which keeps
  TypeScript from inferring the config at all.
- **`foldkit-composition`: `Renderer.render` of a Renderer that sends nothing
  takes any application's builder,** so a view passes its own `h` instead of
  `inertHtml`.
- **`foldkit-remote-drizzle`: `query` is written without type arguments;** the
  README says how the principal is inferred from `where`'s parameter.
  `foldkit-cms-drizzle` dropped its own.
- **`foldkit-mixins-crud`: `ListSlots` and `DetailSlots` gain `badge`,** and a
  Display renderer's context carries it, so a value drawn as a label of its own
  is styled as a Slot. `foldkit-cms`'s state renderer draws in it.
- **`foldkit-cms-drizzle`: `cms.import({ type, values, as, at?, entry? })`**
  publishes content that exists already (a seed, or another CMS's) by the
  publish path, in one transaction, instead of an application writing the CMS's
  tables by hand.
- **`foldkit-cms`: the Entry has a server-derived `may`,** the transitions the
  reader may ask by the server's `allow`; the placed editor gives
  `may(model, transition)`, and `Cms.transitions` lists them all.
  `foldkit-cms-drizzle` supplies it; its `Asked` type is removed for
  `foldkit-cms`'s `Transition`, which it duplicated.
- **`foldkit-mixins-form`: `FormView`'s `submits: false`** draws a form without
  its submit button.
- **`foldkit-primitives`: `KeepInView({ selector })`,** a Mount that scrolls
  whatever newly matches in its subtree into view. `foldkit-mixins-builder`
  mounts it on the layers panel and the canvas, so a new selection (an inserted
  Block, say) is in view. `foldkit-composition` exports `MARK_ATTRIBUTE`.
- **`foldkit-form`: a number-literal schema resolves to a `Select`,** whose
  `options` may be text or numbers and whose value is the chosen option itself.
  `Control.parse` now receives the control's `data`. `foldkit-mixins-builder`'s
  inspector draws the select and stores a number as a number.
- **`foldkit-entity`: `Selected<typeof selection>`,** the value a Selection
  reads.
- **`foldkit-cms`: the editor's Commands carry the form's requirements, not
  `any`.** `EditorForm`, `EditorContent` and `Editor.make` gain a `Services`
  parameter (default `never`), so an application's `update` types its Commands
  as `RemoteClient` and its runner needs no cast.
- **`foldkit-entity`: `Words.of(schema)`,** a schema's `title` and
  `description` as `Option`s, including a title given before a check (which
  Effect 4 resolves past). `foldkit-form`, `foldkit-crud`'s column labels and
  `foldkit-mixins-builder`'s inspector read words through it; the inspector and
  Crud no longer lose such a title.
- **`foldkit-remote-drizzle`: `drizzleWrites` and `returning.row`.**
  `drizzleWrites` is the provided database's `insert`, `update` and `delete`,
  typed by each table's columns, so a handler writes without casting
  `DrizzleDatabase`; `returning.row(binding, id)` reads back the row a handler
  wrote as patches, every column and each `one` relation as its ref.
  `foldkit-cms-drizzle` uses both instead of its own casts.
- **`foldkit-crud`: `list.more(model)` is the Model showing one page more,** an
  `Option`, instead of a Command.
- **`foldkit-composition`: `QueryBlock.reads` no longer cuts rows itself;**
  Remote does.
- **`foldkit-mixins-ui`: `outline` and `ghost` buttons read `--fk-ink` first,**
  so on a band that sets `--fk-ink: currentColor` their text is the band's
  color instead of the tone's ink, which does not read there.
- **`foldkit-mixins`: `Defaults.headings` reads `--fk-heading` first,** so a
  container drawn in its own color sets `--fk-heading: currentColor` and its
  headings take its color; elsewhere they stay `text-overt`.
- **`foldkit-mixins-form`: `FieldSlots` gains `group` and `affix`,** for a
  control drawn with text beside it; `foldkit-cms`'s slug renderer draws its
  prefix and input in them instead of in bare spans with a
  `data-cms-slug-prefix` attribute.
- **`foldkit-primitives`: `TreeNavigation` writes each row's level as
  `--fk-tree-level`** beside `aria-level`, so one `calc` indents any depth.
- **`foldkit-composition`: the edit marks are one attribute.**
  `data-composition-mark` is `selected` or `hovered` and replaces
  `data-composition-selected` and `data-composition-hovered`; a node both
  hovered and selected is `selected`. Restyle `[data-composition-selected]` as
  `[data-composition-mark='selected']`.
- **`foldkit-mixins`: a recipe's `variants` is optional,** so a recipe that is
  only its base (`Style.recipeFor(Slots)({ base })`) no longer writes
  `variants: {}`.
- **`foldkit-ssr`: Messages answered before boot reach `update` before any
  other Message,** instead of being replayed through a Subscription after the
  first render. An event dispatched in the task that boots the page, such as
  the rest of a burst of typing, reached the runtime before the replay, so
  the text ended on its first character. The runtime still starts from the
  resumed Model, so its first render is the served markup; its `update` is
  wrapped to run the answered Messages ahead of the first one it processes.
  The `foldkit-ssr.replay` entry is gone.
- **`foldkit-ssr`: deferred boot no longer depends on `hydrate` rendering its
  first frame before it returns.** Until that frame commits the page keeps
  answering from its markers, and it then sends the live page the events only
  it can answer.
- **`foldkit-mirror`: `reduce` returns the Model it was given when the store
  holds what the Model already does,** so the URL change a mirror's own write
  causes, a navigation that leaves its keys alone, and a restore that finds
  nothing new no longer render the page again. A structured field's text is
  remembered by the value's identity, so the write entry no longer serializes
  it on every Model change.
- **`foldkit-bundle`: a placement or collection item returns the parent Model
  itself when the child's `update` returns its own Model,** so a Message that
  changes nothing renders nothing.
- **`foldkit-primitives`: a Message that changes nothing returns the Model it
  was given,** across state, time, motion, media, interaction, device, network
  and event primitives, and the navigation and selection Behaviors describe
  their items once per render instead of once per item. `Virtual` caches its
  row offsets per keys array and heights record. `MediaStream`'s `Started`
  while live no longer stays at `requesting`, and `Presence`'s `Hide` while
  hidden no longer shows the content for the hide duration.
- **`foldkit-remote`: the common Messages that change nothing return the
  Model they were given,** so `Data.reduce` and the wiring keep the application's root on a
  duplicate live event, a repeated `ReadStarted`, an empty `Hydrated`, or a
  retention pass that collects nothing. An entity's or list row's decoded
  value is the same object after a refetch or live patch that brought equal
  data to every field of its entity, so a keyed row's lazy view does not
  re-run. The live entry no longer closes and reopens its stream on every
  event, and a pending request no longer rebuilds the visible store on each
  overlay change. A list read now shows a live insert
  or an optimistic connection change that wrote no entity; it used to keep
  the list from before it. The unused `shouldWake` export is removed.
- **`foldkit-remote`: `MutationSucceeded` carries `now`,** the clock reading of
  the answer, and the entities it writes are dated by it. They were dated 0, so
  under a freshness policy every value a mutation wrote was already expired and
  read again at once, and one a read had just dated was set back. `Data.mutate`
  and `Remote.mutateInto` take a `now` option (default `Date.now`), as
  `ObserveOptions` and `LiveOptions` do. `settleSuccess` and
  `reconcileMutation` take the answer as one `MutationAnswer` object
  (`{ entities, deleted?, now }`, plus `connections?` for `settleSuccess`)
  instead of positional arguments, so the clock cannot be left out. A
  hand-built `MutationSucceeded` adds the field, and a stored one without it
  no longer decodes.
- **`foldkit-remote`: the read entry plans once per Remote state and query.** A
  Model change the Remote model is not part of, such as typing in a field,
  reuses the plan until the next freshness deadline instead of walking every
  row again: about 1 ms to 0.02 ms per change for a list of 400 rows.
- **`foldkit-remote`: freshness follows what the server said and when.** A
  pending optimistic patch keeps the date of the value under it, so under a
  freshness policy a request in flight no longer makes a fresh entity read as
  expired and refetch it; an entity only a request holds (a temporary id) is
  never aged, planned or timed. A field the server settled without a value
  now ages out with its entity on the read entry's timer, instead of waiting
  for an unrelated Model change. `EntityWrite` takes an optional `updatedAt`.
- **Tag branching the type checker can check.** Every package branches on a
  `_tag` it can type: Schema ASTs are `SchemaAST.AST`, tested with Effect's
  guards, instead of a hand-written `{ _tag: string }`; switches list every
  variant or end in `absurd`; and casts before a `_tag` read are gone.
  `foldkit-entity` exports `SchemaShape` (`isNullish`, `present`, `isText`),
  the one reading of an optional Schema that `cms`, `crud`, `form`, `remote`
  and `remote-drizzle` each had a copy of. `foldkit-cms`'s `EditorForm.field`
  returns a `FieldValidation.Field<unknown>`. `pnpm tags:check` finds branching
  the checker cannot vouch for.
- **`foldkit-form`: `DraftKind` gains `'model'`,** and `NestedForm` gains
  `control` and `Message.Control`. A switch over `DraftKind` handles the new
  case, and a hand-written `NestedForm` adds the two members; forms made by
  `Form.make` have them.
- **`foldkit-durable` schema 6:** schema 5 adds epoch and replica-binding
  tables; schema 6 records the replica on each operation. Files from schema 4
  or 5 upgrade in place;
  retained operations restore their actor bindings. A custom journal with
  compacted older operations needs `legacyReplicaId` to recover the replica
  from an operation id; without it opening is refused. `foldkit-sync` supplies
  this callback. The snapshot cache also follows the document epoch after a
  reset through another handle. Older builds refuse a schema 6 file.
- **`foldkit-sync`: the socket transport reconnects for as long as its layer
  lives.** `maxRetries` now counts consecutive failures after which queued work
  fails fast, instead of ending the transport. `Replica.start` retries a failed
  exchange on a backoff, and every failed exchange sets `status.lastError`.
- **`foldkit-sync`: the IndexedDB database moves to version 2** (the outbox
  store); code from before it cannot open a database this version wrote.

## 0.11.0

`foldkit-remote`, `foldkit-remote-server` and `foldkit-remote-drizzle` 0.8.0;
`foldkit-surface` 0.5.0; `foldkit-bundle` 0.3.0; `foldkit-mixins`,
`foldkit-mixins-ui`, `foldkit-mixins-surface` and `foldkit-mixins-crud` 0.4.0;
`foldkit-primitives` 0.3.0; `foldkit-crud`, `foldkit-entity`, `foldkit-agent`
and the four agent adapters, and `foldkit-durable` 0.4.0; `foldkit-form`,
`foldkit-mixins-form`, `foldkit-cms`, `foldkit-cms-drizzle` and
`foldkit-bundle-surface` 0.2.0; `foldkit-mirror` 0.3.0; `foldkit-sync` 0.6.0;
`foldkit-react` and `foldkit-react-codegen` 0.2.0. Every one of them moves to
Foldkit 0.163 and Effect 4.0.0-rc.116; `foldkit-metadata` is unchanged at
0.1.0. Four packages are published for the first time at 0.1.0:
`foldkit-ssr`, `foldkit-richtext`, `foldkit-richtext-dom` and
`foldkit-mixins-richtext`.

**A page is declared once.** `Bundle.compose` states a parent's own fields and
Messages and the bundles it places, and derives its Model, Message union,
placements and assembly, so a page no longer spreads each placement's fields
and cases into Schemas it writes by hand. `Bundle.lazy` keeps a bundle's
`update` and `view` out of the boot chunk.

**Interaction and styling you do not have to rebuild.** `foldkit-primitives`
gains an `interaction` subpath of Bundles for roving focus, typeahead, grid
navigation, selection, press, focus scopes, dismissable layers and live
announcements. `foldkit-mixins` gains cascade layers as a value, a theme from a
few knobs, layout pieces, and multi-slot recipes, which `foldkit-mixins-ui`
ships for its components.

**Remote tells a withheld field from a deleted entity**, forgets everything at
a change of principal with `Data.forget`, and refreshes a value when it ages
out rather than when the Model next changes.

**Server rendering and rich text, first releases.** `foldkit-ssr` renders on
the server, hands the browser the Model the server reached instead of rerunning
`init`, and can answer events before the runtime boots. `foldkit-richtext` and
its DOM adapter give an editor whose document lives in the application Model.
All four new packages are early and may change between minor versions.

### New packages

- **`foldkit-ssr` 0.1.0.** Server rendering that hands the browser the Model
  the server reached, not the inputs to rebuild it. `SSR.plan` names the slice
  of the Model the browser owns, checked against the Surfaces it reads.
  `SSR.render` and `SSR.page` render on the server, `SSR.generate` at build
  time, and `SSR.entry` serves through Foldkit's `handleRequest`.
  `SSR.hydrate` adopts the server's HTML without running `init`.
  `SSR.static` regions belong to the server alone, and a part such as
  `Remote.resume(Data)` carries a package's state across. Resumable pages,
  forms that work with scripts off, and lazy bundles are listed under Added.
- **`foldkit-richtext` 0.1.0.** Pure semantic documents and text
  transactions. A `Document` is versioned data with stable node ids, and
  `run` or `apply`, called from `update`, returns the next state, a
  `ChangeSet` and a position map, or a diagnostic with no partial result. It
  holds no store and does no I/O. Unknown blocks are preserved, migrations
  keep identities, a rendering registry declares node kinds, and `toHtml` and
  `toText` serialize a document.
- **`foldkit-richtext-dom` 0.1.0.** The DOM adapter for an editable
  `foldkit-richtext` subtree. It renders a document into real DOM once,
  patches only the nodes a `ChangeSet` names, and turns browser events into
  commands the application's `update` decides on. Subpaths hold the host
  mount, events, HTML import, a read-only view, a marks toolbar, and an editor
  Bundle (`foldkit-richtext-dom/editor-bundle`).
- **`foldkit-mixins-richtext` 0.1.0.** The editor's mark toolbar as a
  Mixins `SlotView` (`markToolbar`, `MarkToolbarSlots`), so each button is a
  slot an application styles.

### Upgrading from 0.10

- Move `foldkit` and `@foldkit/ui` to `0.163.0`, and `effect`,
  `@effect/platform-browser` and any `@effect/*` package to `4.0.0-rc.116`.
- Deploy a Remote client and server together: the wire protocol is now 4, and a
  read you wrote by hand, a test fake included, returns `settled` beside
  `entities`.
- Replace `Theme.variable(theme, group, name)` with `Theme.ref(theme)[group][name]`.

### Breaking

- `foldkit-remote`, `foldkit-remote-server`: `ReadBatchResult` requires
  `settled`, the protocol is 4 and the cache version 5, so a cache persisted by
  0.10 is discarded. See the entry under Changed.
- `foldkit-surface`: an `ActiveSurface` carries a required `messages`, so one
  built by hand, rather than through `Surface.at` or `Surface.when`, adds it.
- `foldkit-mixins`: `Theme.variable` is removed; declarations are type-checked
  against csstype; a style property set by a Behavior and by anything else is
  refused (`mixins:style-property-conflict`).
- `foldkit-bundle`: an array collection's item must carry its key as its id;
  writing one that does not throws.
- `foldkit-cms`: a hand-built `EditorForm` needs `authoredChanged`, which a
  form made by `Form` already has.

### Added

- **`foldkit-bundle`: `Bundle.compose`, a parent in one declaration.** A
  parent's own fields, then through `pipe` its own Messages
  (`Bundle.withMessages`), the bundles it places (`Bundle.withChild`,
  `Bundle.withEach`), integration wiring (`Bundle.withWiring`) and its
  services (`Bundle.withServices`). It derives the Model, the Message union
  with each child's `Got<Field>Message`, each placement under
  `children.<field>`, and the assembly, so a parent no longer spreads
  `declare(...).fields` and `.cases` into Schemas it writes by hand. Each step
  is typed by the parent so far, so an `onOut` knows the Model. A child whose
  config is made from the parent itself, such as a Crud editor whose `onOut`
  needs the Surface application built from this Model, is added without one
  and given it later with `Bundle.configure`; until then its `children` and
  `placements` are type errors naming what waits. It builds the same values
  `declare`, `parent`, `at` and `assemble` do, and those stay for a parent
  whose Model already exists or a placement with a custom Link.
- **`foldkit-bundle`: `Bundle.lazy`, a bundle whose `update` and `view` load
  on demand.** The declaration (`Model`, `Message`, `args`, `init`,
  `subscriptions`, `resources`, `helpers`) stays in the boot chunk; the bodies
  are a `Bundle.Body` a chunk exports. A Message before the load returns a
  Command that loads them and yields it again, so nothing is lost; `while`
  renders meanwhile; `load()` preloads once. `Placed.view` and a collection's
  views now take any builder with `submodel` and `OnClick` (`BuilderLike`), so
  a wrapper of Foldkit's builder can be handed to them.
- **`foldkit-surface`: an active Surface carries `messages`.** `Surface.at`
  and `Surface.when` now give the tags of the Messages the Surface lists, so a
  tool holding a plan's Surfaces knows what each may send; `foldkit-ssr` reads
  it to keep a page's bindings to them. **Breaking** for code that builds an
  `ActiveSurface` by hand rather than through `Surface.at` or `Surface.when`:
  add `messages`, an empty list for a Remote requirement that sends nothing,
  as `foldkit-crud` and `foldkit-cms` now do.
- **`foldkit-ssr`: resumable pages.** On top
  of rendering on the server and handing the browser its slice of the Model,
  a page can now answer before its runtime boots. `Resume.builder(h)` writes
  in the server's markup which Message each element causes, and the browser
  answers events from those markers until a plan's `start: 'idle' |
  'on-interaction'` boots it, replaying what was answered. A page may only
  dispatch Messages its active Surfaces list. With `fallback: 'server'` a form
  posts its Message and `SSR.handle` runs `update` and its Commands on the
  server, so the form works with scripts off. The configuration's `lazy` list
  loads each `Bundle.lazy` before a page renders or boots. A tampered envelope
  is refused rather than thrown on, and a post whose Commands never settle is
  stopped after 100 steps. See the package README.
- **`Remote.resume(Data)`: Remote's state for a server-rendered page.** A
  resume part for `foldkit-ssr` that sends what the page's
  active Surfaces read, field by field through relations, each connection
  with its boundaries, and the live cursors of the entities captured; nothing
  else of the store. A `Snapshot` stays the tool for a cache that survives a
  reload. The part also vouches for Remote's Subscription entries, which
  `Data.subscriptions` and the fold's `subscriptions` mark as safe to start
  late, so a page that resumes Remote's data may defer its boot.

- **`Mirror.fold` and `Remote.fold`: a library's Messages under one variant
  of the application's union.** Spreading `Mirror.messages` or
  `Remote.messages` into the union leaves `update` unable to match it
  exhaustively, because the library's tags remain in the union after the
  `reduces` guard. A fold gives the shape Foldkit gives a Submodel: declare
  `GotPrefsMessage: { message: Mirror.Message }` or
  `GotRemoteMessage: { message: Remote.Message }`, fold the mirror or the
  domain under it, and match the whole union. Everything the library produces
  yields the wrapper with the lift recorded: a kv mirror's `restore` (and the
  fold's `init` Step that runs it), a domain's `fetch`, a mutation's Command,
  and its Subscription entries. A Story resolves a restore or a mutation by
  the library's own answer. `Mirror.Message` and `Remote.Message` are the
  union Schemas for the wrapper field. The spread and the `reduces` guard stay
  for an `update` that only reduces; wiring stays the bundle path.
- **`foldkit-primitives`: a `foldkit-primitives/interaction` subpath for
  interaction state a view's slots reflect.** Each primitive is a namespace
  (`RovingTabindex`, `Press`, ...) exporting its `bundle`, `Model`, `Message`,
  `Args`, a `foldkit-mixins` Behavior (`behavior`) that wires it to a view's
  slots, and its pure functions. `foldkit-mixins` is a new optional peer,
  needed only for this subpath.
- **`foldkit-primitives`: keyboard navigation and selection over a set of
  items.** `RovingTabindex` keeps one tab stop by the current item's id, so a
  reorder keeps it; its pure `move()` handles arrows by orientation, looping,
  Home, End, PageUp, PageDown, skipping disabled items and RTL, and under
  `virtual` DOM focus stays on the container with `aria-activedescendant`.
  `Typeahead` finds the item whose label starts with the typed characters, and
  a repeated character cycles. `ListNavigation` combines the two with one key
  handler. `GridNavigation` moves in two dimensions over rows of cells, with
  Home and End per row and Ctrl+Home and Ctrl+End per grid. `Selection` keeps
  `{ selected, anchor }` in `single`, `multiple` or `none` mode, with a Shift
  range through `Ranged` and the pure `between()`, and writes `aria-selected`.
- **`foldkit-primitives`: focus management.** `FocusScope` (a Mount in
  `/dom`, with a Behavior in `/interaction`) focuses `initialFocus` or the
  first tabbable element, keeps Tab inside the scope under `contain`, and
  returns focus on unmount under `restore`. `InputModality` (in `/events`)
  records whether the keyboard or a pointer was used last, and
  `FocusVisible.behavior` writes `data-focus-visible` under keyboard for a
  design system that decides focus rings in the Model.
- **`foldkit-primitives`: pointer and press input.** `Press` treats a pointer
  press, Enter, Space and an assistive-technology click as one activation. It
  ignores the ghost click after a touch and writes `data-pressed`. The
  placement must handle its `Pressed { pointerType, shiftKey }`. `LongPress`
  emits `LongPressed` after `thresholdMs`, reusing the events `Press` reports.
  `Move` (a Mount in `/dom`) captures the pointer and reports each move as the
  distance from where it went down. The parent's update decides what a drag
  means.
- **`foldkit-primitives`: overlay layers.** `DismissLayer` is one Bundle
  placed once that owns the document's pointerdown and Escape listeners. It
  gives the placement `Dismiss { ids }` for the layers a press outside or an
  Escape closes. Nested layers and triggers work without registration.
  `ScrollLock` and `HideOutside` are Mounts over Foldkit's `Dom.lockScroll`
  and `Dom.inertOthers`, attached through `Layers.scrollLock` and
  `Layers.hideOutside`.
- **`foldkit-primitives`: `LiveAnnounce`, screen-reader announcements from
  `update`.** One Bundle holds a polite and an assertive region. `say()`
  builds the Message, `view()` renders the regions, a burst is read once after
  `debounceMs`, the text clears after `clearAfterMs`, and a repeated text is
  read again.
- **`foldkit-primitives`: reduced motion as a service.** `Motion` in
  `foldkit-primitives/motion` is read when a transition starts. Provide
  `Motion.live` for the user's `prefers-reduced-motion`, or `Motion.reduced` /
  `Motion.full` in tests. Under reduced motion a presence exits at once and a
  tween or spring jumps to its end, using the same Messages. With no service
  provided, motion is unchanged.
- **`foldkit-bundle`: exports the `Declared` and `DeclaredEach` types**, for
  a helper that reads a placement's field and wraps its Messages.
- **`foldkit-mixins`: cascade layers as a value, and a stylesheet built from
  pieces.** `Layers.define(names)` returns `names`, `declare` (the `@layer`
  statement as a piece), `in(name, piece)` and `layer(name)`; a layer name
  outside the order is a type error. `Layers.standard` is the shipped order:
  `reset, tokens, theme, defaults, components, layouts, variants, utilities,
  app`. A slot style takes its layer when it is compiled, with
  `Style.forSlots(S)(pieces, { layer: L.layer('app') })`, so the view and the
  sheet share the same class names. `Style.stylesheet` now takes bare
  `StyleValue`s beside `NamedStyle`s and hoists the layer order first. Once a
  sheet declares an order, it refuses a rule outside it
  (`style:unlayered-rule`), because an unlayered rule beats every layer, `app`
  included. A sheet with no order behaves as before.
- **`foldkit-mixins`: a theme from a few knobs, under `foldkit-mixins/theme`.**
  `Theme.oklch(knobs)` derives surfaces, text, outlines, and the accent,
  secondary, tertiary and feedback colors from an accent and a few knobs.
  Every derived value is a CSS expression, so one knob override recolors the
  page in the browser. `Theme.tokens` holds the non-color scales, with
  `density` and `radius-factor` knobs. `Theme.root` and `Theme.scoped` turn a
  theme into `:root` and selector rules for the sheet, and `Theme.scoped`
  type-checks its overrides against the theme. `Theme.ref(theme)` gives every
  token as a typed `var(--fk-…)`, so a missing name is a type error.
  `Theme.compose`, `Theme.lightDark` and `Theme.breakpointWidths` complete the
  set, and the root export gains `ref`, `compose` and `lightDark`. The palette
  needs relative color syntax and `light-dark()`.
- **`foldkit-mixins`: layout, element defaults and prose as subpath
  entries.** `foldkit-mixins/layout` ships `Layout.stack`, `cluster`, `split`,
  `sidebar`, `switcher`, `reel`, `center`, `frame`, `pad`, `autoGrid`,
  `intrinsic` and `aside`. `foldkit-mixins/defaults` ships element defaults
  (`reset`, `body`, `headings`, `links`, `code`, `controls`, `all`), and
  `foldkit-mixins/prose` ships `Prose.style`. They are unlayered, so the page
  places them with `Layers.in`. `foldkit-mixins/layers` re-exports `Layers`.
- **`foldkit-mixins`: more Style pieces.** `Style.self` is a rule on the
  element's own class, for declarations that must sit in a layer rather than
  inline. `states` styles per `data-state` value. `responsive` takes a map
  keyed by breakpoint names typed from the record you pass. `enter` writes a
  `@starting-style` rule, and `allowDiscrete`, `vars` and
  `viewTransitionName` round it out. `Style.grid` declares a template whose
  `area(name)` accepts only the areas it names. The `Selector` namespace
  builds the strings `pseudo` and `nest` take. Every piece's declarations are
  typed as `Declarations`, csstype's camelCase properties plus custom
  properties.
- **`foldkit-mixins`: multi-slot recipes, per-item styles and
  `forCapability`.** `Style.recipeFor(Slots)` gives each slot of a contract a
  base, variants per axis, defaults and compound matches, and returns the
  pieces for `Style.forSlots`. Its `extend(patch)` adjusts a shipped recipe
  without forking it. `Style.perItem` computes a piece from the item a slot
  is rendered for, and `Style.stagger({ stepMs })` staggers a list with no
  timer. `Style.forCapability` styles every public slot with a given
  capability.
- **`foldkit-mixins`: slots rendered once per item, and ready-made stateless
  Behaviors.** `slots.x.attrs(base, item)` takes an optional `SlotItem`
  (`{ index, id?, count? }`), which reaches a Behavior's attributes and
  mount. `Behaviors.Collection` describes a parent's array once, with ids,
  disabled items and `aria-posinset`/`aria-setsize`, and refuses duplicate ids
  (`mixins:duplicate-item-id`). `Behaviors.Disclosure`,
  `Behaviors.ToggleState`, `Behaviors.FieldAssociation` and
  `Behaviors.SpinValue` put a parent's state into ARIA and keyboard handling.
- **`foldkit-mixins-ui`: `Recipes` for Button, Input, Textarea, Checkbox,
  Switch, Dialog and Tabs.** Each is a `Style.recipeFor` over the package's
  slot contract, such as
  `Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' })`.
  Values reference `Theme.tokens` and a `Theme.oklch` palette, so the page
  must ship those tokens. Bases sit in the `components` layer and variants in
  `variants`, all as layered rules, so an `app`-layer style overrides them.
  State comes from the ARIA attributes `@foldkit/ui` already writes.
- **`foldkit-mixins-ui`: `Patterns`, `HoverIntent` and `Anchor`.**
  `Patterns` has an `A11y.pattern` per adapter. `Patterns.catalog` gives each
  one's tier and the behavior it leaves to the browser, so
  `A11y.validate(Patterns.Tabs, MySlots)` checks a custom view.
  `HoverIntent` (`HoverIntentSlots`) adapts `@foldkit/ui`'s hover intent.
  `Anchor.behavior(Slots)({ floating, config })` positions a floating slot
  with `@foldkit/ui/anchor`.
- **`foldkit-remote`: `Data.forget`, the one boundary for a change of
  principal.** Called from `update` on a login, a logout or a switch of
  organization, it returns the Model with every server-derived fact gone
  (values, tombstones, unavailable fields, connections, live cursors,
  failures) and performs no I/O. Every active Surface's read and live entries
  restart, and a read or stream begun before is interrupted rather than
  landing after. A mutation in flight is treated as applied, so its answer
  writes nothing. `Remote.forget(bound, model)` is the unbound form.
- **`foldkit-remote`: a value ages out as a Message.** Under
  `staleWhileRevalidate` a page that sat still past its `maxAge` was never
  refreshed, because the plan ran only when the Model changed. The read entry
  now sleeps until the earliest value it holds ages out, under the Effect
  clock, and emits `RefreshStarted` for what is due; the plan that follows
  fetches it. A test controls this with the Effect test clock.
- **`foldkit-form`: `authoredChanged(before, after)`.** It says whether a
  completed transition changed what the author wrote, by comparing the two
  Models: a blur, a refused edit or a repeated value is `false`; a changed
  draft or an added, removed or changed row is `true`. Nested rows recurse.
  `foldkit-cms`'s editor now autosaves on it instead of on the form's Message
  tags, so a Bundle-backed or stateful control autosaves like a text field.
- **`foldkit-mixins-form`: every control carries `name=<key>`**, and a
  relation picker's checkboxes also carry `value`, so a plain form post (for
  example `foldkit-ssr`'s `fallback: 'server'`) carries the drafts.

### Changed

- **Foldkit 0.163.0 and Effect 4.0.0-rc.116.** Every package that peers
  `foldkit` now requires `^0.163.0`, every package peers
  `effect@^4.0.0-rc.116`, and `foldkit-mixins-ui` peers `@foldkit/ui@^0.163.0`.
  Foldkit itself now peers `@effect/platform-browser@4.0.0-rc.116`, so an
  application installs that alongside `effect`. `foldkit-durable` depends on
  `@effect/sql-sqlite-node@4.0.0-rc.116`.

  **Upgrading from 0.10.0:** pin `effect`, `@effect/platform-browser`, and any
  `@effect/*` package to `4.0.0-rc.116`, and `foldkit` and `@foldkit/ui` to
  `0.163.0`. Replace `evo` with `modifyFields` from `foldkit/struct`; the
  package READMEs and the skill already do. `@effect/vitest` at rc.116 needs
  Vitest 5. A test that opened a `@foldkit/ui` Dialog through
  `Dialog.init({ isOpen: true })` opens it through `Dialog.boot` now, because
  `init` always returns a closed Dialog since `@foldkit/ui` 0.161.
- **`foldkit-form`: a nested form's Commands are lifted with
  `Command.mapMessages`.** The row lift wrapped the inner form's answer by
  hand, which dispatched correctly but left Story and Scene unable to replay
  the wrap: resolving a row's check handed the parent update the inner form's
  bare `Checked`. Resolving it now yields the `Nested` Message the parent
  handles. The `at` and `row` args the old lift added are gone; nothing read
  them.
- **`foldkit-react-codegen` lowers `OnKeyDownSelf`** to `onKeyDown` guarded by
  `event.target === event.currentTarget`. `OnBeforeInput`,
  `OnBeforeInputPreventDefault`, `OnKeyDownSelfPreventDefault`, and
  `OnCancelPreventDefault` report `FKREACT0002` like the other attributes with
  no one-line React form.
- **Docs use `Schema.Option` for optional Model fields and `match` over a
  Message.** Foldkit's recommended Oxlint preset now rejects `Schema.NullOr`
  in a Model and `switch` on a Message tag; the surface, sync,
  mixins-surface, and mirror snippets, and the skill's one-screen example,
  no longer trip it.
- **`foldkit-remote`, `foldkit-remote-server`: a withheld field is settled on
  the wire instead of tombstoning its entity.** Before, a field the server
  answered without was planned again. The second read came back with no
  entity, and the client tombstoned it, dropping every field it already held.
  `ReadBatchResult` now has a required `settled: Array<{ entity, id, fields }>`:
  fields the server will not answer with. `RemoteServer` settles what
  `authorize` withheld and what a Source left out of a record. The client
  marks those fields unavailable: they are not planned again, a later write
  clears them, and a refresh forgets them. An id is tombstoned only when it is
  neither returned nor settled. A Selection naming such a field reads `Failed`
  with an `Unavailable` error. `REMOTE_PROTOCOL_VERSION` is now 4 and
  `REMOTE_CACHE_VERSION` is now 5, so a persisted cache from 0.10.0 is
  discarded. **Breaking** for a hand-written `RemoteClient`, `RemoteRpcClient`
  or server read handler, including test fakes: return `settled: []` (or the
  fields you withheld) beside `entities`. Deploy client and server together.
- **`foldkit-mixins`: `Theme.variable` is replaced by `Theme.ref`.**
  **Breaking.** `Theme.ref(theme)` is built once per theme and reads like the
  token it names. Migrate `Theme.variable(theme, 'surface', 'base')` to
  `Theme.ref(theme).surface.base`.
- **`foldkit-mixins`: declarations are type-checked against csstype.**
  **Breaking** at the type level only: `inline`, `self`, `pseudo`, `nest`,
  `media`, `supports`, `container` and the other pieces took any
  `Record<string, string>`. A misspelled or kebab-case property is now a type
  error. Write it in camelCase, or as a `--custom` property. Compiled CSS is
  unchanged, and `csstype` is a new dependency.
- **`foldkit-mixins`: a style property a Behavior sets has one owner.**
  **Breaking.** When a Behavior sets a property through `h.Style` and a Style
  piece, the base or another Behavior sets the same one, resolving now raises
  `mixins:style-property-conflict`, naming both. Before, the last writer won
  silently. To migrate, remove the property from one of the two.
- **`foldkit-mixins`: rule pieces work under `Style.whenInput`.** Before, a
  pseudo, nest or media piece inside `whenInput` was refused with
  `style:conditional-rules-unsupported`. Now each compiles to its own class,
  which ships in the sheet and is present only while the input matches. That
  diagnostic code is gone.
- **`foldkit-cms`: the editor autosaves on `authoredChanged`.** A hand-built
  `EditorForm` now needs it; a form made by `Form` already has it.

### Fixed

- **`foldkit-surface`: `Projection.pick` no longer merges two fields that share
  a name.** A picked field is named by its last key, so `post.id` and
  `viewer.id` both became `id`. When their schemas were the same object, which
  `Schema.String` always is, they were merged without a word: `get` kept one
  value and dropped the other, and `set` wrote that one value into both
  fields. Mirror, Sync and Agent contexts are built from `pick`, so a URL
  mirror or a replica could overwrite one field with another. Both `pick` and
  `Projection.compose` now refuse the collision when the projection is built,
  naming both paths. The same field picked twice is still kept once.
- **`foldkit-bundle`: four routing and assembly bugs.** A nested placement
  listed after its outer placement now gets its Messages, because routing asks
  the deepest placements first. `Link.collectionById` throws, naming both, when
  an item's id is not its key; before, the item could never be read back and
  its Messages reached nothing. A tag is shared only when every claimant
  declares it shared, and a placement never shares. A nested child under an
  absent outer child no longer runs its init Commands.
- **`foldkit-mixins`: `Style.nest` and `Style.pseudo` scope every selector
  of a comma list.** Only the first selector got the element's class, so the
  rest matched page-wide. Each top-level selector is now scoped. A selector
  that writes `&` places the class there instead of gaining a prefix. Rules
  without a comma compile to the same text and class.

## 0.10.0

`foldkit-remote`, `foldkit-remote-server` and `foldkit-remote-drizzle` 0.7.0;
`foldkit-crud` and `foldkit-mixins-crud` 0.3.0; `foldkit-surface` 0.4.1.
Republished only so their pinned dependencies are the current ones:
`foldkit-agent` 0.3.3, `foldkit-bundle-surface` 0.1.3, `foldkit-cms` and
`foldkit-cms-drizzle` 0.1.2, `foldkit-mirror` 0.2.3 and `foldkit-sync` 0.5.4.

**A first run no longer needs a server, and a stuck read says why.**
`RemoteServer.memory` serves rows you give it through the same handlers a real
server uses, so a page can show real data before there is a database.
`Data.why` answers the question every newcomer asks of a read sitting at
`Initial`: is no active Surface reading it, or are Remote's Subscriptions not
installed? `Remote.patch` and `Remote.ref` let the entity you declared with
`foldkit-entity` be the one you patch.

**Reads are more honest about loading and failure.** Two reviews of 0.9's
failure handling found reads that still lied. A failed refresh could be
forgotten once a later page loaded, leaving an outdated first page reading
`Ready`. A read waiting on a related entity said `Initial`, the state that
means a wiring mistake. An editor opened on a value whose refresh had failed
showed an empty form. All of these are fixed.

### Upgrading from 0.9

Upgrade every `foldkit-*` package you use together; they pin each other's
versions exactly. Most applications need nothing else.

1. **A relation's value is typed by its entity.** A relation to `User` takes
   `` `User:${string}` `` (`RefKey<'User'>`), not any `string`. A literal such
   as `'User:u1'` or a template such as `` `User:${id}` `` already fits. A plain
   `string` variable passed to a relation field needs the same template.
2. **`DetailView`'s root is a `div` in every state.** A style or behaviour that
   targeted `root` to reach the `dl` moves to the new `list` slot.
3. **A failed list refresh stays stale.** Code that read a connection's `stale`
   flag after a `QueryFailed` sees `true` where it saw `false`. What shows on
   screen is unchanged: the list reads `Failed` with its rows as `previous`.
4. **`App.fields` is deprecated.** Use `App.model`; they are the same object.

### Breaking

- **`foldkit-remote`: a relation's wire value names its entity in the type.**
  A relation to `User` was typed as any `string`, so `owner: 'Project:p9'`
  typechecked in a patch and read as a row that does not exist. It is now
  `RefKey<'User'>`, which is `` `User:${string}` ``. Runtime is unchanged.
- **`foldkit-mixins-crud`: `DetailView`'s root is a `div` in every state.** It
  was the `dl` while showing a value, and a `div` around a status line
  otherwise, so a style or behaviour on `root` covered different elements as
  the read changed, and missed the alert a failed refresh shows beside the
  value. The `dl` now has a slot of its own, `list`, and carries `aria-busy`
  while refreshing.
- **`foldkit-remote`: a failed refresh stays owed.** `QueryFailed` cleared the
  connection's stale mark, so once "load more" landed a later page and settled
  the failure, the list read `Ready` with its first page still outdated and the
  refresh never retried. The connection now stays stale; the failure is what
  stops the planner asking again, and whatever settles it lets the refresh run.

### Added

- **`foldkit-remote-server`: `RemoteServer.memory`, a backend held in memory.**
  Give it the domain and some rows, and its `layer` is a `RemoteClient`, so a
  first run, a test or a demo needs no database and no network. Reads go
  through the same `handlers` a real server uses, so fields, nested relations
  and relation pages arrive as production sends them. A `Query.define` body is
  run over the rows by the reference interpreter and paged by row id, as a
  keyset: a page ends where the next begins, and "load more" keeps working
  after the last row stops matching. Mutations are yours to give, and write
  through the store they are handed. No live changes, no authorization.
- **`foldkit-remote`: `Data.why(model, projection, { surfaces })`.** `Initial`
  means nothing is fetching a read, and in practice it is almost always wiring.
  `Data.why` tells the two usual mistakes apart: `NotObserved`, when no active
  Surface asks for all of the read, and `NotFetching`, when one does and
  Remote's Subscriptions are not running. It names the Surfaces involved and
  says what to do. For every other state it says in words what the state means.
- **`foldkit-remote`: `Remote.patch(entity, id, values)` and
  `Remote.ref(entity, id)`.** An optimistic patch or a connection change for a
  `foldkit-entity` Entity had no direct spelling: it needed
  `Entity.from(Project).patch(...)` with Remote's `Entity`, whose name collides
  with `foldkit-entity`'s. Both take either kind of entity and check `values`
  against its fields.
- **`foldkit-crud`: `refresh(model)` on the editor**, like placed lists and
  details, for a retry button while `status` is `LoadFailed`.

### Fixed

- **`foldkit-remote`: a read waiting on a related entity reads `Loading`.** It
  read `Initial`, so a live patch that moved a project to a new owner dropped a
  value that was on screen into the "nothing is fetching this" state while the
  owner loaded. Loading is now checked through relations, for entity reads and
  list rows alike.
- **`foldkit-remote`: a refresh retries a related entity whose read failed**,
  even when the server does not expand the relation, as servers need not.
- **`foldkit-remote`: retention forgets a field read nothing waits for any
  more**, as it already did for a list's query, so an interrupted read cannot
  leave a value reading `Loading` for good.
- **`foldkit-remote`: a hydrated value settles the failure of the field it
  writes**: every field under `replace`, and under `preserve-existing` only
  those of entities the store did not hold.
- **`foldkit-crud`: an editor opens on the last good value when its refresh
  failed.** It stayed in `LoadFailed` with an empty form, though the value was
  in `previous`. It now fills from it.
- **`foldkit-mixins-crud`: an empty list that failed to refresh says it was
  empty**, under the failure, instead of showing the alert alone.

### Deprecated

- **`foldkit-surface`: `App.fields` is deprecated; use `App.model`.** They
  were the same references under two names, and the docs used one while the
  tests used the other, so a reader could reasonably think they differed. This
  reverses the Surface README's earlier advice to prefer `fields`, which was
  written before the APIs that settled on `model`: `App.surface` hands a
  Surface `{ model }`, and `Remote.make` and `Editor.at` take
  `model: App.model.…`. `App.fields` still works, is the same object, and is
  marked `@deprecated` so an editor points at the new name. It will be removed
  in a later minor.

## 0.9.0

`foldkit-entity` 0.3.0; `foldkit-surface` 0.4.0; `foldkit-remote`,
`foldkit-remote-server` and `foldkit-remote-drizzle` 0.6.0; `foldkit-crud` and
`foldkit-mixins-crud` 0.2.0. Republished only so their pinned dependencies are
the current ones: `foldkit-agent` 0.3.2, `foldkit-bundle-surface` 0.1.2,
`foldkit-cms` and `foldkit-cms-drizzle` 0.1.1, `foldkit-form` and
`foldkit-mixins-form` 0.1.2, `foldkit-mirror` 0.2.2 and `foldkit-sync` 0.5.3.
`foldkit-mixins-surface` 0.3.1 moves its peer range to `foldkit-surface@^0.4.0`.

**Remote reads now tell the truth about failure and loading.** A request that
failed used to leave a read at `Initial`, which looks exactly like "nobody
asked", and nothing asked again, so a list could sit empty for good with no sign
of an error. A failed refresh read `Ready`, as if it had worked. Now a failed
read is `Failed`, keeping what was on screen as `previous`. It is retried when
something asks for it, never in a loop. A list whose first page is on its way
reads `Loading`. The CRUD views keep the rows through a failed refresh and can
offer a **Try again** button.

**The client can run a query over the rows it already holds.** The reference
interpreter moved to `foldkit-entity`, so `Data.filtered` can filter a loaded
list without asking the server, and says whether its answer covers the whole
list. Live inserts are judged against the query before the declared policy is
used.

**Also:** a list can survive a reload (its rows, never its cursors),
`Data.explain` describes a query read in one serializable value, and
`Surface.when` makes why a Surface is active something a tool can read. Two
declared behaviours that had never been wired now work: a connection's
`LivePolicy`, and live invalidation.

### Upgrading from 0.8

Upgrade every `foldkit-*` package you use together. They pin each other's
versions exactly, and `foldkit-mixins-surface` 0.3.0 does not accept
`foldkit-surface` 0.4. Most applications then need only the first two steps.

1. **Persistence takes a `Snapshot`.** Wrap the Model in `snapshotOf`, and pass
   both halves of what comes back to `Hydrated`:

   ```ts
   // 0.8
   RemotePersistence.dehydrate(model.remote.entities, { scope })
   // 0.9
   RemotePersistence.dehydrate(RemotePersistence.snapshotOf(model.remote), { scope })

   const restored =
     RemotePersistence.hydrate(text, { scope }) ?? RemotePersistence.emptySnapshot
   Data.reduce(model, {
     _tag: 'Hydrated',
     entities: restored.entities,
     connections: restored.connections,
     merge: 'preserve-existing',
   })
   ```

   `REMOTE_CACHE_VERSION` is 4, so a cache written by 0.8 is discarded once
   and refetched, never misread.
2. **`Failed` now also means the request failed**, not only that stored data
   did not decode. `RemoteData.render` already draws `Failed { previous }` as
   the old value with a `Stale` freshness, so a view built on it needs nothing.
   A view that matches `Failed` itself should draw `previous` when it is there.
   Nothing retries a failed read on its own, so give the user a way to ask:
   `Data.refresh(model, projection)`, a placed list's or detail's
   `refresh(model)`, or `onRetry` on `ListView`/`DetailView`.
3. **One new Remote Message, `QueryStarted`.** Code that spreads
   `Remote.messages` into its union and routes through `Data.reduce` or
   `Data.wiring` needs nothing. A hand-written exhaustive switch over Remote's
   Messages needs one more case.
4. **A `RemoteModel` built by hand** (rather than from `Remote.initial`) needs
   `failures: noFailures`.
5. **Removed:** `invalidateConnection`, `isStale`, `refreshConnection` and
   `LiveState.stale`. They recorded staleness that nothing read. To invalidate
   a connection, reduce `ConnectionInvalidated`.
6. **`Expr.contains` accepts only text** (a text field, nullable included, or
   an `Expr<string>`). A number field used to typecheck and then fail in the
   database.
7. **A hand-written `DomainLike`** passed to `foldkit-crud` needs `refresh`.
   Remote's own domain already has it.

`evaluate`, `supported`, `assertSupported` and `Row` can now be imported from
`foldkit-entity`. Their old home, `foldkit-remote-server`, still re-exports
them, so nothing has to move.

### Breaking

- **`foldkit-remote`: a snapshot is a `Snapshot`, not a store.**
  `RemotePersistence.dehydrate`, `hydrate`, `save` and `restore` take and return
  `{ entities, connections }` rather than an `EntityStore`. Build one with
  `RemotePersistence.snapshotOf(model.remote)`; to get the old behaviour, name no
  connections. That is the default. `restore`'s fallback is
  `RemotePersistence.emptySnapshot`, which replaces returning `emptyStore`.
  `REMOTE_CACHE_VERSION` is 4, so a cache written by an earlier version is
  discarded, never misread. Migrating: `dehydrate(model.remote.entities)`
  becomes `dehydrate(RemotePersistence.snapshotOf(model.remote))`, and code
  that used the value `restore` returns as a store reads its `.entities`.
- **`foldkit-remote`: `invalidateConnection`, `isStale` and `refreshConnection`
  are gone, and so is `LiveState.stale`.** They kept a second record of stale
  connections that no read or plan consulted, so an invalidation written
  through them had no effect (see Fixed below). A connection's staleness is
  its own `stale` flag. To invalidate one, reduce `ConnectionInvalidated`.
- **`foldkit-remote`: a read whose request failed reads `Failed`.** Before, a
  query or entity read that failed before anything loaded read `Initial` and
  was never asked for again, because nothing it planned had changed. One that
  failed to refresh read `Ready`, as if nothing had happened. Now failures are
  kept in `RemoteModel.failures`, as `{ connections, fields }`. A read with
  nothing to show reads `Failed { error }`, and one with a value reads
  `Failed { error, previous }`, which `RemoteData.render` draws as data with
  `Stale` freshness. A list fails when a row's field failed, and a read through
  a relation fails when the target's did. What failed is not asked for again on
  its own. `Data.refresh` retries it, including something that never loaded.
  The value arriving, a live invalidation or delete, or retention dropping it
  also clears it. `Remote.inspect` reports `failures`. A view that matched on
  `Failed` for decode errors only will now also see request failures, and code
  that builds a `RemoteModel` by hand needs `failures: noFailures`.
- **`foldkit-remote`: a broken live stream records a gap instead of ending a
  read.** Its `ReadFailed` now carries the `stream` and adds it to
  `RemoteModel.gaps`. It no longer clears the loading and stale marks of the
  fields it watched: nothing was reading them, and a read in flight for the
  same fields used to lose its `Loading`.

### Added

- **`foldkit-remote`: `Data.filtered(model, over, by, input)` filters a loaded
  list on the client.** It runs the body of `by`, a registered `Query.define`
  query, over the rows of the connection `over` reads, and returns
  `{ items, complete }`. The items are decoded through `over`'s own Selection,
  so one view function renders a filtered item or a listed one. It filters a
  list and does not run a query: `complete` is true only when every row was
  judged, every match could be shown, and the list is terminal at both ends
  with no gap. An empty, incomplete answer means "none that I can see yet",
  which is a different answer from "none". It creates no connection and fetches
  nothing. It throws when `by` reads a different Entity from `over`.
- **`foldkit-remote`: `Remote.matching(store, descriptor, input)`**, the
  primitive under `Data.filtered`. It returns the keys a body matches among the
  rows the store holds, plus the keys it skipped because a row lacked a field
  the body reads. The input is given decoded and encoded through the
  descriptor's `Input`. The store holds wire values, and a decoded input
  compared against them matches nothing, with no error.
- **`foldkit-remote`: a declared connection survives a reload.**
  `snapshotOf(model, { connections: [ref] })` keeps that connection's edges,
  segment by segment, and never its cursors, because a cursor may name server
  state that no longer exists. A restored connection has `Unknown` boundaries
  and is stale, so its rows show at once, it reads as `Refreshing`, and the
  planner refetches it. It reports `hasNext` and `hasPrevious` as true in both
  directions, because `Unknown` is not `Terminal`.
- **`foldkit-remote`: a live insert is judged before the declared policy is
  used.** For a connection whose query has a body, an inserted row that the
  client holds and can tell does not match is ignored. A row that matches, or
  that the client cannot judge, gets the connection's `LivePolicy`. A row held
  with a stale value in a field the body reads counts as one it cannot judge,
  so an outdated value never suppresses an insert.
- **`foldkit-remote`: `Data.explain(model, projection, { surfaces? })`**
  returns one serializable value describing a query read: the definition and
  its input, the connection identity, the window, the Selection, the body as
  text with its dependencies, and what the read answers from this Model. Given
  the application's Surfaces, it also lists every active Surface that reads the
  connection and why each is active.
- **`foldkit-surface`: `Surface.when(surface, place, Case, value => params)`**
  activates a Surface while a place in the Model holds one case of a tagged
  union, with the case's fields inferred for `params`. It does what `Surface.at`
  does, but the place and the tag are values, so `Data.explain` can report why a
  Surface is on. It takes a `ModelPlace` (`dependency` and `get`), which a
  `ModelRef` satisfies. `Surface.at` is unchanged.
- **`foldkit-entity`: `Expr.show` and `Query.show`** render a body as text for
  reading. This is deliberately not SQL: an input shows as `$name`, and
  `contains` is named rather than rendered as any dialect's `like`.
- **`foldkit-entity`: `evaluate`, `supported`, `assertSupported` and `Row`**
  are exported from `foldkit-entity`. The reference interpreter depends only on
  the IR, and a client needs it without a server package.
  `foldkit-remote-server` still re-exports all four, so existing imports are
  unchanged.
- **`foldkit-entity/conformance`**, a new subpath, holds the conformance suite
  (`Subject`, `rows`, `cases`) that every interpreter runs. The fixture has an
  `at` column whose encoded form differs from its domain form, so an
  interpreter that compares decoded values fails.

### Fixed

- **`foldkit-mixins-crud`: a failed refresh keeps the rows on screen.**
  `ListView` and `DetailView` drew any `Failed` as a lone error, which was
  right while only decode errors produced it. Now that a failed refresh reads
  `Failed { previous }`, they draw the previous rows or value with the error
  above them. `onRetry` on either view adds a **Try again** button (the `retry`
  slot, worded by `words.retry`), and `foldkit-crud`'s placed lists and details
  gain `refresh(model)` for its Message to return.
- **`foldkit-remote`: a list waiting on its first page reads `Loading`.** It
  read `Initial`, which is documented as "nothing is fetching this", so a view
  could not tell a slow network from a Surface that was never activated. The
  read entry now sends a new `QueryStarted` Message before it runs queries,
  and the page or the failure ends it. Retention dropping the list forgets it,
  so a query the entry stopped waiting for cannot leave a list `Loading` for
  good. An application whose own code switches exhaustively over Remote's
  Messages has one more case.
- **`foldkit-remote`: a declared `LivePolicy` is honoured.**
  `Query.connection(E, { live })` was typed, carried on the descriptor and
  documented, but nothing set the policy on a `LiveReceived` Message, so every
  live insert used the default. The bound `reduce` now resolves the policy.
- **`foldkit-remote`: a live invalidation invalidates the connection.** A
  server's `ConnectionInvalidate` event and a `LiveInsertion` of `'invalidate'`
  used to advance the cursor and do nothing else. Both now mark the connection
  stale, so it reads as `Refreshing` and the planner refetches it.
- **`foldkit-remote`: a page bigger than the window that asked for it is
  refused.** More edges than `first` or `last` requested is now `QueryFailed`
  with a protocol error that carries both numbers. The edges never reach the
  store, and a connection already loaded keeps the rows it had.
- **`foldkit-remote-drizzle`: a `contains` whose search is null compiles.**
  It threw at compile time. It is now SQL's unknown, so a negated or compared
  `contains` over a missing input means what the reference interpreter says it
  means, rather than stopping the request.
- **`foldkit-entity`: `Expr.contains` accepts only text.** A number field
  typechecked and reached the database as `lower(rank) like …`, which SQLite
  coerces and Postgres rejects at runtime. Its operand must be a text field
  (nullable included) or an `Expr<string>`. Code in this repository needed no
  change.

### Interpreters

- **How text compares when ordering is the backend's, and outside the
  conformant subset.** A third interpreter (TanStack DB, in `examples/tanstack`)
  sorts strings by locale where SQLite sorts by code point, and the semantics
  had said nothing at all about collation — two interpreters written here had
  agreed, and the agreement had been mistaken for a rule. Picking code point and
  enforcing it was the first answer and the wrong one: SQLite without ICU cannot
  sort by locale, Postgres would need `COLLATE "C"` on both the ordering and the
  keyset comparison that pages it (losing the index built in its own collation),
  and code point puts every capital before every lowercase. No interpreter
  changed behaviour; the conformance suite (now `foldkit-entity/conformance`)
  drops its text-ordering case, because it pinned whichever engine was written
  first rather than anything promised.

- **`foldkit-entity`: `Query.unsupported(query, supported)` and the `Operation`
  vocabulary.** The operations a query needs that an interpreter does not run,
  so it can refuse rather than skip one — skipping answers a different question
  and still passes every case it does support. The refusal belongs to the
  interpreter, since one that compiles at registration and one that runs a body
  directly fail at different moments.
- **Both interpreters declare what they run.** `foldkit-remote-drizzle` checks
  at registration, beside its column check, so a server that starts is one whose
  queries it can answer; the reference interpreter exports `supported` and
  `assertSupported` (from `foldkit-entity`, re-exported by
  `foldkit-remote-server`), and `evaluate` calls it. Both currently run the whole
  kernel, so there is nothing to refuse yet; it exists for the interpreter that
  does not.

## 0.8.0

`foldkit-entity` 0.2.0; `foldkit-remote`,
`foldkit-remote-drizzle` and `foldkit-remote-server` 0.5.0; `foldkit-cms`,
`foldkit-cms-drizzle` and `foldkit-mixins-crud` published for the first time at
0.1.0. `foldkit-crud`, `foldkit-form` and `foldkit-mixins-form` are republished
at 0.1.1 only so their pinned `foldkit-entity` is the current one — every
package pins its workspace dependencies exactly, so a dependent left behind
would install a second copy of it.

- **`foldkit-entity`: `Expr.isNull` / `Expr.isNotNull` / `Expr.contains`, and a
  predicate may stand where a boolean is wanted.** The three operations the CMS
  worklist needs, and no more. `isNull` and `isNotNull` are one node with the
  answer absence gives flipped, so nothing has to negate a predicate.
  `Expr.eq(Expr.isNotNull(field), input.flag)` is how a query depends on an
  input without branching on it — a body is built once, so there is nothing to
  branch on. `contains` treats the empty string as everything, which makes an
  empty search box the same query as a full one; over a **nullable** column that
  is not the same as no filter, because a null contains nothing. It is
  **case-insensitive** (ASCII folding), which is stated rather than left to the
  backend: SQLite's `like` ignores case and Postgres's does not, so a body that
  left it open would mean two things. On Postgres this makes the CMS search
  case-insensitive where it was not.
- **`foldkit-cms`: the worklist is declared by what it means.** `CmsEntries`
  carries all three of its questions and its order, so `foldkit-cms-drizzle`
  registers it as `query(descriptor, { entity })` and the `and(eq, ternary,
  ternary)` written in Drizzle's dialect is gone. Same rows, same escaping of
  `%` and `_`, same audience boundary — the boundary is conjoined with the body
  by `visible`, as for every other source.
- **`foldkit-remote-drizzle`: a predicate compared to a boolean is resolved at
  request time**, into that predicate or its negation, rather than sent to the
  database as a boolean parameter — which dialects disagree about, and which
  SQLite refuses outright. The SQL is then exactly what a hand-written
  `archived ? isNotNull : isNull` produced.

- **`foldkit-remote-server`: `evaluate`, the reference interpreter.** Runs a
  query body over rows already in memory — pure, reading the rows it is given and
  nothing else. It is what makes a body source-neutral in fact rather than in
  principle: the tests run the same body through it and through
  `foldkit-remote-drizzle` against a real SQLite, and require the same ids in the
  same order. **It follows SQL, not JavaScript** — `null = null` is unknown and
  matches no row, where JavaScript would call the two equal. It refuses rather
  than guesses in two places: ordering by a column that is null in some row
  (SQLite sorts nulls first, Postgres last, so there is no answer to be
  conformant to), and comparing values it has no order for.

- **`foldkit-remote-drizzle`: a query body compiles to SQL.** A descriptor
  declared with `Query.define` needs only `query(descriptor, { entity: binding })`
  — the columns and the order come from its body, through the binding that knows
  which column holds which field. A field the binding has no column for is refused
  when the source is registered, not when a request arrives — a predicate's
  fields as well as an ordering's, so a server that starts is a server whose
  queries can be answered. A body order that does not already end on the id gets
  it appended, exactly as a computed `orderBy` does, since a body says what the
  rows mean and not how a cursor walks them; a literal `orderBy` given at
  registration is left as written. The compiled
  predicates are **conjoined** with the server's own `where` and the binding's
  `visible` rule, so a body is the application's question and never widens what a
  principal may see; an `orderBy` given at registration replaces the body's, since
  a connection pages on exactly one order. `Query.make` is unchanged and still
  requires an `orderBy`.
- **`foldkit-cms`: `Cms.bySlug` is declared by what it means.** Its body is
  `eq(the slug field, input.slug)` ordered by id, so `foldkit-cms-drizzle`
  registers the source without restating the `where` or the order in Drizzle's
  dialect. The audience boundary is unchanged: a visitor still finds only
  published rows, because visibility is conjoined with the body rather than
  expressed by it.

- **`foldkit-remote`: `Query.define`, a query declared by what it means.**
  `Query.define(name, Input, ({ input }) => body)` returns an ordinary
  `QueryDescriptor` — the same name, `Input`, `ref` and connection identity
  `Query.make` gives — carrying its `body` besides, with the result a connection
  over the Entity the body reads so it is not named twice. A server can compile
  that body instead of being told the same thing again in its own dialect; one
  that would rather answer the query its own way still can, and a descriptor
  from `Query.make` has no body at all. The body is built **once**: `input.slug`
  is a placeholder typed from `Input`, never the value, so a condition that
  depends on what was passed is a comparison over the placeholder. A body needs
  a `foldkit-entity` Entity (`Entity.define`), which is what has addressable
  `fields`; this package's own `Entity.make` describes a field as the schema of
  its value and has nothing to point at. `Input` must be fields or a plain
  `Schema.Struct`: a codec exposing no keys is refused at declaration rather
  than handing the body an empty object, which would compare a column to
  nothing while every type agreed.

- **`foldkit-entity`: `Query`, which rows a query is about.** An Entity to
  read, the predicates every row must hold, and the order to read them in,
  composed with `pipe`: `Query.from(Post).pipe(published, newest)`. Each step is
  a new frozen value and performs no work. **Two `where`s conjoin and two
  `orderBy`s append** — neither replaces, so piping a fragment can only narrow a
  query, and `Query.unfiltered` / `Query.unordered` are the only ways back. A
  predicate or ordering term over a different Entity than `Query.from` is
  refused where it is piped, by identity rather than by name. The
  list of predicates *is* the conjunction, which is why there is still no
  `Expr.and`: three conditions are three `where`s. `foldkit-remote` spreads
  these into its own `Query`, so `Query.make` and `Query.from` come from one
  import instead of two namespaces of the same name.

- **`foldkit-entity`: `Expr`, a query's scalar computations as values.** An
  Entity says what a domain has; an `Expr` says something about one row of it.
  `Expr.eq` compares two scalars, coercing a field or a plain value on either
  side; `Expr.input(key, schema)` stands for a value the query is given when it
  runs; `Order.asc`/`Order.desc` is one term of an ordering;
  `dependenciesOf(...)` says which fields and inputs an expression reads and
  which operations it uses. Building one performs no work — an interpreter
  compiles it, which is what will let one query mean the same thing in more than
  one place. Comparing a field to the wrong kind of value is an error where it is
  written. Only `eq` exists: the operator set grows from real queries in this
  repository, not from what a database could express. First step of
  [data-query-DESIGN](docs/design/data-query-DESIGN.md) §32, sized to the CMS's
  `bySlug`.

- **`foldkit-remote`: `Data.confirmed(projection)`.** The same projection read
  over the server-derived store alone, with the pending optimistic layers and
  connection overlays left off. It plans exactly what the projection plans, so
  observing it fetches what observing the projection fetches and only what it
  shows differs. For a reader that must not believe a change until the server
  has agreed — in practice `Agent.when({ projection: Data.confirmed(...) })`.
  There is deliberately no `Data.visible`: a projection already is the visible
  read. async-semantics-DESIGN gated this on Remote having optimistic mutation
  layers; the CMS's preview built them, and nothing had gone back to notice.
- **`foldkit-remote`: `RemoteData.render(data, cases)`.** The view-oriented
  fold: the six states as the three a view draws, keeping useful data on screen.
  `Initial`/`Loading` reach `loading`, `Ready`/`Refreshing` reach `data`, and a
  `Failed` still carrying the value it had reaches `data` too, so a failed read
  does not throw away what the reader was looking at. `notFound` is its own
  branch and not optional. The `data` branch is told which it got through one
  `Freshness` tag (`Fresh` / `Refreshing` / `Stale` with its error), not a pair
  of booleans that could claim both. `match` is unchanged and still the
  exhaustive fold.
- **`foldkit-remote`: a refresh restarts only what it refreshed.** The refresh
  generation was one counter on the Remote store, which every read entry carried
  as a dependency, so refreshing one Projection restarted every read stream and
  cancelled every read in flight. Generations are now per field mark and per
  connection identity, and an entry takes the highest over what it plans. A
  connection needs its own mark: a `networkOnly` entry observing an invalidated
  connection plans the same query either way. `refresh` moves from a Struct to a
  runtime field in the Model schema, beside `loading` and `gaps`. The marks are
  collected with the entities and connections they belong to, so they stay
  bounded by what the Model holds rather than by how often it has refreshed.
- **`foldkit-remote`: `Data.inspect(model).loading`.** The reads in flight,
  beside `mutations.pending` for the writes, so a tool can answer "what is
  Remote doing now" from the Model rather than from the fibers doing the work.
- **The optimistic vocabulary is stated once.** Remote and Sync mean the same
  four words by different mechanisms — confirmed or committed, plus pending, is
  visible; settled is answered either way. `docs/state-model.md` says it with
  both packages' names side by side, and both READMEs point there.

- **`foldkit-form`: a form can say what it is editing.** A check is given the
  key's value and whatever else in the form decodes, which is not enough to ask
  "is this address taken?": a post's input carries a title and an address, not
  the row's id, so the check cannot tell a post's own address from someone
  else's. `FormModel` gains `subject`, a plain record set with
  `Message.About({ subject })` and read with `form.subject(model)`, and a check's
  context gains it. It changes no draft, answers no submit, and survives `fill`
  and `Reset`. `Cms.editor` sends it the row's id as it opens, so a content
  type's slug check knows which row to pass over. This is the seam the CMS design
  doc recorded as missing.
- **`foldkit-form`: a check that needs something can now be added at all.**
  `Form.make` and the `Form.checks` step both read a check's requirement (`R`)
  as `never`, because Effect's `R` is not an inference site a mapped type wins —
  so a check needing `RemoteClient` was refused by the shape meant to accept it,
  and the documented "the check's requirements become the Bundle's" was
  unreachable. `Form.checks` now reads the requirement off the functions it is
  given, and a type test pins it. `Form.make`'s options still cannot infer it;
  the README and the skill say to use the step.
- **`foldkit-cms`: `Cms.addressFree(type)`.** A form check that says while the
  author types what a publish would refuse. It asks the content type's `bySlug`
  query — which an author reads through the same binding as everyone else, so it
  sees unpublished rows too — and excepts the row the editor says the form is
  about. It needs no new server surface. It is advice, deliberately not the rule:
  two authors can both be told an address is free, and the server refuses the
  second on the same key. A check that cannot reach the server says nothing.
- **`foldkit-cms`: `Cms.editor`, the authoring editor's state.** A Bundle around
  the content type's form: autosave after a rest, valid or not; publish by
  submitting the form, saving first; a draft resumed by its saved Model, then its
  values key by key, then what is published, and never failing to open;
  `Conflict` with reload and overwrite; discard. End to end tests drive it
  against the real server over SQLite.
- **Scheduling and archiving.** `CmsSchedule` promises a draft that would publish
  now, `CmsUnschedule` takes it back, and `cms.due(now, { as })` publishes what has
  come due, each in its own transaction, as whoever scheduled it; a failure stays
  scheduled with its reason and waits for the draft to change. The package owns
  no timer. `CmsArchive` also takes what can be hidden off show. The editor gains
  `ScheduleAsked({ at })`, which submits and saves first, and `UnscheduleAsked`,
  `ArchiveAsked`, `UnarchiveAsked`. `cms_drafts` gains `scheduled_by`.
- **Review of the CMS, and what it fixed.**
  - *Security:* a scheduled draft is published as whoever scheduled it, and any
    author could save, restore or discard over it, so an author who may not
    publish could publish through one who may. That is now refused to anyone
    `allow` would not let `schedule`.
  - *Correctness:* `Transaction.statements` takes turns at its one connection; a
    write arriving between another request's `begin` and `rollback` was rolled
    back with it after being reported done. Every operation is now one
    transaction, so a save cannot leave an entry without its draft.
  - The worklist's search treats `%` and `_` as characters, and a draft's size is
    bounded (`maxDraftSize`, one million characters of JSON by default).
  - The editor asks once when publish is pressed twice; lists a draft by what its
    author typed, valid or not; forgets an old failure at the next save; resumes
    a stored Model with nothing in flight (`form.settled`, new in `foldkit-form`);
    follows a previewed post to the row publishing gives it; and gains `flush`,
    for an author who leaves within the rest of their last edit.
- **A server's word about one key, on that key.** `foldkit-form` gains
  `Message.Refused({ key, error })`: the key reads invalid with that reason,
  keeps what was typed, and clears on the next edit. `Checked` could not serve,
  since it only answers a check the form itself started. `Cms.editor` uses it, so
  a publish refused for a taken address marks the address, with nothing to wire.
- **`foldkit-cms`: `Opened`, beside `Editing`.** `Editing` meant both "open and
  idle" and "edited since the last save", so no application could word its status
  truthfully. `Editing` now means there are unsaved edits, `Opened` means the form
  is as it was found, and a draft the form was filled from reads `Saved`.
- **`examples/cms`**: a post from its first keystroke to being taken off show, from
  three chairs, over SQLite, with its transcript pinned, and the same application
  in a browser (`pnpm dev`) where the chair is in the address. `foldkit-cms` gains
  `Cms.editorView` and the editor's `pageId`, which the browser mode needed, and
  annotates an entry's `id` as hidden and its `state` with a title, so a worklist
  shows Title and State rather than a raw uuid and a lowercase header.
- **In-app preview.** `foldkit-remote` gains `Data.overlay(model, id, operations)`
  and `Data.lift(model, id)` (`OverlayShown`, `OverlayLifted`): optimistic
  operations shown with no request behind them. A content type's `preview` says
  how a value would look in the store, and the editor's `PreviewShown` lays what
  is in the form over it, edit by edit, until `PreviewHidden`.
- **Restoring.** `CmsRestore` makes a revision's value the working copy and
  publishes nothing; the editor's `RestoreAsked({ revision })` shows it in the form.
- **`foldkit-cms`: kinds and their renderers.** `Cms.slug(from)` and
  `Cms.dateTime()` for a form's `inputs`; `Cms.Display.State` and
  `Cms.Display.Moment`, which `Cms.Entities` are annotated with;
  `Cms.controlRenderers()` and `Cms.displayRenderers()` to spread beside the
  mixins' own. `foldkit-cms` now depends on `foldkit-crud`.
- **Breaking, `foldkit-cms` and `foldkit-cms-drizzle`:** `CmsSaveDraft`'s `entry`
  is required, and the first save of an id nobody has makes the entry
  (`Cms.newEntryId()`), because a mutation's status carries no output for a
  client to learn a server-made id from. `CmsEntry` gains `revision`, a column of
  `cms_entries`, which a publish compares and sets inside its transaction. Every
  operation patches the entry with its `state`. `newId` is gone from the server's
  config. A save based on a draft that is gone no longer leaves an entry behind.
- **Fix, `foldkit-remote`:** `Data.refresh` of an entity known to be absent asks
  for it again, as the README said it did. It did nothing: a tombstone has no
  field to mark stale, and nothing planned a read of it.
- `foldkit-form`: `form.partial(model)`, what decodes as it stands, by key.

- **`foldkit-cms-drizzle` 0.1.0 (new): drafts, publishing, and the audience boundary.** The
  entries, drafts and revisions tables for SQLite and Postgres; `CmsSaveDraft`
  (compare and set on what the save was based on, so a second author is a
  conflict) and `CmsDiscardDraft`; the `Cms.Entries` worklist; an entry's state
  derived with the server's clock. To a principal that is not an author, the
  three tables are empty on every read path and every operation is refused, and
  `published(column, isAuthor)` makes a content table's `visible` rule, which
  `CmsServer.make` requires of a type that can be unpublished. `CmsPublish` runs
  the application's own `create` or `update` handler with the draft's value,
  inside a transaction (`Transaction.statements` or `Transaction.drizzle`) that
  also shows the row, appends the revision and removes the draft; a publish made
  from an older revision is a conflict. `CmsUnpublish` hides the row and keeps it.
  A visitor is refused before anything is looked up. A `slug` role adds a
  `<name>BySlug` query (`Cms.bySlug`), and a publish to a taken slug fails as
  `CmsSlugTaken: <key>: ...`, whether the check or the unique index caught it.
  `foldkit-cms` gains `Cms.Entries`.
- `foldkit-remote-drizzle`: a derived member may be `{ supplied: true }`: bound,
  and answered by the application's own source.

- `foldkit-remote-drizzle`: **row visibility.** A binding takes
  `visible: principal => SQL | undefined`, applied on every path its table is
  read: by id, as a relation's children (listed, counted, paged), as the target
  of a `one` ref (which reads `null`), and through a query. Before this, a
  by-id read and a query returned any row to any principal; only a collection
  relation could be filtered, through `policies`.

- **`foldkit-cms` 0.1.0 (new): the pure core.** `Cms.roles` marks the members of
  an Entity that play a CMS part (`label`, `slug`, `published`) as metadata, read
  with `Cms.rolesOf`. `Cms.content` declares a type of content: its Entity, its
  form, the application's own publish operations, its words. `Cms.Entities`
  (`Entry`, `Draft`, `Revision`) and `Cms.Operations` are ordinary Entities and
  Remote mutations. `Cms.state` and `Cms.offers` derive an entry's state and its
  transitions from facts and a clock; nothing stores a status. No server yet.

- `foldkit-form`: `Input.following(key, through)` writes a key's draft from
  another key until the author writes it themselves (a slug from a title).
  Emptying it hands it back, and a form filled with a value for it does not
  follow. The Model gains `touched`; a control gains `follows`; a form gains
  `isFollowing`, and a drawn field is told `following`. The first step of
  [the CMS design](./docs/design/cms-DESIGN.md).

- `foldkit-remote`: `Selection.from` compiles an Entity Selection once. `Data.get`
  and `Data.query` are called with one on every render, and compiling it each
  time rebuilt its schemas and missed Remote's read cache, which is keyed by the
  Selection: a list read is about eleven times faster, and repeated reads now
  return the same value, not an equal one.

- **`foldkit-remote` and `foldkit-remote-server`: a relation may be read whole and
  by the page at once.** A page of a whole list (`Entity.page`, or
  `Selection.connection` over an array of refs) is read under an alias,
  `comments@first=10`, so it is a field of its own to the store, the planner and
  the wire; `RemoteServer` reads the alias apart and answers under it, and the
  live hub re-reads a subscriber's page when its list changes. A write to the
  list marks its pages stale. Requirements for such a Selection now name the
  alias in `fields`, `windows` and `relations`. A request may page one
  relation at most four ways, since each is a source read the client names, and
  `Entity.make` refuses a field whose name contains `@`. Both packages must be
  upgraded together: an older server does not know an alias. `RELATION_ALIAS`,
  `relationAlias` and `aliasedField` are exported.

- **Words are text. Breaking.** `FormMessages` entries may be text with blanks
  (`'{label} is required'`). `foldkit-mixins-form` takes `words: { submit, search, add, remove }`
  in place of `submitLabel`, `searchLabel`, `addLabel` and `removeLabel`, and
  `foldkit-mixins-crud`'s `failed` is text (`'{message}'`); both were functions in
  places, which Foldkit refuses inside a placed view's inputs. The three shapes
  share no key, so one object serves all. `fillWords` is exported by `foldkit-form`.
  New dependency of `foldkit-mixins-crud`: `foldkit-form`.

- `foldkit-form`: forms pipe. `Form.inputs`, `Form.checks`, `Form.messages`,
  `Form.nested` and `Form.debounce` are steps that give a new form with the
  option added to. A form now carries `name`, `options`, and `pipe`.

- `foldkit-entity`: `Entity.fields(entity, ...keys)` gives field schemas to spread
  into an input's struct, and an `Entity.input` mapping may name a member by its
  key (`{ authorId: 'author' }`).

- **Typed ids reach the read.** An Entity `Selection` carries its Entity's id type
  (a fourth, defaulted type parameter), and `foldkit-remote`'s `Data.get` /
  `Data.live` take it. **Breaking** for an Entity with a branded `id` read with a
  plain string. `Crud.remover` takes `id: 'id'` in place of `input` when the
  mutation's input is just the id.

- `foldkit-crud`: `Sort.make(columns)` is a list's sort state written once: its
  schema, `toggle`, and the `sort` input a drawn table takes.
  `foldkit-remote-drizzle`: `sortTerms(sort, columns)` reads that state into order
  terms through the columns the server offers.

- `foldkit-crud`: `Crud.actives({ ...pieces })` gathers the `active` of every placed
  editor, list, detail, and `Crud.options` result, for `Data.wiring`.

- **`foldkit-form`: a nested key takes a form. Breaking.** `nested: { author: AuthorForm }`
  replaces the recursing options bag; the form that edits an author alone is the
  one a post nests. `form.nested.author` is that form, typed, and
  `form.row('author', id)` gives its Message constructors wrapped for the row.
  Exports `FormFor`, `NestedForms`, `RowHandle`.

- **One primitive for controls, and one for displays. Breaking.** A form's
  `Control` is `{ kind, draft, shown, searches, data, parse?, unparsed? }` and a
  Crud `Display` is `{ kind, shown, data, text }`; both were closed unions on
  `_tag`. `Input.kind` and `Display.kind` make a kind, and the shipped ones
  (`Input.Text`, `Input.Number`, `Input.RelationOne`, ..., `Display.Flag`, ...)
  are made with them. Narrow with `Kind.is(control)` and read `control.data`
  where code read `control._tag` and its fields. `foldkit-mixins-form` draws by a
  table of `renderers` whose defaults are entries; `foldkit-mixins-crud` takes
  `renderers` by kind beside `cells` by column. `FormMessages.notANumber` is
  `unparsed`. `Input.search()` is a `ControlChange`, not a control.

- **`foldkit-mixins-crud` 0.1.0 (new).** Draws a `Crud.list` as an accessible
  table and a `Crud.detail` as a description list through Mixins slots. Opening
  a row, sorting, and loading more are Messages the application passes in.
- **`Display`** in `foldkit-crud`: how a selected member shows, without a
  renderer. `list.columns` and `detail.fields` carry a `display`, set with
  `Display.of`, resolved from how a relation was selected or from the schema
  otherwise; `Display.show` is the text any view can fall back on. A list also
  exposes a type-only `Row`, and a detail a type-only `Value`. New dependency:
  `foldkit-metadata`.

- **Typed ids.** `foldkit-entity`: an Entity's `id` field keeps its type.
  `IdOf<E>`, `EntityRef<Name, Id>`, a ref schema that is the id's own, and
  `Relation.input` taking the target's id type. An `id` of `Schema.String` types
  as before; a branded one now rejects another Entity's id. **Breaking** only for
  code that mapped a plain `Schema.String` key to a relation whose target has a
  branded id: give the key the id's schema.
- `foldkit-remote-drizzle`: `bind` stores an optional `one` on the target's table
  (`{ foreignKey }`), the inverse side of a one-to-one, and refuses a foreign key
  that is not unique. `ManyRelation` gains `single`.
- `foldkit-remote-drizzle`: a `query`'s `orderBy` may be a function of the input
  and the principal, as `where` is, so a list sorts by what the user chose. A
  computed order without the id is tie-broken by it.
- **Pickers that search.** `foldkit-form`: `Input.search()` marks a relation
  picker as searching; the form holds the text (`Searched`, `form.search`). The
  form's Model gains `searches`. `foldkit-mixins-form` draws the search box
  (`search` slot, `searchLabel`). `foldkit-crud`: `Crud.options(form, lists, { chosen })`
  keeps what a picker holds among its choices and returns `active` to require
  those rows; a placed list gains `row(id)`, `choiceOf(model, id)` and `owner`.
- `examples/entity` shows a page of a relation (`Entity.page`) and a nested write
  (`Relation.nested`, a form that nests a form, a server that writes both).
- `foldkit-crud`: an editor's `open` and new `target(model)` use the Entity's id
  type; a remover takes the id type its `input` names; a list's rows are typed
  from its Selection with or without a `choice`.

## 0.7.2

The `v0.7.1` tag was pushed from an incomplete commit and published nothing.

- **`foldkit-admin` is now `foldkit-crud`**, and its export `Admin` is `Crud`
  (`Crud.editor`, `Crud.list`, `Crud.detail`, `Crud.remover`, `Crud.options`,
  `Crud.editorView`). Nothing else changed. The old name promised a drawn back
  office; the package is headless and serves any edit screen. `foldkit-admin`
  0.1.0 stays on npm, deprecated, pointing here.

## 0.7.0

Five new packages and the changes that let existing ones read them. Design and
the order things were built in: [entity-DESIGN.md](./docs/design/entity-DESIGN.md).

### New packages

- **`foldkit-metadata` 0.1.0.** The opaque, key-owned metadata from
  `foldkit-surface`, as its own package, with `Metadata.empty`, `Metadata.combine`
  and `Metadata.is` made public. Surface re-exports it, so no import changes.
- **`foldkit-entity` 0.1.0.** A domain declared once: `Entity.define`,
  `Entity.derived`, `Entity.relate` (all relations in one step, so Entities that
  point at each other type-check), `Entity.select` with an assembled schema, `Entity.page` for a `many` relation
  read a page at a time,
  `Entity.annotate` / `annotateMembers`, and, experimental, `Entity.input` with
  `selectFor` and `valuesFor`, and `Relation.nested` for an input key that holds
  the relation's target itself.
- **`foldkit-form` 0.1.0.** A headless form as a Bundle over core
  `fieldValidation`, built from an `Entity.input`, with its words supplied or
  translated through `messages`, and rules only something outside can answer as
  `checks`: debounced, stale answers dropped, and a submit that waits for them.
  A key mapped with `Relation.nested` holds rows of a nested form, which
  `foldkit-mixins-form` draws with add and remove buttons.
- **`foldkit-mixins-form` 0.1.0.** Draws a `foldkit-form` form as accessible
  HTML with every element a Mixins Slot.
- **`foldkit-crud` 0.1.0.** `Crud.editor`: a form, the Remote mutation its
  value feeds, and their Entity, joined into an edit or create screen.
  `Crud.list`: a Remote query and an Entity Selection, with columns and paging.
  `Crud.options`: each relation picker of a form fed by the list over its
  target. `Crud.editorView`: a form's view as the view of the editor around it.
  `Crud.remover`: a delete with a yes in between. `Crud.detail`: one Entity
  through a Selection.

### `foldkit-remote`

- `Remote.make` / `Remote.define` take `foldkit-entity` Entities beside
  descriptors, and `Data.get`, `Data.live`, `Remote.select` and a query's `select`
  take Entity Selections. `Entity.from` and `Selection.from` are the compile
  steps; an `Entity.page` compiles to a relation connection. New dependency: `foldkit-entity`.
- **Behaviour change.** A read the server answers without an id it was asked
  for by name now tombstones that entity, so its Projection reads `NotFound`
  instead of `Initial` / `Loading` for good. It is refetched only by
  `Data.refresh`, and a later write clears it. The unexpanded target of a returned
  ref is untouched; the planner asks for it by id next. A hand-written
  `RemoteClient` that returned partial batches on purpose must now return every
  entity it was asked for by id.
- A mutation can delete. `MutationOutcome.deleted` (and `deleted` on the wire's
  `MutationResult` and on `MutationSucceeded`) names entities that are gone; the
  client tombstones them, which removes them from every connection and relation.
  `reconcileMutation` and `settleSuccess` take the deletions as a last argument.
- `Data.mutation(model, requestId)` reads a mutation's outcome from the Model:
  `Pending`, `Applied`, `Failed` with its error, or `Unknown`.
- **Breaking (kernel).** `MutationState` gains `errors`, and `failMutation` takes
  the error as a third argument. `Data.get`'s parameter type is now
  `EntitySelection`.

### `foldkit-remote-drizzle`

- `bind(entities, storage)` binds an `Entity.relate` result to tables: fields by
  column name, a relation as `{ field }`, `{ foreignKey }` or `{ through, … }`, a
  derived member as a count. Bindings may point at each other, and a column
  that plainly cannot hold its field is refused at definition. New dependency:
  `foldkit-entity`.

### `foldkit-bundle`

- `Bundle.withView(view)` gives a bundle a view with view inputs of that view's
  own, which `mapView` cannot.

### `foldkit-surface`

- `Metadata` now comes from `foldkit-metadata` (re-exported). New dependency.

### `foldkit-primitives`

- 0.2.0. Platform detection reads client hints and touch; `distanceToEnd` sits
  beside `isAtEnd` on the virtual list; a denied device request keeps the last
  device list, as geolocation keeps its fix.

### Versions

`foldkit-surface` 0.3.0, `foldkit-remote` 0.4.0, `foldkit-remote-server` 0.4.0,
`foldkit-remote-drizzle` 0.4.0, `foldkit-bundle` 0.2.0. Packages that pin one of
those exactly are republished against it with no change of their own:
`foldkit-agent` 0.3.1, `foldkit-mirror` 0.2.1, `foldkit-sync` 0.5.1,
`foldkit-bundle-surface` 0.1.1.

## 0.5.0

Every package below changes its public types or adds API, so each takes a minor
while pre-1.0: `foldkit-surface` 0.2.0, `foldkit-remote` 0.3.0,
`foldkit-remote-server` 0.3.0, `foldkit-remote-drizzle` 0.3.0,
`foldkit-mixins` 0.3.0, `foldkit-mixins-surface` 0.3.0, `foldkit-agent` 0.3.0,
`foldkit-agent-a2a` 0.3.0, `foldkit-agent-mcp` 0.3.0, `foldkit-agent-native`
0.3.0, `foldkit-sync` 0.5.0, and `foldkit-mirror` 0.2.0 (its `Contract` output
changed). `foldkit-agent-webmcp` 0.3.0 and `foldkit-mixins-ui` 0.3.0 republish
only for their peer ranges. `foldkit-durable` does not republish.

Several of these changes exist so that user code, tests included, needs no type
casts: a cast in a test marked a gap in the API.

### `foldkit-surface` (breaking)

- **Projection metadata is open to any package.** Surface declared Remote's
  requirement types, so no other package could attach facts to a Projection
  without editing Surface. `Metadata.key<A>(name, { merge, summarize })` gives a
  package its own typed slot; `Projection.metadata` carries the entries and every
  combinator merges them per key. Entries are found by the key object, so two
  copies of one package do not share them.
- **`Metadata` is opaque.** Only a key's `of` and composition make one; its
  entries are private and frozen, so a hand-built value has none and nothing can
  mutate them. `MetadataTypeId` marks a value.
- **Removed:** `Projection.requirements`, `Projection.connections`, and the
  matching `Projection.fromReader` options. Remote's requirement types moved to
  `foldkit-remote` (below).
- **`Contract.requirements` and `SurfaceInspection.requirements` are now
  `metadata: MetadataSummary[]`** (`{ name, entries }`), so `Module` and DevTools
  show every package's entries. A hand-written `Contract` literal must spell
  `metadata: []`. `Module.toMarkdown` renders the column as
  `name: entries; name: entries`, with `|` escaped.
- **Schemas are decodable codecs.** `Projection.Model` and `Surface.Params` are
  `Schema.Codec<Value, unknown>`, so `Schema.decodeUnknownSync(projection.Model)`
  needs no cast, and `Surface.Params` is present, not `| undefined`, when the
  Surface declares params (`ParamsSchema`). `Projection.fromReader` and
  `Surface.make({ Params })` refuse a schema that needs decoding services.

### `foldkit-remote` (breaking)

- **Remote owns its requirements.** `Requirement`, `RelationRequirement`,
  `ConnectionRequirement` and the `Requirement.merge*` helpers move here from
  `foldkit-surface`, stored under `RemoteRequirements` and `RemoteConnections`.
  Read them with `requirementsOf(projection)` / `connectionsOf(projection)`.
  `Window` is gone; it was `QueryWindow`.
- **`Data.refresh(model, projection | surface)`** marks what a consumer already
  declares as due again, from `update`, instead of restating each request. It
  returns the Model, with selected fields reading `Refreshing` and loaded
  connections invalidated; the `Data.subscriptions` read entries refetch them,
  so the data is requested once. Unobserved data is revalidated with
  `Remote.prefetch` and `RemotePolicy.networkOnly`. A refreshed connection's
  page replaces its pages, so removed and reordered items follow the server and
  later pages are paged again; a read already in flight is restarted rather than
  applied after the refresh. Refreshing what is already refreshing returns the
  same Model.
- `Data.subscriptions` returns `SubscriptionEntries`, with exact `<key>.read`,
  `<key>.live` and `retain` keys, so a lookup needs no `!`.
- `RemotePersistence.dehydrate` returns `string` when no `maxBytes` is given.
- `Remote.Model` is a decodable `Schema.Codec<RemoteModel, unknown>`.

### `foldkit-remote-server`

- No longer depends on `foldkit-surface`; `Requirement` comes from
  `foldkit-remote`.

### `foldkit-mixins-surface` (breaking)

- `SurfaceView.describe` returns `metadata: MetadataSummary[]` in place of
  `requirements`.
- **`SurfaceView.render(view, surface, params, root)`** renders a view for a
  Surface's projection with an inert builder, for demos, tests and static output.

### `foldkit-agent` (breaking)

- **`Agent.when` completes on state.** A Message contract couples a capability
  to one implementation path; a state contract completes when a condition holds,
  whatever made it so. It reads a `projection` of the application's Model (which
  must be that Model, and needs `host.subscribe`) or a `source: { get,
  subscribe }` outside it. Completed means the condition holds, not that this
  call made it true; a creation still completes on its Message with `correlate`.
  A throwing predicate fails the invocation as a defect, and a value a
  notification left unchanged is not evaluated again; a `source` is re-evaluated
  on every notification, since it may mutate its value in place.
- `request` is inferred inline in `Agent.expose`; inside `Agent.variant` it is
  annotated and checked against `input`. Elsewhere it is `unknown`.
- **`CompletionOutcome` is a union**, and so is `DispatchResult.completion`: a
  Message contract carries its `message`; a state contract has none and cannot
  fail. Code that read `completion.message._tag` unconditionally needs `?.`.
- **`Manifest` completion gains a `kind`**: `{ kind: 'message', success,
  failure? }` or `{ kind: 'state', observes }`.
- `AgentHost.dispatch` may return a failing Effect, such as `Sync.mount`'s
  `Exit`; the failure is the invocation's defect, as a thrown error already was.
- **The audit log is typed by principal.** `auditLog<Principal>`, `AuditSink`,
  `AuditLogOptions` and `AuditRecord` take the principal type, so a projection
  `(caller: User) => caller.id` needs no cast, and binding a log built for
  another principal is refused. An unannotated projection now sees `unknown`,
  and a hand-written sink declares its principal type. `AuditRecord.principal`
  is `Principal | undefined`: a call refused before its principal is resolved
  is recorded with `undefined`, and the `principal` projection is not called.
- `Agent.make` returns `context` as present when one was given.
  `Agent.contextSchema` returns a `JsonSchemaDocument` rather than an untyped
  record.

### `foldkit-agent-mcp` (breaking)

- `AgentMcp.httpApp({ server })` accepts a server alone; passing handler options
  beside it, which were ignored, is now a type error.
- `AgentMcp.stdio` types `input` and `output` as the `on`/`off`/`write` it uses
  (`LineInput`, `LineOutput`), so a fake stream needs no cast. Node's
  `process.stdin` and `process.stdout` still fit.

### `foldkit-agent-a2a` (breaking)

- `Success.result` is a `Task`, which every handler already returns. Code that
  builds a `Success` by hand must pass one.

### `foldkit-agent-native` (breaking)

- `AgentNative.actions` returns an `ActionRegistry` with exact keys for a known
  contract, so a known capability needs no `!`; indexing it with an arbitrary
  string is a type error. An open contract keeps string keys.
- An action's `schema` also types its `~standard.jsonSchema`.

### `foldkit-agent-webmcp`

- Republished with a peer range on `foldkit-agent` 0.3.0. Its own API is
  unchanged, but the published 0.2.1 peers `foldkit-agent@^0.2.1`, which in 0.x
  excludes 0.3.0.

### `foldkit-sync` (breaking)

- **The committed state is readable.** `Replica.committed` and
  `ReplicaSnapshot.committed` are the server-confirmed state the optimistic
  `shared` is built on: a pending edit reaches them only once committed, and a
  rejected one never does.
- **`Mounted.committed`** is a `CommittedView` (`{ get, subscribe }`), the source
  an agent waits on to finish on confirmation rather than on its own optimistic
  edit: `Agent.when({ source: mounted.committed, … })`. It is notified after every
  exchange, including a checkpoint that keeps the cursor. `Mounted` gains a third
  type parameter, `Shared`, defaulting to `unknown`.
- An exchange that acknowledges an edit without returning it now re-installs the
  shared slice, instead of leaving the dropped edit in the Model.
- A Model, Message or committed listener that throws no longer stops the
  listeners after it or the mount's refresh; its error is re-thrown from a
  microtask.
- `dispose` no longer hangs when a persist dies with a defect.
- **A refresh no longer hides a durable edit still waiting for the replica.**
  An exchange that settled while an edit's submit waited for the replica lock
  installed a shared slice without it, so the edit vanished until the next
  exchange. The mount now submits one edit at a time, in dispatch order, and a
  refresh replays the edits the replica does not hold yet on top of one replica
  snapshot. Nothing is deferred, so remote changes still show while edits keep
  overlapping, and no edit is applied twice.
- `Replica.snapshot` reads the status, `shared`, `committed` and the new
  `ReplicaSnapshot.nextLocalSequence` from one replica state. `DefinedSync.replay`
  is the reducer the replica replays durable Messages with.
- `Sync.forApplication(App).make({ authorize })` types
  `journalContract().authorize` as present.

### `foldkit-mirror`

- Its `Contract` carries `metadata: []` in place of `requirements: []`.

### `foldkit-mixins`

- **`Attributes.find`, `filter` and `tagOf`** read a resolved `SlotAttributes`
  bundle by tag and return that variant typed (`find(attrs, 'Class')?.value`),
  so reading attributes needs no cast. An unknown tag is a type error.
- **`SlotView.inertBuilder<Message>()`** is Foldkit's `inertHtml` typed for a
  Message universe, for rendering outside a runtime. It holds the one cast the
  invariant builder needs.

### `foldkit-mixins-ui`

- Republished with a peer range on `foldkit-mixins` 0.3.0. Its own API is
  unchanged, but the published 0.2.0 peers `foldkit-mixins@^0.2.0`, which in 0.x
  excludes 0.3.0.

### `foldkit-remote-drizzle`

- `keysetWhere` returns `SQL` for a non-empty tuple of order terms.

## 0.4.1

`foldkit-durable` and `foldkit-sync` take a minor for new, additive API. No other
package republishes.

### `foldkit-durable` 0.3.0 and `foldkit-sync` 0.4.0

- **Namespaces, additively.** Both packages exported bare functions while every
  other package here is namespace-first, and Effect is too. `Journal.make`,
  `Journal.layer`, `Journal.metrics` and `Journal.define`, and `Sync` grouping
  `forApplication`, `define`, `mount`, `metrics`, `indexedDb` plus `transport.*`,
  `presence.*` and `lww.*`. They delegate by reference, so inference at call
  sites is unchanged, and every previous export keeps its name, signature and
  behaviour. The branded ids lead with `DocumentId.make('todos')`, which Effect's
  schemas already provide; the lowercase decoders still work.
- **`Journal.define<Operation, Snapshot, Principal>(key)`** closes a soundness
  hole. `JournalService` takes its type arguments at the use site with nothing
  tying them to the layer that satisfied the tag, so reading a key back as a
  journal of another shape compiles. A definition fixes the types once and
  returns the tag and the layer constructor that agree on them.
- **Effect schemas as codecs.** `JournalOptions.operation` and `.snapshot` accept
  a `Schema.Codec` as well as the `encode`/`decode` pair, with `Codec.fromSchema`
  as the explicit conversion, resolved once at construction because the sync
  decoders recompile per call.
- **A refusal can say why.** `authorize` accepts `{ allowed: false, reason }` and
  the reason reaches `OperationRejectedError` and its message, which matters
  because sync forwards rejections to the replica and the person whose edit
  reverted saw no reason. `validate` now accepts an Effect as `authorize`
  already did, and `runEffect`'s `retryFailed` accepts a predicate over the
  record, since the recovery policy asks the application to decide per intent.

## 0.4.0

`foldkit-remote` and the `foldkit-mixins` family take a minor; everything else
republishes so npm serves the corrected pages. The one breaking change is
`foldkit-remote`'s new `ReadStarted` message and `loading` field, below.

### `foldkit-remote` 0.2.0

- **`RemoteData.Loading` means something now.** It was a required `match` case
  nothing constructed — the missing half of a symmetry, since `Refreshing` is
  produced by `RefreshStarted` marking present fields stale. The read entry now
  emits `ReadStarted` before it reads, the reducer records a mark per requested
  field, and `ReadReceived` or `ReadFailed` clears it, so a value the store
  lacks reads `Loading` while a read is fetching it and `Initial` when none is.
  That distinction is worth rendering differently: nothing fetches a projection
  no active Surface observes, so it reads `Initial` forever and a spinner there
  hides the wiring mistake. **Breaking:** `RemoteMessage` gains `ReadStarted`
  and `RemoteModel` gains `loading`, so code that matches every Remote message
  or builds a `RemoteModel` literal needs the new case and field. The documented
  path, `Remote.reduces` then `Data.reduce`, is unaffected.

### `foldkit-mixins` 0.2.0

- **`SlotView.forMessages<Message>().define(...)`.** `define`'s Message universe
  was anchored only by the render callback's builder, so without an explicit
  `h: HtmlBuilder<Message>` it resolved to `unknown` and failed later as a
  variance mismatch that never named the annotation. The curried form fixes
  Message up front, following `Agent.forModel<Model>()`; `define` is unchanged.
  `foldkit-mixins-surface` and `foldkit-mixins-ui` follow to 0.2.0 for the peer
  range.

### Documentation

Two fixes reach the published artifacts themselves.

- **`foldkit-remote-drizzle` now ships its third-party notice.** The package
  adapts [fate](https://github.com/nkzw-tech/fate)'s Drizzle integration under
  MIT and records the attribution in `THIRD_PARTY_NOTICES.md`, which `files`
  omitted, so the published tarball carried the pointer without the notice.
- **`foldkit-remote`'s declaration file named an API that does not exist.** Four
  doc comments referenced `Remote.update`, which the package does not export;
  the reducer is `updateRemote`, and on a bound domain it is `Data.reduce`.
  The wrong name reached editors through the shipped `.d.mts`.
- **Every README was checked against its source.** Snippets that could not
  compile are fixed across `foldkit-durable`, `foldkit-sync`, `foldkit-mirror`,
  `foldkit-mixins`, `foldkit-mixins-ui`, `foldkit-remote`, `foldkit-remote-server`,
  `foldkit-remote-drizzle` and `foldkit-surface`; `foldkit-agent-webmcp` is
  rewritten around the feature detection a reader needs before `register`
  throws. Each package now opens in plain language, says when to reach for it
  and when not to, and links its guide, siblings, and example.
- **Manifests.** The eight packages that were private until 0.3.0 gained the
  `keywords` npm search matches on and the `publishConfig` the other seven
  carry. No package behaviour changed in this release.

## 0.3.0

Every package ships. The eight packages that were `private` — `foldkit-surface`,
`foldkit-remote`, `foldkit-remote-server`, `foldkit-remote-drizzle`,
`foldkit-mixins`, `foldkit-mixins-surface`, `foldkit-mixins-ui`, and the new
`foldkit-mirror` — publish for the first time at 0.1.0, as does
`foldkit-agent-native`. `foldkit-sync` is 0.3.0, and `foldkit-durable`,
`foldkit-agent`, `foldkit-agent-webmcp`, `foldkit-agent-mcp`,
`foldkit-agent-a2a`, and `foldkit-agent-native` are 0.2.0.

Correctness fixes from a review of the implementation, the `foldkit-surface`
reference-selection work and the `foldkit-remote` submodel. Breaking for
`foldkit-sync` (the storage and presence APIs), `foldkit-durable` (`append`'s
result), `foldkit-agent` (`define` is `make`; `Agent.context` and `Agent.pick`
give way to a `foldkit-surface` projection), and `foldkit-remote` (`RemoteModel`
and the mutation/observe signatures). `foldkit-agent`, `foldkit-remote`, and
`foldkit-sync` now depend on `foldkit-surface`, which resolves from npm from
this release on.

### `foldkit-mirror` 0.1.0 (new)

- **A Model slice kept in the URL or a key-value store.** `Mirror.url(App, {
  fields: Projection.pick(…), keys })` and `Mirror.kv(App, { key, scope, fields })`
  keep a writable projection in step with the URL query string (or hash) and
  Effect's `KeyValueStore`: `reduce(model, url | MirrorRestored)` reads a
  store back into the Model, `encode`/`href` write it out with defaults (from
  `App.initial`) elided, one Subscription entry per mirror writes when the
  encoded slice changes (push or replace per key, throttled), `restore` is the
  Command that reads a store, and `contract` (kind `mirror`, observes the
  slice, owns nothing) joins a `Module`. A slice is field refs straight from
  `App.fields` or a writable projection over them; a URL mirror's `reduce`
  takes a URL and a store mirror's the Message (`fromKeys`/`restoreKeys` are
  the kernel's); an application built without `initial` passes it in the
  config. Codecs derive from the field schemas; a key may name its own.
  `MirrorStore.memory` records writes for tests. See `docs/design/MIRROR.md`.

### `foldkit-surface` 0.1.0

- **`App.surface` and `Surface.at` (#69, Phase C).** `App.surface(name, {
  params, model, messages })` is `Surface.make` with the mechanical wrappers
  lifted: `params` are the fields of a `Schema.Struct` (or a schema, kept as
  is), and `model` may return an object of Projections and field refs, which
  becomes `Projection.struct`. `Surface.at(surface, params)` is the Surface as
  the Model activates it: `params` is the value or a function of the Model
  (`undefined` while inactive), and `projectionOf(model)` the projection for
  those params. `Requirement.live` marks a requirement the projection also
  subscribes to; `Requirement.merge` keeps the mark.
- **Errors and hovers (#69, Phase E).** `Invalid<Message>` is a branded
  compile-time failure that names its cause; `ActiveSurface` carries the
  Surface's `owner`, so a domain can reject another application's Surface. A
  Surface's Model now hovers as the projected value (`{ project:
  RemoteData<…> }`) instead of the internal `StructValue<…>` alias.
- **`Projection.connections` (#69, Phase D; breaking).** A Projection carries
  the query connections it reads as `ConnectionRequirement { identity, window,
  select }`, next to its requirements; `struct`, `array`, `option`, and
  `fromReader` propagate them and `Requirement.mergeConnections` unions what
  one connection and window select. A hand-written Projection literal now
  needs `connections: []`.
- **`Module`, the pure composition root.** `Module.make(App, [contracts])`
  collects an application's contracts as data; `Module.validate` reports a
  contract from another application, a duplicate `kind:name`, two owners of
  overlapping Model paths, a Message durable in two replication contracts, and
  a path or Message the application does not declare; `Module.manifest`,
  `Module.toMarkdown`, and `Module.toMermaid` show who owns each Model path (local, sync, or remote) and
  every contract's observes/messages/requirements. A `Contract` is the shared
  description: `Surface.contract` derives one from a Surface, and Sync, Remote,
  and Agent attach one to the values they produce. `Surface.registry` is
  removed; `Module` is the explicit collection (#60, sections 1 and 8).
- **The primitives are first-class.** `Projection.pick`/`Projection.compose`
  (were `Surface.pick`/`Surface.compose`) build writable projections, and
  `MessageSet.make(App, [constructors])`/`MessageSet.union` (were
  `Surface.messages`/`Surface.unionMessages`) build typed Message subsets, now
  typed `MessageSet`. Agent and Sync consume `Projection` and `MessageSet`
  values, not Surface helpers; a `Surface` is what composes one of each with a
  name and a renderer (#60, section 4).
- **`make` constructs, `application` scopes.** One vocabulary across the
  application-contract packages (#60): `forApplication(App)` specializes a
  package to an application and `make(config)` constructs a contract, as
  `Ref.make`/`Queue.make` do in Effect and `Remote.make`/`Entity.make` already
  did here. `Surface.define(App, name, config)` is now `Surface.make`, and the
  scope-only `Surface.make({ Model, Message })` is folded into
  `Surface.application`, which already accepted a config without
  `initial`/`update`. The mixins packages keep their own `Slots.define`/
  `SurfaceView.define` vocabulary for now.
- **Reference-based selection.** `Surface.application` generates a reference tree
  (`App.fields`), and `Projection.pick`/`Projection.compose` build writable projections
  from it, so a shared projection is derived from the Model Schema instead of
  declared twice. `Sync.forApplication` and `Agent.forApplication` consume it.
- **Typed Message subsets.** `MessageSet.make(app, [constructors])` and
  `MessageSet.union(...)` produce a `MessageSet` with a pure codec, a tag
  set, and an owner token, so two structurally identical applications cannot mix
  selections and a subset cannot leak across applications.
- **Encoded types are preserved.** `ModelRef`/`FieldRef` and `MessageSet` carry
  an `Encoded` parameter, so a transforming field (`Schema.NumberFromString`)
  keeps its encoded type through `Projection.pick` and the journal snapshot codec
  instead of widening to `unknown`.
- **Transition and resources.** `Surface.application` accepts optional
  `initial`/`update` and resource-carrying Commands; the runnable form is what
  `Agent.forApplication` and `Sync.forApplication` require.

### `foldkit-remote` 0.1.0

- **The bound domain (#69, Phase B; breaking).** `Remote.make({ model, entities,
  queries, mutations })` now binds the domain to its place in the application
  Model in one step and returns a `RemoteDomain`: the descriptor, the binding,
  and the application-facing operations `get`, `plan`, `storeOf`, `prefetch`,
  `mutate`, `reduce`, and `inspect`, each compiled onto the `Remote.*` function
  of the same name (which stay exported). The descriptor alone is
  `Remote.define`, the binding alone `Remote.at`. `Remote.Model` and
  `Remote.initial` are the submodel's schema and initial value, the same for
  every domain, so the application Model embeds them before the domain is
  bound. `Remote.messages` is Remote's Message cases for `defineMessageUnion`
  and `Remote.reduces` narrows an application's union to them, so there is no
  wrapper Message: `update` hands them to `Data.reduce`. `Data.mutate(model,
  mutation, input, options?)` starts a registered mutation from `update`: the
  request id comes from a monotonic sequence in `RemoteModel.mutations`
  (`{ requestId }` overrides it; `tempId` derives from it), the optimistic
  operations may be a function of those ids, and the returned Command yields
  the `MutationSucceeded` or `MutationFailed` that settles it. An entity is
  the receiver of its selections and patches: `Project.select({ … })` and
  `Project.patch(id, values)` (`Selection.make` and `Entity.patch` stay).
  `Mutation.make` and `Query.make` take the fields of a `Schema.Struct` where a
  codec is expected, and `Query.make`'s `Result` takes the entity a connection
  is over. `MutationState.sequence` is new.
- **Live and subscriptions on the domain (#69, Phase C).** `Data.live(selection,
  id)` is `Data.get` with the projection's requirements marked `live`; the
  mark survives `Projection.struct` and never reaches the wire.
  `Data.subscriptions({ key: Surface.at(surface, params) | surface }, options)`
  returns the record `Subscription.make` takes: a `<key>.read` entry per
  Surface (`Remote.observe` over the params the Model gives), a `<key>.live`
  entry subscribing what the Surface reads live (`Remote.live`), and one
  `retain` entry with every active Surface as a root (`Remote.retain`).
  `options` are the observe, live, and retain options together. The kernel
  entries now derive their requirements from a function of the Model.
- **Page sizes are non-negative integers (#69, review).** `Data.query` rejects
  any other `first`/`last` at the call, naming the query, and the wire's
  `WindowSchema`/`QueryRequest` refuse one at decode (`PageSize`) instead of
  letting the server substitute its default.
- **Less work per Model change (#69, review).** A selection's `RemoteData`
  and `Page` schemas are built once and shared; `Data.subscriptions` computes
  each Surface's projection once per Model object across its read, live, and
  retain entries; `Remote.select` and `Data.query` memoize a read's result per
  visible store snapshot (and connection), so equal reads of one Model state
  return one value.
- **Errors that name the descriptor (#69, Phase E).** `Data.get`, `Data.live`,
  `Data.query`, `Data.mutate`, and `Remote.select` reject a descriptor the
  domain never declared with a one-line branded error at the argument
  (`Entity "Team" is not registered with this Remote domain`; `Registered` and
  `SelectsEntity` are the types), and at runtime with an error naming the
  descriptor and the domain. `Data.query` rejects a selection of another entity
  than the query lists the same way, and `Data.subscriptions` rejects a Surface
  of another application by owner token. The README leads with the application
  API and documents the kernel under "Advanced".
- **Queries as Projections (#69, Phase D; breaking).** `Data.query(query,
  input, { select, first | last, after | before })` is a Projection reading a
  connection as a `RemoteData<Page<Value>>`: `Initial` until the page and every
  item's selected fields are present, `Ready` once they are, `Refreshing` while
  the connection or any item refetches, `Failed` on data that does not decode;
  `select` is a selection of the query's entity and the window is one side or
  the other. The projection carries the connection (`Projection.connections`),
  so the read entry plans it like a field: an unknown or stale connection is a
  query to run, a known one contributes its visible items' fields. The entry
  runs the queries and the entity read concurrently; a merged page (one
  `ConnectionMerged` with `refreshes: true`, which also clears `stale`) makes
  its items the next plan, and a failed query yields the new `QueryFailed`
  Message, which ends the refresh and keeps the pages. `Data.next`/`previous(model,
  projection)` are the neighbouring page's `QueryRef` from the loaded
  boundaries (same page size), or `undefined`; `Data.fetch(ref)` is the
  Command that merges it. `Remote.planQueries` is the pure query plan, query
  reads coalesce like entity reads (`coalesceQueries`, applied by
  `Remote.clientLayer`), and the retain entry roots a projection's connections
  by itself: a `RetentionRoots` connection is now `{ identity, select? }`, and
  `gc` keeps what a page's `select` reaches through each item. `Data.prefetch` now runs the pending queries, then one read, and
  returns the Model (it returned the store). `Remote.query`/`queryMessage` and
  `Remote.visibleItems` stay for hand-driven connections.
- **Review hardening.** One plan: `Remote.plan(bound, model, projection,
  options?)` replaces `planProjection`/`observeProjection`/`planSurface`
  (a Surface's is `surface.projection(params)`); `Remote.retain(projections,
  toMessage?, options)` drops the bound remote, and `observe`/`live`/`retain`
  default `toMessage` to the identity; `Remote.storeOf(bound, model)` is the
  visible store (base under pending layers), memoized per model state so every
  read and plan of one render shares it; `Remote.live` takes `{ now }`;
  `Remote.visibleItems` and `RetainOptions.connections` accept a `QueryRef`.
  A merged cursor page keeps the stored page's near boundary instead of
  inventing one, and pages merged within one read result see each other.
  `ConnectionChange.prepend`/`append`/`remove` (was `Optimistic.*`) build the
  connection half of `MutateOptions.optimistic`; `OptimisticState` is the
  model slice. Persistence is namespace-only (`RemotePersistence.*`); the
  wire caps `MAX_FIELDS_PER_REQUEST` (256) and `MAX_RELATION_DEPTH` (8) with
  static nesting; `Entity.patch` takes wire-shaped values; `Selection.make`
  refuses an empty selection, which would require nothing and read `Ready`.
  `SelectionOf` and `SelectionValue` are exported, and
  `docs/design/DX_PROTOTYPES.md` with `test/dx.test-d.ts` prototype the #69
  application API against the kernel types (Phase A; compile-only).
  `Remote.clientLayer` is generic in the RPC client's requirements, so
  in-process `RemoteServer.handlers` over a database become a `RemoteClient`
  with one `Layer.provide` instead of a hand-written adapter.
- **Recursive nested selections.** `Selection.make(Project, { owner:
  UserSummary })` now reads through the ref into the target instead of failing
  to decode: the field codec follows the entity field's shape (ref, nullable
  ref, array of refs, or a page of refs through
  `Selection.connection(Entity, window, nested)`, which reads a `Page` of
  items), `Remote.select` assembles every level from the normalized store and
  reads `Initial` until each is present, and the requirement carries the graph
  (`relations`, on `foldkit-surface`'s `Requirement`, with `Requirement.merge`
  and `Requirement.mergeRelation`). `plan` attaches a relation to a field
  being fetched and follows a known relation's refs into concrete
  requirements. `Entity.ref`/`refPage` codecs are annotated, and `refsIn` /
  `relationShape` are exported. Breaking wire change: `ReadBatch` and
  `LiveRequirement` carry `REMOTE_PROTOCOL_VERSION` (now 3), `ReadRequest` gains
  `relations`, and a version mismatch fails with `RemoteProtocolError`
  (`RemoteClient.read`/`live` error types widen accordingly) (#65, section 1).
- **One statement per windowed relation.** `foldkit-remote-drizzle` ranks a
  windowed relation's children per parent in a window function and keeps the
  first `pageSize + 1` of each, so a `Selection.connection` over many parents
  no longer runs one page query per parent; the statement count of a windowed
  nested read no longer grows with the number of parents (#65, Phase E item 16).
  Its `source` declares the binding's fields (`EntitySource.fields`), so the
  server never asks it for another; `first: 0` is honored as a page of
  boundaries only rather than falling back to the default size;
  `returning(binding, fields)` pairs a mutation's `returning` columns with
  the normalization of the rows they yield.
- **Property tests and two fixes they found.** Seeded property checks over
  connection merge, live event ordering, and optimistic convergence. `merge`
  now puts a terminal-start segment first and a terminal-end segment last, so
  a gap never reorders the sides; `foldkit-remote-server` chunks a nested
  level's fan-out by `maxIdsPerEntity` instead of refusing it (#65, Phase E).
- **The durable boundary, stated.** The README says what a Remote mutation is
  (an immediate, server-derived command) and what it is not (durable intent,
  which `foldkit-sync`/`foldkit-durable` own); no second queue (#65, section 9).
- **Hydration hardening.** Snapshots are deterministic (equal stores give
  byte-equal text), carry a `scope`, and respect `maxBytes` on save and
  restore; `dehydrate`/`hydrate` are the text forms for SSR, `mergeStores`
  and the new `Hydrated { entities, merge }` Message bring one into the Model
  by `replace` or `preserve-existing`, and runtime state is never in a
  snapshot. `REMOTE_CACHE_VERSION` is 3; `stableStringify` is exported (#65,
  section 8).
- **Live pruning.** A live `ConnectionRemove` hides a server-known edge (a
  `remove` overlay), not only a pending insert; `ConnectionMerged` prunes the
  settled overlays a page supersedes and leaves a pending request's alone;
  `visibleItems` skips an edge whose target is a tombstone when given the
  store, and `Remote.visibleItems(model, connection)` reads all of it (#65,
  section 7).
- **A mutation owns its optimistic operations.** `MutationStarted { requestId,
  optimistic }` applies entity patches (`Entity.patch`) and connection changes
  (`ConnectionChange.prepend`/`append`/`remove`, new) as a layer and overlays owned
  by the request; `MutationSucceeded` releases both and records the result's
  confirmed `connections` (new on `MutationResult` and the server's
  `MutationOutcome`) in the same position, and `MutationFailed` drops both.
  `visibleItems` reads pending prepends newest-first and hides `remove`
  overlays. Breaking: `OptimisticAdded`/`OptimisticRemoved` are gone,
  `Remote.mutate` returns `connections`, `Remote.mutateInto` takes
  `{ optimistic }`, and the protocol version is 3 (#65, section 5).
- **Coalesced reads.** `Remote.clientLayer` (and `Remote.coalesced` for a
  hand-written client) batch requirements issued together into one
  `ReadBatch`, union overlapping fields, join a requirement already in flight,
  and release it when the read fails; built on Effect's `RequestResolver`
  with an optional `window` (#65, section 2).
- **Cache retention.** `Remote.retain(projections, toMessage?, {
  connections, grace })` is a Subscription entry whose dependencies are the
  retention roots; it emits the new `RetentionChanged` Message after `grace`,
  and `Remote.update` applies the pure `gc(state, roots)`, keeping what the
  roots reach through refs and nested relations, retained connections' edges,
  and pending optimistic layers and overlays (#65, section 3).
- **Request policies.** `RemotePolicy.cacheFirst` / `staleWhileRevalidate({
  maxAge })` / `networkOnly` on `Remote.observe` and `Remote.prefetch` decide
  what a field the store already holds means. A refreshing policy emits
  `RefreshStarted` (new `RemoteMessage`) before the read, marking the refetched
  fields stale so `Remote.select` reads `Refreshing`, which was unreachable
  before. Breaking: the pure planners take `PlanOptions` (`{ freshness, force }`)
  instead of a bare `PlanFreshness`, and `prefetch` takes `{ policy, now }`
  instead of `{ freshness }` (#65, section 4).
- **A `Contract` for `Module`.** `Remote.at` attaches `contract`: the bound
  Remote owns its store's Model path, named after it.
- **A real Remote submodel.** `RemoteModel` is the four producers' shared state
  (`entities`, `connections`, `optimistic`, `live`, `mutations`, `gaps`), and
  `Remote.update` is the single reducer over reads, mutation results, live events,
  connection merges, and optimistic layers. `Remote.make` returns
  `Model`/`initial`/`Message`/`update`/`rpc`. A live event ahead of its cursor
  records a gap instead of being applied out of order.
- **Entity-aware selections.** `Remote.at` carries the domain's registered entity
  names and `Remote.select` is constrained to them, so a selection for an entity
  the domain never declared is a compile error. `Selection.schema` is a pure
  codec, removing a decode cast.
- **Mutation reconciliation.** `Remote.mutate` returns the result's normalized
  patches (previously dropped) and `Remote.mutateInto` reconciles them and returns
  the new Model; settling is idempotent per `requestId`.
- **Simpler observation.** `observe`/`live` emit a `RemoteMessage` through a single
  handler, and `Remote.live` reads its resume cursor from `RemoteModel.live`
  instead of a callback the application cannot key. `Remote.prefetch` accepts a
  freshness window; the pure planners take `PlanFreshness`. `RemoteData.schema` is
  exported.
- **Queries and introspection.** `Remote.query`/`Remote.queryMessage` consume a
  `QueryRef` end to end, and `Remote.inspect`/`Remote.inspectEntity` expose a pure,
  serializable cache view for DevTools.
- **Gap lifecycle.** A live stream's gap clears when an in-order event applies or
  a `GapCleared` message arrives, rather than sticking forever.
- **Self-describing refs and a registry.** `QueryRef` carries its input codec, so
  `Remote.query(ref)` needs no descriptor; `Remote.make` builds a name-keyed
  `registry` from the declared entities, queries, and mutations.
- **An RPC client adapter.** `Remote.clientLayer(rpcClient)` turns an Effect RPC
  client for `RemoteRpc` into a `RemoteClient`, reconstructing the client's
  `LiveEvent` from the wire's `LiveChange` so the mapping is not re-invented per
  application.

### `foldkit-remote-server` 0.1.0

- **Review hardening.** A request for a field the Entity does not declare
  never reaches `read` or `authorize` (`RemoteServer.entity(Project, …)`
  records the declared fields; `EntitySource.fields`); the per-entity id cap
  counts a batch's distinct ids across its window groups, and a live
  subscription is refused over the same cap; the wire refuses, rather than
  silently truncates, a selection nested past `MAX_RELATION_DEPTH`.
  `RemoteServer.liveHub(entities)` takes the entity sources, so the mutation
  sources that signal it can be built after it; subscribers sharing a
  principal share a read by the principal's identity, not its serialization;
  `HandlerOptions<P, R>` types the hub; `RemoteServer.prepend`/`append`/
  `remove(connection, ref)` build a mutation outcome's connection changes.
- **A live hub.** `RemoteServer.liveHub(entities)` tracks each live
  subscriber's requirements and principal; `hub.changed(ref, fields)` re-reads
  the changed fields a subscriber selects through the entity source under its
  principal and streams the patch, `hub.deleted(ref)` streams a delete, and
  `handlers(server, principal, { live: hub })` registers every subscription
  (#65, section 6).
- **Nested resolution in one read.** `FoldkitRemoteRead` resolves a request's
  `relations` level by level: each level's refs become the next level's
  requests, a target the batch already read is not read again, every level is
  authorized through its own entity source, and `HandlerOptions.maxDepth`
  (default 8) caps traversal. Both read and live handlers refuse another
  protocol version with `RemoteProtocolError` (#65, section 1).

- **Live handler.** `RemoteServer.live` and the compiled `FoldkitRemoteLive`
  handler were missing; the server can now stream the client's live requirements.
  Two wire bugs are fixed with it: `LiveRequirement` was missing the resume cursor
  and `LivePatch.cursor` was a string while the client cursor is numeric.
- **Typed live changes.** The live wire success is now a `LiveChange` union of
  entity patches, deletes, and connection insert/remove/invalidate events, so a
  connection change can travel over the wire instead of entity patches only.
- **Less ceremony.** `RemoteServer.make` drops its unused domain argument, and the
  server imports the canonical `NormalizedPatch` instead of duplicating it.

### `foldkit-agent-native` 0.2.0

- **Published.** The Agent Native adapter leaves prototype status at `0.1.0`.
  `AgentNative.actions` compiles an exposed contract into registry entries whose
  `run` only dispatches, and advertises the encoded input schema as a Standard
  Schema validator. It remains pinned to `@agent-native/core@0.177.1`.

### `foldkit-mixins` 0.1.0

- **Slot contracts.** New private package: branded Capability / Event / Attr
  tokens and `Slots.define` contracts.
- **Resolver.** A `Mixin` contribution model and a pure, deterministic
  `Resolver.resolve`: additive deduplicated classes, per-property inline styles,
  single-owner events and scalar attributes, protected slots, opaque
  `ChildAttribute` preservation, and one composed `OnMount`. Conflicts throw a
  structured `DiagnosticError`.
- **SlotView.** `SlotView.define` publishes typed Slots and resolves attached
  Mixins per slot into ordinary Foldkit attributes; `SlotView.attach` is
  immutable.
- **Style v1.** Pure `Style.class`/`inline`/`compose`/`when`/`forSlots`, compiling
  to a contribution; `Style.attach` is `SlotView.attach` for a style.
- **Input-driven Style.** `Style.whenInput(predicate, piece)` defers a piece to
  render time, folded against the view's input and composable (including nested
  conditions). It compiles to a message-free `Mixin<never>`; the mixin boundaries
  accept `Mixin<never>` explicitly because it does not widen to `Mixin<Message>`.
  The CSS compiler is not in this slice.
- **Behavior v1.** `Behavior.slot`/`forSlots` build attributes from the view's
  `input` and `h` at resolve time, so the view's Message universe governs them.
  Definition-time validation rejects an unknown slot, an unsatisfied capability,
  and an unpublished event or attribute; a Behavior owns no state.
- **Mount runtime coverage.** Composition is tested through `foldkit/test`'s
  `Scene` (two Behaviors yield exactly one observed Mount) and directly on the
  merged stream: every inner stream's Messages are collected, and a failing
  inner stream fails the merge rather than being swallowed.
- **Theme and recipes.** `Theme.define` is typed token data, with
  `Theme.variable`/`Theme.variables` compiling to CSS custom properties;
  `Style.recipe` is a typed variant selector returning Style data, with
  `compound` combinations matched against the resolved selection.
- **Advanced Style compiler (started).** `Style.pseudo`/`media`/`supports`/
  `container`/`nest` compile to a deterministic class (FNV-1a of the canonical
  rule text) plus CSS text; `Style.keyframes` and `Style.global` contribute
  class-independent CSS. Declarations are kebab-cased and equal rules share a
  class. `NamedStyle.css`/`globalCss` plus structured `rules`/`globalRules`, and
  `Style.stylesheet`, expose deduplicated CSS as data, so SSR and the browser
  agree and nothing mutates the DOM. Rules inside `Style.whenInput` are rejected
  (`style:conditional-rules-unsupported`). Render-time collection/extraction is
  still out of scope.
- **A11y patterns.** `A11y.pattern` is a portable requirements map and
  `A11y.validate` reports every mismatch as a stable `a11y:*` diagnostic
  (missing or hidden slot, capability mismatch, missing event or attribute). It
  is pure and DOM-independent. The UI/Surface adapters are not in this slice.
- **Prototype-key slot names.** `Style`, `Behavior`, `Mixin.compose`,
  `Style.compose`, `Slots.describe`, the `SlotView` builders, and the
  `@foldkit/ui` resolver accumulate into prototype-free records, so a slot or
  style named `__proto__` keeps its contribution instead of silently becoming
  the accumulator's prototype.

### `foldkit-mixins-ui` 0.1.0

- **`@foldkit/ui` adapter.** New private package formalizing the attribute
  bundles of Button, Input, Textarea, Select, Checkbox, Switch, Fieldset, and
  Disclosure as `Slots`, and resolving attached Mixins into them. Base
  attributes, event Messages and `ChildAttribute`s are preserved; a Behavior
  cannot take over an event the component already owns.
- **Submodel adapter.** Dialog's seven `ChildAttribute` groups are published as
  `DialogSlots`; `resolve` preserves them by identity and passes `isVisible`
  through. Popover's four groups (with its anchor/portal Mounts), Tooltip's two,
  and Slider's six are published the same way. All are tested DOM-free with
  `foldkit/test`'s `Scene`, so real ChildAttributes exercise the resolver,
  including the owned close/trigger `click`, `focus` or `pointerdown`.
  `Event.Cancel` was added for the dialog's Escape handler.
- **Nested Submodels.** Tabs, RadioGroup and Calendar publish per-item groups
  (`tabs[i].tab`/`panel`, `options[i].option`/`label`/`description`,
  `weeks[].cells[].cellAttributes`/`buttonAttributes`). Their adapters call
  `SlotView.buildersFor` directly and map each item, so one slot contribution
  applies to every item while each item's base keeps its own event ownership.
  Tested through `Scene` with identity, Style and conflict assertions.
- **Out of reach with this seam.** `Menu`, `Listbox`, `ComboBox` and `DatePicker`
  own their markup and expose no `toView`/attribute bundles, so there is nothing
  to resolve against.

### `foldkit-mixins-surface` 0.1.0

- **SurfaceView bridge.** `SurfaceView.define(surface, slots, render)` binds a
  Surface's projected Model and Message subset to a core `SlotView`: the
  renderer's input is the projection, and its builder is typed with the
  Surface's Message subset, so a Behavior cannot emit a message the Surface does
  not expose. The result is an ordinary `SlotView`, so Style/Behavior attach and
  pipe unchanged; `SurfaceView.toRenderer` adapts it to `Surface.view` /
  `Surface.rootView`. Type tests pin the projected-Model and Message-subset
  rejections, and runtime tests drive `Surface.rootView` end-to-end, including a
  Style and a Behavior reading the projected input. `SurfaceView.inspect(view)`
  returns serializable `{ name, slots, mixins }` (no functions), composing with
  `Surface.inspect`. `SurfaceView.describe(surface, params, view)` merges both
  into one serializable description (emitted Messages as tags, not constructors),
  with a deterministic `toMarkdown` for docs and CI. A `@foldkit/ui` component
  composes inside a SurfaceView: the Surface's Message subset flows into its
  config and a Mixin resolves around its bundle. Phase 10 started, not complete.

### `foldkit-mixins-example` (example)

- **Worked Surface + Mixins trace.** A `ProjectCard` Surface projects two fields
  and exposes two of the application's Messages; a SlotView styles and decorates
  it (`Style.whenInput`, `Style.pseudo`, a Behavior reading the projected input).
  The demo prints the observation set, slot contracts, mixin names, projected
  model, resolved attributes, the compiled stylesheet, and the serializable
  `SurfaceView.describe` value plus its `toMarkdown`; `pnpm demo` runs it and a
  test asserts every line. Remote is not part of this example.

### `foldkit-kitchen-sink` (example)

- The transcript now runs the whole Remote path end to end: a nested `owner`
  selection over Drizzle, a live subscription fed by the server's hub from the
  rename mutation, an optimistic insert into the projects connection confirmed
  in place by the mutation result, a dehydrate/hydrate round trip that
  leaves nothing to fetch, and two `Remote.retain` passes showing what the
  Board's roots keep with and without the projects connection (#65, Phase E).
  The server is reached through `Remote.clientLayer(handlers)` over the
  database layer rather than a hand-written adapter.

### `foldkit-remote-example` (example)

- **Remote-backed trace.** A `ProjectPage` Surface selects a project out of a
  `foldkit-remote` store; `Remote.plan` reports the requirement,
  `Remote.prefetch` fills it against an in-process `RemoteClient`, the projected
  `RemoteData` moves `Initial → Ready`, a SurfaceView styles and decorates it, a
  `Remote.mutateInto` rename is visible through the same projection, and a
  malformed stored value surfaces as `Failed`. `pnpm demo` runs it; a test asserts
  every line. The trace also runs the `Remote.observe` entry under
  `RemotePolicy.staleWhileRevalidate` (`RefreshStarted` reads `Refreshing`,
  then `Ready`) and a `Remote.retain` pass that collects what the page does
  not reach.

### `foldkit-agent` 0.2.0

- **A Surface as context.** `Agent.forApplication(App).make({ context })` accepts
  a feature Surface (without params) beside a `Projection` or a writable pick,
  so the Surface a view renders is also what the agent sees (#60, section 3).
- **A `Contract` for `Module`.** `Agent.forApplication(App).make` attaches
  `contract`: what the agent observes (its context projection) and the Message
  tags it exposes; `name` (default `'agent'`) names it. `Agent.make` alone
  cannot know the application and attaches none.
- **`define` is `make`.** `Agent.define`, `Agent.forModel<Model>().define`, and
  `Agent.forApplication(App).define` are `make`, and `DefineOptions` is
  `MakeOptions`, matching `Sync.forApplication(App).make` and `Surface.make`
  (#60). `Definition` keeps its name: it is what `make` returns.
- **Surface-based context.** `Agent.context` and `Agent.pick` are removed. The
  `make` `context` option now takes a `foldkit-surface` projection — a read-only
  `Projection` (`Projection.of`/`struct`/`fromReader`) or a writable
  `Projection.pick`/`Projection.compose` — and the runtime reads it with `.read`.
  `Agent.forApplication(App)` infers the Model from a `Surface.application` and
  accepts either projection directly; `Agent.forModel<Model>()` remains when there
  is no application. `Agent.contextSchema` is unchanged.
- **Subset exposure and a curried principal.** `Agent.exposeSubset(subset,
  variants)` exposes only the variants of a `MessageSet.make` subset, and
  `MessageSet.union` composes disjoint subsets. `Agent.forApplication` infers
  the Model, so a `Principal` is supplied by
  `Agent.forApplication(App).withPrincipal<Principal>()` — TypeScript cannot
  infer Model beside an explicit principal, and the chained form keeps one entry
  point instead of the curried `forApplication<Principal>()(App)` (#60). A `Surface.application` now takes optional
  `initial`/`update` and accepts resource-carrying Commands.
- **Subset ownership is enforced.** `Agent.forApplication(App).exposeSubset`
  refuses a subset whose owner token belongs to a different application, matching
  `Sync.forApplication`, so two structurally identical applications cannot mix
  selections.
- **One outcome summary for adapters.** `Agent.summarize(dispatchResult)` returns
  `{ ok, text }` — `Dispatched <tag>` without a completion contract, otherwise
  `<Completed|Failed>: <tag>`. WebMCP, MCP, A2A, and Agent Native render it
  instead of repeating the wording four times.

### `foldkit-durable` 0.2.0

- **Compacted operation identity.** Compaction drops the payload but now keeps a
  SHA-256 payload hash, so a retry of a compacted `opId` with different data or
  actor is an `IdentityConflictError` instead of being accepted as an idempotent
  repeat. When the payload is compacted, `append` returns `AlreadyCommitted`
  (`opId`, `sequence`, `actorId`) rather than returning the retransmitted
  operation as the committed one — which could otherwise run an effect for
  content that was never committed. The `user_version` migration to 2 adds and
  backfills the column.
- **Newer databases are refused.** A database whose `user_version` is above this
  build's `SCHEMA_VERSION` fails during `makeJournal` with
  `UnsupportedJournalVersionError` instead of being treated as migrated.
- **Reads below the floor fail closed.** `read(key, after)` fails with
  `CompactedCursorError` when `after < compact_before`, rather than returning a
  tail that silently starts late.
- **Encoded-typed and branded surface.** `Codec<Value, Encoded>` carries the wire
  side, and `append` takes it instead of `unknown`. `Committed` now includes the
  journal's own `opId`, and `sequence`/`cursor` are branded `Sequence`/`Cursor`,
  so `read` and `compact` cannot be swapped.
- **Batch, maintenance, and recovery APIs.** `appendAll` commits an ordered batch
  in one transaction. `keys`, `reset`, `unfinished`, and `clearEffect` give
  recovery and maintenance an API instead of re-deriving intents from
  application state.
- **Canonical idempotency.** Encoded payloads are canonicalized (object keys
  sorted) before they are stored and hashed, so a retry with a different key
  order is the same operation rather than an `IdentityConflictError`.
- **Bounded change stream.** `subscribe` is a sliding `PubSub`: a slow subscriber
  drops the oldest wake-ups instead of growing memory without bound.
- **Multiple journals.** `makeJournalLayer` and `JournalService` take an optional
  service key, so an application with more than one journal type does not
  collide on the default tag.
- **Retry control and Effect authorization.** `runEffect(key, run, { retryFailed:
  false })` fails fast with `EffectFailedError` instead of retrying a failed
  record, and `authorize` may return an `Effect` (it runs inside the append
  transaction, so it has no service requirement).
- **Canonical hash migration.** `SCHEMA_VERSION` 3 recomputes retained
  operations' `payload_hash` from canonical JSON, so a payload compacted after
  the upgrade compares canonically rather than rejecting a reordered retry. A
  payload already compacted before schema 3 keeps its legacy hash.
- **A recovery worker.** `journal.recover({ key, from, intents, onUnresolved })`
  runs the scan/reconcile loop the README described: it replays committed
  operations after `from`, derives their effect intents, reuses recorded
  successes, and stops before an operation whose intent failed or was skipped,
  returning the cursor it settled so the caller can persist it.

### `foldkit-sync` 0.3.0

- **`Sync.mount` routes the URL.** `mount(App, sync, { url: { init, onUrlChange, onUrlRequest? } })`
  reduces the URL into the Model before the first render, names the Message
  for every navigation, and follows a link the application does not claim
  (an internal one pushed, an external one loaded), so a `foldkit-mirror` URL
  mirror plugs in without window listeners.

- **Fragments.** `Sync.forApplication(App).fragment({ shared, durable })`
  declares one feature's shared fields and durable Messages, and
  `compose(...fragments)` merges them into a value to spread into `make`,
  inferring the merged shared shape and Message union. A field declared twice
  with a different codec, a duplicate durable tag, or a fragment from another
  application throws (#63).
- **Authorization on the contract.** `make({ authorize: { Tag: rule } })` takes
  one rule per durable variant, with `message` typed as that variant, `shared`
  as the snapshot, and `principal` fixed by `withPrincipal<P>()`; a key that is
  not a durable tag is a compile error. `journalContract()` now returns a
  `PolicyJournalContract` carrying the compiled `authorize`, so
  `makeJournal({ ...contract })` applies it; an unruled variant is allowed and a
  contract without rules declares none (#63).
- **`Sync.mount`.** Runs a Foldkit application over an open replica with one
  reducer: a durable Message is applied at once through `update` and persisted
  afterwards in a Command; a failed persist reverts it and reports through
  `onPersistenceFailure`; the shared slice is re-installed when an exchange or a
  rejection moves the replica; `dispose` waits for in-flight persists; the
  runtime's union is the application's plus three private variants, so Commands
  from `update` need no re-wrapping. `mounted.model`, `dispatch`, `subscribe`,
  and `observe` are the host an agent binds to, `observe` reporting every
  application Message the runtime applies. `foldkit` becomes a peer dependency. This closes the
  runtime seam (#60, section 5) without an upstream hook; `examples/sync` drops
  its hand-written wrapper.
- **A `Contract` for `Module`.** `Sync.forApplication(App).make` attaches
  `contract`: the replica owns the shared projection's paths and records the
  durable tags, so `Module.validate` catches two replication contracts over the
  same field or Message.
- **Surface-based contract.** The standalone `pick`/`Projection` (#59 spike) is
  gone, superseded by the shared Surface `ModelRef`/`Projection`.
  `Sync.forApplication(App).make({ documentId, shared, durable })` derives the
  shared projection, the durable subset, the initial snapshot, and replay from a
  `Surface.application`, a `Projection.pick`/`Projection.compose` projection, and a
  `MessageSet.make` subset; `make({ ..., replay })` replaces the derived replay
  with a custom reducer over the shared slice. It compiles to the low-level
  `defineSync` and returns a read-only `surface`; `TodoSync.journalContract()`
  derives the durable operation/snapshot codecs, empty snapshot, and reducer.
  Additive — `defineSync` remains the protocol primitive. `Sync.project` is
  removed; `Projection.pick` is the writable projection.
- **One entry point, shaped like Agent's.** `Sync.forApplication(App)` specializes
  the constructors to an application and `.make(config)` produces the
  contract, matching `Agent.forApplication(App).make(config)` (#60). The
  earlier `Sync.forApplication(App, config)` and `Sync.make(App, name, config)`
  forms are gone; `Sync.make`'s explicit `initial` and bare constructor array
  came from the application and a `MessageSet.make` subset anyway. `make`
  refuses a durable subset whose owner token belongs to a different application.
  `MakeOptions` names its config.
- **Derived replay is guarded.** `Sync.forApplication`'s replay refuses a durable
  Message whose `update` returns a Command or changes a Model field outside the
  shared projection, naming the Message and the fields, instead of silently
  dropping the Command or the change. A durable Message is a deterministic,
  state-only transition of the shared projection; an effectful Message stays
  local and emits a durable fact when its Command settles. The Command's effect
  is never run. `examples/sync` drops its hand-written copy of the same guards.
- **`submit` fails closed.** The replica replays a Message before writing it to
  the outbox and fails with `ReplayError` (a new `ReplicaError` member carrying
  the replay's message and cause) when replay throws, for the new Message or
  for a pending one while the projection is rebuilt, so a Message no replica
  could apply is never persisted. The submit-time result seeds the optimistic
  projection, so a read after a submit no longer replays the whole outbox.
- **Replay documented at the definition.** `MakeOptions.replay` states that a
  custom replay is a pure reducer over the shared subset, that only durable
  Messages reach it, that it runs during admission, replay, and optimistic
  projection, and that it is not guarded.
- **An exchange loop.** `Replica.start` exchanges once and then after every
  `submit`, until the replica closes or the fiber is interrupted; a transport
  failure is recorded and retried on the next wake, so the application does not
  have to hand-roll the synchronize loop.
- **Branded positions.** `Sequence` (a committed document position) and
  `LocalSequence` (a replica's own 1-based counter) are brands with `sequence`
  /`localSequence` decoders, so `baseCursor`/`serverSequence`/`cursor` cannot be
  swapped with `localSequence`. `Operation`, `CommittedOperation`, `Checkpoint`,
  `ReplicaState`, `Replica.cursor`, and `ReplicaStatus` use them.
- **Distinct committed type.** Sync's committed operation is `CommittedOperation`,
  so importing it beside `foldkit-durable`'s `Committed` no longer collides.
- **Grouped codec helpers.** `Sync.codec` collects `normalizeOperation`,
  `operationFrom`, `committedFrom`, and `decodeExchange`; they are advanced
  wire/transport helpers, not the application-facing surface.
- **Presence as a Stream.** `Presence.changes` emits the live peers on subscribe
  and whenever the set changes, composing with Effect like the journal's change
  stream; `subscribe` remains for a callback edge.
- **Observable status.** `Replica.statusChanges` emits `ReplicaStatus` on
  subscribe and after every submit and exchange, so a UI can subscribe instead of
  polling `status`; `Replica.close` now wakes `Replica.start` so the loop returns
  rather than waiting for the scope.
- **One subscription for status and shared.** `Replica.changes` emits a
  `ReplicaSnapshot` — the status and the optimistic `shared` value read from one
  replica state — on subscribe and after every submit and exchange.
- **Foreign acknowledgements.** A response that acknowledges an operation the
  replica never sent (for example one submitted while the exchange was in flight)
  is a `ForeignAcknowledgementError` and no longer deletes that pending operation.
  A response that both acknowledges and rejects one id is refused too.
- **Encoded persistence.** The replica state is encoded through the shared codec
  before it is saved, so a transforming `shared` schema (`Schema.NumberFromString`,
  a brand, a date) round-trips instead of failing to reload. `Storage` is now
  opaque, and persisted state ids are branded.
- **Failed open cleanup.** `openReplica` closes its storage on a failed open,
  matching `openLwwClock`, instead of leaking the handle.
- **Presence identity.** `servePresence` stamps the connection's own peer id and
  ignores a client-supplied one, so a peer cannot spoof, move, or remove another.
- **Malformed responses are typed.** A malformed exchange response fails with
  `InvalidExchangeError` (and records `lastError`) instead of becoming an Effect
  defect.
- **Terminal transport after retries.** Once the reconnect schedule is exhausted,
  later exchanges fail immediately with the terminal error rather than queueing
  behind a fiber that is gone.
- **Interrupted exchanges free their slot.** An exchange interrupted before a
  reply no longer counts toward the queue limit; a late reply for it is ignored.

## 0.2.0

`foldkit-sync` 0.2.0 and `foldkit-durable` 0.1.1. The `foldkit-agent` family is
unchanged at 0.1.0, so its versions are not republished.

### `foldkit-sync` 0.2.0

- **Version negotiation.** A persisted replica or clock state from a version this
  build does not understand now fails with `UnsupportedReplicaVersionError` or
  `UnsupportedClockVersionError`, naming the found and supported versions, rather
  than a generic invalid-state error. The stored bytes are left untouched, so the
  state stays recoverable. `openLwwClock`'s error type is now
  `StorageError | UnsupportedClockVersionError`; match the new tag when handling
  an unsupported version.
- **`replica.status`.** A redacted view — pending count, cursor, the last exchange
  failure, and the operations the server refused (most recent first, bounded) —
  enough for a UI to explain and recover without exposing Messages or the Model.
- **O(1) projection reads.** `replica.shared` memoizes its projection against the
  immutable replica state, so repeated reads no longer replay the outbox. Measured:
  a read at a 5,000-operation outbox drops from ~100 ms to ~1 µs.

### `foldkit-durable` 0.1.1

- README only. Documents [retention](./packages/durable/README.md#retention):
  operation identities and effect records are never garbage-collected, so a
  reconnecting replica past the compaction floor is still acknowledged idempotently;
  bounding storage means rotating the journal and refusing retries older than the
  retained window. No code change.

### Not published

The repo also gains a benchmark harness (`pnpm bench`, `pnpm bench:storage`), a
weekly non-gating Bench workflow, and a long-outbox recovery test. These are
root-level tooling and are not part of any published package.

## 0.1.0

The first release.

### Packages

- `foldkit-agent` — the protocol-neutral contract: `context`, `expose`, `define`,
  `resource`, introspection, and the bound `AgentRuntime`.
- `foldkit-agent-webmcp` — the browser adapter over `document.modelContext`.
- `foldkit-agent-mcp` — the external MCP adapter: a transport-free handler, plus
  stdio and Streamable HTTP.
- `foldkit-agent-a2a` — the A2A adapter: an Agent Card and `message/send` as
  tasks.
- `foldkit-durable` — a durable, ordered operation log on
  `effect/unstable/sql`, with migrations, compaction, change streams, a durable
  effect ledger, and metrics.
- `foldkit-sync` — a local-first replica: offline outbox, optimistic projection,
  reconciliation, presence, an Effect `Transport` service, and a reconnecting
  WebSocket transport.

### Notes

- Foldkit `0.158.2` peer-depends on `effect@4.0.0-rc.112`, so these packages
  target Effect 4.
- `foldkit-durable` requires Node 22 for `node:sqlite`.
- The `foldkit-agent-native` prototype under `packages/agent-native` is
  `private` and not published.
