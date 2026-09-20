# Foldkit Plus: Composable Data, Query, and Local-First Architecture

**Status:** design proposal; no implementation implied by this document  
**Date:** September 2026  
**Target:** doeixd/foldkit-plus  
**Primary packages:** foldkit-entity, foldkit-remote, foldkit-remote-server, foldkit-remote-drizzle, foldkit-surface, foldkit-sync, foldkit-durable  
**Reference systems:** LiveStore 0.4, TanStack DB, doeixd/gen2, doeixd/data-forge

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

> **Foldkit Plus has typed, stable query identities, but the meaning of a query is not yet a first-class, composable, source-neutral value.**

The earlier version of this design proposed adding `from`, `where`, and `orderBy` fields directly to `Query.make`. That is too configuration-oriented.

The revised recommendation is:

> **Introduce a small expression/query algebra below the named Remote Query layer. Compose anonymous query values first; give them stable names and inputs only at the application capability boundary.**

The conceptual stack becomes:

~~~text
Entity / Field
      ↓
     Expr
      ↓
  Predicate
      ↓
anonymous Query
      ↓
named QueryDefinition
      ↓
Data / Surface
      ↓
interpreter
~~~

This separation is the most important change in this revision.

---

## 2. Core principles

### 2.1 One transition authority per fact

Use the more precise ownership rule:

> **One transition authority per fact. Secondary representations are allowed when their derivation and authority are explicit.**

Examples:

| Representation | Authority |
| --- | --- |
| ordinary local domain/UI state | application Model / Message / update |
| server-owned facts in Remote.Model | server; Remote cache is disposable |
| Sync optimistic shared value | authoritative journal + pending durable Messages |
| URL or KV mirror | application Model |
| local SQLite read model | the facts/materializer that produce it |
| TanStack live-query result | its source collections |
| DOM | current Foldkit Model |

Do not let LiveStore's event log and foldkit-sync both own the same durable fact.

### 2.2 Reads and writes remain different languages

A query describes observation:

~~~text
Expr / Predicate / Query
~~~

Application writes remain semantic Foldkit transitions:

~~~text
Message
   ↓
update
   ↓
Model
~~~

Do not replace semantic Messages with imperative record mutation as the application API.

### 2.3 Declarations are data; interpreters execute them

Portable semantics should be inspectable values.

~~~text
Query declaration
      ↓
plain typed IR
      ↓
interpreter
~~~

not opaque backend callbacks.

### 2.4 Generalize declarations before runtimes

Remote's EntityStore, Connection, optimistic layers, and planner already work well.

Do not extract them merely because they look reusable.

First make query declarations portable. Only extract runtime infrastructure after a second implementation proves that it wants the same structure.

---

## 3. Existing Foldkit Plus pieces and their roles

### 3.1 Entity remains the domain noun

foldkit-entity already answers:

~~~text
What is a Project?
Which fields does it have?
Which relations may be followed?
Which derived members may an interpreter supply?
~~~

It should continue to own domain structure, not storage or execution.

Do not introduce another generic "Collection schema" beside Entity.

### 3.2 Selection remains the read shape

Selection answers:

> Which facts about each entity does this consumer need?

For example:

~~~ts
const ProjectSummary = Entity.select(Project, {
  id: true,
  name: true,
  owner: UserSummary,
})
~~~

Selection should remain independent from Query.

### 3.3 Query answers population semantics

Query answers:

> Which rows/entities belong in this result, and in what order?

Keep the core distinction:

~~~text
Selection
  which fields?

Query
  which rows?
~~~

For ordinary Remote entity lists, Data continues to combine them:

~~~ts
Data.query(ProjectsByOwner, { ownerId }, {
  select: ProjectSummary,
  first: 25,
})
~~~

### 3.4 Data is already the application-facing seam

"Data" is the bound RemoteDomain returned by Remote.make, not a separate package.

Current application code already has:

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

That is valuable evidence for the desired application-facing shape.

Do not create a competing foldkit-data package simply to recreate this vocabulary.

### 3.5 Remote is already a substantial client data runtime

Remote already has:

