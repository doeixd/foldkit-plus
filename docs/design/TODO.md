# Design to-do

Everything the design documents in this directory still list as open, checked
against the code on 2026-09-27. Each item names the document and section it
comes from, so the reasoning is one click away. [README.md](./README.md) says
where each design stands as a whole.

Tick an item in the same change that closes it, and update the design
document's own status in that change too.

## Gated on something outside this repository

These wait on upstream Foldkit or Effect, not on work here.

- [ ] **Fine-grained reactivity.** Three core primitives in `foldkit/foldkit`,
  then the `reactivity` and `reactivity-html` Plus packages that interpret them.
  [reactivity-DESIGN.md](./reactivity-DESIGN.md)
- [ ] **SSR Phases 4–6:** opaque boundaries, static code removed from the client
  bundle, and surfaces as the hydration unit. They wait on upstream Foldkit.
  [SSR-DESIGN.txt](./SSR-DESIGN.txt), [ssr-PLAN.md](./ssr-PLAN.md) "Beyond this plan"
- [ ] **Per-key keep-alive for Bundle collections.** Adding one item restarts
  every item's stream. The fix needs a dependency-change signal from Foldkit's
  runtime. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] **Resources in Bundle collections.** Needs a pooled parent resource or a
  keyed `ManagedResource` upstream. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] **Adapting `@foldkit/ui`'s Menu, Listbox, ComboBox and DatePicker.** They
  build their markup internally and expose no seam for `mixins-ui`.
  [mixins-DESIGN.md](./mixins-DESIGN.md) phase 9

## SSR and resumability

Phase S is what the CMS example's generated site had to write by hand; each
item is one step of [ssr-PLAN.md](./ssr-PLAN.md) Phase S, with its test.

- [x] **S1. A browser entry.** `foldkit-ssr`'s one module imports Foldkit's
  server renderer, 210 KB (63 KB gzipped) that a page taking a render over
  does not need; the example loads it lazily (`sitePlan.ts`). Split off
  `foldkit-ssr/server`, and export the root attribute from the browser side.
  Built 2026-09-29 on the existing `foldkit-ssr/client` split: the CMS
  example's browser entry takes `SSR` and `FOLDKIT_APP_ATTRIBUTE` from the
  client side — its hand-written root mark is gone and the takeover plan
  rides the bundle — with a static import walk from the entry failing on
  `foldkit/experimental/server`. The `foldkit-ssr/server` reorganization is
  skipped: `foldkit-ssr/client` already covers the browser side, and the
  root stays the server side.
- [x] **S2. `Data.satisfy`,** preparing a Model for a render: each active
  Surface's reads, again until none is missing. The example's `prerender.ts`
  loop is its first caller. [router-DESIGN.md](./router-DESIGN.md) §20
- [x] **S3. A head from the Model:** description, image, Open Graph, article
  facts and JSON-LD, typed in the plan, escaped, checked like the view, and
  applied on client navigation too. A template missing the tags Foldkit fills
  (canonical, `og:url`) is refused.
- [x] **S4. `SSR.sitemap` and a `robots` helper** from the generated pages.
- [x] **S5. Deciding whether to take a page over** (`when`, and
  `otherwise: 'render'` drawing afresh in place), and a freshness check for a
  page older than the data. Built 2026-09-30: `SSR.hydrate` takes `when`
  (asked before anything is adopted), `otherwise: 'render'` (declined draws
  afresh where the served page is; anything else contains it), and `fresh`
  over the plan's new `version`, each asked once. The CMS example collapses
  its takeover branch into one call.
