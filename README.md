# foldkit-plus

[![CI](https://github.com/doeixd/foldkit-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/doeixd/foldkit-plus/actions/workflows/ci.yml) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/doeixd/foldkit-plus)

> Packages that extend a [Foldkit](https://foldkit.dev/) application
> outward — to agents, servers, other devices, the URL, and design systems —
> without giving it a second place to keep state.

A Foldkit application is one state machine: a Schema-typed **Model**, a
**Message** union naming everything that can happen, and one pure **`update`**
function that turns a Message into the next Model and some Commands. That shape
is easy to reason about, test, and replay. It gets lost the moment an app grows a
cache in a hook, a store in the URL, a tool handler that re-implements a
transition, or a sync layer with its own reducer.

Everything in this repository keeps the one state machine. An agent can only
send Messages `update` already handles. Server data lives in the Model and is
reconciled by `update`. Replicas replay the same Messages through the same
`update`. The URL and local storage mirror a slice of the Model; they never own
one. Views are styled from outside without forking. Each package answers one
question, and they compose because they meet at explicit application boundaries.

## Choose who owns the state

| What you are adding | Authoritative owner | Extension |
| --- | --- | --- |
| Local UI state or a reusable widget | Parent Model and its update/child update | Bundle, Primitives |
| Facts loaded from a server | Server; the client cache is disposable | Remote |
| Offline edits that must converge | Client-authored operations in an authoritative journal order | Sync + Durable |
| A URL or remembered preference | Local Model; the external value is a representation | Mirror |
| Agent access or a customizable view | Existing state and transitions | Agent, Surface, Mixins |

A Surface can observe several owners. Observing a field does not grant a second
package permission to change it outside its owning transition.

```text
intent → Message → update → Model → Projection / Surface → consumer
                      |
                      └→ Command → result Message → update
```

## Sixty seconds of code

Start with one mechanism: an inspectable boundary around an existing Model.

The fastest way to see how the packages compose is to watch several of them
reuse one application declaration. Assume `Model`, `Message`, `initial`, and
`update` are an ordinary Foldkit todo app you already wrote. Everything around
them derives from the same state machine; none of it introduces a second
reducer.

```ts
import { Schema } from 'effect'
import { Agent } from 'foldkit-agent'
import { Mirror } from 'foldkit-mirror'
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { MessageSet, Module, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

type Principal = { readonly role: 'owner' | 'guest' }
const isOwner = (principal: Principal) => principal.role === 'owner'

// 1. This is still the application: one Model, one Message union, one update.
// Surface adds typed references and inspection metadata; it does not add runtime state.
const App = Surface.application({ Model, Message, initial, update })

// 2. A Surface is a public boundary for a feature: what it may observe and cause.
// A renderer bound to Board can only construct these two Messages.
const Board = App.surface('Board', {
  model: ({ model }) => ({ todos: model.todos, filter: model.filter }),
  messages: [Message.ToggledTodo, Message.DeletedTodo],
})

// A read-only Surface can be reused by something that only needs context.
const Overview = App.surface('Overview', {
  model: ({ model }) => ({ todos: model.todos, filter: model.filter }),
})

// 3. Mixins separate "where customization is allowed" from "what gets attached there."
//
// BoardSlots is the view's public customization contract. It renders nothing by
// itself. It only names the places the view agrees other code may extend later:
// `root` will be the outer <section>; `list` will be the <ul>.
// Capabilities describe what kind of element lives at each point so incompatible
// Styles or Behaviors can be rejected instead of silently doing the wrong thing.
const BoardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Collection }),
})

// Style is data written against that slot contract. Nothing is applied yet, and
// BoardStyle cannot read or change application state. Because it is created with
// `forSlots(BoardSlots)`, misspelling a slot or styling one Board never published
// is a type error rather than a convention.
const BoardStyle = Style.forSlots(BoardSlots)({
  root: Style.class('todo-board'), // contribute a class to the `root` slot
  list: Style.inline({ margin: '0', padding: '0', listStyle: 'none' }), // style `list`
})

// SurfaceView.define ties three boundaries together:
//   Board      -> the projected Model this view receives and the Messages it may emit
//   BoardSlots -> the places outside customization may attach
//   render fn  -> the actual markup
//
// So `model` is not the whole application Model; it is Board's { todos, filter }.
// And `h` is typed to the Messages Board declared above.
export const BoardView = SurfaceView.define(Board, BoardSlots, (model, slots, h) =>
  h.section(
    // `.attrs()` is the handoff point between markup and Mixins. It resolves the
    // view's own attributes plus every Style/Behavior attached to `root` into
    // ordinary Foldkit attributes for this <section>.
    slots.root.attrs(),
    [
      h.ul(
        // Same idea here: this exact DOM position is the published `list` slot.
        slots.list.attrs(),
        model.todos.map(todo => h.li([], [todo.title])),
      ),
    ],
  ),
).pipe(
  // Attach appearance from the outside. BoardView never imports CSS decisions into
  // its markup, so styles can be swapped/composed without copying the component or
  // adding a growing collection of styling props.
  Style.attach(BoardStyle),
)

// Behavior can attach element-level interaction through those same slots. It may
// contribute attributes, event handlers, or a Mount, but it still owns no Model;
// application state and transitions remain Model / Message / update.

// 4. Sync declares ownership of one writable slice and the facts that change it.
// Projection.pick is writable because checkpoints must install back into Model;
// replay still runs these Messages through the application's own update.
const TodoSync = Sync.forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [
      Message.SubmittedTodo,
      Message.ToggledTodo,
      Message.DeletedTodo,
    ]),
    authorize: {
      // Policy lives on the contract and is enforced by the server journal.
      DeletedTodo: ({ principal }) => isOwner(principal),
    },
  })

// The server gets codecs, empty snapshot, replay, and authorization from Sync.
// There is no second server-side reducer to keep in agreement.
TodoSync.journalContract()

// 5. First specialize the Agent API to this application and Principal type.
// `forApplication(...).withPrincipal(...)` does NOT create an agent; it creates
// a typed builder whose helpers know App's Model, Message union, and Principal.
const AgentBuilder = Agent.forApplication(App).withPrincipal<Principal>()

// `make` creates the concrete agent contract that MCP/WebMCP/A2A/etc. can serve:
// what this agent sees, which existing Messages it may cause, and their policy.
const AssistantAgent = AgentBuilder.make({
  context: Overview,
  messages: AgentBuilder.expose(Message, {
    RequestedTodo: Agent.variant({
      name: 'add_todo',
      description: 'Add a todo with the given title',

      // The protocol input can be smaller than the internal Message.
      input: Schema.Struct({ title: Schema.String }),
      toMessage: ({ title }) => ({ title }),

      // RequestedTodo is an intent. The tool call completes when update later
      // applies the correlated durable fact produced by the application's Command.
      completion: {
        success: Message.SubmittedTodo,
        correlate: (request, result) => request.title.trim() === result.title,
      },
    }),
    ToggledTodo: { name: 'toggle_todo', description: 'Toggle a todo' },
    DeletedTodo: {
      name: 'delete_todo',
      description: 'Delete a todo (owner only)',
      // Same rule, checked early at the agent boundary; the journal still owns trust.
      authorize: ({ principal }) => isOwner(principal),
    },
  }),
})

// 6. Mirrors do not own state. They are secondary representations of Model fields.
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: [App.model.filter], // linkable: ?filter=active
})
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: [App.model.draft], // remembered on this device
})

// 7. The architecture itself is data. Validate ownership/capability relationships,
// or turn the same declarations into documentation and tooling input.
const Project = Module.make(App, [
  Board,
  Overview,
  TodoSync,
  AssistantAgent,
  Filters.contract,
  Prefs.contract,
])

Module.validate(Project) // []
Module.toMermaid(Project) // architecture generated from the declarations above
```

The code is large because the point is composition, not because any one package
requires all of it.

1. **The application stays the center.** Model, Message, `update`, Commands,
   Submodels, and Mounts still mean what they mean in Foldkit.
2. **Surface makes boundaries explicit.** A Projection says what a consumer may
   observe; a Message subset says what it may cause. Those declarations are data,
   so other packages can reuse and inspect them.
3. **Extensions reuse application semantics instead of copying them.** Agents
   expose existing Messages, Sync replays them, Mirror represents Model fields
   elsewhere, and Mixins extends views without owning state.
4. **Ownership stays singular.** A URL mirror does not become a URL store; a
   replica does not grow a second reducer; a Style does not become view state.
5. **The architecture itself becomes inspectable.** `Module.validate` catches
   conflicting ownership, and `Module.toMermaid` turns the declarations into
   documentation or tooling input.

State changes take exactly two paths, and they are not equal. Ordinary
application transitions travel `Message → update`. Everything else, such as
a Sync checkpoint, a Mirror restoration or a Remote cache write, installs an
already-derived value through a structural seam (`ModelRef.set`/`modify`,
`WritableProjection.set`). A setter is infrastructure, not a second update;
see [Who changes application state, and how](./docs/state-model.md).

The important part is what is **missing**: no agent reducer, sync reducer, URL
store, persistence state machine, server copy of the shared schema, or forked
component just to restyle it.

`foldkit-remote` is deliberately not in this block. Remote is easiest to
understand with an actual server-owned entity and query; see
[the Remote example](./examples/remote/README.md) or the
[`kitchen-sink`](./examples/kitchen-sink) for that path. For the running
version of this app, follow [the todo app](./examples/todo-app/README.md).

The sample above is typechecked in
[`examples/todo-app/test/readme.test-d.ts`](./examples/todo-app/test/readme.test-d.ts),
so the front page cannot quietly drift from the API.

## Which package do I need?

If a term below is new, the [glossary](./docs/glossary.md) defines each one
in a line.

| You want to… | Reach for | Read |
| --- | --- | --- |
| Let an LLM or another agent use the app, safely, over MCP, WebMCP, A2A, or Agent Native | `foldkit-agent` + one adapter | [Agents](./docs/agents.md) |
| Cache server entities once, know what is missing, mutate optimistically, get live updates | `foldkit-remote` (+ `-server`, `-drizzle` on the server) | [Server-derived state](./docs/remote.md) |
| Work offline, on several devices, or with other people, and converge | `foldkit-sync` on the client, `foldkit-durable` on the server | [Replicated state](./docs/replication.md) |
| Keep the filter and page in the URL, remember a draft or a preference | `foldkit-mirror` | [Mirrored state](./docs/mirror.md) |
| Package a Submodel once and place it several times, or once per key, with every part wired | `foldkit-bundle` (+ `-surface` for Module ownership) | [package README](./packages/bundle) |
| Reach for everyday browser primitives instead of hand-wiring them: media queries, timers, sockets, device state, observers, clipboard | `foldkit-primitives` | [package README](./packages/primitives) |
| Restyle or add behaviour to views, including `@foldkit/ui`, without copying markup | `foldkit-mixins` (+ `-surface`, `-ui`) | [View composition](./docs/mixins.md) |
| Use a React component in a Foldkit view, or embed a Foldkit program in a React app | `foldkit-react` | [package README](./packages/react) |
| Compile Foldkit views to React TSX source | `foldkit-react-codegen` | [package README](./packages/react-codegen) |
| Say what a feature observes and may cause, and check that nothing owns a field twice | `foldkit-surface` | [package README](./packages/surface) |
| Declare a domain once (fields, relations, selections) for the client cache, the database binding, and forms to share | `foldkit-entity` | [One domain declaration](./docs/entity.md) |
| Build a form from the input an operation accepts, with validation and a decoded value handed to the parent | `foldkit-form` (+ `foldkit-mixins-form` to draw it) | [package README](./packages/form) |
| Join a form, a Remote mutation or query, and their Entity into an edit screen or a list | `foldkit-crud` (+ `foldkit-mixins-crud` to draw lists and details) | [package README](./packages/crud) |
| Give content drafts, revisions, a schedule, and a published/unpublished boundary, without a status column | `foldkit-cms` + `foldkit-cms-drizzle` (the editor's state and the server) | [package README](./packages/cms) |
| Store a page as Blocks in Regions, checked against a Catalog of what may exist | `foldkit-composition` (in development, not published) | [package README](./packages/composition) |
| Edit such a page with a selection and undo, as one key of a form | `foldkit-builder` (in development, not published) | [package README](./packages/builder) |

`foldkit-surface` is the shared semantic seam for Agent, Remote, Sync, Mirror,
and the Surface/Mixins bridge. It is not a mandatory base class for the whole
repository: `foldkit-durable`, core `foldkit-mixins`, and the protocol/UI
adapters can stand on their own and meet Surface-backed packages at explicit
boundaries.

## How they fit together

```mermaid
flowchart TB
  app["Foldkit application<br/>Model · Message · update · Commands"]
  surface["foldkit-surface<br/>Projection · field refs · Message subsets · Module"]
  agent["foldkit-agent"]
  agentAdapters["foldkit-agent-webmcp · foldkit-agent-mcp<br/>foldkit-agent-a2a · foldkit-agent-native"]
  remote["foldkit-remote<br/>normalized server cache"]
  server["foldkit-remote-server"]
  drizzle["foldkit-remote-drizzle"]
  sync["foldkit-sync<br/>local replica"]
  durable["foldkit-durable<br/>ordered server log"]
  mirror["foldkit-mirror<br/>URL · KeyValueStore"]
  bundle["foldkit-bundle<br/>Submodel placements"]
  bundleSurface["foldkit-bundle-surface"]
  primitives["foldkit-primitives<br/>ready-made bundles · entries · Mounts"]
  mixins["foldkit-mixins<br/>typed view extension points"]
  mixinsSurface["foldkit-mixins-surface"]
  mixinsUi["foldkit-mixins-ui"]
  entity["foldkit-entity<br/>the domain, declared once"]
  form["foldkit-form<br/>headless form from an operation's input"]
  mixinsForm["foldkit-mixins-form"]
  mixinsCrud["foldkit-mixins-crud"]
  cms["foldkit-cms<br/>drafts beside the row · derived state"]
  cmsDrizzle["foldkit-cms-drizzle<br/>audience boundary · drafts · publish"]
  crud["foldkit-crud<br/>editor · list · detail · remover"]
  metadata["foldkit-metadata<br/>opaque typed metadata"]
  ssr["foldkit-ssr<br/>server render · Model handover · resume"]
  richtext["foldkit-richtext<br/>semantic documents · transactions"]
  richtextDom["foldkit-richtext-dom<br/>contenteditable adapter · editor Bundle"]
  mixinsRichtext["foldkit-mixins-richtext"]
  react["foldkit-react<br/>React islands · Foldkit in React"]
  reactCodegen["foldkit-react-codegen<br/>views compiled to React TSX"]
  composition["foldkit-composition<br/>a page as Blocks in Regions · in development"]
  builder["foldkit-builder<br/>the page editor, as a form key · in development"]

  app -- "describe observation / capability" --> surface
  app --> mixins
  app --> bundle --> bundleSurface
  app --> primitives
  bundle --> primitives
  surface --> bundleSurface
  surface --> agent --> agentAdapters
  surface --> remote --> server
  drizzle --> server
  surface --> sync --> durable
  surface --> mirror
  surface --> mixinsSurface
  mixins --> mixinsSurface
  mixins --> mixinsUi
  entity -- "read by" --> remote
  entity -- "bound to tables" --> drizzle
  entity --> form
  bundle --> form
  form --> mixinsForm
  mixins --> mixinsForm
  form --> crud
  crud --> mixinsCrud
  entity --> cms
  form --> cms
  crud --> cms
  cms --> cmsDrizzle
  drizzle --> cmsDrizzle
  mixins --> mixinsCrud
  remote --> crud
  metadata --> surface
  metadata --> entity
  metadata --> composition
  composition --> builder
  bundle --> builder
  form --> builder
  surface --> ssr
  remote -- "resume part" --> ssr
  app --> richtext --> richtextDom
  bundle --> richtextDom
  richtextDom --> mixinsRichtext
  mixins --> mixinsRichtext
  app --> react
  app -- "views read as source" --> reactCodegen
```

The arrows are integration boundaries, not new application state machines.
Agent projects application capabilities. Remote reconciles server facts into the
Model. Sync replays application Messages against an authoritative server order.
Mirror keeps a secondary representation of Model fields. Mixins extends view
structure without touching Model state. Primitives packages reusable
browser and clock behaviour without hiding state. Entity declares a domain once
as plain values; Remote, the Drizzle binding, and Form read it, and Crud joins a
form to a Remote operation. Form and Crud own their submodel transitions inside the parent Model;
Entity describes structure without holding runtime state. Durable can also be used independently
as an ordered server journal.

The rule that makes the whole graph composable is **one owner per datum**:

| State | Owner | Package |
| --- | --- | --- |
| The route, the selection, a transient error | the local Model, plain `update` | — |
| A reusable child machine's slice, placed once or per key | the parent Model | `foldkit-bundle` places |
| A media query, timer reading, socket state, device list, or clipboard result | the parent Model | `foldkit-primitives` places |
| A filter the URL shows, a draft a device remembers | the local Model | `foldkit-mirror` observes |
| Facts owned by another system | the server | `foldkit-remote` caches |
| Client-authored state that must survive offline and converge | the durable log | `foldkit-sync` + `foldkit-durable` |
| What an agent may see and do | the application | `foldkit-agent` observes and exposes |

That ownership rule is more important than the package boundaries. A single
Surface may read across local state, Remote state, and Submodels because a Surface
is an observation/capability boundary, not a second owner.

## Try it

Start with [`examples/todo-app`](./examples/todo-app). It is the browser version
of the architecture above: local-first state, owner-only rules, WebMCP tools, a
linkable filter, and view composition around one Foldkit application.

For the broadest integration trace, use
[`examples/kitchen-sink`](./examples/kitchen-sink). For one concept at a time:

| Example | Shows |
| --- | --- |
| [`examples/todo`](./examples/todo) | Agent contracts and WebMCP |
| [`examples/sync`](./examples/sync) | durable Messages, replicas, and server ordering |
| [`examples/remote`](./examples/remote) | normalized server-owned state end to end |
| [`examples/mixins`](./examples/mixins) | typed view extension points end to end |

The application examples print transcripts with important lines pinned by tests.
`pnpm demo` runs the root integration sequence; run the CMS demo separately. The [examples index](./examples/README.md) gives the recommended
reading order.

## Install

Install the pieces for the boundary you are adding; the packages are designed to
be adopted independently.

```bash
# typed application boundaries
pnpm add foldkit-surface

# agent capabilities + one protocol adapter
pnpm add foldkit-agent foldkit-agent-webmcp

# normalized server-owned state
pnpm add foldkit-surface foldkit-remote
pnpm add foldkit-remote-server foldkit-remote-drizzle # optional server compilation

# local-first replicated state
pnpm add foldkit-surface foldkit-sync foldkit-durable

# URL / local key-value representations
pnpm add foldkit-mirror

# reusable Submodels placed with every part wired
pnpm add foldkit-bundle foldkit-bundle-surface foldkit-surface

# a domain declared once, forms from an operation's input, and edit screens
pnpm add foldkit-entity foldkit-form foldkit-mixins-form
pnpm add foldkit-crud foldkit-remote # an editor, list, detail, and remover over Remote
pnpm add foldkit-mixins-crud # draws a list as a table and a detail as a description list
pnpm add foldkit-cms # content types, drafts beside the row, and a derived lifecycle
pnpm add foldkit-cms-drizzle # its server: the audience boundary, drafts, and a publish that is whole

# ready-made primitives: media, timers, sockets, observers, clipboard
pnpm add foldkit-primitives

# view extension points
pnpm add foldkit-mixins foldkit-mixins-surface

# React interop in either direction
pnpm add foldkit-react react react-dom
pnpm add -D foldkit-react-codegen # views to TSX source
```

Other agent adapters are `foldkit-agent-mcp`, `foldkit-agent-a2a`, and
`foldkit-agent-native`; `foldkit-mixins-ui` adapts compatible `@foldkit/ui`
components.

`foldkit` and `effect` are peer dependencies. Foldkit `0.163.0` peer-depends on
`effect@4.0.0-rc.116` and `@effect/platform-browser@4.0.0-rc.116`, so these
packages target Effect 4. `foldkit-durable`
requires Node 22 for `node:sqlite`. The [release matrix](./docs/releases.md)
lists every package's current version.

### Agent skill

[`skills/foldkit-plus`](./skills/foldkit-plus/SKILL.md) is an
[Agent Skill](https://agentskills.io) that teaches a coding agent what each
package owns, when to reach for it, and a basic example of each. Install it into
Claude Code, Cursor, OpenCode, and other agents with
[skills.sh](https://skills.sh):

```bash
npx skills add doeixd/foldkit-plus --skill foldkit-plus
```

## Go deeper

The root README is the map. The guides teach the architecture and each package
README documents its API.

| Topic | Guide |
| --- | --- |
| Agent contracts and adapters | [Agents](./docs/agents.md) |
| Server-owned normalized state | [Server-derived state](./docs/remote.md) |
| One domain for the cache, the database, forms, and edit screens | [One domain declaration](./docs/entity.md) |
| Local-first replication and the durable server log | [Replicated state](./docs/replication.md) |
| URL and key-value mirrors | [Mirrored state](./docs/mirror.md) |
| Inside-out view composition | [View composition](./docs/mixins.md) |
| Running a Foldkit app over a replica | [Runtime binding](./docs/sync-runtime-binding.md) |
| Design lineage and prior art | [Prior art and design lineage](./docs/prior-art.md) |

The [0.7 release post](./docs/blog/0.7.0.md) introduces Entity, Form, and Crud.
The [documentation map](./docs/README.md) gives the full reading order, package
references, design notes, and historical material. The
[release matrix](./docs/releases.md) tracks published versions; the
[revision plan](./docs/design/REVISION_PLAN.md) records ongoing design work.

## Status

Foldkit Plus is `0.x`, built against a `0.x` Foldkit and an Effect 4 release
candidate. APIs are still settling and minor releases may break. The
[CHANGELOG](./CHANGELOG.md) records what changed and why.

The repository is exercised as a system: package tests run in CI, README-facing
examples are type-checked or pinned as deterministic transcripts, and `pnpm demo`
runs the worked examples together.

## Contributing and releasing

```bash
pnpm install
pnpm format:check
pnpm typecheck
pnpm test
pnpm demo
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development workflow and
[AGENTS.md](./AGENTS.md) for repository working agreements and documentation
standards. Release mechanics and the package/version matrix live in
[docs/releases.md](./docs/releases.md).

## License

MIT. These are community packages, published unscoped as Foldkit itself is. They
are not affiliated with or endorsed by the Foldkit maintainers, and the names are
theirs for the asking.

## References

- Foldkit — <https://foldkit.dev/> · <https://github.com/foldkit/foldkit>
- WebMCP — <https://github.com/webmachinelearning/webmcp>
- Agent Native — <https://github.com/BuilderIO/agent-native>
