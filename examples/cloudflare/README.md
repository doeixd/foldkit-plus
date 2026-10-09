# Cloudflare: the whole stack in one worker

The stack of the other examples, in the shape you would deploy it: a
Cloudflare Worker whose **reads** are Remote over D1, whose **writes** are
Sync through a Durable Object's D1 journal, and whose **live** stream tells a
Remote reader what changed.

```
POST /remote  ->  serveFetch            (D1 reads, queries, live)
POST /sync    ->  DocumentHost          (upgrade; one object per document)
```

`pnpm demo` runs it against local [miniflare](https://miniflare.dev) — a real
`workerd`, over real HTTP — and prints the loop. `pnpm test` asserts it.
Neither needs an account; deploy is `wrangler deploy` once you have one.

## What each piece owns

| Piece | Owns |
| --- | --- |
| `todos` (Drizzle table) + `Todo` binding | the rows. One declaration reads and writes them |
| `AllTodos` (Query) | the connection `remote-drizzle` compiles into SQL over D1 |
| `App`/`Message`/`update` + `Todos` (Sync contract) | which Messages are durable, and the replay they imply |
| `SyncHost` (Durable Object) | the document's single writer: it opens the journal once, and each accepted socket exchanges against that journal |
| `settleTodos` | applying what committed to the `todos` table, where Remote reads it back |

The invariant the whole thing turns on:

```
Sync writes -> journal orders them -> settle applies them -> Remote reads them
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
3. `settle` then applies it — the `INSERT` or the `UPDATE` — through
   `journal.recover`, and persists the cursor.
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

`src/schema.ts` holds everything that is not the worker: the table, the
bindings, the contract, the journal open, `settle` and the polling source.
`src/worker.ts` is the two routes. `src/client.ts` drives the wire for the
test and the demo; `src/stack.ts` boots miniflare for both.

To deploy for real, add `wrangler` (`npm i -D wrangler`), `wrangler d1 create
foldkit-cloudflare`, put that `database_id` in `wrangler.toml`, and
`wrangler deploy`. The worker needs no account to run locally.

## See also

- [`packages/sync`](../../packages/sync) — the exchange, the transports, and
  `defineDocumentHost`.
- [`packages/remote-server`](../../packages/remote-server) — `serveFetch`, the
  live streams, and when a hub can be used at all.
- [`examples/registry`](../registry) — the same read/write split with a browser
  editing 100,000 rows.
