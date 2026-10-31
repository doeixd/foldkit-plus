# A read-only page pays for reading: capabilities carried by declarations (#378)

Status: built, and measured (phase 6), 2026-10-31. Phase 5 first stopped,
as written it could not drop its code; its three blockers were decided and
built (below). A read-only page keeps no write, layer, live, outbox,
persistence, explanation or evaluator code; what it still keeps unused is
listed under phase 6.

## The problem

`examples/foldkit/domains-plus` only reads (no writes, no live, no outbox),
yet its client keeps most of Remote's write machinery and Entity's expression
code. Its client measured 1,005.5 kB rendered, 314.9 kB gzipped, the same
built from `dist` as from source. Rendered size per module:

- `foldkit-remote`: about 86 kB in modules a read-only page never runs
  (`mutation` 15.5, `why` 8.6, `outbox` 8.1, `optimistic` 7.9, `coalesce`
  7.3, `whyReasons` 7.1, `resume` 6.1, `retain` 6.1, `impact` 5.8,
  `persistence` 5.1, `sse` 3.6, `live` 2.9, `patchValues` 1.9 kB), plus the
  write parts of `index` (89.4 kB) and `model` (41.3 kB).
- `foldkit-entity`: `expr` 43.7, `evaluate` 18.3, `write` 17.2, `operators`
  6.4, `law` 2.0 kB.
- About 40 kB gzipped in all, roughly 12% of the page's JavaScript.

## The cause

Not packaging. `dist` keeps what source keeps (#215's per-file build is not
the gap), and splitting the `Remote` and `Entity` namespace objects into ESM
namespaces drops only members nothing else reaches (`Remote.httpWithLive`,
`Remote.patch`, `Remote.resume`). The code is reached through two places a
read-only page runs:

- **`bindDomain`** (`remote/src/index.ts`, ~2,000 lines), which `Remote.make`
  calls. It builds one object holding `mutate`, `retry`, `outbox`,
  `persistence`, `explain`/`why`/`timeline`, `live`, `liveStatus` beside
  `get`/`active`/`subscriptions`, and its `reduce` settles write answers.
- **`model.ts`'s reducer**, which imports `mutation`, `outbox`, `optimistic`,
  `persistence`, `retain` and `live`; `client.ts` imports `mutation`,
  `optimistic` and `live`.

On the Entity side, the `Entity` object reaches `invariant`, which imports
`write`; Remote's planner and matching reach `evaluate`, `expr` and
`operators`.

## Options considered

