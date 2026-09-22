# `foldkit-remote` example

A focused executable trace of the client-side Remote model:

```text
Surface Projection
      |
      v
requirements
      |
      v
planner compares them with Remote.Model
      |
      v
RemoteClient performs missing I/O
      |
      v
Remote Messages
      |
      v
Data.reduce
      |
      v
normalized cache in the Foldkit Model
```

It uses the real `foldkit-remote` → `foldkit-surface` → `foldkit-mixins` path
against an **in-process `RemoteClient`**. There is no server in this example; the
point is to make the client requirements/cache lifecycle visible. For the server
interpreter, use [`foldkit-remote-server`](../../packages/remote-server) or the
[kitchen sink](../kitchen-sink).

## A first experiment

In [src/demo.ts](src/demo.ts), find the first read of `ProjectPage`, the
prefetch, and the second read. Predict the tags: `Initial` before the Command
is run, `Ready` after its result has been reduced into the Model. Evaluating
the Projection again cannot replace either of those steps.

Next inspect the second plan: cached fields should no longer need a read.
This is the difference between describing a requirement, executing I/O, and
observing its result. Keep those three operations separate when copying the
example into a Subscription-driven application.

## Run it

From the repository root:

```bash
pnpm install && pnpm build
pnpm --filter foldkit-example-remote demo
```

`src/demo.ts` is intentionally the only file you need to read. The transcript is
the example, and `test/demo.test.ts` pins its important lines.

## What the demo proves

The central idea is that **reading does not fetch**. `ProjectPage` contains a
pure `Data.get(...)` Projection. The planner turns that Projection into
requirements, and explicit prefetch/subscription code performs the I/O.

```text
ProjectPage says:
  Project:p1 needs id, name, status

        |
        v
Data.plan(...)

        |
        v
Remote.Model is missing those fields

        |
        v
RemoteClient.read(...)

        |
        v
ReadReceived Message

        |
        v
Data.reduce(...)

        |
        v
ProjectPage now reads Ready(...)
```

The rest of the demo layers queries, stale-while-revalidate, mutation,
retention, rendering, decode failure, and a refresh from `update` onto that same loop.

## Transcript

```text
surface: ProjectPage
plan: Project:p1 [id,name,status]
before fetch: Initial
after fetch: Ready {"id":"p1","name":"Apollo","status":"active"}
stale-while-revalidate: ReadStarted, RefreshStarted, ReadReceived; Refreshing {...} -> Ready {...}
query page: Ready p1 Apollo; next page: none
inspect: 1 entities, 1 connection, 1 registered queries
rendered classes: project-card
rendered status: active
mutation RenameProject (remote-1): MutationSucceeded
after mutation: Ready {"id":"p1","name":"Apollo II","status":"active"}
retained: Project:p1; 1 entity and 1 connection collected
corrupt store: Failed DecodeError
refresh: Refreshing {"id":"p1","name":"Apollo",...}; list Refreshing p1; again unchanged: true
after refresh: ReadStarted, ReadReceived, ConnectionMerged, ReadStarted, ReadReceived; Ready {...,"name":"Artemis",...}; list Ready p2 Borealis
```

Read those lines in this order:

### 1. Projection → requirements

```text
surface: ProjectPage
plan: Project:p1 [id,name,status]
```

`ProjectPage` projects:

```ts
project: Data.get(ProjectSummary, params.projectId)
```

`Data.get` is pure. It does not start a request. Its Projection carries the
requirement that `Project:p1` needs `id`, `name`, and `status`.

`Data.plan(initial, ProjectPage.projection(...))` compares those requirements
with the normalized cache already in `Remote.Model` and reports what is missing.

### 2. RemoteData reflects cache state

```text
before fetch: Initial
after fetch: Ready {...}
```

Before those fields exist, the Projection reads `Initial`. The demo then uses
`Data.prefetch(...)` as an explicit imperative fetch helper. The in-process
`RemoteClient` returns server facts, those facts are reduced into the Remote
Submodel, and the **same Projection** now reads `Ready`.

In a mounted application, the declarative equivalent is `Data.subscriptions(...)`:
active Surface requirements become Subscription entries which perform the I/O
outside render.

### 3. Stale data stays visible while requirements are refreshed

```text
stale-while-revalidate: ReadStarted, RefreshStarted, ReadReceived; Refreshing {...} -> Ready {...}
```

The demo creates an entry with:

