# Making Foldkit-plus competitive with Convex, Fate, and TanStack DB

After reviewing the current Foldkit-plus architecture and the latest documentation for all three systems, I think the opportunity is substantial.

I would not rewrite Foldkit-plus to imitate any one of them. Instead, I'd build a unified reactive data system on top of your existing Entity, Remote, Surface, Sync, and Bundle abstractions.

The goal should be:

> Define your domain once. Declare what a feature needs. Read, write, cache, persist, synchronize, and react to changes automatically—whether the data lives locally, remotely, or on another device.

The strongest differentiator would be combining Convex-style backend reactivity, Fate-style declarative requirements, and TanStack DB-style local querying without losing Foldkit's explicit state ownership and pure transitions.

## 1. Where the competition is ahead

| Capability                                   | Foldkit-plus today         | Competitor to learn from |
| -------------------------------------------- | -------------------------- | ------------------------ |
| Normalized entity cache                      | Strong                     | Fate                     |
| Field-level selections                       | Strong                     | Fate                     |
| Query batching and deduplication             | Supported                  | Fate                     |
| Optimistic mutations                         | Supported                  | All three                |
| Cache persistence and hydration              | Supported, needs wiring    | Fate                     |
| Streaming entity updates                     | Supported                  | Convex / Fate            |
| Automatic reactive query invalidation        | Partial                    | Convex                   |
| Incremental local relational queries         | Major gap                  | TanStack DB              |
| Persistent, transparent offline transactions | Requires Sync integration  | TanStack DB / Fate       |
| Automatic transactional server mutations     | Application-owned          | Convex                   |
| Cross-query consistent snapshots             | Not established end-to-end | Convex                   |
| Database change capture                      | Requires integration       | Convex                   |
| One-call application setup                   | More assembly required     | Convex / Fate            |

This is based on the documented APIs, not a fresh implementation-level test audit.

The most significant competitive differences are architectural.

Convex — Server reactivity and consistency

Convex tracks which database records or indexed ranges a query depends on. When a relevant transaction commits, it reruns affected queries and updates subscribers, maintaining consistent database snapshots.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.convex.dev\&sz=32)

Convex Developer Hub

+1



Fate — Declarative data requirements

Fate composes view selections, normalizes records, masks unselected fields, and applies live updates through shared cache records. Its persistence layer also supports durable offline mutation queues.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://fate.technology\&sz=32)

fate

+2



TanStack DB — Local database capabilities

Its live query engine supports filtering, joins, sorting, grouping, and aggregation, incrementally maintaining results through differential dataflow. It also supports on-demand synchronization and offline persistence.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://tanstack.com\&sz=32)

TanStack DB Docs

+1



Your current Remote system overlaps significantly with Fate. The larger gaps are the reactive database capabilities of Convex and TanStack DB.

## 2. My proposed architecture

I would introduce three substantial new capabilities:

1. Reactive Query Engine: Maintain derived data incrementally as normalized entities change.
2. Reactive Server Runtime: Track database dependencies and publish changes automatically when transactions commit.
3. Persistent Data Runtime: Tie together cache snapshots, offline transactions, hydration, and synchronization.

These should operate through existing Foldkit Messages rather than creating another application store.

Application / Surfaces / Views

Typed requirements · Messages · Projections · CRUD

Reactive Query Engine

Joins · Indexes · Aggregates · Incremental views

Remote + Sync

Requirements · Mutations · Live changes · Reconciliation

Foldkit Model + Update

Authoritative local state transitions

Persistent Data Runtime

Snapshots · Hydration · Durable outbox · Recovery

Reactive Server Runtime

Dependency tracking · Transactional mutations · Live subscriptions

Drizzle / SQL / Custom Sources

Authoritative data and transaction log

The essential rule is that local derived query results are projections of the normalized Model, not a second independent database authority.

That matters because an incremental query engine will need indexes and materialized results for performance. Those can be treated as disposable, rebuildable indexes over Model data. They shouldn't silently become a second source of truth.

## 3. The improvements I'd build, in priority order

P0 — Declarative mutation effects

A mutation should be able to describe which entity fields, relations, and query memberships it changes. Remote would then reconcile returned patches and automatically revalidate affected requirements that cannot be settled locally.

No more hand-written invalidation for ordinary CRUD operations.

P0 — First-class persistence and offline startup

Turn the existing `RemotePersistence` primitives into a complete lifecycle: restore, render, refresh, save changed records, isolate per principal, and handle cache migrations.

Make persistent caching a configuration option rather than repeated application plumbing.

P1 — Incremental local queries

Add reactive relational queries over the normalized Entity store, with local indexes, joins, filtering, sorting, and aggregates.

This is the biggest step toward TanStack DB parity.

P1 — Database-driven live queries

Build automatic change detection and dependency tracking into `remote-server` / `remote-drizzle`.

Applications shouldn't have to call `hub.changed` manually after every database mutation.

P1 — Durable offline transactions

Integrate Remote and Sync so ordinary user-facing mutations can optionally enter a durable outbox, survive application restarts, and reconcile with server changes.

Preserve distinct ownership models instead of pretending every Remote mutation is inherently offline-safe.

P2 — Transactional reactive server runtime

Add tracked queries, serializable or snapshot-consistent reads, transactional mutation execution, commit notifications, and coherent update delivery.

This would move Foldkit-plus from a strong reactive client library toward a Convex-like backend capability.

## 4. What the developer-facing API should look like

Here's a proposed API, rather than something I'm claiming is currently implemented.

I would build on `Entity`, `Query`, `Mutation`, and `Remote.make`, avoiding the temptation to introduce an unrelated `Collection` abstraction.

### A. Define the domain once

```

import { Schema } from "effect"
import { Entity, Expr, Query, Mutation } from "foldkit-entity"

const Product = Entity.make(
  "Product",
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    price: Schema.Number,
    categoryId: Schema.String,
    stock: Schema.Number,
  }),
)

// Proposed addition: declare reusable indexes.
const Products = Entity.withIndexes(Product, {
  byCategory: ["categoryId"],
  byPrice: ["price"],
})

```

### B. Derive queries and live projections

Rather than requiring developers to choose between separate local and remote query languages, I would extend the existing Entity expression IR.

```

const ProductsByCategory = Query.make(
  "ProductsByCategory",
  {
    entity: Products,
    Input: Schema.Struct({
      categoryId: Schema.String,
    }),
    where: ({ input }) =>
      Expr.eq(
        Products.fields.categoryId,
        input.categoryId,
      ),
    orderBy: [Order.asc(Products.fields.price)],
  },
)

// Proposed client API
const results = Data.query(ProductsByCategory, {
  categoryId: "rings",
}, {
  select: ProductSummary,
  first: 50,
  live: true,
  local: "prefer",
})

```

I'd actually consider keeping `Data.live(...)` as the higher-level public API, rather than introducing many boolean options.

The compiler should select the appropriate strategy:

- Local: If the cache holds a provably complete dataset for the query, execute locally.
- Remote: If the cache is incomplete, push the supported query to the server.
- Hybrid: Fetch missing rows and maintain a local derived result from subsequent patches.
- Offline: Return an explicitly partial or stale result when completeness cannot be guaranteed.

That last point is essential. You cannot safely treat an incomplete local cache as the entire database.

### C. Make mutations self-reconciling

```

const RenameProduct = Mutation.make(
  "RenameProduct",
  {
    Input: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),

    // Proposed: normalized server return selection
    returning: Product.select({
      id: true,
      name: true,
    }),

    // Proposed: declarative optimistic transform
    optimistic: ({ id, name }) => [
      Product.patch(id, { name }),
    ],

    // Proposed: what might have changed
    affects: ({ id }) => [
      Product.ref(id),
      ProductsByCategory.membership(),
    ],
  },
)

```