~~~text
normalized entities
field presence/staleness
tombstones
Connections
pagination segments and boundaries
stable QueryRef identity
optimistic entity/connection overlays
live inserts/removes/invalidations
mutation reconciliation
retention / GC
persistence
Surface-driven subscription lifetime
~~~

This is already much of what a client database runtime needs.

### 3.6 Surface remains the lifecycle boundary

Preserve:

~~~text
Surface.at(...)
    ↓
feature active
    ↓
Projection requirements active
    ↓
Data.subscriptions
    ↓
read/live work starts
~~~

A Projection declares a requirement. Rendering does not perform I/O.

---

## 4. Lessons from gen2 and data-forge

### 4.1 gen2: QueryExpression and QueryFunction are different things

This is the most useful idea from gen2.

Its concrete implementation separates:

~~~text
QueryExpression
  relational program itself

QueryFunction
  stable name
  input type
  output type
  reactivity metadata
  authorization
  requirements
  runtime targets
~~~

Foldkit Plus should adopt the same conceptual split without importing gen2's entire compiler architecture.

In Foldkit terminology:

~~~text
Query<Row>
  anonymous, composable relational value

QueryDefinition<Name, Input, Row>
  named parameterized application capability
~~~

The named definition is what Remote/Data registers.

The anonymous Query is what application/domain code composes.

### 4.2 gen2: expressions are values, not callbacks

gen2's expression AST contains values such as:

~~~text
literal
field reference
parameter reference
operation call
~~~

and tracks referenced fields.

That enables:

~~~text
SQL compilation
dependency extraction
reactivity planning
authorization analysis
diagnostics
multiple execution targets
~~~

Foldkit Plus should adopt a much smaller version of this principle.

### 4.3 gen2: requirements can be derived and checked

gen2 tracks query requirements/capabilities and validates whether a runtime supports them.

Foldkit can use a smaller form:

~~~text
query requires:
  filter.eq
  order
  join
  aggregate
~~~

An interpreter can declare support.

Unsupported semantics should fail during binding/planning, not silently degrade.

### 4.4 gen2: do not copy the proliferation of mini-languages

gen2 has separate Expr, Predicate, RuleExpr, QueryExpr, ActionExpr, PatchExpr, PlanExpr, and more because it is attempting a full application compiler.

Foldkit Plus should stay smaller.

Prefer initially:

~~~text
Expr<T>
Predicate = Expr<boolean>

Query<Row>
QueryDefinition<Input, Row>
~~~

A future Rule can wrap the same Predicate algebra rather than create another expression language.

### 4.5 data-forge: filters and projections are reusable components

data-forge is primarily a design sketch rather than a built implementation, but two ideas are still useful:

~~~text
filter
  reusable population constraint

lens
  reusable projection
~~~

Foldkit already has the stronger projection abstraction: Entity.Selection.

The reusable-filter idea supports making Predicate/Query fragments first-class rather than burying all filtering inside Query.make.

### 4.6 data-forge: algebraic properties are useful as metadata, not the core API

data-forge imagined operations with properties such as purity, determinism, commutativity, idempotence, and reversibility.

Foldkit Query does not need that entire system.

But it is useful for Query to expose derived capabilities/dependencies so planners can make informed choices.

---

## 5. Revised semantic model

The proposed semantic layers are:

~~~text
Entity
  semantic noun

Field
  addressable member of an Entity

Expr<T>
  typed inspectable scalar computation

Predicate
  Expr<boolean>

Query<Row>
  anonymous inspectable relational computation

QueryDefinition<Input, Row>
  named parameterized read capability

Selection
  requested Entity result shape

Data
  application-bound read/write API

Surface
  observation and capability boundary

interpreter
  Remote/Drizzle, memory, TanStack, LiveStore, etc.
~~~

This is deliberately smaller than gen2.

---

## 6. Expr: the smallest portable computation

Expr is the base portable value.

A minimal initial AST needs only:

~~~text
literal
field
input parameter
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

Initial operations:

~~~text
eq / neq
lt / lte / gt / gte
and / or / not
in / notIn
isNull / isNotNull
contains / startsWith / endsWith
asc / desc (or separate Order values)
~~~

Do not model arbitrary JavaScript.

Do not model all of SQL.

### 6.1 Core API should be functional

Prefer an explicit, small namespace:

~~~ts
Expr.field(Project.fields.ownerId)
Expr.input('ownerId', ProjectId)
Expr.literal('active')

Expr.eq(left, right)
Expr.and(a, b)
~~~

Ergonomic sugar may allow:

~~~ts
Project.fields.ownerId.eq(input.ownerId)
Project.fields.updatedAt.desc()
~~~

later, but the underlying representation should not require methods on Field.

### 6.2 ExprLike conversion can keep call sites terse

A practical API may accept Expr-like values:

~~~ts
Expr.eq(Project.fields.status, 'active')
~~~

and lower them to:

~~~text
Eq(
  Field(Project.status),
  Literal("active")
)
~~~

Likewise QueryDefinition inputs exposed to the builder should already be Expr values:

~~~ts
({ input }) =>
  Expr.eq(Project.fields.ownerId, input.ownerId)
~~~

### 6.3 Dependencies are derived

Every Expr should make its refs inspectable.

For example:

~~~ts
const predicate = Expr.and(
  Expr.eq(Project.fields.status, 'active'),
  Expr.eq(Project.fields.ownerId, input.ownerId),
)
~~~

can yield:

~~~text
Project.status
Project.ownerId
input.ownerId
~~~

This becomes the basis for query dependency extraction.

---

## 7. Predicate is not a separate language

Initially:

~~~ts
type Predicate = Expr<boolean>
~~~

Use the same operators:

~~~ts
const Active = Expr.eq(Project.fields.status, 'active')

const OwnedBy = (ownerId: Expr<ProjectId>) =>
  Expr.eq(Project.fields.ownerId, ownerId)

const Visible = Expr.and(
  Active,
  OwnedBy(input.ownerId),
)
~~~

This avoids gen2's duplication between general expressions and RuleExpr.

Later, a named Rule can simply give a Predicate an identity/input contract:

~~~text
Rule
  name
  Input
  body: Predicate
~~~

That same Predicate may then inform authorization, SQL filtering, UI hints, or query composition.

Rule is not required for the first Query implementation.

---

## 8. Query: an anonymous immutable relational value

A Query should not begin life as a named endpoint/capability.

The primitive is:

~~~ts
Query.from(Project)
~~~

which creates an anonymous Query value.

Combinators transform Query -> Query:

~~~ts
const Active = Query.where(
  Expr.eq(Project.fields.status, 'active'),
)

const Recent = Query.orderBy(
  Query.desc(Project.fields.updatedAt),
  Query.asc(Project.fields.id),
)

const ActiveRecentProjects = Query.from(Project).pipe(
  Active,
  Recent,
)
~~~

The important property is that `Active` and `Recent` are reusable transformations.

### 8.1 Canonical API: pipeable combinators

Prefer:

~~~ts
Query.from(Project).pipe(
  Query.where(...),
  Query.orderBy(...),
)
~~~

over making fluent mutation the canonical implementation.

A fluent facade can exist later, but pipeable transformations give better reuse:

~~~ts
const Published = Query.where(...)
const Recent = Query.orderBy(...)

const Feed = Query.from(Post).pipe(
  Published,
  Recent,
)
~~~

### 8.2 Query values are immutable data

Each combinator returns a new inspectable query value.

Conceptually:

~~~ts
interface Query<Row> {
  readonly source: QuerySource<Row>
  readonly predicates: readonly Predicate[]
  readonly ordering: readonly Order[]
  readonly joins: readonly Join[]
  readonly grouping: readonly Expr[]
  readonly projection?: ...
}
~~~

Exact fields should be discovered from implementation.

The invariant matters more than the shape:

> Query composition creates data. It does not execute work.

### 8.3 Multiple where calls compose

Prefer composition semantics such as:

~~~ts
base.pipe(
  Query.where(Active),
  Query.where(OwnedBy(input.ownerId)),
)
~~~

meaning conjunction, rather than "last where wins".

This makes independent fragments naturally composable.

### 8.4 Ordering should also compose deliberately

Define whether repeated Query.orderBy calls append terms or replace ordering.

The likely default should be append:

~~~ts
Query.orderBy(desc(updatedAt))
Query.orderBy(asc(id))
~~~

becomes:

~~~text
ORDER BY updatedAt DESC, id ASC
~~~

