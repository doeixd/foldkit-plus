# Solid 2's form actions, cache and progressive enhancement, against Foldkit Plus

Status: comparison (2026-10-31). The source is the Solid 2 full-stack practice
guide, verified on `solid-js@2.0.0-rc.20`, `@solidjs/router@2.0.0-next.43` and
`@solidjs/vite-plugin` start mode in an SSR domain-search app with a cart,
the same app as `examples/foldkit/domains-plus`. A companion to
[solid-2-optimistic-COMPARISON.md](./solid-2-optimistic-COMPARISON.md), which
covers stores and optimistic state.

## How Solid 2 does it

**Cache: `query(fn, key)`.** Keyed per call, not normalized. It dedupes on the
server for one request, fills a 5-second browser preload cache (so a link
preload and the route entry share one fetch), serves Back and Forward from
cache for up to 5 minutes (navigation the user starts bypasses it), and
refetches by key on `revalidate(key)`; `query.set` seeds an entry. A hit
still returns a promise, so on the server every reading boundary suspended:
37 rows cost 4.0 ms of render against 1.9 ms with one loader that fetched the
page's data first, read synchronously.

**Mutations: `formAction`.** An action with a URL. Without JavaScript it is a
real POST; the server runs it, redirects back, and the result reaches
submission state through a one-shot cookie. With JavaScript the router
handles the submit. A submitting form carries `aria-busy` until the result is
on screen, revalidation and redirect included. `.onSubmit()` feeds an
optimistic store, `useSubmissions()` keeps settled records (`input`,
`result`, `error`, `retry()`), and `.with(id)` binds typed arguments in place
of hidden fields.

**Single flight, on by default.** A mutation's response carries the refreshed
data of the page, or of the page it redirects to. Every POST server function
is a mutation; one that names no keys revalidates every query on screen, so a
cart add refetched every visible price until it returned
`respond(value, { revalidate: "" })`.

**Progressive enhancement is a practice, not a switch:**

1. Everything visible is in the HTML before the shell flushes (a loader, or
   `deferStream`); streamed content stays its fallback without JavaScript.
2. No-JS controls render on both sides and show under
   `@media (scripting: none)`, never server-only or in `<noscript>`, so
   hydration matches.
3. Filters, sorting and search are GET forms over the search params the
   server already reads.
4. A virtual list gets paging links (`?from=33`); under `scripting: none` it
   lays out in normal flow.
5. A mutation is a form posting to a server function, intercepted on the form
   element when JavaScript runs: about 1 KB, and the router's form-action
   chunk never loaded.
6. A Playwright test with `javaScriptEnabled: false` stays in the suite, and
   a second check that the JavaScript path did not change (no form POST in
   the network log, no new chunks, no hydration warnings).

Link preloading has four strategies: intent, tap, viewport and eager. The
last two skip Save-Data and 2g connections. A viewport or eager data preload
is worth it only when the cache outlives the moment of clicking.

## Against Foldkit Plus

| | Solid 2 | Foldkit Plus |
| --- | --- | --- |
| Cache | Per-call keys; 5 s preload, 5 min Back/Forward | A normalized store; `cacheFirst`, `staleWhileRevalidate`, `networkOnly`; retention within a budget; `Data.persistence` |
| What a write refreshes | Keys the mutation names, or everything on screen | Derived: the answer carries what active Surfaces show of the rows it names; nothing to name, and no "revalidate everything" default to opt out of |
| Optimistic | An optimistic store fed by `.onSubmit` | Declared predictions, checked by `Law.check` and `verifyPredictions` |
| Single flight | The whole page, by default | Rows: yes. A list whose membership changed refetches in a second request ([site.md](../site.md), "designed but explicitly last") |
| Forms without JavaScript | `formAction`: POST, redirect, cookie | `foldkit-ssr`'s `fallback: 'server'`: the form posts its encoded Message to its own URL, and `SSR.handle` runs the same `update`. No action routes |
| Submission state | `aria-busy` until the result shows; `useSubmissions` with `retry()` | `foldkit-form`'s `submitPending` covers the form's own checks; `Data.failedWrites`/`Data.retry` exist, but nothing ties a form's busy state to its write being answered |
| Preloading | Intent, tap, viewport, eager | `Site.routing`'s `preload` on intent and tap (#227); viewport deferred (#236) |
| Back and Forward | Served from cache for 5 minutes | `cacheFirst` shows held rows but reads `Refreshing` and refetches; only `staleWhileRevalidate` within `maxAge` sends nothing |
| Server rendering | Streams; no-JS visitors need a loader or `deferStream` | Renders the page whole, pre-read through `Data.satisfy`; nothing streams in |
| No-JS as a practice | A guide and a JavaScript-off test | Neither; domains has one no-JS test, for sharing metadata |

## What we take

1. **Single flight for lists** (#386): a write's answer also carries the
   first page of each held list whose membership it moved, as it already
   carries rows, so archiving out of a list costs one round trip. Begin with
   the request-count benchmark `site.md` asks for.
2. **A form's busy state is its write's** (#387): a form submitting through a
   Remote Mutation reads busy (`aria-busy`) until the write is answered and
   its layer released, and a refused or failed write lands back on the form
   with its retry. Solid's "until the result is on screen" is the bar.
3. **Progressive enhancement as a practice, proven on domains-plus** (#388):
   a guide, GET-form filters, paging links for the virtual list,
   `scripting: none` styles through `Style`, the cart through
   `fallback: 'server'`, and a JavaScript-off e2e test. Domains-plus is the
   app Solid's numbers come from, so the two compare directly, and it would
   be `fallback: 'server'`'s first use in a running example.
4. **Back and Forward from what is held** (comment on #236): a history
   navigation (`popstate`) reads held data `Ready` within a window instead of
   refetching under `cacheFirst`; a navigation the user starts still asks.
   `Site` knows which kind a navigation is; Remote's plan would take it as a
   Message, the way time reaches it.
5. **Viewport preloading's limits** (comment on #236): skip Save-Data and slow
   connections, and preload code only by default, since Remote's retention,
   not a 5-second window, decides how long a preload lives.

What we do not take: per-call key caches (the normalized store and derived
refresh are the point of Remote), a separate action route per mutation
(`fallback: 'server'` runs `update`), and `respond(..., { revalidate: "" })`
(nothing here revalidates by default).

The size lesson carries to #378: Solid's form enhancement cost about 1 KB
because nothing the page did not use was loaded, which is the same rule as
[378-capabilities-DESIGN.md](./378-capabilities-DESIGN.md).