Now the runtime could:

1. Apply the optimistic rename.
2. Send the server operation with an idempotency key.
3. Merge the confirmed fields.
4. Determine whether affected query membership is still known.
5. Revalidate only what it cannot reconcile.
6. Release the optimistic layer when confirmation semantics are satisfied.

I wouldn't require every mutation to specify `affects`. Ideally, writes performed through a tracked Entity database adapter produce much of that information automatically. `affects` remains useful for custom external Sources and non-obvious side effects.

### D. Make persistence and live subscriptions easy to configure

```

const Data = Remote.make({
  model: App.model.remote,
  entities: [Products],

  // Proposed additions
  persistence: {
    adapter: IndexedDB,
    scope: ({ principal }) => principal.cacheScope,
    maxBytes: 50_000_000,
    hydrate: "before-render",
    write: "incremental",
  },

  live: {
    transport: "auto",
    reconnect: true,
    resume: true,
    onGap: "resync",
  },
})

```

This should compile into Wiring rather than concealing a separate lifecycle system.

The application can then opt into one consistent behavior: first render cached data, refresh if necessary, subscribe when active, and persist changes.

The more advanced APIs remain available for custom behavior.

## 5. The hardest capability: truly reactive server queries

This is where Convex is substantially more ambitious than a normalized cache.

Consider the query:

```
SELECT *
FROM products
WHERE category_id = 'rings'
ORDER BY price
LIMIT 20;
```

Changing a product's name probably doesn't affect the query's membership or order. Changing its category or price might.

A naive live backend invalidates every product query whenever any product changes. A Convex-like backend knows more precisely which queries depend on which data.

I'd implement this in stages.

Level 1 — Table-level invalidation

Easy

Any product write invalidates relevant product queries. Correct but potentially expensive.

Level 2 — Entity and field dependencies

Medium

Use the existing Entity/Expr IR to know that a query depends on category, price, and selected result fields.

Level 3 — Index/range dependencies

Hard

Track which indexed predicates and key ranges were read, including rows that did not exist yet.

Level 4 — Transactionally consistent delivery

Hard

Ensure observers receive coherent updates corresponding to committed snapshots, without mixing changes from different logical transaction points.

You already have one advantage: Entity's expression language is an inspectable intermediate representation.

It should be possible to use that IR to derive much of the dependency information statically.

For example:

```
Query.dependencies(ProductsByCategory)

// Conceptual result
{
  entity: "Product",
  predicateFields: ["categoryId"],
  orderFields: ["price"],
  outputFields: ["id", "name", "price"],
}
```

But this alone isn't enough for full Convex semantics. You also need to account for joins, inserts into previously empty ranges, authorization-sensitive fields, and database transactions that modify multiple entities.

For Drizzle-backed mutations, I would first implement an explicit transaction wrapper that collects committed changes and publishes them only after commit.

Later, support database CDC or an outbox table for changes originating outside Foldkit-plus. That would also let multiple server instances observe one another's writes.

## 6. A critical design decision: don't build another TanStack DB internally

TanStack DB's differential dataflow engine is sophisticated. Reimplementing incremental joins, aggregation, ordering, and indexed query maintenance from scratch is a substantial project.

I would introduce a pure query-engine interface first:

```
interface QueryEngine {
  compile(query: QueryIR): QueryPlan

  evaluate(
    plan: QueryPlan,
    snapshot: EntitySnapshot,
  ): QueryResult

  apply(
    plan: QueryPlan,
    previous: QueryResult,
    changes: EntityChangeSet,
  ): QueryResult
}
```

Then experiment with three backends:

| Backend                    | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| Existing `Expr.evaluate`   | Correctness/reference implementation          |
| Indexed incremental engine | Efficient incremental queries                 |
| SQL/SQLite-backed engine   | Persisted local querying, native applications |

TanStack DB's `d2ts` would be worth evaluating as an implementation dependency before writing your own engine.

The key requirement is that query indexes remain derived state. Rebuilding one should never change the application's meaning.

I'd also keep the query IR and execution separate. A complex aggregation might compile to SQL on the server, an incremental plan in the browser, and another native engine on desktop.

That aligns with the broader platform-independent direction of your architecture.

## 7. Offline transactions need stronger guarantees than caching

Your existing `RemotePersistence` handles disposable server facts. `foldkit-sync` handles durable edits.

To make them feel seamless, I'd introduce a shared mutation execution policy.

```

const UpdateProduct = Mutation.make(
  "UpdateProduct",
  {
    Input: UpdateProductInput,

    // Proposed
    delivery: "durable",

    optimistic: ({ id, changes }) => [
      Product.patch(id, changes),
    ],

    conflict: "server-revision",
  },
)

```

Behind this relatively simple declaration, the runtime would need to guarantee:

- The edit is durably stored before reporting it as safely queued.
- Each operation has a stable ID for idempotent server handling.
- Queued operations recover after restart.
- Retried operations cannot be accidentally applied twice.
- An optimistic edit remains visible until server acknowledgment and cache reconciliation.
- Conflicts produce a typed, recoverable state.
- Multiple tabs cannot independently deliver the same queued operation without coordination.

Not every mutation should be durable by default. Payment actions, external emails, and non-idempotent operations need explicit semantics.

Crucially, a successful HTTP response is not always the same as confirmation that the returned data has been incorporated into the local live view.

I'd expose that distinction through mutation status.

## 8. Recommended implementation roadmap

Implementation checklist

0 / 20 complete

Phase 1 — Close the data-client gaps

Mutation effects and targeted invalidation

Automatic persistence wiring

Reconnect, resume, and gap recovery

Mutation status and confirmation semantics

Phase 2 — Local reactive database

Shared Query IR and query planner

Reference evaluation and incremental indexes

Local joins, filtering, ordering, aggregates

Query completeness and provenance tracking

Phase 3 — Offline-first integration

Durable mutation execution policy

Remote + Sync outbox bridge

Crash recovery and multi-tab coordination

Conflict policies and reconciliation

Phase 4 — Reactive backend

Transactional mutation adapter

Commit-driven change publication

Dependency-tracked subscriptions

Versioned snapshot consistency and CDC

Phase 5 — Developer experience

One-call app/server configuration

Query and mutation inspector

Automatic dependency visualization

End-to-end examples and benchmark suite

&#x20;Copy roadmap as Markdown

## 9. How I'd prove the improvements are worthwhile

Rather than measure only feature parity, I'd create a benchmark that exercises the entire reactive data path.

Use your existing product registry example with 100,000 records and multiple clients. Compare:

| Scenario                        | What to measure                                      |
| ------------------------------- | ---------------------------------------------------- |
| Cold navigation                 | Network requests, payload bytes, time to usable data |
| Warm navigation                 | Cache reuse and time to render                       |
| Single field mutation           | Number of affected projections and network requests  |
| 100,000-row sorted grid         | Local query update latency                           |
| Two simultaneous mutations      | Optimistic reconciliation correctness                |
| Offline edit and restart        | Recovery and convergence                             |
| Subscription disconnect         | Missed-event detection and recovery                  |
| Transaction updating 5 entities | Whether observers ever see a mixed snapshot          |
| Multi-user access               | Field authorization and cache scope isolation        |

Tests should verify correctness invariants first, then benchmark latency, throughput, memory, and network efficiency.

For the incremental query engine, use your current `Expr.evaluate` as the reference oracle: after every generated sequence of inserts, updates, and deletes, compare its full recomputation against the incremental engine's results.

For server reactivity, test transaction boundaries, gaps, phantom inserts, permission changes, and reconnects. These are the cases in which a system can appear to work while silently showing incorrect data.

## 10. Where I think Foldkit-plus could actually be better

