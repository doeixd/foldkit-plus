# Reimplementing foldkit-domains with Foldkit Plus

> **Status:** Being built (2026-10-30): phases 0 to 7 are built; §8 records what
> each phase built and where it departs from this plan. Written against
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
| `DialogBlock`, `Listbox.makeBlock`, `VirtualList.makeBlock`, `initAndSet` | `@foldkit/ui` 0.170 Models (`Dialog.init`, `Listbox.init`) drawn through `foldkit-mixins-ui` adapters, and `foldkit-mixins-ui`'s `WindowList` and `Picker` (#351, #358) |
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
| Entity | `Domain = Entity.defineVariants('Domain', { Available: { id: DomainNameText, ...DomainName.fields, ...DomainQuote.fields }, Unconfirmed: { id: DomainNameText, ...DomainName.fields } })`: upstream's `defineTaggedUnion` cases, spread from the same field sets, with the name as the id. The stored row is `_tag`, `id`, `name`, `tld` and the quote fields nullable; the `variant_Available` and `variant_Unconfirmed` invariants hold an Available to its quote and an Unconfirmed to none (#357) |
| Selection | `Quote = Entity.select(Domain, { _tag: true, name: true, tld: true, price: true, renewalPrice: true, years: true, isPremium: true })`, whose value is the union: the view branches with `Quote.schema.match` where upstream used `Domain.match`, and no `toDomain` rebuilds it. The 'Available' filter is `Expr.is(Domain, 'Available')`, a price sort orders by the stored `price`, which an Unconfirmed holds as null |
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
| Which rows are drawn, scroll and measurement | `foldkit-mixins-ui`'s `WindowList` (`init({ id, estimatedHeight })`, rows measured as drawn), in the page's own scroll (Slots `root`, `spacer`, `row`) |
| Grouping 6 names per row, width-based estimates | the app, unchanged (`groupDomainListings`, `estimateResultGroupHeightPx`) |
| Which names are visible, for the reads | `WindowList.windowOf(model, keys)`, a pure function of its Model (§3.2) |
| Page-scroll keys, End | the browser's, since the document scrolls; upstream's `ScrollPageToTop` is a `window.scrollTo` Command |

