# RFC: What Foldkit Might Want to Steal from `foldkit-plus`

**Status:** Proposal / design exploration  
**Scope:** Foldkit architecture, tooling, official extensions, and ecosystem boundaries  
**Thesis:** Upstream the vocabulary that makes application boundaries explicit; let interpreters reuse that vocabulary without creating parallel state or async systems.

## Summary

`foldkit-plus` is valuable less because Foldkit needs fifteen more packages and more because it exposes a missing layer in Foldkit's architecture.

Foldkit already makes the application's **state machine** unusually explicit:

```text
Model
  +
Message
  +
update
  +
explicit effects
```

The Model is the single source of semantic application truth. Every state transition flows through `update`. Commands, Subscriptions, Mounts, Managed Resources, Flags, routing, Submodels, Ports, and testing all fit around that state machine without introducing a second reducer or hidden application store.

What `foldkit-plus` discovers is that another class of architectural fact is also worth making explicit:

```text
What does this consumer observe?

What may this consumer cause?

Which external facts are required to satisfy this observation?

Which external systems merely represent this state?

Which Messages belong to some external capability?

Which parts of the architecture can tooling inspect without executing it?
```

The strongest idea in `foldkit-plus` is therefore not Remote, Sync, Mirror, Agents, or Mixins individually.

It is:

> **Application boundaries can be explicit data too.**

The most useful substrate is a small family of declarations:

```text
Application identity
        |
        +--> ModelRef / Projection
        |
        +--> Message subset
        |
        +--> Surface
```

A Surface describes a consumer-facing boundary over state and Messages that already exist:

```text
what this consumer may observe
+
what this consumer may cause
```

It deliberately differs from a Submodel:

```text
Submodel
    who owns a state machine

Surface
    how a consumer sees and acts on existing state machines
```

The newer async-semantics work strengthens this proposal.

Solid 2's async model suggests an important general lesson:

> **Async behavior should compose through the same dependency model as ordinary state rather than through a parallel resource vocabulary.**

But Foldkit should not copy Solid's reactive runtime. Foldkit already has a different and valuable decomposition:

```text
semantic state       -> Model / AsyncData
one-shot work        -> Command / Effect
ongoing work         -> Subscription / Stream / Scope
observation          -> ModelRef / Projection / Surface
external requirement -> interpreter-owned Projection metadata
confirmation         -> package-specific semantics composed as Effect
```

The recommendation of this RFC is therefore to selectively absorb the following concepts:

```text
                 Foldkit today
                       |
                       v
             Model · Message · update
                       |
              explicit effect taxonomy
                       |
                       v
         +---------------------------+
         | static contract vocabulary|
         |                           |
         | Application descriptor    |
         | Model Projection          |
         | Message subset            |
         | Surface / Boundary        |
         +-------------+-------------+
                       |
          +------------+------------+
          |            |            |
          v            v            v
      DevTools       Agents      interpreters
      manifests                 Remote / Mirror /
                                future packages
```

Remote, Sync, and Durable should remain incubation projects for now. They contain strong architectural lessons, but they make larger product commitments around caching, replication, local-first persistence, authoritative ordering, and server infrastructure.

The goal is **not to make Foldkit larger for its own sake**.

The goal is:

> **Make Foldkit's boundaries as explicit and reusable as its transitions, while preserving one Model, one Message flow, one update function, and Effect as the async-control substrate.**

For the detailed async rationale and rejected alternatives, see [`design/async-semantics-DESIGN.md`](./design/async-semantics-DESIGN.md).

---

# 1. The design constraint: Foldkit must still feel like Foldkit

Any idea borrowed from `foldkit-plus` should pass a high bar.

The worst outcome would be turning Foldkit into a pile of architectural DSLs:

```text
Model
Message
Submodel
Surface
Projection
Module
Agent
Mirror
Remote
Sync
Activity
Authority
Observation
Action
...
```

That would work against one of Foldkit's strongest properties: a relatively small vocabulary with an idiomatic place for each kind of behavior.

The integration rule should be:

> **Add a primitive only when it makes several existing or future features simpler at once.**

## Existing Foldkit applications must remain complete

A small Foldkit app should still need nothing beyond:

```ts
Model
Message
init
update
view
Runtime.makeApplication(...)
```

No Surface, Projection, architecture manifest, or interpreter metadata should be required.

If nobody needs to inspect or reuse a feature's boundary, a plain Model-reading function is simpler than a Surface.

## New abstractions must not own hidden state

Nothing introduced here should create:

- another reducer;
- another mutable application store;
- another rendering loop;
- another state-ownership system;
- another generic async-control library beside Effect.

A new abstraction should either describe existing architecture or compile into existing Foldkit / Effect primitives.

## Writes should still mean Messages

For ordinary application-facing APIs:

```text
reading Model state
    -> Projection

changing Model state
    -> Message -> update
```

Writable optics/foci may exist for infrastructure, hydration, replay, or internal implementation, but should not quietly become a second semantic mutation API.

Knowing where data lives is not authority to mutate it.

## Higher-level features should compile into existing effect categories

Foldkit already has a strong effect taxonomy:

```text
Command
    one-shot work caused by a transition

Subscription
    ongoing work whose lifetime follows Model state

Mount
    element-scoped imperative work

ManagedResource
    Model-governed stateful handle

Flag
    external value needed before initial Model construction
```

A higher-level feature should normally compile into these categories and Effect primitives.

Examples:

```text
Agent
    dispatches existing Messages

Mirror
    uses Commands / Subscriptions

Remote
    keeps cache state in a Submodel and runs I/O outside render

Behavior
    resolves to ordinary attributes / Mounts
```

If a feature requires a parallel effect lifecycle, the design has probably gone wrong.

## Core rendering should remain reproducible from Model

This is particularly important after studying Solid 2.

Foldkit should not make runtime fiber state an invisible second input to normal views:

```ts
// not the default Foldkit model
view(model, runtimeActivity)
```

If `saving`, `refreshing`, `stale`, or `pending` affects application semantics, encode that state in Model.

This preserves:

- deterministic rendering;
- SSR / hydration;
- Story / Scene;
- replay;
- time-travel debugging;
- Schema-based persistence.

Runtime execution state may still exist for devtools, diagnostics, telemetry, and adapters. It should not silently become application truth.

---

# 2. The central missing abstraction: a pure application descriptor

`foldkit-plus` repeatedly needs a stable value that means:

> This is the Foldkit application whose Model, Message vocabulary, and transition function I am describing.

Today those values exist separately, while `Runtime.makeApplication` is closer to an execution/mounting boundary.

## Proposal: introduce an optional pure Application / Program value

Illustrative API:

```ts
export const App = Application.define({
  Model,
  Message,
  init,
  update,
  view,
})
```

Bootstrapping could become:

```ts
const application = Runtime.makeApplication(App, {
  container: document.getElementById('root'),
})

Runtime.run(application)
```

The important distinction is:

```text
Application definition
    pure
    importable in tests
    no DOM
    stable architectural identity

Runtime mounting
    environment-specific
    container
    devtools
    ports
    hydration
    browser/server concerns
```

## Why this helps beyond Plus

A pure application value becomes an anchor for:

- Model projections;
- Message subsets;
- Surfaces;
- Story / Scene helpers;
- architecture manifests;
- agent contracts;
- Mirror declarations;
- HMR/SSR metadata;
- extension packages;
- static analysis.

Today extensions often need loose tuples of:

```ts
Model
Message
init
update
```

or create their own wrapper. A canonical application identity removes that repetition and allows the type system to reject cross-application composition.