Convex, Fate, and TanStack DB each make a different architectural commitment.

Convex tightly integrates database and runtime. Fate concentrates on normalized view-driven fetching. TanStack DB provides a rich local reactive database.

Foldkit-plus could bring these capabilities together without requiring every application to adopt the same backend or runtime.

The distinctive advantages would be:

One declared domain: Entity and its associated contracts can be interpreted by the client, server, SQL backend, query engine, form generator, and agent interface.

One transition architecture: Local application state, remote cache state, and replicated state remain inspectable through Foldkit's Model and Messages, with explicit ownership.

Portable interpreters: The same semantic declarations could theoretically target browser, Node, SQLite, mobile, or native Rust runtimes.

Inspectable behavior: The system can explain why a query fetched, which entities it depends on, why an operation remains pending, and which mutation invalidated a projection.

Optional backend adoption: A developer could use Remote against an existing API, then add persistence, live updates, or a full reactive server without changing the way views declare their requirements.

There is a tradeoff: a modular system is harder to make seamless than a vertically integrated one. The developer experience must therefore be a first-class architectural concern, not a layer of documentation added at the end.

### The single most important improvement

I'd prioritize a shared reactive query and dependency model spanning the client and server.

You already have pieces of it:

`Entity → Expr → Query → Selection → Requirements → Remote → Drizzle`

The next evolution is:

`Entity → Query IR → Dependencies → Execution → Changes → Incremental Reconciliation`

Once this exists, automatic invalidation, local live queries, more precise server subscriptions, and cross-runtime execution become much more natural.

That is the point where Foldkit-plus starts becoming more than a collection of integrations: it becomes a unified reactive application data architecture.

I would start with a design proposal for that shared query/dependency model, make it work against your existing `Remote` and `Drizzle` packages, and use the registry demo as the executable specification.


Exactly. And I think this points to a much more interesting architecture than simply reproducing Convex or TanStack DB.

The real advantage is that Foldkit-plus has enough static semantic information to understand what an application is doing, not merely execute it.

Effect Schema, Entity, and the expression IR together give you several layers of information:

| Layer               | What the system knows                                          |
| ------------------- | -------------------------------------------------------------- |
| Effect Schema       | Types, validation, transformations, annotations, constraints   |
| Entity              | Identity, fields, relations, derived members                   |
| Traits / operations | Capabilities and domain-specific semantics                     |
| `Expr`              | Predicates, dependencies, and query meaning                    |
| `Query`             | Selection, filtering, ordering, input parameters               |
| `Mutation`          | Input/output contracts and operation identity                  |
| Surface             | Which data a consumer observes and which Messages it can cause |
| Foldkit             | State transitions and Commands                                 |

Put together, these start looking like a typed, inspectable application intermediate representation.

## The deeper opportunity: interpret the same program in multiple ways

Consider a hypothetical declaration:

```
const AffordableProducts = Query.make("AffordableProducts", {
  entity: Product,
  where: Expr.and(
    Expr.eq(Product.fields.active, true),
    Expr.lt(Product.fields.price, Expr.input("maxPrice")),
  ),
  orderBy: [Order.asc(Product.fields.price)],
})
```

Because this is structured data rather than an opaque callback, Foldkit-plus could derive:

Typed Query IR

Product · active = true · price < maxPrice · order by price

SQL compiler

Parameterized queries and indexes

Local interpreter

Evaluate cached records

Dependency analyzer

Fields, predicates, key ranges

Incremental evaluator

Maintain results after changes

Subscription planner

Subscribe to relevant changes

Tooling / Forms

Validation, explain plans, editors

The same declaration could be compiled for PostgreSQL, evaluated against cached entities in the browser, or analyzed to decide whether a database mutation might change a subscribed result.

That last part is especially powerful.

You don't necessarily need to run a query to learn which changes could affect it. You can derive a conservative dependency set from its static expression tree.

For example, changing a product's `description` cannot affect membership or ordering in this query. Changing `active` or `price` might. Changing an output-selected field may affect the displayed result without changing membership.

This distinction could make subscription invalidation dramatically more precise.

## Traits and operations make this even more interesting

I would formalize each operation as a semantic object with multiple interpretations.

Conceptually:

```
const LessThan = Operation.make({
  name: "LessThan",

  // Meaning and input constraints
  input: Schema.Tuple(Schema.Number, Schema.Number),
  output: Schema.Boolean,

  // Interpreters
  evaluate: ([a, b]) => a < b,
  sql: ([a, b]) => sql`${a} < ${b}`,

  // Static information
  traits: [
    Trait.Pure,
    Trait.Deterministic,
    Trait.Comparable,
  ],
})
```

This is illustrative, not the current API.

The important idea is that traits describe what transformations and execution strategies are valid.

For instance:

- Purity: Can the operation be safely reordered, cached, or evaluated without side effects?
- Determinism: Can identical inputs reuse a computed result?
- Indexability: Can a predicate use a database or local index?
- Incrementality: Can a result be updated from a small change rather than fully recomputed?
- Portability: Does the operation have implementations for SQL, JavaScript, and a native target?
- Authorization sensitivity: Does evaluation depend on the current principal?

But these traits must have precise, defensible semantics. Merely annotating a function as deterministic does not prove that it is. Built-in operations could carry trusted properties, while custom operations would need validated interpreters, tests, or conservative fallbacks.

## The architecture I'd aim for

```

Effect Schema + Entity + Operations + Traits
                    |
                    v
           Semantic Program IR
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
    Analysis    Optimization  Validation
        |           |           |
        +-----------+-----------+
                    |
            Execution Plans
                    |
     +--------------+--------------+
     |              |              |
     v              v              v
   Browser       SQL Server      Native
     |              |              |
     +--------------+--------------+
                    |
            Normalized Changes
                    |
                    v
          Foldkit Model / update
                    |
                    v
          Incremental Projections

```

There are some genuinely interesting second-order consequences:

Automatic query indexes: The system could identify frequently used query predicates, suggest appropriate indexes, and potentially build local indexes automatically.

Incremental derived fields: Entity computed members could become dependency-tracked computations, updated only when their inputs change.

Backend portability: The same supported expression subset could compile into SQL, JavaScript, SQLite, or Rust, without duplicating domain semantics.

Program analysis: A development tool could statically explain why a query needs particular fields, whether it can execute offline, and which mutations might invalidate it.

Schema evolution: With enough explicit schema metadata, the system could analyze compatibility and generate parts of migration plans, though data transformations and destructive migrations would still require care.

AI integration: An agent could inspect the available operations, their input Schemas, permissions, and effects to construct well-typed application intents rather than inventing arbitrary database queries.

## One architectural decision I would make early

I would distinguish three things:

1. Meaning: The canonical semantics of an expression or operation.
2. Properties: Proven or declared traits that justify optimizations.
3. Interpretation: How that operation executes on a particular backend.

And I'd make the semantics canonical, not the SQL or JavaScript implementation.

That prevents a subtle but serious problem: JavaScript, SQL, and Rust differ in their handling of nulls, numeric values, string comparisons, and other operations. Compiling the same expression into three languages does not automatically mean it has the same meaning in all three.

The project should have a reference interpreter and cross-backend conformance tests.

Likewise, static dependencies alone cannot establish transactionally consistent live queries. You still need commit ordering, versioned snapshots, and a reliable change stream.

But the static IR makes those systems far more tractable.

The potentially novel direction here is not a better cache or reactive database in isolation. It's a declarative application language in which the database, local query engine, reactive subscriptions, server operations, forms, and agents are different interpreters of a shared semantic model.

And unlike designing that language from scratch, you already have a substantial foundation in Effect Schema, Entity, Foldkit's update architecture, and your existing Remote expression/compiler machinery.

