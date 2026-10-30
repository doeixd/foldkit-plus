# `foldkit-remote`

Server data, cached inside the Foldkit Model. A screen says what it needs;
the view gets what the cache knows.

```ts
const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.get(ProjectSummary, params.projectId) }),
})

RemoteData.render(project, {
  loading: () => ProjectSkeleton(),
  notFound: () => NoSuchProject(),
  failed: error => ErrorView(error),
  data: project => ProjectView(project),
})
```

No fetch call, no cache object, no loading flag. While the page is active,
Remote fetches only the fields the Model lacks, stores each entity once, and
hands the view one of six states rather than an `undefined`. Every result is a
Message through one reducer, so a screen replays from a recorded Model.

Remote is for facts the **server owns**. A write that must reach the server
even if the page goes first is a durable write, which Remote's outbox sends
later. An edit the client authors, which must converge with other devices'
edits while offline, belongs to [`foldkit-sync`](../sync).

## If you know TanStack Query, TanStack DB or fate

The same job, done from the other side of the Model:

| TanStack Query | `foldkit-remote` |
| --- | --- |
| `useQuery({ queryKey, queryFn })` in a component | `Data.get(Selection, id)` in a Surface; the active Surface fetches |
| a `queryKey` you design | the entity, its id and the fields selected; there is no key to design |
| one cache entry per key | one entity per id, shared by every selection of it |
| `staleTime`, `refetchOnWindowFocus` | `RemotePolicy`, `Data.refresh` from `update` |
| `gcTime` | retention: what no active Surface reaches is collected |
| `onMutate` + `setQueryData` | `optimistic: [Remote.patch(...)]`, a layer the settlement removes |
| `invalidateQueries` | not needed for overlap: a result updates the one copy |
| `isPending`, `isError`, `data` | `RemoteData`: six states, one exhaustive fold |
| a `QueryClient` beside your state | `Remote.Model`, a field of your Model, changed only by Messages |

Two differences change how you build. **There are no keys.** A TanStack cache
is a map from keys you design to results you shape, so two components that
want overlapping data either share a key and over-fetch, or hold two copies
and invalidate by hand. Remote stores fields by entity and id, and a Surface
declares which fields it selects, so overlap is the normal case and a
mutation's result is seen everywhere at once. **The cache is Model.** A
`QueryClient` lives beside your state and is updated by effects; `Remote.Model`
is a field of your Model, changed by the same reducer as everything else, so a
screen is a function of the Model, replays from a recording, and is tested
without a network.

