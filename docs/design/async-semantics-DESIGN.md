# Async semantics: what Foldkit should learn from Solid 2

> **Status:** design proposal, not an API contract.
>
> This document explores how Foldkit and Foldkit Plus can adopt the useful
> lessons from Solid 2's async model without importing Solid's reactive runtime
> semantics or creating a second state system beside `Model / Message / update`.

## Executive decision

Solid 2's important lesson is not "make every read return a Promise." It is:

> **Async behavior should compose through the same dependency model as ordinary
> state, rather than living in a parallel resource subsystem.**

Solid can do that because its dependency model is a dynamic reactive graph.
Foldkit has a different foundation:

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

Foldkit should preserve that architecture.

The proposal is therefore deliberately small:

1. **Keep `AsyncData` as explicit semantic application state.** Do not replace it
   with Promise-returning render computations.
2. **Keep effect execution in Command / Subscription / ManagedResource / package
   runtimes.** Do not make rendering initiate I/O.
3. **Keep application rendering reproducible from Model.** Runtime fiber state
   must not quietly become a second source of UI truth.
4. **Make Projection metadata a better declarative intermediate representation.**
   A Projection should describe what it reads and may carry opaque requirements
   for interpreters such as Remote, without Surface becoming coupled to every
   interpreter's domain model.
5. **Add state-based completion only where a subsystem already has a live state
   seam.** Agent is the first clear case: it already has `model`, `subscribe`,
   and Message observation.
6. **Use Effect for waiting, streams, cancellation, timeout, races, retry, and
   resource lifetime.** Do not build a parallel async-control library in Foldkit.
7. **Share vocabulary across Remote, Sync, and Agent where the algebra really is
   shared (`visible`, `confirmed`, `pending`, `settled`), but do not force their
   different mechanisms through one generic implementation.**

The intended result is not a "Foldkit Suspense." It is a more explicit,
composable application graph:

```text
                        Foldkit

                Model / Message / update
                         |
          +--------------+--------------+
          |              |              |
       AsyncData      Command       Subscription
     semantic state   one-shot work   ongoing work
          |              |              |
          +--------------+--------------+
                         |
                       Effect

                      Surface

ModelRef
   |
   v
Projection
   +-- reads Model paths
   +-- carries interpreter requirements
   +-- produces a typed value
   |
   v
Surface
observation + Message capability

                    Interpreters

Remote       Sync       Agent       Mirror
  |            |          |            |
interpret only the metadata / capabilities they own
```

## Why Solid 2 is relevant

Solid 2 moves async into its reactive graph. Ordinary computations can produce
Promises or AsyncIterables; readiness, pending work, errors, optimistic writes,
and transitions are coordinated by the graph rather than by a separate
`createResource` object.

The most interesting primitives are not valuable because of their exact names.
They expose a useful semantic decomposition:

| Solid 2 idea | Semantic question |
| --- | --- |
| `Loading` | Is this branch ready to render? |
| `isPending(expr)` | Is a new answer to this expression in flight? |
| `refresh(x)` | Re-ask the source of truth for this derived value. |
| `affects(x)` | This work will change `x`, even if the future value is unknown. |
| `createOptimistic*` | What should be visible before confirmation? |
| `until(predicate)` | When does authoritative state satisfy this condition? |
| `latest(x)` | What does the in-flight lane currently say? |
| `action()` | How are optimistic writes, side effects, and reconciliation scoped? |

Foldkit already has answers to several of these questions, but they are expressed
through explicit state and effect boundaries rather than a reactive scheduler.
That is a strength, not a deficiency.

Further reading:

- [Solid 2 async data RFC](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/05-async-data.md)
- [Solid 2 actions and optimistic updates RFC](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/06-actions-optimistic.md)
- [Solid 2 reactivity / batching / effects RFC](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/01-reactivity-batching-effects.md)
- [Solid 2 stores RFC](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/04-stores.md)

## Existing Foldkit pieces are already closer than they look

### `AsyncData` already models semantic async state

Foldkit already has a six-state value:

```text
Idle
Loading
Refreshing(data)
Failure(error)
Stale(data, error)
Success(data)
```

That captures an important distinction Solid 2 also cares about:

```text
first load
    !=
refresh while useful data exists
    !=
failed refresh while useful data exists
```

`AsyncData` also already provides value-level composition (`map`, `flatMap`,
`zipWith`, `all`, `settle`), pending checks, and revalidation helpers.

