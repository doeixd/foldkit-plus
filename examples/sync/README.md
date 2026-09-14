# Replicated todos

A focused `foldkit-sync` + `foldkit-durable` example that takes the local-first
replication machinery apart and tests each failure boundary.

Where [`examples/todo-app`](../todo-app) shows Sync as one part of a whole
application, this example is deliberately lower-level. It exposes the replica,
outbox, server journal, transport, authorization, presence, and recovery paths so
you can see exactly how convergence happens.

The central model is:

```text
committed snapshot
       +
pending local operations
       =
optimistic shared state
```

A local durable Message is applied immediately, persisted to the outbox, and
shown to the user before the network answers. Synchronization later advances the
committed base to the server's authoritative order, removes acknowledged or
rejected local operations, and replays whatever is still pending on top.

```text
submit durable Message
        |
        v
persist operation in outbox
        |
        v
replay through application update
        |
        v
optimistic shared state
        |
        | synchronize
        v
server journal assigns authoritative order
        |
        v
new committed snapshot
        +
remaining pending operations replayed on top
```

## One declaration drives client and server

`sync.ts` starts from an ordinary Foldkit application and declares two things:

```text
shared Projection    -> which Model state replicas agree on
durable MessageSet   -> which application Messages become operations
```

`Sync.forApplication(App).make(...)` derives replay from the application's own
`update`; it does not introduce a second reducer.

On the server, `journal.ts` spreads:

```ts
TodoSync.journalContract()
```

into `Journal.make(...)`. That gives `foldkit-durable` the same codecs, initial
snapshot, operation semantics, and replay function the client uses.

Conceptually:

```text
client                                server

Foldkit Message
      |
      v
Sync Replica   <---- exchange ---->   Durable Journal
outbox                               authoritative order
optimistic state                     snapshot + cursor
```

## Run it

From the repository root:

```bash
pnpm install && pnpm build
pnpm --filter foldkit-example-sync demo
pnpm exec vitest run examples/sync/test
pnpm --filter foldkit-example-sync dev
```

Use the commands for different purposes:

| Command | What it shows |
| --- | --- |
| `demo` | one deterministic walkthrough of offline recovery, convergence, server-agent writes, and presence expiry |
| `vitest` | the recovery/failure catalogue |
| `dev` | a small browser app over native IndexedDB and the real Foldkit runtime |

## The demo walkthrough

The command-line demo does four important things.

### 1. Two replicas edit offline

Alice and Bob each open their own replica and submit a `CreatedTodo` while no
synchronization is happening.

Each replica immediately has:

```text
committed: []
pending:   [its local CreatedTodo]
visible:   replay(committed + pending)
```

The operations live in IndexedDB-backed storage, so Bob can close and reopen his
replica and still recover the pending edit.

### 2. The journal gives both edits one order

Bob synchronizes, then Alice, then Bob again. The server journal commits the
operations once, assigns the authoritative order, and sends that history back to
each replica.

After reconciliation:

```text
alice committed == bob committed == journal snapshot
alice pending   == []
bob pending     == []
```

The important mechanism is rebasing, not merging two Models directly:

```text
old base + local pending
          |
server returns newer committed history
          v
new base + still-pending local operations replayed through update
```

### 3. Another producer still goes through the journal

The demo binds a `foldkit-agent` runtime to a server-side host and dispatches two
`RenamedTodo` Messages.

Those agent calls do **not** mutate the server snapshot directly. The host turns
each dispatch into another durable operation, and the journal applies the same
policy/order/replay path as a client replica.

Alice and Bob then synchronize and converge on those agent-authored operations as
well.

### 4. Presence stays ephemeral

Presence uses a separate channel and TTL. Alice publishes a selected todo; Bob
sees it as a peer value; the `TestClock` advances past the TTL and Bob prunes it.

Presence is intentionally outside the durable log:

```text
shared document state   -> Sync + Durable
presence                -> ephemeral channel + TTL
```

It is never replayed into the document snapshot.

The demo ends with:

```text
Recovered an offline outbox, converged two replicas, replayed two server agent Messages, and let a presence peer expire.
```

followed by the final converged document. `test/demo.test.ts` pins that output.

## Try the browser version

`pnpm --filter foldkit-example-sync dev` runs a small Foldkit page over native
IndexedDB.

Add a todo, select it, and reload:

