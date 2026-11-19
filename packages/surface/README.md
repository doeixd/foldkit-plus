# `foldkit-surface`

When a [Foldkit](https://foldkit.dev/) app grows—one `Model` holding everything and one `update` handling every `Message`—different parts of your app still need clear boundaries. A screen should declare which fields it reads, an AI agent or page block should only be able to send specific `Message`s, and a sync or data-fetching layer needs to know what data a view depends on without running the UI or duplicating TypeScript interfaces by hand.

`foldkit-surface` derives typed field references, read projections, and `Message` subsets directly from your existing `Model` and `Message` Schemas, and pairs them into a named contract called a **Surface**. Because a Surface is inspectable data tied to your `Model` Schema, it cannot name a field your `Model` lacks, and packages such as `foldkit-remote`, `foldkit-sync`, and `foldkit-agent` can inspect what a feature reads and may trigger without running anything.

See five feature Surfaces and a `Module` wired together in [`examples/todo-app`](../../examples/todo-app), or read [Server-derived state](../../docs/remote.md).

## How a Surface reads state and sends Messages

A Surface is built in three steps from your `Model` Schema: `Surface.application` generates typed field references from the Schema, a `Projection` selects the fields a feature reads, and a named `Surface` pairs that `Projection` with the `Message`s the feature may send. At run time, `Surface.read` extracts the feature's input purely from the `Model`, while dispatched `Message`s flow through your `update` to produce the next `Model`.

Listing `Message`s on a Surface constrains what consumers (such as an agent) may send; your `update` remains the single place that defines what those `Message`s do. If nothing needs to inspect a feature's data or `Message` dependencies, a plain function over your `Model` is simpler.

## Install

```bash
pnpm add foldkit-surface
```

`foldkit` and `effect` are peer dependencies.

## A first Surface

This defines a todo app, pairs the `todos` and `selectedTodoId` fields with two allowed `Message`s into a `TodoList` Surface, and reads that slice from a sample `Model`:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { ModelRef, Projection, Surface } from 'foldkit-surface'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  todosById: Schema.Record(Schema.String, Todo),
  selectedTodoId: Schema.Option(Schema.String),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  SelectedTodo: { id: Schema.String },
})
const App = Surface.application({ Model, Message })
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, selectedTodoId: model.selectedTodoId }),
  messages: [Message.ToggledTodo, Message.SelectedTodo],
})
const model: typeof Model.Type = {
  todos: [{ id: 't1', title: 'Read the guide', done: false }],
  todosById: {},
  selectedTodoId: Option.some('t1'),
}
Surface.read(TodoList, model)
// { todos: [{ id: 't1', title: 'Read the guide', done: false }], selectedTodoId: Option.some('t1') }
```

What happened:

- `TodoList` binds a projection of `todos` and `selectedTodoId` to `[Message.ToggledTodo, Message.SelectedTodo]`, excluding `CreatedTodo`.
- `Surface.read(TodoList, model)` returns only `{ todos, selectedTodoId }`, omitting `todosById`.
- `Surface.view(TodoList, ...)` binds a renderer to that slice, while `foldkit-remote`, `foldkit-sync`, and `foldkit-agent` inspect `TodoList` to derive fetches, replication, and agent tools.

(`todosById` in `Model` is used by the dynamic record-lookup examples below; in a real application, keep a single authoritative collection.)

## Field references

`Surface.application` generates a reference tree from your `Model` Schema, one node per field. A ref's string keys are strictly its child fields, so `Model` fields may use any name (`index`, `at`, `get`, `select`). A ref's own metadata lives under a symbol accessed via `ModelRef.focus`: its optic, codec, dependency path, `get`, `set`, and literal field name.

```ts
App.model.todos                                // FieldRef<Model, Todo[], 'todos'>
App.model.selectedTodoId                       // FieldRef<Model, Option<string>, 'selectedTodoId'>
ModelRef.focus(App.model.todos).dependency     // ['todos']
ModelRef.focus(App.model.todosById).at('t1')   // OptionalRef<Model, Option<Todo>> (dynamic key)
ModelRef.focus(App.model.todos).index(0)       // OptionalRef<Model, Option<Todo>> (dynamic index)
```

Nested `Schema.Struct` fields recurse into child `FieldRef`s. Accessing an array with `index(i)` or a record with `at(key)` returns an `OptionalRef` (`ModelRef` yielding an `Option`). Because those lookups are dynamic, `Projection.pick` requires static field names and refuses them, though you can use them inside read-only `Projection`s. (`App.fields` is a deprecated alias for `App.model`; prefer `App.model`.)

`Projection.pick` turns static references into a writable projection holding `{ schema, dependencies, get, set }`:

```ts
const Shared = Projection.pick(App.model.todos, App.model.selectedTodoId)
// { schema, dependencies, get, set }
```

Each picked field uses its final key name (`App.model.post.id` becomes `id`), so picking two fields that share a leaf name (`post.id` and `viewer.id`) throws; place them in separate projections instead. A per-application owner token prevents mixing references across two structurally identical `Model`s. Duplicate members deduplicate, conflicting definitions throw, `Projection.compose` merges disjoint writable projections, and `ModelRef.fromOptic` builds a reference from an existing Effect optic.

## Projections

A `Projection<Root, Value>` pairs a `Model` codec for `Value` with a pure `read(root) => Value`, its `dependencies` (Model paths), and opaque `metadata` attached by other packages (such as `foldkit-remote` query requirements).

```ts
const Summary = Projection.struct({
  todos: App.model.todos,
  selectedTodoId: App.model.selectedTodoId,
})
const Titles = Projection.of(Todo)({ title: true }) // from the Schema
Projection.array(Titles) // Projection<ReadonlyArray<Root>, ReadonlyArray<Value>>
Projection.option(Titles) // Projection<Option<Root>, Option<Value>>
// Escape hatch for a value that is no ModelRef:
Projection.fromReader(Schema.Number, (model: typeof Model.Type) => model.todos.length)
```

`Projection.struct` accepts `ModelRef`s and nested `Projection`s, merging dependencies and metadata upward so a Surface can combine local fields with remote or synced slices.

### Derivations

Views often compute derived values on every render, such as filtered lists, counts, or summaries. `Projection.derive(on, derive)` caches the computed value and recomputes only when an object at one of `on`'s dependency paths changes identity:

```ts
const Open = Projection.derive([App.model.todos], model =>
  model.todos.filter(todo => !todo.done),
)
Open.read(model) // returns the same array reference while `model.todos` is unchanged
```

Pass field references or Projections in `on` (an empty `on` throws), and read only those dependencies inside `derive`. In development, pass `{ verify: import.meta.env?.DEV === true }` to re-run `derive` on cache hits and throw via `Equal.equals` if an untracked field changed; keep `verify` off in production since it doubles the work.

`derive` caches the single most recent result and returns the previous object reference whenever a new result has shallowly equal fields, matching `foldkit-mixins`' `SlotView.region`. Remote queries declare metadata rather than static Model paths, so passing a Remote query alone in `on` recomputes on every read. Name the store field (such as `App.model.remote`) in `on` and read the Remote query inside `derive` so the cache holds while the store stays unchanged.

To include a derived value inside `Projection.struct`, supply its output `Model` Schema:

```ts
const Count = Projection.derive([App.model.todos], model => model.todos.length, {
  Model: Schema.Number,
})
const Board = Projection.struct({ count: Count, selected: App.model.selectedTodoId })
```

A `Derived` value carries no metadata of its own, so Remote reads used inside it are still planned by the Remote read itself rather than by the struct. Omitting `Model` when placing a `Derived` inside `Projection.struct` is a type error (and throws at runtime if bypassed).

### Metadata

`Metadata` is re-exported from [`foldkit-metadata`](../metadata/README.md) so applications need only one import. Each package declares its own key once and reads only its own entries:

```ts
import { Metadata } from 'foldkit-surface'

