# `foldkit-remote-server`

The server-side interpreter for [`foldkit-remote`](../remote).

A Remote client sends **semantic requirements** — entity ids, selected fields,
query windows, mutations, and live requirements. `foldkit-remote-server` turns
those requirements into calls to application-owned **Sources**, enforces
field-level read authorization while the field names are still known, and
normalizes the results back into the patches the client cache understands.

The central pipeline is:

```text
Remote requirement
      |
      v
RemoteServer handlers
      |
      +-- validate protocol / input
      +-- filter fields by Entity + principal
      +-- group and de-duplicate reads
      |
      v
application Source
      |
      v
normalized Remote result
      |
      v
Remote client -> Message -> Data.reduce -> Model
```

A Source is deliberately small: it says how your application reads one Entity,
runs one Query or Mutation, or produces one live stream. The package does **not**
own HTTP, WebSockets, authentication, or a database connection. Authentication
resolves a `principal` outside this package; database/API clients remain Effect
requirements of the Sources that use them.

Use this package when the server is yours and you want the selections declared
by `foldkit-remote` to survive all the way to the data boundary instead of
turning back into hand-written per-screen endpoints.

## What this package owns

```text
client owns
  which server facts are required

foldkit-remote-server owns
  requirement interpretation
  field authorization
  read grouping / de-duplication
  nested selection traversal
  normalized wire results

application Sources own
  how those facts are actually loaded or changed

Effect RPC / application owns
  transport + serialization + authentication
```

That separation matters. `RemoteServer` can decide that a client may read
`Project.name` but not `Project.privateNotes`; only your Source knows whether
that field comes from Postgres, another service, an in-memory index, or
something else.

## Install

```bash
pnpm add foldkit-remote-server
```

`effect` is a peer dependency; `foldkit-remote` comes with the package.
[`foldkit-remote-drizzle`](../remote-drizzle) is an optional Source compiler for
Drizzle-backed entities and queries.

## Sixty seconds: answer one Entity read

Start with the same Entity the client selects:

```ts
import { Schema } from 'effect'
import { Entity, Remote, RemoteRpc } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    privateNotes: Schema.String,
  }),
)
```

Give that Entity one Source:

```ts
// Your authentication's principal type; without it `principal` is `unknown`.
type Principal = { readonly isAdmin: boolean }

const ProjectSource = RemoteServer.entity<Principal>(Project, {
  // Authentication already resolved `principal` before RemoteServer sees it.
  // Return only fields this caller may read.
  authorize: (principal, fields) =>
    fields.filter(field => field !== 'privateNotes' || principal.isAdmin),

  // Your application owns this function. Read exactly the ids/fields requested.
  read: ({ ids, fields, principal }) =>
    loadProjects({ ids, fields, principal }),
})

const Server = RemoteServer.make({
  entities: [ProjectSource],
})
```

Compile that definition into the Remote RPC handlers for one authenticated
principal:

```ts
const handlers = RemoteServer.handlers(Server, principal)
const layer = RemoteRpc.toLayer(handlers)
```

That is the core package. A client requirement such as:

```text
Project:p1 [id, name, privateNotes]
```

runs as:

```text
1. Project declares:       id, name, privateNotes
2. authorize returns:      id, name
3. Source receives:        ids=[p1], fields=[id,name]
4. Source returns:         { id: 'p1', values: { id: 'p1', name: 'Apollo' } }
5. handler normalizes:     Project:p1 { id, name }
6. client records presence only for the returned fields
```

`privateNotes` never reaches `read`. Authorization happens before application
data access, while the request still has semantic field names.

## The read lifecycle

An Entity read is more than a direct function call because a Remote selection
may contain several ids and nested relations. The handler performs the mechanical
work once so Sources do not have to:

```text
client requirements
      |
      v
group by Entity
      |
      v
union requested fields
      |
      v
filter declared + authorized fields
      |
      v
batch / de-duplicate ids
      |
      v
Entity Source.read(...)
      |
      v
follow selected relation refs
      |
      v
next Entity Source
      |
      v
normalized patches
```

A Source therefore receives the useful boundary directly:

```text
RemoteServer.entity(entity, {
  read: ({ ids, fields, windows?, principal }) => Effect<
    ReadonlyArray<{ id: string; values: Record<string, unknown> }>,
    RemoteServerError,
    R
  >,

  authorize?: (principal, fields) => readonly string[]
})
```

Important consequences:

- a field the Entity does not declare never reaches `authorize` or `read`;
- `authorize` can only remove requested fields, never add new ones;
- a Source may return a partial entity — omitted fields remain absent on the
  client and may be requested later;
- ids shared by several selections are de-duplicated;
- relation targets are fetched level by level and shared targets are not loaded
  repeatedly;
- a relation the principal may not read is never followed.

The Source should still avoid reading or returning columns the request did not
ask for. The handler filters returned values again, but the data boundary is the
best place to preserve least privilege and avoid wasted work.

## Nested selections

Suppose the client projects:

```text
Project:p1 {
  id
  name
  owner { id name }
}
```

and the Project Source returns an owner ref:

```text
Project:p1.owner = User:u7
```

The handler follows that ref through the `User` Source on the next level:

```text
Project requirement
      |
      v
Project Source
      |
      | owner = User:u7
      v
User requirement
      |
      v
User Source
```

The Sources do not recursively call each other. `RemoteServer` owns traversal,
depth limits, batching, and de-duplication; each Source still answers only for
its own Entity.

## Queries

A Query Source answers the ordered connection itself. Entity fields for the page
items remain normal Entity reads, so query membership and entity data stay
separate:

```ts
import { Query } from 'foldkit-remote'

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: Schema.Struct({ ownerId: Schema.String }),
  Result: Query.connection(Project),
})

const ProjectsByOwnerSource = RemoteServer.query(
  ProjectsByOwner,
  ({ input, window, principal }) =>
    projectsPage({ ownerId: input.ownerId, window, principal }),
)

const Server = RemoteServer.make({
  entities: [ProjectSource],
  queries: [ProjectsByOwnerSource],
})
```

A Query returns:

```ts
{
  edges,
  start,
  end,
}
```

`start` and `end` are Remote `Boundary` values (`Terminal`, `Cursor`, or
`Unknown`). The client uses those explicit boundaries when merging pages instead
of guessing from row count.

Query input is decoded through the Query's own Schema before your callback runs.
The callback receives the decoded input, the requested `QueryWindow`, and the
principal.

## Mutations

A Mutation Source changes server-owned state. It returns the protocol output
plus any normalized entity/connection changes that should settle the client's
cache immediately:

```ts
import { Effect } from 'effect'
import { Mutation } from 'foldkit-remote'

const RenameProject = Mutation.make('RenameProject', {
  Input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  Output: Schema.Struct({ id: Schema.String }),
})

const RenameProjectSource = RemoteServer.mutation(
  RenameProject,
  ({ input, principal }) =>
    renameProject(input, principal).pipe(
      Effect.map(output => ({
        output,
        entities: [
          Entity.patch(Project.ref(input.id), { name: input.name }),
        ],
      })),
    ),
)
```

The input is decoded before the Source runs and the output is encoded before it
crosses the wire. A Source may additionally return connection changes:

```ts
RemoteServer.prepend(connection, Project.ref(id))
RemoteServer.append(connection, Project.ref(id))
RemoteServer.remove(connection, Project.ref(id))
```

Those confirmed changes replace the corresponding optimistic connection layers
on the client.

Remote mutations are immediate requests against **server-owned** state. They are
not a durable offline intent log; client-authored edits that must survive offline
belong to `foldkit-sync`.

## Live data

There are two ways to produce live changes.

### Write a live Source directly

```ts
const ProjectLive = RemoteServer.live(Project, {
  subscribe: ({ requirements, after, principal }) =>
    projectEvents({
      requirements,
      after,
      principal,
    }),
})
```

`after` is the client's resume cursor. Events at or before it are duplicates.
The stream carries Remote `LiveChange`s: entity patches/deletes and connection
insert/remove/invalidate events.

If an Entity has no live Source, it contributes no stream. That is not an error:
the client planner can fall back to refetching it.

### Let a `liveHub` re-read changed fields

When your infrastructure can say **what changed** but does not naturally produce
Remote patches, use a hub:

```ts
const entitySources = [ProjectSource]
const hub = yield* RemoteServer.liveHub(entitySources)

const handlers = RemoteServer.handlers(Server, principal, {
  live: hub,
})

// From a mutation Source, database trigger consumer, etc.
yield* hub.changed(Project.ref(projectId), ['status', 'updatedAt'])
yield* hub.deleted(Project.ref(projectId))
```

The hub remembers each subscriber's requirements and principal. `changed`:

1. intersects the changed fields with what each subscriber selected;
2. re-reads only that intersection through the Entity Source;
3. applies that subscriber's authorization again;
4. emits the resulting patch with a continuing cursor.

