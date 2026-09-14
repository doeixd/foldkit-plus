# `foldkit-remote-server`

Answers the requests a
[`foldkit-remote`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote)
client makes. You write one **Source** per entity, query, and mutation — plain
Effect functions that load rows — and this package compiles them into the
`RemoteRpc` handlers: it groups and de-duplicates the ids a client asked for,
drops the fields a principal may not read, resolves a nested selection level by
level through each entity's own Source, and normalizes the results into the
patches the client's store reconciles.

Reach for it when the server is yours and you want the client's field-level
selections honoured end to end, with authorization enforced where the field
names are still known rather than in the view. It owns no HTTP, WebSockets,
serialization, authentication protocol, or database connection: `principal` is
resolved outside and passed in, and a Source's database is an Effect requirement
the Source declares, not something this package holds.

## Install

```bash
pnpm add foldkit-remote-server
```

`effect` is a peer dependency; `foldkit-remote` comes with it.
`foldkit-remote-drizzle` compiles its selections and queries to SQL.

## Quick start

One entity, one mutation, one query, one live stream, compiled to a layer.
`loadProjects`, `renameProject`, `projectsPage`, and `projectEvents` are the
application's own data access; `principal` is whatever authentication resolved.

```ts
import { Effect, Schema } from 'effect'
import { Entity, Mutation, Query, RemoteRpc } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, privateNotes: Schema.String }),
)

const RenameProject = Mutation.make('RenameProject', {
  Input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  Output: Schema.Struct({ id: Schema.String }),
})

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: Schema.Struct({ ownerId: Schema.String }),
  Result: Query.connection(Project),
})

const Server = RemoteServer.make({
  entities: [
    RemoteServer.entity(Project, {
      authorize: (principal, fields) => fields.filter(field => principal.canRead(Project, field)),
      read: ({ ids, fields, windows, principal }) => loadProjects({ ids, fields, windows, principal }),
    }),
  ],
  mutations: [
    RemoteServer.mutation(RenameProject, ({ input, principal }) =>
      renameProject(input, principal).pipe(
        Effect.map(output => ({
          output,
          entities: [Entity.patch(Project.ref(input.id), { name: input.name })],
        })),
      ),
    ),
  ],
  queries: [
    RemoteServer.query(ProjectsByOwner, ({ input, window, principal }) =>
      projectsPage({ ownerId: input.ownerId, window, principal }),
    ),
  ],
  live: [
    RemoteServer.live(Project, {
      subscribe: ({ requirements, after, principal }) =>
        projectEvents({ ids: requirements.map(request => request.id), after, principal }),
    }),
  ],
})

const handlers = RemoteServer.handlers(Server, principal)
const layer = RemoteRpc.toLayer(handlers)
// FoldkitRemoteRead, FoldkitRemoteMutate, FoldkitRemoteQuery, FoldkitRemoteLive
```

`handlers(server, principal, options?)` takes a `HandlerOptions<P, R>`:
`maxIdsPerEntity` (default 1000) bounds how many distinct ids of one entity a
read batch — or a `liveHub` subscription — may name, `maxDepth` (default 8)
bounds nested resolution, and `live` is the hub whose signals reach the
subscriptions this handler registers. In-process, the handlers are a
`RemoteClient` through `Remote.clientLayer(handlers)`, with whatever the sources
require supplied by `Layer.provide`.

## Sources

### `RemoteServer.entity`

```text
RemoteServer.entity(entity, {
  read: (context: { ids: readonly string[]; fields: readonly string[]
                    windows?: Record<string, QueryWindow>; principal: P })
    => Effect<ReadonlyArray<{ id: string; values: Record<string, unknown> }>, RemoteServerError, R>
  authorize?: (principal: P, fields: readonly string[]) => readonly string[]
}): EntitySource<P, R>
```

Given the Entity, a request for a field it does not declare never reaches
`read` or `authorize`; `RemoteServer.entity({ name: 'Project' }, …)` declares
no fields and passes every requested one through.

`read` is called once per entity, id batch, and window per read level: ids are
batched up to `maxIdsPerEntity`, ids that page a relation differently are read
separately, and a nested selection reads its next level after the refs arrive.
`windows` carries the pagination window for each requested relation field. The
result may be a partial entity: a field the source omits is simply not present,
and presence metadata on the client reflects that.

### `RemoteServer.query`

```text
RemoteServer.query(query, (context: { input: Input; window: QueryWindow; principal: P })
  => Effect<QueryPage, RemoteServerError, R>): QuerySource<P, R>
```

`QueryPage` is `{ edges, start, end }`; `start`/`end` are `Boundary` values
(`Terminal`, `Cursor`, or `Unknown`) so the client can merge the page without
inferring adjacency from row count.

### `RemoteServer.mutation`

```text
RemoteServer.mutation(mutation, (context: { input: Input; principal: P })
  => Effect<{ output: Output
              entities?: ReadonlyArray<NormalizedPatch>
              connections?: ReadonlyArray<ConnectionChange> },
            RemoteServerError, R>): MutationSource<P, R>
```

