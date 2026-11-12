# Server-only Messages and reactions for Sync (#190, Phase 5 items 1 and 2)

Status: built 2026-11-12 on the branch (decisions made while building, and
where the note was wrong against the source, are §13). Designed the same
day and revised after two review rounds (six blocking findings; what each
changed is §12). Jev did not run (`TYPESAFE_API_KEY` unset). Phase 5
items 1 and 2 of [contract-layer-PLAN.md](./contract-layer-PLAN.md), for its
invariants 8 ("server-only Messages cannot originate from a client") and 9
("reactions run at least once and are keyed deterministically"). It follows
the built [190-upcasting-DESIGN.md](./190-upcasting-DESIGN.md) and
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
  record.** It says "every run at or before here finished or was parked".
  Set back, it costs ledger reads and no second call; it is advanced only
  after the ledger says so. `foldkit-durable` stores it, beside the ledger
  it summarizes.
- **The parked list owns "a person must look at this run".** It is the one
  new fact, and Durable stores it beside the cursor.
- **The external system owns its own state**: whether the mail was sent, the
  card charged. Neither Sync nor the journal can read it, so neither claims
  to know it (§3.4).
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

**E. Chosen: in every public reader of an entry someone sent, with a
separate reader for history.** Today both are one function:
`journalContract().operation.decode` *is* `normalizeOperation`
(`packages/sync/src/sync.ts:638`), which Durable calls for a stored row and
for the entry `append` receives, and `codec.writtenFrom` (`:596-600`), whose
result `journalExchange` appends (`sync/src/journal.ts:190`, `:293`), checks
the envelope and never reads the Message. So the split is made explicit:

| Reader | Today | After |
| --- | --- | --- |
| `codec.writtenFrom(input, documentId)` | envelope, document, identity; the Message unread | **strict**: also reads the Message through `messageOf(written, 'sent')` and discards it, and refuses a reserved or over-long replica id (§4.2). What it returns is still as written. |
| `codec.normalizeOperation(input)`, `codec.operationFrom(input, documentId)` | upcast, durable check | **strict**, the same check |
| `journalContract().operation.decode` | `normalizeOperation` | **lenient**: a new internal `readStored`, which upcasts and accepts `durable` and `serverOnly` alike. Not on `codec`. |
| `journalContract().operation.compared` | normalizes at the written version | unchanged; it reads no tag |
| `codec.committedFrom` and the replica's exchange (`decodeCommittedOperation`) | upcast, durable check | **lenient** |
| the replica's outbox (`openReplica`, `optimistic`) | `operationFrom` | **lenient** (`readStored` and the document check) |
| `replica.submit` | durable check | unchanged, and so refuses a server-only Message: the sets are disjoint |

`messageOf` (`sync.ts:556-574`; the durable check is line 572) is where the
Message is upcast and then checked, so it takes which kind of read it is:
`'sent'` refuses a server-only Message with a typed `ServerOnlyMessageError`
(`opId`), `'history'` accepts one. Nothing public reads a sent entry
without the check: `codec` has three readers of one and all three are
strict.

Which function each path calls:

- **A client's pending entry, in `journalExchange`**: `codec.writtenFrom`
  (strict) and `codec.normalizeOperation` (strict), before `admit` and
  before `journal.append`, so before `validate` and `authorize`. Inside
  `append`, Durable then calls `operation.decode`, the lenient reader, on an
  entry Sync already judged.
- **The server's own append** (`appendAsServer`, a reaction, `editsJournal`'s
  `absorbed`): `journalContract().operation.encode`, then `journal.append`,
  so only `compared` and the lenient `decode` read it.
- **A stored row** (`materialize`, `read`, a repeat of a committed id):
  `operation.decode`, lenient.
- **A committed operation at the replica**: lenient.

A hand-made contract that uses `codec.normalizeOperation` as its journal's
`decode` (`examples/sync/test/lww.test.ts:65`) would refuse its own stored
server-only rows, loudly, with a `JournalError`, the first time it declares
`serverOnly`; it takes `journalContract().operation.decode` instead.