- [x] **S6. A determinism check:** render each page under two time zones and
  locales, and fail when the HTML differs. The example met both a build-time
  clock and a runtime time zone in its dates. Built 2026-09-30 as an example
  check (`determinism.test.ts`): every page twice under one zone (catches
  the build clock and anything random), once under zones at both extremes
  of the date line (catches an ambient zone), and every page under two
  default locales in child processes (catches an ambient locale; skips
  loudly where the platform holds one locale). Building it fixed two live
  leaks: `generateSite` takes the build clock (server writes and, via
  `Data.satisfy`'s `now`, read stamps rode the envelope with it).
- [x] **S7. `foldkit-ssr/vite`,** the example's `generate.ts` as a build step:
  the template, the build id from the entry script, the file layout per host,
  and each page's styles in its first paint. Built 2026-09-30:
  `generateStaticSite` (paths or a function of the prepared data, per-path
  configs, template, head, `flat`/`directory` layout, sitemap, robots)
  behind the `staticSite` closeBundle plugin, which evaluates the site
  module through a server so the config names a file; `foundations` in
  `foldkit-mixins` compiles the sheet module into the head. The CMS example
  builds through both and deletes its script and local plugin.
- [ ] **S8. A chosen theme before the first paint:** `local` in the plan, and a
  head script from `foldkit-mixins`' `Theme` that sets it from storage.
- [ ] **S9. Localized pages:** the locale in the route, `lang` from the Model,
  `hreflang` alternates in the head and sitemap, words and formats by explicit
  locale.

- [x] **G1.** Name the handler that makes a page wait for the live runtime.
  This is the resumable design's rule 1. [ssr-PLAN.md](./ssr-PLAN.md) Phase G
- [x] **G2.** Test rule 6 directly: the resumed page reaches the eager page's
  state. [ssr-PLAN.md](./ssr-PLAN.md) Phase G
- [x] **G3.** Test Phase E the way the resumable design states it.
  [ssr-PLAN.md](./ssr-PLAN.md) Phase G
- [x] **G4.** Measure the manifest before optimising it (`bench/manifest.ts`).
  [ssr-PLAN.md](./ssr-PLAN.md) Phase G
- [x] **G5.** Stop depending on when `hydrate` commits (`afterCommit`).
  [ssr-PLAN.md](./ssr-PLAN.md) Phase G
- [x] **G6, time.** Decoding and listening at a thousand rows take 12 ms in
  Chromium, from 22. [ssr-PLAN.md](./ssr-PLAN.md) Phase G
- [x] **G6, size.** Closed with the numbers: a fifth of the gzipped page at a
  thousand bare rows, about 2.9 bytes per binding; the design's
  keyed-placement fix is the answer if a real page shows the cost.
  [ssr-PLAN.md](./ssr-PLAN.md) Phase G

## Rich text

- [ ] Real-browser hardening (milestone 9, begun with server-rendered adoption).
  [richtext-DESIGN.md](./richtext-DESIGN.md) §124, §115
- [ ] Collaboration: `foldkit-richtext-loro` and `foldkit-richtext-sync`, and
  §101's collaboration proof, which has not started.
  [richtext-DESIGN.md](./richtext-DESIGN.md) §124, §101
- [ ] Presence. [richtext-DESIGN.md](./richtext-DESIGN.md) §124
- [ ] Agents over the editor. [richtext-DESIGN.md](./richtext-DESIGN.md) §124
- [ ] Phase 1's mark overlap rules and metadata keys.
  [richtext-DESIGN.md](./richtext-DESIGN.md) status
- [ ] Renderers per kind, and metadata, for a Kit's content contract.
  [richtext-DESIGN.md](./richtext-DESIGN.md) "Not yet"
- [ ] Release the six rich-text packages. They are public at 0.1.0 but not
  published yet. [richtext-DESIGN.md](./richtext-DESIGN.md) status

## Page builder

- [ ] **7c-2:** edit rich text on the canvas.
  [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) §28
- [ ] Publish `foldkit-composition`, `foldkit-builder` and
  `foldkit-mixins-builder`. They are private at 0.0.0.
  [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md)

## Data, query and Remote

- [ ] **Query Phase 13:** joins and aggregates.
  [data-query-DESIGN.md](./data-query-DESIGN.md) §32
- [ ] **Local execution Phase 4:** position placement (only the decidable half
  is built). [local-execution-DESIGN.md](./local-execution-DESIGN.md) §13
- [ ] **Remote-drizzle against a live Postgres.** Revision Phase 14's acceptance
  has not run; tests cover SQLite and the Pg compiler only. That decides open
  question 7. [REVISION_PLAN.md](./REVISION_PLAN.md) §20
- [ ] **Entity DX item 10:** a branded "put the field on the left" error for a
  reversed operand, plus documentation of operand orientation.
  [entity-DX-PLAN.md](./entity-DX-PLAN.md)
- [ ] **Entity DX item 12:** a predicate over the wrong Entity is a runtime error;
  an owner type parameter on `FieldExpr` would make it a type error.
  [entity-DX-PLAN.md](./entity-DX-PLAN.md)
- [ ] **Entity DX item 13:** a query body with no ordering fails when it is
  registered, through remote-drizzle's runtime throw; make it a compile-time
  error. [entity-DX-PLAN.md](./entity-DX-PLAN.md)
- [ ] **Entity §54:** Remote integration beyond its first slice
  (`Entity.from`/`Selection.from`). [entity-DESIGN.md](./entity-DESIGN.md) §54
- [ ] **Query native findings** ([query-native-FINDINGS.md](./query-native-FINDINGS.md),
  from the reffect integration; application-code-only surface today, none of
  them blocks a release): decide the Unicode/NUL containment contract shared
  by evaluate and SQLite (or refuse outside a portable profile) with shared
  conformance cases; memoize visited expression identities in
  `fieldsIn`/`checkOwnership`/dependency walk (shared DAGs expand
  exponentially); freeze or snapshot expression graphs including scalars;
  carry owner tokens in semantic dependencies instead of name/key strings.
  Migrate the `effect/unstable/rpc` import to `effect/rpc` with the workspace
  Effect upgrade past rc.116, then widen the peer range again.

## CMS

Each item says how it would attach; none is started.
[cms-DESIGN.md](./cms-DESIGN.md) §14

- [ ] Media: `foldkit-cms-media`, with an `Asset` Entity, upload, storage
  adapters, and an `Asset` control.
- [ ] A `Blocks` control kind: a block tree with a schema per block type.
- [ ] Shareable preview through a signed-token principal.
- [ ] Slug history, with `bySlug` answering a redirect.
- [ ] Localization: one draft and one revision log per locale.
- [ ] Workflows with more states (a review state). Design these from a real case.

## Wiring and Bundle

- [ ] Make removing a wiring from `assemble` a type error. Today it compiles and
  silently drops routing, init and Subscriptions.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Deviations
- [ ] Decide whether Wiring lives in `foldkit-surface` or its own package.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Open questions
- [x] Decide where URL semantics belong when routing and Mirror share a URL
  Message, with a spike on a routed example. Decided by the CMS example: a
  shared tag reaches every wiring sharing it, then the application.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Open questions
- [ ] Decide whether `Sync.mount` takes the whole assembly.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Open questions
- [ ] Re-rooted Surfaces per placement, so an agent can expose a placement's
  Messages one by one. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] Derive the whole parent Model and Message from an assembly, once real
  applications ask for it. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] `withResources`, `Link.key` and HashMap storage, which W5 left out.
  [bundle-DX-PLAN.md](./bundle-DX-PLAN.md) Outcome

