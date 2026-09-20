# Foldkit Plus: Reusing Effect Infrastructure in Sync and Durable

**Status:** design review / upstream integration plan  
**Date:** September 2026  
**Target packages:** \`foldkit-sync\`, \`foldkit-durable\`  
**Effect areas reviewed:** \`effect/unstable/eventlog\`, \`effect/unstable/persistence\`, \`effect/unstable/rpc\`, \`effect/unstable/socket\`, \`effect/unstable/workflow\`, Effect SQL

## 1. Executive decision

\`foldkit-sync\` and \`foldkit-durable\` should remain Foldkit-owned semantic abstractions.

Do **not** replace either package wholesale with Effect's \`EventLog\` / \`EventJournal\`.

The overlap is real, but the protocols are not equivalent.

Effect EventLog is approximately:

~~~text
replicated event journal
  + client-generated entry identities
  + primary-key conflict detection
  + event handlers
  + remote replication
  + optional compaction
~~~

Foldkit Durable is approximately:

~~~text
authoritative ordered state machine
  + stable semantic operation identity
  + server-assigned canonical sequence
  + snapshot + cursor
  + explicit authorization/rejection
  + checkpoint/compaction semantics
  + durable external-effect recovery
~~~

Foldkit Sync is approximately:

~~~text
committed authoritative base
  + pending local operations
  + optimistic replay
  + server admission/rejection
  + deterministic rebase
  + checkpoint adoption
~~~

Those differences are substantial enough that using EventLog as the semantic foundation would currently require rebuilding Foldkit's important guarantees on top.

The better strategy is:

> **Keep Foldkit's protocol semantics, but aggressively reuse Effect's lower-level persistence, SQL, RPC, socket, queue, and transaction infrastructure where the semantics line up.**

A small number of upstream Effect PRs could improve that reuse significantly.

---

## 2. Current Foldkit ownership

### 2.1 foldkit-sync

Current Sync owns:

~~~text
Replica
  committed shared value
  committed cursor
  pending local operations
  next local sequence
  optimistic projection

Protocol
  submit
  exchange
  acknowledgement
  rejection
  checkpoint
  reconciliation
  rebase

Persistence
  replica state storage
  compare-and-swap revision protection

Transport
  loopback / promise / WebSocket-style exchange seam

Observation
  status
  statusChanges
  changes
~~~

The defining invariant is:

> **Visible shared state = replay(committed base, pending operations).**

When server state advances:

~~~text
new committed operations/checkpoint
        ↓
replace/advance committed base
        ↓
drop acknowledged/rejected pending
        ↓
replay remaining pending
~~~

This is a server-authoritative optimistic replication protocol, not merely an offline event log.

### 2.2 foldkit-durable

Current Durable owns:

~~~text
DocumentId
OperationId
ActorId
Sequence
Cursor

append / appendAll
authoritative operation ordering
validation / authorization boundary
semantic operation identity
canonical payload comparison
snapshot reduction
cursor advancement
history reads
compaction floor
checkpoint semantics
live changes
durable effect ledger
effect recovery
~~~

The defining transaction is conceptually:

~~~text
current snapshot + cursor
        +
incoming operation
        ↓
validate / authorize
        ↓
reduce
        ↓
one transaction:
  operation identity
  canonical operation payload
  next authoritative sequence
  next snapshot
  next cursor
~~~

This is more specialized than a generic event journal.

---

## 3. What Effect EventLog already provides

The current Effect v4 EventLog stack is substantial.

### 3.1 EventJournal

\`EventJournal\` provides:

~~~text
Entry
  id
  event
  primaryKey
  payload
  timestamp/order

write
writeFromRemote
entries
changes
remote sequence tracking
remote-uncommitted tracking
locking
~~~

Implementations include:

~~~text
memory
IndexedDB
SQL
~~~

### 3.2 EventLog

\`EventLog\` layers typed event schemas and handlers on top of the journal.

Useful features include:

~~~text
typed EventGroup definitions
event handlers
primary-key conflict detection
remote replay
reactivity invalidation
group compaction
RPC-based remote replication
~~~

### 3.3 EventLog server storage

The unencrypted server storage is particularly interesting for Durable.

Its SQL implementation already owns:

~~~text
per-store journals
gap-free server sequence allocation
unique entry identity
transactional write
changes stream
backlog streaming
SQL dialect portability
memory implementation
~~~

The important table shape is approximately:

~~~text
entries:
  store_id
  sequence
  entry_id
  event
  primary_key
  payload

stores:
  store_id
  next_sequence
~~~

This is much closer to \`foldkit-durable\` than the client-side EventJournal is.

---

## 4. Why EventLog does not directly replace Durable

### 4.1 Operation identity semantics differ

Effect EventLog uses an \`EntryId\`, currently UUIDv7-based.

Foldkit has a stronger semantic contract around \`opId\`:

~~~text
client submits opId X
server commits X
response is lost
client retries X
~~~

The correct result is:

~~~text
same opId
same actor
same canonical payload
  => already committed / acknowledgement
~~~

while:

~~~text
same opId
different actor or payload
  => identity conflict
~~~

That is application-level idempotency, not merely duplicate journal insertion.

Effect can provide the physical entry identity.

Foldkit should continue to own the meaning of identity reuse.

### 4.2 Ordering semantics differ

Effect server storage does provide a gap-free per-store sequence.

That is useful and potentially reusable.

However, Foldkit attaches stronger meaning to that sequence:

~~~text
server Sequence N
=
Nth accepted durable operation in canonical document history
~~~

and:

~~~text
snapshot at Cursor N
=
reduce(initial, operations 1 ... N)
~~~

The sequence is therefore part of Foldkit's application protocol.

Even if Effect allocates it, Foldkit must continue to define its semantics.

### 4.3 Snapshot + cursor is first-class in Foldkit

Effect EventLog persists events.

Foldkit Durable persists both:

~~~text
history
+
current reduced state
~~~

with the cursor tying them together.

Durable requires atomicity across:

~~~text
append operation
advance cursor
write reduced snapshot
~~~

Effect EventLog does not currently provide this as a first-class abstraction.

### 4.4 Compaction semantics differ

Effect compaction focuses on producing a smaller semantically equivalent event backlog.

Foldkit compaction means:

~~~text
snapshot/cursor preserved
history before floor may be removed
old replicas may need checkpoint
semantic op identities may still need retention
~~~

The key invariant is not merely "fewer events."

It is:

> **A replica can always recover from either retained history or a checkpoint without changing document semantics.**

Foldkit should own this policy.

### 4.5 Durable external effects are separate by design

Effect EventLog handlers execute as part of handling an event.

Foldkit Durable explicitly separates:

~~~text
authoritative operation commit
        ↓
durable effect intent/status
        ↓
external effect execution
        ↓
success/failure/recovery
~~~

That distinction is important for:

~~~text
email
payments
webhooks
third-party APIs
agent side effects
~~~

because those systems cannot participate in the SQL transaction.

Durable's effect ledger should remain separate from event admission.

---

## 5. Why EventLog does not directly replace Sync

Sync's defining distinction is:

~~~text
committed
vs
pending
~~~

The browser may optimistically apply a Message before the server accepts it.

The server can then independently report:

~~~text
accepted operations
rejected operations
other users' committed operations
checkpoint
~~~

and the client deterministically reconstructs:

~~~text
committed authoritative base
+
still-pending local operations
~~~

Effect EventLog is closer to:

~~~text
write locally
replicate log
merge/replay remote entries
surface conflicts
~~~

That is an excellent abstraction for replicated event logs, but it does not directly model:

~~~text
tentative local operation
  -> authoritative server admission/rejection
  -> rebase
~~~

Using EventLog underneath Sync would still require a Foldkit-owned pending/committed protocol.

Therefore:

> **Keep Sync's replication state machine Foldkit-owned.**

---

## 6. Where Effect is already the correct dependency boundary

Foldkit is already reusing Effect at the right level in several places.

### 6.1 Effect SQL

Durable already uses Effect SQL.

That is a better current dependency boundary than:

~~~text
Durable
  ↓
EventLog
  ↓
SqlEventJournal
  ↓
Effect SQL
~~~

because Durable's schema directly represents Durable's protocol.

### 6.2 Effect concurrency primitives

The current use of:

~~~text
Effect
Stream
PubSub
Deferred
SynchronizedRef
Scope
Layer
Metric
Schema
~~~

is appropriate.

Foldkit should not recreate these runtime concerns.

### 6.3 Effect RPC and Socket

Sync's transport can potentially reuse Effect's generic RPC/socket stack without adopting EventLog's replication semantics.

Relevant primitives already exist:

~~~text
RpcClient.makeProtocolSocket
RpcClient.layerProtocolSocket
RpcServer WebSocket/socket protocols
Socket
Schema-based RPC definitions
transient retry policy
~~~

This deserves a Foldkit prototype before proposing upstream changes.

---

## 7. Upstream PR opportunities

The best upstream contributions are small, generally useful seams that preserve Effect's architecture while unlocking Foldkit reuse.

## 7.1 PR 1 — point lookup in EventLog server Storage

### Problem

\`EventLogServerUnencrypted.Storage\` currently exposes operations such as:

~~~text
entriesAfter
write
changes
withTransaction
~~~

but no direct lookup by entry identity.

The SQL backend already has:

~~~text
UNIQUE (store_id, entry_id)
~~~

and the memory implementation already tracks known entry ids.

Applications that need retry-safe semantic admission have to scan or maintain a second identity index.

### Proposal

Add something approximately like:

~~~ts
readonly getEntry: (
  storeId: StoreId,
  entryId: EntryId,
) => Effect.Effect<RemoteEntry | undefined>
~~~

Exact naming can follow Effect conventions.

### Why it is generally useful

This supports:

~~~text
idempotent API admission
retry-safe writes
deduplication inspection
application-level conflict checks
debugging/admin tooling
replication reconciliation
~~~

without prescribing how applications interpret duplicate identity.

### Foldkit use

Foldkit could do:

~~~ts
storage.withTransaction(
  Effect.gen(function* () {
    const existing =
      yield* storage.getEntry(documentId, entryId)

    if (existing) {
      return yield* checkFoldkitIdentity(existing, incoming)
    }

    const [committed] =
      yield* storage.write(documentId, [entry])

    yield* updateFoldkitSnapshot(
      documentId,
      committed.remoteSequence,
      operation,
    )

    return committed
  }),
)
~~~

Effect owns the physical log and sequence.

Foldkit owns:

~~~text
canonical payload comparison
actor comparison
AlreadyCommitted result
IdentityConflict result
snapshot reduction
~~~

### Scope

This should be small:

~~~text
Storage interface addition
memory implementation
SQL implementation
tests
docs
~~~

No EventLog semantic change is required.

---

## 7.2 PR 2 — public EntryId string codec/helpers

### Problem

Effect exposes EntryId values and entry string representations, but application code benefits from a supported round trip:

~~~text
string
↔
EntryId
~~~

without depending on internal UUID helpers.

### Proposal

Expose one of:

~~~ts
EventJournal.EntryIdFromString
~~~

or:

~~~ts
entryIdFromString(...)
entryIdToString(...)
~~~

Prefer a Schema if that matches current Effect conventions.

### Why it is generally useful

Entry IDs cross:

~~~text
HTTP/RPC boundaries
database records
logs
URLs/admin tooling
idempotency headers
tests
serialized application state
~~~

A public codec makes EntryId a practical application boundary type.

### Foldkit use

Foldkit could define:

~~~text
OpId
  semantic Foldkit brand

representation
  UUIDv7 / Effect EntryId-compatible
~~~

Then:

~~~text
client creates OpId
      ↓
same stable bytes/string
      ↓
Effect EntryId
      ↓
server retry sees same identity
~~~

Foldkit should still keep the \`OpId\` type because its semantic meaning differs from a generic event ID.

---

## 7.3 PR 3 — atomic IndexedDB KeyValueStore.modify

### Problem

Effect's \`KeyValueStore\` API exposes:

~~~ts
modify(key, f)
~~~

but the generic implementation is:

~~~text
get
 ↓
f
 ↓
set
~~~

For \`BrowserKeyValueStore.layerIndexedDb\`, that means multiple IndexedDB transactions.

This is not atomic with respect to competing browser writers.

IndexedDB itself can perform:

~~~text
get
compare/transform
put
~~~

inside one readwrite transaction.

### Proposal

Override \`modify\` and \`modifyUint8Array\` in the IndexedDB-backed KeyValueStore so each modification occurs inside one IndexedDB transaction.

Conceptually:

~~~text
BEGIN IndexedDB readwrite tx
  GET key
  transform current value
  PUT replacement
COMMIT
~~~

### Why it is generally useful

Any application using IndexedDB-backed Effect persistence may assume that a backend-native \`modify\` is a meaningful atomic update.

Useful cases include:

~~~text
counters
leases
revision checks
local ownership
cross-tab coordination
compare/update workflows
optimistic concurrency
~~~

### Foldkit use

Sync currently stores its entire Replica state with a revision:

~~~text
revision
committed
cursor
pending
nextLocalSequence
~~~

and performs compare-and-swap to ensure two tabs do not accidentally use one writer identity.

With an atomic IndexedDB \`modify\`, Sync could potentially replace bespoke IndexedDB plumbing with Effect's storage layer.

A Foldkit adapter would still own the CAS rule:

~~~ts
modify("replica", current => {
  if (current.revision !== expectedRevision) {
    return current
  }

  return nextState
})
~~~

and determine whether the update actually advanced the revision.

### Follow-up

The SQL KeyValueStore currently also inherits generic \`modify\`.

A separate follow-up could consider transactionally atomic SQL modify/update semantics.

Do not combine that into the first IndexedDB PR unless maintainers prefer one cross-backend contract.

---

## 7.4 PR 4 — manual inspection/settlement for PersistedQueue

### Problem

Effect \`PersistedQueue\` describes itself as useful for outbox-style work, but its primary consumption API is worker-oriented:

~~~ts
queue.take(handler)
~~~

with lifecycle:

~~~text
claim
 ↓
handler success -> completed
handler failure -> retry
~~~

A replication/network outbox often needs:

~~~text
inspect pending batch
 ↓
send externally
 ↓
receive authoritative response
 ↓
settle particular ids
~~~

The acknowledgement decision is external and may be partial.

### Proposal

Explore a small manual-settlement surface.

Possible shapes:

~~~ts
queue.pending(...)
queue.complete(id)
~~~

or:

~~~ts
queue.items(...)
queue.settle(id)
~~~

or a scoped claim object with explicit settlement.

Exact API needs Effect maintainer input.

### Why it is generally useful

This supports:

~~~text
transactional outbox patterns
remote replication
batch APIs
email/webhook dispatch
external acknowledgement protocols
offline synchronization
~~~

without forcing users to model external acknowledgement as handler success.

### Foldkit use

Sync's pending operations look superficially like a PersistedQueue.

However, Sync currently persists:

~~~text
committed
cursor
nextLocalSequence
pending
~~~

as one atomic replica state.

Moving \`pending\` into a separate queue could create a two-store atomicity problem.

Therefore:

> **This PR may be broadly useful upstream even if Sync ultimately does not adopt it.**

Prototype first.

---

## 8. Upstream changes that are probably unnecessary

## 8.1 No custom Sync RPC primitive is needed yet

Effect already has generic RPC over sockets/WebSockets.

Before proposing anything upstream, build:

~~~text
Sync.ExchangeRequest
Sync.ExchangeResponse
        ↓
Effect RPC schema
        ↓
RpcClient/RpcServer
        ↓
Socket/WebSocket
~~~

Keep \`Sync.Transport\` as the package-facing abstraction.

If the Effect RPC stack can implement it cleanly, no upstream PR is needed.

## 8.2 No new transaction primitive is needed for Durable

Effect SQL already supports nested transactions using the same transaction connection and savepoints.

This means a future Durable adapter can plausibly do:

~~~ts
storage.withTransaction(
  Effect.gen(function* () {
    const committed = yield* storage.write(...)

    yield* updateSnapshot(...)
    yield* updateCursor(...)

    return committed
  }),
)
~~~

and any nested Effect SQL calls participate in that transaction.

This removes one previously suspected blocker.

## 8.3 No EventLog-level snapshot abstraction should be proposed for Foldkit

Snapshots/checkpoints are highly application/protocol-specific.

Trying to upstream Foldkit's exact snapshot semantics into EventLog would likely overfit Effect to one replication model.

Keep snapshot reduction above the Effect log storage layer.

## 8.4 No Effect-level Foldkit opId semantics

Effect should not know about:

~~~text
actor identity equality
canonical Foldkit Message payload equality
AlreadyCommitted
IdentityConflict
server admission policy
~~~

Those are Foldkit protocol semantics.

---

## 9. Potential future Durable architecture

If PR 1 and PR 2 land and a prototype validates the model, Durable could become substantially thinner.

### Today

~~~text
foldkit-durable
  ├ operation SQL schema
  ├ per-document sequence allocation
  ├ operation lookup/idempotency
  ├ history streaming
  ├ changes PubSub
  ├ transaction plumbing
  ├ snapshots/cursors
  ├ compaction
  └ effect ledger
~~~

### Possible future

~~~text
foldkit-durable
  ├ semantic OpId rules
  ├ canonical payload identity
  ├ actor/authorization checks
  ├ reducer snapshot + cursor
  ├ checkpoint/compaction policy
  └ external-effect ledger

Effect EventLog server Storage
  ├ entry persistence
  ├ per-store authoritative sequence
  ├ entry identity index
  ├ history/backlog reads
  ├ live changes
  ├ memory backend
  ├ SQL backend
  └ transaction plumbing
~~~

The boundary would be:

> **Effect owns durable ordered storage. Foldkit owns what that order means.**

That is a much healthier form of reuse than "Foldkit Durable is an Effect EventLog."

---

## 10. Potential future Sync persistence architecture

If atomic IndexedDB modify is available, Sync can test an Effect-backed Storage adapter.

Current Foldkit interface:

~~~ts
interface Storage {
  load(): Effect<unknown, StorageError>

  save(
    state: unknown,
    expectedRevision: number | null,
  ): Effect<void, StorageError>

  close: Effect<void>
}
~~~

Possible adapter:

~~~text
Sync.Storage
      ↓
Effect BrowserKeyValueStore / Persistence
      ↓
IndexedDB
~~~

while Sync still owns:

~~~text
ReplicaState schema
revision/CAS semantics
pending/committed protocol
rebase
transport
~~~

Acceptance requirement:

> Two browser tabs attempting to use the same persisted Replica writer identity must not both successfully update from the same expected revision.

If that cannot be expressed safely with the Effect storage API, keep the custom IndexedDB adapter.

---

## 11. Potential future Sync transport architecture

Before changing Sync's public API, prototype its transport over Effect RPC.

Conceptually:

~~~text
Sync.ExchangeRequest
  documentId
  replicaId
  cursor
  pending operations

Sync.ExchangeResponse
  committed operations
  acknowledged ids
  rejected ids
  checkpoint?
~~~

becomes a typed RPC:

~~~text
client
  ↓
RpcClient.makeProtocolSocket
  ↓
Socket / WebSocket
  ↓
RpcServer
  ↓
Sync journalContract / Durable
~~~

Benefits could include:

~~~text
Schema transport encoding
retry handling
connection lifecycle
WebSocket framing
server routing
testing infrastructure
observability
~~~

The key constraint:

> Effect RPC may transport Sync's protocol; it must not become the protocol.

---

## 12. Workflow / Activity and Durable effects

Effect Workflow/Activity is also worth understanding, but it does not currently replace Durable's effect ledger.

Effect Activity provides:

~~~text
stable activity name
durable result memoization
retry helpers
idempotency-key helper
workflow replay integration
~~~

It explicitly warns that side effects before suspension can repeat and should be idempotent.

Durable's effect model is narrower and attached directly to committed operations:

~~~text
operation commits
 ↓
effect record pending
 ↓
external effect runs
 ↓
success/failure recorded
 ↓
recovery can inspect/retry unfinished effects
~~~

Potential future relationship:

~~~text
foldkit-durable
  records semantic effect obligation

Effect Workflow/Activity
  may execute complex long-running obligation
~~~

But do not migrate the effect ledger merely to use Workflow.

A future integration should start with one real long-running effect that actually benefits from Workflow semantics.

---

## 13. Recommended upstream sequence

### PR 1 — EventLog server Storage entry lookup

Implement:

~~~text
getEntry(storeId, entryId)
~~~

Then test a local Durable adapter that uses:

~~~text
Effect server Storage
+
Foldkit snapshot table
~~~

inside one transaction.

### PR 2 — EntryId public string codec

Use one stable Foldkit \`OpId\` representation that can round-trip to Effect EntryId.

Then test:

~~~text
lost acknowledgement
retry same opId
lookup same Effect entry
Foldkit semantic equality check
~~~

### PR 3 — atomic IndexedDB KeyValueStore.modify

After upstream support exists, prototype:

~~~text
Sync.Storage
  over BrowserKeyValueStore
~~~

with the existing multi-tab CAS tests.

### PR 4 — PersistedQueue manual settlement

Treat this as a broader Effect contribution.

Only adopt in Sync if a prototype proves that splitting the outbox from Replica state does not weaken atomicity.

---

## 14. Prototype acceptance criteria

## 14.1 Durable-over-Effect-storage prototype

The adapter must preserve all current behavior:

~~~text
same opId + same payload/actor
  => idempotent acknowledgement

same opId + different payload/actor
  => identity conflict

concurrent appends
  => gap-free authoritative sequence

append
  => snapshot + cursor update in same transaction

restart
  => snapshot/history preserved

changes
  => committed operations streamed in sequence order

compaction
  => checkpoint semantics preserved

effect ledger
  => unaffected by storage migration
~~~

If any of these require invasive EventLog workarounds, keep the existing Durable SQL implementation.

## 14.2 Sync-over-Effect-storage prototype

Must preserve:

~~~text
offline submit persists
optimistic replay unchanged
reload reconstructs same state
two tabs cannot share writer revision
server rejection drops operation and rebases
lost acknowledgement retries same operation
checkpoint adoption unchanged
~~~

If atomic revision protection cannot be represented cleanly, keep the bespoke IndexedDB implementation.

## 14.3 Sync-over-Effect-RPC prototype

Must preserve:

~~~text
Transport remains replaceable
exchange semantics unchanged
disconnect/retry does not duplicate semantic operations
browser/node transports remain possible
tests can use in-memory/loopback transport
~~~

---

## 15. What not to upstream

Avoid PRs whose primary purpose is to encode Foldkit-specific semantics into Effect.

Do not propose:

~~~text
Foldkit-style Message reducers inside EventLog
Foldkit Snapshot/Cursor types
ActorId/opId equality semantics
Sync pending/committed state
checkpoint/rebase protocol
Foldkit effect-ledger statuses
Surface integration
~~~

The upstream test is:

> **Would this capability make sense for a non-Foldkit Effect user building another durable/outbox/event-log system?**

If yes, it may belong upstream.

If no, keep it in Foldkit.

---

## 16. Design boundary

The preferred long-term layering is:

~~~text
                 FOLDKIT SEMANTICS

Foldkit Message
      │
      ▼
 foldkit-sync
 ┌──────────────────────────────┐
 │ committed/pending split      │
 │ optimistic replay            │
 │ admission/rejection/rebase   │
 │ checkpoints                  │
 │ Sync protocol                │
 └──────────────┬───────────────┘
                │
                ▼
 foldkit-durable
 ┌──────────────────────────────┐
 │ semantic OpId rules          │
 │ authoritative operation      │
 │ snapshot + cursor            │
 │ validate/authorize           │
 │ compaction/checkpoint policy │
 │ effect recovery ledger       │
 └──────────────┬───────────────┘


                EFFECT INFRASTRUCTURE

     ┌──────────┼───────────────┐
     ▼          ▼               ▼
 EventLog    Persistence       RPC
 server      / KeyValueStore   / Socket
 Storage
     │
     ▼
 Effect SQL

 plus:
 Effect / Stream / PubSub / Scope / Layer / Schema
~~~

Not:

~~~text
foldkit-sync
   ↓
Effect EventLog
   ↓
foldkit-durable
~~~

and not:

~~~text
foldkit-durable
   ↓
Effect EventLog semantics
~~~

The distinction is:

> **Foldkit owns application protocol semantics. Effect should own as much generic durable infrastructure as it can cleanly expose.**

---

## 17. Final recommendation

Do not rewrite Sync or Durable around Effect EventLog today.

Instead:

1. upstream a small point-lookup seam for EventLog server storage;
2. upstream a public EntryId string codec if maintainers agree;
3. make IndexedDB KeyValueStore modification truly atomic;
4. explore manual-settlement PersistedQueue as a broader outbox capability;
5. prototype Sync transport on existing Effect RPC before requesting changes;
6. prototype Durable on Effect server Storage before deleting any current Durable SQL code.

This gives Foldkit the opportunity to shrink substantially while keeping the invariants that make its Sync/Durable architecture distinct.

The target is not:

> "Use Effect everywhere."

It is:

> **Use Effect exactly where Effect owns generic infrastructure better, and keep Foldkit-specific semantics explicit above it.**