`input` is decoded against the mutation's `Input` schema first, so the callback
receives the typed input. `output` is encoded against `Output`; `entities` are
the normalized cache patches the client will reconcile, and `connections` the
confirmed connection inserts and removes that replace the client's optimistic
ones in place: `RemoteServer.prepend(connection, ref)`, `append`, and
`remove`, where `connection` is a `QueryRef` or its identity.

### `RemoteServer.live`

```text
RemoteServer.live(entity, {
  subscribe: (context: { requirements: ReadonlyArray<Requirement>; after: number; principal: P })
    => Stream<LiveChange, RemoteServerError, R>
}): LiveSource<P, R>
```

`after` is the client's resume cursor; events at or before it are duplicates. The
handler merges the requested entities' streams and maps a source failure onto the
wire error. An entity with no live source contributes nothing, so the client
plans a refetch instead of failing the stream. A `LiveChange` is an entity patch
or delete, or a connection insert/remove/invalidate.

### `RemoteServer.liveHub`

The higher-level signal. A hub tracks each live subscriber's requirements and
principal, so the server says *what changed* and the hub works out *who cares*:

```ts
// `entitySources` is the same array `RemoteServer.make({ entities })` was given.
const hub = yield* RemoteServer.liveHub(entitySources)
const handlers = RemoteServer.handlers(Server, principal, { live: hub })

// Wherever the data changes (a mutation source, a database trigger):
yield* hub.changed(Project.ref(projectId), ['status', 'updatedAt'])
yield* hub.deleted(Project.ref(projectId))
```

`liveHub` and its signals are Effects, so the lines above live inside an
`Effect.gen`. It needs only the entity sources, so the mutation sources that
signal it can be built after it.

`changed` intersects the fields with what each subscriber selects, re-reads
that intersection through the entity's own source under the subscriber's
principal (one read per principal value and window signature; subscribers
selecting none of the fields do no work), and streams an `EntityPatched`
carrying only the fields that subscriber may see. A record the source does not
return for the changed id reaches nobody. `deleted` streams an `EntityDeleted`
to the entity's subscribers. Cursors continue from the cursor each subscriber resumed at, so
the client's duplicate and gap handling is unchanged. A hub and hand-written
`RemoteServer.live` sources number their events independently; use one or the
other for a given subscription. Nested relation targets are not subscribed by
the hub, only the requirements' own entities.

## Authorization

Authentication and authorization are separate. Authentication answers *who is
this* (Effect RPC middleware → `Principal`); `RemoteServer` answers *may this
principal read this semantic field*. Authorization is mandatory, not opt-in:

- A field the Entity does not declare is dropped before `authorize` sees it.
- An entity with no `authorize` exposes the requested fields.
- An entity with `authorize` exposes only the returned fields, and a field the
  principal may not see is dropped.
- **Never read or return a field the client did not request**, even if a
  permissive `authorize` allows more.
- If no field survives authorization, the entity contributes nothing, so the
  existence of an unauthorized entity is not leaked.

## Hardening

- A read batch is bounded per entity (`maxIdsPerEntity`, default 1000, counted
  across the batch's window groups) and an oversized one fails rather than
  loading unbounded rows; a `liveHub` subscription is bounded the same way. A
  hand-written `RemoteServer.live` source bounds itself.
- A selection nested past `MAX_RELATION_DEPTH` (8) or naming more than
  `MAX_FIELDS_PER_REQUEST` (256) fields of one entity is refused at decode.
- Returned field names are filtered with `Object.hasOwn` and accumulated into a
  null-prototype object, so a crafted field name such as `__proto__` or
  `toString` cannot reach the prototype.
- Handler errors are remapped to the wire error types without echoing internals.

## What it owns

- Entity, query, mutation, and live Sources.
- Selection authorization and field filtering.
- Request grouping, id de-duplication, field unions, and window threading.
- Normalization of source results into wire entities.
- Source-name validation: `RemoteServer.validate(domain, server)` checks every
  entity, query, and mutation source against the domain's `registry`, so an
  undeclared name fails at startup rather than returning nothing at call time.
- Compilation to the `RemoteRpc` handlers.

## Limits

- Transport, serialization, and the authentication protocol are Effect RPC's; the
  application provides the server protocol layer.
- The live wire carries a `LiveChange` union: entity patches and deletes, plus
  connection insert/remove/invalidate events.
- Database and other runtime dependencies are the Source's Effect requirements,
  not this package's.

## See also

- [Server-derived state](https://github.com/doeixd/foldkit-plus/blob/main/docs/remote.md) — the mental model for
  both halves.
- [`foldkit-remote`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote) — the client half this answers; [`foldkit-remote-drizzle`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote-drizzle)
  compiles its selections and queries to SQL.
- [`examples/kitchen-sink`](https://github.com/doeixd/foldkit-plus/tree/main/examples/kitchen-sink) — the server packages with a live hub, an optimistic
  insert confirmed in place, and retention.
