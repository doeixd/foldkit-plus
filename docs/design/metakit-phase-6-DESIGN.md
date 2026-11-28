# Metakit phase 6: what to build after composable machines

A server-rendered page reaches the browser twice: once as HTML, and once as the script and data that make the HTML answer a press. Our measured case is the domain search page of `examples/foldkit/domains-plus`, an application written with Foldkit (the framework we build on) and server-rendered by our `foldkit-ssr` package. There the second delivery is 213 kB of compressed script and about 1.5 seconds of main-thread work on a CPU slowed four times, as a phone's is.

Phase 6 of `metakit-phases-2-6-PLAN.md` proposes three things to shrink that second delivery, and says the numbers decide whether each ships:

1. Describe an application's state changes as data, part by part, and join the parts into one description of the whole. (`metakit` is our package for writing rules and state changes as data that can be inspected without running them.)
2. Leave out of the page the data that only unchanging parts of it show, and have the browser skip those parts when it starts.
3. Load, on the first press, only the code that press needs.

This note records the numbers before any of it is built, says what each item would take and the most it could save, and recommends an order. Item 1 is built and described here.

## The words this note uses

- **Model, Message, `update`, view.** Foldkit's terms: the application's whole state, an event, the function that makes the next Model from a Model and a Message, and the function that draws a Model.
- **Hydration.** What Foldkit does when its script first runs on a server-drawn page: it calls the whole view, and matches the result to the elements already in the document instead of creating them.
- **Takeover.** The moment hydration is finished and a press is answered by the runtime. The script measures it as the moment the resume envelope's attribute leaves the document.
- **Resume envelope.** The JSON `foldkit-ssr` writes into the page so the browser starts from the server's Model instead of fetching again. Its `state` field holds the Model fields the page needs; its `parts` hold what other packages resume, here `remote`, the rows `foldkit-remote` read.
- **Long task, blocking.** A long task is a stretch over 50 ms in which the main thread answers nothing. Blocking here is the sum of every long task from navigation start.
- **First-input delay and duration.** What the browser itself records for the first press: how long the press waited for the main thread, and how long until the next paint after its handlers ran. The second is what Interaction to Next Paint (INP) reports for one interaction.
- **Transition, Machine, footprint.** In `metakit`, a transition is one guarded step written as data: a guard, and a list of "this path becomes this value". A Machine is a record of transitions over one state, one per Message tag. A transition's footprint is the list of paths it reads and the list it writes, read from the data without running it.
- **Surface.** In `foldkit-surface`, a named part of the view together with a declaration of which Model paths it reads. Its subpath `foldkit-surface/writes` (`Writes.of`) keeps a Surface's drawing, instead of drawing it again, when the Message just handled is declared to write none of those paths.
- **Chunk.** One file of built script. The page's whole script is one chunk today.

## Recommendation

| Item | Verdict | Most it can save on domains-plus | Ship only if |
| --- | --- | --- | --- |
| 1. Compose machines | Built | Nothing on a page; items 2 and 3 read it | Done |
| 2. Leave out static data, skip static parts | Do not build now | 0 B of data; under 324 ms of 1,474 ms | Blocking falls over 200 ms, or the page 1 kB |
| 3. Load code by Message | Do not build in Foldkit's runtime | About 90 ms of 1,474 ms | Blocking at load under 200 ms |
| 3b. No runtime at load (a "binder") | A spike, later | About 1,270 ms, moved to a later press | The four-part gate in its section |

Each row is argued in its section. In short: the page's data is already small (10.7 kB, 857 B compressed), the time is spent evaluating script that the first draw needs whole, and neither item 2 nor item 3 removes that script. The 1,270 ms in the last row is today's 1,474 ms less the 200 ms the bar allows.

What I would build next is nothing in phase 6. The work that pays first is outside it: declare one example's Messages as transitions. Item 1 now makes that possible for a Model made of parts, and `Writes.of` already turns such declarations into fewer redraws once the page is running. It has no numeric gate here because it is not a phase 6 item; its measure is view and patch time per Message, which `scripts/render-baseline.mjs` reports.

## What the two issues decided