## This should remain optional

Do not make:

```ts
Application.define(...)
```

the only way to write Foldkit.

The descriptor is useful when another subsystem needs a stable, inspectable application identity. Plain exports remain valid.

---

# 3. Projection: make observation explicit without creating another state system

The most reusable Plus primitive underneath Surface is its notion of an inspectable Model projection.

The useful distinction is:

```text
Effect Optic
    structural focus

Projection
    typed value + explicit read dependencies

Surface
    Projection + permitted Messages
```

A normal function:

```ts
model => ({
  todos: model.todos,
  filter: model.filter,
})
```

computes a value, but another subsystem cannot reliably inspect the function and discover:

```text
reads:
  todos
  filter
```

Once those relationships are data, other systems can reason about them.

## Proposal: a small read-only Projection

Conceptually:

```ts
interface Projection<Root, Value> {
  readonly Model: Schema.Codec<Value, unknown>
  readonly dependencies: DependencyTree
  readonly metadata: Metadata
  readonly read: (root: Root) => Value
}
```

`Metadata` is opaque: a package makes a typed slot with `Metadata.key<A>(name, { merge, summarize })`, attaches entries with `key.of(...)`, and reads them with `key.get(metadata)`. The important point is that Projection may carry **opaque interpreter-owned declarations** without understanding their domain semantics.

Generated field references make projection construction type-safe:

```ts
App.fields.todos
App.fields.filter
App.fields.session.user
```

and:

```ts
const TodoOverview = Projection.struct({
  todos: App.fields.todos,
  filter: App.fields.filter,
})
```

The same value is executable:

```ts
TodoOverview.read(model)
```

and inspectable:

```text
reads:
  todos
  filter
```

## Keep core Projection read-only

For Foldkit proper, prefer:

```text
Projection
    read only

Optic / Focus
    structural get/replace

Message
    semantic state transition
```

Infrastructure packages may explicitly request a writable focus, but a Surface, view, Agent, or ordinary feature should usually receive only a Projection.

## Projection metadata should be open, not Remote-shaped

The earlier version of this RFC said:

> Core Projection should carry only Model paths; Remote can wrap or annotate it externally.

That was too restrictive.

Experience in `foldkit-plus` shows why the metadata often needs to survive **through Projection composition itself**. A composed projection should be able to retain the declarative external facts contributed by its children.

The refined rule is:

> **Core may own a tiny open metadata seam; interpreters own the typed metadata and its meaning.**

Do not put these concepts directly into core Projection:

```text
Remote entity
Remote field selection
pagination window
query connection
Sync operation
feature flag
search index
```

Instead, an interpreter should construct a branded / opaque declaration that Projection can preserve and compose.

Conceptually:

```ts
const RemoteRequirements = Metadata.key<Requirement>('remote', {
  merge: Requirement.merge,
  summarize: requirement => ...,
})

RemoteRequirements.of(requirement) // attach
RemoteRequirements.get(projection.metadata) // read
```

Surface / Projection need not understand it: `Metadata` is opaque, and entries are found by the key object.

Remote can later inspect the Projection and retrieve only metadata it owns, with `requirementsOf(projection)` and `connectionsOf(projection)`. Tooling sees every package's entries through `Metadata.summarize`, as `{ name, entries }[]`.

A future package can contribute another metadata type without editing a central union.

### Why this matters

Without an open metadata seam, every new interpreter tends toward one of three bad outcomes:

```text
1. change Surface core
2. create a parallel Projection DSL
3. throw away metadata during composition
```

With an open seam:

```text
Projection
   |
   +--> Remote requirement
   +--> Search requirement
   +--> Feature-flag requirement
   +--> future interpreter metadata
```

and each interpreter reads only what it understands.

This is similar in spirit to Effect's declarative style: construct an immutable description once, then allow different interpreters to derive behavior from it.

## Keep three relations distinct

Do not collapse everything into one generic `Dependency` type.

There are at least three meaningful relations:

```text
reads
    this projection observes this Model state

requires
    satisfying this projection requires external facts

affects
    this bounded work may later change some facts
```

They have different semantics and should remain distinguishable if all three eventually exist.

## Type-safety rule

User code should declare relationships through typed values:

```ts
App.fields.todos
Data.get(Project, projectId)
Message.RequestedRenameProject
```

not erased strings:

```ts
affects('todos')
requires('Project:p1')
```

A declaration may compile internally to strings or IDs. Strings are acceptable **after** a typed declaration has been compiled; they should not be the declaration API.

---

# 4. Message subsets: a small primitive with disproportionate value

Plus introduces `MessageSet`: an inspectable subset of the application's existing Message union.

That is exactly the sort of primitive Foldkit should own.

Illustratively:

```ts
const EditingMessages = Message.only(
  Message.ChangedTitle,
  Message.DeletedTodo,
)
```

and obtain:

```text
Schema
constructors
tags
includes(message)
```

The subset itself does not mean:

```text
Agent Message
Durable Message
Remote Message
Sync Message
```

Instead:

```text
Message subset
      |
      +--> Agent interprets it as callable
      +--> Sync interprets it as durable/replayable
      +--> Surface interprets it as permitted
      +--> tooling interprets it as architecture
```

This is powerful precisely because it names an existing application vocabulary rather than inventing another one.

---

# 5. Surface: the idea most worth upstreaming

With Projection and Message subsets available:

```text
Surface =
    named Projection
  + allowed Message subset
```

For example:

```ts
const TodoList = App.surface('TodoList', {
  model: {
    todos: App.fields.todos,
    filter: App.fields.filter,
  },

  messages: [
    Message.ToggledTodo,
    Message.DeletedTodo,
  ],
})
```

This says:

```text
TodoList

may observe:
  todos
  filter

may cause:
  ToggledTodo
  DeletedTodo
```

Nothing runs.

No state is created.

No update is added.

No runtime boundary exists.

That is why this concept fits close to Foldkit's core.

## Surface fills a gap between views and Submodels

A Submodel answers:

> Who owns this state machine?

A Surface answers:

> What existing state does this consumer need, and which existing root Messages may it cause?

A screen may legitimately need:

```text
route
settings.theme
session.user
```

from several owners. Creating another Submodel solely to aggregate those reads would be the wrong ownership decomposition.

Surface lets observation cut across ownership boundaries without changing ownership.

## Views can optionally become capability-restricted

Today a root view often receives:

```ts
HtmlBuilder<Message>
```

and therefore can construct any application Message.

A Surface-backed view could narrow both sides:

```ts
Surface.view(TodoList, (model, h) => {
  // model is only TodoList's projection
  // h only emits TodoList's allowed Messages
})
```

This should remain optional.

Plain functions first; contracts only when something needs to inspect or reuse the boundary.

---

# 6. What Solid 2 teaches Foldkit about async

Solid 2 moves async into its reactive graph. Pending work, readiness, stale values, optimistic writes, refresh, errors, and transitions can all be understood through the same graph used for ordinary reactive computation.

Foldkit should steal the **unification principle**, not the runtime mechanism.

Foldkit already has a different explicit architecture:

```text
Message
   |
   v
 update
   |
   +--> Model
   |
   +--> Command / Subscription
             |
             v
           Effect
```

The proposal is therefore deliberately conservative.

## `AsyncData` already models semantic async state

Foldkit already has:

```text
Idle
Loading
Refreshing(data)
Failure(error)
Stale(data, error)
Success(data)
```

and value-level combinators such as mapping, flat-mapping, zipping/all, settling, pending checks, and revalidation helpers.

This already captures a crucial distinction:

```text
first load
    !=
refresh while useful data exists
    !=
failed refresh while useful data exists
```

If loading / refreshing / stale / failed is part of application semantics, it belongs in Model.

Do not replace that with Promise-returning view computations.

## Keep State, Work, and Confirmation separate

A unified async story still needs semantic distinctions.

### State — what is true or visible?

Lives in Model when the application needs to reason about it.

Examples:

```text
AsyncData.Refreshing(previousUser)
form validation state
optimistically renamed local Model value
```

### Work — what is executing?

Lives in runtime machinery.

Examples:

```text
HTTP Command fiber
Subscription
ManagedResource lifetime
Remote request
Sync exchange
```

A Command being active does not automatically imply application state `saving = true`.

### Confirmation — what counts as settled?

Different interpreters legitimately have different semantics:

```text
ordinary Foldkit
    a result Message was reduced

Remote
    server-derived data was installed

Sync
    operation entered committed server order

Agent
    completion Message arrived
    OR application state satisfies declared success condition
```

Do not invent a universal `Authority<A>` abstraction that erases those differences.

Prefer precise vocabulary:

```text
visible
confirmed / committed
pending
settled
```

## Effect should remain the async-control language

Any new one-shot async-facing API should return `Effect`.

Any ongoing value should naturally compose as `Stream`.

Resource lifetime should use `Scope` / Layer / scoped Effects.

Do not add Foldkit-specific versions of:

```text
timeout
retry
race
interrupt
fork
supervision
resource finalization
```

Examples:

```ts
agentRuntime.messages.dispatch(...).pipe(
  Effect.retry(policy),
)
```

```ts
replica.synchronize.pipe(
  Effect.timeout('5 seconds'),
)
```

A Model transition is not an async operation: `Data.refresh(model, ProjectPage)` is called from `update`, returns the Model, and leaves the I/O to Subscriptions.

This keeps Foldkit aligned with the Effect ecosystem instead of growing an ad-hoc async option language in every package.

## Do not add generic `Observation`, global `refresh`, or Solid-style `action`

A tempting wrapper like:

```ts
interface Observation<A> {
  get: Effect.Effect<A>
  changes: Stream.Stream<A>
}
```

mostly renames Effect's existing primitives and can introduce read/subscribe races if implemented badly.

Likewise:

```ts
Foldkit.refresh(anyProjection)
```

is too generic. A local Model field has nothing to refresh. A Remote requirement can be revalidated. A Sync document synchronizes rather than refreshes.

And Foldkit does not need Solid's `action()` abstraction because it already has a more explicit mutation pipeline:

```text
request Message
      |
      v
    update
   /      \
Model    Command
            |
            v
        result Message
            |
            v
          update
```

The lesson is not to add another action concept. It is to make the existing state/effect/confirmation boundaries compose better.

## Do not make runtime activity a second render store

A future runtime introspection API may be useful for devtools:

```ts
Activity.isActive(SaveUser)
```

But ordinary application rendering should not become:

```ts
view(model, activity)
```

because then replaying the same Model no longer guarantees the same UI.

If the user should see `Saving...`, that semantic fact belongs in Model.

---

# 7. What this substrate enables in practice

The value of the proposal is easier to see through before/after examples.

All API names in this section are illustrative.

## 7.1 Agent completion: implementation event -> semantic result

### Before

An agent that renames a project must know the specific Message that means success:

```ts
completion: {
  success: Message.RenamedProject,
  correlate: (request, result) =>
    request.projectId === result.projectId,
}
```

That works when the application flow is:

```text
RequestedRenameProject
        |
        v
      update
        |
        v
  RenameProject Command
        |
        v
   RenamedProject
```

But if confirmation later arrives through a live Remote update or Sync reconciliation, the Agent contract is coupled to an implementation detail.

### After

State-based completion can express the semantic postcondition:

```ts
completion: Agent.when({
  projection: ProjectName,
  predicate: (name, request) =>
    name === request.name,
})
```

Now any lawful application path can satisfy it:

```text
Command result
Remote live update
Sync commit
another device
server push
       |
       v
project.name == requested name
       |
       v
agent invocation completes
```

The capability is coupled to the semantic result rather than one internal event.

Message-based completion should continue to exist when the event itself is the right contract.

## 7.2 Live-source acknowledgement without edge-triggered races

A WebSocket mutation may be accepted before authoritative live state reflects it.

Before, applications often invent a bespoke event waiter:

```text
send mutation
subscribe for next matching event
hope the event did not arrive first
```

A level-triggered state completion instead asks:

```text
Does current application state already contain the result?
If not, wait for state changes until it does.
```

The implementation must be race-safe: subscribe-before-read or use an Effect primitive that presents current + future values without a gap.

This is the useful lesson from Solid's `until()` without introducing a global Foldkit `until()` abstraction.

## 7.3 Remote refresh derived from existing Projection requirements

Suppose a page already declares:

```ts
const ProjectPage = Projection.all({
  project: Data.get(Project, projectId),
  owner: Data.get(User, ownerId),
  tasks: Data.query(TasksByProject, { projectId }),
})
```

### Before

A refresh path may restate the same data graph:

```ts
[
  LoadProject({ projectId }),
  LoadOwner({ ownerId }),
  LoadTasks({ projectId }),
]
```

### After

Remote can interpret the requirements already carried by the Projection:

```ts
// in update
return { model: Data.refresh(model, ProjectPage) }
```

meaning:

> Revalidate the Remote requirements contributed by this consumer declaration.

`Data.refresh` performs no I/O. It returns the Model with the selected fields marked `Refreshing` and loaded connections invalidated; the `Data.subscriptions` read entries refetch them, restarting any read already in flight. A refreshed connection's first page replaces its pages. Refreshing again before that lands returns the same Model.

This is **not** a global `Foldkit.refresh`. Remote can implement it because Remote owns the requirement semantics.

## 7.4 Third-party interpreters without parallel DSLs

Imagine:

```text
@acme/foldkit-feature-flags
```

Before, the package may need a parallel `FeatureFlagProjection` / `FeatureFlagSurface` because generic Projection cannot carry its requirements.

With open interpreter metadata:

```ts
const BillingPage = Projection.all({
  account: App.fields.account,
  redesignEnabled: Flags.get('billing-redesign'),
})
```

`Flags.get(...)` can contribute its own branded metadata while still producing an ordinary Projection.

Then:

```text
Surface
   |
   +--> normal Model dependencies
   +--> Remote requirements
   +--> FeatureFlag requirements
```

Each interpreter consumes only the declarations it owns.

This is a major ecosystem benefit: extension packages can join the same application graph without inventing a second observation language.

## 7.5 Better AsyncData rendering without suspension

Before:

```ts
AsyncData.match(model.user, {
  onIdle: () => UserSkeleton(),
  onLoading: () => UserSkeleton(),
  onFailure: error => ErrorView(error),
  onRefreshing: user =>
    UserView({ user, refreshing: true }),
  onStale: ({ data, error }) =>
    UserView({ user: data, staleError: error }),
  onSuccess: user =>
    UserView({ user }),
})
```

A small view-oriented interpreter (planned; not built) could make the common policy easier:

```ts
Render.async(model.user, {
  empty: () => UserSkeleton(),
  failure: error => ErrorView(error),
  data: (user, state) =>
    UserView({
      user,
      refreshing: state.refreshing,
      staleError: state.staleError,
    }),
})
```

Still:

```text
view = Model -> VNode
```

No Promise suspension. No hidden fetch. No second scheduler.

## 7.6 Agent + Sync: visible is not the same as committed

Suppose an agent edits replicated state.

