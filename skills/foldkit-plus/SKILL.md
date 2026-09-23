---
name: foldkit-plus
description: Explains the Foldkit Plus packages (foldkit-surface, foldkit-remote with -server and -drizzle, foldkit-sync, foldkit-durable, foldkit-mirror, foldkit-agent and its WebMCP/MCP/A2A/Agent Native adapters, foldkit-mixins with -surface, -ui, -form and -crud, foldkit-react with -codegen, foldkit-bundle with -surface, foldkit-primitives, foldkit-entity, foldkit-form, foldkit-crud, foldkit-cms with -drizzle), which one owns which kind of state, and how to use each with basic examples. Use when writing or reviewing a Foldkit application that uses any foldkit-* package, choosing a package for server data, offline sync, URL or storage state, AI agent tools, view styling, React interop, reusable Submodels, domain entities, forms, admin screens, or a CMS with drafts and publishing, or when the user mentions Foldkit Plus, Surface, Projection, Remote, Sync, Mirror, Agent.expose, Mixins, ReactComponent, FoldkitComponent, Bundle, Entity.relate, Entity.select, Form.make, Crud.editor, or Cms.content.
license: MIT
metadata:
  version: '0.10.0'
  repository: https://github.com/doeixd/foldkit-plus
---

# Foldkit Plus

Foldkit Plus is a set of packages that extend a [Foldkit](https://foldkit.dev/)
application to agents, servers, other devices, the URL, and design systems
**without adding a second place to keep state**. The application stays one state
machine: a Schema-typed **Model**, a **Message** union, and one pure **`update`**.

Every package keeps that rule:

- an agent can only send Messages `update` already handles;
- server data lives in the Model and is reduced by `update`;
- replicas replay the same Messages through the same `update`;
- the URL and storage mirror a slice of the Model, never own it;
- views are extended from outside without forking them.

Targets Foldkit `0.163.x` and Effect 4 (`effect@4.0.0-rc.116`); see the peer
list under the rules below. APIs are `0.x` and may break between minors.

## Pick the package by who owns the data

| The state or job | Owner | Package | Reference |
| --- | --- | --- | --- |
| What a feature may observe and which Messages it may cause | the application | `foldkit-surface` | [surface.md](references/surface.md) |
| Facts owned by a server: entities, queries, mutations, live updates | the server | `foldkit-remote` (+ `-server`, `-drizzle`) | [remote.md](references/remote.md) |
| Client-authored edits that must survive offline and converge across devices | the durable log | `foldkit-sync` + `foldkit-durable` | [sync.md](references/sync.md) |
| A filter in the URL, a draft or preference remembered on a device | the local Model | `foldkit-mirror` | [mirror.md](references/mirror.md) |
| What an AI agent may see and do, over MCP, WebMCP, A2A, or Agent Native | the application | `foldkit-agent` + one adapter | [agent.md](references/agent.md) |
| Restyling or adding behaviour to views, including `@foldkit/ui` | the view contract | `foldkit-mixins` (+ `-surface`, `-ui`) | [mixins.md](references/mixins.md) |
| A reusable Submodel placed several times or per key, with every part wired | the parent Model | `foldkit-bundle` (+ `-surface`) | [bundle.md](references/bundle.md) |
| A media query, presence, timer, pagination, undo history, socket, resize, or clipboard | the parent Model | `foldkit-primitives` | [primitives.md](references/primitives.md) |
| A React component in a Foldkit view, a Foldkit program in a React app, or views compiled to TSX | the Model / the embedded program | `foldkit-react` (+ `-codegen`) | [react.md](references/react.md) |
| Typed facts a package attaches to another package's declaration (package authors only) | the key's package | `foldkit-metadata` (re-exported by `foldkit-surface`) | [surface.md](references/surface.md) |
| A domain entity's fields, relations, and derived members, declared once, and typed selections of them (Remote registers and reads them as they are; `remote-drizzle` binds them to tables) | the domain declaration | `foldkit-entity` | [entity.md](references/entity.md) |
| A form: drafts, validation, and a decoded value handed to the parent | the parent Model | `foldkit-form` (+ `foldkit-mixins-form` to draw it) | [form.md](references/form.md) |
| An edit or create screen (load, fill a form, save, report status), or a list over a query | Remote and the form; the editor only joins them | `foldkit-crud` (+ `foldkit-mixins-crud` to draw lists and details) | [crud.md](references/crud.md) |
| Drafts, revisions, a schedule, and what a visitor may see | the application's tables; a draft is kept beside the row | `foldkit-cms` + `foldkit-cms-drizzle` (editor state and server; unpublished) | [cms.md](references/cms.md) |
| What crosses from a server render to the browser: the browser's slice of the Model, handed over instead of rerunning `init` | the application, in a resume plan | `foldkit-ssr` (in development, unpublished) | [ssr.md](references/ssr.md) |
| The route, a selection, a transient error | the local Model | none: plain Foldkit | — |

Install the peers with the packages you pick, for example
`pnpm add effect foldkit foldkit-surface foldkit-sync`. `foldkit-durable` needs
Node >= 22.

Read only the reference for the package you are working with. Each has the
mental model, a minimal example, common tasks, and gotchas.

## How they connect

```text
Foldkit app (Model · Message · update)
  └─ foldkit-surface: Projection, Surface, MessageSet, Module (Metadata from foldkit-metadata)
       ├─ foldkit-agent ─ webmcp · mcp · a2a · native
       ├─ foldkit-remote ─ foldkit-remote-server ─ foldkit-remote-drizzle
       ├─ foldkit-sync ─ foldkit-durable (server journal)
       ├─ foldkit-mirror
       └─ foldkit-mixins-surface
foldkit-mixins (standalone) ─ foldkit-mixins-surface (with Surface), foldkit-mixins-ui, foldkit-mixins-form (with foldkit-form), foldkit-mixins-crud (with foldkit-crud)
foldkit-bundle (standalone) ─ foldkit-bundle-surface (with Surface), foldkit-primitives, foldkit-form
foldkit-entity (standalone) ─ read by foldkit-remote, foldkit-remote-drizzle, foldkit-form
foldkit-crud ─ joins foldkit-form, foldkit-remote, foldkit-entity
foldkit-cms ─ over foldkit-entity, foldkit-form, foldkit-crud, foldkit-remote: drafts beside the row, derived lifecycle
  └─ foldkit-cms-drizzle ─ over foldkit-remote-drizzle, -server: the audience boundary, drafts, publish in a transaction
```

`foldkit-surface` is the shared seam: most packages consume a Projection
(what to read) and a Message subset (what may happen). `foldkit-durable`, core
`foldkit-mixins`, core `foldkit-bundle`, and the protocol adapters also work on
their own.

## The one-screen example

Surface is where almost every integration starts:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Model = Schema.Struct({ todos: Schema.Array(Todo), filter: Schema.String })
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  ChangedFilter: { filter: Schema.String },
})

