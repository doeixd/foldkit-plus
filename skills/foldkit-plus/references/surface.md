# foldkit-surface

## What it is and what it owns

`foldkit-surface` lets a feature declare, in one value, **which parts of a Foldkit
Model it reads and which application Messages it may send**. That value comes
from the Model's own Schema, so it cannot name a field that does not exist. A
tool can inspect it without running anything.

- **Owns:** field references (`App.fields`) and pure `Projection`s (codec, reader,
  dependency paths, opaque metadata). Also application identity
  (`Surface.application`), typed Message subsets (`MessageSet`), named Surfaces
  with their renderer binding, and `Module` (static checks across contracts).
- **Does NOT own:** I/O, transport, state, transitions, or Commands. A Surface is
  an *observation + capability contract*, not a Submodel. It has no private
  Model, no child update, and no Message wrapping. Submodels divide state by
  which one owns its transitions. A Surface may read across several Submodels.
  A writable projection or `FieldRef.set` is plumbing for other packages. It
  does not let you skip a Submodel's update. To cause a child transition, list
  the root Message that routes to the child.
- **Consumed by:**
  - `foldkit-remote` fetches the server data a Surface's projections need. It
    reads the requirements from metadata and follows `Surface.at` to see which
    Surfaces are active.
  - `foldkit-sync` replicates a writable projection plus a `MessageSet`.
  - `foldkit-agent` uses a projection as an agent's context.
  - `foldkit-mixins-surface` renders a Surface.
  - `foldkit-mirror` keeps one in the URL or a store.

  Sync, Remote, and Agent values carry a `contract`, which `Module` collects
  next to Surfaces.

If nothing needs to inspect what data a feature uses, a plain function of the
Model is simpler.

## Mental model

```text
Schema field -> ModelRef/FieldRef (optic + codec + path + app owner + get/set)
             -> Projection (Model codec, read, dependencies, metadata)
             -> Surface (name, params, projection(params), allowed Messages)
```

- `Surface.application({ Model, Message })` builds a tree of field references.
  Use `App.fields` for it. `App.model` is the older name for the same tree, and
  it is also what `model` means inside `App.surface`. Add `initial` + `update` to
  get a `RunnableApplication`. Sync needs one to compute the initial value and
  replay Messages.
- Every ref and Surface carries `App.owner`. Mixing two applications is a type
  error or throws at runtime.
- Metadata is opaque. Each package stores entries under its own `Metadata.key`.
  Surface only merges them when projections combine, and summarizes them for
  inspection.

## Minimal example

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  todosById: Schema.Record(Schema.String, Todo),
  selectedTodoId: Schema.NullOr(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  SelectedTodo: { id: Schema.String },
})

const App = Surface.application({ Model, Message })

// `model` returns an object of refs/projections, lifted to Projection.struct.
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, selectedTodoId: model.selectedTodoId }),
  messages: [Message.ToggledTodo, Message.SelectedTodo],
})

declare const model: Model
Surface.read(TodoList, model)          // { todos, selectedTodoId }, pure
TodoList.projection().read(model)      // same thing, via the projection

// A writable slice (schema, dependencies, get, set) for a replicator.
const Shared = Projection.pick(App.fields.todos, App.fields.selectedTodoId)
Shared.set(model, { todos: [], selectedTodoId: null })
```

Nothing here fetches, subscribes, or stores. `TodoList` is plain data of type
`Surface<Model, { todos; selectedTodoId }, ToggledTodo | SelectedTodo, void>`.
To attach a renderer, use `Surface.view(TodoList, render)` or
`Surface.rootView(TodoList, undefined, render)`.

## Common tasks

**A Surface with params, made active by the Model.** Give `params` as the fields
of a `Schema.Struct`, or as a schema. `.at(key)` and `.index(i)` return refs
whose value is an `Option`.

```ts
const TodoDetail = App.surface('TodoDetail', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({ todo: model.todosById.at(params.id) }),
  messages: [Message.ToggledTodo],
})
Surface.read(TodoDetail, model, { id: 't1' })   // { todo: Option<Todo> }

// Params computed from the Model; `undefined` means the Surface is inactive.
const Active = Surface.at(TodoDetail, m =>
  m.selectedTodoId === null ? undefined : { id: m.selectedTodoId },
)
Active.projectionOf(model)   // Projection | undefined (Remote's Data.subscriptions takes a record of these)
```

**Building projections.**

```ts
const TodoTitle = Projection.of(Todo)({ id: true, title: true })        // subset of a Struct schema
const Titles = App.fields.todos.select(Projection.array(TodoTitle))     // ref.select(projection)
const Selected = App.fields.todosById.at('t1').select(TodoTitle)        // Projection<Model, Option<...>>
const Board = Projection.struct({ titles: Titles, selectedTodoId: App.fields.selectedTodoId })
const Count = Projection.fromReader(Schema.Number, (m: Model) => m.todos.length, {
  dependencies: [['todos']],   // escape hatch; without this option there are no dependencies
})
```

`Projection.option(p)` maps a projection inside an `Option`.
`Projection.compose(a, b)` merges writable projections from `pick` that have no
fields in common.

**Message subsets.** Sync uses them to mark Messages durable, and Agent uses them
to choose which Messages to expose.

```ts
import { MessageSet } from 'foldkit-surface'