**#436** proposed resuming only the Model fields an interactive region reads. Its body is the oldest part; its comments reverse it. The second comment measured the envelope (26.7 kB then) and found `state` already a pick of ten small fields, about 200 B, so pruning it saves nothing. The bulk was the `remote` part, and that cannot be pruned by interactivity: hydration draws the whole view from the resumed Model, so a price in a row nobody can press must still be in the Model for the first draw to match the server's. The third comment closes the issue on that measurement and names the one way left: skip the static subtree at hydration, which is a different feature. I took from it that item 2's byte saving exists only where a subtree is not drawn at all on the client.

The issue's state today is open: it was reopened minutes after that closing comment, with nothing written since. Meanwhile `docs/upstream-foldkit-ssr.md` and `performance-PLAN.md` record its pruning as landed by 2026-11-09, and the page agrees: the envelope went from 26.7 kB to 10.7 kB and `state` from ten fields to five. So the title's proposal is done, and the only thing still open under the number is the comments' point about skipping subtrees.

**#472** (closed) proposed loading the runtime on the first sign that a person means to act. Its first comment set three conditions: do not send the work to the server, report first-press latency beside script at load, and keep what a person did before the runtime started. Its second comment fixed the scope by a design note. Its last comment is the result. The loader, a 2.3 kB script that fetches the runtime's chunk later and holds a press meanwhile, was built as `foldkit-ssr/loader` and stays opt-in, because it "defers the cost but removes none of it": in that comment's own measurement blocking was 909 ms against 943 ms, total script 1.9 kB larger, takeover 62 ms later. The issue reopens if evaluating the runtime's chunk on the slowed CPU falls under 200 ms. I took from it the bar for item 3: under 200 ms of blocking at load, and a first press no slower.

Two things those threads asked for are already done and are not part of this phase. The envelope's quotes are no longer escaped (`f5b38c563`): in today's page the attribute is 10,769 B for 10,741 B of JSON, so moving it to a `<script type="application/json">` would save 28 B. And static regions exist: `SSR.static` (`packages/ssr/src/shared.ts`) hands Foldkit a region as trusted HTML and never calls its draw function on the client. A spike of it on domains-plus's header, hero and footer (`472-427-432-435-ssr-delivery-DESIGN.md`, phase 4) found no difference outside the runs' spread and was not kept.

## The baseline

`node scripts/phase6-baseline.mjs` builds domains-plus for production with the build id pinned, runs the built Worker in the script's own process behind a plain HTTP server, and drives headless Chromium over `/?q=acme`. It takes the long-task observer, the takeover probe and the environment record from `scripts/render-baseline.mjs`, which already measured a boot. I chose domains-plus because both issues measured it and another session is changing `examples/reference`.

Taken at commit `c671476ec` on 2026-11-21: Windows 11, Ryzen 7 6800U, Chromium 156.0.8078.4, CPU slowed 4 times, a fresh browser context per run, 7 runs after 2 warm-ups, the whole script run twice. The tree also held another session's uncommitted edits to four files of `packages/remote/src`, which the page bundles.

**Bytes.** These repeat exactly, apart from a time the page stamps (about 30 B of compressed HTML).

| What | Bytes |
| --- | ---: |
| The page, HTML | 89,167 (6,016 to 6,044 brotli) |
| Resume envelope, as written in the page | 10,769 |
| Resume envelope, JSON | 10,741 (857 brotli) |
| of which `parts.remote`, the rows read | 7,923 |
| of which `bindings`, which element sends which Message | 2,437 |
| of which `state` (five fields) | 259 |
| of which `events`, `route`, `plan`, `v` | 48 |
| Script loaded before takeover (one file) | 877,636 (212,869 brotli) |

The four "of which" rows are the fields' values and sum to 10,667 B; the other 74 B of the JSON are the field names and punctuation. So everything but the rows read is 2,818 B.

The script figure is larger than the 201,000 B compressed ceiling in the example's `bundle.test.ts`, because that test builds against each package's published `dist` and this script builds the example as its own `vite build` does. Compare this figure only with itself.

**Time at 4x CPU.** Median of 7, with the least and most in brackets. The two columns are the two runs of the script.

