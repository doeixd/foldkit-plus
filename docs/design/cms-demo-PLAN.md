# What the CMS demo's rough edges ask of the packages

> **Status:** plan, not built (2026-09-28). Each area names the example files
> that hand-roll it and the package/design that should own it. Work the areas
> in order; the example is the acceptance test (area 0's rule).

Running `examples/cms` end to end (studio, site, prerender, demos) surfaced
rough edges that group into six kinds. None is a CMS bug; every one is a seam
between pieces. The pattern throughout: the example hand-rolls a concern the
project already has a design for, or a package already has the semantics for
but not the view/ergonomic half of.

Prior art: [cms-example-FINDINGS.md](./cms-example-FINDINGS.md) /
[cms-example-PLAN.md](./cms-example-PLAN.md) ran the same loop (findings →
plan → workarounds deleted from the example). This doc is the second round.

## 0. In-example hygiene first (no package change)

Do these before anything else; they delete lines without changing APIs.

- **Tag switches.** `app.ts:206`, `pageApp.ts:179`, `siteApp.ts:130` branch
  `switch (message._tag) { … default: return { model } }`. Per AGENTS.md a
  catch-all `default` compiles silently when a variant is added. Convert to
  the union's own exhaustive match (`defineMessageUnion` match /
  `Match.tagsExhaustive` / `RemoteData` helpers). Single-`===` narrows on a
  typed union (`UrlRequested` Internal check, `route._tag === 'Page'`) are
  fine and stay.
- **File organization.** 35 files flat in `examples/cms/src`. Split
  incrementally: (1) `src/demo/` (`harness.ts` + `postDemo.ts` moved from
  `demo.ts` + `pageDemo.ts` + `articleDemo.ts` + `main.ts` runner; keeps
  `runDemo`/`runPageDemo`/`runArticleDemo` export names the tests import);
  (2) split `style.ts` (~1900 lines) by owner (`adminStyle`, `siteStyle`,
  `builderStyle`, `formStyles`); (3) unify the `view.ts`/`pagesView.ts`
  editor-bar clone plus the duplicated `revisionsOf` into `shell.ts` (or an
  `editorChrome.ts`). No `__Demo.ts` convention needed; `*Demo.ts` +
  `test/*Demo.test.ts` is already the convention.
- **Demo harness.** The `chair()` harness (~80 lines: handlers, served,
  sent-recording, client, model, send/look) is copy-pasted 3× across the
  demo transcripts. Extract `demo/harness.ts` (`openBackend()`,
  `chairHarness()`, `visitBySlug()`); keep per-demo beats inline (they are
  the spec).
- **Demo uses new APIs.** Where the example predates a shipped API it now
  duplicates (`pageList` hand-rolls what `ListView` does in `view.ts`;
  `tabs`/`chevron`/`field` hand-roll existing `Recipes.Tabs`/`Disclosure`/
  `Input`), adopt the package and delete the fork — or record the semantic
  mismatch (e.g. CMS tabs are `aria-pressed` toggles) so the recipe gap is
  explicit.

## 1. Routing: `address.ts`, `siteApp.ts`, `pageApp.ts:follow`, `scroll.ts`

All four are [router-DESIGN.md](./router-DESIGN.md) §34 material and join the
first `foldkit-site` cut (TODO.md routing section), not later polish.

- **`address.ts` (entry codec + push/replace policy + reload-safe
  `openNamed`/`beginMissing`).** Instantiated twice (`post` vs `page` keys)
  by convention. Becomes Site targets-with-intents (§33.3: `{ route,
  intents }` with readiness + apply) plus one history-intent declaration
  (§33.4: node/entry change is a step, in-node param change replaces).
- **`siteApp.ts` `routeOf`/`pathOf`.** A hand-written bidirectional
  route codec with an invertibility test. One Site declaration must give
  both (`Site.target` carries route + url, §15/§33.9); no application writes
  the pair.
