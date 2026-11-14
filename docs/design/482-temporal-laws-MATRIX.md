# #482 temporal laws: what is tested, and where it is not

Status: matrix (2026-11-10). The deliverable of #482, which is a conformance
project, not a runtime: nothing here is a new scheduler, cache or store. It
takes the temporal laws that [#480's audit](./480-async-guarantees-DESIGN.md)
named, finds the test behind each in the existing suites, and adds a test only
where there was none. [Solid 2.0's comparison](./solid-2-optimistic-COMPARISON.md)
and [the async semantics note](./async-semantics-DESIGN.md) say why a wait is a
value in the Model here, not a hold; every law below is a property of Remote's
reducer, Subscriptions and the order Messages reach them in.

Statuses:

- **covered**: an existing test fails when the guard is removed (its mutation
  spec is named where one exists).
- **added**: missing until #482; `packages/remote/test/temporal.test.ts` and
  `temporal.mutations.ts`.
- **failure, fixed**: a law the new test showed false; the fix and its
  regression test are named.
- **failure, open**: a law shown false that needs more than a local fix; the
  test is `it.fails`, so it goes green the day it is fixed and the row changes
  with it.
- **difference**: deliberately not Solid's model, or not a guarantee at all.

The new tests record every Model in between (the visible read beside
`Data.confirmed`, and the read's tag), not where a run ends. They use no timer
and no clock: reducer laws drive `Data.reduce` over scripted Messages, and
Subscription laws run `Trace.run` from `foldkit-remote/testing`, which holds
every request until a step answers it.

## The matrix

### 1. Read supersession

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| An answer asked for before `Data.forget` writes nothing: a read, a failure, a page, a query failure, a live event | `forget.test.ts` "an answer asked for before it is the previous principal's (#484)" (`writes nothing` / `is applied when asked since`); `overlappingReads.test.ts` "an answer queued behind Data.forget" (three cases, the answer queued behind a lagging restart) | covered | `forgetAnswers.mutations.ts`, `refreshedAt.mutations.ts`, `liveFloor.mutations.ts` |
| A principal change restarts every read and live entry, even one whose plan did not change | `forget.test.ts` "restarts a read entry whose plan did not change…", "restarts a live entry at cursor zero…" | covered | `liveFloor.mutations.ts` |
| A write in flight across `forget` writes nothing, and a late echo's owner is not heard | `forget.test.ts` "treats a mutation in flight as applied: its answer writes nothing"; `heardPrincipal.test.ts` "is heard from a write, and not from one sent before forget" | covered | |
| A stream's events after a `forget` are stamped with the floor they were opened under | `forget.test.ts` "stamps a live stream with the floor it was opened under" (an event, a break) | covered | |
| A restarted read's request is dropped; its answer reaches no one | `trace.test.ts` "drops a request whose stream restarted, as the runtime does"; `temporal.test.ts` "leaves a request held for the old Surface answerable by no one" | covered | The driver is the runtime's `switchMap`; a real lagging restart is `overlappingReads`'s driver |
| Within one principal, an older read's answer cannot land over a newer one | One read entry: interruption on restart. Two entries reading one row: by the row's revision, where the server sends one: `revision.test.ts` "A row revision" (a read, a live patch and an answer of a lower revision write nothing; a deleted row stays gone from its own revision) | covered where a revision is sent | `readAfter.mutations.ts` (`<=`, no comparison, a tombstone forgetting its revision). `NormalizedEntity.revision` and `EntityPatched.revision` (#544); `foldkit-remote-drizzle`'s `source(binding, { revision })` and `foldkit-remote-domain` send one. A server that sends none is ordered as before: undecidable for two entries |
| A read after a write is not answered by a server copy older than the write | `readAfter.test.ts` (a floored row is read again carrying its token; `behind` keeps the held row and the floor; an answer asked without the token or at an older one writes nothing; the floor survives a persisted snapshot; a live stream subscribes with it); `adapter.test.ts` "a write whose View is behind" | added | `readAfter.mutations.ts` (22). `MutationResult.after`, `ReadBatch.after`, `ReadBatchResult.behind`, `LiveRequirement.floors` (#544). A row named in `behind` is asked again only when the read entry restarts |

### 2. Selective refresh

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Refreshing one read restarts that read's entry only: the other keeps its request in flight, and is not started again | `temporal.test.ts` "refreshing one read" (frames of both reads; one `ReadStarted` for the other) | added | Mutation: `refreshedAt` taking the global generation. Per-field and per-connection marks are tested in `refreshedAt.mutations.ts`, `domain.test.ts` "Data.refresh" |
| A refreshed read reads `Refreshing` with its value, never `Loading` or `Initial` | `temporal.test.ts` (same case); `domain.test.ts` "Data.refresh" | added | |
| Quiet revalidation keeps a useful value under the policy: an aged-out value reads `Refreshing`, and the entry's own mark does not restart it | `overlappingReads.test.ts` "a read entry under staleWhileRevalidate"; `heldValue.test.ts` "is kept through every seeded walk of Messages" and "Each exception" | covered | `overlappingReads.mutations.ts`, `heldValue.mutations.ts`. A seeded walk's green is only its seeds (see the `heldValue` trap in `CLAUDE.md`) |
| A refresh of a failed read keeps its place: `Loading` while asked again, `Failed` again if it fails again | `refreshActive.test.ts` "a retried read keeps its place" | covered | |

### 3. Mutation settlement order

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Two edits of one row settle on the later edit, whichever answer arrives first; an earlier answer leaves a field a later one settled, a later delete, and a row a later edit wrote | `answerOrder.test.ts` "Two edits of one row", "An edit started before a delete", "An earlier answer's read" | covered | `answerOrder.mutations.ts` (13 mutations) |
| An earlier answer's confirmed value does not revert a later one, in every order and for every success or failure of the two | `temporal.test.ts` "two writes to one field…" (eight cases, three frames each, visible and confirmed) | added | Mutations: no request order, earlier answer overwriting |
| While b (started later) is confirmed, a's still-pending edit does not show over it | `temporal.test.ts` same table, the `ba` rows | failure, fixed | Visible read Hopper, then **Grace** (a's pending layer over base Hopper), then Hopper again. `superseded` (`src/optimistic.ts`) took only a later delete out of the earlier layers; it now takes the fields a later answer wrote too, and the same for a's `adds` and `computes`. Regression: the `ba` rows and "keeps the earlier edit on a field the later answer did not write" |
| A repeated answer or failure returns the Model it was given | `repeatedAnswer.test.ts` "A repeated settlement of a success / of a failure"; `mutationAnswer.test.ts` "writes nothing on a repeated answer, its read included" | covered | `repeatedAnswer.mutations.ts` |
| An answer for a request no longer pending (dismissed, forgotten) writes nothing and revives nothing | `repeatedAnswer.test.ts` "A failure of a request no longer pending"; `forget.test.ts` (in flight across forget) | covered | |
| The server applies requests in start order | Assumed, not tested here | difference | The client orders answers by start (#273); a server that applies a later request first would end showing the later one while holding the earlier. `remote-drizzle/test/ledger.test.ts` covers the server's side |

### 4. Optimistic overlay safety

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| While pending, the visible read and `Data.confirmed` differ; confirmed shows the base | `domain.test.ts` (confirmed); `temporal.test.ts` frames (every `visible/confirmed` pair) | covered, and recorded frame by frame | `confirmed.mutations.ts` |
| Rejection removes exactly its layer; unrelated layers survive; later layers win | `optimistic.test.ts` "later layers win…", "a failure removes exactly its layer…"; `optimisticMutation.test.ts` "failure drops both and reveals the base", "two pending prepends…", "two pending requests patching one row show the later request's value" | covered | `layers.mutations.ts` |
| Success reconciles: the layer comes off, the answer is the base, a later layer re-wins | `optimistic.test.ts` "later layers win and overlapping layers rebase on success"; `optimisticMutation.test.ts` "success settles both by the request id…" | covered | |
| A pending delete hides the row everywhere, wins over a pending edit before or after it, and a failure brings the row back | `pendingDelete.test.ts` | covered | `pendingDelete.mutations.ts` |
| A write's prediction is checked against the answer | `verifyPredictions.test.ts`, `verifyAnswers.test.ts`, `answeredPrediction.mutations.ts`; `Law.check` in `remote-drizzle/test/law.test.ts` | covered | See law 6 |

### 5. Read, answer and live interleavings

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| A live patch of an absolute value during a pending write shows the layer, not the patch; the base moves under it | `temporal.test.ts` "a write answered while the stream still delivers what came before it" (answer at positions 1 and 2) | added | Visible is the write in every frame; confirmed follows the stream |
| A live patch of a field a pending write moves by an amount (`adds`) does not double-count: the write's own echo arrives before its answer | `temporal.test.ts` "a live patch of a field a pending write moves by an amount" (visible and confirmed in every frame; the record's drops) | failure, fixed | Trace: likes 10, pending `adds { likes: 1 }` (visible 11), echo `likes: 11` arrives. The base moves to 11 and the layer used to add one again (visible **12** until the answer). Fixed by #498: Remote's Model keeps the value a field held before the first live patch that landed while a write was pending, and a relative layer resolves over it, so visible stays 11. Another person's like shows when the answer lands, and `Data.confirmed` reads the stream's value throughout. See [377-439-440-remote-data-plane-DESIGN.md](./377-439-440-remote-data-plane-DESIGN.md) decision 5 |
| An answer after the stream's stale patch (the patch committed before the write) never shows or confirms the old value | `echo.test.ts` (#485: eleven cases); `temporal.test.ts` position 0 | covered | `echo.mutations.ts` (ten); `temporal.mutations.ts` repeats its two central mutations |
| A patch after the answer that is not the answer is read again, reading `Refreshing` meanwhile, and converges on the re-read | `echo.test.ts` "asks for the field again…"; `temporal.test.ts` "reads the field again when a patch after the answer…" | covered | |
| #377's hypothesised flicker (a pending write makes a read look loading) | `temporal.test.ts`: every frame of every interleaving above reads `Ready`; `Refreshing` only after an answer contradicted by the stream | covered, hypothesis not reproduced | No frame in the matrix reads `Loading` or `Initial` while a write is pending. Whether it *should* (Solid's `affects`) is #377's design question, not a law |
| An answer whose values predate a newer live patch, delivered after it, does not overwrite it for good | `temporal.test.ts` "reads the field again when a late answer disagrees with a newer live patch", and the table of plans after the answer | failure, fixed | Trace: write Grace pending; stream delivers `Ada`(1), `Grace`(2), `Eve`(3); the answer (Grace) arrives last. The answer's value is written, so confirmed reads **Grace** for a moment, and the field is read again (`Refreshing`); the read's answer (`Eve`) is what stays. `MutationResult` carries no stream position and needs none: a cursor counts per subscription, so the same record as #498 names the fields a stream wrote while the request was pending, and an answer that differs from the base the stream left reads again. Fixed by #499 |
| Outbox retry: a send nothing answered is sent again under the same operation id, those after it wait their turn | `outbox.test.ts` "is sent again after a send nothing answered…"; `deadline.test.ts` "a durable write that runs out" | covered | `outbox.mutations.ts` |
| Stream gap: a break restarts the stream once, resumes from its cursor, and a write made while it was down is shown | `liveRecovery.test.ts` "a live stream that breaks"; `liveLedger.test.ts`; `liveStream.test.ts` "reports a broken stream as a gap…" | covered | `liveRecovery.mutations.ts`, `liveLedger.mutations.ts` |
| Stale field refresh: a row is read again when its oldest field is due, not its newest | `fieldFreshness.test.ts` "plan and deadlineOf" | covered | `fieldFreshness.mutations.ts` |
| Same-key overlapping writes expose no forbidden transient state | Law 3's table: no frame shows an earlier edit over a later confirmed one, and none reads anything but `Ready` | added | See the fixed failure above |

### 6. Prediction conformance

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| The client's prediction of a write agrees with the server's answer | `Law.check` (`src/law.ts`), run through both interpreters in `remote-drizzle/test/law.test.ts` (SQLite, Postgres, a locale that collates) and `entity/test/law.test.ts`; `verifyPredictions` in `verifyPredictions.test.ts`, `verifyPlacement.test.ts` | covered | #482 adds none: the laws above extend the same Messages, and a prediction that disagrees is `PredictionMismatch`, not a new check. A prediction checked only while pending says nothing about after (#265): `Law.check` compares after the answer too |

### 7. Lifecycle and cleanup

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| A Surface left mid-read abandons its read: nothing is held, rows are not left `Loading`, going back asks once | `temporal.test.ts` "a read whose Surface is left mid-flight" (frame by frame, including the frame after `Closed`, still `Loading` until the Subscription catches up) | added; the frame after `Closed` reading `Loading` is a deliberate difference: the mark is a fact about the row (a request for it is still in flight until the Subscription restarts and interrupts it), so any other entry that asks for the row is waiting on it and reads `Loading` truly, and `ReadAbandoned` keeps the mark while another entry owns it ("a Surface left mid-flight beside another that reads the same row" pins every frame, a different row included). Only the left Surface, or a reader no active entry asks for, sees it for one frame | `cacheOnly.mutations.ts` covers the same `ReadAbandoned` for entries that share a row; `temporal.mutations.ts` kills a `ReadAbandoned` that ignores another owner |
| A Surface left stops its live subscription: an entry with nothing to watch opens none | `temporal.test.ts` "a live read whose Surface is left" | added | |
| An interrupted read or query nobody waits on is interrupted, not left running | `coalesce.test.ts` "a call nobody waits on is interrupted (#355)" | covered | `callTimeout.mutations.ts` for timeouts |
| A read's deadline fails it, before the client's | `deadline.test.ts` | covered | `callTimeout.mutations.ts` |
| A runtime disposed before its Subscriptions start | `CLAUDE.md` trap ("A runtime disposed before its Subscriptions start never ends their streams") | difference | A Foldkit runtime property; Remote's entries release by stream end |
| Departed Surfaces' data is kept or evicted by budget, and a collected row cannot be answered back in stale | `departed.test.ts`, `retain.test.ts` | covered | |

### 8. Determinism, and Solid's lanes

| Law | Evidence | Status | Notes |
| --- | --- | --- | --- |
| A given Model renders the same page, in any zone or locale | `examples/cms/test/determinism.test.ts`; the SSR resume plan (`foldkit-ssr`) | covered | |
| A snapshot of a store is the same text whatever order it was built in | `persistence.test.ts` "is deterministic whatever order the store was built in", "hydrating the same text twice gives equal stores" | covered | |
| `Data.reduce` over the same Messages and the same `now` gives the same Model | No test of its own | missing test | Remote's reducer takes `now` from the Message and reads no clock, so every run in this matrix is also a deterministic replay; a nondeterminism would need a mutation that reads `Date.now`, and no guard to break. Not added: a test that cannot fail is not one |
| Solid 2.0's display-ahead and held lanes (`latest`, `pending?`, a held instant) | #480 audit rows "R-9..R-12", "H-2..H-4" | difference | Not implemented, and not a gap: Foldkit has one version of state, so a hold is a value in the Model (`Refreshing`, a pending layer). Not parity, and not a goal |

## Counts

Rows: 8 laws, 42 rows. By status:

| Status | Rows |
| --- | --- |
| covered (existing test) | 27 |
| added (new test, mutation-checked) | 7 |
| failure, fixed | 3 |
| failure, open | 0 |
| difference | 4 |
| missing test | 1 |

## What the new tests do not claim

- They do not run a browser, a real server or a real clock: they replay
  Messages. A claim about focus, paint or the pointer stays a browser test.
- Eight cases of two writes and three of the stream are exhaustive over the
  orders *those* events can take, not over a protocol. The answer carries no
  stream position and needs none (a cursor counts per subscription); #499 is
  fixed with #498 by the record in phase 1 of the Remote data plane note
  ([377-439-440-remote-data-plane-DESIGN.md](./377-439-440-remote-data-plane-DESIGN.md)).
- The frame after a Message is the frame before the Subscriptions catch up. A
  Subscription's restart lands behind Messages already queued
  (`overlappingReads.test.ts`'s lagging driver); `Trace.run` restarts at once,
  so a race that needs the lag belongs there.

## Mutations

`pnpm mutate packages/remote/test/temporal.mutations.ts`: thirteen, each
breaking one ordering or epoch guard (settlement order, layer order, the
confirmed read, the echo wait, the refresh generation, `ReadAbandoned`, the
live entry's empty case); all thirteen killed (`pendingDelete.mutations.ts`, re-anchored for the fix, 11 of 11).