| What | First run, ms | Second run, ms |
| --- | ---: | ---: |
| Blocking, every long task | 1,474 (1,441 to 1,643) | 1,522 (1,468 to 1,651) |
| Blocking past 50 ms per task | 1,324 (1,291 to 1,443) | 1,372 (1,318 to 1,498) |
| Longest task | 1,207 (1,172 to 1,284) | 1,241 (1,191 to 1,317) |
| Takeover, from navigation start | 1,333 (1,245 to 1,382) | 1,364 (1,240 to 1,419) |
| Press at rest: input delay | 4.6 (3.6 to 6.5) | 4.7 (3.4 to 5.4) |
| Press at rest: to next paint | 104 (88 to 152) | 104 (88 to 120) |
| Press at rest: to the cart showing it | 280 (223 to 346) | 279 (236 to 292) |
| Press at `load`: input delay | 4.2 (3.0 to 5.3) | 4.1 (3.2 to 5.1) |
| Press at `load`: to next paint | 104 (96 to 120) | 104 (88 to 112) |
| Press at `load`: to the cart showing it | 706 (583 to 737) | 675 (636 to 736) |

The interaction is the first press of "Add … to cart" on the first result. Every run kept all 746 served elements (none rebuilt), and no press at `load` fell through to the form's post. The browser reports a duration in steps of 8 ms.

**The noise.** A later difference counts only when it is larger than the widest range seen here for that figure: 202 ms for blocking, 179 ms for takeover, 154 ms for the press at `load`, 123 ms for the press at rest, 64 ms for time to next paint. The medians of the two runs differ by 48 ms for blocking and 31 ms for takeover, so a change inside those is the machine, not the code. The 943 ms that #472 recorded came from another build path and another day; do not compare it with these.

**Where the time goes.** `node scripts/phase6-baseline.mjs --phases` makes a second build with Foldkit's own timing of each `view` and `patch` switched on. Before takeover the view ran for 203 ms (193 to 238) and the patch that matches it to the served elements for 121 ms (98 to 136). That is 324 ms of the 1,474 ms. The remaining 1,150 ms or so is evaluating the 878 kB of script and starting the runtime; I got that figure by subtraction, and did not separate the two.

## Item 1: a parent machine made of child machines (built)

**The problem.** An application's Model is made of parts, and a part's transitions are written against the part: a counter's `Added` knows a counter. Everything that reads footprints needs them as paths from the whole Model: `Graph.analyze` (`packages/metakit/src/graph.ts`), which matches a transition's writes to a view's reads, and `Writes.of` (`packages/surface/src/writes.ts`), which uses that match to keep a Surface's drawing when a Message did not write what it reads.

**What existed.** `Transition.lift(path, transition)` (`packages/metakit/src/transition.ts`) already moves one transition under a path: its reads and writes gain the path, and its guard gains "there is a child here", so a write never invents the struct it writes into.

**What was built**, in `packages/metakit/src/machine.ts`:

- `Machine.lift(path, machine)` lifts every transition of a child Machine. The path may lead to a nullable or optional field.
- `Machine.compose({ state, transitions, children })` makes one Machine from the parent's own transitions and its children. Each child has a name, and its transitions are named by that name followed by their own tag: the child `Left` with `Added` gives `LeftAdded`. The name `''` keeps the tags.

There is no new noun. The plan's "Block" is a child Machine lifted to a path, and the result of composing is a Machine, so it can be lifted again, proved, or analyzed as any other. I added two functions and not one because the name-then-tag rule needs the children as a record, and tying each child's path to its machine's state needs a call per child for TypeScript to check.

**What it guarantees**, each with a test in `packages/metakit/test/blocks.test.ts`:

- Two transitions that would share a tag do not compile (the error names the tag), and `compose` throws naming both sources. A plain object spread would have kept the last one silently.
- One child Machine at two paths gives two sets of Messages, each writing its own place.
- `dispatch`, `canDispatch` and `affordances` on the composed Machine agree with the child run alone on the child's state, over a table of states.
- A child Message's writes reach a read of the child's path, of a path above it and of the written path below it, and no sibling. `packages/surface/test/writesComposed.test.ts` shows the same on the Foldkit runtime: a Surface over one child is not drawn again by the other child's Message.

**What it does not do.**

- A child sits at a path fixed when the Machine is defined. A list of children whose keys are chosen while the application runs has no path to lift along.
- A Machine's `affordances(state)` sorts its Messages into those that can be sent, those that cannot (`disabled`), and those whose answer needs something not given yet (`pending`). A child at a nullable field holding `null` is `disabled`. A child at an optional field whose key is absent is refused when dispatched but listed as `pending`: the state given to `affordances` may be incomplete, so a missing key reads as "not known yet".
- An emitted value is the child's own. The caller knows which child emitted by the Message it sent.