# Foldkit-plus: Reactive Data Platform Implementation Plan

**Date:** 2026-10-09  
**Target:** `doeixd/foldkit-plus` (main; source inspected through GitHub repository connector)  
**Status:** Proposed implementation plan, not implemented  
**Goal:** Extend the existing Entity → Query/Expr → Remote → RemoteServer → Drizzle architecture into a coherent reactive client/server data platform with local incremental queries, automatic mutation reconciliation, durable caching, optional offline writes, and transactional live updates.

## 0. Executive decision

**Do not create another independent application state store, replace Foldkit's update loop, or invent a competing domain/query DSL.** Keep `foldkit-entity` as the semantic authority for entity identity, Schema constraints, query AST, and reference evaluation. Compile the existing Query IR into multiple engines; keep all observable client data and operation status in the Foldkit Model, reduced by Messages. Treat local indexes as derived, reconstructible accelerators.

The first valuable release is **automatic and correct mutation reconciliation + persistence wiring + dependable live recovery**, not a fully reimplemented Convex. The second milestone is incremental local query evaluation. Transactionally reactive server queries are later and require explicit commit/change-feed guarantees.

## 1. Repository inspection: existing capabilities and reuse points

| Existing code | Observation | Reuse/extension |
| --- | --- | --- |
| `packages/entity/src/index.ts` | `EntityIdentity` includes symbol token distinct from display name; Entities hold intrinsic fields, relations and derived members; Effect Schema and metadata are first-class. | Build on owner identity and Schema, do not use names as semantic identity inside process. Define wire-stable registry ids separately. |
| `packages/entity/src/expr.ts` | A deliberately limited, typed query AST: literal, field, input, `Eq`, `Null`, `Contains`, predicates; query clauses and dependencies; not arbitrary SQL/JS. | Extend only from demonstrated use cases. Add semantic analysis as an additive module. |
| `packages/entity/src/evaluate.ts` | In-memory reference evaluator defines SQL-like null behavior, portable ASCII-folding containment, and rejects problematic NUL text. | Oracle for differential/incremental implementations and cross-dialect tests. |
| `packages/remote/src/query.ts` | `Query.define` accepts a relational body; `Query.make` may be opaque and server-defined; query identity uses canonical input and excludes pagination window. | Preserve both forms. Only statically analyze definitions with a body; opaque queries declare dependencies or conservatively invalidate. |
| `packages/remote/src/policy.ts` | `cacheFirst`, `staleWhileRevalidate`, `networkOnly` already exist. | Expose lifecycle policies at composition boundary rather than another fetch mode. |
| `packages/remote/src/persistence.ts` | `snapshotOf`, hydrate/dehydrate, save/restore; scope/version checks, entity store, optionally explicitly selected connection edges. Runtime ledgers/cursors are excluded. | Add lifecycle wiring, incremental storage optimization, scope migration and retry; retain current disposable-cache semantics. |
| `packages/remote-server/src/index.ts` | Source-level field read authorization, RPC compilation and `liveHub` for changed/deleted entity signals. | Introduce commit-aware publisher and dependency-aware query observers; preserve principal-specific authorized re-reads. |
| `packages/remote-drizzle/src/compile.ts` | Compiles the shared query AST into Drizzle SQL with source visibility applied elsewhere. | Add dependency plans, mutation capture/transaction adapter, then dialect conformance. |
| `docs/wiring.md` + `packages/bundle` | One integration list can derive runtime update, init, subscriptions, resources, Module contracts. | Implement persistence and live integrations as Wiring values, not hidden side stores. |
| `docs/editing-server-data.md` | Journal owns offline edits; SQL table is read model and Remote is cache. | Reuse Sync/Durable for offline writes; avoid pretending all Remote mutations are durable. |
| `examples/kitchen-sink` and `examples/registry` | Existing integrated server/live and large offline registry examples. | Make these end-to-end conformance fixtures, then add benchmarks. |

### Existing known findings to check rather than assume unfixed

`docs/design/query-native-FINDINGS.md` records historical (2026-09-30) problems: ASCII/Unicode/NUL divergence, DAG traversal amplification, mutable AST nodes, owner-name dependency collisions and Effect RC import compatibility. The **current** `evaluate.ts` already includes ASCII folding and NUL rejection, so that finding is not simply current truth. Audit each finding against the latest source and tests, close resolved findings, and add regressions for still-open ones before extending the IR. The prior report is not proof that every item remains open.

## 2. Non-negotiable invariants

1. **Single authoritative transition path:** Server facts enter `Remote.Model` only through Remote Messages and its reducer; other local application fields through their owning Foldkit update. Derived indexes are recomputable.
2. **No false completeness:** Matching locally cached rows does not establish a complete query result. Track coverage/provenance; distinguish `Complete`, `Partial`, `Unknown` and `Stale`.
3. **Backend semantic parity:** Query semantics are defined by the Entity reference interpreter and a versioned portable profile; SQL and incremental backends must match or return an explicit unsupported-operation error.
4. **Principal isolation:** Cache, subscriptions, outbox and snapshots are scoped by identity/tenant/authorization context; logout/change of principal invalidates unsafe data.
5. **Authorization at source:** Static dependency analysis is an optimization, never permission to bypass server checks or leak existence.
6. **Transactional visibility:** Do not emit multi-record commit patches to observers as a partially applied logical transaction. When atomicity cannot be guaranteed, advertise weaker semantics.
7. **Reliable delivery claims:** Mutation acceptance, durability, execution and observation are separate states; reconnect cursors and replay guarantees are explicit.
8. **No arbitrary callbacks in portable IR:** Local-only callbacks can be allowed as opaque, nonportable definitions, but cannot silently participate in server pushdown or static dependency tracking.
9. **Bounded computation:** Query AST depth/size, DAG traversal, query fanout, subscriptions and retained caches have explicit budgets.
10. **Backward compatibility:** Existing `Query.define`, `Query.make`, `Data.get/live/query/mutate`, `RemotePersistence` and custom Sources remain valid.

## 3. Package architecture (incremental, not big-bang)

```text
foldkit-entity
  Schema + Entity + Expr + Query IR + reference semantics
            |  analysis / typed dependencies / portable contract
            v
foldkit-query-plan (new; add only if justified by dependency direction)
  compile, optimize, explain, capability profiles
         |             |                 |
         v             v                 v
foldkit-query-local   remote-drizzle   remote-server dependency index
(incremental views)   SQL interpreter  + reactive subscriptions
         |             |                 |
         +------------ Remote -----------+
                     | normalized patches and connection changes
                     v
         Foldkit Model / update / Surfaces
                     |
          persistence wiring + Sync bridge
```

**Dependency rule:** `entity` must not import Remote, Drizzle, server, browser or storage packages. Static analysis of IR belongs in `entity` if it is pure and small; query-plan package only if planner dependencies would otherwise bloat the semantic core. The reference evaluator belongs to Entity. Avoid duplicating a query IR in Remote.

### Representation and traits

Do not introduce a giant generalized `Operation.make` API immediately. First write an internal **operation capability registry** for existing AST tags:

- semantic type signature, null/three-valued logic, deterministic/pure status;
- dependency visitor and transfer function;
- evaluable locally, SQL dialect support, pushdown capability;
- incremental impact support (`exact`, `conservative`, `unsupported`);
- serializable identity/version and security requirements.

Treat Effect Schema annotations as useful metadata, not as proofs that arbitrary user functions are pure, monotone, indexable, or backend-equivalent. Use conservative fallbacks on unknown traits. Only expose public custom operation extensions after conformance, serialization and security decisions are settled.

## 4. Phase 0 — Semantic hardening and baseline (blocking)

