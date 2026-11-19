# Replicated state: `foldkit-sync` + `foldkit-durable`

When users edit data offline, reload the page before a request settles, or collaborate across multiple devices, plain server fetches lose edits or overwrite each other. You need edits to apply immediately in the UI, persist locally across reloads, and converge to one shared order on the server.

`foldkit-sync` and `foldkit-durable` solve this by replaying durable application Messages over an authoritative log:

- [`foldkit-sync`](../packages/sync) keeps pending edits in a browser outbox, applies them immediately through your `update`, and rebases them whenever the server commits or rejects operations.
- [`foldkit-durable`](../packages/durable) runs on the server, committing operations in one global order in SQLite and deduplicating retries by operation ID.

Your `Model`, `Message`, and `update` stay the single state machine—a durable edit is simply a Message from your existing union recorded in the log. Sync works with any server speaking its exchange protocol, and Durable journals any operation stream.

## Choose the right owner for each piece of state

| State | Owner | Recovery | Tool |
| --- | --- | --- | --- |
| Route, selection, transient error | Local `Model` | None needed | Plain Foldkit |
| Server data the client can refetch | Server database | Refetch | [`foldkit-remote`](./remote.md) |
| Offline user edits that must converge | Durable log | Replay and rebase | `foldkit-sync` + `foldkit-durable` |
| Large server table with offline edits | Durable log + read table | Replay + row refetch | [Editing server data](./editing-server-data.md) |
| URL filter or local device draft | Local `Model` | Restore from URL/KV | [`foldkit-mirror`](./mirror.md) |

Keep the distinction between Remote and Sync clear: a Remote cache is disposable and recovers by refetching, whereas a Sync outbox holds unsubmitted user work. Sync uses a single authoritative server log per document rather than peer-to-peer CRDT merges.

## How visible state rebases over committed state

The server stores committed operations (`A`, `B`, `C`) in one canonical order, while each device holds its uncommitted local operations (`D`, `E`) in its outbox. What the user sees on screen is always the committed base replayed with pending edits on top: `replay(A, B, C, D, E)`.

When another device commits an edit first, the server advances the committed base and the device replays its pending edits on top. When the server rejects `D`, the replica drops `D` and replays `E`. Every update follows that same **rebase** rule with no separate undo stack or shadow store.

Each edit moves through three milestones:

| Milestone | Where it lives | How UI observes it |
| --- | --- | --- |
| `visible` | In `Model` immediately | Rendered by `view` |
| `saved` | In browser outbox | `onPersistenceFailure` if write fails |
| `committed` | In server journal | `replica.status.pending` / `mounted.committed` |

## 1. Declare what is shared

Start with an ordinary Foldkit application and declare which slice of `Model` is `shared`, which `Message` variants are `durable`, and who may append them (`authorize`). Here only `todos` replicates while `selectedTodoId` stays local to each tab:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedTodoId: Schema.Option(Schema.String),
  lastError: Schema.Option(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
type Message = typeof Message.Type

const initial: Model = { todos: [], selectedTodoId: Option.none(), lastError: Option.none() }

type Return = Update.Return<Model, Message>

const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: modifyFields(model, { todos: () => [...model.todos, { id, title }] }),
    }),
    RenamedTodo: ({ id, title }) => ({
      model: modifyFields(model, {
        todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      }),
    }),
    SelectedTodo: ({ id }) => ({
      model: modifyFields(model, { selectedTodoId: () => Option.some(id) }),
    }),
  })

const App = Surface.application({ Model, Message, initial, update })

type Principal = { readonly actorId: string; readonly canWrite: boolean }

const TodoSync = forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
    authorize: {
      RenamedTodo: ({ message, shared }) => shared.todos.some(todo => todo.id === message.id),
    },
  })