Upstream scrolls the document, not the list (`ScrollContainer.Window()`,
`rowLayout: 'Absolute'`) and patches `@foldkit/ui` for scroll anchoring. 0.170's
`VirtualList.InitConfig` has neither option. Gap 1 is closed (#351):
`foldkit-mixins-ui`'s `WindowList` scrolls with the document, reads the list's
offset under the header on every scroll, keeps the browser's scroll anchoring
(in-flow rows) and restoration, and `WindowList.windowOf` is the pure
function of the Model that names the visible groups for the reads. Phase 3
uses it in place of `VirtualList` and an own scroller; its Slots are `root`,
`spacer` and `row`, and End and Page Down are the browser's own keys.

### 3.4 Filters and sort

| Concern | Owner |
| --- | --- |
| `tldFilter`, `availabilityFilter`, `sortOrder` | the Model (unchanged; upstream does not put them in the URL, and neither does the port) |
| Availability and sort | two `foldkit-mixins-ui` `Picker`s (#358, gap 9): each a Listbox on a desktop (its panel kept in place, as upstream's `portal: false`) and a bottom Sheet below `md`, one Model and one `Chose` either way; the app keeps `availabilityFilter` and `sortOrder` |
| The TLD list | a `Picker` would hold 556 rows in its Sheet without a search box, so the TLD filter keeps a Listbox on a desktop and a `Sheet` with an `Input` recipe over `tldSearchQuery` on a phone |
| Which picker shows | `Recipes.Picker`'s `sheetBelow` (the theme's `md`), in CSS, as upstream's `desktop-filters` / `filters-button`; no `update` reads the width |

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
resultsList        foldkit-mixins-ui WindowList Model
tldListbox         @foldkit/ui Listbox Model
availabilityPicker, sortPicker                 foldkit-mixins-ui Picker Models
tldFilter, availabilityFilter, sortOrder       unchanged
cart               unchanged
cartDialog         @foldkit/ui Dialog Model
tldSheet           foldkit-mixins-ui Sheet Model
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
| 3 | All Results: `WindowList` (#351; the page scrolls), 6-name rows, `VisibleResults` reads, result count, page banner | Scrolling fills prices for what is in view | Story: a `WindowList.Message.Placed` further down adds the names in view to the plan and nothing else; browser test: a scrolled list shows prices for its visible rows only |
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

## 7. Gaps in Foldkit Plus (as planned; §8 says which closed, and the issues filed)

1. **A window-scrolled virtual list.** Closed by #351 (`WindowList`,
   `WindowViewport`, `MeasureRows`); kept for the record. Upstream's preview VirtualList scrolls
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
4. **A client deadline.** Closed: `Remote.clientLayer(…, { timeout })` (§8, phase 2). Upstream fails a lookup after 20 s as a retriable
   error. `packages/remote/src/client.ts` has no timeout option; a deadline
   needs a wrapper over `RemoteClient`.
5. **Many reads from one Surface.** Closed: one batched read per plan, nothing while the window stays on the same rows (§8, phase 3). Reading N ids is N `Data.get` Projections
   combined with `Projection.struct` over dynamic keys. Phase 3 checks that
   this plans one batched read and that requirements stay stable while the
   window moves by one row; if not, a `Data.getAll(selection, ids)` is the
   candidate.
6. **Interrupting a superseded read.** Closed: the superseded `fetch` is aborted (§8, phase 2). Upstream aborts the HTTP request of a
   superseded search. Phase 2 checks that a read entry whose requirements
   change interrupts its in-flight request (a held-open `fetch` with an abort
   assertion); if it lets it finish, the answer is still reduced but the
   bandwidth is spent.
7. **Typing before the bundle.** Half closed: `rh.KeepTyped()` keeps and replays it, at once whatever the plan's `start`; answering it before the bundle runs needs an inline script, which `foldkit-ssr` does not write ([#372](https://github.com/doeixd/foldkit-plus/issues/372), limits in the `foldkit-ssr` README). Upstream keeps an inline script and a
   handoff Command (tracked upstream as foldkit/foldkit#1784). `foldkit-ssr`'s
   `Resume` answers events before boot; whether it can write `?q=` and text
   holes before boot, and keep the input node and caret, is unknown. If not,
   a `foldkit-ssr` early-input recipe is the candidate.
8. **Entities with variants.** Closed by #357 (`Entity.defineVariants`,
   `Expr.is`, a Selection with `_tag` read as its union); kept for the record.
   `Entity.define` took a Struct, so a fact that is one of two shapes was
   flattened to a status field plus nullable fields, and a pure function
   rebuilt the union.
9. **A picker that is a Listbox on desktop and a Sheet on a phone.** Closed by
   #358 (`Picker`, `Recipes.Picker`); kept for the record. Upstream
   draws both and hides one by breakpoint, with two Models and two code
   paths. `foldkit-mixins-ui`'s `Sidebar` has this (`sheet` option); a select
   does not.
10. **Request bounds on the Remote endpoint.** Mostly closed: `serveFetch`'s `maxBodyBytes` (413) and 400; no 415. Upstream refuses bodies over
    1 KiB (413), non-JSON (415) and unreadable bodies (400) before decoding.
    `foldkit-remote-server` has no body-size option; the Worker entry has to
    bound the stream itself. The bound also has to grow: a read of the whole
    catalog is about 7 KB of names.

## 8. Build log

What each phase built, in
[`examples/foldkit/domains-plus`](../../examples/foldkit/domains-plus/README.md),
and where it departs from the plan above.

**Phase 0, built.** Package, tsconfig, Vite config, the copied
`shared/domain.ts`, `tld.ts`, `demoDomains.ts`, `domain.fixture.ts` and
`client/domain/*`, `Surface.application`, the Site tree (one node; NotFound
is `Site.parse`'s fallback), the theme and Slots, the landing page and the
404. Tests: `test/landing.test.ts` (Scenes of the landing page and the 404,
`/missing` parsing to NotFound, a sort table over the copied
`filterAndSortDomains`) and `e2e/dev.e2e.ts` (the dev server serves `/`
styled and resumes it; `/missing` answers 404). Departures:

- **`foldkit-ssr` from phase 0, not phase 6.** The dev server answers `/remote`
  (phase 2) through the same server entry that renders pages, so the entry is
  `SSR.entry` from the start, with Foldkit's Vite plugin in its `ssr.build`
  mode (`clientEntry`, `prerender: true`) as upstream uses it. Phase 6 keeps
  the early-input work (`bootstrap.ts`, `rh.KeepTyped()`) and DevTools.
- **The 404 status** was set on `SSR.entry`'s result, which had no status of
  its own ([#364](https://github.com/doeixd/foldkit-plus/issues/364)); it is
  now the entry's `status`, from the Model's route.
- **The page's styles rode in the document's head** (the document renderer's
  `head`), not in the rendered root through `SSR.entry`'s `styles`: hydration
  dropped the root's `<style>`, and a page with no second render (the landing
  page) stayed unstyled ([#365](https://github.com/doeixd/foldkit-plus/issues/365)).
  `SSR.hydrate` now moves them into the head, and they are `SSR.entry`'s `styles`.
- **Icons through `pnpm icons`** (`icons.json` writes `src/client/iconData.ts`),
  not `foldkit-media`'s Vite plugin: the unit tests draw the view, and the
  root Vitest project has no icons plugin for Node. `scripts/icons.mjs` now
  reads `examples/foldkit/*` too.
- **The title** comes from `Site.titleOf` for the empty search and from the
  Model's `query` otherwise, since the search text is not part of the route.

**Phase 1, built.** `query` (what the box holds), `Mirror.url` keeping it in
`?q=` (replaced, so typing makes no history), the `debounce` bundle moving
`settledLabel` 150 ms after the last keystroke, Enter reading at once,
Escape and the clear button emptying both at once, the search layout, the
pending Top Results cards and the first 36 pending rows, and the invalid-label
error. Tests: `test/search.test.ts` (keystrokes, the debounce's settle, the
mirror's own write returning the same Model, back and forward,
the page while typing) with `test/search.mutations.ts` (4 of 4 killed),
and the e2e types, reloads, follows the brand link and goes back.
Departures:

- **No `Site.routing`.** It claims `ChangedUrl` and the application's own
  `update` never sees it, but the port must: a `?q=` that arrives by back,
  forward or a link (the debounce has not seen it) goes through the debounce
  as a keystroke, while the mirror's own write coming back (the debounce
  holds that text) changes nothing. The page handles `ClickedLink` with
  `pushUrl`/`load` Commands and `ChangedUrl` itself, after the mirror's
  wiring has read `?q=`.
- **A guard deleted by mutation.** The debounce's `onOut` first read the
  settled text only when it still equalled `query`; the mutation survived,
  since the debounce already drops a timer whose text was typed over.
- **The mirror's defaults** come from a hand-built empty Model passed as
  `Mirror.url`'s `initial` (with the debounce's slice from its own `init`):
  `Surface.application` takes an `initial` only beside `update`, and the
  update is assembled from the mirror's wiring.

**Phase 2, built.** `Domain` as `Entity.defineVariants` with the name as its
id (`src/shared/entity.ts`), `Quote` read as upstream's union, the
`TopResults` Surface reading the four top names of `settledLabel`,
`staleWhileRevalidate` for a minute with a minute's `grace`, the server
Source over `makeDemoDomains` served by `serveFetch` at `/remote` from the
Worker's entry (so the dev server answers it too), `searchViewState` over
`RemoteData`, the failed-search error with Try again (`Data.refresh(…,
{ failed: true })`), and the sticky banner for a later failure. Tests:
`test/prices.test.ts` (`Trace.run` over the real Subscriptions: prices land
from one read, a failure fails the search and Try again reads it again,
going back to a search within the minute asks nothing),
`test/server.test.ts` (the sample results, no price on an unconfirmed name,
nothing for a name that is no label, a read through the real HTTP client,
the 413 and 400 bounds) and `test/prices.mutations.ts` (5 of 5 killed); the
e2e reads `?q=vercel`'s prices with one request, and checks gap 6 below.
Departures and findings:

- **Gap 6 is closed by Remote as it is.** A read whose requirements change
  before it answers is interrupted and its `fetch` aborted: the e2e holds
  `/remote` for two seconds, types over a search, and sees the first request
  fail as aborted while the next answers.
- **Gap 4 is closed too**: `Remote.clientLayer(…, { timeout })` exists
  (remote.md); the port has not set one yet, since upstream's 20 s deadline
  is a phase 7 parity item.
- **Gap 10 is half closed.** `serveFetch` takes `maxBodyBytes` (413 before
  decoding; 32 KiB here, since a read names its ids, and the whole catalog is
  about 12 KB) and answers an unreadable body 400. It has no 415 for a body
  that is not JSON: upstream's spec for that is replaced, not ported.
- **The server reads only the label.** The extension is checked by looking
  the name up in the label's sample results; a separate check of the
  extension was deleted as redundant.
- **`verifyPredictions` is on in development** although nothing is
  predicted, because `Trace.run` refuses a domain without it
  ([#368](https://github.com/doeixd/foldkit-plus/issues/368)).
- **The order requests are made in moved, as §3.2 expected:** phase 3 reads
  the visible rows beside the top four.

**Phase 3, built.** All Results drawn by `foldkit-mixins-ui`'s `WindowList` in
the page's own scroll (`#domain-results`, six names a row, keyed by the row's
first name as upstream's `groupDomainListings`), the `VisibleResults` Surface
reading the names of the rows `WindowList.windowOf` draws (two rows of
overscan, as upstream), the count of names checked, and the heights of a
label's rows dropped (`WindowList.keep`) when another label settles. Tests:
`test/results.test.ts` (the first read is the top four and the eleven rows
the assumed 1000 px window draws; a scroll reads exactly the rows it brings
into view; a scroll within the same rows asks nothing; the count counts
every name read; heights dropped) with `test/results.mutations.ts` (4 of 4
killed), and the e2e scrolls to the end and finds every drawn row priced and
the middle of the list never asked for. Findings:

- **Gap 5 is closed by Remote as it is.** A Surface whose `model` is a record
  of one `Data.get` per name plans one batched read of what is missing, and a
  window moving within the same rows plans nothing. No `Data.getAll` is
  needed. The first page of a search makes two requests, the top four and
  then the rows in view, since the window's place is known a frame later;
  upstream made the same two (4, then 56).
- **Row keys are derived once per label** (`results.ts`): `windowOf` caches
  a list's offsets by the identity of its keys, and a scroll redraws every
  frame.
- **A Scene of the page resolves `WindowList`'s Mount by the resolver's
  composed name** ([#369](https://github.com/doeixd/foldkit-plus/issues/369)).
- **The row group carries upstream's `data-virtual-list-item-key` and
  `-index`**, on the `ul` inside each `WindowList` row, since the row itself
  is the component's; upstream's specs find rows by them.
- **The pending preview stays** (`.results-preview`, upstream's 36 rows)
  until the list draws its first row: the early-input script of phase 6
  writes into it before the bundle runs.

**Phase 4, built.** `tldFilter`, `availabilityFilter` and `sortOrder` in the
Model; availability and sort as two `Picker`s (a dropdown kept in place on a
desktop, a bottom Sheet below `md`); the TLD as `ListboxView`'s dropdown with
typeahead over the catalog on a desktop and a Sheet with a search box on a
phone; the `WholeCatalog` Surface, active while the Available filter or a
price sort is chosen; All Results arranged by upstream's
`filterAndSortDomainListings` (`results.ts`'s `arrangedOf`, kept per label,
filters and, for the arrangements that depend on prices, the number read);
the empty state. Tests: `test/filters.test.ts` (a table over every sort ×
availability with upstream's orders, unpriced names last under a price sort,
the whole catalog read only when needed, a filter chosen before the prices
applying when they land, a value no option holds refused, both TLD
controls) with `test/filters.mutations.ts` (5 of 5 killed), and the e2e
opens the TLD sheet at 390 px (it stands on the bottom edge), searches,
chooses `.dev`, and sorts through the Picker's sheet. Departures:

- **A phone has three openers, not upstream's two.** Upstream's phone shows
  the TLD button and one "Filters and sort" button opening one sheet with
  both groups. A `Picker` is one control with one sheet, so availability and
  sort each open their own; upstream's mobile specs that use the combined
  sheet (`.filters-button`, `Filters and sort`) are listed, not edited (§6).
- **The sort's phone list is the desktop's**: upstream's phone offered one
  "Price" choice for both price orders; a `Picker` has one option list.
- **Menus are inverted** (a light panel), the shipped theme's default; phase 7
  matches upstream's dark panel.
- **A choice is checked against its literals** (`Schema.is`) where a Picker's
  `Chose` hands back a string; a value no option holds changes nothing.

**Phase 5, built.** `cart` in the Model (sent nowhere, forgotten on a
reload, as upstream's), the add and remove buttons on every available name
(an unconfirmed one has its note and no button), the Cart button with its
count, the polite `#cart-announcement` region, and the cart drawn as a
`Sheet` at the window's right edge with the total and the demo note. Removing
from the open cart focuses its close button (`FocusCartCloseButton`), and the
Dialog's `Closed` gives focus back to the Cart button (`FocusCartButton`).
Tests: `test/cart.test.ts` (adding twice keeps one and the region says the
count, a taken name has no button, both focus Commands) with
`test/cart.mutations.ts` (4 of 4 killed), and the e2e adds two domains,
opens the cart, removes one and closes it with Escape, reading
`document.activeElement` at each step. Departures:

- **The cart is a right-side `Sheet`**, `foldkit-mixins-ui`'s Dialog with a
  side, rather than the bare Dialog adapter: upstream's panel stands at the
  window's right edge full height, which is the Sheet's `side: 'right'`.
- **Foldkit's Scene could not click inside the page** (`click` threw reading
  an ancestor's `sel`), so the Scene draws the Model after the Message the
  button sends; the e2e presses the real buttons.

**Phase 6, built.** The search box is drawn by `Resume.builder(h)` with
`rh.OnInput(Message.UpdatedSearch)` and `rh.KeepTyped()`, covered by a
`SearchBox` Surface in the plan; `@foldkit/devtools` 0.170's overlay ships in
the build as upstream's does; `wrangler.jsonc` and `pnpm preview` run the
built Worker (`dist/server/fetch.js`) in local workerd, which answers pages
(404 for an unknown path) and `/remote`. Tests: the e2e holds the client
bundle, types `typed-before-hydration`, selects 3–8, releases it, and finds
the same input with the text and caret kept, the address and the Top
Results following once the runtime boots. Departures:

- **No early-input script.** `KeepTyped` keeps and replays the typing, so no
  inline script and no handoff Command are needed; but nothing answers the
  typing before boot (no `?q=`, no pending names), which upstream's script
  does. Gap 7 stays open as [#372](https://github.com/doeixd/foldkit-plus/issues/372);
  upstream's spec for it is listed, not ported. `searchLayout` stays in the
  Model, now set only by `update`.
- **`rh` must build the element.** An `h.input` given `rh.OnInput` and
  `rh.KeepTyped()` rendered an unbound marker, and the browser contained
  the page ([#371](https://github.com/doeixd/foldkit-plus/issues/371)); the
  server now refuses it (`UnkeepableField`), naming the element.
- **Nothing was prerendered.** The plugin's prerender renders `/` through
  `SSR.entry`, which recorded the query, and the static host serves that file
  for `/?q=…`, where it was refused
  ([#373](https://github.com/doeixd/foldkit-plus/issues/373)). `/` was
  prerendered again once the entry's `prerendered` recorded its path alone
  and the page at `?q=` was handed the URL as `ChangedUrl`; but until the
  bundle ran, that file showed an empty box at `?q=acme`, so the port went
  back to rendering every page per request
  ([#383](https://github.com/doeixd/foldkit-plus/issues/383)).
  `e2e/built.e2e.ts` serves the build as `pnpm preview` does and reads the
  box with the bundle held.

**Phase 7, built, with parity measured.** Upstream's dark dropdowns
(`menu: { panel: 'default' }`) and sheets (`SheetLook`), the phone's search
box moving into the header's second row while it has focus, the skip link
and the brand link focusing on the press (`focusSelector`), the TLD panel a
tab stop, the results list a described tab stop (a Behavior on
`WindowList`'s `root`), the page back at its top when the search empties
(`ScrollPageToTop`), and `?q=` written with each keystroke (the mirror's
throttle at 0, so a reload right after typing opens what was typed). Parity
(§6), as `examples/foldkit/domains-plus/README.md` records it in full:

- **Upstream's suites** run unchanged through `parity/run.mjs`, which copies
  them beside the ported `api.ts` (reads by id at `/remote`, asking upstream's
  `search` for the range that covers them) and runs them against the built
  Worker: 27 of 67 pass in Chromium (two workers). The failures fall in four groups: answering typing
  before boot (#372; upstream's own inline script), the read pattern (upstream
  counts "60 of 556 checked" pages; the port reads the rows in view), the
  phone's filters (one combined sheet upstream, a `Picker` per control here),
  and look or behaviour differences listed per test in the README.
  `domains.rpc.spec.ts`, `domains.worker.spec.ts` and `domains.dev.spec.ts`
  test upstream's RPC and its dev server and are replaced by the port's
  `test/server.test.ts` and `e2e/dev.e2e.ts`, not run.
- **Screenshots** of both apps at 320, 390, 900 and 1440 px in nine states,
  by `parity/screenshots.mjs`.
- **Size**: the port's client JavaScript is 336 KB gzipped against upstream's 217 KB plus 8 KB of CSS; about a third of the difference is code a read-only page keeps through the `Remote` and `Entity` namespace objects (#378).

**Phase 7 parity, raised.** Running the suites showed most of the timeouts
were specs waiting for elements the port did not draw, not a slow page:
the phone's "Filters and sort" button, and the desktop TLD list, whose
dropdown crashed on opening. Fixed:

- **The TLD dropdown crashed** ("handler is not a function"): the Listbox
  fork wrapped its `itemsAttributes` a second time (#374, since fixed in the
  package). Every desktop spec choosing a TLD waited on it.
- **One "Filters and sort" sheet on a phone**, as upstream: a `Sheet` with
  availability and sort as pressed choices ("Price" for both price orders)
  beside the TLD's sheet. A `Picker` is one control with one sheet, so it
  cannot hold both; the desktop's availability and sort became `ListboxView`
  dropdowns like the TLD's, and the `Picker`s went. The three openers had
  pushed "All Results" onto two lines.
- **Readable triggers**: the dropdown triggers carry upstream's
  `filter-trigger` and click-away `filter-backdrop` classes, their ink in
  sRGB (an `oklch()` colour reads as unreadable to upstream's contrast
  check), the click-away above the sticky header.
- **The cart** is upstream's 420 px, or the whole of a phone, on an opaque
  panel, and stands open at once: under load the axe scan read it mid-fade
  and the narrow-width check mid-slide.
- **Focus back on a sheet's button once the browser has closed it.** The
  Dialog says `Closed` when the close is asked for; WebKit, where a press
  does not focus the button, then moved focus to the body as it closed.
  Moving focus on `CompletedCloseDialog` took WebKit from 30 to 43.
- **The results list focused from the keys** scrolls its start below the
  header, as upstream's `RevealResultsListStart`.
- **Rows not yet drawn** take the mean height of the rows measured
  (`WindowList.init`'s `unmeasured: 'mean'`): a row of six names is 114 px
  on a desktop and 366 px on a phone, and the fixed estimate made the list
  grow as it was scrolled (#381). The debounce's settle keeps the heights of
  the label's own rows, drawn and measured as it was typed: dropping them
  left a stale mean until the prices resized the rows, and at 320 px the
  list's length moved as they landed (`e2e/dev.e2e.ts`).
- **Phone sheets** slide for upstream's half second, not at all under
  reduced motion; their panels carry `filters-panel` and `tld-panel`.

After them: **46 of 67 pass in Chromium and 43 of 67 in WebKit** (Windows,
two workers). What fails is the early-input group (12; #372, and a
prerendered `/` served for `/?q=…` while the bundle is held, #373), the read
pattern (8, by design), one geometry check at 320 px where rows differ in
height (#381), and in WebKit three Tab-to-link checks that upstream's own
build fails on the same machine. A keystroke lost to the address's echo
under load was #379, since fixed in `foldkit-mirror`.

**Issues filed while building:** [#364](https://github.com/doeixd/foldkit-plus/issues/364)
(`SSR.entry` status), [#365](https://github.com/doeixd/foldkit-plus/issues/365)
(root styles dropped by hydration), [#368](https://github.com/doeixd/foldkit-plus/issues/368)
(`Trace.run` and `verifyPredictions`), [#369](https://github.com/doeixd/foldkit-plus/issues/369)
(`WindowList`'s Mount in a Scene), [#371](https://github.com/doeixd/foldkit-plus/issues/371)
(`KeepTyped` on an element `h` builds), [#372](https://github.com/doeixd/foldkit-plus/issues/372)
(answering typing before boot), [#373](https://github.com/doeixd/foldkit-plus/issues/373)
(a prerendered page served for a query), [#374](https://github.com/doeixd/foldkit-plus/issues/374)
(a popup's given attributes wrapped twice), [#378](https://github.com/doeixd/foldkit-plus/issues/378)
(a read-only page keeps Remote's and Entity's write code), [#379](https://github.com/doeixd/foldkit-plus/issues/379)
(the mirror's echo undoing a keystroke), [#381](https://github.com/doeixd/foldkit-plus/issues/381)
(`WindowList`'s fixed estimate).

**After #381 and #383:** 48 of 67 pass in Chromium (2026-10-31; WebKit not
re-run). The 320 px geometry check and "tapping Domains… after hydration"
pass; what fails is the early-input group (11, #372) and the read pattern
(8, by design).

**Left:** #372 for the early-input specs and #378 for the bundle.
