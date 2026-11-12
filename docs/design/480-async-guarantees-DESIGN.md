# #480 audit: which async guarantees Foldkit Plus already has

Status: audit (2026-11-07), the first deliverable of #480. Not an API proposal.
It decides what #478, #479, #481, #482 and #483 should build, and what they
should not. Since written: #484 and #485 fixed, #482's missing mutations
written, #481's `tags:check` item done, #483's check built (`verify`), and
`Failed.previous` kept as it is; open items are listed in [Order](#order).

Sources: ReactiveScript at
[`fdbcad9`](https://github.com/ryansolid/reactivescript/tree/fdbcad921c6bc1cae59cbebe9905eeabc480e88f)
(2026-11-04): `spec/00-vocabulary.md`, `02-core.md`, `04-rows.md`,
`05-holds.md`, `06-stores.md`, `10-server.md` and the diagnostic bins in
`99-diagnostics.md`. The spec is early design work and changes often; rule
ids below are that revision's. On our side: the source and tests named in
each row, read on this date, and type probes compiled in
`examples/kitchen-sink` and then deleted.

## The one difference that decides most rows

ReactiveScript checks Solid 2.0's semantics, where a write opens an
**instant** that can be **held** while a reader it reaches is pending, and
the screen keeps the last committed frame until the instant commits. There
are two versions of state, committed and in-flight, and probes (`latest`,
`pending?`) read ahead into the second.

Foldkit has one version:

```text
Message -> update -> Model -> view(Model)
                  \-> Command / Subscription -> Effect -> Message
```

Every Message commits at once. A wait is not a hold: it is a value in the
Model (`RemoteData.Loading`, `Refreshing` with the held value, a pending
optimistic layer), which the view draws. So:

- Rules about **writing in the wrong place** mostly hold by construction:
  only `update` returns a new Model, and a view returns markup and Messages.
- Rules about **holds, lanes and probes** have no counterpart and should not
  get one: they exist to manage a second version of state that Foldkit does
  not have. The author picks the equivalent policy per read, through
  `RemoteData.render`'s branches.
- Rules about **timing** (supersession, settlement order, release) are
  properties of Remote's state machine, and are runtime laws in both
  systems. That is where the real gaps are.

## Gap matrix

Columns: **How it holds** is one of *construction* (the program cannot be
written), *tsc*, *checker* (a static pass over inspectable values), *runtime
law* (tests over traces), *rule* (documented, not checked), or *—* (not
applicable). **Decision** is reuse, extend, or not adopted.

### Core: equations, writes, effects

| ReactiveScript | Foldkit Plus today | How it holds | Decision |
| --- | --- | --- | --- |
| W-1 only a source is written; E-1 an equation always holds | Only `update` produces a Model; a Projection is a read. `ModelRef.set` / `WritableProjection.set` are infrastructure seams for checkpoints and restores (`docs/state-model.md`) | construction | reuse |
| W-2 no write in reactive scope; IO-2 no I/O in an equation | A view returns markup and Messages, so it cannot change the Model. It can still call `fetch`: "rendering performs no I/O" is a rule, since a view is ordinary JavaScript | construction for writes; rule for I/O | reuse; I/O in a view stays a rule |
| P-1 glitch freedom; H-1 the screen is whole | One Model per render, and the view is a function of it | construction | reuse |
| P-3 consistency with a from-scratch evaluation | Breaks in exactly one place: `Projection.derive(on, fn)` memoizes by the paths `on` names, and `fn` may read more (`packages/surface/src/index.ts:648`). It then shows what it read last. An `on` entry with no dependencies falls back to recomputing on every read (`unnamed`, `:436`), which is safe | rule (the doc comment's promise); checked in development by `verify` | **gap** closed in development, #483 |
| P-4 minimality, E-6 equality cuts | Render on Model identity; memoized slots and `derive`. A performance property, not a correctness one | — | not adopted as a guarantee |
| C-1 cycles | Projections are values built before use; no cycle can be written | construction | — |
| W-4 / AC-1d a run reading its own write gets the old value | `update` is synchronous and returns its result; there is no write to read back | construction | — |
| AC-1e stale write-back after an `await` | The same lost update exists here, by another route: a Message carrying a result worked out from an older Model, by the view of the last frame or by a Command closure that captured a field. `docs/state-model.md` "Messages carry intent" is the rule, with `Frames.hold()` tests | rule | reuse; see [What stays a rule](#what-stays-a-rule) |

### Rows: pending and failure

| ReactiveScript | Foldkit Plus today | How it holds | Decision |
| --- | --- | --- | --- |
| R-1, R-2 pending flows to readers; `ASYNC_OUTSIDE_LOADING_BOUNDARY` | A read is a `RemoteData` value; `.value` on the bare union is TS2339, so a view must narrow it | tsc | reuse |
| R-f-5 `UNHANDLED_FAILURE` | `RemoteData.match` and `.render` reject a missing case (TS2741) and an extra key (TS2353); `notFound` is required. Foldkit's `AsyncData.match` the same. Effect's `AsyncResult.builder` offers `exhaustive()` only when every slot is handled, and its error names the unhandled ones | tsc | reuse |
| — escapes from the above | A tag ternary (`d._tag === 'Ready' ? d.value : …`) and a cast both compile. `pnpm tags:check` refuses the ternary in `packages/*/src` only | checker, partly | extend `tags:check` to examples (small) |
| R-8 `UNGUARDED_SNAPSHOT` (a handler reading a value that may have no committed value) | `update` reads the same typed union from the Model and must narrow it | tsc | reuse |
| R-7 first paint (`await e -> v`) | `Initial` / `Loading` are explicit, and `render` draws each | construction | reuse |
| R-f-1..4 typed failure rows | Effect's `E` is kept through a Command. Remote's `RemoteError` is open by design: a transport failure carries any tag | tsc for Effect; open for Remote | reuse |
| R-9..R-12 probes (`latest`, `pending?`) and lanes | No in-flight version exists. The held value is in `Refreshing`; what is in flight is `Data.mutation` status, `Data.inspect(model).loading` and `Data.why` | — | not adopted |

### Holds and actions

| ReactiveScript | Foldkit Plus today | How it holds | Decision |
| --- | --- | --- | --- |
| H-2..H-4 an instant is held by its pending readers | Every Message commits. "Keep the old screen" is the Model keeping the old value | — | not adopted: deliberate |
| H-5, H-6 armed and disarmed boundaries | Per read, not per region: `RemoteData.render`'s `loading` is armed, its `Refreshing` branch is disarmed (it shows content with a `Freshness` tag) | construction | reuse |
| V-16 `deferred` (declared lag) | What `Refreshing` already is: the held value shows while the next loads | construction | reuse |
| V-9, AC-4 `refresh` re-asks quietly | `Data.refresh` marks per field and per connection; the read entries that observe the mark restart, others keep running. Tested (`packages/remote/test/domain.test.ts:1213`, `refreshActive.test.ts` + mutations); the per-field generation in `refreshedAt` too (`refreshedAt.mutations.ts`) | runtime law, mutation-tested | reuse |
| ST-2c pending per key | Per-field marks and failures in Remote's store | runtime law | reuse |
| H-11 optimistic: a guess over a source; truth corrects it; unrelated guesses survive | Remote predicts the layer from the declared write instead of taking it by hand, and checks the prediction (`Law.check`, `verifyPredictions`, `PredictionMismatch`, all mutation-tested). Visible against `Data.confirmed`, rejection removing exactly its layer, and later layers winning are tested (`domain.test.ts:380`, `optimistic.test.ts:34`, `:58`) and mutation-tested (`confirmed.mutations.ts`, `layers.mutations.ts`) | runtime law, mutation-tested | reuse |
| H-11 "verdict-inert": a guess does not make reads pending; `affects` opts in | Open: whether a pending write should make a read look loading is decided by Remote today, not per write ([comparison idea 2](./solid-2-optimistic-COMPARISON.md#ideas-worth-taking), #377) | — | open, #377 |
| H-11, R-4 an older question's late answer is superseded | Within one principal, by fiber interruption on restart. Across a `forget`, the reducer too: an answer from before it writes nothing (#484, below) | runtime law, mutation-tested across `forget` | reuse; within a principal, see hypothesis 1 |
| H-2 two writes to one slot join; overlapping actions | Ordered settlement per request id (#273): an earlier answer cannot revert a later write. `answerOrder.mutations.ts` (13 mutations), `repeatedAnswer`, and the server ledger's replay (`remote-drizzle/test/ledger.test.ts`) | runtime law, mutation-tested | reuse |
| AC-6 `until(predicate, { timeout })` | `Agent.when({ projection \| source, predicate, timeout })`. A Remote layer held until live data confirms it is not built (comparison idea 1) | runtime | reuse; idea stays with #377 |
| a live answer landing during a held action | While the write is pending, an absolute layer shows over any live patch, and a relative one (`adds`) resolves over the value the field held before the stream first wrote it, so its own echo is not counted twice (#498, `temporal.test.ts`); the base follows the stream and `Data.confirmed` reads it. An answer that disagrees with what a stream wrote meanwhile is written and the field read again (#499). After the answer, a stream's patches to the fields it wrote are not written until that stream sends the answer back; one that disagrees is read again (#485, `echo.test.ts`, `echo.mutations.ts`) | runtime law, mutation-tested | fixed (#485, #498, #499) |

### Regions and the server

| ReactiveScript | Foldkit Plus today | How it holds | Decision |
| --- | --- | --- | --- |
| O-2 a region's release ends its flights | A Surface that stops being active drops its requirements, and its read entry's stream ends. Timeouts are tested and mutation-tested (`deadline.test.ts`, `callTimeout.mutations.ts`) | runtime | reuse |
| SV-4 state is per request; a principal change | `Data.forget` raises a floor every read and live entry restarts from, and every answer carries the generation it was asked under; one from before the floor writes nothing (#484, `forget.test.ts`, `overlappingReads.test.ts`, `forgetAnswers.mutations.ts`). The floors in `refreshedAt` and `liveEntry.ts` are mutation-tested too (`refreshedAt.mutations.ts`, `liveFloor.mutations.ts`) | runtime law, mutation-tested | fixed (#484) |
| SV-3b answers cross; SV-3c determinism | `foldkit-ssr`'s resume plan; `determinism.test.ts` renders under two zones and locales; the build id refuses another build's page | runtime law | reuse |
| SV-3e input before hydration | A handler that makes the page wait for the live runtime (ssr-PLAN G1) | runtime | reuse |

## Counterexamples to look for first

Each is a test to write before any API.

1. **A late read answer lands after the read was superseded.** The read
   entry restarts when its refresh generation changes and the old fiber is
   interrupted, but a `ReadReceived` already queued behind the restart is
   applied (the "restart speaks after the Messages already queued" trap in
   `CLAUDE.md`). Two cases matter.
   - **After `Data.forget`: reproduced and fixed (#484).** The lagging-restart
     driver in `packages/remote/test/overlappingReads.test.ts` queued the old
     principal's answer behind a `forget`, and the row read `Ready` in the new
     session. `ReadReceived`, `ReadFailed`, `ConnectionMerged`, `QueryFailed`
     and `LiveReceived` now carry the generation they were asked under, and
     the reducer drops one from before the floor. The old start's loading
     marks are still cleared by the restart's abandonment, so no row stays
     `Loading`.
   - **After a refresh, within one principal: ruled out in one entry,
     undecidable across two.** In one read entry the old answer can only be
     queued before the restart (the restart interrupts its read), and the
     restarted read's answer after it, so the newer one lands last. Two
     entries reading one row can be answered out of order, but the wire
     carries no row revision, only when each read was asked, and a read asked
     earlier may be answered with newer data. Ordering by ask time would be a
     guess; a sound rule needs a revision on `NormalizedEntity`. Not adopted
     until a server can send one.
2. **A live patch flickers a predicted row: reproduced (#485).** While the
   write is pending an absolute layer wins: another principal's live patch
   shows the prediction. (A relative layer used to count the echo of our own
   write on top of itself; #498 resolves it over what the field held before
   the stream wrote it.) Once
   the answer lands it reads back what the prediction moved and releases the
   layer (#265); a live event committed before the write but delivered after
   the answer then patches the base, and the row reads the old value until
   the stream reaches the write's own event. `MutationResult` carries no
   stream position, so the reducer cannot tell. Fixed as #485, as Solid's
   `until` and comparison idea 1 suggest, with one change: a stream that
   coalesces (`pollLive`) may never send the write back, and a timeout would
   then hide a later change for good, since nothing sends it again. So a
   disagreeing patch is read again instead of waited out, and the read asked
   after the answer decides. The wait lives in the store, not in the layer,
   so `Data.confirmed` keeps the answer too.

## What stays a rule

Three properties cannot be checked in a JavaScript program, and a typed DSL
does not change that, because its escape is ordinary JavaScript:

- a view that performs I/O;
- a Message carrying a value worked out from an older Model (AC-1e's lost
  update);
- `Projection.derive`'s callback reading more than its `on` names.

The first two stay documented rules with frame-held tests. The third can be
closed for a subset, which is #483's job.

## What each issue should do

- **#482 (temporal laws) goes first.** It is the only issue with a candidate
  defect. Hypothesis 1's `forget` case was #484 and hypothesis 2 was #485;
  the refresh case needs a wire revision first. The missing mutations are
  written (refresh marks, the live floor, `Data.confirmed`, the layers, call
  timeouts: 23 of 23 killed). Build on `Trace.run` and the lagging driver; export the
  driver from `foldkit-remote/testing` only if a second test file needs it.
  No Solid oracle: no row above calls for frame-level parity.
- **#483 (Projection reads)** has one real target: `Projection.derive`'s
  unchecked `on`. `Derived` carries no `metadata`, but it is a view-side memo,
  not a Surface's read, so no Remote requirement is lost through it. Measured
  2026-11-07: the tree has three calls. `SlotView.region`
  (`packages/mixins/src/slotView.ts:642`) derives a Projection's own `read`
  from that Projection, complete by construction; the two in domains-plus
  (`searchViewState.ts:86`, `view.ts:442`) derive with functions over Remote
  reads (`stateOf`, `answeredOf`), which no symbolic expression subset can
  express. A checked `Projection.fromExpr` would cover none of the risky
  calls, so it is not worth building. What would catch the defect is P-3
  tested at run time: in development, when the memo hits, also run the
  function and compare the two with `Equal.equals`, and report an `on` that
  misses a read. No new API.
- **#481 (async boundaries)** needs no new API. `RemoteData.match` /
  `.render`, `AsyncData.match` and `AsyncResult.builder` already reject what
  the issue lists, and a pipeable `View.matchRemote` would forward to
  `render`. Two small items remain: `tags:check` over examples, and
  `Failed.previous`, which `match` gives as an `Option` while a raw read
  gives `A | undefined`.
- **#478 (pipeable Expr)** is developer experience, not an async guarantee:
  `Expr` and `Predicate` are not `Pipeable` (`Query` is), and user-defined
  symbolic functions already exist (`Expr.operator` with `definedAs`).
  Nothing in this audit depends on it. Schedule it on its own merits.
- **#479 (type contracts)**: most of its table is already true. `Write` and
  `Expr` are disjoint types, so no write can appear in a predicate.
  `Query.where` refuses a predicate over another Entity through
  `Reads<Names>`, and exhaustive cases are #481's. Probed 2026-11-08:
  `Reads` names Entities by name, so a predicate over another Entity defined
  as `Post` type-checks in a query from `Post`. The run-time check compares
  identities and refuses it when the query is defined; its message now says
  the field belongs to a namesake, where it read "reads Post.secret, but the
  query is from Post". A type that told them apart needs an identity in the
  type (a unique symbol per definition), which no consumer has asked for.

## Order

Done: #484 (`forget`), #485 (live patches after an answer), #482's missing
mutations, #481's `tags:check` over the examples, and #483's check, a
per-call switch (`Projection.derive(on, derive, { verify })`), since the
packages never read development mode themselves and an application passes
`import.meta.env?.DEV` as `verifyPredictions` takes it. Decided against:
`Failed.previous` as an `Option`. It would break a published union with about
thirty readers, and `RemoteData.match` already hands it out as one, so a
reader who wants the `Option` has it. Open:

1. #482 hypothesis 1's refresh case: needs a row revision on the wire.
2. #478 and #479 when their own consumers ask.
3. #480's end-to-end proof through SSR and replay, which needs a browser run.
