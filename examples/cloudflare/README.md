# Cloudflare: the whole stack in one worker

The stack of the other examples, in the shape you would deploy it. A
Cloudflare Worker serves **Remote reads** over D1 and a **Sync journal**
through a Durable Object. The visitable page is a Foldkit app on Cloudflare
Pages: Entity, Form, and Crud, writing the same `todos` table through Remote
mutations, so an edit paints before the server answers. Pages forwards
`/remote` to the Worker and calls the Worker's Durable Object for `/sync`.
Pages cannot host the Durable Object class itself.

```
POST /remote         ->  serveFetch             (D1 reads, queries, live)
POST /sync           ->  SyncHost               (upgrade; one object per document)
GET  /_image/        ->  foldkit-media server   (R2 originals, the Images binding)
POST /_media/upload  ->  foldkit-media upload   (into R2; bearing UPLOAD_TOKEN)
```

`pnpm demo` runs it against local [miniflare](https://miniflare.dev) — a real
`workerd`, over real HTTP — and prints the loop. `pnpm test` asserts it.
Neither needs an account. The commands that publish the Worker and the page
are at the end of [Run it](#run-it).

## What each piece owns

| Piece | Owns |
| --- | --- |
| `todos` (Drizzle table) + `Todo` binding | the rows. One declaration reads and writes them |
| `AllTodos` (Query) | the connection, its order declared in its body, that `remote-drizzle` compiles into SQL over D1 |
| `App`/`Message`/`update` + `Todos` (Sync contract) | which Messages are durable, and the replay they imply |
| `SyncHost` (Durable Object) | the document's single writer: it opens the journal once, and each accepted socket exchanges against that journal |
| `settleTodos` | applying what the journal committed to the `todos` table, where Remote reads it back |
| Create, Rename, Toggle, Delete | the page's writes, declared (`Mutation.write`): the binding's writer lands them in the same table, with a ledger (`write_ledger`, migration 0006) so a write sent again is answered with its row |
| The page (`app.ts`, `view.ts`) | the list, the forms, and the optimistic paint. It does not open `/sync` |
| `MEDIA` (R2) and `IMAGES` | image originals, by SHA-256, and the variants made of them (`variants/`); the Images binding makes them; `LIMITER` limits how many a client has made a minute. `foldkit-media`'s server answers `/_image/`, the URLs `Provider.hosted` writes, and `POST /_media/upload` takes an original into R2 and answers its facts, for a request bearing the `UPLOAD_TOKEN` secret (`Authorization: Bearer <token>`); unset, every upload is refused, since `x-actor` proves nothing |

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
a patch for what moved. The page reads the `AllTodos` list live
(`Crud.list('Todos', { …, live: true })`), so the stream
(`Remote.httpWithLive`) also diffs it: an id that joins or leaves is a
connection event, and the page draws a joining row where the list's order puts
it. The read does not change with a local edit, so the stream stays open
across one.

`pollLive`, `rowLog` and `rowChangeLog` come from `foldkit-remote-drizzle`.
The handler runs `AllTodosSource` for the stream with the page's own window
and the subscriber's principal; `changes` reads the table's row log.

```ts
server = RemoteServer.make({
  entities: [TodoSource],
  queries: [AllTodosSource],
  live: [pollLive(TodoSource, { changes: rowLog(Db.Todo) })],
})
```

A server process that owns both sides (Node, a long-lived VM) can use
`RemoteServer.liveHub` instead; `examples/kitchen-sink` does. The example would
rather show what deploys.

A tick reads only the rows written since the last one.
`migrations/0004_row_change_log.sql` holds `rowChangeLog(Db.Todo)`'s
statements (`test/migrations.test.ts` keeps the two equal): they log the id of
each row a write to `todos` touches in `todos_row_changes`, with triggers, so
every path that writes the table (a Remote mutation, a declared write, the journal's `settle`) is logged
with no code of its own; the last 1000 entries are kept. Each tick asks the
log what follows the entry it last read and re-reads those rows alone: a quiet
tick is one small query, and the window is read only when the stream opens. A
logged row the subscriber can read is in the list, and one that is gone has
left it, which holds because `AllTodos` lists every row. A log that cannot be
read, as before the migration is applied, or that no longer reaches back to
the last entry, reads everything, as before. The interval stays a knob (`'250
millis'` by default). The subscribed fields are the ones the subscriber
selected, and the list watch reads `id`, `title`, and `done` for the page's
window. `settle` stays unconditional and crash-safe: `journal.recover` makes
applying an operation twice a no-op, and the settled cursor persists in
`durable_meta`, so a restarted settle resumes rather than reapplies. The worker
still re-reads D1. Nothing here pushes across requests.

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

## Signing in

The Worker also serves Yielded Auth's routes (`/auth/…`: sign up, sign in,
sign out) and `/me`, which answers who a session cookie is through
`AuthServer.resolver`, for the page at `AUTH_ORIGIN`; unset, both answer 404.
Auth is built once per isolate (`src/authRoutes.ts`) over
`@yielded/auth-persistence-drizzle/D1`, whose commits are D1 batches: Yielded's
core `AuthPersistence` commits in a transaction, which D1 refuses. Sign-up
writes the application's `accounts` row in the batch that binds the email
(`src/auth.ts`). `migrations/0005_auth.sql` creates `accounts` and Yielded's
tables, and `test/auth.test.ts` signs up, signs in, reads `/me` and signs out
on miniflare.

The Worker runs with `nodejs_compat` for Yielded's password hashing, and the
build writes its Argon2 `.wasm` beside `dist/worker.js`. The deployed page's
`_worker.js` forwards only `/remote` and `/sync`, so the public demo has no
sign-in: forwarding `/auth/…` and `/me` and setting `AUTH_ORIGIN` to the
Pages origin would add it.

## Run it

```bash
pnpm dev      # the page at http://127.0.0.1:5177, the worker behind it
pnpm demo     # the loop, printed, on a real workerd
pnpm test     # the same loop, asserted
```

Each starts the worker the way `wrangler.toml` declares it: its bindings,
compatibility date and flags, `.dev.vars`, and D1 migrations are read from
that file by Wrangler's own test harness, so the local worker cannot drift
from the deployed one. The stack (`foldkit-plus/testing/workers`, called
from `src/stack.ts`) only bundles, with the
workspace's source condition, and refuses a compatibility date the installed
workerd does not know rather than run an older runtime. Under `pnpm dev`, a
change to anything the worker bundles, or to `wrangler.toml`, swaps the new
worker in at the same origin, keeping D1, R2 and the Durable Object's
storage. Each change is started on a workerd of its own first, so one that
does not build, or builds a worker that does not start, leaves the last one
running.

From the repository root, `npx vitest run --config vitest.e2e.config.ts
examples/cloudflare` starts the worker on miniflare and the page on Vite, and
drives the page in Chromium (`e2e/page.e2e.ts`). It holds the add's write
at the network and asserts the todo shows meanwhile and after the answer,
that the list never reads "Loading…" while it does nor across a reload, and
that the page logs no error (`foldkit-plus/testing/playwright`'s `Behaviors`).

`src/schema.ts` holds the table, the Drizzle binding, the Sync contract, the
journal, `settle`, the polling source, and the declared writes' writer.
`src/domain.ts` is the Entity, `src/operations.ts` the query and the
mutations the page and the server share, and `src/forms.ts`, `src/app.ts`,
and `src/view.ts` the page. `src/browser.ts` boots it. `src/worker.ts` is the
routes. `src/client.ts` drives the wire for the test and the demo;
`src/stack.ts` starts the local stack for them and for `pnpm dev`.

## The page

`index.html` loads `src/browser.ts`. One Foldkit application, drawn with the
demos' theme (`src/style.ts`): an `AppShell` frame, the rows and the rename
editor in `foldkit-mixins-crud/recipes`' looks, and the forms in
`foldkit-mixins-form/recipes`':

- `Todo` is `Entity.define`. `done` is the integer `0 | 1` the column stores.
- `AddTodoForm` and `RenameTodoForm` are `Form.make` over `Entity.input`.
- `Crud.list` joins the `AllTodos` query to that selection. Its status line
  is there from the first paint; `Loading.shown` says "Loading…" only once
  the wait has lasted, and a later refresh keeps the rows.
- Add, rename, toggle, and delete call `Data.mutate` with a declared write,
  so Remote works out the paint from the write itself: a new row joins the
  `AllTodos` connection where its title sorts, and a delete hides the row
  from every list. That paint is the same update as the click. The list draws by title,
  then id, the order the query asks for, so a new or renamed row is already
  where it will stay. The "Saving…" line above the form is reserved the whole
  time, and its words use the same delay, so a fast save neither flashes nor
  moves the list.
- The answer to a write is the row, and names no list. `AllTodos` declares
  its order in its body (title, declared `binary` as D1 compares it, then
  id), so Remote places a created or renamed row in the list itself. The
  list is not asked again.
- The list is stored in the browser, one snapshot per actor. The next visit
  paints those rows in its first frame and asks again: `src/browser.ts`
  restores them before `init`, as the runtime's Flags
  (`persistence.restore`). A failed ask, including offline,
  leaves them. An unsent write is not stored.
- Another tab sees a field change as a live patch, and a row joining or
  leaving as a connection event. The page does not ask on a clock. The stream
  is SSE. Inside that request the worker still re-reads D1.

A create sent again under its operation id (as `Data.mutate` sends every
write) is answered from the ledger with its row, written once. Toggle writes
the stored `done`, so sending it twice leaves the row as it is.
`test/law.test.ts` holds the page to the server with `Law.check`
(`foldkit-remote/testing`): each of the four writes runs through the page's
`Data.mutate` and through the Worker's Remote server over the migrations on
Node's SQLite, and what the page showed while it was pending (each field, the
list's order, a deleted row) must be what the table then holds. The page does not open
the Sync socket. `pnpm demo` and `pnpm test` still write through the journal.

To deploy for real, run Wrangler (a dev dependency here, as `pnpm exec
wrangler`) from this directory, one command at a time:

```bash
pnpm --filter foldkit-example-cloudflare build:worker
pnpm --filter foldkit-example-cloudflare build:page
wrangler d1 create foldkit-cloudflare
# put that database_id in wrangler.toml
wrangler d1 migrations apply foldkit-cloudflare --remote
# only to take uploads; without it, every upload is refused
wrangler secret put UPLOAD_TOKEN
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
