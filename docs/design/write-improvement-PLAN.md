# Declared writes: improvement plan

**Status:** Plan, 2026-10-24. Nothing built. Follows a review of the work for
#182 ([guard-atomic](./guard-atomic-DESIGN.md),
[write-precondition](./write-precondition-DESIGN.md),
[write-increment](./write-increment-DESIGN.md)) and amends those three designs
where it lands.

## 0. What the review found

The core holds: a declared write is decided over one row version and written
with one compare-and-set statement, so the revision, a `when` and an
`increment` are clauses of one `update … where`. Five things are weaker than
they should be, most important first:

| # | Weakness | Why it matters |
| --- | --- | --- |
| 1 | An increment must `expect` a revision | Increments are worth having because they commute; requiring a revision makes two concurrent restocks conflict like a read-modify-write. |
| 2 | "Did my write land?" is three heuristics | A row a revision on holding the values; a row failing `when` but holding the values; none for increments. Together they surprise: "publish it again" is written though it may have been someone else's publish. |
| 3 | The hidden-member check is `validate`'s only | An application that never calls `GuardServer.validate` keeps the oracle a `when` or `expect` over a hidden member opens. |
| 4 | The revision pin trusts every writer to move the revision | A handler, `applyEdits` or raw SQL that changes the row without moving it is not seen. A convention, documented, not enforced. |
| 5 | `GuardServer.writer` is one dense function | The pin, the retry, the client-expect comparison, the expect-field rule and the refusal order interact; the review's bugs were in the interactions. #183 and #184 will add to it. |

Items 1 and 2 have one cause: the server cannot tell a retry of an operation
from a new one. Fixing that is the plan's centre.

## 1. A fact the plan rests on

A Remote mutation's `requestId` is not an operation identity. `Remote.mutate`
defaults it to `${name}-${sequence + 1}`, a counter in the Model: it restarts on
reload and is the same in every tab and device, so two clients' first restocks
are both `app-1`. Remote also never retries a mutation by itself; a retry is the
application sending again. Deduplicating by today's `requestId` would merge
different operations: the trap Sync met with replica ids named after a person.

## 2. Phases

Each phase ships alone, green, with its tests and mutations, in the order below.
A phase's design questions are listed with a proposal; each is confirmed before
that phase starts.

### Phase 1: the guarded writer refuses the oracle itself (item 3)

**Built**, 2026-10-25: `discloses` in `GuardServer.writer`, cached per body;
tests in `packages/guard/test/write.test.ts`, mutations in `write.mutations.ts`.

Small, independent, closes a security gap regardless of what follows.

- `GuardServer.writer` checks, on the first update or delete of each declared
  write, that its `when` reads no member with a Read rule and its `expect` names
  none, and fails with a `RemoteServerError` naming the write; cached per
  `Write` (a `WeakMap`), so the check runs once. `validate` keeps the same check
  at startup and shares its helper.
- The writer is handed the body and the expect field already; it is not handed
  the `Write`. Proposal: the check reads `when.body` and `expect.field` from the
  context it is given, so no contract change.
- Tests: an unvalidated server refuses the write at run time; a write over
  visible members passes; mutation of each check.

### Phase 2: an operation identity (prerequisite for phase 3)

**Built**, 2026-10-25, with one change from the sketch below: `update` is pure,
so `Data.mutate` cannot mint a random id. The Command mints it where it runs,
`MutationFailed` carries it back, and `MutationState.operations` keeps it as
long as the request's error, so a retry with the same `requestId` (Remote's
existing retry convention) sends it again; no `Data.retry` was needed. The
principal scope is phase 3's, where the ledger keys by it.

- `Data.mutate` mints an operation id unique across clients
  (`crypto.randomUUID()`, or `replicaId:sequence` where a replica id exists),
  carried on the wire beside `requestId` as `operation`. The application keeps
  it to send again: `Data.retry(model, requestId)` resends the mutation with the
  same operation id and input, which is the only way a retry is recognised.
- The server reads it as untrusted input: a length and charset bound, and scoped
  by the principal's key (`Policy.key`), so one client cannot answer for
  another's operation.
- Questions: the wire field's name and whether a mutation without one is
  accepted (proposal: optional, so older clients still work, and such a write
  falls back to today's behaviour); `Data.retry` versus documenting "send again
  with `options.operation`" (proposal: `Data.retry`, because hand-carried ids
  are the bug of §1).
- Tests: two clients' first mutations get different ids; a retry carries the
  original; a reload does not reuse an id; an id over the bound is refused.

