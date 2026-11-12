# Server-only Messages and reactions for Sync (#190, Phase 5 items 1 and 2)

Status: designed 2026-11-12, not built, not yet reviewed. Phase 5 items 1 and
2 of [contract-layer-PLAN.md](./contract-layer-PLAN.md), for its invariants 8
("server-only Messages cannot originate from a client") and 9 ("reactions run
at least once and are keyed deterministically"). It follows the built
[190-upcasting-DESIGN.md](./190-upcasting-DESIGN.md) and
[190-sync-refusals-DESIGN.md](./190-sync-refusals-DESIGN.md).

## 1. The problem

A Sync document has one kind of stored Message: `durable`, which any replica
may submit. Two things a server needs have no place in the contract, so every
example that needs them builds them by hand.

**A fact only the server may record.** Four examples build a server
operation, each writing the envelope itself:

| Where | What the server appends | How a client is kept from sending it |
| --- | --- | --- |
| `examples/registry/src/journal.ts:155-165` (`absorbed`) | `AbsorbedEdits`, a variant of its own | an `authorize` rule comparing a string: `principal.actorId === server.actorId` (`examples/registry/src/sync.ts:62`) |
| `examples/pages/src/serving.ts:106-124` (`collect`) | `EditedPage` holding a `Collect` op: server-only by content, in a variant clients also send | `authorize` reads the ops, allowing `principal.actorId === SERVER` (`:74-76`), and `tabOf` (`:45-46`) keeps a connection from naming itself `server` |
| `examples/sync/src/journal.ts:164-179` (`appendAsServer`) | any Message, as the principal it is given | nothing: it is an agent acting for a person, not a server fact (`serverAgent.ts:42`) |
| `examples/todo-app/src/journal.ts:91-109` (`appendAsServer`) | the same | the same |

All four derive the operation's identity from the journal's cursor
(`opId: producer:cursor+1`), so two appends at one cursor with different
content are an `IdentityConflictError`, and none names the fact it records.
The first two rest "only the server" on an actor id being a string no client
can obtain. That holds only while every resolver is careful: pages needs
`tabOf` for exactly that, and an application that spreads the contract and
writes its own `authorize` replaces the rule silently unless it composes by
hand, as the registry does (`journal.ts:107-114`). Nothing stops a replica
from *submitting* `AbsorbedEdits`: `submit` types it as durable, and the
registry pins the refusal with a test (`test/journal.test.ts:185-196`).

**Work after a commit.** Three examples run it through `foldkit-durable`'s
`recover` and effect ledger, and each keeps the cursor somewhere else:

| Where | The work | The cursor |
| --- | --- | --- |
| `examples/sync/src/journal.ts:188-224` | a policy's `effects`, keyed `documentId/opId/command/index` | a `Map` in memory (`:195`); a new process starts at the compacted floor |
| `packages/sync/src/journal.ts:519-578` (`editsJournal`, the registry) | a table write per change | a `let` in memory (`:529`); the same |
| `examples/cloudflare/src/schema.ts:160-189` (`settleTodos`) | a table write per operation | a row it writes into Durable's own `durable_meta` table by hand (`:163-166`, `:181-188`) |

A cursor in memory costs a walk of the whole uncompacted log, with a ledger
read per operation, on every start. On Workers a start can be every request.
None of the three can append a Message as a result. Each runs inside the
exchange, before its reply (`journalExchange` yields `settle`,
`packages/sync/src/journal.ts:315`): a failed intent is tried again on every
exchange with no backoff, a slow provider holds every replica's reply, and a
defect in the work fails the exchange. That is right for a read model the
reply depends on and wrong for a mailer being down.

## 2. Who owns what

- **The journal owns order and acceptance**, as today. A server-only Message
  is an operation in the same order, stored, upcast and replayed like any
  other. Nothing here adds a second log.
- **The Sync contract owns which Messages are whose**: `durable` (a replica
  may submit) and `serverOnly` (only the server appends). Sync applies it
  wherever it reads an operation someone sent.
- **`foldkit-durable`'s effect ledger owns "did this run finish"**, per key,
  as it does today (`effects`, `runEffect`).
- **The reaction cursor is a lower bound over the ledger, not a second
  record.** It says "every run at or before here finished". Set back, it
  costs ledger reads and no second call; it is advanced only after the
  ledger says a run finished. `foldkit-durable` stores it, beside the ledger
  it summarizes.
- **The external system owns its own state**: whether the mail was sent, the
  card charged. Neither Sync nor the journal can read it, so neither claims
  to know it (§6).
- **Not owned here:** a process, a timer or a wait (item 7); state the
  server keeps from replicas (item 3); what each reader may see (item 4).

## 3. Options considered

### 3.1 Where the server-only check runs

The reviewed rule (upcasting note §4, §9) is that the check runs on the
current Message, after upcasting, so a step that maps an old variant into a
server-only one is refused like one sent today.

**A. In the application's `authorize`, by principal** (today's examples).
Rejected: it trusts an actor id to be unforgeable, it is replaced by a
spread, and it runs after `validate`, where invariant 8 asks for before.

