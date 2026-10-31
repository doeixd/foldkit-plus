# A read-only page pays for reading: capabilities carried by declarations (#378)

Status: phases 1, 2 and 3 built (2026-10-31). Phase 4 was found wider than
planned and is redesigned below (a layer capability first); #384, which it
waited on, has landed.

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
5. **Live through the transport; the outbox through `Data.outbox`.** Waits
   for phase 4's layer capability (a live insert is an overlay). `sse.js`
   also needs the `Remote` object to become an ES module namespace, as
   `Entity` did in phase 3: it holds `Remote.httpWithLive`.
6. **Measure** domains-plus (read-only) and Chirp (writes), to confirm apps
   that write don't regress.

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
