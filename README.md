# foldkit-plus

An application starts clean, then its state splinters. A fetch hook caches server rows, a URL store holds the active filter, a sync layer grows its own reducer, and an agent handler re-implements transitions. Soon those copies disagree.

[Foldkit](https://foldkit.dev/) keeps UI state in one state machine: one typed **Model** (your application state), a **Message** union (everything that can happen), and one pure **`update`** function that produces the next Model. **Foldkit Plus** extends that state machine to the rest of your app without adding a second store. Server data reconciles into the Model, offline edits replay through `update`, the URL mirrors Model fields, and agents only send Messages your application already handles.

## Try the live demos

See the packages running at [foldkit-plus.pages.dev](https://foldkit-plus.pages.dev/). Server-backed demos run their server inside your browser, shared across tabs, so nothing leaves your machine:

<!-- demos -->
- [A blog studio and its site](https://foldkit-cms-demo.pages.dev/) ([`examples/cms`](./examples/cms)): Drafts beside the row, revisions, scheduled publishing and a page builder, with the public site rendered at build time.
- [Two devices, one registry](https://foldkit-registry-demo.pages.dev/) ([`examples/registry`](./examples/registry)): Two devices edit 10,000 products in a data grid, offline and in conflict, and agree once both are back.
- [Pages two tabs edit at once](https://foldkit-pages-demo.pages.dev/) ([`examples/pages`](./examples/pages)): Rich text two people edit at the same time, online or not, converging through one journal.
- [A rich text playground](https://foldkit-richtext-demo.pages.dev/) ([`examples/richtext-playground`](./examples/richtext-playground)): One document with movable blocks, anchored discussions, images, tables, code, toggles and footnotes, every edit a transition of the Model.
- [A todo list an agent can use](https://foldkit-todo-demo.pages.dev/) ([`examples/todo-app`](./examples/todo-app)): One application definition drives the view, the tools an agent calls, the document replicas share, and the policy the server enforces.
- [A Twitter clone, Chirp](https://foldkit-chirp-demo.pages.dev/) ([`examples/chirp`](./examples/chirp)): Posts declared once as Entities, guarded on the server, served through Remote, posted and edited through forms built from the same input, and liked in one round trip.
- [A data grid over 100,000 rows](https://foldkit-grid-demo.pages.dev/) ([`examples/data-grid`](./examples/data-grid)): A grid that owns focus, selection, columns and the open editor, while the application owns every row.
- [Eight widgets from shared primitives](https://foldkit-widgets-demo.pages.dev/) ([`examples/widgets`](./examples/widgets)): Once the capabilities exist, a family of widgets gets cheap: each one is a Bundle placement plus Behaviors on a shared Collection description, with no bespoke state machine.
<!-- /demos -->

## Which package do you need?

| What you want to do | Package | Guide |
| --- | --- | --- |
| Keep filters or drafts in the URL or storage | `foldkit-mirror` | [Mirrored state](./docs/mirror.md) |
| Cache server data and mutate optimistically | `foldkit-remote` | [Server-derived state](./docs/remote.md) |
| Sync offline edits across devices and tabs | `foldkit-sync`, `foldkit-durable` | [Replicated state](./docs/replication.md) |
| Edit server rows offline through a journal | `foldkit-sync`, `foldkit-remote` | [Editing server data](./docs/editing-server-data.md) |
| Let an AI agent use your app via MCP or A2A | `foldkit-agent` | [Agents](./docs/agents.md) |
| Share one data schema across DB, cache, and forms | `foldkit-entity` | [One domain declaration](./docs/entity.md) |
| Enforce read and write permissions everywhere | `foldkit-guard` | [Guard README](./packages/guard/README.md) |
| Build forms and CRUD screens from a schema | `foldkit-form`, `foldkit-crud` | [Form README](./packages/form/README.md) |
| Use accessible, themed UI widgets | `foldkit-mixins-ui` | [Widget catalog](./packages/mixins-ui/README.md) |
| Style or extend views without forking markup | `foldkit-mixins` | [View composition](./docs/mixins.md) |
| Reuse a child state machine in many places | `foldkit-bundle` | [Bundle README](./packages/bundle/README.md) |
| Render on the server and resume in the browser | `foldkit-ssr` | [SSR README](./packages/ssr/README.md) |
| Edit rich text or a 100,000-row data grid | `foldkit-richtext`, `foldkit-data-grid` | [Rich text](./packages/richtext-dom/README.md) |

For the rest of the catalog—including `foldkit-surface`, `foldkit-primitives`, `foldkit-cms`, `foldkit-media`, `foldkit-site`, `foldkit-host`, and `foldkit-react`—see [the documentation map](./docs/README.md).

## Keep a filter in the URL without a second store

To connect an extension without a second store, `foldkit-surface` wraps your `Model`, `Message`, and `update` so extensions can point at Model fields by name. Below, `foldkit-mirror` binds `filter` and `page` to the URL and reads query strings back into the Model:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Surface } from 'foldkit-surface'
import { Mirror } from 'foldkit-mirror'

const Filter = Schema.Literals(['all', 'active', 'done'])
const Model = Schema.Struct({ filter: Filter, page: Schema.Number })
const Message = defineMessageUnion({ ChangedFilter: { filter: Filter } })
const initial = { filter: 'all', page: 1 } as const
const update = (model: typeof Model.Type, message: typeof Message.Type) =>
  Message.match(message, {
    ChangedFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
  })

const App = Surface.application({ Model, Message, initial, update })
const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter, App.model.page] })

const active = Filters.urlChanged(initial, '/todos?filter=active&page=2')
const next = update(active, Message.ChangedFilter({ filter: 'done' })).model
console.log(active)
console.log(Filters.href(next))
console.log(Filters.href(initial))
```

What happened when this ran:

```text
{ filter: 'active', page: 2 }
/?filter=done&page=2
/
```

`Filters.urlChanged` reads the query string back into your Model (`{ filter: 'active', page: 2 }`). After `update` sets `filter` to `'done'`, `Filters.href(next)` builds `/?filter=done&page=2`, while `Filters.href(initial)` drops default values back to `/`. Your Model owns both fields and `update` remains the only place they change.

## Install

Run the setup command to check your `effect` and `foldkit` versions, print the install command for your package manager, and optionally install the coding-agent skill:

```bash
npx --legacy-peer-deps foldkit-plus setup
```

Or install the umbrella package directly with pnpm (every package is also published on its own):

```bash
pnpm add foldkit-plus
```

## Where to go next

- **Browse guides and API docs:** [foldkit-plus.pages.dev](https://foldkit-plus.pages.dev/)
- **Explore the full documentation map:** [docs/README.md](./docs/README.md)
- **Run focused code examples:** [examples/README.md](./examples/README.md)
- **Install the coding-agent skill:** `npx skills add doeixd/foldkit-plus --skill foldkit-plus`

MIT license. These are community packages for [Foldkit](https://foldkit.dev/) and are not affiliated with or endorsed by the Foldkit maintainers.
