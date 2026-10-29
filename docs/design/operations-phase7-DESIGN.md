# The durable outbox (operations phase 7, #247, #260)

Status: built (2026-10-29). Phase 7 of [operations-PLAN.md](./operations-PLAN.md).
It builds on phase 4's captured `now` ([ops-4](./ops-4-captured-now-DESIGN.md)),
the failed-write ledger (#260) and the law of phase 6
([phase 6](./operations-phase6-DESIGN.md)), whose remainder it also takes.

## The problem

A Remote write is a value since phase 4: the ledger's `StartedWrite` holds its
mutation, input, keys, `now` and the layer it showed, and `Data.retry` sends
it again with the same request id and operation id. But the ledger lives in
the Model, and the Model goes with the page. A like pressed on a train, a
post written in a tunnel, a write that failed because the network was down:
a reload loses each of them, layer and all, and nothing ever sends them.

The plan's §6 promised the rest needs no new model: an `Operation` is a
value, so storing it and sending it later is #247's outbox. This note decides
how.

## What Remote owns here, and what Sync owns

```text
Remote outbox: send it later.  One write, sent once, in order; the server decides; a refusal settles it.
Sync:          converge.       Client-authored state, replayed through update, merged across devices.
```

The outbox does not make Remote a second owner of anything. The server still
owns the row; the stored operation is the reader's *intent to ask*, kept
until the server has answered it once. A refused write is settled as it is
today. If edits must merge with other devices' edits while offline, or must
read their own effects before the server has seen them, that is Sync.

## Decision

```text
Data.mutate(model, M, input, { durable: true })
  ├─ update: the layer shown, the write queued in the Model   (MutationStarted, write.durable)
  ├─ outbox.save:  the queue written to the store              (KeyValueStore, under a lock)  → OutboxRead
  ├─ outbox.send:  the oldest stored write sent, one at a time (one tab: a Web Lock)          → MutationSucceeded | MutationFailed | OutboxDelayed
  └─ outbox.watch: another tab's change read back              (BroadcastChannel)            → OutboxRead

reload: outbox.restore(model) as flags → the stored writes back in the ledger, their layers shown,
        then sent in order with the same operation id and the same now
```

### 1. Durable per call

`Data.mutate(model, M, input, { durable: true })` makes one write durable.
`Data.outbox({ key, scope })` assembles the store, as `Data.persistence`
does, beside `Data.wiring`.

Per call, not per Mutation: whether a write must outlive the page is a fact
of the reader's action, not of the operation. Chirp's heart and its compose
box are durable; an editor's Save, which closes only on its answer, is not,
and both may run the same Mutation. A retry of a durable write is durable.

A durable write needs the outbox's session, which `outbox.restore` mints, so
`Data.mutate` with `durable` before the restore has run throws, naming it.
That is a wiring mistake, and the alternative is a write that is never sent.

### 2. Its id is its operation id

A durable write's request id is its operation id: `<session>-<n>`, where the
session is a random id minted by `restore` once per page load, and `n` the
Model's mutation sequence. It is decided in `update`, so the Model, the store
and every send carry the same id from the first frame.

- The request id must outlive the page: a restored write keeps it, and a new
  page's sequence starts again at 1, so `<contract>-<n>` would collide.
- The operation id is what a ledgered writer answers a resend from (#203), so
  it must be fixed before the first send, not minted by the Command.
- `options.requestId` with `durable` is refused: the outbox names the write.

### 3. The queue is in the Model; the store is its copy

`RemoteModel.outbox` holds the session, the key it is restored from, the
queued writes in order, and the operation ids settled lately (`done`, the
newest 256). Each queued write is its **stored record**: mutation, input
*encoded* by the Mutation's `Input`, keys, `now`, the layer it shows, the
viewer it was predicted for, what the reader was shown, a `revision` and a
state (`Waiting`, or `Failed` with its error). It is also in the ledger, as
any write is: pending while waiting, failed when refused, so `Data.mutation`,
`Data.failedWrites`, `Data.retry` and `Data.dismiss` work on it unchanged.

`Data.mutate` encodes the input when it queues the write, so an input that
does not encode throws at the call, not in a Subscription later.

The store holds one record per key: `{ version, scope, entries, done }`. Every
tab writes it, so a write is a merge, never an overwrite:

```text
merge(store, mine) = entries of both, by operation; one in either `done` is gone;
                     the higher revision wins; order is the store's, then mine
```

The merge is a join (commutative, idempotent), so two tabs saving at once
lose nothing that their next save does not put back. Each save also runs
under a Web Lock named after the key where the browser has one, so they do
not race at all.

### 4. Stored before sent, sent in order, by one tab

The **save** entry writes the Model's queue whenever it changes (no
debounce) and answers `OutboxRead`: what the store now holds. A write the
store holds is marked `stored`.

The **send** entry sends the oldest write that is `Waiting` and `stored`, and
nothing else until it settles:

- **Stored first.** A write is never sent before the store has it, so a
  reload after the send began finds it and sends it again with the same
  operation id. The ledgered writer answers that from its record.
- **In order.** A post and the like of it, made offline, reach the server in
  that order. A refused or unreadable write does not hold the rest back.
- **One sender.** The send runs under a Web Lock per key: of the tabs open on
  one store, one sends. Having the lock, it reads the store again and sends
  only a write the store still holds as waiting, so a write another tab
  settled is not sent twice. Where the browser has no Web Locks, each tab is
  its own sender (one tab is the common case, and the resend is idempotent).
- **The sender writes the outcome** to the store before it lets the lock go,
  so the next sender reads it.

`Data.mutate`'s Command for a durable write sends nothing: it answers
`MutationQueued`, a no-op. The outbox is the write's only sender.

The sender announces the outcome to the other tabs **before** it writes the
store: a tab that read the store first would find the write `done` with no
answer and refetch what it showed (§7), where the answer itself settles it.
The Web Locks are a context reference (`OutboxLocks`), the browser's by
default; `Trace` sets none, since a trace is one tab.

### 5. Retry with backoff on transport failures only

A failure that says nothing reached the server, or nothing came back, is
`Unreachable` (`RemoteUnreachable`, new): the request text was never sent or
never answered, so the write is kept `Waiting` and sent again after a
backoff: 1 second doubling to 30 seconds, ±20% jitter
(`Data.outbox({ retry: { base, max } })`), and at once when the browser says
it is `online` again. Each attempt answers `OutboxDelayed { requestId,
attempt, error }`, so a view can say "waiting for the network".

Everything else settles as today: a refusal, `Forbidden`, `Unauthenticated`,
a server's error answer. The write is `Failed` in the store and the ledger,
listed by `Data.failedWrites`, and a later write is sent. `Unreachable` is
what `Remote.http` and `Remote.json` report when the request cannot be sent
or what comes back is no Remote answer (not JSON, JSON that is not an answer,
or a 408, 429, 502, 503 or 504; #282), and what `Remote.clientLayer` reports for an RPC
transport error; a mutation's own error answer stays `RemoteMutationError`.

### 6. Status, retry and discard

`Data.outboxStatus(model)` is `{ waiting, failed, items }`, `items` in order,
each `{ requestId, mutation, state }`:

| `state._tag` | Means | The reader may |
| --- | --- | --- |
| `Waiting` | not answered yet; `attempt` transport failures so far, `error` the last | wait |
| `Failed` | the server answered no (`error`) | `Data.retry`, `Data.dismiss` |
| `Unreadable` | stored by a version of the app that this one cannot read (`reason`) | `Data.dismiss` |

`Data.retry` on a durable failed write queues it again (`Waiting`, its
revision moved on, its layer shown again); the outbox sends it. `Data.dismiss`
settles a failed or unreadable one: it goes from the store and every tab.
A waiting write cannot be dismissed: it may be on its way, and a dismissal
cannot unsend it.

### 7. Cross-tab: one sender, the others watch

Every tab mirrors the whole store, not only its own writes. A tab that reads
a write another tab queued shows its layer too: the reader pressed the heart
in one tab, and every tab shows it pressed.

The **watch** entry listens on a `BroadcastChannel` named after the key. The
save and the sender post to it after each write to the store, and the sender
posts the outcome Message with it. A watching tab reduces the outcome first,
so its layer settles with the server's answer as the sender's does, then
reads the store. A tab that missed the outcome (it opened after) and reads a
write as `done` releases its layer and refreshes what it showed: the rows it
patched are asked for again and every held list is refetched. Refetching is
how Remote recovers what it did not see.

### 8. A stored write this version cannot read

After a deploy, a stored write may name a Mutation the app no longer
registers, or hold an input its `Input` no longer decodes. Each such record
is read alone (the AGENTS.md trap: one bad operation must not block the
outbox):

- it is kept in the store and the Model as `Unreadable`, with its reason,
  never sent, and shown no layer;
- it is reported once as the `OutboxUnreadable` diagnostic;
- the writes after it are sent;
- `Data.dismiss` removes it.

Kept rather than dropped: it is the reader's unsent change, and the app may
say so ("1 change could not be sent after the update"). A record that is not
an operation at all (no `operation` id) is dropped.

### 9. `now`, resent later than `clockSkew`

A stored write is resent with the `now` it was made at, as `Data.retry` does.
The server's rule from phase 4 is unchanged: within `clockSkew` it is taken;
past it, the server writes its own time and reports `ClockSkewed`, whose
message already names the cause ("or the request waited that long"). So a
chirp written offline an hour ago is stored at the time it reached the
server, and the answer moves it there. The bound is what stops a client
backdating rows; an outbox cannot tell an honest wait from a forged one, so
it does not ask the server to.

### 10. The key, the scope, and a change of principal

`key` and `scope` are `Data.persistence`'s: one key per principal, so one
person's queued writes are never sent as another's. A record under another
scope or version reads as empty, as a snapshot does. `Data.forget` empties the
Model's queue and its key (the writes stay in their own store), so the next
principal's key is restored; the session is kept.

## Phase 6's remainder

### 11. A write the held `may` forbids is refused where it is made

Phase 6 refuses a write locally when the row it leaves definitely breaks an
invariant. A write the guards refuse was still shown, sent, and taken back
when the 403 landed; `Law.check` reported it as a disagreement.

The client cannot run the write's own guard rules: `Remote.make` never learns
that a Mutation is guarded, and `decideUpdate` judges rules the client does
not have in one place. What it holds is `may`: the server's answer (or the
client's foresight, phase 5) of what may be done to the row, by interaction,
member and relation. That is enough to refuse a write that **definitely**
fails:

```text
the write's surface, from its declaration:
  Write.update → row Update, each member written, each relation relinked (Link/Unlink)
  Write.delete → row Delete
  Write.insert → nothing (no row yet; Create is not in `may`)
refused ⇔ some part of that surface reads `false` in the row's held `may`
```

- **Generic in `foldkit-entity`.** `Derived.make(schema, { predict, forbids })`:
  a supplied member may say which write its value forbids. `forbids(value,
  surface)` is `Option<{ reason }>`, where `surface` is `{ kind: 'Update' |
  'Delete', members, relations }`. Remote calls it for each supplied member
  of the written row whose value it holds (`Data.mutate`, over the visible
  store: a served `may`, or one a pending write foresaw). Remote still knows
  nothing of guards.
- **`Guards.may`** implements it from `MaySchema`: `row[kind] === false`, a
  written member's `members[m] === false`, a relinked relation's `Link` or
  `Unlink` `false`. Its `reasons` give the reason, as `forbid(reason)` does.
- **The refusal is the server's own:** `MutationFailed` with
  `{ _tag: 'Forbidden', message, reason }`, nothing shown, nothing sent, read
  with `RemoteData.denied` as a 403 is. A durable write so refused is not
  queued.
- **Only definite.** A `may` not held, a member it does not name, or a value
  that does not decode refuses nothing. A held `may` is the server's answer as
  of its read; `Data.refresh` asks again. That is phase 6's rule for
  invariants over a held row.

`Law.check` compares a local refusal with the server's by `refusal` where one
is declared and by `_tag` otherwise, so a local `Forbidden` meets the server's
403 and agrees.

### 12. Write rules over paths, judged in the write's statement

`Guards.attach` refused a write rule that reaches another row (a path, an
exists, a path from the viewer): `GuardServer.writer` judges rules in memory
over one row, which cannot read another, and the check and the write would be
two statements over a row that is not pinned (guard-atomic's premise was that
no write rule reads another row).

Now a row's **Update** and **Delete** rules may reach other rows, and those
rules are judged in SQL **in the write's own statement**:

```text
GuardServer.writer: rules not reaching → judged in memory, as before
                    rules reaching     → handed to the writer as `requires`
remote-drizzle writer: update … where id = ? and revision = ? and (<requires, or'd>)
                       delete … where id = ? and revision = ? and (<requires, or'd>)
no row changed, the row there at that revision → the rules refused: Forbidden
```

- **One statement, so atomic.** The rule reads the rows it reaches as the
  statement runs, which closes the window the revision pin closes for the row
  itself.
- **Compiled as a Read rule is** (`GuardDrizzle.visible`): the same
  `compileWhere`, the binding's `reach`, the request's context (`Expr.viewer`),
  and no visibility on the rows it reaches: it is the server's decision, not
  the reader's view.
- **Or'd with what memory decided.** A surface admits when any of its rules
  holds; a rule that does not reach decided `true` admits without SQL, and the
  reaching rules are sent only when the rest are `false`.
- **A writer that cannot judge them refuses at definition.** `EntityWriter`
  gains `requires: true` and, on `update` and `delete`, a `requires`
  (`WriteRequirement`: a `RowRequirement` of bodies, all or any, and the
  `explain`'s words). `foldkit-remote-drizzle`'s writer has it.
  `GuardServer.writer` over another writer, for an Entity with a reaching
  write rule, throws when it is made, naming the rule.
- **Over the stored row only.** The statement sees the row before the write.
  The guard judges a rule over the row the write leaves too, so a write that
  changes what a reaching rule reads of its own row (its fields, the relation
  a path leaves by) is refused; one that does not leaves the rule's answer as
  it was, since the other rows are the same in one statement.
- **On a miss**, the writer reads the row back and, before `Conflict`, `Unmet`
  or `Invalid`, refuses it as `Forbidden` where the row is there and fails the
  requirement: who may write is refused first, as the guard refuses.
- **`may` does not answer such an interaction** on the server: one row cannot
  decide it, and a `may` that guessed `false` would now refuse writes locally
  (§11). The interaction is left out of `may.row`, which refuses nothing.
- **Still refused at attach:** a reaching rule on **Create** (an insert has no
  row for the statement to judge; it needs `insert … select … where` over the
  values, a compiler target of its own), on a member, a relation, a named
  interaction (a hand-written handler has no statement), or `always`.

## Deferred

- **A reaching rule on `Create`.** An insert has no stored row for a
  statement to judge; it needs `insert … select … where <rule>` over the
  values, a compiler target whose columns are parameters.
- **A write that moves what a reaching rule reads** (a card moved to another
  team) is refused rather than judged over the row it leaves.
- **The server's `may` for a reaching interaction** is left out rather than
  answered in SQL per row, so a client foresees it (over the store, phase 5)
  where the server says nothing, and `Law.check` would report the difference
  for such a domain. No domain here has one.
- **A list or count kept by a durable write's answer in another tab** that
  missed the announcement is refetched whole (§7), not patched.
- **Restoring a stored `optimistic` layer by predicting it again** over the
  current store, rather than showing the stored one (see below).

## Tests

- `packages/remote/test/outbox.test.ts` (20), over the outbox's own
  Subscription entries and a store the test keeps: queued not sent; sent only
  once stored; the operation id and `now` sent; a reload (the page goes with
  the send unanswered) shows it and sends it as itself; a send nothing
  answered sent again with those after it waiting; a refusal settled, listed,
  retried as itself and dismissed from the store; a refusal the sender could
  not write written by the page; unreadable entries (an unknown Mutation, an
  input that no longer decodes, a shape) kept, reported once, skipped; the
  merge; another tab's write shown; one settled elsewhere released and asked
  for again; a sender finding it settled sends nothing; another scope empty;
  `forget`; a store that cannot be written still sends.
- `packages/remote/test/outboxReload.test.ts`: two Foldkit runtimes in turn
  over one store, the first offline, the second sending the write as itself.
- `packages/remote/test/outboxTabs.browser.test.ts`: two runtimes in one
  Chromium page (shared `localStorage`, Web Locks, `BroadcastChannel`): a write
  queued in one shows in both, is sent once, and settles in both.
- `examples/chirp/e2e/sandbox.e2e.ts`: a chirp posted at `?offline` waits,
  survives a reload, and is sent once a page can reach the server; Ada then
  reads it. It goes red with `durable` taken out of Chirp's post.
- `packages/remote-server/test/answer.test.ts`, `packages/remote/test/rpcClient.test.ts`:
  `Unreachable` told apart from a refusal.
- `packages/remote/test/localForbidden.test.ts` (8),
  `packages/guard/test/mayForbids.test.ts` (11), and Chirp's law over an edit
  of someone else's chirp.
- `packages/guard/test/pathWriteRule.test.ts` (11, SQLite and PGlite): an
  update and a delete held to a viewer-path rule in their statement, a change
  of team in force at once, a move refused, `may` left out, a writer without
  `requires` refused.
- `heldValue.test.ts`: generators for `MutationQueued`, `OutboxRead` (another
  tab's write, a refusal, a write settled elsewhere, an unreadable entry,
  another key) and `OutboxDelayed`, and a durable `MutationStarted`; 2000
  seeds of 30 steps in a scratch run.
- Mutation specs, all killed: `outbox.mutations.ts` (23),
  `unreachable.mutations.ts` (2), `localForbidden.mutations.ts` (10),
  `pathWriteRule.mutations.ts` (8), Chirp's (one new); and the specs this
  phase re-anchored (`failedWrites`, `localRefusal`, `mutationAnswer`,
  `mayPrediction`, `law` (remote-drizzle), `compute`, `write`, `server`,
  `viewerRule`, `precondition`).

## Considered and not done

- **Per-Mutation `durable`.** The same Mutation is durable at one call site and
  not at another (§1).
- **The first send from `Data.mutate`'s Command**, with the outbox only for
  resends. It sends before the store has the write, so a reload in between
  loses it, and two tabs could send one write at once. The cost of the queue
  is one Subscription turn before the first send.
- **One store key per write**, which needs no merge. `KeyValueStore` cannot
  list keys, so a new tab could not find them.
- **A `queued: true` flag on the wire** so the server skips `ClockSkewed` for
  a resend. The server cannot trust it, and the diagnostic already says why.
- **Persisting the optimistic layer as a prediction to redo.** The stored
  layer is what the reader was shown; a declared write's amounts (`adds`) and
  computed fields are worked out over the store whenever it is read, so a
  restored layer is current without predicting again.