**Files:** `packages/entity/src/{expr,evaluate,index}.ts`, Entity query dependency implementation, `packages/remote-drizzle/src/compile.ts`, relevant test suites.

- [ ] Pin baseline commit and capture exact package versions; collect existing API golden/type tests and performance baseline.
- [ ] Inspect each historical query-native finding on current source: ASCII/NUL, DAG visitation, AST mutation, identity-safe dependency reporting, Effect import compatibility.
- [ ] Implement identity-aware DAG traversal with memoization and explicit cycle/size rejection where missing; avoid exponential walks.
- [ ] Freeze/snapshot expression nodes, including nested values where possible; reject mutable/unsupported literal payloads or normalize through Schema encoding.
- [ ] Make semantic dependency keys use owner identity + field, with separate stable public display/wire identifiers.
- [ ] Define a portable semantics document: `null` and missing, booleans, numeric precision/NaN, text matching/collation, ordering/tie breaks, dates, and serialization.
- [ ] Create shared test vectors running reference evaluation against SQLite and supported Postgres dialects; include Unicode, NUL, unknown, empty values, duplicates and cursor ordering.
- [ ] Add type-level API tests and property-based AST fuzzing; malformed/untrusted requests must have bounded execution.

**Exit gate:** Existing tests green; reference evaluator and SQL results agree on the documented portable subset; historical defects either fixed with regression cases or explicitly tracked with accepted limitations.

## 5. Phase 1 — Semantic analysis and mutation impact (first platform feature)

### 5.1 Static dependency analysis

Add a pure `Query.analyze(query)` (or `Query.dependencies` extension) returning semantic identities, predicates, order, result fields, relation traversal, query-input dependencies, and capability requirements. The result must distinguish:

- selected fields: changed output without membership change;
- predicate fields: changes can alter membership;
- ordering fields: changes can alter position and page boundaries;
- relation/join edges and authorization dependencies;
- unknown/opaque body: conservative invalidation.

For a product query filtering category and sorting price, a changed description is irrelevant unless selected; price can reorder; category can insert/remove. Track **phantom eligibility**: a newly inserted row may satisfy a predicate even though no previous result contained that row.

### 5.2 Mutation reconciliation contract

Implement internal `MutationImpact` plus optional declarative annotations on current Mutation descriptors, *without requiring them for basic usage*:

```ts
// Proposed API sketch, not existing API
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
}).pipe(
  Mutation.optimistic(input => [Product.patch(input.id, { name: input.name })]),
  Mutation.affects(input => [Product.ref(input.id)]),
)
```

Server Sources/Drizzle transactions should produce actual changed entity keys, fields and affected relationship edges when possible. Runtime intersects changed facts with active query dependencies:

- return patches cover known changed fields => merge once, remove optimistic layer;
- known query membership/order mutation => apply connection patch if sound, else mark connection stale and refetch observed page;
- unknown source, opaque query, authorization-dependent or insufficient response => conservative invalidation;
- failing mutation => rollback only that operation's optimistic layer;
- concurrent mutation acknowledgments respect request-id idempotency and revision/version order.

**Avoid automatic refetch of every mutation.** Automatically reconcile; intelligently refetch only uncertain active requirements. Preserve `Data.refresh` as manual override.

**Exit gate:** A mutation affecting a field selected by three Surfaces updates all three; no duplicate entity copies; inserts and deletes invalidate relevant paged membership even if the row was not previously cached; unrelated queries do not fetch again when dependencies prove irrelevance.

## 6. Phase 2 — Persistent cache lifecycle (parallel-friendly)

Build on `RemotePersistence`, not a replacement:

- [ ] Provide `Data.persistenceWiring(...)` or `RemotePersistence.wiring(Data, ...)`, with `restore` startup step and save subscription/resource; integrate into `Bundle.assemble` and Module validation.
- [ ] Support `hydrate-before-render` when host/runtime supports a blocking startup barrier; document SSR and async browser startup alternatives.
- [ ] Debounced, change-triggered and on-lifecycle save; crash-safe atomic storage writes; explicit quota handling.
- [ ] Principal-specific key scope, version and schema migration policy, logout purge; treat access-policy revisions as cache scope changes.
- [ ] Persist entity facts and explicitly opted-in connection edges only; never persist live cursors and optimistic mutation ledger as authoritative cache data.
- [ ] Revalidate with existing `RemotePolicy`; permit stale offline display with visible freshness/partiality metadata.
- [ ] Explore IndexedDB adapter with bounded LRU/delta serialization only after the simple KeyValueStore wiring works.

**Exit gate:** Fetch → save → restart without network → display allowed cached fields → reconnect → refresh precisely; tenant switching cannot display the previous tenant's private data.

## 7. Phase 3 — Incremental local queries (TanStack DB-style)

### First support profile

Start with **single-entity queries** using existing equality, null checks, containment, filtering and stable sort; then indexes and bounded pagination. Do **not** promise joins/aggregation in v1. A secondary engine reads **only** the normalized Entity store and its coverage witness.

Proposed internal API:

```ts
interface LocalQueryEngine {
  compile(query: AnyQuery, selection: Selection): QueryPlan
  evaluate(plan: QueryPlan, snapshot: EntitySnapshot): LocalResult
  apply(plan: QueryPlan, prior: LocalResult, changes: EntityChangeSet): LocalResult
}

type Coverage =
  | { _tag: 'Complete'; witness: CoverageWitness }
  | { _tag: 'Partial'; knownRanges: readonly Range[] }
  | { _tag: 'Unknown' }
```

Implementation slices:

1. full recomputation adapter (`evaluate`) with completeness metadata;
2. patch/change-set representation from Remote reducer (including deletion, field unavailable, tombstone, optimistic layer and principal forget);
3. compiled predicate dependency maps and local equality/range indexes;
4. incremental add/remove/move/change with stable ordering and tie-break identity;
5. projection integration (`Data.local` / `Data.query` local strategy), explicit `Partial` state when only cached rows are known;
6. joins via relation refs, then grouping/aggregation after correctness proof;
7. optional WASM/native engine only after backend-neutral conformance suite exists.

**Important:** materialized query results may live in Model if rendered/stateful semantics demand replay, or in reconstructible runtime indexes with a deterministic Model-derived view. If external indexes exist, they cannot be the authoritative source of output; define checkpoint/rebuild semantics and tests that compare them to replayed Model snapshots.

**Exit gate:** Property-based randomized change sequences match reference full recomputation exactly; never claim a complete answer from an incomplete cache; sorting and page boundaries stay correct after insert/delete/reorder.

## 8. Phase 4 — Reactive server subscriptions (Convex-style, staged)

### 4.1 Commit-aware change feed

Create an optional `RemoteServer.transactions(...)` adapter. Drizzle-backed writes record changed entity IDs, fields, affected relation edges, commit version and transaction ID. Publish **after commit**; rollback publishes nothing. For cross-process/out-of-band writes, use database outbox/CDC, not an in-memory hub alone. Preserve custom Sources via explicit publish hooks.

### 4.2 Subscription dependencies

- First: table/entity/field-level invalidation (conservative correctness).
- Next: predicate and index-range dependency tracking, including phantom inserts, deletes and authorization-scoped reads.
- Next: rerun affected server queries, publish normalized **result diffs** or invalidations (not unrestricted raw DB change events).
- Track query identity, input, principal, selected fields, pagination coverage, and backend revision.
- Dedupe and coalesce repeated invalidations while preserving commit order.

### 4.3 Snapshot consistency and recovery

- Give a transactionally consistent query result a commit/version anchor.
- Group multi-entity patches from the same commit and reduce atomically as one Remote Message where necessary.
- Define reconnect/resume token longevity; if tokens expired or gap detected, take snapshot then resubscribe without a race (snapshot-at-version plus feed-after-version or equivalent).
- Reauthorize on refresh and account changes, including field access revoked after a session begins.
- Support clear transport-level guarantees (SSE, WebSocket or Effect RPC stream) separately from storage durability; `liveHub` alone is per-process and insufficient for distributed cross-node guarantees.