What Remote does not have: a component hook (it has Surfaces and Foldkit
Subscriptions), a devtools panel of its own (`Data.inspect`, `Data.why` and
`Data.timeline` are the data one would show), and retries of a failed read (it
stays failed until something asks again; see
[When a read fails](#when-a-read-fails)). Only a durable write is sent again
on its own, and only when nothing answered it.

### And TanStack DB, and fate

[TanStack DB](https://tanstack.com/db) is a local database: collections
populated eagerly (or on demand) from a REST API or a sync engine, live queries
that update incrementally, and optimistic transactions rolled back on failure.
Its unit is the collection; a screen queries what is already local. Remote's
unit is the field: a screen declares which fields of which entities it reads,
and only those are fetched, so there is no collection to load first and a page
carries what it shows. Remote has no live query engine: `Data.filtered` and
`matching` judge the rows a list already holds, a new list is a server query,
and a list read `live` is kept current by the server's live source, not by
the client. Where TanStack DB syncs client-authored writes through a sync
engine, that job here belongs to [`foldkit-sync`](../sync), and Remote stays
the disposable cache of what the server owns.

[fate](https://fate.technology) is the nearest cousin: components declare
views of exactly the data they need, composed into one request per screen,
with a normalized cache that masks what a component did not ask for, and
actions with optimistic rollback. Remote's Selections are that strictness, and
its store is that cache. The differences are where it lives and what runs it:
fate is a React data client, driven by Suspense and Actions; Remote is a
Submodel of a Foldkit Model, driven by which Surfaces are active, with no view
framework in it.

## Find what you need

Read the [first run](#the-first-run-one-entity-one-surface) once, then jump to
what you are doing:

| Task | Start here |
| --- | --- |
| See it work before there is a server | [Step 5](#5-provide-a-client) |
| A read stays `Initial` | [Why is it still `Initial`?](#why-is-it-still-initial) |
| A read is `Loading` or `Refreshing` and you did not expect it | [Why is it `Loading`?](#why-is-it-loading) |
| A list shows old rows | [Why is it stale?](#why-is-it-stale) |
| A saved change showed, then vanished | [Why did my change disappear?](#why-did-my-change-disappear) |
| A page I came back to reads `Refreshing` or `Loading` | [Why `Refreshing`?](#why-does-a-page-i-went-back-to-read-refreshing) |
| Ask the Model why a read shows what it shows | [`Data.why`](#why-is-it-loading) |
| Test that a list never blinks to `Loading`, without a browser | [`Trace`](#testing-what-a-reader-sees-trace) |
| Test that what a write shows is what the server stores | [`Law`](#testing-that-a-prediction-is-the-truth-law) |
| Show a failed read, and let the user retry | [When a read fails](#when-a-read-fails) |
| Load an ordered, paged list | [Queries and pagination](#queries-and-pagination) |
| Filter a list already on screen | [Filtering a loaded list](#filtering-a-loaded-list-without-asking-the-server) |
| Save, and show the result before the server answers | [Mutations](#mutations-and-optimistic-state) |
| Save a write that must reach the server across a reload or offline | [`Data.outbox`](#a-write-that-outlives-the-page-dataoutbox) |
| Keep a list current as the server changes it | [Live data](#live-data) |
| Fetch outside an active screen | [Policies and prefetch](#reading-policies-and-prefetch) |
| Keep data across a reload | [Hydration](#persistence-and-hydration) |
| Hand a server render's data to the browser | [Server rendering](#server-rendering-remoteresume) |
| Answer the requests on the server | [How the server packages fit](#how-the-server-packages-fit) |

## Which state belongs here?

One owner per datum:

| State | Owner |
| --- | --- |
| Route, selected item, local form state, transient UI errors | the application Model and `update` |
| Server-derived facts that can be refetched | `foldkit-remote` |
| A write the server decides, which must be sent even after a reload | `foldkit-remote`, `durable` (its outbox) |
| Client-authored state that must survive offline and converge | `foldkit-sync` |
| Local state represented in the URL or another store | the Model, observed by `foldkit-mirror` |

```text
Remote                              Sync
  server owns the fact                client owns the edit
  cache is disposable                 intent must survive offline/restart
  refetch is recovery                 replay + reconciliation is recovery
  outbox: send it later               converge
```

A Surface may project all of these owners at once. Observation does not transfer
ownership.

## The mental model

```text
Surface Projection → requirements → active Subscription → RemoteClient I/O
        ↑                                                    |
        └──────── read Model ← Data.reduce ← Remote Message ──┘
```

A Projection reads the current cache and carries requirements such as
`Project:p1.name` and `User:u7.name`. An active Subscription compares those
requirements with the cache, then requests missing or stale fields. The
result returns as a Message; only reducing it changes what the next read sees.
Rendering the same Projection twice starts no work by itself.

> **A Remote Projection does not fetch. It declares what server-owned facts a
> consumer requires. I/O happens outside render, and its results reduce back into
> the Model.**

Four roles carry the loop, and most application code needs no more:

| Piece | Responsibility |
| --- | --- |
| `Data.get` / `Data.live` / `Data.query` | create pure Projections that declare what a consumer needs |
| `Data.subscriptions` | turn the requirements of **active** Surfaces into reads, live subscriptions, and retention roots |
| `Data.reduce` | reduce returned Remote Messages into the application's `Remote.Model` |
| `RemoteClient` | perform the actual read/query/mutate/live I/O |

One rule keeps the cache coherent: **`Data.reduce` is the only writer.** Local
application state changes with `modifyFields` inside `update`, like anywhere
else; a server fact only enters the cache as a Remote Message. Never install
cache state with a ref `set`: requirements, staleness and tombstones stay
consistent only because every fact arrives through the reducer.

## Install

```bash
pnpm add foldkit-remote foldkit-entity
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the
package. The server-side interpreter is [`foldkit-remote-server`](../remote-server).

## The first run: one entity, one Surface

Six steps take a project's name from a server to a screen. Each says what it
does, and what it deliberately does not.

### 1. Declare an entity and what this screen needs of it

```ts
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'

const Project = Entity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
  }),
)

// A Selection is the exact server-owned shape this consumer needs.
const ProjectSummary = Entity.select(Project, {
  id: true,
  name: true,
})
```

The entity comes from [`foldkit-entity`](../entity), which declares a domain
without Remote in it, so the same declaration can serve the server's database
binding and your forms too. It is also what gives an entity
[relations](#entities-declared-with-foldkit-entity), derived members, and a
[query body](#queries-and-pagination) to point at. Nothing here touches a
network.

### 2. Give Remote a place in the Model, and route its Messages

```ts
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Route = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('home') }),
  Schema.Struct({
    _tag: Schema.Literal('project'),
    projectId: Schema.String,
  }),
])

const Model = Schema.Struct({
  route: Route,
  remote: Remote.Model,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  GotRemoteMessage: { message: Remote.Message },
})
type Message = typeof Message.Type

const App = Surface.application({
  Model,
  Message,
  initial: {
    route: { _tag: 'home' },
    remote: Remote.initial,
  },
  update,
})

const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
})

// Remote under one variant of the union, the shape Foldkit gives a Submodel.
const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))

function update(
  model: Model,
  message: Message,
): Update.Return<Model, Message, RemoteClient> {
  return Message.match(message, {
    // Remote owns the `remote` Submodel: everything it says goes through its reducer.
    GotRemoteMessage: ({ message }) => foldData(model, message),
  })
}
```

`Remote.Model` is not a second store. It is a Submodel **inside** the
application Model, and `Data` is the bound API for this domain: it knows where
that Submodel lives and which entities this application registered. `update`
matches the union exhaustively; Remote's own Messages arrive inside
`GotRemoteMessage` and go straight to Remote's reducer. (There is a shorter
form for an `update` that only reduces; see
[Routing Remote's Messages](#routing-remotes-messages).)

### 3. Declare what the screen reads

```ts
const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: Schema.String },

  model: ({ params }) => ({
    // Important: this performs no I/O.
    // It is a pure Projection over Model plus a requirement for these fields.
    project: Data.get(ProjectSummary, params.projectId),
  }),
})
```

`ProjectPage` reads a `RemoteData<{ id: string; name: string }>` from the Model.
If those fields are absent, the Projection still does not fetch them: it says
what it needs, and something else decides whether to ask.

### 4. Let the active screen drive the fetching

```ts
import { Option } from 'effect'
import * as Subscription from 'foldkit/subscription'

const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() =>
  foldData.subscriptions({
    project: Surface.at(ProjectPage, model =>
      model.route._tag === 'project'
        ? Option.some({ projectId: model.route.projectId })
        : Option.none(),
    ),
  }),
)
```

`Surface.at` makes activation a fact of the Model. When the route activates the
page, Remote sees its requirements, diffs them against the cache, and fetches
only what is missing. When the page is inactive, it creates no read work. This
is the one step that causes I/O, and it does so only while the screen is on.

A read that is not a Surface's, such as the record a detail pane shows, is made
active with `Data.active`: its function of the Model returns the read, or none
while there is nothing to read.

```ts
const detail = Data.active('ProjectDetail', model =>
  Option.map(model.openProjectId, id => Data.get(Entity.select(Project, { name: true }), id)),
)
foldData.subscriptions({ detail })
```

Its `projectionOf(model)` gives back that read, with its value's type. It
belongs to the domain's application and sends no Messages. A domain bound
to a raw optic (`ModelRef.fromOptic`) names no application, so `Data.active`
throws for one rather than guess.

### 5. Provide a client

The Subscription needs a `RemoteClient`. Before there is a server, a backend
held in memory answers through the same handlers a real one uses:

```ts
import { RemoteServer } from 'foldkit-remote-server'

const clientLayer = RemoteServer.memory({
  domain: Data,
  rows: { Project: [{ id: 'p1', name: 'Apollo', status: 'active' }] },
}).layer
```

With a server, hand Remote the Effect RPC client for `RemoteRpc`; the
[server guide](../remote-server/README.md) supplies the other side:

```ts
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { RpcClient, RpcSerialization } from 'effect/rpc'
import { RemoteRpc } from 'foldkit-remote'

const clientLayer = Layer.unwrap(
  Effect.map(RpcClient.make(RemoteRpc), rpcClient => Remote.clientLayer(rpcClient)),
).pipe(
  Layer.provide(Remote.rpcProtocolHttp('/rpc')),
  Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
)
```

`Remote.rpcProtocolHttp(url)` is Effect's `RpcClient.layerProtocolHttp({ url
})`, except that a response whose status is not 2xx fails the call with its
status. Effect's own reads such a body as RPC frames and loses the status, so
a request the server refused for its size (`bodyLimit`'s 413) would read as
unreachable, and a durable write would be sent again for good.

Or, with no Effect RPC on the server, plain JSON over HTTP: each call a `POST`
of `{ operation, payload }`, answered `{ result }` or `{ error }`.
[`RemoteServer.answer`](../remote-server/README.md#over-plain-json) is the
other end:

```ts
const overHttp = Remote.clientLayer(
  Remote.http('/remote', { headers: () => ({ 'x-session': 'the session token' }) }),
)
```

Each is a Layer the runtime provides to `subscriptions` and Commands; the
transport itself is not owned by Remote. See
[`RemoteServer.memory`](../remote-server/README.md#a-backend-held-in-memory)
for what the in-memory one can and cannot do, and
[Clients and transports](#clients-and-transports) for the others (a worker or
a `MessagePort`, live data over HTTP), what a refused or unreachable call
does, and testing a server over HTTP.

### 6. Watch it arrive

```text
ProjectPage Projection
        |
        | requirements
        v
Data.subscriptions
        |
        | plan missing fields
        v
RemoteClient
        |
        | server result
        v
Remote Message
        |
        v
Data.reduce
        |
        v
Remote.Model
        |
        v
ProjectPage now reads Ready(...)
```

The first run starts on the `home` route, so no project read runs yet. Your
route update must activate `{ _tag: 'project', projectId: 'p1' }`, and the
runtime must install `subscriptions`. The page then reads `Initial` until work
starts, `Loading` during the first request, and `Ready` once its result is
reduced. If it stays `Initial`, see [Why is it still `Initial`?](#why-is-it-still-initial).

## Routing Remote's Messages

The first run folds Remote's Messages under one variant of the application's
union, the shape Foldkit gives a Submodel. The fold's `fetch`, `mutate`, and
`subscriptions` yield that variant too, with the lift recorded so a Story
resolves a fetch or a mutation by Remote's own answer.

The shorter path, for an `update` that only reduces, spreads Remote's cases
into the union and narrows by tag; the rest of `update` is then a partial
match over tags the application never handles:

```ts
const Message = defineMessageUnion({ ...Remote.messages })

function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  return { model }
}
```

The snippets below call the domain itself (`Data.subscriptions`,
`Data.mutate`, `Data.retry`, `Data.preload`), as the spread form does. Under
the fold, call the fold's members of the same names (`foldData.mutate`, …),
which yield the wrapper Message; the members that only read or write the Model
(`Data.get`, `Data.refresh`, `Data.overlay`, …) stay on the domain either way.

### One value with `foldkit-bundle`: `Data.wiring`

The integration steps above — fold or reduce, derive the Subscriptions,
provide the client — are one value when the application uses `foldkit-bundle`:

```ts
import { Bundle } from 'foldkit-bundle'

const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(
  Data.wiring({
    project: Surface.at(ProjectPage, model =>
      model.route._tag === 'project'
        ? Option.some({ projectId: model.route.projectId })
        : Option.none(),
    ),
  }),
)
const update = wiring.update(model => ({ model }))
```

`Data.wiring` routes Remote's Messages into `Data.reduce`, brings the active
Surfaces' Subscriptions and the domain's contract, and requires `RemoteClient`
from the runtime's resources — the same client layer from above. One assembly
holds at most one Remote domain: every domain claims the same Message tags,
and the assembly refuses a second claimant at startup, naming both.

## `RemoteData`: what does the Model know right now?

A Remote Projection never lies by pretending an absent value is present. It
returns a closed `RemoteData` union:

```text
                         no active fetch
missing ------------------------------------------------> Initial

                         fetch starts
missing ------------------------------------------------> Loading
                                                            |
                                                         result
                                                            v
                                                          Ready
                                                            |
                                                       refetch starts
                                                            v
                                                        Refreshing
                                                        old value stays
                                                            |
                                                         result
                                                            v
                                                          Ready

server says entity is absent ---------------------------> NotFound
stored value fails Selection decoding -----------------> Failed
a read or a list's query fails ------------------------> Failed (with the old value, if any)
```

The states are:

- **`Initial`** — required data is absent and **nothing is currently fetching it**.
- **`Loading`** — required data is absent and a read, or a list's query, is in
  flight.
- **`Ready`** — every selected field is present and decodes.
- **`Refreshing`** — the current value remains visible while it is being
  refetched, or, for a list, while some of its rows are still being read.
- **`Failed`** — stored server data does not decode against the Selection, the
  read or query behind it failed, or the server settled a selected field
  without a value (an `Unavailable` error; see
  [When a field is withheld](#when-a-field-is-withheld)). A value that was
  already shown is kept as `previous`.
- **`NotFound`** — the entity is represented by a tombstone: a live event
  deleted it, or the server was asked for it by id and answered with nothing
  about it. That id is then known absent, whether it never existed, is gone, or
  is hidden whole from this principal. It is not planned again until
  `Data.refresh` forces it or a write brings it back. The target of a returned ref is not marked this way: a
  server need not expand a relation that rides on a request, and the planner asks
  for such a target by id next, which is when its absence is learned.

`Initial` is intentionally different from `Loading`. A Projection belonging to
no active Surface may remain `Initial` forever. Rendering a spinner for
`Initial` can therefore hide an activation/wiring mistake; `Loading` is the
state that actually means "wait for this request."

When a read sits at `Initial` and you expected data, ask the Model why with
`Data.why`; see [Why is it still `Initial`?](#why-is-it-still-initial).

`RemoteData.match` is exhaustive, so adding or omitting a state is visible at
compile time. `RemoteData.answered(data)` is whether a read has an answer yet:
`Ready`, `Refreshing`, `Failed` or `NotFound`, not `Initial` or `Loading`.

### Drawing one: `RemoteData.render`

Most views draw these six states three ways, under one policy: useful data
stays on screen. `RemoteData.render` is that fold.

```ts
RemoteData.render(project, {
  loading: () => ProjectSkeleton(),
  notFound: () => NoSuchProject(),
  failed: error => ErrorView(error),
  data: (value, freshness) =>
    ProjectView({ project: value, dimmed: freshness._tag !== 'Fresh' }),
})
```

`Initial` and `Loading` reach `loading`; `Ready` and `Refreshing` reach `data`;
a `Failed` that still carries the value it had reaches `data` too, so a read
that failed does not throw away what the reader was already looking at. Only a
`Failed` with nothing to show reaches `failed`.

The `data` branch is told which it got, as a `Freshness` — exported, so a view
helper that takes one can name it, and folds it with its exhaustive
`Freshness.match`:

| `Freshness` | What it means |
| --- | --- |
| `Fresh` | This is the current answer. |
| `Refreshing` | A newer answer is on its way; this one is still good. |
| `Stale` | A read failed; this is what was last known good, with its `error`. |

It is one tag rather than a pair of booleans because a value cannot be both
refreshing and stale, and a type that can say so invites a view to handle a
state that never arrives.

`notFound` is its own branch and not optional. A row the server answered for
and does not have is neither loading nor a failure; drawing it as either is a
spinner that never ends or an error nobody can act on.

Reach for `match` instead when the six states really do draw differently — it
stays the exhaustive fold, and `render` does not replace it.

## When it does not do what you expect

Each of these is a design of the package showing through, not a fault. The
symptom names the section; the cure is one call.

### Why is it still `Initial`?

`Initial` means required data is absent and **nothing is fetching it**, so a
spinner here hides a wiring mistake. Ask the Model:

```ts
Data.why(model, projection, { surfaces }) // the record you give Data.subscriptions
// { state: 'Initial',
//   because: [Why.NotFetching({ surfaces: ['ProjectPage'] }), Why.Fields({ … })],
//   message: 'ProjectPage reads it and is active, yet nothing is fetching it. …',
//   surfaces: Option.some(['ProjectPage']) }
```

The first reason is the one that decides `Initial`:

- `NotObserved`: no active Surface reads it. The Surface is not in the record
  you gave `Data.subscriptions`, or its `Surface.at` function returns none for
  this Model (the route is not there yet).
- `NotFetching`: an active Surface reads it and nothing started a request.
  Right after a Message that is the moment before the read entry asks; if it
  stays so, Remote's Subscriptions are not installed in the runtime.
- `NoActiveRecord`: no `surfaces` were given, so it cannot tell which.

`Data.plan(model, projection)` shows whether Remote believes anything is
missing at all.

### Why is it `Loading`?

A list reads `Loading` when its page is missing and its query is out, and
also when it holds its page and one row's field is being fetched. It reads
`Refreshing` when the page is stale, a row is stale, or a row is left out
until a field arrives. `Data.why` tells them apart. `because` lists every
fact the Model holds about what the read reads, by typed reference, never by
the store's internal marks. The reason that decides the state comes first.
Match them with `Why.match`:

| `Why` | What it says | What restarts it |
| --- | --- | --- |
| `List { list, held, inFlight }` | the list's own page is `Missing`, `Evicted` (the budget dropped it) or `Stale` | the read entry, while a Surface reads it |
| `Fields { row, via, fields, held, inFlight }` | fields of one row are `Missing`, `Evicted` (the budget dropped the row) or `Stale`; `via` is the relation path (`['owner']`) | the read entry |
| `ListFailed`, `FieldsFailed` | a request failed | **nothing on its own**: `Data.refresh`, a write of the field, a new page |
| `Unavailable`, `Undecodable`, `OverlayOnly` | the store holds what cannot be shown | a change of Selection or overlay |
| `Deleted { row, by }` | the server deleted it (`by` none), or a pending write does | — |
| `LiveReconnecting`, `LiveRefused` | a live stream of a Surface reading it broke, or was refused | the live entry, with backoff; nothing, for a refusal |
| `Pending { row, fields, by }` | a pending write shows these fields | its answer |
| `Joined`, `Left { list, row, by, terms }` | the list shows a row its pages do not hold, or hides one they do | its answer |

`by` is a `ShownBy`: `Write { requestId, mutation }`, `Overlay { id }` or
`Live { cursor }`. `terms` are the list body's `where` predicates judged over
the row as the client placed it, so a row that joined says which term put it
there, and one the client could not judge says what it lacked:

```ts
// a project archived optimistically, in a list of active ones
Why.Left({
  list: { query: 'ByStatus', identity },
  row: { entity: 'Project', id: 'p1' },
  by: Option.some(ShownBy.Write({ requestId: 'r7', mutation: Option.some('Archive') })),
  terms: [{ term: 'Project.status = $status', truth: 'False', reason: Option.none() }],
})
```

`truth` is `True`, `False`, `Null` (SQL's unknown, which keeps a row out) or
`Unknown` (the store lacks what it rests on). `ReadWhy` is a Schema:
`Schema.encodeSync(ReadWhy)(why)` is JSON for a log or a devtools client.
`Data.why` reads the Model and nothing else: it plans nothing and fetches
nothing.

**Across a history.** `Data.timeline(start, history, { feed, post },
{ surfaces })` takes the Messages `update` handled, each with the Model it
left (what Foldkit's devtools records), and gives one step per change of a
read's tag: the Message that made it, `why` at the Model it changed to, and
`regression` when a read that showed a value stopped showing it with no
reason a reader can see. Foldkit's devtools has no place for a panel of
another package's, so the timeline is the data, not a panel.

### Why is it stale?

Under the default `RemotePolicy.cacheFirst`, a present field is never asked for
again. That is the point of a cache, and the reason a list shows what the
server said last time. To see change:

- **On demand**: `Data.refresh(model, projection)` from `update` marks what the
  screen reads `Refreshing` and the active Subscription fetches it again, old
  value still on screen. A refresh button, a window regaining focus.
- **By age**: `RemotePolicy.staleWhileRevalidate({ maxAge })` refetches a value
  or a list older than `maxAge`, and nothing younger.
- **Always**: `RemotePolicy.networkOnly` requests every selected field, cached
  value visible meanwhile.
- **As it happens**: `Data.live` instead of `Data.get`, or `live: true` on a
  `Data.query`, with a server that publishes changes; see [Live data](#live-data).

A list's age is the page that last answered it whole: its first page, or the
one that replaced it after it went stale. A later page from "load more" does
not date it. See [Reading, policies, and prefetch](#reading-policies-and-prefetch).

### Why did my change disappear?

A mutation's `optimistic` patches are layers over the store while the request
is in flight. When the server answers, the layers come off and the cache shows
what the server said:

- **It failed.** `MutationFailed` removes the layers; `Data.mutation(model,
  requestId)` reads `Failed` with the error. Nothing retries it on its own
  (`Data.retry` sends it again; see [When a write fails](#when-a-write-fails)).
  A write survives a reload only when it is sent `durable`
  ([`Data.outbox`](#a-write-that-outlives-the-page-dataoutbox)); an edit that
  must converge with other devices' offline edits belongs to
  [`foldkit-sync`](../sync).
- **It succeeded, but the answer did not name the row.** The answer carries
  what the active Surfaces and the request's layer show of each row it names
  ([What an answer carries](#what-an-answer-carries)); a row it changed
  without naming (a post's count, after a like) keeps the old value until a
  read writes the new one. Name the row in the answer.
- **A preview** shown with `Data.overlay` stays until `Data.lift`; a settled
  mutation never takes it along.

See [Mutations and optimistic state](#mutations-and-optimistic-state).

### Why does a row leave its list for a frame after a mutation?

The answer left out fields the row showed while the request was pending. Once
the layer comes off, the store lacks them, so the read entry fetches them:
until they arrive, a list leaves the row out (and reads `Refreshing`), and a
read of that entity alone reads `Loading`. An answer carries what the active
Surfaces read and the layer showed of every row it names, so this is a row
the answer did not name, a field the server's read left out, or a server
that answers without the read (one older than the client, or whose read
failed). `Remote.make({ verifyPredictions: true })` names each one: see
[Checking an answer against what was shown](#checking-an-answer-against-what-was-shown).

### Why does a page I went back to read `Refreshing`?

Remote keeps what the screens you most recently left reached, within a budget
of 1,000 rows and lists (`Remote.make({ budget })`). Under `cacheFirst` a list left is held
**stale**, so going back shows its rows at once and reads `Refreshing` while
the planner refetches it; the page that answers replaces what was held. Read
under `staleWhileRevalidate` by every call that reads it, a list left keeps
its age instead: going back inside `maxAge` draws it `Ready` and sends
nothing, and past it reads `Refreshing` while it refetches. Only past the budget is a
screen's data evicted, the screen left longest ago first, and then coming back
reads `Loading` and refetches; `Data.why` says the list or row is `Evicted`.
To keep something no screen reads, name it in a retain entry or a
`connections` list; see [Retention](#retention-and-garbage-collection).

### Why does a value the server has read `Failed`?

`Failed` with no `previous` and no request error means the stored value did not
**decode** against the Selection: the server's shape and the entity's Schema
disagree; the error is a `DecodeError` with the Schema's message. An
`Unavailable` error means the server answered without a field the Selection
names and will not answer with it; see
[When a field is withheld](#when-a-field-is-withheld). A failed request reads
the same way, with the request's error; see
[When a read fails](#when-a-read-fails). A
`RemoteProtocolError` means the client and server disagree on
`REMOTE_PROTOCOL_VERSION`, and nothing is silently accepted.

### Why did a live update not show?

Live events carry cursors. One behind the Model's is a duplicate and is
dropped; one ahead of the next is a **gap**, recorded in `RemoteModel.gaps`
and not applied, so the screen keeps what the server last said rather than
a history with a hole in it. The live entry then restarts the stream and
refetches what it covers; see [When a stream breaks](#when-a-stream-breaks).

## Normalized entities and selections

Remote stores an entity once by identity, regardless of how many Surfaces read
it. Consumers select different views of the same normalized fact.

Relations are references, not nested copies:

```ts
const User = Entity.make(
  'User',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
)

const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    owner: Entity.ref(User),
  }),
)

const UserSummary = User.select({ id: true, name: true })
const ProjectSummary = Project.select({
  id: true,
  name: true,
  owner: UserSummary,
})
```

The store remains normalized:

```text
Project:p1   name PRESENT   owner PRESENT -> User:u7
User:u7      name PRESENT
```

The Projection assembles the nested consumer value by following the reference.
An unknown field or a nested Selection for the wrong entity is a type error.
Recursive relations remain finite because the entity schema stores references
(`Entity.ref(User)` / `Entity.refTo('Node')`), not recursively inlined schemas.

### Entities declared with `foldkit-entity`

[`foldkit-entity`](../entity/README.md) declares a domain without Remote in it:
fields, relations as navigation edges, derived members. `Remote.make` registers
those Entities, and `Data.get`, `Data.live`, and a query's `select` take their
Selections. Remote compiles both into the descriptor and Selection above, so
the store, the planner, and the server see nothing new.

```ts
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Remote } from 'foldkit-remote'

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Work = Entity.relate({ User, Project }, { Project: { owner: Relation.one(User) } })

const ProjectCard = Entity.select(Work.Project, {
  name: true,
  owner: Entity.select(Work.User, { name: true }),
})

const Data = Remote.make({ model: App.model.remote, entities: [Work.User, Work.Project] })
const card = Data.get(ProjectCard, 'p1') // Projection<Model, RemoteData<{ name; owner: { name } }>>
```

- A relation becomes a ref field: `one` a ref, an optional `one` a nullable ref,
  `many` an array of refs. A derived member becomes a field the server supplies.
- The Entity needs an `id` field; Remote keys the store by it. When that field
  is branded, `Data.get` and `Data.live` take that type for an Entity Selection:
  another Entity's id, or plain text, does not compile.
- Register the Entities of one `Entity.relate` result and select from that same
  result; `Object.values(Work)` registers them all.
- `Entity.from(entity)` and `Selection.from(selection)` are the compile steps,
  for when you need the descriptor itself: `patch` and `ref` in a mutation
  handler.
- A variant Entity (`Entity.defineVariants`) is stored as its stored row,
  every field of every case. A Selection that selects `_tag` reads each row as
  its case, the value its union schema describes, so a view branches with the
  Selection's `schema.match`; one without `_tag` reads the stored row.
- `Entity.page(selection, window)` in an Entity Selection is Remote's
  `Selection.connection`: the window travels with the read, and the server
  answers with a page of refs. A page of a whole list is read under a name of
  its own, `comments@first=10`, so one view can show every comment while another
  shows the first ten of the same post: they are two fields to the store, fetched
  in one batch, merged and refreshed each on its own. A write to the list (a
  mutation's patch, a live change) marks its pages stale, so they are read again.
  A cursor is not part of the name: a page read from a cursor continues its page.
  The server refuses a request that pages one relation more than four ways, and
  a field's own name may not contain `@`.
- A `many` relation read whole, with no window, is bounded on the server:
  `foldkit-remote-drizzle`'s `source` reads at most `maxCollection` children of
  one row (100 unless its Source says), and fails the read, naming the
  relation, when a row has more, since a whole list cannot say it was cut
  short. The read then reads `Failed`. Read a collection that can grow without
  limit through `Entity.page`.

`Entity.make` with `Entity.ref` keeps working, and both kinds can share one
domain. Both packages export `Entity`; a module that needs `Entity.from` beside
`Entity.define` aliases one of them.

Presence is tracked separately from the JavaScript value. These are distinct:

```text
field missing
field present with undefined
field present with null
field stale
entity not found
```

Remote never infers presence from `value === undefined`.

## Reading, policies, and prefetch

`Data.get(selection, id)` returns a pure Projection. `Data.live(selection, id)`
returns the same kind of Projection but marks its requirements as live so
`Data.subscriptions` also follows server changes.

What Remote should do when the Model already contains the selected fields is a
`RemotePolicy`:

- `RemotePolicy.cacheFirst` (default) — fetch missing, stale, or re-windowed data.
- `RemotePolicy.staleWhileRevalidate({ maxAge })` — keep a present value or list
  visible and refetch it when it is older than `maxAge`; a list is asked for
  again whole.
- `RemotePolicy.networkOnly` — request every selected field and list; cached
  values stay visible while the request is in flight.

A refreshing policy emits `RefreshStarted` before the read, naming the fields
and the held lists it asks for again, so the Projection becomes `Refreshing`
without discarding the old value, and the page answering a list replaces what
it held. Planning accepts `now`
as an input, so tests can control time. It defaults to `Date.now`, read at each
use, so fake timers (`vi.useFakeTimers`) move it; Effect's `TestClock` does not,
because a plan runs outside Effect, so a test that drives `TestClock` passes
`now`. A mutation's answer is dated by another clock: Effect's `Clock`, read
when the answer lands, so a test of how written rows age drives `TestClock`.
`Data.mutate`'s `now` option is the write's time, sent to the server; it does
not date the answer.

A policy belongs to one `subscriptions` call, and covers every read in it. Reads
under different policies take a call each:

```ts
const projectPage = Surface.at(ProjectPage, model =>
  model.route._tag === 'project' ? Option.some({ projectId: model.route.projectId }) : Option.none(),
)
const owner = Data.active('Owner', () => Option.some(Data.get(UserSummary, 'u1')))

const pageEntries = Data.subscriptions({ page: projectPage })
// Retention is the domain's: one `retain` roots every read, so the second
// call's is left out rather than spread over the first's.
const { retain: _domainRetain, ...ownerEntries } = Data.subscriptions(
  { owner },
  { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 5_000 }) },
)

const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() => ({
  ...pageEntries,
  ...ownerEntries,
}))
```

Retention stays the domain's: a call's `retain` entry roots every read any call
of the domain names, so neither call collects what the other reads. Keeping one
`retain` entry is all it takes; it waits for its own call's `grace`.

**Time reaches Remote only as a Message.** The plan is a function of the Remote
model, what is asked, and `now`, and it runs again only when one of those
changes; a page that sits still past its
`maxAge` would otherwise never be looked at again. So a read entry under
`staleWhileRevalidate` knows when the earliest value it holds ages out, sleeps
until then under the Effect clock, and emits `RefreshStarted` for what is due.
That marks the fields and lists stale in the Model, and the plan that follows
fetches them, the same path a refresh button takes. Nothing reads the clock while a
Projection is read, so a Model reads the same twice, and a recorded one
replays.

For SSR, route prefetch, hover prefetch, and tests, run the same plan explicitly:

```ts
import { Effect } from 'effect'

