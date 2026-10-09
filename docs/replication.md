# Replicated state: `foldkit-sync` + `foldkit-durable`

Some state has to keep working when the network is gone, survive a reload, and
end up the same on every device and tab that edits it. This guide takes one
such feature from its first edit to a running server, with both packages:

- [`foldkit-sync`](../packages/sync) runs on the client. It keeps the edits a
  user makes in a local outbox, shows them at once, and reconciles them with
  the server's answer.
- [`foldkit-durable`](../packages/durable) runs on the server. It decides the
  one order every replica ends up in, keeps the snapshot and log on SQLite, and
  answers a retried operation without applying it twice.

Neither replaces your application. `Model`, `Message`, and `update` remain the
state machine; a durable edit is one of your existing Messages, recorded. The
packages are also separable: Sync works against any server that speaks its
exchange, and Durable journals any operation stream.

If you only want to know what the system is, four sentences cover it:

```text
1. A durable operation is an existing Foldkit Message plus replication metadata.
2. What the user sees = committed snapshot + pending local edits, replayed.
3. Sync owns the replica; Durable owns the authoritative order.
4. Reconciliation moves the committed base, drops settled edits, replays the rest.
```

Everything below is those four sentences, built.

## Choose the owner first

Replication is not for every value that crosses the network. Ask who owns the
fact and how it recovers:

| State | Authority | Recovery | Use |
| --- | --- | --- | --- |
| A route, a selection, a transient error | the local Model | nothing to recover | plain Foldkit |
| Data the server owns and the client may refetch | the server | refetch | [`foldkit-remote`](./remote.md) |
| Edits the user authored that must survive offline and converge | the durable log | replay and reconciliation | `foldkit-sync` + `foldkit-durable` |
| Edits to server-owned rows too many to replicate, offline and converging | the durable log, with the table its read model | replay; a reread of the rows | [Editing server data through a journal](./editing-server-data.md) |
| A filter in the URL, a draft on this device | the local Model | restore | [`foldkit-mirror`](./mirror.md) |

The Remote and Sync line is the one to memorize: a Remote cache is disposable
and refetch is recovery; a Sync outbox is user data and losing it loses edits.

One server decides the order of a document. Peers that must each accept writes
and merge without a server are a different design (a CRDT), and Sync is not
one.

## The model

```text
server:    A  B  C          committed, in the server's order
pending:            D  E    this device's edits the server has not confirmed
visible:   replay(A, B, C, D, E)
```

When the server commits something else first, the base moves and the pending
edits are replayed on top; when it rejects `D`, `D` is dropped and `E` is
replayed. Both are the same move, a **rebase**. There is no undo function and
no separate optimistic store to patch.

An edit passes three milestones. A UI that says "saved" means the second; one
that says "shared" means the third.

| Milestone | Where | Reader |
| --- | --- | --- |
| visible | the Model, at once | the view |
| saved | the local outbox | `onPersistenceFailure` says when it is not |
| committed | the server journal | `replica.status.pending`, `mounted.committed` |

## 1. Declare what is shared

Start from the application you have. This one keeps a todo list and a
selection, and only the list is shared:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

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

const TodoSync = Sync.forApplication(App)
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

Three decisions are in that declaration, and they are the whole design:

- **`shared`** is the slice replicas agree on. The rest of the Model is this
  device's.
- **`durable`** names the Messages that change the slice. Each becomes an
  operation in the outbox and a row in the journal. `SelectedTodo` is not
  listed, so it runs through `update` and goes nowhere.
- **`authorize`** is policy, beside the Messages it governs. It runs on the
  server only, inside the commit, against the authoritative snapshot and the
  principal the server's transport established. `withPrincipal` fixes that
  principal's type so a rule cannot read a field the transport does not set.

