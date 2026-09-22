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
| **Membership, not the engine, is the real blocker.** A connection's rows are server-delivered edges; nothing on the client ever evaluates a body. That one fact explains the optimistic-placement guess, `LivePolicy`'s existence, §21's containment problem, and why a local engine feels like a second authority. | [§4](#4-blocker-2--membership-only-ever-comes-from-the-server) |
| **The existing guess has a name and a public API.** `LiveInsertion` — `visible \| boundary \| invalidate \| ignore`, declared per connection end — exists *because* nothing can tell whether an inserted row belongs to a query. It is the caller local evaluation needs, and it already shipped. | [§8](#8-what-local-evaluation-unlocks) |
| **Local evaluation is only sound if it refuses four things**: rows missing the fields the body reads, values it cannot compare in the store's encoding, orderings whose collation the backend defines, and placements outside a loaded boundary. Each is a silent wrong answer, not an error. | [§9](#9-what-local-evaluation-must-refuse) |
| **Four of LiveStore's six contributions are already built under other names.** What is missing is a durable *queryable* local read model — reachable through §20's mode B without adopting an event log. | [§5](#5-blocker-3--nothing-durable-and-queryable-locally) |
| **Five of tanstackstart-db's seven route ideas are present, and the sixth is ahead of the original.** Dependent reads are solved at the data level by the planner rather than as route-loader stages. | [§6](#6-blocker-4--the-page-contract-is-opaque-at-its-edges) |
| **The hot path is the one §3 guessed, not the one §16.1 proposed instead.** `Data.query` looked expensive — it re-encodes its input and re-serializes its Selection on every Model change — and measured at 6–10µs, flat in page size. Re-assembly after an unrelated write is the real cost, about 3µs per row. `packages/remote/bench/read.bench.ts`. | [§16.1](#161-the-read-path-is-not-where-the-evidence-points) |
| **A search box already in the repository was fetching per keystroke.** Fixed in `examples/entity` with `debounce` from `foldkit-primitives/time`, plus the guidance that was missing. | [§16.2](#162-a-high-frequency-input-mints-a-connection-per-change) |
| **`Expr.contains` compiled over a numeric field** and reached the database as `lower(rank) like …`. Fixed — and the obvious fix *failed open*: a check intersected onto the parameter lets inference fall back to the constraint, so every operand passed. | [§18](#18-inference-and-dx) |
| **The conformance suite can become a guarantee** — that the optimistic local answer equals the eventual server answer. It can now see encoding (phase 2 added a column whose encoded and decoded forms differ). It still cannot see collation, which waits on queries being able to declare one. | [§10](#10-the-conformance-suite-becomes-a-guarantee) |

Four subagent reviews were run over the finished work. What they found, kept
here because the pattern is the useful part:

| Review | Found |
| --- | --- |
| Correctness | **Six wrong answers**, three of them a false `complete` — a gapped connection, an edge named but not held, a filter over another Entity. Plus a numeric id silently clobbered into a string, a stale value able to suppress a live insert, and a snapshot flattening a connection's segments. |
| Tests | **Three vacuous tests**, each proved by running the mutation. One survived replacing the decode with `Schema.Unknown`. One asserted that a pure function had not modified its input — after I had already "strengthened" it once. |
| Docs | **Ten stale claims**, including one falsehood (below) and a status banner contradicting the section it headed. |
| API surface | `belongs` had **zero callers** — I built the decoded entry point, then wrote `belongsEncoded` for the real caller and never went back. |

The through-line: every one of these is something the author could not see by
rereading, and every one was found by checking a claim against the code.

Two things the **first draft of this plan got wrong**, recorded because they are
the instructive part:

| Mistake | Correction |
| --- | --- |
| "Memoize the read on the `EntityEntry`; untouched entries keep identity." | True about identity, **wrong about the memo**. `assemble` recurses through `assembleRelation` into *other* entities, so a row's value depends on entries its own key does not name. A change to `User:u1` changes `Project:p1`'s value while `Project:p1`'s entry is untouched — a stale read, silently. The memo has to be keyed on the *set of entries the assembly visited*. See [§3](#3-blocker-1--reads-recompute-from-scratch). |
| "Phase 1 is the cheap obvious win, do it first." | It is an optimization with **no evidenced caller**: every page size in the repository is between 1 and 25. (This row first said "there is no benchmark in the repository", which was false — see §3.1.) That is the §28 failure this project criticises elsewhere, committed in its own plan. Measurement comes first, and the phase is demoted. |

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
| Incremental view maintenance | **Missing**, and not yet shown to matter — §3 |
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

`Data.query`'s read memoizes on the *visible store object*, so a write to one
field produces a new store, misses every memo, and re-assembles and
re-`Schema.decode`s every visible row of every active connection.

That is what "no incremental view maintenance" means concretely.

### 3.1 It is not obviously a problem

Every `first:` in this repository is 1, 10 or 25. Nobody has reported a slow
list, because nothing here draws a list long enough to be slow.

> **An earlier draft of this section said "there is no benchmark anywhere in
> this repository", and that was false.** There is a `pnpm bench` script, a
> weekly [Bench workflow](../../.github/workflows/bench.yml),
> [`docs/benchmarks.md`](../benchmarks.md), and benchmarks under
> `packages/sync`, `packages/remote-drizzle` and `packages/durable`. The claim
> came from listing one directory — `packages/remote/test` — and generalising
> to the repository: the exact move §28 exists to stop, made in the paragraph
> that invokes §28. The measurement now lives in
> `packages/remote/bench/read.bench.ts` and runs with the others.

So this section is an observation, not yet a justification. Optimizing it now
would be generalising from no evidence, which is the rule this project applies
to everything else. **The first piece of work is a measurement**, not a fix:
a benchmark that renders a connection of realistic size, changes one field, and
counts decodes. If the number is uninteresting at the sizes anyone actually
draws, this blocker is closed as "not a problem" and the section stays as a
record of why.

### 3.2 And the obvious fix is wrong

`writeEntities` copies the store once and replaces only the keys written:

~~~ts
const next: Record<EntityKey, EntityEntry> = { ...store }
for (const write of writes) {
  next[write.key] = written(next[write.key] ?? emptyEntry, write.values, now, write.windows)
}
~~~

so an untouched `EntityEntry` keeps its object identity, and `visibleStore`
preserves that too — it applies layers with the same `writeEntity`.

From which it is tempting to conclude: memoize the row's value on the row's
entry. **That is a stale-read bug.** `assemble` walks relations:

~~~ts
const relation = requirement.relations?.[field]
if (relation === undefined) { … }
const nested = assembleRelation(store, value.value, relation)
~~~

A Selection reaching through `owner` makes `Project:p1`'s assembled value depend
on `User:u1`'s entry. Change the user's name and `Project:p1`'s entry is
untouched, so the memo hits and the view keeps the old name. Every selection in
the CMS and kitchen-sink reaches through a relation, so this would not have been
a rare case.

### 3.3 What would actually work

Record the dependency set. Assembly already visits exactly the entries the value
depends on; have it return them, and key the memo on `(entity key, relation
key)` with a validity check that every recorded entry is still identical.

~~~text
assembled value
  + the entries it was assembled from
      ↓
memo hit only if every one of those entries is still the same object
~~~

Validation is O(entries touched) — a handful of identity comparisons — against
O(fields × decode) to rebuild. It is correct under relations, and it is the
same idea as fine-grained dependency tracking, arrived at from the other end.

This is strictly more work than the one-line version and should not be
attempted before §3.1 says it is worth anything.

---

## 4. Blocker 2 — membership only ever comes from the server

This is the load-bearing one.

A connection's rows are edges the server delivered. The body says which rows the
query is *about*, but **nothing on the client ever evaluates it**. Four
apparently unrelated things are all this one:

- **Optimistic placement is a guess.** A connection overlay can `prepend`,
  `append`, or `remove`. It cannot ask whether a new row satisfies the query.
- **`LivePolicy` is the same guess, pre-declared.** `LiveInsertion` —
  `'visible' | 'boundary' | 'invalidate' | 'ignore'`, per connection end —
  exists so an application can say in advance what to do with an insert it
  cannot evaluate. It is a public API whose entire purpose is to stand in for
  the missing evaluation.
- **§21's containment is hard** partly because the only thing the client can
  compare is connection identity — "is this the same question" — never "does
  this row belong".
- **A local engine looks like a second authority**, because it would produce
  membership the server also produces.

### 4.1 The cheap answers do not work

- *Filter the loaded page in the view.* Correct only when the page happens to
  contain every matching row, which pagination makes false exactly when it
  matters.
- *Ask the server for everything.* Defeats the connection.
- *Adopt an engine's collections as the source of truth.* That is the second
  authority, and §20 rules it out.

### 4.2 The answer is to evaluate the body

Give the client the ability to run a body over the rows it holds. Membership
becomes derivable locally *for rows the client has*, while the server stays
authoritative for which rows exist. Those are different claims and can coexist —
which is exactly what an optimistic layer already assumes.

It is also not authorization. A compiled `where` is conjoined with a binding's
`visible` rule on the server; **locally there is no `visible` at all.** That is
safe only because the client holds only rows the server already released to it,
and it must be said plainly, because "filtered locally" reads like a guarantee
and is not one.

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

**Mode B is the answer**, and it needs no LiveStore dependency: what LiveStore
would provide is a SQLite and a materializer, and Sync already derives replay
from the application's own `update`.

### 5.1 A cheaper step that is worth doing first

Remote's cache is deliberately "server-derived and disposable" — an
incompatible or corrupt snapshot is discarded so the planner refetches. Right
for a cache; wrong for the thing a user notices, which is a list going blank on
reload.

A **declared retained subset** gets most of the offline feel with no second
authority and no new storage engine. Two things it must confront, both of which
are deliberate existing decisions rather than oversights:

- **Connections are explicitly excluded from snapshots today**, along with live
  cursors, optimistic layers, the mutation ledger, gaps and retention roots,
  because they belong to the session that produced them. Retaining connection
  membership reverses that for a declared subset only, and needs a
  `REMOTE_CACHE_VERSION` bump.
- **Cursors are opaque strings the server minted.** A restored connection's
  boundaries may refer to server state that no longer exists. The safe
  restoration is edges plus `Unknown` boundaries — show the rows, re-establish
  the window — rather than trusting a persisted cursor.

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
inspected. `Data.explain` was built against §29.1, whose sketch begins
`Surface: ProjectPage` — the one line it cannot report, because a Projection
does not know which Surfaces read it. §31.10's tagged-state helper supplies it:

~~~ts
Surface.when(ProjectPage, App.fields.route, AppRoute.Project, route => ({
  projectId: route.projectId,
}))
~~~

Not router-specific: a route is one kind of tagged Model state that may activate
a Surface.

**But the helper alone does not reach `explain`.** `Data.explain` takes a
Projection, and the Surface relation lives in the active-surface list that
`Data.subscriptions` is given. Closing §29.1's first line needs a second, small
piece: a manifest derived from those active surfaces, which `explain` can be
handed or can consult. Unspecified in the first draft of this plan; it is the
difference between "a nice helper" and "the finding is closed".

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

Nothing from `foldkit-remote`, nothing from the server, nothing from Effect's
runtime. The conformance suite beside it imports only `effect` and
`foldkit-entity`. `foldkit-remote-server` already depends on `foldkit-remote`,
so moving both *down* introduces no cycle.

### 7.1 Which package, and the tension in the answer

`foldkit-entity` is the home, with a caveat worth stating rather than
discovering later.

The argument for it: `foldkit-entity` owns the IR, and an evaluator of the IR is
its **reference semantics** — what §6.0.1 means operationally rather than in
prose. A specification's reference implementation belongs with the
specification. Putting it in `foldkit-remote` would mean `foldkit-form`,
`foldkit-crud` and `foldkit-cms` cannot evaluate a body without depending on
Remote, which they do not otherwise need.

The argument against: `foldkit-entity` is a *declaration* package that others
interpret, and adding an interpreter inverts that. The mitigation is a rule
rather than a different package — **the evaluator may only ever depend on the
IR**, and the moment it wants a Remote concept it has moved to the wrong place
and should leave.

**Packaging consequence the first draft missed:** `foldkit-entity` currently
exports only `"."`. The conformance suite is test fixture data — 26 cases, rows,
an Entity — and must not ship in the main bundle of a package that every form
and admin screen imports. It needs its own subpath export.

---

## 8. What local evaluation unlocks

Once a body can be run against the client's own rows:

- **Optimistic placement stops guessing.** Ask whether the new row satisfies the
  body, and where `orderBy` puts it among the edges already held.
- **`LivePolicy` gets a better default.** The insertion policies exist because
  an application had to decide in advance what to do with a row nobody could
  evaluate. With evaluation, `'visible'` and `'ignore'` become *derivable* for
  the rows the client can judge, and the declared policy becomes the fallback
  for the rows it cannot. This is the caller that already shipped.
- **Local connections** — membership computed from the store rather than
  delivered. Instant filter and sort over rows already held.
- **Derived connections** — one connection defined as a narrowing of another,
  which is TanStack's "derived collections" without its engine.
- **§21 gets its cheap half honestly.** Not containment reasoning —
  *evaluation*. "Does this row satisfy this body" is decidable and exact; "are
  these rows a subset of those rows" is the research problem. The first was
  always the one worth having.

---

## 9. What local evaluation must refuse

Every item here produces a **wrong answer rather than an error** if it is
missed, which is why they are a section and not a footnote. §16's rule applies
to the client exactly as it applies to an interpreter: refuse what you cannot
answer faithfully, never approximate it.

### 9.1 Rows are partial

The normalized store holds the fields that were *fetched*. A body filtering on
`status` is evaluated against a row whose Selection never asked for `status`,
and a missing field reads as absent — so the row is judged against nothing and
the answer is confidently wrong.

`Query.dependencies(body).fields` already names exactly what must be present.
Local evaluation checks it and refuses — falling back to the server — when it is
not.

There is a design consequence beyond the check: a connection that wants to be
evaluated locally must have the body's fields *planned*, not merely the view's.
That is a change to what a read requests, and it should be opt-in per connection
rather than a blanket widening of every read.

### 9.2 The store is encoded; bodies are not

`assemble` returns wire values and `Data.query` decodes them at read time, so
the store holds **encoded** values. A `QueryRef`'s input is the **decoded**
domain value, and a body's literals are written in domain terms
(`Expr.eq(Post.fields.published, true)`).

Comparing a decoded input against an encoded row is a correctness bug that
typechecks. `Expr.input` and `FieldExpr` both carry their schema, so the
encoding is available — it simply has to be applied, and the direction chosen
once and stated: **evaluate in the store's encoded space.**

`evaluate`'s own `Row` is `Readonly<Record<string, unknown>>` with no encoding
discipline at all, and the conformance fixtures put rows and inputs in the same
space, so **the suite cannot currently see this class of bug**. It needs a case
whose encoded and decoded forms differ.

### 9.3 Collation is the backend's, and almost every order is text

This is the sharpest conflict, because it contradicts something already decided.

`ac751ac` recorded that text collation is backend-defined and deliberately
outside the conformant subset — the first attempt to fix it declared code point
ordering *because two interpreters agreed*, which was the accident being
criticised.

But `Order.asc(Post.fields.id)` is an ordering over text, and it is the standard
tie-breaker. So **local ordering cannot be guaranteed to match the server for
almost any real query**, and a locally placed row may sit one position away from
where the server will put it.

Three ways out, and the third is the one to take:

1. Restrict local ordering to non-text fields. Nearly useless — it excludes the
   id tie-breaker that most bodies carry.
2. Accept approximation. Defensible for an optimistic insert, which is a guess
   that the server's page corrects — but it quietly reintroduces the guessing
   this work exists to remove, and it is not defensible for a local connection.
3. **Let a query declare its collation**, and let an interpreter that cannot
   honour it refuse. This is §16's shape applied to ordering rather than
   operators: SQLite gets `COLLATE BINARY`, Postgres `COLLATE "C"`, the local
   evaluator a code-point comparison, and a backend that can do none of them
   says so. It converts an undecidable into a declared constraint, and it
   resolves `ac751ac` properly — collation is not code point *by default*, but
   it can be *asked for*.

Option 3 is a change to `Query.define` and to every interpreter, and it should
be sized as such. Local ordering is not trustworthy until it exists.

### 9.4 A connection is paginated, and cursors are opaque

"Where `orderBy` puts it" is not a placement rule. A connection is a list of
segments with `Terminal | Cursor | Unknown` boundaries, and **a cursor is an
opaque string the server minted** — the client cannot compare a row's sort
position against it.

So placement is decidable only:

- **between two loaded edges**, by comparing against both; or
- **at an end whose boundary is `Terminal`**, which is the only boundary that
  asserts there is nothing beyond it.

A row that sorts beyond a `Cursor` or `Unknown` boundary belongs to a page the
client does not have, and must **not** be shown — showing it invents a position
in a list the user will see corrected. That is the rule, and it also explains
why `LiveInsertion` has a `'boundary'` case: somebody already knew.

---

## 9.5 What a local answer *is* — the phase 0 decision

Decided before anything produces one, because it is phase 3's return type and
not a footnote. Recorded here; the type lands with its first producer rather
than ahead of it.

### The decision

**A local answer is not a `Page`, and not a `RemoteData<Page<A>>`.** It is its
own type, produced only by a distinctly named function, carrying whether it is
complete.

~~~ts
/**
 * The rows the client already holds that satisfy a body, and whether that is
 * all of them. Not an answer to the query — an answer over what is held.
 */
interface Matched<A> {
  readonly items: ReadonlyArray<A>
  /** Whether every row the query could match was among those judged. */
  readonly complete: boolean
}
~~~

### Why not reuse `Page`

`Page<Item>` is `{ items, hasNext, hasPrevious }`, and **two of its three fields
are server facts**: `hasNext` and `hasPrevious` are derived from a connection's
boundaries, which are what the server said about rows beyond the ones delivered.
A local evaluation over rows the client holds has no such facts and cannot
invent them.

So reusing `Page` would be a lie in two thirds of its shape. That is a stronger
reason than type hygiene, and it is why this is a distinct type rather than a
brand on an existing one.

### Why not follow `Data.confirmed`, which does the opposite

Remote already expresses an authority difference without changing a type:
`Data.confirmed(projection)` returns the *same* `P`, reading the same query
against the server-derived store alone. That precedent argues for leaving the
type alone, and it does not apply.

`confirmed` answers **the same question** from a different store — "what is true
here, as far as we know" — and both answers are honest `RemoteData<Page<A>>`.
Local evaluation answers a **different question**: *which of the rows I hold
match* is not *which rows match*. Different question, different type.

### Why `complete` rather than a provenance tag

The tempting shape is a brand saying where the answer came from — `Local<A>`
versus the real thing. But provenance is not what a consumer needs to decide
anything. What it needs is whether the answer is missing rows, and that is
**decidable**: a connection whose start and end boundaries are both `Terminal`
is wholly held, so a body evaluated over it can answer completely.

That makes `complete` sometimes true rather than a permanent disclaimer, and it
gives a view something to render — "3 results" against "3 so far" — and phase 7
something to branch on: an incomplete answer is when to ask the server.

### What this does not carry

**No authorization.** On the server a compiled `where` is conjoined with the
binding's `visible` rule. Locally there is no `visible` at all. It is safe only
because the client holds only rows the server already released to it, and it
stops being safe the moment anything treats a local filter as an access
decision. The type's own documentation has to say so, because "filtered
locally" reads like a guarantee and is not one. (§17.2.)

**No count of what was considered.** Tempting, and nothing wants it yet.

---

## 10. The conformance suite becomes a guarantee

Today the 26 cases say *four interpreters agree about what a body means*. That
was worth building and it found real bugs.

If the client evaluates bodies and the server compiles them, the same suite says
something much stronger:

> **The optimistic local answer equals the eventual server answer.**

That is a property optimistic UI usually only asserts.

It is not free. The suite must first gain what it cannot currently see:

- a case whose **encoded and decoded forms differ** (§9.2), since today's
  fixtures put both in one space;
- cases over **text ordering** once §9.3's declared collation exists, since
  ordering is currently outside the conformant subset precisely because nobody
  could commit to it;
- a **Postgres** subject. Every interpreter today runs SQLite or JavaScript, and
  `Expr.contains` folds ASCII-only *because* that is what SQLite's `lower` does
  without ICU. A JavaScript client against a Postgres server is exactly the
  divergence nothing currently catches. The blocker is that
  `drizzle-orm/effect-postgres` throws on load against effect rc.112, so this
  waits on the driver versions agreeing.

---

## 11. Gates that open themselves

§28 says generalise only from evidence, and it is not suspended. Phase 13's
members — `or`, `distinct`, `groupBy`, aggregates, joins — are each gated on a
query that wants one, and none exists.

Local execution is the honest way to change that. Ship client-side filtering and
a search box over two fields is an ordinary product request, which is a real
caller for `or` rather than an invented one.

**The way to open a gate without violating the rule is to build the thing that
creates real callers** — not to argue the rule should bend.

---

## 12. What not to do

- **Do not adopt LiveStore's event log.** Two durable authorities for one fact,
  which §20 forbids, in exchange for capabilities mode B provides anyway.
- **Do not promote the LiveStore interpreter.** Its builder runs `eq`, has no
  null predicate at all, and rewrites `= null` into `IS NULL` — the weakest of
  the four engines, as Phase 10 found.
- **Do not optimize §3 before measuring it**, and do not use the one-line memo
  when you do (§3.2).
- **Do not build a dataflow graph** at all until the dependency-set memo of
  §3.3 has been shown to be insufficient.
- **Do not build `Page`/`RouteContract`** (§31.11). Its justification is several
  concerns repeatedly needing one route-associated value; today one does.
- **Do not add the fluent read API** (§11.2). The separation was the point and is
  built; the chaining is sugar.
- **Do not make TanStack DB collections a source of truth.** Execution engine
  yes (§19); membership authority is blocker 2 with extra steps.

---

## 13. Sequence

> **Status lives here**, not in a scratch plan file: **phases 0 through 7 are
> built** — phase 4 in its decidable half — and M is measured and deliberately
> not built. What each one actually changed, including every place the plan
> turned out to be wrong, is in the sections they point at.

Phases are numbered by dependency, not by priority. **A → B** means B cannot
start until A lands.

~~~text
0 ── 1 ── 2 ── 3 ─┬─ 4        capability chain
                  └─ 6
M (independent) ── measure, then maybe M2
5 (independent)
7 (independent)
~~~

### 0 — Decide what a local answer *is* — **done**

Before any API returns one. A local answer is "of what I have", not "of what
exists", and an API that does not say which will be read as the second. This is
phase 3's return type, so it is a decision and not a note.

**Done when** the distinction is expressible in the type system, and a reviewer
can say which of the two any given read returns without reading its
implementation.

### 1 — Move the reference interpreter down — **done**

`evaluate`, `supported`, `assertSupported` and the conformance suite move to
`foldkit-entity`, the suite behind its own subpath export (§7.1).
`foldkit-remote-server` re-exports so nothing breaks.

**Done when** all four interpreters' conformance runs are untouched,
`foldkit-remote` can import `evaluate` without depending on a server package,
and the fixture is not in `foldkit-entity`'s main bundle.

### 2 — Teach the suite to see what it cannot — **done**

The encoded/decoded case of §9.2, before anything depends on the answer. Without
it phase 3 has no way to fail.

**Done when** a deliberately mis-encoded comparison turns the suite red.

### 3 — Evaluate a body against the store — **done**

A pure function from the visible store, a body and an input to the entity keys
satisfying it — reusing phase 1's evaluator over rows assembled from the store,
in the store's encoded space (§9.2), refusing when the body's dependency fields
are absent (§9.1).

**Done when** it agrees with the conformance suite over rows written into a
store, and refuses — rather than answering — every case in §9.

**Kill criterion:** if §9.1's field requirement turns out to force widening most
reads, or §9.2's encoding cannot be applied without a schema the store does not
carry, stop here and record why. Phases 4 and 6 depend on this being *exact*.

### 4 — Placement through the body — **membership done, position gated**

Replace the guess in **both** places it exists: optimistic inserts, and
`LivePolicy`'s insertion decision for rows the client can judge. The declared
policy remains the fallback for rows it cannot.

Placement follows §9.4 — between loaded edges, or at a `Terminal` boundary, and
never past a `Cursor`.

**Done when** a row that does not satisfy the query does not appear, one that
does appears in its ordered position, and one that sorts past a non-`Terminal`
boundary does not appear at all — each against a connection whose order is
*not* insertion order, or the test proves nothing.

Ordering by text is approximate until §9.3's declared collation exists; until
then this phase should ship for bodies whose order the client can reproduce and
refuse the rest.

> **Split, because membership and position are not equally decidable.**
>
> Whether a row satisfies a body needs **no collation**: equality on text is
> exact and `contains` folds ASCII, both stated in §6.0.1. *Where* it sorts
> needs collation, which is the backend's. So `Remote.belongs` answers the half
> that is always answerable, and the position a live event carries still stands.
> Ordered placement waits on declared collation, as §9.3 said it would.
>
> **Two dead paths turned up doing it**, both around the API this phase was
> supposed to be improving.
>
> `LivePolicy` **never reached the decision.** `Query.connection(E, { live })`
> was typed, documented, carried on the descriptor and present in the Message
> schema — and nothing in the production path ever set `LiveReceived.policy`,
> so every live insert took the default whatever an application declared. Fixed
> here: the bound `reduce` resolves it, because that is the only place with both
> the Model and the registry. `updateRemote` on its own is unchanged, so the
> pure reducer stays testable without one, and a caller that supplies a policy
> keeps it.
>
> `LiveInsertion: 'invalidate'` **recorded a mark nothing read** — and so did
> the server's explicit `ConnectionInvalidate` event, which is worse: a server
> saying "refetch this" did nothing at all. Both wrote into a `stale` set on the
> live state that only `isStale` read, and `isStale` had no caller. The unit
> tests asserted on that set, so they passed throughout. **Fixed afterwards:**
> the event now reports what it invalidated and the reducer applies it through
> the same reduction as the `ConnectionInvalidated` Message; the dead set,
> `isStale`, `refreshConnection` and `invalidateConnection` are removed; and the
> tests that replace them go through the reducer to the planner, and fail on
> the old code.
>
> The finding behind the finding: `LiveInsertion` was cited in §0 as "the caller
> that already shipped", and it shipped without being wired. A declared option
> nothing reads is worse evidence of demand than no option at all, and it is
> worth being slower to count one next time.

### 5 — `Surface.when`, and the manifest that makes it useful — **done**

§31.10's helper, **plus** the active-surface manifest that lets `Data.explain`
report §29.1's first line (§6). The helper alone does not close the finding.

**Done when** an active Surface can be named from the Model without an opaque
callback, `explain` reports it, `Surface.at` still exists and works, and the
helper is not router-specific.

> **Done, and the signature is the interesting part.**
>
> `Surface.when(surface, place, tagged, params)` records the Model path and the
> tag as values, so a manifest can be built without evaluating anything.
> `Surface.at` is untouched and is still right when activation is a genuine
> computation rather than a tag.
>
> It takes a **`ModelPlace`** — `dependency` and `get`, the read half of a
> `ModelRef` — rather than a `ModelRef`. Two reasons, and the second only
> appeared on trying it. Activation **observes**: it never installs a value, so
> asking for a writable reference claims an authority it does not use. And a
> field holding a tagged union is a *union of* `FieldRef`s, one per case, which
> no single `ModelRef<Root, Value>` accepts — `ModelRef` is invariant in its
> value, because of `set`. Asking only for what it reads fixes the inference and
> states the truth at once.
>
> The case type is inferred from the constructor, so the callback receives
> `{ _tag: 'Owner', ownerId: string }` rather than `{ _tag: string }`. That is
> not cosmetic: the whole helper exists so the params come from the tagged
> value, and an un-narrowed parameter would mean casting at every call site.
>
> **The manifest half is separate and was the easier half to get wrong.**
> `Data.explain(model, projection, { surfaces })` reports **every** active
> Surface reading the connection, not the first — several may, which is exactly
> why a Projection cannot carry the answer itself. Given no Surfaces it omits
> the members rather than reporting an empty list, so "nobody is reading this"
> and "I was not told" stay distinguishable.

Independent of everything else. Smallest user-visible win here.

### 6 — A retained connection subset — **done**

Declared connections whose last good page survives reload, restored as edges
with `Unknown` boundaries (§5.1), served stale-then-refreshed.

**Done when** a reload shows the previous page immediately and refreshes it, an
incompatible or corrupt snapshot still degrades to a refetch, and
`REMOTE_CACHE_VERSION` is bumped.

> **Done, and the shape carries the rule rather than a comment.**
>
> A snapshot is now `{ entities, connections }`, and a declared connection keeps
> its **edges and nothing else**. That is not a simplification: the snapshot has
> nowhere to put a cursor, so "never trust a persisted cursor" cannot be got
> wrong by a later change. A restored connection comes back with `Unknown`
> boundaries and `stale: true`, which through machinery that already existed
> gives stale-then-refreshed for free — the planner refetches a stale
> connection, and a read of one with segments is `Refreshing`.
>
> Nothing survives that was not named, so the default is exactly the disposable
> cache Remote always had. `snapshotOf(model)` with no connections is the old
> behaviour spelled out.
>
> One consequence worth stating because a test now pins it: a restored
> connection claims completeness in **neither** direction. `hasNext` and
> `hasPrevious` are derived from boundaries, and `Unknown` is not `Terminal`, so
> both are true even where the session knew it was at the start. That is a real
> loss of information, and the honest one — the alternative is claiming a
> boundary the server never confirmed.
>
> The breaking change (`dehydrate`/`hydrate`/`save`/`restore` take and return a
> `Snapshot`) cost one real call site, in `examples/kitchen-sink`, which now
> reads `snapshotOf(remote)` and names no connections. The version bump means no
> stored snapshot survives anyway.

Depends on phase 3 only if restored membership is to be *verified* locally;
shippable without that.

### 7 — Local connections — **done, as a filter rather than a connection**

Membership computed by phase 3 rather than delivered, with ownership stated:
the server stays authoritative for which rows exist.

**Done when** a filter over rows already held returns without a request, one
that could match unheld rows still asks, and the returned value is the local
kind from phase 0 — never the authoritative one.

> **Built as `Data.filtered`, and the name is the decision.**
>
> A *connection* whose membership is computed would have to answer "which rows
> match", and that needs to know the client holds every row the body could
> match — predicate containment, which §21 refuses. Writing it as a connection
> would have smuggled containment in through the back door: the thing would
> look like a connection, be read like one, and be quietly wrong whenever a
> matching row had never been fetched.
>
> So it filters **a list**. "Which rows *of this list* match" is decidable from
> what is already here, and is what a search box over a loaded page actually
> wants. `Data.filtered(model, over, by, input)` takes the loaded projection as
> the population and a body as the filter, and decodes matches through the
> list's own Selection — so a filtered item and a listed item are the same
> shape and one view function renders either.
>
> **`complete` is three conditions, and each was a test that failed first.**
> Every edge judged (nothing missing a field the *body* reads), every match
> shown (nothing missing a field the *Selection* reads — a different set), and
> the list terminal at both ends. Empty-and-complete and empty-and-partial are
> different answers, which is the entire reason the flag exists.
>
> **Retention answers itself.** The question was what to do about a locally
> computed connection having no server page. It has no connection at all:
> filtering creates nothing, retains nothing, and plans nothing. A test pins
> that filtering by a registered query does not bring that query's connection
> into being, since that would give retention a root nothing fetches.

### M — Measure §3, then maybe fix it — **measured**

Independent of the chain, and deliberately not first. Benchmark a realistic
connection, change one field, count decodes. **If the number is uninteresting at
the sizes this project actually draws, close blocker 1 and do nothing.**
Otherwise implement §3.3's dependency-set memo — never §3.2's.

### Later, as their own projects

- **Declared collation** (§9.3) — touches `Query.define` and every interpreter.
  Gates trustworthy local ordering.
- **A Postgres subject** for the suite (§10), gated on the driver versions.
- **Mode B materialization** to a browser SQLite, with `remote-drizzle`'s
  compiler retargeted to SQL text + params. Never mode A.
- **`packages/ssr`** — gates `.defer()`/`.preloadOnly()` entirely, and is not
  gated on anything itself.
- **Phase 13's members**, if phase 7 produces callers.

---

## 14. Risks

**The type distinction of phase 0 is the whole safety story.** Everything else
here is recoverable; shipping an API that returns "of what I have" where callers
read "of what exists" is the failure that produces silently wrong screens.

**Phases 3 and 4 create a second place a query is answered**, and §9 is the list
of ways that goes wrong quietly. The mitigation is the conformance suite as the
agreement — which is why phase 2 comes before phase 3, and why §10's missing
cases matter more than they look.

**Local ordering is not trustworthy without declared collation** (§9.3), and
declared collation is a bigger change than any phase here. Phase 4 must ship
knowing it, and refuse rather than approximate.

**Local evaluation applies no authorization** (§4.2). Safe today; would stop
being safe the moment anything used a local filter as an access decision.

**This plan's own first draft got two things wrong** — a memo key that would
have shipped stale reads, and an optimization with no evidenced caller. Both
were found by checking the code rather than by reasoning about it, which is the
method this plan should be reviewed with again before phase 3.

---

## 15. Non-goals

- Replacing Model / Message / update.
- A second normalized cache.
- Reproducing TanStack DB or LiveStore.
- Making the Router own a loader or cache lifecycle.
- A second durable authority for any fact.
- Local evaluation as an authorization boundary.

---

# Part II — Performance, hardening, and inference

The capability work above is about what the project *cannot do*. This part is
about what it does badly, unsafely, or unclearly. Each item was found by
reading the source or probing the compiler, and each says what the evidence is,
because the §28 rule applies here too: an optimization with no measured cost and
a hardening fix with no reachable failure are both speculation.

## 16. Performance

### 16.1 The read path is not where the evidence points

§3 assumed the decode-per-row cost was the performance story. Looking harder,
there is a better candidate, and it is on a hotter path.

**`Data.query(...)` is not cheap, and it runs on every Model change.** A
Surface's `model` function is re-evaluated whenever the Model changes, so every
`Data.query` call in it rebuilds its projection. Each rebuild:

- calls `query.ref(input)`, which runs **`Schema.encodeSync(Input)(input)`** —
  a full schema encode — and then `stableStringify` over the result, to compute
  a connection identity that is almost always the same string as last time;
- calls `relationOf(select)`, walking the Selection graph;
- calls `stableStringify(relation)` over that walk, to compute a memo key.

So a schema encode and two recursive serializations happen per query per Model
change, to produce two strings that change only when the input or the Selection
does — and the Selection is a module-level constant in every use in this
repository.

That is a per-frame cost proportional to the number of queries on screen, paid
whether or not any data changed. It is a better first measurement than §3's
decode count because it is paid on *every* change rather than on writes, and
because the fix is bounded: memoize identity on the input object and
`relationKey` on the Selection object, both by reference, both `WeakMap`.

That was the hypothesis, and the next section refutes it. It is kept because
the reasoning is plausible and only the measurement settled it.

### 16.1.1 Measured, and the hypothesis was wrong

`packages/remote/bench/read.bench.ts`, run with `pnpm bench`. One connection, a
Selection reaching through a relation (as every real one here does), mean
microseconds per operation:

| | 25 rows | 100 rows | 400 rows |
| --- | --- | --- | --- |
| `Data.query` — build a projection | 6.4 | 6.5 | 10.0 |
| read, same Model — the memo hit | 0.1 | 0.6 | 0.9 |
| **read, after a write to one unrelated entity** | **72.5** | **416** | **1794** |
| the same write, without the read | 14.2 | 67.7 | 332 |
| `Remote.plan` | 42.3 | 274 | 994 |

**`Data.query` is the cheapest thing on the list and barely moves with the
page** — 6 to 10µs. At sixty Model changes a second with three queries on screen
that is under 2ms per second. **Close it: not worth memoizing.**

So §16.1 was wrong, and §3 — which it was written to correct — was right.

**Re-assembly after an unrelated write is the cost, and it is linear.**
Subtracting the write itself, it is 58µs, 348µs and 1462µs: about **3µs per row
per write**, paid by every connection on screen whenever anything in the store
changes, however unrelated. Against a memo hit under a microsecond the
recompute is three orders of magnitude more expensive, which is the shape of a
fix worth having.

`Remote.plan` is the second cost and also scales — 130µs to 822µs — and it runs
per Model change per active Surface. Not investigated further here; recorded so
it is not mistaken for free.

**What the numbers do not say** is that anyone is hurting. At 25 rows a write
costs 156µs, and ten writes a second is 1.6ms — nothing. The cost becomes
visible at a few hundred rows with a live-updating list, which nothing in this
repository draws. So this is now *evidenced* rather than *urgent*: the curve is
known, the threshold is known, and the fix is known to be worth roughly 1000× on
the case it addresses.

**One thing to settle before building it.** §3.3's memo has to survive store
changes — that is its whole purpose — so it cannot be keyed on the store the way
today's is. That means a cache whose lifetime is not tied to a Model snapshot,
which is exactly the shape of the unbounded-growth problems §16.3 lists as
already dealt with. It needs a bound, and deciding that bound is part of the
work rather than a detail of it.

### 16.2 A high-frequency input mints a connection per change

A `QueryRef`'s identity is its definition plus its canonical input, which is
exactly right for caching and exactly wrong for an input that changes as fast as
someone types.

The CMS worklist is the case: its body is

~~~ts
Expr.contains(Entities.Entry.fields.label, input.search)
~~~

and §6's "containing the empty string is everything" exists *specifically* so an
empty search box is the same query as a filled one — that is, the query was
designed for a text input. Today `examples/cms` passes `search: ''` as a
constant, so nothing demonstrates the problem. The moment the box is wired up,
every keystroke is a new identity, a new connection, and a new request.

Memory is bounded — GC drops connections that are no longer retention roots —
but the requests are not, and neither is the churn.

`foldkit/primitives` already ships `debounce` and `throttle`. Nothing in
`foldkit-remote` uses or mentions them, and no README says what to do here. The
fix is guidance plus an example, not machinery: **the debounce belongs between
the input Message and the Model field the query input reads**, not inside
Remote, because Remote's job is to be a faithful function of the Model.

This is worth doing before anyone wires a search box, not after.

### 16.3 What not to optimize

`applied`, the mutation ledger's set of settled request ids, is already bounded
by `MUTATION_ID_WINDOW` with most-recent-wins eviction. Connections are already
collected by GC. The refresh marks were already fixed. The obvious unbounded
collections have been dealt with; the remaining cost is compute on hot paths,
not memory.

## 17. Hardening

### 17.1 A page larger than the window is accepted

The client asks for `first: 25`. Nothing checks what comes back. `merge` accepts
whatever edges the page carries, and they enter the connection and the store.

In a normal deployment the server is yours and this is a non-issue. But
`foldkit-remote` is a library with a versioned wire protocol and a stated
instinct to fail closed on protocol mismatch, and a response that ignores the
window is a protocol mismatch. A buggy server paginating wrongly is at least as
likely as a hostile one.

**Fix, built.** `pageMessage` — the single funnel every page passes through —
takes the window and returns `QueryFailed` with a named protocol error when the
edge count exceeds `first ?? last`. A window with neither bounds nothing, since
`after`/`before` says where to start rather than how much to take.

**What it buys and what it does not.** The edges are rejected: they never reach
the store or the connection, and a connection that was already loaded is left
exactly as it was, so a refresh that overruns cannot replace good rows with a
rejected page. That was the point.

But it surfaced a pre-existing limitation worth recording separately.
`QueryFailed` for a connection the Model never held is a deliberate no-op —
*"one the Model never held stays absent"* — so a view reading it still sees
`Initial`, not `Failed`. The same is true of a failed refresh, which clears
staleness and reads as before. **No read surfaces a query failure**, of any
kind, and this check inherits that rather than causing it.

Whether it should is a real question and a separate one: `Initial` means
"nothing known", which is honest, and the subscription will retry — but a
protocol disagreement that is only visible to whoever reduces the Message is
hard to notice in exactly the situation it exists for. Recorded here rather
than changed, because it affects every query failure and deserves deciding on
its own terms.

**Decided, built.** "The subscription will retry" was wrong. A read entry
restarts only when what it plans changes, and a failure changed nothing, so a
list that failed before it loaded read `Initial` for good. It was not an honest
"nothing known". It stalled with no sign of it. The failure is now kept per
connection (`RemoteModel.failures`), and a read shows it: `Failed`, with the
rows as `previous` when there were any, which `RemoteData.render` had always
been able to draw as `Stale`. It is not retried on its own, since a persistent
error would be retried on every unrelated restart. `Remote.refresh` retries it,
and a page arriving, a live invalidation, or retention dropping the connection
clears it. Pinned in `packages/remote/test/queryFailure.test.ts`, each part
mutation-checked.

Entity reads had the same stall one level down, and got the same answer per
field (`packages/remote/test/readFailure.test.ts`). Doing that exposed a
conflation: the live entry reported a broken stream as `ReadFailed` over the
fields it watched, so it would have failed fields nobody was reading and pulled
them out of the read entry's plan. A broken stream now records a gap on its
stream instead, which is what `gaps` was for.

### 17.2 Local evaluation applies no authorization, and must say so

Repeated here because it belongs in this list. On the server a compiled `where`
is conjoined with the binding's `visible` rule. **Locally there is no `visible`
at all.**

That is safe today for one reason only: the client holds only rows the server
already released to it, so filtering them further cannot reveal anything. It
stops being safe the moment anything treats a local filter as an access
decision — and "filtered locally" reads like a guarantee.

**Fix:** state it in the README beside the local API, and name it in the type if
phase 0's local-answer distinction can carry it.

### 17.3 The things that are already right

Recorded so a later reader does not redo them: the persistence snapshot is
discarded on version, scope or corruption mismatch rather than trusted; the
mutation ledger is bounded; live events carry a per-stream monotonic cursor with
duplicate rejection and explicit gap reporting; decode failure surfaces as
`Failed` rather than throwing; retention roots live outside the Model so GC
arrives as a Message and is replayable.

## 18. Inference and DX

Four items, found by compiling probes rather than by reasoning about the types.
They are recorded in [entity-DX-PLAN.md](./entity-DX-PLAN.md) items 10–13, with
the friction and the plan for each. In brief:

| Item | What a reader hits |
| --- | --- |
| 10 | `Expr.eq(3, field)` fails with "not assignable to `Operand<any>`", naming neither the problem nor `Expr.literal`, which is the fix |
| 11 | `Expr.contains` compiles over a numeric field and reaches the database as `lower(rank) like …` |
| 12 | a predicate over the wrong Entity is a runtime throw, though `Query<E>` and `FieldExpr`'s owner are enough to catch it at compile time |
| 13 | a body with no `orderBy` fails at registration rather than at compile time |

Item 11 is the one to do first: it is a one-line constraint and it currently
lets nonsense reach a database. Item 12 removes a whole class of error and is
the largest. Item 13 is recorded mainly so the trade-off is not re-derived.

What the probes found working, which is worth knowing: a typo'd input key inside
a `Query.define` body is caught, an input compared against a field of the wrong
type is caught, and the branded `Registered` failure does name the descriptor in
the parameter's own type.

## 19. Where these fit in the sequence

None of Part II blocks Part I, and Part I does not block most of Part II.

Do first, because they are cheap and currently wrong:

- **18/item 11** — constrain `Expr.contains`. **Done**, and not one line: the
  obvious version failed open.
- **16.2** — debounce guidance and an example. **Done**, in `examples/entity`,
  which already had the un-debounced search box.
- **17.1** — reject a page that overruns its window. **Done.**

Measured, and closed:

- **16.1** — `Data.query`'s per-change cost is 6–10µs and flat in page size, so
  it is **not** memoized. The same benchmark found the real cost is §3's
  re-assembly, which is phase M: evidenced, not urgent, and waiting on a bounded
  cache design (§16.1.1).

Do alongside phase 0, since it is the same decision:

- **17.2** — local evaluation's lack of authorization, stated in the type if the
  local-answer distinction can carry it and in prose regardless.

Do when the class of error justifies the signature churn:

- **18/item 12** — the owner as a type parameter.