const loaded = await Effect.runPromise(
  Data.prefetch(model, ProjectPage.projection({ projectId }), {
    policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }),
  }).pipe(Effect.provide(clientLayer)),
)
```

`Data.prefetch` performs I/O explicitly and returns the Model with the resulting
Remote Messages reduced into it. It never changes the semantics of the
Projection itself.

A render that fetches nothing (SSR, a prerender) needs everything a page's
active Surfaces read, and one read can decide what another asks for: a page's
Blocks are known once its document is. `Data.satisfy` prefetches every active
Surface, cache-first, pass after pass until a pass plans nothing:

```ts
const ready = await Effect.runPromise(
  Data.satisfy(model, actives).pipe(Effect.provide(clientLayer)),
)
```

`actives` is the record `Data.wiring` takes. A `Surface.each` family is one
entry of it: its parent's requirements join its instances', so the parent is
fetched before what it reveals. The passes are bounded (8 by
default, `{ passes }` to change it); a Surface still reading after the last
fails the Effect with `RemoteUnsatisfied`, which names it — a still-reading
family instance as `Child[key]` — rather than
rendering it loading. A read the server leaves unanswered settles as missing,
so it ends the loop; what runs out the passes is a chain whose every read
reveals one more.

### Preloading a destination from `update`

`prefetch` and `satisfy` return a Model, which suits a render that has none
yet. A running application has one, and it moves on while a read is out, so
writing the returned Model back would undo what happened meanwhile.
`Data.preload` is `satisfy` as a Command: it reads what `actives` would read
in the Model you give it (the live one with the route set to where the reader
may go) and yields one `Preloaded`, carrying the Messages that wrote it,
which `update` reduces into the Model as it is by then:

```ts
const project = Surface.at(ProjectPage, model =>
  model.route._tag === 'project' ? Option.some({ projectId: model.route.projectId }) : Option.none(),
)
// The reader is over the link to p2: read its page before they arrive.
const preload = Data.preload({ ...model, route: { _tag: 'project', projectId: 'p2' } }, { project })
// update returns { model, commands: [preload] }; under Remote.fold, foldData.preload(...)
```

It never fails: a read that fails, or a client that dies, ends it with what
was read before, and the destination reads the rest when the reader arrives.
A Surface of another application is refused when the Command is made. What it
reads is kept like any other read until what is retained next changes, so
preload close to the navigation you expect (a hover, a focus), not far ahead
of it.

### Refreshing from `update`

To revalidate what a screen already declares — a refresh button, a focus
regained — hand `Data.refresh` the active record the wiring takes:

```ts sketch
case 'ClickedRefresh':
  return { model: Data.refresh(model, actives) }
```

Each entry is resolved for this Model as the read entries resolve it, so a
`Surface.at` page reads with the params the route gives it, and an inactive
entry asks for nothing. Add a Surface to `actives` and its refresh comes with
it. One entry (`Data.refresh(model, actives.project)`), a Projection, or a
Surface without params narrows it.

`Data.refresh` performs no I/O and restates no request. It returns the Model
with every selected field the store holds reading `Refreshing`, every entity it
knew to be absent asked for again (it reads `NotFound`, and stays out of every
list, until the answer says it exists), and every loaded connection invalidated; the `Data.subscriptions` read entries then refetch it,
since stale data is planned again under every policy, so the page is requested
once. The Projection must be observed, as it is while it is on screen; for data
nothing observes, use `Data.prefetch` with `RemotePolicy.networkOnly`.

- A refreshed connection is asked for again as one page the size of the widest
  window reading it (including what "load more" grew), which replaces what it
  held, so items the server removed or reordered follow it.
- A read already in flight restarts instead of landing after the refresh.
- Refreshing what is already refreshing, or nothing, returns the same Model.

`{ failed: true }` asks again only what failed: each entity read whose fields
(or a related row's) failed, and each list whose query did. That is a "Try
again": what loaded keeps its value, and a list keeps its later pages, which a
whole refresh would replace with one page.

```ts sketch
case 'ClickedTryAgain':
  return { model: Data.refresh(model, actives, { failed: true }) }
```

One list can also be named by its query and input, with no select or window
to restate: `Data.refresh(model, Everyone.ref({}))` invalidates that list for
every window reading it. It marks no row's fields, since a ref names no
selection; the refetched page carries what each read selects. That suits a
list another page reads, after a write whose answer cannot say it changed: a
list the Model never loaded is left alone, and one nothing observes now is
fetched when it is next read. With `{ failed: true }` it is asked again only
if its query failed. A query the domain does not register is refused.

### Forgetting everything: a change of principal

Everything Remote knows, it knows for a principal: a value the server gave
this session, a tombstone for an id it answered nothing about, a field it
settled as unavailable, the rows of a list. Log in, log out, switch
organization, and none of it is trustworthy. `Data.forget` is the one
boundary:

```ts sketch
case 'SignedOut': {
  return { model: Data.forget({ ...model, session: Option.none() }) }
}
```

It performs no I/O and returns the Model with every server-derived fact gone:
values, tombstones, unavailable fields, connections, live cursors, failures,
and the reads in flight. Every active Surface's read and live entries restart,
so the screen asks again as whoever the client now is; a read or stream begun
before is interrupted rather than landing after. A mutation in flight is
treated as applied, so its answer writes nothing into the new store, and the
mutation sequence is kept, so request ids stay unique.

Who the client is belongs to the `RemoteClient` layer or the server's session,
not to Remote. `forget` only says that what was known no longer is.

## Queries and pagination

Entities answer "which fields of this known thing?" A Query answers "which
entities belong in this server-owned list?"

Declare the query and register it with the domain:

```ts
import { Query } from 'foldkit-remote'

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
})
```

`Query.make` names a query and says what it returns. Where it *means*
something the client should be able to state, declare it with a body instead:

```ts
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'

const Task = Entity.define(
  'Task',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, updatedAt: Schema.Number }),
)

const TasksByOwner = Query.define(
  'TasksByOwner',
  { ownerId: Schema.String },
  ({ input }) =>
    Query.from(Task).pipe(
      Query.where(Expr.eq(Task.fields.ownerId, input.ownerId)),
      Query.orderBy(Order.desc(Task.fields.updatedAt), Order.asc(Task.fields.id)),
    ),
)
```

A body is written over a [`foldkit-entity`](../entity) Entity, because that is
what has addressable fields: `Task.fields.ownerId` is a reference an `Expr` can
be built from, where this package's own `Entity.make` describes a field as the
schema of its value and has nothing to point at. An entity declared either way
still reads, selects and normalizes the same; only a query body needs the
richer declaration.

What comes back is an ordinary descriptor — the same name, `Input`, `ref` and
connection identity — carrying its `body` besides, and the result is a
connection over the Entity the body reads, so it is not named twice. A server
can compile that body rather than be told the same thing again in its own
dialect; one that would rather answer the query its own way still can, and a
descriptor from `Query.make` has no body at all.

**Which to declare.** A list the client should keep right after a write needs
a body: the body is what lets the client place a new or changed row in the
pages it holds instead of fetching the list again. A `Query.make` list is
invalidated by any change to its Entity, so it is fetched again after every
write that touches one. A body can follow relations
(`Expr.path`, `Expr.exists`, a path from `Expr.viewer`), so a feed of the
people you follow is a body too. Keep `Query.make` for a list whose meaning
only the server can state, such as a search ranking.

When part of a filter is something a body cannot say, put what it can say in
the body and the rest in the server's own `where`
(`foldkit-remote-drizzle`'s `query(descriptor, { entity, where })`), which is
conjoined with the body. The client judges rows by the body alone, so write
the body to admit no row the client makes or moves that the server's `where`
refuses: such a row is placed in the list and stays there until the list is
read again.

The body is built **once**, when the query is declared. Inside it `input.ownerId`
is a placeholder for the value the query will be given, not the value — there is
nothing there yet to branch on. A condition that depends on what was passed is a
comparison over the placeholder, never a `?:` around it.

`Input` must be fields or a plain `Schema.Struct`, because that is what the
placeholders are made from. A codec that exposes no keys is refused where the
query is declared rather than handing the body an empty object, which would
compare a column to nothing while every type agreed.

Then a query is still just a Projection:

```ts
const projects = Data.query(
  ProjectsByOwner,
  { ownerId },
  { select: ProjectSummary, first: 25 },
)

projects.read(model)
// RemoteData<Page<ProjectSummary>>: at most 25 items

Data.more(model, projects)
// Option<Model>: "load more", the window grown to 50; none when all are shown
```

The connection stores entity references and explicit boundaries rather than one
flat array. That matters when page 1 and page 3 are loaded but page 2 is not:
Remote represents an honest gap instead of pretending the visible rows are
adjacent.

A query Projection is `Initial` until the page and the selected fields of at
least one visible item are present. Then it shows the rows it can assemble: one
whose fields have not arrived yet (a live insert, a row paged in without its
fields) is left out, and the list reads `Refreshing` until it is, so the rows
already shown stay on screen. A deleted row is left out too, so a list whose
shown rows were all deleted shows none (`Refreshing` while others are read),
never `Loading`. It reads
`Ready` once every visible item is assembled. The `select` travels with the query: the server
returns the selected fields of the page's items with the edges, and one
`ConnectionMerged` merges the page and writes them, so a fresh list usually
lands `Ready` in one response. What the server leaves out (withheld fields,
nested targets it does not expand) becomes ordinary entity requirements and
is fetched next, as before; a server that predates payloads sends edges only
and the list reads the old two-round-trip way.

**A read shows at most its window.** Remote keeps one connection per query and
input, whatever window asks for it, so a picker's `first: 50` and a card's
`first: 3` of the same query share the rows, and each read is cut to its own
window: `first` from the start, `last` from the end. `hasNext` / `hasPrevious`
are true when the read cut rows or the connection's boundary says there are
more; they are never guessed from a row count.

Two Projections of the same connection plan one query, for the wider window,
and select the union of their fields. When a connection holds fewer rows than a
window asks for, the read entry asks only for the rows it lacks, after the
loaded end (or before the loaded start).

**"Load more" grows the window.** `Data.more(model, projection)` is the Model
with that read's window one page larger, called from `update`; the read entry
then fetches what the connection lacks. It is kept in Remote's store, under the
query, input and window first asked for, so a list holds no state of its own,
and it is forgotten when retention drops the connection. Another window of the
same query does not grow with it.

### Filtering a loaded list without asking the server

A search box over a page you already have should not be a round trip.
`Data.filtered` narrows a loaded list by a query body:

```ts
const found = Data.filtered(model, projects, ActiveProjects, {})

found.items     // decoded exactly as the list decodes them
found.complete  // whether the answer was about the whole list
```

**It filters a list; it does not run a query**, and the distinction is the
design. "Which rows match" would need to know this list holds every row the body
could match — predicate containment, which Remote deliberately does not do.
"Which rows *of this list* match" is decidable from what is already here.

`complete` is false unless three things hold: every edge could be judged (no row
missing a field the *body* reads), every match could be shown (no row missing a
field the *Selection* reads), and the list is terminal at both ends. So
empty-and-complete and empty-and-partial stay different answers — one means
"none", the other means "none that I can see yet". An input no interpreter may
answer (a search holding NUL, which the server refuses too) gives no items and
`complete: false`, rather than throwing in `update`.

A body that reads other rows (`Expr.path(Member.relations.team,
Team.fields.name)`, a path from the viewer) is judged over the whole store: a
row whose path the store can follow is judged, and one whose path reaches a row
or field the store lacks is not judged either way, so the answer is
`complete: false`.

Nothing is created: no connection, nothing new to retain, nothing new to fetch.
The server stays authoritative for which rows exist.

### Judging the rows you already hold

A connection's rows are edges the server delivered, and a query body describes
*which rows* — so until something evaluates the body on the client, nothing here
can say whether a row belongs to a query. `matching`, exported by
`foldkit-remote`, says:

```ts
const judged = matching(Data.storeOf(model), ProjectsByOwner, { ownerId: 'u1' })

