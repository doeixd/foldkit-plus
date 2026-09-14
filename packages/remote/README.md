# `foldkit-remote`

Server data in a Foldkit application, kept in the Model instead of in a cache
beside it. You declare your entities and the fields each screen reads;
`foldkit-remote` works out what is missing, fetches it in one batched request,
stores it normalized so two screens share one copy, and gives each screen its
own slice as a plain value. Reading is pure — a view never starts a fetch.

There is no hidden mutable cache. Every new fact — a read result, a page, a
mutation result, a live event — arrives as a Message and goes through the same
`update` that moves the rest of the application, so replay, time travel, and
tests see remote data like any other state.

Reach for it when the server owns the data, several screens read overlapping
slices of it, and you would rather have fetching, caching, pagination,
optimistic updates, and live patches be one mechanism than five. It is not where
edits that must survive the process or the network belong — that is
[`foldkit-durable`](https://github.com/doeixd/foldkit-plus/tree/main/packages/durable)
and [`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync)
— and it is not a transport: the wire is Effect RPC (`RemoteRpc`) and the
application supplies the client and server layers (HTTP, WebSocket, worker,
in-process). The server half is
[`foldkit-remote-server`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote-server);
[`examples/remote`](https://github.com/doeixd/foldkit-plus/tree/main/examples/remote)
is the worked end-to-end trace and
[Revision Plan §8](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/REVISION_PLAN.md#8-remote)
the design rationale.

The package has two faces. The **application API** is the bound domain `Data`:
`Data.get`, `Data.live`, `Data.query`, `Data.mutate`, `Data.subscriptions`, and
a handful more, each inferred from the descriptors it is given. The **kernel**
underneath — requirements, the planner, the reducer, the Subscription entries,
the transport seam — stays exported for tooling, SSR, tests, and package
authors, and is documented under [Advanced](#advanced-the-kernel). Ordinary
application code needs only the first.

## Install

```bash
pnpm add foldkit-remote
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with it.
The server half is `foldkit-remote-server`.

## Quick start

One feature, end to end: a project page that reads a project live, lists the
owner's projects, and renames a project.

### 1. Declare the domain

```ts
import { Schema } from 'effect'
import { Entity, Mutation, Query } from 'foldkit-remote'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    owner: Entity.ref(User),
  }),
)

const UserSummary = User.select({ id: true, name: true })
const ProjectSummary = Project.select({ id: true, name: true, status: true, owner: UserSummary })

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})
const RenameProject = Mutation.make('RenameProject', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
```

An entity is its fields; a relation is a reference codec (`Entity.ref(User)`),
never an inline target schema, so a recursive relation (`Node.parent:
Entity.refTo('Node')`) stays finite. `Project.select` picks fields and reads
**through** a relation into its target (`owner: UserSummary`); an unknown field
or a nested selection of the wrong entity is a compile error. `Input`,
`Output`, and `Result` take a codec or the fields of the `Schema.Struct` it
would be; `Result: Project` is a connection over `Project`.

### 2. Embed the submodel and bind the domain

```ts
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

// Your own routes; this one has a project route carrying the id the page reads.
const Route = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('home') }),
  Schema.Struct({ _tag: Schema.Literal('project'), projectId: Schema.String }),
])

const Model = Schema.Struct({ route: Route, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ClickedRename: { id: Schema.String, name: Schema.String },
  ClickedMore: {},
})
type Message = typeof Message.Type

const App = Surface.application({
  Model,
  Message,
  initial: { route: { _tag: 'home' }, remote: Remote.initial },
  update, // step 5: a function declaration, so it may follow Data
})

const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
  mutations: [RenameProject],
})
```

`Remote.Model` is the submodel's schema, the same for every domain, so the
Model embeds it before the domain is bound. Remote's Messages are cases of the
application's own union (`Remote.messages`). `Data` is the bound domain: it
knows the Model, the place of the store in it, and the entities, queries, and
mutations it may be asked about — anything else is a compile error naming the
descriptor (`Entity "Team" is not registered with this Remote domain`), and a
runtime error naming the domain.

### 3. Read in a Surface

```ts
const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25 })

const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.live(ProjectSummary, params.projectId), projects }),
  messages: [Message.ClickedRename, Message.ClickedMore],
})
```

The Surface's Model is `{ project: RemoteData<ProjectSummary>; projects:
RemoteData<Page<ProjectSummary>> }`, read purely from the Model, no I/O. Every
remote value is a `RemoteData`:

- `Initial` — a selected field is not present, and **nothing is fetching it**,
- `Loading` — not present, and a read is in flight,
- `Ready` — present,
- `Refreshing` — present, and being refetched (the value stays visible),
- `Failed` — the stored value did not decode against the selection,
- `NotFound` — the entity is a tombstone.

`Loading` is the absent-value twin of `Refreshing`: both mean a read is in
flight. The distinction from `Initial` is worth rendering differently, because
nothing fetches a projection no active Surface observes. Such a projection reads
`Initial` forever, and showing a spinner for it hides the wiring mistake, while
`Loading` is the state where waiting is the right thing to do.

`RemoteData.match` is exhaustive — omitting a case is a compile error. `Data.get` reads once and refreshes by policy; `Data.live` also
follows the entity's changes; `Data.query` reads a connection as a `Page` of
selected items, `Initial` until the page and every item's fields are present.

### 4. Fetch, subscribe, and retain from the active Surfaces

```ts
import * as Subscription from 'foldkit/subscription'
import { RemoteClient, RemotePolicy } from 'foldkit-remote'

const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() =>
  Data.subscriptions(
    {
      page: Surface.at(ProjectPage, model =>
        model.route._tag === 'project' ? { projectId: model.route.projectId } : undefined,
      ),
    },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }), grace: '5 seconds' },
  ),
)
```

Activation is a fact of the Model: `Surface.at` gives the Surface its params as
a function of the Model, `undefined` while it is inactive. From the active
Surfaces `Data.subscriptions` derives what to fetch (only the fields and pages
the Model lacks), what to subscribe to (what is read through `Data.live`), and
what to keep (everything the active Surfaces reach); a fully-known Surface
fetches nothing, and there is never network work during render.

### 5. Mutate and page from `update`

```ts
function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  switch (message._tag) {
    case 'ClickedRename': {
      const { id, name } = message
      const { model: started, command } = Data.mutate(model, RenameProject, { id, name }, {
        optimistic: [Project.patch(id, { name })],
      })
      return { model: started, commands: [command] }
    }
    case 'ClickedMore': {
      const next = Data.next(model, projects)
      return { model, commands: next === undefined ? [] : [Data.fetch(next)] }
    }
    case 'ClickedRefresh':
      return Data.refresh(model, ProjectPage.projection({ projectId: model.route }))
  }
}
```

Every new fact — a read batch, a page, a mutation result, a live event — arrives
as one of Remote's Messages, and `Data.reduce` is the one reducer for all of
them. The Commands run through `RemoteClient`, so `update` names it as the
resource its Commands need (`Update.Return<Model, Message, RemoteClient>`) and
the runtime is given the client layer (step 6). `Data.mutate` starts the request in the Model (its id comes from the
Model's own sequence, so `update` stays pure) and returns the Command whose
Message settles it; the optimistic patch shows until then. `Data.next` is the
`QueryRef` of the page after the loaded end, or `undefined`, and `Data.fetch`
the Command that merges it, after which the same `projects` projection reads
every loaded page.

`Data.refresh` revalidates what a projection (or a Surface without params)
already declares, so a refresh does not restate the requests behind a page. It
returns `{ model, commands }`, which `update` can return directly: the Model reads
`Refreshing` where values are present and `Loading` where they are not, and the
Commands (one read of every selected field, forced past the cache, and one query
per connection) settle it through the usual Messages. A projection that requires
nothing remote gets the Model back and no Commands. Outside `update`,
`Data.prefetch(model, projection, { policy: RemotePolicy.networkOnly })` is the
same revalidation as an Effect.

### 6. Provide the client

```ts
const clientLayer = Remote.clientLayer(rpcClient) // an Effect RPC client for RemoteRpc
// … provide it to the Foldkit runtime; in tests or in-process, RemoteServer.handlers(…) is one.
```

`Remote.clientLayer` adapts an Effect RPC client for `RemoteRpc` to the
`RemoteClient` service the subscriptions and Commands run through, and coalesces
its reads and queries. The server side is
[`foldkit-remote-server`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote-server) with sources compiled by
[`foldkit-remote-drizzle`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote-drizzle) or written by hand.

## Reading

`Data.get(selection, id)` and `Data.live(selection, id)` return
`Projection<AppModel, RemoteData<Value>>`, the value typed from the selection.
`Data.live` marks the projection's requirements `live`; the mark survives
`Projection.struct` and never reaches the wire, and `Data.subscriptions`
subscribes what is marked. What a field the Model already holds means is a
`RemotePolicy`, an option of `Data.subscriptions` and `Data.prefetch`:

- `RemotePolicy.cacheFirst` (default) — fetch only missing, stale, or
  re-windowed fields.
- `RemotePolicy.staleWhileRevalidate({ maxAge })` — keep present values
  visible and refetch an entry older than `maxAge` milliseconds.
- `RemotePolicy.networkOnly` — fetch every selected field; cached values stay
  visible meanwhile.

A refreshing policy marks the refetched fields stale first, so the projection
reads `Refreshing` with the old value until the read lands. The clock the policy
reads is the `now` option (default `Date.now`), so tests inject time.

`Data.prefetch(model, projection, options?)` runs the same plan through
`RemoteClient` (the projection's pending queries first, then one read) and
returns the Model with the results reduced in, for SSR, route or hover
prefetch, and tests. It never runs during render.

```ts
import { Effect } from 'effect'