**B. In `admit`.** Rejected: `admit` is optional and the application's own
(`JournalExchangeOptions.admit`), so a server that passes none admits
everything. A check that can be left out fails open.

**C. In the journal's append** (`foldkit-durable`). The journal has one
operation codec for an entry being appended and a stored row being read
(`durable/src/journal.ts:979-993`, `:938-946`), and the server's own append
goes through the same `append`. To tell a client's entry from the server's
it would need a second door or a second decode, for one caller, and the
upcasting build already declined to teach Durable about Messages (its §11,
"Durable does not learn of versions"). Rejected for the same reason.

**D. In the durable check of the replica's `submit` only.** Rejected: the
client is untrusted. It stays as the type error and a second runtime gate,
not the guard.

**E. Chosen: in Sync's reader of an entry someone sent.** Sync already has
one place where a sent entry's Message is upcast and then checked
(`messageOf`, `packages/sync/src/sync.ts:556-574`; the durable check is line
572). That function serves two kinds of caller, which this splits:

- **A sent entry**: `codec.normalizeOperation` and `codec.operationFrom`,
  which `journalExchange` reads every pending entry with
  (`sync/src/journal.ts:183-197`) before `admit` and before
  `journal.append`, so before `validate` and `authorize`. They refuse a
  server-only Message with a typed `ServerOnlyMessageError` (`opId`), and an
  entry whose `replicaId` is in the server's reserved namespace (§4.2).