This means the problem is **not** "Foldkit needs a composable async value."
It already has one.

The important ownership rule is:

> If loading / refreshing / stale / failed is part of application semantics,
> represent it in Model.

That preserves Schema typing, replay, persistence, SSR, Story/Scene tests, and
pure rendering.

### Foldkit already has a stronger mutation boundary than Solid `action()`

Solid needs `action()` to group optimistic writes, async work, and reconciliation.
Foldkit already has the semantic stages explicitly:

```text
RequestedRename
      |
      v
    update
   /      \
Model      Command
change       |
             v
        external work
             |
             v
        RenamedTodo
             |
             v
           update
```

The useful Solid lesson is therefore **not** "add an Action abstraction." It is:

> Make the existing transition / effect / confirmation architecture easier to
> compose, and make the distinction between visible state and confirmed state
> explicit where a package already needs it.

### Surface already forms an explicit dependency graph

`ModelRef` is a typed structural focus derived from the application's Schema.
`Projection` carries the Model paths it reads. Surface then pairs observation
with the Messages a consumer may cause.

That is Foldkit's analogue of a dependency graph:

```text
Solid
runtime discovers dependencies by observing reads

Foldkit Plus
application declares dependencies through ModelRef / Projection / Surface
```

This is the most promising place to incorporate the *principle* behind Solid 2
without copying the runtime.

## Three concepts that must stay separate

A unified design still needs semantic distinctions. In particular, do not merge
these into one generic "async state" abstraction.

### 1. State — what is true or visible?

State belongs in Model when the application needs to reason about it.

Examples:

```text
AsyncData.Refreshing(previousUser)
form validation state
selected tab
optimistically renamed local Model value
```

Properties:

- Schema-typed
- serializable when its Schema is serializable
- replayable
- renderable deterministically
- visible to update

### 2. Work — what is executing?

Work belongs to runtime machinery.

Examples:

```text
HTTP Command fiber
live Subscription
ManagedResource lifetime
Remote revalidation request
Sync exchange
```

This is execution metadata, not normally application truth.

A Command being active does **not** imply the Model should automatically render
"Saving...". If that state matters to the application, update should represent
it explicitly.

### 3. Confirmation — what counts as settled?

Different systems have different confirmation semantics:

```text
ordinary Foldkit
  a result Message was reduced

Remote
  a server-derived value was installed

Sync
  an operation entered the committed server order

Agent
  a completion Message arrived, or application state now satisfies the
  capability's declared success condition
```

There should not be a universal `Authority<A>` type that pretends these are the
same mechanism.

The packages should instead expose precise concepts such as:

```text
visible
confirmed / committed
pending
settled
```

and compose through Effect / Stream where an effectful consumer needs to wait.

## What not to add

Several abstractions look attractive in isolation but would make the ecosystem
less coherent.

### Do not add a generic `Observation<A>`

A tempting API is:

```ts
interface Observation<A> {
  readonly get: Effect.Effect<A>
  readonly changes: Stream.Stream<A>
}
```

This duplicates Effect's existing vocabulary (`Effect`, `Stream`,
`SubscriptionRef`, `PubSub`) while creating a new wrapper every package must
learn.

It also has a subtle race if `get` and `changes` are independent:

```text
read current value -> false

          value becomes true here

subscribe to changes
```

A state-waiting primitive must observe current state and future changes without
that gap. Effect's `SubscriptionRef.changes` has the right shape: subscribers
receive the current value and future updates from one replaying stream.

If a runtime needs this internally, use Effect's primitives directly.

### Do not add a universal `Authority<A>`

"Authoritative" is context dependent.

A Sync snapshot committed through cursor 43 is confirmed through cursor 43, but
the server may already have committed 44-47. A Remote cache value came from the
server but may now be stale.

Use precise package language instead:

```text
Sync: committed
Remote: confirmed / server-derived
UI: visible
```

`authority` is useful explanatory vocabulary, not necessarily a useful public
type.

### Do not add a global `Foldkit.refresh(projection)`

A Projection says what a consumer reads. It does not say how that value can be
recomputed.

```text
local Model field      -> nothing to refresh
Remote requirement     -> Remote can revalidate
Sync document          -> Sync can exchange
filesystem source      -> some other interpreter might reload
```

Refreshing belongs to the interpreter that owns the operational semantics:

```ts
// plausible package-specific direction
Remote.refresh(UserProjection)
```