**Exit gate:** A 5-record transaction is never observed as an inconsistent partial state; changes made on another server instance reach clients; reconnect with dropped events converges; unauthorized fields never leak.

## 9. Phase 5 — Durable offline writes (reuse Sync/Durable)

Expose an explicit mutation delivery policy rather than implicitly queue all Remote mutations:

```ts
// Proposed shape
Mutation.delivery({ mode: 'durable', conflict: 'server-revision' })
```

Separate statuses: `Optimistic`, `QueuedDurably`, `Sending`, `Accepted`, `Committed`, `Observed`, `Conflicted`, `Failed`. Reuse Sync's journal/outbox for client-authored durable operations; map settled server commits into Remote patches and read-model revisions. Use stable operation IDs; authenticated and authorization-checked server idempotency records; replay-safe transaction behavior.

**Mandatory tests:** kill before persistence, kill after persistence before send, drop acknowledgment after server commit, two tabs sending same operation, rejected operation, permission change, conflicting edits, row revised while offline. Ordinary non-idempotent external side effects must not be queued by default.

## 10. Phase 6 — Developer experience and observability

- [ ] Preserve lower-level composition; add a one-stop `Data.wiring(...)` preset that opts into persistence/live/local query adapters explicitly.
- [ ] `Data.explain` includes source strategy (local/remote/hybrid), coverage witness, dependencies, invalidation reason, selected plan, and last commit version.
- [ ] Inspect mutation lifecycles, subscription health, gap recovery and cache persistence state **from the Model or explicitly labeled runtime diagnostics**, never deceptively merge them.
- [ ] Generated index hints and plan visualizations based on observed/static query shapes; do not silently create production SQL indexes.
- [ ] Documentation: minimal CRUD app, offline product editor, 100k-row live data grid, multi-user reactive board, and custom API Source fallback.
- [ ] Operator/trait extension guide with explicit portability and security constraints.

## 11. Proposed tracked work (issue-sized)

| ID | Priority | Deliverable | Dependencies |
| --- | --- | --- | --- |
| RD-001 | P0 | Semantic parity/defect audit + shared conformance tests | None |
| RD-002 | P0 | Canonical identity-aware dependency analyzer | RD-001 |
| RD-003 | P0 | Change-set and mutation impact representation | RD-001, RD-002 |
| RD-004 | P0 | Targeted mutation reconciliation + query invalidation | RD-003 |
| RD-005 | P0 | Persistence lifecycle Wiring + principal isolation | None; coordinate with RD-004 |
| RD-006 | P1 | Reliable reconnect/resume gap recovery integration tests | RD-001 |
| RD-007 | P1 | Query coverage/completeness types and invariants | RD-002 |
| RD-008 | P1 | Local engine reference adapter | RD-007 |
| RD-009 | P1 | Incremental indexes and query maintenance | RD-008, RD-003 |
| RD-010 | P1 | Local query integration with Surfaces | RD-009 |
| RD-011 | P1 | Transactional Drizzle mutation and commit feed | RD-003 |
| RD-012 | P1 | RemoteServer dependency subscriptions | RD-002, RD-011 |
| RD-013 | P2 | Snapshot-versioned query delivery + replay across nodes | RD-012 |
| RD-014 | P2 | Durable Remote mutation → Sync bridge | RD-004, RD-005 |
| RD-015 | P2 | Joins/aggregations + index optimization | RD-009 |
| RD-016 | P2 | Explain plans, demos, benchmarking and release documentation | All milestone completions |

## 12. Testing and measurement

### Correctness

- **Semantic golden vectors:** Same query AST/input/rows across `evaluate`, SQLite, Postgres; track unsupported nodes explicitly.
- **Incremental equivalence:** Generate random row transactions and assert `apply(previous, delta) === evaluate(snapshot)` after every step.
- **Completeness proof:** A cached subset never yields `Complete` unless a coverage witness establishes it.
- **Mutation concurrency:** Overlapping optimistic patches, successes out of order, failure rollback, idempotent replay, refetch races.
- **Authorization:** Two principals, field withholding, tenancy changes, midstream revocation, persisted snapshot restoration.
- **Transactional live:** Mixed record transaction, reconnect gap, multi-process feed, cursor expiry, phantom insertion.
- **Offline durability:** Crash at every critical boundary and verify no acknowledged durable operation disappears.
- **Type inference:** Existing public surface retains inference; new query/operation combinations fail at the declaration site.

### Benchmarks (establish baseline before choosing targets)

Use `examples/registry` with 100k rows and fixed seed; compare cold/warm render, local 1-row change incremental latency, 10k sequential updates, memory retained, query I/O, 2-client convergence, and a 5k-subscriber synthetic feed. Evaluate against existing Remote full-refresh behavior and at least one relevant competitor where reproducible. Do not promise unmeasured performance superiority.

## 13. Deployment and migration strategy

1. Land semantic fixes behind existing APIs and regression tests (no breaking query change).
2. Add pure analyzer and mutation impact as optional, side-effect-free APIs.
3. Enable precision invalidation only when analyzer is sound; otherwise fall back to current explicit/conservative refresh.
4. Introduce persistence wiring as opt-in; preserve default session-only cache behavior.
5. Ship local engine experimental, compare its results to the reference interpreter in tests and optionally at runtime in development.
6. Ship transactional reactive server as opt-in Drizzle adapter; keep in-process `liveHub` and custom Source paths working.
7. Add a documented stable feature level for each execution backend; publish a compatibility matrix by SQL dialect, browser, and Effect version.
8. Promote to stable only when cross-runtime conformance and crash/reconnect tests pass.

### Out of scope for initial launch

- Automatic full Convex backend hosting/deployment.
- Arbitrary JS callbacks compiled to SQL or Rust.
- General differential dataflow engine with unrestricted recursive joins.
- Strong distributed transactions across unrelated external APIs.
- Transparent conflict-free offline writes for arbitrary mutations.
- Silent schema migration of destructive changes.

## 14. First PR sequence (recommended next actions)

1. **PR A:** Audit `query-native-FINDINGS`, semantic test corpus, cycle/DAG/immutability/identity regression tests. Include a report of what is already fixed.
2. **PR B:** Add `analyzeQuery` with typed field ownership, predicate/order/output classification and opaque fallback. No runtime coupling.
3. **PR C:** Introduce `EntityChangeSet`/`MutationImpact`; hook it into Remote reducer and Drizzle mutation outcomes; tests for missing/phantom rows.
4. **PR D:** Implement observed-query targeted invalidation + mutation reconciliation; preserve manual refresh.
5. **PR E:** Introduce `RemotePersistence.wiring` with scoped restore/save and offline cache startup example.
6. **PR F:** Define `CoverageWitness` and a local query full-recompute engine, then incremental indexing.

**Acceptance for first public milestone:** Existing Foldkit apps compile unchanged; mutation patch is visible to every selected Surface; relevant paged queries update or revalidate; persistence restores from offline and respects principal scope; no regressions in reference/SQL query semantics.

## 15. Source pointers inspected

