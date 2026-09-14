# RFC: What Foldkit Might Want to Steal from `foldkit-plus`

**Status:** Proposal / design exploration
**Scope:** Foldkit architecture, tooling, official extensions, and ecosystem boundaries
**Thesis:** Upstream the vocabulary that makes application boundaries explicit; do not upstream every subsystem built with that vocabulary.

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

The Model is the single source of truth. Every state transition flows through `update`. Commands, Subscriptions, Mounts, Managed Resources, Flags, routing, Submodels, Ports, and testing all fit around that state machine without introducing hidden state. That is Foldkit's core strength.

What `foldkit-plus` discovers is that there is another class of architectural fact that Foldkit does not yet represent explicitly:

```text
What does this consumer observe?

What may this consumer cause?

Which external systems merely represent this state?

Which Messages belong to some external capability?

Which parts of a view may another package decorate?

Which parts of the architecture can tooling inspect without executing it?
```

The strongest idea in `foldkit-plus` is therefore not Remote, Sync, Mirror, Agents, or Mixins individually.

It is:

> **Application boundaries can be explicit data too.**

A `Surface` in Plus combines a projection of the Model with a subset of application Messages and therefore describes a consumer-facing boundary: what that consumer may observe and what it may cause. It deliberately differs from a Submodel: a Submodel owns a state machine, while a Surface describes access to state and Messages that already exist. A Surface can span multiple Submodels precisely because observation boundaries and ownership boundaries do not necessarily coincide.

That idea fits Foldkit extremely well.

The recommendation of this RFC is to selectively absorb the following concepts:

```text
                 Foldkit today
                       │
                       ▼
             Model · Message · update
                       │
              explicit effect taxonomy
                       │
                       ▼
         ┌─────────────────────────┐
         │ new static contract     │
         │ vocabulary              │
         │                         │
         │ Application descriptor  │
         │ Model Projection        │
         │ Message subset          │
         │ Surface / Boundary      │
         └────────────┬────────────┘
                      │
          ┌───────────┼────────────┬────────────┐
          ▼           ▼            ▼            ▼
      DevTools     Agents       Mirrors      View parts
      manifests   capabilities  URL/storage  composition
```

Remote, Sync, and Durable should remain incubation projects for now. They contain excellent architectural lessons, but they make significantly larger product commitments around caching, offline persistence, replication, authoritative ordering, and server infrastructure.

The goal is **not to make Foldkit larger for its own sake**.

The goal is to make the boundaries around Foldkit's existing architecture as explicit and inspectable as its state transitions already are.

---

# 1. The design constraint: Foldkit must still feel like Foldkit

Any idea borrowed from `foldkit-plus` should pass a very high bar.

The worst outcome would be turning Foldkit into a pile of optional architectural DSLs:

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
Mixin
Slot
Behavior
Capability
...
```

That would work against one of Foldkit's strongest properties: there is a relatively small vocabulary and an idiomatic place for each kind of behavior.

The right integration rule is:

> **Add a primitive only when it makes several existing or future features simpler at once.**

This produces a few constraints.

### Existing Foldkit applications must remain complete

A small Foldkit app should still need nothing beyond:

```ts
Model
Message
init
update
view
Runtime.makeApplication(...)
```

No Surface, Projection, Mirror, or architecture manifest should be required.

Plus itself recognizes this principle: if nobody needs to inspect a feature's dependencies, a normal Model-reading function is simpler than a Surface.

### New abstractions must not own hidden state

Nothing introduced here should create:

* another reducer;
* another mutable store;
* another rendering loop;
* another application lifecycle;
* another state ownership system.

A new abstraction should either describe existing architecture or compile down to existing Foldkit primitives.

### Writes should still mean Messages

This is especially important.

Plus exposes writable `ModelRef`s and writable Projections because infrastructure such as Sync needs to install checkpoints. It explicitly warns that the presence of a setter does not imply ownership and that Submodel invariants must still flow through the owning update.

Foldkit itself should be even stricter.

For ordinary application-facing APIs:

```text
reading Model state
    → Projection

changing Model state
    → Message → update
```

Writable optics/foci may exist for infrastructure, hydration, replay, or internal implementation, but they should not quietly become an alternative application mutation API.

### Higher-level features should compile into existing effect categories

Foldkit already has a clear answer for where effects belong:

* Commands for one-shot work;
* Flags for pre-init external values;
* Subscriptions for Model-dependent ongoing work;
* Mount for element-scoped imperative work;
* Managed Resources for Model-governed stateful handles.

A Mirror should therefore produce or use Commands/Subscriptions.

An Agent integration should dispatch Messages.

A Remote cache should be a Submodel.

A view Behavior should ultimately become normal attributes and Mounts.

If a Plus-derived feature requires inventing a parallel effect mechanism, the design has gone wrong.

---

# 2. The central missing abstraction: a pure application descriptor

The first thing `foldkit-plus` has to invent is:

```ts
const App = Surface.application({
  Model,
  Message,
  initial,
  update,
})
```

That is revealing.

Foldkit currently has all of these values, but they do not exist together as one pure, runtime-independent object. `Runtime.makeApplication` combines the program with runtime/rendering concerns including `view` and `container`; the normal project structure deliberately keeps that bootstrapping in `entry.ts`.

Meanwhile, the Message Schema is not fundamentally part of `Runtime.makeApplication`; today it is supplied to DevTools when schema-valid MCP dispatch is needed.

There is therefore no canonical value an architectural extension can point at and say:

> "This is the Foldkit application whose Model, Message vocabulary, and transition function I am describing."

That is probably worth fixing.

## Proposal: introduce an optional pure Application/Program value

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

Bootstrapping becomes:

```ts
const application = Runtime.makeApplication(App, {
  container: document.getElementById('root'),
})

Runtime.run(application)
```

Or, if preserving the exact current API is preferable:

```ts
const application = Runtime.makeApplication({
  program: App,
  container: document.getElementById('root'),
})
```

The exact naming is less important than the separation:

```text
Application definition
    pure
    importable in tests
    no DOM
    contains architectural identity

Runtime mounting
    environment-specific
    container
    DevTools
    ports
    hydration
    browser/server concerns