```

Each field of the contract has one job:

- **`shared`:** The `Model` projection synchronized across devices; all other fields stay local.
- **`durable`:** The Messages persisted to the outbox and journal (`SelectedTodo` runs locally only).
- **`authorize`:** Server-only policy evaluated inside the commit against the authoritative snapshot and the connection's authenticated `Principal`.

Durable Messages must be deterministic, state-only updates to `shared`—they return no Commands and depend on no local fields (which `Sync.mount` enforces at startup). Generate random IDs or timestamps in a local intent Command first, then pass them inside the durable fact Message; see [What makes a Message durable](../packages/sync/README.md#what-makes-a-message-durable).

## 2. Mount the replica in the browser

Open local storage, mount your Foldkit app over the replica, and start the transport sync loop:

```ts
import { Effect, Scope } from 'effect'
import { Sync } from 'foldkit-sync'

const container = document.getElementById('app')!
const scope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Sync.tabStorage('todos').pipe(
    Effect.flatMap(TodoSync.openReplica),
    Effect.provideService(Scope.Scope, scope),
  ),
)

const mounted = Sync.mount(App, TodoSync, {
  replica,
  container,
  view: (model, h) => ({
    title: 'Todos',
    body: h.ul([], model.todos.map(todo => h.li([], [todo.title]))),
  }),
  onPersistenceFailure: (model, error) =>
    modifyFields(model, { lastError: () => Option.some(error.message) }),
})

Effect.runFork(
  Effect.provide(replica.start, Sync.transport.socket({ url: 'wss://example.com/sync' })),
)
```

`Sync.mount` runs the standard Foldkit runtime: durable Messages update `Model` immediately and enqueue to the outbox, while `replica.start` exchanges pending edits with the server (retrying with backoff) and installs reconciled snapshots back into `Model`. See the [Sync README](../packages/sync/README.md#run-it-in-the-browser) and [Sync runtime binding](./sync-runtime-binding.md).

## 3. The server: an exchange over the journal

A replica and server communicate through an **exchange** request/response cycle:

- **Request:** The replica sends its `cursor`, its pending operations, and the `epoch` it last observed.
- **Response:** The server returns newly committed `operations` after `cursor`, `acknowledged` and `rejected` IDs (with typed `refusals` for rejected operations), an optional `checkpoint` `{ cursor, model }` if history was compacted below the replica's cursor, a `more` flag for paginated catch-up, and the server's `epoch`.

`serveJournal` from `foldkit-sync/journal` implements this exchange over `Journal`:

```ts
import { Effect } from 'effect'
import { ActorId, Journal, OpId } from 'foldkit-durable'
import type { SocketLike } from 'foldkit-sync'
import { serveJournal } from 'foldkit-sync/journal'