- [`packages/entity/src/index.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/src/index.ts)
- [`packages/entity/src/expr.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/src/expr.ts)
- [`packages/entity/src/evaluate.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/src/evaluate.ts)
- [`packages/remote/src/query.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/src/query.ts)
- [`packages/remote/src/persistence.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/src/persistence.ts)
- [`packages/remote/src/policy.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/src/policy.ts)
- [`packages/remote-server/src/index.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-server/src/index.ts)
- [`packages/remote-drizzle/src/compile.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-drizzle/src/compile.ts)
- [`docs/wiring.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/wiring.md)
- [`docs/editing-server-data.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/editing-server-data.md)
- [`docs/design/query-native-FINDINGS.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/query-native-FINDINGS.md)

**Verification limitation:** The inspected GitHub source and documentation substantiate the design and integration points; this planning pass did not clone/build/run the workspace or establish every current defect's test status. Implementation should start with the baseline audit in Phase 0.

Yes, to a large extent. And I think this means the implementation plan should be more ambitious about automatic inference.

Because Foldkit-plus has Entity identities, Effect Schemas, static expressions, and typed query definitions, much of the information needed for mutation reconciliation already exists.

But there's an important distinction between three questions:

1. What can this mutation change? Often statically inferable from its operation definition.
2. What did this mutation actually change? Knowable from the executed operation and its result.
3. Which queries are affected? Derivable by comparing the changes against query dependencies and predicates.

For example, suppose you have:

```
const Product = Entity.make("Product", Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  price: Schema.Number,
  categoryId: Schema.String,
}))

const ProductsByCategory = Query.define("ProductsByCategory", {
  // Query body filters on categoryId,
  // and orders on price.
})
```

If the mutation changes `Product:p123.name`, we know the entity identity and changed field.

We can then determine:

- A detail view selecting `name` should update.
- A detail view selecting only `price` requires no update.
- A query filtering by `categoryId` and ordering by `price` does not need membership or ordering recomputation.
- A list selecting `name` can update its displayed row directly if `p123` is already in that list.

No arbitrary refetch is necessary.

If the mutation changes `categoryId`, however, it might move the product into or out of a query result, so membership needs to be reconsidered.

## What the current implementation is missing

I checked `packages/remote/src/mutation.ts` and `packages/entity/src/expr.ts`.

You already have:

- `NormalizedPatch`: `{ entity, id, values }`
- `MutationAnswer`: returned patches and deleted entity IDs
- `reconcileMutation`: idempotently merges the patches into the cache
- `Query.dependencies`: identifies fields, inputs, and operators used by an expression, preserving Entity identity

So you're quite close.

The missing connection is between the mutation's actual write set and the query's dependency set.

Currently, a `MutationDescriptor` fundamentally describes its name, input Schema, and output Schema. Those Schemas alone don't prove what the server implementation will modify.

For instance, `UpdateProduct({ id, name })` might also update `updatedAt`, recalculate a search index, or modify a related entity. Those effects aren't necessarily present in the input or output Schema.

But if the mutation is expressed as a static operation, the picture changes.

Consider a proposed API:

```
const RenameProduct = Mutation.define("RenameProduct", {
  Input: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),

  operation: Operation.update(Product, {
    id: input => input.id,
    set: {
      name: input => input.name,
    },
  }),
})
```

From this operation, Foldkit-plus could infer the potential write set without any handwritten `affects` list:

```
Mutation.dependencies(RenameProduct)

// Conceptual result
{
  writes: [{
    entity: Product,
    identity: "input.id",
    fields: ["name"],
  }],
}
```

After execution, the runtime would return the actual write set, including database-generated values, triggers, cascading operations, and other changes captured by the transaction.

The query engine could then compare those actual changes against the static query dependencies.

This gives us an architecture where:

- Static operation definitions supply potential effects.
- Transaction execution records actual effects.
- Query dependency analysis determines affected consumers.
- Normalized patches update known data.
- Unresolved dependencies trigger targeted revalidation.

For opaque custom Effect handlers, the system would need an explicit effect declaration or conservative invalidation. It shouldn't infer completeness from an input Schema.

### I'd change the plan accordingly

Instead of making developers manually declare `Mutation.affects(...)`, I would make write-set inference and capture a core part of the operation system.

That is much more aligned with what you're building.

And it leads to a particularly interesting possibility: the same static operation could produce SQL mutations, optimistic client patches, authorization requirements, audit entries, and reactive invalidation information.

You'd have a common semantic model for both reads and writes, which is what you need to approach a genuinely reactive database architecture.

The most important pointer is this: don't think of mutation invalidation as a cache feature. Think of it as a consequence of having a shared semantic language for reads and writes.

Foldkit-plus already has much of the read side:

`Entity → Expr → Query → Dependencies → SQL / Local evaluation`

What you want is the corresponding write side:

`Entity → Operation → Mutation → Write set → Transaction → Changes`

Once those share the same semantic model, you can derive cache updates, invalidation, optimistic changes, subscriptions, and potentially even database transactions.

There are several architectural decisions I'd pay particular attention to.

## 1. Distinguish static write sets from actual write sets

This is probably the single most important distinction to get right.

Consider:

```
const RenameProduct = Mutation.define("RenameProduct", {
  Input: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),

  operation: Operation.update(Product, {
    id: input.id,
    set: {
      name: input.name,
    },
  }),
})
```

There are three useful levels of knowledge:

| Knowledge       | Example                | When available        |
| --------------- | ---------------------- | --------------------- |
| Possible writes | `Product.name`         | Definition time       |
| Targeted writes | `Product:p123.name`    | Invocation time       |
| Actual changes  | `p123.name: "A" → "B"` | Execution/commit time |

The first can tell us which query definitions are possibly affected. The second can narrow that to a specific entity. The third can distinguish a real change from a no-op and evaluate membership changes.

I would make these three stages explicit in your intermediate representation.

```
Operation.analyze(RenameProduct)
Operation.bind(RenameProduct, input)
Operation.changes(execution)
```

This is conceptually similar to compiling a program, specializing it with input, and then obtaining its execution trace.

Don't make a mutation's declared potential writes masquerade as its actual effects.

## 2. Track read and write dependencies at different granularities

Your existing `Query.dependencies` extracts referenced Entity fields. That's a good start, but for precise reactivity you'll want several distinct categories.

Query semantic dependencies

Fields · Predicates · Ordering · Relations · Aggregates

Static

What any invocation of this query might read

Bound

Which predicates, IDs, and ranges this invocation depends on

Observed

Which records, fields, and ranges were actually read

Materialized

Which local result rows and indexes currently exist

Static dependencies allow conservative invalidation. Observed dependencies allow precise server subscriptions. Materialized dependencies enable incremental local recomputation.

I wouldn't collapse them into one `Dependencies` type.

## 3. Build a change-impact engine before building a live database

This is the missing bridge between your existing code.

It could be a small, pure module that answers:

> Given an operation's changes and a query definition, what must happen to maintain correctness?

Something like:

```
const impact = Query.impact({
  query: ProductsByCategory,
  input: { categoryId: "rings" },
  changes: transaction.changes,
  snapshot: cache,
})
```

With a structured result:

```
type QueryImpact =
  | { _tag: "Unaffected" }
  | { _tag: "Patch"; changes: RowPatch[] }
  | { _tag: "Recompute"; ids: EntityId[] }
  | { _tag: "Invalidate"; reason: string }