A durable Message has one obligation: its `update` must be a deterministic,
state-only transition of the slice, because every replica and the server
replay it. `make` derives replay from `update` and refuses, at the first
submit, a Message that returns a Command or writes a local field. So ids and
timestamps are minted by a local *intent* Message's Command and carried
*inside* the durable *fact*; the [Sync README](../packages/sync/README.md#what-makes-a-message-durable)
shows the pattern.

## 2. The client

Open storage and a replica, mount the application over it, start the loop:

```ts
import { Effect, Scope } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'

const container = document.getElementById('app')!
const scope = Effect.runSync(Scope.make())
const storage = Effect.runSync(
  Effect.provideService(Sync.indexedDb('todos/tab-1'), Scope.Scope, scope),
)
const replica = Effect.runSync(TodoSync.openReplica(ReplicaId.make('tab-1'), storage))

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

`mount` runs the ordinary Foldkit runtime. A durable Message applies through
`update` at once and a Command then saves it to the outbox; a local Message is
untouched. `replica.start` exchanges with the server now, after every edit, and
whenever the server says something changed, retrying failures on a backoff.
When an exchange moves the replica (a commit, a rejection, a checkpoint), the
mount installs the reconciled slice back into the Model, outside `update`.

The [Sync README](../packages/sync/README.md#run-it-in-the-browser) walks each
call; [runtime binding](./sync-runtime-binding.md) explains the mount's
internals.

## 3. The server: an exchange over the journal

The journal takes its codecs, empty snapshot, reducer, replica binding, and the
`authorize` rules from the contract. The **exchange** is one request from a
replica and one answer:

```text
request    cursor, pending operations, the epoch the replica last saw

answer     operations     committed after the cursor, in order
           acknowledged   ids accepted (also when their payload is not repeated)
           rejected       ids refused
           reasons?       [{ opId, reason }]: why, in words for a person, for some of rejected
           checkpoint?    { cursor, model } when the tail was compacted away
           more?          another page follows
           epoch          this server's history
```

`foldkit-sync/journal` answers it over the journal. What is yours is who the
principal is:

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
  // One accepted socket; `principal` is what authenticating the connection established.
  return (socket: SocketLike, principal: Principal) =>
    serveJournal(socket, {
      sync: TodoSync,
      journal,
      principal,
      // A principal that may only read has every operation rejected.
      refuse: () => !principal.canWrite,
    })
}).pipe(Effect.scoped)
```

`journalExchange` is the same exchange as a `TransportClient`, for an
in-process replica; `settle` applies what committed to another store
(`journal.recover`) after each exchange. It keeps the rules a server has to
keep:

- **Check the cursor before appending anything.** If the replica's cursor is
  ahead of the journal, the exchange must fail before any commit, or a commit's
  acknowledgement would be lost with the failed read and the replica would
  resend it.
- **Reject what will fail again; fail what might not.** A policy refusal, a
  payload that cannot decode, and an id reused with different content are
  deterministic, so they are returned as `rejected` and the replica drops them.
  A `JournalError` (storage) is left to fail the exchange, so the replica keeps
  the edit and retries. A handler that throws on a bad payload would be retried
  with the same outbox forever.
- **Acknowledge a repeat.** `append` answers a retransmitted id from history
  (`Committed`, or `AlreadyCommitted` once its payload was compacted) without
  applying it twice. Both are acknowledged.
- **Page, and checkpoint below the floor.** `read` with a `limit` and
  `more: true` let a replica that was offline for weeks catch up in bounded
  steps. A read below the compaction floor fails with `CompactedCursorError`;
  the answer is then a checkpoint from `load`, which the replica adopts as its
  base before replaying its own pending edits.
- **Name the history.** The replica stores the `epoch` and sends it back; a
  replica from another history is answered from `0`, and it rebuilds. This is
  how a server reset is survived; see [when things go wrong](#when-things-go-wrong).
- **The principal comes from the connection.** It is established when the
  socket is authenticated and never read from an operation, so a client cannot
  claim to be someone else. Durable also binds each replica id to the first
  actor that commits from it, and refuses another's.

[`examples/sync/src/journal.ts`](../examples/sync/src/journal.ts) writes the
exchange by hand, the rules above as code, with server-side effects settled
before the acknowledgement, and
[`server.ts`](../examples/sync/src/server.ts) beside it binds `serve` to a `ws`
server with a per-connection token.

## 4. What the user sees, and what waits for the server

The Model shows a durable edit before the server has it. For most UI that is
the point. Two things need more:

- **A refused edit.** It comes back as a rejection on the next exchange, the
  replica drops it, the mount re-installs the slice, and the field reverts.
  `replica.status.rejected` names the operation, with the server's reason
  when it gave one (an `authorize` rule's `{ allowed: false, reason }`), so
  the UI can say why.
  `onPersistenceFailure` does not run for this; the local save succeeded.
- **Something that must not claim success early.** An agent tool, a "shared
  with the team" confirmation. These wait on `mounted.committed`, the slice as
  the server confirmed it, with no pending edit applied:

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

That completes after the exchange that commits the todo, and never for one the
server rejects. The agent learns nothing about cursors or operations. Remote
draws the same line over its own cache; see
[what a reader sees while a change is in flight](./state-model.md#what-a-reader-sees-while-a-change-is-in-flight).

## One edit, end to end

With all four pieces in place, this is the path a single `CreatedTodo` takes:

```text
view dispatches CreatedTodo
        |
        v
update applies it; the Model shows it                       visible
        |
        v
the mount's Command submits it: replayed, given an id,      saved
saved to the outbox
        |
        v
replica.start exchanges: cursor + pending → server
        |
        v
server: validate, authorize, reduce, assign sequence,       committed
persist; answer with the tail, acks, rejections
        |
        v
replica: advance the base, drop settled edits,
replay the rest; the mount re-installs the slice
```

Three layers carry the edit, and it helps to keep their names apart. The
**Message** is the application's meaning, `CreatedTodo({ id, title })`. The
**operation** is that Message encoded inside Sync's envelope (document, replica,
local sequence, a stable `opId`, the cursor the replica knew), which is what
the outbox holds and the wire carries. The **committed operation** is the same
plus the server's sequence and the actor it trusts. Sync adds the envelopes;
the Message stays the vocabulary.

## When things go wrong

Each of these is designed for. The ones that change how you build come first.

| Failure | What happens |
| --- | --- |
| The network is gone | edits apply and save; `pending` grows; the loop retries |
| The server rejects an edit | dropped from pending, the rest replayed, the Model re-installed |
| The local save fails | the edit is reverted and `onPersistenceFailure` says so |
| Another device commits first | the base advances; local edits replay on top |
| An operation is retried | the stable `opId` is answered from history, never applied twice |
| The replica is far behind | pages (`more`), or a checkpoint when the tail was compacted |
| The server lost its history | a new `epoch`: the replica rebuilds from `0` and resends its outbox; what the old server committed is gone everywhere; a replica that never heard an epoch cannot tell and fails until its storage is cleared |
| Another actor sends a replica's operations | Durable refuses them: a replica is bound to its first committing actor |
| Local storage was evicted | the replica catches up from the server, but unsent edits are lost: the outbox is user data |
| Two tabs share one storage name | compare-and-swap fails the stale writer rather than merging histories |
| Stored state is from another version | opening fails naming both versions; the bytes are kept for a deliberate migration |
| The server answers nonsense | a malformed answer, a gap in the order, an ack for an operation never sent, or a checkpoint behind the cursor fails the exchange; local work is untouched |
| An external effect succeeded before a crash recorded it | the provider call may repeat; use provider idempotency with Durable's effect ledger |

The last row is the one the libraries cannot close. A committed operation may
imply work outside SQLite (an email, a charge), and no local database can
commit atomically with a provider. Durable's `runEffect` and `recover` record
intents and reuse known outcomes; they do not make the provider transactional.
Read [external effects](../packages/durable/README.md#external-effects-and-the-crash-gap)
before wiring one.

## What you still own

The packages leave deliberate gaps, each a deployment decision:

- **Authentication.** Verifying tokens or sessions and deriving the principal
  per connection, and closing a socket when a credential expires.
- **Compaction and retention.** When to `compact`, when to `vacuum`, and how
  long to keep the identity rows that make old retries recognizable. A rotated
  database forgets them; reject work older than the retained window rather than
  applying it as new.
- **Effect identities.** A stable key per document, operation, and semantic
  action, chosen before the action runs and handed to the provider.
- **Migrations.** Sync and Durable version and refuse their own storage and
  wire formats. Your Message and snapshot payloads are yours to evolve.
- **Browser storage policy.** IndexedDB can be evicted; what to tell the user
  and when to ask for persistent storage.

## Using one without the other

**Sync without Durable.** Any server that implements the exchange above, with
the same validation, serves a replica: check the cursor, commit pending in
order, answer the tail, acknowledge, reject, checkpoint, name its epoch.

**Durable without Sync.** The journal takes your own operation and snapshot
codecs, an empty snapshot, a reducer, and an operation identity; the
[Durable README](../packages/durable/README.md#using-durable-directly) starts
there.

## When not to use replicated state

- No offline editing and no multi-device agreement is needed: plain Foldkit.
- The server owns the fact and the client can refetch it: `foldkit-remote`.
- Every peer must accept writes and merge without a server order: a CRDT
  design. `Sync.lww.register` changes the merge rule for one field only.
- You want a database for arbitrary queries: Durable is an operation journal.
- You expect application-domain history to be migrated for you.

## See it working

- [`examples/todo-app`](../examples/todo-app): a whole application over
  `Sync.mount`, with fragments, authorization, mirrors, and a WebMCP agent.
- [`examples/sync`](../examples/sync): the replica, the journal, the socket
  server, presence and LWW, and a test for every row of the table above.
- [`examples/cloudflare`](../examples/cloudflare): one document served from a
  Durable Object, its journal on D1, and each committed operation applied to
  the table Remote reads back. The Pages list writes that table through
  Remote mutations instead of the journal.

Then the package READMEs: [`foldkit-sync`](../packages/sync) for the replica,
status, transports, presence, and LWW; [`foldkit-durable`](../packages/durable)
for append, reads, compaction, retention, and the effect ledger.
