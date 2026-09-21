# Foldkit Plus: Composable Data, Query, Read Contracts, Routing, and Local-First Architecture

**Status:** partly built. §32's Phases 0–8 and 12 shipped; Phases 9–13 are
deferred on conditions that do not exist yet. The reasoning below is unchanged except
where a `>` note says building it found otherwise, and those notes win.  
**Date:** September 2026  
**Target:** doeixd/foldkit-plus  
**Primary packages:** foldkit-entity, foldkit-remote, foldkit-remote-server, foldkit-remote-drizzle, foldkit-surface, foldkit-sync, foldkit-durable  
**Internal prior art:** doeixd/gen2, doeixd/data-forge, doeixd/tanstackstart-db, doeixd/combi-router, Foldkit Router  
**External prior art:** TanStack DB, LiveStore 0.4

## 0. What building it changed

Five notes are scattered below where they belong. Collected, so they are not
found one at a time:

| Where | What building it found |
| --- | --- |
| [§6.0](#60-an-operator-without-stated-semantics-is-not-portable) | **An operator with no stated semantics is not portable.** The operator list said nothing about meaning; `contains` shipped meaning three different things across SQLite, Postgres and JavaScript. Semantics are now stated before an operator is built. |
| [§6.2.1](#621-what-that-rule-costs-and-how-to-pay-it) | **The placeholder rule made the repository's hardest query unwriteable**, and writing it anyway was silently wrong rather than a type error. A branch on an input is usually a comparison not yet written. |
| [§12.3](#123-what-planning-actually-keys-on-and-why-it-is-not-this) | **§12's consumer read identity is wrong and was not built.** Keying a read on its Selection would fetch one page twice where merging serves both consumers with one read. |
| [§32](#32-recommended-implementation-sequence) | **The reference interpreter belongs before the compiler.** It is what finds divergence; building it second let a wrong operator reach a product. |
| [§32, Phase 9](#phase-9--tanstack-db-spike) | **A third interpreter found what two written here had agreed on by accident.** Text ordering had no stated collation: TanStack sorts by locale, SQLite by code point. It is also the first interpreter to refuse an operator it cannot answer faithfully. |
| [§32, Phase 5](#phase-5--prove-route---surface---readcontract-integration) | **A phase was skipped without anyone noticing**, including the person doing it, and was done afterwards. It needed no new API — and it was the first use of Foldkit Router anywhere in this repository, so the claim that routing owns no data loading had never been run. |
| [§32.1](#321-every-other-section-against-what-was-built) | **Working from the phase list left two thirds of the document unchecked.** Most of it holds; §16's capability checking is not built, and §15's derivation is narrower than sketched. |
| [§33.1](#331-what-the-built-shape-does-not-extend-to) | **The walls**: one Entity per Query, field-only ordering, no scalar operations, and an Expr/Predicate split that has already been revised once and should be expected to change again. |

Two of §11's four read-contract pieces were also never built, because nothing
needed them: *expectation* has no consumer, and *observation* belongs to the
subscription that runs a read rather than to the read.

## 1. Decision

Foldkit Plus should not add a second data architecture.

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

> **The meaning of a query should become a first-class, composable, source-neutral value, without collapsing query semantics, query identity, consumer selection, pagination, and observation policy into one object.**

The proposed architecture is:

~~~text
                         URL SEMANTICS

URL
 │
 ▼
Foldkit Router
bidirectional parser/printer
 │
 ▼
typed AppRoute
 │
 ▼
Model


                         DOMAIN SEMANTICS

Entity / Field
      │
      ▼
     Expr
      │
      ▼
 Predicate
      │
      ▼
anonymous Query
      │
      ▼
QueryDefinition
named + parameterized
      │
      ▼
   QueryRef
definition + concrete input
stable logical identity


                         CONSUMER CONTRACT

   QueryRef / EntityRef
      │
      ├── Selection
      ├── requested window
      ├── required / optional expectation
      └── observation / delivery requirement
      │
      ▼
 ReadContract
(conceptual; need not be public)
      │
      ▼
  Projection
      │
      ▼
   Surface


                         EXECUTION

 ReadContract / requirement
      │
  ┌───┼───────────────┐
  ▼   ▼               ▼
Remote TanStack     LiveStore
  │
RemoteServer
  │
remote-drizzle
  │
 SQL
~~~

The central rules are:

> **Compose query semantics first. Name and bind them second. Let Model state activate feature/read requirements third. Interpret last.**

> **Routing describes URL state; it does not own application data loading.**

and:

> **One transition authority per fact; any number of explicit derived, cached, mirrored, indexed, or rendered representations.**

---

## 2. Core principles

### 2.1 One transition authority per fact

Secondary representations are normal and useful. They are not automatically competing state owners.

| Representation | Authority |
| --- | --- |
| ordinary local domain/UI state | application Model / Message / update |
| server-owned facts represented in Remote.Model | server |
| Sync optimistic shared value | authoritative journal + pending durable Messages |
| URL / KV mirror | application Model |
| local SQLite read model | the facts/materializer that produce it |
| TanStack live-query result | its source collections |
| DOM | current Foldkit Model |

Do not let LiveStore's event log and foldkit-sync both own the same durable fact.

### 2.2 Reads and writes remain different semantic layers

Reads describe observation:

~~~text
Expr / Predicate / Query
Selection / ReadContract
~~~

Writes remain semantic Foldkit transitions:

~~~text
Message
   ↓
update
   ↓
Model
~~~

Do not replace semantic Messages with imperative record mutation as the application transition API.

### 2.3 Declarations are data

Portable semantics should be inspectable values:

~~~text
declaration
    ↓
typed immutable IR
    ↓
interpreter
~~~

not arbitrary backend callbacks retained as the only representation of meaning.

### 2.4 Query semantics are not consumer policy

A query should describe the population/relation.

It should not also have to own:

~~~text
which fields this component needs
whether absence is an error
which pagination window this component is requesting
whether SSR should defer it
whether a particular Surface is active
how a renderer subscribes
~~~

Those belong above the relational Query.

### 2.5 Generalize declarations before runtimes

Remote's EntityStore, Connection, optimistic layers, mutation ledger, retention, and planner are substantial working infrastructure.

Do not extract them because they look generic.

First prove portable declarations through multiple interpreters.

---

## 3. Existing Foldkit Plus pieces and their roles

### 3.1 Entity is the semantic noun

foldkit-entity already answers:

~~~text
What is a Project?
Which intrinsic fields does it have?
Which relations may be followed?
Which derived members may an interpreter supply?
~~~

Keep Entity independent of SQL, TanStack, LiveStore, routes, CRUD, and storage.

Do not introduce another generic record/Collection schema beside Entity.

### 3.2 Selection is the semantic entity shape

Selection answers:

> Which facts about each entity does this consumer need?

~~~ts
const ProjectSummary = Entity.select(Project, {
  id: true,
  name: true,
  owner: UserSummary,
})
~~~

Selection should remain independently reusable and late-bound to a query/read.

### 3.3 Query is population semantics

Query answers:

> Which entities/rows belong in this relation, under what conditions and ordering?

Keep:

~~~text
Query
  which rows?

Selection
  which facts about each row?
~~~

### 3.4 Data is already the application-facing seam

`Data` is the bound `RemoteDomain` returned by `Remote.make`, not a separate package.

Existing operations include:

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

This is already strong application vocabulary.

Do not create a parallel `foldkit-data` package merely to rename the same concepts.

### 3.5 Remote is already a substantial client data runtime

Remote already provides:

~~~text
normalized EntityStore
field presence / staleness
tombstones
Connections
pagination segments and explicit boundaries
stable QueryRef identity
optimistic entity layers
connection overlays
live insert/remove/invalidate
mutation reconciliation
retention / GC
persistence
Surface-driven subscription lifetime
~~~

TanStack DB or LiveStore should initially sit behind/alongside the semantic layer, not cause this runtime to be rewritten.

### 3.6 Surface is already the semantic lifecycle boundary

Preserve:

~~~text
Surface active
    ↓
Projection metadata active
    ↓
read requirements active
    ↓
Data.subscriptions / interpreter work
~~~

Rendering should not perform I/O.

---

## 4. Prior-art synthesis

### 4.1 gen2: separate relational programs from named functions

gen2 concretely separates:

~~~text
QueryExpression
  the relational program

QueryFunction
  name
  input type
  output type
  reactivity metadata
  requirements
  authorization/runtime metadata
~~~

Foldkit should adopt this conceptual split in a smaller form:

~~~text
Query<Row>
  anonymous composable relation

QueryDefinition<Input, Row>
  named parameterized capability
~~~

### 4.2 gen2: Expr values enable analysis

gen2's expression AST makes field and parameter references inspectable.

That enables:

~~~text
compilation
dependency extraction
runtime capability checking
reactivity analysis
diagnostics
~~~

Foldkit should use a much smaller Expr kernel to gain the same leverage.

### 4.3 gen2: do not copy the whole compiler taxonomy

gen2 needs separate Expr, RuleExpr, QueryExpr, ActionExpr, PatchExpr, PlanExpr, and more because it is attempting a much broader application compiler.

Foldkit Plus should begin with:

~~~text
Expr<T>
Predicate = Expr<boolean>
Query<Row>
QueryDefinition<Input, Row>
~~~

A future Rule can wrap the same Predicate instead of inventing another boolean language.

### 4.4 data-forge: filters and projections are reusable

data-forge is mostly a design sketch, but its split between reusable filters and reusable projections reinforces:

~~~text
Predicate / Query fragment
  reusable population constraint

Selection
  reusable entity projection
~~~

Foldkit's Entity.Selection is already the stronger projection abstraction.

### 4.5 tanstackstart-db: query composition and read-contract composition are different

doeixd/tanstackstart-db is especially useful because its `DbQuerySpec` combines several operations that look fluent together but mean different things:

~~~ts
q.post
  .byId(id)       // query identity / population
  .as(PostView)   // selection
  .required()     // result expectation
  .live()         // observation policy
  .defer()        // loading/SSR policy
~~~

This exposes an important design boundary for Foldkit:

> **There are two separate composition problems: composing what a query means, and composing how a consumer wants to read it.**

Foldkit should preserve the ergonomics without collapsing the semantics.

### 4.6 tanstackstart-db: logical key and resource key differ

tanstackstart-db distinguishes the underlying query key from a consumer/resource key that additionally includes view/selector composition.

That maps naturally to Foldkit:

~~~text
QueryRef identity
  QueryDefinition + canonical encoded input

Read identity
  QueryRef
  + Selection
  + requested window
  + result expectation
  + relevant observation/delivery semantics
~~~

A Selection or window may change a consumer requirement without changing the logical Remote Connection identity.

### 4.7 tanstackstart-db: Selection can be pushed down or materialized later

Its Views can sometimes compile directly into TanStack select/join operations and otherwise materialize nested relationships after execution.

Foldkit should preserve the same freedom:

~~~text
Selection semantics
      ↓
interpreter decides
      ├── push down into SQL / local query
      └── satisfy/materialize after base query
~~~

The application should not care.

### 4.8 tanstackstart-db: generated helpers are useful sugar, not the primitive

Schema/index/relationship declarations generate ergonomics such as:

~~~text
q.post.byId(id)
q.post.byAuthor(authorId)
q.post.author(id)
~~~

Foldkit can eventually derive similar helpers from Entity identity/fields/relations.

But generated helpers should lower to the same Query/QueryDefinition algebra; they should not become a second query system.

### 4.9 tanstackstart-db: query bundles are prior art for grouped read contracts

`db.request(...)` groups named reads and allows later stages to depend on earlier results.

Foldkit already has Surface/Projection as its semantic observation boundary, so it should not immediately add a Request subsystem.

Still, staged read dependency is a useful future problem to remember.

### 4.10 TanStack DB: keep the execution engine beneath Foldkit semantics

TanStack DB contributes:

~~~text
incremental view maintenance
joins
aggregates
derived collections
source adapters
query-driven loading
optimistic transactions
~~~

Treat these as execution capabilities, not reasons to replace Foldkit Model/Message/update.

### 4.11 LiveStore: materialization and durable local SQL

LiveStore contributes:

~~~text
durable events
materializers
local SQLite
reactive SQL
offline persistence
atomic event commits
~~~

Its event log can be the durable authority for a domain, or Foldkit Sync/Durable can be.

Not both for the same fact.

---

## 5. Semantic layers

The target vocabulary is:

~~~text
Entity
  semantic noun

Field
  addressable member

Expr<T>
  typed scalar computation

Predicate
  Expr<boolean>

Query<Row>
  anonymous relational computation

QueryDefinition<Input, Row>
  named parameterized query capability

QueryRef
  QueryDefinition + concrete input
  stable logical query identity

Selection
  reusable requested entity shape

ReadContract
  QueryRef/EntityRef + consumer read requirements
  conceptual layer; public name/API not yet decided

Projection
  pure read into Foldkit Model plus interpreter metadata

Surface
  active semantic observation boundary

Message
  semantic transition

Wiring
  structural installation boundary
~~~

This is intentionally smaller than gen2 and more semantically separated than tanstackstart-db's DbQuerySpec.

---

## 6. Expr: the portable scalar kernel

A minimal Expr AST needs:

~~~text
literal
field reference
input parameter reference
operation
~~~

Conceptually:

~~~ts
type Expr<T> =
  | LiteralExpr<T>
  | FieldExpr<T>
  | InputExpr<T>
  | OperationExpr<T>
~~~

Initial operations should be driven by real existing queries.

A likely first kernel:

~~~text
eq / neq
lt / lte / gt / gte
and / or / not
in / notIn
isNull / isNotNull
contains / startsWith / endsWith
~~~

Ordering may be a separate value:

~~~text
Asc(Expr)
Desc(Expr)
~~~

Do not model arbitrary JavaScript.

Do not recreate SQL.

### 6.0 An operator without stated semantics is not portable

**This was the largest gap in the first draft of this document, found by
building it.** The list above names operators and says nothing about what any of
them *means*. That is not a small omission: it is the difference between a
source-neutral IR and a source-*shaped* one.

Two cases found in practice, neither exotic:

| Operator | SQLite | Postgres | JavaScript |
| --- | --- | --- | --- |
| `contains` (via `like`) | ignores case | respects case | `includes` respects case |
| ordering by a null | nulls first | nulls last (`asc`) | no convention at all |

A body using `contains` therefore matched different rows in all three places,
and `contains` had shipped into `foldkit-cms` before a differential test with a
mixed-case fixture caught it. The backends of one product disagreed about what
its own search box did.

**The rule this establishes:**

> Every operator states its semantics here before it is built, in terms an
> interpreter can be held to, and every interpreter is bound to that statement
> rather than to whatever its backend happens to do.

Where backends disagree, the design picks one and the interpreters *make* their
backend do it — `contains` compiles to `lower(x) like lower(?)` rather than
leaving `like` to mean what it locally means. Where there is no defensible pick,
the operator refuses rather than guesses: ordering by a null throws in the
reference interpreter, because SQLite and Postgres disagree with each other and
choosing one would make the IR wrong against the other.

### 6.0.1 The semantics of what exists

The four operators built, stated as an interpreter must implement them.

**Three-valued logic throughout.** A predicate answers true, false, or unknown,
and a row is kept only on true. This follows SQL rather than JavaScript,
because SQL is what the compiling interpreter runs.

| Operator | Meaning | Unknown when | Notes |
| --- | --- | --- | --- |
| `eq(a, b)` | the two values are the same | either side is null, *including both* | `null = null` is unknown, not true. JavaScript would disagree. |
| `isNull(x)` / `isNotNull(x)` | whether a value is absent | never | The one comparison that always has an answer. One node, with the answer absence gives flipped, so nothing has to negate a predicate. |
| `contains(x, s)` | `x` holds `s` anywhere within it | either side is null | **Case-insensitive, ASCII folding.** Containing the empty string is everything, so an empty search box is the same query as a full one — but over a nullable column that is not the same as no filter, since a null contains nothing. |
| `asc(f)` / `desc(f)` | read in this order | — | A field only. **Ordering by a column that is null in some row is refused**, not guessed. **Text orders by code point**, so `Other` precedes `intro`; an engine that sorts by locale must be told otherwise. |

Two consequences worth stating plainly, because both surprised the
implementation:

- **`contains` is ASCII-folded, not Unicode-folded**, because that is what
  `lower` does in SQLite without ICU. A design that promised Unicode folding
  would be promising something one of its interpreters cannot deliver.
- **Ordering text is by code point, not by locale.** This was missing until a
  third interpreter was written: TanStack DB sorts strings by locale by
  default, so it put `intro to sql` before `Other` where SQLite and the
  reference interpreter put it after. Both answers are defensible and only one
  can be the semantics. An engine that defaults to locale is told to sort
  lexically; an engine that cannot would have to refuse the ordering, the same
  way it refuses an operator it does not run.

  **One interpreter does not yet enforce this.** SQLite orders text by code
  point by default, so `foldkit-remote-drizzle` conforms there by accident of
  the backend rather than by asking. Postgres orders by the database's collation,
  which for a typical `en_US.UTF-8` is not code point — a body ordered by text
  would mean one thing on SQLite and another on Postgres, through the same
  compiler. Making it ask would mean emitting `COLLATE "C"`, and is not done.
- **A predicate may stand where a boolean is wanted.** `eq(isNotNull(x), flag)`
  is the branchless form §6.2 requires, so `eq` takes a predicate on either
  side. This was not in the first draft and forced a typing change; see §6.2.1.

### 6.0.2 How a new operator is added

1. State its semantics in §6.0.1, including what makes it unknown.
2. Name the real query that needs it. §28 is not optional here — the operator
   set is small because every member had a caller before it had an
   implementation.
3. Implement it in the reference interpreter **first**, then in the compiling
   one. See the note on phase ordering in §32.
4. Add differential cases covering the disagreement the table in §6.0 would
   predict — case, null, empty, and whatever the operator's own edges are. A
   fixture that cannot distinguish the backends does not test the operator; the
   `contains` bug lived behind eight passing differential cases whose values
   were all lowercase.

### 6.1 Prefer a functional core

Canonical:

~~~ts
Expr.eq(Project.fields.status, "active")

Expr.and(
  Expr.eq(Project.fields.status, "active"),
  Expr.eq(Project.fields.ownerId, input.ownerId),
)
~~~

The API may coerce Fields/literals into Expr values.

Method sugar such as:

~~~ts
Project.fields.status.eq("active")
~~~

can exist later without being the semantic representation.

### 6.2 QueryDefinition inputs become Expr values during construction

~~~ts
Query.define(
  "ProjectsByOwner",
  { ownerId: ProjectId },
  ({ input }) => ...
)
~~~

Inside the builder, `input.ownerId` is an InputExpr, not the runtime value.

The callback executes while constructing the static declaration.

### 6.2.1 What that rule costs, and how to pay it

This rule is right and it is also the sharpest edge in the design. It was
stated here without checking it against the hardest query in the repository it
was written for — which turned out to be unwriteable under it.

`foldkit-cms`'s worklist branched on its inputs twice:

~~~ts
where: input =>
  and(
    eq(entries.type, input.type),
    input.archived ? isNotNull(entries.archivedAt) : isNull(entries.archivedAt),
    input.search === '' ? undefined : sql`${entries.label} like …`,
  )
~~~

Under this rule neither ternary can be written — and, worse, **writing one
anyway is silently wrong rather than a type error**: an `InputExpr` is an
object, so `input.archived ? a : b` is always truthy and decides itself once,
at declaration, forever.

**Neither branch was relational semantics.** Both were an encoding choice, and
both dissolve into one static question:

| Written as a branch | Asked as a question |
| --- | --- |
| `archived ? isNotNull(x) : isNull(x)` | `eq(isNotNull(x), input.archived)` — *is-archived equals what you asked for* |
| `search === '' ? skip : like(…)` | `contains(label, input.search)` — everything contains the empty string |

This is the general move, and it is worth naming because it is not obvious:

> **A branch on an input is usually a comparison that has not been written yet.**
> Ask the question the branch was deciding between, and compare its answer to
> the input.

Two things follow that the first draft did not anticipate:

- **`eq` must accept a predicate where a boolean is wanted**, since
  `isNotNull(x)` is one. An IR that keeps predicates and scalars in separate
  types cannot express this; the implementation made that separation and had to
  undo it.
- **A boolean should not reach the database as a parameter.** `(x is not null) =
  ?` is refused outright by SQLite and means different things across dialects.
  The compiling interpreter runs *per request* and has the input in hand, so it
  settles such a comparison into the predicate or its negation — emitting
  exactly the SQL the ternary would have, with no parameter. The body stays
  static; the SQL stays conventional.

**The escape hatch remains** for a query that genuinely needs native SQL. It was
not needed for this one, and reaching for it here would have left the hardest
real query outside the IR — which is the query most worth having inside it.

### 6.3 Dependencies are derivable

From:

~~~ts
Expr.and(
  Expr.eq(Project.fields.status, "active"),
  Expr.eq(Project.fields.ownerId, input.ownerId),
)
~~~

derive:

~~~text
fields:
  Project.status
  Project.ownerId

inputs:
  ownerId

operations:
  eq
  and
~~~

---

## 7. Predicate is not a separate language

Initially:

~~~ts
type Predicate = Expr<boolean>
~~~

Reusable predicates:

~~~ts
const ActiveProject = Expr.eq(
  Project.fields.status,
  "active",
)

const OwnedBy = (ownerId: Expr<ProjectId>) =>
  Expr.eq(Project.fields.ownerId, ownerId)
~~~

A future named Rule can simply be:

~~~text
Rule
  name
  Input
  predicate: Predicate
~~~

so authorization/query/UI tooling can share one boolean algebra.

---

## 8. Query: anonymous immutable relational composition

The primitive:

~~~ts
Query.from(Project)
~~~

produces an anonymous Query value.

Pipeable transformations compose it:

~~~ts
const Active = Query.where(
  Expr.eq(Project.fields.status, "active"),
)

const Recent = Query.orderBy(
  Query.desc(Project.fields.updatedAt),
  Query.asc(Project.fields.id),
)

const RecentActiveProjects = Query.from(Project).pipe(
  Active,
  Recent,
)
~~~

### 8.1 Pipeable combinators are canonical

Prefer:

~~~ts
Query.from(Project).pipe(
  Query.where(...),
  Query.orderBy(...),
)
~~~

because fragments themselves are reusable.

A fluent facade may exist later, but should lower to the same immutable values.

### 8.2 Query composition creates data, not work

Each transformation returns a new inspectable Query.

No network access, subscription, SQL execution, or cache mutation occurs.

### 8.3 Composition laws should be explicit

Likely defaults:

~~~text
where + where
  conjunction

orderBy + orderBy
  append ordering terms
~~~

If replacement is needed, provide an explicit replace/reset combinator rather than hidden last-write-wins behavior.

### 8.4 Do not add Selection to ordinary Entity Query yet

For normal entity reads, preserve:

~~~text
Query
  which rows?

Selection
  which fields?
~~~

General relational projection becomes necessary for joins/aggregates that return non-Entity rows.

Add that only when a real query requires it.

---

## 9. QueryDefinition: naming and parameterization at the boundary

Compose anonymously first:

~~~ts
const BaseProjects = Query.from(Project).pipe(
  Query.where(
    Expr.eq(Project.fields.status, "active"),
  ),
  Query.orderBy(
    Query.desc(Project.fields.updatedAt),
    Query.asc(Project.fields.id),
  ),
)
~~~

Then give the program an application identity:

~~~ts
const ProjectsByOwner = Query.define(
  "ProjectsByOwner",
  { ownerId: ProjectId },
  ({ input }) =>
    BaseProjects.pipe(
      Query.where(
        Expr.eq(Project.fields.ownerId, input.ownerId),
      ),
    ),
)
~~~

A QueryDefinition owns concepts such as:

~~~text
stable name/id
input Schema
row/result entity or result kind
anonymous Query body
derived requirements/dependencies
~~~

It should not automatically own:

~~~text
consumer Selection
pagination window
required/optional expectation
Surface lifetime
SSR deferral
Remote connection state
~~~

### 9.1 Public type naming is not decided

This document uses `QueryDefinition`.

Possible exported names include:

~~~text
Query.Def
QueryDefinition
Query.define return type
~~~

Avoid `QueryFunction` if it suggests arbitrary runtime JavaScript.

---

## 10. QueryRef: concrete input and stable logical identity

The current Remote QueryRef behavior is valuable and should be preserved.

Logical identity:

> **QueryDefinition + canonical encoded input**

For example:

~~~text
ProjectsByOwner(owner=u1)
~~~

is the stable logical connection/query identity.

Pagination window is excluded:

~~~text
ProjectsByOwner(owner=u1).first(25)

ProjectsByOwner(owner=u1)
  .after(cursor)
  .first(25)
~~~

remain windows over the same logical connection.

Conceptually:

~~~text
QueryDefinition
      +
concrete input
      ↓
   QueryRef
      │
      └── stable identity
~~~

The source-neutral Query IR should not need to absorb Remote cursor/Connection semantics.

---

## 11. ReadContract: consumer composition above QueryRef

tanstackstart-db makes this missing layer visible.

A particular consumer does not merely ask for a QueryRef.

It asks for a QueryRef **in a particular shape and mode**.

Conceptually:

~~~text
ReadContract
  source:
    QueryRef or EntityRef

  shape:
    Selection

  window:
    first / last / after / before where applicable

  expectation:
    optional / required

  observation:
    whatever read/live policy the Data interpreter needs

  delivery:
    interpreter/Surface/SSR metadata where appropriate
~~~

`ReadContract` is a conceptual name. It does not need to become a public package/type.

### 11.1 Current Data.query already approximates this layer

Today:

~~~ts
Data.query(
  ProjectsByOwner,
  { ownerId },
  {
    select: ProjectSummary,
    first: 25,
  },
)
~~~

already combines:

~~~text
QueryDefinition
+ input
+ Selection
+ window
    ↓
Projection + Remote requirement metadata
~~~

The implementation experiment can introduce the semantic separation internally without forcing a new public API.

### 11.2 A future fluent read API is possible, but not required

tanstackstart-db shows the ergonomics of:

~~~ts
q.post.byId(id)
  .as(PostCard)
  .required()
~~~

A Foldkit experiment might eventually support something like:

~~~ts
Data.query(ProjectsByOwner, { ownerId })
  .select(ProjectSummary)
  .first(25)
~~~

or pipeable Read combinators.

Do not commit to this until it fits Projection/Data typing cleanly.

The architectural requirement is the separation, not the chaining syntax.

### 11.3 Required/optional is not relational semantics

`required()` means:

> the consumer treats absence as an error/NotFound boundary

It does not change which row satisfies the Query.

Therefore it belongs to the read/result contract.

### 11.4 Observation mode is not relational semantics

Whether a consumer observes live changes or performs a one-shot/static read is not part of the relational predicate.

Foldkit should preserve its existing Data/Surface lifecycle model rather than importing `.live()` into Query.

### 11.5 SSR defer/preload policy belongs even higher

tanstackstart-db's `.defer()` and `.preloadOnly()` are useful route-delivery policies.

For Foldkit these should live in Surface/Wiring/SSR integration, not QueryDefinition.

---

## 12. Two identities: logical query vs consumer read

This should be explicit.

### 12.1 Logical query identity

~~~text
QueryDefinition
+ canonical input
=
QueryRef identity
~~~

Used for:

~~~text
Remote Connection identity
server/live query identity
logical invalidation
shared population semantics
~~~

### 12.2 Consumer read identity

Conceptually:

~~~text
QueryRef
+ Selection
+ window
+ result expectation
+ relevant observation/delivery policy
=
Read identity
~~~

Used for:

~~~text
resource/subscription dedup
SSR consumed-data tracking
Projection requirement comparison
DevTools explanation
~~~

Important:

> Two reads may have different Read identities while sharing one underlying Remote Connection.

That is the same useful distinction tanstackstart-db discovered with query key vs resource/cache key, but adapted to Foldkit's stronger normalized Remote model.

### 12.3 What planning actually keys on, and why it is not this

> **Built differently, deliberately.** Phase 4 made the read contract explicit
> inside `Data.query` (`ReadContract` in `foldkit-remote`, an internal shaping
> step rather than a public type). Writing it down showed that the read identity
> above is not what the planner keys on, and should not be.
>
> `Requirement.mergeConnections` keys on **connection identity + window**, and
> *unions* the Selections. Two consumers asking one connection and window for
> different shapes merge into one requirement whose fields are the union, so one
> read serves both. An identity that included the Selection — as §12.2 proposes
> — would split them and fetch the same page twice, which is worse for exactly
> the case the distinction was introduced to handle.
>
> The useful distinction survives, one layer lower: the *logical* identity
> (§12.1) excludes the window, so pages share a connection; the *planning* key
> includes it, so pages are fetched separately; and the shape is merged rather
> than keyed, so shape never causes a second fetch. Pinned by
> `requirement.test.ts` ("mergeConnections unions what one connection and window
> select, and keeps windows apart") and `domain.test.ts` ("two projections of one
> connection plan one query and select the union of their fields").
>
> Two of §11's four pieces are also simply absent, and carrying them would be
> ceremony: *expectation* (required/optional) has no consumer, and *observation*
> is a policy of the subscription that runs the read rather than of the read.

---

## 13. Selection remains late-bound and interpreter-neutral

A Selection can be satisfied differently by each interpreter.

~~~text
Remote/Drizzle
  compile selected fields/relations into SQL when possible

TanStack
  compile into select/join when useful

LiveStore
  compile into SQLite query or materialize from local rows

Remote cache
  request/fill only missing selected fields
~~~

Nested relation Selection should continue to reuse Entity relation semantics rather than be reimplemented inside Query.

This is especially important because remote-drizzle already knows how to compile Selection/relations.

---

## 14. Generated helpers should lower to the core algebra

tanstackstart-db demonstrates the usefulness of schema-derived helpers.

Foldkit could eventually derive conveniences such as:

~~~text
by identity
by an explicitly queryable/indexed field
through a Relation
~~~

Possible ergonomics:

~~~ts
Query.by(Project.fields.ownerId)
Query.relation(Project.relations.owner)
~~~

or helpers exposed from a bound Data/Entity namespace.

But the invariant should be:

> Generated helpers produce Query / QueryDefinition / QueryRef values; they are not a separate query runtime.

Start with the explicit algebra. Add generation after common patterns are proven.

---

## 15. Query dependencies and capabilities are derived

A static query can explain itself.

~~~ts
const query = Query.from(Project).pipe(
  Query.where(
    Expr.and(
      Expr.eq(Project.fields.status, "active"),
      Expr.eq(Project.fields.ownerId, input.ownerId),
    ),
  ),
  Query.orderBy(
    Query.desc(Project.fields.updatedAt),
  ),
)
~~~

Derive:

~~~text
entities:
  Project

fields:
  Project.status
  Project.ownerId
  Project.updatedAt

inputs:
  ownerId

operations:
  eq
  and
  order
~~~

Potential helpers:

~~~ts
Query.dependencies(query)
Query.requirements(query)
~~~

Consumers include:

~~~text
remote-drizzle
  SQL columns / compiler checks

Remote planner
  source pushdown / requirements

TanStack
  execution/index planning

DevTools
  explanation

SSR
  consumed dependency graph

agents
  capability description

future invalidation
  candidate affected reads
~~~

---

## 16. Interpreter capability checking

An interpreter should declare its supported portable operators.

Conceptually:

~~~text
remote-drizzle:
  eq
  range
  boolean composition
  order
  ...

in-memory:
  portable kernel

simple REST source:
  eq
  order
  pagination
~~~

Binding/compilation should fail explicitly for unsupported semantics.

Do not silently change meaning.

> Done. `Query.unsupported(query, supported)` in `foldkit-entity` names the
> operations a body needs that an interpreter does not run; the refusal is the
> interpreter's, because one that compiles at registration and one that runs a
> body directly fail at different moments. `foldkit-remote-drizzle` declares its
> set and checks in `checkFields`, so a server that starts is one whose queries
> it can answer; `foldkit-remote-server` declares its own and checks in
> `evaluate`.
>
> Both currently run the whole kernel, so there is nothing to refuse yet. It is
> built now rather than later because the [conformance
> suite](#18-add-an-in-memory-reference-interpreter-second) makes the gap
> dangerous: a third interpreter that skipped an operator it had not implemented
> would pass every case it happened to support, and the suite would report that
> it conforms.

Backend-native escape hatches remain first-class and explicitly non-portable.

---

## 17. remote-drizzle is the first compiler

Today query semantics are split between the Remote descriptor and Drizzle adapter configuration:

~~~ts
const ProjectsByOwner = Query.make(...)

query(ProjectBinding, ProjectsByOwner, {
  where: input => ...,
  orderBy: ...,
})
~~~

The first implementation goal is:

~~~ts
const ProjectsByOwner = Query.define(
  "ProjectsByOwner",
  { ownerId: ProjectId },
  ({ input }) =>
    Query.from(Project).pipe(
      Query.where(
        Expr.eq(Project.fields.ownerId, input.ownerId),
      ),
      Query.orderBy(
        Query.desc(Project.fields.updatedAt),
        Query.asc(Project.fields.id),
      ),
    ),
)
~~~

Then:

~~~ts
query(ProjectBinding, ProjectsByOwner)
~~~

with no duplicated common predicate/order semantics.

Keep the current adapter callback form as a native escape hatch and migration path.

### 17.1 Authorization remains an independent authoritative boundary

Portable Query semantics must not bypass:

~~~text
RemoteServer field authorization
binding-level row visibility
relation policies
application authentication
~~~

A Query describes requested rows.

Authorization determines which requested facts a principal may observe.

The current remote-drizzle visibility work is therefore complementary to this design, not replaced by it.

---

## 18. Add an in-memory reference interpreter second

Before integrating another large runtime, implement:

~~~text
Entity rows
+ Query IR
+ input
    ↓
matching ordered rows
~~~

Use it for:

~~~text
unit tests
operator semantic tests
differential tests against real Drizzle SQL
portable-kernel conformance
~~~

Acceptance criterion:

> The same QueryDefinition returns equivalent results through the in-memory interpreter and remote-drizzle for the supported subset.

---

## 19. TanStack DB should be an execution engine

The tanstackstart-db repo confirms a good architectural pattern:

> Add application contracts above TanStack DB; do not duplicate its engine.

For Foldkit:

~~~text
Query / ReadContract
      ↓
TanStack interpreter
      ↓
TanStack collections
+ incremental live query
      ↓
explicit Foldkit boundary
      ↓
Message / Model / Projection
~~~

Useful TanStack capabilities:

~~~text
incremental view maintenance
joins
aggregates
derived collections
indexes
source adapters
query-driven loading
~~~

Do not make application Views directly depend on hidden mutable TanStack runtime state.

Do not replace Foldkit Messages with TanStack record mutation as the semantic application API.

---

## 20. LiveStore should be an interpreter with explicit ownership

Read path:

~~~text
Surface active
    ↓
ReadContract active
    ↓
LiveStore adapter
    ↓
SQLite/live query
    ↓
Foldkit Message / Model
~~~

Two valid durable ownership modes:

### A. LiveStore owns durable history

~~~text
Foldkit intent
    ↓
Command
    ↓
LiveStore event
    ↓
event log
    ↓
materializer
    ↓
SQLite
~~~

### B. Foldkit Sync/Durable owns durable history

~~~text
durable Foldkit Message
    ↓
Sync / Durable
    ↓
authoritative operation order
    ↓
materializer
    ↓
queryable local read model
~~~

Never use both logs as co-authorities for the same fact.

---

## 21. Query-driven loading becomes richer with ReadContract

Remote already performs:

~~~text
active Selection requirement
    ↓
compare normalized cache
    ↓
fetch missing/stale selected fields
~~~

With semantic Query + ReadContract, the planner can reason about:

~~~text
population predicate
ordering
Selection
window
current cache coverage
~~~

Then execution can vary:

~~~text
Remote/Drizzle
  push predicate/order/window/selection to server

TanStack
  execute locally over synced collections

LiveStore
  execute in local SQLite

hybrid future
  remote pushdown + local derived composition
~~~

This is the most direct place where Query semantics and existing Remote planning reinforce each other.

---

## 22. Query bundles: useful prior art, not a new Foldkit subsystem

tanstackstart-db supports:

~~~ts
db.request(({ q }) => ({
  post: ...,
  comments: ...,
}))
~~~

and staged extension when later reads need earlier values.

Foldkit already has:

~~~text
Surface
Projection composition
Bundle/Wiring
Model transitions
~~~

so do not add `Request` merely to copy this API.

However, if real features repeatedly need staged dependent reads, consider a small read-set abstraction later:

~~~text
parallel ReadContracts
      ↓
stage result
      ↓
dependent ReadContracts
~~~

It should compose with Surface rather than own another cache/lifecycle system.

---

## 23. Action "affects" is useful prior art; derive before declaring

tanstackstart-db actions can declare:

~~~text
this mutation affects query X / field Y
~~~

to drive pending UI/invalidation.

Foldkit has stronger semantic ingredients:

~~~text
Message
changed Model paths/fields
Expr/Query dependencies
Remote mutation metadata/live updates
~~~

Prefer deriving candidate affected reads where possible.

Conceptually:

~~~text
Message changes:
  Project.status
  Project.ownerId

Query dependencies:
  Project.status
  Project.ownerId

=> query may be affected
~~~

For exact cases that cannot be derived, allow explicit metadata/overrides.

Do not require every mutation author to manually maintain a parallel affected-query list if the architecture can infer it.

---

## 24. Future Foldkit materialization

LiveStore demonstrates the value of rebuildable read models.

Conceptually:

~~~text
authoritative facts
      ↓
Materializer
      ↓
derived index / table / search view
~~~

The invariant remains:

~~~text
update
  application transition meaning

Materializer
  rebuildable searchable representation
~~~

Start with an in-memory target before SQLite if this work is pursued.

---

## 25. Sync improvements that support materialization

Potential additions:

### 25.1 Committed-operation observation

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

Useful for indexes/materializers without exposing Sync internals.

### 25.2 Atomic semantic Message batches

~~~ts
replica.submitBatch([
  Message.CreatedInvoice(...),
  Message.AddedInvoiceLine(...),
  Message.AddedInvoiceLine(...),
])
~~~

with matching journal atomicity.

### 25.3 Durable encoding evolution

Historical durable wire formats should migrate to current Message representations.

Design the exact API only after a real migration is exercised.

---

## 26. Cross-source composition is a future planner problem

The Query algebra should not assume one physical source forever.

A future query could involve:

~~~text
Project
  server/Remote-owned

Draft
  local/Sync-owned
~~~

A future planner might produce:

~~~text
Remote fragment
      +
local fragment
      ↓
TanStack/local join
~~~

Possible strategies:

~~~text
server composition
local materialized view
streaming/local join
event-derived view
~~~

Do not build this planner until there is a real cross-source query that needs it.

---

## 27. Reactivity integration

The existing reactivity design distinguishes semantics from propagation:

~~~text
Message -> update -> Model

Projection.dependencies
       ↓
affected consumer recomputation
~~~

Query/ReadContract should contribute inspectable dependencies and requirement metadata.

They should not create another Foldkit reactive state graph.

An external engine may maintain its own internal incremental graph, but crossing into Foldkit application-observable state remains explicit.

~~~text
                    Projection
                   /          \
        Model dependencies    Read requirement
                 │                  │
                 ▼                  ▼
          Model transition      source change
                 \                  /
                  affected Surface
~~~

---

## 28. Data should be generalized only from evidence

Do not create a generic DataProvider interface first.

Build:

~~~text
Remote/Drizzle
in-memory reference interpreter
TanStack or LiveStore interpreter
~~~

then compare.

Likely common application concepts:

~~~text
get
query
Selection
ReadContract
Projection
Surface activation
subscriptions
~~~

Likely Remote-specific concepts:

~~~text
RemoteClient
RemoteData
storeOf
plan
Remote.Model reducer
Remote persistence
Remote mutation reconciliation
Connections
~~~

Let the abstraction emerge from implementations.

---

## 29. DevTools, agents, and CMS

### 29.1 DevTools

A read can explain both its logical query and its consumer contract:

~~~text
Surface: ProjectPage

QueryDefinition:
  ProjectsByOwner(ownerId)

Query:
  FROM Project
  WHERE Project.status = "active"
  AND Project.ownerId = $ownerId
  ORDER BY Project.updatedAt DESC

QueryRef identity:
  ProjectsByOwner + owner=u1

Read:
  Selection: ProjectSummary
  Window: first 25
  Expectation: list
  Executor: remote-drizzle

Dependencies:
  Project.status
  Project.ownerId
  Project.updatedAt
~~~

### 29.2 Agents

A QueryDefinition can become an application-sanctioned read capability rather than unrestricted DB access.

The application controls which named definitions and selections an agent may use.

Server authorization remains authoritative.

### 29.3 CMS

CMS already has concrete queries such as worklists and by-slug reads.

These are good migration candidates because they exercise:

~~~text
real QueryDefinitions
visibility rules
Selections
Remote/Drizzle execution
different consumer read shapes
~~~

Do not add CMS-specific query infrastructure.

---

## 30. Proposed API sketch

This is illustrative, not committed.

### 30.1 Reusable predicate

~~~ts
const ActiveProject = Expr.eq(
  Project.fields.status,
  "active",
)

const OwnedBy = (ownerId: Expr<ProjectId>) =>
  Expr.eq(Project.fields.ownerId, ownerId)
~~~

### 30.2 Anonymous query

~~~ts
const RecentActiveProjects = Query.from(Project).pipe(
  Query.where(ActiveProject),
  Query.orderBy(
    Query.desc(Project.fields.updatedAt),
    Query.asc(Project.fields.id),
  ),
)
~~~

### 30.3 Named parameterized query

~~~ts
const ProjectsByOwner = Query.define(
  "ProjectsByOwner",
  { ownerId: ProjectId },
  ({ input }) =>
    RecentActiveProjects.pipe(
      Query.where(
        OwnedBy(input.ownerId),
      ),
    ),
)
~~~

### 30.4 Existing Data API can remain

~~~ts
const Data = Remote.make({
  model: App.fields.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})
~~~

~~~ts
const projects = Data.query(
  ProjectsByOwner,
  { ownerId },
  {
    select: ProjectSummary,
    first: 25,
  },
)
~~~

Internally this can be understood as:

~~~text
ProjectsByOwner
  + { ownerId }
      ↓
   QueryRef
      +
 ProjectSummary
      +
   first 25
      ↓
 ReadContract
      ↓
 Projection
~~~

### 30.5 Optional future read ergonomics

Only if it fits cleanly:

~~~ts
Data.query(ProjectsByOwner, { ownerId })
  .select(ProjectSummary)
  .first(25)
~~~

or an equivalent pipeable form.

Do not make fluent syntax a prerequisite for the semantic redesign.

---


## 31. Routing, Surfaces, and page contracts

Foldkit Router, doeixd/combi-router, and doeixd/tanstackstart-db expose three different ways of thinking about routing. Taken together, they clarify where route-driven data belongs in Foldkit Plus.

The recommendation is:

> **Foldkit Router should remain the pure URL ↔ typed route-state layer. Route state lives in Model. Active route state activates Surfaces. Surfaces declare ReadContracts and permitted Messages. Data/interpreters perform the work.**

That preserves Foldkit's single application-state semantics while gaining the useful page-contract ergonomics explored by combi-router and tanstackstart-db.

### 31.1 Foldkit Router is a bidirectional URL algebra

Current Foldkit Router is not fundamentally a loader framework. It is a compositional bidirectional parser/printer.

Its important values include:

~~~text
Route.root
literal
slash
string / int / schemaSegment
Route.query
Route.mapTo
Route.oneOf
Route.parseUrlWithFallback
~~~

For example:

~~~ts
export const AppRoute = defineRouteUnion({
  Home: {},
  Project: { projectId: ProjectId },
  Search: {
    q: Schema.Option(Schema.String),
  },
  NotFound: { path: Schema.String },
})

export const projectRouter = pipe(
  literal("projects"),
  slash(schemaSegment("projectId", ProjectId)),
  Route.mapTo(AppRoute.Project),
)

export const searchRouter = pipe(
  literal("search"),
  Route.query(
    Schema.Struct({
      q: Schema.OptionFromOptional(Schema.String),
    }),
  ),
  Route.mapTo(AppRoute.Search),
)
~~~

A mapped Router can:

~~~text
parse URL -> typed AppRoute
typed route payload -> URL
~~~

Current Foldkit applications then keep the AppRoute in Model and handle URL changes through ordinary Messages/update.

That is a strong boundary and should remain small.

### 31.2 Router should not become a second data runtime

Do not move these responsibilities into Foldkit Router:

~~~text
normalized server data
query execution
loader-result caches
resource state
Remote retention
optimistic server mutations
live subscriptions
read invalidation
~~~

Those responsibilities already have homes:

~~~text
Model / Message / update
Surface
Projection metadata
Data / Remote
Command / Subscription
TanStack / LiveStore interpreters
~~~

This is the major difference from routers whose route object becomes a page runtime.

### 31.3 Route state activates Surface state

The normal route-driven read path should be:

~~~text
URL
 ↓ parse
AppRoute
 ↓
Model.route
 ↓
Surface activation
 ↓
Projection metadata
 ↓
ReadContracts
 ↓
Data.subscriptions
 ↓
Remote / TanStack / LiveStore
 ↓
Messages
 ↓
update
 ↓
Model
~~~

This is the Foldkit-native analogue of a route loader.

No special route-owned data state is required.

### 31.4 The current API already supports the architecture

Today:

~~~ts
Data.subscriptions({
  page: Surface.at(
    ProjectPage,
    model =>
      model.route._tag === "Project"
        ? { projectId: model.route.projectId }
        : undefined,
  ),
})
~~~

already means:

~~~text
Project route active
      ↓
ProjectPage Surface active
      ↓
its Projection requirements active
      ↓
Remote reads/live/retention active
~~~

Navigating away changes Model.route, which makes the Surface inactive and removes its requirements.

This is better aligned with Foldkit than attaching imperative loaders to the route parser itself.

### 31.5 Route params should flow into Surface params, then QueryDefinition inputs

A page Surface can expose the feature contract:

~~~ts
const ProjectPage = App.surface("ProjectPage", {
  params: {
    projectId: ProjectId,
  },

  model: ({ params }) => ({
    project: Data.get(
      Project,
      params.projectId,
      ProjectDetail,
    ),

    comments: Data.query(
      CommentsForProject,
      { projectId: params.projectId },
      {
        select: CommentRow,
        first: 50,
      },
    ),
  }),
})
~~~

The route only contributes the typed parameter:

~~~text
/project/p1
   ↓
AppRoute.Project({ projectId: p1 })
   ↓
Surface params { projectId: p1 }
   ↓
CommentsForProject input
   ↓
QueryRef
   ↓
ReadContract
~~~

That creates a clean separation:

~~~text
Router
  URL semantics

AppRoute
  navigation state

Surface
  feature activation and boundary

QueryDefinition / QueryRef
  population semantics and identity

ReadContract
  consumer shape/window/expectation

Data
  interpretation
~~~

### 31.6 Route.query and data Query are intentionally different namespaces

There are two distinct meanings of "query":

~~~text
Route.query(...)
  URL query-string parsing/printing

Query.from(...)
Query.where(...)
Query.define(...)
  relational data semantics
~~~

The overlap is acceptable because the namespaces and roles are different, but documentation should make the distinction explicit.

A typed URL such as:

~~~text
/projects?q=foldkit&status=open&sort=recent
~~~

can flow naturally into data semantics:

~~~text
Route.query(URL Schema)
      ↓
typed AppRoute fields
      ↓
Surface params
      ↓
QueryDefinition input
      ↓
QueryRef
      ↓
ReadContract
~~~

The URL describes user-visible navigation/filter state. It does not execute database work.

### 31.7 What to steal from combi-router

combi-router's strongest relevant idea is that routes/page descriptions are first-class composable values.

It explores:

~~~text
route(...)
extend(parent, ...)
pipe(route, enhancer...)
parent
ancestors
depth
routeChain
metadata
~~~

That suggests useful future Foldkit capabilities:

~~~text
route hierarchy inspection
route -> Surface manifests
head/SEO metadata
prefetch hints
DevTools route trees
pure page-level contract composition
~~~

But Foldkit should not copy combi-router's router-owned Resource/cache model.

The compositional **contract** idea is useful. The parallel router runtime is not.

### 31.8 What to steal from tanstackstart-db routes

tanstackstart-db demonstrates excellent page-contract ergonomics:

~~~ts
createDbFileRoute("/posts/$postId")
  .views(({ params, q }) => ({
    post: q.post.byId(params.postId)
      .as(PostCard)
      .required(),

    comments: q.comment.byPost(params.postId)
      .as(CommentCard),
  }))
  .actions(({ a, data }) => ({
    rename: a.post.patch.with({
      id: data.post.id,
    }),
  }))
  .build()
~~~

The important ideas are:

~~~text
page reads are explicit
read shapes are late-bound
route params feed reads
actions can be exposed/bound at the page boundary
contracts can be reused as fragments
dependent read stages can be expressed
SSR/preload policy is inspectable
~~~

Foldkit should express those ideas through its existing semantic pieces:

~~~text
AppRoute
Surface
Projection
ReadContract
Message subset
Wiring / SSR metadata
~~~

rather than making the Router own a second loader/cache lifecycle.

### 31.9 Surface is already most of a Foldkit page contract

A Surface describes:

~~~text
what the feature may observe
+
what Messages the feature may cause
+
params needed to instantiate that boundary
~~~

Once ReadContracts are represented through Projection metadata, a route-activated Surface is already close to:

~~~text
page data contract
+
page action contract
~~~

Therefore a new `Page` or `RouteContract` primitive is not justified yet.

First improve composition between Router and Surface.

### 31.10 Route activation could become more inspectable

`Surface.at(surface, model => params | undefined)` is semantically correct, but an arbitrary callback hides why the Surface is active.

A future generic tagged-state helper could be explored:

~~~ts
Surface.when(
  ProjectPage,
  App.fields.route,
  AppRoute.Project,
  route => ({
    projectId: route.projectId,
  }),
)
~~~

or:

~~~ts
Surface.whenTag(...)
~~~

The helper should not be router-specific. Routes are only one kind of tagged Model state that may activate a Surface.

Potential benefits:

~~~text
less repeated route-tag matching
static route -> Surface manifests
better DevTools explanations
SSR/prefetch analysis
architecture validation
~~~

Do not add this until it can remain as small and unsurprising as `Surface.at`.

### 31.11 Page/RouteContract may become useful later

If several concerns repeatedly need one route-associated value:

~~~text
Surface activation
head metadata
SSR/preload policy
route-local Message/action aliases
layout metadata
~~~

then a pure Page/RouteContract abstraction may become justified.

Its constraints should be:

~~~text
pure metadata
no hidden state
no reducer
no normalized cache
no independent async runtime
compiles to existing Router/Surface/Wiring primitives
~~~

combi-router provides useful inspiration for the composition API, but not for ownership.

### 31.12 Dependent reads should be solved at the feature/data level

tanstackstart-db supports staged route reads:

~~~text
stage 1 reads
    ↓
resolved data
    ↓
stage 2 reads
~~~

Foldkit should not immediately reproduce this as route-loader stages.

A more Foldkit-native future model is:

~~~text
Model
 ↓
active Surface requirements
 ↓
satisfy reads
 ↓
Messages/update
 ↓
new Model
 ↓
new/changed requirements
 ↓
repeat until requirements are satisfied
~~~

This is a general dependency process, not a routing concept.

It could support dependent data activated by any application state.

Do not build a fixed-point runtime until a concrete dependent-read use case proves it necessary.

### 31.13 SSR should use the same route -> Model -> Surface semantics

A server render can conceptually do:

~~~text
initial URL
   ↓
Foldkit Router
   ↓
initial AppRoute / Model
   ↓
determine active Surfaces
   ↓
collect ReadContracts
   ↓
prefetch through Data interpreter
   ↓
Remote/Data Messages
   ↓
update Model
   ↓
render
   ↓
serialize consumed/required state
~~~

That avoids inventing a route-specific server data protocol.

Browser navigation and SSR reason from the same declarations.

### 31.14 Router, Surface, Query, and ReadContract form one compositional chain

The resulting architecture is:

~~~text
                         URL

                         │
                         ▼
                  Foldkit Router
                         │
                         ▼
                     AppRoute
                         │
                         ▼
                       Model
                         │
                 route/tag state
                         │
                         ▼
                      Surface
                         │
                Projection metadata
                         │
                         ▼
                    ReadContract
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           Remote      TanStack    LiveStore
             │
       RemoteServer
             │
      remote-drizzle
~~~

For query-backed reads:

~~~text
Entity / Field
      ↓
     Expr
      ↓
 Predicate
      ↓
anonymous Query
      ↓
QueryDefinition
      ↓
QueryRef + Selection/window
      ↓
ReadContract
      ↓
Surface requirement
~~~

This preserves one semantic home for every concern.

---

## 32. Recommended implementation sequence

> **Corrected after building it: the reference interpreter belongs before the
> compiler, not after.** The sequence below puts compiling through
> remote-drizzle at Phase 6 and the in-memory interpreter at Phase 7. That is
> backwards. The reference interpreter is the thing that *finds* semantic
> divergence, and building it second meant `contains` shipped into a real
> product meaning three different things before a differential test caught it.
>
> Swap them, and make differential agreement a gate on adding an operator
> rather than a later phase: an operator is done when both interpreters agree
> over cases chosen to make them disagree. The rest of the ordering held up.

### Phase 0 — terminology and tests

> Done, as a read rather than a build: every invariant below was already
> pinned. `remote/test/query.test.ts` covers connection identity excluding the
> window and input canonicalisation; `requirement.test.ts` and `plan.test.ts`
> cover Selection and requirement merging; `remote-drizzle/test/visible.test.ts`
> covers row visibility.

Document/test current invariants:

~~~text
QueryDescriptor identity
QueryRef canonical input identity
pagination window excluded from Connection identity
Selection behavior
Remote visibility/authorization
~~~

### Phase 1 — tiny Expr kernel

> Done: `Expr` in `foldkit-entity`, sized to the CMS's `bySlug` — `eq` and an
> ordering, and nothing else until a query asked. `isNull`/`isNotNull` and
> `contains` arrived with Phase 8. Semantics are in [§6.0.1](#601-the-semantics-of-what-exists).

Implement only what one real existing query needs:

~~~text
FieldExpr
InputExpr
LiteralExpr
eq
and
Order asc/desc
dependency extraction
~~~

Use ordinary immutable discriminated unions.

### Phase 2 — anonymous Query + pipeable transformations

> Done: `Query.from` / `where` / `orderBy`, pipeable and immutable. Two
> `where`s conjoin and two `orderBy`s append, so a fragment can only narrow. The
> list of predicates *is* the conjunction, which is why no `Expr.and` exists —
> not even the worklist needed one.

Implement:

~~~text
Query.from
Query.where
Query.orderBy
~~~

Specify composition laws.

### Phase 3 — Query.define bridge to current Remote

> Done: `Query.define` returns an ordinary `QueryDescriptor` carrying a `body`.
> Descriptors from `Query.make` have none and keep working. A body needs a
> `foldkit-entity` entity, since that is what has addressable fields.

Make the new QueryDefinition adapt to current Remote registration/QueryDescriptor requirements.

Preserve current QueryRef and Connection behavior.

Avoid a broad Remote rewrite.

### Phase 4 — make ReadContract explicit internally

> Done: `ReadContract` in `foldkit-remote`, internal. What it found about the
> read identity is in [§12.3](#123-what-planning-actually-keys-on-and-why-it-is-not-this).

Refactor `Data.query` planning so it is conceptually clear which pieces are:

~~~text
QueryRef
Selection
window
expectation/observation metadata
~~~

This may remain an internal type.

The goal is separation, not a new public API.

### Phase 5 — prove route -> Surface -> ReadContract integration

> Done, in `remote/test/route.test.ts`, and late: the sequence skipped from
> Phase 3 to Phase 6 and nothing remarked on it until the phases were audited
> afterwards.
>
> It needed no new API, which is the result worth having. A `defineRouteUnion`
> of `Home | Owner | NotFound`, the URL parsed by `parseUrlWithFallback`, the
> route held in `Model.route`, and a `Surface.at` that reads it for an owner's
> id or for `undefined`. Remote follows from there: on `/owners/u1` the read
> entry plans exactly the connection `ProjectsByOwner.ref({ ownerId: 'u1' })`
> names, on `/owners/u2` a different one, on `/` nothing at all, and the
> retention root the connection had is dropped with it.
>
> This was the first use of Foldkit Router anywhere in the repository — no
> example or package had one — so the claim that routing describes URL state
> and owns no data loading had never actually been run.

Use one current Foldkit Router path whose typed route payload activates a parameterized Surface.

Verify:

~~~text
URL parses to AppRoute
AppRoute lives in Model
Surface.at derives params or inactivity
Data.subscriptions follows Surface activation
QueryDefinition input comes from Surface params
navigating away releases read/live/retain work
~~~

Use the existing Router and Surface APIs first.

Only after that should an inspectable activation helper such as `Surface.when` be evaluated.

### Phase 6 — compile one real query through remote-drizzle

> Done: `foldkit-cms`'s `bySlug` compiles from its body, byte-identical to the
> hand-written `where` it replaced. Native callbacks remain, and are conjoined
> with a body rather than replaced by it. **Do this after Phase 7**, per the
> note at the head of this section.

Migrate a current CMS/Remote query so common where/order semantics are no longer duplicated in the Drizzle binding.

Keep native callbacks as escape hatches.

### Phase 7 — in-memory reference interpreter

> **Do this before Phase 6.** See the note at the head of this section.

Execute the same QueryDefinition over in-memory rows.

Add differential tests against real Drizzle.

### Phase 8 — migrate several real query shapes

> Done: the CMS worklist, which is the shape this was sized against —
> [§6.2.1](#621-what-that-rule-costs-and-how-to-pay-it) works through why its
> two branches on an input are comparisons rather than branches.
> `ProjectsByOwner` was not migrated: three `eq` bodies already compile and a
> fourth showed nothing new.

Use examples that exercise:

~~~text
by field
compound predicate
ordering
CMS by-slug/worklist style queries
different Selections over the same QueryRef
multiple windows over one Connection
~~~

This specifically tests the QueryRef vs ReadContract distinction.

### Phase 9 — TanStack DB spike

> **Done as a spike, in `examples/tanstack`, and it earned its keep twice.**
> The same query bodies run through TanStack DB's query builder over a local
> collection, checked against the shared conformance suite. It is an example
> rather than a package: §19 says this engine should be an execution engine and
> §34 lists reproducing it as a non-goal.
>
> **It found what the semantics did not say.** TanStack sorts text by *locale*
> by default, so it ordered `intro to sql` before `Other` where SQLite and the
> reference interpreter order it after. [§6.0.1](#601-the-semantics-of-what-exists)
> had a rule for null ordering and nothing at all about collation — two engines
> written here had simply agreed by accident. Text orders by code point now, and
> this interpreter asks for `stringSort: 'lexical'` rather than taking what it
> is given.
>
> **It is also the first interpreter to refuse an operator.** TanStack's
> `like`/`ilike` have no `ESCAPE`, so a search containing `%` or `_` would match
> as a wildcard — which is not what `Expr.contains` means. It declares
> `contains` unsupported and refuses those cases rather than answering a
> different question, which is [§16](#16-interpreter-capability-checking) doing
> the job it was built for. Every conformance case whose search is ordinary text
> would have passed.
>
> Phases 10 to 13 remain **deferred, not skipped**. Each is gated on something that
> does not exist yet: another execution engine, a real need for joins or
> aggregates, or a query shape no operator covers. Phase 12 is the exception and
> was decided — see its note.
>
> **What was built instead of starting them: the conformance suite** they all
> depend on. §18 names portable-kernel conformance as what the reference
> interpreter is for, and until now each interpreter had its own tests that
> happened to agree. `foldkit-remote-server` exports one shared set of
> cases, run against both — over rows in memory, and compiled to SQL against a
> real SQLite.
>
> Its cases are chosen to make interpreters *disagree*: mixed case, nulls on
> both sides of a comparison, `%` and `_` as literal text, the empty search, a
> predicate compared to a boolean either way round. That is not hypothetical
> rigour — `contains` reached a released package meaning three different things
> because every value in the differential fixture was lowercase.
>
> Extending the suite to a null search found another disagreement: the SQL
> compiler threw while the reference evaluator returned unknown. The compiler
> now emits SQL null, preserving unknown even when compared to false. The suite
> also checks equality's unknown result against both booleans and a boolean
> input on either side of a predicate.
>
> A third interpreter is what [§33.1](#331-what-the-built-shape-does-not-extend-to)
> says would be the first real test of whether
> [§6.0.1](#601-the-semantics-of-what-exists) says enough. Phases 9 and 10 are
> that test; the suite is what makes taking one cheap, and what makes its result
> mean something.

Compile Query IR to TanStack DB.

Test:

~~~text
same QueryDefinition
same Selection
different local executor
Surface lifecycle
read identity/dedup
incremental updates
~~~

### Phase 10 — LiveStore spike

Execute the same read semantics through LiveStore/SQLite.

Keep durable ownership explicit.

### Phase 11 — derived helpers

Only after the core works, experiment with generated:

~~~text
byId
byField/index
relation queries
~~~

All helpers must lower to the same algebra.

### Phase 12 — decide package placement

Only after multiple interpreters exist, decide whether source-neutral pieces belong in:

~~~text
foldkit-remote
foldkit-entity
a small foldkit-query package
~~~

Follow dependency direction and real reuse, not naming aesthetics.

> **Decided: `foldkit-entity` keeps them, and no `foldkit-query` is made.**
> Two interpreters now exist — `foldkit-remote-drizzle` compiles a body to SQL
> and `foldkit-remote-server` evaluates one over rows — so the gate this phase
> waited on is met.
>
> **It fits what the package says it owns.** `foldkit-entity` describes and
> interprets nothing: an `Expr` says which rows, and fetches none of them. The
> interpreters live where interpretation already lives, which is the same
> boundary that kept `evaluate` out of this package.
>
> **It costs the packages that do not want it nothing.** Measured, rather than
> assumed: an entry importing only `Entity` bundles to 242,288 bytes and
> contains none of `isPredicate`, `orderBy`, `unfiltered` or `dependenciesOf`;
> adding `Query` and `Expr` costs 2,455 bytes. `Expr` and `Query` are ordinary
> top-level consts in a `sideEffects: false` package, so a bundler drops them.
> `foldkit-form` never pays even that — its entity imports are all `import
> type`, so nothing of this package reaches its runtime at all.
>
> **The common path is already one import.** `foldkit-remote` spreads the
> relational half into its own `Query`, so `Query.define` and `Query.from` are
> written together without importing two packages.
>
> A `foldkit-query` would add a publish target, a version to keep in step and a
> third place to look, to solve a problem that does not appear in the bundle.
> Worth revisiting only if an interpreter arrives that should not depend on
> `foldkit-entity` at all.

### Phase 13 — advanced relational semantics

Only as required:

~~~text
joins
groupBy
aggregates
distinct
subqueries
general projection
derived queries
cross-source planning
~~~

TanStack DB may remain the engine for some advanced cases rather than being reimplemented.

---

## 33. Acceptance criteria

The design has found the correct seam if this works.

One domain:

~~~ts
const Post = Entity.define(...)
~~~

One Selection:

~~~ts
const PostCard = Entity.select(Post, {
  id: true,
  title: true,
})
~~~

One reusable predicate:

~~~ts
const Published = Expr.eq(
  Post.fields.published,
  true,
)
~~~

One QueryDefinition:

~~~ts
const RecentPosts = Query.define(
  "RecentPosts",
  {},
  () =>
    Query.from(Post).pipe(
      Query.where(Published),
      Query.orderBy(
        Query.desc(Post.fields.createdAt),
      ),
    ),
)
~~~

Multiple consumer reads over the same logical query:

~~~ts
Data.query(RecentPosts, {}, {
  select: PostCard,
  first: 10,
})

Data.query(RecentPosts, {}, {
  select: PostAdminRow,
  first: 50,
})
~~~

They share logical QueryDefinition/QueryRef semantics but have distinct read requirements.

And the same query semantics can execute through:

~~~text
RecentPosts
   ├── remote-drizzle -> server SQL
   ├── in-memory      -> reference evaluator
   ├── TanStack       -> local incremental view
   └── LiveStore      -> local SQLite query
~~~

The application feature should not care which interpreter runs it unless it deliberately uses a backend-specific escape hatch.

A route-driven feature should additionally satisfy:

~~~text
/project/p1
    ↓
projectRouter
    ↓
AppRoute.Project({ projectId: p1 })
    ↓
Model.route
    ↓
ProjectPage Surface active
    ↓
ReadContracts active
    ↓
Data interpreter work active
~~~

Navigating away should make the Surface inactive and remove its read/live/retain requirements without a router-owned loader cache.

---

## 32.1 Every other section, against what was built

§32's phases are not the whole document, and working from them alone left the
rest unchecked. This is that check. Sections not listed here state principles,
prior art or futures with nothing to satisfy.

| § | What it asks | Where it stands |
| --- | --- | --- |
| [13](#13-selection-remains-late-bound-and-interpreter-neutral) | Selection stays late-bound and interpreter-neutral | **Holds.** Selection never entered `Query`; which rows and which fields are still separate, and each interpreter satisfies a Selection its own way. |
| [14](#14-generated-helpers-should-lower-to-the-core-algebra) | Generated helpers lower to the core algebra | **Demonstrated, by the CMS rather than by a general helper.** `Cms.bySlug` generates one query per content type and lowers to `Query.define` over `Expr`. No `byId`/`byField` was extracted: one caller is not evidence (§28). |
| [15](#15-query-dependencies-and-capabilities-are-derived) | `Query.dependencies` derives entities, fields, inputs, operations | **Partly.** Fields, inputs and operations are derived. There is no top-level `entities`, because a `Query` reads exactly one and it is `query.entity`; and `order` is not listed as an operation, since ordering contributes fields rather than an operator. `Query.requirements` does not exist. |
| [16](#16-interpreter-capability-checking) | Interpreters declare supported operators; compilation fails explicitly for the rest | **Done**, after this audit found it missing. `Query.unsupported` names what a body needs and an interpreter lacks; each interpreter declares its set and raises its own refusal. |
| [17](#17-remote-drizzle-is-the-first-compiler) | remote-drizzle compiles first | **Done** (Phase 6). |
| [21](#21-query-driven-loading-becomes-richer-with-readcontract) | Loading gets richer once ReadContract is explicit | **No.** ReadContract was made explicit and stayed internal; no loading behaviour changed, and none needed to. |
| [29](#29-devtools-agents-and-cms) | A read explains itself to DevTools, agents and a CMS | **Materials only.** `Data.inspect` and `Query.dependencies` hold what an explanation needs; nothing assembles one. |
| [30](#30-proposed-api-sketch) | The illustrative API | **Compiles verbatim**, including the case never otherwise exercised: an anonymous query composed outside a definition and piped in inside. One name differs — the sketch's `Query.desc`/`Query.asc` are `Order.desc`/`Order.asc`, since an ordering term is over an `Expr` rather than over a `Query`. |
| [31](#31-routing-surfaces-and-page-contracts) | Routing, Surfaces and page contracts | **Its core is proven** by Phase 5. Page contracts and an activation helper such as `Surface.when` are untouched, and the section says to reach for them only after Router and Surface composition proves insufficient. It has not. |

The one actionable gap is **§16**. It is small, and the conformance suite is
what makes it worth having: a third interpreter that silently ignores an
operator it does not implement would pass every case it happens to support.

## 33.1 What the built shape does not extend to

Written after building §32's Phases 0–8 and 12, so the next person inherits the
walls rather than finding them.

**A `Query` reads one Entity, by construction.** `Query.from(E)` returns
`Query<E>`, and `where`/`orderBy` refuse a field of any other Entity — by
identity, so two Entities of the same name still differ. That check is worth
having: nothing else catches a predicate naming a table the query was never
told to read. But it means **Phase 13's joins are not an increment**. They
change the shape of `Query<E>` itself, and the honest expectation is a new
constructor rather than another combinator.

**A predicate is bound to its Entity too**, so there is no cross-entity
fragment. `Query.where(published)` is reusable across queries over one Entity
and nothing wider. Fine today; a wall when two Entities want one rule.

**Ordering is field-only.** Both interpreters refuse an ordering term that is
not a `FieldExpr`. Ordering by an expression — `lower(name)`, a computed rank —
is unimplemented in both, and the keyset cursor logic assumes a column it can
compare and select.

**`Expr<T>` has no scalar operations at all.** Every operator built is
boolean-valued. The first scalar one — arithmetic, a user-facing `lower`, a
date part — forces the Expr/Predicate typing to be revisited. It has already
been revisited once: the implementation split them (a predicate as its own
type, not a phantom `Expr<boolean>`), which was right while `eq` was the only
operation and nothing nested, and wrong the moment `isNotNull` had to sit
inside `eq`. **Expect a third shape**, and treat the current split as
provisional rather than settled.

**There is no `and` and no `or`.** A `Query` holds a list of predicates and the
list *is* the conjunction, which is why no `and` was ever needed — including by
the worklist, which the plan expected to force one. `or` has no caller yet. It
would be an ordinary node when one appears; the conjunction-as-list stays.

**Two interpreters is not portability.** Both were written here, against the
same reading of the semantics in §6.0.1. A third written by someone else is the
first real test of whether that section says enough.

## 34. Non-goals

This design does not aim to:

- replace Model / Message / update;
- replace foldkit-remote;
- replace foldkit-sync;
- add a second normalized cache;
- reproduce gen2's whole application compiler;
- reproduce tanstackstart-db's whole route/component framework;
- turn Foldkit Router into a loader/cache/resource runtime;
- make route matches a second application state store;
- require routes to own data fetching;
- add a Page/RouteContract primitive before Router + Surface composition proves insufficient;
- reproduce data-forge's whole proposed data model;
- recreate SQL in TypeScript;
- reproduce all of TanStack DB;
- reproduce all of LiveStore;
- merge Query and Selection;
- put required/live/defer semantics into relational Query;
- make every query portable;
- force every interpreter to support every operator;
- extract Remote EntityStore/Connection machinery prematurely;
- bypass server authorization;
- create a second public "Collection" concept beside Bundle collections;
- build cross-store planning before a concrete need exists.

---

## 35. References

Internal/core prior art inspected:

- `foldkit/foldkit` Router
  - bidirectional Biparser / callable Router
  - defineRouteUnion
  - literal / slash / schemaSegment / Route.query
  - Route.mapTo / Route.oneOf / Route.parseUrlWithFallback
  - typed AppRoute values used as Model navigation state
- `doeixd/combi-router`
  - routes as first-class immutable values
  - parent/child extension by reference
  - pipeable route enhancers
  - route hierarchy/introspection
  - loader/resource ownership considered as contrast prior art
- `doeixd/gen2`
  - Expr / Predicate representation
  - QueryExpression vs QueryFunction
  - dependency extraction
  - runtime requirements/capability checking
  - cross-store planning ideas
- `doeixd/data-forge`
  - reusable filters
  - projection/lens separation
  - location-independent execution ideas
- `doeixd/tanstackstart-db`
  - schema-generated query helpers
  - DbQuerySpec
  - late-bound Views via `.as(view)`
  - logical query key vs resource/cache key
  - query bundles / staged reads
  - action affects metadata
  - adapter-first TanStack DB architecture

External prior art:

- TanStack DB overview: https://tanstack.com/db/latest/docs/overview
- TanStack DB live queries: https://tanstack.com/db/latest/docs/guides/live-queries
- TanStack DB query collections: https://tanstack.com/db/latest/docs/collections/query-collection
- LiveStore Store API 0.4: https://docs.livestore.dev/api/livestore/classes/store/
- LiveStore changelog: https://docs.livestore.dev/changelog/

These are prior art, not architectural dependencies.

---

## 36. Final thesis

Foldkit Plus already owns the important semantic/runtime pieces:

~~~text
Entity
Selection
Remote QueryRef
Data / Remote
RemoteServer
remote-drizzle
Surface
Sync / Durable
~~~

The missing addition is not another store.

It is a small composable semantic language for **what data means to read**, integrated with Foldkit's existing semantic language for **where the application is**:

~~~text
URL
 ↓
Foldkit Router
 ↓
AppRoute
 ↓
Model
 ↓
Surface activation
 ↓
ReadContract
 ↓
interpreter
~~~

The query side remains:

~~~text
Field
  ↓
Expr
  ↓
Predicate
  ↓
anonymous Query
  ↓
QueryDefinition
  ↓
QueryRef
  ↓
ReadContract
  ↓
Projection
  ↓
Surface
  ↓
interpreter
~~~

The resulting design has six important boundaries:

> **Router composes URL semantics and produces typed navigation state.**

> **Model owns the current route like any other application state.**

> **Surface turns active Model state into a feature observation/action boundary.**

> **Query composes population semantics; QueryDefinition names a reusable parameterized capability.**

> **QueryRef identifies one concrete logical population.**

> **ReadContract adds the Selection/window/result requirements of one consumer without changing that logical population's identity.**

This synthesizes the strongest ideas from Foldkit Router, Foldkit Plus, combi-router, gen2, data-forge, tanstackstart-db, TanStack DB, and LiveStore while preserving Foldkit's strongest properties: explicit transition ownership, semantic Messages, pure update, late-bound observation, normalized Remote state, server-authoritative authorization, and replaceable interpreters.
