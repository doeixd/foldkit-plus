# Performance: server CPU, client size, layout shift

Status: plan (2026-11-02). Issues #413–#426, under #411.

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

## Order

1. **Server CPU**, the cause of the failures and of the slow first byte:
   - #413 renders through `foldkit-ssr`'s own serializer, with the
     fidelity checks run in development, tests and once per build;
   - #414 takes the drawn classes from the render;
   - #415 renders the first screen only;
   - #416 measures and cuts cold start.

   #417 closes when `cpu.test.ts` holds 10 ms. Upstream, separately: ask
   Foldkit to let production skip its checks (a draft, posted only with the
   maintainer's go-ahead).
2. **Layout shift** (#418): measure the moving nodes, fix them at their
   source, and add a CLS budget to the e2e tests.
3. **Measurement before cutting** (#421): a bundle report by package and a JS
   budget per example. Its table decides how much #420 is worth, and what
   else to file.
4. **Bytes:**
   - #419: the stylesheet as a hashed, cached asset through a
     `foldkit-mixins/vite` plugin. It helps every server-rendered app.
   - #422: DevTools in development only.
   - #423: sheets and pickers loaded on intent.
   - #420: zero-runtime style modules, evaluated at build. Only if #421
     shows the style system's share is worth it.
5. **Lines:** #424, recipe defaults that need less restyling.
6. **Holding the gains:** #425, a Linux CI job running every budget with a
   summary table.
7. **Publishing:** #426, redeploy domains-plus, rerun the comparison, and
   deploy solid-domains' `/compare` with the maintainer's go-ahead.

Steps 1, 2 and 3 touch separate code (ssr and mixins; mixins-ui and the
example's layout; scripts), so they can run in parallel. Step 4 waits on 3.

## What we keep

Rendering prices on the server stays. It is why the page works without
JavaScript (#388) and why the first screen can be priced at first paint,
which neither client-priced Foldkit nor a slower server can match. The plan
makes that work cheap rather than removing it.

The fidelity Foldkit's checks protect stays too, moved to where it is
cheap. A page whose markup a parser would rebuild differently is still
refused, by the conformance suite and the per-build check, instead of on
every request.