const Flags = Metadata.key<string>('flags', {
  merge: (flags: ReadonlyArray<string>) => [...new Set(flags)],
  summarize: (flag: string) => flag,
})

const beta = Projection.fromReader(Schema.Boolean, (_model: typeof Model.Type) => false, {
  metadata: Flags.of('beta'),
})
Flags.get(Projection.struct({ beta, todos: App.model.todos }).metadata) // ['beta']
```

As projections compose, entries merge per key using that key's `merge` function. Lookup uses key object identity rather than string names, preventing collisions across packages (avoid duplicate installs or reloaded modules that create two instances of a key). `Metadata` values are opaque and frozen; `Surface.inspect` and `Module` format them using `summarize`.

### Closure

A projection is **closed** when its value after a `Message` depends only on the projection's previous value and that `Message`. `foldkit-sync` requires durable slices to be closed so edits replay identically across devices. `Closure.reads` tests closure by running `update` on the `Model` and again with every non-projection top-level field reset to `initial`, returning `[]` when closed or naming any outside fields that changed the output:

```ts standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Closure, Projection, Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  filter: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ClearedShown: {} })
const initial: Model = { todos: [], filter: '' }
const update = (model: Model, _message: typeof Message.Type) => ({
  // Removes the todos whose title is the local `filter`.
  model: { ...model, todos: model.todos.filter(todo => todo.title !== model.filter) },
})

