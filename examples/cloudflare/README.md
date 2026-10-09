# Cloudflare: the whole stack in one worker

The stack of the other examples, in the shape you would deploy it. A
Cloudflare Worker serves **Remote reads** over D1 and a **Sync journal**
through a Durable Object. The visitable page is a Foldkit app on Cloudflare
Pages: Entity, Form, and Crud, writing the same `todos` table through Remote
mutations, so an edit paints before the server answers. Pages forwards
`/remote` to the Worker and calls the Worker's Durable Object for `/sync`.
Pages cannot host the Durable Object class itself.

```
POST /remote  ->  serveFetch            (D1 reads, queries, live)
POST /sync    ->  SyncHost               (upgrade; one object per document)
```

`pnpm demo` runs it against local [miniflare](https://miniflare.dev) — a real
`workerd`, over real HTTP — and prints the loop. `pnpm test` asserts it.
Neither needs an account. The commands that publish the Worker and the page
are at the end of [Run it](#run-it).

## What each piece owns

| Piece | Owns |
| --- | --- |
| `todos` (Drizzle table) + `Todo` binding | the rows. One declaration reads and writes them |
| `AllTodos` (Query) | the connection `remote-drizzle` compiles into SQL over D1 |
| `App`/`Message`/`update` + `Todos` (Sync contract) | which Messages are durable, and the replay they imply |
| `SyncHost` (Durable Object) | the document's single writer: it opens the journal once, and each accepted socket exchanges against that journal |
| `settleTodos` | applying what the journal committed to the `todos` table, where Remote reads it back |
| Create, Rename, Toggle, Delete | the page's writes. Remote mutations land in the same table |
| The page (`app.ts`, `view.ts`) | the list, the forms, and the optimistic paint. It does not open `/sync` |

Two writers, one table. The journal path:

```
Sync writes -> journal orders them -> settle applies them -> Remote reads them
```

The page path:

```
click -> Data.mutate (optimistic paint) -> Remote mutation -> todos -> the list query reads them back
```

## Why the live stream polls

A worker cannot deliver an in-memory push across requests. An open SSE
response belongs to its own request's context, and a **second** request that
reaches into the first — `Queue.offer`, a `Deferred`, even `enqueue` on the
first response's captured controller — wakes its fiber and tears the stream
down. Within one isolate, not only across isolates. So a hub fed from the
write path (`hub.changed(...)` in `settle`) reaches nobody on a Worker.

What does cross requests is D1. So `TodoLive` is a `LiveSource` that polls D1
**from inside the subscriber's own request**, re-reading each subscribed row
through the entity's own source under the subscriber's principal, and emitting
a patch for what moved:

```ts
server = RemoteServer.make({
  entities: [TodoSource],
  queries: [AllTodosSource],
  live: [pollLive(TodoSource)],
})
```

A server process that owns both sides (Node, a long-lived VM) can use
`RemoteServer.liveHub` instead; `examples/kitchen-sink` does. The example would
rather show what deploys.

The cost of polling is a read per interval per subscription, so the interval is
a knob (`'250 millis'` here) and the fields are only the ones the subscriber
selected. `settle` stays unconditional and crash-safe: `journal.recover` makes
applying an operation twice a no-op, and the settled cursor persists in
`durable_meta`, so a restarted settle resumes rather than reapplies.

## Sixty seconds of the loop

1. A replica's frames arrive at `/sync`; the object upgrades, resolves its
   principal, and **opens the journal once**.
2. The journal validates, authorizes, orders and appends the operation to D1.
3. `settle` then applies it — the insert, the rename, the toggle, or the
   delete — through `journal.recover`, and persists the cursor.
4. `POST /remote` reads the row back through `remote-drizzle`, under the
   request's own principal.
5. A live stream polls D1, sees `done` change, and emits an `EntityPatched`
   frame, which `Remote.httpWithLive` applies to its normalized Model.

Step 2 and 3 are separated on purpose: the journal is the authority on what
happened, and the table is a projection of it. A crash between them recovers
by replay, not by re-deriving.

## Run it

```bash
pnpm demo     # the loop, printed, on a real workerd
pnpm test     # the same loop, asserted
```

`src/schema.ts` holds the table, the Drizzle binding, the Sync contract, the
journal, `settle`, the polling source, and the Remote mutation handlers.
`src/domain.ts` is the Entity, `src/operations.ts` the query and the
mutations the page and the server share, and `src/forms.ts`, `src/app.ts`,
and `src/view.ts` the page. `src/browser.ts` boots it. `src/worker.ts` is the
two routes. `src/client.ts` drives the wire for the test and the demo;
`src/stack.ts` boots miniflare for both.

## The page

`index.html` loads `src/browser.ts`. One Foldkit application:

- `Todo` is `Entity.define`. `done` is the integer `0 | 1` the column stores.
- `AddTodoForm` and `RenameTodoForm` are `Form.make` over `Entity.input`.
- `Crud.list` joins the `AllTodos` query to that selection. Until the first
  page arrives the list says "Loading…". A later refresh keeps the rows.
- Add, rename, toggle, and delete call `Data.mutate` with an optimistic
  patch. A new row is also prepended onto the `AllTodos` connection, and a
  delete removes its edge. That paint is the same update as the click.
  "Saving…" stays while the mutation is pending.
- When the mutation succeeds, the list refreshes, so the server's title
  order replaces the optimistic prepend.
- Another tab sees the change when its query refreshes, about once a second.
  The query is not a live subscription. A worker cannot push a new row into
  another request's stream, and `pollLive` only patches rows a live
  subscription already holds. The demo's client is that live path; the page
  is the query.

Create is idempotent (`ON CONFLICT DO NOTHING`). Toggle writes the stored
`done`, so sending it twice leaves the row as it is. The page does not open
the Sync socket. `pnpm demo` and `pnpm test` still write through the journal.

To deploy for real, add `wrangler` (`npm i -D wrangler`) and run it from this
directory, one command at a time:

```bash
pnpm --filter foldkit-example-cloudflare build:worker
pnpm --filter foldkit-example-cloudflare build:page
wrangler d1 create foldkit-cloudflare
# put that database_id in wrangler.toml
wrangler d1 migrations apply foldkit-cloudflare --remote
wrangler deploy
cd pages
wrangler pages deploy ./public --commit-dirty=true
```

Pages reads the `wrangler.toml` beside the command and refuses `--config`.

`build:page` writes `pages/public` and copies `pages/static/_worker.js` into
it. The Worker owns D1 and the `SyncHost` class. The Pages project
`foldkit-crud` serves that directory. `/remote` is forwarded to the Worker.
`/sync` calls the Durable Object binding directly: a service binding delivers
the upgrade and then drops the socket's replies. Run one Wrangler command at
a time. The worker needs no account to run locally. The published page is
<https://foldkit-crud.pages.dev>.

## See also

- [`packages/entity`](../../packages/entity) — the `Todo` declaration.
- [`packages/form`](../../packages/form) — the add and rename forms.
- [`packages/crud`](../../packages/crud) — the list and the rename editor.
- [`packages/sync`](../../packages/sync) — the exchange, the transports, and
  `defineDocumentHost`.
- [`packages/remote-server`](../../packages/remote-server) — `serveFetch`, the
  live streams, and when a hub can be used at all.
- [`examples/registry`](../registry) — the same read/write split with a browser
  editing 100,000 rows.
