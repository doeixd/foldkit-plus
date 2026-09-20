# Foldkit Plus: Data, Query, and Local-First Architecture

**Status:** design proposal; no implementation implied by this document  
**Date:** September 2026  
**Target:** doeixd/foldkit-plus  
**Primary packages:** foldkit-entity, foldkit-remote, foldkit-remote-server, foldkit-remote-drizzle, foldkit-surface, foldkit-sync, foldkit-durable  
**Reference systems:** LiveStore 0.4, TanStack DB

## 1. Decision

Foldkit Plus should not add a second, parallel data architecture.

It already has most of one:

~~~text
foldkit-entity
  Entity
  Field
  Relation
  Derived
  Selection

foldkit-remote
  QueryDescriptor / QueryRef
  RemoteDomain ("Data")
  normalized EntityStore
  Connections
  optimistic overlays
  live updates
  planning / retention / persistence

foldkit-remote-server
  semantic Sources
  authorization
  query / mutation execution

foldkit-remote-drizzle
  Entity / Selection / Query -> Drizzle-backed Sources

foldkit-surface
  Projection
  dependency paths
  requirement metadata
  semantic activation

foldkit-sync + foldkit-durable
  durable Messages
  optimistic replay
  outbox
  authoritative order
  snapshots / compaction
~~~

The missing capability is narrower:

> **Foldkit Plus has typed, stable query identities, but not yet a sufficiently source-neutral representation of what a query means.**

Today a Remote query can name its input and result:

~~~ts
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: ProjectId },
  Result: Project,
})
~~~

while the actual filtering and ordering are usually supplied later by a Source adapter such as foldkit-remote-drizzle:

~~~ts
query(ProjectBinding, ProjectsByOwner, {
  where: input => eq(projects.ownerId, input.ownerId),
  orderBy: [
    { column: projects.updatedAt, direction: 'desc' },
    { column: projects.id, direction: 'asc' },
  ],
})
~~~

That is the seam to improve.

The recommended direction is:

> **Make common query semantics declarative and inspectable, then let Remote/Drizzle, TanStack DB, LiveStore, an in-memory evaluator, and future local materializers interpret the same declaration.**

Do not generalize Remote's runtime stores until a second implementation proves that those stores themselves are reusable.

---

## 2. The ownership rule

The repository's existing "no second place to keep state" rule is directionally right, but caches, mirrors, replicas, indexes, and rendered views are already secondary representations.

Use the more precise rule:

> **One transition authority per fact. Secondary representations are allowed when their derivation and authority are explicit.**

Examples:

| Representation | Authority |
| --- | --- |
| ordinary local domain/UI state | application Model / Message / update |
| server-owned facts in Remote.Model | server; Remote cache is disposable |
| Sync's optimistic shared value | authoritative journal + pending durable Messages |
| URL or KV mirror | application Model |
| local SQLite read model | whichever fact stream materializes it |
| TanStack live-query result | its source collections |
| DOM | current Foldkit Model |

This distinction matters for LiveStore integration in particular: do not let both LiveStore's event log and foldkit-sync own the same durable fact.

---

## 3. What the current packages already provide

### 3.1 foldkit-entity is already the domain layer

Entity answers:

~~~text
What kind of object is this?
Which intrinsic fields does it have?
Which relations may be navigated?
Which derived values can an interpreter supply?
What exact shape does a consumer select?
~~~

It deliberately does not own storage, fetching, operations, or application state.

Keep that boundary.

There is no need to introduce a second generic "Collection schema" beside Entity.

### 3.2 Selection and Query answer different questions

Keep this distinction explicit:

~~~text
Selection
  Which facts about each entity?

Query
  Which entities, in what order, for which input?
~~~

Selection is already source-neutral.

Query is partly source-neutral today: its name, input codec, result entity, stable identity, and pagination window are portable. Its filtering and ordering semantics are not.

### 3.3 Data already looks like the application-facing seam