const server = Effect.gen(function* () {
  const journal = yield* Journal.make({
    ...TodoSync.journalContract(),
    file: 'todos.sqlite',
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
    validate: ({ operation, cursor }) => {
      if (operation.baseCursor > cursor) throw new Error('Operation is ahead of the server')
    },
  })
  return (socket: SocketLike, principal: Principal) =>
    serveJournal(socket, {
      sync: TodoSync,
      journal,
      principal,
      admit: () => principal.canWrite,
    })
}).pipe(Effect.scoped)
```

For an in-process transport, use `journalExchange`; call `journal.recover` (`settle`) after exchanges when updating downstream stores. The server preserves six invariants:

- **Verify cursors first:** If a replica's cursor exceeds the journal's cursor, fail before appending so acknowledgements are never lost.
- **Reject deterministic failures, retry storage failures:** Policy denials, decode errors, and ID collisions return in `rejected` so replicas drop them; transient `JournalError` storage faults fail the exchange so replicas retry safely.
- **Deduplicate retransmissions:** `append` acknowledges previously committed `opId`s (`Committed` or compacted `AlreadyCommitted`) without re-applying them.
- **Paginate and checkpoint:** Long-offline devices catch up via `more: true` pages, or adopt a `load` checkpoint when their cursor falls below compaction.
- **Track history epochs:** Sending a mismatched `epoch` resets the replica cleanly from `0` after a server reset.
- **Authenticate on the connection:** `principal` comes from the authenticated socket rather than client payloads, Durable pins each replica ID to its first committing actor, and `serverOnly` Messages are rejected if sent from any client replica.

### The server's own writes, and work after a commit

Use `serverJournal` (`appendAsServer(message, { key })`) for server-originated facts such as webhooks so redelivery commits at most once. For side effects triggered by commits (receipts, provider calls, follow-up server Messages), register a **reaction** that advances a stored cursor from commit `N` after recording the external effect in the ledger:

- **At-least-once external calls:** Because SQLite/D1 and external APIs share no distributed transaction, crashes between an API call and recording its completion re-run the call with the same stable idempotency `key`.
- **Once-committed follow-ups:** Appends emitted by a reaction derive deterministic IDs from the reaction and trigger ID so duplicates acknowledge cleanly.

Failed reactions wait on a stored backoff without blocking other reactions, and permanently rejected runs (or runs failing eight times over at least an hour) are **parked** for inspection so compaction continues. Long-lived servers fork `follow`, Durable Objects schedule alarms, and stateless Workers run `waitUntil` plus cron triggers. See [Work after a commit: reactions](../packages/sync/README.md#work-after-a-commit-reactions) and [`examples/sync`](../examples/sync/src/journal.ts).

## Choosing document boundaries

A **document** (`documentId`) defines a single consistency boundary: one contract, one journal key, one outbox, and one commit order.

> Enforce a rule inside Sync whenever one document's snapshot holds everything needed to judge it.

Inside each commit, the journal runs `validate`, `authorize`, `reduce`, and `laws` against that single document's authoritative snapshot under the document write lock (or via optimistic compare-and-set on D1). No external document or table is read inside that lock, and sequences advance independently per document.

| Rule concern | Hook | Client rejection |
| --- | --- | --- |
| Document invariant (cap, order, total) | `laws` | `Invalid` with law ID and `message` |
| Caller permission | `authorize` | `Forbidden` with `reason` |
| Operation format | `validate` | `Invalid` (`"Not a valid operation"`) |

### A rule that fits: at most 100 todos

Because `todos` lives inside one document, capping its length is a document `laws` entry:

```ts
const CappedTodoSync = forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos-capped'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
    laws: {
      atMost100Todos: {
        holds: ({ after }) => after.todos.length <= 100,
        message: 'A list holds 100 todos',
        path: ['todos'],
      },
    },
  })
```

Laws evaluate the snapshot produced by *any* durable Message, so adding a `DuplicatedTodo` variant later enforces the 100-item cap automatically. If two devices add the 100th todo offline simultaneously, the server commits the first and rejects the second (`Sync.isInvalidBy(refusal, CappedTodoSync.laws.atMost100Todos)`). Devices also check laws locally at `submit` (`LawBrokenError`) as an early hint.

If existing live documents already exceed a newly added cap, use a monotone law that allows shrinking toward the limit, and audit existing snapshots beforehand with `CappedTodoSync.judge(snapshot, snapshot)`:

```ts
const ShrinkingTodoSync = forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos-shrinking'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
    laws: {
      atMost100Todos: {
        holds: ({ before, after }) => after.todos.length <= Math.max(100, before.todos.length),
        message: 'A list holds 100 todos',
        path: ['todos'],
      },
    },
  })
