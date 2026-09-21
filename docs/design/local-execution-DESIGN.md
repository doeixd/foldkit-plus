# Local execution: what TanStack DB and LiveStore have that we do not

**Status:** design / implementation plan
**Date:** September 2026
**Target packages:** `foldkit-entity`, `foldkit-remote`, `foldkit-surface`
**External prior art:** TanStack DB, LiveStore 0.5
**Internal prior art:** `doeixd/tanstackstart-db`
**Companion:** [`data-query-DESIGN.md`](./data-query-DESIGN.md) — §4.5–4.11, §19, §20, §21, §31

---

## 0. Findings

| Finding | Where |
| --- | --- |
| **The client-side query engine already exists and is on the wrong side of the wire.** `foldkit-remote-server`'s `evaluate` is pure, runs the whole operator kernel, and imports nothing but `foldkit-entity`. | [§7](#7-the-keystone) |
| **Membership, not the engine, is the real blocker.** A connection's rows are server-delivered edges; nothing on the client ever evaluates a body. That one fact explains the optimistic-placement guess, §21's containment problem, and why a local engine feels like a second authority. | [§4](#4-blocker-2--membership-only-ever-comes-from-the-server) |
| **"No IVM" is mostly one memo key.** Reads memoize on the store *object*, so any write re-decodes every visible row of every active connection. Untouched entries keep their identity across a write, so a per-entry memo recovers most of the benefit with no API change. | [§3](#3-blocker-1--reads-recompute-from-scratch) |
| **Four of LiveStore's six contributions are already built under other names.** What is missing is a durable *queryable* local read model — and it is available without adopting LiveStore's event log, which would collide with Sync/Durable. | [§5](#5-blocker-3--nothing-durable-and-queryable-locally) |
| **Five of tanstackstart-db's seven route ideas are present, and the sixth is ahead of the original.** Dependent reads are solved at the data level by the planner rather than as route-loader stages. | [§6](#6-blocker-4--the-page-contract-is-opaque-at-its-edges) |
| **The conformance suite can become a guarantee rather than a test**: that the optimistic local answer equals the eventual server answer. | [§9](#9-the-conformance-suite-becomes-a-guarantee) |
| **Local execution is how Phase 13's gates open without violating §28.** Ship client-side filtering and real callers for `or` appear on their own. | [§10](#10-gates-that-open-themselves) |

---

## 1. What this document is for

Two engines keep coming up as things this project might want to be more like.
This says exactly which of their benefits are already here, which are missing,
and what it would take to get the missing ones — with a sequence.

The framing that matters: **eleven wanted capabilities reduce to four
blockers**, and one of the four is load-bearing for most of the rest.

---

## 2. The inventory, honestly

Before proposing anything, what is already true.

### From TanStack DB / tanstackstart-db

| Idea | Here |
| --- | --- |
| Query composition ≠ read-contract composition (§4.5) | `Query.define` carries the body; `readContract` shapes the consumer read |
| Logical key vs resource key (§4.6) | `QueryRef.identity` excludes the window; requirements merge on identity + window, so two Selections share one fetch |
| Selection pushed down *or* materialized later (§4.7) | Four interpreters decide independently; the application does not care |
| Optimistic transactions (§4.10) | Remote's layers and connection overlays, recomputed rather than patched with inverses |
| `.required()` | Settled and removed — §11's expectation had no consumer |
| `.live()` | The subscription's policy, deliberately not the query's |
| Incremental view maintenance | **Missing** — §3 |
| Joins, aggregates, derived collections | Phase 13, gated on a real caller |

### From LiveStore

| Contribution (§4.11) | Here |
| --- | --- |
| durable events | `foldkit-durable` — journal on Effect SQL, server-assigned canonical sequence, explicit admission/rejection, snapshot + cursor |
| materializers | the application's own `update`; Sync derives replay from it, so there is no second reducer to keep honest |
| atomic event commits | Sync's IndexedDB compare-and-swap on revision; Durable's SQL journal |
| offline persistence | Sync's IndexedDB replica |
| **local SQLite** | **Missing on the client** — Durable's journal is `@effect/sql-sqlite-node`, which is the server |
| **reactive SQL** | **Missing** — reads go through the normalized store, not a query engine |

### From tanstackstart-db's routes (§31.8)

| Idea | Here |
| --- | --- |
| page reads are explicit | a Surface's `model` **is** the page's read list |
| read shapes are late-bound | `select:` at the call site, not on the definition |
| route params feed reads | proved by §32 Phase 5 |
| contracts reusable as fragments | Selections compose; Surface subsets compose under an application identity token |
| dependent read stages | **ahead of the original** — see §6 |
| actions bound at the page boundary | half: the Message subset is declared, not bound with data |
| SSR/preload policy inspectable | absent; gated on `packages/ssr` |

---

## 3. Blocker 1 — reads recompute from scratch

`Data.query`'s read memoizes on the *visible store object*:

~~~text
write one field
      ↓
new EntityStore object
      ↓
memo miss for every connection
      ↓
re-assemble and re-decode every visible row
~~~

That is what "no incremental view maintenance" means concretely. At 25-row
pages nobody notices; at a few thousand rows in view it is the whole
difference.

### 3.1 The cheap fix is a memo key

`writeEntities` copies the store once and replaces only the keys written:

~~~ts
const next: Record<EntityKey, EntityEntry> = { ...store }
for (const write of writes) {
  next[write.key] = written(next[write.key] ?? emptyEntry, write.values, now, write.windows)
}
~~~

So **an untouched `EntityEntry` keeps its object identity across a write.** A
memo held on the entry rather than on the store survives:

~~~text
WeakMap<EntityEntry, Map<relationKey, assembled+decoded value>>
~~~

A changed row re-decodes; the other twenty-four hit cache. No API change, no
dependency, entirely internal to `foldkit-remote`.

A second memo on the page, keyed by its edge list, means an unchanged
connection with one changed row rebuilds one array slot rather than an array.

### 3.2 What this is not

It is not a dataflow graph, and it does not make a `where` incremental —
membership still comes from the server (§4). It makes *materialization*
incremental, which is the part that costs per-row `Schema.decode`.

A real dataflow graph is worth revisiting only if §3.1 proves insufficient
under measurement. Do not start there.

---

## 4. Blocker 2 — membership only ever comes from the server

This is the load-bearing one.

A connection's rows are edges the server delivered. The body says which rows
the query is *about*, but **nothing on the client ever evaluates it**. Three
apparently unrelated problems are all this one:

- **Optimistic placement is a guess.** A connection overlay can `prepend`,
  `append`, or `remove`. It cannot ask whether a new row satisfies the query,
  or where the ordering puts it.
- **§21's containment is hard** partly because the only thing the client can
  compare is connection identity — "is this the same question" — never "does
  this row belong".
- **A local engine looks like a second authority**, because it would be
  producing membership that the server also produces.

### 4.1 The cheap answers do not work

- *Filter the loaded page in the view.* Correct only when the page happens to
  contain every matching row, which pagination makes false exactly when it
  matters.
- *Ask the server for everything.* Defeats the connection.
- *Adopt an engine's collections as the source of truth.* That is the second
  authority, and §20 rules it out.

### 4.2 The answer is to evaluate the body

Give the client the ability to run a body over the rows it holds. Then
membership is derivable locally *for rows the client has*, while the server
stays authoritative for which rows exist. Those are different claims and can
coexist — which is precisely what an optimistic layer already assumes.

---

## 5. Blocker 3 — nothing durable and queryable locally

Four of LiveStore's six contributions are already here (§2). The two that are
not are one thing: a durable, queryable local read model.

§20 gives two valid durable ownership modes and forbids using both logs as
co-authorities for the same fact:

- **Mode A** — LiveStore owns durable history. This trades away
  `foldkit-durable`, which encodes guarantees LiveStore's log does not: stable
  semantic operation identity, server-assigned canonical order, explicit
  authorization and rejection, snapshot + cursor. A bad exchange.
- **Mode B** — Sync/Durable stay authoritative and a local read model is
  *materialized* from the order they already establish.

**Mode B is the answer**, and it needs no LiveStore dependency: the machinery
LiveStore would provide is a SQLite and a materializer, and Sync already
derives replay from the application's own `update`.

### 5.1 A cheaper step that is worth doing first

Remote's cache is deliberately "server-derived and disposable" — an
incompatible or corrupt snapshot is discarded so the planner refetches. That is
right for a cache and wrong for the thing a user notices, which is a list going
blank on reload.

A **declared retained subset** — *this connection survives reload, and is served
stale-then-refreshed* — gets most of the offline feel with no second authority
and no new storage engine. Strictly cheaper than mode B, and independently
useful.

---

## 6. Blocker 4 — the page contract is opaque at its edges

Five of seven route ideas are present (§2). Two notes.

**Dependent reads are ahead of the original.** tanstackstart-db expresses them
as route-loader stages; §31.12 argues against reproducing that, and the planner
already does the alternative — a relation whose refs the store holds is
*followed* into concrete requirements for its targets, and `plan` recurses.
Stages fall out of the data rather than the route, so they work for any
dependent read, not only one a route declared.

**Activation is opaque, and that now costs something measurable.**
`Surface.at` takes an arbitrary callback, so *why* a Surface is active cannot be
inspected. `Data.explain` was built against §29.1, whose own sketch begins
`Surface: ProjectPage` — and that is the one line it cannot report, because a
Projection does not know which Surfaces read it. §31.10's tagged-state helper is
what supplies it:

~~~ts
Surface.when(ProjectPage, App.fields.route, AppRoute.Project, route => ({
  projectId: route.projectId,
}))
~~~

Not router-specific: a route is one kind of tagged Model state that may activate
a Surface. §31.10's own constraint — stay as small and unsurprising as
`Surface.at` — is satisfiable in that form.

---

## 7. The keystone

> **The client-side query engine already exists. It is in the server package.**

`foldkit-remote-server`'s `evaluate(body, input, rows)` is pure, takes rows and
returns them filtered and ordered, and runs **the whole kernel** — `eq`,
`isNull`, `isNotNull`, `contains` — which makes it the widest of the four
interpreters. TanStack declines `contains`; LiveStore's builder runs `eq` alone.

Its entire import list is:

~~~ts
import { Query, isPredicate } from 'foldkit-entity'
import type { AnyExpr, AnyQuery, Operandish, Operation, OrderTerm, Predicate } from 'foldkit-entity'
~~~

**Nothing from `foldkit-remote`, nothing from the server, nothing from Effect's
runtime.** It is a function over the IR that happens to live in a package named
for the server.

`foldkit-remote-server` already depends on `foldkit-remote`, so the dependency
direction for moving it *down* into `foldkit-entity` is clear, and no cycle
appears. `foldkit-remote-server` re-exports it, so nothing breaks.

This is unusual and worth stating plainly: the largest single capability gap in
this document is closed by moving a file.

---

## 8. What local evaluation unlocks

Once a body can be run against the client's own rows:

- **Optimistic placement stops guessing.** Ask whether the new row satisfies the
  body, and where `orderBy` puts it among the edges already held.
- **Local connections** — membership computed from the store rather than
  delivered. Instant filter and sort with no round trip, for rows already held.
- **Derived connections** — one connection defined as a narrowing of another,
  which is TanStack's "derived collections" without its engine.
- **§21 gets its cheap half honestly.** Not containment reasoning — *evaluation*.
  "Does this row satisfy this body" is decidable and exact; "are these rows a
  subset of those rows" is the research problem. The first was always the one
  worth having.
- **A second consumer for `Query.show`**, so a local result can be explained the
  same way a remote one is.

---

## 9. The conformance suite becomes a guarantee

Today the 25 cases say *four interpreters agree about what a body means*. That
was worth building and it found real bugs.

If the client evaluates bodies and the server compiles them, the same suite says
something much stronger:

> **The optimistic local answer equals the eventual server answer.**

That is a property optimistic UI usually only asserts. Here it would be tested,
case by case, against a real database — and the cases were already chosen to
make interpreters disagree.

It also sharpens what the suite must cover. The gap named in the deferred-work
plan becomes urgent rather than theoretical: every interpreter today runs SQLite
or JavaScript, and `Expr.contains` folds ASCII-only *because* that is what
SQLite's `lower` does without ICU. A client evaluating in JavaScript against a
Postgres server is exactly the divergence nothing currently catches.

---

## 10. Gates that open themselves

§28 says generalise only from evidence, and it is not suspended. Phase 13's
members — `or`, `distinct`, `groupBy`, aggregates, joins — are each gated on a
query that wants one, and none exists.

Local execution is the honest way to change that. Ship client-side filtering and
a search box over two fields is an ordinary product request within a week, which
is a real caller for `or` rather than an invented one. The same is true of
`distinct` once derived connections exist.

**The way to open a gate without violating the rule is to build the thing that
creates real callers**, not to argue the rule should bend.

---

## 11. What not to do

- **Do not adopt LiveStore's event log.** Two durable authorities for one fact,
  which §20 forbids, in exchange for capabilities mode B provides anyway.
- **Do not promote the LiveStore interpreter.** Its builder runs `eq`, has no
  null predicate at all, and rewrites `= null` into `IS NULL` — the weakest of
  the four engines, as Phase 10 found.
- **Do not build a dataflow graph** before §3.1 is measured.
- **Do not build `Page`/`RouteContract`** (§31.11). Its justification is several
  concerns repeatedly needing one route-associated value; today one does.
- **Do not add the fluent read API** (§11.2). The separation was the point and is
  built; the chaining is sugar.
- **Do not make TanStack DB collections a source of truth.** As an execution
  engine, yes (§19). As membership authority, that is blocker 2 with extra steps.

---

## 12. Implementation sequence

Each phase is independently shippable and independently valuable. Nothing
depends on a later phase.

### Phase 1 — memoize materialization per entry

Move the read memo from the store object to the `EntityEntry`, and the page memo
to the edge list. Internal to `foldkit-remote`; no public API changes.

**Done when:** a write to one entity re-decodes one row of a loaded page, proved
by a test that counts decodes, and the full suite is unchanged otherwise.

### Phase 2 — move the reference interpreter down

`evaluate`, `supported`, `assertSupported` and the conformance suite move to
`foldkit-entity`. `foldkit-remote-server` re-exports them.

**Done when:** the four interpreters' conformance runs are untouched, and
`foldkit-remote` can import `evaluate` without depending on a server package.

### Phase 3 — evaluate a body against the store

A function from the visible store plus a body plus an input to the entity keys
that satisfy it, in the body's order. Pure, and reusing Phase 2's evaluator over
rows assembled from the store.

**Done when:** it agrees with the conformance suite over rows written into a
store, for every case whose operators the kernel runs.

### Phase 4 — optimistic placement through the body

An optimistic insert asks whether the row satisfies the connection's body and
where the ordering puts it, instead of choosing `prepend` or `append`.

**Done when:** a row that does not satisfy the query does not appear
optimistically, and one that does appears in its ordered position — both proved
against a connection whose order is not insertion order.

This is the first user-visible phase and the most valuable single change here.

### Phase 5 — `Surface.when`

The tagged-state activation helper (§31.10), and `Data.explain` gains the
Surface line §29.1 asked for.

**Done when:** an active Surface can be named from the Model without an opaque
callback, `Surface.at` still exists and still works, and the helper is not
router-specific.

### Phase 6 — a retained connection subset

A declared set of connections whose last good page survives reload, served
stale-then-refreshed rather than discarded.

**Done when:** a reload shows the previous page immediately and refreshes it,
and an incompatible or corrupt snapshot still degrades to a refetch.

### Phase 7 — local connections

Connections whose membership is computed by Phase 3 rather than delivered, with
their ownership stated: the server remains authoritative for which rows exist.

**Done when:** a filter over rows already held returns without a request, and a
filter that could match unheld rows still asks.

### Later, as their own projects

- **Mode B materialization** to a browser SQLite, with `remote-drizzle`'s
  compiler retargeted to SQL text + params so it can run there.
- **`packages/ssr`**, which gates `.defer()` and `.preloadOnly()` entirely.
- **Phase 13's members**, if and when Phase 7 produces callers for them.

---

## 13. Risks

**Phase 3 and 4 create a second place a query is answered.** The mitigation is
§9: the conformance suite is the agreement, and local evaluation must run
against it. If a case cannot be run locally it must be *refused* locally, the
same way an interpreter refuses an operator it cannot honour (§16) — never
approximated.

**Local evaluation sees only rows the client holds.** A local answer is
therefore "of what I have" and not "of what exists". Any API that returns one
must say which it is, or it will be read as the second. This is the single
easiest way for this work to become a bug factory, and it should be decided at
the type level before Phase 7.

**A JavaScript client against a Postgres server** is the untested dialect pair
(§9). Phase 3 makes it matter.

**`Expr.contains` folds ASCII-only.** A local evaluator in JavaScript must fold
the same way, not the way JavaScript would prefer.

---

## 14. Non-goals

- Replacing Model / Message / update.
- A second normalized cache.
- Reproducing TanStack DB or LiveStore.
- Making the Router own a loader or cache lifecycle.
- A second durable authority for any fact.