judged.matched  // keys satisfying the body, in the order it asks for
judged.skipped  // keys held, but not judged either way
```

It is pure, and it runs the **same interpreter the server checks itself
against** — the reference implementation in
[`foldkit-entity`](../entity) — so a body means one thing in both places. The
conformance suite is run over a store as well as over rows and a table.

Three things about it are deliberate.

**It answers "which of the rows I hold match", never "which rows match."** Those
are different questions, and the difference is not recoverable from a list of
keys — so it is in the shape. A caller that knows it holds the whole population
(a connection terminal at both ends) is the one that can turn this into a
complete answer.

**`skipped` is the honest half.** A row missing a field the body reads cannot be
judged: it is neither a match nor a non-match. Nor can a row holding a value no
interpreter answers for (text with a NUL); each row is judged alone, so one such
row is skipped and the others are still answered. Dropping it silently would turn
"I could not tell" into "no", so it is named instead, and the caller decides
whether to fetch the field, ask the server, or say the answer is partial.

**It takes the input decoded and encodes it itself.** A store holds wire values,
so a comparison has to happen in that space — and handing an interpreter a
decoded value is a mistake *no runtime error catches*: the answer is simply
empty, which reads exactly like a correct one. Doing the encoding here means a
caller cannot get it wrong.

It is **not authorization**. On the server a compiled `where` is conjoined with
the binding's `visible` rule; there is no `visible` here. This is safe only
because the client holds only rows the server already released to it, and a
local filter is not an access decision.

**Local execution is not a second authority.** `matching` and `filtered` derive
conclusions from facts the server gave; they never promote those conclusions
into knowledge of the server's whole dataset. Knowing `p1.ownerId = u7` says
that `p1` matches `ProjectsByOwner(u7)`; it does not say that
`ProjectsByOwner(u7)` is `[p1]`, and nothing here will say so unless a
connection's boundaries, terminal at both ends, independently prove it. That
line is what keeps Remote a cache of what the server owns rather than a local
database with opinions of its own.

### An input that changes as fast as someone types

A connection's identity is its query plus its **input**, which is exactly right
for caching and exactly wrong for a search box. Bound naively, every keystroke
is a different connection, a different request, and a different thing to retain:

```ts
// Don't: `postSearch` changes per keystroke, so the query's input does too.
h.OnInput(text => Message.Searched({ text }))
```

Remote has no debounce, and should not: its job is to be a faithful function of
the Model, so if the Model says the search is `Engi` then `Engi` is what the
query asks. **The debounce belongs between the input Message and the Model field
the query reads** — which is ordinary application state, and
[`foldkit-primitives`](../primitives) already has the piece:

```ts
import { debounce } from 'foldkit-primitives/time'

const SearchInput = debounce({ name: 'PostSearch', value: Schema.String })

// `latest` is what the box shows, so typing stays immediate.
// The settled OutMessage is what moves the field the query reads.
// A step of the page's Bundle.compose(...).pipe(...):
Bundle.withChild('search', SearchInput, {
  args: { delayMs: 250 },
  onOut: out => model => ({ model: modifyFields(model, { postSearch: () => out.value }) }),
})
```

Two fields, deliberately: the one the box draws changes on every keystroke, and
the one the query reads changes a quarter second after the last one.
[`examples/entity`](../../examples/entity) does exactly this.

The same applies to any high-frequency query input — a slider, a map viewport, a
date scrubber. What makes a search box the usual case is that the query is often
written *for* it: `Expr.contains` over an empty string matches everything, so an
empty box and a filled one are one query rather than two.

### A page that overruns its window is refused

The client asks for `first: 25`, and a page carrying more than that is a
protocol disagreement rather than a windfall: the client cannot tell which of
the edges the window meant, and the connection's boundaries stop describing what
it holds. Such a page becomes a `QueryFailed` with a named protocol error, and
none of its edges reach the store — a connection already loaded is left exactly
as it was, so a refresh that overruns cannot replace good rows with a rejected
page.

A window with neither `first` nor `last` bounds nothing: `after`/`before` says
where to start, not how much to take.

### When a read fails

A failure is kept on the Model until something settles it, and the read says
so. Queries fail per connection, and entity reads per field. A read with
nothing to show reads `Failed` with the error. One that had a value (a failed
refresh, or a failed "load more") reads `Failed` with that value as
`previous`, which `RemoteData.render` draws as data with a `Stale` freshness,
so it stays on screen. A failure reaches every read that needs it: a list
fails when one of its rows' fields failed, and a project read fails when its
owner's did.

**It is not retried on its own.** A persistent error would otherwise be asked
again every time some unrelated read restarted the entry. What failed is left
out of the plan, and everything else is still fetched: the rows a failed list
holds, the other fields of an entity. What asks again:

- `Data.refresh(model, actives, { failed: true })` — the retry button. It
  works on something that never loaded, too. A read with nothing to show reads
  `Loading` while it is asked again, and `Failed` again if it fails again, so
  the button does not blink away.
- The value arriving anyway: a page for a list, or a read, live patch or
  mutation result that writes the field.
- The server invalidating a list over a live stream, or deleting the entity.
- Retention dropping it: something nothing reads any more forgets its failure,
  so coming back to it later asks the server again.

`Remote.inspect(model.remote).failures` lists what failed, by connection
identity and by `entity\0id\0field` mark.

A broken live stream is not a failed read. Its `ReadFailed` carries the
`stream`, and records a gap in `RemoteModel.gaps` rather than failing any
field: nothing was being read, and the values on screen are still what the
server last said. The stream restarts on its own; see
[When a stream breaks](#when-a-stream-breaks).

### When a field is withheld

A server may answer a read without a field it was asked for, and mean it: the
Source's `authorize` withheld it from this principal, or the record it returned
had no such field. The read result says so, in `settled`: the fields it asked
for that this answer does not carry and a later one would not either. Why is
not on the wire. The client records each as **unavailable**, one more kind of
knowledge beside a value and a tombstone:

```text
missing      not established; the planner asks
present      known
stale        known, and being asked again
unavailable  asked, and answered without: the planner does not ask again
tombstone    the whole entity is known absent
```

A Selection that names an unavailable field reads `Failed` with an
`Unavailable` error naming the field, not `Loading` (nothing is fetching it)
and not `NotFound` (the entity is there). What it is not is a seventh state:
the remedy is the one a failed read has. Select without the field, in a
Selection of its own if some principals may read it, or show the error. A
Selection that does not name it is unaffected: `name` reads `Ready` while
`privateNotes` is unavailable beside it.

The mark is forgotten by what forgets a failure: `Data.refresh` asks again,
and a read, live patch or mutation result that writes the field clears it.
It survives persistence and a server render's `Remote.resume`, so the browser
does not ask once more for what the server already declined.

An id the server answers with nothing about, neither values nor settled fields,
is a tombstone as before. A server settles a withheld field without reading
its Source for an id whose every field is withheld, so an absent id and a
hidden one answer alike, and existence is not told.

## Mutations and optimistic state

Register mutations on the domain:

```ts
import { Mutation } from 'foldkit-remote'

