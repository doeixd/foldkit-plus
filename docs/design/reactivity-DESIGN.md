# Foldkit / Foldkit Plus: Fine-Grained Reactivity & Rendering Handoff

**Status:** Design / implementation handoff
**Date:** September 17, 2026
**Primary repos:** `foldkit/foldkit`, `doeixd/foldkit-plus`
**Related reference repo:** `doeixd/effect-atom-jsx`

---

> **Status: not started here, and it cannot start here.** Checked against both
> sides.
>
> Nothing in this repository implements any of it: there is no
> `packages/reactivity` and no `packages/reactivity-html`.
>
> That is the design working as written rather than an oversight. §2 says core
> Foldkit must not learn Surface, Projection or FieldRef, and that core should
> instead expose three generally useful primitives — *observe committed Model
> transitions*, a *persistent render boundary*, and a *managed renderer leaf* —
> which `foldkit-plus` then interprets. **None of the three exists yet.** Core's
> `render` and `mount` expose `define`, `defineStream`, `ViewState`,
> `liveViewStateChanges` and `mapMessage`, and nothing resembling a persistent
> boundary or a renderer leaf (checked against `foldkit` 0.158.2).
>
> So the dependency runs the wrong way for this repository to start: the Plus
> packages are defined as interpreters of primitives that have to land in
> `foldkit/foldkit` first. Building them here before those primitives exist
> would mean either reaching around core's rendering — which is the coupling §2
> exists to prevent — or inventing the primitives locally and then discovering
> upstream chose a different shape.
>
> Worth being honest about the second gate too: the two Plus packages are
> sketched as *potential responsibilities* rather than designed. Even with the
> core primitives in hand, this document is not yet something to build from.
>
> **This is the one item in the deferred-work plan that belongs to a different
> repository**, and it should be tracked there rather than here.

# 1. Purpose

The goal of this work is to investigate and implement a path toward **fine-grained rendering and change propagation for Foldkit** while preserving Foldkit's core programming model:

```text
Model
  +
Message
  +
update
  ↓
next Model + Commands
```

We do **not** want to turn Foldkit into Solid, introduce mutable signals as a second state system, or weaken the Model/Message/update architecture.

The target is instead:

> Keep Foldkit's state-machine semantics, but make propagation from Model changes to consumers substantially more precise.

The long-term ideal is:

```text
SEMANTICS

Message
   ↓
update
   ↓
Model


DEPENDENCIES

FieldRef
   ↓
Projection
   ↓
Surface


PROPAGATION

Model transition
   ↓
which declared dependencies actually changed?
   ↓
which consumers depend on them?
   ↓
update only those consumers


RENDERING

affected consumer
   ↓
┌──────────────────┬────────────────────┐
│ structural region│ scalar DOM binding │
│ local VDOM patch │ direct DOM update  │
└──────────────────┴────────────────────┘
```

This could potentially give Foldkit a significant portion of the practical rendering-performance benefits associated with fine-grained frameworks such as Solid, while preserving much stronger global semantics around causality, state ownership, replay, agents, sync, server data, and inspection.

The strategy is deliberately incremental:

1. Prove useful performance gains in `foldkit-plus` with **no Foldkit core changes**.
2. Benchmark.
3. Identify what work remains.
4. Add only the smallest general-purpose extension seams to Foldkit core.
5. Keep the actual reactivity architecture in `foldkit-plus`.

Do not begin by rewriting the Foldkit renderer.

---

# 2. Non-negotiable architectural invariants

These rules should guide every design decision.

## Model remains authoritative state

Do not introduce an atom/signal/store graph containing copies of application state.

```text
GOOD

Message
   ↓
update
   ↓
Model
   ↓
reactive propagation


BAD

Message
   ↓
update
   ↓
Model

plus

Signals / atoms / stores
   ↓
another copy of app state
```

There must remain **one owner per datum**.

---

## Message/update remain the only application transition semantics

Reactivity is not allowed to become another way of changing Model.

Never introduce something equivalent to:

```ts
count.set(5)
```

for an application Model field.

Application state should still change through:

```ts
dispatch(Message.SetCount({ count: 5 }))
```

followed by:

```ts
update(model, message)
```

FieldRef setters and writable Projections remain infrastructure mechanisms, not authorization to bypass state-machine ownership.

Submodel-owned state must still change through the owning Submodel update path.

---

## Reactivity is propagation, not semantics

A useful mental model:

```text
Foldkit owns:

what happened?
what does it mean?
what is the next state?

Reactivity owns:

given the next state,
what actually needs to recompute?
```

This separation is essential.

---

## Explicit dependency data should be preferred over implicit runtime tracking

Solid-style systems discover dependencies by executing code:

```text
signal read
   ↓
current computation
```

Foldkit Plus already has a potentially stronger primitive:

```text
FieldRef
   ↓
Projection.dependencies
```

The dependency graph is explicit data.

Prefer this over Proxy-based Model read tracking unless later evidence strongly favors automatic tracking as optional sugar.

---

## Core Foldkit should remain ignorant of Plus concepts

Do not upstream:

```text
Surface
Projection
FieldRef
ReactiveProjection
Remote
Agent
Sync
```

into Foldkit merely to support this project.

Core changes should instead expose generally useful primitives such as:

```text
observe committed Model transitions
persistent render boundary
managed renderer leaf
```

`foldkit-plus` interprets those primitives.

---

# 3. Current Foldkit architecture relevant to this work

Inspect the current default branch before changing anything because Foldkit is moving quickly.

As of this handoff, relevant behavior includes the following.

## Rendering

The runtime approximately does:

```text
Message(s)
   ↓
update Model
   ↓
schedule render
   ↓
view(model, htmlBuilder)
   ↓
Document
   ↓
body VNode
   ↓
Snabbdom patch
```

The root view is still evaluated on a normal render pass.

The runtime owns a current VNode and patches it against the newly generated VNode.

Snabbdom is currently the renderer.

Do not assume that subtree-independent patching is currently safe: the renderer maintains one coherent VNode tree, and independently replacing a child VNode can leave parent VNode references stale unless the renderer explicitly supports persistent regions.

That is an important implementation constraint later.

---

# 4. Existing Foldkit optimization: `createLazy` / `createKeyedLazy`

This is extremely relevant.

Foldkit already exposes:

```ts
createLazy()
createKeyedLazy()
```

These memoize a rendered VNode.

Conceptually:

```ts
const lazy = createLazy()

lazy(renderTodoList, [todos])
```

If all arguments remain equal by reference, Foldkit returns the exact cached VNode.

Snabbdom then sees the same VNode reference and can avoid:

```text
rerunning the child view
allocating new child VNodes
walking/diffing that subtree
```