**Cost.** `metakit`'s main entry is unchanged at 722 B, and no example page imports it. `dist/machine.js` grew from 2,097 to 3,886 B uncompressed; a bundler drops `lift` and `compose` from a page that calls neither.

## Item 2: static pruning and partial hydration

The plan asks for two things under one heading. Static pruning: work out on the server which values can never change, draw them into the HTML, and leave their data out of the envelope. Partial hydration: have the client skip those subtrees, and update what can change through anchors, meaning elements marked with the Model path they show, written to directly when that path changes.

**What exists.** `SSR.static` skips a region's draw on the client. When the server renders, `foldkit-ssr` checks that every path a Surface reads will be there in the browser, and refuses the page otherwise (`coverOf` in `packages/ssr/src/index.ts`). For each path it records how it is covered: sent in `state`, rebuilt in the browser, or restored by a resumed part (`'part'`, added this week). `Graph.analyze` names the bindings no transition can affect. `pathsRead` in `foldkit-surface` gives a Surface's read paths.

**What would be built.** First, one more way for a path to be covered, "read only inside static regions", so the envelope can leave those paths out; this is ours, in `packages/ssr`. Second, the anchors and the code that writes to them. That second part is a renderer: it must draw each value exactly as the view would, beside a Foldkit that believes it owns those elements.

**What Foldkit allows.** Hydration draws the entire view and adopts the served elements against it; the only subtree it does not walk is trusted HTML, and it still parses that HTML and compares it. `docs/upstream-foldkit-ssr.md` lists "externally owned children and a renderer per subtree" under what we are not asking for, as large renderer changes. A smaller request to Foldkit, to adopt a subtree without reading it, is written but not sent: the delivery design decided to send it only once a static region is shown to cost more to adopt than to draw, and the spike did not show that. So from our packages we can skip a region and omit its data; we cannot update inside a skipped region without Foldkit drawing it.

`Graph.pruneStatic` does not apply as the plan assumes. It folds expressions against known values, and no view in the repository is written as expressions: a Surface's projection is a function with declared read paths. The equivalent for Surfaces is the resume plan's pick of fields, which is already down to 259 B.

**Hazards, and the test for each.**

- *The client draws differently from the server.* Keep the served elements before any script runs and assert they are all still in the document after takeover, as the script's `rebuiltElements` and `examples/reference`'s adoption test do. A console warning is not a test: Foldkit warns only in development.
- *A pruned value changes after all.* A development-only check that resumes the full Model as well and reports any draw that reads an omitted path, as #436's body asked; and a server test that a region with a handler inside it is refused as static (`BindingInStaticRegion` exists).
- *A person navigates on the client to a page whose static region was never served.* An end-to-end test of that navigation; the region's draw function must still be in the bundle, which is why erasing it was not built.
- *Something typed before the script ran.* `KeepTyped` and the kept checkbox, radio and select states already cover fields; a skipped region must hold no field, tested by the same refusal as a handler.

**Expected gain.** In data: nothing on this page. The 7,923 B of `remote` are the prices in the result rows, and every row has an "Add to cart" button, so no row is static. Everything else in the envelope together is 2,818 B, and the whole envelope is 857 B once compressed. In time: at most the 324 ms of view and patch, if every element were skipped. The parts of this page that are static are its header, hero and footer, and the earlier spike that skipped them (12 runs, another build) found boot 7 ms faster in one run and 96 ms slower in the other.

**Threshold.** Ship the static cover or an anchor renderer only if, on a real page over two runs of the script, blocking falls by more than 200 ms or the compressed page shrinks by more than 1 kB. Neither can happen on domains-plus. **Recommendation: do not build. Reopen for a page whose static regions carry kilobytes of fetched data**, such as a long description read through `foldkit-remote`; then build only the cover, which needs nothing from upstream.

## Item 3: Message-scoped code splitting

The plan: the page loads only a small script that binds events; the first press loads the code of the Message it sends.