const loaded = await Effect.runPromise(
  Data.prefetch(model, ProjectPage.projection({ projectId }), {
    policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }),
  }).pipe(Effect.provide(clientLayer)),
)
```

## Queries and pages

```ts
const projects = Data.query(ProjectsByOwner, { ownerId }, { select: ProjectSummary, first: 25 })
projects.read(model) // RemoteData<Page<{ id; name; status; owner: { name } }>>
Data.next(model, projects) // QueryRef | undefined, from the loaded end
Data.previous(model, projects) // …from the loaded start
Data.fetch(ref) // Command yielding the ConnectionMerged (or QueryFailed) that reduces it
```

`select` is a selection of the query's entity (another entity is an error
naming both); the window is `first`/`after` or `last`/`before`, never a mix,
a page size is a non-negative integer (anything else is an error at the call,
and refused by the wire), and no window asks for the server's default page. The projection is `Initial`
until the page and every item's selected fields are present — never a partial
page — `Ready` once they are, `Refreshing` while the connection or any item is
being refetched, and `Failed` if an item does not decode. An optimistic insert
into a page should therefore carry every field the page selects, or the page
reads `Initial` until the read entry fetches the rest.

The projection carries its connection, so a Surface that reads a page needs
nothing more: the read entry runs the query when the Model does not hold the
connection (or holds it stale), and once the page is in the Model its items
are planned and read like any other field. A failed query yields
`QueryFailed`, which ends the refresh and keeps the pages.
`Data.next` and `Data.previous` keep the page size and are `undefined` at a
terminal or unknown boundary; the merged pages read through the same
projection, with `hasNext`/`hasPrevious` derived from the boundaries, never
from row counts. Two projections of one connection plan one query, selecting
the union of their fields.

## Mutations

```ts
import { ConnectionChange } from 'foldkit-remote'

