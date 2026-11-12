# Decisions, 2026-11-12: domains-plus performance (#411, #417, #426, #473, #474, #475)

Status: decided 2026-11-12, at `d2b4eff3`. Six open issues of the performance
plan ([performance-PLAN.md](./performance-PLAN.md)) wait on us, not on
upstream. This note decides each. It respects the decisions of 2026-11-10 in
[376-433-148-149-renderer-DESIGN.md](./376-433-148-149-renderer-DESIGN.md)
(decisions 2 and 5) and
[420-424-429-430-styling-platform-DESIGN.md](./420-424-429-430-styling-platform-DESIGN.md)
(#429's row count), and decides nothing that belongs to #472, #471, #420,
#429, #424 or #430.

| Issue | Decision | GitHub state |
| --- | --- | --- |
| #411 | Close: superseded by its split, and its remaining goal lives on #473 | close, not planned (superseded) |
| #417 | Close: every step of ours is done and repeated pages fit; the full render is #413 and #473 | close, completed |
| #426 | Go-ahead to redeploy and re-measure after `v0.39.0` is tagged; publish on one condition | stay open |
| #473 | Narrow: build one budget now (a never-seen search, 500 ms warm), then wait on foldkit#1657 for S1 and S2 | stay open, retitle |
| #474 | Park: no more work here; #426's run closes it or reopens it | stay open |
| #475 | Close: layout shift fixed, row count decided, a shared milestone exists; the rest is #472's | close, completed |

One finding came out of the research and changes #473's decision: the page
budget in `examples/foldkit/domains-plus/test/cpu.test.ts` does not measure a
render for two of its three routes (below).

## Measurements taken for this note

Linux, Node, 4 cores, `d2b4eff3`, `Cpu.inThread` (this thread's
`schedstat`), 2026-11-12.

`cpu.test.ts`, three runs with `PERF_REPORT` set:

| Suite, route | Warm (worst of 5) | Cold (first request) | Budget |
| --- | --: | --: | --: |
| reads, three names | 2.2 to 5.6 ms | 32 to 43 ms | 10 / 100 |
| reads, a full cart | 2.4 to 3.3 ms | 3.7 to 5.9 ms | 10 / 100 |
| pages, the landing page | 2.1 to 5.2 ms | 124 to 138 ms | 1000 / 2000 |
| pages, a search (`/?q=acme`) | 1.8 to 2.4 ms | 151 to 213 ms | 1000 / 2000 |
| pages, a search with a full cart | 152 to 265 ms | 158 to 188 ms | 1000 / 2000 |
| kept pages, the landing page | 1.0 to 1.3 ms | 1.1 to 3.1 ms | 15 |
| kept pages, a search | 2.4 to 2.9 ms | 78 to 125 ms | 15 |

A probe written for this note and deleted afterwards asked 21 searches for
words never asked before (`/?q=probeword<n>`), three rounds, in two
processes, through the same `handleRequest` and meter as `cpu.test.ts`. The
page was 70,823 bytes.

| | First request | Warm, least | Warm, median of 20 | Warm, most |
| --- | --: | --: | --: | --: |
| first round of a process | 338 to 345 ms | 74 to 88 ms | 92 to 111 ms | 136 to 143 ms |
| later rounds | 87 to 105 ms | 69 to 76 ms | 86 to 97 ms | 107 to 143 ms |

This agrees with the plan's reading of 2026-11-09 (about 119 ms, median of
20) and is the Node figure only: workerd read 125 to 150 ms on 2026-11-10
(`node scripts/workerd-cpu.mjs`). Nothing was deployed and Wrangler was not
run.

## #411: a server-rendered page costs 150 to 500 ms of CPU

**Question.** Does the pointer issue still carry anything?

**Evidence.**
- Its one comment (2026-11-02) splits it into #413 to #416 with #417
  tracking. #414, #415, #416 and #419 are closed as completed; #413 is open
  and waits on foldkit/foldkit#1657.
- Its numbers are out of date: `/?q=acme` was 450 to 530 ms on workerd; a
  never-seen search is 125 to 150 ms there now (performance-PLAN.md,
  2026-11-10), and a repeated page is 1 to 3 ms (above).
- Its two "what would help" items are #413 (the upstream ask) and #473 (the
  budget), each tracked there.