"Data" is not a separate package. It is the bound RemoteDomain returned by Remote.make.

Today application code gets operations such as:

~~~ts
Data.get(...)
Data.live(...)
Data.query(...)
Data.mutate(...)

Data.subscriptions(...)
Data.reduce(...)
Data.wiring(...)
Data.plan(...)
Data.storeOf(...)
~~~

This is already the right ergonomic shape for a domain-bound data API.

Do not add a competing foldkit-data package merely to recreate this vocabulary.

Instead, use the existing Data API as evidence for the common application-facing shape. Generalize it only after a second execution engine proves which parts are actually common.

### 3.4 foldkit-remote is already much of a client database runtime

Remote.Model contains:

~~~text
entities      normalized values, presence, staleness, tombstones, windows
connections   ordered normalized result sets with explicit boundaries
optimistic    entity layers + connection overlays
live          cursor/gap/boundary state
mutations     pending/applied/failed ledger
loading       read activity
refresh       refresh generations
~~~

Remote additionally has:

~~~text
stable QueryRef identity
page/segment merging
field-level missing/stale planning
live entity patches
live connection inserts/removes/invalidations
optimistic rebasing
cache persistence
retention / GC
Surface-driven subscription lifetime
~~~

Do not build another normalized client store beside this unless a concrete non-Remote interpreter needs the same data structure.

### 3.5 Surface already solves activation

TanStack DB commonly activates live queries through subscribers/components.

Foldkit Plus already has a more semantic mechanism:

~~~text
Surface.at(...)
    ↓
feature is active
    ↓
Projection metadata is active
    ↓
Data.subscriptions
    ↓
I/O / live work starts
~~~

Query execution should preserve this.

A view or Projection declares requirements; it does not perform I/O.

### 3.6 Bundle's "collection" is a different concept

foldkit-bundle already has CollectionLink / PlacedCollection / Bundle.each for keyed child state machines.

Do not introduce a second top-level public "Collection" abstraction for normalized records unless there is no better name.

The existing vocabulary -- Entity, Selection, Query, Data -- is clearer for this architecture.

---

## 4. What LiveStore contributes

LiveStore 0.4's public Store is a local SQLite database maintained from an event log.

Its important capabilities for this design are:

~~~text
event commit
    ↓
materializer
    ↓
local SQLite
    ↓
one-shot or reactive query
    ↓
subscriber
~~~

The current public API supports:

- Store.commit for event commits, including atomic multi-event commits;
- Store.query for one-shot reads;
- Store.subscribe / subscribeStream for reactive reads;
- Store.events for confirmed event-log events;
- local SQLite state derived through materializers;
- synchronization of the event log across clients.

These are valuable capabilities, but they should not replace Foldkit's application transition model.

Foldkit should retain:

~~~text
Message
   ↓
update
   ↓
Model
~~~

A Foldkit-native materializer should therefore be understood as:

> **A rebuildable read/index representation derived from facts whose application meaning already exists elsewhere.**

That allows SQLite, full-text indexes, analytics tables, and similar representations without creating another application reducer.

---

## 5. What TanStack DB contributes

TanStack DB makes a different separation:

~~~text
many possible sources
        ↓
typed normalized collections
        ↓
live query engine
        ↓
derived collections
~~~

Its current live-query system supports structured queries including filtering, projection, ordering, joins, grouping/aggregates, subqueries, and composition. Query results are themselves collections. The implementation incrementally updates results rather than simply rerunning the complete query for every source change.

Its most important lessons for Foldkit Plus are:

1. **Loading and querying are separable.**
2. **A query can be structured data rather than an endpoint name.**
3. **Query requirements can be pushed toward the source instead of loading everything.**
4. **Derived views can compose.**
5. **Optimistic state can be layered over confirmed state.**

Foldkit Plus already has analogues of items 3 and 5 in Remote.

