# Product registry over Remote and Sync

The data grid over 100,000 products that live on a server: read a page at a
time and sorted by the server, through Remote; edited and pasted into, with
each edit a durable operation that Sync keeps on the device until the
server's journal has it.

[`examples/data-grid`](../data-grid/README.md) is the same grid over an array
in memory. Start there for the grid itself; this one is about who owns what
once the rows are a server's and the edits must survive going offline.

## Who owns what

```text
the journal owns the edits           foldkit-durable, ordered by the server (journal.ts)
the table is the journal's read model SQLite: the seed with each committed edit applied, and
                                     on each row the revision it has read the journal to (server.ts)
Remote caches the read model         a page at a time (app.ts: Data, Products)
the grid owns the interaction        focus, selection, columns, viewport, the open editor
the application owns the order       the query's input, with the search
```

The page shows this too. *How this page works*, under the legend, lists the
owners `Module.manifest` reads from the contracts (the grid's placement,
Remote's wiring and the Sync document; `manifest` in `sync.ts`), each field
under its owner and what it holds now, so a field no contract claims shows as
the page's own (`ownership.ts`). The strip under the title counts what is
read and what the grid draws, from the window the view itself draws
(`Grid.window`). It gives no read durations: Remote's Model holds no clock.

The pattern, why the table carries a `revision`, what an edit shows at each
step, absorbing, held edits, conflicts and every failure case, is
[Editing server data through a journal](../../docs/editing-server-data.md),
with this example as its worked case. In short:

```text
cell shown = the row's value, unless an edit of that cell is pending,
             or committed after the row's revision (at > row.revision)
```

The edits are `ProductEdits` (`domain.ts`), `EditableEntity` from
`foldkit-sync/entity` over the Product's four editable members, and the table
is kept by `editsJournal` from `foldkit-sync/journal` (`journal.ts`). What is
this example's own is below.

## In this example

- **What edits.** Description, price, line and status; the UPC does not. Each
  editable column's `schema` decides what its text means: `Dollars` reads
  "4.99" as 499 cents through the Product's own `cents` schema, `Description`
  and `LineName` trim and refuse an empty one, and the status is the Product's
  own literals, so its editor is a list of them. A draft is committed only when
  it decodes, and the check's message ("A price, like 4.99") is the cell's
  error. The journal decodes every operation against the Product's own field
  schemas, so an empty description or a negative price is refused whatever a
  client sent.
- **Marks.** Each edited cell says where its edit is (`marksOf`, drawn by the
  grid's `GridMarkStyle`, explained by the `GridLegend` above the grid and each
  mark's tooltip): not yet sent, saved and not yet in the table, refused, or
  replaced by a later edit; and where the other device is. The `revision`
  column is hidden; a column's menu shows it, to watch a row catch up.
- **Working offline, on purpose.** The *Work offline* switch pauses the
  transport (`pausable` in `sync.ts`): exchanges fail as an unreachable server
  would, so edits wait on the device, through a reload. Switching back
  exchanges at once. An unreachable server is retried on a backoff (0.5 s up
  to 30 s) and at once on the next edit.
- **One replica per tab.** The replica's id lives in the tab's
  `sessionStorage` and its storage is named after it, so a reload reopens the
  same replica, pending edits included, and two tabs never write one storage.
  A tab closed for good while offline leaves its unsent edits in IndexedDB,
  under an id no tab opens again; they are not sent.
- **Who a device is.** A connection names its device (`?device=` on the
  socket, the tab's short name), and the journal stamps each edit with that
  actor and the replica it came from. Nothing checks the name, which a real
  deployment would.
- **Search is the query's input.** The box above the grid sets `search` in
  the Model, which the list reads as `ProductsQuery`'s input beside `sort`, so
  a change is another read, answered over every product. The query's body
  (`Query.define` in `operations.ts`) is `Expr.contains` on the description,
  which the server's Drizzle binding compiles into its `where`: it folds case,
  ASCII only, as every interpreter does. The grid holds no filter.
- **Undo is a new edit.** Ctrl+Z on the grid (Ctrl+Shift+Z or Ctrl+Y to redo)
  takes back this tab's last edit, paste or fill as one step. An edit may already
  be committed and seen elsewhere, so nothing is rewound: the undo is an
  `EditedProducts` of the values each cell held, and waits in the outbox
  offline like any edit. A cell another device, or a later edit here, has
  changed since is left alone and said ("Price of p3 changed since; not
  undone."). The history is the tab's, in the Model and not stored, so a
  reload starts with none.
- **The data is in memory.** A restart of the server resets the table and the
  journal together, which the revisions rely on; a page left open across one
  reads its rows again.

## An edit, end to end

```text
cell text -> Out.Edited -> onOut -> Sync.fact(EditedProducts) -> update: ProductEdits.merge
  -> replica persists the operation (IndexedDB) -> the cell shows it
  -> exchange: the journal commits it, stamped with its sequence, writes it to
     the table with that revision, and wakes other replicas
  -> their exchange brings it into their edits
  -> a read of the row at that revision shows the table's row, and the edit gives way
  -> the server records that the table holds it; replicas drop it, the log is compacted
```

## Run it

```bash
pnpm install                                     # from the repository root
pnpm --filter foldkit-example-registry dev
```

This seeds the server with 100,000 products, starts it on one port (Remote at
`/remote`, the journal's WebSocket at `/sync`), and serves the page on
<http://127.0.0.1:5175>. The first load after an install is slow while Vite
pre-bundles the workspace packages.

### Two devices, the server in the browser

Published at <https://foldkit-registry-demo.pages.dev/>.

```bash
pnpm --filter foldkit-example-registry build:sandbox   # to examples/registry/dist, static files
```

The sandbox is the same application with no backend: Device A and Device B
side by side, each a page of its own in a frame, with its own replica on
IndexedDB, and both talking to one server that runs in a SharedWorker
(`src/sandbox/`). The server is the same code as `pnpm dev`'s: the products
table on sql.js, the journal on SQLite compiled to WebAssembly
(`foldkit-durable/core`), Remote's handlers for reads (`servePort`) and the
journal for each device's socket (`portSocket`), each over a `MessagePort`.
It holds 10,000 products, so it starts quickly. `SharedHost` from
`foldkit-primitives/net` routes each page's conversations to it: every tab
meets the same server, and a browser with no SharedWorker runs it in the top
page, which both frames reach. A page that goes ends its conversations, so a
reloaded device leaves nothing behind on the server. Each device has the offline
switch, so a conflict takes three clicks: offline in B, the same price in
both, online in B.

Each device shows where the other is: the cell it has focused, outlined in
violet, through Sync's presence on the same socket (`sharePresence` in
`device.ts`, `Sync.presence.serve` beside `serveJournal`). It is passing, so
nothing of it is journaled; a device working offline leaves it. Each card
says where its device's edits stand, from a message its frame posts: green
and Synced, or amber while edits wait (Offline, Sending, No server).

The server lives as long as a tab of the sandbox is open, and keeps nothing:
when the last tab closes, the next one starts it again from the seed, with a
new journal history. A replica that hears the new history rebuilds from it and
sends again what it had not sent, so an edit waiting offline survives, and a
committed one is back to the seed.

## Read it

1. [domain.ts](src/domain.ts): the Product, how each member shows, and
   `ProductEdits`, its edits one per cell (`EditableEntity` from
   `foldkit-sync/entity`), which the client keeps and the server applies. It
   imports neither Remote nor Drizzle.
2. [operations.ts](src/operations.ts): the products query, ordered by the
   list's sort.
3. [app.ts](src/app.ts): Remote over the Product, the list, the grid's
   columns from it (`GridCrud.columns`, with pinning, widths and editing
   added), `EditedProducts` and the `edits` it folds into, each cell with when
   it committed, and `Shown`, the edits as Remote overlays
   (`foldkit-sync/remote`), so every read of a row draws the edits it has not
   absorbed. The rules are `ProductEdits`'; this file says them in the page's
   words (marks, notices).
4. [sync.ts](src/sync.ts): the Sync contract derived from the application,
   with the stamp that writes each edit's sequence in, and `mountRegistry`,
   which runs it over a replica and keeps the overlays in step after every
   update (`afterUpdate`).
5. [server.ts](src/server.ts) and [journal.ts](src/journal.ts): the table, its
   seed, and the forward-only write of a change with its revision; the journal,
   its exchange, and the edits it applies.
6. [view.ts](src/view.ts) and [client.ts](src/client.ts): the page, and the
   browser entry that opens the replica on IndexedDB and starts the exchange
   loop.

## Tests

- `test/page.test.ts` (jsdom, the real runtime over the in-process server and
  journal):
  - the first page is read, a header sorts on the server, More reads on;
  - an edit and a paste show at once and are written to the table on the next
    exchange, and a paste the column refuses entirely is no edit;
  - an edit made offline is kept through a remount over the same storage, and
    sent when the server is back;
  - another device's edit shows after an exchange;
  - each field's last edit wins on a row edited twice;
  - a committed edit shows while the table cannot be written, is written on
    the next exchange, and gives way to the table once the row is read at a
    later revision, whoever wrote it;
  - an edit that says when it committed is refused;
  - an edit the journal absorbed keeps showing, through another reinstall,
    until the row is read at its revision, and is let go after;
  - a cell's mark goes from not yet sent, to saved but not in the table, to
    none;
  - a refused edit marks its cell and says why until dismissed;
  - working offline keeps an edit on the device until the switch is off;
  - another device's later commit of a field replaces this page's edit and is
    said, while an edit this page committed later, another device's over a
    third's, the same value again, or a refusal over this page's own commit is
    not.
- `test/journal.test.ts`: the journal refuses an operation a client
  tampered with, and one naming another document, and writes nothing for
  either; the table only moves forward, so recovery may write an edit again;
  absorbing drops what the table holds from every replica, keeps an edit not
  yet written, appends nothing when there is nothing to drop, and compacts, so
  a newcomer starts from the snapshot; a client cannot absorb.
- `test/http.test.ts`: over real HTTP and a real WebSocket to the full
  100,000-row seed; an edit sent over the socket is read back through Remote,
  a commit wakes another replica's exchange loop, and a request naming an
  operation the server does not have is refused.

- `e2e/registry.e2e.ts`: the server and the Vite dev server started, and a
  real Chromium driving the page: reading on as the end comes into view, a
  sort over all 100,000 products, an edit read back from the table through
  Remote and still there after a reload, and a column hidden and shown from
  the menus.

```bash
npx vitest run examples/registry                  # from the repository root
pnpm e2e                                          # the end-to-end suite
```