const RenameProject = Mutation.make('RenameProject', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
```

A mutation starts from ordinary application `update`:

```ts sketch
case 'ClickedRename': {
  const { id, name } = message

  const { model: started, command } = Data.mutate(
    model,
    RenameProject,
    { id, name },
    {
      optimistic: [Remote.patch(Project, id, { name })],
    },
  )

  return { model: started, commands: [command] }
}
```

`Data.mutate` does two things:

1. it applies `MutationStarted` to the Model, including any optimistic overlays;
2. it returns the Command that calls `RemoteClient` and eventually emits
   `MutationSucceeded` or `MutationFailed`.

`Remote.patch(entity, id, values)` builds one entity's patch, and
`Remote.ref(entity, id)` names one row. Both take the entity you declared,
whether with `foldkit-entity` or Remote's `Entity.make`, and check `values`
against its fields in their wire shape, except a relation, which is a ref:
`owner: Remote.ref(User, 'u1')`, an array of refs for a `many`, or `null`
where it is optional. The patch holds the ref key the store keeps. A ref key
typed by hand (`'User:u1'`) or a ref to another entity is refused, by the type
and when the patch is made.

Those settlement Messages go through `Data.reduce` like every other Remote fact.
The request id comes from the Remote Model's sequence, so `update` stays pure.
Settling is idempotent per `requestId`.

**Answers settle in the order their requests started, not the order they
arrive.** The server applied the requests in that order, so an answer does not
overwrite a field, or clear a row's deletion, that a request started after it
has already settled; and an answer's `deleted` does not delete a row a later
request has written. Two renames answered out of order keep the second name,
and an edit answered after the row's delete leaves it deleted. Reads and live
patches are the server's word at the time they arrive and land as they come.
The ledger keeps each pending request's place in `mutations.order`, and the
place of the last answer to write each field in `mutations.settled`, only
while an earlier request is still pending.

A mutation that deletes says so. The server's outcome carries
`deleted: [{ entity, id }]`, and settling it tombstones those entities: they read
`NotFound`, and they leave every connection and relation they were in, so the
server names no list. Patches apply first, so an entity named both ways is
deleted; a retry of the same request deletes nothing again.

A delete can show before the answer, with no list named either.
`Remote.tombstone(entity, id)` in `optimistic` is a pending tombstone: while
the request is in flight the row reads `NotFound` and leaves every list and
every relation that lists it, as a settled delete does. It is a layer like a
patch, so the server's store is untouched (`Data.confirmed` still reads the
row), a failure brings the row back everywhere, and the answer's `deleted`
keeps it gone. A pending delete wins over every pending patch of its row.

```ts
Data.mutate(model, DeletePost, { id }, { optimistic: [Remote.tombstone(Post, id)] })
```

A pending patch shows a field before the server has sent it, but does not stand
in for it: a read still fetches a field of a row the server holds that only a
layer shows, so a failure that takes the layer away leaves the server's value,
not `Initial`. A row only a request holds (one the store has never read, or
read as absent: a pending create) is not fetched while the request is pending,
since the server has nothing of it yet; once the answer lands, the fields it
did not carry (a guard's `may`) are.

Optimistic entity patches are **layers over the base store**, not inverse
patches. If multiple mutations overlap, the visible cache is recomputed as base
plus the still-pending layers, so settling one does not require trying to undo
its old value manually.

Connections can be optimistic too:

```ts
import { ConnectionChange } from 'foldkit-remote'

const { model: started, command } = Data.mutate(model, AddComment, input, {
  optimistic: ({ tempId }) => [
    Remote.patch(Comment, tempId, { id: tempId, body: input.body }),
    ConnectionChange.prepend(
      CommentsForPost.ref({ postId }),
      Remote.ref(Comment, tempId),
    ),
  ],
})
```

A successful server result can replace the request's temporary connection
overlays with confirmed ones in place.

### Which lists a write moves

Which lists a mutation changed is worked out from its answer. Each patch
says which row it wrote; the fields whose value differs from what the client
held are what changed (an answer returning a whole row changes only what is
new). Every loaded list over that Entity is judged by its query's body against
the store the answer left:

- a list whose body reads none of the changed fields stands;
- a row it holds that still matches, or a row it does not hold that still does
  not, leaves it standing;
- a held row that stops matching leaves it, with nothing fetched: whether a
  row belongs is the body's, judged exactly;
- a row that starts matching, a row new to the client, a held row whose
  ordering field changed, or a row whose order moves it in from past what a
  list has loaded, is placed where the body's order puts it among the rows
  loaded (`placeIn`), when
  the order is placeable (`Query.placement`); a row that sorts past what is
  loaded is left out of it (and out of what showed it), for the next page. A
  row that was itself where a page met rows not loaded (the last before a
  cursor, the first after one) cannot be told to have moved past it, its old
  values being gone, so it invalidates the list instead;
- anything else invalidates it, and its read entry fetches it again: a row the
  client cannot judge (it lacks a field the body reads), an order it cannot
  place (text with no declared collation, the server's own), or a row an
  optimistic overlay shows; a read of it already in flight is restarted, since
  it could answer with the rows before the write;
- a list over a `Query.make` query, which declares no body, is invalidated by
  any change to its Entity;
- a list whose body reads other rows (a path, an exists, a path from the
  viewer) is invalidated by a change to any member those read, or a deletion
  of such a row: a team renamed moves every member listed by its name. A
  change to the link a path starts from re-judges that row alone;
- a row a list does not hold that changes a member the server's own read rule
  filters on (an owner, a team: declared on the Entity as `ReadFilter`, which
  `foldkit-guard` attaches) invalidates it: whether the row now belongs is the
  server's to say, since the client runs no such rule. A row it holds is
  judged by the body as usual. A new row counts, so under such a rule a create
  refetches the lists over its Entity;
- a list whose body declares no order leaves its order to the server, by
  fields the client cannot see, so any change to a row it holds invalidates
  it. Declare the order in the body (`Query.orderBy`) to keep a list that a
  change provably did not move.

**The client runs a body's primitive operators by its own table.**
`Remote.make({ ..., operators })` (`Operators.kernel` by default) is the table
it matches, filters and places rows with. A body calling an operator the table
does not run is judged by the server, as any row the client cannot judge is:
`Data.filtered` answers it incomplete and a change to it refetches.

**A placement can be checked against the server.** `Remote.make({ ...,
verifyPredictions: true })` places as usual, and also fetches each list it placed
what the server said in (an answer, as above, or a read or a live patch, as
below); when the server's first page arrives it is compared with the order
placed, and a disagreement is a `PredictionMismatch` [diagnostic](#diagnostics)
whose `part` is a `Placement`:
an order the page does not share, or a row placing took out that the page
still lists. A pending edit is not checked: the server does not have it
yet. Turn it on in development and tests: a collation the client
and the server disagree on then fails an assertion instead of misplacing a row
for a reader.

So a rename updates every view of the row and fetches nothing, a status change
moves a row out of the lists filtered by status and into the others in their
order, and a price change moves the row within a list sorted by price, all
without a request.

**A pending edit, and the server's word on a row, are placed the same way.**
While a request's `optimistic` patch or a `Data.overlay` is pending, a list
that holds the row shows it where the edit puts it, or leaves it out once it
stops matching; the server's pages are untouched, and lifting the edit puts
the row back. A read or a live `EntityPatched` that brings a new value for a
row a list holds moves it in the list's pages, as an answer does. Neither
brings a row into a list, since what the list selects of it may not be
loaded, and neither fetches: a list it cannot place stands as it is.

**An inserted row is drawn in order.** A `ConnectionChange.prepend` or
`append` (a pending create's, a confirmed one's) and a live
`ConnectionInsert` say a row is in a list; they do not say where. In a list
the client can place, a read draws the row where the body's order puts it,
or leaves it out when it sorts past what is loaded; one it cannot place (a
field the order reads is missing, the order is the server's) stays at the end
its change names. `Data.visibleItems(remote, connection)` gives a list's edges
as its reads draw them, for a persistence `snapshot` that stores a list as
shown.
`Data.refresh` stays for what an answer cannot say, such as a server-side
effect on rows it did not return.

### What became of a write

`Data.mutation(model, requestId)` reads what became of it from the Model:
`Pending`, `Applied`, `Failed` with the error the server or transport gave, or
`Unknown` for an id never started here (or settled so long ago it left the
bounded ledger). A retry reuses its id, and the latest outcome wins.

A request id names a request to this client only: it is a counter in the
Model, so it restarts on reload and two clients' first requests share it. To a
server, a mutation is named by its **operation**, an id minted where it is first
sent (`crypto.randomUUID()`), unique across clients. A failed request keeps its
operation, and a retry with the same `requestId` (`Data.mutate(model, M, input,
{ requestId })`) sends it again, so a server that keeps a record of its writes
can recognise the retry. After a reload the record of it is gone, and the same
request id is a new operation.

### When a write fails

A write that fails releases its optimistic layer, so its change disappears.
Remote keeps the failure in the ledger, with the mutation and the input it was
started with, until the application answers it. The application reads it from
the Model; it keeps no list of its own:

```ts sketch
// The view: a notice for each post that did not send, with its text to give back.
Data.failedWrites(model, CreatePost) // ReadonlyArray<{ requestId, mutation, input, error, refusal }>

// update
case 'ClickedRetry':
  return Option.match(Data.retry(model, message.requestId), {
    onNone: () => ({ model }),
    onSome: started => ({ model: started.model, commands: [started.command] }),
  })
case 'ClickedDiscard':
  return { model: Data.dismiss(model, message.requestId) }
```

- `Data.failedWrites(model)` lists every failed write, oldest first, and
  `Data.failedWrites(model, CreatePost)` only that mutation's, with its `input`
  and `refusal` typed by it. A write in flight or applied is not listed.
- `Data.retry(model, requestId)` sends a failed write again as itself: the same
  input, request id and operation, with its optimistic change shown again. It
  is `None` for a write that is not failed, so a second press does nothing.
- `Data.dismiss(model, requestId)` forgets it.

Only a write in flight can fail: a `MutationFailed` repeated, or arriving after
the write applied, was dismissed or was settled by `forget`, returns the Model
it was given, as a repeated `MutationSucceeded` does.

A failed write stays listed until one of those, or `Data.forget` at a change of
principal. Nothing drops one on a timer: that would hide a failure the reader
has not seen. The ledger is bounded (the last 1024 failures), and is never
persisted, so a reload forgets it.

To act on a failure in `update` (log it, move focus, put text back), have the
wiring share it. Remote reduces it first, then the application's own update
receives it with a Model that already lists it:

```ts
Page.assemble(Data.wiring(actives, { shared: ['MutationFailed'] }))
// own update: MutationFailed is now one of its Messages, so its match must answer it
```

A wiring that does not share it records each failed write as a `WriteUnheard`
[diagnostic](#diagnostics), which by default logs it: the change went, and
nothing in the application's update was told.

**Refused for who asks.** A server may also refuse who is asking, whatever the mutation
(`RemoteServer.forbid`). Then `Data.mutation(model, requestId)` is `Failed`
with an error of `_tag: 'Forbidden'`, and `reason` when the server gave one,
for the person who asked. Asking again as the same person is refused again,
so show it rather than retry.

**Refusals as data.** A mutation can say what the server may refuse it with,
as data rather than a message to parse:

```ts
const SetPrice = Mutation.make('SetPrice', {
  Input: { id: Schema.String, price: Schema.Number },
  Output: {},
  Refusal: Schema.Union([Refusal.field('price', Schema.String), Refusal.conflict]),
})

Data.refusal(model, requestId, SetPrice) // Option<{ _tag: 'Field', key: 'price', reason: string } | { _tag: 'Conflict' }>
```

`Refusal.field(key, reason)` names an input key and the Schema of why;
`Refusal.conflict` says the row moved on, and `Refusal.unmet` that it does not
hold what a [declared write](#declared-writes-what-the-client-predicts)'s
`when` asks of it. A `Mutation.write` is refused as unmet only when its write
has a `when`, and its `Refusal` type says so: without one it stays `Conflict`,
so a match over it needs no `Unmet` arm. `Refusal.taken` says an insert's id
is already a row's: its `entity` and `id`, the caller's own, and nothing of the
row, which may be hidden from them. A `Mutation.write` over `Write.insert` is
refused as taken and never as a conflict, since an insert expects no revision.
`Refusal.invalid` says the row it
would leave breaks an invariant of its Entity (`Entity.invariant`): its
`entity` and `rule` (an id is unique only within its Entity, so the two name
it) and its `path`, which a form shows the `message` beside, or none and empty
when the invariant reads something the caller may not see. Every `Mutation.write` may be
refused so, since the server's Entity may hold invariants the client's does not
show. `Refusal.isInvalidBy(refusal, invariant)` asks whether it names one
invariant, by its Entity and its id, given as `Entity.invariant` returned it
(export it beside the Entity), so its id is never spelled again; an unnamed
refusal matches none, and so does another Entity's invariant of the same id. The
server sends the refusal encoded by this schema and `Data.refusal` decodes it
by the same one; it is none while the mutation is pending or applied, or when
it failed for another reason.

### Declared writes: what the client predicts

A mutation can be a declared write: `Mutation.write(name, write)` over a
`foldkit-entity` `Write.update`, `Write.insert` or `Write.delete`. Its input is
the write's, it answers nothing of its own, and `Data.mutate` shows an update's
or an insert's row until the server answers, so it needs no `optimistic` list;
a delete shows its row deleted, as `Remote.tombstone` does. An update's
`increment` is shown as a prediction: its amount is added to the value the store
holds whenever the row is read, so a change that reaches the store meanwhile is
added to rather than hidden, and two pending increments add up. A computed
field is predicted the same way, by `Remote.make`'s `operators` over the row as
it is read (`Write.apply`), so a live change to what it reads changes the
prediction. So is a count another registered Entity derives over the written
row's relation (`likeCount: Derived.count(Like.relations.post)`): inserting a
Like adds one to the post it points at, deleting a Like the client holds takes
one away from the post it pointed at, and pointing it elsewhere does both, each
added as an increment is. Where the client does not hold where the row pointed,
or holds no count on that post, nothing is predicted.

A write shows what its Entity sets from the context (`Entity.sets`) as well,
which no input sets: `Expr.viewer` as the viewer `Remote.make` is told of, and
`Expr.now` as `Data.mutate`'s `now`, the time the reader acted. An insert sets
every such member, an update those set `on: 'write'` (an `editedAt`). A new
row's counts read 0 and its exists none.

`update` reads no clock, so the time is read where the action is, by a
Command, and carried in the Message that starts the write. `Remote.now(toMessage)`
is that Command; it reads Effect's `Clock`, so a test pins it:

```ts sketch
// the action asks for the time…
Posted: ({ post }) => ({ model, commands: [Remote.now(now => Message.Clocked({ post, now }))] }),
// …and the Message it yields starts the write with it
Clocked: ({ post, now }) => {
  const sent = Data.mutate(model, PostChirp, post, { now })
  return { model: sent.model, commands: [sent.command] }
},
```

The request sends the same number, and the server takes it as the row's time
when it lies within its `clockSkew` of the server's own clock (60 seconds
unless `RemoteServer.make` says), so the answer agrees with what was shown.
A retry (`Data.retry`) sends it again. Without `now`, a time the write sets is
not predicted: the row reads as missing it until the server's answer brings the
server's time. A supplied member declared with a `predict` (`Derived.make(schema,
{ predict })`, as Guard's `may` is) is foreseen over the row the write leaves,
the store's row with the write's values over it and a field the write moves
unknown; where it foresees none, the row reads as missing it until the answer.
An application that already mints the row's id in a Command can read the
clock in the same one (`examples/reference`'s `NameNote`). The row then joins
every loaded list whose body admits it, where the list's order puts it, while pending and once answered: a post
set at its time goes to the top of a newest-first list. A list without a
body, or one filtered by a read rule the client does not run, is the server's
to place.

A viewer-relative member is predicted for the viewer `Remote.make` is told of.
With a `Like` pointing at a `Post` and a `User` (`examples/chirp` declares the
whole domain, its writes and its server):

```ts sketch
const Post = Social.Post.pipe(
  Entity.derived({
    liked: Derived.exists(Social.Like.relations.post, { viewer: Social.Like.relations.user }),
  }),
)
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Post, Like],
  mutations: [LikePost, Unlike],
  viewer: model => Option.some(Remote.ref(User, model.me)),
})
```

`liked` is the id of the viewer's Like of the post, or none. Inserting a Like
pointing at a post and at the viewer shows it on that post (where the post is
held with `liked` read, and none yet); deleting a Like, or pointing it at
another post or person, takes it from the post it is shown on. That post also
says where the deleted Like pointed, so its count goes down with no Like row
held: unliking is `Data.mutate(model, Unlike, { id })` with the id `liked`
holds. The store holds one viewer's values, as it holds one principal's, so a
change of viewer is a change of principal: `Data.forget`.

A field the client has not read, or a computation by an operator its table
lacks, is not guessed; it shows the server's value when the answer comes. The
prediction is never authority: the server decides, and its answer replaces
it. The [declared writes guide](../../docs/declared-writes.md) follows
one write from here to the statement that lands it. `keys` names the input keys
an author changed: only those are shown, and the request carries them for the
server to write; the input is still sent and validated whole.

```ts
const EditProject = Mutation.write(
  'EditProject',
  Write.update(Entity.input(Project, EditProjectInput), { id: 'id' }),
)
Data.mutate(model, EditProject, { id: 'p1', name: 'Apollo II', status: 'active' }, { keys: ['name'] })
```

### Refused where it is made

Before it shows or sends a declared write, `Data.mutate` refuses the ones the
client can already tell the server would refuse, in the order the server
checks: who asks, then the row.

**A write the held `may` says no to.** A supplied member may say which write
its value forbids (`Derived.make(schema, { forbids })`); Guard's `may` does:
the row's `Update` or `Delete`, a written member's own rule, or a relation's
`Link` or `Unlink`, where it reads `false` for the row as the store holds it.
`Data.mutate` asks each such member it holds before it judges the invariants,
as the server refuses who asks first, and answers `MutationFailed` with `_tag:
'Forbidden'` and the `explain`'s words as `reason`, showing and sending
nothing. A `may` not held, or one that does not name the part, refuses nothing;
a held `may` is the server's answer as of its read, so `Data.refresh` asks
again.

`may` is a UI hint, and the server enforces every write. A `may` that says
yes, stale after a change of role, foreseen for a row the client wrote, or
edited in the page's Model, decides nothing: the request carries no `may`,
the server checks the write by its rules as the request's principal, and a
refusal comes back as `Forbidden`, which takes the shown change back. The
client's refusal only saves the round trip for a no it already holds. See
[`foldkit-guard`](../guard/README.md#what-may-tells-a-reader-and-what-it-does-not)
for what `may` tells a reader.

**A write the client can tell is invalid.** `Data.mutate` judges a declared
write's Entity invariants over the row it would leave, as the client holds it:
the store's row with the write's values over it, a field it moves (an
increment, a computed value) not held. Where one is definitely broken, it shows
nothing and sends nothing; its Command answers `MutationFailed` at once with
the very `Refusal.invalid` the server would send, so `Data.refusal`,
`Data.failedWrites` and your `update` handle it as a server's. An invariant
over a field the client lacks is undecided and refuses nothing: the server
judges it. Passing `optimistic` yourself skips the check.

### What an answer carries

When the answer comes, the request's layer comes off, so the answer must hold
everything the layer showed. The client says what that is: `Data.mutate` sends,
with the request, what every active Surface reads of each entity (each
`Data.get`'s fields and each `Data.query`'s `select`, relation targets
included), and every field the layer itself shows. The second matters when
a write moves a count no Surface reads now: a note deleted on its own page
lowers its author's `noteCount`, which only the notebook page reads, and
without it the answer would leave the count as it was before the write. The
server reads, of each row its answer names, the fields it
shows that the answer left out, after the write and as any read is, and sends
that read with the answer (`foldkit-remote-server`'s
[What an answer carries](../remote-server/README.md#what-an-answer-carries)).
The client writes it in the reduction that releases the layer:

```text
answer (rows the write names) + read (what the Surfaces and the layer show of them) -> store, layer released
```

So a created post lands with the count, the `may` and the author's name the
feed reads, though the write stored none of them, and the feed never reads
`Loading` for it. There is nothing to configure: the Surfaces already say what
is shown. A row the answer does not name is not read; the server names the
rows a write changed. Each `Data.subscriptions` call registers what it reads, so
a `Data.mutate` with none registered sends nothing to show.

### Checking an answer against what was shown

When the answer comes, the request's layer comes off, and what the row shows
is what the store holds. Two things can then differ from what was shown.
`Remote.make({ ..., verifyPredictions: true })` settles every mutation as usual
and records each as a `PredictionMismatch` [diagnostic](#diagnostics), its
`part` naming which:

- **`Value`:** a field the layer showed that the answer carries another value
  of. The client's prediction and the server's write disagree: a count moved
  by two, a time from another clock, a hand-written `optimistic` patch that
  guessed. A field another pending request also shows is not judged, since
  that request's value shows before and after.
- **`Gap`:** a field the layer showed that the answer left out, and the store
  does not hold. It is then missing: an active Surface that reads it fetches it
  again, and the row reads `Loading` meanwhile.

```ts sketch
// requestId: the one Data.mutate returned; mutation: its name
{ _tag: 'PredictionMismatch', part: { _tag: 'Value', requestId, mutation, entity: 'Post', id: 'p9', field: 'likeCount', shown: 3, answered: 4 }, … }
{ _tag: 'PredictionMismatch', part: { _tag: 'Gap', requestId, mutation, entity: 'Post', id: 'p9', fields: ['editedAt', 'author'] }, … }
```

Match on the part with `PredictionPart.$match`. `Law.check`
([below](#testing-that-a-prediction-is-the-truth-law)) is the same law, in a
test, over every part rather than the ones an answer carries.

A row's shown fields are those the request's optimistic patch wrote, added
to or computed (a declared write's own included), plus those the active
Surfaces (every `Data.subscriptions` call) read of a row the request patched
or put in a list. A field the store still holds (an older value, or another
pending request's) is not reported, nor is a row the answer deleted, or a
temporary id it replaced. A repeated answer is not checked again. With [the answer's read](#what-an-answer-carries),
a gap is a row the answer did not name: name it in the answer's `entities`
(`Remote.patch(Post, id, {})` asks the server for all it shows of it).

**On in development and tests, off in a build.** It changes nothing but
`diagnostics` and fetches each placed list once more, and no package reads a
build mode, so the application says it where it declares the domain:

<!-- docs-check
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Mutation, Query, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String, createdAt: Schema.Number }))
const Feed = Query.define('Feed', {}, () => Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.createdAt))))
const PostChirp = Mutation.make('PostChirp', { Input: { body: Schema.String }, Output: {} })
const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model }),
  Message: defineMessageUnion({ ...Remote.messages }),
})
void Expr
-->

```ts
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post],
  queries: [Feed],
  mutations: [PostChirp],
  verifyPredictions: {
    // Vite's dev server and Vitest set DEV; a production build does not, and tsx has no import.meta.env.
    on: import.meta.env?.DEV === true,
    // What the server is meant to answer otherwise, each with why: recorded as nothing.
    expected: {
      mutations: { PostChirp: { Value: 'the server stamps createdAt with its own clock' } },
      queries: { Feed: { Placement: 'the server ranks the feed' } },
    },
  },
})
```

`verifyPredictions: import.meta.env?.DEV === true` is the plain form. A
`PredictionMismatch` is reported at error level, so the default reporter
writes it to `console.error`, which a browser test and
`Behaviors.consoleErrors` see. `expected` names the domain's own mutations
(`Value`, `Gap`) and queries (`Placement`): another name is a type error, a
blank reason is refused where the domain is made, and the silencing is in the
declaration, where a review reads it. A test does not assert on
`diagnostics` by hand: [`Trace.run`](#testing-what-a-reader-sees-trace) fails
on any mismatch.

### Showing a change nobody has made

A mutation's `optimistic` operations show over the store while it is in flight.
`Data.overlay` shows operations the same way with no request behind them, until
`Data.lift`: a preview, in every Selection and view, of something not yet sent.

```ts
const previewed = Data.overlay(model, 'post-preview', [Remote.patch(Project, id, { name: draft })])
const back = Data.lift(previewed, 'post-preview')
```

- Both are called from `update`, and neither performs I/O or touches what the
  server said: the store beneath is as it was.
- Showing an id again replaces what it showed. Lifting what was never shown
  returns the same Model.
- An overlay's id is apart from every request's, so a mutation that settles does
  not take a preview with it.
- A preview of an entity the server has not seen, such as an unsaved post, has
  only the fields the overlay holds. A Selection that reads more reads
  `Failed`, with an `Overlaid` error naming what is missing, since nothing will
  fetch it. Overlay every field the Selection reads, or preview through a
  smaller Selection.
- `Data.overlays(model)` lists the ids shown now, in the order they are drawn.
  A caller that overlays from state of its own reconciles against it:
  `foldkit-sync/remote` shows a replica's pending cell edits this way, so the
  durable edit stays Sync's and Remote only draws it.

### Reading past what is only pending

Every projection reads the **visible** cache: the server-derived store under
the layers still pending, which is why an optimistic change shows at once. A
reader that must not believe a change until the server has agreed to it asks
for the confirmed read instead:

```ts
Data.confirmed(Data.get(ProjectSummary, projectId))
```

It is the same projection — the same requirements, planned the same way, so
observing it fetches exactly what observing the original fetches — reading the
server-derived store alone, with the pending layers and connection overlays
left off. An optimistically inserted edge is not in its page; an
optimistically patched field reads as the server last said.

A view almost always wants the projection itself. This is for the reader that
reports on the world rather than drawing it, which in practice is an Agent
capability that must not claim success before the server reflects it:

```ts
Agent.when({
  projection: Data.confirmed(Data.get(ProjectSummary, projectId)),
  // The projection reads a RemoteData: only a value the server holds can match.
  predicate: (project, request: { readonly name: string }) =>
    RemoteData.render(project, {
      loading: () => false,
      notFound: () => false,
      failed: () => false,
      data: value => value.name === request.name,
    }),
})
```

There is deliberately no `Data.visible`: a projection already is the visible
read, and a second name for it would be a wrapper that only forwards.

Sync draws the same line over its replica, with the same words and a different
mechanism: see [what a reader sees while a change is in
flight](../../docs/state-model.md#what-a-reader-sees-while-a-change-is-in-flight).

### A write that outlives the page: `Data.outbox`

A like pressed on a train, a post written in a tunnel: the write must reach the
server, but nothing needs to converge, since the server decides it once. Make
it durable, and assemble the outbox beside `Data.wiring`:

```ts
const outbox = Data.outbox({
  key: model => `outbox:${model.userId}`,
  scope: model => model.userId,
})
const placements = Page.assemble(Data.wiring(actives), outbox)