const { model: started, requestId, tempId, command } = Data.mutate(model, AddComment, input, {
  optimistic: ({ tempId }) => [
    Comment.patch(tempId, { id: tempId, body: input.body }),
    ConnectionChange.prepend(CommentsForPost.ref({ postId }), Comment.ref(tempId)),
  ],
})
return { model: started, commands: [command] }
```

`Data.mutate` accepts only the domain's mutations and the mutation's own
`Input`. It applies `MutationStarted` (with the optimistic operations) to the
Model and returns the Command whose Message (`MutationSucceeded` or
`MutationFailed`) settles it through `Data.reduce`; the Command never fails.
The request id is `<domain>-<n>` from the Model's mutation sequence; `{
requestId }` overrides it for a retry or a durable bridge, and `optimistic` may
be a function of `{ requestId, tempId }` so a created entity carries `tempId`
until the result names the real one.

A mutation owns its optimistic operations: entity patches (`Project.patch(id,
values)`) and connection changes (`ConnectionChange.prepend`/`append`/`remove`,
by `QueryRef` or identity), applied together when it starts and released
together when it settles. Patches are ordered layers over the base store, not
inverse patches, so overlapping layers rebase for free; connection changes are
overlays outside the server-known region. `MutationSucceeded` writes the
server's patches and puts the result's confirmed `connections` where the
request's overlays were, so a temporary edge becomes the real one without a
flicker; `MutationFailed` releases both, revealing the base. Settling is
idempotent per `requestId`, so a transport retry cannot apply the same change
twice.

A Remote mutation is an immediate, server-derived command: it runs now, against
the server that owns the data, and its result is cache. It is not durable
intent. An edit that must survive the process or the network belongs to
`foldkit-sync` and `foldkit-durable`, which own an ordered log and its
idempotency; Remote adds no second queue.

## Live data

`Data.live` subscribes the Surfaces that read it to the entity's changes, from
the cursor the Model keeps (`RemoteModel.live`), so the application tracks no
cursor of its own. Events carry a monotonic cursor per stream: duplicates are
ignored, and an event ahead of the cursor is a gap — it is not applied, and the
stream is recorded in `RemoteModel.gaps` so the host can resync rather than
silently miss facts. The gap clears when an in-order event applies, or on a
`GapCleared` message. `EntityPatched` updates the store, `EntityDeleted` writes
a tombstone, and `ConnectionInsert`/`ConnectionRemove`/`ConnectionInvalidate`
change connection membership and ordering. A stream break arrives as a
`ReadFailed` Message like any other failure.

## Persistence and hydration

A snapshot is the entity store and nothing else: connections' live cursors,
optimistic layers, the mutation ledger, gaps, and retention roots belong to the
session and never appear in one.

```ts
import { emptyStore, RemotePersistence } from 'foldkit-remote'

