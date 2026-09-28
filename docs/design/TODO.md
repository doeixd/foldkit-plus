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

- [ ] **S1. A browser entry.** `foldkit-ssr`'s one module imports Foldkit's
  server renderer, 210 KB (63 KB gzipped) that a page taking a render over
  does not need; the example loads it lazily (`sitePlan.ts`). Split off
  `foldkit-ssr/server`, and export the root attribute from the browser side.
- [ ] **S2. `Data.satisfy`,** preparing a Model for a render: each active
  Surface's reads, again until none is missing. The example's `prerender.ts`
  loop is its first caller. [router-DESIGN.md](./router-DESIGN.md) §20
- [ ] **S3. A head from the Model:** description, image, Open Graph, article
  facts and JSON-LD, typed in the plan, escaped, checked like the view, and
  applied on client navigation too. A template missing the tags Foldkit fills
  (canonical, `og:url`) is refused.
- [ ] **S4. `SSR.sitemap` and a `robots` helper** from the generated pages.
- [ ] **S5. Deciding whether to take a page over** (`when`, and
  `otherwise: 'render'` drawing afresh in place), and a freshness check for a
  page older than the data.
- [ ] **S6. A determinism check:** render each page under two time zones and
  locales, and fail when the HTML differs. The example met both a build-time
  clock and a runtime time zone in its dates.
- [ ] **S7. `foldkit-ssr/vite`,** the example's `generate.ts` as a build step:
  the template, the build id from the entry script, the file layout per host,
  and each page's styles in its first paint.
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
the larger plan it amends.

- [ ] **Targets with intents.** An address that asks something of an owner with
  no Model yet (a Builder before its page loads) is held until the owner is
  ready, then applied through its Messages. Both CMS applications hand-wrote
  it (`linked`, `previewAsked`). §33.3
- [ ] **One declaration of history intent** for routed params, as a mirror has
  per key: a step when the node or entry changes, a replace otherwise. §33.4
- [ ] **Scroll keeping as a primitive,** from `examples/cms/src/scroll.ts`: the
  offset taken when the reader acts, a restore that holds while the screen
  settles, entries keyed by the Navigation API. `foldkit-primitives`, or
  upstream in Foldkit's navigation. §33.5
- [ ] **A delayed busy reveal in `foldkit-mixins`:** `aria-busy` lines shown
  only once a wait is noticeable, their space held. And a review of every
  package view for facts drawn before they are read (`Initial` is unknown,
  not empty). §33.6
- [ ] **Foundations in the HTML as a `foldkit-mixins` Vite plugin,** from
  `examples/cms/vite.config.ts`, and in `foldkit-ssr`'s head. §33.7, SSR S7
- [ ] **Targets that know their document,** so a link to another application
  is a full load and one within it is a Navigate Command. §33.7
- [ ] **Prefetch a target's data before navigating,** which removes the waits
  the demo still shows between screens. §16, §33.6
- [ ] **The studio's one blank frame between sections:** one application with
  lazily loaded sections, or rendered first paints as the public site now has.
  §33.7
- [ ] **Site paths and targets:** `Site.paths(node, source)` enumerating a
  node's addresses from a query, `Site.targets(site)` for a build, a sitemap
  and prefetch, and one declaration giving both `routeOf` and `pathOf`. §33.9
- [ ] **Site metadata:** `Site.meta` as a function of the Model feeding SSR's
  head, and whether a node is indexed. §23, §33.9
- [ ] **Locales in the route graph:** a top-level locale parameter, targets
  with alternates, and data sources that take the locale. §33.11
- [ ] `foldkit-site` itself, and the rest of §31's sequence.

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
  studio's shell for an unknown `/site/` address. §19.3, §19.4
- [ ] **Principal and CSRF middleware** per host, for cookie-authenticated
  mutations and SSR fallback posts. §19.5
- [ ] **A content security policy** the document node emits: hashes for the
  inline envelope, JSON-LD and styles of a generated page, a nonce per request.
  §19.7
- [ ] **Caching by whether a page depends on the principal.** §19.8

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