```ts
Data.subscriptions(
  { page: Surface.at(ProjectPage, { projectId: 'p1' }) },
  { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }) },
)
```

The subscription derives its work from the active Surface. It emits Remote
Messages; `Data.reduce` applies them to the Model.

`RefreshStarted` changes the projected state to `Refreshing` **without hiding the
old value**. `ReadReceived` installs the fresh facts and the Projection returns
to `Ready`.

This is the package's normal declarative loop:

```text
active Surface
      |
      v
Data.subscriptions
      |
      v
RemoteClient
      |
      v
Remote Message
      |
      v
Data.reduce
```

### 4. Queries are Projections too

```text
query page: Ready p1 Apollo; next page: none
```

`Data.query(ProjectsByOwner, input, { select, first })` creates another pure
Projection. This one reads a normalized connection as a `Page<ProjectSummary>`.

`Data.prefetch` first resolves the connection, then fetches any entity fields the
page references but the cache still lacks. `Data.next` returns the next page's
query reference when one exists.

### 5. The cache is inspectable

```text
inspect: 1 entities, 1 connection, 1 registered queries
```

`Remote.inspect` exposes cache/domain information without changing it. This is
useful for tests, debugging, and tooling because the Remote cache is ordinary
Model state rather than an invisible client singleton.

### 6. Surface + Mixins consume the same Projection

```text
rendered classes: project-card
rendered status: active
```

The `SurfaceView` renders the projected `RemoteData`; a Style and Behavior read
that same projected value. Neither reaches around the Surface to a second data
source.

### 7. A Remote mutation updates server-owned facts

```text
mutation RenameProject (remote-1): MutationSucceeded
after mutation: Ready {"id":"p1","name":"Apollo II","status":"active"}
```

`Data.mutate` records the request in the Model and returns the Command that asks
the `RemoteClient` to perform it. The result comes back as Remote Messages and
settles into the same normalized cache.

This is **not** an offline durable intent queue. If an edit must survive restart
and converge later, that is [`foldkit-sync`](../../packages/sync), not Remote.

### 8. Retention is dependency-driven

```text
retained: Project:p1; 1 entity and 1 connection collected
```

`Remote.retain([projection])` declares roots. A `RetentionChanged` Message lets
the reducer keep reachable facts and collect cache entries no active retained
Projection needs.

### 9. Decode failure is data, not an assertion

```text
corrupt store: Failed DecodeError
```

The Selection schema is still enforced when reading cached data. A malformed
stored entity produces `RemoteData.Failed(DecodeError)` rather than being cast to
the requested value.

### 10. A refresh marks; the Subscription fetches

```text
refresh: Refreshing {...Apollo...}; list Refreshing p1; again unchanged: true
after refresh: ReadStarted, ReadReceived, ConnectionMerged, ReadStarted, ReadReceived; Ready {...Artemis...}; list Ready p2 Borealis
```

The server renames `p1` and its owner's list becomes `p2` alone. A refresh
button's `update` branch returns `Data.refresh(model, Dashboard)` (a Projection,
or a Surface without params):

- It performs **no I/O**. The Model comes back with the present fields reading
  `Refreshing` over the old value and the loaded connection invalidated.
  Refreshing it again returns the same Model.
- The `Data.subscriptions` read entry then refetches what was marked, once: the
  project and the query page, then a read of `p2`, which the new page references.
- The refreshed first page **replaces** the connection's pages, so `p1`, which
  the server removed, leaves the list; later pages would be paged again.

It does not fetch a Projection nothing observes (use `Data.prefetch` with
`RemotePolicy.networkOnly` there), and it leaves `Data.live` subscriptions alone.
A read in flight when the refresh lands restarts rather than applying its older
answer; this in-process client answers instantly, so the demo does not show it.

## What this example deliberately omits

- **A real server.** The `RemoteClient` is in-process so the client lifecycle is
  deterministic. See [`foldkit-remote-server`](../../packages/remote-server).
- **SQL compilation.** See [`foldkit-remote-drizzle`](../../packages/remote-drizzle)
  and [`examples/kitchen-sink`](../kitchen-sink).
- **Offline durable edits.** Remote caches another owner's facts. See
  [`examples/sync`](../sync) for client-authored state that must converge.

## See also

- [Server-derived state guide](../../docs/remote.md) — the architecture before API detail.
- [`foldkit-remote`](../../packages/remote) — the full package reference.
- [`examples/kitchen-sink`](../kitchen-sink) — client + Remote Server + Drizzle end to end.