1. **Load capabilities lazily** (fetch the write code on first write).
   Rejected. A write's prediction is computed synchronously in `update`, so a
   write made before the chunk arrives would have no prediction: the same write
   would sometimes predict and sometimes not. That nondeterminism breaks
   `Law.check`, `verifyPredictions` and the stability checks (#349/#350).
2. **A separate read-only entry** (`foldkit-remote/read` with its own
   `Remote.make`). Rejected: two ways to do the same thing, and two APIs to
   keep in step.
3. **Plugins listed in `Remote.make({ use: [Writes, Live, Outbox] })`.**
   Explicit and tree-shakable, but rejected as ceremony: the app restates what
   its declarations already say (a domain that declares mutations writes).
4. **The capability travels with the declaration.** Chosen. The code for a
   feature is reached only through the thing an application already imports to
   use it. A read-only application never imports those things, so the bundler
   drops the code, with no new configuration.

## Design

- **Writes.** Every Mutation descriptor (`Mutation.make`,
  `Write.insert`/`update`/`delete`) carries a reference to the write
  capability: its domain methods, its reducer cases, and its prediction,
  placement and answer code. `bindDomain` installs it only if the domain's
  `mutations` holds one. No global registry and no import-time side effect
  (`sideEffects: false` would drop one). `Data.mutate`, `retry`,
  `failedWrites` and the rest exist on the domain's type only when its
  `Mutations` tuple is non-empty.
- **Live.** Reached through the live transport (`Remote.httpWithLive`, the live
  source), which brings the live reducer cases and `liveStatus`.
- **Outbox.** Reached only through `Data.outbox(...)`, which brings the outbox
  reducer cases and persistence.
- **Explanations.** `why` and `timeline` are development
  tools; they become standalone functions from their own entry
  (`why(Data, model, read)` from `foldkit-remote/why`) instead of domain
  methods. Breaking, but only for a development API.
- **The reducer.** The core keeps reads, freshness, retention and the budget.
  Write, live and outbox Messages go to whichever capability is installed. The
  Message schema and `RemoteModel`'s fields stay whole (they are small) and are
  simply empty when unused, so devtools and Sync keep one stable Message union.
- **Entity.** The same inversion: invariant checks and `write` are reached only
  through `Write.*` and `Entity.invariant`, and the relational evaluator
  (`expr`, `evaluate`, `operators`) only through what uses it on the client:
  prediction and list placement (writes), live judging (live), and `Law.check`
  (testing). With per-file builds a plain read-only page no longer reaches
  them.

## Phases

1. **A size regression test, failing first.** A read-only `Remote.make` page
   built against `dist` holds none of `mutation.js`, `outbox.js`, `live.js`,
   `why.js`, `write.js`, `evaluate.js`; a second fixture with one mutation keeps
   the write code. Beside `scripts/test/publishedBuild.test.ts`.
   Done: `scripts/test/readOnlyPage.test.ts`, with a third page that only
   declares Entities. What a later phase makes true is an `it.fails` naming it.
   The read-only Remote page reaches Entity's `write`, `evaluate`, `expr` and
   `operators` through Remote's own write and live code, not through Entity,
   so on that page they wait for phases 4 and 5.
2. **Explanations to their own entry.** Small and independent.
   Done: `why(Data, model, read)`, `timeline` and `explain` are functions of
   `foldkit-remote/why` (`why.ts`), with the reasons' terms in `whyTerms.ts`
   and the active-record helpers they share with the read entries in
   `active.ts`. A bound domain records how it reads its lists for them
   (`inner.ts`, a weak map), so the domain object names none of it. The
   read-only Remote page keeps 260.2 kB of `foldkit-remote` where it kept
   282.2 kB (the page 526.1 kB to 508.8 kB minified, 145.1 kB to 140.2 kB
   gzipped). The size test reads a chunk an import cycle names with a hash
   (`why-B1AUOttp.js`) by its module's name, which the first cut of this
   phase, a cycle between `why.ts` and `whyReasons.ts`, slipped past.
3. **Entity:** decouple invariants and writes from `define`/`defineVariants`.
   Done: `Entity` is an ES module namespace (`entity.ts`), and the build leaves
   relative imports as written, so it stays one; a variant Entity's per-case
   invariants are built when first read, not declared, so `defineVariants`
   reaches no expression code. A page that declares two Entities and selects
   them keeps 10.6 kB of `foldkit-entity` where it kept 94.8 kB (rendered;
   the page 210.9 kB to 110.5 kB minified, 57.8 kB to 30.7 kB gzipped). The
   read-only Remote page keeps 106.3 kB of it where it kept 122.6 kB (the page
   538.2 kB to 526.1 kB minified, 148.5 kB to 145.1 kB gzipped).
4. **Writes carried by Mutation descriptors.** The largest step: the reducer
   split and the typed `mutate`. Waits for #384.
   Stopped, not started (2026-10-31): it is far wider than this note
   assumed. The write code is not only reached through `mutate` and the
   reducer's write cases; reading itself runs it, so moving the write
   methods off the domain leaves `mutation.js`, `optimistic.js` and Entity's
   `evaluate.js` on a read-only page:
   - Every list read places pending layers and overlays into its pages
     (`shownEdges` -> `pendingPlaced` -> `placedHeld` -> `impactOn`, `placeIn`,
     `matching` -> `evaluate`), and every row read goes through
     `visibleStoreOf` (`optimistic.ts`'s `visibleStore`, `plannedStore`,
     `resolvedPatches`). Layers come from writes, `Data.overlay` and live
     inserts, so the read path itself needs a layer capability, installed by
     whichever of the three a domain uses.
   - Two read-side domain methods reach the excluded modules and would have
     to leave the domain too, an API change this note does not name:
     `Data.overlay`/`lift`/`overlays` (layers; used on read-only domains in
     `packages/cms` and a dozen Remote tests) and `Data.filtered` (`matching`,
     so `evaluate`).
   - The core reducer cases touch write state: `ConnectionMerged` prunes
     overlays (`pruneOverlays`), `RetentionChanged` reads `optimistic` and the
     mutation ledger, `Hydrated` and `forget` reset them; `query.ts` (every
     query descriptor) value-imports `schemaOf` from `mutation.ts`, and
     `live.ts` imports `addOverlay` from `optimistic.ts`.
   - `RemoteDomain` is one interface that `Remote.fold`
     (`Parameters<Domain['mutate']>`), `foldkit-remote/testing` and
     `foldkit-crud`/`foldkit-cms`' structural domains read; members present
     only for a non-empty `Mutations` tuple make it a conditional type every
     one of them must follow.
   **Decided (2026-10-31), replacing the plan above:**
   - **4a. A layer capability.** The visible store, pending placement and
     the overlay reducer cases (`pruneOverlays`, the optimistic parts of
     `RetentionChanged`, `Hydrated` and `forget`) move behind one
     capability. The core read path calls it only through a slot that is
     empty on a domain with no layers: an empty slot reads the committed
     store directly, which is exactly what the visible store returns when
     no layer exists, so reads do not change. Whatever can make a layer
     installs it: a Mutation descriptor, `overlay` and the live transport.
     `schemaOf` moves out of `mutation.ts` to a module both import, and
     `live.ts` reaches `addOverlay` through the capability.
   - **4b. The write capability on top of 4a**, carried by Mutation
     descriptors as this note first said: `mutate`, `retry`, the write
     reducer cases, prediction and answers.
   - **Types: no conditional domain.** `mutate` already accepts only a
     mutation registered on the domain
     (`Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>`),
     so on a domain with none it is uncallable. `RemoteDomain` keeps every
     member, and `Remote.fold`, `foldkit-remote/testing`, `foldkit-crud` and
     `foldkit-cms` need no change. At runtime a domain without the write
     capability holds a stub that fails loudly (a defect naming the domain
     and saying it declares no mutations), reachable only through a cast.
     Type tests pin that `mutate` and `retry` are uncallable on such a
     domain.
   - **4c. `overlay`, `lift`, `overlays` and `filtered` become functions
     of entries of their own**, as `why` did in phase 2: `overlay(Data, …)`
     installs the layer capability; `filtered(Data, …)` from
     `foldkit-remote/filter` brings `matching` and Entity's `evaluate`.
     Breaking; update `packages/cms` and the Remote tests that call them.
   - **Order:** 4a, then 4c (which needs 4a's install point), then 4b.
     Each turns its own `it.fails` case in `readOnlyPage.test.ts` into
     `it`.
   **4a built (2026-10-31).** `capability.ts` is the seam: a bound domain
   holds `[Capability]`, whose `layers` slot is empty until something that
   makes a layer installs `layers.ts` (the visible and planned stores,
   pending and insert placement, beginning and settling layers). A Mutation
   descriptor carries its install under `[Installs]` (`bindRemote` runs each
   one), and `Data.overlay`, a `LiveReceived` and `Remote.mutateInto` install
   it too. The read core asks the slot only while the Model holds a layer or
   overlay, and a Model holding one that nothing installed fails, naming the
   domain, instead of reading as the committed store. The reducer
   (`reduceIn(capabilities, …)`) reaches layers the same way; `updateRemote`
   is the reducer with everything installed, in `update.ts`, and
   `RemoteDescriptor.update` is gone. `memoRead` moved to `memo.ts`,
   `placedHeld` to `placing.ts`, `schemaOf` to `schema.ts`, and the
   declarations (`Mutation`, `Refusal`) to `mutationDescriptor.ts`, so the
   install creates no import cycle. `live.ts` takes `addOverlay` from
   `capability.ts`; the optimistic parts of `RetentionChanged` and `forget`
   stay in the core, being walks over the Model's own fields that import no
   layer code. The page keeps the layer code still, through the core's live
   path, which installs it until live leaves the core in phase 5; so the
   size test's layer case waits for phase 5, and its write case for 4b.
   **4c built (2026-10-31).** `overlay`, `lift` and `overlays` are functions
   of `foldkit-remote/overlay` over any `OverlaidDomain` (the slot, the store
   and `reduce`), and `overlay` and `lift` install the layer capability;
   `filtered` is `foldkit-remote/filter`'s, with `matching` and Entity's
   evaluator. What they read of the domain beyond its face (the context its
   viewer gives a body, the edges a list shows) is recorded beside it in
   `inner.ts`, with `why`'s reader. `foldkit-sync/remote`'s `RemoteOverlays`
   is now `OverlaidDomain`, and `foldkit-cms`'s `EditorDomain` extends it. No
   size case moves: list placement for read news (`placedNews`, through
   `impact.ts`) still keeps `matching` and `evaluate` on a read-only page.
   **4b built (2026-10-31).** `writes.ts` is the write capability: it binds
   a domain's `mutate` and `retry` (prediction, local refusal, what the
   answer must carry) and installs the layer capability with itself. A
   Mutation descriptor's `[Installs]` is `installWrites`; a domain whose slot
   holds none gets a stub that throws, naming the domain, and `retry`'s
   request id is typed `string & Writes<Mutations>`, which refuses every id
   on a domain that registers no mutation (`writes.test-d.ts`, proven by
   widening it). `mutation.ts` keeps only prediction; the ledger (begin,
   fail, settle, reconcile, status) moved to `ledger.ts` and `DerivedBy` to
   `derived.ts`, both light. The reducer's write cases stay in the core:
   they are ledger bookkeeping, and the layers they begin and settle are
   already behind the layer slot, so a hand-made write Message on a domain
   with no mutation still fails there. The answer checks of
   `verifyPredictions` stay in `Data.reduce`; they import no write code. The
   read-only page keeps no `mutation.js`, `mutationDescriptor.js` or
   `writes.js` (its size case is an `it`): the Remote and Entity modules it
   keeps went from 526.6 kB to 496.3 kB (rendered, unminified, built from
   source) between 4a and 4b.
5. **Live through the transport; the outbox through `Data.outbox`.** Waits
   for phase 4's layer capability (a live insert is an overlay). `sse.js`
   also needs the `Remote` object to become an ES module namespace, as
   `Entity` did in phase 3: it holds `Remote.httpWithLive`.
   **Stopped, not started (2026-10-31).** Three things this phase assumes do
   not hold:
   - A domain member is always kept: `bindDomain` builds one object, so
     `Data.outbox`, `Data.persistence` and `Data.liveStatus` keep the outbox,
     persistence and live code on every page that binds a domain. Reaching
     them only "through `Data.outbox(...)`" means leaving the domain, as
     `overlay` and `filtered` did in 4c (`outbox(Data, …)` from
     `foldkit-remote/outbox`, and so on): an API change this note does not
     name.
   - "The live transport" is not one place. A page reads live through
     `Data.live`, a query's `live: true`, and the `.live` entry `subscriptions`
     adds for every active entry; the events come from `RemoteClient.live`,
     which `clientLayer` gives every RPC client (in-process, HTTP, worker), not
     only `httpWithLive`. So the core's live path installs the layer capability
     today (4a), and keeps it. Moving it out needs a chosen install point: an
     option on `clientLayer` that live clients pass (breaking every live test
     and example), or live reads as entries of their own (`live(Data, …)`).
   - The read core places read news in held lists (`placedNews`, through
     `impact.ts`, `matching` and Entity's `evaluate`) on every page with a
     query that has a body. Dropping `evaluate` needs that placement carried
     by `Query.define`'s descriptor, as writes are by Mutation's: a
     capability this note does not name either.
   **Decided (2026-10-31), by the maintainer; breaking changes are fine (0.x):**
   - **Outbox and persistence leave the domain.** `Data.outbox`,
     `Data.persistence`, `Data.outboxStatus` and `Data.liveStatus` (and any
     other member that alone keeps outbox, persistence or live code) become
     functions of entries of their own: `outbox(Data, …)` and
     `outboxStatus(Data, …)` from `foldkit-remote/outbox`,
     `persistence(Data, …)` from `foldkit-remote/persistence`, and
     `liveStatus(Data, …)` from the live entry below.
   - **Live reads are entries of their own.** `foldkit-remote/live` exports
     `live(Data, selection, id)`, a live query read (replacing the query's
     `live: true` option on the domain), `liveStatus` and `httpWithLive`
     (`Remote` becomes an ES module namespace if `sse.js` needs it, as
     `Entity` did in phase 3). What it reads installs a live capability and
     the layer capability; `subscriptions` adds a `.live` entry only while
     the live capability is installed. `RemoteClient.live` on the RPC
     clients stays, being the transport's, unless measuring shows it keeps
     meaningful code; then decide, and record it here.
   - **Placing read news is carried by `Query.define`'s descriptor.** Placing
     a read's news in held lists (`placedNews`, through `impact.ts`,
     `matching` and Entity's `evaluate`) is a capability a query descriptor
     installs only when its body (a filter or an order) needs it, as a
     Mutation descriptor carries writes.
   **Outbox and persistence built (2026-10-31).** `outbox` and
   `outboxStatus` (`outbox.ts`) and `persistence` (`persistence.ts`) are
   functions of entries of their own over the domain's registry, store and
   `reduce`. The store, locks and sending moved to `outboxStore.ts`; the
   queue as the Model holds it to `queue.ts`, so the reducer's outbox
   bookkeeping (a durable `mutate`, `dismiss`, `OutboxRead`) stays in the
   core, as the ledger did in 4b, and imports none of them. `mergeStores`
   moved to `store.ts`. The read-only Remote page's `foldkit-remote` went
   from 245.1 kB to 221.7 kB (rendered, from source).
   **Live built (2026-10-31).** `live.ts` is the entry: `live`,
   `liveQuery`, `liveStatus`, `observeLive` (was `Remote.live`) and
   `httpWithLive`. The live capability (`liveReads.ts`: the stream, applying
   events from `liveEvents.ts`, and a live insert's policy, which runs
   `matching`) is installed with the layer capability by whatever reads
   live; the reducer's `LiveReceived` case and `Data.reduce`'s policy reach
   it through the slot, and refuse a live event on a domain that installed
   none. What the core keeps is light: the Model's live shapes
   (`liveState.ts`) and the entry's dependencies (`liveEntry.ts`). One
   departure from the decision above: `subscriptions` still gives every
   active entry its `.live` entry, holding no live code. A live read is
   usually made inside a Surface's `model`, when its read entry first runs,
   which is after `subscriptions` was called, so an entry added only when the
   capability was installed would be missing for good; the stream the entry
   asks for is the capability's, installed before any ask can name a row to
   watch. `RemoteClient.live` stays on the RPC clients: what it keeps is
   `liveEventOf` in `client.ts` (3.1 kB in all), not worth a second client
   shape. `Remote` stays an object: `httpWithLive` left it, so `sse.js`
   needs no namespace. `foldkit-crud`'s `Crud.list` reads a live list through
   `liveQuery`, so a page with Crud keeps the live code. The read-only page's
   `foldkit-remote` went from 221.7 kB to 199.8 kB, and `foldkit-entity`'s
   from 101.1 kB to 83.6 kB: no `layers`, `optimistic`, `live*` or `sse`,
   and no Entity `write`.
   **Bodies built (2026-10-31).** `bodies.ts` is the body capability: the
   fields a body places a list's rows by (which its read also asks for),
   placing a read's or live patch's news in held lists, and judging a
   write's answer. `Query.define`'s descriptor carries it under
   `[Installs]`, and `bindRemote` runs each registered query's. A domain
   whose lists have no body installs none, and an answer then fetches again
   each list over an entity it changed, which is what a body-less list
   always got (`impactOn`'s no-body case, kept in the core as
   `unplaceable`, over `changes.ts`, split from `impact.ts`). The writes no
   longer need it: a list with a body brought it. One more thing kept it:
   the `Query` object spreads Entity's `Query`, and a spread object literal
   is kept whole as if reading it could do something, with `define` and the
   capability it installs; it is now built in a call marked pure. The
   read-only page's `foldkit-remote` went from 199.8 kB to 182.2 kB, and
   `foldkit-entity`'s from 83.6 kB to 52.7 kB: no `evaluate`, `matching`,
   `impact`, `placement` or `bodies`.
   What is left after 4 on the read-only page: `layers`, `optimistic`,
   `impact`, `placing`, `matching`, `placement`, `answerGaps` (the answer
   checks in `Data.reduce`), `live`, `outbox`, `persistence` and `sse` of
   Remote, and `write`, `evaluate`, `expr`, `operators` of Entity.
6. **Measure** domains-plus (read-only) and Chirp (writes), to confirm apps
   that write don't regress.
   **Done for phase 4 (2026-10-31).** Each example's client built with its
   own Vite config (the view-identity plugin spliced out), `foldkit-remote`
   and `foldkit-entity` resolved to builds made with their own
   `tsdown.config.ts`: *before* from Remote at `77636e08` (the commit before
   4a), *after* at 4b; the examples' sources the same in both. Minified JS of
   the client, then the Remote and Entity modules it keeps (rendered):
   | example | before | after |
   | --- | ---: | ---: |
   | domains-plus, all JS | 994.0 kB, 311.3 kB gz | 983.1 kB, 308.2 kB gz |
   | domains-plus, Remote / Entity | 262.7 / 109.3 kB | 247.8 / 104.8 kB |
   | Chirp, all JS | 1,186.3 kB, 381.6 kB gz | 1,181.1 kB, 380.6 kB gz |
   | Chirp, Remote / Entity | 348.5 / 120.9 kB | 339.5 / 120.9 kB |
   Chirp, which writes, does not regress: it lost `filtered` and the overlay
   members it never called. domains-plus saves 3.1 kB gzipped of the 40 kB
   this note set out to save; the rest is behind phase 5.
   **Done for phase 5 (2026-10-31).** The same way, *before* at `0ed88d50`
   (phase 4, with the decisions recorded) and *after* with phase 5 built, the
   examples' sources each at their own commit, `foldkit-crud` too (it reads
   Remote's API). Chirp's JS here is its page's chunks, without the Worker its
   sandbox server runs in (720 kB, Remote's server side), which phase 4's
   figures counted in part:
   | example | before | live built | after |
   | --- | ---: | ---: | ---: |
   | domains-plus, all JS | 983.1 kB, 308.2 kB gz | 948.8 kB, 297.6 kB gz | 922.1 kB, 289.2 kB gz |
   | domains-plus, Remote / Entity | 247.8 / 104.8 kB | 202.4 / 87.2 kB | 184.7 / 56.1 kB |
   | Chirp, page JS | 1,145.7 kB, 368.4 kB gz | 1,139.3 kB, 366.4 kB gz | 1,140.1 kB, 366.3 kB gz |
   | Chirp, Remote / Entity | 267.6 / 120.7 kB | 256.1 / 120.7 kB | 258.0 / 120.7 kB |
   Chirp, which writes, reads live and keeps an outbox, does not regress.
   domains-plus saves 19.0 kB gzipped in phase 5, 22.1 kB over phases 4 and
   5, and 25.7 kB from the 314.9 kB this note began at: not the 40 kB it
   estimated. Every case of `readOnlyPage.test.ts` holds. What a read-only
   page still keeps that it does not run is not behind a declaration: the
   `Remote` object's members it never calls (`coalesced`, `resume`, `json`,
   `http`, 7.4, 6.1 and 3.2 kB), since `Remote` is an object rather than an
   ES module namespace, and 34.5 kB of Entity's `expr.ts` reached through
   `Operators.kernel`, the default operator table `Remote.make` takes. Each
   is its own change (a `Remote` namespace as `Entity`'s, and the operator
   table apart from the expression builders), not a capability.

Every phase keeps behaviour unchanged, only where code lives, so `Law.check`,
`heldValue.test.ts`, the R0 conformance suite and every example must stay
green; each phase has its own tests and mutation specs.

## Is it worth it

- Read-heavy pages (search, landing, catalogues) gain the most: about 12% of
  domains-plus's JavaScript.
- Apps that write gain little in size, but `bindDomain` and the reducer split
  into separate capabilities, which makes Remote easier to change and fits the
  service-shaped direction of
  [foldkit-renderer-independence-PLAN.md](./foldkit-renderer-independence-PLAN.md).
- Phases 1–3 took the read-only page from 148.5 kB to 140.2 kB gzipped; the
  rest of the 40 kB is behind phases 4 and 5. Phase 4 is wider than first
  thought, but the decided shape keeps the domain's type, so its cost is
  internal: worth doing.
- Solid 2's form enhancement cost a page about 1 KB because nothing it did not
  use was loaded ([solid-2-forms-cache-COMPARISON.md](./solid-2-forms-cache-COMPARISON.md)),
  the same rule as this note.
