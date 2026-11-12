# Decisions, 2026-11-12: the data platform group (#439, #480, #190, #231, #148, #149)

Status: decided 2026-11-12 (decisions delegated by the owner). Nothing here
is built by this note.

Six open issues waited on us, not on an upstream project. Each was read
with its comments, the design note that names it, both TODO files and the
code at `d2b4eff3`. Where a note decided something on 2026-11-10, that
decision stands unless the section says what changed since.

Decided beside this note, and not here: performance (#411, #417, #426,
#473, #474, #475, in
[decisions-2026-11-12-performance.md](./decisions-2026-11-12-performance.md)),
SSR and styling (#472, #471, #420, #429, in
[decisions-2026-11-12-ssr-styling.md](./decisions-2026-11-12-ssr-styling.md))
and UI (#424, #430).

## Summary

| Issue | Decision | GitHub state |
| --- | --- | --- |
| #439 which lists a write reaches | Close. Neither half has a consumer, and both of R1's named triggers have passed without asking for it. The reopening conditions are restated below. | Close as not planned |
| #480 async guarantees | Narrow to one browser test, then close. The audit and all five tracks are done. | Stay open until the test merges, then close as completed |
| #190 the contract layer | Build the Phase 5 follow-ups in the order below. Items 3, 4 and 8 of Phase 5 are not started. Phases 1 to 4 still wait on foldkit/foldkit#1655. | Stay open |
| #231 Twitter-clone tracker | Close. Every issue it lists is closed as completed. | Close as completed |
| #148 platform independence | Stay parked, as decided on 2026-11-10. Nothing has changed. | Stay open, no new comment |
| #149 GPUI | Stay parked, as decided on 2026-11-10. Nothing has changed. | Stay open, no new comment |

One finding outside the six: `v0.39.0` is tagged and its release run
failed, so `TODO.md`'s release line is stale (see [TODO corrections](#todo-corrections)).

## #439: say statically which lists a declared write reaches

### Question

The issue was narrowed on 2026-11-10
([377-439-440-remote-data-plane-DESIGN.md](./377-439-440-remote-data-plane-DESIGN.md),
decisions 3 and 4) to two halves, each waiting for a trigger:

- **R1**, a public `Remote.reaches(write, query)`, built "in the change
  that first needs it (#437's index check or `explain`)";
- **R2**, a version per Entity in the store, built when
  `read.bench.ts`'s figure, timing a real page's lists, passes 1 ms per
  write.

Does either trigger hold, and should an issue that holds no work stay
open?

### Evidence

- **R1's first trigger cannot fire.** #437 was closed as completed on
  2026-11-10 at 12:55 UTC, five hours before the decision was written
  (17:40). It shipped as `queryPlans`
  (`packages/remote-drizzle/src/plans.ts`, 732f690), which asks the
  database for each page's plan. It compares a Query with an index, never
  a Write with a Query, so it had no use for R1.
- **R1's second trigger has not fired.** `explain`
  (`packages/remote/src/why.ts`) reads `Query.dependencies` for one read.
  It last changed for behaviour on 2026-11-09 (6892d926) and does not ask
  which writes reach a list.
- **The correctness reason for R1 is gone.** The note said R1 would
  replace `writeTrace.test.ts`'s local `candidate` helper "including the
  exists' `where` that helper omits". 7cc664a1, seven minutes after the
  decision, made the helper read the `where`
  (`packages/remote/test/writeTrace.test.ts:195`). What is left of R1 is
  promoting a 40-line test helper to public API with one caller, its own
  test.
- **R2's trigger is a tenth of the way there.** Measured 2026-11-09
  ([performance-PLAN.md](./performance-PLAN.md), "Measure the check before
  skipping it"): reading a 25-row list again after a write to a row it
  does not show costs about 22 µs, and 100 µs for 100 rows. The largest
  page in the tree has five lists, about 0.1 ms per write. No page has
  been added since that changes this. I ran `read.bench.ts` today and it
  passed, but Vitest 5 printed no timings in this session, so the figures
  are the 2026-11-09 ones.
- The 2026-11-10 note itself says "until one of those happens the issue
  holds no work."

### Decision

**Close as not planned.** The 2026-11-10 decision kept the issue open
because each half had a trigger someone could meet. One of R1's two
triggers had already passed when it was written, and R1's remaining
purpose is an export nothing imports, which CLAUDE.md's de-slop rules
refuse ("do not export just in case"). R2 is sound and unneeded by a
factor of ten. An open issue is the wrong place to keep two conditions:
the performance plan already keeps them, beside the benchmark that tests
one.

What reopens each half, as a new issue that names its consumer:

- **R1:** a second caller needs the answer `candidate` gives. That is
  either `explain` gaining a "which declared writes reach this list" line
  that a user asked for, or a second test file copying the helper. The
  change that adds the second caller moves the helper to
  `packages/remote/src` and exports it, with the invariants of the note's
  §3.2 (owner identity, `reaches`, `unknown` for a body-less query).
- **R2:** a page in `examples/` or a user's report where
  `read.bench.ts`'s per-list figure times the page's lists passes 1 ms per
  write (ten 100-row lists is the smallest such page).

### Next step

None. The inferred write-set map stays dropped (decision 3).

GitHub: close #439 as not planned.

## #480: Solid 2.0 async guarantees as a typed DSL

### Question

The issue lists eight deliverables and six acceptance criteria. Which are
left, and is any of it worth holding the issue open for?

### Evidence

- **The audit is done:**
  [480-async-guarantees-DESIGN.md](./480-async-guarantees-DESIGN.md)
  (2026-11-07), with a gap matrix per ReactiveScript rule.
- **All five linked tracks are closed as completed.** #483 on 2026-11-10
  (`Projection.derive`'s `verify`); #478, #479, #481 and #482 on
  2026-11-12 with PR #503 (485d44bb).
- **The temporal laws have no open failure.**
  [482-temporal-laws-MATRIX.md](./482-temporal-laws-MATRIX.md) counts 27
  covered, 7 added, 3 fixed (#484, #485 among them), 0 open, 4 deliberate
  differences and 1 missing test (reducer determinism, which every other
  row exercises).
- **The audit's own Order section leaves three items:**
  1. a late read answer after a refresh, across two read entries. It is
     undecidable without a row revision on the wire, and no server sends
     one;
  2. #478 and #479, now closed;
  3. "#480's end-to-end proof through SSR and replay, which needs a
     browser run".
- **Most of the end-to-end proof already exists.**
  `examples/reference/e2e/notebook.e2e.ts` drives Entity, Guard, Remote's
  optimistic writes and SSR in Chromium, with the server unreachable
  (line 214), an answer lost (line 282) and a reload in each.
  `examples/reference/test/law.test.ts` runs `Law.check` on the same
  domain. What no browser test does is answer two writes out of order.
  `packages/remote/test/temporal.test.ts` does it on the reducer, which
  is where the law lives.
- **Type cost is recorded:** #478's `step` added 1.05% instantiations to
  the entity project
  ([478-479-483-185-64-expr-contracts-DESIGN.md](./478-479-483-185-64-expr-contracts-DESIGN.md)).

### Decision

**Narrow to one test, then close as completed.** The issue asked first
for an inventory of what is solved and what is missing, and for no
redundant framework. Both are delivered. The one acceptance line not yet
met in a browser is the out-of-order case, and the reference app's e2e
file has every fixture it needs.

Two things are decided against, so they do not keep the issue open:

- **The row revision.** It is a wire change with no server able to fill
  it. It reopens as its own issue when a Source can send a revision per
  row (`foldkit-remote-drizzle` reading a revision column would be the
  first).
- **"A complete example uses only declarative `pipe`/`flow` authoring."**
  No example pipes an `Expr` today, and rewriting one to do so proves
  nothing #478's own tests do not. Examples take the piped form when they
  are next touched.

### Next step / done when

One test in `examples/reference/e2e/notebook.e2e.ts` (Sonnet; an e2e
test, no API):

- edit one note twice; hold the first write's answer with
  `context.route`, as the "answer was lost" test holds one; let the
  second answer land, then release the first;
- assert the note shows the second edit at every step observed and after
  both answers, and after a reload;
- break it once to see it fail: answer in order with the values swapped.

When it is green in `pnpm e2e`, add a line to the audit's Order section
and close #480 as completed. The Jev reviews owed on #478 and #479 stay
on `TODO.md`'s `TYPESAFE_API_KEY` line, not on this issue.

GitHub: stay open until that test merges.

## #190: the contract layer, the parts that do not wait on foldkit#1655

### Question

Phase 5 items 1, 2, 5 and 6 are built and merged (PR #505). Five
follow-ups are open. In what order, with what scope? And what of Phase 5
is next after them?

### Evidence

- **The release.** `v0.39.0` is tagged at 3672017b, which includes #505.
  Its Release run failed in `pnpm test` (2026-11-12 12:31 UTC), and npm
  still serves `foldkit-sync` 0.15.0. So the deprecations below are
  introduced by 0.39.0 and "the next release" is the one after it.
- **The deprecated options still have a published teacher.**
  `docs/editing-server-data.md:134` shows `editsJournal` with
  `absorbed: (through, cursor) => …` and `server`, and its compiled twin
  `examples/registry/test/guide.test-d.ts:63-73` uses them. The registry
  itself already uses `asServer` (`examples/registry/src/journal.ts:149`).
  The other users are `packages/sync/test/editsJournal.test.ts:104` and
  `written.test-d.ts:32`.
- **The `replicas` rows.** Durable binds a replica id to the first actor
  that commits from it (`packages/durable/src/journal.ts:1179-1196`).
  Since review finding B1, every reaction append has a replica id of its
  own (`server/r/<reaction>/<hash>/<index>`), and so does every
  `appendAsServer` key (`packages/sync/src/serverJournal.ts:467`). Neither
  compaction nor `reset` deletes the rows
  ([190-sync-server-messages-DESIGN.md](./190-sync-server-messages-DESIGN.md),
  §13 round two, B). The note's §10 names the fix: the contract's
  `replicaId` answers none under `server/`, so Durable binds nothing. It
  said that waits for the strict readers; they are built, in the same
  package. A repeated append is still compared by the operation's own
  stored actor (`journal.ts:1170`), so the binding adds nothing there.
- **`settleTodos`** (`examples/cloudflare/src/schema.ts:160`) keeps its
  cursor by hand in `durable_meta`. `editsJournal` already keeps its own
  through `journal.cursors` (`packages/sync/src/journal.ts:585-616`),
  which is the pattern to copy.
- **The sync example** (`examples/sync/src/journal.ts:54-258`) still runs
  external effects through a hand-written `recover` loop
  (`effects`, `settleThrough`), keyed by array position, with its cursor
  in process memory. The note's §8 says this is what a reaction replaces.
- **The "done when" example.** No example declares a `serverOnly` Message
  recorded from a webhook, and none declares a `reaction`. The only
  reaction outside the package's tests is a test fixture
  (`examples/cloudflare/test/fixtures/reactionWorker.ts`). Of the plan's
  five clauses (§6.5), "a guest replica never receives the owner-only
  part" needs item 4, which is not built.

### Decision

**Build the follow-ups in this order.** Each is its own change.

1. **Move the guide off the deprecated options.** Rewrite the
   `editsJournal` snippet in `docs/editing-server-data.md` and
   `examples/registry/test/guide.test-d.ts` to `asServer`, as the registry
   does. First because it is wrong today (a guide teaching an option
   marked for removal) and because step 5 cannot land while a compiled
   guide uses what it deletes. Haiku or Sonnet; `pnpm docs:check` and the
   registry's typecheck are the proof.

2. **Bind nothing under `server/`.** The growth is unbounded in a
   feature that has not reached npm yet, so it is fixed before anyone
   stores much. Scope:
   - Sync's `replicaId` for Durable answers none for an id under
     `server/`; Durable's `replicaId` option returns an `Option` and binds
     nothing for none;
   - Durable's next schema step deletes `replicas` rows whose id begins
     `server/` (0.39.0 may have written some);
   - the README and `ServerJournalOptions.server`'s doc drop "the
     server's actor never changes" for new triggers and keep it for a
     redelivered key, which the operation's stored actor still refuses;
   - tests: a chain of reactions across a `reset` leaves no `server/`
     row; a client entry claiming a `server/` id is still refused by
     every strict reader; a redelivered key under another actor is still
     an `IdentityConflictError`. Mutations for each.

   This is identity code: the most capable model builds it, with an
   independent review, and a Jev review of the changed `replicaId`
   option when a key is available. **Not in scope:** `prune(through)` for
   ledger rows. Its cost (a reaction running again after a later `reset`)
   is the application's to accept, and no application has a ledger large
   enough to ask. It is built when a deployed document's ledger is
   reported as a cost.

3. **`settleTodos` onto `journal.cursors`.** Track a named cursor from
   the floor, `advance` it after `recover`, and delete the `durable_meta`
   read and write. An existing database starts again from the floor;
   `recover`'s ledger and the `ON CONFLICT DO NOTHING` inserts make that
   a no-op. Sonnet. Done when `examples/cloudflare`'s unit and workerd
   tests are green and nothing in the example names `durable_meta`.

4. **The sync example: effects as a reaction, and the "done when"
   example in the same change.** These are one piece of work, because the
   plan's example needs exactly what the migration adds. In
   `examples/sync`:
   - the `effects` policy and `settleThrough` become one declared
     `reaction` run by `serverJournal`;
   - one `serverOnly` Message, recorded from a webhook route through
     `appendAsServer`, keyed by the event's id;
   - the agent's append for a person is renamed, as §8 says, since it
     stops being the only thing called `appendAsServer`.

   Done when the example's tests show four of the plan's five clauses: a
   webhook's confirmation recorded once for a repeated delivery; a
   reaction's notice sent once per commit across a restart of the server;
   a rejection reaching the UI as a typed `SyncRefusal`; and a renamed
   durable Message replaying from an old journal (if
   `examples/reference/test/migrations.test.ts` already shows the last,
   link it; do not copy it). **The fifth clause, the guest's slice, is
   struck from this "done when"** and moves to item 4's own, since it
   cannot be met without item 4. Edit §6.5 of the plan in that change.
   Default model for the design of the reaction's key (the example keys
   effects by array position today, which a reaction must not inherit);
   Sonnet can do the rest.

5. **Remove the deprecated options, in the release after 0.39.0.**
   `editsJournal`'s `absorbed` and `server`, in the same change as
   `saved`, `Rejection.reason` and `journalExchange`'s `reasons`, which
   `TODO.md` already schedules. Delete the tests of the old path
   (`editsJournal.test.ts:104`, `written.test-d.ts:32`) or move them to
   `asServer`. Last, because it must not land before 0.39.0 is on npm:
   a deprecation nobody could install is a removal without notice.

**After those, Phase 5 stops until something asks.** Items 3
(server-only state) and 4 (reader slices) change what a replica holds,
and Q13 (whether an `update` over a partial snapshot can be checked) is
open. They start when an application needs a part of a document that one
reader must not receive; none in the tree does. Item 8 (journal Stories)
is not built: `serverMessages.test.ts` already states those cases, and a
Story format with no second author is a wrapper. Item 7 stays deferred,
as the plan says.

Phases 1 to 4, 6 and 7 are not decided here.

### Done when

Steps 1 to 4 merged with `pnpm check` green, step 5 in the release after
0.39.0, and §6.5 of the plan saying which items are built, which are
struck and why Phase 5 is paused.

GitHub: stay open. It is the tracker of the plan, and Phase 1 waits on
foldkit/foldkit#1655.

## #231: the Twitter-clone field report

### Question

The tracker's last status (2026-10-29) left #210, #226, #229 and #230
open. Is anything left?

### Evidence

Read through the API on 2026-11-12: all 29 issues in the tracker's body
are closed as completed, and so are the proposals it later added (#232
to #245, #247, #257). The last three: #226 on 2026-10-30, #229 on
2026-11-10 (scaffold runs, `docs:check` over 121 documents, seven
examples checked over the published packages), and #230 on 2026-11-12
with PR #503. #230's closing comment leaves the references' version
stamps to release preparation; `TODO.md` carries that.

### Decision

**Close as completed.** A tracker with nothing open tracks nothing. The
version stamps are a release step with an owner already.

### Next step

None. GitHub: close #231 as completed.

## #148 and #149: platform-independent Foldkit, and GPUI

### Question

Both were parked on 2026-11-10
([376-433-148-149-renderer-DESIGN.md](./376-433-148-149-renderer-DESIGN.md),
decisions 6 and 7). Has anything changed?

### Evidence

- No package or example defines or reads a `Platform` contract or a
  `ui.*` vocabulary (searched `packages/*/src` and `examples/*/src`
  today).
- `docs/native-cross-platform.md` last changed on 2026-11-09, to mark its
  imagined APIs as sketches. It reports no reffect run of a Foldkit
  `update`.
- #376, the tracker of the upstream seams both depend on, is still
  parked on its own Phase 0 threshold.
- Both issues carry the park comment of 2026-11-10 with their reopening
  condition.

### Decision

**Both stay parked and open, unchanged.** Two days have added no
evidence, and the conditions are concrete:

- **#149** reopens when reffect runs a Foldkit Counter's `update` as
  native code and matches the JavaScript reference transition by
  transition.
- **#148** reopens on that, or on an application that needs a second
  platform.

One addition, so the pair cannot sit forever: if #376 closes as not
planned (its own stated outcome when its Phase 0 does not pass and
foldkit/foldkit#1871 and #1872 are closed), close #148 and #149 with it.
The seams they would be built on would then not exist, and the inventory
they keep findable lives in
[foldkit-renderer-independence-PLAN.md](./foldkit-renderer-independence-PLAN.md)
§3 either way.

### Next step

None. GitHub: no change and no new comment; a second park comment two
days after the first says nothing new.

## TODO corrections

Reported for the coordinator to apply; this note edits no other file.

- **`TODO.md`, "Release 0.39.0 is on `main`, not tagged".** `v0.39.0` is
  tagged at 3672017b. Its Release run failed in the `publish` job's
  `pnpm test` step on 2026-11-12 at 12:31 UTC, and npm still serves the
  previous versions (`foldkit-sync` 0.15.0; `foldkit-host` is not
  published). The line should say: tagged, release run failed in
  `pnpm test`, to be re-run once that test is green on the tag.
- **`TODO.md`, same item, "The release after removes `saved`,
  `Rejection.reason` and the server's `reasons`."** Add: "and
  `editsJournal`'s `absorbed` and `server` options".
- **`TODO.md`, Parked, #190's follow-ups.** Replace the unordered list
  with the order above: the guide off the deprecated options; bind
  nothing under `server/` (with a schema step deleting such rows;
  `prune(through)` not built); `settleTodos` onto `journal.cursors`; the
  sync example's effects as a reaction together with the plan's "done
  when" example, less its guest-slice clause.
- **`docs/design/TODO.md`, "Remote data plane".** "Phases 3 and 4 … wait
  until #437 or `explain` asks, or `read.bench.ts`'s figure passes 1 ms
  per write" should read: "Phases 3 and 4 are not planned (#439 closed
  2026-11-12): #437 shipped without the static function, and the largest
  page costs 0.1 ms per write. Each reopens as a new issue naming its
  consumer," with a link to this note.
- **`docs/design/performance-PLAN.md:419`** (not a TODO file, the same
  claim): the #439 line names "#437 or `explain`" as R1's trigger. It
  should carry the two conditions from the #439 section above.
- **`docs/design/TODO.md`, "Expr contracts".** "Close #500, #479 and #478
  when the branch merges" is done (PR #503); only the Jev review is left.