// update: queued, not sent; its layer shows at once
const sent = Data.mutate(model, PostChirp, post, { now, durable: true })
return { model: sent.model, commands: [sent.command] }

// the view
const { waiting } = Data.outboxStatus(model) // "3 changes waiting"
```

`waiting` counts a write on its way too, so a line drawn whenever it is above
zero shows for a frame or two on every write, pushing the page below it down
and back. Draw it once a send went unanswered: an item whose `state` is
`Waiting` with `attempt` above zero.

`outbox.restore(model)` is `persistence.restore`'s twin: resolve it as the
runtime's `flags` and start `init` from it. It reads back what a reload left and
mints the page's session, which names its writes; `Data.mutate` with `durable`
before it has run throws.

```text
Data.mutate(…, { durable }) → queued in the Model, layer shown   (its Command answers MutationQueued)
outbox.save  → the queue written to the store, merged with other tabs' → OutboxRead (stored)
outbox.send  → the oldest stored write sent, one at a time, by one tab  → MutationSucceeded | MutationFailed
reload       → outbox.restore: the queue back, layers shown → sent again, same operation id, same now
```

- **Stored before sent.** A write is sent only once the store holds it, so a
  reload while it is on its way finds it and sends it again. Its request id is
  its operation id, so the writer's ledger answers the second send from its
  record: a durable Mutation needs a ledgered writer (`RemoteServer.write`, or
  remote-drizzle's `writer`), or a handler that answers by operation id.
- **In order, one at a time.** A post and the like of it, made offline, reach
  the server in that order. A refused write, or one this version cannot read,
  does not hold back the rest.
- **Sent again only when nothing answered.** A send that fails with
  `Unreachable` (the request did not go, or what came back was no Remote answer) keeps the
  write waiting and sends it again after 1 second doubling to 30 (`retry: {
  base, max }`), and as soon as the browser is `online`; each attempt is
  `OutboxDelayed`. A refusal, `Forbidden` or a server error settles it as
  `Failed`, as for any write: `Data.failedWrites`, `Data.retry` (queued again)
  and `Data.dismiss` (gone from the store too) work on it unchanged. A write
  still waiting cannot be dismissed: it may be on its way.
- **One tab sends; every tab shows.** The store is shared by every tab on the
  key. A Web Lock picks the one that sends, which reads the store again first
  so a write another tab settled is not sent twice; a `BroadcastChannel` tells
  the others, which show each other's waiting writes and settle them with the
  sender's answer. Without Web Locks each tab sends what it holds.
- **`now` is the reader's, still.** A stored write is sent with the time it was
  made at. Past the server's `clockSkew`, the server writes its own time and
  reports `ClockSkewed`, and the answer moves the row there: the bound that
  stops a client backdating rows cannot tell an honest wait from a forged one.
- **After a deploy.** A stored write naming a Mutation this version lacks, or
  whose input no longer decodes, is kept as `Unreadable` in `outboxStatus`,
  never sent, reported once as `OutboxUnreadable`, and removed by
  `Data.dismiss`. A store that cannot be written reports `OutboxUnsaved`, and
  the writes are sent anyway.
- **A change of principal** is `Data.forget` and another `key`, as for
  persistence: one person's waiting writes are never sent as another's. The
  page holds the queue it read for one `key` and `scope`; when either moves,
  it sends none of it and reads the new one's. A store holding another
  scope's waiting writes is not written over, so a `key` shared by
  principals reports `OutboxUnsaved` rather than losing them.

### Remote mutation vs Sync operation

A durable Remote write is still Remote's: the server decides it once, a
refusal is final, and the client never reads its own effects before the server
has answered. If edits must merge with other devices' edits made offline, or
the application must build on its own unsent edits as if they were committed,
that is [`foldkit-sync`](../sync)'s journal (see [which state belongs
here](#which-state-belongs-here)). An optimistic overlay stays a temporary view
of server-owned data: the outbox stores the operation, never the overlay as a
queue of edits.

## Live data

`Data.live` marks a Projection so active `Data.subscriptions` follow server
changes for it. A list is marked by its read: `live: true` on `Data.query`
follows the rows that join, change or leave it, with no row of its own to
subscribe to:

```ts
Data.query(Notes, {}, { select: NoteRow, first: 50, live: true })
```

A Surface's live entry (`<key>.live`) subscribes the rows and the lists its
reads mark live in one stream, sending each list as its read sends it (query,
input, window, `select`). A list read live needs `first`, since a server reads
it again for every change it checks; `Data.query` throws without one. The
server admits a stream before it asks any live source: its lists' `first`
count toward `maxIdsPerEntity` with the rows it follows, and it may carry at
most `MAX_LIVE_QUERIES` (32) lists; past either it is refused
(`RemoteLiveRefused`, below). A live
source that watches lists (`foldkit-remote-drizzle`'s `pollLive`) diffs it;
`RemoteServer.liveHub` watches none, so on a server with only a hub a live
list changes only when read again.

The Remote Model owns each stream's cursor. Live events carry monotonically
ordered cursors, counting on from the cursor the stream was opened after (`0`
for a new stream, so its first event is `1`):

- an old/repeated cursor is a duplicate and is ignored;
- the next cursor is applied;
- a cursor ahead of the expected value is a **gap** and is not applied.

Entity patches update normalized fields, deletes create tombstones, and
connection insert/remove/invalidate events reconcile the same connection model
used by query pages and optimistic overlays. A stream failure becomes a Remote
failure Message rather than mutating anything out of band.

### When a stream breaks

A stream breaks when its transport fails or when an event arrives ahead of
its cursor (a gap). Either way, what the server said meanwhile is lost: no
server replays it, since `after` only numbers the events that follow. So
recovery is a refetch, and the live entry does it on its own:

```text
break -> gap marked, restarts + 1 -> backoff
      -> RefreshStarted (what the stream covers) + GapCleared -> resubscribe from the cursor
                    \-> read entry refetches
```

- **The backoff is Sync's transport policy:** 50 ms after the first break,
  doubling for each break in a row, at most 5 s, with ±20% jitter.
  `retryBase` and `maxRetryDelay` in the `Data.subscriptions` options change
  it. An event applied after a resubscribe starts it over.
- **A gap stays until the restart.** An in-order event that a broken stream
  still delivers is applied, but does not clear it. The event that arrived
  ahead was dropped, and only the refetch brings back what it said.
- **What a stream covers is its requirements.** A list read live is the
  live source's to re-send when the stream opens: `pollLive` sends a
  `ConnectionInvalidate` for each list on every open for this reason.

`Data.liveStatus(model, active)` says how what one active entry reads live is
doing, for a view that shows it:

```ts
Match.value(Data.liveStatus(model, Watched)).pipe(
  Match.tagsExhaustive({
    Idle: () => 'not live',
    Live: () => 'live',
    Reconnecting: ({ attempt }) => `reconnecting (attempt ${attempt})`,
    Refused: ({ error }) => `not live: ${error.message}`,
  }),
)
```

`Reconnecting` lasts from the break until the stream has resubscribed, and
carries the error, which is none for a gap. `Refused` is a stream the server
would not open for what it asks (`RemoteLiveRefused`: more rows of one Entity
than its `maxIdsPerEntity`, or more than 32 lists). Asking again would be refused again, so it is
not restarted until the entry's live requirements change, which opens a new
stream; a `LiveRefused` diagnostic records it once. `RemoteModel.streams` holds each
stream's restarts, its breaks in a row and its last error. `forget` clears it
with every other server-derived fact.

The live ledger (`live`, `streams`, `gaps`) keeps the 256 streams most
recently heard from. Retention cannot prune it by what is shown: its roots
merge every Surface's requirements, and a stream is one Surface's. A stream
dropped while still open has no cursor, so its next event, past `1`, is a
gap: it restarts from the start and refetches what it covers.

## Retention and garbage collection

Remote is a cache, so it should be allowed to forget facts no active feature
needs.

`Data.subscriptions` derives retention roots from the active Surfaces of every
call on the domain, so a call's `retain` entry never collects what another call
reads; `connections` given to any call are kept the same way. A root keeps:

- the entities and fields its Projection requires;
- referenced targets reached by nested selections;
- retained connections and the selected fields of their visible items;
- data touched by pending optimistic work.

After the configured grace period, `RetentionChanged` enters the Model and the
pure Remote reducer collects what no root reaches. The roots it keeps are the
active ones and those of the Surfaces left, so going back to a page shows what
it held rather than reading `Loading`, within `Remote.make`'s `budget`.

The budget counts **entries**: each row and each list the store holds is one.
The rows and lists the active Surfaces read, and what a pending write changes
(with the rows of a list it places a row in), are always kept, even past it.
The roots a Surface left, which leave together, are kept newest first while
the entries they add fit; the first that does not fit is evicted with every
older one. A read whose row another root holds already costs one, so the
roots kept stay bounded too. The default is `defaultBudget`, 1,000. A list or
row the budget evicted reads `Initial` again, and `Data.why` names it
`Evicted` rather than `Missing`. A hand-wired `Remote.retain` takes `budget`
in its options.

```text
Surface left      -> its lists held stale (or with their age, under staleWhileRevalidate), its reads held
Surface again     -> rows read Refreshing; the planner refetches the stale list
page arrives      -> it replaces the held rows; Ready
past the budget   -> evicted, left longest ago first; going back reads Loading and refetches
```

A value nothing reached when retention ran, such as a prefetch no Surface
showed, is still collected at once. Collecting is safe because the server
remains authoritative and the planner can refetch.

This is another important difference from Sync: **Remote recovery may discard
and refetch; Sync recovery must preserve unsent client intent.**

## Persistence and hydration

A snapshot is `{ entities, connections }`. The entity cache is disposable and
always goes; a connection goes only if named, and keeps its edges alone — never
a cursor, which may name server state that is gone. Session machinery (live
cursors, optimistic layers, mutation bookkeeping, gaps, retention roots) is
never in one.

```ts
import { Option } from 'effect'
import { RemotePersistence } from 'foldkit-remote'

// A cache carried in the page: prefetch on the server, embed, then hydrate.
// `snapshotOf` names the connections that survive; none, here. For a page
// the browser resumes with foldkit-ssr, see Server rendering below.
const text = RemotePersistence.dehydrate(
  RemotePersistence.snapshotOf(loaded.remote),
  { scope: userId },
)

// None when the text is refused (another scope, version, or a corrupt text).
const restored = Option.getOrElse(
  RemotePersistence.hydrate(text, { scope: userId }),
  () => RemotePersistence.emptySnapshot,
)

Data.reduce(model, {
  _tag: 'Hydrated',
  entities: restored.entities,
  connections: restored.connections,
  merge: 'preserve-existing',
})

// Or persist through Effect's KeyValueStore.
RemotePersistence.save(RemotePersistence.snapshotOf(model.remote), {
  key: 'remote-cache',
  scope: userId,
  maxBytes: 512_000,
})

RemotePersistence.restore({
  key: 'remote-cache',
  scope: userId,
  maxBytes: 512_000,
})
```

Snapshots are deterministic, versioned, scoped, and optionally size-bounded. A
snapshot from another version/scope, an oversized snapshot, or malformed data is
discarded and the planner refetches. `Hydrated` is itself a Remote Message, so
hydration still changes the application through the reducer.

### A cache kept across reloads: `Data.persistence`

The calls above are the parts. `Data.persistence` puts them together as a
wiring: it restores the snapshot stored under a key, and saves the cache under
that key whenever it changes.

```ts
const persistence = Data.persistence({
  key: model => `remote-cache:${model.userId}`,
  scope: model => model.userId,
  maxBytes: 512_000,
})

// Assembled beside `Data.wiring`; the runtime provides a `KeyValueStore`,
// such as `BrowserKeyValueStore.layerLocalStorage`.
const placements = Page.assemble(Data.wiring(actives), persistence)
```

The first restore belongs before the first frame, or a reload draws `Loading`
until a Subscription brings the stored rows. `persistence.restore(model)` is
that restore as an Effect: resolve it as the runtime's `flags`, which the
runtime runs with its `resources` before `init`, and start `init` from the
Model it gives (`examples/cloudflare/src/browser.ts` does):

```ts
Runtime.makeElement(
  placements.runtime({
    Model,
    Flags: Model,
    flags: persistence.restore(initial(actor)),
    initial: (model: Model) => ({ model }),
    // …
  }),
)
```

After that the wiring restores only a key the Model is not restored from (a
change of principal), and saves as the cache changes:

```text
key -> restore -> Hydrated { from: key } -> restoredFrom = key -> save on each change
```

Without `restore` in `init`, the wiring restores at start too, a frame late.

- **A restore keeps what the Model already holds.** It hydrates with
  `merge: 'preserve-existing'`, so a fact resumed from the server, or read since
  the page started, wins over the older snapshot.
- **So a change of principal is `Data.forget`, in the same `update`.** What one
  person read, left in memory, would be kept over the next one's snapshot and
  then saved under their key; `forget` clears it as the key changes. The
  `scope` check refuses a snapshot written for another reader; it cannot see
  facts that are only in memory.
- **`forget` never brings back what it forgot.** It keeps `restoredFrom`, so
  a key that does not change (a sign-out that keeps the key) is not restored
  again; the emptied cache is saved over its snapshot after the debounce
  instead. A key that changes is restored as any new key is, so both
  `forget` alone and `forget` with a new key are safe at a change of principal.
- **Nothing is saved before its own key is restored.** `Hydrated` records the
  key it came from in `model.remote.restoredFrom`. Until that key is restored,
  nothing is saved, so the empty store at startup cannot overwrite the
  snapshot it has not read yet. When the key changes (a different principal),
  saving stops again until the new key's snapshot is in.
- **A store that cannot be read restores nothing, and so nothing is saved over
  it.** A stored snapshot from another version or scope, or one that will not
  decode, is removed, and an empty snapshot is restored in its place.
- **Saving is debounced** (`debounce`, 250 ms by default) and best-effort: a
  full store keeps the snapshot it had, and the next change tries again. The
  write waits; the snapshot does not: it is serialized on each change of the
  cache, so under a steady stream of live changes keep it small, with
  `maxBytes` or a `snapshot` that stores only what a page shows. A
  cache grown past `maxBytes` removes its key, so an older, smaller snapshot
  cannot outlive it.

`snapshot` replaces `snapshotOf` when an application keeps something else, such
as only the edges a page shows.

## Server rendering: `Remote.resume`

A snapshot is built for a cache that survived a reload: it keeps the whole
entity store and deliberately no cursors. A page rendered a moment ago wants
the opposite. `Remote.resume(Data)` is a resume part for
[`foldkit-ssr`](../ssr/README.md) (in development), which sends exactly what
the page's active Surfaces read, and resumes it in the browser:

```ts
const Page = SSR.plan(App, {
  id: 'project',
  state: Projection.pick(App.model.route),
  surfaces: [ProjectPageAt],
  parts: [Remote.resume(Data)],
})
```

- **Only what is read crosses.** For each requirement, the fields it names,
  following its relations through the refs the store holds; for each
  connection, the fields its selection reads of each item. A field in the
  server's store that no Surface selects, such as a user's email, is not in the
  page.
- **Connections cross whole**, with their boundaries, so "load more" knows
  where the server stopped.
- **Live cursors cross with the entities they follow**, so a live
  subscription started in the browser asks from where the server's left off.
- **Nothing else crosses.** Loading marks, failures, the mutation ledger,
  optimistic layers, gaps and retention start at their initial values.

The browser's read entry plans against the restored store, so it asks for
none of it again. The capture is JSON through its own Schema, and a page whose
capture does not decode is refused whole by `foldkit-ssr`. Give a second domain
in one application its own `id`: `Remote.resume(Catalog, { id: 'catalog' })`.

## How the server packages fit

`foldkit-remote` owns **client cache semantics**, not your source database or
network transport.

```text
client

