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
submit, a Message that returns a Command or writes a local field. It must
read nothing outside the slice either: `Sync.mount` refuses, naming the field,
a durable Message whose slice depends on a local field. So ids and
timestamps are minted by a local *intent* Message's Command and carried
*inside* the durable *fact*; the [Sync README](../packages/sync/README.md#what-makes-a-message-durable)
shows the pattern.

## 2. The client

Open storage and a replica, mount the application over it, start the loop:

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
           refusals?      [{ opId, refusal }]: why, for some of rejected, a typed SyncRefusal each
           reasons?       [{ opId, reason }]: deprecated, the same in words alone
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
      admit: () => principal.canWrite,
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

- **Only the server records a server-only fact.** A Message the contract
  declares `serverOnly` is refused from any replica, by tag, after upcasting,
  before `admit`, `validate` and `authorize`: the check needs no rule about
  who the principal is. So is an entry claiming a replica id under `server/`,
  which the server's own operations use.

### The server's own writes, and work after a commit

The server appends what only it may say through `serverJournal`
(`appendAsServer(message, { key })`), under a key that names the fact, so a
redelivered webhook commits once. Work that follows a commit (a receipt, a
provider call, a server-only Message as its result) is a **reaction**, a
declared value run in journal order from a cursor the journal stores:

```text
commit N -> reaction cursor < N -> run: answer recorded in the ledger
                                -> appends committed as the server
                                -> cursor := N
```

Two promises, stated narrowly:

- **An external call runs at least once.** SQLite or D1 and a provider share
  no transaction, so a crash between the call and the record of it runs the
  call again. Each run carries one key, the same on every retry, for the
  provider's idempotency; whether a repeat is then harmless is the
  provider's guarantee, not Sync's. Nothing here is exactly once.
- **What a reaction appends commits once**: its ids come from the reaction
  and its trigger's id, and the journal answers a repeat from history.

A run that fails waits on a stored backoff, blocking only its own reaction. A
run that can never succeed (the journal refuses its append, or its answer is
outside what it declared) is **parked** for a person, and the reaction goes
on, so one operation cannot stop it or the log's compaction; so is one that
has failed eight times over at least an hour, which an outage of a few
minutes never reaches. A store that is down counts toward neither.

`settle` keeps the job it had: a read model the reply depends on, before the
reply. Who runs reactions is the host's: a long-lived process forks
`follow`; a Durable Object sets its alarm before replying and runs them after;
a stateless Worker uses `waitUntil` and a Cron Trigger, and its reactions'
commits reach other replicas only when they next exchange. The
[Sync README](../packages/sync/README.md#work-after-a-commit-reactions) has
the API.

[`examples/sync/src/journal.ts`](../examples/sync/src/journal.ts) writes the
exchange by hand, the rules above as code, with server-side effects settled
before the acknowledgement, and
[`server.ts`](../examples/sync/src/server.ts) beside it binds `serve` to a `ws`
server with a per-connection token.

## Choosing document boundaries

A **document** is one `documentId`: one contract, one journal key, one outbox
and cursor on the replica, one order on the server. Everything the server
decides, it decides inside one document, and that is the whole rule for
drawing the boundary:

> A rule can be enforced where one document's snapshot is enough to judge it.

The journal runs `validate` and then `authorize` for each operation inside the
commit, and hands both the same request: the document's `key`, the `principal`,
the incoming `operation`, the document's authoritative `snapshot`, and (to
`validate`) its `cursor`. After `reduce` it runs the contract's **laws** over
the snapshot the operation leaves. Nothing else is in reach: no request carries
another document, table, or service, and all three run while the write lock is
held, so they must stay local to the snapshot (on D1, which has no lock, they
see the latest committed snapshot, and a commit that loses a race reads,
reduces and judges again over the one it lands on). The order is per document
too: each key counts its own sequence from `cursor + 1`, so two documents have
no order between them.

When a rule refuses, the operation is *rejected by its id*: the replica drops
it, replays what remains, and the field reverts, as in
[section 4](#4-what-the-user-sees-and-what-waits-for-the-server). Which hook a
rule belongs in follows from what it is about:

| A rule about | Hook | Arrives as |
| --- | --- | --- |
| what the document must always be (a cap, an order, a total) | a law, in `laws` | `Invalid`, with the law's id as `rule` and its `message` |
| who may make the change | `authorize` | `Forbidden`, with the rule's `reason` |
| the operation's own shape | `validate` | `Invalid`, with the fixed sentence "Not a valid operation" |

An operation that names another document is rejected the same way before the
journal sees it.

### A rule that fits: at most 100 todos

The todo list is one document, so a cap on its length is a function of its
snapshot: a law over `shared`.

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

A law judges what an operation leaves, not which Message made it: a
`DuplicatedTodo` added to `durable` later is refused at 100 as `CreatedTodo`
is, with no rule of its own, where an `authorize` rule per Message would have
to be written again for each new way to grow the list. `holds` is typed over the shared fields, so a law
that reads a local one does not compile.

Two devices that each add the hundredth todo cannot both succeed: the server
commits one first, judges the other against the snapshot that now holds it, and
rejects it as `Invalid`, which `Sync.isInvalidBy(refusal,
CappedTodoSync.laws.atMost100Todos)` matches. The rule holds because the count
and the write are in the same document, committed in one order. Each device's
`submit` judges its own edit too, over what it holds, and fails with
`LawBrokenError` before the outbox when the edit already breaks the law there;
that is a hint, since what it holds may include edits the server refuses.

A law is strict: it judges the snapshot an operation leaves, whatever the one
before held. Adding one to documents that already break it refuses every
operation that leaves them broken, a removal that stops at 101 included, until
one repairs it. To let such a document shrink toward the cap, write the law
over `before` as well:

```ts sketch
holds: ({ before, after }) => after.todos.length <= Math.max(100, before.todos.length)
```

and before the deploy, run `CappedTodoSync.judge(snapshot, snapshot)` over the
stored snapshots to find the documents it would refuse.

### A rule that does not fit: unique usernames

Suppose each user is a document (`user-ada`, `user-grace`), and a username must
be unique across users. When Ada's document commits `ChoseUsername('ada')`,
`validate`, `authorize` and the laws see Ada's snapshot only. Grace's document, committing
the same name at the same moment, is judged against Grace's snapshot. Each
passes, and nothing in either journal can notice the other. This is not a gap to
close with a cleverer `validate` or law: neither has a handle on a second document. Give
the rule an owner that sees every name:

| Choice | Owner of the rule | Use it when |
| --- | --- | --- |
| One document holds every username | Sync: `authorize` reads the whole index in one snapshot | the index is small, and every claim may queue behind one order |
| The server's table decides, through a Remote mutation | [`foldkit-remote`](./remote.md): the server (its database's unique constraint) refuses the write | the usernames are server-owned rows, and a claim need not work offline |
| One document per name, then a confirm | Sync decides each name in its own document; the application confirms | a claim should be made offline, and the name is taken only once the server has said so |

The first is the smallest change and the cost is plain: every claim goes
through one journal, and every replica holds the index. The second moves the
fact out of replication: a username is something the server owns and the client
can refetch, which is the Remote column of
[Choose the owner first](#choose-the-owner-first); a refused write comes back
as a refusal the UI shows, not as a reverted edit.

The third is a **reservation**. The claim document is keyed by the name
(`username-ada`), so first-claimant-wins is again a rule inside one document:
its `authorize` refuses a claim when the snapshot already has a different
owner. The user's own document records the name only after the claim is
confirmed, which the application waits for on `mounted.committed`, the slice as
the server confirmed it (see [section 4](#4-what-the-user-sees-and-what-waits-for-the-server)):

```text
1. claim:    commit Claim({ owner: ada }) in document username-ada
2. confirm:  wait until username-ada's committed slice names ada
3. record:   only then commit ChoseUsername('ada') in document user-ada
```

Nothing makes step 3 atomic with step 1, and the libraries do not try. A
crash between them leaves a claim with no user: an unreferenced reservation the
application must be able to release or expire. If the claim never comes, the
user never recorded the name. Choose this form only when you will own that
cleanup.

### Picking the boundary

Ask of each rule: what has to be read to judge it?

- **One document's state** (a cap, a unique title inside one list, "only the
  owner may rename"): keep the facts it reads in one document, and write it as
  a law when it is about what the document is (the cap, the unique title), or
  in `authorize` when it is about who may change it (the owner).
- **Facts that change together and are judged together**: one document, so a
  single order decides them. Splitting them means a rule across the split, and
  the table above.
- **Facts that never constrain one another** (two users' notes): separate
  documents. Each gets its own cursor, its own small snapshot to replay, and
  its own Durable Object where you serve from one.
- **A fact across documents or outside replication** (a unique name, a balance
  across accounts, a row in a table): not a Sync rule. Move it to the owner of
  that fact, or reserve it as above.

A document grows with everything inside it: every replica holds its whole
snapshot and every commit to it is ordered against every other, so the
boundary is a cost as well as a limit on rules. Draw it as small as the rules
allow.

## 4. What the user sees, and what waits for the server

The Model shows a durable edit before the server has it. For most UI that is
the point. Two things need more:

- **A refused edit.** It comes back as a rejection on the next exchange, the
  replica drops it, the mount re-installs the slice, and the field reverts.
  `replica.status.rejected` names the operation, with a typed refusal
  (`Forbidden` with an `authorize` rule's `reason` when it gave one,
  `Invalid` when the operation failed), so the UI can say why.
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

## Changing a durable Message

An operation outlives the build that wrote it. It sits in a device's outbox
while the device is offline across a deploy, and in the journal for as long as
the document's history is kept. So once a durable Message has shipped, its
Schema is a stored format: rename `RenamedTodo`'s `title` and every stored
`RenamedTodo` stops reading.

Declare the history instead. Say the first build called the field `text`:

```ts
import { Match } from 'effect'
import { migrations } from 'foldkit-sync'

// Version 1, kept while any stored operation may hold it.
const RenamedTodoV1 = Schema.TaggedStruct('RenamedTodo', {
  id: Schema.String,
  text: Schema.String,
})
const MessageV1 = Schema.Union([Message.CreatedTodo, RenamedTodoV1])

// Version 2 is the application's Message as it is now.
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

The old Schema lists only the durable variants, and reuses the ones that did
not change. A step takes the version before it, encoded, and returns its own,
encoded; the types check each against its neighbour. Steps are never edited
once shipped: the next change is another `next`.

What changes, and what does not:

- **Each operation keeps the version it was written at**, as
  `messageVersion` on its envelope (absent for version 1, so a document that
  never declares a history sends what it sent before). The outbox, the wire
  and `status.rejected[i].operation` hold it as written.
- **Everything that reads its meaning reads the current version.** `update`
  in replay, `admit`, `authorize`, `validate`, `stamp` and `reduce` all get
  the Message upcast. A client claiming version 1 is judged exactly as the
  current Message would be.
- **The journal stores the current version** and compares a retransmission
  by the operation as it was written, so an edit committed by the old build,
  whose acknowledgement was lost in the deploy, is acknowledged rather than
  refused.

What will not read:

| Where | Written by a newer build | Older, and no step reads it |
| --- | --- | --- |
| A device's outbox | the replica refuses to open, `UnsupportedMessageVersionError`; nothing is removed | moved to `status.refused` with its payload, never sent, until dismissed; the rest sends |
| An operation a server receives | the exchange fails before anything is appended: the client waits | rejected as `Unreadable { version }`; the replica keeps it in `refused` |
| The journal's committed history | `UnreadableHistoryError` wherever the row is read: every exchange of a replica whose cursor is before it, a retransmission of its id, and an append or load that rebuilds from a snapshot older than it; a replica past it is served | the same |
| A committed operation a replica receives | its exchanges fail with `UnsupportedMessageVersionError` until it reloads | `InvalidReplicaHistoryError`: client and server disagree on a step |

So deploy in this order: the Sync release that reads `messageVersion`
everywhere first; then the application's new version, server first. The
first step is not optional: a server on an older release rejects an
operation carrying `messageVersion`, and a replica on an older release drops
an operation refused as `Unreadable`, and both lose that edit. A client
still on the old version syncs until an operation of the new version commits,
then fails its exchanges until it reloads, keeping its outbox. A rollback
meets versions it lacks and refuses them, typed, deleting nothing; rolling
forward reads them again. A rollback of the Sync release itself cannot open
a replica state holding `refused` (`InvalidReplicaHistoryError`): never clear
storage on that error, since the outbox is in the same state.

A step must be pure and deterministic: the server reads an entry more than
once, and each read must find the same Message. A server that builds an
operation itself writes it with `journalContract().operation.encode`; the
journal's input type, `WrittenOperation`, refuses a decoded `Operation`.

The history covers durable Messages, not the shared slice: a change to the
slice's own Schema still breaks a stored snapshot or checkpoint.

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
| An operation from another build | read through the Message's history; see [changing a durable Message](#changing-a-durable-message) |
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
  action, chosen before the action runs and handed to the provider. A
  reaction derives one for you; the provider's idempotency is still yours.
- **Parked runs.** Looking at what a reaction set aside, and retrying or
  dismissing it, is a person's job; the list only says it is there.
- **Migrations.** Sync and Durable version and refuse their own storage and
  wire formats, and Sync applies the history you declare for a durable
  Message. Writing that history, and evolving the shared slice's own Schema,
  are yours.
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
