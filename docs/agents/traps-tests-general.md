# Traps: tests in general

Read before writing or reviewing any test, fixture, seeded walk or race test.

- **Read a library's handler table before describing its semantics.** A
  comment said Foldkit keeps the last of two `OnClick`s on an element; its
  `addDataOn` chains them all, so the resumable builder dropped bindings. Cite
  the source line, or test it.
- **A grouping key is not the value it groups.** Sorting a field set to key
  `pollLive`'s groups also sorted the fields read, and every patch's `changed`
  came out alphabetical; only a suite asserting a whole patch caught it. Key
  by the sorted set, and keep the order the caller asked.
- **`esbuild`'s `dispose()` waits for an `onEnd` still running,** so a rebuild's
  swap can run on a stack being stopped. Guard the swap on "stopping", not on
  the harness being closed.
- **`writeFile` empties the file before it writes, and a watcher can read it
  then.** On CI esbuild's watch rebuilt the stack's entry from that empty
  moment, the empty Worker failed to start ("internal error"), and the stack
  stopped with its D1. The stack now refuses a bundle with no code; a test
  that edits a watched file writes a temporary and renames it over (`save`
  in `workers.test.ts`).
- **`forkIn` on a closed scope never runs the fiber,** and a Deferred it should
  complete stays pending for good. `Scope.addFinalizer` on a closed scope runs
  at once, so it can interrupt the Deferred.
- **A failure judged over several keys must not live in one key's own
  validation.** The form wrote an invariant's error into `reserved`'s field
  state; a submit validates only `NotValidated` keys, and the fix was to raise
  `quantity`, so every submit was refused until `reserved` itself was edited.
  Keep such failures apart (`model.marks`) and clear them on any edit.
- **A pending patch over a tombstone is also a create.** Hiding every pending
  patch over a base tombstone fixed a stub row but hid the CMS draft preview
  (a create of an id the client knew absent); every remote test stayed green
  and only the CMS demos caught it. Settle what a delete supersedes by request
  order, and test the create case.
- **`slice(0, n - limit)` drops from the end when `n < limit`.** A negative end
  counts from the back, so a cap written that way empties a small record.
  Clamp with `Math.max(0, …)`.
- **Two refusals agree, and agreeing is not evidence.** The law helper treated
  two refused calls as equal, so an SQL body that was not SQL "held" every law
  and its records let a computed write land. A check comparing two sides
  passes when neither answers: count only cases where both return a value,
  and require one.
- **Test a serializer by reading its output back, not by its string.** The Markdown
  printer's test asserted `\1. not a list` as the escape for an ordered marker; a
  backslash before a digit is no escape, so the parser kept it as text, and the test
  locked the bug in. A round trip through the real parser is what catches it.
- **Server markup has to be what a parser builds from it.** The standard rendering put a table's
  rows straight in `<table>`; a parser inserts a `tbody`, and Foldkit refuses to serialize a view
  whose parse differs, so no server-rendered page with a table worked. Tests that built DOM with
  `createElement` could not see it. Test markup by rendering it to a string (`renderToString`)
  and parsing it back.
- **Scene does not model keys.** A handle keyed by its block still showed its old Mount as
  mounted after the block changed, with or without `h.Key`, so a Scene test of keying passes
  or fails for reasons unrelated to the key. Test remounting on the real runtime
  (`Runtime.makeElement` + `embed`, as `packages/bundle/test/runtime.test.ts` does).
- **A check against a reference is only as good as the reference.** `print` accepts a styled
  text when it parses like the canonical text, and the canonical text merged two adjacent lists
  into one, so the check trusted a wrong answer. Read the reference itself back too.
- **`toEqual` cannot tell two `File`s apart.** It reads own properties, and a
  File's `name`, `size` and `type` are prototype getters, so a test that the
  first of two dropped files was sent passed when the last was. Compare a File
  by identity (`toBe`).