Surface Projection
       |
       v
foldkit-remote
requirements + normalized cache
       |
       v
RemoteClient / Effect RPC

---------------- server boundary ----------------

foldkit-remote-server
Sources + field authorization
       |
       +---------------------+
       |                     |
       v                     v
foldkit-remote-drizzle    hand-written Source
(optional SQL compiler)   API / service / database
```

The package roles are:

| Package | Responsibility |
| --- | --- |
| `foldkit-remote` | normalized cache, requirements, planning, queries, optimistic overlays, live cursors, retention |
| `foldkit-remote-server` | interpret client selections/queries against server Sources and enforce semantic-field authorization |
| `foldkit-remote-drizzle` | optionally compile those selections and queries into typed Drizzle access |
| Effect RPC / your layers | transport and deployment |

`Remote.clientLayer(rpcClient)` adapts `RemoteRpc` to `RemoteClient` and
coalesces compatible reads/queries. HTTP, WebSocket, worker, and in-process
execution are layer choices rather than Remote semantics.

See [`foldkit-remote-server`](../remote-server) for Source and authorization
rules, and [`examples/kitchen-sink`](../../examples/kitchen-sink) for the real
server packages together.

## Clients and transports

Every client is a `Layer<RemoteClient>`, and Remote's semantics do not change
with it: a read, a query, a write and a live stream mean the same over Effect
RPC, JSON or a port. What differs is how each reports a request that did not
get an answer.

`Remote.json(send)` is the JSON client over any way of sending the request
text; `Remote.http(url, { headers, fetch })` is it over `fetch`. `headers` is
read for each request, so a token that changes reaches the next call.

**Who is asking.** A 401 fails every call kind, a read, a query, a mutation or
a live stream, with `_tag: 'Unauthenticated'` (and `reason` when the server
gave one): the server could not tell who is asking. A 401 is read so whatever
its body says. A 403 whose body does not say `forbidden` itself, as Remote's
server's does, comes from middleware in front of it refusing a session (a
bare `{ error }` included): it fails a mutation as `Forbidden` and any other
call with the status. `RemoteData.denied(error)` reads a failure as
`Unauthenticated` or `Forbidden`, typed, and as none for any other, so a view
tells "sign in again" from "could not load" without comparing tags. Remote
treats either as any failure: a read or query is `Failed`, and a live stream
restarts with its backoff, refused again each time, until the application
signs in again and calls `Data.forget`.

The JSON clients carry no live data. For live data over the same `POST`s,
`Remote.httpWithLive` keeps reads, queries, and mutations as `http` sends
them and streams live requirements as a `text/event-stream` of changes;
[`serveFetch`](../remote-server/README.md#over-fetch-workers) is the other
end. Abandoning the stream aborts the request, which interrupts the
subscription server-side.

For a server in a worker or in the page (a sandbox), `foldkit-remote/port`
speaks Effect's own RPC worker protocol over a `MessagePort`, so live data,
typed errors and interruption cross it too.
[`servePort`](../remote-server/README.md#over-a-messageport) is the other end:

```ts
import { port } from 'foldkit-remote/port'

// A new conversation each time the protocol connects: one port here, the other to the server.
const overPort = port(() => {
  const channel = new MessageChannel()
  worker.port.postMessage({ open: 'remote' }, [channel.port2])
  return channel.port1
})
```

It is a `Layer<RemoteClient>` like the others; a port that cannot be set up is
a defect, not a failed read.

**Nothing answered.** The client `RpcClient.make(RemoteRpc)` builds is
accepted as it is. When its transport fails, a read, a query or a mutation
fails with `RemoteUnreachable` (`_tag: 'Unreachable'`), and a live stream with
`RemoteLiveError`; the UI shows and retries each like any other failure. For a
mutation it means the server may or may not have run it.
`RemoteData.isUnreachable(error)` asks that of a failure without comparing tags.
Over `Remote.rpcProtocolHttp`, a 413 is the call's own error instead
(`RemoteReadError`, `RemoteQueryError`, `RemoteMutationError`): the server
refused the request for its size, and a durable write so refused is settled
`Failed`.
`Remote.json`, `Remote.http` and `Remote.httpWithLive` say the same of a
request they could not send, and of a response that is no Remote answer: a
body that is not JSON, JSON that is not `{ result }` or `{ error }` (a
gateway's `{}`), or a response with status 408, 429, 502, 503 or 504, which
Remote's server never answers with. Each is a `RemoteJsonClient`, a
`RemoteRpcClient` whose transport error is `RemoteUnreachable`. A mutation the
server failed is a `RemoteMutationError`. The difference matters for a [durable write](#a-write-that-outlives-the-page-dataoutbox):
an `Unreachable` one is sent again, a refused one is settled `Failed`.

**Deadlines, aborts and limits.** `Remote.clientLayer(client, options)` puts
one wrapper around any transport, and it decides how long a call waits, when
it stops, and how big a request may be:

```ts
const overHttp = Remote.clientLayer(Remote.http('/remote'), {
  timeout: '20 seconds', // every read, list and mutation
  maxBodyBytes: 64 * 1024, // the server's serveFetch maxBodyBytes
})
```

- `timeout` is the client's deadline. A call past it fails
  `RemoteUnreachable`: a read or a list is retried by `Data.refresh` like any
  failed read, and a durable mutation, which may have reached the server, is
  sent again under the same operation id. A read entry sets its own with
  `Data.subscriptions(active, { timeout })`, one send with `Data.mutate(…, {
  timeout })` (not with `durable`: the outbox uses the client's). The deadline
  is each caller's: one giving up does not fail another that joined the same
  read.
- A read nobody waits on is aborted. When no read entry has waited on any of
  a read's rows for a frame (the search changed, the deadline passed, the
  page closed), the call is interrupted and `Remote.http` aborts its `fetch`;
  `Remote.json` hands its `send` the `AbortSignal` to do the same. A read
  entry that restarts and asks again for some of the same rows joins the read
  instead, and gets its whole answer. Lists are aborted the same way.
- A view of many rows sends one batch per plan, cut to the server's limits:
  `maxIdsPerEntity` (default 1000) and `maxBodyBytes` (default 1 MiB), each
  matching `serveFetch`'s defaults, so 2,500 rows of one Entity read in three
  requests rather than being refused whole. A row, a list or a mutation too
  large to send alone fails without being sent; a mutation so refused is a
  `RemoteMutationError`, which the outbox does not resend.

**Testing a server over HTTP.** Call it as the application does: give
`` Remote.http(`${origin}/remote`, { headers, fetch }) `` the server's address
(miniflare's `(await mf.ready).origin` for a Worker) and call
`FoldkitRemoteRead`, `FoldkitRemoteQuery` and `FoldkitRemoteMutate` on it, as
`examples/cloudflare/src/client.ts` does over its local stack. To speak the
wire yourself, each `POST` body is one of these, `version` being
`REMOTE_PROTOCOL_VERSION`:

```json
{ "operation": "read", "payload": { "version": 5, "requests": [{ "entity": "Post", "id": "p1", "fields": ["title"] }] } }
{ "operation": "query", "payload": { "query": "PostsByAuthor", "input": { "authorId": "a1" }, "window": { "first": 20 } } }
{ "operation": "mutate", "payload": { "requestId": "r1", "mutation": "RenamePost", "input": { "id": "p1", "title": "Hello" } } }
```

## Introspection

Remote exposes its decisions as data rather than requiring DevTools to reach
into private state:

```ts sketch
Data.inspect(model)            // serializable cache/domain summary
Data.plan(model, projection)   // the entity plan a read would execute
Data.meta(model, projection)   // when what is shown was received, stale/loading
Data.explain(model, query)     // what one query read is, and currently is
Remote.planQueries(...)        // missing/stale query work
Remote.inspectEntity(...)      // one normalized entity
```

`Data.meta` is for views, not debugging: `updatedAt` is the newest server
write among what the projection shows (`undefined` when nothing shown was
received), with `stale` and `loading` beside it, so "updated 5s ago" reads
the Model like any other render.

These are pure and useful in tests, tooling, and debugging. For a read that
stays `Initial`, `Data.why` and `Data.plan` are the tools; see
[Why is it still `Initial`?](#why-is-it-still-initial).

`Data.inspect(model).loading` answers the other one — **"what is Remote doing
right now?"** — with the `entity\0id\0field` marks of the reads in flight,
beside `mutations.pending` for the writes. Both are read from the Model, not
from the fibers doing the work: a tool that shows them shows something a
recorded Model can be replayed to, and nothing that needs the runtime to be
asked. That is deliberate. Runtime activity is not a second source of truth
here, and a view that rendered from it would stop being reproducible from the
Model.

### Diagnostics

What Remote meets and keeps going past is recorded in the Model, typed, as
`model.remote.diagnostics` (and `Data.inspect(model).diagnostics`), oldest
first, the newest 256 kept:

| `_tag` | When |
| --- | --- |
| `PredictionMismatch` | Under `verifyPredictions`, an answer disagreed with what the client predicted: a field's value (`Value`), a list's order (`Placement`), or a field left out (`Gap`). |
| `WriteUnheard` | A write failed, and the wiring does not share `MutationFailed`. |

Each carries its facts, `source: 'foldkit-remote'`, a `level` and a `message`
to log. The reducer only records them, since it is pure. The wiring's route and
`Remote.fold` report what each update recorded, with a Command that hands them
to the `Diagnostics.Reporter` in the runtime's Effect context and answers
`CompletedReportDiagnostics`, which changes nothing. With no reporter given,
that is Effect's log in the browser's console: `console.error` for an `error`
diagnostic, `console.log` for a `warning`, as all of Remote's are. An
application that reduces Remote's Messages by hand (`Data.reduce`) has them in the Model, and
nothing reports them.

`Diagnostics` is `foldkit-surface`'s, re-exported here; server packages report
into the same channel. Another reporter goes in the runtime's resources:

```ts
const resources = Layer.mergeAll(
  Remote.clientLayer(Remote.http('/remote')),
  // Logged as by default, and sent on to the server.
  Layer.succeed(Diagnostics.Reporter, diagnostic =>
    Effect.andThen(
      Diagnostics.log(diagnostic),
      Effect.sync(() => navigator.sendBeacon('/diagnostics', diagnostic.message)),
    ),
  ),
)
```

In a test, assert on the Model, `[]` included:

```ts
expect(Data.inspect(model).diagnostics).toEqual([])
```

Nothing a diagnostic records changes what Remote does: a read, a write and a
placement behave the same whether one is recorded or not.

### Explaining one query read

A query read is assembled from more pieces than it looks like: a definition, an
input, a connection identity that excludes the window, a window that does not,
and a Selection that is a slice asked of the server. `Data.explain` puts them in
one serializable value, beside what the read answers from this Model right now:

```ts
Data.explain(model, projects)
// {
//   domain: 'remote',
//   query: 'ProjectsByOwner',
//   input: { ownerId: 'u1' },
//   identity: 'ProjectsByOwner\u0000{"ownerId":"u1"}',
//   window: { first: 25 },
//   select: { entity: 'Project', fields: ['id', 'name'] },
//   body: 'FROM Project\nWHERE Project.ownerId = $ownerId\nORDER BY Project.name DESC',
//   dependencies: { fields: [...], inputs: ['ownerId'], operations: ['eq'] },
//   state: 'Ready',
// }
```

`body` is the query's meaning as readable text, and it is neither SQL nor
whatever the backend compiled — an input shows as `$ownerId` rather than a bound
parameter, and `contains` is named rather than rendered as somebody's `like`. A
definition made with `Query.make` has no `body`, because its meaning lives on
the server that answers it.

`state` comes from the projection's own read, so an explanation and the view
cannot disagree about whether the data is there.

A Projection cannot say which Surfaces read it — several may — so pass the
active record `subscriptions` takes and `explain` reports all of them, plus why
each is active where that is a readable fact (`Surface.when`) rather than a
callback (`Surface.at`):

```ts
Data.explain(model, projects, { surfaces: actives })
// surfaces:   ['ProjectPage']
// activation: [{ surface: 'ProjectPage', path: ['route'], tag: 'Project' }]
```

A `Surface.each` family reports each reading instance as `Child[key]`.

There is still no **executor**, because what answers a query is a
`RemoteClient` Layer in the runtime rather than a value in the Model — the same
purity that lets this be replayed from a recorded Model is what keeps it out of
reach.

## Testing what a reader sees: `Trace`

"A list on screen never blinks to `Loading`" depends on the reducer, the read
entries and the order answers land in. `foldkit-remote/testing` checks it in
Vitest, with no browser. `Trace.run` runs your `update` and the domain's own
Subscriptions from a Model. It **holds** every request they make. Each step is
one of your Messages, or a `Respond` that lets one held request go on, answered
by the `RemoteClient` you pass. Every Model in between is recorded, so a
regression that lasts one Message cannot fall between samples.

```ts
import { Respond, Trace } from 'foldkit-remote/testing'

const trace = await Trace.run(Data, {
  start: loaded, // a Model showing the list
  update,
  active,
  client: server, // a fake, or your server's in-process client
  steps: [
    Message.Created({ id: 'p2', name: 'Two' }),
    Respond.mutation(Create), // the answer lands first
    Respond.read(Project, 'p2'), // then the new row's fields
  ],
})

expect(Trace.regressions(trace, { list })).toEqual([])
expect(Trace.tags(trace, list)).toEqual(['Ready', 'Refreshing', 'Ready'])
```

- **The trace decides when; the client decides what.** `Respond.query(ref)`,
  `Respond.read(Entity, id)` and `Respond.mutation(M)` each answer the oldest
  held request of their kind, and each takes `{ fail }` to answer with an
  error instead. `Respond.all` answers everything held, and what that leads
  to, until nothing is. Reorder the steps to try another interleaving.
- **`Trace.regressions`** names each time a read that showed a value read
  `Loading`, `Initial`, or `Failed` without it. It gives the step, the Message
  and `Data.why`; it is `Data.timeline` over the trace, kept to its
  regressions. `NotFound` is not a regression, since the server said the row
  is gone. **`Trace.tags`** is each change of a read's tag.
- **It fails loudly.** A `Respond` that matches nothing held throws and lists
  what is held. A request abandoned by a restart is no longer held. A
  Subscription or Command that dies throws. An `update` that does not take
  Remote's Messages is a type error.
- **A disagreement fails the run.** `Trace.run` requires a domain that
  [verifies its predictions](#checking-an-answer-against-what-was-shown)
  (Vitest sets `DEV`), and throws once its steps have run if any Model
  recorded a `PredictionMismatch` the domain does not declare `expected`.
  Name reads in `reads` and a regression of one fails it too, unless
  `regresses: { list: 'why' }` says it is on purpose. The error names the
  Message, and the mismatch's words or the read's `Data.why`.
- **`Trace.record(Data, update, { reads })`** checks a running application
  the same way: give its `update` to `Runtime.embed` in a browser test, and
  call `check()` once the steps are done.
- **What it leaves out.** Its clock stands still, at `now` (0 unless given):
  every Command it runs and every answer it asks for reads that time
  (`Remote.now`, an answer's date), and a retention `grace`, an age-out and a
  live restart never fire. A live stream sends nothing, so
  script its events as `LiveReceived` Messages. Only Remote's Commands run,
  and `entry.skipped` names the others. It drives a domain whose Messages are
  in your union, not a `Remote.fold`.
- **Durable writes need the outbox.** Pass `outbox` (your `Data.outbox`
  wiring) and the trace starts from its `restore`, over an empty store of its
  own, and runs its Subscriptions as one tab: a durable write is stored and
  sent by it, and `Respond.mutation` answers that send.

## Testing that a prediction is the truth: `Law`

A declared write is interpreted twice: by `Data.mutate`, in memory, over what
the client holds (what it shows while the write is pending), and by the
server, in SQL (what it stores). The law between them: **where the client
predicts a part, the server's answer equals it**, while the write is pending
and again once its answer has landed and the prediction is released.
`Law.check` runs one operation through both, as an application does, and
compares:

```ts
import { Law } from 'foldkit-remote/testing'

