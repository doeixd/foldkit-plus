# `foldkit-remote`

Server-owned data, cached **inside the Foldkit Model**.

A feature declares the server facts it needs. `foldkit-remote` compares those
requirements with what the Model already knows, fetches only what is missing or
stale, normalizes the result so every consumer shares one copy, and returns new
facts to the application as ordinary Messages.

The central rule is:

> **A Remote Projection does not fetch. It declares what server-owned facts a
> consumer requires. I/O happens outside render, and its results reduce back into
> the Model.**

There is no hidden mutable cache beside the application. A read result, query
page, mutation result, live event, hydration, and retention change all become
Remote Messages and move the same Model through one pure reducer.

Use Remote when the **server owns the truth** and the client needs a normalized,
disposable view of it. If an edit is client-authored and must survive offline,
restart, or network failure until it converges, that belongs to
[`foldkit-sync`](../sync) and [`foldkit-durable`](../durable), not Remote.

## Which state belongs here?

A useful rule across Foldkit Plus is **one owner per datum**:

| State | Owner |
| --- | --- |
| Route, selected item, local form state, transient UI errors | the application Model and `update` |
| Server-derived facts that can be refetched | `foldkit-remote` |
| Client-authored state that must survive offline and converge | `foldkit-sync` |
| Local state represented in the URL or another store | the Model, observed by `foldkit-mirror` |

The distinction between Remote and Sync is especially important:

```text
Remote
  server owns the fact
  cache is disposable
  refetch is recovery

Sync
  client owns the edit
  intent must survive offline/restart
  replay + reconciliation is recovery
```

A Remote mutation is therefore an immediate request against server-owned data.
Its result updates the cache. It is **not** a durable local intent queue.

A Surface may project all of these owners at once. Observation does not transfer
ownership.

## The mental model

The client side is a Foldkit Submodel:

```text
                         pure
                    Projection read
                         |
                         v
+-------------+     +---------+      +------+
| Foldkit     |---->| Surface |----->| View |
| Model       |     +---------+      +------+
|             |
| Remote.Model|
| normalized  |
| cache       |
+------+------+ 
       ^
       | Remote Message
       |
+------+-------+
| Data.reduce |
+------+-------+
       ^
       |
       | read/query/mutate/live
       |
+------+--------+
| RemoteClient |
+------+--------+
       |
       v
     server
```

The other half of the model is the **requirement planner**:

```text
Surface says:
  "I need Project p1: id, name, owner.name"

                    |
                    v
Remote compares that requirement
with the normalized cache in Model

                    |
                    v
missing:
  Project:p1.name
  User:u7.name

                    |
                    v
active subscription performs one read

                    |
                    v
result -> Remote Message -> Data.reduce -> Model
```

That separation is why reading stays pure. Rendering a Surface never starts a
request.

## Four pieces to remember

Most application code only needs four roles:

| Piece | Responsibility |
| --- | --- |
| `Data.get` / `Data.live` / `Data.query` | create pure Projections that declare what a consumer needs |
| `Data.subscriptions` | turn the requirements of **active** Surfaces into reads, live subscriptions, and retention roots |
| `Data.reduce` | reduce returned Remote Messages into the application's `Remote.Model` |
| `RemoteClient` | perform the actual read/query/mutate/live I/O |

Everything else builds on those four pieces.

## Install

```bash
pnpm add foldkit-remote
```

`foldkit` and `effect` are peer dependencies; `foldkit-surface` comes with the
package. The server-side interpreter is [`foldkit-remote-server`](../remote-server).

## Sixty seconds: one entity, one Surface

Start with one server entity and one selection:

```ts
import { Schema } from 'effect'
import { Entity } from 'foldkit-remote'

const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
  }),
)

// A Selection is the exact server-owned shape this consumer needs.
const ProjectSummary = Project.select({
  id: true,
  name: true,
})
```

Embed Remote's Submodel in the application and bind the domain to that field:

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
  ...Remote.messages,
})
type Message = typeof Message.Type

function update(
  model: Model,
  message: Message,
): Update.Return<Model, Message, RemoteClient> {
  // Remote owns the `remote` Submodel, so all Remote Messages go through its reducer.
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  return { model }
}

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
  model: App.fields.remote,
  entities: [Project],
})
```

`Remote.Model` is not a second application store. It is a Submodel **inside** the
application Model. `Data` is the bound API for this domain: it knows where that
Submodel lives and which descriptors this application registered.

Now declare what a feature needs:

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
If those fields are absent, the Projection still does not fetch them.

The active Surface drives I/O through a Foldkit Subscription:

```ts
import * as Subscription from 'foldkit/subscription'