```

This would also make the already-recommended `main.ts` / `entry.ts` split more explicit rather than changing its philosophy.

## Why this helps beyond Plus

A pure application value becomes the anchor for:

* Model projections;
* Message subsets;
* Surfaces;
* Story/Scene helpers;
* architecture manifests;
* production agent contracts;
* Mirror declarations;
* HMR serialization metadata;
* SSR metadata;
* extension packages;
* eventual static analysis.

Today extensions must each receive loose tuples of:

```ts
Model
Message
init
update
```

or create their own wrapper.

A canonical application identity eliminates that repetition.

## This should remain optional

This must not become:

```ts
Application.define(...)
Application.configure(...)
Application.install(...)
Application.module(...)
```

as the only way to write Foldkit.

The individual exports should remain perfectly valid.

The descriptor is a way to bundle them when something needs an inspectable application identity.

---

# 3. Model Projection: make reads explicit without creating another state system

The most reusable Plus primitive underneath Surface is its notion of an inspectable Model projection.

Plus distinguishes:

```text
Effect Optic
    structural focus

Projection
    value + where that value came from

Surface
    Projection + allowed Messages
```

Its field references are backed by Effect Optics but add the Model Schema, dependency path, application identity, and codec.

This is useful because a normal function:

```ts
model => ({
  todos: model.todos,
  filter: model.filter,
})
```

can compute a read model, but nothing can inspect the function and reliably discover:

```text
depends on:
  todos
  filter
```

Once dependencies are data, other systems can reason about them.

## Proposal: a deliberately small `Projection`

Conceptually:

```ts
interface Projection<Root, Value> {
  readonly schema: Schema.Schema<Value>
  readonly read: (root: Root) => Value
  readonly dependencies: ReadonlyArray<ModelPath>
}
```

Generated field references could make this pleasant:

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

or:

```ts
const TodoOverview = App.project({
  todos: App.fields.todos,
  filter: App.fields.filter,
})
```

Now the same value serves both as executable code:

```ts
TodoOverview.read(model)
```

and architecture metadata:

```text
reads:
  todos
  filter
```

## Keep core Projection read-only

This is one place Foldkit should improve on the Plus abstraction.

Plus makes `Projection.pick(...)` writable because Sync and Mirror need to install state back into the Model.

That makes sense for infrastructure, but it weakens the conceptual boundary.

For Foldkit proper, prefer:

```text
Projection
    read only

Optic / Focus
    structural get/replace

Message
    semantic state transition
```

An infrastructure package may explicitly request a writable focus:

```ts
const SharedTodos = Focus.pick(App.fields.todos)
```

but a Surface, view, Agent, or normal feature should usually only receive a Projection.

This keeps a very important distinction visible:

> Knowing where data lives is not authority to mutate it.

## Do not put Remote semantics in Projection

Plus Projections also carry Remote entity requirements and query connection requirements.

That is too application-specific for Foldkit core.

Foldkit's Projection should know only:

* how to read;
* the Schema of the result;
* which Model paths it depends on.

Remote can wrap or annotate a Projection in its own package.

Sync can attach replication semantics.

Agents can treat it as context.

Mirror can observe it.

Core should not know why somebody cares about the projection.

---

# 4. Message subsets: a small primitive with disproportionate value

Plus also introduces `MessageSet`: an inspectable subset of the application's existing Message union. It carries the selected constructors, a codec, tags, and membership checking. The subset itself says nothing about whether those Messages are agent-visible, durable, or anything else; higher-level interpreters attach those meanings.

This is an excellent abstraction.

Foldkit's Message union is already one of the central architectural values in every app.

It should be possible to say:

```ts
const EditingMessages = Message.subset([
  Message.ChangedTitle,
  Message.DeletedTodo,
])
```

or:

```ts
const EditingMessages = Message.only(
  Message.ChangedTitle,
  Message.DeletedTodo,
)
```

and get:

```text
Schema
constructors
tags
includes(message)
```

The important thing is that this is just a subset.

It does not create:

```text
DurableMessage
AgentMessage
RemoteMessage
SyncMessage
```

as separate parallel concepts.

Instead:

```text
Message subset
      │
      ├── Agent interprets it as callable
      ├── Sync interprets it as durable
      ├── Surface interprets it as allowed
      └── tooling interprets it as architecture
```

That is exactly the sort of primitive Foldkit should own.

---

# 5. Surface: the idea most worth upstreaming

With Projection and Message subsets available, Surface becomes almost trivial:

```text
Surface =
    named Projection
  + allowed Message subset
  + optional parameters
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

That is exactly why this concept belongs close to Foldkit's core.

## Surface fills a gap between views and Submodels

A Foldkit Submodel answers:

> Who owns this state machine?

It has its own Model, Message type, update, view, Commands, and parent/child wrapping.

A Surface answers:

> What existing application state does this consumer need, and which existing root Messages may it cause?

Plus's strongest example is a screen that needs:

```text
route
settings.theme
session.user
```

even though those values belong to different owners. Making the screen another Submodel solely to aggregate those reads would be the wrong decomposition. Surface lets observation cut across ownership boundaries without changing ownership.

That distinction is useful independently of every other Plus package.

## Views can optionally become capability-restricted

A particularly interesting consequence is that Surface can narrow the `HtmlBuilder` Message type.

Today:

```ts
view(
  model: Model,
  h: HtmlBuilder<Message>,
)
```

means the view can construct any application Message.

A Surface-backed view could become:

```ts
Surface.view(TodoList, (model, h) => {
  // model is only TodoList's projection
  // h can only emit TodoList.Messages
})
```

That gives the compiler another useful architectural invariant:

```text
this view cannot accidentally dispatch
Message.DeletedAccount
because that constructor is not in its boundary
```

This should be optional.

A plain Foldkit view remains a plain function.

## Naming is open

`Surface` is reasonably good because it conveys a public-facing facet of the application.

Other possibilities include:

```text
Boundary
Capability
Interface
Feature
ViewModel
Contract
```

Most are worse:

* `Capability` describes only the Message side;
* `ViewModel` makes it sound UI-specific;
* `Feature` implies ownership;
* `Contract` is too broad.

`Surface` is probably worth keeping unless it collides with existing terminology.

---

# 6. Architecture as data: Foldkit DevTools should show structure as well as history

Once Foldkit has these static contracts, `foldkit-plus`'s `Module` becomes possible.

Plus can collect contracts and produce:

* validation findings;
* a manifest;
* Markdown;
* Mermaid;
* ownership/observation relationships.

It can detect problems such as two replication contracts claiming overlapping Model paths or a contract referring to the wrong application.

I would steal the capability but probably **not** the `Module` abstraction itself.

Foldkit already has enough meanings attached to "module."

Instead, make architecture metadata something tooling collects.

For example:

```ts
const architecture = Architecture.define(App, [
  TodoList,
  PreferencesMirror,
  AssistantAgent,
])
```

or even allow declarations to register themselves into an exported collection.

The exact API can remain experimental.

## The important product is the tooling

Foldkit DevTools currently excels at dynamic history:

```text
Message N
    ↓
Model before
Model after
Commands
Mounts
Submodel chain
```

and the MCP tooling exposes current/historical Models, Message history, diffs, replay, and Schema-validated dispatch.

Static contracts allow a second DevTools mode:

```text
Architecture

TodoList
  reads
    todos
    filter

  can emit
    ToggledTodo
    DeletedTodo

Preferences
  mirrors
    theme
    sidebar.collapsed

Assistant
  reads
    todos
    filter

  may invoke
    RequestedTodo
    ToggledTodo

RemoteData
  owns
    remote

Sync
  replicates
    documents
```

This would be unusually aligned with Foldkit's product.

Most frameworks' DevTools answer:

> What is happening?

Foldkit could additionally answer:

> What is allowed to happen, and where?

That is a meaningful differentiation.

## Architecture manifests are especially useful for AI work

Foldkit already markets the fact that its architecture is legible to both humans and AI.

Generated architecture metadata compounds that advantage.

An agent could ask:

```text
Which feature owns this transition?

Which screen can emit this Message?

Which Model paths does this page observe?

Which Messages are production-agent callable?

What state is represented in the URL?

Which state is replicated?
```

without first reconstructing all of those relationships from arbitrary TypeScript.

A committed manifest could also make capability changes reviewable:

```diff
 agent Assistant:
   messages:
     - ToggledTodo
+    - DeletedTodo
```

That is a security-relevant change surfaced as a normal code review diff.

---

# 7. Production agent capabilities should become an official Foldkit package

`foldkit-agent` may be the most immediately valuable higher-level idea in Plus.

Foldkit already has DevTools MCP, but these solve different problems.

Current DevTools MCP intentionally gives a development agent broad debugging capabilities. It can inspect current and historical Model state, inspect history and diffs, replay the Runtime, discover the Message Schema, and dispatch arbitrary schema-valid Messages when configured. The relay is development tooling rather than a production application capability boundary.

A production agent API needs almost the opposite posture:

```text
DevTools MCP

trusted developer/tool
broad visibility
debugging
time travel
arbitrary Message dispatch
development environment


Production Agent Contract

untrusted/restricted consumer
least-privilege visibility
specific capabilities
authorization
stable external schemas
production environment
```

Plus gets this distinction right.

## The core agent rule should be adopted nearly verbatim

> An agent capability is an application Message, not a second implementation of the feature.

Plus exposes a selected Model projection as context and selected existing Messages as capabilities. Protocol adapters merely translate.

That is extremely compatible with Foldkit.

A conventional tool integration tends to become:

```ts
tool('deleteTodo', async ({ id }) => {
  // validate
  // authorize
  // locate todo
  // modify data
  // persist
  // notify UI
})
```

while the UI already has:

```ts
Message.DeletedTodo({ id })
```

and `update` already contains the behavior.

That duplicates the application.

Foldkit can instead say:

```ts
const Assistant = Agent.define(App, {
  context: TodoOverview,

  capabilities: {
    RequestedTodo: {
      message: Message.RequestedTodo,
      description: 'Create a todo',
    },

    ToggledTodo: {
      message: Message.ToggledTodo,
      description: 'Toggle a todo',
    },
  },
})
```

Then humans and agents converge here:

```text
human UI ──────┐
               │
agent ─────────┼──> Message ──> update ──> Model / Commands
               │
other host ────┘
```

That is arguably the cleanest possible production agent architecture for Foldkit.

## Keep protocol input separate from internal Message shape

Plus also correctly recognizes that an external tool input need not equal the internal Message payload.

Suppose the application has:

```text
RequestedTodo { title }

    ↓ Command

SubmittedTodo {
  id
  title
  createdAt
}
```

The agent should expose `RequestedTodo`, not allow an external caller to fabricate `SubmittedTodo`.

An official package should support:

```ts
RequestedTodo: {
  input: Schema.Struct({
    title: Schema.String,
  }),

  toMessage: ({ title }) =>
    Message.RequestedTodo({ title }),
}
```

This preserves Foldkit's existing treatment of nondeterminism: IDs, clocks, randomness, external facts, etc. still enter through Commands and result Messages.

## Steal completion contracts

This is one of the best ideas in the entire repository.

Dispatching a Message does not necessarily mean an operation is finished.

```text
agent dispatches RequestedTodo
              ↓
           update
              ↓
      GenerateTodo Command
              ↓
       SubmittedTodo
```

The meaningful completion event is `SubmittedTodo`, not the successful insertion of `RequestedTodo` into the runtime queue.

Plus allows:

```ts
completion: {
  success: Message.SubmittedTodo,
  failure: Message.FailedTodo,
  correlate: (request, result) => ...,
}
```

and notes that correlation matters when several requests are in flight.

This is excellent.

Foldkit has a uniquely good foundation for agent completion because the application already emits explicit facts.

Most tool systems have to invent promises or bespoke workflow IDs.

Foldkit can say:

> The operation completed when the application itself observed the fact that means it completed.

That should become an official pattern.

## Availability and authorization should remain different concepts

Plus distinguishes:

```text
available(model)
    does this action exist right now?

authorize(principal, input, model)
    may this caller perform it?
```

and evaluates availability before authorization.

That separation is worth preserving.

It handles state-dependent capabilities naturally:

```text
no completed todos
    clear_completed does not exist

completed todos exist
    clear_completed exists

caller lacks permission
    exists but forbidden
```

## Adapters should be thin packages

A protocol-neutral contract should then compile to:

```text
WebMCP
MCP
A2A
future protocols
in-app copilots
```

without business logic appearing in those adapters.

Package shape could eventually be:

```text
@foldkit/agent
@foldkit/agent-mcp
@foldkit/agent-webmcp
```

rather than pulling every protocol into Foldkit core.

## DevTools and Agent can share infrastructure without sharing authority

There may be useful internal infrastructure to share:

```text
read current Model
dispatch Message
observe applied Messages
subscribe to Model changes
```

But the authority models should stay distinct.

DevTools means:

```text
developer debugging power
```

Agent means:

```text
application-defined production capability
```

They should not be configured through the same switch.

---

# 8. Mirror should probably become an official Foldkit pattern/package

Mirror is another Plus idea that fits Foldkit unusually well.

Its rule is:

> The URL or local persistence may represent Model state, but does not become another owner of that state.

Plus describes a mirror as a secondary representation of a Model slice, usually in the URL or a key-value store.

Conceptually:

```text
             URL
              ▲
              │ representation
              │
Messages → update → Model
              │
              │ representation
              ▼
         KeyValueStore
```

rather than:

```text
 URL state ──────┐
                 │
 Model state ────┼──> somehow reconciled
                 │
 storage state ──┘
```

That is very Foldkit-like.

## Mirror is mostly a reusable composition of existing primitives

Mirror should not require a new runtime subsystem.

URL mirroring can be implemented from:

* Model Projection;
* navigation Commands;
* URL Subscriptions;
* Schema codecs;
* existing URL/Route support.

Key-value mirroring can be implemented from:

* Model Projection;
* a restore Command;
* a persistence Subscription or Command;
* `KeyValueStore`.

That makes Mirror an excellent candidate for an official higher-level package because it standardizes a common pattern without changing Foldkit's execution model.

## Mirror is not Route

This distinction should be explicit.

Foldkit's typed Route system answers:

> What location is the application currently at?

The current Query Sync example models search, sorting, diet, and period as fields of the `Browse` route. UI interactions issue `ReplaceFilters`, the browser URL changes, and `ChangedUrl` parses the URL into the next route. In that design, those values really are part of route identity.

Mirror answers a different question:

> Which ordinary application state should happen to be represented in the URL?

Consider:

```ts
Model = {
  document: ...,
  sidebarTab: 'layers',
  zoom: 1.5,
}
```

If `sidebarTab` and `zoom` should be linkable:

```text
?tab=layers&zoom=1.5
```

it may be undesirable to restructure the application's domain model around Route solely for that representation.

Mirror allows:

```text
Model.zoom
   ↕
?zoom=1.5
```

while the Model remains the semantic owner.

### Guideline

Use Route when the value defines location.

Use Mirror when the value is ordinary Model state that should be encoded into the location.

Those can coexist, but Foldkit should provide one underlying query-string codec/ownership mechanism so Route and Mirror cannot accidentally fight over a key.

## Mirror is not Flags

Foldkit Flags are the right answer when external data is needed **before the first Model can be constructed**.

The Todo example, for example, loads persisted todos into Flags and initializes the first Model with them.

Mirror restoration implies:

```text
construct default Model
        ↓
start application
        ↓
load persisted representation
        ↓
Message
        ↓
update Model
```

That is better for:

```text
theme
collapsed panel
draft text
table density
last selected tab
```

where default-first rendering is acceptable.

So the documentation should establish:

```text
required before init
    → Flags

one-shot effect caused by a transition
    → Command

ongoing external source with Model-dependent lifetime
    → Subscription

disposable Model state represented externally
    → Mirror
```

## Mirror is not durable persistence

Plus explicitly limits Mirror to disposable/per-device state and describes it as last-write-wins without an ordered log.

That boundary is important.

The existing Todo example writes the todo collection after every domain mutation through explicit `SaveTodos` Commands.

Those todos are arguably domain data.

I would not automatically rewrite that example as:

```ts
Mirror.localStorage(App.fields.todos)
```

because doing so would teach that persistence correctness is merely representational.

A better teaching example is:

```text
todos
    explicit persistence / server / durable system

filter
    URL Mirror

draft
    KeyValueStore Mirror

theme
    KeyValueStore Mirror
```

## Improve the Plus API by keeping writes semantic

Plus can structurally write mirrored fields through writable Projections.

For Foldkit, I would bias the public API toward generating or consuming application Messages.

For example, conceptually:

```ts
const Preferences = Mirror.keyValue({
  key: 'preferences',

  read: Projection.struct({
    theme: App.fields.theme,
    density: App.fields.density,
  }),

  restored: values =>
    Message.RestoredPreferences(values),
})
```

The external representation is decoded, then a normal Message re-enters the state machine.

This is especially important when the mirrored state belongs to a Submodel.

Mirror should not silently bypass:

```text
Submodel Message
    ↓
Submodel update
```

just because it knows an optic to the child Model.

## Mirror should compile to normal Foldkit values

Ideally the implementation feels approximately like:

```ts
subscriptions: model => [
  Preferences.persist(model),
  UrlState.persist(model),
]
```

and:

```ts
init / update
    → Preferences.restore(...)
```

rather than requiring `Runtime.installMirror(...)`.

The more Mirror can be explained entirely in terms of existing Foldkit primitives, the better it fits.

---

# 9. From Mixins, steal attribute composition and named Parts—not the whole system

`foldkit-mixins` addresses a real problem but is the easiest Plus subsystem to over-import.

Foldkit UI currently follows a headless model: a component supplies behavior/ARIA/event attributes through `toView`, and the caller supplies the markup and styling.

That means:

```text
@foldkit/ui

component owns behavior
caller owns markup
```

Mixins solve the inverse problem:

```text
reusable application/design-system view

view owns markup
caller may decorate named locations
```

Plus calls those locations Slots and allows external Style/Behavior declarations to attach to them.

Both composition modes are legitimate.

They should not replace one another.

## Preserve `toView`

For low-level headless primitives, Foldkit's existing model is stronger.

If Button gives the caller its attribute bundle:

```ts
Button.view({
  toView: attributes =>
    h.button(
      [
        ...attributes.button,
        h.Class('primary'),
      ],
      ['Save'],
    ),
})
```

the caller controls:

* element type;
* structure;
* children;
* surrounding markup;
* styling.

A slot system is necessarily less powerful because the component author retains markup ownership.

So `@foldkit/ui` should remain headless and caller-owned.

## The valuable missing primitive is safe attribute composition

