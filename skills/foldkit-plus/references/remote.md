# Remote: server-owned data cached in the Model

`foldkit-remote` keeps a **normalized, disposable cache of server-owned facts
inside the Foldkit Model**. Features declare which entity fields they need;
active Surfaces turn those needs into reads; results come back as ordinary
Messages reduced by one pure reducer. There is no hidden cache next to the app.

> A Remote Projection does not fetch. It declares requirements. I/O happens in
> Subscriptions/Commands, and results reduce back into the Model.

## When to use it

| State | Owner |
| --- | --- |
| Route, selection, form drafts, transient UI errors | app Model + `update` |
| Server-owned facts that can be refetched | `foldkit-remote` |
| Client-authored edits that must survive offline/restart and converge | `foldkit-sync` (+ `foldkit-durable`) |
| Local state reflected in the URL or a preference store | app Model, observed by `foldkit-mirror` |

Remote recovery is "discard and refetch". If losing an unsent edit is data loss,
it is not Remote. A Remote mutation is an immediate server request, **not** an
offline outbox. Also not for local-only state or single-endpoint request caching.

Packages:
- `foldkit-remote` (client): entities, normalized store, `Remote.Model` + reducer, queries, optimistic overlays, live cursors, `RemoteClient`.
- `foldkit-remote-server`: interprets requirements against your Sources with field authorization and a live hub; not transport, auth, or a DB.
- `foldkit-remote-drizzle` (provisional): compiles selections and queries into Drizzle SELECTs; needs a `DrizzleDatabase` you provide.

## Mental model

```text
Entity.define + Entity.select  what a fact looks like / what a consumer needs
Data.get / live / query         pure Projection; requirements ride in Projection metadata
Data.subscriptions({...})       per active Surface: `<key>.read`, `<key>.live`, plus one `retain`
RemoteClient (Effect service)   read / query / mutate / live I/O
Remote Messages                 ReadStarted, ReadReceived, ConnectionMerged, MutationSucceeded, ...
Data.reduce(model, message)     the only way the cache changes
```

The read entry diffs requirements against the store and fetches only missing or
stale fields. An inactive Surface creates no work. `RemoteData` is a closed union
(`RemoteData.match` is exhaustive):

- `Initial`: absent, **nothing is fetching it** (often a wiring bug: not observed).
  `Data.why(model, projection, { surfaces })` says which: `NotObserved` (no active
  Surface reads it) or `NotFetching` (one does; Subscriptions not installed).
- `Loading`: absent, a read or a list's query is in flight (`QueryStarted`).
- `Ready`: all selected fields present and decode.
- `Refreshing`: old value still visible while refetching.
- `Failed`: stored data does not decode against the Selection, or the read or
  query behind it failed (keeping the old value as `previous`, if any).
- `NotFound`: tombstone (server said the entity is absent).

## Minimal client

```ts
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Entity, Relation } from 'foldkit-entity'
import { Remote, RemoteClient, RemoteData, type RemoteRpcClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

// Declare the domain with `foldkit-entity`. Only its entities have addressable
// `fields`, which relations, derived members, and query bodies point at.
const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
// A relation is stored as a ref, never a nested copy.
const { User, Project } = Entity.relate(
  { User: UserBase, Project: ProjectBase },
  { Project: { owner: Relation.one(UserBase) } },
)
const ProjectSummary = Entity.select(Project, {
  id: true,
  name: true,
  owner: Entity.select(User, { id: true, name: true }),
})

const Model = Schema.Struct({ projectId: Schema.NullOr(Schema.String), remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
type Message = typeof Message.Type

// Annotate update's return type: Data is bound to App, App is built from update.
function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  return { model }
}

const App = Surface.application({ Model, Message, initial: { projectId: null, remote: Remote.initial }, update })

const Data = Remote.make({ model: App.model.remote, entities: [User, Project] })

const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.get(ProjectSummary, params.projectId) }), // no I/O
})

const label = (data: RemoteData<{ readonly name: string }>) =>
  RemoteData.match(data, {
    Initial: () => 'not requested', Loading: () => 'loading',
    Ready: p => p.name, Refreshing: p => `${p.name} (refreshing)`,
    Failed: e => `failed: ${e.message}`, NotFound: () => 'gone',
  })

// For a view, the three-way fold that keeps useful data on screen:
// Initial/Loading -> loading; Ready/Refreshing -> data; Failed carrying a
// previous value -> data (freshness `Stale`, with the error); only a Failed
// with nothing to show -> failed. `freshness` is a `Freshness` (exported):
// `Fresh | Refreshing | Stale`, the last carrying the error that left it behind.
const drawn = (data: RemoteData<{ readonly name: string }>) =>
  RemoteData.render(data, {
    loading: () => 'skeleton', notFound: () => 'gone',
    failed: e => `error: ${e.message}`,
    data: (p, freshness) => (freshness._tag === 'Fresh' ? p.name : `${p.name}…`),
  })

const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() =>
  Data.subscriptions({
    // `undefined` params = Surface inactive = no reads.
    page: Surface.at(ProjectPage, m => (m.projectId === null ? undefined : { projectId: m.projectId })),
  }),
)

declare const rpcClient: RemoteRpcClient
const clientLayer = Remote.clientLayer(rpcClient) // provide RemoteClient to the runtime

// One list instead of the four hand-wiring steps above.
const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(
  Data.wiring({
    page: Surface.at(ProjectPage, m => (m.projectId === null ? undefined : { projectId: m.projectId })),
  }),
)
const wiredUpdate = wiring.update(model => ({ model }))
```

