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
(`RemoteData.match` is exhaustive; `RemoteData.answered(data)` is whether it has an answer yet):

- `Initial`: absent, **nothing is fetching it** (often a wiring bug: not observed).
  `Data.why(model, projection, { surfaces })` says which: `NotObserved` (no active
  Surface reads it) or `NotFetching` (one does; Subscriptions not installed).
- `Loading`: absent, a read or a list's query is in flight (`QueryStarted`).
- `Ready`: all selected fields present and decode.
- `Refreshing`: old value still visible while refetching.
- `Failed`: stored data does not decode against the Selection, the read or
  query behind it failed (keeping the old value as `previous`, if any), or the
  server settled a selected field without a value (`error._tag` `Unavailable`,
  naming the field; select without it, or `Data.refresh` asks again).
- `NotFound`: tombstone (server answered with nothing about the entity).

## Minimal client

```ts
import { Option, Schema } from 'effect'
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

const Model = Schema.Struct({ projectId: Schema.Option(Schema.String), remote: Remote.Model })
type Model = typeof Model.Type
// Remote's Messages under one variant, the shape a Submodel gets.
const Message = defineMessageUnion({ GotRemoteMessage: { message: Remote.Message } })
type Message = typeof Message.Type

// Annotate update's return type: Data is bound to App, App is built from update.
function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  return Message.match(message, {
    GotRemoteMessage: ({ message }) => foldData(model, message),
  })
}

const App = Surface.application({ Model, Message, initial: { projectId: Option.none(), remote: Remote.initial }, update })

const Data = Remote.make({ model: App.model.remote, entities: [User, Project] })
const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))
// `foldData(model, message)` reduces; `foldData.mutate` and `.subscriptions` yield
// the wrapper with the lift recorded. Shorter, for an update that only reduces:
// spread `...Remote.messages` and `if (Remote.reduces(message)) return { model: Data.reduce(model, message) }`.

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
  foldData.subscriptions({
    // No params (none) = Surface inactive = no reads.
    page: Surface.at(ProjectPage, m => Option.map(m.projectId, projectId => ({ projectId }))),
  }),
)

declare const rpcClient: RemoteRpcClient
const clientLayer = Remote.clientLayer(rpcClient) // provide RemoteClient to the runtime
// rpcClient: what RpcClient.make(RemoteRpc) builds, as it is; a transport failure
// (RpcClientError) becomes the call's Remote error, not a defect
// No Effect RPC on the server: Remote.clientLayer(Remote.http('/remote', { headers }))
// posts JSON; RemoteServer.answer(handlers, body) answers it. Remote.json(send) for a
// worker or a server in the page. Neither carries live data.
// Over a MessagePort (a sandbox's worker): port(open) from 'foldkit-remote/port',
// servePort(handlers, port) from 'foldkit-remote-server/port'; Effect's RPC worker
// protocol, so live data, typed errors and interruption cross it.
// Over fetch (a Worker's fetch): serveFetch({ server, resolvePrincipal, layer,
// liveHeartbeat }) from 'foldkit-remote-server/fetch' answers the POSTs
// Remote.http sends, and a live open with a text/event-stream of changes
// (Remote.httpWithLive). resolvePrincipal is an Effect per request that may
// need what layer(env) provides; failing with RemoteServer.unauthenticated(reason?)
// answers 401 { error, unauthenticated: { reason? } }. revalidate: { every, key? }
// asks again while a live stream is open: a refusal ends it as Unauthenticated. Every stream heartbeats, so an idle one survives. A
// worker cannot wake another request's stream, so a LiveHub fed from a second
// request reaches nobody there: poll the durable store (D1) from inside the
// subscriber's own request instead.
// Plain JSON (Remote.json) carries no live data.

// One list instead of the four hand-wiring steps above.
const Page = Bundle.parent({ Model, Message })
const wiring = Page.assemble(
  Data.wiring({
    page: Surface.at(ProjectPage, m => Option.map(m.projectId, projectId => ({ projectId }))),
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

// Query Projection: RemoteData<Page<Value>>; Loading while its page is in flight; Refreshing with the rows it can assemble while others' fields arrive; Ready once all are present.
const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25 })
// The select travels with the query: the server returns those fields with the page, so a fresh list lands Ready in one response.
// Data.meta(model, projects) is when what is shown was last received ({ updatedAt, stale, loading }), pure for "updated 5s ago".

// Data.live: same as get, but also opens a live stream while the Surface is active.
// model: ({ params }) => ({ project: Data.live(ProjectSummary, params.projectId), projects })

// Policy for fields already cached (default RemotePolicy.cacheFirst), as the second argument:
// Data.subscriptions({ page: Surface.at(...) }, { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }), grace: '5 seconds' })
// A policy covers one call: use one call per policy and spread the records together.
// Retention is the domain's: any call's `retain` entry roots the reads of every call.
// `now` defaults to Date.now read at each use (fake timers move it; pass `now` under TestClock).
// Entry dependencies are typed: ReadDependencies / LiveDependencies / RetentionRoots.
// A read that is not a Surface's, active while its function gives it:
// Data.active('ProjectDetail', m => Option.map(m.openId, id => Data.get(Selection, id)))
// Under staleWhileRevalidate the read entry sleeps (Effect clock) until the earliest held value
// ages out and emits RefreshStarted for it: time reaches Remote only as a Message, and a
// Projection never reads the clock. The deadline is a dependency (`expires`), so a write moves it.
// A mutation's answer dates what it writes too: `MutationSucceeded.now`, from `Data.mutate`'s
// `now` option (default Date.now).

// In update (Message cases ClickedRename {id,name}, ClickedMore {}, ClickedRefresh {}):
case 'ClickedRename': {
  const { model: started, command } = Data.mutate(model, RenameProject,
    { id: message.id, name: message.name },
    { optimistic: [Remote.patch(Project, message.id, { name: message.name })] })
  return { model: started, commands: [command] } // command yields MutationSucceeded/MutationFailed
}
case 'ClickedMore': // grows the read's window by a page; the read entry fetches the rest
  return { model: Option.getOrElse(Data.more(model, projects), () => model) }
// A query read shows at most its window (`first` from the start, `last` from the end),
// whatever else loaded the connection; a wider window fetches only the rows it lacks.
case 'ClickedRefresh': {
  if (Option.isNone(model.projectId)) return { model }
  // Mark-only, no I/O: fields read Refreshing, a NotFound is forgotten (reads Loading, asked for again),
  // connections invalidated, refresh generation bumped.
  return { model: Data.refresh(model, ProjectPage.projection({ projectId: model.projectId.value })) }
}
case 'SignedOut': {
  // Everything Remote knows, it knows for a principal. No I/O: values, tombstones, unavailable
  // fields, connections, live cursors, failures and in-flight reads go; every active read and
  // live entry restarts; a mutation in flight settles into nothing; request ids stay unique.
  return { model: Data.forget(model) }
}
```