The main capability to borrow is therefore the structured, source-neutral query description and, potentially, TanStack's local incremental execution engine.

---

## 6. The target architecture

The long-term shape should be approximately:

~~~text
                         DOMAIN

                    foldkit-entity
                         Entity
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
          Selection                    Query
        which fields?                which rows?
              │                         │
              └────────────┬────────────┘
                           ▼
                          Data
                 application-facing seam
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       Remote          TanStack          LiveStore
          │             adapter           adapter
          ▼                │                │
   RemoteServer             ▼                ▼
          │           local live/IVM    local SQLite
          ▼                                  │
 remote-drizzle                          event log
          │
          ▼
         SQL
~~~

Observation still ends in Foldkit:

~~~text
Data.get / Data.query / Data.live
              ↓
          Projection
              ↓
           Surface
              ↓
             View
~~~

Application transitions still remain:

~~~text
Message
   ↓
update
   ↓
Model
~~~

---

## 7. The core missing feature: semantic Query IR

### 7.1 Current Query

Current QueryDescriptor owns:

~~~text
name
Input codec
Result / ConnectionSpec
ref(input)
stable logical identity
pagination window
~~~

This is good and should be preserved.

In particular, the existing identity rule is useful:

> Query identity is descriptor + canonical encoded input, not pagination window.

Therefore:

~~~text
ProjectsByOwner(owner=u1).first(25)

ProjectsByOwner(owner=u1).after(cursor).first(25)
~~~

are windows over the same logical connection.

Keep that behavior.

### 7.2 Proposed semantic layer

A Query should be able to carry an optional source-neutral semantic plan.

Conceptually:

~~~ts
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  from: Project,

  Input: {
    ownerId: ProjectId,
  },

  where: ({ row, input }) =>
    row.ownerId.eq(input.ownerId),

  orderBy: ({ row }) => [
    row.updatedAt.desc(),
    row.id.asc(),
  ],
})
~~~

The builder callbacks must produce inspectable data, not retain arbitrary backend-specific closures.

Conceptually:

~~~text
Eq(
  Field(Project.ownerId),
  Input(ownerId)
)

OrderBy(
  Desc(Project.updatedAt),
  Asc(Project.id)
)
~~~

A minimal first expression algebra could cover:

~~~text
values
  Entity field
  query input
  literal

comparison
  eq / neq
  lt / lte
  gt / gte
  in / notIn
  isNull / isNotNull

logic
  and / or / not

strings
  contains
  startsWith
  endsWith

ordering
  asc / desc
~~~

Do not initially model all of SQL.

Pagination should continue to use the existing QueryRef / QueryWindow machinery.

### 7.3 Keep native escape hatches

Portable semantics should cover the common case, not become a prison.

Interpreters may expose explicit native bindings for capabilities the common IR cannot express.

Examples:

~~~text
remote-drizzle native SQL predicate
TanStack-native query
LiveStore-native query
application Source with arbitrary Effect logic
~~~

The source-neutral path is the default when it fits; not every query must be portable.

---

## 8. Where the semantic Query type should live

Do not move the current Remote Query wholesale into foldkit-entity yet.

Current Query includes Remote-specific concepts such as ConnectionSpec live insertion policy.

Instead:

1. add the semantic expression/ordering representation alongside the current Query implementation or in a private/internal module;
2. make remote-drizzle consume it;
3. build a second interpreter;
4. only then decide whether the stable source-neutral declaration belongs in foldkit-entity or in a small dedicated package.

A likely eventual split is:

~~~text
source-neutral
  name
  Input
  from
  predicate
  ordering
  result entity / selection semantics

Remote-specific
  ConnectionSpec
  LivePolicy
  QueryRef windowing / connection behavior
  Remote query requirements
~~~

But the exact split should be discovered by implementation, not guessed first.

---

## 9. remote-drizzle should be the first compiler

remote-drizzle is already explicitly a compiler from Remote semantic declarations to Drizzle-backed Sources.

