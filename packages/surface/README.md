# `foldkit-surface`

Say once, in one value, which parts of a Foldkit Model a feature reads and which
Messages it may send. That value — a **Surface** — is derived from the Model's
own Schema rather than a second hand-written interface, so it cannot name a
field the Model does not have. It reads the Model purely, it binds a renderer,
and it can be inspected: given a Surface, a tool can answer "what does this
screen depend on?" without running anything.

Reach for it when something else needs that answer. `foldkit-remote` fetches
exactly the server fields the active Surfaces read; `foldkit-sync` replicates
exactly the Model slice a feature declares; `Module.validate` catches two
features claiming the same Model path before either runs. If nothing needs to
inspect a feature's data needs, a plain function of the Model is simpler — this
package performs no I/O, renders nothing itself, and adds no runtime behaviour
of its own.

## The mental model

```text
Model Schema → typed field references → Projection → named Surface
application Model ────────────────────────read────────→ feature input
feature Message → application update → next Model
```

Declaring or reading a Surface does not dispatch a Message, fetch data, or
create a state owner. Its Message list constrains consumers; the application's
reducer still defines what those Messages do.

## Install

```bash
pnpm add foldkit-surface
```

`foldkit` and `effect` are peer dependencies.

## Quick start

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'

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

`TodoList` is a named contract: the projection a feature reads (here the two
fields, as `Projection.struct` lifts them) and the Messages it may send. It
reads purely (`Surface.read(TodoList, model)`), binds a renderer
(`Surface.view`), and is what `foldkit-remote`, `foldkit-sync`, and
`foldkit-agent` derive their work from. `Projection.pick(App.model.todos)` is
a writable projection of the same field for a replicator. The extra
`todosById` field illustrates dynamic record lookups later; this read neither
uses it nor synchronizes it with `todos`. Choose one authoritative collection
in a real application.

## Field references

`Surface.application` generates a reference tree from the Model Schema, one node
per field. Each `FieldRef` carries its optic, codec, `get`, and `set`, plus the
field name as a literal type, so a selection can infer its own output keys
without a parallel field registry.

```ts
App.model.todos                 // FieldRef<Model, Todo[], 'todos'>
App.model.selectedTodoId        // FieldRef<Model, Option<string>, 'selectedTodoId'>
App.model.todosById.at('t1')    // OptionalRef<Model, Option<Todo>> (dynamic key)
App.model.todos.index(0)        // OptionalRef<Model, Option<Todo>> (dynamic index)
```

A Model field that is itself a `Schema.Struct` recurses, so each of its fields is
a `FieldRef` too. Array and record access is `.index(i)` / `.at(key)`, which
returns an `OptionalRef` — a `ModelRef` with an `Option` value. Those are dynamic
selections, so `Projection.pick` (which needs a static field name) rejects them;
they are useful inside a `Projection`.

`App.fields` is the same tree under a second name, kept only so older code
compiles. It is deprecated; use `App.model`.

`Projection.pick` turns references into a writable projection — a `Schema.Struct`,
`get`, and `set`:

```ts
const Shared = Projection.pick(App.model.todos, App.model.selectedTodoId)
// { schema, dependencies, get, set }
```

Each picked field is named by its last key, so `App.model.post.id` is `id`.
Two fields with the same name at different paths, such as `post.id` and
`viewer.id`, would be one field, and are refused when the projection is
built; pick them in separate projections. `Projection.compose` refuses the
same collision between its parts.

A reference from a different application is rejected by a per-application owner
token, so two structurally identical Models cannot be mixed. Duplicate members
deduplicate; a conflicting definition throws.

`Projection.compose` merges disjoint writable projections, keeping each part's own
write behavior. `ModelRef.fromOptic` builds a reference from an optic you already
have.

## Projections

A `Projection<Root, Value>` is a `Model` codec for `Value`, a pure
`read(root) => Value`, its `dependencies` (Model paths), and its `metadata`:
facts other packages attach and interpret, such as the server data a
`foldkit-remote` selection needs. Reading never performs I/O.

```ts
Projection.struct({ todos: model.todos, selectedTodoId: model.selectedTodoId })
Projection.of(Model)({ todos: true, selectedTodoId: true })  // from the Schema
Projection.array(projection)     // Projection<ReadonlyArray<Root>, ReadonlyArray<Value>>
Projection.option(projection)    // Projection<Option<Root>, Option<Value>>
Projection.fromReader(codec, read)  // escape hatch for a non-ModelRef value
```

`Projection.struct` accepts `ModelRef`s and nested `Projection`s, so a Surface can
mix local fields with remote or replicated values. A nested projection
contributes its dependencies and metadata to the parent.