const TodoChanges = MessageSet.make(App, [Message.CreatedTodo, Message.ToggledTodo])
const SelectionChanges = MessageSet.make(App, [Message.SelectedTodo])
const AllChanges = MessageSet.union(TodoChanges, SelectionChanges)
AllChanges.includes(message)      // type guard; also .tags, .schema, .constructors
```

**Checking all of an app's contracts** (in a test or a build step):

```ts
import { Module } from 'foldkit-surface'

const Project = Module.make(App, [TodoList, Surface.contract(TodoDetail, { id: 't1' })])
const findings = Module.validate(Project)   // [] or { rule, contracts, message }[]
Module.manifest(Project)                    // fields, messages, owner of each path, contracts
Module.toMarkdown(Project)                  // also Module.toMermaid; Module.add(Project, ...more)
Surface.inspect(TodoDetail, { id: 't1' })   // { name, dependencies, metadata, emits }
```

`Module.make` accepts a Surface without params, a `Contract`, or any value with a
`contract` field (Sync, Remote, and Agent values). `validate` can report these
rules: `foreign-contract`, `duplicate-name`, `ownership-overlap`,
`message-claimed-twice`, `unknown-path`, `unknown-message`.

**Metadata keys, for package authors only.** App code never needs this.

```ts
import { Metadata } from 'foldkit-surface'

const Flags = Metadata.key<string>('my-package/flags', {
  merge: flags => [...new Set(flags)],
  summarize: flag => flag,
})
const beta = Projection.fromReader(Schema.Boolean, (_: Model) => true, { metadata: Flags.of('beta') })
Flags.get(Projection.struct({ beta, todos: App.fields.todos }).metadata)   // ['beta']
```

## Gotchas

- **Reserved field names.** `Surface.application` throws
  `Model field "..." is reserved by ModelRef` when a Model Struct field is named
  `Schema`, `optic`, `dependency`, `key`, `read`, `get`, `set`, `at`, `index`,
  or `select`. The check also covers nested Structs.
- **Params.** A Surface declared without `params` has Params type `void`. Call it
  as `Surface.read(s, model)`, `s.projection()`, or
  `Surface.rootView(s, undefined, ...)`. A Surface with params builds its
  projection only once it gets params. So `Module.make` takes such a Surface
  only as `Surface.contract(surface, params)`, never directly. `projectionOf` on
  a `Surface.at` value returns `undefined` only if the Surface declares params.
- **How `App.surface` spots a Projection.** A value returned from `model` counts
  as a Projection only if it has a `read` function and a `metadata` value created
  by this package. Anything else goes through `Projection.struct`. So a
  hand-written `{ Model, dependencies, read, metadata: {} }` is not recognized;
  use `Projection.fromReader`. A spread or cloned Metadata value also loses all
  of its entries.
- **`Projection.pick` needs static `FieldRef`s** (`App.fields.x`, or fields of a
  nested Struct). It rejects refs from `.at()` or `.index()`, which belong inside
  projections instead. Refs from two applications throw
  (`references from different applications`), and so does a repeated key with a
  different definition.
- **`MessageSet.make` throws** on a constructor that is not a variant of the
  app's Message union, or on a duplicate tag. `MessageSet.union` also throws on
  subsets from different applications.
- **`Projection.struct` needs a single root type.** Mixing refs with different
  Roots is a type error.
- **No I/O and no runtime behavior.** Reading a projection is pure. Only
  interpreters such as Remote act on declared dependencies and metadata. Surface
  never marks Messages as durable or visible to agents; Sync and Agent do that.
- **Metadata keys match by object, not by name.** Declare each key once at
  module level. Two copies of a package (a duplicate install, a hot reload) do
  not see each other's entries.
- `Surface.make(app, name, { Params, model, messages })` is the explicit form:
  `Params` is a schema and `model` must return a Projection. Prefer
  `App.surface`.

## See also

- Package README: https://github.com/doeixd/foldkit-plus/blob/main/packages/surface/README.md
- Server-derived state guide (Surface + Remote): https://github.com/doeixd/foldkit-plus/blob/main/docs/remote.md
- Replication guide (writable projections + MessageSets): https://github.com/doeixd/foldkit-plus/blob/main/docs/replication.md
- Agents guide (projection as context): https://github.com/doeixd/foldkit-plus/blob/main/docs/agents.md
- Real usage: https://github.com/doeixd/foldkit-plus/blob/main/examples/todo/src/agent.ts