Today the Query descriptor and adapter configuration split the meaning:

~~~ts
const ProjectsByOwner = Query.make(...)

query(ProjectBinding, ProjectsByOwner, {
  where: input => ...,
  orderBy: ...,
})
~~~

The first implementation goal should be:

~~~ts
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  from: Project,
  Input: { ownerId: ProjectId },

  where: ({ row, input }) =>
    row.ownerId.eq(input.ownerId),

  orderBy: ({ row }) => [
    row.updatedAt.desc(),
    row.id.asc(),
  ],
})
~~~

followed by an adapter with little or no duplicated semantic configuration:

~~~ts
query(ProjectBinding, ProjectsByOwner)
~~~

The existing principal/visibility policies in remote-drizzle must remain authoritative. Query portability must not bypass:

- field authorization in RemoteServer;
- binding-level row visibility;
- relation policies;
- application authentication.

Query IR describes requested semantics, not authorization.

---

## 10. Add an in-memory interpreter second

Before integrating another large runtime, build a small reference evaluator.

Input:

~~~text
Entity values
Query semantic plan
query input
~~~

Output:

~~~text
matching ordered rows
~~~

Use it for:

- unit tests;
- differential tests against Drizzle;
- validating the semantics of nulls/string operators/order;
- proving the IR is not accidentally a Drizzle AST.

Acceptance criterion:

> The same Query declaration returns equivalent results through the in-memory evaluator and remote-drizzle for the supported subset.

---

## 11. TanStack DB should initially be an execution engine

Do not import TanStack DB's mutation/state-management model into Foldkit.

Prototype an adapter that compiles the same semantic Query into TanStack DB's live-query builder.

Conceptually:

~~~text
Entity + semantic Query
          ↓
   TanStack adapter
          ↓
 TanStack collections
 + incremental query
          ↓
   Foldkit Message
          ↓
        Model
~~~

The first useful proof is:

> The same Entity / Selection / Query declaration executes through remote-drizzle on the server and TanStack DB locally.

If that succeeds, observe what application-facing operations are truly common before extracting a generalized Data interface.

Foldkit Messages should remain the application write API. Do not replace:

~~~ts
Message.RenamedTodo({ id, title })
~~~

with direct collection mutation as the application's semantic API.

---

## 12. LiveStore should be an adapter with explicit ownership

A LiveStore integration should make its reactive query/store lifecycle disappear behind Foldkit's existing activation boundary.

Conceptually:

~~~text
Surface active
    ↓
Data query requirement
    ↓
LiveStore adapter
    ↓
Store.subscribe / subscribeStream
    ↓
Foldkit Message
    ↓
Model
~~~

There are two valid write architectures.

### A. LiveStore owns the durable domain

~~~text
Foldkit intent
    ↓
Command
    ↓
LiveStore event
    ↓
LiveStore event log
    ↓
materializer
    ↓
SQLite
    ↓
query result
~~~

Do not use foldkit-sync as a second log for the same fact.

### B. Foldkit Sync owns the durable domain

~~~text
durable Foldkit Message
    ↓
foldkit-sync / durable
    ↓
authoritative operation order
    ↓
Foldkit materializer
    ↓
queryable local read model
~~~

In this path, do not introduce LiveStore's event log as another authority for the same operation.

---

## 13. A future Foldkit materialization primitive

LiveStore exposes a useful missing Foldkit capability: rebuildable read models.

A future API might look conceptually like:

~~~ts
const TodoIndex = Materializer.make(TodoSync, {
  CreatedTodo: ({ id, title }, target) =>
    target.insert(Todo, {
      id,
      title,
      completed: false,
    }),

  ToggledTodo: ({ id }, target) =>
    target.update(Todo, id, row => ({
      completed: !row.completed,
    })),

  DeletedTodo: ({ id }, target) =>
    target.delete(Todo, id),
})
~~~

The invariant is:

~~~text
update
  application transition semantics

Materializer
  derived read/index representation
~~~

A materialization must be disposable/rebuildable from its source facts, or clearly declare some other owner.

Start with a simple in-memory materializer before SQLite.

---

## 14. Sync improvements that support materialization

The following additions are useful independently of LiveStore/TanStack integration.

### 14.1 Committed operation stream

Expose committed durable facts without making consumers inspect Replica internals.

Conceptually:

~~~ts
TodoSync.committed(replica)
~~~

yielding:

~~~ts
{
  sequence,
  actorId,
  message,
}
~~~

Potential consumers:

~~~text
SQLite materializer
search index
analytics read model
audit export
derived cache
~~~

Pending operations may be exposed separately if a materializer explicitly wants an optimistic view.

### 14.2 Atomic durable Message batches

Support a semantic transaction:

~~~ts
replica.submitBatch([
  Message.CreatedInvoice(...),
  Message.AddedInvoiceLine(...),
  Message.AddedInvoiceLine(...),
])
~~~

with matching journal atomicity.

Keep the unit of meaning as Messages rather than row mutations.

### 14.3 Durable encoding evolution

Once durable operations become long-lived inputs, their wire representation needs explicit versioning/migration.

The durable layer should decode historical formats into the current application Message rather than requiring the application's current union to retain every old event shape forever.

Do not design the full API until a concrete migration is exercised.

---

## 15. Query-driven loading

TanStack DB's query-driven sync is particularly relevant to Remote.

Remote already performs:

~~~text
Surface requirement
    ↓
compare against normalized cache
    ↓
fetch only missing/stale selected fields
~~~

Semantic Query IR can extend this toward:

~~~text
entity
selection
predicate
ordering
window
~~~

An interpreter can then choose how much to push down:

~~~text
Remote/Drizzle
  predicate + order + window executed on server

TanStack local
  execute against local collections

LiveStore
  execute against local SQLite

hybrid future adapter
  push some constraints remotely, derive the rest locally
~~~

Do not assume every backend can implement every operator. Unsupported operations should fail at adapter construction/validation, not silently change semantics.

---

## 16. Keep query UI state separate

Do not make Query own interaction state already handled elsewhere.

Current packages have the right separation:

~~~text
Query
  which data matches?

foldkit-primitives Pagination
  which page/window does the user want?

SelectionSet
  which result rows did the user select?

Virtual
  which rows are physically visible?

Surface
  which feature/data requirements are active?
~~~

QueryRef may continue to carry server/data pagination windows because those are part of the read request. The user's navigation state still belongs to the application Model.

---

## 17. Reactivity integration

The existing reactivity design already distinguishes semantics from propagation:

~~~text
Message -> update -> Model

Projection.dependencies
       ↓
which consumers need recomputation?
~~~

Data/query work should reuse that architecture, not create an independent reactive graph in Foldkit.

A Projection may depend on both:

~~~text
local Model dependency paths

and

interpreter-owned requirement metadata
~~~

Conceptually:

~~~text
                    Projection
                   /          \
        Model dependencies    Query requirements
                 │                  │
                 ▼                  ▼
          Model transition      source change
                 \                  /
                  affected Surface
~~~

An external engine such as TanStack DB or LiveStore may maintain its own internal reactivity for efficient execution. The Foldkit boundary should still convert externally observed changes into Foldkit Messages / Model state where application observation requires it.

---

## 18. Data should be generalized only from evidence

Do not create an abstract DataProvider interface first.

Build at least two paths and compare them.

Likely common application-facing concepts:

~~~text
get
query
live
subscriptions
wiring
Projection results
Surface activation
~~~

Likely Remote-specific concepts:

~~~text
RemoteData
RemoteClient
storeOf
plan
Remote.reduce
Remote normalized persistence
Remote mutation reconciliation
~~~

A generalized Data seam should emerge from the implementations rather than force LiveStore/TanStack into Remote's exact model.