- Optimistic patches are **layers** over the base store (recomputed base +
  pending layers), released on settle by `requestId`; settlement is idempotent.
  Optimistic list edits: `optimistic: ({ tempId }) => [Remote.patch(Project, tempId, {...}), ConnectionChange.prepend(projects.ref, Remote.ref(Project, tempId))]`,
  where `projects` is the `Data.query(...)` Projection above. `Remote.patch`
  values are wire-shaped: a relation is its ref key, typed `RefKey<'User'>`
  (`` `User:${string}` ``), so a ref to the wrong entity is a type error.
- An answer carries what the page shows of each row it names: `Data.mutate`
  sends what the active Surfaces read of each entity (`shown`), and the server
  reads those fields after the write, as any read, beside the answer (`read`),
  written in the reduction that releases the layer. No option: a declared
  insert lands with the derived counts, `may` and relations the list reads. A
  handler names a row it changed that the server cannot see with an empty
  patch, `Remote.patch(Post, id, {})`; a row it does not name (a post's count
  after a like is inserted) is not read.
- A row that reads `Loading` for a frame after a mutation settles is a field
  the answer left out: the layer came off and the store lacks it, so it is
  fetched again. `Remote.make({ verifyAnswers: true })` (dev and tests) settles
  as usual and keeps `{ requestId, entity, id, fields }` in
  `remote.answerGaps` (`Data.inspect`) for each field the request's optimistic
  patch wrote, or an active Surface reads of a row it patched or listed, that
  the answer left out and the store does not hold. Name that row in the answer.
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
- `placeIn(remote.entities, connection, body, encodedInput, key)` says where a row falls in
  a loaded list by the body's order: `Before { segment, edge }`, `End { segment }`,
  `Outside` (past a `Cursor` or in a gap), or `Unknown { reason }`. A list whose body is
  placeable (`Query.placement`) also reads its body's fields for it.