Sync can immediately expose:

```text
committed
    Old title

pending
    Rename -> New title

visible
    New title
```

If Agent completion only inspects visible Model state, it may return success before the server accepts the operation.

A Sync-aware completion path waits on the **committed** view, which `Sync.mount` exposes as a `{ get, subscribe }` source outside the Model:

```ts
completion: Agent.when({
  source: mounted.committed,
  predicate: (shared, request) =>
    shared.todos.some(todo =>
      todo.id === request.id && todo.title === request.title),
})
```

After acknowledgement:

```text
committed
    New title

pending
    []

visible
    New title
```

Now the capability settles.

Agent does not need to know about cursors, outbox entries, or Sync protocol Messages. Sync owns what `committed` means; Agent only consumes a typed state condition.

## 7.7 Remote optimism can use the same vocabulary without the same implementation

A future Remote mutation layer may have:

```text
confirmed server cache
      +
optimistic mutation layers
      =
visible cache
```

Normal UI may read visible state while an external capability waits for confirmed state.

Conceptually (planned; not built):

```ts
Remote.visible(ProjectName)
Remote.confirmed(ProjectName)
```

The vocabulary aligns with Sync, but the implementations remain specialized.

Do not extract a universal optimistic-state abstraction merely because the diagrams rhyme.

## 7.8 Effect becomes the one async-control language

Without a clear rule, every package may eventually invent:

```ts
{
  timeout: 5000,
  signal,
  retry: 3,
}
```

With the proposal, package operations compose as Effects:

```ts
agentRuntime.messages.dispatch(...).pipe(
  Effect.retry(policy),
)

replica.synchronize.pipe(
  Effect.race(otherWork),
)
```

A completion wait is the exception worth naming: the Agent runtime owns one deadline, the contract's `timeout`, covering both the host dispatch and the wait, and an invocation's abort signal settles either.

One ecosystem vocabulary handles cancellation, retry, race, timeout, fibers, Scope, and services.

## 7.9 A future Runtime seam can become more Effect-native

Current host integrations often normalize several JavaScript styles:

```text
() => Model
callback subscriptions
Promise<void>
Effect<void>
```

A future first-class Foldkit runtime handle could expose an Effect-native internal seam such as:

```ts
interface RuntimeHandle<Model, Message> {
  readonly model: Effect.Effect<Model>
  readonly models: Stream.Stream<Model>
  readonly messages: Stream.Stream<Message>
  readonly dispatch: (message: Message) => Effect.Effect<void>
}
```

Protocol adapters can still accept callbacks/Promises at the edge.

This is not required for the Surface proposal, but it would make Agent and future interpreter bindings more uniform with Effect.

## 7.10 Module / DevTools gain a richer static graph

A single declaration can now feed tooling:

```text
ProjectPage
|
+-- observes
|   +-- session.userId
|   +-- ui.selectedTab
|   +-- projects
|
+-- requires
|   +-- Remote: Project:p1 [id,name,owner]
|   +-- Remote: TasksByProject:p1
|   +-- FeatureFlags: new-project-page
|
+-- may cause
    +-- RequestedRenameProject
    +-- RequestedAddTask
```

That can power:

- architecture docs;
- manifests;
- capability review;
- dependency inspection;
- DevTools visualizations;
- AI/MCP architecture queries.

The same declaration becomes useful to several interpreters.

## 7.11 The end-to-end payoff

Consider one declaration:

```ts
const ProjectPage = App.surface('ProjectPage', {
  model: Projection.all({
    project: Data.get(Project, projectId),
    tasks: Data.query(TasksByProject, { projectId }),
  }),

  messages: [
    Message.RequestedRenameProject,
    Message.RequestedAddTask,
  ],
})
```

The UI interprets it as a restricted render boundary.

The Agent interprets its Projection as context and its Messages as capabilities.

Remote interprets its requirement metadata to plan/revalidate reads.

DevTools interprets it as architecture.

A future package may contribute more metadata without replacing the Surface.

```text
                  ProjectPage
                       |
         +-------------+-------------+
         |             |             |
         v             v             v
        UI           Agent         Remote
      renders       observes        plans
      + emits       + acts       requirements
                                      |
                                      v
                                   refresh
```

Before:

> each subsystem knows enough to integrate with the application.

After:

> **each subsystem interprets the same application declarations.**

That is the strongest form of the Foldkit Plus thesis:

> **Declare the application once. Interpret it everywhere.**

---

# 8. Architecture as data: DevTools should show structure as well as history

Once Foldkit has static contracts, tooling can show both dynamic and static architecture.

Dynamic history already answers:

```text
What happened?
```

A static contract layer can additionally answer:

```text
What may happen?
Who can cause it?
What state can this consumer observe?
What external facts does this consumer require?
```

Example:

```text
TodoList
  observes
    todos
    filter

  may cause
    ToggledTodo
    DeletedTodo

Assistant
  observes
    TodoList projection

  may invoke
    RequestedTodo
    ToggledTodo

ProjectPage
  requires
    Remote Project selection
    Remote task connection
```

This would be unusually aligned with Foldkit's product story.

## Architecture manifests are useful for AI and review

Foldkit already benefits from explicit architecture being legible to humans and AI.

Generated metadata compounds that advantage.

An agent could answer:

```text
Which screen can emit this Message?
Which Model paths does this feature observe?
Which external requirements feed this page?
Which Messages are production-agent callable?
What state is represented in the URL?
Which state is replicated?
```

A committed manifest can also expose security-relevant capability changes:

```diff
 agent Assistant:
   messages:
     - ToggledTodo
+    - DeletedTodo
```

The product is the inspectability, not necessarily a public `Module` abstraction.

---

# 9. Production agent capabilities should become an official Foldkit package

`foldkit-agent` is one of the most immediately valuable higher-level ideas in Plus.

DevTools MCP and production Agent solve different problems:

```text
DevTools MCP
    trusted developer/tool
    broad visibility
    debugging / time travel
    arbitrary schema-valid dispatch
    development environment

Production Agent
    restricted consumer
    least-privilege visibility
    selected capabilities
    authorization
    stable external schema
    production environment
```

## Core rule

> **An agent capability is an application Message, not a second implementation of the feature.**

Conventional tool integration often duplicates application behavior:

```ts
tool('deleteTodo', async ({ id }) => {
  // validate
  // authorize
  // mutate
  // persist
  // notify
})
```

while the application already has:

```ts
Message.DeletedTodo({ id })
```

and `update` already knows the transition.

Foldkit can instead converge all callers on the same Message path:

```text
human UI -----+
              |
agent --------+--> Message --> update --> Model / Commands
              |
other host ---+
```

## External input should not necessarily equal internal Message payload

If the application has:

```text
RequestedTodo { title }
      |
      v Command generates id/time
      |
SubmittedTodo { id, title, createdAt }
```

an external caller should normally invoke `RequestedTodo`, not fabricate the materialized fact Message.

This preserves Foldkit's existing nondeterminism boundary.

## Completion contracts should support both events and state

Event completion remains valuable:

```ts
completion: {
  success: Message.SubmittedTodo,
  failure: Message.FailedTodo,
  correlate: (request, result) => ...,
}
```

But state-based completion should also be available where the semantic postcondition is better than one event:

```ts
completion: Agent.when({
  projection: TodoByClientId,
  predicate: (todo, request) =>
    todo.title === request.title,
})
```

The state waiter must be race-safe. `Agent.when` also accepts `source: { get, subscribe }` for state outside the Model. The runtime bounds dispatch and wait with one deadline (`timeout`) and honours the invocation's abort signal.