const App = Surface.application({ Model, Message })
const shown: Model = { todos: [{ id: 'a', title: 'x' }], filter: 'x' }

Closure.reads({ initial, update }, Projection.pick(App.model.todos), shown, Message.ClearedShown())
// ['filter']: the slice after ClearedShown depends on it
```

Returned Commands are ignored and nothing is persisted during this check. `Sync.mount` runs `Closure.reads` on every durable dispatch; see the [Sync README](../sync/README.md#what-makes-a-message-durable).

### A closed Surface

Setting `closed: true` on a Surface declares that its `messages` depend only on the Surface's own projection and that other `Message`s leave its projection unchanged. `Closure.violations(app, surfaces)` builds a step checker `(before, message, after) => violations` for tests and walks (parameterized Surfaces are excluded since they have no single static projection):

```ts standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Closure, Surface } from 'foldkit-surface'

const Model = Schema.Struct({ todos: Schema.Array(Schema.String), tally: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Emptied: {}, Counted: {} })
const initial: Model = { todos: ['a'], tally: 0 }
const update = (model: Model, message: typeof Message.Type) => ({
  model: Message.match(message, {
    Emptied: () => ({ ...model, todos: [] }),
    Counted: () => ({ ...model, tally: model.tally + 1 }),
  }),
})

const App = Surface.application({ Model, Message, initial, update })
const Shown = App.surface('Shown', {
  model: ({ model }) => ({ todos: model.todos }),
  messages: [Message.Emptied],
  closed: true,
})

const check = Closure.violations(App, [Shown])
const counted = Message.Counted()
check(initial, counted, update(initial, counted).model)
// []: Counted is outside the Surface and leaves its projection alone
```

Each violation is a `ClosureViolation`: `Reads({ surface, fields })` when an allowed `Message` reads outside fields, or `Outside({ surface })` when an outside `Message` mutates the projection (match with `ClosureViolation.$match`). `Surface.contract` preserves `closed: true`.

## Applications

`Surface.application({ Model, Message })` creates an `Application` holding `App.Model`, `App.Message`, `App.model` (`App.fields` is a deprecated alias), `App.owner`, and `App.surface`. Passing `initial` and `update` as well creates a `RunnableApplication` for replicators, threading Command resource requirements into the type.

When `update` depends on values built from `App.model` (such as a Remote domain or placed Bundle), call `App.runnable({ initial, update })` afterward rather than calling `Surface.application` a second time, keeping the same owner token across all references:

<!-- docs-check standalone define todoApp
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { ModelRef, Projection, Surface } from 'foldkit-surface'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  todosById: Schema.Record(Schema.String, Todo),
  selectedTodoId: Schema.Option(Schema.String),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  SelectedTodo: { id: Schema.String },
})
const initial: typeof Model.Type = { todos: [], todosById: {}, selectedTodoId: Option.none() }
const update = (model: typeof Model.Type, _message: typeof Message.Type) => ({ model })
declare const model: typeof Model.Type
declare const root: typeof Model.Type
declare const restoredTodos: typeof Model.Type['todos']
-->

```ts
const Made = Surface.application({ Model, Message })
// …what the update needs, built over Made.model…
const App = Made.runnable({ initial, update })
// App.model is Made.model: one application.
```

## Message subsets

A subset selects typed variants of one application's `Message` union by constructor reference:

```ts
import { MessageSet } from 'foldkit-surface'

const TodoChanges = MessageSet.make(App, [Message.CreatedTodo, Message.ToggledTodo])
const SelectionChanges = MessageSet.make(App, [Message.SelectedTodo])
const AllChanges = MessageSet.union(TodoChanges, SelectionChanges)
```

A subset carries its constructors, a pure codec for those variants, a `tags` set, and an `includes` guard. Passing constructors from another application or duplicate tags throws. `foldkit-sync` and `foldkit-agent` attach durability or agent-visibility policies onto these subsets.

## Actions

An `Action` defines a named capability—such as an AI agent tool or a page Block button—that validates input and produces one of your application's `Message`s so effects stay in `update`:

```ts
import { Action } from 'foldkit-surface'