## Routing and navigation

What building the CMS example's addresses, scroll and loading states showed is
missing. [router-DESIGN.md](./router-DESIGN.md) §33 has the reasoning; §31 is
the larger plan it amends. What the `foldkit-routing` port pair showed still
stays app-owned is in §34; those items arrive as small slices before the Site
graph, each in its owning package — so `foldkit-site` emerges thin, owning
only what is left, rather than arriving as one first cut that becomes a
second framework. A slice that hides the URL lifecycle has to own it, or the
explicit code it replaces stays clearer; elimination (§34.5) is the test.

- [x] **One placement driving update and view for a routed child page:** the
  `Link`/placement that knows the child field and message wrapper yields both
  the fold and the submodel view, instead of a separate `foldChild` plus
  `h.submodel` per page. §34.3. Built as `Link.child(link, update, view,
  slotId)` in `foldkit-bundle`: the fold for `update`, the drawing for
  `view` (branded once, generic over the parent builder with a wrapper-
  inclusion check, absent draws nothing). Adopted by the studio's two
  sections, deleting a fold and a submodel apiece. Children with view
  inputs or OutMessages of their own stay hand-rolled.
- [ ] **One declaration of history intent** for routed params, as a mirror has
  per key: a step when the node or entry changes, a replace otherwise. §33.4.
  Second: Mirror-shaped, beside the address policy it replaces.
