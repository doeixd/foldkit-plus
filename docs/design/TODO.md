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
- [ ] **G6.** One manifest entry per keyed placement: G4 measured the
  manifest at a thousand rows at a fifth of the gzipped page and about 38 ms
  to decode and listen, over both of its limits.
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
- [ ] Decide where URL semantics belong when routing and Mirror share a URL
  Message, with a spike on a routed example.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Open questions
- [ ] Decide whether `Sync.mount` takes the whole assembly.
  [wiring-DESIGN.md](./wiring-DESIGN.md) Open questions
- [ ] Re-rooted Surfaces per placement, so an agent can expose a placement's
  Messages one by one. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] Derive the whole parent Model and Message from an assembly, once real
  applications ask for it. [bundle-DESIGN.md](./bundle-DESIGN.md) Deferred
- [ ] `withResources`, `Link.key` and HashMap storage, which W5 left out.
  [bundle-DX-PLAN.md](./bundle-DX-PLAN.md) Outcome

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