const report = await Effect.runPromise(
  Law.check(Data, {
    model: { remote: Remote.initial, me: 'u1' }, // whom Remote.make's viewer reads
    holds: [{ entity: Card, ids: ['c1', 'c2'] }], // read whole, as the principal
    lists: [ByRank.ref({})], // loaded whole; their placements compared
    mutation: AddCard,
    input: { id: 'c9', title: 'delta', rank: 3, votes: 0 },
    now: 1_000_000,
  }).pipe(
    Effect.provide(Remote.clientLayer(RemoteServer.handlers(server, 'u1')).pipe(Layer.provide(db))),
  ),
)
expect(report.disagreed).toEqual([])
expect(report.agreed).toEqual(expect.arrayContaining(['Card:c9.createdAt', ByRank.ref({}).identity]))
```

- **Nothing is stubbed.** The rows in `holds` are read through the server as
  its principal sees them and reduced into the Model, so the client holds what
  the server would send it; the lists are queried and merged; `Data.mutate`
  predicts; its own Command sends the write. Each row the request's layer
  changed is read back, every list queried again, and compared twice: with
  the Model as it showed the write (`when: 'pending'`) and with the Model
  once the answer is reduced into it (`when: 'answered'`). A part is agreed
  only when both agree. A field the answer left out, which the client would
  read again, is not compared once answered; a list the answer left stale is
  fetched again, and is not either.
- **A part is `Entity:id.field`, `Entity:id`** (whether the row is there) **or
  a list's identity.** What the client left to the server (a field it could not
  work out, a list with a row it could not judge) is in `unknown`, and is not
  compared.
- **Pin the server's clock to `now`** (a `Clock` service, or `TestClock`), or a
  `now` outside the server's `clockSkew` is replaced by its own, and every time
  the write sets disagrees.
- **A refusal is a part too.** A write the client refused itself (a broken
  invariant) is still sent to the server, which must refuse it alike; one the
  server refuses after the client showed it is a disagreement.
- **It fails when it compared nothing**, as for a mutation the client foresees
  nothing of: two sides that both said nothing agree, and that is no evidence.
  Name the parts you expect compared, as above, so a prediction that silently
  stops is caught too.

## Advanced: the kernel

Everything above compiles to the lower-level exports below; there is not a
second implementation. Reach for the kernel in tooling, SSR, tests, packages
built on Remote, or applications that deliberately need one piece by hand.

### Descriptors and binding

`Remote.define({ entities, queries, mutations })` creates a domain without a
place in an application Model. It exposes the Remote `Model`, `initial`,
`Message`, reducer, RPC group, and a name-keyed registry consumed by
`RemoteServer.validate`.

`Remote.at(definition, modelRef)` binds that domain to a `ModelRef`;
`Remote.make` combines definition and binding in one step. Either one's
`store` is the ref's `Focus` (`ModelRef.focus(modelRef)`): its `get`, `set`
and `dependency`, which `foldkit-sync` and the law checks read.

`Entity.make(name, schema)` is Remote's own entity descriptor, and what a
`foldkit-entity` Entity is compiled to (`Entity.from`). Remote accepts either
wherever it takes an entity. Declaring one directly skips `foldkit-entity`,
and with it relations, derived members and query bodies, which is only worth
it for a domain that Remote is all it will ever need.
`Selection.make(Entity, { ... })`, `Selection.connection(...)`, and
`Entity.patch(ref, values)` are the kernel constructors behind the entity
helpers. `Remote.select(bound, selection)(id)` is the lower-level form of
`Data.get`.

### Requirements and the planner

A Projection carries its requirements as Remote's own metadata, attached with
`RemoteRequirements.of` / `RemoteConnections.of` and read with
`requirementsOf(projection)` / `connectionsOf(projection)`. Requirements are
plain data: entity, id, fields, any relation pagination windows, and the nested
target selections reached through relations. Connections describe query
connections as `{ identity, window, select }`.

`Remote.plan(bound, model, projection, options?)` deterministically diffs those
requirements against the visible store and returns only missing/stale work. A
relation field being fetched rides on the same request so the server can resolve
the graph in one read; a relation already present in the store is followed into
requirements for the concrete target.

`Remote.planQueries` performs the same job for absent/stale connections.
`RemotePolicy.toPlan(policy, now)` compiles a high-level policy into planner
options.

`Remote.storeOf` is the visible store after pending optimistic layers. Reads are
memoized per visible store (and, for a list, its connection and overlays), so
equal reads of one Model state assemble/decode once and return one value.

Across Model states, an entity's or row's decoded value stays the same object
while its entity's fields are equal: a refetch or live patch that brought equal
data hands the view the value it already rendered, so a keyed row's lazy view
does not re-run. A write to any field of the entity, even one the row does not
select, or a pending optimistic patch on it while other writes land, gives the
row a new value. When the store changed, the `RemoteData` around a value and a
page's `items` array are new.

`Remote.prefetch(bound, model, projection, options?)` runs the same plans
imperatively and reduces their results into a new Model.

### The reducer and its Messages

`updateRemote(remote, message)` is the pure reducer over Remote facts;
`Data.update` applies it to a bound Remote state and `Data.reduce` applies it to
the application Model. The common Messages that change nothing (a duplicate live
event, a repeated `ReadStarted`, an empty `Hydrated`, a retention pass that
collects nothing) return the Model they were given, so Foldkit neither renders
nor recomputes Subscription dependencies.

Its Messages cover reads and refreshes, mutations, live events/gaps, query
connections, retention, and hydration. `Remote.messages` is the case record for
`defineMessageUnion`, and `Remote.reduces(message)` narrows an application union
to those cases.

`Remote.writeRead(store, requests, result, now)` exposes the store write behind a
read result for callers deliberately managing their own Remote store.

### Subscription entries

`Data.subscriptions` is built from three kernel entries:

```text
Remote.observe(bound, surface, params, toMessage?, options?)
  plan + entity reads + query reads

Remote.live(bound, surface, params, toMessage?, options?)
  live streams from the Model-owned cursor

Remote.retain(projections, toMessage?, { connections?, grace? })
  active roots -> RetentionChanged
```

The observe entry's dependencies are the current plan, the Model's refresh
generation, and when a held value next ages out
(`{ requirements, queries, refresh, expires }`), so `Data.refresh` restarts
it. If entity requirements and queries are both empty, it performs no I/O. A
refreshing read emits `RefreshStarted` first, then a result Message.

A Message that changes the Model makes Foldkit recompute Subscription
dependencies. For example, after a query page lands, the next computation sees
the page's entity ids and plans any selected fields those entities still lack.
An interrupted identical read is joined by the client coalescer instead of
needlessly restarted.

The live entry's dependencies are what the Surface reads live, the refresh
floor, and the stream's cursor. The stream stays open as events advance the
cursor; the cursor is only where a stream restarted for another reason resumes.

Retention uses the Projection requirements/connections as roots and eventually
emits `RetentionChanged`; the reducer's pure `gc` keeps everything reachable
from those roots plus pending work and collects the rest.

The entries `Data.subscriptions` returns carry these dependencies in their
types: `ReadDependencies` for `<key>.read`, `LiveDependencies` for
`<key>.live`, and `RetentionRoots` for `retain`.

### Connections by hand

A connection stores entity references in segments with explicit boundaries, so
an unloaded middle page remains a gap rather than an implied adjacency. Query
pages, live inserts/removals, and optimistic overlays are reconciled as evidence
about that same structure.

A `QueryRef` has a canonical identity based on its descriptor and encoded input,
excluding the page window. Thus `first(25)` and `after(cursor).first(25)` merge
into the same logical connection.

```ts
// Inside Effect.gen, with RemoteClient provided.
const ref = Query.first(25)(ProjectsByOwner.ref({ ownerId }))
const page = yield* Remote.query(ref)

updateRemote(remote, Remote.queryMessage(ref, page))
Data.visibleItems(remote, ref)
```

`items`, `hasNext`, `hasPrevious`, and `isGapped` describe the known region.
`ConnectionInvalidated` keeps visible rows but marks the connection stale until
a refresh/query result settles it. A `ConnectionMerged` page with
`refreshes: true` replaces a stale connection's pages rather than merging into
them.

### Where a row falls: `placeIn`

A query whose body declares a placeable order (`Query.placement` in
`foldkit-entity`: numbers, booleans, and text under a portable collation) can
have a changed row placed in its loaded pages by the client, by the same order
the server compiles. Such a connection also reads every field its body filters
and orders by, so the rows it holds can be compared with one that changed.

```ts
// Schematic: `ProjectsByRank` is a Query.define ordered by a number, and
// `connection` one of `remote.connections`; `Operators` is foldkit-entity's.
// test/placement.test.ts runs it.
placeIn(remote.entities, connection, ProjectsByRank.body!, {}, 'Project:p7', Operators.kernel)
// Before { segment, edge } | End { segment } | Outside | Unknown { reason }
```

The last argument is the operator table the body's calls run by, the one
`Remote.make`'s `operators` names (`Operators.kernel` by default).

- `Before` and `End` are positions among loaded edges: before an edge, or at
  the end of a segment that ends the list (`Terminal`).
- `Outside` is a row that sorts past a `Cursor` boundary or into a gap between
  segments: it belongs to rows the client has not read, so it is not shown.
- `Unknown` is anything not judged exactly: a body that is not placeable, a
  row or an edge lacking a field the order reads, keys that do not compare.

It is pure and changes nothing. A mutation's answer is placed through it, as
above.

### Mutations by hand

`Remote.mutateInto(bound, model, mutation, input, requestId, { optimistic, now })` is
the one-step imperative start/run/settle form for SSR and tests.

`Remote.mutate(mutation, input, requestId, { keys, operation })` is the
transport call itself. It decodes the typed `Output` and returns normalized
entity patches and confirmed connection changes for a caller to reduce through
`updateRemote`. It mints an operation id when none is given; a caller retrying
a request passes the one it first sent.

`MutationSucceeded` reconciles at most once per `requestId`; an unknown or
already-applied settlement is a no-op. It carries `now`, the clock reading of
the answer, which dates the entities it writes as a read's `now` does, so a
freshness policy ages them from then. `Data.mutate`, `Remote.mutateInto` and
the outbox stamp it from Effect's `Clock` when the answer lands, never from the
`now` option, which is the write's time sent to the server.

### The transport seam

`RemoteClient` is an Effect service with `read`, `query`, `mutate`, and `live`.
The wire schemas (`ReadBatch`, `QueryRequest`, `MutationRequest`,
`LiveRequirement`, results/errors) and the `RemoteRpc` group are exported.

`Remote.clientLayer(rpcClient, { window?, timeout?, maxIdsPerEntity?, maxBodyBytes? })` adapts an Effect RPC client,
including live-change mapping. It takes the client `RpcClient.make(RemoteRpc)`
builds, whose calls can also fail with `RpcClientError`; each such failure
becomes the call's Remote error rather than a defect. Compatible reads and queries coalesce:
requirements issued together become one `ReadBatch`, an identical in-flight
requirement/query is joined, and a failed request releases the coalesced entry.
A relation request with its own pagination window stays separate because one
response answers one window exactly. A batch is cut to `maxIdsPerEntity` and
`maxBodyBytes`, each piece its own read, and a read or query nobody waits on
any more is interrupted ([Deadlines, aborts and limits](#clients-and-transports)).

`Remote.coalesced(layer, options)` adds the same behavior to a hand-written
`RemoteClient` layer; `window` widens batching beyond work issued concurrently.

## What Remote owns

Remote owns:

- typed entity identity, references, selections, and patches;
- the normalized entity store, field presence/staleness, and tombstones;
- pure requirements and deterministic planning;
- the `Remote.Model` Submodel and its reducer;
- query connections and pagination boundaries;
- optimistic mutation overlays and idempotent settlement bookkeeping;
- the outbox of durable writes: stored, sent in order by one tab, sent again;
- live cursors, duplicate suppression, and gap detection;
- retention/garbage collection of disposable cache data;
- deterministic, scoped cache snapshots;
- the `RemoteClient` semantic transport seam and `RemoteRpc` schemas;
- pure introspection of the cache and plans.

Remote does **not** own:

- your source database or authoritative server records;
- local UI/application state outside `Remote.Model`;
- client-authored state that converges across devices, or replica convergence;
- HTTP/WebSocket deployment details;
- authentication; server-side authorization belongs at the Source boundary;
- a background scheduler or general-purpose database/query engine.

## Limits

- `RemoteRpc`'s schemas are the wire contract, carried by Effect RPC, by JSON
  over `POST` (`Remote.http`), or over a `MessagePort`; the application
  supplies deployment layers. `ReadBatch` and `LiveRequirement` carry
  `REMOTE_PROTOCOL_VERSION`, and a mismatched version fails with
  `RemoteProtocolError` rather than silently drifting.
- One request may name at most `MAX_FIELDS_PER_REQUEST` (256) fields of one
  entity and nest relations at most `MAX_RELATION_DEPTH` (8) levels; the wire
  rejects larger inputs. A live stream carries at most `MAX_LIVE_QUERIES` (32)
  lists, and a `many` relation read whole is bounded by the server's Source
  (`maxCollection` in `foldkit-remote-drizzle`).
- The wire `LiveChange` union carries entity patches/deletes and connection
  insert/remove/invalidate changes; `RemoteServer.live` serves them as a stream.
- Coalescing is scoped to one `RemoteClient` layer. Separate layers do not share
  batches.
- Retention keeps what active Surfaces (and explicit retain entries) reach, and
  what the Surfaces left reached while it fits the budget (`Remote.make({
  budget })`, entries of rows and lists). Past it, the Surface left longest ago
  loses its cache on `RetentionChanged`. The budget is a count of entries, not
  bytes: a row with a large field costs what a small one does.
- Two applications with the same Model type are not distinguishable by TypeScript
  alone; `Data.subscriptions` also checks the Surface owner token at runtime.
- `staleWhileRevalidate({ maxAge })` ages rows and lists alike; a list's age is
  that of its last whole page; a later page or a live event does not date it.
- `RemoteData` is a closed union.
- A Selection must choose at least one field; an empty Selection would require
  nothing and misleadingly read `Ready` for every id, so it is rejected.

## See also

- [Server-derived state](../../docs/remote.md) — the deeper architectural guide
  and ownership model.
- [Errors and failures](../../docs/errors.md) — how a read's, a write's and
  every other package's failures fit together: who owns each, what the reader
  sees, what the application does.
- [`foldkit-remote-server`](../remote-server) — server Sources, resolution, and
  semantic-field authorization.
- [`foldkit-remote-drizzle`](../remote-drizzle) — optional compilation of Remote
  selections/queries into Drizzle access.
- [`examples/remote`](../../examples/remote) — an asserted trace through plan,
  prefetch, refresh, query, render, mutation, retention, and decode failure.
- [`examples/kitchen-sink`](../../examples/kitchen-sink) — the same architecture
  using the real server packages.
- [Site, Remote and SSR together](../../docs/site-remote-ssr.md) — routes that
  activate reads, rendered on the server with their data and taken over without
  fetching again.