---

## 19. DevTools / Module opportunity

Semantic Queries make architecture inspectable.

A Module/DevTools view could eventually show:

~~~text
Surface: ProjectPage
  reads:
    route.projectId

  requires:
    Query ProjectsByOwner
      input:
        ownerId <- route.projectId

      predicate:
        Project.ownerId == ownerId

      order:
        Project.updatedAt DESC
        Project.id ASC

      selection:
        id
        name
        owner.name

  executor:
    remote-drizzle
~~~

A local execution path could instead report:

~~~text
executor:
  TanStack DB

source:
  Project collection

indexes:
  ownerId

subscribers:
  ProjectPage
  Sidebar
~~~

This is a natural extension of Surface/Module's existing "architecture as data" philosophy.

---

## 20. Agent opportunity

An inspectable Query can become a constrained data capability.

Instead of exposing unrestricted database access, an agent can be told:

~~~text
ProjectsByOwner(ownerId)

returns ProjectSummary

predicate:
  Project.ownerId == ownerId

ordering:
  Project.updatedAt DESC
~~~

The application remains responsible for deciding which Queries/capabilities the agent may invoke. Server authorization remains authoritative.

---

## 21. CMS synergy

foldkit-cms should continue to reuse Entity, Form, Crud, Remote, and query infrastructure instead of inventing CMS-only data machinery.

Semantic Queries could describe:

~~~text
published entries
drafts for one entry
scheduled entries
revision history
search results
~~~

Crud.list and relation pickers can then consume the same Query/Selection infrastructure.

This keeps CMS as domain semantics over the existing architecture rather than a second framework.

---

## 22. Recommended build order

### Phase 0 -- documentation only

Document the current vocabulary accurately:

~~~text
Entity
  domain structure

Selection
  exact read shape

Remote QueryDescriptor / QueryRef
  query identity, input, connection result, window

Data
  bound RemoteDomain application API

Remote
  normalized server-derived runtime

RemoteServer
  semantic execution/authorization boundary

remote-drizzle
  Drizzle-backed Source compiler
~~~

### Phase 1 -- semantic predicate/order experiment

Add a minimal inspectable expression representation.

Support only enough for one real existing query:

~~~text
field ref
input ref
literal
eq
and
asc / desc
~~~

Keep the current adapter callback form as an escape hatch.

### Phase 2 -- remote-drizzle compiler

Compile the semantic plan to Drizzle.

Migrate one existing example so where/orderBy are not declared twice.

Do not weaken existing visibility/authorization behavior.

### Phase 3 -- in-memory evaluator

Execute the exact same query over arrays/maps.

Add differential tests against the Drizzle path.

### Phase 4 -- broaden the portable kernel

Only from real examples, add operators such as:

~~~text
neq
range comparison
in
null checks
or / not
string matching
~~~

### Phase 5 -- TanStack DB spike

Compile the same Query IR to a TanStack DB live query.

Measure:

~~~text
API fit
type complexity
bundle impact
query-lifecycle fit
performance
which Data operations are genuinely common
~~~

### Phase 6 -- LiveStore spike

Bind one Entity/read path to LiveStore and drive subscription lifetime from Surface activation.

Keep durable ownership explicit.

### Phase 7 -- decide the stable Query package boundary

Only after Drizzle + one second interpreter work:

- keep source-neutral Query in foldkit-remote;
- move it to foldkit-entity;
- or extract a tiny foldkit-query package.

Choose whichever reflects actual dependency direction.

### Phase 8 -- Sync materialization primitives

Add committed operation observation, then experiment with a rebuildable in-memory read model.

Atomic batches/versioned durable encoding can follow concrete use cases.

### Phase 9 -- advanced query semantics

Only after demonstrated need:

~~~text
joins
aggregates
groupBy
distinct
subqueries
derived-query composition
~~~