Mixins reveals a deeper problem.

Foldkit attributes are not all composable with the same semantics.

Conceptually:

```text
Class
    concatenate/dedupe

Style
    merge declarations

OnMount
    compose Mounts

aria-label
    maybe one owner

OnClick
    conflicting independent owners may be a bug

key
    structural; probably protected

innerHTML
    structural/dangerous; probably protected
```

Today callers can concatenate arrays, but there is no general semantic operation saying:

```ts
Attribute.compose(
  componentAttributes,
  accessibilityAttributes,
  analyticsAttributes,
  productAttributes,
)
```

with conflict handling.

This could be useful throughout Foldkit independently of Mixins.

It would also make attribute bundles from `@foldkit/ui` safer to combine.

## Add lightweight named Parts later

Above that primitive, Foldkit could introduce an optional convention such as:

```ts
const CardParts = Parts.define({
  root: Part.attributes(),
  title: Part.attributes(),
  action: Part.attributes(),
})
```

The view retains markup:

```ts
const Card = (model, parts, h) =>
  h.article(parts.root([...]), [
    h.h2(parts.title([]), [model.title]),

    h.button(
      parts.action([
        h.OnClick(Message.ClickedAction()),
      ]),
      ['Continue'],
    ),
  ])
```

External code can then decorate:

```ts
Card.withParts({
  root: [h.Class('product-card')],
  action: [analyticsBehavior],
})
```

or whatever eventual API fits Foldkit.

The important conceptual boundary is:

```text
toView
    consumer owns markup

Parts
    view owns markup but publishes controlled extension points
```

## Do not adopt the complete Mixins styling language

Plus grows this into:

* capabilities;
* event metadata;
* attribute metadata;
* protected properties;
* CSS classes;
* inline styles;
* recipes;
* variants;
* pseudo-selectors;
* media queries;
* container queries;
* keyframes;
* globals;
* themes;
* CSS extraction.

That is effectively a CSS-in-TypeScript system.

Foldkit does not need to own styling semantics to preserve architectural correctness.

The high-value ideas are:

```text
Attribute.compose
named Parts
stateless reusable Behaviors
```

not an entire design-system language.

## Behavior can remain very small

Plus's Behavior is useful because it owns no Model state. It contributes ordinary attributes, event handling, and optionally Mount behavior.

Foldkit could model this as little more than:

```ts
type Behavior<Input, Message> =
  (
    input: Input,
    h: HtmlBuilder<Message>,
  ) => ReadonlyArray<Attribute<Message>>
```

If it needs actual application state, it probably wants a Submodel.

That is a good invariant.

---

# 10. What to learn from Remote without upstreaming Remote yet

`foldkit-remote` is a normalized cache of server-owned data stored inside the Foldkit Model. It distinguishes missing/stale/not-found/null data, shares entities by identity, supports query connections, optimistic mutation layers, and live updates. Critically, it does not put a hidden cache beside the application: the cache itself is a Submodel, and remote results enter as Messages.

That is architecturally compelling.

But it is a large product.

Adopting it means Foldkit starts making opinions about:

* entity normalization;
* entity identity;
* field-level presence;
* stale data;
* query connection representation;
* optimistic layering;
* mutation IDs;
* cursors;
* live updates;
* server adapters.

Those are closer to Relay/Apollo/TanStack Query territory than to core application architecture.

## The ideas worth carrying into Foldkit

### Server caches belong inside the Model

This is worth documenting as a preferred Foldkit pattern.

If server-derived data affects rendering, its status should be inspectable as Foldkit state:

```text
Model.remote
```

rather than living in an invisible external hook/cache.

That preserves:

* DevTools;
* replay;
* Story testing;
* deterministic rendering;
* one state model.

### Fetch requirements can be declarative without fetching from view

A feature can describe:

```text
I require:
  Project.id
  Project.name
  Project.members.name
```

without the rendering function performing I/O.

Then a Subscription/planner can compare:

```text
requirements
-
already-known facts
=
work to fetch
```

This is a strong pattern.

It may eventually justify an official Remote package.

### Missing and null should not be conflated

Remote's explicit field-presence modeling is a useful lesson for the existing API-cache patterns.

```text
field not requested
field requested but missing
field = null
entity not found
field stale
```

are semantically different states.

Foldkit examples and future helpers should preserve those distinctions.

## What core should not do

Do not put:

```ts
projection.remoteRequirements
projection.connections
```

into the generic Projection primitive.

That makes a general observation abstraction know about one future caching implementation.

Remote should attach its own metadata around a generic Projection.

---

# 11. What to learn from Sync without upstreaming Sync yet

`foldkit-sync` takes an unusually Foldkit-native approach to local-first replication:

> Durable operations are existing application Messages, and replay uses the application's existing `update`.

A client applies an edit immediately, persists it to an outbox, submits it when possible, accepts the server's authoritative ordering, and rebases remaining pending edits by replaying them. It does not maintain a separate sync-specific reducer.

This is one of the strongest conceptual results in Plus.

The formula is:

```text
normal transition reducer
        =
optimistic reducer
        =
replay reducer
        =
rebase reducer
```

All are `update`.

That is exactly the kind of leverage Foldkit's architecture should enable.

## Messages are natural operation records

If a Message is:

* serializable;
* deterministic;
* state-only for the replicated slice;
* replayable later;

then it already looks very much like an operation log entry.

There is no reason to invent:

```text
TodoOperation
```

beside:

```text
Message.CreatedTodo
Message.RenamedTodo
```

if those Messages already contain the facts necessary for deterministic replay.

This is a major insight worth documenting.

## Intent/fact separation becomes more valuable

Consider:

```text
RequestedTodo
    ↓
Command generates id/time
    ↓
SubmittedTodo { id, timestamp, title }
```

`RequestedTodo` is not necessarily replay-safe.

`SubmittedTodo` is.

This gives Foldkit another reason to encourage meaningful distinctions between:

```text
request/intention Messages
```

and:

```text
fully materialized fact Messages
```

without creating a new Message taxonomy in the type system.

## A generic replay verifier may eventually belong in Foldkit

Rather than adopting Sync itself, Foldkit could eventually offer development/testing tools capable of asserting that a Message subset is replay-safe.

For example:

```ts
Replay.verify({
  application: App,
  messages: DurableMessages,
  projection: SharedTodos,
})
```