`Remote.Model` is a Submodel, not a second store. `Data` is the bound domain API.
Every entity/query/mutation used through `Data` must be registered in
`Remote.make` (unregistered descriptors are type errors). `wiring` is the one
list for this integration: routing, Subscriptions, and the contract derive from
it, and `RemoteClient` joins the assembly's services. One assembly holds at
most one Remote domain.

## Common tasks

Register queries and mutations: `Remote.make({ model, entities, queries: [ProjectsByOwner], mutations: [RenameProject] })`.

```ts
import { Mutation, Query, RemotePolicy } from 'foldkit-remote'

const ProjectsByOwner = Query.make('ProjectsByOwner', { Input: { ownerId: Schema.String }, Result: Project })
const RenameProject = Mutation.make('RenameProject', {
  Input: { id: Schema.String, name: Schema.String }, Output: { id: Schema.String },
})

// Query Projection: RemoteData<Page<Value>>; Loading while its page or its rows' fields are in flight, Ready once all are present.
const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25 })

// Data.live: same as get, but also opens a live stream while the Surface is active.
// model: ({ params }) => ({ project: Data.live(ProjectSummary, params.projectId), projects })

// Policy for fields already cached (default RemotePolicy.cacheFirst), as the second argument:
// Data.subscriptions({ page: Surface.at(...) }, { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }), grace: '5 seconds' })

// In update (Message cases ClickedRename {id,name}, ClickedMore {}, ClickedRefresh {}):
case 'ClickedRename': {
  const { model: started, command } = Data.mutate(model, RenameProject,
    { id: message.id, name: message.name },
    { optimistic: [Remote.patch(Project, message.id, { name: message.name })] })
  return { model: started, commands: [command] } // command yields MutationSucceeded/MutationFailed
}
case 'ClickedMore': {
  const next = Data.next(model, projects) // QueryRef | undefined (also Data.previous)
  return { model, commands: next === undefined ? [] : [Data.fetch(next)] }
}
case 'ClickedRefresh': {
  if (model.projectId === null) return { model }
  // Mark-only, no I/O: fields read Refreshing, a NotFound is forgotten (reads Loading, asked for again),
  // connections invalidated, refresh generation bumped.
  return { model: Data.refresh(model, ProjectPage.projection({ projectId: model.projectId })) }
}
```

- Optimistic patches are **layers** over the base store (recomputed base +
  pending layers), released on settle by `requestId`; settlement is idempotent.
  Optimistic list edits: `optimistic: ({ tempId }) => [Remote.patch(Project, tempId, {...}), ConnectionChange.prepend(projects.ref, Remote.ref(Project, tempId))]`,
  where `projects` is the `Data.query(...)` Projection above.
- `Query.define(name, Input, ({ input }) => body, options?)` declares a query by
  what it *means*: `Query.from(Task).pipe(Query.where(Expr.eq(Task.fields.ownerId,
  input.ownerId)), Query.orderBy(Order.asc(Task.fields.id)))`. Returns an ordinary
  descriptor — same name, `Input`, `ref`, connection identity — carrying `body`
  besides, with the result a connection over the Entity the body reads. The body
  needs a **`foldkit-entity`** Entity (`Entity.define`), since that is what has
  addressable `fields`; this package's `Entity.make` has none to point at.
  `Query.make` stays for queries whose meaning lives on the server, and such a
  descriptor has no `body`. The body is built **once**: `input.x` is a
  placeholder, so never `input.x ? a : b`. `Input` must be fields or a plain
  `Schema.Struct` — a codec exposing no keys throws at declaration rather than
  handing the body an empty object.
