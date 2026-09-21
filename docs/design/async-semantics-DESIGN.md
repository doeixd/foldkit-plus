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

## Implementation status

PRs #108 and #109 implemented decisions 4, 5 and 7 in part. The reasoning below
is unchanged; sketches that shipped in another shape carry a pointer to this
section.

| Decision | Shipped as | Differs from the sketch |
| --- | --- | --- |
| Opaque Projection metadata | `Metadata.key<A>(name, { merge, summarize })` in [`foldkit-surface`](../../packages/surface/README.md). Entries are private and frozen; combinators merge them per key. Remote owns `RemoteRequirements` / `RemoteConnections`, read with `requirementsOf` / `connectionsOf`. | Not a structural `requirements: RequirementMetadata[]` array. A `Metadata` value cannot be hand-built or copied, so only the owning package's key reads or writes its entries. |
| Remote refresh | `Data.refresh(model, projection \| Surface)` (`Remote.refresh(bound, …)`) in [`foldkit-remote`](../../packages/remote/README.md), for a Surface without params. | Mark-only: it returns the Model instead of an Effect that fetches. A fetching refresh requested the data a second time beside the Subscription read entry. The read entries refetch, a refresh generation restarts reads in flight, and a refreshed connection's first page replaces its pages. |
| Agent state completion | `Agent.when({ projection \| source, predicate, timeout? })` in [`foldkit-agent`](../../packages/agent/README.md). Subscribes before reading. | Takes a `timeout` option; the runtime owns one deadline and the abort signal around both the host dispatch and the wait. A wait-only Effect could not bound a host dispatch that never returns. |
| Sync confirmation | `Replica.committed` and `mounted.committed` in [`foldkit-sync`](../../packages/sync/README.md). | A `{ get, subscribe }` source (`Agent.when({ source: mounted.committed, … })`), not a Projection such as `TodoSync.committed.select(...)`: committed state lives in the replica, not the Model. |

`Remote.confirmed` shipped later, as `Data.confirmed(projection)` in
[`foldkit-remote`](../../packages/remote/README.md), once the optimistic
mutation layers this section gates it on existed — they were built for
`foldkit-cms`'s preview, not for this. It is a projection read over the
server-derived store alone, planning exactly what the projection plans, so
observing it fetches the same and only what it *shows* differs. There is no
`Remote.visible`: a projection already is the visible read, and a second name
for it would be a wrapper that only forwards.

`Render.async` shipped as `RemoteData.render(data, cases)`, in the namespace
the fold it belongs beside already lives in rather than a new `Render` one. It
takes four branches, not three: `notFound` is its own, because this repo's
`RemoteData` has a `NotFound` the generic sketch did not, and drawing an absent
row as either loading or failure is a spinner that never ends or an error
nobody can act on. The metadata is one `Freshness` tag (`Fresh` / `Refreshing`
/ `Stale`, the last carrying its error) rather than the sketch's two booleans,
since a value cannot be both at once.

