# A list read live (#270)

Status: built (2026-10-29) in `foldkit-remote` (`Data.query`'s `live`,
`LiveRequirement.queries`, protocol 5), `foldkit-remote-server` (`LiveQuery`,
the handler's admission), `foldkit-remote-drizzle` (`pollLive`) and
`foldkit-crud` (`Crud.list`'s `live`). Follows
`264-guarded-poll-live-DESIGN.md` and `live-limits-DESIGN.md`.

## The problem

`pollLive` (`foldkit-remote-drizzle`) diffs a list for a stream that
subscribes to the list's `watchId`, an id that names no row. A page opens
that stream with a live read of the made-up row, written by hand from
internals:

```ts
const watch: Projection<Model, unknown> = {
  Model: Schema.Unknown,
  dependencies: [],
  metadata: Data.live(NoteRow, NOTES_WATCH).metadata,
  read: () => undefined,
}
```

The page and the server then share three things by convention: the made-up
id, the window (`NOTES_PAGE`), and the fields a listed row is drawn with.
Nothing checks that they agree. `examples/cloudflare` does the same, and its
snapshot (`cache.ts`) strips the made-up row the store took in.

The page already says everything the server needs when it reads the list:
`Data.query(Notes, {}, { select: NoteRow, first: 50 })` names the query, its
input, its window and the fields of each row.

## Decision

```text
Data.query(Q, input, { select, first, live: true })
  -> the live entry subscribes { requirements, queries: [QueryRequest], after }
  -> handlers admit each query and resolve it: LiveQuery { identity, entity, fields, edges }
  -> pollLive diffs every LiveQuery of its entity
```

1. **`live: true` on `Data.query`.** The connection requirement carries
   `live`, as `Data.live` marks an entity requirement. A Surface's live entry
   (`<key>.live`) subscribes to the live rows and the live queries its reads
   ask; `Data.liveStatus` covers both. A list is the same read live or not,
   so it is an option of the read, as its window is.
2. **The wire carries the query as a read sends it.** `LiveRequirement`
   gains `queries`: `QueryRequest`s (query name, encoded input, window,
   select), built from the connection's identity as `Data.query`'s read
   builds them. The stream's key includes them, so a list read live from
   another page is a new stream. `REMOTE_PROTOCOL_VERSION` becomes 5: a
   server that ignored `queries` would leave a live list silently still.
3. **The handler admits a live query with the rest.** Refused with
   `RemoteLiveRefused`, before any live source is asked: an unknown query, an
   input its `Input` does not decode, a query without `select` (a row is
   diffed by the fields it is drawn with), a window without `first` (a list
   re-read each tick must have a size), or one whose `first`, added to the
   ids of its entity the subscription names, passes `maxIdsPerEntity`. A
   watched row costs what a subscribed one does.
4. **The handler resolves it, so a live source needs no query of its own.**
   It hands the live source of the query's entity a `LiveQuery`: `identity`
   (the connection's, from the query's name and input as the client keys
   it), `entity`, `fields` (the select's), and `edges`, the registered
   `QuerySource` run as the principal with the client's input and window.
   `LiveSource.subscribe` takes `queries` beside `requirements`.
5. **`pollLive` watches what it is given.** Its `lists` option and
   `ListWatch` go (breaking): it diffs each `LiveQuery` of its entity as it
   diffed a watched list. Each list is read silently when the stream opens
   and invalidated once, so a page read before the stream opened, or across
   a reconnect, asks again.
6. **The hub watches no list.** `liveHub` pushes changes of subscribed rows;
   a live query reaches only a live source, and is watched by nothing on a
   server with none for its entity, as a row of an entity with no live
   source is.

## Options considered

- **Keep the watch id, made by the library** (`Data.watch(Notes)`). The
  window and the fields would still be the server's convention, and a row
  that names nothing would still enter the store.
- **Name the list by its identity only, and keep the window on the server.**
  Leaves the window and the fields as conventions; the client already sends
  both with every read of the list.
- **`Data.liveQuery`, beside `Data.live`.** A second constructor for one
  read with one difference; the option keeps a list one read.
- **Trust the client's `identity` string.** The server rebuilds it from the
  query name and input it runs, so it names what the stream actually
  watches.

## Migration

- The reference app reads its notebook with `live: true`; `NOTES_WATCH`,
  `NOTES_PAGE`'s second reader and the hand-written projection go, and its
  `pollLive` takes no `lists`.
- `examples/cloudflare` likewise; `LIST_WATCH` and the snapshot's stripping
  of it go.

## As built

- `LiveSource.subscribe` is a method: `queries` carries `R` into its
  parameter, and as a function property that made a source of `R = never`
  no `LiveSource<any, any>`, which `ServerDefinition<any, any>` callers take.
- `pollLive` diffs a listed row by its `select`'s fields less a paged
  relation (one in `select.windows`), as it polls no relation of a
  subscribed row.
- A list's window is run again each tick that may have moved it: every tick
  without a row log, and with one each tick the log names a row of its
  Entity. Built first, the log path listed a logged row whenever the
  subscriber could read it, so a filtered list took in rows its query
  excludes, and a window grew past its `first`. Judging the row with the
  query's body, as the client's `matching` does, was the other way out; it
  needs an interpreter of every body on the server's rows and still leaves
  the window's size unbounded, while the registered query already is the
  server's judgement of both. A quiet tick still runs nothing, and only the
  rows that join, were logged or leave are read.
- A row that leaves a list is read too. One the subscriber can still read is
  removed from the list and patched with what changed, not deleted: built
  first, every row that left was sent as `EntityDeleted`, so a row pushed out
  of a full window, or edited out of a filter, read `NotFound` on the page
  while it existed.
- A live list is invalidated on every stream open, beside subscribed rows
  too. The old watch invalidated only a stream that asked for watch ids
  alone; a reconnect re-reads rows, not lists, so a list must be asked again
  by the source.

## What is tested

- `packages/remote/test/liveQuery.test.ts`: the live entry sends a list as
  its read sends it, nothing for a list read without `live`, a cursor per
  list, `Data.liveStatus`, `first` required, and a merge stays live.
- `packages/remote-server/test/liveQuery.test.ts`: the page's own request,
  through the RPC handlers and through `Remote.clientLayer`, is named as the
  page keys the list, run as the principal with the page's window, handed only
  to the live source of its Entity; each refusal before any source is asked;
  `first` counted with the ids.
- `packages/remote-drizzle/test/poll.test.ts`, `packages/guard/test/server.test.ts`:
  the watched-list cases moved onto `LiveQuery`, plus a list of another Entity,
  an invalidation beside rows, and a paged relation left unread.
- `packages/remote-drizzle/test/pollWindow.test.ts`: over real SQLite, with
  and without a row log, from the page through the handlers and back into the
  Model: a row edited out of the filter, or pushed out of a full window, is
  removed from the list and still reads `Ready`; a deleted row is deleted; a
  row written outside the filter never joins.
- `packages/crud/test/list.test.ts`: `Crud.list`'s `live`.
- `examples/reference/test/worker.test.ts` on workerd, and the reference and
  cloudflare e2e: a member's list hears another member's note join and leave.
- Mutations: `remote-server/test/liveQuery.mutations.ts` (22, all killed),
  and the re-anchored `poll`, `liveLimits` and guard `server` specs.