// SSR: the server prefetches, dehydrates into the page, the client hydrates.
const snapshot = RemotePersistence.dehydrate(Data.storeOf(loaded), { scope: userId })
Data.reduce(model, {
  _tag: 'Hydrated',
  entities: RemotePersistence.hydrate(snapshot, { scope: userId }) ?? emptyStore,
  merge: 'preserve-existing',
})

// A browser cache, through Effect's KeyValueStore:
RemotePersistence.save(store, { key: 'remote-cache', scope: userId, maxBytes: 512_000 })
RemotePersistence.restore({ key: 'remote-cache', scope: userId, maxBytes: 512_000 })
```

`dehydrate` and `hydrate` are the string forms; `save` and `restore` put them
behind `KeyValueStore`, so the backend (memory, filesystem, Web Storage, SQL) is
the application's choice. The text is deterministic (equal stores give
byte-equal snapshots), a `scope` (a user, a tenant, a build) keeps one reader's
cache from another, and `maxBytes` bounds what is written and read. The cache is
server-derived and disposable: a snapshot that is oversized, another version,
another scope, or malformed is discarded (and its key removed) and the planner
refetches. `Hydrated` is a Message like every other cache change; `replace`
takes the snapshot's entries and `preserve-existing` keeps entries the store
already holds, which are at least as fresh. Hydrating the same snapshot twice is
the same as once.

## Introspection

`Data.inspect(model)` returns a serializable summary of the cache — entities
with their present/stale fields, connection keys, live streams, gaps, and the
mutation ledger — and `Remote.inspectEntity(remote, key)` returns one entity of
the store slice. Both are pure, so DevTools never reach into the private layout.
`Data.plan(model, projection)` is the plan the read entry would run, and
`Remote.planQueries` the queries; both are plain data.

## Advanced: the kernel

Everything above compiles to the exports below; nothing is a parallel
implementation. Reach for them in tooling, SSR, tests, a package that builds on
Remote, or an application that needs one piece by hand.

### Descriptors and binding

`Remote.define({ entities, queries, mutations })` is the domain without a
place in a Model: `Model`, `initial`, `Message`, `update`, `rpc`, and a
name-keyed `registry` of the declared descriptors (consumed by
`RemoteServer.validate`). `Remote.at(definition, modelRef)` binds it to a
`ModelRef`; `Remote.make` is the two in one step. `Selection.make(Entity,
{…})`, `Selection.connection(Entity, window, nested?)`, and
`Entity.patch(ref, values)` are the kernel constructors behind the entity's
`select` and `patch` methods. `Remote.select(bound, selection)(id)` is
`Data.get`.

### Requirements and the planner

A projection carries its requirements as Remote's own metadata, read with
`requirementsOf(projection)`: plain data — entity, id, fields, a pagination
window per relation, and through `relations`, the slice required of each
relation's target — beside the query connections it reads,
`connectionsOf(projection)` (`{ identity, window, select }`). They are attached
with `RemoteRequirements.of` and `RemoteConnections.of`. `Remote.plan(bound, model, projection,
options?)` diffs them against the visible store and returns only the missing
or stale fields, deterministically: a relation whose field is being fetched
rides on the request so the server resolves the graph in one read, a relation
the store already holds is followed into concrete requirements for its
targets, and a known connection contributes its visible items' fields under
`select`. `Remote.planQueries` is the connections it does not hold, or holds
stale. `options` is a `PlanOptions`: `freshness` (`{ now, freshness }`)
refreshes an entry older than the window, `force` plans every field;
`RemotePolicy.toPlan(policy, now)` compiles a policy to it. `Remote.storeOf` is
the visible store — the base under the pending optimistic layers, computed once
per Model state so every read and plan of one render shares it; a read's
result is memoized per that store (and, for a page, per connection), so equal
reads of one Model state assemble and decode once and return one value — and
`Remote.prefetch(bound, model, projection, options?)` runs the entity plan and
returns the new store.

### The reducer and its Messages

`updateRemote(remote, message)` — `Data.update` on a bound domain, `Data.reduce`
on the application Model — is the one pure reducer over
`ReadReceived`/`ReadFailed`/`RefreshStarted`,
`MutationStarted`/`Succeeded`/`Failed`, `LiveReceived`/`GapCleared`,
`ConnectionMerged`/`Invalidated`/`Refreshed`/`QueryFailed`,
`RetentionChanged`, and `Hydrated`. `Remote.messages` is the case record for
`defineMessageUnion`, `Remote.reduces(message)` narrows an application's union
to those cases, and `Remote.writeRead(store, requests, result, now)` is the
store write a `ReadReceived` performs, for a caller that manages its own store.

### The Subscription entries

`Data.subscriptions` is built from three kernel entries, each for one Surface
with fixed params and a `toMessage` that wraps the `RemoteMessage` in an
application union that does not spread `Remote.messages`:

```text
Remote.observe(bound, surface, params, toMessage?, options?)  plan + read + queries
Remote.live(bound, surface, params, toMessage?, options?)     the live stream, from the Model's cursor
Remote.retain(projections, toMessage?, { connections?, grace? })  roots → RetentionChanged
```

The read entry's dependencies are the plan (`{ requirements, queries }`); it
emits nothing when both are empty, `RefreshStarted` before a refreshing read,
and runs the entity read and the queries concurrently. Every Message it emits
changes the Model, so Foldkit recomputes the dependencies and restarts the
stream: a merged page's items are planned by that next computation, and a
read the restart interrupts is joined by the coalescer rather than repeated.
A page and its refresh are one `ConnectionMerged` (`refreshes: true`), since a
second Message could be lost to the restart. The retain entry's dependencies
are the roots (the projections' requirements, their connections with what
each page selects of its items, plus any `connections` listed by identity); it
emits `RetentionChanged` once the roots have been stable for `grace`, and
the reducer applies the pure `gc(state, roots)`: a root entity, the targets
its retained fields refer to, the targets a nested relation selects, a retained
connection's edges and what its `select` reaches through them, and anything a
pending request touches survive; everything else is dropped, settled overlays
on a dropped connection included.

### Connections by hand

A connection stores entity references in segments with explicit boundaries,
so an unloaded middle page is a gap rather than an implied adjacency; pages,
live inserts, and optimistic inserts are all evidence about the same structure
and merge through the reducer. A `QueryRef` is a server list operation with a
canonical identity (the descriptor plus the encoded input, excluding the
window), so `first(25)` and `after(cursor).first(25)` merge into one
connection.

```ts
// Inside an `Effect.gen`, with `RemoteClient` provided.
const ref = Query.first(25)(ProjectsByOwner.ref({ ownerId }))
const page = yield* Remote.query(ref) // Effect<QueryResult, RemoteQueryError, RemoteClient>
updateRemote(remote, Remote.queryMessage(ref, page)) // ConnectionMerged
Remote.visibleItems(remote, ref) // edges a view shows: overlays placed, removals and tombstones hidden
```

`items`, `hasNext`, `hasPrevious`, and `isGapped` read the server-known region.
A merged page is newer than the settled overlays it covers: it drops a live
insert it carries and a live removal it contradicts, and leaves a pending
request's overlays alone; a replayed live event is a duplicate by cursor and
changes nothing. `ConnectionInvalidated` marks a connection stale while it
keeps showing its items; a `ConnectionMerged` with `refreshes: true`,
`ConnectionRefreshed`, or `QueryFailed` clears it.

### Mutations by hand

`Remote.mutateInto(bound, model, mutation, input, requestId, { optimistic })` is
the one-step imperative form (start, run, settle) for SSR and tests.
`Remote.mutate(mutation, input, requestId)` is the call itself: it decodes the
typed `Output` and returns the result's normalized `entities` and confirmed
`connections`, for a caller that reduces them through `updateRemote`. A
`MutationSucceeded` reconciles at most once per `requestId`; an unknown or
already-applied result is a no-op.

### The transport seam

`RemoteClient` is an Effect service with `read`, `query`, `mutate`, and
`live`; the wire schemas (`ReadBatch`, `QueryRequest`, `MutationRequest`,
`LiveRequirement`, their results and errors) and the `RemoteRpc` group are
exported. `Remote.clientLayer(rpcClient, { window? })` adapts an Effect RPC
client, including the `LiveChange`-to-`LiveEvent` mapping; what the client
requires (a database under in-process `RemoteServer.handlers`) is supplied to
the layer with `Layer.provide`. Reads and queries through it coalesce:
requirements issued together become one `ReadBatch` (ids batched, fields
unioned), a requirement or an identical query already in flight is joined, a
failed read releases it, and a requirement that pages a relation reads alone
because a page answers exactly one window. `Remote.coalesced(layer, options)`
wraps a hand-written client the same way; `window` widens the batching delay
beyond "issued concurrently".

## What it owns

- **Entity identity and references.** `Entity.make`, typed `EntityRef`s, and
  reference codecs; an entity's `select` and `patch` methods (and `Entity.patch`)
  type a selection or a patch against its fields.
- **Field selections.** `Selection.make` derives a Struct from the picked fields
  and rejects unknown ones; a nested selection reads through a relation, and
  the requirement carries the graph so one read resolves it.
- **The normalized store.** Values, per-field presence, staleness, and tombstones
  are tracked separately, so `undefined`, `null`, absent, stale, and not-found
  are distinct. Presence is never inferred from `value === undefined`.
- **The requirement planner.** `Remote.plan` diffs requirements against the
  visible store and returns only missing or stale fields, deterministically.
- **The Remote submodel and the bound domain.** `Remote.Model`/`initial` are
  the submodel; `Remote.define` returns `Message`, `update`, `rpc`, and a
  name-keyed `registry`; `Remote.make` binds it and adds `get`, `live`,
  `query`, `next`, `previous`, `fetch`, `subscriptions`, `plan`, `storeOf`,
  `prefetch`, `mutate`, `reduce`, and `inspect`, each rejecting a descriptor
  the domain never declared at compile time (a branded error naming it) and at
  runtime. `updateRemote` is the single reducer over reads, mutation results,
  live events, connections, and optimistic layers.
- **Mutation reconciliation.** Idempotent per `requestId`, with a bounded
  settled-request ledger.
- **Connections.** Segmented ordered data with explicit boundaries and overlay
  placement.
- **Queries.** `Data.query` reads a connection as a page of selected items and
  carries the connection for the planner; `Data.next`/`previous`/`fetch` page
  it. `Remote.query(ref)` encodes and runs a `QueryRef` by hand and
  `Remote.queryMessage(ref, page)` merges the result into the connection keyed
  by `ref.identity`.
- **Live classification.** Per-stream cursor ordering, duplicate suppression, and
  gap detection; a gap clears when an in-order event applies or a `GapCleared`
  message arrives.
- **Introspection.** `Remote.inspect` and `Remote.inspectEntity` return a pure,
  serializable cache view for DevTools.
- **The transport seam.** `RemoteClient`, an Effect service with `read`, `query`,
  `mutate`, and `live`; the wire schemas and `RemoteRpc` group.
  `Remote.clientLayer(rpcClient)` adapts an Effect RPC client for `RemoteRpc` to
  `RemoteClient`, including the `LiveChange`-to-`LiveEvent` mapping; what the
  client requires (a database under in-process `RemoteServer.handlers`) is
  supplied to the layer with `Layer.provide`.
- **Disposable cache persistence.** Deterministic, scoped, size-bounded
  snapshots of the entity store: `dehydrate`/`hydrate` as text, `save`/`restore`
  over `KeyValueStore`, and `Hydrated` to merge one into the Model.

## Limits

- The transport is not part of the package. Effect RPC is the wire; the
  application supplies the client and server protocol layers. `ReadBatch` and
  `LiveRequirement` name `REMOTE_PROTOCOL_VERSION`; a server refuses another
  version with `RemoteProtocolError`, so a wire change is a version bump, never
  silent drift. A request names at most `MAX_FIELDS_PER_REQUEST` (256) fields
  of one entity and nests relations at most `MAX_RELATION_DEPTH` (8) deep; the
  wire refuses more at decode rather than truncating.
- The wire `LiveChange` union carries entity patches, deletes, and connection
  insert/remove/invalidate changes; the client adapter reconstructs a `LiveEvent`
  from it. `RemoteServer.live` serves them as a stream.
- Coalescing is per `RemoteClient` layer: two Remote domains with separate
  layers do not share a batch. Retention keeps what the active Surfaces reach
  (and what `Remote.retain` lists); a Surface that is neither active nor listed
  loses its data on the next `RetentionChanged`.
- Two applications with the same Model type cannot be told apart by the types;
  `Data.subscriptions` rejects a Surface of another application at runtime by
  its owner token.
- A refreshing policy's `maxAge` applies to entities, which the store stamps
  with a clock; a connection has no age, so a page is re-queried only when the
  connection is invalidated (`ConnectionInvalidated`, a live
  `ConnectionInvalidate`, or `networkOnly`'s `force`).
- `RemoteData` is a closed union.
- A selection picks at least one field: `Selection.make(User, {})` throws,
  since it would require nothing and read `Ready` for any id.

## See also

- [Server-derived state](https://github.com/doeixd/foldkit-plus/blob/main/docs/remote.md) — the mental model, and
  when to reach for something else.
- [`foldkit-remote-server`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote-server) — the server half; [`foldkit-remote-drizzle`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote-drizzle) compiles its
  selections and queries to SQL.
- [`examples/remote`](https://github.com/doeixd/foldkit-plus/tree/main/examples/remote) — a worked plan, prefetch, render, mutate, retain trace;
  [`examples/kitchen-sink`](https://github.com/doeixd/foldkit-plus/tree/main/examples/kitchen-sink) runs the same path over the real server packages.
