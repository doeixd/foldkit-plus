# A read-only page pays for reading: capabilities carried by declarations (#378)

Status: proposed (2026-10-31). Phases 1 and 3 built. Phases 1–3 are independent of
#384 (cheaper repeated reads, in progress in `packages/remote`); phase 4
rewrites the reducer #384 touches, so it waits for #384 to land.

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
  (`Why.of(Data, model, read)` from `foldkit-remote/why`) instead of domain
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
5. **Live through the transport; the outbox through `Data.outbox`.**
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
- Recommendation: do it in the order above, using the size test as the guide,
  and stop after phase 3 if phases 4–5 turn out more invasive than they are
  worth.
