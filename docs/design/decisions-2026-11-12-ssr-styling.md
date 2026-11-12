# Decisions, 2026-11-12: the loader's default, per-page sheets, style modules at build, LongList (#472, #471, #420, #429)

Four open issues waited on us, not on upstream. Each was read again with its
comments, its design note and the code at `d2b4eff3`, and each gets one
decision here. The decisions of 2026-11-10 in
[472-427-432-435-ssr-delivery-DESIGN.md](./472-427-432-435-ssr-delivery-DESIGN.md)
and
[420-424-429-430-styling-platform-DESIGN.md](./420-424-429-430-styling-platform-DESIGN.md)
stand except where the evidence has changed since, which is said in the
section. Nothing here is built or posted; the last section lists what the
coordinator applies.

| Issue | Decision | GitHub state |
| --- | --- | --- |
| #472 runtime on intent | The loader is shipped and stays opt-in. domains-plus keeps today's entry, and that is final, not pending: deferring evaluation moves the cost and removes none. | Close as completed |
| #471 per-page stylesheet | Not built. Measured at about 1.2 KB brotli, most of which a client would inject back; #487 took the bytes that were there. | Close as not planned |
| #420 style modules at build | Phase 1 is the whole issue: 25,962 B off the start-up script, the compiler out of the chunk, refusals tested. Phase 2 is not planned. | Close as completed |
| #429 LongList | Not built. Its two preconditions are a compiled server row (not product code) and streaming (declined with #427), and 556 rows add about 10 KB brotli to a page whose ceiling is 9.6. | Close as not planned, with a reopen condition |

Other groups decide #411, #417, #426, #473, #474, #475 (performance), #424 and
#430 (UI), and #439, #480, #190, #231, #148, #149 (Remote, contract and
platform). Where a decision here leans on one of those, it names the issue
and decides nothing about it.

## #472: boot the runtime on intent

### Question

Phase 2, `foldkit-ssr/loader`, is built and opt-in for domains-plus
(`DOMAINS_PLUS_LOADER=1`). Does it become the default, and what is left of
the issue?

### Evidence

- **Built, under 0.39.0 in the changelog.** `packages/ssr/src/loader.ts`,
  `handoff.ts`, `marks.ts`, `runtimeChunk.ts` (f4ecb3ac, 1e4e8dc7, 9d673d0a),
  documented in `packages/ssr/README.md` ("The runtime on intent") and the
  skill's `references/ssr.md`.
- **The issue's e2e exists.** `examples/foldkit/domains-plus/e2e/loader.e2e.ts`
  (002e848d): six tests on the built Worker with the runtime's chunk held,
  failed or let through. A held cart press is answered once with no POST; a
  chunk that never answers posts the form once at 3 s; a failed chunk posts
  it once at once.
- **Script at start, the issue's headline number, is met under the flag:**
  2,344 B brotli against the 10 KB bar and stock Foldkit's 215 KB (the note's
  "Phase 2, fetch at load", 2026-11-11).
- **Decision 5's other three numbers, two runs, 4x CPU, median of 12:**

  | | Today's entry | Loader, fetch at idle | Loader, fetch at load |
  | --- | --: | --: | --: |
  | Total script, brotli | 207,527 B | +2,371 B | +1,907 B |
  | Main-thread blocking, every long task | 943 ms | 784 ms (807) | 909 ms |
  | First press at `load` | 312 ms | 1,224 ms (403) | 1,194 ms |
  | First press 5 s after `load` | 138 ms | 195 ms (187) | 140 ms |
  | Runtime taken over, from navigation start | 814 ms | 1,158 ms (1,230) | 876 ms |

  The fetch-at-idle column is the run of 2026-11-10; in brackets is today's
  entry in that same run, which is what it compares with.

  Blocking is the same and total script is 0.9% worse. The note's own
  reading: the cost is evaluating the chunk (about 800 ms at 4x), which
  today's entry starts before `load` and the loader starts after it.
