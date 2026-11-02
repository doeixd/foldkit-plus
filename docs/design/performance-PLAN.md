# Performance: server CPU, client size, layout shift

Status: plan (2026-11-02). Issues #413–#440, under #411. The principle
behind the "Beyond parity" levers is
[declared-optimization-DESIGN.md](./declared-optimization-DESIGN.md): Plus
knows what each region reads and sends, what each page needs and who may
see it, and every optimization that trusts a declaration ships a
development-mode checker that catches a declaration that lies.

## Why

domains-plus is the same app as Foldkit's own `foldkit-domains` and the
Solid 2.0 recreation in `doeixd/solid-domains`, so the three compare
directly. Measured 2026-11-02 with solid-domains' `scripts/benchmark.mjs`
(15 cold loads per site, medians), PageSpeed Insights, and its line counter:

| | Solid 2.0 | stock Foldkit | Foldkit Plus |
| --- | ---: | ---: | ---: |
| Loads failing with 1102 | 0 of 15 | 0 of 15 | 107 of 117 |
| Time to first byte, ms | 64 | 52 | 1,292 |
| Top Results priced, ms | 188 | 619 | 1,404 |
| New search, ms | 213 | 251 | 269 |
| JavaScript, brotli | 79 KB | 215 KB | 289 KB |
| HTML, brotli | 5.4 KB | 4.5 KB | 27.7 KB |
| CLS, desktop | 0 | 0.771 | 0.787 |
| App code, lines | 2,664 | 3,280 | 2,928 |
| Style code, lines | 933 (CSS) | 710 (CSS) | 1,126 (`style.ts`) |

The Foldkit Plus timings come from its 10 loads that answered. Its pages are
whole without JavaScript (the server reads every price it shows), which is
the right design and the reason its server work matters: every page costs
CPU before its first byte.

## Where it goes