not:

```ts
// rejected
Foldkit.refresh(anyProjection)
```

### Do not add a generic optimistic wrapper to Foldkit core

The shared algebra is useful:

```text
base / confirmed
      +
temporary overlay
      =
visible
```

But the implementations are meaningfully different:

```text
Sync
  committed snapshot + replayed pending Messages

Remote
  confirmed normalized cache + optimistic mutation layers

ordinary Foldkit
  update may simply write optimistic state into Model
```

Share vocabulary first. Extract an implementation only after multiple packages
share an actual algorithm rather than a diagram.

### Do not make Promise-returning render computations first class

This would fight Foldkit's architecture:

```ts
// not a Foldkit direction
view(model) {
  const user = await fetch(...)
  ...
}
```

It would make render responsible for I/O lifecycle, deduplication, cancellation,
errors, SSR, and races.

Foldkit should adopt:

> async must compose

but reject:

> reads should initiate async work

### Do not collapse Command and Subscription into "Promise or AsyncIterable"

Their semantic distinction is valuable:

```text
Command
  one-shot work caused by a transition

Subscription
  ongoing work whose lifetime follows application state
```

Implementation plumbing may be shared internally. The public concepts should
remain separate.

## Runtime activity: useful, but not application state

There is a possible future runtime introspection feature:

```ts
Activity.isActive(SaveUser)
Activity.activeCount
```

Commands already have runtime identity and, for interruptible Commands, runtime
keys. Exposing that can be useful for:

- devtools
- diagnostics
- telemetry
- tests of runtime behavior
- protocol adapters

But it should **not** become an implicit second input to normal application
rendering:

```ts
// avoid making this the default view model
view(model, activity)
```

Why:

1. Replaying the same Model would no longer reproduce the same UI.
2. SSR and hydration could disagree because fibers differ even when Model is the
   same.
3. Story/Scene would need a second timeline besides Model / Message.
4. Time-travel debugging would stop being a Model history.

Rule:

> **Core application rendering remains a pure function of Model.**
>
> If "saving", "refreshing", or "pending" changes user-visible application
> semantics, represent it in Model. Runtime activity may exist as introspection
> but should not silently become application state.

This is one place where Foldkit should deliberately *not* copy Solid's graph-level
pending semantics.

## Improve Projection as the declarative intermediate representation

This is the strongest architectural proposal in this document.

Projection currently carries at least two classes of information:

```text
read dependencies
  Model paths used by the pure projection

external requirements
  facts an interpreter must make available for the projection to be useful
```

Those are different relations and should stay different:

```text
reads
requires
affects   (if introduced later for bounded work)
```

Do not collapse them into one universal `Dependency` type.

### Current coupling to Remote

Surface currently declares `Requirement`, `RelationRequirement`,
`ConnectionRequirement`, and pagination `Window` shapes because Remote needs to
attach requirement metadata without introducing a package cycle.

That works, but it makes the supposedly protocol-neutral Surface package know
about a very Remote-shaped data model.

Long term, Projection should ideally carry **opaque interpreter metadata** rather
than centrally define every interpreter's requirement schema.

Conceptually:

```ts
interface Projection<Root, A> {
  readonly Model: Schema.Codec<A, unknown>
  readonly read: (root: Root) => A
  readonly dependencies: ModelDependencies
  readonly requirements: readonly RequirementMetadata[]
}
```

where `RequirementMetadata` is deliberately open-world.

Remote would create a branded value that only Remote understands:

```ts
const RemoteRequirementTypeId: unique symbol

interface RemoteRequirement {
  readonly [RemoteRequirementTypeId]: typeof RemoteRequirementTypeId
  // Remote-owned structure
}
```

Surface does not interpret it. It only preserves and composes it.

Another interpreter could attach another branded requirement without adding a
case to a central Surface union.

This mirrors an important Effect design style:

```text
immutable declaration
      |
      +--> interpreter A
      +--> interpreter B
      +--> interpreter C
```

### Requirement metadata must remain typed at declaration

Open-world metadata must not become:

```ts
{ type: string, data: unknown }
```

Users should declare relationships through typed constructors. Erasure may happen
inside the compiled Projection, but user code should never depend on magic
strings.

The same rule applies to Model paths.

Today a typed ModelRef may eventually compile down to path segments such as:

```text
["users", "42", "name"]
```