**Whether invariant 8 holds.** As worded ("the journal refuses one by tag
before `validate` and `authorize` run"), it holds for `journalExchange` and
for any server that reads a sent entry with any `codec` reader before it
appends. It does not hold for `foldkit-durable`'s `append` given raw client
input that no Sync reader saw: Durable knows no tag (option C). So the
invariant is reworded in the plan to "Sync refuses one by tag wherever it
reads a sent entry". **That is a weakening of the plan, decided here and
recorded there**: the guarantee no longer covers a server that bypasses
Sync's readers. The README's exchange section says a custom server reads an
entry with `codec.writtenFrom` before it appends, as it must already scan
versions.

**For the build:** `journalExchange`'s `operationOf` turns every error but
`UnreadableMessageError` into "not an operation this server accepts"
(`sync/src/journal.ts:192-196`, `:270-271`), which is `Invalid`. It needs a
third outcome: `ServerOnlyMessageError` kept apart in the `catch`, and
mapped to `forbid` in the loop. Without it the check works and answers the
wrong refusal.

An old entry is judged by what it becomes: a version-1 entry whose step
yields a server-only variant is refused; an old server-only variant a step
turns into a durable one is accepted, because the current Message is
durable.

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
(`sync.ts:368`), so the type error costs nothing new.

**One overlap rule: a Message in both is an error.** `make` knows both sets,
so it is a type error (`ServerOnly extends Exclude<Message, Durable>`, §4)
and a throw when the contract is defined, for sets the types cannot tell
apart. `Sync.define` has only two predicates, which cannot be compared when
defined, so a Message both accept is refused where it is read, sent or
stored, with a typed error; it is never quietly treated as either.

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
document and name. Only Durable has the `SqlClient`.

One cursor per reaction, not per document, so a mailer that is down does
not stop the others.

**Where a new reaction starts.** Starting at the journal's cursor on the
first *run* loses triggers: on a Durable Object the first webhook after a
deploy commits at N, `react` then starts, puts the cursor at N, and the
receipt is never sent. So the start is written once, when the reaction is
*registered* (`INSERT OR IGNORE`), and `serverJournal` registers before it
answers and before the host serves an exchange (§4.3). A reaction sees every
commit made after it was registered; deploying a mailer does not mail three
years of history.

**After a reset.** `reset` deletes none of this design's rows; each is
tagged with the journal's epoch and read by it. A cursor row of another
epoch reads as 0, and a write naming another epoch is ignored, so after
`reset` every reaction starts at the new history's beginning with no window
in which a row is missing, and a runner still holding the old epoch's
cursor cannot write it over the new one. A parked row of another epoch reads
as stale (§3.6). The ledger's `finished` record names its epoch and its
`answer` record does not (§4.3).

### 3.4 At least once, or effectively once

SQLite (or D1) and an external provider share no transaction. A run is a
call to the provider and then a write to the ledger; a crash or a timeout
between them leaves a call that may have happened and a ledger that does not
say so. **So an external call runs at least once, and may run twice. This
design cannot make it exactly once, and no design over these two stores
can.**

What it can do, narrowly:

- **The key is deterministic** (invariant 9: document, reaction and `opId`)
  and the handler is given it, to pass to the provider as its idempotency
  key. Whether a repeat is then a no-op is the provider's guarantee, not
  ours. The README says "at least once" and never "exactly once".
- **An append is once.** A Message a reaction appends has an operation id
  derived from the reaction and its trigger's place in the order, and the
  journal answers a repeat of an id from history. That is one store, so it
  holds.
- **At most once** (hold a run whose outcome is uncertain until a person
  resolves it) is what Durable's `onUnresolved: 'skip'` offers. Rejected as
  the default: most providers handle a repeat by key. A run that keeps
  failing is parked instead (§3.6).

### 3.5 Registering a handler, or declaring a reaction

The plan's sketch is `journal.react(set, handler)`. A handler registered by
call has no name to key by, and what it may append is known only by running
it. **Chosen: a declared value**, `reaction(sync, { name, on, appends, run })`,
given to the journal in a list. `on` and `appends` are `MessageSet`s of the
contract's own application, the typed reference `durable` already takes
(#251), so a tool reads which Messages cause which (plan invariant 3), and
a cycle among reactions is refused when the journal is made. Reactions are
for a contract from `forApplication(App).make`, which has the sets;
`Sync.define` gets `serverOnly` and no reactions.

### 3.6 What happens to a run that can never succeed

Order is the promise, so a run that fails stops its reaction there. Left at
that, one operation stops a reaction for the whole document and, through
`settledThrough`, compaction: and a client can make one on purpose, with a
field the server's own append fails `validate` on.

**A. Block until a deploy.** Rejected for that reason.

**B. Skip silently after some attempts.** Rejected: a reaction that did not
happen and nothing says so.

**C. Chosen: park it.** A run that fails for a reason no retry changes, or
that has failed `attempts` times (*Sketch*: 8) *and* for longer than
`parkAfter` (*Sketch*: one hour), is moved to a stored list with its trigger
as written and its error, the reaction's cursor moves past it, and
`ReactionParked` is reported. A person reads the list (`parked`), runs one
again out of order (`retry`) or gives it up (`dismiss`). The promise
becomes: in journal order, except a parked run, which is set aside loudly.
A parked run holds no cursor, so it does not stop compaction; it keeps its
own copy of the trigger so `retry` works after the log is compacted.

What parks at once, because the same call fails the same way: the server's
append refused by `validate` or `authorize`; an answer with a Message
outside `appends` or more than 16 of them; an answer that will not encode.
Everything else is retried with a backoff. **An outage must not park.**
Eight attempts under a backoff capped at 30 s are about a minute and a
half, so a provider down for five minutes would park every trigger and
leave each to a person. Hence both bounds: the count, and the time since
the run first failed, so a run parks only after failing for an hour. The
journal itself failing (`JournalError`: D1 unreachable) counts toward
neither and never parks; the store being down is not the run's fault.

**Park, then advance.** D1 has no transaction, so the order is fixed: the
parked row is written first (`INSERT OR IGNORE` on `(key, name, op_id)`),
then the cursor is advanced. A crash between the two runs the operation
once more; it fails the same way or reaches the same bounds, the insert is
ignored, and the cursor moves. The other order could advance past a run
recorded nowhere.

**A parked row names its epoch.** After a `reset` its sequence belongs to a
history that is gone. Run again, it would append under
`server/r/<reaction>/<index>:<sequence>`, the id of whatever the new history
commits at that sequence: an `IdentityConflictError` if the bytes differ,
and a false "already committed" if they are equal. So `parked` shows a row
of another epoch as `stale`, `retry` refuses it, and `dismiss` removes it.
Nothing is lost by that: if its operation is sent again it commits in the
new history and its reaction runs there in order, reusing the recorded
answer.

## 4. The chosen shape

The code below compiled in a temporary `*.test-d.ts` under
`examples/kitchen-sink` (`pnpm exec tsc -b examples/kitchen-sink`, clean;
with its seven `@ts-expect-error` lines removed the build failed with one
error at each, so the file is checked and each directive is used; it is
deleted). The names under "Proposed" are declared, not built: `make` stands
for `forApplication(App).make` with `serverOnly` added and its other options
elided, and `ServerSync` for `DefinedSync` with one more type parameter.
`'Mailer'` stands for a service the handler needs.

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

/** `DefinedSync` with the Messages only the server appends. Replicas replay them. */
interface ServerSync<AppModel, Message, Shared, Durable, ServerOnly> extends Sync<
  Message,
  Shared,
  Durable
> {
  /** Whether a Message is one only the server appends. */
  readonly serverOnly: (message: Message) => message is Message & ServerOnly
  /** The application the contract was made for, which a reaction's sets must share. */
  readonly application?: AppModel
}

/** `forApplication(App).make`, with `serverOnly` beside `durable` (its other options elided). */
declare const make: <
  AppModel,
  Message,
  Fields extends Schema.Struct.Fields,
  Durable extends Message,
  ServerOnly extends Exclude<Message, Durable>,
>(options: {
  readonly documentId: DocumentId
  readonly shared: WritableProjection<AppModel, Fields>
  /** What a replica may submit. */
  readonly durable: MessageSet<AppModel, Message, Durable, any>
  /** What only the server appends. A Message in both sets is refused, here and when defined. */
  readonly serverOnly: MessageSet<AppModel, Message, ServerOnly, any>
}) => ServerSync<AppModel, Message, Schema.Struct.Type<Fields>, Durable, ServerOnly>

/** A committed operation, as a reaction is given it. */
interface Trigger<Message> {
  /** The Message at the current version, as every hook sees it. */
  readonly message: Message
  readonly opId: string
  readonly sequence: number
  /** Who committed it: a person's actor, or the server's. */
  readonly actorId: string
  /** 64 hex characters naming this run, the same on every retry: a provider's idempotency key. */
  readonly key: string
}

/** One declared reaction of one document: what it runs on, what it may append, what its handler needs. */
interface Reaction<Document, out R> {
  readonly sync: Document
  readonly name: string
  readonly on: ReadonlySet<string>
  readonly appends: ReadonlySet<string>
  readonly requires?: R
}

declare const reaction: <
  AppModel,
  Message,
  Shared,
  Durable extends Message,
  ServerOnly extends Message,
  On extends Durable | ServerOnly,
  Appends extends ServerOnly = never,
  R = never,
>(
  sync: ServerSync<AppModel, Message, Shared, Durable, ServerOnly>,
  options: {
    /** Part of every run's key, so renaming it is a new reaction. Unique in the document. */
    readonly name: string
    /** The committed Messages it runs after: a set of the contract's own application. */
    readonly on: MessageSet<AppModel, Message, On, any>
    /** The server-only Messages it may append, checked on every answer. */
    readonly appends?: MessageSet<AppModel, Message, Appends, any>
    /** How long one run may take before it counts as failed. */
    readonly timeout?: Duration.Input
    /** A failing run is parked once it has failed this many times, and for at least `parkAfter`. */
    readonly attempts?: number
    /** How long a run must have been failing before it may be parked, so an outage parks nothing. */
    readonly parkAfter?: Duration.Input
    /** One external call, or none, and the Messages to append. It may run again. */
    readonly run: (
      trigger: Trigger<On>,
    ) => Effect.Effect<ReadonlyArray<NoInfer<Appends>> | void, unknown, R>
  },
) => Reaction<ServerSync<AppModel, Message, Shared, Durable, ServerOnly>, R>

type Requires<Reactions extends ReadonlyArray<Reaction<any, any>>> =
  Reactions[number] extends Reaction<any, infer R> ? R : never

/** `appendAsServer` was given a key already used for another Message. Nothing was appended. */
declare class ServerKeyReusedError {
  readonly _tag: 'SyncServerKeyReusedError'
  readonly key: string
}

/** A run set aside: it failed for good, or too often. Its reaction went on without it. */
interface Parked {
  readonly reaction: string
  readonly opId: string
  readonly sequence: number
  readonly error: string
  /** Parked in a history since reset: it can be dismissed, not run again. */
  readonly stale: boolean
}

interface ServerJournal<ServerOnly, R> {
  /**
   * Appends a server-only Message as the server. `key` names the fact: a
   * repeat with the same key and Message is answered from history, and one
   * with another Message fails.
   */
  readonly appendAsServer: (
    message: ServerOnly,
    options: { readonly key: string },
  ) => Effect.Effect<AppendResult<Operation>, AppendError | ServerKeyReusedError>
  /**
   * Runs every reaction from its stored cursor, a page at a time. Never
   * fails: a failed run is reported, and the answer is how long to wait
   * before running again; none when every reaction has caught up.
   */
  readonly react: Effect.Effect<Option.Option<Duration.Duration>, never, R>
  /** The lowest cursor of the declared reactions: compact no further than this. */
  readonly settledThrough: Effect.Effect<Cursor, JournalError>
  /** The runs set aside, for a person to look at. */
  readonly parked: Effect.Effect<ReadonlyArray<Parked>, JournalError>
  /** Runs a parked run again, out of order; it leaves the list when it succeeds. A stale one is refused. */
  readonly retry: (parked: Parked) => Effect.Effect<void, unknown, R>
  /** Forgets a parked run: its reaction never happens. */
  readonly dismiss: (parked: Parked) => Effect.Effect<void, JournalError>
}

/**
 * Registers each reaction's cursor before it answers, so make it before the
 * journal is served: a reaction sees every commit made after this.
 */
declare const serverJournal: <
  AppModel,
  Message,
  Shared,
  Durable,
  ServerOnly,
  Principal,
  const Reactions extends ReadonlyArray<
    Reaction<ServerSync<AppModel, Message, Shared, Durable, ServerOnly>, any>
  > = [],
>(options: {
  readonly sync: ServerSync<AppModel, Message, Shared, Durable, ServerOnly>
  readonly journal: Journal<Operation, Shared, Principal, WrittenOperation>
  /** Who the server commits as. Never resolved from a request. */
  readonly server: Principal
  readonly reactions?: Reactions
  /** The most runs one `react` starts; a host with a time limit sets it low. */
  readonly runsPerPass?: number
  readonly diagnostics?: ReportDiagnostic
}) => Effect.Effect<ServerJournal<ServerOnly, Requires<Reactions>>, JournalError>

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

make({
  documentId: DocumentId.make('overlapping'),
  shared: Projection.pick(App.model.orders),
  durable: Placed,
  // @ts-expect-error a Message a replica may submit cannot also be server-only
  serverOnly: MessageSet.union(Placed, Confirmed),
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

const serving = Effect.gen(function* () {
  // Made once, before the journal takes its first exchange.
  const server = yield* serverJournal({
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

  // The handler's services are the run's.
  const run: Effect.Effect<Option.Option<Duration.Duration>, never, 'Mailer'> = server.react

  // @ts-expect-error what a replica may submit is not the server's to append as itself
  void server.appendAsServer(Message.PlacedOrder({ id: 'o2', cents: 1 }), { key: 'k' })

  return { confirmed, run, parked: server.parked }
})
void serving

// Another document of the same application.
const Drafts = make({
  documentId: DocumentId.make('drafts'),
  shared: Projection.pick(App.model.draft),
  durable: MessageSet.make(App, [Message.TypedDraft]),
  serverOnly: Receipted,
})
declare const draftsJournal: Journal<
  Operation,
  { readonly draft: string },
  Principal,
  WrittenOperation
>
void serverJournal({
  sync: Drafts,
  journal: draftsJournal,
  server: { actorId: 'drafts-server' },
  // @ts-expect-error a reaction declared for another document
  reactions: [receipt],
})

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

`Reaction` carries its contract, so one declared for another document is a
type error; two documents with the same types are told apart when the
journal is made, by the contract's identity, as `make` tells two
applications apart by `owner`. `on` and `appends` are typed by the
contract's application and checked by `owner` the same way.

### 4.1 Server-only Messages

- `forApplication(App).make` takes `serverOnly`, a `MessageSet` of the same
  application. `Sync.define` takes `serverOnly?: (message) => boolean`
  beside `durable`. A Message in both is an error (§3.2).
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
  tick, `absorbed/<through>`. It is a non-empty string of at most 200
  characters (*Sketch*), refused past that where it is taken.
- **The envelope.** `replicaId` is `server/k/<sha256 of key, hex>`,
  `localSequence` 1, so `opId` is `server/k/<hash>:1`, the identity Sync
  checks (`sync.ts:537-543`). The hash keeps any string a key may hold out
  of the id. `baseCursor` is 0, which means "written against no replica
  state": a server has no local copy it edited. Sync itself never reads
  `baseCursor` after writing it (`sync.ts:61`, `:861`); an application
  `validate` that compares it with the journal's cursor, as the examples do,
  passes 0. Because it is fixed, the bytes do not depend on when the
  operation is appended.
- **A repeat.** The first call records the written operation in the effect
  ledger, then appends it. A later call with the same key reads the record,
  upcasts its Message to the current version with the lenient reader, and
  compares it with the Message it was given, encoded: equal, it appends the
  recorded bytes, which the journal answers from history; different, it
  fails with `ServerKeyReusedError` and appends nothing. So a key used for
  two facts is an error the caller sees, and a webhook redelivered after a
  migration step was added is still the same operation: the journal compares
  a repeat by the bytes written (upcasting note §4), which include
  `messageVersion`, and those are the recorded ones. Two first calls racing
  with different Messages on two isolates can both record; the journal's own
  comparison then fails the second with `IdentityConflictError`.
- **The `server/` namespace is reserved**, and split: `server/k/` for an
  application's keys, `server/r/` for reactions' appends (§4.3), so no key
  an application chooses can take a reaction's slot. Durable binds a replica
  id to the first actor that commits from it
  (`durable/src/journal.ts:144-151`), so without the reservation a client
  could claim an id first and have the server's own append refused. Every
  strict reader refuses a sent entry whose replica id begins `server/`.
- **The server's actor never changes.** Durable binds every `server/`
  replica id to the actor that first committed from it, so a deployment
  that changes the configured server principal's `actorId` has every later
  server append refused (`OperationRejectedError`), reactions' included,
  which then park. It is part of the document's stored identity, like the
  document id; the README says so where `server` is documented. The
  refusal cannot be told from an `authorize` refusal by its type
  (refusals note §2, source 4), so nothing here detects the mistake
  earlier. §10's plan to bind nothing for `server/` ids would remove the
  constraint.
- **A sent replica id is bounded.** `ReplicaId` is any non-empty string
  today (`packages/sync/src/ids.ts:8`). The strict readers refuse one longer
  than 128 characters (*Sketch*), as `Invalid`; the lenient ones do not, so
  a stored row with a longer one still reads. `openReplica` mints a UUID, so
  only a hand-given id is affected.
- It takes server-only Messages only. An agent appending a durable Message
  for a person (the sync and todo-app examples) is that person's operation
  under their principal, and stays out (§10).

### 4.3 Reactions

**Registering.** `serverJournal` is an Effect. Before it answers it
registers each declared reaction with the journal: one `INSERT OR IGNORE` of
a cursor row at the journal's current epoch and cursor. The host makes it
before it serves the journal's first exchange and before any
`appendAsServer`; `defineDocumentHost` does so between opening the journal
and accepting the first socket. `react` on a reaction with no row of any
epoch is a defect, not a start at the head.

**A pass.** `react` is one pass, for each declared reaction whose backoff
has elapsed: read the next page of committed operations after its cursor
(`journal.read` with a limit, *Sketch*: 100; `read` has none by default,
`durable/src/journal.ts:875-880`), and for each whose current Message is in
`on`, in order:

1. **The handler's answer**, under the ledger key `[react, documentId,
   reaction, opId, answer]`: `runEffect` runs the handler with `timeout`
   (*Sketch*: default 10 s) and records what it returned: the Message
   version and each Message encoded. The handler is wrapped so a defect or
   an interruption is a failure `runEffect` records (its `tapError` sees
   neither, `durable/src/journal.ts:1514-1517`). Each returned Message is
   checked against `appends` and the count against 16 here, at run time,
   whatever the types said, since the cycle refusal and the bound rest on
   it.
2. **The appends**, under `[react, documentId, reaction, opId, finished,
   epoch]`: the run reads step 1's answer (a recorded success is reused, so
   the handler does not run again) and appends each Message as the server.
   The epoch is in this key and not in the answer's. The ledger outlives
   `reset` (`durable/src/journal.ts:1429-1431`) and `runEffect` returns a
   recorded success without running (`:1494-1498`), so a `finished` record
   without the epoch would make the pass skip the appends for an operation
   sent again after a reset, and move the cursor past it. With it, the new
   history has no `finished` record, the appends run, and the answer, which
   has no epoch, is still found, so the external call is not made again.
3. The cursor is stored after each page, with the epoch it was read in.

Two keys, because `recover` moves past any intent whose record succeeded
(`durable/src/journal.ts:1542`): with one key, a crash between the handler's
record and the appends would skip the appends for good. For that reason,
and for paging, parking and the stored backoff, the runner calls `read`,
`runEffect` and `append` itself; `recover` is not changed and not used.

**The envelope of a reaction's append.** `replicaId` is
`server/r/<reaction>/<index>`, `localSequence` the trigger's sequence in the
journal, `baseCursor` that sequence too. Nothing a client chose is in it,
so no client can make it too long or collide with it; replica ids are as
many as reactions times 16, not one per append; and the answer is recorded
as Messages, not envelopes, so after a `reset` the same answer is appended
under the trigger's new sequence.

**Ledger keys are structured.** The ledger is one table for every document
(`durable/src/journal.ts:1429-1431`) and a document id may hold any character, so
a key is the canonical JSON of an array, never strings joined by a
separator. `Trigger.key`, the provider's idempotency key, is the SHA-256 of
`[react, documentId, reaction, opId]` in hex: 64 characters, whatever the
ids hold.

What a reaction is not, by construction. The handler is given the committed
Message and its commit, never the snapshot, which by the time it runs is no
longer the one the operation committed against. It returns Messages; it has
no handle to wait on, no state between runs but the ledger's record of its
answer, and no way to schedule. A reaction may run on a server-only Message,
which is how a webhook's fact becomes a receipt; `appends` makes the graph
of which reaction feeds which, and a cycle in it (a reaction appending what
it runs on, directly or through another) throws from `serverJournal`.

A reaction's append commits where the journal is by then, after whatever
committed meanwhile, not beside its trigger.

`react` is safe to call at any time and from anywhere; where it is called
is the host's (§7). `runsPerPass` bounds the runs one pass starts.
`settledThrough` is the lowest cursor among the declared reactions; whoever
compacts, `editsJournal`'s `absorb` included, compacts no further.

### 4.4 What `foldkit-durable` gains

Schema version 7, two tables. The names are prefixed because `CREATE TABLE
IF NOT EXISTS` would quietly adopt an application's own `cursors` table in a
shared database; Durable's older tables are not prefixed, which this does
not fix.

- `foldkit_durable_cursors` (`key`, `name`, `epoch`, `cursor`, `attempts`,
  `first_failed_at`, `failed_at`; primary key `(key, name)`).
- `foldkit_durable_parked` (`key`, `name`, `op_id`, `epoch`, `sequence`,
  `input`, `error`; primary key `(key, name, op_id)`).

And, as a *Sketch* of the methods (their names are the build's to settle):

- `track(key, name)`: the `INSERT OR IGNORE` at the current epoch and
  cursor; a row of an older epoch is replaced at 0.
- `settled(key, name)`: the cursor, 0 for a row of another epoch, none for
  no row.
- `advance(key, name, epoch, cursor)`: a monotone write
  (`MAX(cursor, excluded.cursor)`) that does nothing for another epoch, and
  clears `attempts`.
- `stalled(key, name, epoch, at)`: counts a failed run, when it first
  failed and when it last did, for the backoff and the two parking bounds,
  so all survive a restart.
- `park` (insert-or-ignore, with the epoch), `parked` (each row with its
  epoch, so a caller can tell a stale one), `unpark`.

Nothing else: the ledger, `runEffect`, `read` and `append` are used as they
are, and `recover` is untouched.

## 5. Failure semantics

**A forged server-only Message.** `journalExchange` rejects it by its id
with `SyncRefusal.Forbidden({ reason: 'Only the server makes this change' })`
(the last lines of the code above) and reports a `ServerOnlySubmitted`
diagnostic (`documentId`, `opId`, the actor; never the payload). `Forbidden`
because the meaning is "who sent it may not", and because it is what the
registry's rule already answers, so its page does not change. A new case
was rejected: it would add a variant to a union applications match in full,
for a refusal no honest client can cause. An entry under `server/`, or with
a replica id past the bound, is `Invalid`, "Not an operation this server
accepts", as a malformed envelope is. None fails the exchange; the edits
beside it go.

**`appendAsServer` with a key already used for another Message** fails with
`ServerKeyReusedError` and appends nothing (§4.2). The caller is told; the
first fact stands.

**A reaction that fails, throws or times out.** The run is recorded as
failed, that reaction stops at that operation, and the others go on.
`react` never fails, so no exchange fails for a reaction; it reports
`ReactionFailed` (`documentId`, `reaction`, `opId`, `sequence`, the cause's
words cut to 500 characters) and answers how long to wait: a backoff per
reaction from 0.5 s doubling to 30 s, computed from the stored `attempts`
and `failed_at`, so it holds across a restart and on a host with no memory
between requests. Once it has failed `attempts` times and for `parkAfter`
the run is parked (§3.6), reported as `ReactionParked`, and the reaction
goes on. A pass that fails because the journal did (`JournalError`) is
reported and retried, and counts toward neither.

**A run that cannot succeed** (the server's append refused by `validate` or
`authorize`, an answer outside `appends` or past 16 Messages, an answer
that will not encode) parks at once. For a refused append the handler's
answer is already recorded, so `retry` after a deploy that changes the rule
makes no second external call. A reaction is not exempt from the document's
rules, and one operation cannot stop its reaction or the log's compaction.

**A crash between the external call and the ledger write.** The answer's
row reads `pending`; the next pass runs the handler again with the same
key. This is the "at least once" of §3.4. A crash after the answer is
recorded and before the appends, or before the cursor write, repeats no
call: the `finished` run reads the recorded answer, appends it (a repeat of
an id where it already committed) and the cursor moves.

**A timeout** is the same uncertainty without a crash: the call may have
landed. It is retried with the same key.

**A reaction appending a Message its own history cannot read.**

- The handler returns a value the current Schema will not encode: a type
  error where it is written; at run time it parks before anything is
  recorded, so `retry` under a fixed build runs the handler again.
- The answer was recorded at version N and a deploy to N+1 lands before it
  is appended: it is appended written at N, and the journal upcasts it. If
  no step reads it, the append fails with `UnreadableMessageError` and the
  run parks with the external call already made; a build with a step that
  reads version N, then `retry`, recovers it. Nothing is dropped.
- A rollback meets an answer recorded at a newer version:
  `UnsupportedMessageVersionError`. That is not parked at once: rolling
  forward fixes it, so it is retried and parks only at both bounds.
- Once committed it is a row like any other: unreadable later, it is the
  upcasting note's `UnreadableHistoryError`.

**A trigger that will not read.** A stored row the pass cannot decode fails
the page's read, as it fails an exchange from before that row. No operation
can be named, so nothing is parked: the reaction is reported failed on
every pass, with its backoff, until a build reads the row. It holds
`settledThrough` meanwhile; the document's exchanges are failing for the
same row.

**Compaction passes a reaction** (a caller ignored `settledThrough`): the
pass gets `CompactedCursorError`, reports `ReactionSkipped` (`reaction`,
from, to) and resumes at the floor. Loud, and a loss.

**Two runners at once.** In one journal instance `runEffect` shares a run in
flight (`durable/src/journal.ts:1463-1531`). Across instances (two isolates
over one D1) both run the handler: a duplicate with no crash. See §7.

**After `reset`.** Every reaction reads cursor 0 in the new epoch (§3.3). A
replica that sends an operation again commits it again under its old id.
The ledger still holds that run's `answer`, which names no epoch, so no
external call repeats; it holds no `finished` record for the new epoch, so
the appends run, at the trigger's new sequence (§4.3). Parked rows of the
old history read as stale (§3.6).

## 6. Security

- **A client cannot cause a server-only append directly.** The only code
  that appends one is `appendAsServer` and a reaction, both server code
  holding the server's principal. A sent entry carrying one, at any version,
  is refused by every public reader of an entry, before `admit`, `validate`
  and `authorize`; one claiming the server's replica namespace is refused
  too. The check does not depend on how a principal is resolved. The gap is
  a server that appends input no Sync reader saw (§3.1).
- **A client causes one indirectly only through a reaction the server
  declared**, and only by committing a Message it was allowed to commit: a
  reaction's input is a committed operation, which passed `admit`,
  `validate` and `authorize`. Its fields are still what a client wrote. A
  handler that mails `message.email` mails wherever the client said; the
  handler checks what it acts on.
- **A client cannot stop a reaction.** Nothing a client chooses is part of a
  server operation's id or a bounded key; a sent replica id is bounded; and
  an operation whose reaction can never succeed is parked. What it can do
  is fill the parked list with its own operations, one row each, which is
  what the list is for; `admit` is where their rate is limited.
- **Reactions see the same rules.** A reaction's append goes through
  `journal.append` as the server's principal, so `validate` and the
  journal's `authorize`, `GuardSync.authorize` included, judge it. A Guard
  policy says what the server may do like any principal. `admit` does not
  run: it judges a connection, and the server has none.
- **Amplification.** One commit is at most one run per reaction, and a run
  appends at most 16 Messages, checked at run time. A client allowed to
  commit 500 operations causes 500 runs; rate is `admit`'s, as for the
  commits themselves.
- **Names and keys.** A reaction's name is checked when declared
  (`[A-Za-z0-9_-]`, at most 64) and is unique in a document. `key` is a
  bounded string, hashed before it is part of an id, and never an object
  key. Ledger keys are structured, so no id can be read as another's.
  Diagnostics and the parked list's `error` carry ids and words, never a
  Message; `input` in the parked table is the trigger, already in the log.
- **What replicas learn.** A server-only Message is sent to every replica
  of the document, like any operation. A secret does not belong in one
  until item 4.

## 7. Hosts

`react` pulls: it reads the cursor from the store and runs what is after it.
Nothing wakes it across requests, so it does not meet the AGENTS.md trap
"One worker request cannot wake another's stream": whichever request, alarm
or timer runs next reads the same durable cursor. What differs per host is
who calls it, when again, and who hears of what it appended.

- **Node** (`documentHost` over `ws`, or any long-lived process): one fiber
  runs `react` at start, after each notice from `journal.subscribe` for the
  document, and after the delay `react` answers. One journal instance, so
  runs in flight are shared, and a reaction's commit reaches the document's
  sockets through `serveJournal`'s existing notices.
- **A Durable Object** (`foldkit-sync/do`), journal in the object's SQLite
  or in D1: the object is the single writer and the single runner. After an
  exchange that acknowledged something, the host starts `react` without
  holding the reply for it, and sets the object's alarm; `alarm()` runs
  `react` and sets the alarm again from its answer. The alarm is what
  survives the object being evicted mid-run. Whether a commit made in
  `alarm()` reaches the sockets the object holds is being probed (§11).
  *Sketch*: `defineDocumentHost` takes `reactions`, and
  `DocumentHostContext.storage` is typed for `setAlarm`.
- **A stateless Worker over D1** (`journalExchange` behind `fetch`): the
  request that committed calls `ctx.waitUntil(react)`, and a Cron Trigger
  calls `react` for what failed or was cut off. Three things differ here.
  Nothing is kept in memory between requests, which is why the backoff and
  the attempt count are stored. `waitUntil` allows about 30 seconds after
  the response, so the default timeout is 10 s and such a host sets
  `runsPerPass` to 1 or 2; a run cut off reads `pending` and is run again.
  And no other request is told: a reaction's commit reaches another replica
  when that replica next exchanges, never as a notice, since one request
  cannot wake another's stream. Two isolates can also run one reaction at
  once, so a duplicate call needs no crash. Durable's options already say
  to route D1 appends through one writer
  (`durable/src/journal.ts:152-161`); the same holds for reactions.

An application may also put `react` in an exchange's `settle`, so the reply
carries what the reaction appended, at the cost of the reply waiting on the
provider. It never fails the exchange.

## 8. Migration

- **Nothing changes for a document with no `serverOnly`**, with two
  exceptions, both changelog entries under Changed: every reader of a sent
  entry refuses a replica id under `server/` or longer than 128 characters
  (`openReplica({ replicaId })` accepts any string today), and
  `codec.writtenFrom` now reads the Message, so it throws for a local-only
  or undecodable one where it returned the envelope.
- **Moving a variant to `serverOnly`** (the registry's `AbsorbedEdits`):
  deploy the server first. Stored rows read as before. A client build that
  still lists it as durable can submit one and is refused `Forbidden`, as
  its `authorize` rule refuses it today. The hand-written rule and
  `absorbed` envelope go; `editsJournal`'s `absorbed` and `server` options
  are deprecated for one release in favour of a `serverJournal`.
- **Post-commit work has two paths after this, not three.**
  - `settle` stays, for a read model the reply depends on: `editsJournal`'s
    table writes, `settleTodos`. It runs before the reply and may fail the
    exchange, on purpose. `editsJournal` keeps its API and moves its
    in-memory cursor (`sync/src/journal.ts:529`) to the stored one.
  - Reactions are for everything else: an external call, a server-only
    Message.
  - A hand-written `recover` loop for external effects is what reactions
    replace. The sync example's `effects` policy and `settleThrough` move to
    a reaction; `foldkit-durable`'s `recover` itself stays, as the primitive
    for a caller without Sync, and is not deprecated.
- **Pages' `Collect`** is server-only by content, inside a variant clients
  send. It keeps its `authorize` rule, or splits a `CollectedPage` variant
  off and adds a migration step. Not decided here.
- **The examples' `appendAsServer`** (sync, todo-app) is an agent's append
  for a person and keeps its name only by accident; it is renamed when
  those examples are touched, not replaced by this.
- **`foldkit-durable`'s schema moves to 7.** A build before it refuses to
  open a migrated database (`UnsupportedJournalVersionError`), which is the
  rollback case of every earlier bump.
- No wire version moves. A server-only operation is today's envelope.

## 9. Tests

Each with a mutation beside it (`packages/sync/test/serverMessages.mutations.ts`).

- A sent server-only Message is rejected `Forbidden` and the edits beside
  it commit; with `admit` and `authorize` both allowing everything, so only
  the check can refuse.
- `codec.writtenFrom`, `normalizeOperation` and `operationFrom` each refuse
  one, a table of the three; `journalContract().operation.decode` reads it.
- A journal holding a committed server-only row loads, reads and serves it
  to a replica, which replays it.
- A version-1 entry whose step yields a server-only variant is refused; an
  old server-only variant whose step yields a durable one is accepted.
- An entry under `server/`, and one with a 129-character replica id, is
  refused, and the server's later append commits.
- An outbox holding a server-only Message opens, sends, and reports the
  rejection.
- `appendAsServer` twice with one key and Message commits once; with
  another Message it fails `ServerKeyReusedError` and the journal holds the
  first; repeated after a migration step is added it is still once. An
  application key spelled like a reaction's slot does not take it.
- A reaction registered, then a commit, then the first `react`: the handler
  runs. (The lost-trigger case; with the registration removed it goes red.)
- After `reset`, an operation sent again under its old id: the handler is
  not called again, and its answer is appended in the new history. (With
  the epoch dropped from the `finished` key it goes red.)
- A parked run, then `reset`: `parked` shows it stale, `retry` refuses it,
  and the new history's operation at that sequence is untouched.
- A handler failing eight times within a minute is not parked; the same
  with the clock moved past `parkAfter` is. A journal that fails for a
  while parks nothing.
- A crash injected between the parked row and the cursor write: one parked
  row, and the cursor past it after the next pass.
- A server principal whose `actorId` changed has its appends refused.
- A reaction runs once per commit across a restart (a new journal over the
  same file), with the handler counting calls and the cursor read back.
- A crash injected after the handler's answer is recorded and before the
  appends: the next pass appends and makes no second call. Before the
  record: two calls, one key.
- A handler that fails once blocks only its own reaction, is reported, and
  runs again after its backoff, read from the store by a new journal; a
  defect and a timeout the same.
- A run whose append `validate` refuses is parked at once, its reaction
  runs the next operation, `settledThrough` moves, and `retry` under a
  changed rule appends without calling the handler.
- A handler returning a Message outside `appends`, through a cast, parks;
  so does a seventeenth Message.
- Two reactions in a cycle throw when the journal is made; so does a
  reaction of another contract with the same types.
- Two documents whose ids differ only by where a `/` falls keep separate
  ledger records.
- A log longer than a page is read in pages, the cursor stored after each.
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
- **Holding an uncertain run for a person before it has failed**
  (`onUnresolved: 'skip'`).
- **A lease across isolates**, so two stateless Workers do not run one
  reaction at once.
- **Pruning, built.** The plan is named here and not built with these
  items. Three things grow:
  - *Ledger rows*, two per run and one per `appendAsServer` key. A
    `prune(through)` (*Sketch*) deletes the rows of runs at or below both
    the reaction's cursor and the compaction floor. Its cost is stated
    where it is offered: after a later `reset`, an operation sent again
    runs its reaction again, external call included, because the record
    that it ran is gone. An `appendAsServer` record is kept while its key
    may be redelivered, which only the application knows, so it prunes
    those by age.
  - *Replica bindings.* A reaction's appends use a fixed set of replica
    ids (§4.3), so they do not grow. An `appendAsServer` key is one binding
    row each. The plan: the contract's `replicaId` answers none for an
    operation under `server/`, so Durable binds nothing for it. That is
    safe only because no sent entry may claim the namespace, so it waits
    for the strict readers to ship.
  - *The parked list*, one row per parked run until dismissed.
- **An agent's append for a person**, and so the envelope the sync and
  todo-app examples write by hand.
- **Server-only by content** (pages' `Collect`).
- **A check inside `foldkit-durable`'s `append`** for a server that appends
  input no Sync reader saw (§3.1).

## 11. Unknowns

- **Durable Object lifetime.** Whether work started after a reply keeps
  running while the object has an open socket, how `alarm()` retries after a
  throw, and whether a commit made inside `alarm()` reaches the notices of
  sockets the object holds. Being probed now; §7's alarm is the design
  because it does not depend on the first.
- **The reserved prefix.** `server/` is a proposal; whether any deployed
  replica id begins with it, or is longer than 128 characters, is not known.
- **The ledger recording an answer**: whether `runEffect`'s JSON result
  holds every Message encoding in use. It should, since the journal stores
  the same values as JSON; not probed.
- **The comparison in `appendAsServer`**: canonical JSON of two encoded
  Messages, one upcast. A step that is not a function of its input alone
  would make a true repeat read as a reuse; steps must already be pure
  (upcasting note §11). Not probed.
- **The defaults**: a 10 s timeout, 16 Messages, 8 attempts and an hour
  before parking, pages of 100,
  the backoff, a 200-character key, a 128-character replica id.
- **Durable's method names** for the cursor and the parked list (§4.4), and
  whether they are one object rather than seven methods on `Journal`.
- **Whether `react` in `settle` should be a named option** of
  `journalExchange` rather than the application's own composition.
- **Type cost.** `reaction` infers eight parameters; it compiled in the
  kitchen-sink within the run above, and was not measured against invariant
  12's budget.

## 12. What the review changed

Round 1, 2026-11-12, five blocking findings, each checked against the
source first.

1. **`codec.writtenFrom` was an unchecked public reader** whose result
   `journalExchange` appends (`sync.ts:596-600`, `sync/src/journal.ts:190`,
   `:293`). It is strict now, and §3.1 says where invariant 8 holds and
   where it does not.
2. **The strict and the history reader were one function**
   (`sync.ts:638`). §3.1 names the lenient `readStored` and lists which
   function each path calls.
3. **A reaction starting at the cursor on its first run lost the trigger
   that caused the run**, and again after each `reset`. The start is
   written at registration, and the row carries the epoch (§3.3, §4.3).
4. **One operation could stop a reaction and compaction.** Server ids no
   longer hold anything a client chose, a sent replica id is bounded, and a
   run that cannot succeed is parked (§3.6, §4.2, §4.3).
5. **A reused `appendAsServer` key returned the first fact with no
   error**, and application and reaction keys shared a namespace. The
   recorded Message is compared, and the prefixes are apart (§4.2).

Round 2, the same day, one blocking finding.

6. **After a reset a reaction's answer was never appended**: the `finished`
   ledger record had no epoch and the ledger outlives `reset`, so the pass
   skipped the appends and moved on. The epoch is in the `finished` key and
   not in the `answer` key (§4.3).

Round 2's advisory points, each taken: the parked row is written before the
cursor advances, and names its epoch, so a stale one is refused by `retry`
(§3.6); a run parks only after failing for `parkAfter` as well as
`attempts` times, and never for a `JournalError`; the server's actor is
stated as fixed (§4.2); `operationOf`'s missing branch is named (§3.1); and
invariant 8 is reworded in the plan, recorded there as a weakening.

Round 1's advisory points, each taken: `recover` is not used, and the runner keeps two
ledger keys with the handler wrapped (§4.3); `appends` and the bound are
checked at run time; ledger keys are structured; the stateless Worker's
memory, time limit and missing notices are stated (§7); the log is read in
pages; `Reaction` carries its contract, `on` its application, overlapping
sets are a type error under one rule (§3.2, §4); the tables are prefixed
(§4.4); growth has a plan (§10); `baseCursor: 0` is explained (§4.2); and
§8 says which post-commit path stays.

## 13. Decisions made while building

Built in `packages/sync/src/serverJournal.ts` (exported from
`foldkit-sync/journal`), `sync.ts`, `make.ts`, `journal.ts`, `do.ts`,
`diagnostics.ts`, `errors.ts`, and `packages/durable/src/journal.ts`; tested
in `packages/sync/test/serverMessages.test.ts` (with
`serverMessages.test-d.ts` and `serverMessages.mutations.ts`),
`editsJournal.test.ts`, `do.test.ts`, `upcasting.test.ts` (the pinned
exchange reply), Durable's `journal.test.ts` and `d1.test.ts` (with
`cursors.mutations.ts`), and on workerd in
`examples/cloudflare/test/reactions.test.ts` (with
`reactions.mutations.ts`).

**The *Sketch* points.**

- **Durable's methods** are one object, `journal.cursors`, with the seven
  names of §4.4. `track` takes `{ from: 'cursor' | 'floor' }`, `'cursor'` by
  default: `editsJournal`, moving its in-memory cursor to the stored one
  (§8), must start at the floor as it did, or a deployment whose table had
  not caught up would skip edits. `settled` returns the current epoch with
  the cursor, so the caller names it to `advance` and `stalled`. Every
  write is one statement guarded by the epoch it names
  (`AND ${epoch} = (SELECT epoch FROM epochs WHERE key = ?)`), so D1 keeps
  the guarantees with no transaction.
- **`advance` clears the failure count only when the cursor moves.** As
  written ("and clears `attempts`"), a pass that advanced to the cursor it
  already held, before failing again at the next commit, would have reset
  that commit's backoff and its `attempts` every pass.
- **Defaults**: a 10 s timeout, 16 Messages, 8 attempts and an hour before
  parking, pages of 100, a backoff from 0.5 s doubling to 30 s, a key of at
  most 200 characters, a sent replica id of at most 128, as the note
  proposed. `runsPerPass` is unbounded unless given. A pass after the
  journal itself failed answers 5 s, stored nowhere (it counts toward no
  bound). The Durable Object sets its alarm 1 s after a commit, and 30 s
  after a pass that broke.
- **Names**: a reaction's Durable cursor is `react/<name>` (a reaction name
  cannot hold `/`), `editsJournal`'s is `edits`. Ledger keys are the JSON of
  `['react', documentId, reaction, opId, 'answer']`,
  `[..., 'finished', epoch]` and `['server', documentId, key]`;
  `Trigger.key` is the SHA-256 of `['react', documentId, reaction, opId]`.
- **`defineDocumentHost` takes `server: { principal, reactions: env => [...],
  runsPerPass? }`.** `DocumentHostContext.storage` stays `unknown`: typed for
  `setAlarm`, it would stop an `openJournal` that reads the object's SQLite
  (`ctx.storage.sql`) as its own type. The host checks for `getAlarm` and
  `setAlarm` when constructed with `server`, and throws without them. It
  arms the alarm in the exchange's `settle` hook, after the application's
  own, only when the journal's cursor moved since it last looked (an
  in-memory number; a fresh object arms once more, which costs one empty
  pass). It only ever brings the alarm earlier, and `alarm()` never throws:
  a pass that broke is a `HostDefect` (new stage `Alarm`) and the alarm comes
  back in 30 s. The probe's findings hold: the post-reply pass is a fast
  path, the alarm is set before the reply, and `react`'s answer, never the
  runtime's retries, sets the next one.
- **`react` in `settle`** stays the application's own composition; no
  option was added.
- **The host arms the alarm before the application's `settle`**, so a
  `settle` that fails the exchange still leaves what committed to be
  reacted to.
- **The client pays 0.4 kB brotli.** `examples/todo-app`'s bundle grew from
  158,189 to 158,655 bytes, all of it `foldkit-sync` (its readers, the
  `serverOnly` set, two error classes); its ceiling moved to 160,500.

**Other decisions.**

- **The Node host is `follow`**, a member of `ServerJournal` the note's
  sketch lacked: an Effect that runs `react` now, after each commit this
  journal instance publishes, and after the delay `react` answers, until
  interrupted. `documentHost` is unchanged.
- **`serverJournal` takes a contract from `forApplication(App).make`**
  (`DefinedSync`, with its `serverOnly` constructors as a new
  `serverOnlyMessages` member and a seventh type parameter); `Sync.define`
  gets the predicate and the strict readers, not `appendAsServer`.
- **`codec.message`** is new: the current Message Schema, which the runner
  decodes triggers and encodes answers with.
- **Overlap under `Sync.define`** is `AmbiguousMessageError`, thrown by every
  reader, strict or lenient; `submit` refuses such a Message as server-only.
- **A bad key** (empty, or past 200 characters) is an
  `InvalidOperationError`, already in `AppendError`, rather than a new error.
  A Message that is not server-only is refused the same way at run time.
- **`ServerOnlySubmitted` names the replica id the entry claims, not the
  actor.** `journalExchange` holds a generic principal with no actor
  function, and logging the whole principal could log a credential.
- **Which failures park at once**: an answer that is not a list, holds more
  than 16 Messages, a Message `appends` does not name, or one that will not
  encode; an append the journal refuses (`OperationRejectedError`,
  `IdentityConflictError`, an `InvalidOperationError` from `validate` or one
  whose cause is `UnreadableMessageError`). An `InvalidOperationError` caused
  by `UnsupportedMessageVersionError` (a rollback) is retried and parks only
  at both bounds, as §5 says. The handler's own failure, defect,
  interruption and timeout are retried.
- **A commit that will not read** (a `JournalError` whose cause is the
  codec's `UnreadableMessageError`, `UnsupportedMessageVersionError` or
  `AmbiguousMessageError`) is counted with `stalled` and reported, so its
  backoff holds, but never parks, since no operation can be named. Any other
  `JournalError` counts toward nothing.
- **The stored failures belong to the commit after the cursor.** Once a pass
  moves past it, a failure further on starts its own count.
- **`retry` reads the row again from the store**, not the value it is given:
  a row already resolved is nothing to do, a stale one is
  `StaleParkedRunError` (new), and a run of a reaction no longer declared
  fails. A failed retry leaves the row as it was.
- **A parked row's `input`** is `{ operation, actorId }`, the operation
  written at the current version, read back with the lenient reader.
- **`Sync.mount`** sends a server-only Message the application dispatches to
  `submit`, which refuses it, as it would a durable Message it could not
  store: it appears and then the persistence failure is reported.
- **Migrations done**: the registry (`AbsorbedEdits` server-only, the
  `authorize` rule and envelope gone, `editsJournal`'s new `asServer`),
  `examples/sync/test/lww.test.ts` (decodes with
  `journalContract().operation.decode`), and the specs the change moved.

**Where the note was wrong against the source.**

- **§4.2, the server's actor.** "A deployment that changes the configured
  server principal's `actorId` has every later server append refused": only
  reactions' appends (their replica ids are fixed) and a repeated
  `appendAsServer` key (`IdentityConflictError`, the operation is the first
  actor's) are. A new key is a new replica id, which the journal binds to
  the new actor, and commits. The constraint still stands; the README says
  what happens.
- **§3.6, `INSERT OR IGNORE` on the parked row.** After a `reset`, a run of
  the same `opId` parked again in the new history was ignored beside the
  stale row, and the cursor then moved past a run recorded nowhere: the
  failure the paragraph sets out to prevent. A row of another epoch is
  replaced; one of the same epoch is kept.
- **§8, the sync example.** "The sync example's `effects` policy and
  `settleThrough` move to a reaction": that example serves any document id
  a principal names under one contract whose `documentId` is fixed, while a
  reaction is declared for a contract and runs over its one document. It was
  not migrated; doing so is redesigning the example.
- **§9, "eight times within a minute".** Under the backoff of §5 eight
  failures take about 61.5 s; the test runs each pass when the previous
  one's answer says, and parks only past `parkAfter`.

**Not built here.** The example of the plan's "done when" (a webhook's
payment confirmation, a notice once per commit across a restart, in an
example) is covered by `serverMessages.test.ts`, not by an example;
`examples/cloudflare`'s `settleTodos` still keeps its cursor in
`durable_meta` (it could use `journal.cursors`); pages' `Collect`, the
examples' agent `appendAsServer` and pruning stay out, as §8 and §10 say.