### Metadata

`Metadata` is [`foldkit-metadata`](../metadata/README.md), re-exported so an
application needs one import. A package declares its own slot once and reads back only its own entries:

```ts
const Flags = Metadata.key<string>('flags', {
  merge: flags => [...new Set(flags)],
  summarize: flag => flag,
})

const beta = Projection.fromReader(Schema.Boolean, readBeta, { metadata: Flags.of('beta') })
Flags.get(Projection.struct({ beta, todos: model.todos }).metadata) // ['beta']
```

Entries are combined per key with that key's `merge` as projections compose, and
looked up by the key object, never by its name, so two packages cannot collide.
The flip side: two copies of one package (a duplicated install, a reloaded
module) declare two keys and do not see each other's entries. `Metadata` is
opaque and its entries frozen; only a key's `of` and composition make one.
Surface never interprets them; `Surface.inspect` and `Module` show them through
`summarize`.

## Applications

`Surface.application({ Model, Message })` returns an `Application`: the schemas
(`App.Model`, `App.Message`), the reference tree (`App.model`, with `App.fields`
a deprecated alias), the identity token (`App.owner`), and `App.surface`. No transition, so a consumer
that only inspects the Model needs nothing more.

`Surface.application({ Model, Message, initial, update })` adds `App.initial` and
`App.update` and returns a `RunnableApplication`, which a replicator needs to
derive the initial shared value and replay. `update`'s Commands may carry
resources; the resource set is threaded through the returned type.

## Message subsets

A subset selects typed variants of one application's Message union by constructor
reference:

```ts
import { MessageSet } from 'foldkit-surface'

const TodoChanges = MessageSet.make(App, [Message.CreatedTodo, Message.ToggledTodo])
const SelectionChanges = MessageSet.make(App, [Message.SelectedTodo])
const AllChanges = MessageSet.union(TodoChanges, SelectionChanges)
```

A subset carries the constructors, a pure codec for exactly those variants, a
`tags` set, and an `includes` guard. A constructor that is not a variant of the
application, a duplicate tag, or a subset from another application throws.
Surface does not label a subset durable, agent-visible, or presence; `Sync` and
`Agent` attach those policies to the same value.

## Actions

An Action is a capability a consumer may invoke by name with data: an agent's
tool, a page Block's button. It ends in one of the application's own Messages,
so `update` stays the only place a Message has effects:

```ts
import { Action } from 'foldkit-surface'

const AddToCart = Action.define({
  name: 'addToCart',
  description: 'Add a product to the cart',
  input: Schema.Struct({ productId: ProductId }),
  toMessage: input => Message.AddedToCart(input),
})

Action.run(AddToCart, { productId: 'p1' }) // Result: the Message, or why the input was refused
```

`Action.run` decodes the data as the Action's input before `toMessage` sees it,
so data from a Document or a tool call never executes. The Action is declared
once: `Agent.action(AddToCart)` exposes it to an agent, and a page's Catalog
lists it for Blocks to reference by name.

## Surfaces

A Surface binds a projection and the Messages a feature may use into a named,
inspectable contract. `App.surface(name, { params?, model, messages? })` is
the form to write: `params` are the fields of a `Schema.Struct` (or a schema,
kept as is), and `model` returns a Projection, or an object of Projections and
field refs that becomes `Projection.struct`.

```ts
const TodoDetail = App.surface('TodoDetail', {
  model: ({ model }) => ({ todos: model.todos, selectedTodoId: model.selectedTodoId }),
  messages: [Message.ToggledTodo],
})

// A parameterized Surface may read `params`; dynamic lookups are OptionalRefs.
const ById = App.surface('ById', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({ todo: model.todosById.at(params.id) }),
})

Surface.read(TodoDetail, root)                     // project purely
Surface.read(ById, root, { id: 't1' })
Surface.view(TodoDetail, render)                   // bind a renderer
Surface.rootView(TodoDetail, undefined, render)    // bound to the app root
```

The Surface's Model is the projected value (`{ todos; selectedTodoId }`), its
Params the fields, and its Message the union of the constructors listed; a
constructor from another application is a compile error at the constructor.
A parameterized Surface's projection is not evaluated until it has params.