**Decision.** Close as superseded. It holds no scope that #413 and #473 do
not.

**Next step.** None.

**GitHub state.** Close as not planned, with a comment naming #413 and #473.

## #417: fit Workers' free CPU limit (tracking)

**Question.** What of the 10 ms goal is ours, and is it done?

**Evidence.**
- Its steps are the serializer issue (#413, open, upstream's), drawn classes
  (#414, closed), the first screen (#415, closed), cold start (#416, closed)
  and external CSS (#419, closed). The two added by comment are #434 (closed,
  not planned: the template is parsed four times a request too) and #435
  (decided in the SSR delivery note, not here).
- Repeated pages fit. A kept page costs 1.0 to 2.9 ms warm (above), held by
  `cpu.test.ts`'s `a kept page` at 15 ms; the budget is 15 and not 10 because
  one collection on a shared runner read 6.26 ms (the test's own comment).
  #468 keeps a page for six hours in KV (10 of 10 loads served after six
  idle minutes), and #469 prerenders `/` at build.
- A full render does not fit and our cuts cannot make it: a never-seen
  search is 86 to 111 ms here, 125 to 150 ms on workerd. #473's probe
  (comment of 2026-11-03) puts it at 31 to 33 ms with every upstream check
  removed, and about 8 ms of server plumbing here (12 to 15 ms on Workers)
  after every cut then listed. So 10 ms for a page rendered in the request is
  not reachable by anything planned, with or without upstream's fix.
- The issue's "done when" is one number for all pages, lowered "from 1000 ms
  to 10 ms". That budget does not measure what it says (see #473).

**Decision.** Close as completed for our part. The goal is restated as two,
because they have different owners and different answers:
1. A page served again costs under 10 ms. Done and held.
2. A page rendered in the request costs as little as it can. Not done; it is
   #413 (upstream's checks) and #473 (the budget now, compiled regions
   after). Its target is not 10 ms: #473 sets it from S1's reading.

Keeping a third open issue for goal 2 beside #413 and #473 tracks nothing
those two do not.

**Next step.** None here. The live 1102 rate is a row of #426's run.

**GitHub state.** Close as completed. Remove nothing from #413.

## #426: re-measure and publish against stock Foldkit and Solid

**Question.** Is it time to redeploy and re-measure, and may the result be
published? The owner's go-ahead was pending; it is given here, as the
owner's delegate.

**Evidence.**
- The plan's condition was "once Phase 1 and the parts of Phase 2 that move
  the headline numbers land". Phase 1 has landed except upstream's part
  (#413). Of the rows:
  - JS at load was 268 KB brotli on 0.38.0; #420 phase 1 took the start-up
    script from 217.5 to 191.6 kB (design TODO, 39a003c..775f0bc).
  - CSS was 18.1 KB; #487 measured 10.6 KB from `vite build`.
  - HTML was 11.1 KB; `/tlds` took 21 KB raw off every page (#473, 3395ce5c3)
    and #470 is closed.
  - A new search was 307 ms against 246; locally it is 198 against 260
    (#474, 2026-11-09).
  - Layout shift was 0.787 on desktop; Lighthouse read 0 on 2026-11-03
    (#475).
- Every public number is of 0.38.0 or older, and three issues (#474, #475,
  and this one) wait on the same run.
- One target cannot be met by this run: "no 1102s". A never-seen search
  still costs 125 to 150 ms on workerd against the free plan's 10 ms; it
  failed 13 of 15 times on 0.38.0, when it cost about 190 ms, and it is
  still more than ten times the limit.
- Release 0.39.0 is on `main` and not tagged (TODO.md); a measured deploy
  should have a version to name.
- A cloud session cannot deploy (no Cloudflare login, and CLAUDE.md allows
  one Wrangler at a time), so the maintainer runs it.

**Decision.** Go ahead with the redeploy and the re-measure, now, after
`v0.39.0` is tagged. Do not wait for foldkit#1657: its date is not ours, and
stale numbers mislead in both directions.

Publish the updated `/compare` on one condition, checked from the run
itself: **loads of a page seen before fail 0 times** (the 15 interleaved
loads of `/?q=sunbeam` and of `/`). Never-seen searches are shown as their
own row, with their failure count and the reason (a full render on the free
plan, foldkit/foldkit#1657). A comparison that hides that row is not
published; one where repeated pages fail is not published either, and a bug
is filed instead. No other target has to be met to publish: the page is a
measurement, and the targets are tracked by their own issues.

The demo stays on the free plan. Moving it to a paid plan would remove the
1102 row by spending the maintainer's money rather than by making the
render cheaper, and the free plan is the comparison's premise.

**Next step, for the maintainer.**
1. Tag `v0.39.0` (TODO.md has the command).
2. Deploy `foldkit-domains-plus` and stock `examples/foldkit/domains` from
   that tag.
3. In solid-domains: `node scripts/benchmark.mjs`, then Lighthouse, three
   interleaved runs each for mobile and desktop, on all three.
4. From this repository, a new search on the live Workers, with each app's
   deployed URL:
   `node scripts/search-compare.mjs solid=<url> stock=<url> plus=<url>`,
   at `--throttle 1` and `--throttle 4`. Check first that Solid's page has
   `#domain-search` and `.price`, which the script reads; if not, use
   solid-domains' own search timing for all three.
5. 15 never-seen searches against the Plus Worker, and the count that
   answered.
6. Record every row on #426, with the version and the date. Publish
   `/compare` if the condition above holds.

**Done when.** The table is on #426, and `/compare` is either published or
a bug is filed for the repeated-page failure that stopped it. Then update
"Where 0.38.0 stands" in performance-PLAN.md from the same table.

**GitHub state.** Stay open. It closes with the recorded table.

## #473: a render does less work

**Question.** What is left of our part (the render profile and the budget
decision), and what budget?

**Evidence.**
- **The profile is done.** Step 1's table is in the comment of 2026-11-03
  (the floor with checks removed, and where a search goes without them), and
  was re-measured on Linux on 2026-11-09 (performance-PLAN.md: parse5 41 ms,
  the rest of Foldkit 25, collection 11, Effect 7, packages and app about
  12). Nothing in it is ours and large: the largest part that was,
  `answeredOf`, was cut twice (752969fb5, then 17a6c0459 under #474).
- **Step 2 is done:** `/tlds` (3395ce5c3).
- **The compiled row is measured** (about 2% of the interpreted row, four
  mutations killed) and decided on 2026-11-10: S1 and S2 live here and wait
  on foldkit#1657's next step (renderer note, decision 2).
- **The budget does not measure a render.** `the pages, as they are` asks
  `/` and `/?q=acme` six times each. The entry keeps a page drawn from its
  URL alone (#428), so every request after the first is a kept page: 1.8 to
  5.2 ms warm, against a budget of 1000 (table above). Only the cart route
  renders warm (152 to 265 ms). The test's comment says a never-seen search
  takes about 120 ms and that "this budget only keeps them from growing";
  for two of three routes it could not notice a render ten times slower.
  The issue's first "done when" (a never-seen search's CPU recorded in
  `cpu.test.ts`, its budget lowered) is therefore not met: no route there is
  a never-seen search.
- A never-seen search's warm request cost at most 143 ms in 120 requests
  here, and the cart route at most 265 ms in 15.

**Decision.** Narrow. One piece of work is ours now; the rest waits.

*Now: the budget.* In `the pages, as they are`:
- replace the `a search` route with a function returning a request for a
  word no earlier request asked (a counter in the word), named `a search
  never seen`;
- keep `the landing page` for its cold reading and say in the comment that
  its warm requests are kept pages;
- keep the cart route, which is never kept;
- set the budget to **500 ms warm and 1000 ms cold**, and correct the
  comment.

500 is about twice the worst warm request measured (265 ms, the cart route)
and three and a half times a never-seen search's worst (143 ms). It is that
loose because `warm` is the worst single request on a shared runner, where
a kept page has read several times its usual cost. It still halves the current
ceiling and, unlike it, binds a route that renders. A tighter number waits
for S1: once upstream's checks leave the request the reading falls by about
two thirds, and the budget follows it down then.

*After foldkit#1657's next step: S1, then S2,* as the renderer note has
them. S1 re-measures the parse share with `node scripts/workerd-cpu.mjs`.
S2 (whole regions compiled, checked once per arm at build) is built only if
S1 leaves a never-seen search over 30 ms on workerd; under that, the
remaining cost is plumbing a compiler does not remove, and this closes.
The target for a rendered page is set from S1's reading, not 10 ms (#417).

Its second "done when" (the live never-seen failure rate on #426) is step 5
of #426's run.

**Next step / done when.** The budget change lands with: three green runs of
`cpu.test.ts`; a mutation in `cpu.mutations.ts` showing the new route can go
over (for example the first-screen cap removed, if that passes 500 ms; if no
honest mutation does, say so in the spec with `survives`); and a green
`perf` job on CI. Model: Sonnet (a test and a budget).

**GitHub state.** Stay open, keep `waiting on upstream`. Retitle:
"domains-plus: a never-seen search's render, budgeted now and compiled after
foldkit#1657".

## #474: a new search is the slowest of the three

**Question.** Is there work left besides the live benchmark?

**Evidence.**
- The split is recorded (comment of 2026-11-03): one request a search, and
  the largest part of ours was `modelToDependencies` at about 33 ms, cut by
  17a6c0459 (261 to 235 ms at 1×, 733 to 529 ms at 4×).
- Locally Plus is ahead of stock Foldkit: 198 against 260 ms at 1×, 315
  against 643 ms at 4× (comment of 2026-11-09, two runs agreeing).
- Decision 5 of the renderer note (2026-11-10) leaves the live three-way
  rerun as this issue's work, gating nothing. No evidence has changed since.
- The rerun needs a deploy, which is #426's.

**Decision.** Park. No more engineering here. The live figure is step 4 of
#426's run, and that run decides this issue:
- Plus at or below stock Foldkit live, at 1×: close as completed, with the
  three figures.
- Plus behind stock live: split one live search as step 1 of the issue
  describes, and cut the largest part that is ours. The Worker's CPU on
  `/remote` is not a candidate (about 2 to 6 ms warm, above).
- A gap to Solid alone does not keep it open. It reopens the renderer
  question only by the 2026-11-10 rule: more than half of the gap in the
  view frame.

**Next step.** None until #426's run.

**GitHub state.** Stay open, no retitle.

## #475: Speed Index and the first screen

**Question.** The issue's own comment moved layout shift and Speed Index to
#472 and kept two things: a fair milestone for the comparison, and how many
rows the server draws. Is either still open?

**Evidence.**
- **Layout shift** is 0 in every Plus run (Lighthouse 12.8.2, 2026-11-03),
  and #418 is closed with a budget.
- **Speed Index:** on mobile Plus is ahead of stock Foldkit (3.49 against
  5.42 s). On desktop it is behind (1.24 against 0.74 s, 0.65 in one run),
  and the comment traces that and all of Plus's blocking time to one task,
  the script evaluating. That is #472's target, with #420 and #430.
- **The row count is decided.** The styling note (2026-11-10) keeps the
  first screen only (24 names, #415) and gives #429 its condition: every
  row is drawn when the server draws 556 in 10 ms or less and the HTML is
  within budget or streamed.
- **A milestone all three reach already exists.** "Top Results priced" is in
  the comparison and every app reaches it: 188, 589 and 192 ms on 0.38.0
  (performance-PLAN.md). "First 60 names priced" is the row Plus cannot
  reach, by the decision above.

**Decision.** Close as completed. The comparison's shared milestone is "Top
Results priced". "First 60 names priced" stays as a row and reads "24 drawn,
by design" for Plus, with a link to #429; no new milestone is added to
solid-domains. Desktop Speed Index and blocking time are #472's to move and
#426's to record; this note does not decide #472.

**Next step.** When #426's table is written, word the "first 60" row as
above.

**GitHub state.** Close as completed.

## What this changes elsewhere

Not edited here; other sessions share these files.

- `docs/design/performance-PLAN.md`, Order, Phase 1: "#417 closes when
  `cpu.test.ts` holds 10 ms" is superseded. #417 is closed; a kept page is
  held at 15 ms, and a rendered page's target is set by #473's S1.
- The same file, Targets: "no 1102s on the free plan: under 10 ms of CPU
  warm (#417)" becomes two lines, as in #417's decision, and "(#475)" on the
  Speed Index line becomes "(#472)".
- `TODO.md`'s Parked entry for #474 is still right. It can gain: "decided by
  #426's run (decisions-2026-11-12-performance.md)".