```

### A rule that crosses documents: unique usernames

If each user is a separate document (`user-ada`, `user-grace`), neither journal can inspect the other to enforce globally unique usernames. Choose an owner that sees every username:

| Strategy | Owner | When to use |
| --- | --- | --- |
| Single shared username index doc | Sync `authorize` | Small index; single commit queue is acceptable |
| Server SQL unique constraint | [`foldkit-remote`](./remote.md) | Server-owned records; online claims |
| Per-name reservation document | Sync claim doc + confirmation | Claims work offline; confirm via `mounted.committed` |

For the reservation pattern, first commit `Claim({ owner: ada })` to `username-ada` (whose `authorize` checks the snapshot has no owner yet), wait until `mounted.committed` confirms `ada` owns the claim, and then commit `ChoseUsername('ada')` in `user-ada`. Because the two documents commit independently, design cleanup or expiration for abandoned reservations.

### Guidelines for splitting documents

- **Keep co-constrained facts together:** Any two fields governed by one invariant belong in one document.
- **Separate independent workloads:** Put each user's or workspace's independent data in its own document so snapshots stay small and cursors scale independently.
- **Move cross-document uniqueness to Remote:** Enforce cross-record uniqueness or balances in a server database via Remote mutations or a reservation document.

## 4. What the user sees, and what waits for the server

Local edits appear in `Model` immediately while pending sync. Two cases require explicit handling:

- **Rejected edits:** When the server rejects an operation, the replica drops it, replays the remaining queue, and reverts the UI, recording the refusal (`Forbidden` or `Invalid`) in `replica.status.rejected`.
- **Actions requiring server confirmation:** Agent tools or "shared with team" confirmations wait on `mounted.committed` (the server-confirmed slice without pending edits):

```ts
import { Agent } from 'foldkit-agent'

const TodoAgent = Agent.forApplication(App)
const agent = TodoAgent.make({
  messages: TodoAgent.expose(Message, {
    CreatedTodo: {
      name: 'create_todo',
      description: 'Create a shared todo',
      completion: Agent.when({
        source: mounted.committed,
        predicate: (shared, request) => shared.todos.some(todo => todo.id === request.id),
      }),
    },
  }),
})
```

This completes only after the server commits `CreatedTodo` and skips rejected edits. See [what a reader sees while a change is in flight](./state-model.md#what-a-reader-sees-while-a-change-is-in-flight).

## Lifecycle of a single edit

1. **Dispatched (`visible`):** The view dispatches `CreatedTodo({ id, title })`; `update` updates `Model` immediately.
2. **Saved (`saved`):** The mount replays the edit and writes it to the local outbox inside Sync's envelope (`opId`, `document`, `replica`, local sequence, `baseCursor`).
3. **Exchanged:** `replica.start` sends the pending envelope and cursor to the server.
4. **Committed (`committed`):** The server runs `validate`, `authorize`, `reduce`, and `laws`, assigns a global sequence and trusted `actor`, persists it, and returns the tail, acknowledgements, and rejections.
5. **Rebased:** The replica advances its committed base, drops acknowledged or rejected edits, replays any remaining pending edits, and updates `Model`.

## Changing a durable Message

Durable Messages sit in offline outboxes and server logs across releases, so editing an existing Message schema breaks old entries. Declare versioned migrations with `migrations(...)` instead (for example, renaming `text` to `title`):

```ts
import { Match } from 'effect'
import { migrations } from 'foldkit-sync'

const RenamedTodoV1 = Schema.TaggedStruct('RenamedTodo', {
  id: Schema.String,
  text: Schema.String,
})
const MessageV1 = Schema.Union([Message.CreatedTodo, RenamedTodoV1])

const TodoHistory = migrations(MessageV1).next(App.Message, previous =>
  Match.valueTags(previous, {
    CreatedTodo: created => created,
    RenamedTodo: ({ id, text }) => ({ _tag: 'RenamedTodo' as const, id, title: text }),
  }),
)