This means Foldkit already possesses a surprisingly useful foundation for the first version of this project.

The current implementation also handles important correctness details:

* cached VNodes retain dispatcher identity;
* Mount render ownership participates in the cache key;
* Submodel/boundary registrations are restored on cache hits;
* reused VNodes are carefully deduplicated;
* memoized VNodes are deliberately kept opaque during the top-level deduplication pass.

Do not recreate these semantics in Foldkit Plus.

Delegate VNode caching to core's existing lazy machinery whenever possible.

---

# 5. Current Foldkit Plus architecture

The central architectural principle of `doeixd/foldkit-plus` is:

> Extend a Foldkit application outward without creating another place to keep state.

Existing major concepts include:

```text
foldkit-surface
foldkit-agent
foldkit-remote
foldkit-sync
foldkit-durable
foldkit-mirror
foldkit-mixins
```

The most important package for this project is:

```text
foldkit-surface
```

Surface is already becoming the semantic backbone of the repo.

---

# 6. `foldkit-surface`: existing primitives

A `Surface.application(...)` produces typed Model references.

For example:

```ts
const App = Surface.application({
  Model,
  Message,
  initial,
  update,
})

App.fields.todos
App.fields.filter
App.fields.editor.draft
```

A `ModelRef` contains approximately:

```ts
interface ModelRef<Root, Value> {
  readonly Schema: Schema.Codec<Value, unknown>
  readonly optic: Optic.Optional<Root, Value>
  readonly dependency: readonly string[]
  readonly get: (root: Root) => Value
  readonly set: (root: Root, value: Value) => Root
}
```

A Projection contains approximately:

```ts
interface Projection<Root, Value> {
  readonly Model: Schema.Codec<Value, unknown>
  readonly dependencies: DependencyTree
  readonly metadata: Metadata
  readonly read: (root: Root) => Value
}
```

where:

```ts
type DependencyTree =
  readonly (readonly string[])[]
```

Example:

```ts
const Board = Projection.struct({
  todos: App.fields.todos,
  filter: App.fields.filter,
})
```

has dependencies roughly equivalent to:

```ts
[
  ["todos"],
  ["filter"],
]
```

Dynamic references already produce paths such as:

```ts
App.fields.todosById.at(id)
```

with paths conceptually resembling:

```text
todosById / <id>
```

Nested Projections merge and deduplicate dependency paths.

This is precisely the information required for declarative reactivity.

---

# 7. Important Projection caveat

A Projection's output value cannot automatically be assumed referentially stable.

For example:

```ts
Projection.struct({
  todos: App.fields.todos,
  filter: App.fields.filter,
})
```

may produce a new object:

```ts
{
  todos,
  filter
}
```

every time it is read.

Therefore this naive implementation is insufficient:

```ts
const value = projection.read(model)

lazy(render, [value])
```

because `value` may be a fresh object even when its dependencies did not change.

Instead, the reactive layer should use:

```text
Projection.dependencies
```

to determine whether the Projection needs to be read again.

This is a key implementation detail.

---

# 8. Dependency snapshots

For a Projection:

```text
dependencies:
  todos
  filter
```

the reactivity layer can produce a dependency snapshot:

```ts
[
  readPath(model, ["todos"]),
  readPath(model, ["filter"]),
]
```

and compare that to the previous snapshot with `Object.is`.

Because Foldkit Model updates are expected to preserve immutable structural sharing:

```text
unchanged branch
→ same reference

changed branch
→ new reference
```

this is cheap and useful.

Example:

```text
previous:

{
  todos: A,
  filter: B,
  editor: C
}

next:

{
  todos: A,
  filter: B,
  editor: D
}
```

A TodoList Projection depends on:

```text
todos
filter
```

and therefore sees:

```text
[A, B] → [A, B]
```

No Projection recomputation is needed.

No child view recomputation is needed.

The cached VNode can be returned.

---

# 9. `Projection.fromReader` and unknown dependencies

`Projection.fromReader(...)` can intentionally have zero dependencies.

For example:

```ts
Projection.fromReader(
  Schema.Number,
  model => model.todos.length,
  {
    dependencies: [["todos"]],
  },
)
```

is trackable.

But this:

```ts
Projection.fromReader(
  Schema.Number,
  model => model.todos.length,
)
```

currently declares no dependency information.

The reactivity package MUST remain correct in this situation.

A safe initial rule is:

```text
zero dependencies
→ dependency information unknown
→ treat Projection as always invalidated
```

Do not interpret zero dependencies as automatically meaning "constant".

Later we could distinguish:

```text
constant
unknown/global
explicit dependency set
```

if worthwhile.

For now correctness is more important than optimizing unusual escape-hatch Projections.

---

# 10. Inspiration from `doeixd/effect-atom-jsx`

This project was examined because it contains two different kinds of reactivity.

## Fine-grained computational reactivity

It has a homegrown Solid-like runtime:

```text
Signal
Computation
Memo
Effect
Owner
```

JSX compiler output targets this runtime.

Dependency edges are discovered by signal reads while computations execute.

This layer is currently not pluggable.

---

## Semantic reactivity

It separately defines an Effect service resembling:

```ts
interface ReactivityService {
  invalidate(keys): Effect<void>

  subscribe(
    keys,
    onInvalidate,
  ): Effect<Unsubscribe>

  flush(): Effect<void>
}
```

with different Layer implementations such as:

```text
live
test
```

Semantic keys are bridged into the local signal graph using hidden version signals.

Conceptually:

```text
semantic dependency
      ↓
hidden signal
      ↓
fine-grained computational dependency
```

This separation is useful inspiration.

However, do NOT port Effect Atom JSX's application model into Foldkit.

---

# 11. Major conceptual difference from Effect Atom JSX

Effect Atom JSX primarily discovers dependency structure through execution.

Foldkit Plus can describe dependency structure before execution.

Compare:

```text
effect-atom-jsx

execute tracked read
   ↓
discover key
   ↓
register dependency
```

versus:

```text
Foldkit Plus

FieldRef
   ↓
Projection.dependencies
   ↓
dependency known as data
```

The Foldkit approach enables uses beyond rendering:

```text
render invalidation
Remote requirements
Sync boundaries
Agent context
Mirror ownership
SSR
DevTools
Module inspection
architecture diagrams
```

The dependency graph can become part of the architecture itself.

That is an advantage worth preserving.

---

# 12. Target package structure

Provisional package split:

```text
packages/reactivity
packages/reactivity-html
```

Names may change, but preserve the separation.

## `foldkit-reactivity`

Renderer-independent.

Potential responsibilities:

```text
dependency snapshots
projection selectors
derived projection caching
change detection
propagation graph
subscriptions
Effect service / scheduler
diagnostics
```

It should depend on:

```text
foldkit-surface
Effect
```