```

An example of why this matters:

A mutation changes the `price` of an existing product in a sorted list. The engine may know that it needs to reposition that product.

But a paginated list introduces a complication: after moving that product, what record fills the vacated position?

If that record hasn't been fetched, the client cannot know.

So the impact engine might return `Invalidate` for the connection while still immediately patching the product's cached price.

The ability to prove that a local update is insufficient is just as valuable as the ability to update locally.

## 4. Avoid making every mutation a JavaScript callback

If you want automatic analysis, the operations must remain structured values.

Compare:

```
// Opaque
Mutation.make({
  execute: async input => {
    await db.update(products).set({
      name: input.name,
    })
  },
})
```

With:

```
// Inspectable
Operation.update(Product, {
  where: Expr.eq(Product.fields.id, input.id),
  set: {
    name: input.name,
  },
})
```

The second could potentially be interpreted by:

- A Drizzle SQL compiler.
- A local optimistic interpreter.
- A mutation dependency analyzer.
- An authorization checker.
- An audit-log encoder.
- A native Rust backend.

This doesn't mean eliminating custom Effect handlers. It means treating those as escape hatches with explicit capabilities and conservative effects.

An opaque handler shouldn't be assumed to modify only the fields in its input Schema.

## 5. Use Schema traits as semantic capabilities, not just metadata

There are two different kinds of traits you could exploit.

Value traits describe properties of a domain value: equality, ordering, identity, serialization, validation, and perhaps arithmetic.

Operation traits describe properties of a computation: determinism, purity, read sets, write sets, portability, and incremental maintainability.

I'd keep them distinct.

For example, two fields being `Schema.Number` doesn't mean they necessarily have the same business semantics. One might represent cents, another a percentage, and another a quantity.

You could use Schema annotations to attach semantic properties, but avoid making the entire compiler depend on a growing collection of unverified annotations.

A particularly useful feature would be an interpreter capability check:

```
Query.supports(ProductSearch, LocalEngine)
// { supported: true }

Query.supports(ProductSearch, SqliteEngine)
// { supported: false, missing: ["fullTextSearch"] }
```

Better yet, the query compiler could provide a precise fallback or decomposition when part of an expression is unsupported.

## 6. Keep SQL and local evaluation semantically equivalent

This should be a hard requirement before you make local query execution authoritative for UI behavior.

The repository's expression interpreter already explicitly models SQL's three-valued logic and ASCII case folding for containment.

Build on those decisions.

I'd add property-based conformance tests that generate:

- Typed expression trees.
- Valid and invalid inputs.
- Nullable rows.
- Multiple Entity identities.
- Sorting edge cases.
- Insert/update/delete sequences.

Then evaluate the same query using the reference interpreter and SQLite, comparing normalized results.

When a backend cannot preserve the semantics, its compiler should reject that operation rather than silently approximate it.

One caution: numeric operations, collations, timestamps, and encoded Schema transformations will make this harder as the expression language grows.

## 7. Make incremental maintenance a separate interpreter

I wouldn't put a sophisticated incremental query engine directly inside `foldkit-entity`.

Entity should continue to define semantics and provide a simple reference evaluator.

An optional package, perhaps `foldkit-query-incremental`, could consume the same IR:

```
const plan = Incremental.compile(ProductsByCategory)

const initial = Incremental.evaluate(plan, snapshot)

const next = Incremental.apply(plan, initial, {
  entity: Product,
  id: "p123",
  before: { price: 20 },
  after: { price: 25 },
})
```

That engine could initially recompute the affected query and later specialize common patterns into efficient incremental operators.

TanStack DB is useful prior art here: its current live-query implementation uses differential dataflow to maintain derived collections incrementally.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://tanstack.com\&sz=32)

TanStack DB Docs

+1



I'd evaluate reusing that technology before developing a general-purpose incremental relational engine from scratch.

## 8. Model updates as transactions, not individual patches

This is especially important when a mutation changes multiple entities.

Imagine a transfer:

```
Account A: -$100
Account B: +$100
```

If the client receives those as separate, independently rendered changes, it can temporarily display an inconsistent total.

The logical unit of reactivity should therefore be a committed change set:

```
interface ChangeSet {
  transactionId: string
  revision: bigint
  changes: readonly EntityChange[]
}
```

All changes in one transaction should be incorporated before projections are recalculated.

For browser-side Foldkit, that can mean reducing one Message containing the complete change set.

On the server, it means publishing only after successful commit and preserving commit ordering.

This is one of the foundations necessary for Convex-style consistent reactive queries.

## 9. Distinguish query invalidation from query maintenance

A query can react to a mutation in several ways.

Unaffected: None of the relevant dependencies changed. Do nothing.

Patch: Only a selected field changed. Update that row in the normalized store.

Maintain: A predicate or sort key changed, and enough data is available to recompute membership or position locally.

Invalidate: The system cannot prove the correct result locally. Mark it stale and refetch.

This should be an explicit decision returned by a pure function, not a series of hidden side effects.

That makes it testable, explainable, and reusable on the server and client.

## 10. Don't expand the query language too quickly

Your existing `Expr` deliberately supports a small set of operations such as equality, null checks, and containment. That's a reasonable choice.

I would expand it in response to concrete needs, in roughly this order:

1. Boolean composition (`and`, `or`, `not`) and comparisons (`lt`, `lte`, `gt`, `gte`).
2. Sets and ranges (`in`, `between`).
3. Explicit ordering, stable pagination, and indexed predicates.
4. Relations and joins.
5. Aggregates and grouping.
6. Derived fields and custom operations.

Every new operation should have defined semantics, reference evaluation, supported backend interpreters, and conformance tests.

Otherwise, the supposed advantage of having a shared IR erodes as backends begin disagreeing.

## 11. My strongest architectural recommendation

Introduce a small semantic operation kernel that both queries and mutations can build upon, but don't prematurely merge their public APIs.

Queries describe observations. Mutations describe state changes. They can share expressions, Entity references, traits, dependency analysis, and interpreters without becoming the same abstraction.

I'd aim for this:

```
                     Effect Schema
                          |
                        Entity
                          |
                  Semantic Operations
                     /         \
                    /           \
               Query IR      Mutation IR
                  |              |
             Read effects    Write effects
                  \              /
                   \            /
                  Change Impact
                        |
                 Reactive Runtime
                   /         \
                  /           \
          Local execution   Server execution
```

The first prototype I'd implement is quite small:

- Define a static Entity update operation.
- Extract its possible write set.
- Bind it to concrete input values.
- Execute it against an in-memory store.
- Produce a change set with before/after values.
- Analyze its effect on several existing queries.
- Reconcile the normalized Remote cache or request targeted revalidation.
- Compare the resulting query outputs against full recomputation.

That would validate the central idea without first implementing a new server runtime, database engine, or synchronization protocol.

The crucial test is whether you can eliminate handwritten cache invalidation while retaining correctness. Once you prove that for static CRUD operations, you have a foundation that can extend toward incremental queries, optimistic updates, durable operations, and eventually transactional reactive subscriptions.



6. What I would change
The current implementation requires developers to describe essentially the same mutation effect in multiple places:
Place	What developer specifies
Mutation.make	Input/output contract
Data.mutate	Optional optimistic patches
RemoteServer.mutation	Actual database operation and resulting patches
hub.changed	Fields to publish as live changes
Data.refresh	Additional data to revalidate when necessary
I'd aim to eliminate most of that duplication.
For example, a future API might be:
const RenameProject = Mutation.define("RenameProject", {
  Input: {
    id: Schema.String,
    name: Schema.String,
  },

  operation: Operation.update(Project, {
    where: ({ input }) =>
      Expr.eq(Project.fields.id, input.id),

    set: ({ input }) => ({
      name: input.name,
    }),
  }),
})


From this structured operation, the system could derive the optimistic patch, compile the database update, capture the actual changed fields, reconcile the normalized cache, and publish committed changes to subscribers.
That isn't possible from the current Mutation.make descriptor alone, because its handler is an opaque Effect computation.
My assessment
Your read side is already substantially more declarative than your write side.
Queries have a semantic IR and dependency analysis. Mutations currently have typed contracts but mostly opaque implementations.
I would make the next architectural improvement a static Mutation/Operation IR built on the existing Entity and Expr system, retaining RemoteServer.mutation for custom operations.
That would allow automatic reactivity to be derived from the operations themselves rather than repeatedly specified by developers.
Sources: Mutation implementation, Remote API, Server mutation API.