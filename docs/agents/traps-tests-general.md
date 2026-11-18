# Traps: tests in general

Read before writing or reviewing any test, fixture, seeded walk or race test.

## Tests that cannot fail

- **A fixture too small cannot tell right from wrong.**
  An ordering test with one row passed while ids were parsed by splitting on every colon (two ids agreeing up to the first colon caught it); a filter test where every row matches passes with the predicate dropped.
- **Two refusals agree, and agreeing is not evidence.**
  The law helper treated two refused calls as equal, so an SQL body that was not SQL "held" every law and its records let a computed write land. Count only cases where both sides return a value, and require one.
- **Do not assert that a pure function left its input alone.**
  `filtered` returns a value and takes the Model by value, so "no connection was created" was structurally guaranteed and could not go red (a rewrite was vacuous too). Assert the signature (what it returns has no Model in it) or delete the test.
- **Verifying by hand is not coverage.**
  `Agent.pick`'s snapshot bug was confirmed in a scratch script and shipped without a test.
- **A memo test needs a second change.**
  A per-item memo learns which Slots an item used on its first draw, so the first change after mounting always misses: a nested-item test passed with the guard deleted until a second move was added. Assert after two transitions.
- **Cleaning up the DOM can hide a leaked runtime.**
  Removing the embed container on unmount made a `FoldkitComponent` that never called `dispose` look like one that did. Assert on something only a live runtime does (a Subscription finalizer running).
- **A negative assertion needs a settle, not a sleep; a wait is tested only where something re-evaluates it.**
  Registry tests asserted "no edit" after a 30-50ms sleep and one failed only under suite load when the sleep ran out before the reinstall and its frame. `await frames.settle(mounted)` (`Frames.track` from `foldkit-mixins/testing`, `Mounted.settled`) waits for what was asked; for I/O a Command started, wait for evidence it finished (a read counter), then settle; a runtime still starting has asked for no frame, so wait for its first drawing. The Agent + Sync test asserted "still pending before the exchange" and passed with the committed view reading the optimistic value, since nothing notified between persist and exchange: force a transition between the two states the test tells apart.
- **`setTimeout(0)` does not wait for a forked fiber.**
  `Resource.lazy`'s tests waited one tick for a background load to ask for its import and a loaded CI runner had not. Wait for evidence the step happened (`asked(n)`).
- **A real-clock test's budget must outlast every press in it.**
  The Timer's pause test ran a 1-second countdown and pressed Start then Pause; two `userEvent.click` round trips on a loaded runner outlasted the second, the pause was stamped past the end and the timer read `done`. Give the clock a minute and assert the end in a test that waits for it (`setCPUThrottlingRate` 20 reproduced it).
- **`new PGlite()` blocks the thread for seconds, whenever it gets there.**
  The constructor returns at once and starts Postgres in the background; initdb runs synchronously in WebAssembly (1.7s here, more on CI), landing in whichever test is running (it timed out a two-millisecond SQLite test in `ledger.test.ts` when built at collection). Construct it in the `beforeAll` that awaits it (`pglite = await PGlite.create()`), or at the top level beside a top-level `beforeAll`.
- **PGlite's database collates by `C`, so a dropped collation passes there.**
  Three of the four `collate "C"`s the Drizzle compiler writes for Postgres could be deleted with every PGlite test green; on Postgres with `--locale=en_US.UTF-8` all four failed, one needing rows the orders disagree on (`a-c`/`ab`, `é`/`f`). CI's `postgres-locale` job runs those tests; after touching how Postgres collates, run `localeCollation.mutations.ts` with `FOLDKIT_LOCALE_PG` set (`conformance.test.ts` says how).

## What a test must actually check

- **A routing test that checks who may claim proves nothing about delivery.**
  `Bundle.assemble` allowed a shared tag and its tests stopped there; routing took the first claimant, so a second URL mirror never read the URL and the application never saw its own `UrlChanged`. Assert what each claimant and the parent receive.
- **`Surface.at` is a `SurfaceSource` too.**
  It has both `projectionOf` and `instancesOf`, so a test using only `Surface.at` entries could not tell whether a `projectionOf` branch mattered (the mutation survived until a test used a `Data.active` entry, which has only `projectionOf`). Test each kind of active entry.
- **A prediction checked only while pending says nothing about after.**
  `Law.check` compared predicted counts with the server's while pending and agreed; once the answer released the layer, a count no active Surface read went back to its old value (#265). Compare the Model after the answer too, and check a test domain from a page that shows none of what it moves.
- **A refresh keeps a tombstone, so "fresh" is not "answered".**
  Since #263 a row asked for again reads `NotFound` until the answer; the CMS overwrite saved at once against the old copy. Wait until `Data.plan(model, projection)` is empty.
- **A pending patch over a tombstone is also a create.**
  Hiding every pending patch over a base tombstone fixed a stub row but hid the CMS draft preview (a create of an id the client knew absent); only the CMS demos caught it. Settle what a delete supersedes by request order and test the create case.
- **A session that spans Messages meets every other Message in between.**
  Editing in place was tested begun, typed, committed; a review put an undo, a redo, an agent's edit and a second double-click between, and Escape no longer restored the text, a commit made an empty undo step, and a second ask restarted the session. Test each transition that can land in the middle.