That is fine as internal metadata. If Model dependency identity becomes more
important for validation or future interpreter features, user code should still
refer to the ModelRef / Projection rather than manually construct path arrays.

> **Strings are acceptable after a typed declaration has been compiled. They
> should not be the declaration API.**

## Better async rendering should interpret `AsyncData`, not suspend render

Solid's `Loading` is structural because its graph can encounter an unreadied
computation while rendering.

Foldkit already has explicit readiness in `AsyncData`, so the useful ergonomic
improvement is a rendering helper, not suspension.

A possible direction (name deliberately provisional):

```ts
Render.async(model.user, {
  loading: () => UserSkeleton(),
  error: error => ErrorView(error),
  data: (user, state) =>
    UserView({
      user,
      refreshing: state.refreshing,
      stale: state.stale,
    }),
})
```

Semantics:

```text
Idle / Loading
  -> loading branch

Failure with no data
  -> error branch

Success
  -> data branch

Refreshing(data)
  -> data branch + refreshing metadata

Stale(data, error)
  -> data branch + stale/error metadata
```

This does not replace `AsyncData.match`; it would be a view-oriented interpreter
for the common "keep useful data visible" policy.

The important property is that rendering still consumes only Model.

## State-based Agent completion is a concrete Solid `until()` lesson

Agent is the clearest place where a state-based completion primitive adds real
value without introducing a new Foldkit-wide abstraction.

The Agent runtime already binds to a host that can:

```text
read Model
subscribe to Model changes
observe processed Messages
send Messages
```

Current completion is naturally event-based: wait for a completion Message and
correlate it with the invocation.

Some capabilities are better described by a state condition:

> The operation is complete when application state reflects the requested
> outcome, regardless of which Message, push channel, Sync exchange, or other
> actor caused that state to arrive.

A possible API shape (provisional):

```ts
completion: Agent.when({
  projection: Todos,
  predicate: (todos, input) =>
    todos.some(todo =>
      todo.clientId === input.clientId &&
      todo.title === input.title,
    ),
})
```

This should coexist with Message completion:

```text
Message completion
  "did this correlated domain event happen?"

State completion
  "does the application now satisfy this condition?"
```

### Race-safety requirement

State completion must not do this:

```text
read predicate -> false

          state changes to true

subscribe
```

The implementation must subscribe first and then evaluate the current Model, or
otherwise use an Effect primitive that provides current + future values without a
gap.

The API should expose an `Effect`, so timeout / cancellation / race / retry remain
ordinary Effect composition rather than options invented by Agent:

```ts
agentRuntime.messages.dispatch(...).pipe(
  Effect.timeout("10 seconds")
)
```

Do not copy Solid's `{ timeout, signal }` options when Effect already has stronger
structured-concurrency semantics.

## Interpreter-specific refresh and confirmation

Solid's `refresh(x)` is compelling because a Solid graph node owns its derivation.
A Foldkit Projection does not necessarily own operational refresh semantics.

The same user-facing concept should therefore appear only where the interpreter
can lawfully implement it.

### Remote

A Remote Projection already carries requirements. Remote can plausibly support:

```ts
Remote.refresh(UserProjection)
Remote.refresh(UserPageSurface.model)
```

meaning:

> Revalidate the Remote requirements contributed by this Projection.

This is a good use of Projection metadata because Remote is interpreting metadata
it owns.

### Sync

Sync should keep its own vocabulary:

```text
synchronize
committed
pending
visible
```

A generic `refresh` would hide the fact that Sync is exchanging durable
operations and rebasing, not re-running a read.

### Ordinary Foldkit

A local Model Projection has nothing to refresh. No operation should be invented.

## Shared vocabulary for optimistic systems

Remote and Sync have different implementations, but a useful shared conceptual
algebra exists:

```text
confirmed/base
      +
pending overlay
      =
visible state
```

For Sync:

```text
committed snapshot
      +
pending durable Messages
      =
visible optimistic shared state
```

For Remote:

```text
confirmed server-derived cache
      +
optimistic mutation layers
      =
visible cache
```

For an ordinary Foldkit update, the application may simply write the optimistic
state directly to Model and later reconcile with a result Message.

Use this vocabulary consistently in docs and APIs where it fits, but do not yet
extract a universal overlay primitive.

## Effect integration rules

Any new async-facing Foldkit / Plus API should follow these rules.

### Effects are Effects

One-shot waiting / dispatch / refresh / confirmation returns:

```ts
Effect.Effect<A, E, R>
```

Do not return an ad-hoc cancellable Promise wrapper.

### Ongoing values are Streams

If an API exposes a sequence over time, normalize internally to:

```ts
Stream.Stream<A, E, R>
```

Callback adapters can exist at protocol or host boundaries, but the Effect-native
core should prefer Effect's lifecycle and composition.

### Scope owns resources

A subscription, socket, observer, or runtime attachment with lifetime should use
Effect `Scope` / Layer / scoped Effects rather than manual global registries.

### Reuse Effect control flow

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

Those compose with `Effect` already.

### Do not duplicate `SubscriptionRef`

If a runtime needs a mutable current value whose change stream includes the
current value and later updates, use Effect's `SubscriptionRef` (or equivalent
Effect primitive in the pinned version) internally.

## Type-safety rules

The proposal should preserve the project's strongest API property: declarations
are derived from actual application values rather than restated strings.

### Prefer references over names

Good:

```ts
Projection.pick(App.fields.todos)
MessageSet.make(App, [Message.CreatedTodo])
```

Avoid:

```ts
Projection.pick("todos")
affects("todos")
```

Wire protocols may compile a typed declaration into strings. User-facing
composition should stay reference-based.

### Keep interpreters open without a central union

Avoid a closed type like:

```ts
type Requirement =
  | RemoteRequirement
  | SyncRequirement
  | AgentRequirement
```

Every new interpreter would require editing Surface.

Prefer branded / opaque metadata owned by the package that interprets it.

### Preserve application ownership in types

A Projection, MessageSet, or requirement produced for one application should not
silently compose with another application's values. Existing `owner` / contract
checks should continue to reject that class of mistake.

### Do not type runtime erasure as user API

If a typed declaration compiles to `string[]`, `unknown`, or protocol names
internally, keep that representation behind constructors and inspectors. Do not
make users rebuild the erased representation manually.

## Composability rules

The goal is **coherent composition, not homogeneous composition**.

Different concepts already have appropriate algebras:

```text
Effect
  pipe / provide / timeout / retry / race

Projection
  map / all / select / compose

MessageSet
  union

Surface
  observation + capability

Sync fragments
  compose

Remote requirements
  merge / normalize

Layer
  service composition
```

Do not add a generic `Async.compose(...)` merely to make the system look unified.

A design is composable when its output becomes a lawful input to the next layer,
not when every layer shares the same method names.

## Extensibility rules

The architecture should be extensible by adding interpreters, not by expanding a
central god object.

Good direction:

```text
Projection declaration
       |
       +--> Remote interpreter
       +--> Agent interpreter
       +--> future interpreter
```

Bad direction:

```text
Projection
  knows Remote
  knows Sync
  knows Agent
  knows future package X
```

Surface should own the stable semantic seam:

```text
what the consumer reads
what the consumer may cause
what declarative metadata accompanies those reads
```

Each package owns the meaning of its metadata.

## Determinism, SSR, replay, and testing

Any proposal in this area must preserve these properties.

### Deterministic render

Given the same Model, normal application rendering should produce the same UI.

Runtime fibers must not be an invisible second render input.

### SSR / hydration

User-visible readiness that must survive SSR belongs in Model (for example
`AsyncData`). A server and client can encode/decode that state consistently.

Do not make hydration correctness depend on whether a Command happened to be
running on one side.

### Replay

A recorded Message history plus initial Model should still explain application
state. Ephemeral execution metadata may be inspected separately, but must not be
required to reproduce semantic state.

### Story / Scene

Tests should keep resolving Commands through their declared result Messages.
State-based Agent completion can be tested with a host that changes Model and
notifies subscribers; it must not require a browser scheduler or reactive graph.

## Proposed phases

### Phase 0 — documentation and vocabulary

No runtime changes.

- Standardize `visible`, `confirmed` / `committed`, `pending`, and `settled` in
  Remote / Sync / Agent docs where applicable.
- Document the difference between semantic async state (`AsyncData`) and runtime
  work.
- Document that Solid-style `action()` is not needed because Foldkit already has
  Message / update / Command / Message.

### Phase 1 — Projection metadata audit

Before adding APIs, audit the current Surface requirement model.

Questions:

1. Can Remote requirement metadata become Remote-owned branded values without
   harming inference or creating package cycles?
2. Can Projection composition preserve unknown interpreter metadata without
   knowing its structure?