but ideally not on browser DOM APIs.

---

## `foldkit-reactivity-html`

Foldkit renderer integration.

Potential responsibilities:

```text
Reactive.view
Reactive.keyed
Reactive.each
Reactive.when

later:
Reactive.text
Reactive.prop
Reactive.attr
Reactive.class
Reactive.style
```

It may depend on:

```text
foldkit-reactivity
foldkit
foldkit-surface
```

Do not put rendering APIs in `foldkit-surface`.

Surface remains semantic.

---

# 13. Phase 0 — baseline and investigation

Before implementing new runtime machinery:

1. Pin exact Foldkit and Effect versions used by `foldkit-plus`.
2. Run all existing Foldkit Plus tests.
3. Run Foldkit's relevant renderer and lazy tests.
4. Inspect:

   * `packages/foldkit/src/runtime/renderer.ts`
   * `packages/foldkit/src/vdom.ts`
   * `packages/foldkit/src/html/lazy.ts`
   * HTML boundary machinery
   * Mount lifecycle
   * hydration
   * Submodel rendering boundaries.
5. Locate existing Foldkit benchmarks:

   * pixel-art;
   * Lustre comparison if useful;
   * any renderer/view benchmarks.
6. Establish baseline measurements.

Do not change core yet.

---

# 14. Phase 1 — Plus-only projection-aware view memoization

This is the first real implementation.

It should require **zero core PRs**.

The idea:

```ts
const TodoListView = Reactive.view(
  TodoListProjection,
  (todos, h) => ...
)
```

or equivalent.

Internally a reactive view boundary stores:

```ts
{
  previousDependencies,
  previousProjectedValue,
  lazyVNodeSlot
}
```

On every normal root render:

```text
1. Read only dependency-path values.

2. Compare them to previous dependency values.

3. If unchanged:
     reuse previous projected value.

4. If changed:
     projection.read(model)
     cache new projected value.

5. Feed stable projected value into createLazy.

6. createLazy returns the cached VNode if projected value is unchanged.
```

Pseudo-code:

```ts
function makeReactiveView(projection, render) {
  const lazy = createLazy()

  let initialized = false
  let previousDependencies = []
  let projected

  return (model, h) => {
    const dependencies = snapshotDependencies(
      projection.dependencies,
      model,
    )

    const changed =
      !initialized ||
      !sameDependencies(
        previousDependencies,
        dependencies,
      )

    if (changed) {
      projected = projection.read(model)
      previousDependencies = dependencies
      initialized = true
    }

    return lazy(render, [projected])
  }
}
```

This is schematic, not final API code.

Respect core's existing lazy semantics rather than duplicating its VNode lifecycle.

---

# 15. What Phase 1 should achieve

Current naive Foldkit:

```text
Message
   ↓
update
   ↓
run root view
   ↓
rebuild large portions of VDOM
   ↓
diff
```

Phase 1:

```text
Message
   ↓
update
   ↓
run root view
   ↓
reactive boundaries inspect dependency refs
   ↓
most boundaries:
  dependency cache hit
   ↓
Projection doesn't run
child view doesn't run
VNode subtree isn't rebuilt
Snabbdom subtree isn't diffed
```

Example:

```text
App
├── Header
├── Sidebar
├── 10,000-row Grid
├── Inspector
└── Footer
```

Changing:

```text
inspector.selectedTab
```

should result conceptually in:

```text
Header       HIT
Sidebar      HIT
Grid         HIT
Inspector    MISS
Footer       HIT
```

The root view still runs.

That is acceptable in Phase 1.

Measure it before deciding whether root traversal is important enough to justify renderer changes.

---

# 16. Phase 1 API direction

Keep the API small.

Candidate:

```ts
const TodoListView = Reactive.view(
  TodoListProjection,
  (model, h) => ...
)
```

Potential Surface form:

```ts
const TodoListView = Reactive.surface(
  TodoListSurface,
  (model, h) => ...
)
```

Potential selector:

```ts
const CompletedCount = Reactive.select(
  App.fields.todos,
  todos =>
    todos.filter(todo => todo.completed).length,
)
```

Potential custom equality:

```ts
const Something = Reactive.select(
  SomeProjection,
  derive,
  {
    equals: (a, b) => ...
  },
)
```

Do not overbuild this API initially.

The minimum useful API is probably:

```text
Reactive.view
Reactive.keyed
Reactive.select
```

---

# 17. Derived selectors

Derived selectors provide the Foldkit equivalent of a reactive memo.

Solid:

```ts
const completeCount = createMemo(
  () => todos().filter(todo => todo.done).length,
)
```

Possible Foldkit Plus:

```ts
const CompleteCount = Reactive.select(
  App.fields.todos,
  todos =>
    todos.filter(todo => todo.done).length,
)
```

Behavior:

```text
todos reference unchanged
→ don't evaluate selector

todos changed
→ evaluate selector

derived result unchanged
→ stop propagation

derived result changed
→ consumers invalidate
```

This is important because an input branch can change without changing every derived value.

Use an explicit equality strategy where necessary.

For primitives:

```text
Object.is
```

may be enough.

For structured outputs, allow explicit equality rather than performing expensive deep comparison automatically.

---

# 18. Keyed rendering

Large lists are likely the strongest early benchmark.

Candidate:

```ts
const TodoRow = Reactive.keyed(
  TodosProjection,
  todo => todo.id,
  (todo, h) => ...
)
```

However, do not invent a duplicate list-reconciliation system if `createKeyedLazy` already provides the necessary caching semantics.

Investigate whether the correct first design is closer to:

```ts
const renderRow = Reactive.keyedView(
  TodoProjection,
  ...
)
```

used inside an ordinary Foldkit keyed list.

Remember current `createKeyedLazy` cache entries are not automatically evicted.

Therefore dynamic/unbounded key domains need care.

Do not accidentally create permanent cache growth for:

```text
search query strings
cursor values
unbounded temporary IDs
```

Benchmark bounded entity IDs first.

---

# 19. Benchmark Phase 1 before proposing core changes

This is a hard requirement.

Compare at minimum:

```text
A. naive Foldkit
B. manually optimized Foldkit using createLazy/createKeyedLazy
C. Foldkit + foldkit-reactivity-html
D. Solid
E. React if convenient/useful
```

Important scenarios:

```text
single counter update

large mostly-static application
with one small changing region

1,000-row list:
  update one row

10,000-row list:
  update one row

insert one row

remove one row

reorder rows

large form:
  edit one field

dashboard:
  one widget refreshes

pixel-art:
  one cell / small region changes

rapid burst:
  many Messages before one animation frame
```

Measure separately where possible:

```text
update time
view time
VNode allocation
patch time
DOM mutations
total frame time
memory
GC
```