could detect cases where replay:

* touches Model paths outside the declared projection;
* emits forbidden Commands;
* depends on external nondeterminism;
* produces an invalid Model.

That capability would be useful beyond synchronization:

* event sourcing;
* deterministic tests;
* migrations;
* recorded workflows;
* agent audit/replay experiments.

But this should be driven by actual Sync usage rather than added speculatively.

---

# 12. Durable is valuable, but it is a backend product

`foldkit-durable` implements an authoritative ordered server journal with idempotent append, snapshots, cursors, compaction, live change streams, and a durable effect ledger.

It is a coherent server counterpart to Sync.

It is not obviously part of the Foldkit frontend framework.

Its most valuable lesson for Foldkit itself is conceptual:

```text
client optimistic state
    does not define truth

server operation order
    defines convergence

external effects
    need a different durability model
    from state replay
```

Those are good design constraints for an eventual official replication story.

But Foldkit core should not become responsible for:

* SQLite operation journals;
* server sequence assignment;
* durable effect recovery;
* compaction policies;
* retry workers.

If local-first becomes a major Foldkit use case, Sync/Durable could eventually become official `@foldkit/*` packages.

They should earn that status through production experience first.

---

# 13. One principle from Plus should become part of Foldkit's vocabulary: ownership vs observation

A useful thread running through the entire project is:

> **Observation is not ownership. Representation is not ownership. Capability is not ownership.**

Examples:

```text
Surface observes a Submodel field
    ≠ Surface owns that field

URL represents filter
    ≠ URL owns filter

Agent may send DeletedTodo
    ≠ Agent owns deletion semantics

Remote cache lives in Model
    = Remote Submodel owns its cache transitions

Sync replicates todos
    ≠ replica invents a second todo reducer

Style decorates a view
    ≠ Style owns application state
```

This distinction would strengthen Foldkit's existing documentation.

Foldkit already has a strong single-source-of-truth story.

Plus extends that story into a useful rule:

> Every datum should have one semantic owner, even when several systems observe, represent, replicate, or expose it.

That is a good lens for reviewing Foldkit APIs generally.

---

# 14. Proposed Foldkit architecture after these changes

The end state should not look like Foldkit Plus.

It should remain smaller.

Conceptually:

```text
┌─────────────────────────────────────────────┐
│              Foldkit application            │
│                                             │
│ Model · Message · init · update · view      │
│                                             │
│ Command · Subscription · Mount              │
│ ManagedResource · Flags                     │
│                                             │
│ Route · Submodel · Port                     │
└─────────────────────┬───────────────────────┘
                      │
                      │ optional static description
                      ▼
┌─────────────────────────────────────────────┐
│        application contract vocabulary      │
│                                             │
│ Projection                                  │
│ Message subset                              │
│ Surface                                     │
└──────────────┬──────────────┬───────────────┘
               │              │
       ┌───────┴──────┐       │
       ▼              ▼       ▼
 architecture       Agent    Mirror
 tooling/contracts
       │
       ▼
 DevTools / MCP
```

Separately:

```text
HTML attributes
      │
      ▼
Attribute.compose
      │
      ▼
optional named Parts
```

And incubating outside the conceptual core:

```text
Remote
Sync
Durable
full Mixins styling
```

This is substantially smaller than adopting the Plus package graph.

---

# 15. Concrete candidate API

The following is illustrative, not a recommendation on final naming.

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

Runtime:

```ts
const application = Runtime.makeApplication(App, {
  container: document.getElementById('root'),
})

Runtime.run(application)
```

## Projection

```ts
const TodoOverview = Projection.struct({
  todos: App.fields.todos,
  filter: App.fields.filter,
})
```

Type:

```ts
Projection<
  Model,
  {
    readonly todos: ReadonlyArray<Todo>
    readonly filter: Filter
  }
>
```

Inspectable:

```ts
Projection.dependencies(TodoOverview)
// ['todos', 'filter']
```

## Message subset

```ts
const TodoActions = Message.only(
  Message.RequestedTodo,
  Message.ToggledTodo,
  Message.DeletedTodo,
)
```

Inspectable:

```ts
TodoActions.tags
TodoActions.schema
TodoActions.includes(message)
```

## Surface

```ts
const TodoList = Surface.define(App, 'TodoList', {
  model: TodoOverview,
  messages: TodoActions,
})
```

or syntactic sugar:

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

Restricted view:

```ts
export const todoListView = Surface.view(
  TodoList,
  (model, h) =>
    h.div([], [
      // model only contains todos/filter.
      // h only constructs TodoList's allowed Messages.
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

      input: Schema.Struct({
        title: Schema.String,
      }),

      toMessage: ({ title }) =>
        Message.RequestedTodo({ title }),

      completion: {
        success: Message.SubmittedTodo,
        failure: Message.FailedSubmitTodo,
        correlate: (request, result) =>
          request.title === result.title,
      },
    },

    ToggledTodo: {
      message: Message.ToggledTodo,
    },
  },
})
```

Adapters:

```ts
AgentMcp.serve(Assistant)
AgentWebMcp.register(Assistant)
```

## Mirror

Conceptually:

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

and:

```ts
const ShareableView = Mirror.query({
  model: Projection.struct({
    filter: App.fields.filter,
    page: App.fields.page,
  }),

  changed: values =>
    Message.ChangedViewFromUrl(values),
})
```

The implementation should compile these into ordinary Commands/Subscriptions/navigation effects rather than adding a Mirror runtime.

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

## Parts

```ts
const CardParts = Parts.define({
  root: Part.attributes(),
  title: Part.attributes(),
  action: Part.attributes(),
})
```

Everything after this point can remain optional.

---

# 16. What should explicitly NOT be upstreamed

This proposal is as much about refusing ideas as adopting them.

Do **not** upstream the following into Foldkit core at this stage:

### Full `foldkit-mixins`

Do not make Foldkit responsible for:

* a CSS-in-TS language;
* themes;
* recipes;
* variants;
* keyframes;
* selector nesting;
* a second HTML capability taxonomy.

Steal attribute resolution and perhaps named Parts.

### Remote-specific Projection metadata

A generic Model projection should not know about:

* server entities;
* requested server fields;
* connections;
* cache retention.

Remote can build on Projection without infecting its abstraction.