- `foldkit-remote-drizzle`: a descriptor with a body needs only
  `query(descriptor, { entity: binding })` — the address column and the order come
  from the body through the binding. Every field the body reads, in a predicate or
  an ordering, is checked at registration — not on the first request. A body order
  that does not end on the id gets it appended, so keyset paging stays stable; a
  literal `orderBy` given here is left exactly as written. The compiled predicates are **conjoined** with the server's own
  `where` and the binding's `visible`, so a body never widens what a principal may
  see; an `orderBy` given there replaces the body's, since a connection pages on
  one order.
- `foldkit-remote-server`: `evaluate(body, input, rows)` runs a query body over
  rows in memory — pure, the reference the compiled interpreters are checked
  against (differential tests run the same body through it and through real
  SQLite). It follows **SQL, not JavaScript**: `null = null` is unknown and
  matches nothing. It throws rather than guess when ordering by a column that is
  null in some row (SQLite sorts nulls first, Postgres last) or comparing values
  it has no order for.
- `foldkit-remote-server` exports the **conformance suite** (`cases`, `rows`,
  `Subject`): what each operator means, as cases to run a new interpreter
  against. Both shipped interpreters run it — in memory, and compiled to SQL
  against a real SQLite. Cases are chosen to make interpreters disagree (case,
  nulls, `%`/`_` as literal text, empty search), because a fixture that cannot
  tell them apart tests nothing.
- `Data.overlay(model, id, operations)` shows optimistic operations with no request
  (a preview) until `Data.lift(model, id)`; same id replaces; both pure, from `update`.
- `Data.confirmed(projection)` is the same projection read over the
  server-derived store alone, with pending layers and connection overlays left
  off; it plans exactly what the projection plans. For a reader that must not
  believe a change until the server agrees — typically
  `Agent.when({ projection: Data.confirmed(...), predicate })`. A view wants the
  projection itself, which is already the visible read; there is no
  `Data.visible`.
- `Data.refresh(model, target)` accepts a Projection or a Surface **without
  params**. It only works if something observes that Projection (an active
  read entry). For unobserved data use `Data.prefetch` with `RemotePolicy.networkOnly`.

Prefetch (SSR, route/hover, tests) and persistence:

```ts
import { Effect } from 'effect'
import { RemotePersistence, emptyStore } from 'foldkit-remote'

const ssr = Effect.gen(function* () {
  // Performs I/O explicitly; returns the Model with results reduced in.
  const loaded = yield* Data.prefetch(App.initial, ProjectPage.projection({ projectId: 'p1' }), {
    policy: RemotePolicy.networkOnly,
  })
  // A snapshot is `{ entities, connections }`. Connections are session state
  // unless named, so this keeps the cache and nothing else.
  const text = RemotePersistence.dehydrate(RemotePersistence.snapshotOf(loaded.remote), {
    scope: 'user-1',
  }) // string
  // client side:
  const restored = RemotePersistence.hydrate(text, { scope: 'user-1' }) ?? emptySnapshot
  return Data.reduce(App.initial, {
    _tag: 'Hydrated',
    entities: restored.entities,
    connections: restored.connections,
    merge: 'preserve-existing', // or 'replace'
  })
}).pipe(Effect.provide(clientLayer))
```

`RemotePersistence.save(snapshot, { key, scope, maxBytes })` /
`restore({ key, scope, maxBytes })` use Effect's `KeyValueStore`. Wrong
version/scope, oversized, or malformed snapshots yield `undefined` from
`hydrate` (`restore` yields `RemotePersistence.emptySnapshot` and removes the key). An oversized
`save` removes the key instead of writing.

**A connection can be declared to survive a reload**:
`snapshotOf(model, { connections: [ref.identity] })`. Nothing survives that is
not named — the default is the disposable, server-derived cache Remote always
had. A declared one keeps its **edges only**: the snapshot has nowhere to put a
cursor, because a cursor names server state that may be gone. It comes back with
`Unknown` boundaries and stale, so the rows show at once and the connection is
refetched — and it claims completeness in neither direction, since `Unknown` is
not `Terminal`. Optimistic layers, live cursors, gaps and the mutation ledger
are still session state and are never in a snapshot.