- [ ] **Targets with intents.** An address that asks something of an owner with
  no Model yet (a Builder before its page loads) is held until the owner is
  ready, then applied through its Messages. Both CMS applications hand-wrote
  it (`linked`, `previewAsked`). §33.3. Third: the held-ask pattern, wherever
  it lands.
- [x] **Scroll keeping as a primitive,** from `examples/cms/src/routing/scroll.ts`: the
  offset taken when the reader acts, a restore that holds while the screen
  settles, entries keyed by the Navigation API. `foldkit-primitives`, or
  upstream in Foldkit's navigation. §33.5 Built 2026-09-29 as
  `keepScroll(options)` in `foldkit-primitives/dom` — a stream lifted with
  `Subscription.persistent`, sending no Messages — adopted by the studio's
  and the site's subscriptions, with the three browser tests moved beside
  it, each killing its rule.
- [ ] **A delayed busy reveal in `foldkit-mixins`:** `aria-busy` lines shown
  only once a wait is noticeable, their space held. And a review of every
  package view for facts drawn before they are read (`Initial` is unknown,
  not empty). §33.6
- [x] **Foundations in the HTML as a `foldkit-mixins` Vite plugin,** from
  `examples/cms/vite.config.ts`, and in `foldkit-ssr`'s head. §33.7, SSR S7.
  Built 2026-09-30 as `foundations` in `foldkit-mixins/foundations` (the
  sheet module compiled through a server into the head), adopted by the CMS
  example's config with its local plugin deleted.
- [ ] **Targets that know their document,** so a link to another application
  is a full load and one within it is a Navigate Command. §33.7
- [ ] **Prefetch a target's data before navigating,** which removes the waits
  the demo still shows between screens. §16, §33.6
- [x] **The studio's one blank frame between sections:** one application with
  lazily loaded sections, or rendered first paints as the public site now has.
  §33.7 Built as one studio application (`examples/cms/src/apps/studioApp.ts`)
  with section-gated subscriptions; see [cms-demo-PLAN.md](./cms-demo-PLAN.md)
  §1b. Prefetch (the item above) is what removes the remaining waits.
- [ ] **Site paths and targets:** `Site.paths(node, source)` enumerating a
  node's addresses from a query, `Site.targets(site)` for a build, a sitemap
  and prefetch, and one declaration giving both `routeOf` and `pathOf`. §33.9
- [ ] **Site metadata:** `Site.meta` as a function of the Model feeding SSR's
  head, and whether a node is indexed. §23, §33.9
- [ ] **Locales in the route graph:** a top-level locale parameter, targets
  with alternates, and data sources that take the locale. §33.11
- [ ] **Route lifecycle as a reusable wiring,** not app-owned update branches:
  `ClickedLink`/`ChangedUrl` handling, internal-vs-external dispatch
  (`pushUrl` vs `load`, Navigate vs load Commands), and shortcut mapping, as a
  semantic bundle/wiring. §34.1. After the placement slice: the wiring should
  compose placements, not replace them.
- [ ] **Annotatable routes:** title, nav section, shortcut (and href source)
  declared once per route, with navigation rendering, active-section
  derivation, shortcut handling, href generation and titles derived. §34.4.
  With the graph, not before it: annotations need nodes to hang on.
- [ ] **Genuine nested route nodes:** layout, child routes, child models and
  route-local subscriptions/effects per node, not a flat match arm over a
  nested URL. §34.2. Last: flat routes plus section tags scale further than
  assumed (the merged studio proves it); build the tree for a real nested
  layout, not before one.
- [ ] **`foldkit-site` itself, thin:** stable nodes, hierarchy, targets and
  hrefs — whatever the slices above leave unowned — and the rest of §31's
  sequence.

## CMS demo hardening

What running `examples/cms` end to end asks of the packages.
[cms-demo-PLAN.md](./cms-demo-PLAN.md) has the reasoning per area; work
area 0 first, then areas 3–5 alongside, with areas 1–2 feeding the routing
and server/SSR sequences.