### Sync runtime semantics

Do not add:

* outboxes;
* operation journals;
* reconciliation;
* presence;
* transport reconnect logic;

to Foldkit Runtime.

Sync should remain a package implemented using Foldkit.

### Durable server infrastructure

Do not make the frontend framework responsible for authoritative SQLite journals or effect recovery.

### Generic arbitrary Mirror stores

If official Mirror initially supports:

```text
URL
KeyValueStore
```

that is probably enough.

Allowing:

```ts
Mirror.make({
  read,
  write,
})
```

too early encourages people to model databases, APIs, Redis, and authoritative servers as "mirrors," which destroys the ownership distinction.

### Writable Surface projections for normal application code

A Surface should primarily express observation plus permitted Messages.

It should not become:

```ts
surface.model.todos.set(...)
```

because that creates a second semantic mutation path around `update`.

---

# 17. A staged implementation plan

## Phase 1: extract the reusable substrate

This phase should be intentionally boring.

Implement:

```text
optional pure Application descriptor
read-only Model field references / Projection
typed Message subsets
Surface
```

No network behavior.

No storage.

No agents.

No sync.

The acceptance test is that these abstractions can describe an existing Foldkit application without changing how it executes.

A useful initial target would be one larger existing example with multiple Submodels.

The result should answer:

```text
What does this feature read?
What Messages may it cause?
```

purely from static values.

## Phase 2: teach tooling about the declarations

Add architecture inspection to DevTools.

Start small:

```text
Surfaces
  name
  Model dependencies
  allowed Message tags
```

Then expose the same information through DevTools MCP.

Add optional manifest generation:

```text
foldkit architecture
```

or equivalent build tooling.

This validates whether the static vocabulary is actually useful before more systems depend on it.

## Phase 3: production agent contracts

Build an official agent package using:

```text
Projection
Message subset
Runtime host binding
```

Start with one transport.

MCP is the obvious first external transport because Foldkit already has experience and tooling there, while WebMCP may be attractive for browser-native application capabilities.

The important work is the protocol-neutral contract:

```text
context
capabilities
input mapping
availability
authorization
completion
audit
```

The adapter is secondary.

## Phase 4: Mirror

Implement URL/query and KeyValueStore Mirror as compilers into existing Foldkit effects.

Create examples that make the semantic distinctions explicit:

```text
Route
vs
URL Mirror

Flags
vs
KV Mirror

Command persistence
vs
Mirror
```

Rewrite or create a Query Mirror example specifically to test whether the abstraction genuinely removes accidental plumbing.

## Phase 5: attribute composition and Parts

Add `Attribute.compose` first.

Let experience determine whether a first-class Parts abstraction is warranted.

Do not begin by porting Mixins.

## Phase 6: continue incubating Remote and Sync

Use the newly official Projection/MessageSet primitives to make third-party or experimental implementations easier.

If Remote and Sync gain production adoption, evaluate official packages independently.

They should not need Foldkit core changes beyond the substrate already introduced.

---

# 18. Suggested experiments before committing APIs

The best next step is not implementing every proposal.

Three small prototypes would answer most of the remaining architectural questions.

## Experiment A: Surface-ify a real Foldkit page

Take a page that reads root state plus multiple Submodels.

Define:

```text
Projection
Message subset
Surface
```

and bind its existing view.

Measure:

* how much boilerplate is introduced;
* whether the restricted Model improves readability;
* whether restricted `HtmlBuilder<Message>` catches real mistakes;
* whether dependency metadata is useful in DevTools.

If Surface feels heavier than the value it creates, stop.

## Experiment B: rewrite Query Sync as Model-owned state + Mirror

Keep the existing Query Sync example as the Route-owned version.

Build a second version where:

```text
Model owns filters
URL mirrors them
```

Compare:

```text
lines of application code
number of Messages
number of Commands
back/forward semantics
SSR behavior
test complexity
clarity of ownership
```

This is the best way to determine whether Mirror is genuinely a Foldkit abstraction or merely convenient library code.

## Experiment C: production-safe Todo agent

Take the current Todo example and expose:

```text
read:
  visible todos
  filter

capabilities:
  add todo
  toggle todo
  clear completed
```

without exposing:

```text
whole Model
fact Messages containing generated values
arbitrary dispatch
DevTools history
```

Add one async completion case.

This will immediately test:

* Projection;
* Message subsets;
* runtime observation;
* completion semantics;
* authorization;
* MCP/WebMCP adapter shape;
* difference from DevTools MCP.

If this feels clean, it is a strong signal that the underlying abstractions are correct.

---

# 19. How this changes the Foldkit story

Foldkit's current story can be summarized as:

> State changes and effects are explicit.

The useful lesson from Plus is that Foldkit can go one step further:

> **State changes, effects, and application boundaries are explicit.**

That gives a hierarchy like:

```text
Model
    what exists

Message
    what happened / may happen

update
    how state transitions

Command / Subscription / Mount / Resource
    what external work exists

Submodel
    who owns a state machine

Projection
    what existing state is observed

Message subset
    which existing transitions are relevant

Surface
    what a consumer may observe and cause

Agent
    how a restricted external actor accesses a Surface

Mirror
    where some Model state is represented externally

Parts
    where a view permits structural decoration
```

Each concept answers a different architectural question.

That coherence is the standard to hold every new abstraction to.

---

# 20. Priority recommendation

If only a small amount of `foldkit-plus` is ever incorporated, I would prioritize it in this order:

| Priority | Idea                                         | Recommendation                    |
| -------- | -------------------------------------------- | --------------------------------- |
| 1        | Typed Message subsets                        | Upstream                          |
| 2        | Read-only Model Projection / field refs      | Upstream                          |
| 3        | Surface as observation + capability boundary | Upstream, optional                |
| 4        | Pure Application descriptor                  | Strongly consider as substrate    |
| 5        | Architecture manifest / DevTools inspection  | Official tooling                  |
| 6        | Production agent contract                    | Official optional package         |
| 7        | Mirror                                       | Official optional package/pattern |
| 8        | Semantic attribute composition               | Core HTML utility                 |
| 9        | Named view Parts                             | Experiment, probably UI utility   |
| 10       | Remote                                       | Keep incubating                   |
| 11       | Sync                                         | Keep incubating                   |
| 12       | Durable                                      | Keep outside frontend core        |
| 13       | Full Mixins styling system                   | Do not upstream                   |