// Still the ordinary application: one Model, one Message union, one update.
const App = Surface.application({
  Model,
  Message,
  initial: { todos: [], filter: 'all' },
  update: (model, message) => {
    switch (message._tag) {
      case 'CreatedTodo':
        return { model: { ...model, todos: [...model.todos, { id: message.id, title: message.title }] } }
      case 'ChangedFilter':
        return { model: { ...model, filter: message.filter } }
    }
  },
})

// A named boundary: what this feature reads and the Messages it may send.
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos }),
  messages: [Message.CreatedTodo],
})
```

From here: `Sync.forApplication(App)` replicates a slice, `Agent.forApplication(App)`
exposes Messages to an agent, `Remote.make({ model: App.model.remote, … })` binds
server data, `Mirror.url(App, …)` puts fields in the URL, and
`SurfaceView.define(TodoList, …)` renders it with Mixins.

## Rules that apply to every package

- **One owner per datum.** Do not store the same fact in the Model and in a
  package-side cache, a URL store, or a second reducer. Pick the owner from the
  table above.
- **Behaviour goes through Messages and `update`.** Agents, replicas, and
  Behaviors dispatch existing Messages; they never mutate the Model.
- **Rendering performs no I/O.** Fetching, syncing, and mirroring run in
  Commands and Subscriptions derived from the Model.
- **Join integrations through one wiring list.** `Page.assemble` takes bundle
  placements and integration wirings (`Data.wiring(…)`, `….wiring('UrlChanged')`,
  contract-only `….wiring()`); routing, startup Commands, Subscriptions, and the
  Module derive from the list. See `bundle.md` and the integration's page.
- **Install only what the boundary needs.** The packages are adopted
  independently. `effect` is a peer of every package and `foldkit` of every
  client-side one (not `foldkit-durable`, `foldkit-remote-server`,
  `foldkit-remote-drizzle`). Adapters also need `foldkit-agent`,
  `foldkit-mixins-ui` needs `@foldkit/ui`, and `foldkit-agent-native` needs
  `@agent-native/core`.

## More

- Repository and guides: https://github.com/doeixd/foldkit-plus
- Examples, each with a pinned transcript: https://github.com/doeixd/foldkit-plus/tree/main/examples
- Versions and publish matrix: https://github.com/doeixd/foldkit-plus/blob/main/docs/releases.md
