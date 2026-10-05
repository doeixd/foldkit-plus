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
the application owns the order       the query's input
```

The edits are a Sync document: its replicated slice is `edits`, every product
edited with the fields edited, and its one durable Message is
`EditedProducts`. The journal stamps each edit with the sequence it committed
at (`stamp` in `sync.ts`), so every replica knows when each field's edit
committed.

The table is not a second owner. Only the journal writes it: through its effect
recovery (`recover`, keyed by operation and change), each committed change is
written with its sequence as the row's `revision`, in one statement that never
moves a row back. Each exchange settles what is committed, so a change whose
write failed is tried again on the next one, and the cursor only passes an
operation once all its changes are written. Any other change to the products
would be an operation the server appends, never a write to the table.

So a row knows how far it has read the journal, and the page draws each row as
Remote read it with the edits it has not absorbed over it (`rowsOf`):

```text
row on screen = the table's row + the edits it has not absorbed
an edit shows ⇔ it is pending, or it committed after the row's revision
```

```text
an edit                       shows at once, before any exchange
an edit made offline          stays in the replica's storage, through a reload, and goes when the server is back
committed, not yet written    shows: the journal has it, and the row's revision is older
written, the row not re-read  shows: the cached row's revision is still older
the row read again            the table shows, with the edit in it, or whatever the journal wrote since
another device's edit         shows when the exchange brings it, before Remote reads the row again
```

The `revision` column is hidden; a column's menu shows it, to watch a row catch
up with the journal. Each edited cell also says where its edit is (`marksOf`,
the grid's `marks`): a dot while it is not yet sent, a hollow dot once the
journal has it and the row as read does not, nothing once the row has it, and
a red edge if the server refused it. Each mark is also the cell's
`aria-description`.

**The edits shrink to what the table lacks.** Every few seconds the server
records, as an operation of its own, that the table holds every edit through
its recovery cursor (`AbsorbedEdits`, which only the server may append). Each
replica drops those edits, so the replicated slice holds what the table has not
absorbed, usually nothing, and the journal compacts the log behind them: a
replica that has never synchronized is sent the small snapshot, not the history.
A page whose cached row is older than an edit it just dropped keeps that edit in
`retired`, set in the same transition by the mount's `onReinstall`, so the row
never shows the stale read; it lets the edit go at the next reinstall once the
row has been read at its revision.

## An edit, end to end

```text
cell text -> Out.Edited -> onOut -> Sync.fact(EditedProducts) -> update: edits merged
  -> replica persists the operation (IndexedDB) -> the cell shows it
  -> exchange: the journal commits it, stamped with its sequence, writes it to
     the table with that revision, and wakes other replicas
  -> their exchange brings it into their edits
  -> a read of the row at that revision shows the table's row, and the edit gives way
  -> the server records that the table holds it; replicas drop it, the log is compacted
```

Each editable column's `schema` decides what its text means: `Dollars` reads
"4.99" as 499 cents through the Product's own `cents` schema, and
`Description` trims and refuses an empty one. A draft is committed only when it
decodes, and the check's message ("A price, like 4.99") is the cell's error, so
nothing the schema refuses becomes an operation. The journal decodes every operation against the Message's schema,
which is the Product's own field schemas, so an empty description or a
negative or fractional number of cents is refused whatever a client sent.

## Failure and recovery

- **The server cannot be reached.** The exchange fails, the edit stays
  pending, and the status line says how many edits are kept on this device.
  The replica retries on a backoff (0.5 s up to 30 s) and at once on the next
  edit.
- **Working offline, on purpose.** The *Work offline* switch pauses the
  transport (`pausable` in `sync.ts`): exchanges fail as an unreachable server
  would, so edits wait on the device, through a reload. Switching back
  exchanges at once, not at the end of the backoff.
- **A reload.** The replica's id lives in the tab's `sessionStorage` and its
  storage is named after it, so a reload reopens the same replica, pending
  edits included. Two tabs are two replicas and never write one storage.
- **A tab closed for good while offline** leaves its unsent edits in
  IndexedDB, under an id no tab will open again. They are not sent. A
  registry that must keep them would give a profile one replica and one
  writer, which this example does not do.
- **The journal refuses an operation**, one whose change breaks the
  Product's rules or that names another document: it is rejected, and the
  replica drops it and the cell goes back. It is not left to be sent again,
  which would hold every edit behind it. The page says so: the cells it had
  changed are edged as refused, and a line under the status names them with
  the server's reason until it is dismissed. The replica has dropped the
  operation by then, so the mount reads each pending operation's cells
  while it is still pending.
- **Two devices edit the same field.** The journal's order decides: the edit
  committed last wins, on every replica. There is no merge of text. The
  journal stamps each edit with who committed it (`by`, beside `at`), so the
  device whose edit lost is told: the cell is edged amber, and a line names the
  other device and the value it had, until dismissed (`replacedOf`, in the
  mount's `onReinstall`). A connection names its device (`?device=` on the
  socket, the tab's short name); nothing checks it, which a real deployment
  would.
- **The table's write fails.** The edit is committed and stays shown, since the
  row's revision is older than it; recovery writes it on the next exchange.
- **A client says when its edit committed.** That is the journal's to stamp, so
  an operation carrying `at` is refused.
- **The data is in memory.** A restart of the server resets the table and the
  journal together, which the revisions rely on: a table kept across a journal
  reset would hold revisions from the old history, and would have to be rebuilt
  from the seed and the new journal.
- **An unabsorbed edit in a sorted list** shows its new value in a row the
  server sorted by the old one, like a pending edit, until the page is read
  again.

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
(`foldkit-durable/core`), `RemoteServer.answer` for reads and `serveJournal`
for each device's socket, each over a `MessagePort`. It holds 10,000 products,
so it starts quickly. Every tab of the sandbox meets the same server, and a
browser with no SharedWorker runs it in the page. Each device has the offline
switch, so a conflict takes three clicks: offline in B, the same price in
both, online in B.

The server lives as long as a tab of the sandbox is open, and keeps nothing:
when the last tab closes, the next one starts it again from the seed, with a
new journal history. A replica that hears the new history rebuilds from it and
sends again what it had not sent, so an edit waiting offline survives, and a
committed one is back to the seed.

## Read it

1. [domain.ts](src/domain.ts): the Product, how each member shows, and the
   change an edit carries. It imports neither Remote nor Drizzle.
2. [operations.ts](src/operations.ts): the products query, ordered by the
   list's sort.
3. [app.ts](src/app.ts): Remote over the Product, the list, the grid's
   columns from it (`GridCrud.columns`, with pinning, widths and editing
   added), `EditedProducts` and the `edits` it folds into, each field with when
   it committed, and `rowsOf`, the rows with the edits they have not absorbed
   over them.
4. [sync.ts](src/sync.ts): the Sync contract derived from the application,
   with the stamp that writes each edit's sequence in, and `mountRegistry`,
   which runs it over a replica.
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