- **The press-at-`load` row overstates the gap, and the conclusion holds
  without it.** `bootOnce` in `scripts/render-baseline.mjs` presses after
  `page.goto(…, { waitUntil: 'load' })`. Today's entry is a module script, so
  `load` waits for its evaluation; under the loader the chunk is a dynamic
  import, so `load` fires before it. The two builds are therefore pressed at
  different moments after navigation. This is read from the script, not
  measured: `load`'s time was not recorded. The row that compares like with
  like is the take-over from navigation start, 876 against 814 ms. So the
  loader's best honest case for a reader is parity, 62 ms behind, for 1.9 KB
  more script.
- **The loader has a second job, and it is already a default there.**
  `examples/auth` loads `foldkit-ssr/loader` as its entry with the plan's
  default `start` (e5d61c33, 2026-11-11), because a press on server-drawn
  markup before hydration was lost one e2e run in six. That is holding a
  press, not deferring script.
- **The owner's second risk came true as stated** (comment of 2026-11-03):
  "It moves cost onto the first tap, not away from it." The performance
  plan's own lesson reads the same: "Remove code; do not defer it" (#423).

### Decision

**Close #472 as completed. The loader stays in `foldkit-ssr` as an opt-in
entry; domains-plus keeps today's entry by default, and no further phase is
planned.**

The issue asked for a way past stock Foldkit on JavaScript at load. The
mechanism exists and reaches 2.3 KB. What the measurements show is that the
number it wins is the only one it moves: the same script is fetched and run a
little later, blocking the main thread for the same time, and nothing a
reader sees (first paint, take-over, a press after boot) gets better.
Decision 5 already said the default lands only if nothing is worse; total
script is worse and no fair reading of the first press makes it better. Two
attempts (fetch at idle, fetch at `load`) gave the same answer, and the note
shows why a third cannot: to answer a press at `load` as fast as today the
chunk must evaluate before `load`, which is `start: 'now'`.

What moves domains-plus's JavaScript from here is removing it: #420 took
25.9 KB (below), and #430's floating-ui is 4.7 KB (the UI group's). Effect
and Foldkit are a 91 KB floor that no loader lowers.

One thing is deliberately not decided here: whether domains-plus should load
the loader with `start: 'now'`, as `examples/auth` does, so a press before
take-over is held and not posted to a full server render. That is a
correctness question about early presses on the uncached path, it costs
1.9 KB against a client budget with 1.0 KB of headroom, and its value depends
on what #473 (the performance group's) does to that render. If #473's
decision leaves the pre-boot GET or POST as a path that can fail with 1102,
that group can ask for it as a new, small issue; it is not this one.

### Next step, done when

Nothing to build. Reopen, or file anew, when either holds:

- the runtime chunk's evaluation at 4x CPU throttle (today about 800 ms for
  207 KB) falls under 200 ms, so a press that pays all of it is still
  answered within the 200 ms decision 1 named; or
