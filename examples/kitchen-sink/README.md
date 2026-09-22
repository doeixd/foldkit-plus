# Kitchen sink

The data, replication, agent, and view packages wired into one application. It runs entirely
in-process — an in-memory SQLite database and a durable journal, no server and
no browser — so the transcript is deterministic and needs nothing running.
For URL and browser-storage mirroring, see
[`examples/todo-app`](../todo-app).

## Read it in three passes

1. Follow `Project` from its SQL binding in [stack.ts](src/stack.ts) to the
   `Ready Apollo` read in [demo.ts](src/demo.ts). This is server-owned data;
   the client's Remote cache can be rebuilt.
2. Follow `notes` through the Sync contract and journal. These are
   client-authored operations; losing a pending outbox entry loses intent.
3. Follow one agent capability back to the same application Message. The
   protocol adapters change how it is called, not who owns the transition.

Start with [Remote](../remote/README.md) or [Sync](../sync/README.md) if the
first two paths are unfamiliar. The kitchen sink is a composition example,
not a minimal template that every application needs to copy.

## Run it

```bash
pnpm install && pnpm build                        # from the repository root
pnpm --filter foldkit-example-kitchen-sink demo
```

`pnpm demo` at the repository root runs it with the other examples. Read
`src/stack.ts` first — it is the one application every package below hangs off —
then `src/demo.ts`, which drives it.

## The transcript

```
plan: Project:p1 [id,name,status,owner]
before fetch: Initial
after fetch (Drizzle SQLite): Ready Apollo
nested selection (one read): owner Ada
mutation (remote-1): MutationSucceeded -> Ready Apollo II
live (hub.changed): EntityPatched name=Apollo II
query page: p2, p1
optimistic insert: p3, p2, p1
confirmed insert: p3, p2, p1
inspect: 4 entities cached
retained with the page: Project:p1, User:u1, Project:p2, Project:p3
retained by the Board alone: Project:p1, User:u1
hydrated: Ready Apollo II, plan empty
replicated (durable journal): First note
capabilities: requested_create_note, rename_note, selected_note
agent context: {"notes":[{"id":"n1","body":"First note"}],"selectedNoteId":null}
notes after agent: First note, From the agent
webmcp tools: requested_create_note, rename_note, selected_note
webmcp call: Dispatched RequestedCreateNote
mcp tools: requested_create_note, rename_note, selected_note
a2a card: Kitchen Sink (3 skills)
notes after A2A: First note, From the agent, From WebMCP, From A2A
native actions: requested_create_note, rename_note, selected_note
rendered classes: board
mixins-ui button classes: save
```

`test/demo.test.ts` pins the lines that carry the claims, so the example cannot
quietly stop demonstrating them.

## What each package does here

| Layer | Package | In this example |
| --- | --- | --- |
| Observation | `foldkit-surface` | One `Surface.application` embeds the Remote submodel beside the client-owned `notes` slice; `BoardSurface` projects both. `test/module.test.ts` validates the whole set of contracts. |
| Server-derived state | `foldkit-remote` | The normalized cache submodel: `Data.prefetch`, `Data.live`, `Data.mutate` with an optimistic `ConnectionChange`, `Data.query`, `Data.inspect`, `Remote.retain`, and `RemotePersistence.dehydrate`/`hydrate`. |
| Server | `foldkit-remote-server` | `RemoteServer` sources compiled to `RemoteServer.handlers`, served in-process through `Remote.clientLayer` over the database layer; a `liveHub` feeds the live subscription from the rename mutation. |
| Server SQL | `foldkit-remote-drizzle` | `Project` and `User` are Drizzle bindings over in-memory SQLite tables; the nested `owner` selection, the reads, and the query compile to SQL. |
| Client-owned state | `foldkit-durable` | A `Journal.make` over the Sync contract orders the `notes` operations. |
| Replication | `foldkit-sync` | A replica, an in-memory `Storage`, and `replica.start` exchanging through a `TransportClient`. |
| Agent | `foldkit-agent` | One contract projected from the same Model and Messages. |
| Agent browser | `foldkit-agent-webmcp` | The contract registered into a `document.modelContext` stand-in. |
| Agent external | `foldkit-agent-mcp` | The transport-free MCP handler answers `initialize` and `tools/list`. |
| Agent A2A | `foldkit-agent-a2a` | An Agent Card and a `message/send` task. |
| Agent Native | `foldkit-agent-native` | The contract compiled to package actions. |
| View | `foldkit-mixins` | A `Slots` contract and a Style attached to it. |
| View + Surface | `foldkit-mixins-surface` | `SurfaceView.define` binds `BoardSurface`'s projected Model to the slots. |
| View + UI | `foldkit-mixins-ui` | A `@foldkit/ui` Button customised through `Button.resolve` without copying it. |