Also count:

```text
number of view functions executed
number of Projection reads
number of VNodes constructed
```

The point is not merely to produce one benchmark score.

We want to know **where remaining work occurs**.

---

# 20. Expected Phase 1 performance profile

Do not assume Solid parity.

Expected behavior:

```text
                    Root View   Child View   VDOM subtree   DOM
Naive Foldkit          yes         yes           diff       patch
Manual lazy            yes       maybe        maybe skip    patch
Reactive.view          yes       precise       mostly skip  patch
Persistent regions     no*       precise       local only   patch
Direct binding         no*         no             no        direct
```

`*` means root view need not run for the individual update after the deeper renderer work.

Phase 1 can still provide meaningful wins because expensive child views and subtree VDOM diffing may dominate root traversal.

Measure rather than speculate.

---

# 21. Better change detection: compare registered dependency paths

Earlier brainstorming considered recursively diffing entire Models into a `ChangeSet`.

That may not be necessary.

Because Projections already tell us which paths matter, a more efficient approach is:

```text
active dependency registry

todos
filter
editor.draft
session.user
...
```

For each committed transition:

```ts
oldValue = readPath(previousModel, dependency)
newValue = readPath(currentModel, dependency)

changed = !Object.is(oldValue, newValue)
```

This means Foldkit Plus does not need to recursively traverse the entire Model.

It compares only paths somebody actually depends on.

This is likely the better default architecture.

---

# 22. Dependency path indexing

A naive implementation is:

```text
O(number of active dependency paths)
```

per Model transition.

That may already be cheap enough.

If not, dependency paths can later form a trie:

```text
root
├── todos
│   ├── 42
│   │   ├── title
│   │   └── completed
│   └── 91
└── editor
    └── draft
```

Structural sharing allows aggressive short-circuiting:

```text
previous.todos === current.todos
→ every child of "todos" is unchanged
```

Only descend where an ancestor reference changed.

Do not implement the trie until benchmarks justify it.

---

# 23. Phase 2 — renderer-independent propagation engine

Once Phase 1 behavior is understood, add the reusable propagation layer.

Potential service:

```ts
interface PropagationService<Model> {
  readonly publish:
    (
      previous: Model,
      current: Model,
    ) => Effect.Effect<void>

  readonly subscribe:
    (
      dependencies: DependencySet,
      listener: () => void,
    ) => Effect.Effect<Unsubscribe>

  readonly flush:
    () => Effect.Effect<void>
}
```

Exact API is open.

Potential implementations:

```text
Propagation.live
Propagation.sync
Propagation.test
```

For example:

```text
live
→ batch notifications in microtask/frame

sync
→ notify immediately

test
→ queue notifications until explicit flush
```

This is inspired by `effect-atom-jsx` semantic reactivity.

But improve one thing:

> Do not use a module-level ambient singleton if a runtime-local service can be used.

Multiple Foldkit runtimes embedded on one page should be isolatable.

---

# 24. `ChangeSet`

A useful public/internal representation may still exist:

```ts
interface ChangeSet {
  readonly changed: ReadonlySet<Dependency>
}
```

but it need not mean:

> every structural difference anywhere in Model.

It can instead mean:

> the registered dependency identities whose observed values changed during this transition.

This distinction makes change detection demand-driven.

DevTools can still expose it as:

```text
Changed dependencies:
  editor.draft
  editor.dirty
```

---

# 25. Core PR candidate #1 — committed Model transition observation

For independent propagation outside the ordinary root render, Foldkit Plus needs a safe way to observe Model transitions.

Desired semantics:

```ts
interface ModelTransition<Model, Message> {
  readonly previous: Model
  readonly current: Model
  readonly message: Message
}
```

Potential extension point:

```text
Runtime transition observer
```

Do not commit to the public API name yet.

Requirements:

* fires after a successful application update;
* clearly define whether it fires before/after command scheduling;
* clearly define whether batched Messages produce individual events;
* preserves Message attribution;
* does not permit mutation of runtime state;
* works per Foldkit runtime;
* has lifecycle/disposal semantics;
* devtools replay semantics must be explicit;
* should be useful independently of Reactivity.

General uses beyond this project:

```text
profiling
analytics adapters
custom devtools
tracing
external debugging
renderer extensions
```

This is therefore a plausible small upstream PR.

Do not open it until the Plus prototype shows why it is needed.

---

# 26. Core PR candidate #2 — persistent render region

Phase 1 still runs the root view.

To avoid that, Foldkit needs some notion of an independently invalidatable rendered region.

Desired conceptual behavior:

```text
initial render:

root
├── Header region
├── Grid region
└── Inspector region


later:

editor dependency changes
          ↓
Inspector region only
          ↓
rerender Inspector
          ↓
patch its VDOM
```

Possible abstract primitive:

```ts
RenderBoundary
```

or:

```ts
Html.region(...)
```

Do not settle on API before inspecting renderer internals.

### Critical technical problem

The current Foldkit renderer owns one coherent Snabbdom VNode tree.

If an extension independently does:

```text
patch oldChildVNode → newChildVNode
```

the root VNode's parent children array may still contain `oldChildVNode`.

Later root patches could therefore operate against stale VNode state.

So independent region patching is **not** merely exposing `patch()`.

Core needs a primitive that keeps renderer ownership coherent.

Possible implementation families include:

```text
persistent wrapper VNode
renderer-owned child slot
component/thunk-like VNode
anchored sub-render root
Snabbdom module/hook extension
```

Investigate before proposing the PR.

This is probably the deepest technical uncertainty in the project.

---

# 27. Core PR candidate #3 — managed renderer leaf

Only pursue after region-level benchmarks.

The purpose is to enable direct DOM updates for trivial scalar bindings.

Example desired Plus API:

```ts
Reactive.text(
  App.fields.count,
  count => String(count),
)
```

Long-term behavior:

```text
count changes
    ↓
projection invalidated
    ↓
existing Text node
    ↓
node.data = "42"
```

No child view rerun.

No VDOM construction.

No tree diff.

Other potential bindings:

```ts
Reactive.prop(...)
Reactive.attr(...)
Reactive.class(...)
Reactive.style(...)
Reactive.hidden(...)
Reactive.checked(...)
Reactive.value(...)
```

Core should not understand reactive dependencies.

Core only needs a renderer-safe managed leaf lifecycle such as:

```text
create
update
destroy
hydrate
```

Again, exact API is open.

---

# 28. Direct DOM writes must not fight Snabbdom

Do not implement arbitrary direct mutations that Snabbdom believes it owns.

If:

```text
VNode says text = "4"
```

and Plus mutates the DOM to:

```text
"5"
```

while the VNode remains stale, a later patch may overwrite the direct mutation or make incorrect assumptions.