- **A package's behaviour change is tested by its examples too.** The
  freshness fix (`oldestAt`) ran Remote's and Guard's suites green and was
  pushed; `examples/remote`'s demo test asserted the old behaviour ("refetch
  after mutation: none" after an answer that carried one field), and only the
  full run found it. After changing what a package does, run
  `npx vitest run examples --project unit` as well as the package's own tests.
- **Verifying by hand is not coverage.** `Agent.pick`'s snapshot bug was
  confirmed in a scratch script and shipped without a test.
- **A seeded walk moves when a case is added.** Adding a Message case to
  `heldValue.test.ts`'s generators changed every walk, and seed 174 then
  found a list going `Refreshing` to `Loading` on a `MutationSucceeded`
  (#263). Leaving the new case's generators empty to keep the seeds hid it.
  File what a moved walk finds before keeping the seeds. And a walk's green
  is only its seeds: after fixing what one found, run a scratch copy with ten
  times the seeds and longer walks. Seed 174's fix left a second path (a
  refresh forgetting tombstones) that only seeds from 1505 reached.
- **A fixture too small cannot tell right from wrong.** An ordering test with
  one row passed while ids were parsed by splitting on every colon; two ids
  agreeing up to the first colon caught it. A filter test where every row
  matches passes when the predicate is dropped entirely.
- **A list placement needs a collation on every text key of its order,** the
  tie-break on `id` included (`Collation.binary`), or the client cannot place
  a row there.
- **PGlite's database collates by `C`, so a dropped collation passes there.**
  Three of the four `collate "C"`s the Drizzle compiler writes for Postgres
  could be deleted with every PGlite test green; on a Postgres created with
  `--locale=en_US.UTF-8` all four failed, and one needed rows the two orders
  disagree on (`a-c`/`ab`, `é`/`f`) before it did. CI's `postgres-locale`
  job runs those tests on such a database; after touching how Postgres
  collates, run `localeCollation.mutations.ts` with `FOLDKIT_LOCALE_PG` set
  (`conformance.test.ts` says how).
- **Do not assert that a pure function left its input alone.** `filtered`
  returns a value and takes the Model by value, so "no connection was created"
  was structurally guaranteed and could not go red. I noticed the test was weak,
  rewrote it, and it was still vacuous for the same reason. Assert the
  signature — what it returns has no Model in it — or delete the test.
- **Cleaning up the DOM can hide a leaked runtime.** Removing the embed
  container on unmount made a `FoldkitComponent` that never called `dispose`
  look identical to one that did. Assert on something only a live runtime does,
  such as a Subscription finalizer running.
- **A memo test needs a second change.** A per-item memo learns which Slots an
  item used on its first draw, so the first change after mounting always
  misses. A nested-item test passed with the guard deleted until a second
  move was added. Assert after two transitions, not one.
- **A lazy slot compares its function too.** Passing an arrow made inline to
  `createLazy` never hits, since the function is new every render; so does an
  array rebuilt per render (`flatMap`) among its arguments. Pass a function
  defined once, and values that keep their identity.
