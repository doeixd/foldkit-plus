# Quickstart

In a growing web app, state splinters across UI hooks, URL parameters, a server-query cache, a form library, and handlers for AI agent tools. Copying updates between them adds glue code and causes bugs when two copies disagree.

[Foldkit](https://foldkit.dev) is a TypeScript framework built on [Effect](https://effect.website) that keeps all application state in one place. One typed `Model` holds your state, one union of `Message` events lists what can happen, and one pure `update` function computes the next `Model`. **Foldkit Plus** plugs server data, offline sync, forms, sign-in, permissions, AI agent tools, and UI widgets into that same `Model` and `update`, and embeds inside React apps when needed.

See it running in the [live demos](https://foldkit-plus.pages.dev/#demos): a blog studio, an offline-capable data grid, and collaborative pages running in your browser.

## Install

Run the setup command in your project folder to print the exact install command, version pins, and project setup steps for your package manager:

```bash
npx --legacy-peer-deps foldkit-plus setup
```

Or install `foldkit-plus` alongside `foldkit` and `effect` directly:

```bash
pnpm add foldkit-plus foldkit effect
# or with npm:
npm install foldkit-plus foldkit effect
```

## Declare what one feature reads and sends

A plain selector like `m => m.todos` works for rendering, but a server fetcher, offline sync, or AI agent cannot inspect an arbitrary function to learn which fields it reads or which events it triggers. To make those dependencies explicit, register your `Model` and `Message` schemas with `Surface.application`, then call `App.surface(...)` to declare one feature boundary.

In an ESM project (Node 22+ with `"type": "module"` in `package.json`), save this as `quickstart.ts` and run `npx tsx quickstart.ts`:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Surface } from 'foldkit-plus'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({ todos: Schema.Array(Todo), filter: Schema.String })
const Message = defineMessageUnion({
  Added: { id: Schema.String, title: Schema.String },
  Filtered: { filter: Schema.String },
})

const update = (model: typeof Model.Type, message: typeof Message.Type) =>
  Message.match(message, {
    Added: ({ id, title }) => ({
      model: modifyFields(model, { todos: list => [...list, { id, title, done: false }] }),
    }),
    Filtered: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
  })

const App = Surface.application({ Model, Message })
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos }),
  messages: [Message.Added],
})

const next = update({ todos: [], filter: 'all' }, Message.Added({ id: '1', title: 'Try Foldkit' }))
console.log(Surface.read(TodoList, next.model))
console.log(TodoList.projection().dependencies)
```

Running `npx tsx quickstart.ts` prints:

```text
{ todos: [ { id: '1', title: 'Try Foldkit', done: false } ] }
[ [ 'todos' ] ]
```

**What happened:**

- `Schema.Struct` defines the data shapes and their TypeScript types via `.Type`.
- `defineMessageUnion` creates tagged event constructors (`Message.Added(...)`) and an exhaustive `Message.match` helper.
- `update` returns `{ model }` with the updated `todos` array (via `modifyFields`), leaving `filter` as `'all'`.
- `Surface.read(TodoList, next.model)` extracts `{ todos: [...] }` without `filter`, because `TodoList` only reads `model.todos`.
- `TodoList.projection().dependencies` returns `[['todos']]` — the list of `Model` field paths read by `model.todos` — without mounting a UI. Server fetching, offline sync, and agent adapters inspect that list to load only what the feature uses, while `messages: [Message.Added]` restricts which events this feature can send.

## Pick your next step by what you are building

- **Load and update server data** with automatic caching and optimistic UI: [Remote](../packages/remote/README.md)
- **Validate form inputs and build create/edit screens** from your data types: [Form](../packages/form/README.md) and [CRUD](../packages/crud/README.md)
- **Add sign-in and row-level permissions**: [Auth](../packages/auth/README.md) for sign-in and [Guard](../packages/guard/README.md) for permissions
- **Style accessible UI widgets** (`Button`, `Dialog`, `Combobox`, `DataGrid`) with theme tokens: [Component gallery](https://foldkit-plus.pages.dev/components)
- **Keep edits working offline** and stay in sync across devices: [Sync](../packages/sync/README.md)

## Next

- How `Message`s avoid lost updates during rapid clicks or keystrokes: [Who changes application state, and how](./state-model.md)
- How a shared data model, query, and write reach the screen: [From declarations to the screen](./declared-data-to-ui.md)
- Plain-English definitions for every term across the packages: [Glossary](./glossary.md)