- **A child's bookkeeping Message must not reset the parent's own state.**
  The Sheet cleared its drag on every Dialog Message, meant for opening and closing; a Dialog animation or `SucceededShowDialog` landing after the press dropped the drag and the Swipe, still holding the pointer, ignored every later press (read on CI as "the press never reaches the handle" for weeks). Reset on the child's transition that means it (`isOpen` changing); log the Messages `update` receives when a CI-only failure resists.
- **A failure judged over several keys must not live in one key's own validation.**
  The form wrote an invariant's error into `reserved`'s field state; a submit validates only `NotValidated` keys and the fix was to raise `quantity`, so every submit was refused until `reserved` was edited. Keep such failures apart (`model.marks`) and clear them on any edit.
- **A grouping key is not the value it groups.**
  Sorting a field set to key `pollLive`'s groups also sorted the fields read, so every patch's `changed` came out alphabetical (only a whole-patch assertion caught it). Key by the sorted set and keep the order the caller asked.
- **`slice(0, n - limit)` drops from the end when `n < limit`.**
  A negative end counts from the back, so a cap written that way empties a small record. Clamp with `Math.max(0, …)`.
- **Merged event streams lose the order between them.**
  Four merged streams read a focus moving between links as `focusin`, `focusin`, `focusout` and cancelled the link focused last. Events that decide state together go through one listener (`Stream.callback`).

## Serializers, markup and library behaviour

- **Read a serializer's output back through the real parser, and read the reference too.**
  The Markdown printer's test asserted `\1. not a list` as the escape for an ordered marker; a backslash before a digit is no escape, so the parser kept it as text and the test locked the bug in. `print` accepted a styled text when it parsed like the canonical text, and the canonical text merged two adjacent lists, so the check trusted a wrong answer. The standard rendering put a table's rows straight in `<table>`; a parser inserts a `tbody` and Foldkit refuses to serialize a view whose parse differs, so no server-rendered table page worked while `createElement` tests passed: test markup with `renderToString` parsed back.
- **Scene does not model keys.**
  A handle keyed by its block still showed its old Mount as mounted after the block changed, with or without `h.Key`, so a Scene test of keying passes or fails for reasons unrelated to the key. Test remounting on the real runtime (`Runtime.makeElement` + `embed`, as `packages/bundle/test/runtime.test.ts` does).
- **Read a library's handler table before describing its semantics.**
  A comment said Foldkit keeps the last of two `OnClick`s on an element; its `addDataOn` chains them all, so the resumable builder dropped bindings. Cite the source line or test it.
- **A lazy slot, a tagged constructor or a rebuilt value breaks a memo keyed by identity.**
  An arrow made inline for `createLazy` never hits (new every render), nor does an array rebuilt per render (`flatMap`) among its arguments: pass a function defined once and values that keep identity. `defineTaggedUnion`'s `Variant({ … })` rebuilds an object or array field with `Schema.make`, so `Listing.Ready({ domain })` holds a copy and a memo keyed on it missed every time (48 rows per filter toggle, #384): key on the value you were handed, before the constructor. domains-plus kept a row's listing by its Remote domain's identity and a read gave an equal domain as a new object, so toggling a filter drew every row again and the frame was slower than with no memo: count a memo's draws in the real app before reporting gain, and key by value where a read rebuilds.
- **`toEqual` cannot tell two `File`s apart.**
  It reads own properties and a File's `name`, `size` and `type` are prototype getters, so a test that the first of two dropped files was sent passed when the last was. Compare by identity (`toBe`).
- **A package's behaviour change is tested by its examples too.**
  The freshness fix (`oldestAt`) ran Remote's and Guard's suites green and was pushed; `examples/remote`'s demo test asserted the old behaviour ("refetch after mutation: none") and only the full run found it. Run `npx vitest run examples --project unit` as well as the package's tests.
- **A seeded walk moves when a case is added.**
  Adding a Message case to `heldValue.test.ts`'s generators changed every walk and seed 174 found a list going `Refreshing` to `Loading` on a `MutationSucceeded` (#263); leaving the new case's generators empty to keep the seeds hid it. File what a moved walk finds before keeping seeds, and after a fix run a scratch copy with ten times the seeds and longer walks (seed 174's fix left a second path, a refresh forgetting tombstones, that only seeds from 1505 reached).
- **`forkIn` on a closed scope never runs the fiber,** and a Deferred it should complete stays pending for good.
  `Scope.addFinalizer` on a closed scope runs at once, so it can interrupt the Deferred.
- **`esbuild`'s `dispose()` waits for an `onEnd` still running,** so a rebuild's swap can run on a stack being stopped.
  Guard the swap on "stopping", not on the harness being closed.
- **`writeFile` empties the file before it writes, and a watcher can read it then.**
  On CI esbuild's watch rebuilt the stack's entry from that empty moment, the empty Worker failed to start ("internal error") and the stack stopped with its D1. The stack now refuses a bundle with no code; a test editing a watched file writes a temporary and renames it over (`save` in `workers.test.ts`).