`Surface.at(surface, params)` is the Surface as the Model activates it: `params`
is the value, or a function of the Model returning it (`undefined` while the
Surface is inactive, on another route say). Its `projectionOf(model)` is the
projection for those params, or `undefined`, and it carries the Surface's
`owner` and `messages`, the tags of the Messages the Surface lists; a Subscription derives what to fetch from a list of them
(`foldkit-remote`'s `Data.subscriptions`).

### `Surface.make`, the explicit form

`Surface.make(app, name, { Params?, model, messages? })` takes the wrappers
`App.surface` lifts: `Params` as a schema and `model` returning a Projection
(`Projection.struct({ … })` for several fields). `App.surface` compiles to it.

## Modules

A `Module` collects an application's contracts as pure data, so their
relationships can be validated and inspected without starting a runtime. Sync,
Remote, and Agent contracts carry a `contract` description; a Surface is
described in place (`Surface.contract(surface, params)` for a parameterized one).

```ts
import { Module } from 'foldkit-surface'

const Project = Module.make(App, [BoardSurface, ProjectSync, ProjectRemote, ProjectAgent])

Module.validate(Project) // [] or findings
Module.manifest(Project) // fields, Messages, who owns each Model path, contracts
Module.toMarkdown(Project)
Module.toMermaid(Project)
```

```text
Model
├── route           LOCAL
├── selectedNoteId  LOCAL
├── notes           SYNC notes
└── remote          REMOTE remote
```

`validate` reports what the types cannot: a contract from another application,
a duplicate `kind:name`, two owners of overlapping Model paths, a Message
recorded by two replication contracts, and a path or Message the application
does not declare. `Module.add(module, ...more)` returns a new Module, so feature
modules can contribute their contracts independently.

## Advanced: how this relates to Optics and Submodels

Surface sits near two existing ideas in Effect and Foldkit, so the overlap is
intentional. They operate at different levels:

| Concept | What it answers |
| --- | --- |
| **Effect Optic** | "How do I focus, read, or replace this value inside another value?" |
| **`ModelRef` / `Projection`** | "What application data is this focus or derived value made from?" |
| **Surface** | "What may this feature observe, and which application Messages may it cause?" |
| **Foldkit Submodel** | "Which state machine owns this state and these transitions?" |

A useful shorthand is:

```text
modifyFields      = modify application data inside update
Optic / ModelRef  = locate a value structurally
Projection        = describe/read/write a known Model slice
Surface           = observation + capability contract
Submodel          = state-machine ownership boundary
```

They compose; none replaces the others. This schematic example assumes an
application with a `filter` field and an already-decoded `restoredFilter`:

```ts
// application transition
modifyFields(model, { filter: () => 'active' })

// structural addressing
App.model.filter.get(model)

// infrastructure installation
App.model.filter.set(model, restoredFilter)
```

### Surface builds on Optics rather than replacing them

Every generated `ModelRef` contains an Effect `Optic.Optional` underneath it.
The optic supplies the structural focus. Surface enriches that focus with the
information the rest of an application architecture needs:

```text
Effect Optic
   + Schema
   + dependency path
   + application identity
   + get / set
        ↓
     ModelRef
        ↓
     Projection
   + metadata (Remote's requirements, …)
        ↓
      Surface
   + name / params
   + allowed Messages
```

For example, `App.model.todos` is not an alternative to an optic. It is an
optic-backed reference that also knows that the value is the `todos` field of
*this* application, how it is encoded, and that a consumer depending on it
depends on the `todos` Model path. `ModelRef.fromOptic` is the escape hatch when
you already have an optic and want to add that metadata yourself.

That extra metadata is the reason Surface exists. An optic can focus
`model.todos`; by itself it cannot tell `foldkit-sync` that `todos` is the slice
to replicate, `Module` that another contract claims the same path, or
`foldkit-remote` that a derived projection needs server data. Surface carries
that last fact as opaque metadata: `foldkit-remote` attaches its requirements
under its own `Metadata.key` and reads them back, and Surface only merges them.

A `Projection` also need not correspond to one structural focus. It can combine
several refs or derived values into one read model while preserving the
dependencies and metadata of every part.

### Surface and Submodels solve different decompositions

A [Foldkit Submodel](https://foldkit.dev/core/submodel) is for a part of the
application that **owns a state machine**. It has its own Model, Message, update,
view, and Commands. The parent stores the child Model, routes child Messages,
and delegates transitions to the child's update.

A Surface owns none of those things. It has no private state, no child update,
no runtime boundary, no Message wrapping, and no Command lifting. It describes
a restricted interface to state and Messages that already belong to the
application.

```text
Submodel
  "This child owns how this state changes."

Surface
  "This consumer may see these values and cause these application Messages."
```

The most useful way to distinguish them is by the decomposition they create:

```text
Submodels divide the application by ownership:
  who owns this state and these transitions?

Surfaces divide the application by consumer needs:
  what does this screen / agent / subsystem need to observe and cause?
```

Those boundaries do not need to line up. In fact, a Surface can deliberately
span several Submodels because observation is not ownership. A page that reads
the route, a theme owned by `Settings`, and the signed-in user owned by
`Session` does not need to become a third state machine just to assemble those
values:

```ts
const Model = Schema.Struct({
  route: Route,
  settings: Settings.Model,
  session: Session.Model,
})

const App = Surface.application({ Model, Message, initial, update })

const AccountPage = App.surface('AccountPage', {
  model: ({ model }) => ({
    route: model.route,                   // parent-owned
    theme: model.settings.theme,          // Settings Submodel
    user: model.session.user,             // Session Submodel
  }),
})
```

Conceptually:

```text
Root application
├── route                         parent-owned
├── settings: Settings.Model      Settings owns transitions
└── session: Session.Model        Session owns transitions
        │               │
        └───────┬───────┘
                │ observed by
         AccountPage Surface
       (+ parent-owned route)
```

This is a feature of the model, not a leak in it: **Submodels partition
transition ownership; Surfaces may cut across those partitions to describe a
consumer-facing read/capability boundary.** A screen, an agent context, or
another interpreter often needs a coherent read model assembled from several
owners.

The Surface does **not** weaken any of those Submodel boundaries. Reading
`model.settings.theme` through a `ModelRef` does not grant permission to change
it directly. If `Settings` owns that state, changes must still go through the
Settings state machine: its child Message and update, routed through the normal
parent/child path (`Update.foldChild`, an exported child helper, or the wrapped
Message path used by the application).

The same rule applies to Surface capabilities. If `AccountPage` may cause a
Settings transition, expose the **root application Message constructor that
routes to Settings** in the Surface's `messages`; do not use the underlying
optic/setter as a shortcut around the child update.

`FieldRef.set` and writable `Projection`s are structural/infrastructure tools.
Their existence does not imply ownership of the focused state. A Submodel's
invariants still belong to its update.

Likewise, Surface does not replace `h.submodel`: `h.submodel` creates the runtime
child boundary and routes child Messages. A Surface is pure, inspectable data
that may observe across those runtime boundaries without creating another one.

### Which one should I reach for?

- **You need to focus or update nested immutable data:** start with an Effect
  Optic; use `ModelRef.fromOptic` if that focus must participate in Surface
  metadata.
- **A feature needs its own state, Message vocabulary, update logic, Commands,
  or reusable stateful lifecycle:** use a Foldkit Submodel.
- **Something needs an inspectable declaration of what existing application
  state a feature reads or which existing Messages it may cause:** use a
  Surface.
- **A screen or subsystem reads across several Submodels:** use one Surface over
  those child fields; do not invent a new Submodel merely to aggregate them.
- **You need both:** keep transition ownership in each Submodel and describe the
  consumer-facing observation/capability boundary with Surface.

## What it owns

- Reference-based Model selection (`App.model`, `Projection.pick`,
  `Projection.compose`).
- Pure `Projection` values with their codec, reader, dependencies, and opaque
  interpreter metadata (`Metadata.key`).
- Application scopes (`Surface.application`) and their identity token.
- Typed Message subsets (`MessageSet.make`, `MessageSet.union`).
- Actions (`Action.define`, `Action.run`): a named capability ending in a Message.
- Named Surfaces and their renderer binding.

## Limits

- It performs no I/O and knows nothing about transport. Fetching remote data is
  [`foldkit-remote`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote);
  replicating Messages is
  [`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync).
- `Model` codecs are pure by construction: Foldkit Model fields carry no decoding
  or encoding services.
- A projection declares dependencies and carries metadata but does not act on
  either; an interpreter such as `foldkit-remote` reads the metadata it owns.

## See also

- The packages built on this boundary: [`foldkit-remote`](https://github.com/doeixd/foldkit-plus/tree/main/packages/remote) projects requirements
  from it, [`foldkit-sync`](https://github.com/doeixd/foldkit-plus/tree/main/packages/sync) replicates a projection of it, [`foldkit-agent`](https://github.com/doeixd/foldkit-plus/tree/main/packages/agent) makes one
  an agent's context, [`foldkit-mirror`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mirror) keeps one in the URL or a store, and
  [`foldkit-mixins-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins-surface) renders one.
- [Server-derived state](https://github.com/doeixd/foldkit-plus/blob/main/docs/remote.md) — the guide that covers
  this boundary and the Remote Submodel above it.
- [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) — five feature Surfaces, a Module, and every contract in one
  application.