If replacement is needed, expose it explicitly.

---

## 9. QueryDefinition: name composition only at the boundary

After an anonymous Query has been composed, give it a stable application identity.

Conceptually:

~~~ts
const BaseProjects = Query.from(Project).pipe(
  Query.where(
    Expr.eq(Project.fields.status, 'active'),
  ),
  Query.orderBy(
    Query.desc(Project.fields.updatedAt),
    Query.asc(Project.fields.id),
  ),
)

const ProjectsByOwner = Query.define(
  'ProjectsByOwner',
  {
    ownerId: ProjectId,
  },
  ({ input }) =>
    BaseProjects.pipe(
      Query.where(
        Expr.eq(Project.fields.ownerId, input.ownerId),
      ),
    ),
)
~~~

The callback is allowed because it is a construction-time builder: `input.ownerId` is an Expr parameter reference, and the callback returns static Query data.

It is not a runtime row predicate.

### 9.1 Why the distinction matters

Do not make one object simultaneously be:

~~~text
relational AST
parameter schema
stable name
Remote registration
connection identity
pagination window
live policy
~~~

Those concerns can compose, but they are not identical.

### 9.2 Naming

This document uses `QueryDefinition` conceptually.

The eventual public API may call it:

~~~text
Query.Def
QueryDefinition
Query.define return type
QueryFunction
~~~

Do not choose the exported type name until the implementation shape is clear.

Avoid "QueryFunction" if it suggests arbitrary executable JavaScript; the value should remain static/inspectable.

---

## 10. Preserve current QueryRef identity and pagination

The current Remote QueryRef design is good.

Keep:

> logical connection identity = named query definition + canonical encoded input

and exclude pagination window from identity.

Therefore:

~~~text
ProjectsByOwner(owner=u1).first(25)

ProjectsByOwner(owner=u1)
  .after(cursor)
  .first(25)
~~~

are windows over the same logical connection.

A likely relationship is:

~~~text
QueryDefinition
      +
encoded input
      ↓
QueryRef
      +
window
~~~

The anonymous Query IR should not itself need to know Remote's cursor/window semantics.

This is an important separation from the previous design.

---

## 11. Selection stays separate from Query for ordinary entity reads

Do not immediately add projection/select semantics to the core Query algebra.

Today this is strong:

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

It keeps:

~~~text
Query
  which Project entities?

Selection
  which Project facts?
~~~

Eventually joins/aggregates may produce rows that are not one Entity Selection.

At that point add a more general relational projection operation deliberately.

Do not weaken Entity.Selection prematurely to accommodate hypothetical aggregate queries.

---

## 12. Query fragments become first-class reusable domain values

The new algebra enables domain-level fragments:

~~~ts
const Active = Query.where(
  Expr.eq(Project.fields.status, 'active'),
)

const Published = Query.where(
  Expr.eq(Post.fields.published, true),
)

const OwnedBy = (owner: Expr<UserId>) =>
  Query.where(
    Expr.eq(Project.fields.ownerId, owner),
  )

const Recent = Query.orderBy(
  Query.desc(Project.fields.updatedAt),
)
~~~

Composition:

~~~ts
const RecentActiveProjects = Query.from(Project).pipe(
  Active,
  Recent,
)
~~~

This is especially useful for CMS and CRUD.

CMS-specific helpers can return ordinary Query transformations instead of inventing another list engine:

~~~ts
Cms.published(Post)
Cms.scheduled(Post)
Cms.ownedBy(Post, actor)
~~~

if such helpers later prove useful.

---

## 13. Query dependencies and capabilities are derived

A static Query can explain itself.

Given:

~~~ts
const q = Query.from(Project).pipe(
  Query.where(
    Expr.and(
      Expr.eq(Project.fields.status, 'active'),
      Expr.eq(Project.fields.ownerId, input.ownerId),
    ),
  ),
  Query.orderBy(
    Query.desc(Project.fields.updatedAt),
  ),
)
~~~

derive:

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

Expose internal/public helpers only where useful:

~~~ts
Query.dependencies(q)
Query.requirements(q)
~~~

Potential consumers:

~~~text
remote-drizzle
  required SQL columns

Remote planner
  requirements / pushdown