Subscribers that selected none of the changed fields do no work.

A hand-written live Source and a hub number their events independently. Use one
or the other for a given subscription path rather than mixing cursor domains.

## Authentication vs authorization

Keep these boundaries separate:

```text
authentication
  "Who is making this request?"
  Effect RPC middleware / application
             |
             v
          Principal
             |
             v
authorization
  "Which semantic fields may this principal read?"
  RemoteServer.entity(... authorize ...)
```

`RemoteServer.handlers(Server, principal)` deliberately receives a resolved
principal. It does not inspect headers, sessions, cookies, or bearer tokens.

For Entity reads:

- undeclared fields are dropped first;
- `authorize` receives only declared, requested fields;
- omitting `authorize` means the requested declared fields are readable;
- returning no fields produces no entity contribution;
- existence is not leaked merely because an unauthorized id was requested.

Mutation and Query policy belongs in their Sources because those operations are
application-specific rather than field-selection policy.

## Compose and validate the server

A complete server definition is just the collection of Sources:

```ts
const Server = RemoteServer.make({
  entities: [ProjectSource, UserSource],
  queries: [ProjectsByOwnerSource],
  mutations: [RenameProjectSource],
  live: [ProjectLive],
})
```

When the client and server share the Remote domain declaration, validate the
Source names at startup:

```ts
const Data = Remote.define({
  entities: [Project, User],
  queries: [ProjectsByOwner],
  mutations: [RenameProject],
})

RemoteServer.validate(Data, Server)
```

That catches an Entity, Query, or Mutation Source whose name is not declared by
the shared domain instead of letting it silently answer nothing at runtime.

Then compile once per authenticated principal:

```ts
const handlers = RemoteServer.handlers(Server, principal, {
  maxIdsPerEntity: 1000,
  maxDepth: 8,
  live: hub,
})
```

`handlers` implements the `RemoteRpc` client shape directly. In-process — tests,
SSR, a worker, or a single service — it can become a `RemoteClient` with:

```ts
const clientLayer = Remote.clientLayer(handlers)
```

Across a process boundary, use:

```ts
const rpcLayer = RemoteRpc.toLayer(handlers)
```

The application supplies the Effect RPC server/transport layer. `RemoteServer`
does not choose HTTP, WebSocket, or another transport for you.

## Runtime dependencies belong to Sources

Sources are Effects, so dependencies stay explicit:

```text
Project Source
    requires Database

Billing Query Source
    requires BillingApi

RemoteServer
    requires Database | BillingApi
```

The server definition does not capture either service. Provide their Layers at
the application boundary. This is also why `foldkit-remote-drizzle` provides
Drizzle-backed Sources rather than putting a database inside `RemoteServer`.

## Hardening

The handler applies bounded, protocol-level safeguards before or around Sources:

- a read batch may name at most `maxIdsPerEntity` distinct ids for one Entity
  (default `1000`); oversized client batches fail rather than loading unbounded
  rows;
- nested resolution is bounded by `maxDepth` (default `8`);
- the wire decoder also rejects a selection deeper than
  `MAX_RELATION_DEPTH` (`8`) or more than `MAX_FIELDS_PER_REQUEST` (`256`)
  fields for one Entity;
- returned field names are copied with `Object.hasOwn` into null-prototype
  objects, so names such as `__proto__` or `toString` cannot reach prototypes;
- Source errors are remapped to protocol error types without echoing application
  internals.

A `liveHub` applies the same id bound to a subscription. A hand-written live
Source is responsible for any additional bounds appropriate to its backend.

## What it does not own

`foldkit-remote-server` intentionally does **not** own:

- HTTP/WebSocket transport or serialization;
- authentication protocol or session storage;
- a database connection;
- the client's normalized cache;
- client rendering or Surface activation;
- durable/offline client-authored state.

Those boundaries keep this package an interpreter of the Remote contract rather
than another application runtime.

## See also

- [Server-derived state](../../docs/remote.md) — the client/server mental model
  and ownership rules.
- [`foldkit-remote`](../remote) — requirements, normalized client Model,
  subscriptions, mutations, live reads, and retention.
- [`foldkit-remote-drizzle`](../remote-drizzle) — compile Entity selections and
  Query windows into Drizzle reads.
- [`examples/kitchen-sink`](../../examples/kitchen-sink) — Remote +
  RemoteServer + Drizzle + `liveHub` in one executable trace.