- [x] **0. In-example hygiene:** exhaustive tag matches (no `switch` +
  `default` in `app.ts`/`pageApp.ts`/`siteApp.ts`); `src/demo/` folder with
  shared `harness.ts`; split `style.ts` by owner; unify the editor-bar
  clone and `revisionsOf`; adopt shipped recipes where the demo forks them.
  Built 2026-09-29 (harness extraction, exhaustive matches, shell
  unification, style split, recipe gaps recorded where the fork is a
  semantic mismatch, not a restyle).
- [ ] **1. Routing items:** §33.5 scroll keeping is built (see above); the
  rest feed the routing sequence as slices, not one cut — §34.3 placement,
  §33.4 history intent, §33.3 intents first (§34.1 wiring after the
  placement), then a thin `foldkit-site`.
- [ ] **2. Server/transport/SSG:** `http.ts` → `Server.mount` + scheduler;
  envelope/principal into remote/remote-server contract; `browser.ts` mount
  shape into server/local-execution designs. The SSG half is built: S1
  browser entry (client boundary + import walk), S5 takeover decision
  (`when`/`otherwise`/`fresh`), S6 determinism check, S7 build step
  (`staticSite` plugin + `foundations`, example script deleted). S8/S9 wait
  for a theme choice and a second language; §19.5–19.8 wait for a real
  deployment (see Server).
- [x] **3. `mixins-ui` gaps:** `Badge`, `Loading`/`Empty`/`Failure`,
  Button variants, icon machinery, touch targets; `historyCard`/`moreCard`
  as a CMS view companion; adopt each in the demo in the same change.
  Built 2026-09-29 (Badge, Loading/Empty/Failure, entry views companion,
  Touch/Icons, Button variants, Segmented — each adopted in the demo in
  the same change).
- [x] **4. Form view:** `Button.view`, `Input.field`, `FormView.fields`
  with per-field overrides (unknown keys are compile errors; new keys of
  known kinds need nothing new), explicit
  submit-gating predicate. Built 2026-09-29: `Button.view`,
  `FormView.fields` with per-field overrides, per-key element attrs,
  explicit submit gating, and `Input.field`/`Textarea.field` (a field's
  state with label/control/description placed, `type`/`placeholder`/`rows`
  riding through, `draw` hatch for custom layouts) — adopted by the
  waitlist per-kind overrides and the job-application field view, which
  keep only their layouts and status marks. The job application's cover
  letter stays on `UiTextarea.view` directly: it holds a plain string with
  a length counter, not a field state.
- [x] **5. Primitives:** websocket/sse status + `isConnected` + error
  selectors and 4-state view-union derivation; shrink `reactToSocket` to
  payload commands. Built 2026-09-29 as `isOpen`/`viewOf`/`SocketView`
  (`Disconnected|Connecting|Connected|Error`) with SSE parity
  (`isLive`/`viewOfSse`/`SseView`); the chat example keeps no connection
  state machine and `reactToSocket` covers payload commands plus the
  page's own wanting.
- [x] **6. Seeding:** `seed.ts` runner shape into cms/cms-drizzle import
  tooling and docs. Built 2026-09-29: the import input named and exported
  as `ImportItem<P>`, read by the package's own tests and the example's
  `seed.ts` (whose contract is now what `cms.import` takes less `as`)
  instead of re-declared, with the seeding shape (fixed clock, named
  entries dependencies-first, `as` fixed once) in the cms-drizzle README.

## Example showcase hardening

What the examples must show after 0.12: correctness gaps where the demo
misinforms, unadopted 0.12 contracts, UX polish, hygiene and docs.
[showcase-PLAN.md](./showcase-PLAN.md) has the findings and the sequence;
work wave 0 (correctness) first, then wave 1 (adoptions), then wave 2
(polish), with package prerequisites as their own slices.

- [x] **0. Correctness:** site failure drawn as loading, preview while
  loading, missing-post inconsistency, retry everywhere, chat offline
  sends, publish versus the form. Built with tests; the pages list's retry
  still waits on the row ListView variant (package prerequisites).
- [ ] **1. Adoptions:** SSG adopts `staticSite`; `assembly.runtime` in one
  real assembly; todo agent learns completion; `Input.view`/`Textarea.view`
  get app callers; the small-gaps batch (scroll options, `stateBadge`
  None, `Data.meta` stale/loading, bootstrap meets routing, kitchen-sink
  `correlate`, explicit submit gate); staleness stays designed, not built.
