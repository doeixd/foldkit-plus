# Foldkit Domains on Foldkit Plus

A reimplementation of [foldkit/foldkit-domains](https://github.com/foldkit/foldkit-domains),
the domain-search page modelled on Vercel Domains: type a name, see it under
556 extensions with sample prices that load as the rows come into view,
filter and sort them, and put some in a demo cart. It runs on the released
Foldkit (0.170) with Foldkit Plus taking over what each of its packages owns.
The upstream application is copied unchanged beside it, at
[`../domains`](../domains/README.md), so the two run side by side and
upstream's own Playwright suites run against both.

The plan this follows, and what each package owns here, is
[`docs/design/foldkit-domains-PLAN.md`](../../../docs/design/foldkit-domains-PLAN.md);
its §8 records what each phase built and where it departs from the plan.

## Who owns what

```text
box ─ UpdatedSearch ─▶ query ──── Mirror.url ───▶ ?q=
                         └─ debounce (150 ms) ─▶ settledLabel
settledLabel + WindowList window + filters ─▶ TopResults · VisibleResults · WholeCatalog Surfaces
   └─ Remote plans the names it lacks ─▶ POST /remote ─▶ remote (the store) ─▶ view
```

| State | Owner |
| --- | --- |
| What the box holds, the route, the layout, the filters, the cart | the Model, changed in `update` |
| `?q=` | `foldkit-mirror` mirrors `query`; back and forward come back as a keystroke through the debounce |
| The label the reads use | the debounce bundle from `foldkit-primitives/time` |
| Prices and availability | the server; `foldkit-remote` keeps them in the Model by name (`Domain`, an Entity with variants), fresh for a minute |
| Which rows are drawn | `foldkit-mixins-ui`'s `WindowList`, in the page's own scroll |
| The page served before the bundle | `foldkit-ssr`: every page is rendered by the Worker's entry and resumed from the plan's slice; typing before boot is kept |

## What is built

| Phase | What it adds |
| --- | --- |
| 0 | The landing page and the 404 (served with status 404), rendered by `foldkit-ssr` through the Worker's entry and resumed in the browser; the route from `foldkit-site`; the look from a `foldkit-mixins` theme, with no CSS file |
| 1 | Search as you type: `query` mirrored to `?q=` by `foldkit-mirror`, the label the reads use settled by `foldkit-primitives`' debounce, pending cards and rows, the invalid-label error, Escape and the clear button |
| 2 | The Top Results' prices, read by name through `foldkit-remote` from `/remote` (`foldkit-remote-server`'s `serveFetch` in the Worker's entry), fresh for a minute; the failed-search error and Try again |
| 3 | All Results: every name in rows of six, drawn by `foldkit-mixins-ui`'s `WindowList` in the page's scroll; the rows in view (and two past each end) read their prices; the count of names checked |
| 4 | Filters and sort: availability and sort as `Picker`s (a dropdown on a desktop, a sheet on a phone), the TLD as a dropdown with typeahead or a searchable sheet; the Available filter and the price sorts read the whole catalog |
| 5 | The cart: add and remove, the count said in a live region, the cart as a sheet at the right edge with the total; focus moves to the close button on a removal and back to the Cart button on close |
| 6 | Typing before the bundle runs is kept (`rh.KeepTyped()`), DevTools ship in the build, and the built Worker runs under `pnpm preview` |
| 7 | Upstream's dark dropdowns and sheets, the results list as a described tab stop, the page back at its top when the search empties, and the parity checks below |

## How it compares to the upstream copy

| Upstream (Blocks preview) | Here |
| --- | --- |
| `Program.make` + `Runtime.hydrate`, `Server.renderToString` | `foldkit-ssr`'s `SSR.entry` and `SSR.hydrate` with a resume plan (`app.ts`'s `plan`) |
| `route.ts`'s parser and titles | `foldkit-site`: one node for `/`, `Site.parse` falling back to NotFound |
| `?q=` in the route, written by a `ReplaceSearchUrl` Command per keystroke | `query` in the Model, kept in `?q=` by `Mirror.url` (replace) |
| A 150 ms sleep inside the fetch, cancelled by interruption | `debounce` from `foldkit-primitives/time` between the box and `settledLabel` |
| `SearchDomains({ label, offset, limit })` over Effect RPC at `/rpc`, cached by a `KeyedQuery` per range | `Domain` as a variant Entity read by name; the rows on screen declare what they need and Remote batches it (`foldkit-remote`, `/remote`) |
| A Blocks `VirtualList` with a window scroll container (upstream patches it) and a planner for the next range to fetch | `WindowList`, and `WindowList.windowOf` naming the rows whose names the `VisibleResults` Surface reads |
| Three Blocks Listboxes and two hand-made dialogs for the phone | `foldkit-mixins-ui`'s `Picker` for availability and sort (one Model, one `Chose`), a `ListboxView` dropdown and a `Sheet` for the TLD |
| A Blocks Dialog for the cart | a `Sheet` at the right edge |
| An inline script that answers typing before the bundle, and a handoff Command | `rh.KeepTyped()`: the typing is kept and replayed; nothing answers it before boot ([#372](https://github.com/doeixd/foldkit-plus/issues/372)) |
| Tailwind 4 and `styles.css` | `style.ts`: one theme, every element a Slot; the Slots upstream's suites select carry upstream's class |
| `icon.ts`, hand-copied Lucide paths | Lucide by name in `icons.json`, written to `src/client/iconData.ts` by `pnpm icons` and drawn with `foldkit-media`'s `Icon.draw` |

What upstream wrote that the port does not need: `domainsQuery.ts`,
`domainPlanning.ts`, `steps/domainLoading.ts`, the cancel and generation
logic of `steps/search.ts`, `searchGeneration`, `selectedDomainRanges`, the
RPC schema and client, `bootstrap.ts` and its handoff Command.

Where it behaves differently, on purpose or because of a gap in Foldkit Plus:

- A phone has an opener for the TLD, one for availability and one for sort;
  upstream's has the TLD and one "Filters and sort" sheet.
- The first page of a search asks for the top four, then for the rows in
  view, as upstream did (4, then 56); a scroll asks for exactly the rows it
  brings into view, not the next 60-name page.
- Nothing is prerendered: the Worker renders every page, since a static `/`
  served for `/?q=` is refused ([#373](https://github.com/doeixd/foldkit-plus/issues/373)).
- The 404 status is set on `SSR.entry`'s result ([#364](https://github.com/doeixd/foldkit-plus/issues/364)),
  and the page's styles ride in the document's head ([#365](https://github.com/doeixd/foldkit-plus/issues/365)).

## Parity

**Upstream's Playwright suites, unchanged, against the built Worker**
(`pnpm parity`, Chromium, two workers, 2026-10-30): **27 of 67 pass**.
`parity/run.mjs` copies upstream's `e2e/` and the `src/shared/` files its
specs import into `parity/.suite`, puts the ported `parity/api.ts` in place
of upstream's mock (it answers reads by name at `/remote`, asking upstream's
`search` for the range of the label's candidates that covers them), and runs
`domains.spec.ts`, `domains.a11y.spec.ts` and `domains.mobile.spec.ts`.
`domains.rpc.spec.ts` and `domains.worker.spec.ts` test upstream's RPC and are
replaced by `test/server.test.ts`; `domains.dev.spec.ts` tests upstream's dev
server and is replaced by `e2e/dev.e2e.ts`. WebKit was not run.

The failures fall into these groups:

- **early input**: the spec holds the bundle and expects the typing answered
  before it runs (the URL, the pending names, `domains:ready`, the layout
  attribute on `<html>`), which upstream's inline script does; the port keeps
  and replays the typing ([#372](https://github.com/doeixd/foldkit-plus/issues/372)).
- **read pattern**: the spec counts upstream's 60-name pages ("60 of 556
  domains checked") or its RPC ranges; the port reads the rows in view.
- **phone filters**: the spec opens upstream's single "Filters and sort"
  sheet; the port has a `Picker` per control.
- **look or behaviour**: the rest, each a difference to fix or a timeout
  under load: the axe scan flags colour contrast in the open TLD dropdown and
  time out at 390 and 320 px; a long cart name at narrow width; the cart
  sheet's focus trap and scroll lock at a phone's size; the two-row phone
  header's geometry; a reload within the mirror's 50 ms throttle (set to 0
  after this run, not re-run); and timeouts in long flows (cart, multi-year
  quotes, sort position). An earlier run with four workers passed four of
  those that timed out here and failed three that pass here.

| Spec | Passed | Failed |
| --- | --- | --- |
| `domains.a11y.spec.ts` | 9 | 8 |
| `domains.mobile.spec.ts` | 8 | 17 |
| `domains.spec.ts` | 10 | 15 |

| Test | Result | Why it differs |
| --- | --- | --- |
| `domains.a11y.spec.ts:70` landing Tab order follows pricing, search, and source in static HTML | pass |  |
| `domains.a11y.spec.ts:70` landing Tab order follows pricing, search, and source after hydration | pass |  |
| `domains.a11y.spec.ts:136` landing, results, filters, and cart pass accessibility scans at 1440px | fail | look or behaviour |
| `domains.a11y.spec.ts:136` landing, results, filters, and cart pass accessibility scans at 390px | fail (timeout) | look or behaviour |
| `domains.a11y.spec.ts:136` landing, results, filters, and cart pass accessibility scans at 320px | fail (timeout) | look or behaviour |
| `domains.a11y.spec.ts:233` pending quotes and search failure pass accessibility scans at 1440px | pass |  |
| `domains.a11y.spec.ts:233` pending quotes and search failure pass accessibility scans at 390px | pass |  |
| `domains.a11y.spec.ts:233` pending quotes and search failure pass accessibility scans at 320px | pass |  |
| `domains.a11y.spec.ts:268` keyboard cart removal and retry preserve a useful focus target | pass |  |
| `domains.a11y.spec.ts:317` filter listboxes support keyboard navigation, typeahead, selection, and dismissal | fail | phone filters |
| `domains.a11y.spec.ts:396` keyboard users can skip navigation, scroll the complete catalog, and leave the results | pass |  |
| `domains.a11y.spec.ts:478` Tab focus keeps the first virtual row below the navigation at 1440px | pass |  |
| `domains.a11y.spec.ts:478` Tab focus keeps the first virtual row below the navigation at 390px | fail (timeout) | look or behaviour |
| `domains.a11y.spec.ts:515` loading announcements retain their node outside the busy region and respect reduced motion | fail | read pattern |
| `domains.a11y.spec.ts:555` quote buttons describe pricing and renewal terms, and failed searches describe their error | pass |  |
| `domains.a11y.spec.ts:572` long cart names and text spacing fit a narrow viewport without hiding removal controls | fail | look or behaviour |
| `domains.a11y.spec.ts:608` custom filter backgrounds and modal text have readable contrast, and the cart controls its dialog | fail | look or behaviour |
| `domains.mobile.spec.ts:22` mobile search supports focus, viewport changes, filters, and clearing in narrow portrait | fail (timeout) | phone filters |
| `domains.mobile.spec.ts:22` mobile search supports focus, viewport changes, filters, and clearing in portrait | fail (timeout) | phone filters |
| `domains.mobile.spec.ts:22` mobile search supports focus, viewport changes, filters, and clearing in landscape | fail (timeout) | phone filters |
| `domains.mobile.spec.ts:150` mobile empty search matches the compact header and survives hydration without moving focus | pass |  |
| `domains.mobile.spec.ts:233` clearing search and dismissing the mobile keyboard retains the search header before hydration | fail | early input |
| `domains.mobile.spec.ts:233` clearing search and dismissing the mobile keyboard retains the search header after hydration | pass |  |
| `domains.mobile.spec.ts:314` tapping Domains focuses search during the mobile gesture before hydration | fail | early input |
| `domains.mobile.spec.ts:314` tapping Domains focuses search during the mobile gesture after hydration | pass |  |
| `domains.mobile.spec.ts:393` mobile submission dismisses focus before hydration and preserves the query at handoff | fail | early input |
| `domains.mobile.spec.ts:449` mobile cart traps focus, locks page scrolling, and restores focus in portrait | fail (timeout) | look or behaviour |
| `domains.mobile.spec.ts:449` mobile cart traps focus, locks page scrolling, and restores focus in landscape | fail (timeout) | look or behaviour |
| `domains.mobile.spec.ts:521` mobile results use page scrolling beneath the pinned navigation | pass |  |
| `domains.mobile.spec.ts:563` mobile results use a dark two-row header and single-column layout | fail (timeout) | look or behaviour |
| `domains.mobile.spec.ts:669` first mobile typing keeps Top Results in view before hydration | fail | early input |
| `domains.mobile.spec.ts:669` first mobile typing keeps Top Results in view after hydration | pass |  |
| `domains.mobile.spec.ts:773` mobile filter sheet slides from the bottom, preserves selected choices, and slides out on Escape | fail (timeout) | phone filters |
| `domains.mobile.spec.ts:893` mobile filter sheet respects reduced motion and focuses the selected availability on reopen | fail (timeout) | phone filters |
| `domains.mobile.spec.ts:932` emptying a scrolled mobile search with backspace returns to the top before hydration | fail | early input |
| `domains.mobile.spec.ts:932` emptying a scrolled mobile search with clear button returns to the top before hydration | fail | early input |
| `domains.mobile.spec.ts:932` emptying a scrolled mobile search with Escape returns to the top before hydration | fail | early input |
| `domains.mobile.spec.ts:932` emptying a scrolled mobile search with backspace returns to the top after hydration | pass |  |
| `domains.mobile.spec.ts:932` emptying a scrolled mobile search with clear button returns to the top after hydration | pass |  |
| `domains.mobile.spec.ts:932` emptying a scrolled mobile search with Escape returns to the top after hydration | pass |  |
| `domains.mobile.spec.ts:1001` mobile TLD sheet searches the complete catalog, contains scrolling, and preserves selection on dismissal | fail | phone filters |
| `domains.mobile.spec.ts:1144` a mobile search restarts at the page top after backspacing a scrolled query to empty | fail | look or behaviour |
| `domains.spec.ts:46` serves an editable search field in static HTML | pass |  |
| `domains.spec.ts:61` activating Domains with the keyboard focuses the same search input and preserves navigation history | pass |  |
| `domains.spec.ts:91` preserves early typing, focus, selection, and the input node through hydration | fail | early input |
| `domains.spec.ts:157` preserves input typed before the early script arrives | fail | early input |
| `domains.spec.ts:179` prefills the URL query after the field receives early focus | fail | early input |
| `domains.spec.ts:202` first mobile tap moves the same input into the second header row before hydration | pass |  |
| `domains.spec.ts:254` mobile search scrolls with the hero and stays pinned during a search | pass |  |
| `domains.spec.ts:344` searches, filters, sorts, and manages the cart | fail (timeout) | look or behaviour |
| `domains.spec.ts:396` updates domain names while prices and availability wait for the current lookup | pass |  |
| `domains.spec.ts:451` quote skeletons preserve card, row, and control geometry at 1440px | pass |  |
| `domains.spec.ts:451` quote skeletons preserve card, row, and control geometry at 900px | pass |  |
| `domains.spec.ts:451` quote skeletons preserve card, row, and control geometry at 390px | pass |  |
| `domains.spec.ts:451` quote skeletons preserve card, row, and control geometry at 320px | pass |  |
| `domains.spec.ts:587` restores queries on reload and browser navigation and ignores superseded searches | fail | look or behaviour |
| `domains.spec.ts:616` virtualizes the catalog and preserves scrolling and cart selections across query changes | fail | read pattern |
| `domains.spec.ts:715` hands URL synchronization to the Runtime without leaving duplicate early listeners | fail | early input |
| `domains.spec.ts:760` backspacing to a loaded query restores quotes without waiting for debounce or RPC | fail | read pattern |
| `domains.spec.ts:840` failed lookups hide prices and recover through explicit retry | fail | read pattern |
| `domains.spec.ts:863` shows multi-year registration and renewal quotes without treating an unconfirmed name as purchasable | fail (timeout) | look or behaviour |
| `domains.spec.ts:906` loads quotes for the visible catalog pages and preserves prices when a later page needs retry | fail | read pattern |
| `domains.spec.ts:967` ships Inspect DevTools while searches and virtual results stay live at 1440px | fail | read pattern |
| `domains.spec.ts:967` ships Inspect DevTools while searches and virtual results stay live at 390px | fail | read pattern |
| `domains.spec.ts:1049` typing debounces intermediate keystrokes and loads the final query progressively | fail | read pattern |
| `domains.spec.ts:1092` changing sort order preserves page position on mobile | fail (timeout) | look or behaviour |
| `domains.spec.ts:1092` changing sort order preserves page position on desktop | pass |  |

**Screenshots.** `parity/screenshots.mjs` writes upstream and the port side by
side in nine states (landing, pending, ready, filters open, TLD sheet, a cart
of two, a later page failing, an invalid label, 404) at 320, 390, 900 and
1440 px, taken against both dev servers (the local Worker previews stalled on
this machine after a restart). Looked at by eye: the header, search box, cards,
rows and prices match closely at every width; the cart shows the same content
in a narrower sheet; on a phone the port's three filter openers crowd the
"All Results" heading onto two lines and truncate "Show All" and "Relevance",
where upstream shows one TLD button and a filter icon.

**Size** (gzipped, `vite build`): the port's client bundle is 1,243 KB
(341 KB gzipped) of JavaScript and no CSS file, against upstream's 753 KB
(220 KB) of JavaScript and 38 KB (8 KB) of CSS: about 113 KB gzipped more,
for `foldkit-remote`, `foldkit-ssr`'s client, `foldkit-mixins-ui`'s Picker,
Sheet and WindowList, and the theme. Each page also carries the theme's
stylesheet in its head (about 92 KB before compression), where upstream links
its CSS file.

**Invariants** (upstream's `docs/testing.md`), and the port's test for each:

| Invariant | Here |
| --- | --- |
| Startup reads the URL and validates the label | `test/search.test.ts` (a page opened at `?q=`) |
| URL changes start lookups; the mirror's own write changes nothing | `test/search.test.ts` |
| Superseded work cannot replace current state | the debounce's generation (`test/search.test.ts`), Remote's aborted read (`e2e/dev.e2e.ts`) |
| Empty queries go Idle; invalid labels read nothing | `test/search.test.ts` |
| Fresh results restore at once | `test/prices.test.ts` (back within the minute asks nothing) |
| Failures offer retry; retry reads only what failed | `test/prices.test.ts` |
| Pending names show no prices or cart actions | `test/search.test.ts`, `test/cart.test.ts` |
| Filters compose, empty results say so, every sort works | `test/filters.test.ts` |
| A filter applies when pending prices land | `test/filters.test.ts` |
| Cart additions are idempotent; unavailable names have no button | `test/cart.test.ts` |
| Virtualization bounds the rows read and drawn | `test/results.test.ts`, `e2e/dev.e2e.ts` |
| Early edits, the caret and the input node survive hydration | `e2e/dev.e2e.ts` |
| Reloads and history restore queries; unknown routes are 404 | `e2e/dev.e2e.ts` |
| Typing is answered before hydration | none: [#372](https://github.com/doeixd/foldkit-plus/issues/372) |

## Run it

From the repository root:

```bash
pnpm --filter foldkit-example-foldkit-domains-plus dev      # Vite dev server on :5191, pages rendered by the Worker's entry
pnpm --filter foldkit-example-foldkit-domains-plus build    # dist/client and dist/server/fetch.js
pnpm --filter foldkit-example-foldkit-domains-plus preview  # the built Worker in local workerd (wrangler)
pnpm --filter foldkit-example-foldkit-domains-plus parity   # upstream's Playwright suites against the built Worker
npx vitest run examples/foldkit/domains-plus                # Stories, Scenes, server tests
npx vitest run --config vitest.e2e.config.ts examples/foldkit/domains-plus  # the dev server in Chromium
npx tsc -b examples/foldkit/domains-plus                    # its types
```

`parity/screenshots.mjs` writes the two apps side by side in the same states
at four widths, with both Workers running (`pnpm preview` in each folder).

## License

The application is upstream's, MIT, © 2025 Devin Jameson
([`../domains/LICENSE`](../domains/LICENSE)); `src/shared/` and
`src/client/domain/` are upstream's files, copied with only the workspace
formatter run over them. The icons are Lucide's (ISC), named in `icons.json`.