- `Data.overlays(model)` is the ids `overlay` shows now, in drawing order, for a
  caller that reconciles overlays against its own state (`foldkit-sync/remote`).
- `Data.overlay(model, id, operations)` shows optimistic operations with no request
  (a preview) until `Data.lift(model, id)`; same id replaces; both pure, from `update`.
  A preview of an unsaved entity that lacks a field its Selection reads is
  `Failed` (`_tag: 'Overlaid'`, naming the fields), not `Initial` forever.
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

Server rendering with `foldkit-ssr` (in development): `Remote.resume(Data)` in
`SSR.plan({ parts })` sends what the plan's active Surfaces read, field by
field, with connection boundaries and live cursors, and nothing else of the
store; the browser plans no request for it. The part also vouches for
Remote's Subscription entries, so a plan with `start: 'idle' |
'on-interaction'` may defer its boot without naming them in `deferrable`. Use
it rather than a `Snapshot`, which is for a cache that survives a reload and
keeps no cursors.

A render that fetches nothing needs everything the page's active Surfaces
read, and one read can decide what another asks for (a page's Blocks once its
document is read). `Data.satisfy` takes the record `Data.wiring` takes and
prefetches, cache-first, pass after pass until nothing is missing; past its
bound (8 passes, `{ passes }`) it fails with `RemoteUnsatisfied`, naming the
Surfaces still reading. A `Surface.each` family is one record entry: its
parent's requirements join its instances', and a still-reading instance is
named `Child[key]`:

```ts
const page = await Effect.runPromise(
  Data.satisfy(App.initial, {
    page: Surface.at(ProjectPage, () => Option.some({ projectId: 'p1' })),
  }).pipe(Effect.provide(clientLayer)),
)
```

In a running app, preload a destination with `Data.preload(model, actives)`
from `update`: the Command reads what `actives` read in the Model you give it
(the live one with the target route) and yields one `Preloaded` Message with
the reads, reduced into the Model as it is when it lands. It never fails; a
failed read leaves the rest for the destination. Use it for hover prefetch,
not `prefetch`/`satisfy`, whose returned Model would overwrite what changed
meanwhile.

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

To keep the cache across reloads, assemble `Data.persistence` beside
`Data.wiring`. It restores under a key and saves on every change, and needs a
`KeyValueStore` (for example `BrowserKeyValueStore.layerLocalStorage`):

```ts
const persistence = Data.persistence({
  key: model => `remote-cache:${model.actor}`,
  scope: model => model.actor,
  // optional: `connections: [ref.identity]`, or `snapshot: remote => ...`
})
```

The restore hydrates with `preserve-existing`, and records the key it came
from in `model.remote.restoredFrom`. Saving waits until that key is
restored, so startup never writes the empty store over the snapshot. Since a
restore keeps what memory holds, a change of principal must be `Data.forget`
in the same `update`, or one person's rows are saved under the next one's key.

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
and relation, so the server names no list. To show it before the answer, put
`Remote.tombstone(Post, id)` in `optimistic` (a `Write.delete` mutation does
it for you): a pending tombstone hides the row the same way, no
`ConnectionChange.remove` per list, and a failure brings it back.

**Lists after a mutation.** Each answered patch's new values (a field equal to
what the client held does not count) are judged against every loaded
list over its Entity by the list's query body (`Query.dependencies`'
`predicate`/`order`, `belongsEncoded`): a list stands when the body proves its
rows and order unchanged. Otherwise a placeable list (`Query.placement`) has
the change placed in its pages with no request: a row that stops matching
leaves, one that joins (by its filter, new to the client, or from past a
`Cursor`) or moves goes where the body's order puts it among the
loaded rows, or out of them when it sorts past a `Cursor` (a row that was
itself the edge beside that `Cursor` cannot be told, and invalidates). What
cannot be placed is invalidated, restarting any read of it in flight, so its read entry
refetches it. A body's primitive operators run on the client by
`Remote.make({ operators })` (`Operators.kernel` by default; a domain bound by hand
takes it as `Remote.at(definition, store, { operators })`), which also predicts a
pending computed assignment; one the table lacks is the server's to judge. `Remote.make({ verifyPlacement: true })` (dev and tests) also
fetches each list it placed an answer, a read or a live patch in, and keeps
any disagreement with the server's first page in
`remote.placementMismatches`: an order it does not share, or a row placing
took out that it still lists (`remote.placed` holds `{ order, dropped }` until
the page arrives). A pending edit (an `optimistic` patch, a
`Data.overlay`) shows its row placed in what a read shows until it settles,
and a read or a live `EntityPatched` places a held row in the pages; neither
brings a row into a list or fetches. A row an insert overlay or a live
`ConnectionInsert` shows is drawn where the body's order puts it, in a list
the client can place; `Data.visibleItems(remote, connection)` gives the edges
as reads draw them (`Remote.visibleItems` is gone). A `Query.make` list (no body) is
invalidated by any change to its Entity, and a list whose body declares no
order (the server's `orderBy` decides it) by any change to a row it holds. `Data.refresh` remains for effects the answer does not name.

**Declared writes.** `Mutation.write(name, Write.update(input, { id }))` (or
`Write.insert` with a client-minted id, or `Write.delete`) is a
mutation whose effect is data: `Data.mutate` derives its optimistic patch
(`Write.bind`), and `options.keys` narrows it to the input keys an author
changed and sends them with the request. A write may ask of its row (`when`, `expect`)
and compute where it commits (`increment`, `compute`); Remote shows an increment as an
amount added to whatever the store holds when it is read, and a computed field worked
out by `Remote.make`'s `operators` over the row as read, so a live update meanwhile is
added to or computed from, not hidden; without the operator it shows the stored value. `Data.mutate` also sends an operation id, kept across a retry with the
same `requestId`, which a ledgered writer answers from its record. Declaring them, and
invariants: [entity.md](entity.md).

**Refusals.** `Mutation.make(name, { Input, Output, Refusal })` declares what
the server may refuse with (`Refusal.field(key, reason)`, `Refusal.conflict`,
or any codec); a `Mutation.write` whose write has a `when` may also be refused
as `Refusal.unmet`, and only then does its `Refusal` type include it; every `Mutation.write` may be refused as
`Refusal.invalid` (`{ rule: Option<string>, message, path }`), when the row it would leave breaks an invariant, and `Refusal.isInvalidBy(refusal, invariant)` matches it against the value `Entity.invariant` returned; a Source fails with `RemoteServer.refuse(mutation, value)`, and
`Data.refusal(model, requestId, mutation)` reads it decoded, as an `Option`.
`RemoteServer.forbid(reason?)` refuses who is asking, for any mutation: a 403
over JSON, and `Data.mutation` is `Failed` with `error._tag === 'Forbidden'` and
`error.reason` when given. `Remote.http` reads a 403 that is not Remote's
answer (middleware) as `Forbidden` too. A 401 (`RemoteServer.unauthenticated`,
or middleware) fails every call kind, reads and live streams included, with
`_tag: 'Unauthenticated'` and `reason` when given: the session is gone; read it
with `RemoteData.denied(error)` (`Option<Denied>`: `Unauthenticated` or `Forbidden`, read with `Denied.match`; not a mutation's `refusal`). Remote
treats it as any failure (a live stream restarts with backoff, refused each
time); the application signs in again and `forget`s.

**Outcomes in the Model.** `Data.mutation(model, requestId)` is `Pending`,
`Applied`, `Failed` (with its `error`), or `Unknown`, for the id `Data.mutate`
returned. A read the server answers with nothing about an id it was asked for
makes that entity `NotFound`; it is refetched only by `Data.refresh` or brought
back by a later write. A field the server answers without, and names in the
result's `settled` (withheld by `authorize`, or absent from the Source's
record), is recorded **unavailable**: not planned again, forgotten by
`Data.refresh`, cleared by a write of the field; the entity's other fields stay.
The server settles without reading the Source when every field is withheld, so
a hidden id and an absent one answer alike. The unexpanded target of a returned ref is asked for by id next, and
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
different answers; an input every interpreter refuses (text holding NUL) is
empty and incomplete, never a throw. It creates no connection, so nothing new is retained or
fetched.

Local execution is not a second authority: `matching` and `filtered` conclude
from held facts (this row matches) and never claim the whole dataset (the list
is these rows) unless the connection is terminal at both ends (`complete`).

`matching` and `belongsEncoded` (both exported by `foldkit-remote`) are the two entry points, and the
asymmetry is deliberate: `matching` takes the input **decoded** (an application
writes it that way), `belongsEncoded` takes it **encoded** (its caller holds a
connection identity, which carries the encoded input). A decoded `belongs` and
an exported `matchingEncoded` were written first and removed — nothing called
them.

`matching(store, descriptor, input, { among?, operators? })` runs a query body, its primitive operators by `operators` (the kernel's when not given; `Remote.make`'s on a domain's own paths), over
the rows the store already holds, returning `{ matched, skipped }` — keys that
satisfy it in the body's order, and keys held but missing a field the body reads
or holding a value no interpreter answers for, such as text with a NUL (neither a
match nor a non-match; naming them keeps "could not tell" from becoming "no").
Each row is judged alone, so one such row never voids the others. It uses the same reference interpreter the server is checked
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
field. The live entry restarts a broken stream itself: after Sync's backoff
(50 ms doubling to 5 s, ±20% jitter; `retryBase`/`maxRetryDelay` in the
subscriptions options) it resubscribes from its cursor and refetches what the
stream covers, since no server replays missed events.
`Data.liveStatus(model, active)` is `Idle | Live | Reconnecting { attempt, error }`
for a view.

`Data.explain(model, queryProjection)` explains one query read as a single
serializable value: `domain`, `query`, `input`, `identity`, `window`, `select`,
the `body` as readable text with its `dependencies` (each field `{ entity, key }`,
without the owner identity `Query.dependencies` carries; absent for a
`Query.make` descriptor, whose meaning lives on the server), and `state` — taken from the
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
// Over JSON: RemoteServer.answer(handlers, parsedBody) -> { status: 200 | 400 | 500, body }.
// The body is { operation: 'read' | 'query' | 'mutate', payload }; test a server over HTTP
// with the real client, Remote.http(`${origin}/remote`, { headers, fetch }).
// It decodes the request by the protocol's schemas first; a defect answers 'Internal error',
// its cause logged (answer's third argument, onDefect; serveFetch's onError(cause, request)).
// No server yet: RemoteServer.memory({ domain: Data, rows: { Project: [...] } }).layer.
// Rows in wire shape (a relation is 'User:u1'); Query.define bodies run over them;
// mutations: store => [...] write through store.write. No live.
// authorize: { Project: (principal: Principal, fields) => ... } plus principal: the layer's.
// filter: { Project: (principal, fields) => Effect<{ fields, apply }> } decides per record;
// readable: principal => Effect<(entity, row) => boolean> hides rows from reads, queries and refs.
// entities: [MeSource] serves an entity no row backs (not in the rows' domain) beside the rows.
// No principal: no layer, only .server, answered per request through serveFetch or handlers.
// across a process boundary: RemoteRpc.toLayer(handlers) + your Effect RPC transport
```