const VersionedTodos = forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
  migrations: TodoHistory,
})
```

Never edit shipped migration steps—append another `.next(...)` instead. Each operation records its original `messageVersion`, while `update`, `authorize`, `validate`, `stamp`, and `reduce` always receive the upcast current Message. The journal checks retransmissions against the original wire bytes so retries across deploys still match.

What happens when an actor meets an unknown or unreadable version:

| Location | Newer version encountered | Unmigrated older version |
| --- | --- | --- |
| Device outbox | Opens refused (`UnsupportedMessageVersionError`) | Moved to `status.refused`; rest sends |
| Server append | Exchange fails before commit; client waits | Rejected as `Unreadable { version }` |
| Journal history | `UnreadableHistoryError` on reads before it | Same |
| Committed tail to replica | Exchanges fail until page reloads | `InvalidReplicaHistoryError` on skew |

Deploy in order: first ship the Sync version supporting `messageVersion`, then deploy your new application version to the server before clients. Migration steps must stay pure and deterministic. Note that `migrations` covers durable Messages; evolving the `shared` slice schema separately requires migrating stored snapshots.

## When things go wrong

| Scenario | Behavior |
| --- | --- |
| Offline | Edits apply and save locally; `pending` grows; retries on backoff |
| Server rejects edit | Dropped from outbox; rest replayed; UI reverts |
| Local storage write fails | Edit reverted; `onPersistenceFailure` updates UI |
| Concurrent edit on server | Base advances; local pending edits rebase on top |
| Retried operation | `opId` deduplicated from journal history |
| Replica far behind | Catches up via `more` pages or compacted checkpoint |
| Server history wiped | New `epoch` resets replica from `0` and resends outbox |
| Actor mismatch on replica | Durable rejects operations from another actor |
| Browser storage evicted | Replica syncs from server; unsent outbox edits lost |
| Two tabs share one storage | CAS fails stale writer instead of corrupting history |
| Unknown storage version | Fails loudly preserving bytes for migration |
| Old message format | Upcast via declared `migrations` |
| Malformed server answer | Fails exchange; local outbox preserved |
| Crash after external effect | Provider call repeats with same key via effect ledger |

When a server lost its history (`epoch` changed), a replica that never observed an epoch fails until storage is cleared. For external side effects (emails, charges), pair Durable's `runEffect`/`recover` ledger with provider idempotency keys; see [external effects](../packages/durable/README.md#external-effects-and-the-crash-gap).

## Deployment responsibilities you keep

- **Authentication:** Validate tokens/cookies per socket connection and close expired connections.
- **Compaction and retention:** Schedule `compact` and `vacuum`, and reject operations older than retained deduplication windows.
- **Effect idempotency keys:** Provide stable semantic keys to external providers.
- **Parked reactions:** Monitor and manually resolve reactions parked after repeated permanent failures.
- **Schema migrations:** Author `migrations` for durable Messages and coordinate `shared` snapshot upgrades.
- **Storage eviction:** Request persistent browser storage and warn users before clearing site data with unsent edits.

## Using Sync or Durable on their own

- **Sync without Durable:** Implement the exchange contract (cursor validation, deterministic rejections, deduplicated appends, pagination/checkpoints, and epochs) on any server.
- **Durable without Sync:** Supply your own operation and snapshot codecs, empty state, reducer, and ID extractor; see the [Durable README](../packages/durable/README.md#a-first-journal-append-and-load-operations).

## When to use another tool

- Online-only state without multi-device offline sync: plain Foldkit or [`foldkit-remote`](./remote.md).
- Leaderless peer-to-peer merging across every node without a server: a CRDT (`Sync.lww.register` handles per-field LWW within Sync).
- Arbitrary ad-hoc SQL querying: store and query tables with Drizzle and Remote; Durable is an operation log.

## Next

- Explore working apps in [`examples/todo-app`](../examples/todo-app), [`examples/sync`](../examples/sync), and [`examples/cloudflare`](../examples/cloudflare).
- Edit large SQL tables offline via a journal in [Editing server data](./editing-server-data.md).
- Read the package APIs in [`foldkit-sync`](../packages/sync) and [`foldkit-durable`](../packages/durable).