const SelectTodo = Action.define({
  name: 'selectTodo',
  description: 'Select a todo',
  input: Schema.Struct({ id: Schema.String }),
  toMessage: input => Message.SelectedTodo(input),
})

Action.run(SelectTodo, { id: 't1' }) // Result: the Message, or why the input was refused
```

`Action.run` decodes inputs against `input` before `toMessage` runs, so untrusted payloads from a Document or tool call are validated first. Declare once and pass to `Agent.action(SelectTodo)` or a page Catalog.

## Surfaces

`App.surface(name, { params?, model, messages? })` pairs a projection (returning a `Projection` or a plain object of `Projection`s and `ModelRef`s) with the `Message`s a feature may send:

```ts
const TodoDetail = App.surface('TodoDetail', {
  model: ({ model }) => ({ todos: model.todos, selectedTodoId: model.selectedTodoId }),
  messages: [Message.ToggledTodo],
})

// A parameterized Surface may read `params`; dynamic lookups are OptionalRefs.
const ById = App.surface('ById', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({ todo: ModelRef.focus(model.todosById).at(params.id) }),
})

Surface.read(TodoDetail, root)                     // project purely
Surface.read(ById, root, { id: 't1' })
const render = Surface.view(TodoDetail, (todos, h) => h.div([], [`${todos.todos.length} todos`]))
Surface.rootView(TodoDetail, undefined, render)    // bound to the app root
```

The Surface's `Model` type is the projected record (`{ todos, selectedTodoId }`), and its `Message` type is the union of listed constructors (constructors from other applications fail to compile). Parameterized Surfaces require `params` whenever read.

- `Surface.at(surface, params)` tracks an active Surface instance where `params` is either static or `(model) => Option<Params>`, exposing `projectionOf(model)`, `owner`, and `messages` for consumers such as `foldkit-remote`'s `Data.subscriptions`.
- `Surface.each(child, { from, instances })` expands one Surface definition into zero-to-many keyed instances while its parent `from` Surface is active, throwing on duplicate keys or `__proto__`. Both `at` and `each` share the `SurfaceSource` interface read via `Surface.instances(source, model)`.

### `Surface.make`, the explicit form

`Surface.make(app, name, { Params?, model, messages? })` is the underlying function `App.surface` calls, taking a `Params` schema and a `model` callback returning a `Projection`.

## Modules

A `Module` collects an application's contracts as pure data so tools can inspect ownership and catch conflicts before starting a runtime. Sync, Remote, and Agent contracts carry a `contract` property; describe a Surface with `Surface.contract(surface, params)`.

```ts
import { Module } from 'foldkit-surface'

const Project = Module.make(App, [TodoDetail]) // and any Sync, Remote or Agent contracts

Module.validate(Project) // [] or findings
Module.manifest(Project) // fields, Messages, who owns each Model path, contracts
Module.toMarkdown(Project)
Module.toMermaid(Project)
```

For example, `Module.manifest` might list `route` and `selectedNoteId` as `LOCAL`, `notes` as `SYNC notes`, and `remote` as `REMOTE remote`. `Module.validate` catches cross-app contracts, duplicate `kind:name` entries, overlapping `Model` path owners, `Message`s claimed by two replication contracts, and undeclared paths or `Message`s. Feature modules can extend a `Module` with `Module.add(module, ...more)`.

### Laws in the graph

Contracts can declare laws and transitions that might break them in `Contract.laws` (`laws.entities` for Entity invariants and writes, `laws.model` for Sync document laws and `durable:<tag>` transitions, plus `closure:<name>` for closed Surfaces). `Graph.of(module, { evidence })` builds the dependency graph between transitions that write paths, laws that read paths, and `Evidence` records (`Enumerated`, `Walked`, or `Evidence.runtimeOnly`) that attest a transition preserves a law.

`Graph` is split from `Module` so bundle readers that only render `Module.manifest` omit graph validation code. Run both `Module.validate` and `Graph.validate` in tests since each checks a separate rule set:

```ts standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Evidence, Graph, Module, Surface } from 'foldkit-surface'

const App = Surface.application({
  Model: Schema.Struct({ todos: Schema.Array(Schema.String) }),
  Message: defineMessageUnion({ Added: { title: Schema.String } }),
})