A correct direct-binding design must establish renderer ownership semantics.

Possible paths:

1. A VNode/leaf type whose DOM content is explicitly externally managed.
2. An opaque persistent region Snabbdom never descends into.
3. A core renderer primitive that updates both live DOM and renderer state.

Do not ship a fragile DOM mutation hack just to win a benchmark.

---

# 29. Interesting prototype possibility using existing lazy boundaries

There is one experiment worth exploring.

A persistent memoized VNode already becomes opaque to Snabbdom on cache hits.

Potentially:

```text
lazy VNode
  +
Mount captures element
  +
transition observer updates DOM directly
```

could demonstrate direct-binding performance.

However this must be treated as an experiment only.

It must be tested against:

```text
normal rerenders
hydration
DevTools replay
unmount
view transitions
Submodels
crash rendering
Mount lifecycle
```

If correctness depends on undocumented Snabbdom behavior, do not make it the production design.

---

# 30. The Solid analogy

The eventual mapping is approximately:

```text
SOLID

Signal
  ↓
Memo
  ↓
Computation
  ↓
DOM binding


FOLDKIT TARGET

Model field
  ↓
FieldRef
  ↓
Projection
  ↓
derived Projection/selector
  ↓
render consumer
  ↓
DOM binding
```

Mutation differs intentionally:

```text
Solid:

setCount(5)
   ↓
Signal changes


Foldkit:

Message.SetCount(5)
   ↓
update
   ↓
Model changes
```

The resulting reactive propagation graph can be similar without making state ownership similar.

---

# 31. Surface integration

Surface may become a particularly natural reactive unit.

A Surface already represents roughly:

```text
what may this consumer observe?
what Messages may it cause?
```

Its Projection therefore describes everything the feature reads.

This allows:

```text
Surface
├── observation boundary
├── capability boundary
└── potentially invalidation boundary
```

Potential API:

```ts
Reactive.surface(
  BoardSurface,
  (board, h) => ...
)
```

A Surface can act like an explicit reactive island.

Do not, however, make Surface itself stateful.

Surface remains static architecture data.

---

# 32. Mixins integration

`foldkit-mixins-surface` already associates a Surface with a restricted renderer.

Eventually a Surface-backed Mixins view could automatically gain projection-aware invalidation.

Potential direction:

```text
SurfaceView
   ↓
Surface Projection
   ↓
Reactive boundary
   ↓
Mixins slots/rendering
```

But do not tightly couple reactivity to Mixins in Phase 1.

First prove the primitive with ordinary Foldkit HTML.

---

# 33. Remote integration

`foldkit-remote` already uses Projection metadata to know what server-owned data an active Surface requires.

The same Projection may therefore drive both:

```text
what data needs to be fetched
```

and:

```text
what rendered consumer needs to be invalidated
```

Example:

```text
ProjectSurface Projection
       │
       ├── Remote interprets metadata:
       │      fetch Project:p123 fields
       │
       └── Reactivity interprets dependencies:
              rerender if relevant Model cache state changes
```

Keep those concerns separate.

Remote remains responsible for obtaining/reconciling server facts.

Reactivity only responds to resulting Model changes.

---

# 34. Sync integration

Sync similarly should require no new state mechanism.

A replicated durable Message changes the Foldkit Model through existing update/replay semantics.

After that:

```text
Model changed
   ↓
same Projection dependency propagation
```

Reactive rendering must not care whether the triggering Message originated from:

```text
human interaction
Command
Remote response
Sync replay
Agent
URL Mirror
Subscription
```

It only observes the committed state transition.

That uniformity is valuable.

---

# 35. SSR relationship

There is a parallel effort to build:

```text
doeixd/foldkit-plus/packages/ssr
```

starting from Foldkit's existing experimental server rendering and then exploring improved serialization/hydration behavior.

Do not couple these projects prematurely.

However, the long-term designs reinforce one another.

If rendering eventually represents:

```text
static structure
reactive regions
reactive scalar bindings
```

then SSR can potentially emit:

```text
HTML
+
small binding/region metadata
```

and hydration can attach:

```text
Projection A → existing DOM node
Projection B → existing region
```

instead of rebuilding a large client-side tree merely to discover dependencies.

Potential long-term flow:

```text
server

Projection graph
   ↓
render
   ↓
HTML + binding manifest


browser

adopt HTML
   ↓
restore binding graph
   ↓
attach event/Model propagation
```

This could move Foldkit toward more resumable/fine-grained hydration.

But browser-only reactive rendering should be proven first.

---

# 36. DevTools opportunity

Explicit dependency data can make fine-grained rendering unusually explainable.

For each Message, DevTools could eventually show:

```text
Message:
  CompletedTodo("42")

Model dependencies changed:
  todos.42.completed

Consumers invalidated:
  TodoRow("42")
  CompletedCount

Consumers skipped:
  Header
  Sidebar
  TodoRow("41")
  TodoRow("43")
  UserMenu
```

And:

```text
Why did TodoRow("42") render?

CompletedTodo("42")
   ↓
changed todos.42.completed
   ↓
TodoRowProjection depends on todos.42
   ↓
boundary invalidated
```

Signal frameworks often have to reconstruct explanations from runtime graph edges.

Foldkit can potentially expose them as domain-aware architecture data.

This should eventually be part of the DevTools story.

Do not make it part of the critical path to Phase 1.

---

# 37. Diagnostics

The Reactivity package should be inspectable.

Potential debug API:

```ts
Reactive.inspect(...)
```

could expose:

```text
registered boundaries
dependency paths
last dependency snapshots
last invalidation reason
render count
cache hits
cache misses
selector recomputations
```

For benchmarks/tests this is extremely useful.

Example:

```ts
expect(stats.grid.renderCount).toBe(1)
expect(stats.inspector.renderCount).toBe(20)
```

Avoid relying only on wall-clock benchmarks.

Operation counts make regressions deterministic.

---

# 38. Testing strategy

## Dependency snapshot tests

Test:

```text
primitive path
nested Struct path
record key
array index
optional missing key
same reference
different reference
ancestor changed but leaf unchanged
multiple dependencies
duplicate dependency paths
```

---

## Projection tests

Test:

```text
Projection.struct
Projection.select
Projection.compose
nested Projection
Projection.fromReader with explicit deps
Projection.fromReader without deps
Projection with Remote metadata
parameterized Surface
dynamic .at()
dynamic .index()
```

---

## View cache tests

Assert:

```text
unrelated Model change
→ projection reader not called
→ child view not called

relevant dependency change
→ projection reader called
→ child view called

dependency changes but derived equality same
→ downstream view not called
```

---

## Foldkit lifecycle tests

Critical:

```text
event dispatch
Mount
unmount
Submodel
nested Submodel
Commands
Subscriptions
DevTools replay
runtime disposal
crash view
view transition
hydration
SSR adoption
```

The optimization must not change semantic behavior.

---

# 39. Correctness over optimization

Every optimization must have a conservative fallback.

Examples:

```text
unknown dependency set
→ recompute

uncertain equality
→ invalidate

unsupported renderer situation
→ ordinary Foldkit render

hydration ambiguity
→ ordinary Foldkit hydration
```

Never skip a necessary computation merely to preserve benchmark numbers.

False-positive invalidation is acceptable.

False-negative invalidation is a correctness bug.

---

# 40. Structural sharing assumption

Much of the proposed efficiency assumes Foldkit applications use immutable update semantics:

```text
unchanged branch
→ preserve old reference
```

This is already natural for Foldkit.

Document this explicitly.

If a user mutates an object in place and returns it:

```ts
model.todos[0].done = true
return { model }
```

reference-based invalidation may not detect it.

That code is already hostile to deterministic immutable Model semantics and should not become something Reactivity attempts to support magically.

Potentially emit development diagnostics if feasible, but do not build expensive deep diffing solely to support mutation.

---

# 41. Package API should be pipeable/composable where appropriate

Foldkit Plus generally aims for Effect-compatible API design.

Prefer values that can compose rather than stateful classes.

Examples:

```ts
const Count = Reactive.select(
  App.fields.todos,
  todos => todos.length,
)
```

potentially:

```ts
App.fields.todos.pipe(
  Reactive.select(todos => todos.length),
)
```

if inference remains good.

Do not sacrifice TypeScript inference merely to force pipe syntax.

The API should remain:

```text
type safe
schema aware
application-owner safe
composable
inspectable
pluggable
```

Avoid magic string dependency keys.

The current typed dependency path/FieldRef machinery should remain canonical.

---

# 42. Do not duplicate Surface primitives

If Reactivity needs:

```text
Projection
dependency paths
ModelRef
FieldRef
application identity
```

extend/reuse `foldkit-surface`.

Do not create:

```text
ReactiveRef
ReactivePath
ReactiveProjection
```

that duplicate existing concepts unless there is a demonstrable semantic distinction.

Possible additions to Surface should remain small and generally useful.

---

# 43. Possible small Surface improvement

The reactivity work may reveal that a raw:

```ts
readonly string[][]
```

dependency representation is too weak.

Do not replace it preemptively.

If necessary, a future dependency value might carry:

```ts
interface Dependency<Root> {
  readonly path: readonly string[]
  readonly read: (root: Root) => unknown
  readonly identity: object
}
```

This would remove repeated generic path traversal and preserve richer identity.

But changing this touches the semantic backbone of many packages.

First determine whether ordinary path traversal is actually a bottleneck.

Current paths are sufficient for the prototype.

---

# 44. Possible dependency semantics

Path relationships need clear semantics.

If a consumer declares:

```text
todos
```

then replacing:

```text
todos.42.completed
```

necessarily changes the `todos` reference under immutable updates, so invalidating `todos` is correct.

If a consumer declares:

```text
todosById.42.completed
```

and a sibling changes:

```text
todosById.91.completed
```

we would ideally avoid invalidating the first consumer.

Therefore compare the **declared leaf value**, rather than blindly saying:

```text
ancestor todosById changed
→ every descendant invalid
```

A trie can use changed ancestor identity only as a reason to descend, not necessarily as the final invalidation decision.

---

# 45. Parameterized Surfaces

Parameterized Surfaces require dependency instances.

Example:

```ts
const Todo = App.surface("Todo", {
  params: { id: Schema.String },

  model: ({ model, params }) => ({
    todo: model.todosById.at(params.id),
  }),
})
```

Two active instances:

```text
Todo(id=42)
Todo(id=91)
```

should ideally have different dependency sets:

```text
todosById.42
todosById.91
```

This is important for keyed list precision.

Design the runtime registry around **bound Projection/Surface instances**, not merely static Surface definitions.

---

# 46. Runtime isolation

Multiple Foldkit applications can be embedded on a page.

Therefore:

```text
App A dependency registry
```

must never invalidate:

```text
App B dependency registry
```

Use:

```text
Surface.application owner token
+
Foldkit runtime identity
```

where necessary.

Do not create one global dependency registry.

---

# 47. Scheduling

Foldkit already batches/schedules rendering.

The new reactivity scheduler should not accidentally generate more paints.

Ideal behavior for a burst:

```text
Message A
Message B
Message C
       ↓
final Model
       ↓
one invalidation flush
       ↓
one patch
```

Inspect current Message queue/rAF behavior before choosing whether Propagation flushes:

```text
synchronously
microtask
rAF
Foldkit commit phase
```

Initial Phase 1 inherits normal Foldkit scheduling automatically.

That is another reason to begin there.

---

# 48. DevTools replay and historical Models

Any persistent reactive state must distinguish:

```text
live runtime
historical replay render
```

Do not allow a historical DevTools render to:

```text
permanently mutate live dependency snapshots
reconnect resources
publish live invalidations
corrupt bound DOM state
```

Current Foldkit renderer already distinguishes Live vs Replay.

Study that machinery before introducing renderer-level subscriptions.

Phase 1 lazy memoization may inherit more of the existing correctness automatically than a custom propagation runtime would.

---

# 49. Hydration

Any future render region or direct DOM binding must support hydration explicitly.

Do not assume:

```text
fresh render semantics
==
hydration semantics
```

Foldkit hydration currently contains deliberate behavior around:

```text
attribute ordering
controlled inputs
Mount attachment
server root adoption
build IDs
view identities
```

New rendering primitives need dedicated hydration tests.

This is another reason not to introduce the managed DOM leaf until later.

---

# 50. Benchmark hypotheses

The project should explicitly test the following hypotheses.

## H1

Projection-aware lazy boundaries substantially reduce:

```text
child view executions
VNode allocation
Snabbdom subtree traversal
```

for localized updates.

---

## H2

For large applications, Phase 1 closes a meaningful portion of the performance gap between naive Foldkit and fine-grained frameworks.

---

## H3

After Phase 1, remaining cost is primarily one or more of:

```text
root view traversal
dependency snapshot reads
affected local VDOM patch
DOM mutation
```

The benchmark should tell us which.

---

## H4

If root traversal becomes significant, persistent independently invalidated regions provide a second large improvement.

---

## H5

Direct scalar bindings produce worthwhile additional improvement only for workloads dominated by tiny repeated updates.

Do not assume H5 before measuring H1-H4.

---

# 51. What success looks like

The project does not need to beat Solid in every benchmark.

A successful architecture would deliver something like:

```text
near-fine-grained localized rendering
+
Foldkit Model semantics
+
explicit Messages
+
pure update
+
replay
+
Submodel ownership
+
inspectable dependency graph
+
Remote/Sync/Agent/SSR integration
```

The differentiating claim is not:

> Foldkit is secretly Solid.

It is:

> Foldkit can achieve precise incremental computation without giving up explicit application semantics.

---

# 52. Core PR philosophy

Every core PR must meet this test:

> Would this primitive still make sense if `foldkit-plus/reactivity` did not exist?

Good examples:

```text
runtime transition observation
renderer extension boundary
managed render region
managed external leaf
```

Bad examples:

```text
import Surface into Foldkit
put Projection on Runtime
add Signal<ModelField>
teach Foldkit about Remote dependencies
```

Keep the dependency direction clean:

```text
Foldkit
   ↑
generic seams
   │
Foldkit Plus
   ↑
Surface / Reactivity
```

---

# 53. Proposed development order

Follow this order unless evidence forces a change.

## Step 1

Update `foldkit-plus` against current Foldkit if necessary.

Make sure baseline CI is clean.

---

## Step 2

Add benchmark fixtures before optimization.

Record baseline numbers.

---

## Step 3

Implement a minimal dependency snapshot utility in a new experimental Reactivity package.

Something conceptually like:

```ts
snapshot(projection, model)
sameSnapshot(a, b)
```

No rendering yet.

Test heavily.

---

## Step 4

Implement:

```ts
Reactive.select
```

with deterministic recomputation counters.

---

## Step 5

Implement:

```ts
Reactive.view
```

on top of Foldkit `createLazy`.

Use dependency snapshots to preserve a stable projected value when inputs did not change.

---

## Step 6

Implement the minimum useful keyed/list form.

Reuse `createKeyedLazy`.

---

## Step 7

Run benchmarks.

Produce a written performance report containing:

```text
before
after
where time disappeared
where time remains
cache hit rate
view execution counts
VNode allocation if measurable
patch cost
```

---

## Step 8

Only now evaluate core PR #1.

Ask:

> Can everything we currently want still happen during normal root renders?

If yes, do not upstream anything yet.

If independent subscriptions/regions clearly require committed transition observation, prepare a minimal PR.

---

## Step 9

Prototype a persistent renderer region in a Foldkit fork/branch.

Do not immediately upstream it.

Prove:

```text
correct VNode ownership
Mount correctness
Submodel correctness
hydration
replay
disposal
```

and benchmark it.

---

## Step 10

If results justify it, design the generic core API and submit the smallest PR.

---

## Step 11

Only after persistent regions are stable should direct DOM bindings be explored.

---

## Step 12

Integrate with SSR and DevTools after browser semantics stabilize.

---

# 54. Suggested initial repository layout

Possible:

```text
packages/
  reactivity/
    src/
      dependency.ts
      selector.ts
      propagation.ts
      diagnostics.ts
      index.ts
    test/

  reactivity-html/
    src/
      view.ts
      keyed.ts
      index.ts
    test/

examples/
  reactivity/
    src/
      main.ts
      benchmark.ts
```

Do not create empty abstractions for future stages.

For example, if Phase 1 does not need `propagation.ts`, omit it until Phase 2.

---

# 55. Naming

Working package names:

```text
foldkit-reactivity
foldkit-reactivity-html
```

Alternative vocabulary:

```text
Propagation
Incremental
Reactive
Derived
Selector
```

`Propagation` is attractive for the renderer-independent service because it emphasizes:

> reactivity does not own state.

Avoid terminology suggesting:

```text
Store
Signal Store
Atom Store
Reactive Model
```

because those imply a second state system.

---

# 56. Performance ergonomics

One major objective should be:

> Application authors should not manually thread `createLazy` everywhere.

Today an optimized Foldkit application may need manually selected:

```ts
createLazy
createKeyedLazy
```

calls.

The new layer should allow architectural declarations that already exist:

```ts
Projection
Surface
```

to imply the correct memoization.

For example:

```ts
Reactive.view(Board, renderBoard)
```

should ideally be enough.

Optimization follows the architecture instead of becoming bespoke memoization code.

---

# 57. Potential eventual compiler optimization

Do not implement now, but keep the architecture compatible with compilation.

Once dependencies are explicit:

```ts
Reactive.view(
  Projection.struct({
    count: App.fields.count,
  }),
  ...
)
```

a future compiler could lower scalar expressions into direct bindings.

Potential:

```ts
h.span([
  "Count: ",
  Reactive.text(App.fields.count),
])
```

could compile into:

```text
create Text node once
register FieldRef dependency
update text directly
```

No runtime Proxy tracking is required.

This may eventually make Foldkit's explicit dependency graph an excellent compilation target.

---

# 58. Relationship to JSX / React interoperability

There are separate Foldkit efforts around:

```text
wrapping React components
generating React components from Foldkit templates
Suspense / async interoperability
```

Do not make React interoperability a dependency of this project.

However persistent region/managed leaf primitives may later be useful for embedding:

```text
React
Web Components
canvas
other renderers
```

That is another reason generic renderer extension seams are preferable to reactivity-specific core APIs.

---

# 59. Risks

## Risk: Projection dependencies are incomplete

Mitigation:

```text
unknown/empty dependencies → conservative rerender
development warnings where appropriate
```

---

## Risk: too much dependency bookkeeping

Mitigation:

Start with simple arrays/path snapshots.

Optimize only with benchmark evidence.

---

## Risk: thousands of tiny reactive boundaries

Mitigation:

Benchmark boundary overhead.

Use region granularity intentionally.

Do not assume "more fine-grained is always faster."

---

## Risk: direct bindings violate VDOM assumptions

Mitigation:

Do not ship them before renderer ownership is explicit.

---

## Risk: runtime/global state leaks between apps

Mitigation:

Everything must be runtime/application scoped.

---

## Risk: DevTools replay corruption

Mitigation:

Integrate explicitly with Foldkit Live/Replay render modes.

---

## Risk: API complexity

Mitigation:

Phase 1 API should stay near:

```text
select
view
keyed
```

---

## Risk: attempting Solid parity becomes goal creep

Mitigation:

Optimize demonstrated Foldkit bottlenecks, not benchmark theater.

---

# 60. Questions the implementation should answer empirically

Do not answer these by intuition alone.

1. How much time does current Foldkit spend rerunning view functions?
2. How much time is VNode allocation?
3. How much is Snabbdom diffing?
4. How much does existing manual `createLazy` already solve?
5. Does Projection-driven lazy caching match manually tuned caching?
6. What does dependency path snapshotting cost at 10, 100, 1,000, and 10,000 dependencies?
7. At what application size does root-view traversal become meaningful?
8. Are independently patched regions worth their implementation complexity?
9. When do direct DOM bindings provide measurable gains beyond local VDOM patches?
10. Does explicit dependency declaration produce better DevTools/debugging than dynamic tracking?