```text
todos            shared -> survives
selectedTodoId   local  -> resets
```

That is the ownership boundary made visible. The replica persists only its shared
slice and outbox; ordinary local Model state remains ordinary local Model state.

The browser page itself talks to no remote deployment. `src/server.ts` provides a
local `ws` WebSocket server over the SQLite journal, and
`test/websocket.test.ts` exercises real socket convergence separately.

## Files in reading order

| File | What it teaches |
| --- | --- |
| `app.ts` | Model, Message union, and `update`; durable facts carry their nondeterministic inputs rather than minting them during replay |
| `sync.ts` | the shared Projection, durable Message subset, Replica helpers, and `Sync.mount` integration |
| `journal.ts` | `Journal.make(...TodoSync.journalContract())`, server authorization, and durable effect settlement |
| `demo.ts` | the smallest end-to-end replication walkthrough |
| `server.ts` | WebSocket exchange and connection-derived principal identity |
| `serverAgent.ts` | another producer that must still commit through the journal |
| `runtime.ts`, `browser.ts` | browser integration over `Sync.mount` |

If the replica algorithm is what you are learning, read `app.ts` → `sync.ts` →
`demo.ts` first. The server, presence, and recovery machinery make more sense
after that.

## Recovery catalogue

The tests go much further than the demo. Grouped by the guarantee they exercise:

| Failure / edge | What the suite proves |
| --- | --- |
| offline restart | pending operations and sequence recover without persisting unrelated local Model fields |
| local persistence failure | an operation is not published until it is safely stored; retry keeps sequence integrity |
| concurrent offline edits | server order converges replicas deterministically |
| edit during pull | an operation created during synchronization is preserved and rebased over the new base |
| lost acknowledgement / resend | the same operation id is not committed twice |
| server restart | committed operations and snapshots survive journal reopen |
| compaction | a far-behind replica can resume from a checkpoint; compacted acknowledged work is not re-applied |
| rejection / policy | unauthorized operations are removed from optimistic state and the remaining pending work is rebased |
| malformed response | invalid server data does not corrupt local durable state |
| duplicate replica identity | simultaneous handles cannot silently overwrite one persisted replica |
| closed replica | work after close is refused and retransmitted committed operations remain harmless |
| credential expiry | the socket is closed/refused once the authenticated credential expires |
| server-authority effects | a recorded successful effect is not intentionally repeated for the same committed operation |
| agent producer | server-agent dispatch cannot bypass journal authorization/order |
| presence | peers are scoped to the document and expire independently of durable state |
| LWW fields | logical clocks survive reload and advance beyond rejected/unsubmitted writes |

The individual test names are the executable specification; use the table above
as the map, then read the matching test when you need a specific failure mode.

## Important boundaries

A durable Message must be safe to replay later on another machine. The contract
therefore rejects Messages whose transition returns Commands or changes Model
state outside the declared shared Projection.

That catches the most important mistakes, but it cannot prove arbitrary
JavaScript deterministic. Application code must still keep replay state-only and
stable.

Ordering is server-authoritative. This is not peer-to-peer authority and not a
general CRDT merge system.

## What the application still owns

This example deliberately leaves deployment policy outside the libraries:

- verifying/refreshing real bearer tokens or sessions;
- deciding when to compact documents;
- retention/GC strategy for identity rows whose continued existence preserves
  retry idempotency;
- stable semantic ids for external effects;
- schema/message migration across deployed versions;
- browser storage eviction / abrupt power-loss policy.

The example's server-authority effects are keyed by document, operation, and
array position. Do not reorder that effect policy for operations already
committed. Read the [Durable effect recovery section](../../packages/durable/README.md#effect-recovery)
before connecting those effects to real external providers.

LWW clocks use a separate IndexedDB database from the normal outbox. Keep that
clock storage across reloads; if it is lost, use a fresh replica id rather than
resetting the same writer's counter.

## See also

- [Replicated state guide](../../docs/replication.md) — the conceptual model before implementation detail.
- [`foldkit-sync`](../../packages/sync) — client replica reference.
- [`foldkit-durable`](../../packages/durable) — authoritative server journal reference.
- [`docs/sync-runtime-binding.md`](../../docs/sync-runtime-binding.md) — the Foldkit runtime seams `Sync.mount` binds to.
- [`examples/todo-app`](../todo-app) — the same replication model inside a complete application.
