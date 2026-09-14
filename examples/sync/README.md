# Replicated todos

One todo document replicated by [`foldkit-sync`](../../packages/sync) over a
[`foldkit-durable`](../../packages/durable) journal on SQLite. It is the
lower-level example of the pair: where [`examples/todo-app`](../todo-app) shows
replication as part of a whole application, this one takes the sync and journal
machinery apart — the outbox, reconciliation, the transport, the server's
policy, presence, and server-authority effects — and puts a test on each piece.

One declaration drives both halves. `sync.ts` builds
`Surface.application({ Model, Message, initial, update })`, picks the shared
fields with `Projection.pick(App.fields.todos)`, and names the durable variants
with `MessageSet.make(...)`; `Sync.forApplication(App).make(...)` derives the
shared projection, the durable subset, the initial snapshot, and replay from
that. `journal.ts` spreads `TodoSync.journalContract()`, so the server and the
replica replay the same Messages through the application's own `update`.

## Run it

From the repository root:

```bash
pnpm install && pnpm build
pnpm --filter foldkit-example-sync demo   # the command-line walkthrough
pnpm exec vitest run examples/sync/test         # the recovery catalogue
pnpm --filter foldkit-example-sync dev    # the browser page
```

`demo` recovers an offline outbox, converges two replicas through a SQLite
journal, dispatches two server-agent capabilities through that same journal as
another producer, and expires a presence peer on a `TestClock`. It asserts as it
goes and prints the converged document at the end; its browser storage is
`fake-indexeddb`.

`dev` serves a small page on native IndexedDB and the real Foldkit runtime. Add
a todo, select it, and reload: the todo survives, the selection resets — `todos`
is the shared slice, `selectedTodoId` is not. The page talks to no server;
`src/server.ts` fronts the journal with a local `ws` WebSocket server, and
`test/websocket.test.ts` converges replicas over it.

## The files

| File | What it holds |
| --- | --- |
| `app.ts` | The Model, the Message union, and `update`. Ids are Message inputs; `update` mints nothing and reads no clock. |
| `sync.ts` | The contract: the shared projection, the durable subset, and `mountTodos` over `Sync.mount`. |
| `journal.ts` | The server journal: `Journal.make` on SQLite, spreading `TodoSync.journalContract()`, plus the application policy — `authorize` against the authoritative Model, and `effects` for server-authority work settled through the durable ledger. |
| `server.ts` | A `ws` WebSocket server fronting the journal. The principal is derived per connection from a `token` query parameter and can expire; actor identity never comes from an operation. |
| `serverAgent.ts` | An agent host over the journal: a capability dispatch becomes one operation authored by a dedicated replica, under the caller's authenticated principal. |
| `runtime.ts`, `browser.ts` | The dev page over `Sync.mount`. |
| `demo.ts` | The command-line walkthrough. |

## The recovery catalogue

The tests are the point of this example. Each name says what it recovers from:

- Offline boot and reload: `restores the offline outbox and sequence without persisting local Model fields`.
- Failed persistence: `publishes nothing on failed persistence and can retry without losing its sequence`.
- Concurrent offline edits: `converges conflicting offline renames by authoritative order and clears acknowledgements`; `test/websocket.test.ts` does it over a real socket.
- Editing during a pull: `keeps edits made during a pull and rebases them onto remote changes`.
- Lost acknowledgement, reconnect, resend: `resends after a lost acknowledgement without duplicating a commit`.
- Server restart: `persists app operations across restart`, with a file-backed journal closed and reopened.
- Compaction catch-up: `catches a new replica up from a checkpoint after history is compacted` and `acknowledges a pending operation that compaction already folded in`.
- Refusal: `refuses unauthorized writes and unauthenticated reads`, `applies the app policy against the authoritative Model`, and, over a socket, `derives a principal per connection and refuses an unknown token`.
- Malformed response: `refuses a response with … without changing durable state`.
- A second tab sharing an identity: `prevents simultaneous handles from overwriting one replica identity`.
- Tab closure: `ignores retransmitted committed operations and refuses work after close`.
- Credential expiry: `closes a connection when its credential expires and refuses the token afterwards`.
- Server-authority effects: `runs a server-authority effect once per committed operation`, `keys server effects per document, not just per operation`, and `does not repeat an effect when a compacted operation is retransmitted`.
- A server agent as a producer: `commits a dispatch as an operation a replica converges on` and `cannot bypass the journal policy`. `test/mcp.test.ts` drives the same host through a transport-free MCP `tools/call`.
- Presence: `broadcasts presence between two authenticated peers over the socket` and `does not broadcast presence across document boundaries`.
- Last-writer-wins fields: `test/lww.test.ts`, including `allocates beyond rejected and unsubmitted writes after IndexedDB reload`.

## What it does not cover

Durable transitions must be state-only: replay rejects Commands and changes to
local fields, which catches the illustrated mistakes but cannot prove arbitrary
JavaScript is deterministic. Ordering is server-authoritative and
single-writer-per-document — there is no CRDT merge and no peer-to-peer
authority. Message-schema migration is not addressed.

Left to the application: verifying the connection credential (the example maps
the `token` query parameter to a principal with an expiry and closes the socket
when it lapses; a real deployment verifies a bearer token or session and
refreshes it), a compaction schedule, retention or GC of the identity rows that
keep retransmission idempotent, and stable semantic effect identities — this
example keys effects by document, operation, and array position, so its effect
policy must not be reordered for operations already committed. See the
[durable recovery policy](../../packages/durable/README.md#effect-recovery)
before wiring server-authority effects to external actions.

Startup and outbox replay grow with the outbox size
([benchmarks](../../docs/benchmarks.md)). Browser storage eviction and abrupt
power loss are outside the tests. LWW clocks live in a separate IndexedDB
database from the outbox: keep it across reloads, and if it is lost, use a fresh
replica id rather than resetting the same writer's counter — see the
[sync README](../../packages/sync/README.md#last-writer-wins-fields-m8-experimental).

[`docs/sync-runtime-binding.md`](../../docs/sync-runtime-binding.md) records the
Foldkit 0.158.2 seams `Sync.mount` binds to.