TanStack DB should be treated as prior art and potentially as the execution engine for these capabilities rather than a checklist to reimplement.

---

## 23. Acceptance tests for the architecture

The experiment has found the correct seam if this becomes possible.

One domain:

~~~ts
const Post = Entity.define(...)
~~~

One Selection:

~~~ts
const PostRow = Entity.select(Post, {
  id: true,
  title: true,
})
~~~

One semantic Query:

~~~ts
const RecentPosts = Query.make(...)
~~~

Multiple interpreters:

~~~text
RecentPosts
   ├── remote-drizzle -> server SQL
   ├── in-memory      -> reference evaluator
   ├── TanStack       -> local incremental view
   └── LiveStore      -> local SQLite query
~~~

And application code remains approximately:

~~~ts
Data.query(
  RecentPosts,
  input,
  {
    select: PostRow,
    first: 25,
  },
)
~~~

The feature should not need to know whether execution is remote SQL or a local engine, except when it deliberately chooses a backend-specific capability.

---

## 24. Non-goals

This design does not aim to:

- replace Model / Message / update;
- replace foldkit-remote;
- replace foldkit-sync;
- recreate SQL as a TypeScript DSL;
- reproduce all of TanStack DB;
- reproduce all of LiveStore;
- add mutable record Collections as a second application store;
- make every query portable;
- force every backend to support every operator;
- move Remote's EntityStore/Connection machinery prematurely;
- merge server-owned Remote state with client-authored Sync ownership;
- bypass server-side authorization through portable query declarations.

---

## 25. Risks

### Query IR grows into an ORM

Mitigation: start with one real query and a very small operator kernel. Keep native escape hatches.

### A "portable" query means subtly different things on different engines

Mitigation: define operator semantics explicitly and maintain differential tests between the in-memory reference evaluator and each compiler.

### Query declaration becomes coupled to Remote pagination/live policy

Mitigation: distinguish source-neutral query semantics from Remote's ConnectionSpec, QueryRef window, and LivePolicy before extraction.

### TanStack DB creates hidden state beside Foldkit

Mitigation: treat TanStack as an execution/resource engine. Application-observable results still cross an explicit Foldkit boundary; application transitions still use Messages.

### LiveStore and Sync both become durable owners

Mitigation: ownership is selected per datum. Adapters and Module contracts should make conflicting durable ownership visible.

### Generalizing Data destabilizes a mature Remote API

Mitigation: do not generalize Data first. Preserve Remote.make / RemoteDomain; discover a common interface from actual secondary adapters.

---

## 26. External references checked for this design

The design was checked against the current public documentation in September 2026:

- TanStack DB overview: https://tanstack.com/db/latest/docs/overview
- TanStack DB live queries: https://tanstack.com/db/latest/docs/guides/live-queries
- TanStack DB query collection: https://tanstack.com/db/latest/docs/collections/query-collection
- LiveStore Store API 0.4: https://docs.livestore.dev/api/livestore/classes/store/
- LiveStore changelog 0.4: https://docs.livestore.dev/changelog/

These are references, not dependencies. The architecture should survive changes in either external project.

---

## 27. Final thesis

Foldkit Plus does not need another data architecture.

The current repository already contains:

~~~text
Entity
  ↓
Selection / Remote Query
  ↓
Data (RemoteDomain)
  ↓
Remote
  ↓
RemoteServer
  ↓
remote-drizzle
~~~

LiveStore shows the value of durable local materialization and reactive local SQL.

TanStack DB shows the value of source-independent structured queries, query-driven loading, incremental derived views, and adapter-based execution.

The next Foldkit Plus step is therefore not another store.

It is:

> **Make common query semantics portable and inspectable between domain declaration and execution engine, then prove that seam with multiple interpreters.**

That extends what Foldkit Plus already does well -- explicit ownership, semantic Messages, pure transitions, Surface requirements, normalized Remote state, and interpreter-based adapters -- instead of creating a competing path beside it.
