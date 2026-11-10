# Renderers: compiled views, a fine-grained runtime, native targets (#433, #376, #148, #149)

**Status:** decided 2026-11-10 (decisions delegated by the owner). Phase 0
ran the same day: 0a found two frames over 16 ms at 4x, and 0b found drawing
and diffing under half of both, so #433's client half closes as not planned.
#376, #148 and #149 stay parked; the server half lives under #473. Nothing
here is built.

One note for four issues, because they are one question asked at four sizes:
should a Foldkit Plus view reach the screen some other way than Foldkit's
`view` → vnode → snabbdom patch?

It builds on [foldkit-renderer-independence-PLAN.md](./foldkit-renderer-independence-PLAN.md)
(2026-10-30; "the plan" below), whose inventory of couplings (§3), proposed
seams (§4) and results (§10: R0, R1, R3) stand. This note adds what was
measured after it, and turns its open decision rule into a recommendation.

Claims about Foldkit are checked against `foldkit@0.170.0`
(`packages/mixins/node_modules/foldkit/dist`; paths starting `dist/` below).
Claims about this repository are checked at commit `1c1956b`. No benchmark was
run for this note; every number is a recorded one, with its source.
Upstream issues (foldkit/foldkit) could not be read from this session, so
their state is as this repository's issues last recorded it.

## 1. The problem and the evidence

### 1.1 What each issue asks for

| Issue | Ask | Its own first step |
| --- | --- | --- |
| #433 | Compile view functions to cloned DOM templates and patches of the dynamic slots only, keyed by the Model paths each slot reads; contract unchanged. | A spike on domains-plus's results row and Top Results card, measured with `pnpm bench:render`; numbers on #376; go or no-go "with upstream". |
| #376 | Reimplement the runtime on fine-grained foundations: an immutable Model, reference-diffed per path, DOM bound to paths; `ModelStore`, `Renderer`, `Scheduler` as Effect services. | A spike behind the existing contract, measured on domains-plus's 556 rows and the data grid's 100,000. |
| #148 | One program for Web, iOS, Android and desktop: a small semantic view vocabulary (`ui.Stack`, `ui.Text`) above `h`, a `Platform.define` capability contract, platform adapters. | Phase 0, "architecture only": document what is neutral and what is Web. |
| #149 | GPUI as the first non-DOM renderer, with the state machine compiled to native code by reffect: no JavaScript runtime, no DOM, no WebView. | GPUI-0, a document; GPUI-1 and GPUI-2, a portable Counter in TypeScript lowered to the Web renderer. |

#433 and #376 are performance proposals (update cost and client bytes).
#148 and #149 are reach proposals (other platforms). They share seams, not
motives, and the evidence below treats them apart.

### 1.2 What a frame costs today, and where