Phase 0's vocabulary is stated once, in [who changes application
state](../state-model.md#what-a-reader-sees-while-a-change-is-in-flight), with
Remote's and Sync's names for each term side by side and both READMEs pointing
at it — rather than repeated in three packages, where the three copies would
drift. The same page carries the other two Phase 0 items: why semantic
`RemoteData` state is not runtime work, and why Solid's `action()` has no
counterpart here (`update` applies the optimistic change and returns the
Command, the Command works, its Message reconciles — the same three phases,
already in the architecture).

Phase 5 is answered without exposing runtime execution at all. What a tool
actually wants is "what is Remote doing right now", and the Model already knows:
`Data.inspect(model).loading` reports the reads in flight beside
`mutations.pending` for the writes. Both are read from the Model, so a tool
shows something a recorded Model can be replayed to. Scoped fiber metadata is
not built, and should not be until something needs a fact the Model cannot
answer.

Not built: nothing further from this document. The remaining rejected APIs in
[Rejected first-wave APIs](#rejected-first-wave-apis) stay rejected.

Known issues at ship time:

- **Sync lost edit (since fixed).** A durable edit still waiting for the replica
  lock was not in `replica.shared`, so an exchange settling then hid it until
  the next exchange. Deferring the install starved remote changes and was
  reverted; the fix submits one edit at a time and replays the edits the replica
  does not hold yet on top of one replica snapshot.
- **Refresh restarted every read entry (since fixed).** The refresh generation
  was one counter on the Remote store, so every read entry's dependencies
  changed and every read in flight was cancelled, not only the one observing the
  refreshed Projection. Generations are now held per field mark and per
  connection identity, and a read entry takes the highest over what it actually
  plans, so a refresh restarts the entries that observe what was refreshed and
  leaves the rest running.

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

> Shipped differently (opaque `Metadata.key`, not an array); see
> [Implementation status](#implementation-status).

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

> Shipped as `RemoteData.render`, with a fourth `notFound` branch and one
> `Freshness` tag in place of the two booleans; see
> [Implementation status](#implementation-status).

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

> Shipped differently (`Agent.when` takes `timeout`; the runtime bounds dispatch
> and wait together); see [Implementation status](#implementation-status).

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

> Shipped differently (mark-only `Data.refresh(model, target)` returning the
> Model); see [Implementation status](#implementation-status).

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

## What this enables in practice

The value of this proposal is not a new async subsystem. It is that existing
application declarations can carry farther, so packages stop restating each
other's semantics.

The API names below are intentionally provisional. These examples describe the
capabilities the architecture should make possible, not a commitment to exact
method names.

### Agent completion can describe the semantic result instead of an internal event

Before, an agent capability that renames a project has to know which Message
signals success:

```ts
const AssistantAgent = AgentBuilder.make({
  messages: AgentBuilder.expose(Message, {
    RequestedRenameProject: {
      completion: {
        success: Message.RenamedProject,
        correlate: (request, result) =>
          request.projectId === result.projectId,
      },
    },
  }),
})
```

That couples the capability to one implementation path:

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
   HTTP mutation
        |
        v
   RenamedProject
        |
        v
      update
```

If confirmation later comes from a Remote live update, Sync exchange, another
device, or server push, the agent should not need to care which internal event
made the state true.

With state-based completion, the contract can instead describe the result:

```ts
const ProjectName = Project.select(
  Projection.make({
    Model: Schema.String,
    read: project => project.name,
  }),
)

const AssistantAgent = AgentBuilder.make({
  messages: AgentBuilder.expose(Message, {
    RequestedRenameProject: {
      completion: Agent.when({
        projection: ProjectName,
        predicate: (name, request) => name === request.name,
      }),
    },
  }),
})
```

Conceptually:

```text
agent dispatches request
        |
        v
anything may cause application state to advance
        |
        +-- Command result
        +-- Remote live update
        +-- Sync confirmation
        +-- another device
        +-- server push
        |
        v
project.name == requested name
        |
        v
agent invocation completes
```

The contract is now coupled to the semantic outcome rather than to one event
used by today's implementation.

### Live-source acknowledgement no longer needs transport-specific event waiting

A WebSocket send may only acknowledge that the transport accepted a mutation.
The actual application truth may arrive later through a live query.

Before, it is easy to mistake transport acknowledgement for semantic completion:

```ts
const SendMessage = Command.define('SendMessage', {
  args: {
    clientId: Schema.String,
    body: Schema.String,
  },
  messages: [Message.CompletedSendMessage],
  execute: ({ clientId, body }) =>
    socket.send({ clientId, body }).pipe(
      Effect.as(Message.CompletedSendMessage({ clientId })),
    ),
})
```

`CompletedSendMessage` here can only prove:

```text
the socket accepted the send
```

It does not necessarily prove:

```text
the message exists in confirmed application state
```

After, the transport Command can stay honest about what it knows:

```ts
const SendMessage = Command.define('SendMessage', {
  args: {
    clientId: Schema.String,
    body: Schema.String,
  },
  messages: [Message.SubmittedSendMessage],
  execute: ({ clientId, body }) =>
    socket.send({ clientId, body }).pipe(
      Effect.as(Message.SubmittedSendMessage({ clientId })),
    ),
})
```

A consumer that needs semantic confirmation can wait on projected state:

```ts
completion: Agent.when({
  projection: Messages,
  predicate: (messages, input) =>
    messages.some(message => message.clientId === input.clientId),
})
```

```text
send
 |
 v
transport ack
 |
 v
live source eventually changes Model
 |
 v
predicate is true
 |
 v
complete
```

Because completion is level-triggered against current + future Model state, it
is not vulnerable to the classic "confirmation arrived before I subscribed"
race that an edge-triggered `waitForNextMessage(...)` helper would have.

### Remote can refresh a consumer without restating its data graph

Suppose a page already declares everything it requires:

```ts
const ProjectPage = Projection.all({
  project: Data.get(Project, projectId),
  owner: Data.get(User, ownerId),
  tasks: Data.query(TasksByProject, { projectId }),
})
```

Without Projection-driven refresh, a refresh path tends to repeat that graph:

```ts
case 'RequestedRefreshProjectPage':
  return [
    model,
    [
      LoadProject({ projectId }),
      LoadOwner({ ownerId }),
      LoadTasks({ projectId }),
    ],
  ]
```

If Remote owns and can interpret the requirements carried by `ProjectPage`, it
can instead expose a package-specific operation:

```ts
Remote.refresh(ProjectPage)
```

> Shipped as `Data.refresh(model, ProjectPage)` from `update`, which marks and
> returns the Model; see [Implementation status](#implementation-status).

Conceptually:

```text
ProjectPage
   |
   +-- requires Project:p1
   +-- requires User:u9
   +-- requires TasksByProject:p1
   |
   v
Remote.refresh(ProjectPage)
   |
   v
Remote derives and revalidates those requirements
```

The consumer declares what it needs once. Remote decides how those requirements
are fetched, deduplicated, live-updated, or revalidated.

This does **not** imply a global `Foldkit.refresh`. Only the interpreter that
understands the requirement metadata gets to define refresh semantics.

### Surface can become open to new interpreters without absorbing their domain models

Today Surface carries Remote-shaped requirement concepts because Remote needs a
place to attach them without a package cycle.

That becomes awkward when a future package has another kind of requirement.
Imagine:

```text
foldkit-search
```

and a Projection that requires a search index query:

```ts
const ProductResults = Search.query(ProductIndex, {
  query: searchTerm,
})
```

With open interpreter-owned metadata, that Projection can contribute a branded
`SearchRequirement` while a Remote node contributes a `RemoteRequirement`:

```text
Projection
   |
   +-- Model dependencies
   |
   +-- requirements
       |
       +-- RemoteRequirement
       +-- SearchRequirement
```

Then:

```ts
Remote.plan(ProductPage)
```

reads only Remote metadata, while:

```ts
Search.plan(ProductPage)
```

reads only Search metadata.

Neither package requires Surface to learn its domain model.

This is the main extensibility payoff of making Projection a declarative
intermediate representation rather than a Remote-specific planner input.

### Third-party packages can enrich normal Projections instead of inventing parallel DSLs

Consider a third-party package:

```text
@acme/foldkit-feature-flags
```

Without an extensible Projection seam, it is tempted to invent:

```text
FeatureFlagProjection
FeatureFlagSurface
FeatureFlagRuntime
```

With interpreter-owned requirement metadata, it can instead participate in the
normal application graph:

```ts
const BillingPage = Projection.all({
  account: App.model.account,
  redesignEnabled: Flags.get('billing-redesign'),
})
```

`Flags.get(...)` contributes its own typed requirement metadata. Surface still
sees an ordinary Projection, and the Flags interpreter alone understands how to
fulfill that metadata.

This gives the ecosystem a consistent extension pattern:

```text
make a typed declaration
attach package-owned metadata
let the owning interpreter consume it
```

rather than:

```text
make another parallel state / projection / runtime system
```

### Async rendering can become less repetitive without becoming magical

Foldkit already correctly models:

```text
Idle
Loading
Refreshing(data)
Failure(error)
Stale(data, error)
Success(data)
```

The rough edge is view boilerplate.

Before:

```ts
return AsyncData.match(model.user, {
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

A view-oriented interpreter could collapse the common policy:

```ts
return Render.async(model.user, {
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

The important part is what does **not** change:

```text
view = Model -> VNode
```

There is no Promise read, thrown not-ready sentinel, hidden scheduler, or second
source of UI truth. The helper is only a better interpreter for explicit
`AsyncData` state.

### Semantic pending state no longer needs ad-hoc booleans

Before, an application may drift toward parallel fields:

```ts
const Model = Schema.Struct({
  user: User,
  isRefreshingUser: Schema.Boolean,
  refreshError: Schema.Option(UserError),
})
```

with transitions that manually keep the fields coherent.

The existing `AsyncData` model already gives the better representation:

```ts
const Model = Schema.Struct({
  user: UserData.schema,
})
```

and a refresh transition can express the semantic state directly:

```ts
case 'RequestedRefreshUser':
  return [
    {
      ...model,
      user: AsyncData.revalidate(model.user),
    },
    FetchUser(),
  ]
```

The proposal reinforces that direction: semantic pending belongs in Model when
it matters to application behavior. Runtime Activity should not be used to
replace explicit application state.

### Agent and Sync can compose without Agent learning the Sync protocol

A replicated edit has at least two relevant views:

```text
committed
  server-confirmed shared state

visible
  committed state + pending local operations
```

Suppose an agent edits a replicated todo.

Before, Agent completion may be coupled to a Sync-specific acknowledgement
Message or operation event:

```ts
completion: {
  success: Message.SyncAcknowledgedRename,
  correlate: ...,
}
```

That leaks replication protocol into the Agent contract.

After, if Sync exposes an appropriate committed Projection, Agent can express the
real requirement:

```ts
completion: Agent.when({
  projection: TodoSync.committed.select(
    Todos.byId(input.id),
  ),
  predicate: (todo, input) => todo.title === input.title,
})
```

> Shipped differently (`source: mounted.committed`, not a Projection); see
> [Implementation status](#implementation-status).

Immediately after local submission:

```text
committed
  "Old title"

pending
  Rename -> "New title"

visible
  "New title"
```

The UI may show the optimistic result, but Agent completion remains pending.
After server acknowledgement:

```text
committed
  "New title"

pending
  []

visible
  "New title"
```

Now completion succeeds.

Agent does not need to know about cursors, operation IDs, checkpoints, or Sync's
wire protocol. It consumes a semantic view exposed by Sync.

This is an example of **specialized but interoperable APIs** rather than a
universal `Authority<A>` abstraction.

### The same pattern can work with Remote optimistic mutations

If Remote later supports optimistic mutation layers, it will also have a useful
distinction between:

```text
visible cache
  confirmed server-derived cache + optimistic layers

confirmed cache
  the last server-derived value
```

A normal UI usually wants the visible view.

An Agent capability that must not claim success until the server-derived state
reflects the requested mutation may want a confirmed Projection instead.

Conceptually, Remote could expose package-owned vocabulary such as:

```ts
Remote.visible(ProjectName)
Remote.confirmed(ProjectName)
```

> Shipped as `Data.confirmed(projection)`, with no `visible` beside it; see
> [Implementation status](#implementation-status).

The exact API is open, but the semantic rule is important: Remote owns this
distinction because Remote understands its own optimistic and server-derived
layers. Foldkit core does not need a generic `Authority<T>` wrapper.

### Effect remains the one async-control language across packages

Without a strong rule here, each package can slowly invent variants of:

```ts
{
  timeout: 5_000,
  signal,
  retry: 3,
}
```

The proposal instead keeps package operations as Effects:

```ts
Agent.dispatch(...).pipe(
  Effect.timeout('5 seconds'),
  Effect.retry(policy),
)
```

```ts
Remote.refresh(ProjectPage).pipe(
  Effect.timeout('5 seconds'),
)
```

> Shipped differently: refresh returns the Model and `Agent.when` takes
> `timeout`; see [Implementation status](#implementation-status).

```ts
Sync.exchange(...).pipe(
  Effect.retry(Schedule.exponential('100 millis')),
)
```

That gives the whole ecosystem one vocabulary for:

```text
timeout
retry
race
cancellation
resource scope
parallelism
errors
dependency injection
```

The package supplies domain semantics. Effect supplies async control flow.

### A future first-class Foldkit runtime can normalize adapters around Effect

The current Agent host deliberately accepts flexible host seams such as callback
subscriptions and `void | Promise | Effect` dispatch.

If Foldkit eventually exposes a first-class runtime handle, an Effect-native
internal shape could be simpler:

```ts
interface Runtime<Model, Message> {
  readonly model: Effect.Effect<Model>
  readonly models: Stream.Stream<Model>
  readonly messages: Stream.Stream<Message>
  readonly dispatch: (
    message: Message,
  ) => Effect.Effect<void>
}
```

Then Agent can bind directly to that runtime, while callback / Promise adapters
remain edge integrations rather than the framework's internal async vocabulary.

This is not required for the first phases of this proposal, but it illustrates
the direction: **normalize execution through Effect instead of wrapping Effect in
another Foldkit async abstraction.**

### Module and devtools can derive a richer application graph from the same declarations

Projection already knows what it reads and what external requirements it carries.
Surface knows what a consumer may observe and which Messages it may cause.

With interpreter-owned requirement metadata, Module could eventually describe a
consumer like this:

```text
UserPage
|
+-- observes
|   +-- session.userId
|   +-- ui.selectedTab
|   +-- projects
|
+-- requires
|   +-- Remote: User:u1 [id,name,avatar]
|   +-- Remote: ProjectsByOwner:u1
|   +-- FeatureFlags: "new-project-page"
|
+-- may cause
    +-- RequestedRenameProject
    +-- RequestedArchiveProject
```

The same declarations can therefore serve:

```text
runtime planning
documentation
architecture validation
devtools
agent contracts
static diagrams
```

without each subsystem maintaining another representation of the application.

### End-to-end: one declaration interpreted by UI, Agent, and Remote

The strongest form of the proposal looks like this.

The application declares a consumer once:

```ts
const ProjectPage = App.surface({
  model: Projection.all({
    project: Data.get(Project, projectId),
    tasks: Data.query(
      TasksByProject,
      { projectId },
    ),
  }),
  messages: MessageSet.make([
    Message.RequestedRenameProject,
    Message.RequestedAddTask,
  ]),
})
```

The UI interprets the Surface as a view boundary:

```ts
SurfaceView.make(ProjectPage, ({ model, send }) =>
  ProjectScreen({
    project: model.project,
    tasks: model.tasks,
    rename: name =>
      send(
        Message.RequestedRenameProject({
          id: projectId,
          name,
        }),
      ),
  }),
)
```

An Agent interprets the same observation and capability boundary:

```ts
const Assistant = Agent.make({
  context: ProjectPage,
  messages: Agent.expose(ProjectPage.messages, {
    RequestedRenameProject: {
      completion: Agent.when({
        projection: Remote.confirmed(
          ProjectPage.model.project,
        ),
        predicate: (project, request) =>
          project.name === request.name,
      }),
    },
  }),
})
```

Remote interprets the requirements already carried by the Projection:

```ts
Remote.refresh(ProjectPage.model)
```

> `Remote.confirmed` shipped as `Data.confirmed` and refresh is mark-only; see
> [Implementation status](#implementation-status).

Conceptually:

```text
                  ProjectPage

                       |
         +-------------+-------------+
         |             |             |
         v             v             v
        UI           Agent         Remote
      renders       observes        plans
       model        + acts       requirements
                                      |
                                      v
                                   refresh
```

The application still fundamentally remains:

```text
Model
Message
update
Command
Subscription
```

The improvement is not that those concepts disappear. It is that downstream
systems can interpret the same declarations instead of restating application
semantics in parallel APIs.

That is the practical form of the broader Foldkit Plus thesis:

> **Declare the application once. Interpret it everywhere.**

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

> Done, in one place rather than three: [who changes application
> state](../state-model.md#what-a-reader-sees-while-a-change-is-in-flight).

- Standardize `visible`, `confirmed` / `committed`, `pending`, and `settled` in
  Remote / Sync / Agent docs where applicable.
- Document the difference between semantic async state (`AsyncData`) and runtime
  work.
- Document that Solid-style `action()` is not needed because Foldkit already has
  Message / update / Command / Message.

### Phase 1 — Projection metadata audit

> Done: shipped as `Metadata.key` in `foldkit-surface`, with Remote owning
> `RemoteRequirements` / `RemoteConnections`. See [Implementation
> status](#implementation-status) for how it differs from the sketch.

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

> Done: shipped as `Agent.when({ projection | source, predicate, timeout? })`.

Add one concrete capability where the benefit is clear.

Requirements:

- completion by Projection + predicate
- typed predicate input derived from the exposed Message input
- subscribe-before-read or equivalent race-free implementation
- no separate `Observation` abstraction
- waiting represented as Effect
- timeout / interruption supplied by Effect composition (shipped as a `timeout`
  option instead; see [Implementation status](#implementation-status))
- coexistence with Message-based completion

This validates the Solid `until()` lesson in a subsystem that already has the
necessary host seams.

### Phase 3 — Remote Projection refresh

> Done: shipped as `Data.refresh(model, projection | Surface)`, mark-only. Its
> generations are held per field and per connection, so a refresh restarts the
> read entries observing what was refreshed and leaves the rest running — the
> first version restarted every entry, which is recorded under known issues.

Only if useful in real examples:

- allow Remote to revalidate requirements contributed by a Projection / Surface
- keep the operation Remote-specific
- avoid global Foldkit refresh semantics
- decide how refresh interacts with live data, staleness, deduplication, and
  existing requirement planning

### Phase 4 — AsyncData view ergonomics

> Done: shipped as `RemoteData.render`, with a fourth `notFound` branch and one
> `Freshness` tag in place of the sketch's two booleans. See [Implementation
> status](#implementation-status).

If repeated view code justifies it, add a small rendering interpreter over
`AsyncData` that keeps stale/refreshing data visible by default.

This is ergonomic sugar over explicit Model state, not a suspension mechanism.

### Phase 5 — runtime activity introspection, only if demanded

If devtools or adapters need it, expose scoped runtime execution metadata.

Do not use it as a default second input to application views.

> Answered from the Model instead: `Data.inspect(model).loading` and
> `mutations.pending`. No runtime execution metadata is exposed; see
> [Implementation status](#implementation-status).

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