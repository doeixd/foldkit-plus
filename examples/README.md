# Examples

The examples are executable documentation. Each one prints a deterministic
transcript, and a test pins the important lines so the claim in the README
cannot quietly drift away from the code.

Start with one mechanism: [Bundle](./bundle/README.md) for reusable child
state, [Todo](./todo/README.md) for agents, or [Remote](./remote/README.md) for
server data. Then use [the todo app](./todo-app/README.md) to see several
mechanisms compose. The kitchen sink is a later integration reference.

## Which example should I read?

| Example | Start here when you want to understand… | Shape |
| --- | --- | --- |
| [`bundle`](./bundle) | One child placed twice, a keyed collection, OutMessages, and ownership validation | Small in-process transcript; no browser |
| [`todo-app`](./todo-app) | How the packages fit around a real Foldkit application: local-first state, a durable server log, agents, URL/device mirrors, typed view customization, and ownership validation | Browser app + SQLite/WebSocket server; application composition |
| [`entity`](./entity) | One domain declaration (`foldkit-entity`) read by the Remote client, bound to SQLite by the Drizzle server, and edited through a `foldkit-crud` editor: a `foldkit-form` form feeding a mutation | In-process trace with real SQL, plus a browser mode (`pnpm dev`) |
| [`cms`](./cms) | A post from its first keystroke to being taken off show (`foldkit-cms`, `foldkit-cms-drizzle`): autosaved drafts beside the row, preview, publish through the application's own mutation, a schedule that comes due, a conflict, a restore, and the audience boundary, from a writer's, an editor's and a visitor's chair | In-process trace with real SQL, plus a browser mode (`pnpm dev`) where the chair is in the address |
| [`remote`](./remote) | Server-owned data: requirements, planning, normalized entities, queries, optimistic mutation, retention, and decode failures | Focused in-process trace |
| [`sync`](./sync) | Offline/local-first replication: outbox, reconciliation, transport, presence, LWW fields, and the durable journal seam | Focused client/server trace |
| [`pages`](./pages) | Collaborative rich text, local-first: pages two people edit at once (`RichText.Replicated` over `foldkit-sync` and `foldkit-durable`), a to-do list, Markdown export, and edits kept through an outage and a reload | Two-replica trace (`pnpm demo`), plus a browser app and a sync server |
| [`mixins`](./mixins) | Typed view extension points: Surface → SlotView → Style/Behavior, plus A11y/introspection | Focused render trace |
| [`tree`](./tree) | A file explorer from composed primitives: `TreeNavigation` + `Selection` placements over one Collection description, manual keyboard selection | Text trace (`pnpm demo`) and focused tests |
| [`drawer`](./drawer) | A modal settings panel from the Overlay policy: one `modal` value into dismiss marking, focus, scroll lock, and inertness | Text trace (`pnpm demo`) and focused tests |
| [`widgets`](./widgets) | Thin composed widgets (toolbar, toggle, toggle-group, accordion, alert-dialog, autocomplete, number-field, otp-field, checkbox-group, meter, command, hover-card) over the shared primitives | Text trace (`pnpm demo`), interactive page (`pnpm dev`), focused tests |
| [`todo`](./todo) | `foldkit-agent` by itself: a contract, a hand-written host, and agent protocol adapters without Sync | Small agent-focused example |
| [`react`](./react) | React interop in both directions, and compiling a Foldkit view to TSX | Focused jsdom trace |
| [`data-grid`](./data-grid) | A 100,000-row product registry in `foldkit-data-grid`: a pinned column, editing with validation, row and range selection, and spreadsheet copy and paste, with the products owned by the application | Browser app (`pnpm dev`) and jsdom and Chromium tests |
| [`registry`](./registry) | The same registry with a server: 100,000 products read through Remote a page at a time, sorted by the server, loaded on scroll; edits kept on the device through Sync until the server's journal commits them and applies them to the table ([the guide](../docs/editing-server-data.md)) | Browser app (`pnpm dev`) with its server and journal; jsdom, HTTP and WebSocket tests |
| [`kitchen-sink`](./kitchen-sink) | How the data, replication, agent, and view packages compose, including Remote + Drizzle, Sync/Durable, all agent adapters, and Mixins | Broad deterministic in-process integration trace |

The todo app covers URL/device mirrors. The Bundle example authors small
bundles; the ready-made primitives have their own
[subpath guides](../packages/primitives/README.md#the-map).
The `tanstack` and `livestore` directories contain query-interpreter conformance
work rather than the application transcripts listed here. `livestore` pins
`effect@4.0.0-rc.112` on its own while the workspace is on 4.0.0: LiveStore's
only Effect 4 build imports a testing module Effect removed after that release
and the `effect/unstable/*` paths 4.0.0 removed, and the example hands it
plain data, so it never shares an Effect value with the rest of the workspace.

## Foldkit's own examples, on Foldkit Plus

[`foldkit/`](./foldkit/README.md) holds the example apps
[Foldkit's README](https://github.com/foldkit/foldkit#examples) lists, ported
to Foldkit Plus: one folder per upstream example, kept close to it, with a Plus
package taking over only the concern it owns. Its README is the map of what
each port owns.

## Recommended reading order

For the todo app, the README already lists its source files in the order to read
them. At a higher level, this sequence tends to make the architecture click:

```text
1. app.ts / Model + Message + update
2. Surface declarations
3. one extension contract (Sync, Agent, Mirror)
4. the runtime binding that interprets it
5. Module.validate / manifest, which shows the ownership result
```

For a focused example, read its README’s first-interaction walkthrough, then
follow the indicated declarations into `src/demo.ts`.
The transcript tells you what each step is meant to prove, then the source shows
the API that produced it.

## Run them

From the repository root:

```bash
pnpm install
pnpm build
pnpm demo
```

`pnpm demo` runs the root script's integration sequence. The CMS transcript is
available separately; it is not currently included in that script. Run a single
example directly when learning or iterating:

```bash
pnpm --filter foldkit-example-bundle demo
pnpm --filter foldkit-example-remote demo
pnpm --filter foldkit-example-entity demo
pnpm --filter foldkit-example-cms demo
pnpm --filter foldkit-example-sync demo
pnpm --filter foldkit-example-mixins demo
pnpm --filter foldkit-example-kitchen-sink demo
```

The todo app also has a browser mode; see [`todo-app/README.md`](./todo-app) for
`pnpm dev` and the local sync server.

## Check your understanding

For each trace, identify the declaration, the call that starts work, the Message
that returns, and the Model field that changes. Then change one input and
predict the next output before running it. Run that example's transcript test
with `pnpm exec vitest run examples/<name>/test` from the root; a changed
behavior should change the assertions, not be hidden by weakening them.

## What the examples are not

They are not separate architectures or starter templates that hide the core
ideas. They are meant to make the boundaries visible. When an example uses an
in-memory transport, database, or host, the README says so; the package README
then documents the production seam (Effect Layer, WebSocket, SQLite, browser
runtime, and so on).

For conceptual explanations before API detail, use the [documentation
map](../docs/README.md).