Foldkit's own `slow` phases, read by `pnpm bench:render`
(`scripts/render-baseline.mjs`), production builds, headless Chromium,
30 repetitions; the plan's §10 has the method and its limits. `view` is the
program's `view(model, h)`; `patch` is snabbdom's patch of the result. Median
milliseconds, latest recorded state of each app (domains-plus at 1× is the
mean of two rounds' medians; at 4×, round 2, the one its source tabulates):

| App | Frame | 1× view + patch | 4× CPU view + patch | Source |
| --- | --- | ---: | ---: | --- |
| data grid | a cell selected | 1.9 + 0.3 | 12.1 + 1.8 | plan §10 R3, samples `renderer-baseline/2026-10-31-r3-after-*` |
| data grid | an edit committed | 8.9 + 1.5 | 63.3 + 8.6 | same |
| domains-plus | a keystroke | 3.2 + 2.4 | 22.1 + 18.6 | [384-read-memo-DESIGN.md](./384-read-memo-DESIGN.md) Results, samples `2026-10-31-384-after-*` |
| domains-plus | prices arrive (`ReadReceived`) | 6.2 + 3.1 | 45.9 + 27.0 | same |
| domains-plus | a filter chosen (`SelectedItem`) | 5.0 + 2.0 | 31.6 + 12.1 | same |

Three readings, each already written down where it was measured:

- **`view` is the larger part, and most of what was in it was not drawing.**
  Before any memoization `view` was 61 to 93% of view plus patch (plan §10
  R1). Regions and keyed items on today's renderer (R3) removed the rows that
  did not change; what remained on domains-plus was 30 to 60% a derivation
  over 556 Remote reads, "which an accessor or a compiled Solid view would
  recompute too" (plan §10 R3). #384 then made those reads about 8 times
  cheaper (1.80 to 0.23 ms per pass).
- **At 1× every frame fits a 16 ms frame.** At 4× the domains-plus frames do
  not (73 ms for prices arriving). That table is from 2026-10-31. Since then
  `answeredOf` reads only names that have a row (#474, commit `17a6c0459`),
  and a Bundle's child is kept by default while its Model is the same object
  (#431, closed 2026-11-10). **`pnpm bench:render` has not been run since**,
  so how the 4× frame splits today between derivation, building vnodes for
  unchanged output, and diffing is not known. That is the missing number (§4).
- **The grid's costliest frame is not a rendering problem.** Committing an
  edit makes a new rows array, and `RowModel.fromArray` indexes 100,000 keys
  again (plan §10 R3). No renderer changes that.

### 1.3 What a user waits for

The benchmark the issues cite is a new search in domains-plus, the same app
as stock Foldkit's (`examples/foldkit/domains`) and the Solid 2.0 recreation.

| When, where | Solid 2.0 | stock Foldkit | Foldkit Plus | Source |
| --- | ---: | ---: | ---: | --- |
| 2026-11-02, live Workers, 15 loads | 215 ms | 246 ms | 307 ms (0.38.0) | [performance-PLAN.md](./performance-PLAN.md), "Where 0.38.0 stands" |
| 2026-11-09, local `wrangler dev`, 1×, median of 20 | not run | 260 ms | 198 ms | `scripts/search-compare.mjs`; #474's second comment |
| 2026-11-09, local, 4× CPU, median of 12 | not run | 643 ms | 315 ms | same |

All figures include the app's 150 ms debounce. A second local run gave 246
against 200 ms and 640 against 302 ms.

What this implies for a new runtime:

1. **The gap to stock Foldkit was never the renderer.** Both apps run the
   same Foldkit runtime and snabbdom. Plus went from 61 ms behind to 62 ms
   ahead at 1×, and to half of stock's time at 4×, by changing what the view
   reads and how often, with the renderer untouched.
2. **198 ms is under Solid's 215 ms, but the two were not measured under the
   same conditions.** Solid's figure is from the live Workers a week earlier;
   ours is local. The live comparison has not been rerun (#474 is open for
   that reason). Until it is, "Plus matches Solid on a new search" is a
   hypothesis, not a result.
3. **Little of a search is the renderer's to save.** #474's split of one
   search at 1× (2026-11-03, total 261 ms before the cut): about 131 ms
   debounce and its task, 32 to 45 ms the request, 9 ms decode and `update`,
   12 ms waiting for the next frame, 9 ms the view frame, 2 ms layout, 19 ms
   to the painted frame. A renderer with no diff could take part of the 9 ms.
   The 12 ms wait is the frame scheduler's (Foldkit renders on
   `requestAnimationFrame`, `dist/runtime/renderer.js:452`), which is the
   plan's Proposal C, not a new renderer.

### 1.4 Bytes

`node scripts/bundle-report.mjs examples/foldkit/domains-plus`
(2026-11-02): one chunk of 210.5 KB brotli, of which `effect` is an estimated
50.3 KB and `foldkit` 40.8 KB; Solid's whole app is 79 KB
([performance-PLAN.md](./performance-PLAN.md), "Where it goes").

#433 names bytes as half its reason. The record does not support a number:

- A compiled or fine-grained view keeps Effect (Commands, Subscriptions and
  Schema use it) and keeps Foldkit's runtime, Mounts, navigation and
  hydration handoff. What it could drop is the vnode builder, snabbdom and
  the adopting hydrator. **Their share of the 40.8 KB has not been measured.**
- It can drop them only on a page where no view takes the interpreted path.
  `@foldkit/ui` (11.7 KB here) is upstream views drawn through `h`, so on
  domains-plus that is no page.

### 1.5 The server half already has a spike

#433's "First" was half done, for server rendering, as #473's spike
(`examples/foldkit/domains-plus/test/compiledRow.ts`, written by hand in
place of a compiler; `compiledRow.test.ts` holds it byte-identical to the
interpreted row; four mutations killed). From #473's comment of 2026-11-03:

| The same 24 window rows | Foldkit's checks on | checks out |
| --- | ---: | ---: |
| interpreted (view, serialization, bindings) | 43–52 ms | 3.6–4.7 ms |
| compiled template | 0.15 ms | 0.08 ms |

Compiled rows cost about 2% of interpreted ones, and it does not matter yet:
compiling every row and card saves 5 to 6 ms of a never-seen search that
then still costs 26 to 27 ms without Foldkit's checks, against a 10 ms
limit. About 70% of the request was Foldkit re-parsing its own output
(upstream, foldkit/foldkit#1657). Re-measured 2026-11-09, a never-seen search
is about 119 ms of warm CPU under Node, parse5 41 ms of it and the rest of
Foldkit 25 ms ([performance-PLAN.md](./performance-PLAN.md), "Where it
goes"). The spike's own conclusion: compile whole regions, not rows, and
only after the checks leave the request.

The spike also found what a compiler needs that Foldkit does not export: it
copies the key fingerprint (`hydrationKeyMarker`,
`dist/hydrationMarkers.js:56`) and the serializer's escapes, both internal.

### 1.6 Native targets

Nothing is built. No package defines a `Platform` contract or a portable
view vocabulary; reffect is a separate project that nothing in `packages/`
or `examples/` depends on; [platform-DESIGN.md](./platform-DESIGN.md)
(2026-09-24, "Nothing here is built") still recommends React Native through
codegen and does not mention GPUI, though #149 asks for it to be reconciled.
What exists is the plan's inventory (§3), which is #148's Phase 0 and most of
#149's GPUI-0, and the R0 conformance suite
(`packages/plus/test/conformance/`), which any second renderer would have to
pass. ([mobile-DESIGN.md](./mobile-DESIGN.md) is about the web renderer on
phones, not native targets; nothing in it bears on this.)

## 2. Today

### 2.1 Foldkit's loop (upstream's)

```text
Message -> update -> new Model? -> requestAnimationFrame -> view(Model, h) -> vnode -> patch
```

| Step | Where | Fact |
| --- | --- | --- |
| A Message changes the Model | `dist/runtime/runtime.js:256-277` | `update` runs; if `currentModel !== nextModel` the Model is replaced, published, and `scheduleRenderFrame()` called. The Model is closure state. |
| One frame at most is pending | `dist/runtime/renderer.js:443-452` | `requestAnimationFrame(renderFramePlain)` directly, not through a service. |
| The frame draws the latest Model | `dist/runtime/renderer.js:180-234` | `view(model, htmlBuilder)` from the root under a module-level frame, then `__hydrateVNode` on the first hydrating render or a snabbdom patch. `View` and `Patch` are the two `slow` phases measured in §1.2. |
| `Html` is a vnode | `dist/html/index.d.ts:61` | `export type Html = VNode \| null`. Attributes are tagged data, lowered to snabbdom data when the element is built (`dist/html/index.js:1176`). |
| Lazy slots | `dist/html/lazy.js:132`, `:162` | `createLazy` and `createKeyedLazy` return the cached vnode when the function, both dispatchers, the Mount owner and every argument are `===` (`:66-69`); snabbdom then skips the subtree. One position per cached vnode. They read the frame (`:53`) and throw outside one (`dist/html/runtimeSingleton.js:6`). A keyed slot never evicts. |
| Mounts | `dist/html/index.js:957-1000` | `OnMount` writes snabbdom `insert`, `postpatch` and `destroy` hooks and a `foldkitMount` marker (`:143`). Acquire on `insert`; `postpatch` only hands a replayed Mount to the live runtime, and reads no new args. One per element. |
| Hydration | `dist/hydrate.js:848` | Adopts served DOM against the vnode by tag, namespace, key marker (`:397`) and identity; mismatch warnings only under `import.meta.hot` (`:348`, `:359`). |
| Server | `dist/experimental/server/server.js:767`, `:145` | Runs the view under a no-op frame, serializes the vnode, re-parses the output and compares (`assertStructureMatches`). |
| Scene | `dist/test/scene.js:159`, `:41` | Draws the vnode and walks it; finds Mounts by the marker. |
| DevTools replay | `dist/runtime/renderer.js:462` | Re-renders a past Model through the same path with a no-op dispatch. |

All of this is Foldkit's to change. The plan's §7 lists six proposals (A to
F). Its text says "None is filed"; #376's comment of 2026-10-31 records that
foldkit/foldkit#1871 (run a view with its own dispatch frame) and #1872 (the
frame scheduler as a service) were filed on 2026-10-30, with comments on
#1606, #1227 and Discussion #1873. Their state now is not known here.

### 2.2 What Foldkit Plus adds (ours)

Everything below sits on Foldkit's lazy slots and public builders. None of
it changes the loop: `view` still runs from the root every frame.

| Piece | Where | What it does |
| --- | --- | --- |
| Keyed item | `packages/mixins/src/slotView.ts:215` (`lazyFor`), `:195` (`remember`) | `slots.x.lazy(item, draw, args)`: a `createLazy` per key, forgotten once neither this pass nor the last drew it (Foldkit's keyed slot cannot evict). |
| No frame, no memo | `packages/mixins/src/slotView.ts:246` (`memoizedOr`), `:239` | Tries the lazy slot and draws uncached when it throws before the drawing starts; draws whole under a server render. |
| Region | `packages/mixins/src/slotView.ts:636` | `SlotView.region(reads, draw)`: drawn again only when a Model path its Projection names changed. Built on `Projection.derive` (`packages/surface/src/index.ts:657`), which also reports a read its `on` does not name (`:685`). |
| Kept child | `packages/bundle/src/memo.ts:22`; used at `link.ts:583`, `collection.ts:390` | A Bundle placement, `Link.child` or collection item is kept while its Model is the same object; `memo: false` opts out (#431). |
| Cheap repeated reads | `packages/remote/src/rowRead.ts:70`, `:163`; `memo.ts:20`; `domain.ts:1969` | A row read kept by the store entries it reaches, so a read keeps its identity and a memo keyed on it hits (#384). |
| Mount composition | `packages/mixins/src/resolver.ts:303` | Several Mixins' Mounts composed into the one `OnMount` an element holds. |
| A compiler front end | `packages/react-codegen/src/transform.ts:31` | Views compiled from the syntax tree to React, refusing what it cannot translate (`FKREACT0001`…). |
| Conformance | `packages/plus/test/conformance/` | The runtime, Scene and `renderToString` held to one answer; a new renderer adds a drawer. |

domains-plus uses the first three with no `createLazy` written in it
(`examples/foldkit/domains-plus/src/client/view.ts:321-327`, `:553-591`).

## 3. Options, least invasive first

In every option **the Model is the one state**: immutable, replaced once per
Message by `update`. Sync's replay, SSR's handoff, DevTools' time travel and
`Law.check` depend on that, and #376, #148 and #149 each say the same. Where
an option keeps anything beside the Model, the table says what it is and why
it is not state.

| | A. More memoization and regions | B. Compiled templates (#433) | C. A fine-grained runtime (#376) | D. A view IR for native (#148, #149) |
| --- | --- | --- | --- | --- |
| What it is | More of §2.2 on today's loop | A build step turns a view into a template and per-binding patches; server half writes strings, client half clones DOM | An own runtime or upstream services: Model reference-diffed per path, DOM bound to paths | A second view vocabulary (`ui.*`), lowered to `h` on the web and to a native renderer elsewhere |
| Beside the Model | Memo caches of drawings | Templates fixed at build; a per-region record of the last values bound | A path index of subscribers; signals internal to the renderer, never written by a program | The native renderer's own widget state (focus, scroll), never application state |
| Scene tests | Unchanged | Run the interpreted view; the compiled one is held to it by conformance | Scene must become a renderer, or tests stop describing what ships | Need a normalized-IR differ (#149's "do not compare pixels") |
| SSR adoption and hydration markers | Unchanged | Server output must be byte-identical, key markers and binding order included (§1.5); a compiled client region must adopt or own served DOM | A second hydrator: claim nodes in order and bind them; the build-id check shared | None off the web |
| DevTools | Unchanged | A compiled region must redraw from any Model, not only the next one | Replay by replacing the store's value, Mounts muted; unsolved (plan §8) | A separate inspector (#149 GPUI-8) |
| Mounts | Unchanged | A compiled region runs acquire and release itself; the tracker services are internal | Every Mount needs an equivalent; the plan counted `OnMount` in 64 source files here on 2026-10-30 | DOM Mounts do not port; #149 says avoid Mount in the first proof |
| Needs upstream | Nothing | Server: exported key marker and escapes, or Foldkit emitting templates; checks moved to build (#1657). Client: a subtree snabbdom leaves alone, or the plan's U4 | U1 to U7, or a fork | U1 to U4 for a shared runtime; reffect for "no JavaScript" |
| Rough cost | Days per change | Server: weeks. Client: months, and upkeep of a second code path for every view feature | Many months, then two renderers kept in step for good | A project of its own, mostly outside this repository |
| What the record says it buys | Measured: grid cell 3.8 → 2.2 ms; domains filter frame 7.5–9.6 → 3.6 ms of view | Server: 5–6 ms of 26–27, after upstream's fix. Client: not measured | Not measured; the plan's R3 concluded R2 unnecessary for both apps | Reach, not speed |

Notes the table cannot carry:

**A.** What is left to do is small and known: measure #431's default on an
app that has standing sibling placements; decide #439 (deferred: at most
about 1% of a frame); stop `RowModel.fromArray` re-indexing on an edit. The
checker rule of [declared-optimization-DESIGN.md](./declared-optimization-DESIGN.md)
applies, and `Projection.derive` already has its checker.

**B.** The two halves are different projects. The server half writes bytes a
test can compare with the interpreted render, so it is checkable and
reversible, and its spike exists. The client half has no public place to
stand: a view cannot be run with live handlers from outside the runtime
(`__setRuntime` is not exported; plan §3.1), a Mount's args are read once so
a Mount cannot feed a compiled region new values, and a region patched
behind snabbdom's back fights it ([reactivity-DESIGN.md](./reactivity-DESIGN.md)
§28). A compiled client view therefore needs upstream before it can ship,
whatever a spike measures. A compiler also needs every branch of a view to
be enumerable at build; #473 found tagged-union `match` makes them so, and
computed attribute arrays do not.

**C.** The plan's design (§4) is sound and keeps the Model immutable. Its
cost is not the first renderer but the second forever: IME composition,
controlled properties, focus restoration, dialogs, drag zones, and timing,
which the conformance suite does not cover. The plan set its own decision
rule (§2: "the spike decides"), and then R3 and #384 took the gain the spike
was to measure.

**D.** #149 already separates what belongs here (the view IR, the Platform
contract, a web lowering) from what belongs to reffect (compiling `update`
to native code). Its headline claim, no JavaScript runtime, is entirely the
second. The first is a second view language, which
[platform-DESIGN.md](./platform-DESIGN.md) §4 rejected as "a separate
project" because every existing view and `@foldkit/ui` component would need
porting; #149 answers that it is optional. That answer holds only while no
package's views are expected to run on it.

## 4. Recommendation

**No-go on a new runtime (C). No-go on compiled client views (B, client
half) unless one measurement says otherwise. Conditional go on compiled
server regions (B, server half), behind upstream's parse fix. Park native
targets (D). Keep doing A.**

The reasons, each from §1:

- The benchmark the issues cite is won on today's renderer: 198 against 260
  ms at 1×, 315 against 643 ms at 4×.
- Every time a cost was profiled, the larger part was reading and deriving,
  not drawing: R3's `searchViewState`, #473's `answeredOf` (26% of a
  render), #474's `modelToDependencies` (33 ms of a search).
- The plan's own test for C (the R2 spike must beat R3) was answered by R3:
  "Does R3 make R2 unnecessary for these apps? Yes."
- The bytes case has no number behind it, and cannot apply to a page that
  draws an upstream component.
- The server half has a number (2% of the interpreted cost) and a blocker
  that is not ours.

### The measurement that would change it

A frame's `view` plus `patch` is three things: (a) deriving values from the
Model and Remote, (b) building vnodes and diffing them for output that did
not change, (c) changing the DOM that did. A compiled or fine-grained view
removes (b) and nothing else. Nobody has measured (b) since the memoization
landed.

**Phase 0, the ablation bound** (decided 2026-11-10, decisions 3 and 4: in
two steps, the second run only if the first leaves something to bound; no new
code that ships).

Step 0a, about half a day:

1. Run `pnpm bench:render --app domains` and the grid on current `main`, at
   1× and `--throttle 4`, two rounds each, samples committed to
   `docs/design/renderer-baseline/`. This replaces the 2026-10-31 table.
2. Read the vnode builder's, snabbdom's and the hydrator's share of
   `foldkit`'s 40.8 KB from `scripts/bundle-report.mjs`'s per-module data.
   The figure is an estimate: the script cannot measure brotli per module
   and apportions a chunk's by each module's share of its bytes.

**Stop after 0a** if no benchmark frame's view plus patch is over 16 ms at
4× in both rounds. The threshold below then cannot be met, the ablation has
nothing to bound, and #433's client half closes.

Step 0b, about a day, only for the frames 0a leaves over 16 ms:

3. Run those frames again with each drawing replaced by a constant: every
   row, card, region and filter returns one vnode made once (as
   `compiledRow.bench.ts` replaces the list's view with an empty `ul` on the
   server). Derivations still run. The frame that remains is (a) plus the
   runtime's fixed cost; the difference from step 1 is (b) plus (c), which
   is more than any compiler or fine-grained renderer could save on that
   frame, since neither removes (c).

The live three-way comparison is not part of Phase 0 and does not gate it
(decision 5): it is #474's work.

**Benchmark:** `pnpm bench:render`, four frames at `--throttle 4`:
domains-plus's `UpdatedSearch` (a keystroke), `ReadReceived` (prices arrive)
and `SelectedItem` (filter chosen), and the grid's `CellPressed`. The
keystroke is included because patch is the largest share of it of any
recorded frame (18.6 of 40.7 ms at 4×, 46%), so it is the frame most likely
to show a renderer cost.

**Threshold:** go on to Phase 1 only if, on at least one of those frames and
in both rounds, the ablated frame is under half of the unablated one
(drawing and diffing are more than 50% of view plus patch) **and** the
unablated frame is over 16 ms. Otherwise the cost is derivation, and the
answer is more of A. Passing is necessary and not sufficient: it bounds what
Phase 1 could find, and Phase 1's spike is what measures it. Bytes are not a
reason to go on by themselves: they count only if the vdom modules are over
15 KB brotli and a page exists that draws no interpreted view, and
domains-plus, which draws `@foldkit/ui`, is not such a page.

**Phase 0a result (2026-11-10).** `pnpm bench:render --throttle 4`, both apps, 30 repetitions, two rounds (round 1 began 17:46 UTC, round 2 17:57 UTC). Not a clean baseline: another session committed from 1088a2d to 803f3dc and left uncommitted edits to `packages/remote` during both rounds, and the benchmark builds the working tree. Median view plus patch, round 1 and round 2, in ms: `UpdatedSearch` 37.9 and 38.5; `SelectedItem` 42.7 and 38.8; grid `CellPressed` in select-a-cell 16.1 and 13.5 (over 16 in round 1 only), in edit-a-cell 8.8 and 8.9. `ReadReceived` gave no frame in round 1 and one frame in round 2 (39.6), so the current scenarios do not measure it. `UpdatedSearch` and `SelectedItem` are over 16 ms in both rounds, so the stop rule does not apply: step 0b is needed for those two frames. It runs later and is not run here, and #433's client half stays open. Bytes: `foldkit/html/index.js` (the vnode builder) is 12.5 kB brotli of foldkit's 40.9 kB, estimate; `hydrate.js` 2.4 kB and `hydrationHandoff.js` 1.9 kB are the hydrator's visible share. snabbdom's modules fall outside the report's top 25 and their share is not recorded. The 1x rounds were not run, since the stop rule reads 4x only. Samples are in `renderer-baseline/2026-11-10-phase0a-cpu4x-{1,2}.json`.

**Phase 0b result (2026-11-10).** Samples in `renderer-baseline/2026-11-10-phase0b-*`. Method: `pnpm bench:render --throttle 4`, 30 repetitions, two rounds each of a clean baseline (branch tip 533dffe, no edits) and an ablated build; medians of view plus patch in ms. Baseline rounds 1 and 2 (both apps): `UpdatedSearch` 34.9 and 39.8; `SelectedItem` 36.1 and 38.6; grid `CellPressed` select-a-cell 11.6 and 12.5, edit-a-cell 7.8 and 8.9. The grid is under 16 ms in both rounds, so the threshold cannot be met for it and it was not ablated. Ablation (domains-plus only, a temporary edit to `src/client/view.ts`, reverted, never committed): in the benchmark's browser, each Top Results card, each All Results row group (with its rows), each of the 36 preview rows, the plain filters region and the footer is built once per position and the same vnode returned on every later frame. `update`, the Remote reads, `searchViewState`, `answered`, `arrangedOf`, the `WindowList` model, and the scripted filters, header and search form still run and draw, so the benchmark can still type and choose an option. Ablated medians, round 1 and 2: `UpdatedSearch` 25.0 (view 8.5, patch 16.5) and 23.6 (8.2, 15.4); `SelectedItem` 31.4 (18.9, 12.5) and 39.0 (26.4, 12.6). Drawing-and-diffing share, (baseline minus ablated) over baseline: `UpdatedSearch` 28% and 41%; `SelectedItem` 13% and -1%. Verdict by decision 4: not met. The ablated frame is under half of the unablated one in neither round for either frame (59 to 72% of it for `UpdatedSearch`, 87 to 101% for `SelectedItem`), so Phase 1's client spike is not permitted and #433's client half closes as not planned; what remains of these frames is derivation, the patch of what the frame must still change, and the runtime's fixed cost. Caveats: the ablation removes the drawing of what it replaced only, and the search form, the scripted filters (the dropdown the benchmark drives) and the header still draw; it also removes DOM changes the frame needs, so it is an upper bound on what a compiled renderer could save for the parts replaced. Row groups are keyed by position, not by group id, so `WindowList` measuring is approximate. The patch of an ablated `UpdatedSearch` frame stays at 15 to 19 ms, which nothing replaced here explains, so the 28 to 41% should not be read as a floor on the remaining cost. Noise: other sessions ran tests on this 4-core machine throughout (load average 7 to 20), so medians move by several ms. An earlier set of rounds under load average 15 to 20 (kept apart in `loaded/`) gave baseline `UpdatedSearch` 35.5 and 38.4, `SelectedItem` 41.4 and 40.5, ablated `UpdatedSearch` 28.9 and 23.6, `SelectedItem` 39.7 and 39.0, the same verdict. Ablated round 2 is from the earlier, quieter run (just after a machine restart); the other three rounds were re-run in the order ablated, then baseline. `ReadReceived` is not measured by these scenarios.

If Phase 0 passes:

| Phase | What | Done when | Needs upstream |
| --- | --- | --- | --- |
| 1 | #433's client spike as written: the results row and Top Results card compiled by hand to a cloned template and bindings, driven by a recorded sequence of Models outside the runtime | Its time per Model is recorded beside Phase 0's ablation bound on #376, and it passes the R0 conformance cases for those rows | No |
| 2 | Take the numbers upstream: the managed leaf ([reactivity-DESIGN.md](./reactivity-DESIGN.md) §27) or U4, on foldkit/foldkit#1227 | A yes or no from the maintainer | Yes; posted only with the owner's go-ahead |
| 3 | A compiler on `foldkit-react-codegen`'s front end, refusing what it cannot translate, behind the conformance suite | One region of domains-plus ships compiled, with a development-mode check against the interpreted drawing | The seam from Phase 2 |

Independently of Phase 0, the server half:

| Phase | What | Done when |
| --- | --- | --- |
| S1 | Wait for, or help land, foldkit/foldkit#1657's next step | A never-seen search's parse share is re-measured with `node scripts/workerd-cpu.mjs` |
| S2 | Whole regions compiled to string templates under #473, checked once per arm at build | `cpu.test.ts`'s budget for a never-seen search is lowered and held |

S2 is not worth starting before S1: with the checks in the request, compiled
output is still re-parsed.

## 5. Decisions

Decided 2026-11-10; the owner delegated these. Each item keeps the options
it was offered, then the choice and its reason. The premises each rests on
were checked again against the code and the recorded samples; what that
found is under "Premises checked" below.

1. **#376, the fine-grained runtime.**
   (a) Park: keep it open as the tracker of the upstream seams, build no
   runtime, reopen on Phase 0's threshold. (b) Close as not planned.
   (c) Run the plan's R2 spike anyway.

   **Decided: (a), park.** The plan's own rule was that the R2 spike must
   beat regions on today's renderer, and its §10 answers it: "Does R3 make
   R2 unnecessary for these apps? Yes", because what remained of a
   domains-plus frame was a derivation a fine-grained renderer would
   recompute too. The issue stays open only as the tracker of
   foldkit/foldkit#1871 and #1872; if both are closed upstream and Phase 0
   does not pass, close it as not planned.

2. **#433, compiled views: split it?**
   (a) Split: the server half moves under #473 (phases S1, S2); the client
   half stays on #433, gated on Phase 0. (b) Keep it whole and long term.
   (c) Close the client half now.

   **Decided: (a), split.** The server half has a number (compiled rows at
   about 2% of the interpreted cost, §1.5), a spike with four killed
   mutations, and one blocker that is upstream's. The client half has no
   measurement and no public place to stand in Foldkit (§3, note B), so it
   shares nothing with the server half but a name. It is not closed now only
   because Phase 0a is half a day and decides it on current numbers.

3. **Run Phase 0?** One to two days, and it needs workerd free for the
   benchmark. (a) Yes, before any other renderer work. (b) No: take the
   2026-10-31 numbers as final and close #433's client half.

   **Decided: (a), narrowed to two steps.** Step 0a (the re-run and the
   bytes read) always runs: the table is two changes out of date (#474's
   `answeredOf`, #431's kept child), and both go and no-go would rest on it.
   Step 0b (the ablation, which needs the example's drawings edited) runs
   only for frames 0a leaves over 16 ms at 4×, because for any other frame
   the threshold cannot be met whatever the ablation reads. The live
   comparison leaves Phase 0 (decision 5).

4. **The threshold.** (a) As written: drawing and diffing over 50% of a
   frame that is over 16 ms at 4× CPU. (b) Stricter: at 1× as well, which no
   recorded frame meets. (c) Looser: any frame over 16 ms at 4×, which
   domains-plus met on 2026-10-31 without showing the renderer was the cost.

   **Decided: (a), with three amendments.** The keystroke frame
   (`UpdatedSearch`) joins the benchmark: the proposal left it out, and it
   has the largest patch share on record (2.4 of 5.6 ms at 1×, 18.6 of
   40.7 ms at 4×). Both rounds must meet the threshold, since one recorded
   4× round read a keystroke at 29 ms against 20 under machine load
   ([384-read-memo-DESIGN.md](./384-read-memo-DESIGN.md), Results). And
   passing only permits Phase 1: the ablation removes the DOM changes a
   frame needs as well as the diffing it does not, so it is an upper bound.
   (b) would decide the question by a rule no frame can meet, and (c) by one
   a derivation-bound frame already met. The bytes rule stays as written
   (15 KB brotli and a page with no interpreted view) and cannot pass on
   either measured app today.

5. **Rerun the live three-way comparison (#426, #474) first?** (a) Yes, and
   publish only with go-ahead. (b) No.

   **Decided: (a) yes, but not first and not as a gate.** Decisions 1 to 4
   rest on Plus against stock Foldkit on the same renderer and the same
   machine (198 against 260 ms, 315 against 643 ms), and on the frame
   tables; none of them needs Solid's figure. The rerun is #474's work and
   decides only what the documents may say: until it is done, they say Plus
   is ahead of stock locally and has not been compared with Solid under the
   same conditions. A live gap to Solid reopens the renderer question only
   if a split like #474's puts more than half of the gap in the view frame,
   which was 9 ms of a 261 ms search when last split.

6. **#148, platform independence.** (a) Park: record that its Phase 0 is
   done by the plan's §3 inventory, and build no `Platform.define` until
   something consumes it. (b) Start Phase 1 (the Platform contract) now.
   (c) Close.

   **Decided: (a), park.** No package defines a `Platform` contract and
   nothing in `packages/` or `examples/` would read one, so (b) would ship a
   declared option nothing reads. (c) would drop the one part of the ask
   that is done and worth keeping findable, the inventory. It reopens when a
   second platform has a consumer: reffect's proof (decision 7), or an
   application that needs one.

7. **#149, GPUI.** (a) Park until reffect shows a Foldkit Counter's
   `update` running as native code, compared transition by transition with
   the JavaScript reference ([../native-cross-platform.md](../native-cross-platform.md),
   Phase 2); that work is outside this repository. (b) Do GPUI-1 and GPUI-2
   here now: a `ui.*` Counter lowered to `h`, in TypeScript. (c) Close.

   **Decided: (a), park.** The issue's claim is no JavaScript runtime, and
   that is tested only by native execution, which is reffect's to show. (b)
   would add a second view vocabulary to maintain and prove what is not in
   doubt, that a small vocabulary lowers to HTML. Not closed, because the
   reopening condition is concrete and someone can meet it.

8. **Reconcile [platform-DESIGN.md](./platform-DESIGN.md)**, as #149 asks.
   (a) Add a status line saying React Native through codegen is an interop
   route, not the portability architecture, and link here. (b) Rewrite it.
   (c) Leave it.

   **Decided: (a).** Its §4 recommends mapping tags to native primitives
   (`div` to `View`), which #148 and the plan both refuse for a portable
   view, so (c) leaves two design notes that contradict each other. A
   rewrite is not earned while native targets are parked. The text is in
   §7.

9. **Upstream follow-up** on foldkit/foldkit#1871 and #1872. (a) Read their
   state, and offer the frame-scheduler change as a pull request (two call
   sites, default unchanged). (b) Leave them. Posting needs the owner's
   go-ahead either way.

   **Decided: (a) for #1872 only; nothing new on #1871.** The scheduler has
   a consumer that exists: `Frames.track` in `foldkit-mixins/testing`
   replaces `globalThis.requestAnimationFrame`
   (`packages/mixins/src/testing.ts:305-377`) because Foldkit calls it
   directly at two sites (`dist/runtime/renderer.js:394`, `:452`). #1871's
   only consumer here is a compiled or fine-grained client view, which
   decisions 1 and 2 park, and Foldkit's `AGENTS.md` refuses asks made for
   hypothetical consumers. The ask does not claim the 12 ms frame wait as a
   saving (see "Premises checked"). Conditions and text are in §7.

10. **Bring the plan up to date.** Its status line, its §7 ("None is
    filed") and its §9 recommendation predate R3's conclusion, #384, #431
    and the filed proposals. (a) Amend those three places and link this
    note once the decisions above are made. (b) Leave it as a dated record.

    **Decided: (a).** Its §9 still says to run "R2, the spike that decides
    the rest" while its own §10 says R2 is unnecessary for these apps, and
    its §7 says nothing is filed when two proposals were. A plan that reads
    as current and is not is the stale summary `CLAUDE.md` warns of. Only
    those three places change; the text is in §7.

### Premises checked

Checked 2026-11-10 at commit `922b0ab`.

- **Held.** The 2026-10-31 frame figures match
  [384-read-memo-DESIGN.md](./384-read-memo-DESIGN.md)'s tables and the
  sample files exist; the plan's R3 conclusion is quoted exactly; commit
  `17a6c04` is #474's `answeredOf` change; `bench:render` takes `--app` and
  `--throttle`; the search and bundle figures match
  [performance-PLAN.md](./performance-PLAN.md); the #473 spike's four files
  exist; Foldkit asks for a frame at two call sites.
- **Wrong: the benchmark left out the frame most likely to pass it.** §4
  named three frames and omitted the keystroke, whose patch is 46% of the
  frame at 4×. Decision 4 adds it.
- **Overstated: "it is the 12 ms frame wait in a search"** (decision 9 as
  proposed, §1.3 point 3). The wait is the scheduler's, but nothing has
  measured a search under any other scheduler, and drawing outside a frame
  can cost layout work. The upstream ask rests on tests alone.
- **Imprecise, and corrected in §1.2: "the one round its source kept".** Both 4× rounds'
  samples are committed (`2026-10-31-384-after-cpu4x-1.json`, `-2.json`);
  the #384 note's table leaves out round 1 because the machine was loaded.
- **Not verified.** The state of foldkit/foldkit#1871, #1872, #1657, #1227
  and #1655: this session has no access to that repository. That #1871 is
  the plan's Proposal D and #1872 its Proposal C is taken from their
  one-line descriptions in §2.1, not from the issues. The state of #473,
  #474 and #426 here was not read either.

## 6. Risks, review points, rejected alternatives

### Risks of the recommendation

- **The benchmarks are two apps.** Both draw windows of a list. An app with
  a large tree that changes everywhere at once (a canvas editor, a dense
  dashboard) could spend its frame in (b), and neither app would show it.
  The page builder is the nearest here; region memoization took its events
  from about 50 to 17 ms ([reactivity-DESIGN.md](./reactivity-DESIGN.md)
  Phase 1, as the plan records). Phase 0 could add it as a third app.
- **4× throttling is not a phone.** The plan found view scaling 6 to 10×
  under a 4× throttle. A threshold at 4× is an order of magnitude.
- **Local is not live.** The search figures the recommendation rests on are
  local. Decision 5 exists for this.
- **Parking has a cost if upstream moves.** Blocks is reshaping Mounts
  (foldkit/foldkit#1655). A seam is cheapest to ask for while that is open;
  decision 9 keeps the one small ask with a consumer alive.
- **Memoization is easy to get wrong.** R3's first round made filter frames
  slower, because a memo that misses costs more than none. Every further
  step of A is counted in draws, not assumed.

### Review points

- §1.2's table mixes two measurement dates per app; each row names its
  samples. Check them against `docs/design/renderer-baseline/`.
- §1.3 point 3 uses a split taken before #474's cut; the parts that are
  Foldkit's (frame wait, paint) are unchanged by it, the view frame is not.
- §2's line numbers are for `foldkit@0.170.0` and commit `1c1956b`.
- The Mount count in §3 is the plan's grep of 2026-10-30, not repeated here.

### Rejected alternatives

- **A serializer of our own, to escape the parse checks.** Already rejected
  in [performance-PLAN.md](./performance-PLAN.md): it would track Foldkit's
  hydration markers and build stamp exactly, to work around a cost upstream
  is cutting.
- **An accessor `h`** (`h.Text(m => m.count)`; plan §4.5 option 2). Every
  view is rewritten, and a Model read outside an accessor silently stops
  updating.
- **Direct DOM writes from a Mount beside snabbdom.** A Mount reads its args
  once and snabbdom owns the subtree; the write is undone or fought on the
  next patch.
- **A custom element as the compiled leaf** (Foldkit sets its properties on
  patch; the element clones a template inside). It works without upstream,
  but it is drawn outside every Slot, so no Mixin or stylist reaches it, and
  the server would need declarative shadow DOM or a second render path.
- **Forking Foldkit for a `Renderer` service.** Every upstream release would
  be merged by hand, for a gain nothing has measured.
- **Mapping HTML tags to native widgets.** #148 and the plan both refuse it.
- **React Native through codegen as the native route.** It remains a valid
  interop path ([platform-DESIGN.md](./platform-DESIGN.md)), but it keeps a
  JavaScript runtime, which is the thing #149 sets out to remove.
- **Running the state machine under Node and driving GPUI remotely.** #149
  refuses it: it would not show what the issue claims.

## 7. Issue actions

For the coordinator. None of these is done; this note changed no other file
and posted nothing.

### Issues in this repository

**#376: park, keep open.** Comment:

> Parked 2026-11-10, decided in
> `docs/design/376-433-148-149-renderer-DESIGN.md` (decision 1). No runtime
> will be built here. The plan's test was that the R2 spike must beat
> regions on today's renderer, and R3 answered it: what remained of a
> domains-plus frame was a derivation over Remote reads, which a
> fine-grained renderer would recompute too. Since then a new search went
> from 61 ms behind stock Foldkit to 62 ms ahead at 1× (198 against 260 ms,
> local, 2026-11-09) with the renderer untouched. This issue stays open as
> the tracker of the upstream seams (foldkit/foldkit#1871, #1872). Work on
> it reopens only if Phase 0 of that note passes: on a re-run of
> `pnpm bench:render`, a frame over 16 ms at 4× CPU of which drawing and
> diffing are more than half, in both rounds. If Phase 0 does not pass and
> both upstream issues are closed, this closes as not planned.

**#433: split.** The server half (phases S1 and S2) moves to #473; if #473
is closed, open an issue titled "Compiled server regions, after upstream's
parse fix" with the second paragraph below. #433 stays open for the client
half until Phase 0a. Comment on #433:

> Split 2026-11-10, decided in
> `docs/design/376-433-148-149-renderer-DESIGN.md` (decisions 2 to 4).
>
> Server half, now under #473: the hand-compiled row costs about 2% of the
> interpreted one, and it does not matter while Foldkit re-parses its
> output in the request (foldkit/foldkit#1657). S1: re-measure the parse
> share of a never-seen search with `node scripts/workerd-cpu.mjs` after
> upstream's next step. S2, only after S1: whole regions compiled to string
> templates, checked once per arm at build, done when `cpu.test.ts`'s
> budget for a never-seen search is lowered and held.
>
> Client half, here: parked on one measurement. Phase 0a re-runs
> `pnpm bench:render` on current `main` (domains-plus's `UpdatedSearch`,
> `ReadReceived` and `SelectedItem`, the grid's `CellPressed`; 1× and 4×,
> two rounds). If no frame is over 16 ms at 4× in both rounds, this closes
> as not planned. Otherwise Phase 0b ablates the drawing of those frames,
> and the spike this issue describes is run only if drawing and diffing
> are more than half of one of them. Bytes are not a reason by themselves:
> the vdom share of Foldkit's 40.8 KB is unmeasured, and no page here draws
> no interpreted view.

When Phase 0a is recorded: close #433 as not planned if it stops there,
with the samples' file names in the closing comment.

**#148: park, keep open.** Comment:

> Parked 2026-11-10, decided in
> `docs/design/376-433-148-149-renderer-DESIGN.md` (decision 6). Phase 0
> (what is neutral and what is Web) is done by §3 of
> `docs/design/foldkit-renderer-independence-PLAN.md`. No `Platform.define`
> and no `ui.*` vocabulary will be built until a second platform has a
> consumer: nothing in `packages/` or `examples/` would read the contract,
> and a contract no platform can refuse anything through checks nothing.
> Reopens on #149's condition, or on an application that needs a second
> platform.

**#149: park, keep open.** Comment:

> Parked 2026-11-10, decided in
> `docs/design/376-433-148-149-renderer-DESIGN.md` (decision 7). The claim
> here is no JavaScript runtime, and the step that tests it is outside this
> repository: reffect running a Foldkit Counter's `update` as native code,
> compared transition by transition with the JavaScript reference
> (`docs/native-cross-platform.md`, Phase 2). GPUI-0 is covered by the
> renderer-independence plan's §3. GPUI-1 and GPUI-2 (a `ui.*` Counter
> lowered to `h`) are not started: they would show that a small vocabulary
> lowers to HTML, which is not in doubt. Reopens when that reffect proof
> exists.

**#474: no state change.** Comment:

> From `docs/design/376-433-148-149-renderer-DESIGN.md` (decision 5): the
> live three-way rerun stays this issue's work and gates no renderer
> decision. Until it is run, documents say Plus is ahead of stock Foldkit
> locally (198 against 260 ms at 1×, 315 against 643 ms at 4×, 2026-11-09)
> and has not been compared with Solid under the same conditions. Publish
> the result only with the owner's go-ahead. A gap to Solid reopens the
> renderer question only if a split of one search puts more than half of
> the gap in the view frame.

**#426: no action from this note.** If it is open, link #474's comment
above from it.

### Other documents

**[platform-DESIGN.md](./platform-DESIGN.md).** Add this paragraph after
its opening status paragraph (the one ending "without weakening the web
path."), and change nothing else:

> **Update 2026-11-10.** §4's Option A (codegen hosts: React Native through
> `foldkit-react-codegen`) is an interop route for an application that
> already has a React Native host. It is not this repository's portability
> architecture: it keeps a JavaScript runtime, and its tag mapping (`div`
> to `View`) is what #148 and
> [foldkit-renderer-independence-PLAN.md](./foldkit-renderer-independence-PLAN.md)
> refuse for a portable view. Native targets, GPUI (#149) included, are
> parked: see
> [376-433-148-149-renderer-DESIGN.md](./376-433-148-149-renderer-DESIGN.md),
> decisions 6 to 8. The sections before §4, on which parts of Style and
> Behavior mean something off the web, stand.

**[foldkit-renderer-independence-PLAN.md](./foldkit-renderer-independence-PLAN.md).**
Three places.

Its status line: replace the first sentences, up to and including "nothing
else is.", with the text below, and keep what follows ("Tracks #376;
related to …") as it is.

> **Status:** plan, 2026-10-30; its recommendation (§9) was superseded on
> 2026-11-10 by
> [376-433-148-149-renderer-DESIGN.md](./376-433-148-149-renderer-DESIGN.md).
> R0 is built, R1 measured, and R3 built and measured (§10). R2 and every
> later phase are parked: R3 made R2 unnecessary for both measured apps.
> The inventory (§3) and the seams (§4) stand as the reference for any
> later renderer work.

Its §7: replace the sentence "None is filed." with the text below. Before
committing it, check against #376's comment of 2026-10-31 that the two
issue numbers are these two proposals.

> Proposal C was filed on 2026-10-30 as foldkit/foldkit#1872 and Proposal D
> as foldkit/foldkit#1871, with comments on #1606, #1227 and Discussion
> #1873. A, B, E and F are not filed, and are not to be while no renderer
> here consumes them.

Its §9: add this paragraph at the end of the section.

> **Update 2026-11-10.** R0, R1 and R3 are done, and R3 answered R2's
> question for these apps (§10), so R2 is not run. The decision rule is
> now Phase 0 of
> [376-433-148-149-renderer-DESIGN.md](./376-433-148-149-renderer-DESIGN.md):
> renderer work restarts only if a re-run of `pnpm bench:render` shows a
> frame over 16 ms at 4× CPU of which drawing and diffing are more than
> half. Proposal C is still worth asking for by itself, for tests.
> Proposal E is not pursued while nothing here needs Mounts by meaning.

### Upstream

Not posted. Nothing new goes to foldkit/foldkit#1871.

**foldkit/foldkit#1872, the frame scheduler.** Read the issue first. Post
only if it is open and the maintainer has not declined it; if a maintainer
has asked a question there, answer that instead. If it was closed as not
planned, post nothing and record that on #376. Text:

> A consumer for this that exists today: `foldkit-mixins/testing` ships
> `Frames.track`, which replaces `globalThis.requestAnimationFrame` so a
> test can wait for the frames an app asked for, or hold them to reproduce
> a race between a keystroke and a draw. It has to patch the global
> because the runtime calls `requestAnimationFrame` directly at two sites
> in `runtime/renderer.js` (0.170.0), and a global patch also catches
> every other caller on the page. If the runtime read its frame request
> from a service whose default is `requestAnimationFrame`, a test could
> provide a deterministic one and the default would behave as it does now.
> I can send that as a pull request: the two call sites, the service with
> its default, and a test that provides a manual scheduler. Would you take
> it?
