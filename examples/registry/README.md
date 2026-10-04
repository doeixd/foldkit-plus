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
the journal owns the edits          foldkit-durable, ordered by the server (journal.ts)
the server owns the products        SQLite: the seed with every committed edit applied (server.ts)
Remote caches what has been read    a page at a time (app.ts: Data, Products)
the grid owns the interaction       focus, selection, columns, viewport, the open editor
the application owns the order      the query's input
```

The edits are a Sync document: its replicated slice is `edits`, every product
edited with the fields edited, and its one durable Message is
`EditedProducts`. The table is derived from the journal, not a second owner:
the journal applies each committed edit to it, once, through its effect
recovery (`recover`, keyed by operation and change). Each exchange settles
what is committed, so a change whose write failed is tried again on the next
one; the cursor only passes an operation once all its changes are written.

A row is drawn as Remote read it with this replica's `edits` over it, pending
ones included (`rowsOf`). So:

```text
an edit                    shows at once, before any exchange
an edit made offline       stays in the replica's storage, through a reload, and goes when the server is back
another device's edit      shows when the exchange brings it, before Remote reads the row again
```

## An edit, end to end

```text
cell text -> Out.Edited -> onOut -> Sync.fact(EditedProducts) -> update: edits merged
  -> replica persists the operation (IndexedDB) -> the cell shows it
  -> exchange: the journal commits it, applies it to the table, and wakes other replicas
  -> their exchange brings it into their edits
```

The columns' `validate` keeps a draft that cannot be a price out of the
operation. The journal decodes every operation against the Message's schema,
which is the Product's own field schemas, so an empty description or a
negative or fractional number of cents is refused whatever a client sent.

## Failure and recovery

- **The server cannot be reached.** The exchange fails, the edit stays
  pending, and the status line says how many edits are kept on this device.
  The replica retries on a backoff (0.5 s up to 30 s) and at once on the next
  edit.
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
  which would hold every edit behind it.
- **Two devices edit the same field.** The journal's order decides: the edit
  committed last wins, on every replica. There is no merge of text.
- **The data is in memory.** A restart of the server resets the table and the
  journal together.

## Run it

```bash
pnpm install                                     # from the repository root
pnpm --filter foldkit-example-registry dev
```

This seeds the server with 100,000 products, starts it on one port (Remote at
`/remote`, the journal's WebSocket at `/sync`), and serves the page on
<http://127.0.0.1:5175>. The first load after an install is slow while Vite
pre-bundles the workspace packages.

## Read it

1. [domain.ts](src/domain.ts): the Product, how each member shows, and the
   change an edit carries. It imports neither Remote nor Drizzle.
2. [operations.ts](src/operations.ts): the products query, ordered by the
   list's sort.
3. [app.ts](src/app.ts): Remote over the Product, the list, the grid's
   columns from it (`GridCrud.columns`, with pinning, widths and editing
   added), `EditedProducts` and the `edits` it folds into, and `rowsOf`, the
   rows with the edits over them.
4. [sync.ts](src/sync.ts): the Sync contract derived from the application,
   and `mountRegistry`, which runs it over a replica.
5. [server.ts](src/server.ts) and [journal.ts](src/journal.ts): the table and
   its seed; the journal, its exchange, and the edits it applies.
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
  - each field's last edit wins on a row edited twice.
- `test/journal.test.ts`: the journal refuses an operation a client
  tampered with, and one naming another document, and writes nothing for
  either.
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
