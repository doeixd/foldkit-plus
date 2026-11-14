# TODO

The operating plan for working on this repository autonomously, from
2026-11-09. It says how an item is chosen, researched, designed, built,
reviewed and finished, and it holds the current queue.

It does not replace the two trackers that already exist:

- **[`docs/design/TODO.md`](./docs/design/TODO.md)** is the backlog. It lists
  every open item, each tied to the design note it comes from. Its header says
  it was checked on 2026-09-27, so verify an item before trusting it.
- **GitHub issues** hold reports, measurements and decisions.

This file says what to do next and how. When an item closes, update all three
in the same change.

## The loop, for every item

Each step has a gate. Do not start the next step until the gate holds.

### 1. Verify the item is still open

- Read the issue's latest comments, the backlog entry, and the design note's
  status line.
- Read the code those name. Search the whole space a claim covers: issues have
  turned out half-built, and #188 turned out built.
- **Gate:** one sentence saying what is built and what is not, each half
  backed by a file or a commit. If the item is done, record that (step 9) and
  pick the next one.

### 2. Research

- Read the owning package's README and its skill reference
  (`skills/foldkit-plus/references/<family>.md`), then the source of every
  API you will touch or call. Read source, not memory: Effect 4.1, Foldkit
  0.170 and Drizzle 1.0 rc all differ from what is remembered.
- Probe library behaviour in a scratch test run from the package's own
  directory before building on it (see the trap list in `AGENTS.md`).
- For a performance claim, measure the current state first, with the
  repository's harness where one exists.
- Look for prior art in the repository: `docs/design/`, `docs/*.md`, and the
  examples that already solve a neighbouring problem.
- **Gate:** the questions the design must answer are written down, each with
  its evidence or marked unknown.

### 3. Design

Write a design note (`docs/design/<issue>-<topic>-DESIGN.md`) when the change
does any of these:

- adds, removes or reshapes a published export;
- crosses two packages' contracts;
- touches authorization, identity, the wire or caching across principals;
- or offers more than one reasonable shape.

Otherwise a paragraph in the issue is enough.

A note states:

- the problem, with its evidence;
- who owns the fact or transition, and what the change does not own;
- the options considered and why each was rejected;
- the chosen shape, as compiling code;
- its failure semantics;
- its migration, with a deprecation for one release where something public
  goes;
- and what it leaves out.

Check it against "Considerations" below. A guide or README never links a
design note (`guides.test.ts` refuses it).