### Phase 3: a write ledger, and one exact answer to a retry (items 1 and 2)

**Built**, 2026-10-25, with these differences from the sketch: the ledger is the
Drizzle writer's option, not the binding's; only updates are recorded (inserts
and deletes already answer a retry exactly); D1 is refused, not batched, since
its writes are compare-and-set statements a batch cannot condition on each
other; the lost-answer recognitions stay for a ledgered write (the ledger answers
a retry before them, so they meet only a fresh miss, where they are harmless);
and the guard refuses an increment with no revision through a writer it does not
pin, since its rules would judge a sum over a row that may move.

- A ledger table, `(scope, operation) → answer`, written in the same
  transaction or statement as the row. A write whose operation is already in the
  ledger is answered from it, not written again.
  - SQLite: one synchronous transaction (Drizzle's SQLite transaction does not
    await, so the callback is synchronous: insert into the ledger, update the
    row, record the answer).
  - Postgres: a data-modifying CTE or a transaction; the ledger insert's
    `on conflict do nothing` decides first.
  - D1: one `batch`, which is atomic.
- With a ledger, an increment no longer needs `expect`: two concurrent restocks
  both land, and a retry of either is answered from the ledger. `expect` stays
  available and keeps its meaning.
- The three heuristics of §0 item 2 are removed for a write with an operation
  id; they stay only for a write without one (phase 2's fallback), so nothing
  that works today changes answer.
- Retention: the ledger keeps an answer for a bounded time, after which a retry
  is a new operation. Proposal: 24 hours, configurable, pruned by the same
  writer on insert; the README says a retry later than that is not recognised.
- Opt-in per binding (`ledger: table`), because it is a table each application
  migrates. A write with an increment and no `expect` is refused unless its
  binding has a ledger, so increments without a contract still cannot ship.
- Questions: what the ledger stores as the answer (proposal: the encoded
  patch, re-read through `writer.read` when answered, so a row hidden since is
  answered as deleted, never shown); whether the guard re-decides a ledgered
  retry (proposal: no; the decision was made and recorded, and re-deciding could
  refuse a retry of a write that landed).
- Tests on SQLite, Postgres and D1 (miniflare): concurrent increments both
  land; a lost answer's retry is answered exactly and the field moved once; a
  retry after retention is new; another principal's operation id is not
  answered; a write without an id behaves as today.

### Phase 4: restructure `GuardServer.writer` (item 5)

No behaviour change; done after phase 3, which adds the ledger read, and before
#183/#184 add invariants.

- Split `update` and `delete` into named phases, each a function over a typed
  state: read (the row, the fields its rules and version need), decide (rules
  before and after), pin (the version to write), write, and classify (a miss as
  absent, Conflict, Unmet, retried). The retry loop wraps read-to-write, and the
  order of refusals is visible as the order of phases.
- Every existing guard test and mutation passes unchanged; the mutation specs'
  anchors are moved in the same change and each re-anchored mutation is rerun.

### Phase 5: make the revision structural, where the store allows (item 4)

Last, because it is a schema change for applications and the pin is already
correct for cooperating writers.

- A helper per dialect that emits a trigger moving the revision on every update
  of the row (`GuardDrizzle.revisionTrigger(binding)` returning SQL to migrate
  with), so a handler or raw SQL cannot change the row without moving it.
  SQLite and Postgres support it; D1 (SQLite) does too.
- With the trigger, the writer stops bumping the revision itself, or the row
  moves by two. Proposal: the binding declares `revision: 'trigger'` and the
  writer then sets none.
- Sync's `applyEdits` sets the revision to a commit sequence; with a trigger
  that would conflict. Proposal: a Sync-written table does not use the trigger,
  and the Guard README keeps its Sync limit.

## 3. Out of scope

General arithmetic and cross-field assignments (§2 of #182) wait for a use
case. Client-side prediction of a write (§4 of #182) waits for the ledger, which
gives a retry an exact answer to reconcile against. #183's invariants and
#184's transition rules build on phase 4.

## 4. Order and size

| Phase | Depends on | Size | Changes behaviour |
| --- | --- | --- | --- |
| 1. The writer refuses the oracle | none | small | refuses a write `validate` would have refused |
| 2. Operation identity | none | medium | a new optional wire field |
| 3. Write ledger | 2 | large | increments without `expect`; exact retry answers |
| 4. Restructure the guarded writer | 3 | medium | none |
| 5. Structural revision | 4 | medium | opt-in schema helper |

Phase 1 can start now. Phases 2 and 3 are the plan's point and should be read
together before either begins.
