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

- Tick the backlog entry and update the design note's status.
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

- [ ] **The branch.** `ccr-dfcc253e-4x8hum` holds 44 commits CI has never
      run, because CI runs on `main` and pull requests only. It needs a PR,
      and CI watched to green.
- [ ] **On merge, close what the branch fixed:** #400 (Menu and Menubar),
      #431, #437, #467, #477, #484, #485, #487, #489, #251, #259.
- [ ] **Upstream posts:**
  - the animation-settle issue (draft written; item 9 of the Order list in
    `docs/upstream-foldkit-ssr.md`);
  - Proposal 7, a comment on foldkit#1657.
- [ ] **`TYPESAFE_API_KEY`**, so the Jev review can run.

## The queue

In order. Every item runs the loop above. The notes give each item's research
questions, the decisions it must make and its done-when.

### 1. Correct the record: done 2026-11-09

- #188 closed. Its leftovers are #491 (`busy` without `settled`), #492 (the
  picker's `more`) and #493 (a `file` recipe).
- #237 closed. Reading the compiled build id is Proposal 4 upstream.
- `docs/design/TODO.md`: all 81 open items checked against the code, 78 by
  four read-only subagents and Schema to UI's three by hand, each verdict that would tick or rewrite an item
  confirmed by hand. Ticked: position placement, styled-menu separators,
  Carousel dots, and the typed principal (not needed). Corrected: Phase 9
  packages, Phase 12's registry, and the mixins-ui adapter list. The rest are
  open or partial as written.

### 2. #251: the last name strings: done 2026-11-09

`docs/design/251-name-strings-DESIGN.md` records the decisions:

- The defect is a name nothing checks. Options typed by an Entity's or
  binding's keys stay, and no reference objects are added beside them.
- The revision stays a writer option. Declaring it on the Entity would turn
  pinning on for writers that do not pin today.
- No lint, because the strings in published types are mostly outputs. The
  rule went into `AGENTS.md`'s design list instead.
- The two free strings left, `applyEdits`' `revision` and `entity()`'s
  `computed` relation, are now typed.

The independent review found nothing blocking, and its advisories are fixed:
a widely typed `relations` no longer refuses every count, and `applyEdits`
keeps `P` as its first type parameter.

### 3. #259: the last exact rules: done 2026-11-09

`isInt`, `isStartingWith`, `isEndingWith` and `isIncluding` compile to CHECKs
(`packages/remote-drizzle/src/checks.ts`). The law test covers each on SQLite
and PGlite, including NUL, emoji, quotes and the values on either side of
2^53. That test found that SQLite's `substr` of an empty blob is NULL, which a
CHECK passes. The design note's status and its "Not done" list are updated,
including the foreign-key item, which #467 half-closed. Of the 41 mutations,
40 are killed. The 41st, `collate "C"`, survives with its reason: PGlite's
database is already binary.

The changelog says how to upgrade: `bind` refuses a migrated table until it
gains the new clauses.

### 4. Schema to UI: the remaining three

These are the child issues made in step 1.

- **`busy` without `settled` as a type error.** Research why a union of the
  two specs broke inference of `fill`, as recorded in the backlog; try a
  discriminated spec or overloads. Done when a negative type test fails
  without the change, and `fill` still infers.
- **A picker's `more` typed by relation keys.** Restrict `FormView`'s `more`
  to the keys whose control is a picker. Done when a key with no picker is a
  type error, tested both ways.
- **A `file` recipe.** It needs an upload route in `foldkit-media` that
  accepts any file. That is a security-sensitive design (content type,
  size bounds, storage keys, serving with `Content-Disposition` and no
  sniffing), so it needs a design note and the independent review before any
  code.

### 5. Remote: per-field fetch time

From the backlog section "Found by porting Foldkit's examples". (The typed
principal there turned out not needed, and is ticked.)

- **Per-field fetch time.** Under stale-while-revalidate, one `updatedAt` per
  entity makes an old field look fresh. Research what `plan` and `deadlineOf`
  read, and measure the Model's size cost before choosing a `writtenAt` per
  field.

### 6. mixins-ui: adapters still missing

Nav, DragAndDrop, Animation and VirtualList hand out attributes with no
adapter. Research each upstream module for a seam first. Where it has none,
fork its markup the way `menuView.ts` does, with the parity battery. Then
decide the order by which examples draw them.

Also decide whether to export a helper that applies `leaveDrawn` to Listbox,
Combobox and Popover Commands (#400's remainder), or to wait for upstream.

### Then

Re-rank by value to someone building an app, divided by cost, and write the
new order here before starting it. The sweep's candidates, from
`docs/design/TODO.md`:

- **"High: demonstrate strict FormView submit policy" (partial).** The option
  exists (`mixins-form`'s `canSubmit`), but no adopter passes it. The
  Enter-and-click-during-a-check tests and the reducer-side guard are
  missing.
- **"High for production SSR: dynamic host-head integration" (open).**
  `SSR.entry` still refuses head meta (`packages/ssr/src/index.ts`).
- **"A size budget in CI for each example's entry chunk" (partial).** Only
  domains-plus and server bundles have one; `scripts/bundle-report.mjs` can
  measure the rest.
- **"Remote: per-field fetch time" (open)**: step 5 above.
- **"Mixins-UI: adapters still missing" (partial)**: DragAndDrop and
  Animation adapters, and Fieldset and Disclosure recipes; step 6 above.
- **The UI polish leftovers (partial)**: RTL browser tests in only 32 of 120
  files, Switch thumb drag, the Calendar's RTL month buttons.

## Parked

- **Performance.** Resume for a regression or a new target.
  - #474: re-run solid-domains' live benchmark (`scripts/search-compare.mjs`
    has it ahead locally).
  - #413: a workerd reading, which needs `Stack.start` to run a Worker that
    Foldkit's Vite plugin generates. The rest waits on foldkit#1657.
  - #439: deferred in `docs/design/performance-PLAN.md`.
- **Large designs**, each needing a note and an owner decision before any
  code: #190 (the contract layer), #376 and #433 (a fine-grained runtime and
  compiled views), #432 (islands), #148 and #149 (other platforms).
