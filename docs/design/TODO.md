# Design to-do

Everything the design documents in this directory still list as open, checked
against the code on 2026-09-27, and every open item checked again on
2026-11-09. Each item names the document and section it
comes from, so the reasoning is one click away. [README.md](./README.md) says
where each design stands as a whole.

Delete an item in the same change that closes it (git keeps the history),
and update the design document's own status in that change too. Done items
were removed on 2026-11-10.

## Decided designs: next phases (2026-11-10)

Each note's Decisions section was settled on 2026-11-10 by delegation. Each
phase ships alone and records its number; the gates below are the notes' own.

- [ ] **SSR delivery** (#472, #432, #435). Phase 2 built: `foldkit-ssr/loader`
  (f4ecb3a..1e4e8dc) with its held-chunk e2e (002e848); opt-in for
  domains-plus (`DOMAINS_PLUS_LOADER=1`). Not the default (decision 5): at 4x,
  script at start 207 to 2.3 kB and blocking no worse, but total script
  +2.4 kB and a press at `load` 1,224 ms against 403 ms, since the chunk is
  fetched at idle. Fetching it at `load` (9d673d0) did not pass either: a
  press at `load` 1,194 ms against 312, total script +1.9 kB; the cost is
  evaluating the chunk, which today's entry starts before `load`. Phase 1 built: one round trip per pass
  (#435). #427 closed: the `Link` header saved 6 ms of FCP (bar 50). #432's
  spike is run and not kept: `SSR.static` on the footer and the hero's copy
  moved boot by -7 and +96 ms across two runs of 12 at 4x (bar -10) and
  blocking +23 and +62 ms; #432 can close on those numbers.
  [472-427-432-435-ssr-delivery-DESIGN.md](./472-427-432-435-ssr-delivery-DESIGN.md)
- [ ] **Site and host** (#236, #235, #438). Built: B (#501, #502: b10c409),
  D1 (Chirp on node Surfaces, the policy-by-route recipe: e91a378) and H1
  (`SSR.entry`'s `redirect`: 4b7ed9a..6f6f73c) and H3 (`AuthServer.host`,
  resolvers typed apart: a187704..f3692c8) and H2 (`foldkit-host`:
  6647aa3..ae46ef6; reference workerd test, e2e, mutations and
  `pack:check` green, bodies restored: fe52bf3) and Phase 0 (c2dcbe5,
  2026-11-11): the most that one non-landing route alone imports is 2.0 KB
  brotli (the CMS pages route; Chirp and the reference have no route
  modules), under the 20 KB bar, so C1 to C3 are not built and #438 closes
  (numbers in [performance-PLAN.md](./performance-PLAN.md)). H4 only if 30
  lines or more of glue stay shared after H2; `visibleLinks` (D2) only if
  decision 3's rule is met. Close #236 when the branch merges.
  [235-236-438-site-host-DESIGN.md](./235-236-438-site-host-DESIGN.md)
- [ ] **Remote data plane** (#377, #439, #440). Phase 1 built: #498 and #499
  (3c7aacb, d8e4402, e932171). Phase 2 built: `writing`
  (e35fbc3..323d1a1). Chirp's `waiting` stays on `outboxStatus` (it asks a
  per-state question; see the note). Phases 3 and
  4 (#439's static function, per-Entity versions) wait until #437 or
  `explain` asks, or `read.bench.ts`'s figure passes 1 ms per write.
  [377-439-440-remote-data-plane-DESIGN.md](./377-439-440-remote-data-plane-DESIGN.md)
- [ ] **Styling platform** (#420, #424, #429, #430). #420 phase 1 built:
  domains-plus's start-up script 217.5 to 191.6 kB brotli (39a003c..775f0bc),
  with a production-build parity e2e (c7d3471). #424 phase 3 built
  (359d739..6ad14c8): the block went from 124 to 108 lines, and 75 is out of
  reach within the decided scope; the target is the owner's (#424 comment).
  #429 and #430 wait on their named conditions; the upstream request
  (floating-ui) can now be posted with the measured figure.
  [420-424-429-430-styling-platform-DESIGN.md](./420-424-429-430-styling-platform-DESIGN.md)
- [ ] **Expr contracts** (#478, #479, #483, #185, #64). Phase 1 (#500) and
  phase 2 (`step`, +1.05% instantiations) are built (803f3dc, bdf0537); only
  their Jev review is left. Close #500, #479 and #478 when the branch merges.
  [478-479-483-185-64-expr-contracts-DESIGN.md](./478-479-483-185-64-expr-contracts-DESIGN.md)
- [ ] **Renderer** (#376, #148, #149). Phase 0 done: drawing and diffing are
  under half of each slow frame (32366ed), so #433's client half is closed as
  not planned. The server half (S1, S2) lives under #473, after
  foldkit#1657's next step. #376, #148 and #149 stay parked.
  [376-433-148-149-renderer-DESIGN.md](./376-433-148-149-renderer-DESIGN.md)
## Bugs and findings from 2026-11-10

- [x] **`examples/auth`'s e2e flaked once in six runs**: Sign out was
  pressed on server-drawn markup before hydration, and the press was lost
  (39ff7fa6; the test now presses until signed out). The same loss meets a
  real user who presses early: the example draws Sign out with plain `h`,
  not `foldkit-ssr`'s resumable builder, which keeps such a press
  (`resumable.ts`). The example now uses it with `foldkit-ssr/loader`, so a
  press or typing before boot lands (e5d61c33).
- [x] **`PasswordInput.view` cannot be drawn resumably.** Both views take
  the caller's builder's `OnInput` attribute (`rh.OnInput(Message.X)`), and
  `PasswordInput.view` takes slot `attributes` for `KeepTyped`; auth uses
  it (197efac9, 5578db58). Left: `PasswordInput` imports `Meter` for
  `strength`, so a page with no meter ships one (auth's budget rose 1.2 kB).
- [ ] **Foldkit's view-identity markers add 20 KB to a served page**
  (domains-plus on workerd: 487 `data-foldkit-identity` attributes, 38
  distinct; the whole 90 KB against 69 KB gap). Neither the Vite plugin nor
  `foldkit-ssr` can turn them off. An upstream ask (one marker per view
  root) is described in `performance-PLAN.md`; parse5 CPU under Node is
  measured on the smaller page, so it understates workerd.
- [ ] **The skill's version stamps** are behind (`foldkit-plus` 0.19.0
  against 0.20.0, `foldkit-remote` 0.23.0 against 0.24.0); re-check each
  reference against the code at the next release and only then bump it.

## Gated on something outside this repository

These wait on upstream Foldkit or Effect, not on work here.

- [ ] **`animatePanel` should read its duration from a custom property** instead
  of writing the transition inline (`@foldkit/ui` Disclosure). `Recipes.Disclosure`
  works around it with an important global rule that finds the grid by its
  panel's `-panel` id; a property would let a plain recipe rule set it.
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

## SSR and resumability

Phase S is what the CMS example's generated site had to write by hand; each
item is one step of [ssr-PLAN.md](./ssr-PLAN.md) Phase S, with its test.

- [ ] **S9. Localized pages:** the locale in the route, `lang` from the Model,
  `hreflang` alternates in the head and sitemap, words and formats by explicit
  locale.

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

## Page builder

- [ ] **7c-2:** edit rich text on the canvas.
  [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) §28

## Data, query and Remote

- [ ] **Query Phase 13:** joins and aggregates.
- [ ] **Entity §54:** Remote integration beyond its first slice
  (`Entity.from`/`Selection.from`). [entity-DESIGN.md](./entity-DESIGN.md) §54
- [ ] **A tagged requirement algebra,** `Requirement.make('remote' | 'replica'
  | 'resource', ...)`, once a second, non-Remote interpreter exists; Remote's
  nested selection needs only `relations` on the flat shape (#65). Decide
  `Sync.for(Surface)` before adding anything: a Surface's projection is
  read-only, and Sync must write the slice it installs.
  [#64](https://github.com/doeixd/foldkit-plus/issues/64)

## Schema to UI

[schema-to-ui-PLAN.md](./schema-to-ui-PLAN.md), for
[#188](https://github.com/doeixd/foldkit-plus/issues/188).

## Guards

Who may do what, declared once on the domain. Slices 1 to 11 of
[guard-DESIGN.md](./guard-DESIGN.md) §12 are built, as `foldkit-guard` and its
subpaths; §12 says where each departs from the plan, and §13 lists the
questions still open.

- [ ] **Navigation and `Surface.when` from `Me`.** Derive link visibility and
  presentation from `Me.may`. Belongs with the third routing cut.
  [router-DESIGN.md](./router-DESIGN.md) §34.4

## Authentication

Who is asking, through Yielded Auth. [auth-DESIGN.md](./auth-DESIGN.md) §9
orders the slices; step 0 and slices 1–10 are built.

- [ ] **Ask Foldkit to widen its `effect` peer** to `^4.0.0`, so applications
  need no override. The maintainer's to send. §3
- [ ] **A Yielded bearer resolver for agents.** MCP clients send a bearer
  token, not a cookie; with Yielded's `OAuthServer` (§9, later, on demand).
- [ ] **A posted form whose session ended** is a 500: `resources` cannot
  fail. Decided: the host's, as `access`'s 303 is (resolve before calling
  `renderPage`, as `examples/auth`'s `page.ts` does for a `GET`); no plan
  there posts a form yet to show it. §6.5
- [ ] **Stopping after a refusal that holds.** Sync's transport and a live
  stream reopen after a refusal, as Yielded's renewal makes a 4401 routine;
  stopping needs to tell a refused fresh upgrade from a dropped one, which a
  browser `WebSocket` does not expose. Today the application's `forget`, on a
  read's `Unauthenticated`, stops a stream. §5.3, §7
- [ ] **Left from §6.2's sketch, undecided:** a 415 for a body that is not
  `application/json`; `Auth.ssr`, a render's principal; Presence's `peerId`
  as the principal's key; §5.1's Context-key option for `serveFetch`. Each
  waits for a consumer.

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

- [ ] Decide whether `Sync.mount` takes the whole assembly.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Open questions
- [ ] Re-rooted Surfaces per placement, so an agent can expose a placement's
  Messages one by one. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] Derive the whole parent Model and Message from an assembly, once real
  applications ask for it. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] A size budget in CI for each example's entry chunk (#229). Built for
  chirp, todo-app, domains-plus, and since a96da4a auth, cms, cloudflare,
  reference and registry. Left: the other examples with a client build
  (data-grid, design-system, entity, richtext-playground, site, widgets,
  pages, and the `foldkit/*` ports), each one ~11 s of CI.
  [244-lazy-resources-DESIGN.md](./244-lazy-resources-DESIGN.md) Deferred

## Routing and navigation

What building the CMS example's addresses, scroll and loading states showed is
missing. [router-DESIGN.md](./router-DESIGN.md) §33 has the reasoning; §31 is
the larger plan it amends. What the `foldkit-routing` port pair showed still
stays app-owned is in §34; those items arrive as small slices before the Site
graph, each in its owning package — so `foldkit-site` emerges thin, owning
only what is left, rather than arriving as one first cut that becomes a
second framework. A slice that hides the URL lifecycle has to own it, or the
explicit code it replaces stays clearer; elimination (§34.5) is the test.

- [x] **A delayed busy reveal in `foldkit-mixins`:** `aria-busy` lines shown
  only once a wait is noticeable, their space held. And a review of every
  package view for facts drawn before they are read (`Initial` is unknown,
  not empty). §33.6 (Built 2026-11-11 as `Utilities.busyReveal` in
  `foldkit-mixins/utilities`; crud's `Loading.shown` is its deprecated
  alias, and the data grid, Chirp, the reference and auth examples use it;
  the grid's `aria-rowcount` is unknown, not 0, while it loads. The rest
  of the audit found one more: the CMS badge read "New" over a failed state
  read, adae1c3d.)
- [ ] **Locales in the route graph:** a top-level locale parameter, targets
  with alternates, and data sources that take the locale. §33.11
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

- [ ] **1. Routing items:** §33.5 scroll keeping is built (see above); the
  rest feed the routing sequence as slices, not one cut — §34.3 placement,
  §33.4 history intent, §33.3 intents first (§34.1 wiring after the
  placement), then a thin `foldkit-site`.
- [ ] **2. Server/transport/SSG:** `http.ts` → `Server.mount` + scheduler;
  envelope/principal into remote/remote-server contract; `browser.ts` mount
  shape into server/local-execution designs. The SSG half is built: S1
  browser entry (client boundary + import walk), S5 takeover decision
  (`when`/`otherwise`/`fresh`), S6 determinism check, S7 build step
  (`staticSite` plugin + `foundations`, example script deleted), and S8. S9
  waits for a second language; §19.5–19.8 wait for a real
  deployment (see Server).

## Example showcase hardening

What the examples must show after 0.12: correctness gaps where the demo
misinforms, unadopted 0.12 contracts, UX polish, hygiene and docs.
[showcase-PLAN.md](./showcase-PLAN.md) has the findings and the sequence;
work wave 0 (correctness) first, then wave 1 (adoptions), then wave 2
(polish), with package prerequisites as their own slices.

- [ ] **1. Adoptions:** SSG adopts `staticSite` (built: plugin, sitemap/
  robots, the prepared-posts dependency, canonical, blessed-example note);
  `assembly.runtime` in one real assembly (built); todo agent learns
  completion (built: 0768491 names an agent's contract in declarations,
  2e347c4 completes on `SubmittedTodo`);
  `Input.view`/`Textarea.view` callers (built); the small-gaps batch (scroll
  options, `stateBadge` None, `Data.meta` stale/loading, bootstrap meets
  routing, kitchen-sink `correlate`, explicit submit gate: all built, the last three as decided below);
  staleness stays designed, not built.
  - **Decided and built** (example-level; the owner delegated the rules):
    - Kitchen-sink `correlate`: the caller names the note's id and `update`
      adds it at once, so `requested_create_note` completes on state
      (`Agent.when`) with the body checked too, since `update` drops a create
      over a taken id (f00749e).
    - `Mirror.bootstrap` meets `Mirror.routing` in `examples/foldkit/todo`: the
      stored list is the device's (bootstrapped from Flags), the filter the
      link's (a URL mirror read by routing) (9f6ce4b); the `canSubmit: () =>
      true` adopter is cloudflare's quick add, whose disabled button had
      silently stopped an empty Enter (2c25eee).
    - Studio's `clear-on-scheduled`: the box empties in the Message that moves
      the editor from Scheduling to Scheduled, while it still names the time
      asked; a failure or a time typed in flight stays (dd6a6e1).
- [ ] **2. Polish, hygiene, docs:** form focus story **built** (a refused
  submit focuses the first missing key, `test/focus.browser.test.ts`);
  waitlist dedup **built** (the shared `foldkit-mixins-form/ui` override, and
  the gate spelled `everyKeyIsValid` over `form.value` with its reason);
  linked `blockedNotice` **built** (each named step jumps to its tab, and
  unguarded `Next` is recorded as deliberate validate-at-submit); site chrome
  **partly built** (a skip link on the site and the studio, the card its link
  covers rings on keyboard focus, and a route change moves focus to what it
  drew, in `test/siteChrome.test.ts` and `test/siteFocus.test.ts`); studio
  touch targets **built** (`Touch.target` on tabs and toolbar buttons); the
  320px header/footer proof **built** (`e2e/narrow.e2e.ts`: no sideways
  scroll, every chrome control inside and none overlapping; 726dbad); teaching
  comments **built** — six of the seven named were
  already in place (`statusText`, `listing`, `follow`/`begun`, `Narrowing`,
  `scheduleAt`, the CMS `hydrate` refusal); added the seventh, on the editor
  body's width beside the Builder's. Dead code (built); stale READMEs (the
  four package ones built; the two example ones were already current); the
  `attrs` doc fix
  (built).

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
  mutations and SSR fallback posts. §19.5; planned as
  [auth-DESIGN.md](./auth-DESIGN.md) §5.1 and §6.2–6.3.
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
  [i18n-format-DESIGN.md](./i18n-format-DESIGN.md): not yet. The three
  views that read the runtime's defaults are fixed (F0, 0103c0b); build `LocaleFormat` in
  `foldkit-entity/locale` once the step above puts a locale in a Model.
- [ ] **Per-locale CMS entries,** slugs and locale-aware reads. cms-DESIGN §14
- [ ] **Schema labels per locale:** `Words.of(schema, { locale, table })` over a
  keyed table.
- [ ] **Right to left:** the audit and `pnpm rtl:check` are built (5a638b4..
  8d8041c: 41 lines made logical, about 62 marked `// physical:` with the
  reason). Open: a Sheet or Toast side named by inline direction (today a
  screen side), and icons that mirror in RTL through a Slot.
- [ ] Generated pages per locale and negotiation at the edge: SSR Phase S9,
  server-DESIGN §19.9.

## Data grid

`foldkit-data-grid` and `foldkit-mixins-data-grid`, in the order of
[data-grid-DESIGN.md](./data-grid-DESIGN.md) §21
([#144](https://github.com/doeixd/foldkit-plus/issues/144)). Phases 0 to 8
are built, each with the gaps noted below. Each phase lists its deliverables
and acceptance there.

- [ ] **The reference application:** a 100k-row product registry (§22).
  Built in memory as `examples/data-grid`, and over Remote with local-first
  edits through Sync as `examples/registry` (2026-10-03), with a search
  compiled by the server and a column layout saved to `localStorage`. Open:
  custom columns, and a per-column filter control drawn by the grid.

## UI platform

[ui-DESIGN.md](./ui-DESIGN.md) orders this as a contract, then capabilities,
then widgets. Phases 0–6 below are done. What landed after them, and what is
still open, is [ui-INVENTORY.md](./ui-INVENTORY.md). The design's wave names
and the changelog's wave names are different lists; the inventory records
both.

- [ ] **Phase 9 as packages, and Phase 10 blocks:** palette, sidebar,
  resizable and date-range are now in `foldkit-mixins-ui` (`command.ts`,
  `sidebar.ts`, `resizable.ts`; checked 2026-11-09). Settings, search, file
  browser, tree editor, and property panel are open. Blocks are not started. DataGrid is
  its own section above.

## Mixins and styling

- [ ] **Phase 10:** finish `foldkit-mixins-surface`.
  [mixins-DESIGN.md](./mixins-DESIGN.md)
- [ ] **Phase 12:** the Style compiler's remaining constructs: `@font-face`
  sugar and animation orchestration. The rule registry is built (`inject.ts`'s
  `register` and `usedIn`), and extraction is the `foldkit-mixins/vite` sheet
  (checked 2026-11-09). Waits until a real view needs them. [mixins-DESIGN.md](./mixins-DESIGN.md)
- [ ] **Phase 13:** DevTools and agent metadata beyond
  `SurfaceView.describe`/`toMarkdown`. [mixins-DESIGN.md](./mixins-DESIGN.md)
- [ ] **Portable Style and Behavior:** the target type, accessibility intents,
  conditions as data, element handles, and a React Native host through codegen.
  None is built, and nothing blocks it. [platform-DESIGN.md](./platform-DESIGN.md)

## UI parity and the shared systems

[ui-parity-DESIGN.md](./ui-parity-DESIGN.md) orders the components;
[ui-systems-DESIGN.md](./ui-systems-DESIGN.md) is its step 3b, the systems
they stand on, from Fluid Functionalism's craft reference. Systems steps 1-4
come before parity step 4, so the islands are built on the ladder. Every step
keeps what the systems plan's "What we keep" lists.

**The bar.** The UI work is measured against the best of each source at once:

- the robustness, composability, flexibility and range of components of
  [Zag.js](https://zagjs.com);
- the standards, accessibility and patterns of the
  [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/);
- the usefulness and robustness of [Base UI](https://base-ui.com);
- the beauty, components, options and variants, and out-of-the-box usefulness
  of [Fluid Functionalism](https://www.fluidfunctionalism.com/);
- the completeness of [shadcn/ui](https://ui.shadcn.com);
- the customizability of [CSS-Tags](https://doeixd.github.io/CSS-Tags);

while keeping the best of what this project already has:

- primitives are reused, never copied;
- everything can be used unstyled;
- options, defaults, knobs, design tokens, layers and composition let an
  application make any of it its own;
- every part is synergistic and works with the others.

- [ ] **Systems 8, component craft.** Done: the button's 1px press, merged
  selection runs, popup and dialog entrances. Our checkbox and radio fill
  when checked, so Fluid's clearing border is already their look. Icons stand
  on the ladder; dialogs narrow a notch when compact; tooltips slide toward
  their trigger. Tooltip's delay is upstream's (`showDelay`), and a skip
  window between neighbours is the application's (`reflectShowDelay`).
  Not taken: thickening icon strokes on hover, which would restyle every
  application's icon set. Toggles stand on the ladder, and the Switch has
  Fluid's 34×20 geometry and hover pill. Done: dragging the Switch's thumb
  (`Switch.draggable`, a Mount of its own: `PointerDrag` is a drop between zones, not a thumb; c3a6db7). Open: Select's pause after a pick (upstream's). [ui-systems-DESIGN.md](./ui-systems-DESIGN.md) §7
- [ ] **UI polish: bugs, merges and depth.** A review of the gallery found
  shared faults (hovers that lay grey on coloured surfaces, corners that are
  not concentric, collapses that overshoot, popups stacked inside their
  triggers, the scrollbars), broken pages (Input OTP, Hover Card, Nested
  Menu, Radio Group's labels, Skeleton, the Switch in RTL), pairs to merge
  (Alert and Banner, the dialogs, Sheet and Drawer, the dates, the sliders,
  the menus), and depth per component. Phases 0–5 and the merges have
  landed; a review of that pass (Part E) found claims without proof and
  docs ahead of the code, and most of it is now fixed and ticked there.
  Part E is done (2026-11-10); what is left needs `@foldkit/ui`, filed
  upstream as foldkit/foldkit#1686 to #1689.
  [ui-polish-DESIGN.md](./ui-polish-DESIGN.md)

## React

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

- [x] A check for the semantic-vs-structural write rule (`ModelRef.set`
  outside infrastructure): `pnpm writes:check`, in CI (2eefd270, cc11f5bc;
  about 55s since 28d9a9b2). Evo item 12's `prefer-evo-model-update` lint
  stays open there.

## Found by porting Foldkit's examples

The [`examples/foldkit/*`](../../examples/README.md#foldkits-own-examples-on-foldkit-plus)
ports worked around each of these; the example named has the workaround and
its README the details.

- [x] **Bundle: union-branch linkage and transition-time initialization.**
  Documented in foldkit-bundle's README, "A union Model: a Link per branch"
  (eecf3e04): a custom `Link.make` over the union, the next branch built in
  the login/logout transition. No helper until a second adopter.
- [x] **Mixins: styling a row upstream's own Listbox/Menu draws.** Decided in
  design review §6 (657e73b8): no change. The mixins-ui forks draw each row
  as the `item` Slot; a port keeping upstream's view styles rows by a rule
  under the panel's Slot, keyed on upstream's `role` and `data-*`, as the
  mixins-ui README shows.
- [x] **Mixins: recipe omission and result-key typing.** Decided in design
  review §8: a recipe's base slots are typed present in every selection, so
  the `?? Style.empty` fallbacks are gone (4c39b095..fffa3ec0); omission is
  destructuring, not a method, and Dialog gains no optional-piece axis until a
  second app asks.
- [ ] **Mixins-UI: adapters still missing.** DragAndDrop and Animation still
  hand out attributes with no adapter. Menu, Listbox, Combobox, DatePicker,
  Toast, FileDrop, Calendar, Nav and VirtualList have adapters (checked
  2026-11-09). Recipes exist for Select, Popover, Tooltip, Slider, RadioGroup,
  Calendar, Nav, VirtualList, Fieldset and Disclosure, and `hoverCard` wraps
  HoverIntent.
  Internal items with class-only hooks need upstream render/attribute hooks,
  not a second accessibility/state owner. `Textarea.resolve` and its result
  types are fixed; review any remaining direct `SlotBuilder.attrs()` textarea
  issue separately. `foldkit-ui-showcase`. Design review §6.

## Foldkit example design review follow-ups

[foldkit-example-design-review.md](./foldkit-example-design-review.md) reviews
all 18 ports against current source (2026-10-01). Related package work is
merged into the items above; section numbers below refer to that report.
Correct stale claims first, then form/UI integration and application semantics,
then the lifecycle and host-integration design work.

- [ ] **Medium: lifecycle-aware nested form controls (§5).** First demonstrate
  a flat picker-backed `Input.bundle` key. Prototype nested row Subscriptions
  with stable ids, cancellation on removal and late-result routing. Resolve
  resource-tag ownership before lifting Resources; do not delete the current
  refusal without a working lifecycle. Keep browser Files at the boundary and
  define submitted upload metadata/handles as needed.
- [ ] **High for production SSR: dynamic host-head integration (§9).**
  `SSR.entry` currently rejects plan metadata. Design explicit template/host
  cooperation or head contributions the host consumes; share metadata
  generation with the static path. Verify request-specific metadata, first
  response head styles, escaping/deduplication, hydration and no cross-request
  leakage. Keep refusal until the host supports the contract.
- [ ] **Medium, adopter-led: higher-level interaction integration (§11).**
  Prefer a Slot adapter around upstream DragAndDrop for sortable collections.
  Evaluate a distinct delegated pointer-stroke Mount for Pixel Art's painting,
  including touch/pen position hit-testing, cancellation and skipped cells.
  Keep the low-level drag primitive small and preserve the accessibility owner.
