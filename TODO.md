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

- [ ] **Decisions on the six design notes of 2026-11-10** (about 62, each with
      a recommendation). The notes are listed at the top of
      [`docs/design/TODO.md`](./docs/design/TODO.md); nothing in them starts
      before its decisions are made.
- [ ] **Upstream posts:**
  - a comment on foldkit#1657 asking for P1 and offering the PR (shortened
    draft ready; the workerd reading is in `docs/design/performance-PLAN.md`);
  - the animation-settle issue (draft written; item 9 of the Order list in
    `docs/upstream-foldkit-ssr.md`);
  - a comment on foldkit#1448 that `SSR.headed` now carries the head here;
  - the asks the new notes recommend: renderer decision 9, SSR delivery
    decision 8, site and host decision 10, styling decision 12.
- [ ] **Closing issues the notes recommend closing:** #440, #185, #64, #483,
      and narrowing #435 and #439. Waits on those notes' decisions.
- [ ] **`TYPESAFE_API_KEY`**, so the Jev review can run. It is owed on:
  - #497's public API: `SSR.headed`, `RootRefusesHead`, the exported SSR
    diagnostic types, `Button.view`'s `attributes`, the resolver's class
    merge;
  - #495's: `helpers` as a function of the args, `Bundle.helpersOf`, the
    primitives' helpers, the Builder's `RowPressed`, `RowToggled` and
    `Copied`, and `LiveAnnounce.say` removed;
  - `foldkit-remote`'s `Defect` error tag (ce1d99d).
- [ ] **The branch's PR.** Unmerged since #497: #495, the examples' lint,
      #482's fix, the client-defect fix, the design notes. Issues done on it,
      to close when it merges: #495, #481, #482, #230 (its stamps are a backlog
      item for the next release).

## The queue

In order. Every item runs the loop above.

1. **#499's protocol question and #498's fix**, once the Remote data plane
   note's decisions 5 and 6 are made. #498's `it.fails` turns green with it.
2. **#500**, once the Expr note's decision 1 is made: a small type fix with a
   type test.
3. **The small findings** listed under "Bugs and findings from 2026-11-10" in
   `docs/design/TODO.md`: the reference Worker's `WeakMap`, the
   `writeTrace` helper's exists reads, the 90 KB against 69 KB page.
4. **The six notes' first phases**, in the order the decisions set. Each note
   names its first phase and what it measures.
5. **The UI polish leftovers** in `docs/design/TODO.md`, one per bout between
   larger items.

## Parked

- **#474:** a new search is ahead of stock Foldkit locally (198 against 260
  ms at 1x). What is left is the live three-way benchmark against the
  deployed Workers, which needs a deploy and the Cloudflare login.
- **#413:** our half is done (page 362 to 69 KB, parse5 175 to 41 ms; workerd
  125 to 150 ms warm). The rest waits on foldkit#1657.
- **#190** (the contract layer): a note of its own, not started.