**Server CPU** (`Cpu.budget`, #339; a V8 profile of `/?q=acme`):

| Cost | Share | Issue |
| --- | --- | --- |
| Foldkit's server re-parses its own output with parse5, three times a page | ~175 ms | #413 |
| Garbage collection, mostly from the above | ~55 ms | #413 |
| Drawing the view: 66 priced names | ~38 ms | #415 |
| `Style.usedIn` scanning the rendered HTML | unmeasured | #414 |
| Cold start: a 2.1 MB Worker bundle evaluated per isolate | 345 ms cold against 135 ms warm under Node | #416 |

**Client JavaScript**: one 249 KB-brotli chunk, unattributed (#421), holding
DevTools (~23 KB, #422), every sheet and picker (#423), and the whole style
system: compiler, hasher, theme builder, recipes as data, injector (#420).

**HTML**: the theme stylesheet, about 92 KB uncompressed, inlined into every
response (#419).

**Layout shift**: unattributed. The list's take-over is the likeliest cause,
since stock Foldkit shifts as much (#418).

**Style code**: per-app restyling of shipped components toward upstream's
look (#424).

## Targets

#426 tracks the outcome against the baseline above:

- no 1102s on the free plan: under 10 ms of CPU warm (#417);
- time to first byte within 2× Solid's;
- Top Results priced sooner than stock Foldkit;
- JavaScript under stock Foldkit's;
- HTML under 8 KB brotli;
- CLS under 0.1;
- `style.ts` under 700 lines.

## How Foldkit Plus can beat base Foldkit

Base Foldkit gives a program contract and a runtime: one Model, `update`, a
virtual DOM drawn whole on every Message, and a server that renders a shell.
Plus knows more about each program than the runtime does: what each region
reads (Surfaces, Projections), what data a page needs and how fresh it may be
(Remote, Entity, Query bodies), which Messages a region can send, and what is
fixed at build (styles, routes). Every lever below spends that knowledge.

| Lever | What Plus knows | Issues |
| --- | --- | --- |
| Data in the first paint, read once | A page's reads, resumed instead of refetched | built (#388); cheap with #413–#416; started at route match (#435) |
| Render once what never changes | Which regions read nothing per request | #434 partial prerendering |
| Send only what the client reads | Which Model slices interactive regions read | #436 |
| Check only what a Message can change | Each region's reads against each Message's writes | #439 invalidation map |
| Catch a slow Query at build | Every filter and order is declared | #437 index checks |
| Split per route | The Site tree's Bundles and Surfaces | #438 |
| Decode only what a page reads | Each page's Selections | #440 |
| Fewer requests | A normalized store, derived refresh | built (#386 single flight, #401 Back and Forward); #428 caches public reads and pages at the edge |
| Less work per update | What each region reads | #431 memoizes regions by it by default (built opt-in: #384, #385) |
| Less work at build time | Styles and their classes are fixed per build | #419, #420 |
| Less JavaScript for display | Which regions send no Messages | #432 islands |
| Platform over script | Recipes own the components | #429 `content-visibility` lists, #430 popover, anchor positioning and `<dialog>` |
| Earlier first byte | Which regions are first-screen | #427 streams the first screen first |
| A different renderer | Surfaces declare reads; `react-codegen` compiles views | #433 compiled views, with #376 |

Stock Foldkit's domains app reaches priced Top Results in 619 ms because it
fetches after its script runs; Solid reaches them in 188 ms by pricing on the
server. domains-plus already prices on the server, so once rendering is
cheap it should match Solid there, a 3× gain over base Foldkit that a runtime
alone cannot reach.

## The floor

Foldkit's virtual DOM plus Effect's runtime is a floor on client bytes that
nothing short of #432 or #433 lowers: an estimated 100–150 KB brotli, to be
measured by #421. Solid's 79 KB is below it. Plus also adds code base
Foldkit does not have (Remote, Entity, Site); it is a net gain only where it
replaces application code and requests, as it does in domains-plus (2,928
lines against 3,280, prices in the first paint). #378, #396 and #397 keep a
read-only page free of what it does not use; #421 extends that discipline to
whole applications with a budget.

## Order

**Phase 1: fix what is broken.** These touch separate code and can run in
parallel.
- **Server CPU**, the cause of the 1102s and the slow first byte:
  - #413: `foldkit-ssr`'s own serializer, with the fidelity checks run in
    development, tests and once per build. Upstream, separately: ask Foldkit
    to let production skip them (a draft, posted only with the maintainer's
    go-ahead).
  - #414: the drawn classes come from the render.
  - #434: prerender at build the regions that read nothing per request, so
    they cost nothing per request whatever the serializer costs.
  - #415: render the first screen only.
  - #416: cold start.

  #417 closes when `cpu.test.ts` holds 10 ms.
- **Layout shift** (#418): find the moving nodes and add a CLS budget.
- **Measurement** (#421): a bundle report by package and a JS budget. Its
  table decides how much #420 and #432 are worth, and what else to file.

**Phase 2: bytes.**
- #419: the stylesheet as a cached asset (a `foldkit-mixins/vite` plugin).
- #422: DevTools in development only.
- #423: sheets and pickers on intent.
- #420: zero-runtime style modules, if #421 shows the style system is worth
  removing.

**Phase 3: beyond parity, cheap and visible.**
- #428: edge caching from the declarations. A cached page also costs no CPU.
- #429: `content-visibility` lists. They remove the list's measuring code,
  and probably #418's shift with it.
- #430: platform popups, removing floating-ui.
- #431: regions memoized by default, measured with `pnpm bench:render`.
- #427: streaming SSR, with #435 starting every read at route match.
- #436: resume only the slices an interactive region reads.

Then, from the declared-optimization note:
- #439: the invalidation map, after #431.
- #437: index checks.
- #438: route splitting.
- #440: selection codecs, if #421 shows Schema is a real share.

Each lands with its checker in the same change.

One decision joins #415, #427 and #429: how much of a long list the server
draws. Drawing all 556 rows as `content-visibility` rows is the best page
(no layout shift, find-in-page, no measuring), but the view's cost grows
with the rows (about 38 ms for 66 today). Measure it after #413. Then either
the server draws every row unpriced and streams it after the first screen
(#427), or it draws the first screen only and the client draws the rest.

**Phase 4: long term, with upstream.**
- #432: islands. A spike first, to measure what static regions would save.
- #433: compiled views, with #376 and foldkit/foldkit#1227. A spike on one
  row and card first.

**Throughout:**
- #424: recipe defaults, so `style.ts` shrinks.
- #425: the Linux CI job running every budget.
- #426: once Phase 1 and the parts of Phase 2 that move the headline
  numbers land, redeploy, rerun the comparison, and publish it with the
  maintainer's go-ahead.

## What we keep

Rendering prices on the server stays. It is why the page works without
JavaScript (#388) and why the first screen can be priced at first paint,
which neither client-priced Foldkit nor a slower server can match. The plan
makes that work cheap rather than removing it.

The fidelity Foldkit's checks protect stays too, moved to where it is
cheap. A page whose markup a parser would rebuild differently is still
refused, by the conformance suite and the per-build check, instead of on
every request.