---

# 61. First concrete implementation target

Build the smallest end-to-end proof.

Model:

```ts
{
  header: ...,
  todos: ReadonlyArray<Todo>,
  inspector: {
    selectedTab: ...
  }
}
```

Views:

```text
Header
TodoList
Inspector
```

Declare:

```text
HeaderProjection
TodosProjection
InspectorProjection
```

Instrument every view with a render counter.

Test:

```text
initial render:

Header      1
TodoList    1
Inspector   1
```

Then dispatch an Inspector-only Message.

Desired Phase 1 result:

```text
root Foldkit view executes

Header Projection read        0 additional
Header child view             0 additional

TodoList Projection read      0 additional
TodoList child view           0 additional

Inspector Projection read     +1
Inspector child view          +1
```

Then confirm Snabbdom doesn't descend into the cached Header/TodoList subtrees.

This is the first milestone.

---

# 62. Second concrete target: 10,000-row list

Build:

```text
10,000 keyed rows
```

Each row receives one immutable Todo object.

Update one row.

Desired behavior:

```text
9,999 row object references unchanged
1 row object reference changed
```

Using keyed reactive/lazy boundaries:

```text
9,999 cached row views
1 rerendered row
```

Compare against:

```text
naive Foldkit
manual createKeyedLazy
Reactive keyed abstraction
Solid
```

If Reactivity cannot approximately reproduce manually optimized `createKeyedLazy`, fix that before doing anything in core.

---

# 63. Acceptance criteria for Phase 1

Phase 1 is successful when all are true:

* no core Foldkit changes;
* no second application state store;
* Projection dependency information determines recomputation;
* irrelevant Model changes do not re-read affected Projections unnecessarily;
* irrelevant Model changes do not rerun child views;
* cached Foldkit VNodes are reused through core's existing lazy machinery;
* lifecycle semantics remain correct;
* benchmarks show the optimization working;
* manual `createLazy` remains available;
* ordinary Foldkit remains completely usable without Reactivity.

---

# 64. Acceptance criteria for a core transition-observer PR

If needed:

* generic Foldkit API;
* no dependency on Foldkit Plus;
* per-runtime lifecycle;
* previous/current Model available;
* Message attribution preserved;
* no behavioral changes without an observer;
* negligible overhead when unused;
* tested with batched Messages;
* tested with disposal;
* replay semantics documented;
* useful for profiling/tracing independently of reactivity.

---

# 65. Acceptance criteria for persistent regions

Do not consider this finished merely when a demo works.

Must correctly handle:

```text
initial render
repeated updates
parent update
child update
nested regions
region removal
region insertion
keyed regions
Mount
Submodel
event dispatch
runtime disposal
crash
DevTools replay
hydration
view transitions
```

And the root VNode representation must remain coherent after independent child updates.

---

# 66. Desired final architecture

The eventual system may look approximately like:

```text
                      APPLICATION SEMANTICS

DOM / external event
        ↓
     Message
        ↓
      update
        ↓
       Model
        │
        │
        ▼
                 DECLARED DEPENDENCIES

      FieldRef / ModelRef
              ↓
          Projection
              ↓
           Surface
              │
              │
              ▼
                      PROPAGATION

      previous Model ───── current Model
              │
              ▼
      compare active dependency paths
              │
              ▼
          ChangeSet
              │
              ▼
      derived selectors / equality
              │
              ▼
       affected consumers
          /          \
         /            \
        ▼              ▼

STRUCTURAL REGION   SCALAR BINDING
       │                 │
       ▼                 ▼
 local VDOM patch    direct DOM update
```

While every other Plus subsystem continues to use the same architecture:

```text
Projection / Surface
     │
     ├── Rendering
     ├── Remote
     ├── Sync
     ├── Agent
     ├── Mirror
     ├── SSR
     └── DevTools
```

This is the larger opportunity.

Surface becomes a semantic intermediate representation for Foldkit Plus, and Reactivity becomes one more interpreter of that representation.

---

# 67. Things the agent should NOT do

Do not:

* add signals containing copies of Model fields;
* add an atom store;
* make `Surface` stateful;
* bypass `update`;
* bypass Submodel update ownership;
* recursively deep-diff the whole Model before measuring simpler approaches;
* build a Proxy Model reader first;
* rewrite Snabbdom first;
* independently patch random child VNodes without preserving root VNode consistency;
* mutate DOM behind Snabbdom without explicit ownership semantics;
* create global singleton dependency state;
* conflate Remote invalidation with render invalidation;
* conflate Sync with render invalidation;
* redesign SSR before browser reactivity works;
* open large core PRs before Plus-side benchmarks exist;
* chase benchmark numbers at the expense of Foldkit semantics.

---

# 68. Immediate instructions to the agent

Begin with repo reconnaissance, not implementation.

1. Pull/inspect current `foldkit/foldkit`.
2. Pull/inspect current `doeixd/foldkit-plus`.
3. Read:

   * Foldkit renderer;
   * VDOM wrapper;
   * lazy implementation;
   * HTML boundary implementation;
   * Mount lifecycle;
   * Surface `ModelRef` and `Projection`;
   * relevant tests.
4. Confirm all assumptions in this document against current code.
5. Write down any differences before changing the design.
6. Create baseline benchmark(s).
7. Implement dependency snapshot tests.
8. Implement the smallest Plus-only `Reactive.view` proof.
9. Benchmark.
10. Report findings before attempting renderer/core changes.

If an assumption in this handoff conflicts with current source code, **current source wins**.

---

# 69. Initial research question to answer

The first question is deliberately narrower than:

> Can Foldkit become as fast as Solid?

Answer this instead:

> **How much rendering work can Foldkit avoid merely by combining existing `createLazy`/`createKeyedLazy` semantics with the explicit dependency information already present in Foldkit Plus Projections?**

That experiment is cheap.

Its results determine almost everything that follows.

If the answer is "a lot," then we have validated the architectural direction before touching Foldkit core.

If root traversal or local VDOM patching remains dominant, then we have strong evidence for the next renderer seam.

---

# 70. North star

The final design should preserve this sentence:

> **Foldkit remains a state machine; reactivity merely makes observing the consequences incremental.**

Or visually:

```text
             WHAT THE PROGRAM MEANS
                    Foldkit

Message ─────→ update ─────→ Model
                              │
                              │
                              ▼
                  WHAT NEEDS TO NOTICE?
                    Foldkit Plus

                    Projection
                        │
                   Propagation
                        │
                 affected consumer
                        │
                        ▼
                     renderer
```

That is the architecture to protect.
