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
- [ ] **`TYPESAFE_API_KEY`**, so the Jev review can run. It is owed on:
  - #497's public API: `SSR.headed`, `RootRefusesHead`, the exported SSR
    diagnostic types, `Button.view`'s `attributes`, the resolver's class
    merge;
  - #495's: `helpers` as a function of the args, `Bundle.helpersOf`, the
    primitives' helpers, the Builder's `RowPressed`, `RowToggled` and
    `Copied`, and `LiveAnnounce.say` removed;
  - `foldkit-remote`'s `Defect` error tag (ce1d99d).
- [ ] **The branch's PR.** Unmerged since #497 (merged 2026-11-10): about a
      hundred commits, never through CI, since CI runs on pull requests. The
      whole CI sequence passed locally on 520755cf (2026-11-11, perf and
      scaffold jobs included; only postgres-locale skipped, no server here). Issues done on it, to close
      when it merges: #495, #481, #482, #230 (its stamps wait for the next
      release), #236, #500, #479, #478, #498, #499, #501, #502, #435, #432
      (phase 4 recorded), #438 (Phase 0 below the bar), #235 (closed on the
      parts). domains-plus's client JS has 1.2 kB of headroom (192.3 of
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

Waiting on the owner: #424's defaults (its 75-line target is out of reach),
the upstream posts (foldkit#1657, #1872, the Workers `fetch` signature, the
identity markers, floating-ui), and the Jev reviews (no key here).

## Parked

- **#474:** a new search is ahead of stock Foldkit locally (198 against 260
  ms at 1x). What is left is the live three-way benchmark against the
  deployed Workers, which needs a deploy and the Cloudflare login.
- **#413:** our half is done (page 362 to 69 KB, parse5 175 to 41 ms; workerd
  125 to 150 ms warm). The rest waits on foldkit#1657.
- **#190** (the contract layer): Phase 0 items 6 and 7 done 2026-11-11 (the
  upcasting note, reviewed in three rounds: 0a185be1..13bd41fd; document
  boundaries in `docs/replication.md`: 71855f3f). Item 5 (Sync rejections as
  Remote `Refusal`s) is next; Phase 1 waits on foldkit/foldkit#1655.
