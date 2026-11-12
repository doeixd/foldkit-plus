# Decisions, 2026-11-12: build what was deferred for want of a consumer

Status: decided 2026-11-12 (decisions delegated by the owner). Nothing here
is built by this note.

AGENTS.md gained "Scope: build the feature" on 2026-11-12 (d9d54c5c): a
feature is not deferred, declined or closed because no application or second
consumer uses it. Its tests, an example or a demo are its first consumer. A
deferral needs one of four reasons: it waits on upstream, a measured cost
outweighs it, the design is unsound, or another package owns it.

This note revisits every earlier decision that deferred work, and sorts each
into one of two groups: deferred only for want of a consumer (now built, with
a work package below), or deferred for a concrete reason (kept, with the
reason quoted).

**What was read.** The four `decisions-2026-11-12-*.md` notes in full; the
design notes the brief named; both TODO files; and every line of
`docs/design/*.md` matching "second consumer", "no consumer", "no caller",
"until an application", "until something asks", "reopens when", "when an
application asks", "nobody has asked" and their variants. Code was read at
`d9d54c5c` where a row says "checked".

**Not decided here.** The deferrals inside
[541-laws-DESIGN.md](./541-laws-DESIGN.md) (its section 8) and
[544-547-alchemy-DESIGN.md](./544-547-alchemy-DESIGN.md) (its "Deferred, with
what is needed") are being revised by their own authors under the same rule.

**Limits.** The sweep was a text search over 169 notes, so a deferral worded
another way can have been missed. Rows marked "verify first" name a state I
did not read in code; step 1 of `TODO.md`'s loop applies to every package
anyway.

## 1. Deferred only for want of a consumer: now built

"Old decision" quotes the reason as written. WP is the work package in
section 3.

| # | Item | Issue | Old decision and reason | New decision | WP |
| --- | --- | --- | --- | --- | --- |
| 1 | `reaches(write, query)`: which lists a declared write can reach | #439 (R1) | Closed not planned: "Neither half has a consumer"; "promoting a 40-line test helper to public API with one caller, its own test". | Build it in `foldkit-remote`, and give `explain` a `reachedBy` line. Checked: only the local `candidate` in `packages/remote/test/writeTrace.test.ts:195` exists. | A1 |
| 2 | `motion: 'none'` on Dialog and Sheet; a Sheet duration | #424 | "The motion items stay out until a second application writes them"; "an axis one application passes is an option nobody else passes". | Build both. The duration is a token (`motion.sheet`), not a recipe option, as the styling rules ask. Checked: `recipes/sheet.ts:253` reads `ref.motion.slow` and has no axis. | B1 |
| 3 | Conditional pieces in a build-evaluated style module | #420 phase 2 | "Phase 2 stays not planned: it has no caller." | Build `whenInput` for a predicate imported from a module that is not listed. `perItem` stays refused, for a concrete reason (section 2). | B2 |
| 4 | Server-only state in a Sync document | #190 Phase 5 item 3 | "Phase 5 stops until something asks... none in the tree does." | Build, after the five follow-ups already ordered. | D2 |
| 5 | What each reader of a document may see | #190 Phase 5 item 4 | Same sentence; "Q13... is open". | Build, design note first. Q13 is answered in section 4. | D3 |
| 6 | Journal Stories | #190 Phase 5 item 8 | "A Story format with no second author is a wrapper." | Build as `foldkit-sync/testing`. | D4 |
| 7 | `prune(through)` for a reaction's ledger rows | #190 | "No application has a ledger large enough to ask." | Build, with its cost stated in the doc comment: a pruned reaction runs again after a later `reset`. | D1 |
| 8 | A row revision on Remote's read answers | #480 | "A wire change with no server able to fill it. It reopens... when a Source can send a revision per row." | Build. `foldkit-remote-drizzle` is ours and is the first Source; an Entity already names a revision for `expect: 'revision'`. | A4 |
| 9 | `visibleLinks`, preloading what is on screen | #236, #227 | "(c), not yet... nothing measured says it arrives too late." The measurement it named was never run. | Build as an opt-in stream with a cap. The application merges it into `links`; nothing preloads by visibility unless asked. | C1 |
| 10 | A per-link opt-out and a configurable rest for intent preloading | #227 | "No application has needed one"; "50 ms is fixed until an application needs another". | Build both on `pointedLinks`. Checked: `pointed-links.ts:5` is `const REST = 50` and the function takes no options. | C1 |
| 11 | Load a route's `Bundle.lazy` chunk from the Site tree; SSR loads only the route's body | #438 (C1, C2) | "No example has a `Bundle.lazy` page, so 'SSR stops loading every lazy body' changes nothing anyone runs." | Build C1 and C2, as the note first recommended. C3 on the CMS stays declined by its measurement (section 2); a lazy page in `examples/auth` is the consumer. Checked: no example calls `Bundle.lazy`. | C2 |
| 12 | Two policies on one route in `Data.wiring` | #236 | "Gets no issue until an application needs two policies on one route; none does today." | Build `policies`, keyed by the active record's keys. | A3 |
| 13 | A Behavior that turns a drag over described items into a reorder | capability matrix gap 2; design review §11 | "Deferred until a second consumer or the Tree slice demands it"; "adopter-led". | Build `Reorder`. The old rule is met anyway: the grid's columns (`columnState.ts`) and the rich text handle (`handle.ts`) each reorder by a drag of their own. | E1 |
| 14 | `Num` operators, and more `Text` operators | #478 decision 4 | "(a) no, each waits for a caller under data-query §6.0." | Build, each by §6.0.2's procedure. Checked: `text.startsWith` is the only shipped operator. | F1 |
| 15 | A `Derived` as an entry of `Projection.struct` | #483 | "Waits for a caller; none exists." | Build. | F2 |
| 16 | `WritesOf` and `OwnerOf` type queries | #479 | "Have no consumer and are not proposed." | Build these two. The other three are unsound (section 2). | F1 |
| 17 | A combinator over several `RemoteData` values | #481 | "Add one when an application asks, with that precedence stated." | Build `RemoteData.all`, precedence stated in section 4. Checked: `remoteData.ts` has `map`, `match`, `render`, `held` and no join. | A2 |
| 18 | Copy as `text/html`; date fill series; custom fill series | #144 | "When an adopter asks... It has no design question, only no caller." | Build all three to the note's §5 shapes. | E2 |
| 19 | Private media variants | media-access decision 3 | "Not now... the choice is made when an application needs it." | Build the guarded route, which that note says fits this repository better. Signed URLs are not built: two ways to do one thing. | G1 |
| 20 | `stack.signUp` and `stack.signIn` | #239 | "Waiting on #228's reference app, the second consumer." | Build. The condition is met as well: `examples/reference/e2e/notebook.e2e.ts:29` writes `signUp` by hand. | H1 |
| 21 | A 415 for a body that is not JSON; Presence's `peerId` from the principal | auth §6.2 | "Each waits for a consumer." | Build both. The 415 is hardening. `peerId` is a string the host passes today (`presence.ts:366`); the host should get it from the resolved principal, not write the mapping by hand. | G2 |
| 22 | A content security policy the document emits | server §19.7 | "Wait for a real deployment... not speculatively." | Build on `SSR.entry`. `examples/reference` and `examples/auth` are such hosts now. | G3 |
| 23 | Nested route nodes | router §34.2 | "Build the tree for a real nested layout, not before one." | Build, with a nested layout in an example as its consumer. | C3 |
| 24 | Localized pages, the locale in the route, `LocaleFormat` | SSR S9, router §33.11, i18n | "S9 waits for a second language"; "once the step above puts a locale in a Model". | Build in i18n-DESIGN's order. The CMS example gains a second language, which is the consumer every later step waited for. | I1 |
| 25 | `@font-face` sugar and animation orchestration in the Style compiler | mixins Phase 12 | "Waits until a real view needs them." | Build. Checked: domains-plus writes its `@font-face` and a `@keyframes` as raw `Style.global` text (`appStyle.ts:51`, `:58`). | B3 |
| 26 | A helper for a union Model's Link per branch | Bundle (port findings) | "No helper until a second adopter." | Build. | E3 |
| 27 | An optional-piece axis on Dialog | mixins (design review §8) | "Gains no optional-piece axis until a second app asks." | Build with B1, since both edit the Dialog recipe. | B1 |
| 28 | The parent Model and Message derived from an assembly | Bundle, Deferred | "Waits for use in real applications." | Build, design first. | E3 |
| 29 | A CMS workflow with a review state | cms §14 | "Design these from a real case." | Build in `examples/cms`, which is the case. | I2 |
| 30 | First screen first: a streamed body for a slow read | #427 (c) | "Waits for a page with a measured slow read below its first screen, which no page here has." | Build the page first, then decide by its numbers (section 4). | C4 |

## 2. Deferred for a concrete reason: kept

| Item | Issue | Reason, quoted | Kind |
| --- | --- | --- | --- |
| A version per Entity in the store (R2) | #439 | "Reading a 25-row list again after a write to a row it does not show costs about 22 µs"; "the largest page... about 0.1 ms per write". | Measured. A1 adds the ten-list case to `read.bench.ts`, so the 1 ms line is a number the repository checks, not a wish. |
| The inferred write-set map | #439 | "The check it would skip costs under 1 µs per region... and cannot be wrong; the map can be." | Unsound |
| Per-Selection decoders | #440 | "A generator could remove 0.3% of domains-plus's client." | Measured |
| CSS anchor placement | #430 | "Placement is about a tenth of the interval"; floating-ui stays in the chunk. | Measured, and upstream |
| The loader as domains-plus's default | #472 | "Blocking is the same and total script is 0.9% worse." | Measured |
| A per-page stylesheet | #471 | "About 1.2 KB brotli", and a production client has no injector to add a class back. | Measured, and unsound |
| LongList | #429 | "556 rows add about 10 KB brotli to a page whose ceiling is 9.6"; streaming failed its probe. | Measured. Its third condition, "someone needs what only it gives", no longer applies; the first two stand. |
| `Style.perItem` in a build-evaluated module | #420 | A per-item piece compiles its classes when drawn, which needs the compiler the phase removes. | Unsound |
| The `Link` header, and head first | #427 (a), (b) | "First contentful paint falls by 6 ms (decision 6's bar is 50)"; (b) waits on upstream's answer on assets. | Measured; upstream |
| Splitting the CMS studio (C3 there) | #438 | "The most that one non-landing route alone imports is 2.0 KB brotli." | Measured |
| The `Host.workers` preset (H4) | #235 | "3 to 5 shared lines against 30"; the three Workers "differ in five decisions one call would hide". | Measured, and unsound |
| A per-node `data` block on a Site node | #236 | "`retain` would be a second owner"; the route `match` "is checked when a route is added, where an annotation with a default is not". | Unsound |
| Skipping a preload the reader may not see | #227 | "The routing does not know the reader to decide earlier"; the server guards the read. | Another owner |
| Scoped fiber metadata | async-semantics | "`Data.inspect(model).loading` reports the reads in flight"; the Model already answers. | Another owner |
| A tagged requirement union | #64 | "A closed tag list in Surface would be a second way to say what a key already says." | Unsound |
| Namesake Entities told apart in `Reads` | #479, #480 | "A unique symbol per `Entity.define` would reach every `Reads` in every signature." | Cost |
| `RequirementsOf`, `ErrorsOf`, `AssuranceOf` | #479 | "No effect row: there is no effectful term to carry one"; evidence is a run-time stamp a type could forge. | Unsound |
| Partial or effectful operators | #185 | "An operator's implementation is a synchronous function of stored values"; every reader of one is synchronous. | Unsound |
| `Projection.fromExpr` | #483 | "A second language sharing a type." | Unsound |
| Paste `text/html` | #144 | "Parsing untrusted markup is risk with no gain": every source that writes HTML writes TSV beside it. | Cost |
| Multi-range copy | #144 | The grid has one cell range; a second "collides with Ctrl+click's row toggle". | Unsound |
| Window functions, and a per-parent cursor in a batched read | remote-drizzle D1 | "Deferred, measured: N queries for N parents (~19 ms/50)." | Measured |
| Relation policy in `RemoteServer` (A4) | remote-drizzle D3 | "`RemoteServer` has no relation metadata"; A2 shipped. | Another owner |
| Timers and multi-step processes | #190 Phase 5 item 7 | "A server runtime, which... Domain's Sagas, Effect's workflow modules and Durable Object alarms already provide." | Another owner. D1 adds the hand-over as a recipe, so the answer is shown and not only stated. |
| Platform-independent Foldkit; GPUI | #148, #149 | Wait on reffect running a Counter's `update`, and on #376's seams upstream. | Upstream. "Or on an application that needs a second platform" is no longer a condition. |
| A `foldkit-style` package | styleImprovements | "Same tree-shaking as subpaths, one more manifest." | Cost |
| #473's S1 and S2; #413; #474; #426 | performance | foldkit/foldkit#1657; a deploy the maintainer runs. | Upstream |

**Already built, so no decision is owed.** Checked in code:

- The virtualization Behavior (capability matrix gap 3): `windowList.ts` and
  `virtualList.ts` in `foldkit-mixins-ui`.
- `foldkit-plus/testing/workers` (#253's lift) and the `writes` option on the
  optimistic assertion (#239 item 6): `packages/plus/src/testing/`.
- `Site.access` (router §25): `packages/site/src/index.ts:828`.
- `computed` counts and a relation `where` by principal (remote-drizzle D4
  A2, D3 A2), and the Switch's thumb drag.

**Verify first.** Each of these reads as consumer-gated in its note, and I
did not confirm its state in code. The owner of the named package checks it
before building:

- `SSR.entry` passing the request context to `flags`, `headers` and
  `resources` (#212, "No caller needs it yet"). With G3.
- `Auth.ssr` and the Context-key option for `serveFetch` (auth §6.2).
  `AuthServer.host`'s `navigation` resolver may be both. With G2.
- Client-side evaluation of row guards (guard §13 question 6).
  `EntityLayer.viewer` and the pre-send `forbiddenByWrite` look like it.
- Caching by whether a page depends on the principal (server §19.8).
  `SSR.entry` keeps only a page drawn from its URL alone (#428).

## 3. Work packages

Every brief carries AGENTS.md's git rules, the checks to run and what it
must not touch. Each package runs `TODO.md`'s loop. Files are disjoint
within a group and across groups unless "after" says otherwise.
`packages/*/src/index.ts` export lines, `CHANGELOG.md` and the skill's
`SKILL.md` are shared, so they go through the temporary-index recipe.

Two orderings come from the other notes:

- the laws note's WP1 to WP7 own `packages/entity/src/write.ts`,
  `invariant.ts`, `descriptor.ts`, `packages/remote/src/remote.ts`,
  `walk.ts`, `packages/sync/src/mount.ts`, `make.ts`, `journal.ts` and
  `packages/durable/src/journal.ts`;
- the Alchemy note owns `examples/writes-domain` and a write in
  `examples/writes`.

Model: "default" is the most capable model. An API decided in section 4 is a
clear design, so its package is Sonnet unless it is security-sensitive or
crosses contracts. Every package that changes a published API owes a Jev
review (`TYPESAFE_API_KEY` is unset here; it joins `TODO.md`'s list).

### Group A: Remote

**A1. `reaches` (#439 R1).** Sonnet, with an independent review.

- Owns: a new `packages/remote/src/reaches.ts`; `why.ts`; the export line;
  `test/writeTrace.test.ts`, a new `test/reaches.test.ts` and mutation spec;
  one case in `bench/read.bench.ts`; the README, `references/remote.md`.
- Done when: `writeTrace.test.ts` imports `reaches` and its `candidate` is
  deleted; the #477 fixture passes, plus an exists whose `where` reads the
  written member, a namesake Entity, a body-less query and a handler
  mutation (both `Unknown`); a mutation dropping each reach variant (`Path`,
  `Exists`, `ViewerPath`, the `where`) is killed; `explain` lists the
  domain's registered mutations that reach the list; `read.bench.ts` times
  ten 100-row lists after one write.

**A2. `RemoteData.all`.** Sonnet.

- Owns: `packages/remote/src/remoteData.ts`, its test and mutation spec,
  the README section.
- Done when: a table test has one row per pair of variants; type tests show
  the struct's value type and refuse a non-`RemoteData` entry; a mutation
  swapping two precedence ranks is killed.

**A3. `policies` on `Data.wiring`.** Default (caching). After the laws
note's WP3, which owns `remote.ts`.

- Owns: `packages/remote/src/domain.ts` and the subscription planning it
  calls; `test/policies.test.ts`; `packages/site/README.md`'s "A data policy
  per route".
- Done when: two Surfaces active on one route read under different
  policies, shown from the wiring's own Subscriptions as
  `examples/chirp/test/site.test.ts` does; a key the active record lacks is
  a type error; a list read by two entries keeps the rule in
  `234-352-cache-DESIGN.md` (held stale unless both age it).

**A4. A row revision on read answers (#480).** Default (the wire). After
A3. Design note first: `480-row-revision-DESIGN.md`.

- Owns: `packages/remote/src/rowRead.ts` and the store's row write in
  `model.ts`; the read payload in `packages/remote-server`; the Source in
  `packages/remote-drizzle/src`; `test/temporal.test.ts`'s late-answer case;
  `482-temporal-laws-MATRIX.md`'s row.
- Done when: a read answer older than the held row is dropped, across two
  read entries, in a test that fails without the comparison; a Source that
  names no revision behaves as today; the client's request and response
  types are diffed against the payload schemas (the trap in AGENTS.md).

### Group B: styling

**B1. Sheet and Dialog motion, and Dialog's optional pieces.** Sonnet.

- Owns: `packages/mixins-ui/src/recipes/sheet.ts`, `dialog.ts`;
  `packages/mixins/src/theme/tokens.ts` (the `sheet` duration);
  their recipe and browser tests;
  `examples/foldkit/domains-plus/src/client/style.ts`.
- Done when: domains-plus's `CartSheetLook` durations and its `slide` and
  `phoneSheet` are gone, with its look and parity tests unchanged; a browser
  test reads `transition-duration` on `backdrop` and `panel` in every state
  (the longhand trap); `motion: 'none'` leaves reduced motion as it was.

**B2. `whenInput` in a build-evaluated module (#420 phase 2).** Sonnet,
with an independent review of the plugin's output.

- Owns: `packages/mixins/src/viteFreeze.ts`, `test/viteFreeze.test.ts` and
  its fixtures; `examples/design-system/vite.config.ts` and its style
  module, as the second application that lists `modules`.
- Done when: a listed module with a `whenInput` whose predicate is imported
  builds, and its chunk holds no `styleRules`; an inline predicate still
  fails the build, and the message says to move it to a module of its own;
  `perItem` still fails; a conformance test compares the frozen export with
  the run-time one for an input each way.

**B3. `Style.fontFace` and animation orchestration.** Sonnet. After B2
only where both touch `style.ts` (check first).

- Owns: the Style compiler's files in `packages/mixins/src` other than
  `viteFreeze.ts` and `theme/tokens.ts`; their tests;
  `examples/foldkit/domains-plus/src/client/appStyle.ts` as the adopter.
  `Style.keyframes` exists already: read it first, and add only what
  orchestration lacks.
- Done when: the adopter holds no raw `@font-face` or `@keyframes` text;
  `Style.usedIn` writes each once (#271's rule); the `missingTokens` gate
  passes.

### Group C: Site, SSR, routing

**C1. `visibleLinks`, and options on `pointedLinks`.** Sonnet.

- Owns: `packages/primitives/src/dom/pointed-links.ts`, a new
  `visible-links.ts`, the `dom` index; browser tests (layout decides it);
  the preloading section of `packages/site/README.md`;
  `examples/reference` as adopter, with a touch e2e.
- Done when: a page of 50 links starts at most `atMost` reads; a link with
  `data-preload="none"` is skipped by both streams; Save-Data and a hidden
  tab start none; the reference e2e measures tap to drawn with and without
  the stream and records both numbers in the note.

**C2. Route code from the Site tree (#438 C1, C2).** Default (three
packages' contracts).

- Owns: `packages/site/src/index.ts`; `packages/ssr/src` (`entry`,
  `hydrate`: `lazy` as a function of the route); `packages/site/test`,
  `packages/ssr/test`; a lazy account page in `examples/auth`, with a
  `split.test.ts` row and an e2e that counts the chunk request on hover.
- Done when: `Site.codeFor(site, route)` names the route's lazy bodies and
  none for a page without one; hovering a link requests its chunk once; a
  server render of another route loads no lazy body; a placed lazy page
  draws after arrival with no Model change (the #501 probe).

**C3. Nested route nodes.** Default (a published API's shape). After C2.

- Owns: `packages/site/src` (after C2), a design section added to a new
  `nested-routes-DESIGN.md`, and one nested layout in `examples/cms`'s
  studio.
- Done when: one node declares a layout, child routes, a child Model and a
  route-local Subscription; the example's nested URL is no longer a flat
  `match` arm; leaving the parent stops the child's Subscription, asserted
  by a finalizer.

**C4. First screen first.** Sonnet for the probe; default if it is built.
After C2.

- Owns: a page in `examples/reference` with a read below its first screen
  that takes 300 ms or more; `scripts/` for the probe.
- Done when: the probe records first contentful paint with the body
  buffered and with the first screen sent ahead; then the decision in
  section 4 is applied.

### Group D: Sync's server side (#190 Phase 5)

All after the five follow-ups already ordered in
[decisions-2026-11-12-data-platform.md](./decisions-2026-11-12-data-platform.md)
and after the laws note's WP5 and WP6, which edit the same files. Default
model throughout: identity, the wire, and what a principal receives.

**D1. `prune(through)`, and the deadline recipe.** With follow-up 2 (bind
nothing under `server/`), which already owns these files.

- Owns: `packages/durable/src/journal.ts`'s ledger, `packages/sync/src/serverJournal.ts`;
  a section of `docs/replication.md`; `examples/sync` after follow-up 4.
- Done when: pruned rows are gone and a reaction above `through` is not run
  again; one below it runs again after a `reset`, and the test says so; the
  sync example expires an invite by handing a deadline to a Durable Object
  alarm, the result returning as a server-only Message, fired once across a
  restart.

**D2. Server-only state.** After D1.

- Owns: `packages/sync/src/make.ts`, `serverJournal.ts`; the snapshot
  codec in `packages/durable/src`; `test/serverState.test.ts` and mutation
  spec.
- Done when: no exchange, snapshot or patch sent to a replica holds the
  part, asserted on the bytes; a client-submitted Message cannot change it;
  a reaction reads it; `reset` and compaction keep it.

**D3. Reader slices.** After D2. Design note first:
`190-reader-slices-DESIGN.md`, reviewed before any code.

- Owns: `packages/sync/src` (the exchange and the contract's new `parts`),
  `packages/guard/src/sync.ts` after the laws note's WP1,
  `test/readerSlices.test.ts`, and the guest's clause of the plan's "done
  when" in `examples/sync`.
- Done when: a guest replica never receives the owner's part, asserted on
  the bytes of every frame; an operation touching a part its sender cannot
  read is refused by id; a durable Message whose replay over a slice
  differs from the full replay cut to that slice is refused at commit, with
  the part named; a principal whose access changes gets a `reset`.

**D4. Journal Stories.** After D2.

- Owns: a new `packages/sync/src/testing.ts` and its export in
  `package.json` (then `pnpm --filter foldkit-plus generate` and
  `pnpm paths`); `packages/sync/test/serverMessages.test.ts` rewritten on
  it, which is its first consumer.
- Done when: `serverMessages.test.ts` holds no hand-built journal; a story
  runs with no server and no socket; a wrong expected refusal fails with
  both refusals printed.

### Group E: interaction and components

**E1. `Reorder`.** Default (a published API's shape, and who owns the
accessible name).

- Owns: a new `packages/primitives/src/interaction/reorder.ts`, a new
  `packages/mixins/src/behaviors/reorder.ts`; browser and touch tests; one
  adopter, `examples/foldkit/kanban` or the form's array input (pick the
  one whose own code it deletes).
- Done when: a drag and the keyboard path (Space, arrows, Space; Escape
  restores) report one `Moved { from, to }`; the place is worked out on
  release, from the layout then; the adopter's own reorder code is gone.
  The grid's columns and the rich text handle move onto it in follow-ups
  of their own, each only if it deletes code.

**E2. The grid's leftovers (#144).** Sonnet.

- Owns: `packages/data-grid/src/clipboard.ts`, `fill.ts`, `columns.ts`;
  the copy listener in `packages/mixins-data-grid/src/view.ts`;
  `examples/data-grid`.
- Done when: the three shapes of `144-grid-leftovers-DESIGN.md` §5.1, §5.4
  and §5.5 are built as written there; a browser test reads `text/html`
  from a real copy event and finds the cells escaped; a date lane crossing
  a month end and a leap day continues; a custom series that returns fewer
  cells than asked is refused, not padded.

**E3. Bundle shorthands.** Default for the design, Sonnet to build.

- Owns: `packages/bundle/src` (`link.ts`, the assembly), tests, the README's
  "A union Model" section; the `examples/foldkit` port that wrote the union
  Link by hand.
- Done when: the port's hand-written `Link.make` over its union is one
  call; an assembly yields its parent Model Schema and Message union, and
  an example that declared them by hand deletes the declaration.

### Group F: Entity and Surface

**F1. Operators and two type queries.** Sonnet, with an independent review
of each operator's stated semantics. After the laws note's WP2, which owns
`write.ts`.

- Owns: a new `packages/entity/src/num.ts`; `text.ts`; `operators.ts`,
  `memoryTable.ts`; the operator compilers in `packages/remote-drizzle/src`;
  the conformance suites; `examples/entity` as the caller.
- Done when: each operator has its semantics stated per §6.0.1 and passes
  conformance on memory, SQLite and Postgres (PGlite, and the
  `postgres-locale` job for any that compares text); `WritesOf<W>` and
  `OwnerOf<F>` have positive and `@ts-expect-error` cases; the entity
  project's instantiations are reported against 694,493.

**F2. A `Derived` in `Projection.struct`.** Sonnet.

- Owns: `packages/surface/src/projection.ts`, its tests and type tests.
- Done when: a struct holding a `Derived` reads the memoized value, plans
  nothing for it, and a Surface over it validates; two transitions show the
  memo hits.

### Group G: security-sensitive

Default model and an independent review for each.

**G1. Private media variants.**

- Owns: `packages/media/src/server` (a second route), the `Provider`'s
  private variant, tests on workerd; `docs` for media access.
- Done when: a variant of a private `Asset` answers only a principal who
  may Read the row with that hash, as `Cache-Control: private`; public
  variants keep their caching and their URLs; a revoked reader is refused
  on the next request.

**G2. The 415, and `peerId` from the principal.**

- Owns: `serveFetch` in `packages/remote-server/src`;
  `Sync.presence.serve` in `packages/sync/src` (not a file D2 or D3 owns:
  check, and go after them if it is).
- Done when: a non-JSON body is a 415 before anything is read; a host that
  gives a principal resolver gets each peer's id from the principal's key
  and passes no `peerId`; the
  two "verify first" auth items are confirmed built or built here.

**G3. A content security policy.** After C2 (`packages/ssr/src`).

- Owns: `SSR.entry`'s options and the document writer in
  `packages/ssr/src`; `examples/reference` as the host.
- Done when: the reference app serves a policy with a hash for each inline
  block and a nonce per request, no `unsafe-inline`, and its e2e logs no
  violation; a page rendered twice carries two nonces; a kept page is never
  served with another request's nonce.

### Group H: testing

**H1. `stack.signUp`, `stack.signIn`.** Sonnet.

- Owns: `packages/plus/src/testing/workers.ts`; the reference and auth e2e
  files, which drop their own helpers.

### Group I: larger programs

Each has a design note already; this note only removes the gate.

**I1. Internationalization**, in `i18n-DESIGN.md`'s order: the locale in
the Model and the route in `examples/cms` with a second language;
`LocaleFormat` in `foldkit-entity/locale`; word tables; S9's localized
pages. Default for each API. It touches `packages/site/src`, so it goes
after C3.

**I2. A review state in the CMS workflow.** Default for the design. Owns
`packages/cms/src` and `examples/cms`'s editor; after I1's first step if
both edit the editor.

### Order

1. In parallel now, disjoint: A1, A2, B1, B2, C1, E2, F2, H1.
2. Then: C2, E1, G1, B3; A3 and F1 once the laws note's WP3 and WP2 land.
3. Then: A4, C3, C4, G3, E3; Group D once #190's follow-ups and the laws
   note's WP5 and WP6 land; G2 beside or after D.
4. Last: I1, I2.

## 4. Shapes decided

All **planned**: none exists, and none was type-checked. Each package reads
the source before it fixes a signature.

**A1.**

```ts
// planned
reaches(write, query): Reach          // exported from foldkit-remote
type Reach = TaggedUnion<{ Reads: {}; Unaffected: {}; Unknown: { why: 'NoBody' | 'Handler' } }>
```

`write` is a declared `Write` or a Mutation built on one; `query` is a
Remote Query descriptor. Members are compared by owner identity. A body's
reads are its `fields` and its `reaches`, an exists' `where` included. It is
a tagged union, not the three strings of the 2026-11-10 sketch, so a caller
matches on it.

**A2.** `RemoteData.all({ a, b })` takes a struct and answers one
`RemoteData` of the struct of values. The first of these that any entry is
decides the result: `Failed`, then `NotFound`, then `Initial`, then
`Loading`. With every entry `Ready`, freshness is the worst among them
(`Stale`, then `Refreshing`, then `Fresh`). A view that wants another order
still nests `match`.

**A3.** `Data.wiring(actives, { policy, policies: { grid: … } })`.
`policies` is keyed by `keyof typeof actives`; a key it lacks falls back to
`policy`.

**B1.** `Recipes.Sheet({ motion: 'none' })` and the same axis on Dialog.
The duration is `ref.motion.sheet`, defaulting to `motion.slow` and still
multiplied by `travel`; an application sets it in its theme.

**B2.** The frozen module keeps a predicate as an import. So the rule is: a
`whenInput` predicate in a listed module is a named import from a module
that is not listed. The plugin evaluates the piece to class data and writes
`{ when: importedPredicate, classes }`.

**C1.** `visibleLinks({ atMost = 8, margin })` and
`pointedLinks({ rest = Duration.millis(50) })`, both `Stream<Url>`.

**D2.** The contract declares
`server: { state: Schema, initial, reduce(state, message, shared) }`.
`reduce` runs for server-only Messages alone.

**D3, and Q13.** Q13 asked whether an `update` reading a part a reader lacks
can be checked. It can, at commit, by the comparison the laws note's D3
makes at dispatch: for each declared part, replay the operation over the
snapshot with that part withheld and compare with the full replay cut the
same way. The cost is one more `reduce` per declared part per commit, which
the note measures. A static derivation is not attempted.

**C4.** Build the streamed first screen if the probe's page gains 50 ms of
first contentful paint, the bar #427 used. If streaming needs upstream to
adopt a subtree without reading it, the item moves to the upstream list
with the probe's numbers.

## 5. GitHub actions

For the maintainer or the coordinator; nothing is posted by this note.

**Reopen, with a comment:**

- **#439**, retitled "Remote: `reaches(write, query)`, and `explain` naming
  the writes that reach a list". Comment: "Reopened under AGENTS.md's
  'Scope: build the feature': R1 was closed for want of a consumer, and its
  tests and `explain` are one. R2 (a version per Entity) stays not built on
  its measurement, 0.1 ms per write on the largest page; R1's change adds
  the ten-list case to `read.bench.ts`. Plan:
  `docs/design/decisions-2026-11-12-build-deferred.md`, A1."
- **#438**, retitled "Load a route's `Bundle.lazy` chunk from the Site
  tree". Comment: "Reopened: C1 and C2 were gated on an existing example
  gaining 20 KB, which is a consumer test. They are built with a lazy page
  in `examples/auth`. Splitting the CMS studio stays declined at 2.0 KB.
  Plan: the same note, C2."

**Comment, no state change:**

- **#190** (open): "Phase 5 no longer stops after the follow-ups. Items 3
  (server-only state), 4 (reader slices) and 8 (Journal Stories) are built
  after them, and `prune(through)` joins follow-up 2. Q13 is answered: the
  slice is checked at commit by replaying with each part withheld. Item 7
  stays with the process runtime the application runs, shown as a recipe.
  Plan: `docs/design/decisions-2026-11-12-build-deferred.md`, group D."
- **#480** (open): "The row revision is no longer declined: it is filed as
  its own issue and built with `foldkit-remote-drizzle` as the first
  Source. This issue still closes on the out-of-order e2e."

**File new** (closed-as-completed issues are not reopened for a new part):

1. mixins-ui: `motion: 'none'` on Dialog and Sheet, a `motion.sheet`
   duration, and Dialog's optional pieces (from #424). B1.
2. mixins: `whenInput` in a build-evaluated style module (from #420). B2.
3. mixins: `Style.fontFace` and animation orchestration. B3.
4. remote: `RemoteData.all` (from #481). A2.
5. remote: `policies` per active Surface on `Data.wiring` (from #236). A3.
6. remote: a row revision on read answers (from #480). A4.
7. primitives, site: `visibleLinks`, and `pointedLinks` options with a
   per-link opt-out (from #227, #236). C1.
8. site: nested route nodes. C3.
9. ssr: first screen first, probed on a page with a slow read (from #427).
   C4.
10. sync: server-only state. D2.
11. sync: reader slices. D3.
12. sync: `foldkit-sync/testing`, Journal Stories. D4.
13. primitives, mixins: a `Reorder` Behavior. E1.
14. data-grid: copy as HTML, date and custom fill series (from #144). E2.
15. bundle: a union Link helper, and a parent derived from an assembly. E3.
16. entity: `Num` and `Text` operators, `WritesOf` and `OwnerOf` (from
    #478, #479). F1.
17. surface: a `Derived` in `Projection.struct` (from #483). F2.
18. media: private variants through a guarded route. G1.
19. remote-server, sync: a 415 for a non-JSON body; Presence's `peerId`
    from the principal. G2.
20. ssr: a content security policy from `SSR.entry`. G3.
21. plus: `stack.signUp` and `stack.signIn` (from #239). H1.
22. i18n: tracker for I1's four steps.
23. cms: a review state in the workflow. I2.

**Leave closed:** #420, #424, #429, #430 (open, upstream), #471, #472,
#427, #440, #64, #483, #235, #236, #227, #144, #239, #253.

## 6. Lines this makes wrong elsewhere

Edited with this note: `TODO.md` and `docs/design/TODO.md`. Reported and not
edited, since other design notes are not this note's to change:

- `decisions-2026-11-12-data-platform.md`: #439's "Close as not planned" and
  "What reopens each half"; #190's "After those, Phase 5 stops until
  something asks" and "`prune(through)`... not in scope"; #480's "The row
  revision" paragraph.
- `decisions-2026-11-12-ui.md`: "The motion items stay out."
- `decisions-2026-11-12-ssr-styling.md`: #420's "Phase 2 stays not
  planned"; #429's third reopen condition.
- `377-439-440-remote-data-plane-DESIGN.md`: decision 4 and phase 3.
- `420-424-429-430-styling-platform-DESIGN.md`: phase 2, and decision 5's
  last two sentences.
- `235-236-438-site-host-DESIGN.md`: decisions 1 (its last sentence), 3
  and 6.
- `227-preload-on-intent-DESIGN.md`: three of its Deferred items.
- `capability-matrix-DESIGN.md`: gaps 2 and 3.
- `478-479-483-185-64-expr-contracts-DESIGN.md`: decisions 4 and 7, and
  `WritesOf` and `OwnerOf` in §3.2.
- `481-async-composition-DESIGN.md`: "Add one when an application asks."
- `144-grid-leftovers-DESIGN.md`: three verdicts of its §1.
- `media-access-DESIGN.md`: decision 3.
- `contract-layer-PLAN.md` §6.5: items 3, 4 and 8, and Q13.
- `performance-PLAN.md:419`: #439's line.