3. Which current merge semantics genuinely belong in Surface, and which belong
   in Remote?
4. Can runtime Model dependency identities remain opaque references longer
   instead of exposing path arrays?

This should be prototyped in type tests before implementation.

### Phase 2 — Agent state completion

Add one concrete capability where the benefit is clear.

Requirements:

- completion by Projection + predicate
- typed predicate input derived from the exposed Message input
- subscribe-before-read or equivalent race-free implementation
- no separate `Observation` abstraction
- waiting represented as Effect
- timeout / interruption supplied by Effect composition
- coexistence with Message-based completion

This validates the Solid `until()` lesson in a subsystem that already has the
necessary host seams.

### Phase 3 — Remote Projection refresh

Only if useful in real examples:

- allow Remote to revalidate requirements contributed by a Projection / Surface
- keep the operation Remote-specific
- avoid global Foldkit refresh semantics
- decide how refresh interacts with live data, staleness, deduplication, and
  existing requirement planning

### Phase 4 — AsyncData view ergonomics

If repeated view code justifies it, add a small rendering interpreter over
`AsyncData` that keeps stale/refreshing data visible by default.

This is ergonomic sugar over explicit Model state, not a suspension mechanism.

### Phase 5 — runtime activity introspection, only if demanded

If devtools or adapters need it, expose scoped runtime execution metadata.

Do not use it as a default second input to application views.

## Rejected first-wave APIs

The following should **not** be implemented merely because they resemble Solid
2 primitives:

```ts
Foldkit.refresh(projection)
Foldkit.latest(projection)
Activity.isPending(surface)
Observation.make(...)
Authority.make(...)
Optimistic.make(...)
Action.make(...)
```

Each either duplicates an existing Foldkit / Effect primitive, hides package
semantics, or weakens Model as the source of application truth.

They can be reconsidered only if multiple concrete implementations converge on
the same lawful behavior.

## Evaluation criteria

Any implementation inspired by this proposal should pass all of these tests.

### Foldkit-native

- Does `Model / Message / update` remain the application state machine?
- Does render remain explainable from Model?
- Do effects still execute outside update?
- Are Command and Subscription lifecycle meanings preserved?

### Effect-native

- Are one-shot async operations Effects?
- Are ongoing values Streams?
- Are cancellation, timeout, race, retry, and resource lifetime delegated to
  Effect rather than reimplemented?
- Does the API remain pipeable where transformation/composition is expected?

### Type-safe

- Are relationships declared through ModelRefs, Projections, Schemas, Message
  constructors, or branded package values rather than strings?
- Does application ownership survive composition?
- Can a new interpreter add metadata without editing a central union?

### Composable

- Does each abstraction compose through its natural algebra?
- Can package-specific semantics remain visible rather than being erased by a
  generic async wrapper?
- Can a caller continue composing the resulting Effect / Stream with ordinary
  Effect operators?

### Extensible

- Can a future interpreter consume Projection metadata without Surface learning
  its entire domain?
- Can new metadata coexist with old metadata?
- Can packages remain optional and avoid dependency cycles?

### Deterministic

- Can the same Model reproduce the same application UI?
- Can SSR / hydration serialize the state needed to render?
- Can Story / Scene and replay tests explain behavior without recreating runtime
  fiber timing?

## Final thesis

Solid 2 and Foldkit are solving related problems from opposite directions.

Solid starts with an implicit reactive graph and makes async a first-class state
of that graph.

Foldkit starts with an explicit application state machine and explicit effect
boundaries. Its corresponding opportunity is not to import suspension or
transactions into rendering. It is to make the **declared application graph**
carry enough semantics that interpreters can coordinate async behavior without
creating parallel resource APIs.

The guiding rule is:

> **Declare application semantics once. Interpret them in the layer that owns
> the behavior.**

For async specifically:

```text
semantic state       -> Model / AsyncData
one-shot work        -> Command / Effect
ongoing work         -> Subscription / Stream / Scope
observation          -> ModelRef / Projection / Surface
external requirement -> interpreter-owned Projection metadata
confirmation         -> package-specific semantics, composed as Effect
optimism             -> package-specific overlay where needed
```

That is less superficially unified than Solid's single reactive graph, but it is
more faithful to Foldkit and Effect. The unity comes from the architecture:
**explicit declarations, one owner per concern, and interpreters that reuse those
declarations instead of creating parallel state machines.**