- [ ] **2. Polish, hygiene, docs:** form focus story, linked
  `blockedNotice`, site chrome, studio smalls, waitlist dedup; dead code;
  six stale READMEs; the `attrs` doc fix; teaching comments.

## Server

What the CMS example's server, run over HTTP, in the page and at build time,
asked of a server graph. [server-DESIGN.md](./server-DESIGN.md) §19

- [ ] **`Server.handle` in-process,** with Node, Worker, in-page and build
  adapters; the example's `http.ts`, `browser.ts` and `prerender.ts` are its
  first users. §19.1
- [ ] **Scheduled jobs as nodes** (`Server.every`), reading the clock through a
  Layer. The CMS's due publishing is polled by hand in two hosts. §19.2
- [ ] **Static emission from the graph:** a document node's paths from a query,
  the host's file layout, cache headers, redirects (from slug history) and a
  real 404 for generated prefixes. The published demo serves a 200 with the
  studio's shell for an unknown `/site/` address. §19.3, §19.4. Absorb SSR
  S7's `staticSite` plugin (paths, per-host layout, sitemap, robots) rather
  than reinventing static emission beside it.
- [ ] **Principal and CSRF middleware** per host, for cookie-authenticated
  mutations and SSR fallback posts. §19.5
- [ ] **A content security policy** the document node emits: hashes for the
  inline envelope, JSON-LD and styles of a generated page, a nonce per request.
  §19.7
- [ ] **Caching by whether a page depends on the principal.** §19.8

The three items above wait for a real deployment: the static demo serves no
cookie-authenticated mutations, no per-request pages, and no principal-aware
cache keys. Build them against the first host that does, not speculatively.

## Internationalization

Nothing is built. [i18n-DESIGN.md](./i18n-DESIGN.md) decides who owns what;
the steps land in the packages that own them.

- [ ] **The locale in the Model and the route,** with `lang` and `dir` from it,
  in the CMS example with a second language. Routing: router-DESIGN §33.11.
- [ ] **Word tables per locale** (`editWords.en`, and the form, list and view
  words), with plural forms in `fillWords` and a check listing missing keys.
- [ ] **`Format.of(locale)`** for dates, numbers and relative times, with an
  explicit time zone; nothing reads the runtime's default.
- [ ] **Per-locale CMS entries,** slugs and locale-aware reads. cms-DESIGN §14
- [ ] **Schema labels per locale:** `Words.of(schema, { locale, table })` over a
  keyed table.
- [ ] **Right to left:** an audit of the remaining physical `left`/`right`
  properties, and a check that keeps them out.
- [ ] Generated pages per locale and negotiation at the edge: SSR Phase S9,
  server-DESIGN §19.9.

## Mixins and styling

- [ ] **Phase 10:** finish `foldkit-mixins-surface`.
  [mixins-DESIGN.md](./mixins-DESIGN.md)
- [ ] **Phase 12:** the Style compiler's remaining constructs: `@font-face`
  sugar, animation orchestration, and a rule registry with extraction. Waits
  until a real view needs them. [mixins-DESIGN.md](./mixins-DESIGN.md)
- [ ] **Phase 13:** DevTools and agent metadata beyond
  `SurfaceView.describe`/`toMarkdown`. [mixins-DESIGN.md](./mixins-DESIGN.md)
- [ ] **Portable Style and Behavior:** the target type, accessibility intents,
  conditions as data, element handles, and a React Native host through codegen.
  None is built, and nothing blocks it. [platform-DESIGN.md](./platform-DESIGN.md)

## React

- [ ] A `Resource` → Suspense bridge (`useResource`). `readAsyncData` covers
  Model `AsyncData` only. [react-DESIGN.md](./react-DESIGN.md) §20

## Sync, Durable and Effect reuse

- [ ] Durable-over-Effect-storage prototype.
  [effect-reuse-sync-durable-DESIGN.md](./effect-reuse-sync-durable-DESIGN.md) §14.1