**Entities declared with `foldkit-entity`.** `Remote.make` registers them and
`Data.get` / `Data.live` / a query's `select` take their Selections as they are;
nothing downstream changes. Relations become ref fields, derived members become
fields the server supplies, and the Entity needs an `id` field. `Entity.from` /
`Selection.from` give the compiled descriptor and Selection when a handler
needs `patch` or `ref`. `Entity.page(selection, window)` in an Entity Selection
compiles to `Selection.connection`. A page of a whole list is read under an alias
(`comments@first=10` in a requirement's `fields`, `windows`, and `relations`), so the
list and a page of it can be read at once; `RemoteServer` resolves it, so upgrade
both packages together. The server refuses a request that pages one relation more than
four ways, and a field's own name may not contain `@`. `Entity.make` + `Entity.ref`
still works alongside.

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

**Deleting.** A server mutation returns `deleted: [{ entity, id }]` in its
outcome. The client tombstones them: `NotFound`, and gone from every connection
and relation, so the server names no list.

**Outcomes in the Model.** `Data.mutation(model, requestId)` is `Pending`,
`Applied`, `Failed` (with its `error`), or `Unknown`, for the id `Data.mutate`
returned. A read the server answers without an id it was asked for makes that
entity `NotFound`; it is refetched only by `Data.refresh` or brought back by a
later write. The unexpanded target of a returned ref is asked for by id next, and
only then can it become `NotFound`.

Debugging: `Data.plan(model, projection)` shows what is missing;
`Data.inspect(model)` is a serializable cache summary, whose `loading` lists
the reads in flight (`entity\0id\0field` marks) beside `mutations.pending` for
the writes — both read from the Model, never from the fibers doing the work.

The conformance fixtures (`Subject`, `cases`, `rows`) are imported from
`foldkit-entity/conformance` directly; `foldkit-remote-server` no longer
re-exports them.

`Data.filtered(model, over, by, input)` filters a **loaded list** by a query
body without asking the server, returning `Matched<Value>` — `items` decoded
through the list's own Selection, plus `complete`. It filters a list rather than
running a query on purpose: "which rows match" would need predicate containment,
which is deliberately not built, while "which rows *of this list* match" is
decidable. `complete` requires every edge judged, every match showable, and the
list terminal at both ends — so empty-and-complete and empty-and-partial stay
different answers. It creates no connection, so nothing new is retained or
fetched.

`Remote.matching` and `Remote.belongsEncoded` are the two entry points, and the
asymmetry is deliberate: `matching` takes the input **decoded** (an application
writes it that way), `belongsEncoded` takes it **encoded** (its caller holds a
connection identity, which carries the encoded input). A decoded `belongs` and
an exported `matchingEncoded` were written first and removed — nothing called
them.

`Remote.matching(store, descriptor, input, { among? })` runs a query body over
the rows the store already holds, returning `{ matched, skipped }` — keys that
satisfy it in the body's order, and keys held but missing a field the body reads
(neither a match nor a non-match; naming them keeps "could not tell" from
becoming "no"). It uses the same reference interpreter the server is checked
against, takes the input **decoded** and encodes it itself (a decoded value
produces an empty answer that no error catches), and answers *which of the rows
I hold match* — never *which rows match*. It applies no `visible` rule and is
not an access decision.

A connection's identity is its query plus its **input**, so an input that changes
per keystroke mints a connection and a request per keystroke. Remote has no
debounce and should not — it is a faithful function of the Model. Debounce
between the input Message and the Model field the query reads, with
`debounce` from `foldkit-primitives/time` placed as a Bundle: its `latest` is
what the box draws, its settled `OutMessage` moves the field the query reads.
Two fields, on purpose. `examples/entity` does this.

A page carrying more edges than its window asked for (`first ?? last`) is
refused: it becomes `QueryFailed` with a protocol error and none of its edges
reach the store, leaving an already-loaded connection untouched. A window with
neither bounds nothing.

A failed read is kept on the Model: `QueryFailed` (including an overrun) per
connection, `ReadFailed` per field. The read reads `Failed`, with the old value
as `previous` if there was one (`render` draws that as data with `Stale`
freshness). A list fails when a row's field failed, and a read through a
relation fails when the target's did. It is **not retried automatically**:
what failed leaves the plan, everything else is still fetched. Retry with
`Data.refresh(model, projection)`, which also works on something that never
loaded. The value arriving (page, read, live patch, mutation result), a live
invalidation or delete, or retention dropping it also clears it.
`Remote.inspect(remote).failures` is `{ connections, fields }`. A live stream
breaking emits `ReadFailed` with its `stream`, which records a gap and fails no
field.

`Data.explain(model, queryProjection)` explains one query read as a single
serializable value: `domain`, `query`, `input`, `identity`, `window`, `select`,
the `body` as readable text with its `dependencies` (absent for a `Query.make`
descriptor, whose meaning lives on the server), and `state` — taken from the
projection's own read, so an explanation and the view cannot disagree. Given
`{ surfaces }` — the same active record `subscriptions` takes — it also reports
every active Surface reading the connection and, for those placed with
`Surface.when`, why each is active. It names no executor: what answers a query
is a `RemoteClient` Layer, not a value in the Model.

## Server: `foldkit-remote-server`

```ts
import { RemoteServer } from 'foldkit-remote-server'

type Principal = { readonly isAdmin: boolean }
declare const loadProjects: (req: { ids: ReadonlyArray<string>; fields: ReadonlyArray<string> }) =>
  Effect.Effect<ReadonlyArray<{ id: string; values: Record<string, unknown> }>>

// Pass the principal type explicitly; it defaults to `unknown`.
const ProjectSource = RemoteServer.entity<Principal>(Project, {
  authorize: (principal, fields) => fields.filter(f => f !== 'owner' || principal.isAdmin), // may only remove
  read: ({ ids, fields }) => loadProjects({ ids, fields }), // only declared + authorized fields arrive
})
const RenameSource = RemoteServer.mutation(RenameProject, ({ input }) =>
  Effect.succeed({
    output: { id: input.id },
    entities: [Remote.patch(Project, input.id, { name: input.name })],
  }))

const Server = RemoteServer.make({ entities: [ProjectSource], mutations: [RenameSource] })
RemoteServer.validate(Remote.define({ entities: [User, Project], mutations: [RenameProject] }), Server)

declare const principal: Principal // authentication happens outside this package
const handlers = RemoteServer.handlers(Server, principal) // once per authenticated principal
const inProcess = Remote.clientLayer(handlers)            // tests/SSR/worker
// No server yet: RemoteServer.memory({ domain: Data, rows: { Project: [...] } }).layer.
// Rows in wire shape (a relation is 'User:u1'); Query.define bodies run over them;
// mutations: store => [...] write through store.write. No live, no authorization.
// across a process boundary: RemoteRpc.toLayer(handlers) + your Effect RPC transport
```

Also: `RemoteServer.query(Q, ({ input, window, principal }) => ...)` returning
`{ edges, start, end }` with `Boundary` values; `RemoteServer.live(Entity, { subscribe })`;
`const hub = yield* RemoteServer.liveHub(entitySources)` then `handlers(Server, principal, { live: hub })`
and, inside a mutation's Effect, `yield* hub.changed(Project.ref(id), ['name'])` / `yield* hub.deleted(ref)`; connection changes
from mutations via `RemoteServer.prepend/append/remove`. `handlers` options:
`maxIdsPerEntity` (default 1000), `maxDepth` (default 8).

On the client, a live row inserted into a connection is decided in this order:
if the query has a body and the row is held with fresh values for every field
the body reads, **membership decides** (a row that does not match is ignored);
otherwise the connection's declared `live` policy decides (`visible`,
`boundary`, `invalidate`, `ignore`; default `visible`). `invalidate` — and a
server's `ConnectionInvalidate` event — mark the *connection in the Model*
stale, exactly as the `ConnectionInvalidated` Message does, so the planner
refetches it and a read of it is `Refreshing`.

