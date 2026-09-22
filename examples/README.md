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
| [`mixins`](./mixins) | Typed view extension points: Surface → SlotView → Style/Behavior, plus A11y/introspection | Focused render trace |
| [`todo`](./todo) | `foldkit-agent` by itself: a contract, a hand-written host, and agent protocol adapters without Sync | Small agent-focused example |
| [`react`](./react) | React interop in both directions, and compiling a Foldkit view to TSX | Focused jsdom trace |
| [`kitchen-sink`](./kitchen-sink) | How the data, replication, agent, and view packages compose, including Remote + Drizzle, Sync/Durable, all agent adapters, and Mixins | Broad deterministic in-process integration trace |

The todo app covers URL/device mirrors. The Bundle example authors small
bundles; the ready-made primitives have their own
[subpath guides](../packages/primitives/README.md#map-of-the-package).
The `tanstack` and `livestore` directories contain query-interpreter conformance
work rather than the application transcripts listed here.

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