- **A Foldkit tagged constructor copies a struct field.** `defineTaggedUnion`'s
  `Variant({ … })` passes primitives through but rebuilds an object or array
  field with `Schema.make`, so `Listing.Ready({ domain })` holds a copy, and a
  memo keyed on that copy misses every time it is built: R3 blamed Remote for
  the "equal but new" domain that drew 48 rows per filter toggle (#384). Key
  a memo on the value you were handed, before it goes into a constructor, and
  count draws to find where identity is lost.
- **A session that spans Messages meets every other Message in between.**
  Editing in place was tested begun, typed, committed; a review put an undo,
  a redo, an agent's edit and a second double-click between, and Escape no
  longer restored the text, a commit made an empty undo step, and a second
  ask restarted the session. For state held across transitions, test each
  transition that can land in the middle.
- **Merged event streams lose the order between them.** Four event streams
  merged read a focus moving between links as `focusin`, `focusin`,
  `focusout`, and cancelled the link focused last. Events that decide state
  together go through one listener (`Stream.callback`).
- **`Surface.at` is a `SurfaceSource` too.** Its value has both `projectionOf`
  and `instancesOf`, so a test using only `Surface.at` entries cannot tell
  whether a `projectionOf` branch matters; that mutation survived until a
  test used a `Data.active` entry, which has only `projectionOf`. Test each
  kind of active entry.
- **A routing test that checks who may claim proves nothing about delivery.**
  `Bundle.assemble` allowed a shared tag and its tests stopped there; routing
  took the first claimant, so a second URL mirror never read the URL and the
  application never saw its own `UrlChanged`. Assert what each claimant and
  the parent receive.
- **`setTimeout(0)` does not wait for a forked fiber.** `Resource.lazy`'s tests
  waited one tick for a background load to ask for its import, and a loaded
  CI runner had not. Wait for evidence the step happened (`asked(n)`).
- **A refresh keeps a tombstone, so "fresh" is not "answered".** Since #263 a
  row asked for again reads `NotFound` until the answer; the CMS overwrite
  saved at once against the old copy. Wait until `Data.plan(model,
  projection)` is empty.
- **A negative assertion needs a settle, not a sleep.** Registry tests
  asserted "no edit" after a 30-50ms sleep, and one absorbed-edit test failed
  only under full-suite load, when the sleep ran out before the reinstall
  and its frame. `await frames.settle(mounted)` (`Frames.track` from
  `foldkit-mixins/testing`, `Mounted.settled`) waits for what was asked; for
  I/O a Command started, wait for evidence it finished (a read counter),
  then settle. A runtime still starting has asked for no frame: wait for its
  first drawing before the first settle.
- **A real-clock test's budget must outlast every press in it.** The Timer's
  pause test ran a 1-second countdown and pressed Start, then Pause: two
  `userEvent.click` round trips on a loaded runner took longer than the
  second, the pause was stamped past the end, and the timer read `done`.
  Give the clock far more time than the presses need (a minute), and assert
  the end in a test that waits for it. `setCPUThrottlingRate` 20 reproduced it.
- **`new PGlite()` blocks the thread for seconds, whenever it gets there.**
  Its constructor returns at once and starts Postgres in the background;
  initdb then runs synchronously in WebAssembly (1.7s here, more on CI),
  landing inside whichever test is running. Built while a describe was
  collected, it timed out a two-millisecond SQLite test above it in
  `ledger.test.ts`. Construct it in the `beforeAll` that awaits it
  (`pglite = await PGlite.create()`), or at the top level beside a top-level
  `beforeAll`.
- **A prediction checked only while pending says nothing about after.**
  `Law.check` compared every predicted count with the server's while the
  write was pending, and agreed; once the answer released the layer, a count
  no active Surface read went back to its old value (#265), because the
  answer read only what the page showed. Compare the Model after the answer
  too, and check a test domain from a page that shows none of what it moves.
- **A wait is only tested where something re-evaluates it.** The Agent + Sync
  test asserted "still pending before the exchange" and passed with the
  committed view reading the optimistic value: nothing notified between persist
  and exchange, so the wrong read was never evaluated. Force a transition
  between the two states the test tells apart.
- **A child's bookkeeping Message must not reset the parent's own state.**
  The Sheet cleared its drag on every Dialog Message, meant for opening and
  closing; a Dialog animation or `SucceededShowDialog` landing after the press
  dropped the drag, and the Swipe, still holding the pointer, ignored every
  later press. On CI that read as "the press never reaches the handle" for
  weeks. Reset on the child's transition that means it (`isOpen` changing),
  and when a CI-only failure resists, log the Messages `update` receives.
- **A memo keyed by identity misses on a value a read rebuilds.** domains-plus
  kept a row's listing by its Remote domain's identity; a read gave an equal
  domain as a new object, so toggling a filter drew every row again, and the
  frame was slower than with no memo (a miss also walks and dedupes what it
  drew). Count a memo's draws in the real app before reporting its gain, and
  key by value where a read rebuilds.