## Drizzle: `foldkit-remote-drizzle`

`foldkit-remote-drizzle` pins `drizzle-orm` `1.0.0-rc.4` as a dependency; the
app's `drizzle-orm` must be the same version.

```ts
import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Layer, Schema } from 'effect'
import { Query, Remote } from 'foldkit-remote'
import { databaseLayer, entity, one, query, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'

const users = sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() })
const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), name: text('name').notNull(), ownerId: text('owner_id').notNull(),
})

// The binding IS the Remote EntityDescriptor: use it on the client too (User.select(...)).
const User = entity('User', users) // table must have an `id` column
const Project = entity('Project', projects, { relations: { owner: one(User, { field: projects.ownerId }) } })
const ProjectsByOwner = Query.make('ProjectsByOwner', { Input: { ownerId: Schema.String }, Result: Project })

const Server = RemoteServer.make({
  entities: [source(User), source(Project)], // source(binding, { authorize }) for field policy
  queries: [query(ProjectsByOwner, {
    entity: Project,
    orderBy: [{ column: projects.id, direction: 'desc' }], // keyset pagination; end with a unique column
    where: input => eq(projects.ownerId, input.ownerId),
    // Or `orderBy: input => [...]` to sort by what the input names; the id breaks its ties.
  })],
})
declare const db: Parameters<typeof databaseLayer>[0]
const RemoteClientLive = Remote.clientLayer(RemoteServer.handlers(Server, 'user-1')).pipe(
  Layer.provide(databaseLayer(db)), // handlers require DrizzleDatabase because the Sources do
)
```