Also: `RemoteServer.query(Q, ({ input, window, principal }) => ...)` returning
`{ edges, start, end }` with `Boundary` values; `RemoteServer.live(Entity, { subscribe })`;
`const hub = yield* RemoteServer.liveHub(entitySources)` then `handlers(Server, principal, { live: hub })`
and every mutation's answered patches and deletions are then published to the hub by the handlers (a Source's `shared: ['name']`, fields every principal reads alike, lets a declared write's value of one go out with no re-read per principal); call `yield* hub.changed(Project.ref(id), ['name'])` / `yield* hub.deleted(ref)` only for writes that are not mutations (each re-reads per subscriber: a row the read no longer finds is sent as deleted, one still there as a patch) — and only from a process that can wake the subscriber's fiber: a worker request cannot wake another's stream, so on a Worker poll the store from inside the subscription instead. Connection changes
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

`foldkit-remote-drizzle` pins `drizzle-orm` `1.0.0-rc.5` as a dependency; the
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

// A declared write needs no handler: RemoteServer.write(EditProject, writer(Db.Project)),
// with Db = bind({ Project }, { Project: { table } }); it writes only the keys named, and an
// `expect`ed revision guards the row and moves on in the same statement (else a conflict).
// An insert retried answers the row it made, comparing all it writes but a stamp (a guard's
// `stamps`, which EntityWriter.insert's `stamped` names); a delete of a row already gone succeeds;
// a guarded write retried after it landed answers its row (EntityWriter.delete says
// 'deleted' | 'absent' | 'moved'). A binding with `visible` reads the answer back
// through it (EntityWriter.read): a row the write hid from its writer answers in `deleted`.
const Server = RemoteServer.make({
  entities: [source(User), source(Project)], // source(binding, { authorize }) for field policy
  queries: [query(ProjectsByOwner, {
    entity: Project,
    orderBy: [{ key: projects.id, direction: 'desc' }], // keyset pagination; end with a unique column
    where: input => eq(projects.ownerId, input.ownerId),
    // Or `orderBy: input => [...]` to sort by what the input names; the id breaks its ties.
    // A Query.define body declares its own order (Order.chosen for a picked sort), and
    // then refuses an orderBy here.
  })],
})
declare const db: Parameters<typeof databaseLayer>[0]
const RemoteClientLive = Remote.clientLayer(RemoteServer.handlers(Server, 'user-1')).pipe(
  Layer.provide(databaseLayer(db)), // handlers require DrizzleDatabase because the Sources do
)
// In a mutation handler: `const writes = yield* drizzleWrites` (insert/update/delete typed by
// the table), run each with `yield* runStatement(() => writes.update(…)…, 'Database write
// failed')` (a refusal fails as a RemoteServerError; the driver's error, with its SQL, is
// logged, never sent), then name each row it wrote in `entities` (`yield* returning.row(Project,
// id)`, its stored values, or `Remote.patch(Project, id, {})`): the answer carries what the
// page shows of each row it names, and only those.
```

Nullable foreign keys must say `one(User, { field, nullable: true })` (a NULL
becomes a present null). `many(...)` + `computed: { count: { relation } }` exist.
A mutation declared as a `Write` needs no handler (`writer`, below); write any
other with `RemoteServer.mutation`. Page size default
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

**Rows by principal.** `bind(..., { Post: { table, visible: (principal, self) => SQL | undefined | Effect<SQL | undefined> } })`
(or `entity(name, table, { visible })`) hides rows from a principal on every path
the table is read: by id (`NotFound`), as a relation's children (list, count,
page), as a `one` ref's target (reads `null`), and through a query. `authorize`
is for fields; `visible` is for rows. Rules declared once for every seam, rows,
members, writes and the client's `may`, are `foldkit-guard`'s (see guard.md):
`GuardDrizzle.visible` compiles them into `visible`, `GuardServer.filter` into a
Source's `filter`.

**Primitive operators.** `bind(entities, storage, { operators: { memory, sql } })`
(or `entity(name, table, { operators })`) gives every binding the tables its
bodies' primitive operators run by, each its kernel (`Text.startsWith`) when not
given: `sql` from `DrizzleOperators.make(DrizzleOperators.implement(op, ({ args,
dialect, collate }) => …))`, whose function returns Drizzle `SQL` (`merge`,
`override`, `kernel`), `memory` from `Operators`. A literal or input argument taken as a number or boolean is cast on
Postgres (`cast($1 as integer)` while the value fits one, `bigint` past 32 bits); SQLite takes none, and binds a boolean as 1 or 0. A query, an invariant or a
write's `when` calling one either table lacks is refused where it is registered
or the writer built; `GuardDrizzle.visible(Policy, entities, { operators })`
checks Read rules against the SQL table it is given. A body ordered by a call
compiles it as an expression under its collation and pages by its value, the
same in SQLite and Postgres; index the expression if it must be fast. An order
term `query({ orderBy })` takes is `{ key, direction, nulls?, collation? }`,
`key` a column or a Drizzle `SQL` expression (which says its own collation).

**What `writer(binding)` guarantees.** One `update … where … returning` per update:
the id, an `expect`ed revision, the write's `when` and every invariant of the Entity
(set fields read as their new values, an increment as `column + amount`) are in the
same `WHERE`, so all of them hold of the row the statement changes. When nothing was
written, the row read back says why, in this order: gone, `Conflict`, `Unmet`, `Invalid`.
A row already holding what the write sets answers as written (the retry of one that
landed), unless it increments. An insert's values are judged before it is written, by its state invariants
only. Retries, by kind of write:

| Write | A retry after a lost answer |
| --- | --- |
| sets values | written again; answered as written |
| `expect`s a revision | `Conflict`; the client re-reads |
| increments, under `writer(binding, { ledger: { table, scope } })` | found in the ledger by its operation id, not written again |

An increment with neither an `expect` nor a ledger is refused, and so is one of a real number without
`expect` even under a ledger (unless the writer `pins`, as a guard with a revision does). A computed
assignment (`compute`) is its compiled computation in the same `set`; without `expect` it needs a ledger
and a writer that `pins` the row it read, or an operator the writer `commutes`: `op(field, amount)` with
commutativity and associativity tested over every value in both of the binding's tables (`Operators.withEvidence`, `DrizzleOperators.withEvidence`). The ledger
needs a transaction, which D1 lacks.
An increment of a column that holds integers needs a `Schema.Int` amount, whatever the field is
declared as: the writer refuses it through `EntityWriter.refuses`, which `RemoteServer.write` asks
where the write is served (`GuardServer.writer` passes it on). Each `Write` increment says whether
its amount is an integer (`WriteIncrement.integer`).
Migrate `invariantChecks(binding)` (each state invariant as `check ((…) is true)`) and,
for a guarded writer's `revision` pin, `revisionTrigger(binding, 'revision')`, so a
handler's write and raw SQL are held to the invariants and move the revision too.

## Gotchas

- A Projection used by no active Surface stays `Initial` forever; do not render
  `Initial` as a spinner. Check `Data.plan` and your `Surface.at` wiring.
- Give `update` an explicit `Update.Return<...>` / `{ model: Model }` return type;
  otherwise `App` and `Data` are mutually inferred and TypeScript errors.
- `Data.refresh`, `Data.lift`, and `Data.reduce` of the common no-op Messages
  (a duplicate live event, a repeated `ReadStarted`) return the **same Model**,
  so Foldkit does not render.
- A row's decoded value keeps its identity while its entity's fields are equal,
  so key list rows and render them with a lazy view.
- Selections must pick at least one field (`Selection.make` throws otherwise).
- Presence is not `value === undefined`: missing, present-undefined, present-null,
  stale, and not-found are distinct.
- Retention: after the `grace` period, data no active Surface reaches is
  garbage-collected (safe; it refetches), except what the Surfaces most
  recently left reached (`departedLimit`: 16 lists, 256 reads). A list held
  that way is stale, so going back reads `Refreshing` and refetches it.
- `staleWhileRevalidate` ages entities only; connections refetch only when
  invalidated, left and gone back to, or under `networkOnly`.
- Live cursors: duplicates ignored, an ahead-of-cursor event is a **gap** (not
  applied, recorded in `remote.gaps`). It restarts the stream; only the
  restart clears it, not a later in-order event.
- Coalescing is per `RemoteClient` layer; separate layers do not share batches.
- `RemotePersistence.dehydrate` with `maxBytes` returns `undefined` when too big.
- Wire limits: 256 fields per entity request, relation depth 8; protocol version
  mismatch fails with `RemoteProtocolError`.
- `RemoteServer.handlers` takes an already-authenticated principal; it never reads
  headers/cookies. Pass a Context key instead of a value and each call reads it, so
  one handler set serves every request: `handlers(Server, CurrentUser)`, then
  `Effect.provideService(CurrentUser, user)` per request. `liveHub(sources, { key })`
  shares a re-read between subscribers whose principals have one key (default: the
  same value). Query/mutation authorization belongs inside those Sources, or, for
  rules declared on the domain, in `foldkit-guard/server` (`GuardServer.writer`,
  `GuardServer.mutation`, `GuardServer.validate` at startup); see guard.md.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-server/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-drizzle/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/docs/remote.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/remote (asserted client trace)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/kitchen-sink (real server + Drizzle + liveHub)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/cloudflare (one worker: Remote over D1, Sync through a DO, polling live inside the subscriber's request; the Pages site subscribes to that stream — Entity, Form, Crud, optimistic Remote mutations)