## Availability and authorization remain separate

```text
available(model)
    does this capability exist now?

authorize(principal, input, model)
    may this caller perform it?
```

Do not collapse them.

## Adapters should remain thin

The protocol-neutral contract can compile to:

```text
WebMCP
MCP
A2A
future protocols
in-app copilot
```

without business logic appearing in those adapters.

---

# 10. Mirror should probably become an official Foldkit pattern/package

Mirror's rule is:

> The URL or local persistence may represent Model state, but does not become another owner of that state.

Conceptually:

```text
             URL
              ^
              | representation
              |
Messages -> update -> Model
              |
              | representation
              v
         KeyValueStore
```

rather than three competing owners that need reconciliation.

## Mirror should compile to existing Foldkit effects

URL mirroring can be implemented from:

- Projection;
- navigation Commands;
- URL Subscriptions;
- Schema codecs.

KV mirroring can be implemented from:

- Projection;
- restore Command;
- persistence Subscription/Command;
- KeyValueStore.

That makes Mirror a good optional package rather than a new runtime subsystem.

## Mirror is not Route

Use Route when a value defines location.

Use Mirror when ordinary Model state should also be represented in the location.

```text
Route
    application location

URL Mirror
    representation of Model state
```

## Mirror is not Flags

```text
required before initial Model
    -> Flags

can restore after application starts
    -> Mirror
```

## Mirror is not durable persistence

Mirror is appropriate for disposable/per-device representational state such as:

```text
filter
theme
panel state
draft
zoom
```

Do not teach that authoritative domain persistence is merely a Mirror.

## Restored state should re-enter through Messages

Even if infrastructure has structural write access internally, the public design should bias toward semantic re-entry:

```ts
restored: values =>
  Message.RestoredPreferences(values)
```

especially when the data belongs to a Submodel.

---

# 11. From Mixins, steal attribute composition and named Parts—not the whole system

`foldkit-mixins` solves a real problem but is the easiest Plus subsystem to over-import.

Foldkit UI's headless mode says:

```text
component owns behavior
caller owns markup
```

Mixins address the inverse case:

```text
reusable view owns markup
caller decorates named extension points
```

Both are useful.

## Preserve `toView`

For low-level headless primitives, caller-owned markup remains stronger.

## Steal semantic attribute composition

Attributes do not all compose the same way:

```text
Class
    concatenate / dedupe

Style
    merge declarations

OnMount
    compose lifecycles

aria-label
    perhaps one owner

OnClick
    independent owners may conflict

key / innerHTML
    structural or protected
```

A semantic `Attribute.compose` primitive could be useful independently of the larger Mixins package.

## Named Parts may be worth adding later

A view-owned component could publish controlled extension points:

```ts
const CardParts = Parts.define({
  root: Part.attributes(),
  title: Part.attributes(),
  action: Part.attributes(),
})
```

The conceptual boundary is:

```text
toView
    consumer owns markup

Parts
    view owns markup but publishes controlled extension points
```

Do not upstream an entire CSS-in-TypeScript language merely to get this capability.

---

# 12. What to learn from Remote without upstreaming Remote yet

`foldkit-remote` is a normalized cache of server-owned data stored inside the Foldkit Model. It distinguishes presence/staleness/not-found/null, shares entities by identity, supports queries/pagination, optimistic layers, and live data.

Most importantly, it does not put an invisible server cache beside the application. Remote state remains inspectable Foldkit state, and I/O results re-enter as Messages.

That is architecturally compelling, but it is a large product commitment.

## Server caches belong inside Model

If server-derived state affects rendering, its status should remain inspectable in the Foldkit state machine rather than hidden in a separate hooks cache.

This preserves:

- DevTools;
- replay;
- Story testing;
- deterministic render;
- one state model.

## Fetch requirements can be declarative without fetching from view

A consumer may declare:

```text
Project.id
Project.name
Project.members.name
```

Then a planner can compute:

```text
requirements
-
already-known facts
=
work to fetch
```

The rendering function still performs no I/O.

## Generic Projection should carry opaque metadata, not Remote types

The old recommendation was:

> Remote metadata should live entirely outside generic Projection.

The refined recommendation is:

> Projection may preserve open interpreter metadata, but Remote owns all Remote-specific types, merging semantics, and execution.

So do **not** put fields like this in generic core:

```ts
projection.remoteRequirements
projection.connections
```

Instead, Remote contributes metadata under its own `Metadata.key` and retrieves it with `requirementsOf(projection)` / `connectionsOf(projection)`.

## Remote-specific Projection refresh

Once requirements survive composition, Remote can lawfully offer:

```ts
Data.refresh(model, ProjectPage)
```

without the caller restating every request.

This is one of the strongest concrete payoffs of interpreter metadata.

## Keep visible and confirmed concepts precise

If Remote develops optimistic mutation layers, its useful conceptual model is:

```text
confirmed server-derived cache
      +
optimistic overlays
      =
visible cache
```

That vocabulary can align with Sync without forcing both packages through one generic optimistic implementation.

---

# 13. What to learn from Sync without upstreaming Sync yet

`foldkit-sync` has an unusually Foldkit-native local-first model:

> Durable operations are existing application Messages, and replay uses the existing `update`.

The core formula is:

```text
committed snapshot
      +
pending durable Messages
      =
visible optimistic shared state
```

and:

```text
normal reducer
    = optimistic reducer
    = replay reducer
    = rebase reducer
```

All are `update`.

## Messages are natural operation records

If a Message is:

- serializable;
- deterministic;
- state-only for the replicated slice;
- replayable later;

then it already resembles an operation log entry.

Do not invent a parallel `TodoOperation` language when application Messages already contain the facts needed for replay.

## Intent/fact separation becomes more valuable

```text
RequestedTodo
    |
    v Command generates id/time
    |
SubmittedTodo { id, timestamp, title }
```

The request may not be replay-safe; the materialized fact can be.

This is a reason to encourage good Message semantics without creating a new type-level Message taxonomy.

## Visible and committed should both be first-class concepts

Sync reveals that:

```text
visible != confirmed
```

A user can see an optimistic edit before it joins server order.

This matters beyond Sync itself because external capabilities may need to choose what kind of completion they mean.

An Agent operating on replicated state may reasonably wait for:

```text
Sync committed view
```

rather than merely:

```text
current visible optimistic state
```

That is a clean example of package composition without abstraction leakage.

## Replay verification may eventually belong in Foldkit tooling

Rather than upstream Sync runtime semantics, Foldkit could eventually provide tools that validate a purported replay-safe Message subset:

```ts
Replay.verify({
  application: App,
  messages: DurableMessages,
  projection: SharedTodos,
})
```

Potential checks:

- touches state outside declared slice;
- emits forbidden Commands;
- depends on nondeterminism;
- produces invalid Model.

This could benefit event sourcing, deterministic workflows, migrations, audit/replay, and Sync.

---

# 14. Durable is valuable, but it is a backend product

`foldkit-durable` implements an authoritative ordered server journal with idempotent append, snapshots, cursors, compaction, live change streams, and durable external-effect recovery.

It is a coherent counterpart to Sync.

Its main lesson for Foldkit is conceptual:

```text
client optimistic state
    does not define truth

server operation order
    defines convergence

external side effects
    need different durability semantics
    from state replay
```

Foldkit core should not become responsible for:

- SQLite journals;
- server sequence assignment;
- compaction;
- effect-recovery workers;
- retry infrastructure.

If local-first becomes a major use case, Sync/Durable could become official packages after production experience.

---

