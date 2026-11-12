# #377, #439, #440: Remote's data plane

Status: decided 2026-11-10 (decisions delegated by the owner). Phase 1
(#498 and #499, with no wire change) is built, and so is phase 2 (`writing`,
below). Phases 3 and 4 are not scheduled.

The decisions are in section 6, and what the coordinator does with the
issues is in section 8. Sections 1 to 5 are the note as proposed, corrected
where a decision changed them; each correction says so.

Three issues ask Remote to do less work or show less wrong: decode less
(#440), re-check less after a write (#439), and flicker less while a write is
pending (#377). They share one path, so they are one note:

```text
Selection -> fields on the wire -> store (encoded) -> read (assemble, decode, memo)
write -> layer -> answer / live patch -> store -> impact on lists -> regions redrawn
```

Line numbers are at `1c1956b`. Two things in this note were measured for it,
on 2026-11-10: Schema's share of two client bundles (section 1), and four
traces of a live patch landing while a write is pending (section 2.3). The
commands are given beside each.

Related work, referenced and not repeated: #482's law matrix
(`482-temporal-laws-MATRIX.md`, in progress beside this note) and #481's
async boundaries. The audit they come from is
[480-async-guarantees-DESIGN.md](./480-async-guarantees-DESIGN.md).

## Summary of what is decided

| Issue | Decision | Why |
| --- | --- | --- |
| #440 selection codecs | Record the measurement and close. | Decoding is already per Selection. What generation could still remove is under 1 kB of 217 kB. |
| #439 invalidation map | Keep deferred, retitled. The static half (`Write` against `Query` body) and per-Entity versions each wait for a consumer. Write sets are not inferred from `update`. | The most it saves is about 1% of a frame; an inferred map is a second source of truth about `update`. |
| #377 idea 1, hold until live confirms | Reject. | #485's echo wait and the answer's own read already close the gap, without a timeout. |
| #377 idea 2, pending per write | Adapt: a derived read of what is pending, no option on the write. | A pending write already never makes a read look loading (#482's matrix). |
| #377 idea 3, a saving flag | Adapt: `writing`, derived from the ledger and the outbox. | A flag the application writes is a second owner of what the ledger holds. |
| #377 idea 4, live data mid-write (#498) | Adopt, by holding what a relative layer resolves over (H4), not by staging the patch. | A live echo of the client's own increment is counted twice until the answer. The base keeps the server's value, so `Data.confirmed` needs no rule. |
| #499, an answer older than a live patch | The same change as #498: an answer that disagrees with what a stream wrote while it was pending reads the field again. No field in `MutationResult`. | A stream's cursor is a counter per subscription, so no position exists that an answer could carry and the client could compare. |

## 1. The problem

### #440: decode only what a page reads

The issue says a page "decodes answers through each Entity's Schema, which
carries every field, check and transformation the Entity declares", and
proposes build-time decoders per Selection. Its first step is to measure
Schema's share of the client with #421's report, and to close if it is small.

`performance-PLAN.md` has no such number: its table attributes `effect`
whole (50.3 KB of 210.5 KB brotli). Measured for this note with the same
script, listing every module instead of the top 25
(`node scripts/bundle-report.mjs <example> --json <file>`, production build
against `dist`; brotli per module is an estimate, the total is real):

| | domains-plus | Chirp |
| --- | ---: | ---: |
| Client at start, brotli | 217.3 kB | 236.5 kB |
| Effect's Schema modules (`effect/Schema*`, `effect/internal/schema/*`) | 15.2 kB (7.0%) | 21.1 kB (8.9%) |
| of which `SchemaAST.js` | 7.3 kB | 7.5 kB |
| The application's Entity declarations | 0.76 kB (`domain/domain.ts`, `shared/domain.ts`, `shared/entity.ts`, `domain/cart.ts`) | 0.18 kB (`src/domain.ts`) |
| `foldkit-remote`'s `selection.js`, `rowRead.js`, `wire.js`, `client.js` | 2.6 kB | 2.7 kB |

Schema is a real share, but generated decoders cannot remove it. Foldkit's
runtime imports `Schema` itself (`node_modules/foldkit/dist/runtime/makeApplication.js:1`,
`hydrationHandoff.js:1`), every application Model and Message is a Schema,
and Remote's own Model and Messages are too (`packages/remote/src/model.ts`).
The interpreter stays in the bundle whatever Remote does with Entity fields.
What generation could remove is the Entity declarations a page does not
read: at most 0.76 kB in domains-plus and 0.18 kB in Chirp, 0.3% and 0.1%.

Decode CPU has no measurement of its own. `packages/remote/bench/read.bench.ts`
measures a whole read: 1.3 µs for a memo hit, about 22 µs to read a 25-row
list again after a write elsewhere (`performance-PLAN.md:229-238`). A row is
decoded once per version of its data and kept (section 2.1), so decoding is
paid on the first read of a row and after a write to it, not per render.

Wire size is not what #440 changes. A read already sends and receives only
the selected fields (section 2.1). The one measured size on record is a read
of many rows coalesced into one `POST` of 29,415 bytes
(`353-355-354-359-transport-DESIGN.md:19`).

Chirp's figures hold one finding outside this note: its client carries
`effect/internal/schema/toJsonSchemaDocument.js` (3.4 kB) and
`toRepresentation.js` (1.0 kB), and `foldkit-entity` at 20.0 kB against
domains-plus's 1.6 kB. Whether a page needs them is a question for #421's
cut list, not for #440.

### #439: check only what a Message can change

After #431 a region skips its redraw when its reads are unchanged, but every
region is still checked after every Message. The issue proposes inferring
each Message's write set by running `update` over generated Messages, and
checking only the regions whose reads meet it.

The plan measured the check before building the skip
(`performance-PLAN.md:229-240`, 2026-11-09):

- a region over Model paths checks a few identities, well under 1 µs;
- a Remote read with the store unchanged is a memo hit, 1.3 µs;
- a read again after a write to a row it does not show is about 22 µs for a
  25-row list and 100 µs for 100 rows.

Five 25-row lists cost about 0.1 ms per write, about 1% of domains-plus's
9 ms view frame. `declared-optimization-DESIGN.md` records the deferral. No
over-invalidation is measured: the 22 µs is a read assembling the same value
again, not a list refetched without cause. Refetches are decided by
`impactOn`, which keeps a list it can prove unchanged (section 2.2).

### #377: four ideas from Solid 2.0

From [solid-2-optimistic-COMPARISON.md](./solid-2-optimistic-COMPARISON.md).
The issue marks ideas 1 and 4 "checks first: write a test that shows whether
it happens". Since it was filed:

- #485 reproduced and fixed the flicker behind idea 1 (a live patch from
  before the write, delivered after its answer), by another route than a
  hold (`480-async-guarantees-DESIGN.md`, counterexample 2).
- #482's matrix records that no interleaving it runs makes a read `Loading`
  or `Initial` while a write is pending (its row "#377's hypothesised
  flicker"), which answers idea 2's factual half.
- Idea 4 was believed covered: "while the write is pending the layer wins
  over any live patch" (the audit's Holds table). Section 2.3 shows one case
  where it does not.

The issue names Chirp's commit `fdf7e79d` for idea 3. That hash is not in
this checkout (`git cat-file -t fdf7e79d` fails), so what the commit changed
is the issue's claim. The code it left is in section 2.3.

## 2. How it works today

### 2.1 From a Selection's fields to a decoded value

1. **A Selection names fields and builds its own codec.** `Selection.make`
   takes each picked field's Schema from the Entity
   (`packages/remote/src/selection.ts:202`) and builds one
   `Schema.Struct(picked)` of those alone (`:245`). `Selection.from` does the
   same from a `foldkit-entity` Selection (`:136`, `:173`). So the decoder a
   read runs already covers only the selected fields. The Entity's whole
   field record is still constructed where the Entity is declared, which is
   the 0.76 kB above.
2. **The request carries field names.** A read sends `{ entity, id, fields,
   windows, relations }` (`readRequestFields`, `packages/remote/src/wire.ts:135`), at most 256
   fields (`:106`, `:110`), relations nested to depth 8 (`:108`).
3. **The server reads what it allows of them.** `readAs` narrows the asked
   fields to those the source declares and `authorize` allows, runs `filter`,
   and copies only the allowed fields into each record
   (`packages/remote-server/src/index.ts:259-282`).
4. **The answer is not decoded per Entity on the wire.** A row arrives as
   `NormalizedEntity`, whose `values` is `Record<string, unknown>`
   (`wire.ts:154-158`); a live patch likewise (`wire.ts:364-372`). The wire
   codec validates the envelope, not the fields.
5. **The store holds encoded values.** `writeEntities` and `writeEntity`
   (`packages/remote/src/store.ts:142`, `:162`) keep what the server sent.
   Persistence, the SSR resume plan and a mutation's `shown` all read that
   encoded form.
6. **A read assembles, then decodes, once.** `assemble`
   (`selection.ts:309`) gathers the selected fields from the store, following
   relations. `rowRead` decodes the result with the Selection's codec
   (`packages/remote/src/rowRead.ts:74`) and keeps it by entity key and by
   the row's `values` object, up to 4,096 rows per Selection (`:51`), so an
   unchanged row is not decoded again (#384).

The issue's premise, that a page decodes through each Entity's whole Schema,
does not hold: step 1 is the per-Selection decoder #440 asks for, built at
run time from the declarations.

### 2.2 From a write to the reads it invalidates

1. **The changes.** A mutation's answer or a live event carries patches.
   `changesOf` (`packages/remote/src/changes.ts`) works out each row's
   changed fields against the store.
2. **Each held list is judged per change.** `bodies.ts:117` calls `impactOn`
   (`packages/remote/src/impact.ts:188`), which answers `Kept`, `Placed` or
   `Invalidated` with a reason:
   - a list with no body is invalidated by any change, of any Entity
     (`:200-205`, #477);
   - a change to another Entity than the body's is `Kept` here (`:206`);
   - otherwise the changed fields are compared with the order's fields, the
     predicate's fields, and `reached.own`, the row's own links a path starts
     from (`:243`).
3. **What a body reads through other rows.** `reachedOf` (`impact.ts:77-112`)
   walks `Query.dependencies(body).reaches`: a path, an exists with its
   `where` (`:101-104`), a path from the viewer. `readsThrough` (`:122`)
   asks whether a change writes any of it. When one does, the list is judged
   again over the store (`rejudged`, `:142`) and also fetched
   (`bodies.ts:129-146`), since a row the store lacks may have joined.
4. **Refresh.** An invalidated list is marked stale with its reason and its
   refresh generation moves (`invalidateConnections`, `model.ts:1151-1164`);
   the read entry that observes the mark restarts.
5. **Regions.** A Remote read declares no Model path, so a region over one
   reads on every render and is redrawn only when the read gives another
   value (`packages/mixins/src/slotView.ts:636`,
   `packages/surface/src/index.ts:657`). A read's value is kept by the
   identity of the store entries it visited (`rowRead.ts`).

The static question "which lists can this declared write reach?" has no API.
`packages/remote/test/writeTrace.test.ts:180` answers it in twenty lines
over `Write.writes` and `Query.dependencies` (#477), for a test. That helper
omits what an exists' `where` reads, which `reachedOf` includes
(`impact.ts:101-104`): a function built from it must not copy the omission.

### 2.3 Layers, `Data.confirmed`, and live patches

- **A layer is over the base store.** `MutationStarted` appends one
  (`model.ts:2116-2142`). `visibleStore` applies every layer's patches over
  the base on each read (`packages/remote/src/optimistic.ts:210`). A patch is
  absolute (`values`) or relative (`adds`, `computes`), and a relative one is
  worked out over the row under it each time (`resolvedPatches`, `:310`).
  Relative patches come from `Write.increment` and from predicted
  `Derived.count` members (`packages/remote/src/mutation.ts:114`, `:229`).
- **`Data.confirmed` is the same read with the layers left off**
  (`packages/remote/src/domain.ts:935-956`). It adds no state.
- **The answer releases the layer and writes the truth in one reduction.**
  `MutationSucceeded` (`model.ts:2143-2198`) removes the layer
  (`settleSuccess`, `optimistic.ts:393`), writes the answer's patches, and
  writes the answer's `read`: the fields the client showed that the patches
  left out (#245, #265). No frame has the layer gone and the value missing,
  unless the answer omits a shown field, which `verifyPredictions` reports
  as a `Gap` (`packages/remote/src/answerGaps.ts:24`).
- **After the answer, a lagging stream cannot undo it.** The answer's values
  are awaited as echoes (`awaitEchoes`,
  `packages/remote/src/liveEvents.ts:48`). Until a stream sends them back, a
  patch of its that disagrees is not written and the field is read again
  (`heardBack`, `:76`; `model.ts:2265-2296`). This is #485.
- **While a write is pending, a live patch writes the base under the
  layer** (`applyEntityEvent`, `liveEvents.ts:113`). Echoes are awaited only
  from the answer on, so nothing holds the patch.

That last point is right for an absolute patch and wrong for a relative one.
Four traces, run through `Data.reduce` on a `Post` read live with `title`
and `likes: 10` (a scratch test in `packages/remote/test`, deleted after;
each cell is visible / `Data.confirmed`):

| Layer | Live patches before the answer | Start | After each patch | After the answer |
| --- | --- | --- | --- | --- |
| `adds: { likes: 1 }` | `likes: 11` (the write's own echo) | 11 / 10 | **12** / 11 | 11 / 11 |
| `adds: { likes: 1 }` | `likes: 11` (someone else's), then `likes: 12` (own echo) | 11 / 10 | 12 / 11, then **13** / 12 | 12 / 12 |
| `values: { title: 'New' }` | `title: 'Other'`, then `title: 'New'` | New / Hi | New / Other, New / New | New / New |
| `values: { title: 'New' }` | `title: 'New'` (own echo) | New / Hi | New / New | New / New |

In rows 1 and 2 the stream delivers the write's own effect before the
answer, the base moves to the server's count, and the layer adds one to it
again. The count shows one too many until the answer lands. The client
cannot tell its own echo from another person's like: both are a patch of
`likes`. #482's matrix row "a live patch during a pending write shows the
layer, not the patch" tests absolute patches only.

**Pending and saving, as an application reads them today.**
`Data.mutation(model, requestId)` gives `Unknown | Pending | Applied |
Failed` (`packages/remote/src/ledger.ts:203-217`). `outboxStatus` counts
durable writes as `waiting`, `failed` and `waitingForSignIn`
(`packages/remote/src/outbox.ts:784`, `:800-827`). `Data.why` names a
pending layer's fields on a row (`packages/remote/src/whyReasons.ts:150`).
`waiting` counts a write from the moment it is queued, so a line drawn from
it alone shows for every write on its way. Chirp's view says so and filters
by `attempt > 0` itself (`examples/chirp/src/view.ts:202-218`).

## 3. Options

### 3.1 #440

| Option | Saves | Costs | Invariants |
| --- | --- | --- | --- |
| A. Record the measurement, close | Nothing | Nothing | All kept |
| B. Build-time decoders per Selection | Up to 0.76 kB (domains-plus), 0.18 kB (Chirp) of declarations. The Schema interpreter stays. | A Vite pass evaluating every Selection; a second decoder per Selection that must agree with the Schema; a round-trip suite per example | The store must stay encoded exactly as now, or persistence, resume and `shown` break |
| C. Skip decoding where every picked field is its own encoded form | First-read CPU, unmeasured | Checks would be skipped too | Breaks "untrusted input crosses a validation boundary first" |
| D. A columnar wire for lists (field names once per page) | Bytes before compression | A protocol version (`wire.ts:15`), both peers, the SSR resume format | "The wire carries every field the client sends, with the same types" must be re-proved for a new shape |

B is the issue's proposal. Its checker would be sound (decode and encode
agree with the full Schema over generated values), but it protects a saving
too small to measure in load time, and it adds a second way to decode a
Selection. C is rejected outright: the Selection's decode is the client's
only validation of field values, since the wire types them `unknown`.
D is a different issue. It is listed because "wire codecs" suggests it;
nothing measured says uncompressed JSON size is a cost here.

### 3.2 #439

The issue joins two things with different owners.

**The Model half: which Model paths does a Message write?**

| Option | How | Tradeoff |
| --- | --- | --- |
| M1. Infer by running `update` over generated Messages | Record changed paths per tag in tests; ship the map | The map is a recorded claim about a function. It is complete only for the Messages and Models the generator reached. A missed write is a region left stale in production, caught only in development. It must be regenerated on every `update` change. |
| M2. Declare on a Bundle part | `writes: [App.model.cart]` beside `update` | Honest, but a declaration nobody is forced to keep true, checked the same way as M1 |
| M3. Compare identities at render (today) | A region compares the values at its paths | Under 1 µs per region. Cannot be wrong. |

M3 is what runs, and the measurement says M1 and M2 would save well under
1% of a frame for regions over Model paths. They also add a second source
of truth: the map says what `update` writes, and `update` says it too.
Sync's replay already refuses a durable Message that changes a field outside
the shared slice; that check compares before and after, as M3 does, and
needs no map.

**The Remote half: which reads can a store write change?**

| Option | How | Tradeoff |
| --- | --- | --- |
| R1. A static `Write` against `Query` function | `Remote.reaches(write, query)`: `'reads' \| 'unaffected' \| 'unknown'`, from `Write.writes` and `Query.dependencies` with `reaches` | Exact for declared writes over bodies. `unknown` for a handler mutation or a body-less query. Useful to `explain`, tests, and #437's index check. Saves no run time alone. |
| R2. A version per Entity name in the store | Each store write moves its Entity's counter; a list read keeps its value while the counters of every Entity it reads are unchanged | Removes the 22 µs for lists of other Entities. No declaration to trust: the counter is a fact. Does nothing for a write to another row of the same Entity. |
| R3. Do nothing | | 0.1 ms per write on a page of five lists |

R2 is the only option that removes measured work without a claim to check,
and it lives in the store Remote already owns. It should still wait for the
page the plan names (ten 100-row lists is about 1 ms).

Invariants for any of these: a body's reads are `fields` and `reaches`
(three traps record what happened when `reaches` was left out); a query with
no body is `unknown`, never unaffected; members are compared by owner
identity, not name (`477-write-trace-DESIGN.md`, edge 2); and a list's read
depends on its Selection's fields at every nesting level as well as its
body's.

### 3.3 #377

Per idea in section 4. The invariants for all four: Remote's Model is the
one owner of pending state; a Message commits at once, so there is no held
instant (the audit's "one difference"); a durable write replayed from the
outbox must reach the same state; `Data.confirmed` must stay a read of what
the server said.

### 3.4 Composition

The three do not depend on each other. #439's R1 and #377's `Data.writing`
both read declarations already in the tree. #377 idea 4, as decided (H4),
adds one input to the visible read where a relative layer is pending, and
one read after an answer a stream disagreed with. It writes the store when
the patch arrives, as today, so R2's counters move then.

## 4. #377, idea by idea

### Idea 1: hold a layer until live data confirms it. Reject.

The hold exists in Solid because the optimistic value resets when the
transition ends, so the transition must be kept open until the truth is in.
Remote has no such gap. The answer writes the truth in the reduction that
releases the layer (section 2.3), and a stream that lags the answer cannot
overwrite it (#485).

A hold would need a timeout, and the audit already found why that is wrong
here: a stream that coalesces (`pollLive`) may never send the write back, so
the hold would always run to its timeout and then hide a later change. It
would also be a second definition of "settled" beside the ledger's.

Two cases remain, and neither needs a hold:

- **An answer that omits a shown field.** Reported as a `Gap` by
  `verifyPredictions`. The fix is the server answering what `shown` asks.
- **An answer older than a live patch already delivered** (#499). #482's
  matrix has this open (its `it.fails` row): the answer overwrites the newer
  value and nothing reads again. As proposed, this note said it needs a
  position in `MutationResult` and left it to #482. That premise is wrong,
  and decision 5 settles it with idea 4 (section 6, "#499").

Seam used: none. Second owner: a hold would have been one.

### Idea 2: pending as an explicit choice per write. Adapt.

Solid's default is that an optimistic write makes nothing pending, and
`affects` opts in. Remote already has the default: a pending layer changes a
read's value and never its tag (#482's matrix). A row only a pending create
holds reads through its layer like any other.

What is missing is the opt-in's use: a view that wants to dim a row or
disable a button while a write to it is unanswered. Making the read
`Refreshing` would be wrong, since `Refreshing` means a newer answer is on
its way for a read, and it would change what every `RemoteData.match`
caller sees. An option on the write (`affects: [...]`) would store, per
write, a list of reads the layer already implies.

Adapt as a derived read: `Data.writing` (idea 3) answers for a row as well
as for a request. The view composes it beside the read, as it composes
`Freshness`. #481 owns `RemoteData`'s shape; this adds no tag to it.

Seam used: the layers and the ledger. Second owner: none.

### Idea 3: a typed saving flag. Adapt.

In Solid the flag is an optimistic boolean the action writes and the
transition reverts. Here a flag in the application's Model would be written
by `update` on the click and cleared by `update` on `MutationSucceeded` and
`MutationFailed`, which the application hears only if it shares those
Messages. It would be wrong after a reload, when the outbox restores the
write and no click happened, and in a second tab. The ledger and the outbox
already hold every fact the flag would copy.

The defect the issue cites is real and still costs each application a
derivation: Chirp filters `outboxStatus` by `attempt > 0` so its "waiting to
send" line does not flash for every chirp on its way.

Adapt as one derived read with the states a view needs told apart, sketched
in section 5. It replaces Chirp's hand-written filter and gives idea 2 its
per-row answer.

Seam used: `mutations` (the ledger), `outbox.queue`, `optimistic.layers`.
Second owner: none; it is a pure function of Remote's Model.

### Idea 4: hold live data that lands mid-write. Adopt, narrowly.

Section 2.3 reproduced the flicker for relative layers. Solid stages any
truth that arrives during an action. Remote should stage less: only a live
patch to a field that a pending layer patches relatively (`adds` or
`computes`). An absolute layer already shows the right value whatever the
base does, and letting the base move under it keeps `Data.confirmed`
current, which the Agent's completion check reads.

Three ways to do it:

| Option | Visible during the write | After the answer | Cost |
| --- | --- | --- | --- |
| H1. Stage the patch: keep the field's live value in Remote's Model beside `echoes`, do not write it to the base | The prediction over the base as it was when the write started | The answer's value. If the staged value differs from the answer's, read the field again, as `contradicted` does today. On a failure, write the staged value. | One record in `RemoteModel`; `Data.confirmed` lags for that field until the write settles |
| H2. Freeze a relative patch to an absolute value when the layer begins | The prediction, fixed | The answer's | Breaks rebasing: two pending likes, the first fails, the second still shows both |
| H3. Write the patch to the base and subtract the layer's own delta if the patch "looks like" the echo | Right when the guess is right | The answer's | A guess. Row 2 of the traces shows the echo cannot be told from another write |

**Decided: H4, a fourth way, which is H1 turned round** (decision 5).

| Option | Visible during the write | After the answer | Cost |
| --- | --- | --- | --- |
| H4. Write the patch to the base as today. Keep, in Remote's Model, the value each patched field had before the first live patch that landed while a write was pending. A relative patch resolves over that kept value | The prediction over the base as it was when the first patch landed | The answer's value. If the base, as the stream left it, differs from the answer's value, read the field again | One record in `RemoteModel`, and one more input to the visible read. `Data.confirmed` is unchanged and current |

H1 keeps the server's newer value out of the store and must put it back at
every way a write can end: written on a failure, written when the answer
omits the field, dropped on `forget`. H4 keeps the store what the server
last said, so a failure, an answer `Gap`, persistence, the SSR resume plan
and a mutation's `shown` need no new rule, and decision 6 has nothing left
to decide. The same record is what #499 needs (section 6). The rest of this
section is H1 as proposed, kept for the reasoning that carries over: the
visible cost and the bounds are H4's too.

H1 was the recommendation. It reuses the two mechanisms #485 built: the
store-side wait (so the layer and `Data.confirmed` need no new rule) and the
read-again that settles a disagreement without a timeout. It stays in
Remote's Model, so it survives a replay and is collected with its row.

Its one visible cost: while my like is pending, another person's like that
arrives by the stream is not shown until my answer lands. The count is then
at most stale by the length of one request, and never too high. For
`Data.confirmed`, staging means the confirmed count also waits; an
alternative is for `Data.confirmed` to read the staged value, since it is
the server's. That is decision 6.

A staged patch must respect the same bounds as `echoes`: dropped on
`forget`, on a live delete of the row, and after `echoKept`
(`liveEvents.ts:41`) if the write never settles. A durable write waiting in
the outbox for hours must not stage for hours: staging applies only while
the request is in flight, not while it is queued and delayed.

That last rule is corrected by decision 5. A durable write between attempts
has been sent and not answered (`attempt > 0`), so the server may have
applied it, and its echo can arrive while the outbox calls it waiting. The
bound is by age alone: a kept value older than `echoKept` is dropped, and
the layer then resolves over the base as it does today.

Seam used: `applyEntityEvent`'s context, `RemoteModel.echoes`' neighbour,
`resolvedPatches`' input (`optimistic.ts:310`), `askedAgain`. Second owner:
none.

## 5. API sketch and phases

Everything below is **pseudocode**: none of it exists, and no snippet is
copyable.

```ts
// pseudocode: #377 ideas 2 and 3
type Writing = TaggedUnion<{
  None: {}
  // Sent, no answer yet, first attempt.
  Sending: { requestIds: ReadonlyArray<string> }
  // A send went unanswered and will be tried again (the outbox's attempt > 0).
  Unanswered: { requestIds: ReadonlyArray<string>; error: Option<RemoteError> }
  WaitingForSignIn: { requestIds: ReadonlyArray<string> }
  Failed: { requestIds: ReadonlyArray<string> }
}>

writing(Data, model)                   // every write of the domain
writing(Data, model, { mutation })     // one Mutation's writes
writing(Data, model, { row: ref })     // writes whose layer patches or deletes this row
```

The worst state among the matching writes wins, in the order `Failed`,
`WaitingForSignIn`, `Unanswered`, `Sending`. `row` takes an `EntityRef`, not
a name string. The union is built with `defineTaggedUnion` and matched with
its `match`.

Decisions 8 and 9 changed three things in this sketch. It is a function of
the domain and the Model, as `outboxStatus(Chirps, model)` is, not a method
on `Data`. `mutation` takes the Mutation, not its name. And two facts the
sketch got wrong are for the implementer to settle against the code before
the union is fixed: the outbox has a fifth state, `Unreadable`
(`packages/remote/src/outbox.ts:771`), which the union must carry or fold
into `Failed` with a reason; and an outbox item's `requestId` is the write's
operation id (`outbox.ts:808`), while the ledger keys by the client's request
id, so `requestIds` must say which of the two it holds.

```ts
// pseudocode: #439 R1, only when a consumer exists
Remote.reaches(write, query): 'reads' | 'unaffected' | 'unknown'
```

Idea 4 has no API: it is a change to the live reduction, visible only as the
absence of the extra count.

**Phases.** Each ships alone. Phase 1 is as decided, not as proposed.

| Phase | What | Measured or shown by | Tests |
| --- | --- | --- | --- |
| 0 | #440: add section 1's table to `performance-PLAN.md`; close #440 | The table | None: no code |
| 1a | #498 (H4): a relative layer resolves over the value kept from before the first live patch | The four traces of section 2.3 as a table test: visible never exceeds the server's count in any frame, and `Data.confirmed` is the stream's value in every frame | The `it.fails` at `temporal.test.ts` "does not count a write's own live echo twice" becomes `it`; a mutation spec that resolves over the base again must be killed by rows 1 and 2; one case through the live entry with a lagging driver (`overlappingReads.test.ts`'s), the echo queued ahead of the answer; a failure shows the base at once; the record dropped on `forget`, on a live delete, and after `echoKept`; a second pending like whose first fails, and one whose first succeeds; a `computes` whose operand a live patch moves; the visible read's memo misses when the record changes and hits when it does not (two transitions) |
| 1b | #499: an answer that disagrees with what a stream wrote while it was pending writes its value and reads the field again | The matrix's trace: answered after the third event, the read is `Refreshing` with a read planned, and the read's answer is what stays | The `it.fails` "does not let a late answer overwrite a newer live patch" is rewritten to assert the read planned and the value after `ReadReceived`, as its neighbour "reads the field again when a patch after the answer is not the answer" does; the three passing positions keep their frames, and "never Ada once the answer is in" stays; a stream that coalesces past the write (the newer value, never the write's own) is read again; an answer equal to what the stream left plans no read; a write with no prediction; mutations dropping the comparison and the record |
| 2 | #377 ideas 2 and 3: `writing` | Chirp's `waiting` becomes a match on it, with its browser test unchanged | A table over the ledger and outbox states, one row per variant, `Unreadable` included; mutations for the precedence order and for `attempt > 0`; a restored outbox and a second tab (`outboxTabs.browser.test.ts`) read the same state; a type test that `row` refuses a string and `mutation` a name; `scripts/test/readOnlyPage.test.ts` unchanged |
| 3 | #439 R1 (built by A1 of the build-deferred note, no longer waiting for a consumer) | Replaces `writeTrace.test.ts`'s local `candidate` | The #477 fixture, plus an exists whose `where` reads the written member (the helper's omission), a namesake Entity, a handler mutation; mutations dropping each reach variant |
| 4 | #439 R2, when a page with many long lists exists | `read.bench.ts`: a list read after a write to another Entity falls from about 22 µs to a memo hit | In development, compare the kept value with a fresh read and report a difference (the pass's checker); a nested Selection reading a second Entity; a body reaching a third |

**Phase 2 as built.** `writing(Data, model, { mutation, row })` is exported
from `foldkit-remote`'s root (`packages/remote/src/writing.ts`), and the root
export held `scripts/test/readOnlyPage.test.ts` unchanged: to make that so,
`statusOf`, `heldFrom`, `sendable` and `signedKey` moved out of `outbox.ts`
and `outboxStore.ts` into `outboxStatus.ts` and `queue.ts`, and a page that
calls `writing` keeps those two modules and `writing.js`, no outbox code.
The union has the outbox's fifth state, `Unreadable`, as a variant of its own
ranked below `Failed`, since only `Data.dismiss` clears it. `requestIds` are
request ids throughout: a durable write's operation id is its request id
(`StoredWrite.operation`, `queuedWrite`), so the two spaces are one. A refused
write shows no layer, so `row` reads it nowhere, and a `mutation` the domain
does not register throws, as `Data.failedWrites` does.
Chirp's `waiting` (`examples/chirp/src/view.ts`) stays on `outboxStatus`,
decided 2026-11-10: it asks whether any write is unanswered and counts every
waiting write of every mutation, deletes included, while `writing` reports
the single worst state, so a refused chirp beside an unanswered one would
hide the line. `outboxStatus` already answers that per-state question; a
second way to ask it in `writing` is not added.

Phase 1 comes first because it holds the only defects. 1a and 1b share one
record and one reduction, so they are one change with two commits, each
turning its own `it.fails` green; #482's matrix rows change in the same
commits. Phases 3 and 4 are not scheduled.

## 6. Decisions

Decided 2026-11-10, delegated by the owner. Each item keeps the options as
proposed, then the choice and its reason. Line numbers in this section are
at `c31754c`.

1. **#440: close on the measurement, or build the generator?**
   Options: (a) record section 1's table and close; (b) build per-Selection
   decoders for at most 0.76 kB.
   Recommendation: (a).

   **Decided: (a).** The issue's premise does not hold: a read already
   decodes through a Struct of the picked fields alone
   (`packages/remote/src/selection.ts:245`, decoded at `rowRead.ts:74`). The
   Schema interpreter stays whatever Remote does, since Foldkit's runtime
   and Remote's own Model import it, so a generator could remove 0.3% of
   domains-plus's client and would add a second decoder per Selection that
   must be kept equal to the first.

2. **#440: is a smaller wire for lists wanted at all?**
   Options: (a) no, nothing measured asks for it; (b) file a separate issue
   to measure uncompressed list payloads first.
   Recommendation: (a).

   **Decided: (a).** No measurement names uncompressed JSON size as a cost,
   and an issue filed to go looking for one is work with no reader. The rule
   for reopening: a profile of a real page in which parsing or transfer of a
   list answer is a named share of a slow interaction.

3. **#439: infer write sets from `update`?**
   Options: (a) no: keep identity comparison, and drop the inferred map from
   the issue; (b) infer in tests with a development checker, as filed.
   Recommendation: (a). The saving is under 1% of a frame and the map is a
   second statement of what `update` does.

   **Decided: (a).** The check it would skip costs under 1 µs per region
   over Model paths and cannot be wrong; the map can be, and a miss is a
   region left stale in production. It would also have to be regenerated on
   every `update` change, which nothing enforces.

4. **#439: what remains of it?**
   Options: (a) close; (b) keep it open for R1 (the static function) and R2
   (per-Entity versions), each waiting for its consumer; (c) build R2 now.
   Recommendation: (b), retitled to say so.

   **Decided: (b), with a trigger written into the issue for each half.**
   R2 is the only option that removes measured work without a claim to
   check, but the work is 0.1 ms per write on the largest page there is, so
   building it now would be tuning with no page that needs it. R1 is built
   in the change that first needs it (#437's index check or `explain`), and
   replaces `writeTrace.test.ts`'s helper then, including the exists'
   `where` that helper omits. R2 is built when `read.bench.ts`'s figure
   times a real page's lists passes 1 ms per write. Until one of those
   happens the issue holds no work.

   **Superseded for R1 on 2026-11-12** by [decisions-2026-11-12-build-deferred.md](./decisions-2026-11-12-build-deferred.md) (A1): R1 is
   built now, with `explain` naming the writes that reach a list, since its
   tests and `explain` are a consumer. R2 stays unbuilt on its measurement,
   and #439 is reopened.

5. **#377 idea 4: stage live patches under a pending relative layer?**
   Options: (a) H1, stage and read again on disagreement; (b) H2, freeze
   relative patches; (c) leave it, since the extra count lasts one request.
   Recommendation: (a). A like count that reads one too many is the kind of
   wrong a reader notices.

   **Decided: fix it, by H4, a narrower variant of (a).** The defect is
   real and pinned (#498, the `it.fails` "does not count a write's own live
   echo twice while it is pending" in `packages/remote/test/temporal.test.ts`).
   H1 holds the patch out of the store, which makes the store lag the server
   and needs a write-back at every ending of a write. H4 lets the patch
   write the base as it does today and holds the other side: Remote's Model
   keeps the value a field had before the first live patch that landed
   while a write was pending, and a relative patch resolves over that kept
   value (`resolvedPatches`, `packages/remote/src/optimistic.ts:310`).

   The rules of the record, which #499 shares:

   - **What is recorded.** For a row a live patch writes while any request
     of the domain is pending: each patched field, the value the base held
     before the first such patch, and when it was heard. A later patch to
     the same field leaves the kept value alone.
   - **Who reads it.** A relative patch (`adds`, `computes`) reads the kept
     value of every field it reads, its operands as well as its target. An
     absolute patch reads nothing of it. `Data.confirmed` reads nothing of
     it.
   - **When an entry goes.** When an answer writes the field; when no
     request is pending; on `forget`; on a live delete of the row; and when
     it is older than `echoKept` (`liveEvents.ts:41`). After the last, the
     layer resolves over the base as it does today: a write unanswered for
     a minute may show the extra count, which is today's behaviour and
     bounded.
   - **A failure** drops the layer, and the base, which already holds the
     stream's value, shows through. Nothing is written back.
   - **Two pending writes to one field.** They resolve over the same kept
     value. When the first is answered, its answer writes the field, the
     entry goes, and the second resolves over the answer.

   The visible cost is the one section 4 states for H1: another person's
   like that arrives while mine is pending shows when my answer lands. The
   count is never too high. `Data.confirmed` may read above the visible
   count for the length of one request, which is correct: it is what the
   server said.

   **#499 is the same design, and needs no protocol change.** The note as
   proposed, #482's matrix row and the test's comment all say the fix is a
   stream position in `MutationResult`. No such position exists to carry. A
   live cursor is a counter each subscription keeps for itself: `pollLive`
   starts it at the subscriber's `after` and adds one per event it sends
   (`packages/remote-drizzle/src/poll.ts:135-136`), and the hub adds one per
   subscriber (`packages/remote-server/src/index.ts:1169`). A mutation's
   handler knows no subscriber's counter, a polling stream coalesces what
   happened between two ticks, and on Workers a write and a stream share
   nothing but the database. A number an answer could carry and a client
   could compare would need a commit sequence that every Source stamps on
   its writes and on its live events. `pollLive`'s row log is optional and
   the hub has none.

   The client already has what it needs. The record above says which fields
   a stream wrote since a request started. At the answer, for each field
   the answer writes (its `entities` and its `read`):

   - no live patch to it since the request started: as today;
   - the base, as the stream left it, equals the answer's value: as today;
   - the base differs: the client cannot say which is newer. The stream may
     be behind the write (#485's case) or past it (#499's), and one that
     coalesces can be past it without ever having sent the write's own
     value. The answer's value is written and awaited as an echo, as today,
     and the field is read again (`askedAgain`, as `contradicted` does at
     `model.ts:2293`). "Only a read can say" is already the rule in
     `heardBack`'s comment (`liveEvents.ts:67-75`).

   The answer's value is written, not the stream's, because keeping the
   stream's would put back the stale value #485 removed whenever the stream
   is merely behind. Visible is the layer's value before the answer and the
   answer's after it, which are equal in the usual case, so nothing
   flickers; the read is `Refreshing` until the server says which.
   `Data.confirmed` moves from the stream's value to the answer's and then
   to the read's. A request that started before a patch was heard is the
   only one compared with it, so an answer never reads again for a patch
   older than its own request.

   The cost is one read of one row's fields per write that a stream raced
   and disagreed with. No measurement of how often that is exists. The rule
   for adding a protocol field later: only if that read shows as a cost on
   a real page, and then as an optional number on `MutationResult` and on
   each live event, both taken from one sequence the Source owns, with the
   rule above kept for a server or a Source that sends none. Optional
   fields need no version: `MutationRequest` carries none
   (`packages/remote/src/wire.ts:262`), `Mutate`'s errors hold no
   `RemoteProtocolError` (`wire.ts:404-413`), and `now` was added the same
   way (`wire.ts:275-280`). A required change to a mutation's shape would
   first have to give the mutation request a version, which it lacks today.

6. **#377 idea 4: what does `Data.confirmed` read of a staged field?**
   Options: (a) the base, which waits with the write; (b) the staged value,
   since the server sent it.
   Recommendation: (b). An Agent capability waiting on `Data.confirmed`
   should see the server's count as soon as the client has it. It costs one
   more input to the confirmed read.

   **Decided: the outcome of (b), with nothing to build.** Under H4 the
   base holds what the stream sent, and `Data.confirmed` is the read with
   the layers left off (`packages/remote/src/domain.ts:935-956`), so it
   reads the server's count the moment the client has it. The extra input
   moves to the visible read, which is the one that is predicting.

7. **#377 idea 1: reject the hold?**
   Options: (a) reject, as #485 and the answer's read cover it; (b) build a
   hold with a timeout.
   Recommendation: (a).

   **Decided: (a).** The answer releases the layer and writes the truth in
   one reduction (`model.ts:2143-2198`), so there is no gap for a hold to
   cover. A hold needs a timeout that a coalescing stream always runs to,
   and it would be a second definition of "settled" beside the ledger's.
   The case it left open, an answer older than a delivered patch, is #499
   and is settled in decision 5 without one.

8. **#377 ideas 2 and 3: one derived read, or an option on the write?**
   Options: (a) `Data.writing` as sketched; (b) `affects` on
   `Data.mutate` plus a flag in the application's Model; (c) nothing, and
   document Chirp's filter as the recipe.
   Recommendation: (a).

   **Decided: (a), as a function, with the sketch's two errors fixed.**
   Every fact it reports is already in Remote's Model, so it adds no owner,
   and it is right after a reload and in a second tab, where a flag the
   application writes is not. Chirp's hand-written `attempt > 0` filter
   (`examples/chirp/src/view.ts:208-210`) is the evidence that one
   application has already had to derive it. Its `mutation` filter takes
   the Mutation, not a name (#251's rule), and the union accounts for the
   outbox's `Unreadable` state and says which id it lists (section 5).
   `outboxStatus` stays: it is the list of durable writes, and `writing` is
   the one state a view matches on. `writing` is built from `statusOf`, not
   beside it, so the two cannot disagree.

9. **`Data.writing`'s place:** the root `Data` value, or
   `foldkit-remote/outbox` beside `outboxStatus`?
   Recommendation: `Data`. It reads non-durable writes too, and a read-only
   page that never calls it pays nothing either way only if it is a
   capability (#378); confirm with `scripts/test/readOnlyPage.test.ts`.

   **Decided: neither as written. A function exported from
   `foldkit-remote`'s root, `writing(Data, model, filter?)`, not a method
   on the bound `Data`.** It reads non-durable writes, so a page with no
   outbox must be able to import it without the outbox entry; a method on
   an object every page holds cannot be dropped by a bundler, and a
   function can. The measurement is missing, so the rule is the gate:
   `scripts/test/readOnlyPage.test.ts` must hold unchanged. If the root
   export fails it, because reading the queue's states brings outbox code
   along, the function moves to `foldkit-remote/outbox` beside
   `outboxStatus` and the non-durable `Sending` state is read there too.

10. **Should the #480 audit's row be corrected now?** It says the layer wins
    over any live patch while a write is pending. Section 2.3 shows it does
    not for a relative layer.
    Recommendation: yes, in the change that lands phase 1, with #482's
    matrix row split into absolute and relative.

    **Decided: yes, in phase 1's commits, not before.** Until the fix
    lands, the matrix's two "failure, open" rows are the accurate record,
    and the audit row is wrong only by what they already say. Correcting
    the audit when the code changes keeps the summary and the section in
    one change. The wording is in section 8.

## 7. Risks, review points, rejected alternatives

**Security.**

- A generated decoder cannot widen what a reader sees: the server decides
  the fields (`readAs`, `remote-server/src/index.ts:259`), and a decoder
  only reads what arrived. The risk in option B is the other direction: a
  generated decoder that skips a check the Schema makes accepts a value the
  application's types say cannot exist. That is why its checker is a
  round trip against the full Schema, and part of why B is not recommended.
- A generated *request* could widen, if a build pass rewrote which fields a
  Selection asks. Nothing proposed touches `fields`.
- `Data.writing({ row })` reads the client's own layers. It names no field
  the server withheld.
- The kept value (H4) is a server-sent value held in the Model for longer.
  It must be dropped by `forget`, as `echoes` are, or a relative layer
  could resolve over one principal's value for the next. The answer
  generation that guards `LiveReceived` (`model.ts:2266`) guards the record
  too.
- Caching across principals: R2's counters are per store, and a store is per
  principal after `forget`. A read kept by counters must also key on the
  store's floor, or a list kept from before a `forget` could be served
  after it. The existing memo keys on the store entries themselves; a
  counter does not carry that by itself.
- The edge cache (`remote-server/src/edgeCache.ts`) is untouched by all of
  this.

**Review points.**

- Phase 1 changes `LiveReceived` and `MutationSucceeded`, which #485 and
  #482 both pin with mutation specs. Run `pnpm mutate:check`, then
  `echo.mutations.ts` and `temporal.mutations.ts` whole.
- The visible read is kept by the identity of the store entries it visited
  (`rowRead.ts`). The kept values are a new input to it: a read kept from
  before an entry was recorded or dropped must not be served after. Test
  it with two transitions, not one.
- The record is one value per field, whichever stream wrote first. A
  second stream's patch to the same field leaves it alone.
- An answer `Gap` needs no rule under H4: the base already holds what the
  stream sent for a field the answer omits.
- A `computes` reads operands. The kept value is read for each field a
  relative patch reads, not only the one it writes: an echo that moved an
  operand is counted twice as an echo of the target is.
- The read-again of #499 must not fire for the ordinary answer, whose
  value always differs from the base it replaces. It fires only for a field
  the record names since that request started. A mutation dropping that
  condition must be killed by a test that counts planned reads after a
  plain write with a quiet stream.
- `Data.writing`'s `Sending` must not be drawn as "waiting": the Chirp trap
  is exactly a view treating in-flight as stuck. The doc comment should say
  which variant a "waiting to send" line reads.
- R1 must compare members by owner identity and include an exists' `where`.
- Nothing decided here changes the wire. A later change to `ReadRequest`
  or `LiveRequirement` bumps `REMOTE_PROTOCOL_VERSION` and needs the
  client's request and response types diffed against the payload schemas
  (the "wire carries every field" trap). The version does not cover a
  mutation: `MutationRequest` names none (`wire.ts:262`).

**Rejected alternatives.**

- **Skipping decode for identity codecs** (3.1 C): removes the client's only
  validation of field values.
- **A `Pending` tag on `RemoteData`**: every reader of the union would have
  to handle a state that today reads as `Ready`, and a prediction is not a
  load. The #480 audit decided against changing the published union for
  `Failed.previous`; the same reasoning applies.
- **`affects` on `Data.mutate`**: stores per write what its layer already
  says.
- **A saving flag in the application's Model**: wrong after a reload and in
  a second tab, and a second owner of the ledger's facts.
- **Holding the layer until the stream echoes** (idea 1): needs a timeout
  that a coalescing stream always hits.
- **Telling an echo from another write by its value** (H3): row 2 of the
  traces shows it cannot be done.
- **Staging the live patch out of the store** (H1): the store would lag the
  server, and every ending of a write would need a write-back. H4 holds the
  layer's side and leaves the store alone.
- **A stream position in `MutationResult`** (#499 as filed): a live cursor
  is a counter per subscription, so there is nothing to compare it with
  (decision 5).
- **A graph value spanning writes, queries, Surfaces and regions**: #477
  decided each edge already has an owner and an API. R1 is one function, not
  a graph.
- **Inferring Remote's write sets from generated Messages**: a declared
  `Write` already states what it writes (`Write.writes`), and a handler
  mutation's writes are known only from its answer. Running `update` adds
  nothing to either.

## 8. Issue actions

For the coordinator. Nothing here was done in this change.

| Issue | Action | Title or note |
| --- | --- | --- |
| #440 | Close, with section 1's table added to `performance-PLAN.md` (phase 0) | Closing note: a read already decodes per Selection (`selection.ts:245`); Schema is 7.0% and 8.9% of the two clients and stays whatever Remote does; a generator could remove 0.76 kB and 0.18 kB |
| #439 | Keep, narrowed | "Remote: say statically which lists a declared write reaches, and keep a list read while no Entity it reads was written". Body: the inferred write-set map is dropped (decision 3); R1 is built by the change that first needs it (#437 or `explain`); R2 when `read.bench.ts`'s figure times a real page's lists passes 1 ms per write |
| #377 | Keep, narrowed | "Remote: `writing`, one derived read of what is being saved". Body: idea 1 rejected; idea 4 is #498; ideas 2 and 3 are phase 2 |
| #498 | Keep; fixed by phase 1a | Add to the body: fixed by keeping what a relative layer resolves over (H4), not by staging the patch |
| #499 | Keep, retitled; fixed by phase 1b | "Remote: an answer that disagrees with a live patch delivered while it was pending is not read again". Body: no field is added to `MutationResult`; the reason is decision 5 |

Corrections owed in other notes, each in the commit that makes it true:

- **`480-async-guarantees-DESIGN.md`, the Holds row "a live answer landing
  during a held action"** (line 93) and its counterexample text (line 131).
  With phase 1: while a write is pending, an absolute layer shows its value
  over any live patch, and a relative layer resolves over the value from
  before the first one; an answer that disagrees with what a stream wrote
  meanwhile is read again. `docs/design/TODO.md:58` already lists this
  under #498.
- **`482-temporal-laws-MATRIX.md`**, rows 79 and 83 and the count of open
  failures (line 124), with phases 1a and 1b. Row 83's note "Needs a
  position in the answer (protocol), not a local fix" is wrong today and
  can be corrected before the fix: it needs a record of what a stream wrote
  while the write was pending, and a read. The paragraph at line 134 says
  the same.
- **`packages/remote/test/temporal.test.ts:255-259`**, the comment above
  the #499 case, says the same; it changes with phase 1b.
- **`performance-PLAN.md`** gains section 1's table (phase 0), and its
  lines 382 and 385 and `declared-optimization-DESIGN.md:118`, `:149`
  record #439 as narrowed and #440 as closed.
- **`docs/design/README.md` and `docs/design/TODO.md`**: this note's status
  is decided, with ten decisions made.