- **History**: `journalContract().operation.decode` (stored rows, and the
  server's own appends), `codec.committedFrom` (what a replica receives) and
  the replica's outbox. They read `durable` and `serverOnly` alike.

It is not optional, it runs after upcasting by construction, and an old
entry is judged by what it becomes: a version-1 entry whose step yields a
server-only variant is refused; an old server-only variant a step turns
into a durable one is accepted, because the current Message is durable.
Both public readers of an entry are the strict ones, so a custom server
that reads entries with either gets the check without changing a call. A
server that hands raw client input to `journal.append` without reading it
first gets none, as it gets no version scan today; the README's exchange
section says to read first.

The outbox reads both sets on purpose. A deploy that moves a variant from
`durable` to `serverOnly` may find one pending on a device; refusing to open
would block every edit behind it, which is the AGENTS.md trap "an exchange
that throws on one operation blocks the outbox". The server refuses it by
its id and the replica drops and reports it, on the path that exists.

### 3.2 `serverOnly` beside `durable`, or inside it

**Inside** (`serverOnly` a subset of `durable`): `submit` is typed by
`durable`, so a server-only Message would type-check on the client, against
invariant 8. **Chosen: disjoint.** `durable` is what a replica may submit;
`serverOnly` is what only the server appends; both are stored and replayed.
`Sync<Message, Shared, Durable>` already types `submit` by `Durable`
(`sync.ts:368`), so the type error costs nothing new. A tag in both throws
when the contract is defined.

### 3.3 Where the reaction cursor is stored

**A. In memory, restarting at the floor** (two examples). Rejected: §1's
cost, and a reaction would never see what was compacted while it was behind.

**B. In the application's own table** (`settleTodos`). Rejected as the
answer: every application writes the same upsert, and the one example
writes into Durable's private table to do it.

**C. In the journal, as a server-only Message** (`ReactionSettled { name,
through }`). Rejected. Every replica would download and replay the server's
bookkeeping; each cursor write is a commit that wakes every socket; the
application's Message union and `update` would carry a variant that means
nothing to it; and the cursor's own commit is a commit the reaction must
then skip. It also tells every reader which reactions a server runs and how
far behind they are.

**D. No cursor: the ledger alone.** Correct, and what option A does after a
restart. Rejected for cost only; it is why losing the cursor is safe.

**E. Chosen: a table in `foldkit-durable`**, beside the ledger, one row per
document and name. Durable owns `recover` and the ledger, and only it has
the `SqlClient`. `reset` drops a document's rows with its history.

One cursor per reaction, not per document: `recover` stops at the first
operation whose intent fails (`durable/src/journal.ts:1534-1557`), so with
one cursor a mailer that is down would stop every other reaction.

### 3.4 At least once, or effectively once

SQLite (or D1) and an external provider share no transaction. A run is a
call to the provider and then a write to the ledger; a crash or a timeout
between them leaves a call that may have happened and a ledger that does not
say so. **So an external call runs at least once, and may run twice. This
design cannot make it exactly once, and no design over these two stores
can.**

What it can do, narrowly:

- **The key is deterministic** (`documentId/reaction/opId`, invariant 9) and
  the handler is given it, to pass to the provider as its idempotency key.
  Whether a repeat is then a no-op is the provider's guarantee, not ours.
  The README says "at least once" and never "exactly once".
- **An append is once.** A Message a reaction appends has an operation id
  derived from the run's key, and the journal answers a repeat of an id from
  history. That is one store, so it holds.
- **At most once** (hold a run whose outcome is uncertain until a person
  resolves it) is what Durable's `onUnresolved: 'skip'` already offers.
  Rejected as the default: a held reaction stops in journal order behind it,
  for a case most providers handle by key. Not exposed in this item (§10).

### 3.5 Registering a handler, or declaring a reaction

The plan's sketch is `journal.react(set, handler)`. A handler registered by
call has no name to key by, and what it may append is known only by running
it. **Chosen: a declared value**, `reaction(sync, { name, on, appends, run })`,
given to the journal in a list. `on` and `appends` are `MessageSet`s, the
typed reference `durable` already takes (#251), so a tool reads which
Messages cause which (plan invariant 3), and a cycle among reactions is
refused when the journal is made.

## 4. The chosen shape

The code below compiled in a temporary `*.test-d.ts` under
`examples/kitchen-sink` (`pnpm exec tsc -b examples/kitchen-sink`, clean; a
deliberate type error appended to it failed the build, so the file is
checked; it is deleted). The names under "Proposed" are declared, not built:
`make` stands for `forApplication(App).make` with `serverOnly` added and its
other options elided, and `ServerSync` for `Sync` with a fourth type
parameter. `'Mailer'` stands for a service the handler needs.

```ts
import { Duration, Effect, Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { AppendError, AppendResult, Cursor, Journal, JournalError } from 'foldkit-durable/core'
import {
  MessageSet,
  Projection,
  Surface,
  type ReportDiagnostic,
  type WritableProjection,
} from 'foldkit-surface'
import {
  DocumentId,
  SyncRefusal,
  type Operation,
  type Sync,
  type WrittenOperation,
} from 'foldkit-sync'

// ---- Proposed in foldkit-sync (not built) ----

/** `Sync` with its fourth parameter: the Messages only the server appends. Replicas replay them. */
interface ServerSync<Message, Shared, Durable, ServerOnly> extends Sync<Message, Shared, Durable> {
  /** Whether a Message is one only the server appends. */
  readonly serverOnly: (message: Message) => message is Message & ServerOnly
}

/** `forApplication(App).make`, with `serverOnly` beside `durable` (its other options elided). */
declare const make: <
  AppModel,
  Message,
  Fields extends Schema.Struct.Fields,
  Durable extends Message,
  ServerOnly extends Message,
>(options: {
  readonly documentId: DocumentId
  readonly shared: WritableProjection<AppModel, Fields>
  /** What a replica may submit. */
  readonly durable: MessageSet<AppModel, Message, Durable, any>
  /** What only the server appends; no tag may be in both. */
  readonly serverOnly: MessageSet<AppModel, Message, ServerOnly, any>
}) => ServerSync<Message, Schema.Struct.Type<Fields>, Durable, ServerOnly>

/** A committed operation, as a reaction is given it. */
interface Trigger<Message> {
  /** The Message at the current version, as every hook sees it. */
  readonly message: Message
  readonly opId: string
  readonly sequence: number
  /** Who committed it: a person's actor, or the server's. */
  readonly actorId: string
  /** `documentId/reaction/opId`, the same on every retry: a provider's idempotency key. */
  readonly key: string
}

/** One declared reaction: what it runs on, what it may append, and what its handler needs. */
interface Reaction<out R> {
  readonly name: string
  readonly on: ReadonlySet<string>
  readonly appends: ReadonlySet<string>
  readonly requires?: R
}

declare const reaction: <
  Message,
  Shared,
  Durable extends Message,
  ServerOnly extends Message,
  On extends Durable | ServerOnly,
  Appends extends ServerOnly = never,
  R = never,
>(
  sync: ServerSync<Message, Shared, Durable, ServerOnly>,
  options: {
    /** Part of every run's key, so renaming it is a new reaction. Unique in the document. */
    readonly name: string
    /** The committed Messages it runs after. */
    readonly on: MessageSet<any, any, On, any>
    /** The server-only Messages it may append; a cycle among reactions is refused when the journal is made. */
    readonly appends?: MessageSet<any, any, Appends, any>
    /** How long one run may take before it counts as failed. */
    readonly timeout?: Duration.Input
    /** One external call, or none, and the Messages to append. It may run again. */
    readonly run: (
      trigger: Trigger<On>,
    ) => Effect.Effect<ReadonlyArray<NoInfer<Appends>> | void, unknown, R>
  },
) => Reaction<R>

type Requires<Reactions extends ReadonlyArray<Reaction<any>>> =
  Reactions[number] extends Reaction<infer R> ? R : never

interface ServerJournal<ServerOnly, R> {
  /**
   * Appends a server-only Message as the server. `key` names the fact: a
   * repeat with the same key is answered from history.
   */
  readonly appendAsServer: (
    message: ServerOnly,
    options: { readonly key: string },
  ) => Effect.Effect<AppendResult<Operation>, AppendError>
  /**
   * Runs every reaction from its stored cursor to the journal's. Never fails:
   * a failed run is reported, and the answer is how long to wait before
   * running again; none when every reaction has caught up.
   */
  readonly react: Effect.Effect<Option.Option<Duration.Duration>, never, R>
  /** The lowest cursor of the declared reactions: compact no further than this. */
  readonly settledThrough: Effect.Effect<Cursor, JournalError>
}

declare const serverJournal: <
  Message,
  Shared,
  Durable,
  ServerOnly,
  Principal,
  const Reactions extends ReadonlyArray<Reaction<any>> = [],
>(options: {
  readonly sync: ServerSync<Message, Shared, Durable, ServerOnly>
  readonly journal: Journal<Operation, Shared, Principal, WrittenOperation>
  /** Who the server commits as. Never resolved from a request. */
  readonly server: Principal
  readonly reactions?: Reactions
  readonly diagnostics?: ReportDiagnostic
}) => ServerJournal<ServerOnly, Requires<Reactions>>

// ---- An application's use ----

const Order = Schema.Struct({
  id: Schema.String,
  cents: Schema.Number,
  paid: Schema.Boolean,
  receipted: Schema.Boolean,
})
const Model = Schema.Struct({ orders: Schema.Array(Order), draft: Schema.String })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  TypedDraft: { text: Schema.String },
  PlacedOrder: { id: Schema.String, cents: Schema.Number },
  ConfirmedPayment: { id: Schema.String, charge: Schema.String },
  SentReceipt: { id: Schema.String },
})
type Message = typeof Message.Type

const mark = (model: Model, id: string, change: Partial<typeof Order.Type>): Model =>
  modifyFields(model, {
    orders: () => model.orders.map(order => (order.id === id ? { ...order, ...change } : order)),
  })

const App = Surface.application({
  Model,
  Message,
  initial: { orders: [], draft: '' },
  update: (model, message) => ({
    model: Match.valueTags(message, {
      TypedDraft: ({ text }) => modifyFields(model, { draft: () => text }),
      PlacedOrder: ({ id, cents }) =>
        modifyFields(model, {
          orders: () => [...model.orders, { id, cents, paid: false, receipted: false }],
        }),
      // A replica replays these two like any other; it can never submit them.
      ConfirmedPayment: ({ id }) => mark(model, id, { paid: true }),
      SentReceipt: ({ id }) => mark(model, id, { receipted: true }),
    }),
  }),
})

const Placed = MessageSet.make(App, [Message.PlacedOrder])
const Confirmed = MessageSet.make(App, [Message.ConfirmedPayment])
const Receipted = MessageSet.make(App, [Message.SentReceipt])

const Orders = make({
  documentId: DocumentId.make('orders'),
  shared: Projection.pick(App.model.orders),
  durable: Placed,
  serverOnly: MessageSet.union(Confirmed, Receipted),
})

// On the client: a replica submits what is durable, and nothing else.
declare const replica: Effect.Success<ReturnType<typeof Orders.openReplica>>
void replica.submit(Message.PlacedOrder({ id: 'o1', cents: 1200 }))
// @ts-expect-error a server-only Message is not one a replica submits
void replica.submit(Message.ConfirmedPayment({ id: 'o1', charge: 'ch_1' }))

// On the server.
interface Principal {
  readonly actorId: string
}
declare const journal: Journal<
  Operation,
  { readonly orders: Model['orders'] },
  Principal,
  WrittenOperation
>
declare const sendReceipt: (
  order: string,
  idempotencyKey: string,
) => Effect.Effect<void, Error, 'Mailer'>

const receipt = reaction(Orders, {
  name: 'receipt',
  on: Confirmed,
  appends: Receipted,
  run: ({ message, key }) =>
    sendReceipt(message.id, key).pipe(Effect.as([Message.SentReceipt({ id: message.id })])),
})

const server = serverJournal({
  sync: Orders,
  journal,
  server: { actorId: 'orders-server' },
  reactions: [receipt],
})

// A payment provider's webhook: the event's id is the key, so a redelivery appends nothing.
const confirmed = (event: {
  readonly id: string
  readonly order: string
  readonly charge: string
}) =>
  server.appendAsServer(Message.ConfirmedPayment({ id: event.order, charge: event.charge }), {
    key: `payment/${event.id}`,
  })
void confirmed

// The handler's services are the run's.
const run: Effect.Effect<Option.Option<Duration.Duration>, never, 'Mailer'> = server.react
void run

// @ts-expect-error what a replica may submit is not the server's to append as itself
void server.appendAsServer(Message.PlacedOrder({ id: 'o2', cents: 1 }), { key: 'k' })

reaction(Orders, {
  name: 'draft',
  // @ts-expect-error a local-only Message never commits, so nothing reacts to it
  on: MessageSet.make(App, [Message.TypedDraft]),
  run: () => Effect.void,
})

reaction(Orders, {
  name: 'undeclared',
  on: Placed,
  appends: Receipted,
  run: ({ message }) =>
    // @ts-expect-error it may append only what `appends` names
    Effect.succeed([Message.ConfirmedPayment({ id: message.id, charge: 'free' })]),
})

reaction(Orders, {
  name: 'silent',
  on: Placed,
  // @ts-expect-error without `appends` it appends nothing
  run: ({ message }) => Effect.succeed([Message.SentReceipt({ id: message.id })]),
})

// What a forged server-only Message is refused with, and how a page reads it.
const forged = SyncRefusal.Forbidden({ reason: Option.some('Only the server makes this change') })
const shown: string = SyncRefusal.match({
  Forbidden: ({ reason }) => Option.getOrElse(reason, () => 'You may not change this'),
  Invalid: ({ message }) => message,
  Unreadable: () => 'Made by another version of the app, so not saved',
})(forged)
void shown
```

### 4.1 Server-only Messages

- `forApplication(App).make` takes `serverOnly`, a `MessageSet` of the same
  application, disjoint from `durable`. `Sync.define` takes
  `serverOnly?: (message) => boolean` beside `durable`; a Message both
  accept is server-only.
- A replica replays a server-only Message through the same `update` or
  `replay`. `submit` refuses one by type, and at run time as it refuses a
  local-only Message today (`sync.ts:834-835`), saying which.
- The contract's `surface` keeps listing `durable` only, so an agent bound
  to it cannot dispatch a server-only Message. `contract.messages` (the
  Module's ownership record) lists both.
- `authorize` and `stamp` rules may be keyed by a server-only tag too.

### 4.2 `appendAsServer`

`serverJournal({ sync, journal, server })` holds the server's principal,
given once in server code and never resolved from a request.
`appendAsServer(message, { key })` writes the envelope and appends it through
`journal.append` as that principal, so the journal's `validate` and
`authorize` judge it like any operation.

- **`key` names the fact** and is required: a webhook event's id, a clock
  tick, `absorbed/<through>`. The operation's `replicaId` is
  `server/<key>`, its `localSequence` 1, its `opId` therefore
  `server/<key>:1` (the identity Sync checks, `sync.ts:537-543`), and its
  `baseCursor` 0, so the bytes do not depend on when it is appended. A
  repeat of a key is answered from history; a repeat with other content is
  the journal's `IdentityConflictError`. `key` is bounded (*Sketch*: 200
  characters) where it is taken.
- **The `server/` namespace is reserved.** Durable binds a replica id to the
  first actor that commits from it (`durable/src/journal.ts:144-151`), so a
  client that guessed a key could claim `server/<key>` first and have the
  server's own append refused. A sent entry naming a replica under
  `server/` is refused by the same reader as a server-only Message.
- **A repeat across a deploy.** The journal compares a repeat by the bytes
  written (upcasting note §4), and those include `messageVersion`. So the
  written operation is recorded in the effect ledger (`append/<documentId>/<key>`)
  before it is appended, and a repeat appends the recorded bytes: a webhook
  redelivered after a migration step is added is still the same operation,
  and the journal upcasts it on read like any old row.
- It takes server-only Messages only. An agent appending a durable Message
  for a person (the sync and todo-app examples) is that person's operation
  under their principal, and stays out (§10).

### 4.3 Reactions

`serverJournal`'s `react` is one pass: for each declared reaction, from its
stored cursor to the journal's, in journal order, for each committed
operation whose current Message is in `on`:

1. the handler runs once under the ledger key `documentId/reaction/opId`,
   with `timeout` (*Sketch*: default 30 s), and its answer, the operations to
   append as written, is recorded;
2. each is appended as the server, keyed `<reaction>/<opId>/<index>`;
3. the run is recorded as finished; after the pass, the cursor is stored.

A reaction with no stored cursor starts at the journal's cursor when it
first runs: deploying a mailer does not mail three years of history.

What it is not, by construction. The handler is given the committed Message
and its commit, never the snapshot, which by the time it runs is no longer
the one the operation committed against. It returns Messages; it has no
handle to wait on, no state between runs but the ledger's record of its
answer, and no way to schedule. A reaction may run on a server-only Message,
which is how a webhook's fact becomes a receipt; `appends` makes the graph
of which reaction feeds which, and a cycle in it (a reaction appending what
it runs on, directly or through another) throws from `serverJournal`.

A reaction's append commits where the journal is by then, after whatever
committed meanwhile, not beside its trigger.

`react` is safe to call at any time and from anywhere; where it is called
is the host's (§7). `settledThrough` is the lowest cursor among the declared
reactions; whoever compacts, `editsJournal`'s `absorb` included, compacts no
further.

### 4.4 What `foldkit-durable` gains

- A `cursors` table (`key`, `name`, `cursor`, primary key `(key, name)`),
  schema version 7. The write is a monotone upsert (`MAX(cursor, excluded.cursor)`),
  so two runners never move it back.
- `recover` takes an optional `name`: with it, `from` defaults to the stored
  cursor and the settled cursor is stored.
- `settled(key, name)` reads one. `reset(key)` deletes the document's.

Nothing else: the ledger, `runEffect` and `recover`'s order are used as
they are.

## 5. Failure semantics

**A forged server-only Message.** `journalExchange` rejects it by its id
with `SyncRefusal.Forbidden({ reason: 'Only the server makes this change' })`
(the last lines of the code above) and reports a `ServerOnlySubmitted`
diagnostic (`documentId`, `opId`, the actor; never the payload). `Forbidden`
because the meaning is "who sent it may not", and because it is what the
registry's rule already answers, so its page does not change. A new case
was rejected: it would add a variant to a union applications match in full,
for a refusal no honest client can cause. An entry under `server/` is
`Invalid`, "Not an operation this server accepts", as a malformed envelope
is. Neither fails the exchange; the edits beside it go.

**A reaction that fails, throws or times out.** The run is recorded as
failed, that reaction stops at that operation (order is the promise), and
the others go on. `react` never fails, so no exchange fails for a reaction;
it reports `ReactionFailed` (`documentId`, `reaction`, `opId`, `sequence`,
the cause's words cut to 500 characters) and answers how long to wait: a
backoff per reaction, from 0.5 s doubling to 30 s, kept in memory. A defect
is caught as a failure (`recover` uses `Effect.result`, which lets a defect
through; AGENTS.md "`Effect.result` captures failures, not defects"). A
handler that should give up catches its own error and returns nothing; one
that never succeeds blocks its reaction, is reported on every pass, and
holds `settledThrough`, so the log behind it is kept. There is no skip tool
(§10).

**A crash between the external call and the ledger write.** The ledger row
reads `pending`; the next pass runs the handler again with the same key.
This is the "at least once" of §3.4. A crash after the ledger write and
before the appends, or before the cursor write, repeats no call: the
recorded answer is appended (a repeat of an id) and the cursor moves.

**A timeout** is the same uncertainty without a crash: the call may have
landed. It is retried with the same key.

**The append is refused.** The application's `validate` or `authorize`
refuses the server's Message (`InvalidOperationError`,
`OperationRejectedError`): the run fails as above, with the handler's answer
already recorded, so the retry makes no second call. It stays failed until a
deploy changes the rule. A reaction is not exempt from the document's rules.

**A reaction appending a Message its own history cannot read.**

- The handler returns a value the current Schema will not encode: a type
  error where it is written; at run time the run fails before anything is
  recorded, so a fixed build runs the handler again.
- The answer was recorded at version N and a deploy to N+1 lands before it
  is appended: it is appended as written, and the journal upcasts it. If no
  step reads it, the append fails with `UnreadableMessageError`, the run
  stays failed with the external call already made, and only a build with a
  step that reads version N recovers it. Nothing is dropped.
- A rollback meets an answer recorded at a newer version:
  `UnsupportedMessageVersionError`, the same, until rolled forward.
- Once committed it is a row like any other: unreadable later, it is the
  upcasting note's `UnreadableHistoryError`.

**A trigger that will not read.** A stored row the reaction's pass cannot
decode fails the pass as it fails an exchange from before that row; the
reaction waits for the build that reads it.

**Compaction passes a reaction** (a caller ignored `settledThrough`): the
pass gets `CompactedCursorError`, reports `ReactionSkipped` (`reaction`,
from, to) and resumes at the floor. Loud, and a loss.

**Two runners at once.** In one journal instance `runEffect` shares a run in
flight (`durable/src/journal.ts:1463-1531`). Across instances (two isolates
over one D1) both run the handler: a duplicate with no crash. See §7.

**After `reset`.** Cursors go with the history. A replica that sends an
operation again commits it again under its old id; the ledger still holds
that run, so no external call repeats, and the recorded answer is appended
into the new history.

## 6. Security

- **A client cannot cause a server-only append directly.** The only code
  that appends one is `appendAsServer` and a reaction, both server code
  holding the server's principal. A sent entry carrying one, at any version,
  is refused before `admit`, `validate` and `authorize`; one claiming the
  server's replica namespace is refused too. The check does not depend on
  how a principal is resolved.
- **A client causes one indirectly only through a reaction the server
  declared**, and only by committing a Message it was allowed to commit: a
  reaction's input is a committed operation, which passed `admit`,
  `validate` and `authorize`. Its fields are still what a client wrote. A
  handler that mails `message.email` mails wherever the client said; the
  handler checks what it acts on.
- **Reactions see the same rules.** A reaction's append goes through
  `journal.append` as the server's principal, so `validate` and the
  journal's `authorize`, `GuardSync.authorize` included, judge it. A Guard
  policy says what the server may do like any principal. `admit` does not
  run: it judges a connection, and the server has none.
- **Amplification.** One commit is at most one run per reaction, and a run
  appends at most 16 Messages (*Sketch*), refused past that. A client
  allowed to commit 500 operations causes 500 runs; rate is `admit`'s, as
  for the commits themselves.
- **Names and keys.** A reaction's name is checked when declared
  (`[A-Za-z0-9_-]`, at most 64) and is unique in a document. `key` is a
  bounded string, used as a value and never as an object key. Diagnostics
  carry ids, never a Message.
- **What replicas learn.** A server-only Message is sent to every replica
  of the document, like any operation. A secret does not belong in one
  until item 4.

## 7. Hosts

`react` pulls: it reads the cursor from the store and runs what is after it.
Nothing wakes it across requests, so it does not meet the AGENTS.md trap
"One worker request cannot wake another's stream": whichever request, alarm
or timer runs next reads the same durable cursor. What differs per host is
only who calls it, and when again.

- **Node** (`documentHost` over `ws`, or any long-lived process): one fiber
  runs `react` at start, after each notice from `journal.subscribe` for the
  document, and after the delay `react` answers. In process, so the single
  journal instance shares runs in flight.
- **A Durable Object** (`foldkit-sync/do`), journal in the object's SQLite
  or in D1: the object is the single writer and the single runner. After an
  exchange that acknowledged something, the host starts `react` without
  holding the reply for it, and sets the object's alarm; `alarm()` runs
  `react` and sets the alarm again from its answer. The alarm is what
  survives the object being evicted mid-run. *Sketch*: `defineDocumentHost`
  takes `reactions: (env, journal) => ServerJournal`, and
  `DocumentHostContext.storage` is typed for `setAlarm`.
- **A stateless Worker over D1** (`journalExchange` behind `fetch`): the
  request that committed calls `ctx.waitUntil(react)`, and a Cron Trigger
  calls `react` for what failed or was cut off. Two isolates can run one
  reaction at once, so a duplicate call needs no crash here. Durable's
  options already say to route D1 appends through one writer
  (`durable/src/journal.ts:152-161`); the same holds for reactions.

An application may also put `react` in an exchange's `settle`, so the reply
carries what the reaction appended, at the cost of the reply waiting on the
provider. It never fails the exchange.

A notice to other sockets after a reaction's commit is `serveJournal`'s
existing path (`journal.subscribe`).

## 8. Migration

- **Nothing changes for a document with no `serverOnly`.** The strict
  readers refuse nothing new except a replica id under `server/`: a
  changelog entry under Changed, since `openReplica({ replicaId })` accepts
  any string today.
- **Moving a variant to `serverOnly`** (the registry's `AbsorbedEdits`):
  deploy the server first. Stored rows read as before. A client build that
  still lists it as durable can submit one and is refused `Forbidden`, as
  its `authorize` rule refuses it today. The hand-written rule and
  `absorbed` envelope go; `editsJournal`'s `absorbed` and `server` options
  are deprecated for one release in favour of a `serverJournal`.
- **Pages' `Collect`** is server-only by content, inside a variant clients
  send. It keeps its `authorize` rule, or splits a `CollectedPage` variant
  off and adds a migration step. Not decided here.
- **The examples' `appendAsServer`** (sync, todo-app) is an agent's append
  for a person and keeps its name only by accident; it is renamed when
  those examples are touched, not replaced by this.
- **`foldkit-durable`'s schema moves to 7.** A build before it refuses to
  open a migrated database (`UnsupportedJournalVersionError`), which is the
  rollback case of every earlier bump.
- **`settleTodos` and the sync example's `settleThrough`** can drop their
  cursors for `recover`'s `name`; table writes that the reply depends on
  stay in `settle`.
- No wire version moves. A server-only operation is today's envelope.

## 9. Tests

Each with a mutation beside it (`packages/sync/test/serverMessages.mutations.ts`).

- A sent server-only Message is rejected `Forbidden` and the edits beside
  it commit; with `admit` and `authorize` both allowing everything, so only
  the check can refuse.
- A version-1 entry whose step yields a server-only variant is refused; an
  old server-only variant whose step yields a durable one is accepted.
- An entry under `server/` is refused, and the server's later append with
  that key commits.
- A replica replays a server-only Message; an outbox holding one opens,
  sends, and reports the rejection.
- `appendAsServer` twice with one key commits once; with other content it
  is an `IdentityConflictError`; repeated after a migration step is added it
  is still once.
- A reaction runs once per commit across a restart (a new journal over the
  same file), with the handler counting calls and the cursor read back.
- A handler that fails once blocks only its own reaction, is reported, and
  runs again; a defect and a timeout the same.
- A crash injected after the handler and before the ledger write runs it
  twice with one key; injected after the ledger write, once.
- Two reactions in a cycle throw when the journal is made.
- `react` on a journal with nothing new makes no call and no write.
- On workerd (`examples/cloudflare`, through `Stack`): a commit, then the
  alarm, runs the reaction; the object restarted between them still runs it
  once. Types: the `@ts-expect-error` cases in §4, in `types.test-d.ts`.
- The plan's "done when": a webhook's payment confirmation as a server-only
  Message, and a notice once per commit across a restart, in an example.

## 10. What it leaves out

- **Server-only state** (item 3), **reader slices** (item 4) and
  **application refusals** (item 5). A server-only Message here changes the
  shared snapshot every replica holds.
- **Deadlines and processes** (item 7, Q12). A reaction cannot wait or
  schedule. One consequence to carry there: a Durable Object has one alarm,
  and §7 uses it for retries, so a deadline on the same object shares it.
- **Holding an uncertain run for a person** (`onUnresolved: 'skip'`), and a
  tool to skip a poisoned operation.
- **A lease across isolates**, so two stateless Workers do not run one
  reaction at once.
- **Pruning the ledger.** One row per run and one per server append, kept:
  `reset` re-appends from them (§5). Not measured.
- **An agent's append for a person**, and so the envelope the sync and
  todo-app examples write by hand.
- **Server-only by content** (pages' `Collect`).
- **A custom server that appends raw client input** without reading it
  first. Documented, not prevented (§3.1 C).

## 11. Unknowns

- **Durable Object lifetime.** Whether work started after a reply keeps
  running while the object has an open socket, how `alarm()` retries after a
  throw, and whether a commit made inside `alarm()` reaches the notices of
  sockets the object holds. Not probed; §7's alarm is the design because it
  does not depend on the first. A workerd probe comes before the build.
- **The reserved prefix.** `server/` is a proposal; whether any deployed
  replica id begins with it is not known.
- **`replicas` growth.** A server key is a replica id, so Durable's binding
  table gains a row per server append. It grows with the operations table,
  which also keeps a row per operation after compaction. Not measured.
- **The ledger recording written operations**: whether `runEffect`'s JSON
  result holds a `WrittenOperation` for every Message encoding in use. It
  should, since the journal stores the same value as JSON; not probed.
- **The defaults**: 30 s, 16 Messages, the backoff, a 200-character key.
- **Whether `react` in `settle` should be a named option** of
  `journalExchange` rather than the application's own composition.
- **Type cost.** `reaction` infers seven parameters; it compiled in the
  kitchen-sink within the run above, and was not measured against invariant
  12's budget.