**Gate:** an independent review of the note (step 7's reviewer) finds no
blocking issue.

### 4. Build in small commits

- One coherent unit per commit, with explicit paths (`git commit -- <paths>`).
- Follow `AGENTS.md`'s git rules: no `add -A`, stash, reset, amend or force.
- Prefer deleting code to adding it.
- Branch on tagged unions through their `match`.
- Represent absent values with `Option`, not `null` or `undefined`.
- Write Model changes in `update` with `modifyFields`.

### 5. Test, and prove each test can fail

- Test behaviour, not a restatement of the code.
- Write `@ts-expect-error` negative cases for every type constraint.
- A claim about focus, layout or the pointer is a browser test. A claim about
  server markup renders to a string and parses it back.
- Declare a mutation spec beside the tests and run `pnpm mutate <spec>`: each
  mutation is killed, or says why it survives. Check what killed it, because
  a `ReferenceError` is not a kill.
- **Gate:** the suite is green and every mutation is accounted for.

### 6. Run the CI sequence locally

Run, in order:

1. format your own files with `pnpm exec oxfmt <paths>`, then `pnpm format:check`;
2. `pnpm typecheck` (or `typecheck:force` when another project is red);
3. the tests of the packages and examples touched (`--project unit`, and
   `--project browser --fsModuleCache=false`);
4. `pnpm mutate:check`;
5. `pnpm tags:check`;
6. `pnpm e2e` when an example with a server is reached.

Browser tests here need `PLAYWRIGHT_BROWSERS_PATH` pointed at a Chromium of
build 1248. The one in `/opt/pw-browsers` is 1243.

### 7. Review

Re-read every committed diff against `AGENTS.md`'s review list: correctness,
edge cases, synergy, types, comments, tests, security, performance, and the
de-slop list. Fix what it finds in a follow-up commit.

Then add an independent review for:

- a published API's shape;
- security-sensitive code;
- a change across packages' contracts;
- a design note.

That reviewer is a subagent on the most capable model. It gets the diff and the
relevant files, not my conclusion, and it is asked for blocking findings first.

Jev: run `npx jev-pref review --hunks --include <file>` (repeating
`--include` per file) on published API changes. While `TYPESAFE_API_KEY` is
unset it cannot run. Say so in the commit message, never treat that as
approval, and lean harder on the independent review.

**Gate:** no blocking finding is left open.

### 8. Document

In the same change:

- the README, read once as a newcomer against `AGENTS.md`'s checklist;
- the skill reference, with every snippet compiled in a temporary `*.test-d.ts`
  (`examples/kitchen-sink` maps every package);
- `CHANGELOG.md` under Unreleased, adding the heading if it is missing;
- a trap in `AGENTS.md` for any lesson that cost real time.

### 9. Record and push

- Delete the backlog entry (git keeps it) and update the design note's status.
- Comment on the issue with what was built, the commits and what is left.
- Push to `ccr-dfcc253e-4x8hum`.
- Leave a fixed issue open until the branch merges, and list it in "Waiting on
  the maintainer" below.
- Delete scratch files, and stop any server started.

## Considerations, for every design

- **Ownership.** Name the one owner of each fact and transition. A cache, a
  mirror, a setter or an adapter is not an owner, so add no second source of
  truth.
- **Declare once.** Derive from the Entity, Query or Schema rather than
  restating it. Where a name must be given, take a typed reference, not a
  string (#251).
- **Failure.** Every fallback, refusal or swallowed defect is a typed
  diagnostic on the channel (#237). A quiet default is a defect.
- **Security.** Untrusted input is decoded before use, strictly
  (`onExcessProperty: 'error'`). A client-chosen name is never an object key
  without `Object.hasOwn`. Bound every client-shaped size where it is decoded.
  A UI affordance is never authorization.
- **SSR and hydration.** Server markup must be what a parser builds from it.
  Nothing server-only reaches the browser bundle. Read the bundle report
  after adding an import.
- **Accessibility.** Native semantics first. Check keyboard, focus and
  screen-reader names in a browser, and touch in the `browser-touch` project.
- **Styling.** Values come from tokens, through `Theme.ref`. Markup a stylist
  must reach goes in a Slot.
- **Performance.** Do work once at definition time. Avoid a lookup inside a
  loop. Keep a no-op returning the Model it was given. Measure before
  claiming.
- **Types and DX.** Inference works at the call site. Errors land at the
  mistake. No `any` from a generic, and no cast in a test.
- **Compatibility.** Published packages follow semver: deprecate for a
  release, then remove. A breaking change gets a changelog entry saying what
  to write instead.

## What I decide, and what waits

- **I decide** the design, scope, order and trade-offs within the
  repository, following the rules above, and I record each decision in the
  note or the issue.
- **Waits on the maintainer:** opening a PR or merging; posting outside this
  repository (Foldkit, Effect, Drizzle); publishing a release; anything
  needing a credential this session lacks (Jev's key, Cloudflare). Record
  these below and carry on with the next item.
- **Stop and ask** only when an item needs one of those to proceed and
  nothing else in the queue can move, or after three review-and-fix rounds
  that do not converge.

## Waiting on the maintainer

- [x] Decisions on the six design notes: made 2026-11-10 by delegation (each
      note's Decisions section).
- [ ] **Upstream posts:**
  - a comment on foldkit#1657 asking for P1 and offering the PR (shortened
    draft ready; the workerd reading is in `docs/design/performance-PLAN.md`);
  - a comment on foldkit#1872 per the renderer note, after reading the
    issue's state;
  - the `fetch(request, env, ctx)` ask (proposal 8 of
    `docs/upstream-foldkit-ssr.md`);
  - the styling request, after its phase 0 measurement;
  - the SSR delivery note's two conditional drafts (assets to `renderPage`,
    adopting a subtree without reading it), each when its condition is met;
  - the animation-settle issue (draft written; item 9 of the Order list in
    `docs/upstream-foldkit-ssr.md`);
  - a comment on foldkit#1448 that `SSR.headed` now carries the head here.
- [x] **GitHub actions the notes list:** done 2026-11-10 on the maintainer's
      go-ahead. #185, #64, #483 and #440 closed; the narrowed issues retitled
      and commented; park comments on #376, #433, #148, #149 and a comment on
      #474; the two Bundle.lazy bugs filed as #501 and #502.
- [ ] **Release 0.40.0 is prepared, not tagged** (db24769e, 58aa1412, b5e1d029):
      35 packages one minor up, `foldkit-host` at 0.2.0 and marked Published in
      `docs/releases.md`. Once it is on `main`: `git tag v0.40.0 b5e1d0290 &&
      git push origin v0.40.0` runs `release.yml`, which publishes when
      `NPM_TOKEN` is set and makes the GitHub release from `## 0.40.0`. Still
      deprecated and not removed, though 0.39.0's notes said the next release
      would: `editsJournal`'s `absorbed` and `server`, and the `saved` inputs
      of `foldkit-mixins-form` and `foldkit-crud`.
- [x] **Decisions on the laws and Alchemy notes, made 2026-11-12 by
      delegation:** raise the workspace's Effect to 4.1.4 (A-WP1 does it, and
      the lockfile, the skill's "tested on" line and `packages/plus/src/setup.ts`
      with it); ship `foldkit-remote-domain` as Early while Domain is a beta.
- [ ] **Upstream reports to file at alchemy-run/alchemy** (a cloud session may
      not post them; §10 of `docs/design/544-547-alchemy-DESIGN.md` has the
      detail):
  - a `commandId` reused by another principal returns the first caller's
    receipt and skips `decide`, which discloses one caller's reply to another
    who can address the same aggregate;
  - an `atLeast` read through the Api has no timeout;
  - a snapshot carries no stream version, so a client cannot compare it with a
    receipt.
- [ ] **`TYPESAFE_API_KEY`**, so the Jev review can run. It is owed on:
  - #497's public API: `SSR.headed`, `RootRefusesHead`, the exported SSR
    diagnostic types, `Button.view`'s `attributes`, the resolver's class
    merge;
  - #495's: `helpers` as a function of the args, `Bundle.helpersOf`, the
    primitives' helpers, the Builder's `RowPressed`, `RowToggled` and
    `Copied`, and `LiveAnnounce.say` removed;
  - `foldkit-remote`'s `Defect` error tag (ce1d99d);
  - #144's checkbox column: `Columns.checkbox`, `CellEditor.Checkbox`,
    `EditToggled` with `Grid.Toggle`, and the `checkbox` Slot
    (34109eab..a9bbe3dd; independent review passed in two rounds);
  - #190 item 5: `SyncRefusal`, `Rejection.refusal`, `Exchange.refusals`,
    the `UnknownRefusal` diagnostic, and `Rejection.reason` and
    `Exchange.reasons` deprecated (7da2abad..4f1493a8);
  - #190 upcasting: `Sync.migrations`, the branded `WrittenOperation`,
    `status.refused` and `replica.dismiss`, `Rejection.message`, three new
    errors, and Durable's codec `compared` (d8f9c666..339f1fa9);
  - `Expr.in` over a null list now reads as unknown (482c0783);
  - #144's column filters: `ColumnSpec.filter`, `ColumnFilter`, `Filters`,
    `FilterChange`, `Grid.keeps`/`setFilter`/`noFilters`, `Out.Filtered`
    (only on a grid that filters), and the editor classifier change
    (bddd2372..59bf7a06; independent review passed in two rounds). Every
    grid carries about 4 kB brotli of filter code; splitting it out is an
    API change to decide before 1.0;
  - the form's submit drawn `aria-disabled`, never natively disabled, with
    the form option `submitWaits: false` to refuse a submit mid-check, and
    `saved` deprecated (9513fd20..689d7a28; independent review passed in two
    rounds).
- [x] **The branch's PR:** #503 merged on 2026-11-12 (485d44bb) with every CI job
      green; its first run caught one CI-only fault, fixed in cafb5fc6. It closed
      #495, #481, #482, #230, #236, #500, #479, #478, #498, #499, #501, #502,
      #435, #432, #438 and #235. #230's version stamps still wait for the next
      release. domains-plus's client JS has 1.0 kB of headroom (192.5 of
      193.5 kB).

## The queue

In order. Every item runs the loop above. Built on the branch and off the
queue (details in `docs/design/TODO.md`): #500, #501/#502, #478's `step`,
#498/#499 and Remote's `writing`, #420 phase 1 (build-time style modules),
renderer phases 0a and 0b, SSR delivery phases 0 to 2 (the loader, opt-in;
fetching at `load` did not pass decision 5 either: a press at `load` 1,194 ms
against 312, the cost being evaluation), Site and host D1, H1, H3 and H2
(`foldkit-host`, checked on workerd: fe52bf3), the Switch's thumb drag
(c3a6db7..d61b307), `serveFetch`'s refusal drain (563d53d), #432's spike
(not kept: boot 7 ms faster in one run, 96 slower in the other; 1a4b05a),
and Site Phase 0 (no non-landing route alone imports over 2 KB against the
20 KB bar, so C1 to C3 are not built and #438 closes: 24474ee), H4 not
due (3 to 5 shared lines against 30) with auth and cloudflare moved onto the
host parts instead, so #235 closes on the parts (cloudflare's per-binding
auth: 8ed9094; auth on `Host.node`: 2d35f11), and `SSR.unbound` for a
Slot's attributes in a static region (0887cf3), and the tag rules' gaps (else-if chains, the
if/return pair, negated, loose and bracketed tags) with every dodge the
review found matched (373215ee..0d6a06b8). `RemoteData.held` replaces
the three copies of the held-value helper (dea8fa61..edee1a04; a CMS save
or publish after a failed refresh is now based on the kept value, 4d22c234).

1. **Triage of `docs/design/TODO.md`** for open items buildable now, with
   no upstream gate (the 90 KB page waits on Foldkit's identity markers;
   Chirp's JSON Schema extra left with 6ade70b). Drained 2026-11-11: the
   last ungated items were #229's budgets for every remaining example
   (ab26dd79, 2eedd82f, 4801c950) and the CMS demo's `404.html` (ff2a155d).
   What remains waits on upstream, a deploy, a release or the owner.
2. **The UI polish leftovers** in `docs/design/TODO.md`: all wait on
   `@foldkit/ui` (foldkit/foldkit#1686 to #1689).
3. **Build what was deferred for want of a consumer** (`AGENTS.md`, "Scope:
   build the feature"). Thirty items are un-deferred and not yet built, #439's `reaches` and
   #438's route code among them, in work packages with disjoint files;
   what stays deferred has a measured, upstream, unsound or ownership
   reason beside it. First, in parallel: A1, A2, B1, B2, C1, E2, F2, H1.
   [decisions-2026-11-12-build-deferred.md](./docs/design/decisions-2026-11-12-build-deferred.md)
4. **Laws on every state owner** (#541 and its parts #533 to #540, #542,
   #543), fifteen work packages. Built on the branch: WP1, WP5, WP8a (wave 1), WP2,
   WP3, WP4 (all but `sell.walk.test.ts`, which waited on WP2), WP6, WP13 (wave 2,
   PR #559). The rest: not started. "After"
   names the packages that land first; models are the note's.
   [541-laws-DESIGN.md](./docs/design/541-laws-DESIGN.md) §9
   - WP1 descriptors: invariants on the identity, a bare guarded descriptor
     refused (#539). Default. After: none.
   - WP2 refinements, the enumerator, `Laws.check`, `Footprint` (#535, #536,
     #543.4). Default. After: 1.
   - WP3 `Data.can` (#533). Sonnet. After: 1.
   - WP4 `Walk.run`, `Walk.states` (#538, #543.2). Sonnet. After: 1; its
     example half after 2.
   - WP5 `Closure`, and the closure check in `Sync.mount` (#543.1). Sonnet.
     After: the sessions now in `packages/sync`.
   - WP6 a document's laws (#534). Default. After: 5, and the session now in
     `packages/durable`.
   - WP7 a form over the held row (#542, #543.3). Default. After: 2, 3.
   - WP8 the guide (#540). Sonnet. After: 8a any time, 8b last.
   - WP9 Agent `applies`, `Data.capability`, `Data.available` (#533).
     Default. After: 3.
   - WP10 `becomes` enforced where the write commits (#535). Default. After:
     2, 3, A-WP2a.
   - WP11 `Evidence` and its three producers (#537). Default. After: 2, 4.
   - WP12 `Scenario`, shared with item 5 (#538). Sonnet. After: 2, 4, 11.
   - WP13 a closed Surface (#543.5). Sonnet. After: 5.
   - WP14 the graph: facts, `Module.graph`, the three rules, the renderers
     (#537). Default. After: 6, 11, 13.
   - WP15 `foldkit-plus laws` (#536). Sonnet. After: 2.
5. **`@alchemy.run/domain` as a second authority** (#544 to #547), work
   packages A-WP1 to A-WP11. Built: A-WP1 (Effect 4.1.4, merged in #550), A-WP2a and
   A-WP3 (PR #559). The rest: not started. A-WP6 repeats
   in small after each of A-WP7 to A-WP11.
   [544-547-alchemy-DESIGN.md](./docs/design/544-547-alchemy-DESIGN.md) §8
   - A-WP1 the package skeleton, Domain installed, the probe as a test
     (groundwork for #544 to #547; raises the workspace's Effect to 4.1.4).
     Sonnet. After: none; it alone holds the lockfile.
   - A-WP2a `RemoteServer.memoryWriter` (#545). Default. After: A-WP1.
   - A-WP2b lower `ReserveStock` (#545). Default. After: A-WP1, A-WP2a.
   - A-WP3 the receipt-aware adapter (#544). Default. After: A-WP1.
   - A-WP4 one scenario through three backends (#546). Sonnet. After: A-WP2b,
     A-WP3.
   - A-WP5 describe what was imported (#547). Sonnet. After: A-WP3; A-WP2b for
     the `Derived` case.
   - A-WP6 README, skill, changelog. Sonnet. After: A-WP2a to A-WP5.
   - A-WP7 row revisions and read-after tokens on Remote's wire (#544, #480's
     open item). Default. After: A-WP4, and laws WP3 and WP4.
   - A-WP8 lists and relations. Default design step. After: A-WP7.
   - A-WP9 first paint from a server render. Default. After: A-WP7.
   - A-WP10 a Domain model as a client-test fixture. Sonnet. After: A-WP3.
   - A-WP11 one trace, and the HTTP protocol. Sonnet. After: A-WP3.

   **File order across items 4 and 5.** Both notes require it; the laws note's
   §9 and the Alchemy note's §8 hold the detail.
   - `packages/remote-server/src/index.ts` and
     `packages/remote-drizzle/src/index.ts`: A-WP2a, then laws WP10, then
     A-WP7. `packages/remote-server/src/memoryWriter.ts` is A-WP2a's; WP10
     adds `postconditions` to it after A-WP2a lands.
   - `examples/writes/package.json` is A-WP1's. No laws package edits it.
   - `packages/remote/src`: A-WP7 owns `wire.ts`, `model.ts`, `client.ts`,
     `store.ts`, `plan.ts`, `inspect.ts` and `whyReasons.ts`; laws WP3, WP4,
     WP9 to WP12 and WP14 edit other files.
   - `Scenario`: laws WP12 owns the type. If A-WP4 is ready first it ships its
     local `WriteScenario` in D25's shape, and WP12 deletes it. `Footprint`:
     laws WP2 owns the type, and A-WP5 uses it.
6. **UI authoring** (#551 to #558): assembly from existing contracts,
   accessibility obligations, focus recovery, one keyboard owner, Presence
   with interaction and recovery, inspection, agent parts, and the UI SDK
   audit. Work packages U-WP1 to U-WP12 (with U-WP1b and U-WP3b). Status
   of every one: not started.
   First, in parallel: U-WP1, U-WP8, U-WP11.
   [551-558-ui-authoring-DESIGN.md](./docs/design/551-558-ui-authoring-DESIGN.md) §12
   - U-WP1 attachments a view remembers, contributors named in conflicts,
     `SlotView.over`, and #531 (#556, #551, #554). Default. After: none.
   - U-WP1b every Behavior factory takes the binder where it takes the
     slots (#551). Sonnet. After: U-WP1; before U-WP3b, U-WP5 and U-WP12.
   - U-WP2 `SlotView.describe` and `SlotView.resolution` (#556). Sonnet.
     After: U-WP1.
   - U-WP3 `Behaviors.Keys`, one `keydown` owner from named routes (#554).
     Default. After: U-WP1.
   - U-WP3b the primitives' routes, and `DismissLayer` yielding to a handled
     Escape (#554). Sonnet. After: U-WP3, U-WP1b.
   - U-WP4 obligations on `A11y.pattern`, `provides`, `A11y.conform` (#552).
     Default. After: U-WP1; its six `provides` lines after U-WP3b.
   - U-WP5 `FocusRecovery`, and `FollowTabStop` scoped to its owner (#553).
     Sonnet. After: U-WP1, U-WP3b.
   - U-WP6 `Presence.behavior`: exiting content inert, focus moved once
     (#555). Sonnet. After: U-WP5.
   - U-WP7 `Conformance`: rendered scenarios for listbox, checkbox, tree,
     dialog and tabs (#552, #558). Sonnet. After: U-WP4; U-WP3b for the
     nested-layer case.
   - U-WP8 `Agent.part` and `runtime.parts` (#557). Default. After: none.
   - U-WP9 `examples/authoring`, with the Save fixture and the type-cost
     comparison (#551, #556, #557). Sonnet. After: U-WP2, U-WP3b, U-WP6,
     U-WP8.
   - U-WP10 the guide, the skill references, the READMEs (#551, #558).
     Sonnet. After: all but U-WP11 and U-WP12.
   - U-WP11 the audit of reorder, overlays and virtual lists, recorded as
     browser scenarios and a findings note (#558). Sonnet. After: none.
   - U-WP12 `Reorder`, the keyboard path beside `PointerDrag` (#558).
     Default. After: U-WP11, U-WP3b.

   **File order within item 6** (the note's §12 holds the detail):
   `packages/mixins/src/behavior.ts` and `slotView.ts` are U-WP1's, then
   U-WP4's; `packages/mixins-surface/src/surfaceView.ts` U-WP1's, then
   U-WP2's; the factories' signatures in
   `packages/primitives/src/interaction` and `packages/mixins/src/behaviors`
   U-WP1b's first, and `tree-navigation.ts` then U-WP3b's, then U-WP5's. `packages/agent/src/expose.ts` and `runtime.ts`
   are shared with laws WP9: whichever starts second builds on the first.
   Nothing in item 6 touches `packages/remote`, `entity`, `sync` or `guard`.

Waiting on the owner: the upstream posts (foldkit#1657, #1872, the Workers `fetch` signature, the
identity markers, floating-ui), the three alchemy-run/alchemy reports, and the Jev reviews (no key here).

## Parked

- **#474:** a new search is ahead of stock Foldkit locally (198 against 260
  ms at 1x). What is left is the live three-way benchmark against the
  deployed Workers, which needs a deploy and the Cloudflare login; decided by
  #426's run (decisions-2026-11-12-performance.md).
- **#413:** our half is done (page 362 to 69 KB, parse5 175 to 41 ms; workerd
  125 to 150 ms warm). The rest waits on foldkit#1657.
- **#190** (the contract layer): Phase 0 items 6 and 7 done 2026-11-11 (the
  upcasting note, reviewed in three rounds: 0a185be1..13bd41fd; document
  boundaries in `docs/replication.md`: 71855f3f). Item 5 done too: a Sync
  rejection carries a typed `SyncRefusal` (7da2abad..4f1493a8, reviewed in
  three rounds). The next release removes `Rejection.reason` and stops
  `journalExchange` writing `reasons`; the replica keeps reading `reasons`.
  Phase 5 item 6, upcasting, is built (d8f9c666..339f1fa9, reviewed in two
  rounds). Phase 0's canary spike is recorded in the plan's §8 (6250722e):
  the canary breaks today's workspace, so Phase 1 migrates in dependency
  order, and Sync needs an upstream hook to wrap the root `update`.
  Phase 1 waits on foldkit/foldkit#1655.
  Phase 5 items 1 and 2 (server-only Messages, reactions) are built on the
  branch (23266628..). Follow-ups: prune the `replicas` rows each reaction
  append and each `appendAsServer` key leave, which neither compaction nor
  reset deletes. Follow-ups, in order:
  1. the editing guide off the deprecated `editsJournal` options;
  2. bind nothing under `server/` (the note's §10);
  3. `settleTodos` onto `journal.cursors`;
  4. the sync example's effects as a reaction, with the plan's "done when"
     example;
  5. remove the deprecated options in the release after 0.39.0.

  Phase 5 does not stop after these: `prune(through)` joins step 2, and
  items 3 (server-only state), 4 (reader slices) and 8 (Journal Stories)
  follow (decisions-2026-11-12-build-deferred.md, group D).