# 15. One principle should become part of Foldkit's vocabulary: ownership vs observation

A thread running through the entire design is:

> **Observation is not ownership. Representation is not ownership. Capability is not ownership.**

Examples:

```text
Surface observes a Submodel field
    != Surface owns that field

URL represents filter
    != URL owns filter

Agent may send DeletedTodo
    != Agent owns deletion semantics

Remote cache lives in Model
    = Remote Submodel owns cache transitions

Sync replicates todos
    != Sync invents a second todo reducer

Style decorates a view
    != Style owns application state
```

A useful review rule is:

> **Every datum should have one semantic owner even when several systems observe, represent, replicate, expose, or interpret it.**

The async proposal extends this rule:

```text
runtime work
    != semantic state

confirmed state
    != necessarily visible state

interpreter metadata
    != state ownership
```

## Reusable ownership units: Bundles

Surface describes an **access** boundary. Foldkit has no value for the other
half: a reusable **ownership** unit. A Submodel is still a hand-wired pattern,
repeated in the update fold, init, Subscription lift, resource lift, and view
for every place it is used.

`foldkit-bundle` packages those parts once and places them through a Link:

```text
Bundle placed at path P
    = owns P's transitions, through the parent's update

Link
    = where ownership lives, not a second owner

two placements of one Bundle
    = two owners of two paths
```

It passes the constraints of section 1: it is optional, holds no hidden state,
compiles to `Update.foldChildStep`, `Subscription.lift`,
`ManagedResource.lift`, and `h.submodel`, and every write is still a Message.
A parity test shows a placement produces the same Models, Commands, and
Subscription dependencies as the same child wired by hand. The pattern has
scaled past examples: `foldkit-primitives` ships dozens of ready-made
bundles, entries, Mounts, and Commands across nine subpaths.

Two Foldkit facts constrain an upstream version. A Managed Resource is provided
by its tag, so two placements of one child with resources collide; and a
Surface cannot expose a placement's individual Messages, because they all
travel under one wrapper variant. The
[bundle design note](./design/bundle-DESIGN.md) records these and the deferred
work.

A review rule follows: **a reused ownership unit should be a Bundle, and every
placement should be a Module contract.**

## Flat and wrapped Messages

A child machine's Messages are wrapped: the parent owns routing to a slice, so
the wrapper names the path. An integration's Messages are flat cases of the
application union: they are facts about the whole application that agents and
journals name directly.

```text
child machine's Messages are wrapped
    -> the parent owns routing to a slice (`GotDarkMessage` carries the field)

an integration's Messages are flat
    -> they are whole-application facts (`MirrorRestored`, Remote's cases)

wrapping an integration's Messages
    != more safety (the router would just unwrap them)

flattening a child's Messages
    != simpler (two placements would claim the same tags)
```

A wiring joins an application either way: placements route by wrapper, and an
integration's `Wiring.route` folds its flat cases. The assembly checks both
with the same claimant rule.

## Joining an application: the wiring list

Bundles package the child side. The integration side — Remote, Mirror, Sync,
Agent — used to join by hand, each in several places: spread the Messages,
add the reduce branch, derive the Subscriptions, provide the client, reduce
the URL at startup, dispatch the restore after mounting. Every step compiles
when missed and silently does nothing.

A **Wiring** states how one integration joins, as data: which Message tags it
folds (`handles`, with `shared` for tags several wirings split by value),
what it runs at startup (`init`), what it subscribes (`subscriptions`), how
it reads the URL (`onUrl`), and what it owns (`contract`). The assembly takes
one wiring per integration beside the placements and derives the runtime
config from the list:

```text
Wiring + Wiring + placement + … ──assemble──▶ update / initial / subscriptions / url / module
derived config ──complete──▶ checked at the property, unchanged at runtime
```

The rule this establishes:

```text
a missed derivation
    = a type error at the property (`complete` only accepts assembly-built values)

two claimants of one tag
    = a startup error naming both (unless the tag is shared and each routes its own values)

a deleted wiring
    != an error (the list cannot check its own membership — behavior catches it)
```

The last line is deliberate honesty, not a gap to close later: `complete`
checks that derivations come from the assembly, not that any particular
wiring is present. Deleting a line still compiles; pinned transcripts and
dispatch-level tests catch the loss. What the list removes is the middle
failure — everything present, everything running, one step silently skipped.

A review rule follows: **an integration joins through a wiring in one
assembly; a hand-built subscriptions record or reduce branch beside one is a
second, unchecked list.** The [wiring guide](./wiring.md) teaches the calls;
the [design note](./design/wiring-DESIGN.md) records where the build departed
from the proposal.

---

# 16. Proposed Foldkit architecture after these changes

The end state should remain smaller than Foldkit Plus.

Conceptually:

```text
+---------------------------------------------+
|              Foldkit application            |
|                                             |
| Model · Message · init · update · view      |
|                                             |
| AsyncData                                   |
| Command · Subscription · Mount              |
| ManagedResource · Flags                     |
|                                             |
| Route · Submodel · Port                     |
+---------------------+-----------------------+
                      |
                      | optional static description
                      v
+---------------------------------------------+
|        application contract vocabulary      |
|                                             |
| Application identity                        |
| Projection                                  |
| Message subset                              |
| Surface                                     |
+----------------+----------------------------+
                 |
        +--------+---------+-----------+
        |                  |           |
        v                  v           v
 architecture           Agent      interpreters
 tooling                           Mirror / Remote /
                                   future packages
```

Projection provides a stable declarative observation seam.

Interpreters may attach typed opaque requirements to it.

Effect remains the async-control substrate.

Separately:

```text
HTML attributes
      |
      v
Attribute.compose
      |
      v
optional named Parts
```

Still incubating outside the conceptual core:

```text
Remote runtime
Sync
Durable
full Mixins styling
```

This is a modest extension of Foldkit rather than adoption of the Plus package graph.

---

# 17. Concrete candidate API

Everything in this section is illustrative, not final naming.

## Application

```ts
export const App = Application.define({
  Model,
  Message,
  init,
  update,
  view,
})
```

## Projection

```ts
const TodoOverview = Projection.struct({
  todos: App.fields.todos,
  filter: App.fields.filter,
})
```

Inspectable:

```ts
Projection.dependencies(TodoOverview)
```

Interpreter metadata is added only through typed interpreter constructors rather than strings.

## Message subset

```ts
const TodoActions = Message.only(
  Message.RequestedTodo,
  Message.ToggledTodo,
  Message.DeletedTodo,
)
```

## Surface

```ts
const TodoList = Surface.define(App, 'TodoList', {
  model: TodoOverview,
  messages: TodoActions,
})
```

or application sugar:

```ts
const TodoList = App.surface('TodoList', {
  model: {
    todos: App.fields.todos,
    filter: App.fields.filter,
  },
  messages: [
    Message.RequestedTodo,
    Message.ToggledTodo,
    Message.DeletedTodo,
  ],
})
```

## Restricted view

```ts
export const todoListView = Surface.view(
  TodoList,
  (model, h) =>
    h.div([], [
      // model is restricted to the Surface projection.
      // h only constructs permitted Messages.
    ]),
)
```

## Agent

```ts
const Assistant = Agent.define(App, {
  context: TodoOverview,

  capabilities: {
    RequestedTodo: {
      message: Message.RequestedTodo,
      input: Schema.Struct({ title: Schema.String }),
      toMessage: ({ title }) =>
        Message.RequestedTodo({ title }),

      completion: Agent.when({
        projection: TodoByClientId,
        predicate: (todo, input) =>
          todo.title === input.title,
      }),
    },
  },
})
```