**What exists.** `Bundle.lazy` (`packages/bundle/src/lazy.ts`) puts a part's `update` and view in a chunk loaded by the first Message that reaches it. `foldkit-ssr`'s `lazy` option waits at boot for the chunks the resumed Model draws, so a page never hydrates against a placeholder. The loader holds a press for up to 3 seconds while the runtime loads, releases a held form to the browser's own post if the chunk fails, and keeps typed fields; it does not keep a scroll position.

**The bound.** Splitting by Message can move only the application's own `update` code. The view cannot move: hydration calls all of it. The runtime cannot move: it is what hydrates. Two earlier figures size what is left, and I did not measure either again. The delivery design's bundle report (2026-11-10, built against `dist`, so its total differs from this note's 213 kB) put the application's own code at 16.6 kB of 217 kB compressed. #472's body put Foldkit and Effect, the library Foldkit is built on, at about 91 kB together. If all 16.6 kB left the first chunk, that is 8% of the script and, in proportion, about 90 ms of the 1,150 ms: inside the noise. And if time follows bytes, 200 ms of the 1,150 ms is a first chunk near 37 kB, less than the runtime alone.

**Recommendation: do not build Message-scoped splitting inside Foldkit's runtime.** `Bundle.lazy` already gives the per-part form of it, and the measured ceiling is under the noise.

### The binder: the only form that could meet the bar

The bar is reachable only if Foldkit's runtime is not evaluated at load. That means a small script, a binder, that holds the resumed state, answers a press by running a declared transition, and writes the changed values into anchors; Foldkit loads for the first Message that has no declared transition. Item 1 and `Graph.analyze` are the parts of this that exist: a composed Machine says, for each Message, which paths change, and so which anchors to write.

It is a second renderer, and it inherits every hazard of item 2 plus three of its own:

- *Foldkit must later hydrate a page the binder changed.* It would start from the binder's state, which looks possible from our side because `foldkit-ssr` reads the Model from the envelope at boot; I have not tried it. Test: press through the binder, let the runtime load, assert every served element is kept.
- *The first undeclared press pays for the whole runtime.* Today that press takes 104 ms to the next paint. Behind a 1.2 second evaluation it would take over a second: the loader's first press at `load` took about 1,200 ms against 312 ms (`decisions-2026-11-12-ssr-styling.md`). Evaluating the runtime when the page is idle instead does not shorten that long task; it only moves it to whenever the browser is next idle, and a press that lands during it waits.
- *The chunk fails to load.* The loader's rule stands: a held form is released to the browser, and anything else is dropped after 3 seconds. Test: hold and fail the chunk request, as `loader.e2e.ts` does.

No Message of domains-plus is declared as a transition today (its source imports no `metakit`), and no example's source calls `Writes.of`. So the binder has nothing to run yet.

**Threshold for a spike, when there is something to run:** on the named press, script before the first press under 20 kB compressed, blocking at load under 200 ms, the press at rest no slower than 280 ms plus the 123 ms range, and a first undeclared press answered within 200 ms of today's. If the last fails, stop: it is #472 again.

## What the expression language is not asked to do

None of this phase adds an operator. In particular `metakit` expressions are not asked to:

- **Draw.** No HTML, no templates, no mapping over rows. An anchor would show a value an expression produced; what element shows it stays the view's business.
- **Describe effects.** A transition's `emits` stays data the caller acts on. Commands, fetches and cookies are not expressions.
- **Address children chosen at run time.** Paths are fixed when a Machine is defined. A list of parts keyed by id needs a design of its own.
- **Decide what is static.** That comes from what the declared transitions write, which is `Graph.analyze`, not from a new analysis.

## Order, and what reopens each item

1. **Done:** composed machines.
2. **Next, outside this phase:** declare one example's Messages as a composed Machine and draw it through `Writes.of`. It is the first consumer the declarations lack, and it is measurable with `scripts/render-baseline.mjs`, which reports view and patch time per Message.
3. **Item 2:** reopens for a page whose static regions carry more than 1 kB compressed of fetched data.
4. **Item 3 in the runtime:** closed by its ceiling.
5. **The binder:** reopens when an example's presses are mostly declared transitions, with the four-part gate above.

To take the numbers again: `node scripts/phase6-baseline.mjs --out before.json`, alone on the machine, twice. Add `--phases` for the view and patch split, and `--no-build` to reuse the build.
