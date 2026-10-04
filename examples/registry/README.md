# Product registry over Remote

The data grid over 100,000 products that live on a server: read a page at a
time, sorted by the server, edited and pasted into, with each write shown at
once and settled by the server's answer.

[`examples/data-grid`](../data-grid/README.md) is the same grid over an array
in memory. Start there for the grid itself; this one is about who owns what
once the rows are not the application's.

## Who owns what

```text
the server owns the products        SQLite, behind RemoteServer (server.ts)
Remote caches what has been read    normalized, a page at a time (app.ts: Data, Products)
the grid owns the interaction       focus, selection, columns, viewport, the open editor
the application owns two facts      the order the list is read in, and the last write it sent
```

None of them holds another's state. The grid never sees the server: it reads
a row model made from Remote's page (`GridCrud.rows`), and reports an edit or
a paste as text (`Out.Edited`, `Out.Pasted`). Remote never sees the grid: it
reads what is on screen (`Data.wiring`) and fetches that.

## A write, end to end

```text
cell text -> Out.Edited -> onOut -> EditProducts mutation + optimistic patch
  -> cell shows the new value now
  -> server writes the row and returns it as a patch -> Remote's store
  -> or the server refuses: the patch is released, the cell shows the server's value again
```

The columns' `validate` keeps a draft that cannot be a price out of the
mutation. The server still checks: the mutation's input is the Product's own
field schemas, so an empty description or a negative or fractional number of
cents is refused whatever the client sent.

## What it does not do

- **Writes are Remote's, not Sync's.** An edit is a mutation in flight: lost
  if the page closes before the server answers, and refused, not queued,
  when the server is down. Offline edits that survive a reload are
  `foldkit-sync`'s outbox, which this example does not use yet.
- **The data is in memory.** A restart of the server resets it.
- **No search or saved column layout.** The query takes only an order.

## Run it

```bash
pnpm install                                     # from the repository root
pnpm --filter foldkit-example-registry dev
```

This seeds the server with 100,000 products, starts it behind one HTTP
endpoint, and serves the page on <http://127.0.0.1:5175>. The first load after
an install is slow while Vite pre-bundles the workspace packages.

## Read it

1. [domain.ts](src/domain.ts): the Product, how each member shows, and the
   change a write carries. It imports neither Remote nor Drizzle.
2. [operations.ts](src/operations.ts): the products query, ordered by the
   list's sort, and the one mutation for a cell and for a paste.
3. [server.ts](src/server.ts): the table, the seed, and the handlers.
4. [app.ts](src/app.ts): Remote over the Product, the list, the grid's
   columns from the list (`GridCrud.columns`, with pinning, widths and
   editing added), and `onOut`, where text becomes a write.
5. [view.ts](src/view.ts): the grid over the page, with More on scroll, the
   sort headers, and the column menu.

## Tests

- `test/page.test.ts` (jsdom, the real runtime over the in-process server):
  - the first page is read;
  - a header sorts on the server;
  - More reads the next page;
  - an edit and a paste reach the rows;
  - a paste the column refuses entirely writes nothing;
  - a refused write shows the typed value until the server answers, then
    goes back.
- `test/http.test.ts`: the same transport the browser uses, over real HTTP to
  the full 100,000-row seed, and a request naming an operation the server does
  not have, refused.

```bash
npx vitest run examples/registry                  # from the repository root
```