TanStack
  execution/index planning

DevTools
  explanation

SSR
  consumed data graph

agents
  capability description

future reactivity
  affected-query analysis
~~~

---

## 14. Interpreter capability checking

An interpreter should be able to declare the portable operators it supports.

Conceptually:

~~~text
remote-drizzle:
  eq
  range
  and/or/not
  ordering
  joins
  pagination
  ...

in-memory reference:
  portable kernel

simple REST adapter:
  eq
  ordering
  pagination
~~~

Binding a QueryDefinition to an interpreter can validate requirements.

For example:

~~~text
Query "ProjectStats"
requires:
  aggregate.count
  groupBy

Adapter "SimpleRest"
supports:
  eq
  order
  page

=> binding error
~~~

Do not silently fall back to different semantics.

Backend-specific escape hatches are still allowed, but they are explicitly non-portable.

---

## 15. remote-drizzle is the first compiler

remote-drizzle already occupies the right architectural boundary.

Today query meaning is split:

~~~ts
const ProjectsByOwner = Query.make(...)

query(ProjectBinding, ProjectsByOwner, {
  where: input => ...,
  orderBy: ...,
})
~~~

The first implementation goal is to move the common semantics into the composed QueryDefinition:

~~~ts
const ProjectsByOwner = Query.define(
  'ProjectsByOwner',
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

Then the Drizzle binding should need little or no repeated filter/order logic:

~~~ts
query(ProjectBinding, ProjectsByOwner)
~~~

The current native callback form should remain initially as an escape hatch and migration path.

### 15.1 Authorization remains outside query semantics

Portable Query IR must not bypass current security boundaries.

Preserve:

~~~text
RemoteServer field authorization
binding-level row visibility
relation policies
application authentication
~~~

A Query describes requested rows.

Authorization decides which requested rows/facts a principal may actually observe.

The recent remote-drizzle visibility work makes this distinction especially important: every read path must continue through the same visibility boundary.

---

## 16. Add an in-memory reference interpreter second

Before TanStack or LiveStore, implement the smallest second interpreter.

Input:

~~~text
Entity rows
Query IR
query input
~~~

Output:

~~~text
matching ordered rows
~~~

Use it for:

~~~text
unit tests
differential tests against Drizzle
operator semantic tests
portable-kernel conformance
~~~

Acceptance criterion:

> The same QueryDefinition produces equivalent results through the in-memory evaluator and remote-drizzle for the supported subset.

This proves the IR is semantic rather than merely a Drizzle AST.

---

## 17. TanStack DB should be an execution engine, not the Foldkit model

TanStack DB is valuable for:

~~~text
incremental view maintenance
joins
aggregates
indexes
derived collections
query composition
query-driven loading
~~~

Prototype:

~~~text
Entity + Query IR
      ↓
TanStack adapter
      ↓
TanStack source collections
      ↓
incremental live query
      ↓
explicit Foldkit boundary
      ↓
Message / Model
~~~

Do not make application Views directly depend on hidden mutable TanStack state.

Do not replace semantic Foldkit Messages with TanStack record mutation as the application transition API.

The important proof:

> The same Foldkit QueryDefinition executes through remote-drizzle on the server and TanStack DB locally.

Only after that experiment should a generalized Data interface be considered.

---

## 18. LiveStore should be an adapter with explicit durable ownership

A LiveStore path can interpret queries while LiveStore supplies SQLite/materialization/event-log infrastructure.

Read path:

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

Two valid write architectures remain.

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

Do not also use foldkit-sync as the durable authority for those facts.

### B. Foldkit Sync owns durable history

~~~text
durable Foldkit Message
    ↓
foldkit-sync / durable
    ↓
authoritative operation order
    ↓
Foldkit materializer
    ↓
queryable read model
~~~

Do not add LiveStore's event log as another authority for the same operations.

---

## 19. Future Foldkit materialization

LiveStore demonstrates the usefulness of rebuildable read models.

A future primitive could be:

~~~text
authoritative facts
      ↓
Materializer
      ↓
derived index / table / search view
~~~

The invariant:

~~~text
update
  application transition semantics

Materializer
  derived read/index representation
~~~

Materialization should be disposable/rebuildable from its source facts unless another authority is explicitly declared.

Start with a simple in-memory target before SQLite.

---

## 20. Sync improvements that support materialization

Useful future additions:

### 20.1 Committed-operation observation

Expose committed durable facts without requiring consumers to inspect Replica internals.

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

### 20.2 Atomic semantic Message batches

Conceptually:

~~~ts
replica.submitBatch([
  Message.CreatedInvoice(...),
  Message.AddedInvoiceLine(...),
  Message.AddedInvoiceLine(...),
])
~~~

with matching journal atomicity.

The semantic unit remains a Message.

### 20.3 Durable encoding evolution

Historical durable encodings should migrate into the current Message representation.

Do not require the current application Message union to preserve every historical wire shape forever.

Design the exact API only after exercising a real migration.

---

## 21. Query-driven loading

Remote already performs query-adjacent demand planning:

~~~text
Surface requirement
    ↓
normalized cache comparison
    ↓
fetch missing/stale selected fields
~~~

Composable Query semantics can extend that requirement graph toward:

~~~text
entity/source
predicate
ordering
selection
window
~~~

Interpreters decide what to push down.

~~~text
Remote/Drizzle
  server executes predicate/order/window

TanStack
  local engine executes query

LiveStore
  SQLite executes query

future hybrid
  remote fragment + local composition
~~~

Do not require every backend to support every operation.

---

## 22. Cross-source composition is a future planner problem

gen2 models cross-store planning explicitly. Foldkit should not implement that now, but the Query algebra should avoid assuming one source forever.

A future query might join:

~~~text
Project
  Remote/server-owned

Draft
  Sync/local-owned
~~~

A planner could eventually produce:

~~~text
Remote fragment
      +
local Sync fragment
      ↓
TanStack/local composition
~~~

Possible strategies include:

~~~text
server composition
local materialized view
streaming/local join
event-derived view
~~~

This is a reason to keep Query semantic and source-neutral, not a reason to build a cross-store planner now.

---

## 23. Keep UI interaction state separate

Do not make Query own application interaction state.

~~~text
Query
  which rows match?

QueryRef window
  which data window is requested?

application Pagination state
  which window does the user want?

SelectionSet
  which rows did the user choose?

Virtual
  which rows are physically visible?

Surface
  which feature/data requirements are active?
~~~

The existing QueryRef may continue to carry the requested server/data pagination window.

The user's navigation state belongs to the application Model.

---

## 24. Reactivity integration

The existing reactivity design already distinguishes semantics from propagation:

~~~text
Message -> update -> Model

Projection.dependencies
       ↓
which consumers need recomputation?
~~~

Query should contribute inspectable dependency metadata, not create a competing Foldkit reactive graph.

An external engine may internally maintain incremental state, but crossing into application-observable Foldkit state should remain explicit.

Conceptually:

~~~text
                    Projection
                   /          \
        Model dependencies    Query requirement
                 │                  │
                 ▼                  ▼
          Model transition      source change
                 \                  /
                  affected Surface
~~~

---

## 25. Data should be generalized only from evidence

Do not create a DataProvider abstraction first.

Build:

~~~text
Remote/Drizzle
in-memory reference
then one of TanStack / LiveStore
~~~

and compare.

Likely common concepts may include:

~~~text
get
query
live
subscriptions
wiring
Projection results
Surface activation
~~~

Likely Remote-specific concepts include:

~~~text
RemoteData
RemoteClient
storeOf
plan
Data.reduce over Remote.Model
Remote persistence
Remote mutation reconciliation
~~~

Let the interface emerge from real implementations.

---

## 26. DevTools and agents

Static Query values make architectural explanation possible.

A DevTools view could show:

~~~text
Surface: ProjectPage

QueryDefinition:
  ProjectsByOwner(ownerId)

composed query:
  FROM Project
  WHERE Project.status = "active"
  AND Project.ownerId = $ownerId
  ORDER BY Project.updatedAt DESC, Project.id ASC

dependencies:
  Project.status
  Project.ownerId
  Project.updatedAt

selection:
  Project.id
  Project.name
  Project.owner.name

executor:
  remote-drizzle
~~~

For agents, QueryDefinition can become an application-sanctioned read capability rather than unrestricted database access.

Server authorization remains authoritative.

---

## 27. CMS synergy

The current CMS work already reuses Entity, Remote queries, visibility, Form, and CRUD concepts.

Do not add a CMS-specific query subsystem.

Composable query fragments can make CMS behavior easier to express:

~~~text
published
scheduled
owned by actor
by slug
revision history
worklist
~~~

but those should lower into the same Query/Predicate vocabulary where appropriate.

The recent CMS by-slug and worklist queries are useful concrete candidates when testing the new Query API.

---

## 28. Proposed API sketch

This is illustrative, not a committed public API.

### 28.1 Reusable expressions/predicates

~~~ts
const ActiveProject = Expr.eq(
  Project.fields.status,
  'active',
)

const OwnedBy = (ownerId: Expr<ProjectId>) =>
  Expr.eq(
    Project.fields.ownerId,
    ownerId,
  )
~~~

### 28.2 Anonymous reusable Query

~~~ts
const RecentActiveProjects = Query.from(Project).pipe(
  Query.where(ActiveProject),
  Query.orderBy(
    Query.desc(Project.fields.updatedAt),
    Query.asc(Project.fields.id),
  ),
)
~~~

### 28.3 Named parameterized definition

~~~ts
const ProjectsByOwner = Query.define(
  'ProjectsByOwner',
  {
    ownerId: ProjectId,
  },
  ({ input }) =>
    RecentActiveProjects.pipe(
      Query.where(
        OwnedBy(input.ownerId),
      ),
    ),
)
~~~

### 28.4 Existing Data usage remains recognizable

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

### 28.5 Reuse through transformations

~~~ts
const Open = Query.where(
  Expr.eq(Project.fields.status, 'open'),
)

const Mine = (actorId: Expr<UserId>) =>
  Query.where(
    Expr.eq(Project.fields.ownerId, actorId),
  )

const OpenProjects = Query.from(Project).pipe(Open)

const MyOpenProjects = Query.define(
  'MyOpenProjects',
  { actorId: UserId },
  ({ input }) =>
    OpenProjects.pipe(
      Mine(input.actorId),
    ),
)
~~~

The important property is not the exact spelling.

It is:

> **Composition happens before naming/registration.**

---

## 29. Recommended build order

### Phase 0 -- revise documentation

Document the semantic distinction:

~~~text
Entity
Selection
Expr / Predicate
anonymous Query
named QueryDefinition
QueryRef
Data / Remote
~~~

### Phase 1 -- tiny Expr kernel

Implement only:

~~~text
field ref
input ref
literal
eq
and
ordering
dependency extraction
~~~

Use ordinary immutable discriminated unions.

Do not build a generic compiler framework.

### Phase 2 -- anonymous Query + pipeable transformations

Implement:

~~~text
Query.from
Query.where
Query.orderBy
~~~

Define composition laws explicitly:

~~~text
multiple where => AND
multiple orderBy => append terms
~~~

### Phase 3 -- Query.define bridge to current Remote descriptor

Make Query.define produce or adapt to the current Remote QueryDescriptor requirements:

~~~text
name
Input codec
Result/entity
stable ref(input)
~~~

Preserve QueryRef identity/window behavior.

Avoid a breaking Remote redesign in the first experiment.

### Phase 4 -- compile to remote-drizzle

Migrate one existing query away from duplicated adapter-side where/orderBy.

Candidate queries should include at least one real current CMS/Remote query, not only a synthetic example.

Keep native callbacks as escape hatches.

### Phase 5 -- in-memory reference interpreter

Execute the same IR over in-memory rows.

Add differential tests against real Drizzle SQL.

### Phase 6 -- broaden the portable kernel from examples

Possible next operations:

~~~text
neq
range comparison
or / not
in
null checks
string matching
~~~

Only add what real queries need.

### Phase 7 -- TanStack DB spike

Compile the same Query into TanStack DB.

Measure:

~~~text
type/API fit
incremental query usefulness
lifecycle fit with Surface
bundle/runtime cost
cross-source potential
which Data operations truly generalize
~~~

### Phase 8 -- LiveStore spike

Bind one read/query path through LiveStore and Surface-driven lifecycle.

Keep durable ownership explicit.

### Phase 9 -- decide package placement

Only after two interpreters work, decide whether source-neutral pieces live in:

~~~text
foldkit-remote
foldkit-entity
a small foldkit-query package
~~~

Do not decide from aesthetics alone; follow dependency direction.

### Phase 10 -- materialization / Sync work

Experiment with committed-operation observation and a rebuildable local read model.

Atomic batches and durable migration APIs should follow concrete use cases.

### Phase 11 -- advanced relational features

Only after demonstrated need:

~~~text
joins
groupBy
aggregates
distinct
subqueries
general projection
derived-query composition
cross-source planning
~~~

TanStack DB may remain the execution engine for some of these rather than being reimplemented.

---

## 30. Acceptance criteria

The seam is correct if one domain declaration and one named query can execute through multiple interpreters.

~~~ts
const Post = Entity.define(...)

const PostRow = Entity.select(Post, {
  id: true,
  title: true,
})

const Published = Query.where(
  Expr.eq(Post.fields.published, true),
)

const RecentPosts = Query.define(
  'RecentPosts',
  {},
  () =>
    Query.from(Post).pipe(
      Published,
      Query.orderBy(
        Query.desc(Post.fields.createdAt),
      ),
    ),
)
~~~

Execution:

~~~text
RecentPosts
   ├── remote-drizzle -> server SQL
   ├── in-memory      -> reference evaluator
   ├── TanStack       -> local incremental view
   └── LiveStore      -> local SQLite query
~~~

Application use remains approximately:

~~~ts
Data.query(RecentPosts, {}, {
  select: PostRow,
  first: 25,
})
~~~

The feature should not care how the query executes unless it deliberately uses backend-specific semantics.

---

## 31. Non-goals

This design does not aim to:

- replace Model / Message / update;
- replace foldkit-remote;
- replace foldkit-sync;
- reproduce gen2's whole application compiler;
- reproduce data-forge's whole proposed data model;
- recreate SQL as TypeScript;
- reproduce all of TanStack DB;
- reproduce all of LiveStore;
- add a second mutable Collection store;
- make every query portable;
- force every interpreter to support every operation;
- merge Selection and Query prematurely;
- move Remote EntityStore/Connection machinery prematurely;
- bypass server authorization;
- make Query responsible for UI pagination/navigation state;
- build cross-store planning before a real use case requires it.

---

## 32. External and internal references checked

Internal prior art:

- doeixd/gen2 README and implementation:
  - typed Expr AST
  - Predicate
  - QueryExpression
  - QueryFunction
  - query requirements/runtime checking
  - reactive keys and dependency analysis
  - cross-store query planning
- doeixd/data-forge README:
  - composable filters
  - lens/projection separation
  - operation properties
  - location-independent execution concept

External prior art:

- TanStack DB overview: https://tanstack.com/db/latest/docs/overview
- TanStack DB live queries: https://tanstack.com/db/latest/docs/guides/live-queries
- TanStack DB query collection: https://tanstack.com/db/latest/docs/collections/query-collection
- LiveStore Store API 0.4: https://docs.livestore.dev/api/livestore/classes/store/
- LiveStore changelog 0.4: https://docs.livestore.dev/changelog/

These are prior art, not architectural dependencies.

---

## 33. Final thesis

Foldkit Plus already has the important runtime pieces:

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

The missing layer should not be another store.

It should be a **small composable semantic language for reads**:

~~~text
Field
  ↓
Expr
  ↓
Predicate
  ↓
anonymous Query
  ↓
named QueryDefinition
  ↓
Data / Surface
  ↓
interpreter
~~~

That produces a coherent Foldkit vocabulary:

~~~text
Entity
  semantic noun

Selection
  semantic entity shape

Expr
  semantic scalar computation

Query
  semantic relational computation

QueryDefinition
  semantic named read capability

Message
  semantic transition

Surface
  semantic observation/capability boundary

Wiring
  semantic installation boundary
~~~

The most important rule is:

> **Compose first. Name and register second. Interpret last.**

That gives Foldkit Plus the useful parts of gen2, data-forge, TanStack DB, and LiveStore while preserving what Foldkit already does better: explicit state ownership, semantic Messages, pure update, declarative observation, server-side authorization, and replaceable interpreters.
