# Examples

The examples are executable documentation. Each one prints a deterministic
transcript, and a test pins the important lines so the claim in the README
cannot quietly drift away from the code.

If you are new to Foldkit Plus, start with the **todo app**, not the kitchen
sink. The kitchen sink proves breadth; the todo app explains why the pieces are
there.

## Which example should I read?

| Example | Start here when you want to understand… | Shape |
| --- | --- | --- |
| [`todo-app`](./todo-app) | How the packages fit around a real Foldkit application: local-first state, a durable server log, agents, URL/device mirrors, typed view customization, and ownership validation | Browser app + SQLite/WebSocket server; best first example |
| [`entity`](./entity) | One domain declaration (`foldkit-entity`) read by the Remote client, bound to SQLite by the Drizzle server, and edited through a `foldkit-form` form that feeds a mutation | Focused in-process trace, real SQL |
| [`remote`](./remote) | Server-owned data: requirements, planning, normalized entities, queries, optimistic mutation, retention, and decode failures | Focused in-process trace |
| [`sync`](./sync) | Offline/local-first replication: outbox, reconciliation, transport, presence, LWW fields, and the durable journal seam | Focused client/server trace |
| [`mixins`](./mixins) | Typed view extension points: Surface → SlotView → Style/Behavior, plus A11y/introspection | Focused render trace |
| [`todo`](./todo) | `foldkit-agent` by itself: a contract, a hand-written host, and agent protocol adapters without Sync | Small agent-focused example |
| [`react`](./react) | React interop in both directions, and compiling a Foldkit view to TSX | Focused jsdom trace |
| [`kitchen-sink`](./kitchen-sink) | How fourteen packages compose at once, including Remote + Drizzle, Sync/Durable, all agent adapters, and Mixins | Broad deterministic in-process integration trace |

`foldkit-mirror` is deliberately absent from the kitchen sink because its most
useful behavior needs a URL/browser store. The todo app covers it instead.
Together those two examples exercise all fifteen packages.

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

For the focused examples, `src/demo.ts` is intentionally the file to read first.
The transcript tells you what each step is meant to prove, then the source shows
the API that produced it.

## Run them

From the repository root:

```bash
pnpm install
pnpm build
pnpm demo
```

Or run one example directly:

```bash
pnpm --filter foldkit-example-remote demo
pnpm --filter foldkit-example-entity demo
pnpm --filter foldkit-example-sync demo
pnpm --filter foldkit-example-mixins demo
pnpm --filter foldkit-example-kitchen-sink demo
```

The todo app also has a browser mode; see [`todo-app/README.md`](./todo-app) for
`pnpm dev` and the local sync server.

## What the examples are not

They are not separate architectures or starter templates that hide the core
ideas. They are meant to make the boundaries visible. When an example uses an
in-memory transport, database, or host, the README says so; the package README
then documents the production seam (Effect Layer, WebSocket, SQLite, browser
runtime, and so on).

For conceptual explanations before API detail, use the [documentation
map](../docs/README.md).