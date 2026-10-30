# Reimplementing foldkit-domains with Foldkit Plus

> **Status:** Proposed (2026-10-30). Nothing here is built. Written against
> upstream [foldkit/foldkit-domains](https://github.com/foldkit/foldkit-domains)
> at `c3041350`, copied unchanged to
> [`examples/foldkit/domains`](../../examples/foldkit/domains/README.md), and this
> repository on the same date (Foldkit 0.170.0, Effect 4.1). Signatures named
> below are checked against the package source where a line says so; the rest
> are the phase's to fix.

The port lives beside the copy, at `examples/foldkit/domains-plus`
(`foldkit-example-foldkit-domains-plus`), so both run side by side and
upstream's tests can be pointed at either.

## 1. What the app does

One page with two layouts and three overlays, and a 404.

| Screen | What it shows | Upstream file |
| --- | --- | --- |
| Search, landing layout | Header (logo link, "Unofficial demo", Cart button with count), hero ("Find a domain for the next viral idea"), the search box, "Begin your search" | `view.ts` `searchPageView`, `heroView`, `beginSearchView` |
| Search, search layout | The same input moved into the header (CSS only, the node is kept), Top Results (4 cards), All Results (every candidate, 6 per virtual row, 3/2/1 columns by width), filters, result count, sample-data labels, footer | `resultsView`, `resultsGridView`, `resultsListView` |
| Cart dialog | Added domains, their prices and renewal terms, remove buttons, registration total, demo note | `cartView`, `cartPanelView` |
| Filters sheet (phones) | Availability and sort choices; a choice applies and closes it | `filtersDialogView` |
| TLD sheet (phones) | A search box over the 556 extensions and a list of them | `tldDialogView` |
| Desktop filters | Three Listboxes: TLD (typeahead over the catalog), availability, sort | `filtersView`, `filterListboxes.ts` |
| Not found | "404 — Page Not Found" with a link back; HTTP 404 | `notFoundView`, `entry.server.ts` |

**Flows.**

1. **Typing.** Every keystroke replaces `?q=` (`ReplaceSearchUrl`), and the URL
   change (`ChangedUrl`) stores the route and starts the lookup. Names show at
   once as pending cards and rows built from the label × the 556 TLDs
   (`queryToPendingDomainListings`); prices fill in as answers land. An
   invalid label shows an error and asks nothing.
2. **Progressive loading.** The first request is the 4 Top Results (debounced
   150 ms), then the other 56 of the first page, then 60-name pages as rows
   enter the virtual list's viewport plus 2 groups of overscan
   (`domainPlanning.ts`, `findFirstPendingListingInViewport`). The 'Available'
   filter and both price sorts ask for the whole catalog at once.
3. **Cache.** A `KeyedQuery` keyed by `(label, offset, limit)` serves a result
   for one minute without a request, keeps at most 100 settled entries,
   cancels a superseded search's requests, and drops stale completions by
   generation (`domainsQuery.ts`, `steps/search.ts`). Backspacing to an earlier
   query within the minute shows it with no RPC.
4. **Failures.** A first-range failure replaces the results with "Let's try
   that again" and a retry; a later page's failure keeps what is checked and
   shows a sticky banner with "Try again"; a stale refresh that fails keeps
   the old results.
5. **Filters and sort** compose; an empty result says so; a filter chosen while
   prices are pending applies when they land.
6. **Cart.** Add is idempotent; unconfirmed names have no price or button;
   removing from the dialog moves focus to its close button; closing returns
   focus to the Cart button; a polite live region says the count.
7. **Before hydration.** An inline script (`bootstrap.ts`) makes the server's
   input editable at once: it writes `?q=`, the layout attribute and the
   pending labels while the bundle loads; the runtime adopts the same input
   node, and a Command (`ReleaseEarlySearchListeners`) removes the script's
   listeners.
8. **Keyboard.** A skip link; Escape clears; on the focused results list the
   arrows, Page Up/Down and Home scroll the page, End scrolls to the last
   virtual row.

**State** (`model.ts`): `route` (Search `{ q }` or NotFound), `searchLayout`,
`searchGeneration`, `selectedDomainRanges`, `domainsQuery` (the cache),
`resultsList` (VirtualList), three Listbox models, `tldFilter`,
`availabilityFilter`, `sortOrder`, `cart`, three Dialog models,
`tldSearchQuery`.

**Data source.** One Effect RPC, `SearchDomains({ label, offset?, limit? })` →
`Domain[]` (`Available` with price, renewal price, years, premium; or
`Unconfirmed`), at `POST /rpc`. The server (`server/search.ts`) derives
deterministic sample results from the label (`shared/demoDomains.ts`) and makes
no outbound request; `server/rpc.ts` refuses a body over 1 KiB (413), one
without JSON content (415) and an unreadable one (400). The Worker
(`server/entry.ts`) answers `/rpc` and renders every other path.

**Tests.** 86 Vitest tests (Stories over root update, Scenes over the view,
`domainsQuery.test.ts` with a controlled transport and TestClock, server tests
through the typed RPC client, init tests), and Playwright suites: desktop
(`domains.spec.ts`), mobile, axe accessibility scans at 320/390/1440, dev
server, Worker and RPC fixture, in Chromium and WebKit. Upstream's
`docs/testing.md` lists the invariants they hold.

## 2. What changes whatever Plus owns

The app is written against Foldkit's Blocks and Layers preview
(`0.169.0-canary.90746b32d2ca`, foldkit/foldkit#1655). Foldkit 0.170.0 has none
of it, so the port is first a move back to the released API. Foldkit Plus
plans its own move onto Blocks once #1655 ships
([contract-layer-PLAN.md](./contract-layer-PLAN.md), Phase 1); this port is
written now on 0.170 and the bundle API, keeps the pure domain code
unchanged so it carries over, and becomes an acceptance test for that phase.

| Upstream (Blocks preview) | 0.170 + Foldkit Plus |
| --- | --- |
| `Block.makeDefinition`, `makeComposition`, `makeBinding(...).withOutMessagePolicy` | `Surface.application` for the root; `foldkit-bundle` placements and `Page.assemble` for the children, their OutMessages folded in `update` |
| `makeFieldsStep`, `makeCommandsStep`, `Update.combineSteps` | `modifyFields` in `update` and plain `Update.Return` values; the steps that remain are small functions over `(model) => Return` |
| `ApplicationDefinition.makeCommand` + `EffectsLayer` | `Command.define` from `foldkit/command` (its `interrupt` option where a later run supersedes) |
| `Query.define` (`KeyedQuery`) | `foldkit-remote` (§3.2) |
| `DialogBlock`, `Listbox.makeBlock`, `VirtualList.makeBlock`, `initAndSet` | `@foldkit/ui` 0.170 Models (`Dialog.init`, `Listbox.init`, `VirtualList.init`) drawn through `foldkit-mixins-ui` adapters |
| `Program.make` + `Runtime.hydrate`, `Server.renderToString` | `makeApplication` + `foldkit-ssr` (`SSR.render`, `SSR.hydrate`, `SSR.generate`) |
| Tailwind 4 + `styles.css` (902 lines) + utility classes in `view.ts` | `Theme`, `Style.stylesheet`, `foldkit-mixins-ui` recipes, Slots; no CSS file |
| `icon.ts` (hand-copied Lucide paths) | `foldkit-media`'s icons by name (`lucide`), drawn with `Icon.draw` |

## 3. Who owns what, screen by screen

### 3.1 Search text, URL and routes

| Concern | Owner | Change |
| --- | --- | --- |
| Which page (`Search`, `NotFound`), its title, canonical URL | `foldkit-site`: `Site.route` for `/` (title from the query), `Site.parse(site, NotFound)` as the URL parser, `Site.titleOf` for the title | `route.ts`'s `parseUrlWithFallback` and `routeTitle`/`routeToCanonicalUrl` move into the tree |
| The search text | the Model: a new `query: string` field, set by `UpdatedSearch` | upstream keeps it inside `route.q` and moves it only after the URL round trip |
| `?q=` | `foldkit-mirror`: `Mirror.url(App, { fields: [App.model.query], keys: { query: { key: 'q', history: 'replace' } } })` | deletes `ReplaceSearchUrl`, `CompletedReplaceSearchUrl`, and the "invalidate before URL delivery" ordering in `steps/search.ts`. Back and forward reach `query` through the mirror's `reduce` in `UrlChanged`; the `UrlChanged` of the mirror's own write must change nothing (the AGENTS.md trap on a Command's URL) |
| The label the reads use | the Model: `settledLabel: Option<DomainLabel>`, written by `debounce` from `foldkit-primitives/time` (150 ms) placed as a bundle, as `examples/entity` does | upstream sleeps inside the fetch and cancels by interruption; here the debounce sits between the input and the field the reads read, and the pending names keep drawing from `query` at once |
| `searchLayout` | the Model (unchanged): it is also written by the pre-hydration handoff | — |

### 3.2 Domain prices: Remote

The prices are server-owned, disposable and refetchable facts:
`foldkit-remote` owns them. The candidate names are known on the client
(label × TLD list), so each name is an entity **read by id**, not a page of a
query: the rows in view declare which names they need, and Remote batches the
missing ones into one read.

| Piece | Declaration |
| --- | --- |
| Entity | `Domain = Entity.define('Domain', Struct({ id: DomainName, status: Literals(['Available','Unconfirmed']), price, renewalPrice, years, isPremium }))`, the quote fields `OptionFromNullOr`. `Entity.define` takes a Struct, so upstream's union of `Available` and `Unconfirmed` is flattened here and rebuilt by a pure `toDomain` for the view (gap 8) |
| Selection | `Quote = Entity.select(Domain, { status: true, price: true, renewalPrice: true, years: true, isPremium: true })` |
| Reads | `TopResults` Surface: `Data.get(Quote, name)` for the 4 top names. `VisibleResults` Surface: one `Data.get` per name in the virtual list's viewport plus overscan (the arithmetic of `findFirstPendingListingInViewport`, returning every pending name instead of the first), combined with `Projection.struct`. `WholeCatalog` Surface, active only while the 'Available' filter or a price sort is chosen: all 556 names |
| Freshness | `Data.subscriptions(actives, { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 }), grace: '1 minute' })`: a name read within the minute is served from the store, which is what makes a backspace show results with no request |
| Retry | `Data.refresh(model, actives, { failed: true })` for "Try again" |
| Server | `RemoteServer.entity(Domain, { read: ({ ids }) => … })` over `makeDemoDomains`, unchanged; a malformed name or unknown TLD answers nothing for that id (`NotFound`). Served by `RemoteServer.serveFetch` at `/remote` from the same Worker entry, as `examples/reference` does. `maxIdsPerEntity` stays 1000 (the catalog is 556) |

What this deletes: `domainsQuery.ts`, `domainPlanning.ts`, `steps/domainLoading.ts`,
`steps/search.ts`'s cancel and generation logic, `searchGeneration`,
`selectedDomainRanges`, `ReadCurrentTime` and `CompletedReadCurrentTime`,
`RequestedDomains`, `shared/domainsRpc.ts`, `client/rpc.ts`, `services.ts`, and
`server/rpc.ts` (its request bounds move to the Worker entry; see gap 10).

`searchViewState.ts` stays as a pure function, now over `RemoteData`:
`Idle` (empty query), `Failed` (invalid label, or the top reads failed with
nothing to show), `Loading`, `Ready` with `domainRequest` read from the visible
reads (`Loading` while any is in flight, else `Failed` from a failed one, as upstream's `findLast`).
"N of 556 domains checked" counts answered names. `resultListings.ts` and
`client/domain/*` (filtering, sorting, formatting, listings) are kept as they
are: they are the parity anchor for ordering.

Behaviour that moves: upstream asks 4, then 56, then pages; here the top 4 and
the visible rows are active together, so the first answer may carry both. The
order of what fills is the same (top cards first in the DOM), and the specs
that hold the 4-name request apart are ported to hold the top reads instead
(§6).

### 3.3 All Results: the virtual list

| Concern | Owner |
| --- | --- |
| Which rows are drawn, scroll and measurement | `@foldkit/ui` 0.170 `VirtualList` (`init({ id, rowHeightPx })`, `dynamicRowHeights`), through `foldkit-mixins-ui`'s `VirtualList.view` (Slots `root`, `row`, `bar`, `thumb`) |
| Grouping 6 names per row, width-based estimates | the app, unchanged (`groupDomainListings`, `estimateResultGroupHeightPx`) |
| Which names are visible, for the reads | a pure function of the VirtualList Model (§3.2) |
| Page-scroll keys, End | the app's Commands (`ScrollPage`, `ScrollPageToTop`), as upstream; End is `VirtualList.scrollToEnd` |

Upstream scrolls the document, not the list (`ScrollContainer.Window()`,
`rowLayout: 'Absolute'`) and patches `@foldkit/ui` for scroll anchoring. 0.170's
`VirtualList.InitConfig` has neither option, so phase 3 ships the list in its
own scroller with a fixed height and records the difference (gap 1).

### 3.4 Filters and sort

| Concern | Owner |
| --- | --- |
| `tldFilter`, `availabilityFilter`, `sortOrder` | the Model (unchanged; upstream does not put them in the URL, and neither does the port) |
| Desktop pickers | three `@foldkit/ui` Listbox Models drawn with `foldkit-mixins-ui`'s `Listbox` adapter (`anchor.portal: false`, as upstream, so the panel stays in the header's stacking context) and its recipe |
| Phone sheets | `foldkit-mixins-ui`'s `Sheet` (a Dialog with a drag handle) for Filters and for the TLD list; the TLD search box is an `Input` recipe over `tldSearchQuery` |
| Which picker shows | CSS breakpoints in the Style, as upstream (`desktop-filters` / `filters-button`); no media-query bundle is needed because no `update` reads the width |

Deleted: `filterListboxes.ts` (Blocks), the Listbox `className` strings, and
the three bindings. `steps/filters.ts` becomes three `modifyFields` cases; a
change that makes the whole catalog necessary activates `WholeCatalog`
through the Model, with no Command.

### 3.5 Cart

| Concern | Owner |
| --- | --- |
| `cart: ReadonlyArray<AvailableDomain>` | the Model. Not Remote (nothing is bought, the server never sees it), not Sync (no edit to converge), not persisted (upstream forgets it on reload) |
| Dialog | `@foldkit/ui` Dialog Model through `foldkit-mixins-ui`'s `Dialog` adapter and recipe; focus return after close stays a Command (`FocusCartButton`) on the Dialog's closed OutMessage |
| Count announcement | the view, derived from `cart` into a persistent polite region, as upstream; `LiveAnnounce` is not needed because the text is a function of the Model |
| Cart button, count, icon buttons | `Button` and `Badge` recipes |

### 3.6 Presentation

Every element draws through a Slot; nothing carries a hand-written class.

| Upstream | Recipe or Style |
| --- | --- |
| Dark palette, Geist, `color-scheme: dark` | `Theme.standard(Theme.make({ … }))` with the accent knobs set from `styles.css`'s colours, and `colorScheme: 'dark'` on the root, which turns every `light-dark()` token to its dark half (upstream is dark only); Geist from `@fontsource-variable/geist` as a font token, its preload link kept in the head |
| Search box with icon, clear button, `Esc` kbd | `InputGroup`, `Kbd`, `Button` (icon) |
| Domain card / row, skeletons | `Card` and `Item` recipes, `Skeleton` for pending price and action |
| Top Results / All Results headings, sample-data label | `Typography`, `Badge` |
| Begin your search, empty filters, empty cart | `Empty` |
| Search error, page retry banner | `Alert` with a `Button` |
| Landing ↔ search layout (same input node moves into the header) | `Style.states` on the app root's `data-search-layout`, as upstream's attribute selectors |
| Header, footer, skip link | Slots of the app's own (`AppShell` only if its layout matches; upstream's header is a single sticky row) |
| Icons | lucide names through `foldkit-media`'s icons Vite plugin, imported by relative path to its source as `examples/chirp` does (the AGENTS.md trap on a config importing a workspace plugin); the Lucide attribution moves with them |

To keep upstream's specs runnable unchanged, the Slots that the specs select
by class carry upstream's class name as `Style.class(...)` (`domain-card`,
`domain-row`, `price`, `result-count`, `header`, `results`, `filters-panel`,
`tld-panel`, `filter-choice-check`, `skeleton-price`, `unavailable`, …; §6 lists
them). Ids and roles (`#domain-results`, `#cart-announcement`,
`searchbox "Search domains"`) are kept as upstream draws them.

### 3.7 Server rendering and the first keystroke

| Concern | Owner |
| --- | --- |
| Rendering `/` at build time and every other path per request (404 status from the route) | `foldkit-ssr`: `SSR.generate` for `/`, `SSR.render` through the Worker's fetch handler for the rest |
| What crosses to the browser | an `SSR.plan` whose `state` is `query`, `searchLayout`, the filters and the cart (empty); `remote` is `local` (the reads run again in the browser; prices are not inlined, as upstream) |
| Typing before the bundle | first, upstream's `bootstrap.ts` kept as it is: it is framework-free and the handoff Command only needs `searchLayout` and the input's id. Then try `Resume` (the plan's `start`, `Resume.listen`) for the input events; keep the script if Resume cannot write `?q=` and the pending labels before boot (gap 7) |
| DevTools | `@foldkit/devtools` 0.170 overlay, kept in the production build as upstream ships it (the specs check `.dt-panel`) |

### 3.8 Not used, and why

- **Form / Crud:** one search box with a Schema check (`DomainLabel`) and no
  submission to a server; `foldkit-form`'s drafts and validation states would
  add a second copy of `query`.
- **Sync / Durable / Mirror.kv:** nothing is edited offline and nothing is
  remembered across reloads.
- **Guard / Auth:** no principal; every reader sees the same sample data.
- **Agent:** out of scope for parity; the Surfaces of §3.2 would be its
  context later.
- **Data grid:** the results are a list of cards, not a grid of cells.

## 4. Model after the port

```text
route              foldkit-site parses it; Model keeps the value
query              typed text; Mirror.url -> ?q (replace)
settledLabel       debounce bundle's output; what the reads read
searchLayout       landing | search (kept for the pre-hydration handoff)
remote             Remote.Model: Domain quotes by name
resultsList        @foldkit/ui VirtualList Model
tldListbox, availabilityListbox, sortListbox   @foldkit/ui Listbox Models
tldFilter, availabilityFilter, sortOrder       unchanged
cart               unchanged
cartDialog         @foldkit/ui Dialog Model
filtersSheet, tldSheet                         foldkit-mixins-ui Sheet Models
tldSearchQuery     unchanged
debounce           the debounce bundle's slice
```

Gone: `searchGeneration`, `selectedDomainRanges`, `domainsQuery`, and the
Messages only they needed (`RequestedDomains`, `CompletedReadCurrentTime`,
`CompletedReplaceSearchUrl`, `RequestedSearch`).

## 5. Phases

Each phase leaves an app that runs (`pnpm dev`), a test that would go red
without it, and the root checks green. The upstream copy stays untouched.

| # | Builds | Leaves working | Test that proves it |
| --- | --- | --- | --- |
| 0 | Package, tsconfig (`pnpm paths`), `vite.config.ts` with `@foldkit/vite-plugin` 0.29 and `foldkit-media/vite` icons; `shared/domain.ts`, `tld.ts`, `demoDomains.ts`, `client/domain/*` copied unchanged; `Surface.application`, `Site` tree, a theme and sheet; landing page and 404 | Landing and 404 render, no search | Scene: landing draws the search box and "Begin your search"; Site: `/missing` parses to NotFound; the copied pure tests (`domain.fixture.ts` users) |
| 1 | `query`, `Mirror.url` for `q`, `debounce` → `settledLabel`, pending cards and rows (no virtual list yet: the first 36 names, as upstream's preview), invalid-label error, Escape and clear | Typing shows names; the URL follows; back/forward restore | Story: typing replaces the URL once per keystroke and the mirror's own `UrlChanged` returns the same Model (`toBe`); an invalid label asks nothing; `e2e` in Chromium: type, reload, back |
| 2 | `foldkit-remote`: Domain entity, `TopResults` reads, server Source over `makeDemoDomains`, `/remote` in the dev server and the Worker, freshness 60 s, failures and retry | Top 4 cards fill with prices; retry works; backspace within a minute asks nothing | Story with `Remote.clientLayer(RemoteServer.handlers(...))` in process: prices land, a failed read reads `Failed`, retry clears it; server tests ported from `search.test.ts` (deterministic prices, unknown TLD, unconfirmed names); a Story that a second visit within `maxAge` plans no read |
| 3 | All Results: VirtualList through the mixins-ui adapter (own scroller), 6-name rows, `VisibleResults` reads, result count, page banner | Scrolling fills prices for what is in view | Story: moving the VirtualList Model's `scrollTop` adds the names in view to the plan and nothing else; browser test: a scrolled list shows prices for its visible rows only |
| 4 | Filters and sort: three Listboxes, Filters and TLD Sheets, `WholeCatalog` reads, empty state | Every filter and sort works on desktop and phone | Story table over every `SortOrder` × `AvailabilityFilter`, reusing upstream's expectations; a filter chosen while reads are pending applies on arrival; browser test of the Sheet at 390 px |
| 5 | Cart: Dialog, add/remove, total, focus return, live region | Cart flow complete | Scene: add twice keeps one; unconfirmed has no button; remove from dialog focuses the close button (browser test, real focus) |
| 6 | `foldkit-ssr`: `SSR.generate` for `/`, `SSR.render` in the Worker with 404 status, the plan, `bootstrap.ts` and its handoff Command, DevTools | Served page is styled and editable before scripts; hydration adopts the input | e2e: hold scripts, type, release, the text, caret and node survive (upstream's `domains.spec.ts:91` ported); `/missing` is 404 |
| 7 | Look: tokens and Slots until the screenshots of §6 match; the class hooks; keyboard scroll Commands; skip link | Visual and keyboard parity | Upstream's Playwright suites against the port (§6), Chromium and WebKit |

## 6. Verifying parity

1. **Upstream's own suites against the port.** The Playwright configs take a
   `baseURL`; run them unchanged against `domains-plus`. Two layers must be
   ported first, and only these: `e2e/api.ts` (it mocks `POST /rpc` and reads
   `offset`/`limit`; the port's wire is Remote's `{ operation: 'read',
   payload }` at `/remote`, so the mock answers reads by id), and
   `e2e/fixtures/rpcWorker.ts` with `domains.rpc.spec.ts` (replaced by the
   same checks over `/remote`). The selectors the specs use are the contract
   §3.6 keeps: `.domain-card`, `.domain-card .price`, `#domain-results
   .domain-row`, `.result-count`, `.header`, `form.search`, `.filters-panel`,
   `.tld-panel`, `.filter-choice-check`, `.skeleton-price`,
   `.skeleton-action`, `.brand`, `#cart-announcement`, `.unavailable`,
   `.top-results`, `.results-preview .domain-row`, `.domain-row-group`,
   `[data-domain-label]`, `[data-foldkit-app]`, `[data-virtual-list-item-key]`,
   `.icon-button`, and the DevTools' `.dt-*`. A spec that fails only because
   of gap 1 (the page does not scroll the list) is listed, not edited.
2. **Side by side screenshots.** A Playwright script opens both apps at 320,
   390, 900 and 1440 px in the same states (landing; pending; ready; filters
   open; TLD sheet; cart with two domains; page failure with banner; invalid
   label; 404) and writes the pairs into one folder for review. They are
   compared by eye, not by pixel threshold: fonts and token rounding differ.
3. **Invariants.** Upstream's `docs/testing.md` table, one row per invariant,
   each mapped to the port's test that holds it, in the port's README. A row
   with no test is a gap in the port, not in the table.
4. **Size.** Gzipped client bundle of each build, recorded in the port's
   README; Remote and the mixins recipes are expected to cost more than the
   preview's Query, and the number says how much.

## 7. Gaps in Foldkit Plus (candidate issues, not filed)

1. **A window-scrolled virtual list.** Upstream's preview VirtualList scrolls
   the document (`ScrollContainer.Window()`), positions rows absolutely, and
   keeps a scroll anchor through sorting and resizes (upstream patches it).
   `@foldkit/ui` 0.170's `VirtualList.InitConfig` has `id`, `rowHeightPx`,
   `initialScroll` and `followEnd` only, and `foldkit-mixins-ui`'s adapter
   wraps it. Until Foldkit ships the Blocks VirtualList, the port uses its own
   scroller.
2. **A departed read served fresh.** Remote serves an entity read from the
   store while its age is under `maxAge`, but a departed list is always stale
   ("going back reads `Refreshing` and refetches it", remote.md). Reads by id
   (§3.2) avoid it here; an app that keeps upstream's ranges as a query would
   refetch on every backspace.
3. **A size bound on the store.** Upstream keeps at most 100 settled entries.
   Remote's retention is time (`grace`) plus `departedLimit` for reads and
   lists; no bound on held entities. 556 names per label × a minute of typing
   is a few thousand small rows.
4. **A client deadline.** Upstream fails a lookup after 20 s as a retriable
   error. `packages/remote/src/client.ts` has no timeout option; a deadline
   needs a wrapper over `RemoteClient`.
5. **Many reads from one Surface.** Reading N ids is N `Data.get` Projections
   combined with `Projection.struct` over dynamic keys. Phase 3 checks that
   this plans one batched read and that requirements stay stable while the
   window moves by one row; if not, a `Data.getAll(selection, ids)` is the
   candidate.
6. **Interrupting a superseded read.** Upstream aborts the HTTP request of a
   superseded search. Phase 2 checks that a read entry whose requirements
   change interrupts its in-flight request (a held-open `fetch` with an abort
   assertion); if it lets it finish, the answer is still reduced but the
   bandwidth is spent.
7. **Typing before the bundle.** Upstream keeps an inline script and a
   handoff Command (tracked upstream as foldkit/foldkit#1784). `foldkit-ssr`'s
   `Resume` answers events before boot; whether it can write `?q=` and text
   holes before boot, and keep the input node and caret, is unknown. If not,
   a `foldkit-ssr` early-input recipe is the candidate.
8. **Entities with variants.** `Entity.define` takes a Struct. A fact that is
   one of two shapes (`Available` with a quote, `Unconfirmed` without) is
   flattened to a status field plus nullable fields, and a pure function
   rebuilds the union.
9. **A picker that is a Listbox on desktop and a Sheet on a phone.** Upstream
   draws both and hides one by breakpoint, with two Models and two code
   paths. `foldkit-mixins-ui`'s `Sidebar` has this (`sheet` option); a select
   does not.
10. **Request bounds on the Remote endpoint.** Upstream refuses bodies over
    1 KiB (413), non-JSON (415) and unreadable bodies (400) before decoding.
    `foldkit-remote-server` has no body-size option; the Worker entry has to
    bound the stream itself. The bound also has to grow: a read of the whole
    catalog is about 7 KB of names.