// What `Sync.forApplication(App).make` declares for a document with one law.
const todos = {
  kind: 'sync',
  name: 'todos',
  owner: App.owner,
  owns: [['todos']],
  observes: [['todos']],
  messages: ['Added'],
  metadata: [],
  laws: { model: ['capped'] },
}
const Todos = Module.make(App, [todos])

Module.validate(Todos) // []: one owner per path, every name declared
Graph.validate(Todos)
// [{ rule: 'law-unwitnessed', message: 'durable:Added writes todos, which sync:todos.capped reads, …' }]

const judged = Evidence.runtimeOnly({
  transition: 'durable:Added',
  law: 'sync:todos.capped',
  why: 'the journal judges every append, and refuses one past the cap',
})
Graph.validate(Todos, { evidence: [judged] }) // []
Graph.breakersOf(Graph.of(Todos, { evidence: [judged] }), 'sync:todos.capped')
// [{ transition: 'durable:Added', paths: [['todos']], evidence: [judged] }]
```

Graph validation rules:

| Rule | Reported when |
| --- | --- |
| `law-unwitnessed` | A transition writes a path a law reads with no matching evidence. |
| `evidence-unmatched` | Evidence was constructed manually, or names an unknown or unrelated pair. |
| `level-declared-twice` | Two closed Surfaces observe the same paths and list the same Messages. |
| `transition-declared-twice` | Two contracts declare a write of the same name (such as `write:Sell`). |

For `law-unwitnessed`, a law that reads `before` counts as reading the entire row because any row write can affect it. `Graph.toMarkdown` and `Graph.toMermaid` render the law table and flowchart (see `LAWS.md` in `examples/writes`). Local `modifyFields` writes are checked by walks rather than static graph edges.

## Diagnostics

`Diagnostics` is the shared reporting channel where Foldkit Plus packages send non-fatal warnings and errors (fallbacks, swallowed store failures, dev checks). Each package defines its own `Diagnostic` variants (`_tag`, `source`, `level`, `message`).

Reports go to `Diagnostics.Reporter` in the Effect context, defaulting to Effect's logger. Swap or collect reports using `Diagnostics.layer`, `Layer.succeed`, or `Diagnostics.collect()`:

```ts
import { Effect, Layer } from 'effect'
import { Diagnostics, type Diagnostic } from 'foldkit-surface'

declare const send: (diagnostic: Diagnostic) => Effect.Effect<void>

// In a browser runtime's `resources`: log as before, and send.
const reporting = Diagnostics.layer(diagnostic =>
  Effect.andThen(Diagnostics.log(diagnostic), send(diagnostic)),
)

// On a server, where no Mount runs, the reporter alone is enough.
const onServer = Layer.succeed(Diagnostics.Reporter, Diagnostics.log)

// In a test: provide `report`, then assert on `reported`.
const { report, reported } = Diagnostics.collect()
const inTest = Layer.succeed(Diagnostics.Reporter, report)
```

`Diagnostics.report(diagnostic)` always succeeds; if a custom reporter fails, the error is logged with the original diagnostic.

**Mounts.** Because Foldkit runs Mounts outside `resources`, Mounts report via `Diagnostics.dispatch(element, diagnostic)` using a verified `DiagnosticEvent` claimed by `Diagnostics.layer(reporter)`. Mounts that fail before `resources` initialize log directly, and if two runtimes share one document, the first runtime to initialize `resources` claims both runtimes' events.

**Production.** Use `Diagnostics.quiet` in production (`Diagnostics.layer(import.meta.env.DEV ? Diagnostics.log : Diagnostics.quiet)`) to log errors and suppress developer warnings. In development, `foldkit-mixins`' `DevOverlay` displays reported diagnostics on the page.

## Comparing Optics, Surfaces, and Submodels

Surface complements Effect Optics and Foldkit Submodels at different levels of an application:

| Concept | What it answers |
| --- | --- |
| **Effect Optic** | "How do I focus, read, or replace this value inside another value?" |
| **`ModelRef` / `Projection`** | "What application data is this focus or derived value made from?" |
| **Surface** | "What may this feature observe, and which application Messages may it cause?" |
| **Foldkit Submodel** | "Which state machine owns this state and these transitions?" |

They compose rather than replace one another: `modifyFields` performs application transitions inside `update`, an `Optic` or `ModelRef` locates a value structurally, a `Projection` reads or writes a known `Model` slice, a `Surface` pairs observation with allowed `Message`s, and a `Submodel` owns a state machine boundary:

<!-- docs-check standalone use todoApp
const App = Surface.application({ Model, Message }).runnable({ initial, update })
-->

```ts
import { modifyFields } from 'foldkit/struct'