- **`pageApp.ts:243-263` `follow` (deferred `linked{block,panel,viewport}`
  replayed through the Builder's own `update` once its Model exists).**
  Ordering (select → panel → viewport), id validation via `Object.hasOwn`
  (correct; keep), once-semantics. This is the intent primitive of §33.3
  applied to a nested editor, plus route-associated Builder values from the
  page-builder design. Site should own "hold until the owner is ready, apply
  through its Messages, then let go".
- **`scroll.ts` (Navigation-API save/settle/restore, ~130 lines).**
  Encodes the ordering trap AGENTS.md names (Foldkit draws before Navigate
  runs; loading states clamp restores). Belongs in `foldkit-primitives` as
  a Subscription/Mount, or upstream in Foldkit navigation; `Site.transition`
  adds only what topology knows (which container scrolls). Every multi-route
  app needs it; none should hand-roll it.

## 2. Server, transport, bootstrap, SSG

- **`http.ts` (Node `POST /remote` + chair header + due loop).**
  A 59-line reimplementation of "mount Remote RPC + periodic job". Becomes
  `Server.mount` + `Remote.rpc` + scheduler per
  [server-DESIGN.md](./server-DESIGN.md). First user when `Server.handle`
  lands.
- **`transport.ts` (JSON `{operation,payload}` envelope, `x-chair`,
  `Live: Stream.empty`).** Envelope + principal extraction belong in
  `foldkit-remote` / `foldkit-remote-server` docs and contract;
  `chairOf(?as=)` stays example (demo auth).
- **`browser.ts` (in-page sql.js server + localStorage sandbox + due
  poll).** Same `openServer`/`answer`/`publishDue` as `http.ts`, different
  host. Server-package mount graph + `local-execution-DESIGN.md`; the
  sqlite adapter shape informs `remote-drizzle`/`cms-drizzle`.
- **`endpoint.ts` (`answer()` shared by both transports).** Correct seam;
  stays as the pattern `remote-server` docs should bless ("one `answer()`,
  two transports").
- **`client.ts` (transport select, chair, runtime, site-vs-studio mount,
  takeover).** Stays example, but the imperative `if (/site)` topology is
  what the Site/Server graphs make declarative (§33.7/§33.10: a target
  knows its document; `Site.navigate` chooses Navigate vs load).
- **`prerender.ts` + `generate.ts` + `sitePlan.ts`.** `prepare` (ordered
  active prefetch), `headFor`/`describe` (per-route metadata from the
  page's own data), template-shell contract, sitemap/robots, resume plan
  with the SSR import isolated from the studio bundle. All Phase S of
  [ssr-PLAN.md](./ssr-PLAN.md): `Data.satisfy`, head-from-Model,
  `SSR.sitemap`, build helper, `foldkit-ssr/client` boundary. `headFor` is
  the `Site.meta`-as-function-of-Model policy (§23/§33.9).

## 3. `mixins-ui` gaps the demo proves (Badge, Loading, buttons, icons)

Rule: where `mixins-ui` publishes a recipe, the demo selects variants
instead of forking styles; where it publishes nothing, the gap is real and
the recipe lands first, then the demo adopts it.

- **`Badge`.** `stateBadge` ×2 (`data-state` vs `data-cms-state`), same
  pill+dot, 5 tones. Add a `Badge` recipe (tone-by-attribute, attribute
  parameterized); the demo keeps only tone→state mapping + words.
- **`Loading` (+ `Empty`/`Failure`).** Four spellings of busy/failed/empty
  across `view.ts`, `pagesView.ts`, `siteView.ts`, `site.ts:waiting()`
  (the last unslotted, no `aria-busy` — fix first). Upstream next to
  `ListView.status`: words, `role=status/alert`, `aria-busy`,
  delayed-appear = the demo's `waitShown` generalized. No spinner art;
  encode the text + delayed-fade convention.
- **Buttons.** ~9 button-likes, `Recipes.Button` used for 3.
  Extend Button variants (primary/ghost/icon) instead of bespoke
  `Style.compose`; merge the duplicated `viewport`/`choice` segmented
  controls into one recipe.
- **Icon machinery + touch targets.** `glyph`/`iconsBy` (`--icon` var +
  mask + attribute dispatch) and `touchTarget(s)` are generic mechanisms
  with app-specific data; upstream the mechanism, keep CMS's Lucide paths
  local.
- **`historyCard`/`moreCard` (+ `statusLine`/`badge`/`revisionsOf`).**
  Generic CMS UI already coupled to `Cms.Display/State/Transition` —
  upstream as a CMS view companion (highest value after Badge/Loading).
  `statusLine` must derive from the `EditorStatus` union, not re-spell it.

## 4. Form view ceremony (`foldkit-form` example + websocket-adjacent lesson)

Backend semantics are declarative (`Form.make`); rendering is still
mechanical. Three wrappers, each with an escape hatch, in this order:

1. **`Button.view({label, style, type?, disabled?, onClick?, input?}, h)`.**
   Hides `UiButton.view → Button.toView/resolve → h.button` (thinnest;
   `examples/foldkit-form/src/main.ts:317-332`,
   `foldkit-job-application/src/view/button.ts:11-28`). Home:
   `foldkit-mixins-ui`.
2. **`Input.field({form, key, id?, type?, placeholder?, style}, h)` (+
   Textarea).** Hides `UiInput.view + Input.resolve/toView +
   label/control/description` (~25 lines × N keys differing only in
   id/label/field/onInput/type). Must forward `type`/`placeholder`/`rows`,
   which `FormView` currently swallows.
3. **`FormView.fields(form, {styles?, attrs?, drawers?})`.** `FormView`
   already dispatches on `control.control.kind`
   (`packages/mixins-form/src/index.ts:544-546`) but takes only global
   `field`/`renderers`, so both examples hand-roll an exhaustive
   `fieldDrawers` map that duplicates `inputs:{messageText:
   FormInput.multiline()}`. Per-field style/attrs/drawer overrides remove
   the synchronization point; keep custom drawers for kinds with no
   shipped renderer. The exhaustive-over-`FieldKey` property must survive
   (adding a key forces a render decision).
4. **Submit gating made explicit.** `canSubmit` (submit waits, button
   enabled) vs `engine.value`/`isValid` (button disabled while Validating;
   the waitlist's deliberate choice with comment at
   `examples/foldkit-form/src/main.ts:189-194`) vs job-app's no-pre-disable
   + `ValidatedAll` at submit. `FormView.submodel` bakes in lenient
   (`mixins-form/src/index.ts:779`). Helpers take the predicate explicitly
   instead of hiding the choice.

## 5. Primitives: websocket selectors

`examples/foldkit-websocket-chat/src/main.ts` carries `connection:
ConnectionState` beside `...ChatSocket.fields` (`chatSocket.status/
lastError`), translated by 55-line `reactToSocket` (`main.ts:92-146`) plus
gate, send-gate, and view branches; tests enumerate the cross product.
The bundle (`packages/primitives/src/net/websocket.ts`) exports no
`status`/`isConnected`/`error` reader (`Bundle.declare` returns
`{field,wrapper,fields,cases,at}`; `Placed.helpers` is `{send}` only).
Add: a status reader usable in `when`/view, `isConnected`/`isLive`
derived boolean, an error projection (or document user-sentences as
app-owned — today implicit), and a 4-state view union derivation
(`status` + `lastError` → `Disconnected|Connecting|Connected|Error`).
`Received`/`Sent` payload commands stay app-owned by design. Same shape
applies to `sse.ts`.

## 6. Seeding story

`seed.ts` (fixed clock, entry-keyed ids, pages-after-posts, `cms.import`
so publish/revision bookkeeping runs) stays example-local, but the runner
shape should inform `foldkit-cms`/`cms-drizzle` import tooling and docs.

## Sequence

1. Area 0 (hygiene; example-only, zero UI risk first: demo folder +
   harness, tag switches, bar/`revisionsOf` unification).
2. Areas 3–5 alongside: each recipe/selector lands with its adopt-in-demo
   follow-up in the same change (Badge → Loading → historyCard/moreCard →
   buttons/icons/touch-targets; Button.view → Input.field →
   FormView.fields; socket selectors).
3. Areas 1–2 feed the existing sequences rather than starting new ones:
   routing items into §31 step 5 first cut (with §34), server/SSG items
   into server-DESIGN §19 / SSR Phase S order.

Acceptance per area: the hand-rolled code it names is deleted from the
example and the area's TODO items ticked in the same change.