Nullable foreign keys must say `one(User, { field, nullable: true })` (a NULL
becomes a present null). `many(...)` + `computed: { count: { relation } }` exist.
No mutation DSL: write mutations with `RemoteServer.mutation`. Page size default
20, max 100; pagination semantics follow Postgres NULL ordering.

**Drizzle over a `foldkit-entity` domain.** `bind` takes an `Entity.relate`
result and says only how each member is stored; target and cardinality come
from the Entity. Each result is an ordinary binding for `source` / `query`, and
two may point at each other, which `entity(…, { relations })` cannot express.

```ts
import { Derived, Entity, Relation } from 'foldkit-entity'
import { bind, source } from 'foldkit-remote-drizzle'

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String })).pipe(
  Entity.derived({ fanCount: Derived.make(Schema.Number) }),
)
const Blog = Entity.relate(
  { User, Post },
  { Post: { author: Relation.one(User), fans: Relation.many(User) }, User: {} },
)

const Db = bind(Blog, {
  User: { table: users },
  Post: {
    table: posts,
    relations: { author: { field: posts.authorId }, fans: { foreignKey: users.id } },
    derived: { fanCount: { relation: 'fans' } },
  },
})

source(Db.Post) // an ordinary binding
```

Storage: field = same-named column or `fields: { name: column }`; `one` =
`{ field }`, or for an optional `one` read from the target's table
`{ foreignKey, localKey?, assumeUnique? }` (the column must be unique); `many` = `{ foreignKey, localKey? }` or `{ through, localColumn,
foreignColumn }`; derived = `{ relation, where? }` (a count). A required `one`
over a nullable column throws: declare it `{ optional: true }`. So does a column
that plainly cannot hold its field (text under a number, a nullable column under
a field that admits no `null`); transforming schemas and custom columns pass
unchecked.

**Rows by principal.** `bind(..., { Post: { table, visible: principal => SQL | undefined } })`
(or `entity(name, table, { visible })`) hides rows from a principal on every path
the table is read: by id (`NotFound`), as a relation's children (list, count,
page), as a `one` ref's target (reads `null`), and through a query. `authorize`
is for fields; `visible` is for rows.

## Gotchas

- A Projection used by no active Surface stays `Initial` forever; do not render
  `Initial` as a spinner. Check `Data.plan` and your `Surface.at` wiring.
- Give `update` an explicit `Update.Return<...>` / `{ model: Model }` return type;
  otherwise `App` and `Data` are mutually inferred and TypeScript errors.
- `Data.refresh` returns the **same Model** when nothing is refreshable or it is
  already refreshing.
- Selections must pick at least one field (`Selection.make` throws otherwise).
- Presence is not `value === undefined`: missing, present-undefined, present-null,
  stale, and not-found are distinct.
- Retention: after the `grace` period, data no active Surface reaches is
  garbage-collected (safe; it refetches).
- `staleWhileRevalidate` ages entities only; connections refetch only when
  invalidated or under `networkOnly`.
- Live cursors: duplicates ignored, an ahead-of-cursor event is a **gap** (not
  applied, recorded in `remote.gaps`); resync rather than ignoring it.
- Coalescing is per `RemoteClient` layer; separate layers do not share batches.
- `RemotePersistence.dehydrate` with `maxBytes` returns `undefined` when too big.
- Wire limits: 256 fields per entity request, relation depth 8; protocol version
  mismatch fails with `RemoteProtocolError`.
- `RemoteServer.handlers` takes an already-authenticated principal; it never reads
  headers/cookies. Query/mutation authorization belongs inside those Sources.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-server/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-drizzle/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/remote.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/remote (asserted client trace)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/kitchen-sink (real server + Drizzle + liveHub)