// application transition
modifyFields(model, { todos: () => [] })

// structural addressing
ModelRef.focus(App.model.todos).get(model)

// infrastructure installation
ModelRef.focus(App.model.todos).set(model, restoredTodos)
```

### Surface builds on Optics rather than replacing them

Every `ModelRef` wraps an Effect `Optic.Optional`. Surface layers Schema validation, dependency paths, application owner identity, `get`/`set` accessors, and opaque `Metadata` onto that optic to form `Projection`, and adds a name, optional `params`, and allowed `Message`s to form `Surface`. Use `ModelRef.fromOptic` when you already have an Effect optic and want it to carry Surface dependency and owner metadata.

### Surface and Submodels solve different decompositions

- **Submodels** partition an application by **transition ownership**: each child owns its own `Model`, `Message`, `update`, `view`, and Commands.
- **Surfaces** partition an application by **consumer needs**: each Surface declares what an existing screen, agent, or subsystem observes and which `Message`s it may send, without introducing a new state machine.

Because observation is separate from ownership, one Surface can read across multiple Submodels—such as reading a parent `route`, a `Settings` theme, and a `Session` user together on an account page:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'

const Route = Schema.Literals(['Home', 'Account'])
const Settings = { Model: Schema.Struct({ theme: Schema.String }) }
const Session = { Model: Schema.Struct({ user: Schema.NullOr(Schema.String) }) }
const Message = defineMessageUnion({ ChangedTheme: { theme: Schema.String } })
-->

```ts
const Model = Schema.Struct({
  route: Route,
  settings: Settings.Model,
  session: Session.Model,
})

const App = Surface.application({ Model, Message })

const AccountPage = App.surface('AccountPage', {
  model: ({ model }) => ({
    route: model.route,                   // parent-owned
    theme: model.settings.theme,          // Settings Submodel
    user: model.session.user,             // Session Submodel
  }),
})
```

Reading `model.settings.theme` through a `ModelRef` keeps ownership inside `Settings`. Any transition to `Settings` state still goes through the root `Message` routed to `Settings`'s `update` (`Update.foldChild`), rather than writing directly through a setter. Similarly, `h.submodel` remains the runtime boundary that mounts child views and routes child `Message`s.

### Which one should I reach for?

- **Focus or update nested immutable data:** use an Effect Optic (or `ModelRef.fromOptic` to participate in Surface metadata).
- **Own private state, update logic, or Commands:** use a Foldkit Submodel.
- **Declare what a feature reads and which Messages it may send:** use a Surface.
- **Read across multiple Submodels for one screen:** build one Surface over those fields instead of creating a new Submodel to aggregate them.

## Ownership and responsibilities

- Reference-based `Model` selection (`App.model`, `Projection.pick`, `Projection.compose`).
- Pure `Projection` values with codecs, readers, dependency paths, and opaque `Metadata.key` slots.
- Application scopes (`Surface.application`) with owner identity tokens.
- Typed `Message` subsets (`MessageSet.make`, `MessageSet.union`) and validated `Action` capabilities (`Action.define`, `Action.run`).
- Closure checks (`Closure.reads`, `Closure.violations`) and the law/evidence graph (`Contract.laws`, `Graph.of`, `Graph.validate`, `Graph.breakersOf`, `Graph.toMarkdown`, `Graph.toMermaid`).
- Named Surfaces, view bindings, and the shared `Diagnostics` channel.

## Limits

- Pure data and static descriptions only: fetching remote rows lives in [`foldkit-remote`](../remote/README.md), and offline replication lives in [`foldkit-sync`](../sync/README.md).
- `Model` codecs run purely without Effect services.
- Projections declare dependencies and carry metadata without acting on them; downstream packages such as `foldkit-remote` interpret their own keys.

## Next

- Fetch server-derived slices declared on Surfaces: [`foldkit-remote`](../remote/README.md) and [Server-derived state](../../docs/remote.md).
- Replicate a closed slice offline across devices: [`foldkit-sync`](../sync/README.md).
- Expose Actions and Surfaces to an AI agent: [`foldkit-agent`](../agent/README.md).