The top five form one coherent project rather than five unrelated features.

---

# 21. The main architectural risk

The largest risk is not implementation complexity.

It is **making the architecture more explicit than users actually need**.

Foldkit currently gets a lot of power from the fact that a view can simply be:

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
Module.add(...)
```

Foldkit will become less elegant.

The correct rule should therefore be:

> Plain functions first. Contracts only when something needs to inspect or reuse the boundary.

This is already how Plus itself describes Surface, and Foldkit should preserve that restraint.

Surfaces become worthwhile when:

* an agent needs a least-privilege context;
* DevTools should understand feature dependencies;
* a remote planner needs declared data requirements;
* a sync system needs a defined slice;
* a view benefits from compile-time Message restriction;
* architecture tooling needs a static boundary.

Otherwise:

```ts
const view = model => ...
```

is better.

---

# 22. Final recommendation

`foldkit-plus` should not be viewed as a set of missing batteries that Foldkit needs to absorb.

It is better understood as an architectural stress test.

It asks:

```text
If Foldkit really has one state machine,
can agents use it without another API?

Can server data fit without another store?

Can offline replay use the same reducer?

Can the URL represent state without owning it?

Can persistence observe state without leaking into every transition?

Can a design system customize views without owning state?

Can tooling inspect those relationships?
```

For the most part, the answer is yes.

That is evidence that Foldkit's existing foundation is strong.

The main thing Plus had to add repeatedly was a way to turn implicit relationships into explicit, inspectable data:

```text
Model field references
    ↓
Projection

Message constructors
    ↓
Message subset

Projection + Message subset
    ↓
Surface

Surface + policy
    ↓
Agent

Projection + representation
    ↓
Mirror

all declarations
    ↓
architecture tooling
```

That is the seam I would upstream.

The result should not be "Foldkit now includes foldkit-plus."

It should be:

> **Foldkit gains a tiny contract vocabulary that lets the rest of its architecture extend outward without losing the one-Model, one-Message-flow, one-update-function property that makes Foldkit valuable in the first place.**

In short:

```text
Steal the substrate.

Officialize Agents and Mirror.

Steal the small useful pieces of Mixins.

Learn from Remote and Sync.

Leave distributed systems and styling frameworks outside core.

Make Foldkit's boundaries as inspectable as its transitions.
```

That would make Foldkit more capable without making it feel like a different framework.


# Addendum: Complete Descriptions and Foldkit

A useful lens from arXiv:2402.09090 is that good abstractions are not merely about hiding detail. They are about finding a **complete description at the right level**: preserving every distinction that affects behavior at that level, while discarding distinctions that do not.

This helps explain why Foldkit and Effect are powerful.

In Foldkit:

```text
Model + Message + update
```

form a complete description of application state transitions, provided `update` is pure. External nondeterminism is pushed into Commands and re-enters as Messages, so the state machine remains closed and replayable.

Likewise, Effect and Schema turn otherwise opaque behavior into structured descriptions that can support many interpreters: execution, validation, testing, tracing, retries, documentation, serialization, and so on.

This suggests a stronger principle for the RFC:

> **Foldkit should prefer complete descriptions that can support many interpretations over multiple partial implementations of the same behavior.**

That principle clarifies several proposals.

## Surface as a real abstraction boundary

A Surface is more than:

```text
what can this consumer read?
what Messages can it send?
```

It can also be viewed as an attempted higher-level description of part of the application.

Suppose a Surface exposes:

```text
todos
```

and allows:

```text
ToggledTodo
```

but whether `ToggledTodo` changes the todos depends on hidden state such as:

```text
session.canEdit
```

Then the Surface is not behaviorally complete. Two root Models can look identical through the Surface yet react differently to the same Surface Message.

That gives us a useful law:

```text
If two root Models look identical through a Surface,
then applying the same allowed Message should not make
their projected next states differ.
```

Formally:

```text
P(m₁) = P(m₂)

should imply

P(update(m₁, msg)) = P(update(m₂, msg))
```

for Messages relevant to that Surface.

This does not need to be a hard requirement for every Surface. There are really two useful notions:

```text
Capability Surface
    what may this consumer observe and attempt?

Closed Surface
    does this state + Message vocabulary form a
    self-contained behavioral abstraction?
```

Foldkit could eventually test the second property with Stories or property-based testing and surface hidden dependencies.

## This strengthens the proposed substrate

The RFC's proposed primitives now have a deeper interpretation:

```text
Application
    the root machine

Projection
    which state distinctions remain visible

MessageSet
    which input distinctions remain available

Surface
    a candidate higher-level machine or capability boundary
```

This is more compelling than treating them as metadata for tooling.

It also suggests that Projections should remain read-only and support derived values. A Surface may need:

```text
canEdit: boolean
```

without exposing the entire internal structure that determines it.

## A useful test for future Foldkit abstractions

The lesson is not "make everything declarative."

Before adding a new abstraction, ask:

1. **What level of the program does this describe?**
2. **Which distinctions actually matter at that level?**
3. **Is the description complete enough to reason about that level without reopening hidden implementation details?**
4. **Can multiple useful interpreters be derived from the description?**

This helps explain why some `foldkit-plus` ideas are more compelling than others.

`Surface`, Agent contracts, Mirror, and replayable Message subsets describe meaningful architectural relationships.

A large styling DSL is less obviously valuable if its main interpretation is simply "turn this back into CSS."

## Revised north star

The RFC originally proposed:

> State changes, effects, and application boundaries are explicit.

A stronger version is:

> **Foldkit helps developers create complete descriptions of programs at useful levels of abstraction.**

Or more concretely:

> **Expose every distinction required to determine behavior at a level, and hide every distinction that cannot affect that behavior.**

That principle already explains much of Foldkit:

```text
Message
    makes events explicit

update
    makes state transitions explicit

Command / Subscription
    make external interaction explicit

Schema
    makes data structure explicit

Submodel
    makes autonomous state ownership explicit
```

The proposed additions extend the same idea:

```text
Projection
    makes observable distinctions explicit

MessageSet
    makes an input vocabulary explicit

Surface
    makes a consumer-level boundary explicit
```

The goal is not more abstraction machinery.

It is **better abstractions through more complete descriptions**.