- a PageSpeed run of a deployed `DOMAINS_PLUS_LOADER=1` build (#475's
  method, the performance group's) shows Speed Index or Largest Contentful
  Paint better than the default build's by more than the runs' spread.

`loader.e2e.ts` keeps running, so the opt-in path cannot rot unseen.

### GitHub

Close as completed. Title unchanged.

## #471: a per-page stylesheet of only the classes that page can draw

### Question

Should `foldkit-mixins/vite` record the classes each route draws and ship
only those?

### Evidence

- **Measured before building, 2026-11-08** (21bb25e0;
  [performance-PLAN.md](./performance-PLAN.md), "Measure what a sheet holds
  before pruning it"). domains-plus's sheet was 159.6 KB raw, 15.2 KB brotli:
  92.0 KB raw was the application's own `stylesheet` text and 67.7 KB the
  148 compiled classes. Server renders of `/`, three searches, `/tlds`, a 404
  and a page with a cart draw 114 of the 148.
- **The 34 undrawn classes are about 12 KB raw, about 1.2 KB brotli,** and
  nearly all are drawn later by the client (the Listbox and Dialog popups,
  the filter and cart sheets, data-dependent states). Left out of the sheet
  they would have to be injected at run time, and since #420 the production
  client carries no injector for a frozen module (`ensure` is defined away,
  `bundle.test.ts`), so they could not be.
- **The bytes were in the theme, and are gone.** #487 (062be02f, closed as
  completed 2026-11-10) ships only the tokens the sheet reads: 15.2 to
  10.6 KB brotli. `examples/foldkit/domains-plus/test/sheet.test.ts` holds a
  10.7 KB ceiling and was run green today. Stock Foldkit's sheet is 8.0 KB.
- The issue has no comments, and nothing has asked for it since.

### Decision

**Close as not planned.** The most it could save is about 1.2 KB brotli, the
classes it would drop are ones a client draws, and after #420 a production
client has no way to add them back. #487 was the lever and is built. The
issue's "done when" (the CSS shrinks, recorded) was met by #487 by another
route: 18.1 KB in the comparison at 0.38.0, 10.6 KB now.

### Next step, done when

Nothing to build. A new issue is worth filing only if an application's
bundle report shows compiled classes no page or client state of it can draw
summing to over 3 KB brotli, which would mean a recipe compiles variants
nobody selects; that is a recipe fix, not a per-page sheet.

### GitHub

Close as not planned, pointing at #487.

## #420: zero-runtime style modules, evaluated at build

### Question

Phase 0 measured, phase 1 is built. Is the issue done, or is there a phase
left to build?

### Evidence

- **Phase 0 passed its gate.** The three style rows of the bundle report
  summed to 30.1 KB brotli at dbfbbe8, against 15 KB (2026-11-10).
- **Phase 1 passed its exit gate.** `styles({ sheet, modules })`
  (`packages/mixins/src/viteFreeze.ts`, 39a003c..775f0bc) with domains-plus's
  `style.ts` listed: the start-up script went from 217,518 to 191,556 B
  brotli, a fall of 25,962 against the 12 KB gate. The style rows now sum to
  6.4 KB, all of it components that draw.
- **The issue's "done when", line by line:**
  - *The client imports no style compiler, and the saving is recorded.*
    `examples/foldkit/domains-plus/test/bundle.test.ts` asserts no
    `foldkit-mixins/styleRules` and no `foldkit-mixins-ui/recipes/` module in
    the chunk, under a 193.5 KB ceiling.
  - *The conformance test is green over the examples.*
    `examples/foldkit/domains-plus/test/frozen.test.ts` checks every export of
    the frozen `style.ts` against the run-time one. domains-plus is the only
    example whose `vite.config.ts` calls `styles(…)` at all (checked today
    with `grep -rln "styles(" examples --include=vite.config.ts`), so "the
    examples" is this one.
  - *A style module that is not static fails the build with a clear error.*
    `packages/mixins/test/viteFreeze.test.ts` covers `whenInput`, `perItem`,
    an export that is a function, and a module that does not resolve, each
    naming the module and the export.
- **Parity on the built output.** `e2e/built.e2e.ts` (c7d34714) reads
  computed styles from the frozen classes on the built Worker, checks every
  `style-` class has a rule in a linked sheet and that no `<style>` exists at
  first paint; it goes red with `modules` dropped. The one defect it found
  (a font the sheet named and the build did not emit) is fixed (f9c00d66).
- **What the note listed as not done:** a browser comparison of a page drawn
  from class data with one compiled at run time, which the built e2e now
  covers by reading the same computed values; and Chromium's
  module-evaluation time at 4x, which the plan said "gates nothing".
- **Phase 2** (conditional pieces in a listed module) was decided not
  planned on 2026-11-10: no file under `packages/mixins-ui/src` or
  domains-plus's `src` uses `whenInput` or `perItem`.

### Decision

**Close #420 as completed.** Every line of its "done when" holds and both
gates passed with room. Phase 2 was left not planned here for want of a
caller; [decisions-2026-11-12-build-deferred.md](./decisions-2026-11-12-build-deferred.md) (B2) builds it. Until then the way to keep a
conditional piece is to leave its module off the list, which the refusal's
message says.

The evaluation time at 4x is not chased. #472's runs put the whole chunk's
evaluation at about 800 ms at 4x before and after the same week's changes
within the machine's spread, so a figure for the style share alone would not
change a decision.

### Next step, done when

Nothing to build. Two triggers for a new issue, neither open now:

- a second application lists `modules` and something it needs is refused
  (a `whenInput` in a listed module is the named case); or
- an application's bundle report shows `foldkit-mixins/styleRules` back in a
  production chunk that lists its style modules, which `bundle.test.ts`
  catches for domains-plus.

### GitHub

Close as completed. Title unchanged.

## #429: LongList, every row server-drawn through `content-visibility`

### Question

On 2026-11-10 this was narrowed and kept open, to be built when the server
draws 556 rows in 10 ms or less and the HTML is within budget or streamed.
Can either condition be met, and should it stay open?

### Evidence

- **The two reasons that made it urgent are gone** (the note, section 1):
  the layout shift is 0.001 and was never the list's (#418), and the server
  draws the first 24 names, not 66 (#415).
- **Changed since 2026-11-10: streaming is declined.** The note's condition
  offered "streamed (#473 or #433, and #427)". #427's probe missed its bar
  (6 ms of first contentful paint against 50) and #427 closed; decision 6
  builds neither head-first nor first-screen-first until "a page with a
  measured slow read below its first screen, which no page here has". #433's
  client half closed as not planned too. So "or streamed" names nothing
  being built.
- **Measured today: the CPU half is reachable only through the compiled
  row.** A scratch test over `examples/foldkit/domains-plus/test/compiledRow.ts`
  (run from the root on this machine, Node 22, deleted after) filled 556 rows
  in 1.0 to 1.25 ms (median of 40). The interpreted row is about 0.17 ms a
  name, about 95 ms for 556 (the note). `compiledRow.ts` is #473's spike in a
  test directory, written by hand from the view; no compiler or product path
  exists, and whether one is built is #473's decision (the performance
  group's).
- **Measured today: the HTML half is not reachable within the budget.** A
  served row is 673 B raw (`/?q=sunbeam`, 60 rows in 40.4 KB), so 556 rows
  are about 374 KB raw. Compressed, 556 rows with their prices, bindings and
  `aria` text varied came to 5.3 KB brotli before counting what cannot
  compress: each row's 16-hex `data-foldkit-key` (about 8 bytes each, 4.4 KB)
  and its TLD. That is about 10 KB brotli added to a page of 5.5 to 6.0 KB,
  an estimate from synthetic rows, against a ceiling of 9.6 KB and a goal of
  8. Rows drawn unpriced would be smaller, not under.
- **What it would buy is small and partly unmeasured.** Find-in-page across
  the whole list, a full list without scripts (today it pages by links), and
  the measuring code out of the chunk, whose bytes were never split out of
  `foldkit-primitives`' 5.5 KB. Against that: about 8,000 nodes on every
  search page, and a `content-visibility` path CI cannot test outside
  Chromium (the note's premises).
- No user, example or issue has asked for find-in-page or a scriptless full
  list since the issue was filed.

### Decision

**Close #429 as not planned, with the reopen condition below.** The
2026-11-10 decision kept it open because a condition could be met. Two days
later one half of that condition has no route (streaming is declined and the
rows do not fit the HTML budget without it), and the other half depends on a
compiler that is a spike in another group's issue. An issue whose
preconditions are both unbuilt and one of them declined is not waiting; it
is not planned. The same note says why that should be said: "an open issue
with no condition is never picked up".

`WindowList` stays as the long list. The design for `LongList` (a sibling
component, `?from=` as a row to scroll to, `content-visibility` inside
`@supports (overflow-anchor: auto)`) stays in the note for whoever reopens
it.

### Next step, done when

Nothing to build. Reopen when the first two hold, each observable (a third
condition, "someone needs what only it gives", no longer applies under
[decisions-2026-11-12-build-deferred.md](./decisions-2026-11-12-build-deferred.md)):

1. a compiled server row is product code (not a file under `test/`) and
   `pnpm bench:render` or `cpu.test.ts` shows 556 rows drawn in 10 ms or
   less on the server;
2. `SSR.entry` can send rows after the first screen (a streamed body), or
   the owner raises the HTML budget by the measured cost of the rows.

### GitHub

Close as not planned.

## For the coordinator

Comments to post (the maintainer's to apply; nothing is posted by this
note):

- **#472, close as completed.** "The loader is built as
  `foldkit-ssr/loader` (0.39.0) and stays opt-in. domains-plus keeps today's entry:
  under the loader script at start is 2.3 KB, but main-thread blocking is the
  same (909 against 943 ms at 4x), total script is 1.9 KB more, and the
  runtime takes over 62 ms later, so it defers the cost and removes none.
  Reopen if the chunk's evaluation at 4x falls under 200 ms, or a deployed
  loader build beats the default on Speed Index or LCP by more than the runs'
  spread. Details: `docs/design/decisions-2026-11-12-ssr-styling.md`."
- **#471, close as not planned.** "Measured 2026-11-08: the classes no server
  render draws are 34 of 148, about 1.2 KB brotli, and a client draws nearly
  all of them later. The sheet's weight was unread theme tokens, which #487
  removed (15.2 to 10.6 KB brotli, held by `sheet.test.ts`). Since #420 a
  production client has no injector to add a dropped class back, so this is
  not built."
- **#420, close as completed.** "Phase 1 is the whole issue:
  `styles({ sheet, modules })` took domains-plus's start-up script from
  217,518 to 191,556 B brotli (gate: 12 KB), with no style compiler or recipe
  module in the chunk (`bundle.test.ts`), the frozen exports checked against
  the run-time ones (`frozen.test.ts`), refusals tested (`viteFreeze.test.ts`)
  and parity on the built Worker (`e2e/built.e2e.ts`). Conditional pieces in
  a listed module stay not planned until an application needs one."
- **#429, close as not planned.** "Both preconditions are unbuilt and one is
  declined: streaming closed with #427, and 556 server-drawn rows add about
  10 KB brotli to a page with a 9.6 KB ceiling (estimated 2026-11-12). The
  compiled row draws 556 rows in about 1.2 ms, but it is #473's spike, not
  product code. Reopen when a compiled server row ships, the rows can be
  streamed or the HTML budget is raised by their cost, and someone needs
  find-in-page or the full list without scripts."

Lines these decisions make wrong elsewhere, reported and not edited:

- `docs/design/TODO.md`, "SSR delivery": after "the cost is evaluating the
  chunk, which today's entry starts before `load`." add "#472 closes on
  those numbers (decisions-2026-11-12-ssr-styling.md); the loader stays
  opt-in."
- `docs/design/TODO.md`, "Styling platform": "#429 and #430 wait on their
  named conditions" becomes "#420 closes as completed; #429 closes as not
  planned (its conditions are in decisions-2026-11-12-ssr-styling.md); #430
  waits on its named condition", unless the UI group's decision on #430 says
  otherwise.
- `docs/design/performance-PLAN.md`, the comparison table: "JS at load …
  #472; then #420, #430" should name what is left, #430, with #420 done
  (191.6 KB) and #472 opt-in. In "Order", item 5 (#472) and item 7's #471
  and #420 are decided; the #429 bullet under Phase 3 and the paragraph "One
  decision joins #415, #427 and #429" are settled as "the first screen only".
- `CHANGELOG.md`, the 0.39.0 loader entry ends "it is not yet its default";
  "yet" promises a flip that is no longer planned. Drop the word if 0.39.0 is
  not published, else leave the entry.
- `examples/foldkit/domains-plus/vite.config.ts:11-13` says "Not the default
  until its first press, Total Blocking Time and total script are measured";
  they are measured, and the comment should say the default stays.