- [ ] Sync-over-Effect-storage prototype. §14.2, same document
- [ ] Sync-over-Effect-RPC prototype. §14.3, same document
- [ ] Submit the four upstream Effect PRs. None has been submitted. §7, §13, same document
  - [ ] EventLog server Storage entry lookup
  - [ ] a public EntryId string codec
  - [ ] atomic IndexedDB `KeyValueStore.modify`
  - [ ] manual settlement for PersistedQueue

## Tooling

- [ ] A lint rule for the semantic-vs-structural write rule (`ModelRef.set`
  outside infrastructure). The repository has no linter; Foldkit's Oxlint plugin
  is the likely home. [evo-DESIGN.md](./evo-DESIGN.md) item 12

## Found by porting Foldkit's examples

The [`examples/foldkit-*`](../../examples/README.md#foldkits-own-examples-on-foldkit-plus)
ports worked around each of these; the example named has the workaround and
its README the details.

- [x] **Mirror: a restore that loses the race to the first write.** Fixed
  and tested (`packages/mirror/test/restore.test.ts`); the ports keep Flags
  so the first frame shows stored data. On the
  documented `Mirror.fold().init` path the write subscription starts with the
  initial value before the restore arrives, and could delete the stored
  document if the restore takes longer than the throttle. Unverified; the ports
  read the store into Flags instead. `foldkit-todo`
- [x] **Remote: one policy per `Data.subscriptions` call.** Fixed: retention
  is the domain's, so each call's `retain` roots every call's reads.
- [x] **Remote: the default clock and `any` dependencies.** Fixed.
- [ ] **Remote: per-field fetch time.** The store keeps one `updatedAt` per
  entity and any write refreshes it, so under stale-while-revalidate an old
  field looks fresh after another is written. Proposal: `writtenAt` per field,
  aged by `plan`/`deadlineOf`, and `Data.fetchedAt(model, projection)`.
  `foldkit-api-cache`
- [ ] **RemoteServer: a typed principal with an inferred `Input`.** Giving `P`
  explicitly stops TypeScript inferring the rest; a source that ignores the
  principal can now omit the generics. Proposal: curried
  `RemoteServer.for<P>().query(Q, run)`.
- [ ] **Bundle: a child whose first state comes from the URL.** A Bundle's
  `init` takes fixed args where it is placed, so a routed page cannot be one
  without a second fetch, and a Model that is a union cannot hold placements.
  `foldkit-routing`, `foldkit-auth`. Proposal: a start input beside args
  (`init(args, input)`, a placement's `input: parent => Input` evaluated by
  `initial`), `placed.enter(input)` / `placed.leave` for navigation, and
  `Link.variant(Variant)` for a union Model.
- [x] **Bundle: a parent cannot react to a placement's Messages.** Done:
  `onMessage`, and `own` typed `Bundle.OwnMessage` without the wrappers.
- [x] **Bundle: `PlacedResources` typing, and a custom `Link` loosening
  `initial`.** Done: `onAcquired`'s parameters are kept, and a Link carries its
  top-level field. Only a `Link.make` with a non-literal path still gives
  `Partial`.
- [x] **Mirror: its URL assembly does not fit `makeApplication` routing.**
  Done: `Mirror.routing`. Bundle's `assembly.url` still has the `Sync.mount`
  shape (`{ init(model, url), onUrlChange }`), not `makeApplication`'s.
- [x] **Primitives: a clock the Model drives, and a key's default.** Done:
  `ticks`, `keyboardEvents({ preventDefault })`. `foldkit-snake`
- [x] **Primitives: the websocket's `Sent` data and a connect timeout.** Done:
  `Sent { data }`, `connectTimeoutMs`, `TimedOut`. `foldkit-websocket-chat`
- [x] **Primitives: `History.push`'s new empty `future`, and jump-to-step.**
  Done: the empty future is kept; `History.goTo` / `GoTo`. `foldkit-pixel-art`
- [x] **Form: no "valid right now" query, no validate-all.** Done:
  `form.isValid`, `Message.ValidatedAll()`.
- [ ] **Form: no Command definition for a check that tests can match** (still
  an inline `{ name: '<form>.check', args: { key } }`), and `Form.make`
  requires an Entity for a plain form. `foldkit-form`
- [ ] **Form: `engine.value` drops a filled but invalid optional key** that is
  not validated yet, instead of refusing, reached by `fill` then
  `engine.value` (a submit validates first; `isValid` is right).
- [x] **Form: `Schema.optionalKey` is treated as required,** and `Blurred` on
  an empty optional key returns an equal copy of the Model. Fixed; an
  `Option`-typed key is also drawn now.
- [x] **SSR: hydrate's config type, a browser entry, entry headers and
  OPTIONS.** Done: `foldkit-ssr/client` (about 200 kB minified off a hydrating
  page), Foldkit's config types, `SSR.entry`'s `headers` and a 204 OPTIONS.
  `examples/cms` could still move its hand-written root attribute and lazy plan
  to `foldkit-ssr/client`.
- [x] **Mixins: no helper installs the stylesheet in the browser.** Done:
  `Style.install`, with `AppStyle.make` for the page sheet.
- [ ] **Mixins: `Theme.oklch` tints success and error with the accent's hue,**
  so under a blue accent they read blue. `foldkit-job-application`
- [ ] **Mixins: `Recipes.Dialog` does not undo `Defaults.reset`'s `margin: 0`,**
  so a modal opens against the top of the window; recipe pieces are typed
  optional per slot; `.extend` cannot remove a piece; and a class `@foldkit/ui`
  sets inside a ChildAttribute cannot be styled. `foldkit-pixel-art`,
  `foldkit-ui-showcase`, `foldkit-job-application`
- [ ] **Mixins-UI: missing adapters and recipes.** No adapter for FileDrop,
  Nav, DragAndDrop, Animation or VirtualList (each hands out attributes); no
  recipe for Select, Fieldset, Disclosure, Popover, Tooltip, HoverIntent,
  Slider, RadioGroup or Calendar; `SlotBuilder.attrs()` returns attributes
  `h.textarea` rejects (`Textarea.resolve` and the result types are fixed).
  `foldkit-ui-showcase`
- [x] **Mixins-form: its fixed layout cannot show a check in progress or a
  page-level submitting state.** Done: the `checking` Slot, `data-validation`,
  and the `submitting` view input.
- [ ] **Mixins-form cannot draw its controls with `@foldkit/ui` and the
  mixins-ui recipes,** and has no option to disable submit while a check runs,
  so `foldkit-form` and `foldkit-auth` still draw their own form.
- [x] **Testing: `Inert.draw` cannot draw a view containing `h.submodel`.**
  Done: it draws under a Scene frame. `foldkit-ui-showcase`'s `ThroughScene`
  helper can go.

## Stale passages inside the design documents

Each document now carries a dated status note, but these passages still
describe an earlier state and would mislead someone reading the body:

- [ ] [REVISION_PLAN.md](./REVISION_PLAN.md) §1.1–1.2: the package versions,
  private packages and example list; §20's pre-Phase-1 open questions.
- [ ] [agent-DESIGN.md](./agent-DESIGN.md): its package table (Surface
  "proposed", `context` in the contract, `agent-native` "private").
- [ ] [mixins-DESIGN.md](./mixins-DESIGN.md): "private `0.0.0`" and old peer
  versions. It calls SLOT_MIXIN_STYLE_BRAINSTORM "authoritative", and around its
  line 325 says the Phase 11 example "remains", though Phase 11 is done.
- [ ] [remote-drizzle-DESIGN.md](./remote-drizzle-DESIGN.md): the "SQL window
  optimization — measured, deferred" section and sequence item 7. The window
  query is built.
- [ ] [data-query-DESIGN.md](./data-query-DESIGN.md): the head's "Phases 9–13
  deferred", and the claim that `foldkit-remote-server` exports the conformance
  suite (it is `foldkit-entity/conformance`).
- [ ] [entity-DESIGN.md](./entity-DESIGN.md) §50–51: "CMS not started / do not
  build CMS yet".
- [ ] [react-DESIGN.md](./react-DESIGN.md): the banner's "codegen not started".
- [ ] [bundle-spike.md](./bundle-spike.md): "the workspace stays on 0.158.2" (it
  is on 0.163.0).
- [ ] [richtext-REVIEW.md](./richtext-REVIEW.md): the disposition cites a commit
  (`d442415`) that is not in the current history.