Message-based completion remains available as an alternative.

## Remote

A projection may contain Remote-owned requirement metadata:

```ts
const ProjectPage = Projection.all({
  project: Data.get(Project, projectId),
  tasks: Data.query(TasksByProject, { projectId }),
})
```

Remote can interpret it from `update`, returning the Model:

```ts
Data.refresh(model, ProjectPage)
```

Core Projection does not know what an Entity, Selection, QueryWindow, or connection is.

## Mirror

```ts
const Preferences = Mirror.keyValue({
  key: 'preferences',
  model: Projection.struct({
    theme: App.fields.theme,
    density: App.fields.density,
  }),
  restored: values =>
    Message.RestoredPreferences(values),
})
```

## AsyncData rendering helper

Potential ergonomic sugar (planned; not built):

```ts
Render.async(model.user, {
  empty: () => UserSkeleton(),
  failure: error => ErrorView(error),
  data: (user, state) =>
    UserView({ user, refreshing: state.refreshing }),
})
```

This interprets explicit Model state; it does not suspend render or start work.

## Attribute composition

```ts
h.button(
  Attribute.compose(
    componentAttributes,
    brandAttributes,
    analyticsAttributes,
  ),
  ['Save'],
)
```

Everything after the contract substrate can remain optional.

---

# 18. What should explicitly NOT be upstreamed

This RFC is as much about refusing abstractions as adopting them.

Do not upstream these merely because they look unified:

```ts
Foldkit.refresh(projection)
Foldkit.latest(projection)
Observation.make(...)
Authority.make(...)
Optimistic.make(...)
Action.make(...)
Activity.isPending(surface)
```

## No generic Observation wrapper

Use Effect / Stream / SubscriptionRef internally when current + future state must be observed safely.

Do not create a renamed second reactive system.

## No universal Authority type

`committed`, `confirmed`, and `server-derived` have package-specific meanings.

Use precise terms rather than a type that overpromises universal truth.

## No Promise-returning render computations

Do not move fetch lifecycle, cancellation, races, errors, or SSR coordination into ordinary reads/views.

Async must compose, but reads should not initiate hidden work.

## No Solid-style Action

Message -> update -> Command -> Message already gives Foldkit a stronger explicit mutation boundary.

## No generic optimistic core wrapper

The shared algebra is useful:

```text
confirmed/base + pending overlay = visible
```

but Sync, Remote, and ordinary Foldkit use meaningfully different algorithms.

Share vocabulary first. Extract implementation only after real convergence.

## No user-facing runtime activity as normal view state

Devtools may inspect running fibers. Normal application UI should remain explainable from Model.

## No full Mixins styling language

Steal attribute composition and perhaps Parts, not an entire CSS-in-TypeScript platform.

## No Sync or Durable runtime in Foldkit core

They should remain packages built from Foldkit concepts.

---

# 19. Staged implementation plan

## Phase 1: extract the reusable substrate

Implement only:

```text
optional pure Application descriptor
read-only Model field references / Projection
typed Message subsets
Surface
small open interpreter-metadata seam
```

No network behavior.

No persistence.

No agents.

No sync.

Acceptance criterion:

> These abstractions can describe an existing Foldkit application without changing how it executes.

The Projection metadata prototype should prove:

1. interpreter-owned branded metadata survives composition;
2. one interpreter can retrieve only its own declarations;
3. new interpreters do not require editing a closed core union;
4. type inference remains acceptable;
5. application ownership remains checked.

## Phase 2: teach tooling about declarations

Start with:

```text
Surface
  name
  Model dependencies
  permitted Message tags
  interpreter metadata summaries
```

Expose the same information through DevTools/MCP where useful.

This validates the substrate before several product features depend on it.

## Phase 3: production Agent contracts

Build official Agent around:

```text
Projection
Message subset
Runtime host binding
```

Support both:

```text
Message completion
State completion
```

State completion must be race-safe, with one runtime-owned deadline over dispatch and wait.

Start with one transport; keep the protocol-neutral contract primary.

## Phase 4: Remote Projection refresh experiment

Before upstreaming Remote, validate the metadata seam with a real interpreter:

```ts
Data.refresh(model, ProjectPage)
```

Questions:

- can requirements be extracted from arbitrary composed Projection trees?
- how do live requirements interact with refresh?
- where do deduplication/staleness semantics live?
- can Surface remain ignorant of Remote internals?

## Phase 5: Mirror

Implement URL/query and KeyValueStore Mirror as compilers into existing Foldkit effects.

Keep the ownership distinctions explicit:

```text
Route vs URL Mirror
Flags vs KV Mirror
Mirror vs durable persistence
```

## Phase 6: AsyncData view ergonomics

Only if repeated view code justifies it, add a small view interpreter over existing `AsyncData`.

Do not add suspension or Promise reads.

## Phase 7: attribute composition and Parts

Add semantic `Attribute.compose` first.

Let usage determine whether named Parts deserve first-class support.

## Phase 8: keep incubating Remote / Sync / Durable

Use the official substrate to simplify experimental packages.

If production adoption warrants it, evaluate official packages independently.

They should not require a new parallel core runtime.

---

# 20. Suggested experiments before committing APIs

## Experiment A: Surface-ify a real page

Take a page that reads root state plus multiple Submodels.

Define:

```text
Projection
Message subset
Surface
```

Measure:

- boilerplate;
- readability;
- compiler errors caught by restricted Message capability;
- usefulness of dependency metadata in DevTools.

If Surface feels heavier than the value it creates, stop.

## Experiment B: open Projection metadata

Create two independent fake interpreters:

```text
Remote-like requirement
FeatureFlag-like requirement
```

Compose their Projections together.

Verify:

- metadata survives composition;
- neither interpreter imports the other;
- Surface core does not know either domain;
- inference remains understandable;
- tooling can inspect generic metadata safely.

This is the most important substrate experiment added by the async proposal.

## Experiment C: production-safe Todo Agent

Expose only:

```text
read
  visible todos
  filter

capabilities
  add todo
  toggle todo
  clear completed
```

Add one event-completion capability and one state-completion capability.

Test:

- Projection;
- Message subsets;
- runtime state observation;
- race-free completion;
- authorization;
- MCP/WebMCP adapter shape;
- difference from DevTools MCP.

## Experiment D: Remote consumer refresh

Build one page whose Projection composes several entity/query requirements.

Compare:

```text
before
    refresh manually restates each request

after
    Data.refresh(model, PageProjection)
```

Measure whether the API genuinely removes duplicated semantics rather than merely hiding them.

## Experiment E: Agent + Sync confirmation

Expose a durable edit to an Agent.

Compare completion against:

```text
visible optimistic state
vs
committed Sync state
```

Verify the API can express the distinction without Agent understanding Sync protocol internals.

## Experiment F: Query Mirror

Keep the existing Route-owned query example and build a Model-owned + URL Mirror version.

Compare:

- lines of application code;
- Messages/Commands;
- browser navigation semantics;
- SSR behavior;
- clarity of ownership.

---

# 21. How this changes the Foldkit story

Foldkit's current story can be summarized as:

> **State changes and effects are explicit.**

The useful lesson from Plus is:

> **State changes, effects, application boundaries, and external requirements can all be explicit descriptions.**

That gives a hierarchy:

```text
Model
    what semantic state exists

Message
    what happened / may happen

update
    how semantic state transitions

AsyncData
    explicit readiness / stale / failure state

Command / Subscription / Mount / ManagedResource
    what external work exists and how long it lives

Submodel
    who owns a state machine

Projection
    what existing state is observed
    + opaque interpreter declarations

Message subset
    which existing transitions are relevant

Surface
    what a consumer may observe and cause

Agent
    how a restricted external actor interprets those declarations

Mirror
    where some Model state is represented externally

Remote
    how server-owned facts satisfy declared requirements

Sync
    how durable Messages become a replicated optimistic view

Parts
    where a view permits controlled structural decoration
```

Each concept answers a different architectural question.

That coherence is the standard to hold every new abstraction to.

---

# 22. Priority recommendation

If only a small amount of `foldkit-plus` is ever incorporated, prioritize:

| Priority | Idea | Recommendation |
| --- | --- | --- |
| 1 | Typed Message subsets | Upstream |
| 2 | Read-only Model Projection / field refs | Upstream |
| 3 | Surface as observation + capability boundary | Upstream, optional |
| 4 | Pure Application descriptor | Strongly consider as substrate |
| 5 | Open interpreter metadata on Projection | Prototype as part of substrate |
| 6 | Architecture manifest / DevTools inspection | Official tooling |
| 7 | Production Agent contract | Official optional package |
| 8 | State-based Agent completion | Add with Agent if prototype succeeds |
| 9 | Mirror | Official optional package/pattern |
| 10 | Semantic attribute composition | Core HTML utility candidate |
| 11 | Named view Parts | Experiment |
| 12 | Remote Projection refresh | Validate in experimental Remote |
| 13 | Remote runtime | Keep incubating |
| 14 | Sync | Keep incubating |
| 15 | Durable | Keep outside frontend core |
| 16 | Full Mixins styling system | Do not upstream |

The first six form one coherent substrate/tooling project rather than unrelated features.

---

# 23. The main architectural risk

The largest risk is not implementation complexity.

It is **making architecture more explicit than users actually need**.

Foldkit gets power from the fact that a view can simply be:

```ts
(model, h) => ...
```

and update can simply be:

```ts
(model, message) => ...
```

If every feature starts requiring:

```ts
Projection.define(...)
MessageSet.define(...)
Surface.define(...)
metadata(...)
Architecture.add(...)
```

Foldkit becomes less elegant.

The rule should remain:

> **Plain functions first. Contracts only when something needs to inspect, restrict, plan from, or reuse the boundary.**

Surfaces become worthwhile when:

- an agent needs least-privilege context;
- DevTools should understand dependencies/capabilities;
- Remote needs declarative requirements;
- Sync needs a defined slice;
- a view benefits from compile-time Message restriction;
- architecture tooling needs a static boundary;
- a third-party interpreter needs to participate without inventing a parallel DSL.

Otherwise, a plain function is better.

A second risk is **false unification**.

The diagrams for Remote and Sync may both contain `confirmed + pending = visible`, but that does not mean they should share one implementation.

The right goal is:

> **coherent composition, not homogeneous composition.**

Use each layer's natural algebra:

```text
Effect
    pipe / provide / retry / timeout / race

Projection
    map / struct / all / select / compose

MessageSet
    union

Surface
    observation + capability

Remote requirements
    interpreter-owned merge/planning

Sync fragments
    replication-specific composition

Layer
    service composition
```

A design is composable when its output becomes a lawful input to the next layer, not when every layer shares the same method names.

---

# 24. Complete descriptions as a north star

A useful lens from work on complete descriptions is that a good abstraction is not merely about hiding detail.

It should preserve every distinction that can affect behavior at the chosen level while discarding distinctions that cannot.

This helps explain why Foldkit and Effect work well.

In Foldkit:

```text
Model + Message + update
```

can form a complete description of application state transitions when `update` is pure. External nondeterminism is pushed into effects and re-enters as Messages, so the transition system remains inspectable and replayable.

Effect and Schema similarly turn otherwise opaque behavior/data into descriptions that support many interpreters.

That suggests a stronger principle:

> **Prefer complete descriptions that support several useful interpretations over several partial implementations of the same semantics.**

The proposed substrate follows that rule:

```text
Application
    root machine identity

Projection
    observable distinctions + declarative interpreter requirements

MessageSet
    available input vocabulary

Surface
    consumer-level observation/capability boundary
```

## Surface as a behavioral boundary

Suppose a Surface exposes:

```text
todos
```

and allows:

```text
ToggledTodo
```

but the effect of `ToggledTodo` secretly depends on:

```text
session.canEdit
```

Then the Surface is not behaviorally complete. Two root Models may look identical through the Surface but respond differently to the same allowed Message.

A useful law is:

```text
P(m1) = P(m2)

should imply

P(update(m1, msg)) = P(update(m2, msg))
```

for Messages relevant to a behaviorally closed Surface.

Not every Surface must satisfy that law. It suggests two useful notions:

```text
Capability Surface
    what a consumer may observe and attempt

Closed Surface
    state + Message vocabulary forms a self-contained
    behavioral abstraction
```

Stories/property tests could eventually detect hidden dependencies for the second case.

## Test every new abstraction this way

Before adding a concept, ask:

1. What level of the program does this describe?
2. Which distinctions actually matter at that level?
3. Is the description complete enough to reason about that level without reopening hidden implementation details?
4. Can multiple useful interpreters be derived from the description?

This explains why Surface, Agent contracts, Mirror, replayable Message subsets, and interpreter requirements are compelling: they describe meaningful program relationships.

The goal is not more abstraction machinery.

It is **better abstractions through more complete descriptions**.

---

# 25. Final recommendation

`foldkit-plus` should not be understood as a bag of missing batteries Foldkit needs to absorb.

It is better understood as an architectural stress test.

It asks:

```text
If Foldkit really has one state machine,
can agents use it without another business-logic API?

Can server data fit without another hidden store?

Can offline replay use the same reducer?

Can the URL represent state without owning it?

Can async state remain explicit without moving I/O into reads?

Can external requirements compose with ordinary observation?

Can third-party interpreters join the application graph
without inventing parallel Projection/Surface DSLs?

Can tooling inspect all of those relationships?
```

For the most part, the answer is yes.

That is evidence that Foldkit's existing foundation is strong.

The main thing Plus repeatedly needs is a way to turn implicit relationships into explicit, typed, inspectable descriptions:

```text
Application values
    -> Application identity

Model field references
    -> Projection

interpreter declarations
    -> Projection metadata

Message constructors
    -> Message subset

Projection + Message subset
    -> Surface

Surface + policy
    -> Agent

Projection + representation
    -> Mirror

Projection + Remote requirements
    -> Remote planning / refresh

Message subset + replay rules
    -> Sync

all declarations
    -> architecture tooling
```

The result should not be:

> Foldkit now includes Foldkit Plus.

It should be:

> **Foldkit gains a tiny contract vocabulary that lets the rest of its architecture extend outward without losing the one-Model, one-Message-flow, one-update-function property that makes Foldkit valuable.**

The newer async work adds one more constraint:

> **Effect remains the async-control substrate, while semantic readiness and user-visible pending state remain explicit application state.**

In short:

```text
Steal the substrate.

Let Projection carry typed open interpreter metadata.

Officialize Agents and Mirror when their contracts stabilize.

Add state-based Agent completion where semantic postconditions beat event coupling.

Let Remote interpret requirements and refresh its own Projections.

Keep Sync and Durable specialized.

Reuse Effect instead of inventing a parallel async framework.

Steal small useful pieces of Mixins.

Make Foldkit's boundaries as inspectable as its transitions.
```

The strongest version of the idea is:

> **Declare application semantics once. Interpret them everywhere.**

That would make Foldkit more capable without making it feel like a different framework.