const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() =>
  Data.subscriptions({
    project: Surface.at(ProjectPage, model =>
      model.route._tag === 'project'
        ? { projectId: model.route.projectId }
        : undefined,
    ),
  }),
)
```

`Surface.at` makes activation a fact of the Model. When the route activates the
page, Remote sees its requirements, diffs them against the cache, and fetches
only what is missing. When the page is inactive, it creates no read work.

The complete loop is:

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

Finally, provide the client implementation to the runtime:

```ts
const clientLayer = Remote.clientLayer(rpcClient)
```

`Remote.clientLayer` adapts an Effect RPC client for `RemoteRpc` into the
`RemoteClient` service used by subscriptions and Commands. The transport itself
is not owned by Remote.

## One list per application with `Data.wiring`

The integration steps above — spread `Remote.messages`, reduce by tag, derive
`Data.subscriptions`, provide the client — are one value when the application
uses `foldkit-bundle`:

```ts
import { Bundle } from 'foldkit-bundle'

const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(
  Data.wiring({
    project: Surface.at(ProjectPage, model =>
      model.route._tag === 'project' ? { projectId: model.route.projectId } : undefined,
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
```

The states are:

- **`Initial`** — required data is absent and **nothing is currently fetching it**.
- **`Loading`** — required data is absent and a read is in flight.
- **`Ready`** — every selected field is present and decodes.
- **`Refreshing`** — the current value remains visible while it is being refetched.
- **`Failed`** — stored server data does not decode against the Selection.
- **`NotFound`** — the entity is represented by a tombstone: a live event
  deleted it, or the server was asked for it by id and answered without it. That
  id is then known absent, whether it never existed, is gone, or is not this
  principal's to see. It is not planned again until `Data.refresh` forces it or a
  write brings it back. The target of a returned ref is not marked this way: a
  server need not expand a relation that rides on a request, and the planner asks
  for such a target by id next, which is when its absence is learned.

`Initial` is intentionally different from `Loading`. A Projection belonging to
no active Surface may remain `Initial` forever. Rendering a spinner for
`Initial` can therefore hide an activation/wiring mistake; `Loading` is the
state that actually means "wait for this request."

`RemoteData.match` is exhaustive, so adding or omitting a state is visible at
compile time.

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

The `data` branch is told which it got:

| `freshness` | What it means |
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
- `RemotePolicy.staleWhileRevalidate({ maxAge })` — keep a present value visible
  and refetch when it is older than `maxAge`.
- `RemotePolicy.networkOnly` — request every selected field; cached values stay
  visible while the request is in flight.

A refreshing policy emits `RefreshStarted` before the read, so the Projection
becomes `Refreshing` without discarding the old value. Planning accepts `now`
(default `Date.now`) as an input, so tests can control time.

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

### Refreshing from `update`

### Showing a change nobody has made

A mutation's `optimistic` operations show over the store while it is in flight.
`Data.overlay` shows operations the same way with no request behind them, until
`Data.lift`: a preview, in every Selection and view, of something not yet sent.

```ts
const previewed = Data.overlay(model, 'post-preview', [Project.patch(id, { name: draft })])
const back = Data.lift(previewed, 'post-preview')
```

- Both are called from `update`, and neither performs I/O or touches what the
  server said: the store beneath is as it was.
- Showing an id again replaces what it showed. Lifting what was never shown
  returns the same Model.
- An overlay's id is apart from every request's, so a mutation that settles does
  not take a preview with it.

To revalidate what a screen already declares — a refresh button, a focus
regained — hand its Projection (or a Surface without params) to `Data.refresh`:

```ts
case 'ClickedRefresh': {
  if (model.route._tag !== 'project') return { model }
  const page = ProjectPage.projection({ projectId: model.route.projectId })
  return { model: Data.refresh(model, page) }
}
```

`Data.refresh` performs no I/O and restates no request. It returns the Model
with every selected field the store holds reading `Refreshing`, every entity it
knew to be absent forgotten, so `NotFound` reads `Loading` and is asked for
again, and every loaded connection invalidated; the `Data.subscriptions` read entries then refetch it,
since stale data is planned again under every policy, so the page is requested
once. The Projection must be observed, as it is while it is on screen; for data
nothing observes, use `Data.prefetch` with `RemotePolicy.networkOnly`.

- A refreshed connection's first page replaces its loaded pages, so items the
  server removed or reordered follow it; later pages are fetched again with
  `Data.next`.
- A read already in flight restarts instead of landing after the refresh.
- Refreshing what is already refreshing, or nothing, returns the same Model.

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
  model: App.fields.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
})
```

Then a query is still just a Projection:

```ts
const projects = Data.query(
  ProjectsByOwner,
  { ownerId },
  { select: ProjectSummary, first: 25 },
)

projects.read(model)
// RemoteData<Page<ProjectSummary>>

Data.next(model, projects)      // QueryRef | undefined
Data.previous(model, projects)  // QueryRef | undefined
Data.fetch(ref)                 // Command whose Message merges the page
```

The connection stores entity references and explicit boundaries rather than one
flat array. That matters when page 1 and page 3 are loaded but page 2 is not:
Remote represents an honest gap instead of pretending the visible rows are
adjacent.

A query Projection is `Initial` until the page **and every selected field of its
visible items** are present. Once a page lands, those items become ordinary
entity requirements and can be fulfilled in the same planning loop.

Two Projections of the same connection plan one query and select the union of
their required fields. `Data.next` / `Data.previous` preserve the page size and
use the loaded boundaries; `hasNext` / `hasPrevious` come from those boundaries,
not from guessing based on row counts.

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

```ts
case 'ClickedRename': {
  const { id, name } = message

  const { model: started, command } = Data.mutate(
    model,
    RenameProject,
    { id, name },
    {
      optimistic: [Project.patch(id, { name })],
    },
  )

  return { model: started, commands: [command] }
}
```

`Data.mutate` does two things:

1. it applies `MutationStarted` to the Model, including any optimistic overlays;
2. it returns the Command that calls `RemoteClient` and eventually emits
   `MutationSucceeded` or `MutationFailed`.

Those settlement Messages go through `Data.reduce` like every other Remote fact.
The request id comes from the Remote Model's sequence, so `update` stays pure.
Settling is idempotent per `requestId`.

A mutation that deletes says so. The server's outcome carries
`deleted: [{ entity, id }]`, and settling it tombstones those entities: they read
`NotFound`, and they leave every connection and relation they were in, so the
server names no list. Patches apply first, so an entity named both ways is
deleted; a retry of the same request deletes nothing again.

`Data.mutation(model, requestId)` reads what became of it from the Model:
`Pending`, `Applied`, `Failed` with the error the server or transport gave, or
`Unknown` for an id never started here (or settled so long ago it left the
bounded ledger). A retry reuses its id, and the latest outcome wins.

Optimistic entity patches are **layers over the base store**, not inverse
patches. If multiple mutations overlap, the visible cache is recomputed as base
plus the still-pending layers, so settling one does not require trying to undo
its old value manually.

Connections can be optimistic too:

```ts
import { ConnectionChange } from 'foldkit-remote'

const { model: started, command } = Data.mutate(model, AddComment, input, {
  optimistic: ({ tempId }) => [
    Comment.patch(tempId, { id: tempId, body: input.body }),
    ConnectionChange.prepend(
      CommentsForPost.ref({ postId }),
      Comment.ref(tempId),
    ),
  ],
})
```

A successful server result can replace the request's temporary connection
overlays with confirmed ones in place.

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
  predicate: (project, request) => project.name === request.name,
})
```

There is deliberately no `Data.visible`: a projection already is the visible
read, and a second name for it would be a wrapper that only forwards.

Sync draws the same line over its replica, with the same words and a different
mechanism: see [what a reader sees while a change is in
flight](../../docs/state-model.md#what-a-reader-sees-while-a-change-is-in-flight).

### Remote mutation vs Sync operation

Do not use Remote mutation as a durable offline-write mechanism:

```text
Remote mutation
  request server now
  server owns truth
  result updates disposable cache
  no durable outbox

Sync operation
  client authored the durable fact/intent
  survives offline/restart
  enters an ordered log
  converges with other replicas
```

If losing an unsent edit would be data loss, it belongs to Sync rather than
Remote.

## Live data

`Data.live` marks a Projection so active `Data.subscriptions` follow server
changes for it.

The Remote Model owns each stream's cursor. Live events carry monotonically
ordered cursors:

- an old/repeated cursor is a duplicate and is ignored;
- the next cursor is applied;
- a cursor ahead of the expected value is a **gap** and is not applied.

A gap is recorded in `RemoteModel.gaps` so the host can resynchronize rather than
silently accepting missing history. An in-order event or `GapCleared` clears it.

Entity patches update normalized fields, deletes create tombstones, and
connection insert/remove/invalidate events reconcile the same connection model
used by query pages and optimistic overlays. A stream failure becomes a Remote
failure Message rather than mutating anything out of band.

## Retention and garbage collection

Remote is a cache, so it should be allowed to forget facts no active feature
needs.

`Data.subscriptions` derives retention roots from the active Surfaces. A root
keeps:

- the entities and fields its Projection requires;
- referenced targets reached by nested selections;
- retained connections and the selected fields of their visible items;
- data touched by pending optimistic work.

After the configured grace period, `RetentionChanged` enters the Model and the
pure Remote reducer collects unreachable cache data. An inactive Surface that is
not otherwise retained may therefore lose its cache, which is safe because the
server remains authoritative and the planner can refetch it.

This is another important difference from Sync: **Remote recovery may discard
and refetch; Sync recovery must preserve unsent client intent.**

## Persistence and hydration

Persist only the disposable entity cache, not session machinery such as live
cursors, optimistic layers, mutation bookkeeping, gaps, or retention roots.

```ts
import { emptyStore, RemotePersistence } from 'foldkit-remote'

// SSR: prefetch on the server, embed, then hydrate on the client.
const snapshot = RemotePersistence.dehydrate(
  Data.storeOf(loaded),
  { scope: userId },
)

Data.reduce(model, {
  _tag: 'Hydrated',
  entities:
    RemotePersistence.hydrate(snapshot, { scope: userId }) ?? emptyStore,
  merge: 'preserve-existing',
})

// Or persist through Effect's KeyValueStore.
RemotePersistence.save(store, {
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

## Introspection

Remote exposes its decisions as data rather than requiring DevTools to reach
into private state:

```ts
Data.inspect(model)            // serializable cache/domain summary
Data.plan(model, projection)   // the entity plan a read would execute
Remote.planQueries(...)        // missing/stale query work
Remote.inspectEntity(...)      // one normalized entity
```

These are pure and useful in tests, tooling, and debugging. A particularly
useful question is: **"Why is this Projection still Initial?"** `Data.plan`
shows whether Remote believes anything is actually missing; active Surface
wiring determines whether that plan is being executed.

`Data.inspect(model).loading` answers the other one — **"what is Remote doing
right now?"** — with the `entity\0id\0field` marks of the reads in flight,
beside `mutations.pending` for the writes. Both are read from the Model, not
from the fibers doing the work: a tool that shows them shows something a
recorded Model can be replayed to, and nothing that needs the runtime to be
asked. That is deliberate. Runtime activity is not a second source of truth
here, and a view that rendered from it would stop being reproducible from the
Model.

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
`Remote.make` combines definition and binding in one step.

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
memoized per visible store (and connection where applicable), so equal reads of
one Model state assemble/decode once and return one value.

`Remote.prefetch(bound, model, projection, options?)` runs the same plans
imperatively and reduces their results into a new Model.

### The reducer and its Messages

`updateRemote(remote, message)` is the pure reducer over Remote facts;
`Data.update` applies it to a bound Remote state and `Data.reduce` applies it to
the application Model.

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

The observe entry's dependencies are the current plan and the Model's refresh
generation (`{ requirements, queries, refresh }`), so `Data.refresh` restarts
it. If entity requirements and queries are both empty, it performs no I/O. A
refreshing read emits `RefreshStarted` first, then a result Message.

Every emitted Message changes the Model, so Foldkit recomputes Subscription
dependencies. For example, after a query page lands, the next computation sees
the page's entity ids and plans any selected fields those entities still lack.
An interrupted identical read is joined by the client coalescer instead of
needlessly restarted.

Retention uses the Projection requirements/connections as roots and eventually
emits `RetentionChanged`; the reducer's pure `gc` keeps everything reachable
from those roots plus pending work and collects the rest.

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
Remote.visibleItems(remote, ref)
```

`items`, `hasNext`, `hasPrevious`, and `isGapped` describe the known region.
`ConnectionInvalidated` keeps visible rows but marks the connection stale until
a refresh/query result settles it. A `ConnectionMerged` page with
`refreshes: true` replaces a stale connection's pages rather than merging into
them.

### Mutations by hand

`Remote.mutateInto(bound, model, mutation, input, requestId, { optimistic })` is
the one-step imperative start/run/settle form for SSR and tests.

`Remote.mutate(mutation, input, requestId)` is the transport call itself. It
decodes the typed `Output` and returns normalized entity patches and confirmed
connection changes for a caller to reduce through `updateRemote`.

`MutationSucceeded` reconciles at most once per `requestId`; an unknown or
already-applied settlement is a no-op.

### The transport seam

`RemoteClient` is an Effect service with `read`, `query`, `mutate`, and `live`.
The wire schemas (`ReadBatch`, `QueryRequest`, `MutationRequest`,
`LiveRequirement`, results/errors) and the `RemoteRpc` group are exported.

`Remote.clientLayer(rpcClient, { window? })` adapts an Effect RPC client,
including live-change mapping. Compatible reads and queries coalesce:
requirements issued together become one `ReadBatch`, an identical in-flight
requirement/query is joined, and a failed request releases the coalesced entry.
A relation request with its own pagination window stays separate because one
response answers one window exactly.

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
- live cursors, duplicate suppression, and gap detection;
- retention/garbage collection of disposable cache data;
- deterministic, scoped cache snapshots;
- the `RemoteClient` semantic transport seam and `RemoteRpc` schemas;
- pure introspection of the cache and plans.

Remote does **not** own:

- your source database or authoritative server records;
- local UI/application state outside `Remote.Model`;
- durable offline client intent or replica convergence;
- HTTP/WebSocket deployment details;
- authentication; server-side authorization belongs at the Source boundary;
- a background scheduler or general-purpose database/query engine.

## How state changes here

Local application state uses `evo` inside `update`, like anywhere else.
Remote Messages go through `Data.reduce` into the embedded `Remote.Model`
submodel — Remote owns that reducer, and it is the only writer of the
cache. Never install cache state with a ref `set`; the requirements,
staleness, and tombstones only stay coherent when every fact arrives as a
Remote Message.

## Limits

- Effect RPC is the wire contract; the application supplies deployment layers.
  `ReadBatch` and `LiveRequirement` carry `REMOTE_PROTOCOL_VERSION`, and a
  mismatched version fails with `RemoteProtocolError` rather than silently
  drifting.
- One request may name at most `MAX_FIELDS_PER_REQUEST` (256) fields of one
  entity and nest relations at most `MAX_RELATION_DEPTH` (8) levels; the wire
  rejects larger inputs.
- The wire `LiveChange` union carries entity patches/deletes and connection
  insert/remove/invalidate changes; `RemoteServer.live` serves them as a stream.
- Coalescing is scoped to one `RemoteClient` layer. Separate layers do not share
  batches.
- Retention keeps what active Surfaces (and explicit retain entries) reach. An
  inactive/unretained Surface may lose its cache on `RetentionChanged`.
- Two applications with the same Model type are not distinguishable by TypeScript
  alone; `Data.subscriptions` also checks the Surface owner token at runtime.
- `staleWhileRevalidate({ maxAge })` ages entity data. Connections have no age;
  they re-query when invalidated or when `networkOnly` forces them.
- `RemoteData` is a closed union.
- A Selection must choose at least one field; an empty Selection would require
  nothing and misleadingly read `Ready` for every id, so it is rejected.

## See also

- [Server-derived state](../../docs/remote.md) — the deeper architectural guide
  and ownership model.
- [`foldkit-remote-server`](../remote-server) — server Sources, resolution, and
  semantic-field authorization.
- [`foldkit-remote-drizzle`](../remote-drizzle) — optional compilation of Remote
  selections/queries into Drizzle access.
- [`examples/remote`](../../examples/remote) — an asserted trace through plan,
  prefetch, refresh, query, render, mutation, retention, and decode failure.
- [`examples/kitchen-sink`](../../examples/kitchen-sink) — the same architecture
  using the real server packages.