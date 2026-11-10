# How a served page is delivered: the runtime on intent, streaming, islands, reads first (#472, #427, #432, #435)

Status: Proposed 2026-11-10: awaiting the owner's decisions.

Four issues ask how a page `foldkit-ssr` renders reaches the browser: when its
bytes leave the server (#427, #435), and how much script the browser needs for
them (#472, #432). They share one request path and one handover, so this note
treats them as one design. Nothing here is built. Its place in the wider plan
is [performance-PLAN.md](./performance-PLAN.md) (order item 5, Phases 3 and
4) and [declared-optimization-DESIGN.md](./declared-optimization-DESIGN.md).

Code is cited as `file:line` at commit `1c1956b`. Foldkit is 0.170.0 and
`@foldkit/vite-plugin` 0.29.0, read from `node_modules`; `foldkit/…` paths
below are under `foldkit/dist`.

## 1. The problem

### Measured today

All figures are domains-plus, from performance-PLAN.md.

| What | Figure | When, how |
| --- | --- | --- |
| JavaScript loaded at start, brotli | 268 KB live at 0.38.0; one chunk of 216.9 KB built against `dist` | 2026-11-02 live; `test/bundle.test.ts` (ceiling 217,500) |
| Stock Foldkit, Solid 2.0, same page | 215 KB, 79 KB | 2026-11-02 |
| Effect and Foldkit in that chunk | 50.3 + 40.8 = 91 KB (estimate by share) | `scripts/bundle-report.mjs`, 2026-11-02 |
| The app's own `src` in that chunk | 16.6 KB, 7.9% | same |
| A never-seen search, warm CPU | about 119 ms under Node; 125 to 150 ms median on workerd, 267 to 318 ms cold | 2026-11-09, 2026-11-10 (`scripts/workerd-cpu.mjs`) |
| Of that, Foldkit checking its own output with parse5 | 41 ms, after #413 took the page from 362 KB to 69 KB and parse5 from 175 ms | 2026-11-09 |
| Time to first byte, live, a kept page | 81 ms against Solid 71 and stock Foldkit 55 | 2026-11-02 |
| Speed Index, mobile (0.37.0) | 3.2 to 4.1 s against stock Foldkit 1.5 to 1.6 s | 2026-11-02 |
| The Workers free plan's CPU limit | 10 ms; 13 of 15 never-seen searches failed with 1102 at 0.38.0 | 2026-11-02 |

Two facts decide most of what follows:

- **The script's weight is libraries.** Effect, Foldkit, Remote, `@foldkit/ui`
  and the style system are about 190 of 217 KB. No change to the app's own
  code, and no removal of its display code, reaches them.
- **The server's cost is CPU, not waiting.** domains-plus prices in process,
  and the profile gives pricing none of a search's time
  (performance-PLAN.md, order item 4). The time before the first byte is
  rendering and Foldkit's checks.

### What each issue asks

| Issue | Asks | Done when |
| --- | --- | --- |
| #472 | The page ships a small loader; the runtime's chunk loads and resumes on the first intent, or on idle | under 10 KB of JavaScript at start, total JS and first-interaction INP reported beside it; an e2e shows a press before boot handled once |
| #427 | `SSR.entry` streams: head at once, first screen when its reads resolve, the rest, resume data last | time to first byte is the head's cost; a test reads the chunks in order; the no-JS e2e is unchanged |
| #432 | A region that sends no Messages and reads nothing the client changes ships no client code; a spike first | the spike's numbers are recorded |
| #435 | Every read a route needs starts when the route matches, before rendering; a checker reports an undeclared read | price reads start at route match; a deliberately undeclared read is reported |

The owner's comment on #472 adds three requirements: start on hover or focus
so the GET form stays a fallback (it is the uncached render that fails with
1102); download on idle and evaluate on intent, reporting total JS and INP;
and read what the person changed before boot (ticked boxes, selects, scroll)
into the Model.

## 2. How SSR works here today

### The request path

```text
host (generated fetch module)            foldkit handleRequest
  -> renderPage(request)                 SSR.entry                 (ours)
       init            via renderToString with an empty view
       prepare         Data.satisfy: every read, before any view
       render 1        renderToString from the server's Model      (collect)
       render 2        renderToString from the browser's Model     (replay)
       compare, write the envelope on the root
     <- Rendered(application)
  -> renderDocument(application, assets) -> injectIntoTemplate     (Foldkit)
  <- Response(string)
```

| Step | Owner | Where |
| --- | --- | --- |
| The fetch module, with the built assets closed over | `@foldkit/vite-plugin` | `build.js:244-266`: `renderPage: server.renderPage`, `renderDocument: application => renderDocument(application, assets)` |
| Method and asset refusals, then `renderPage`, then the `Response` | Foldkit | `experimental/server/fetch.js:51-90` |
| A `Responded` result passes through untouched; a `Rendered` one is put in the document | Foldkit | `experimental/server/entry.js:29-43` |
| The document: head, preloads, `<div id="root">`, the entry `<script type="module">` | Foldkit, called by the app's `renderDocument` | `experimental/server/document.js:23-42`; `examples/foldkit/domains-plus/src/server/entry.ts:50-52` |
| One request answered | `foldkit-ssr` | `packages/ssr/src/index.ts:1532` (`answer`) |
| `init`'s Model, taken by a render with an empty view | `foldkit-ssr` | `index.ts:2013-2030` (`startOf`) |
| `prepare`, before any view | `foldkit-ssr`, the app's Effect | `index.ts:2041-2052`; domains-plus's is `Data.satisfy` (`server/entry.ts:60-68`) |
| Two renders and the comparison that refuses a view reading unsent state | `foldkit-ssr` | `index.ts:882`, `index.ts:953`, `index.ts:976-991` |
| The page cache: a page kept when every read was public | `foldkit-ssr` | `index.ts:1716-1750` (`keepable`), `index.ts:1762-1790` |

So a rendered request calls Foldkit's `renderToString` three times and
`injectIntoTemplate` once, and nothing is sent until all four return.

Two corrections to the issues' wording, from the code:

- **Reads already start before any view runs.** #435 says the server
  discovers reads while it renders. It does not: `prepare` runs
  `Data.satisfy` on `init`'s Model before either render. What is serial is
  inside `satisfy`: each pass awaits one Surface's read before planning the
  next (`packages/remote/src/remote.ts:1494-1499`), and a read revealed by
  another's answer waits for the next pass (`domain.ts:555-563`). domains-plus
  has three reading Surfaces (`client/app.ts:562-581`), so up to three round
  trips a pass where one would do.
- **A subtree the client leaves alone already exists.** #432 says islands
  need a Foldkit hook to leave a subtree unmanaged. `SSR.static` does that
  with public API: on a resumed page it hands the served markup back as
  trusted `InnerHTML` (`packages/ssr/src/shared.ts:601-610`), and Foldkit
  adopts such an element without walking its children
  (`hydrate.js:597-640`). What it does not do is remove the region's view
  code from the client bundle, or the runtime.

### Where the resume data lives

On the stamped root's start tag, as the attribute `data-foldkit-plus-resume`
(`shared.ts:35`, written by `withEnvelopeAttribute`, `index.ts:179` and
`index.ts:1017`; read at `shared.ts:479`). It moved there on 2026-09-29 so a
page is a plain `Rendered` result that any host injects whole
(`docs/upstream-foldkit-ssr.md`, status). It is therefore among the first
bytes of the body, not the last.

### When the runtime boots

The entry script is one module; domains-plus's imports the whole application
and calls `SSR.hydrate` (`client/entry.ts:5-9`, `:23`). `foldkit-ssr/client`
imports `foldkit/runtime` and `effect` statically (`client.ts:7-9`).

A deferred boot is already built, inside that module:

| Piece | Where |
| --- | --- |
| A plan's `start: 'now' \| 'idle' \| 'on-interaction'` | `shared.ts:249`, `:271` |
| The page answers events from its markers and queues the Messages | `listen.ts:247-310`, `client.ts:455-481` |
| The runtime takes the queue ahead of its first Message; the booting event counts once | `client.ts:214-230`, `:482-492` |
| Typing before the script is kept and replayed (`rh.KeepTyped()`) | `keep.ts:35`, `:109`, `:122`, `:148`; `client.ts:277-293` |
| The server refuses a deferred plan whose Subscriptions would start late unless named `deferrable` | `index.ts:760-787`, `:922-928` |
| A handler the page cannot name is marked `*` and reported | `index.ts:1228`; `listen.ts:282-285` |
| A form posts its Message with scripts off (`fallback: 'server'`) | `client.ts:326-331`, `index.ts:2062` |

domains-plus does not use it: its plan sets no `start`
(`client/app.ts:679-713`), so it boots as its script runs.

What `start` defers is the runtime's boot. It does not defer the download or
the evaluation of the chunk, which is where 217 KB goes. That is the gap #472
names.

### How hydration adopts markup

| Fact | Where |
| --- | --- |
| The root carries `data-foldkit-app` and `data-foldkit-build`; a different build is rebuilt, not adopted | `hydrationMarker.js`, `buildToken.js`, `hydrate.js:862-877` |
| Keyed elements carry fingerprints, checked at adoption | `hydrationMarkers.js` |
| Where the DOM disagrees with the first client view, the nearest parent's children are cleared and rebuilt | `hydrate.js:32`, `:676-726` |
| A controlled value the person changed is re-asserted to the Model's | `hydrate.js:152`, `:220` |
| The mismatch warning exists only in development | `hydrate.js:348`, `:359`, `:888` (`import.meta.hot`) |
| `SSR.hydrate` starts from the resumed Model so the first view is the served page | `client.ts:208-213`, `:253-263` |
| It strips its own markers and each form's fallback as it boots | `client.ts:318-332` |

## 3. Constraints

### Foldkit's

| Constraint | Consequence |
| --- | --- |
| `renderToString` returns the whole root as one string, checked whole | Foldkit cannot render a region alone or yield markup early |
| `renderDocument` returns a string and `toResponse` builds the `Response` from it (`entry.js:36-41`) | a `Rendered` result is always buffered |
| `injectIntoTemplate` parses the template, the rendered markup, and the finished page twice (`template.js:478`, `:499`, `:623-628`) | its checks need the whole document |
| `Responded(response)` is returned untouched (`entry.js:30`); the dev host returns it before `transformIndexHtml` (`ssr.js:140-142`) | a streamed body is possible today, but it skips `injectIntoTemplate`'s checks and, in development, Vite's client injection |
| `renderPage` receives the request alone; the entry script's URL and preloads reach only `renderDocument` (`build.js:259-262`) | a response `renderPage` writes itself does not know which script to name |
| The entry script and every static import of it are written into the document (`document.js:25`, `:38`; `build.js:191-199` follows `chunk.imports` only) | a dynamic import of the application is neither preloaded nor run at load, which is what #472 needs |
| `hydrate` adopts one stamped root that is whole when it runs | the client may not resume before the stream ends |
| No renderer per subtree, no children owned by another party | held in `upstream-foldkit-ssr.md` ("What we are not asking for") |
| Hydration always re-asserts a controlled value | proposal 6; `KeepTyped` writes the value back after the first render |

### Workers'

- **CPU is the limit, and streaming does not lower it.** A page that exceeds
  it today fails before its status is sent. Streamed, it fails after `200`
  and part of a page.
- **A stream is driven by its own request.** One request cannot wake
  another's stream (CLAUDE.md, traps). Everything a streamed page writes must
  come from Effects started inside that request.
- **Background renders are bound by the same limit** (performance-PLAN.md,
  "What the work so far taught"), so nothing here re-renders in `waitUntil`.

### What must not regress

| Guarantee | Held by |
| --- | --- |
| The page is whole with scripts off | `examples/foldkit/domains-plus/e2e/noscript.e2e.ts` |
| Served elements are adopted, not rebuilt | the `adoption` check, `examples/reference/e2e/notebook.e2e.ts:191` |
| No hydration mismatch | the equivalence check (`index.ts:976-991`); Foldkit warns only in development |
| Typing before boot is kept, caret included (#356) | `examples/foldkit/ssr/e2e/typed.e2e.ts`, `packages/ssr/test/keepTyped*.test.ts` |
| A page opened at a query before the bundle shows it | `examples/foldkit/domains-plus/e2e/built.e2e.ts` |
| A posted form is checked for its origin | `index.ts:1904` |
| Budgets: client JS, HTML, CPU, layout shift | the `perf` CI job |

## 4. Options

### #472: the runtime on intent

The handover is built; what is missing is delivery. The entry script must
become a loader that imports nothing from `effect`, `foldkit` or the
application, since any one of them brings the chunk.

**What the loader does** (a sketch of behaviour, not an API):

1. Reads the start policy the server stamped from the plan. The plan stays
   the one place that says when a page starts; the loader cannot import it.
2. Fetches the chunk when the page is idle after load, without running it.
3. Listens at the root for intent on elements the server marked: a pointer
   over or down, focus, a key. It runs the chunk on the first.
4. Holds an event that needs the runtime, and prevents a form's own
   submission while it holds it.
5. When the chunk runs, hands over what it held. `SSR.hydrate` answers each
   from the markers as it does today (`deferBoot`), so it reaches `update`
   once.
6. If the chunk has not run by a deadline, or fails to load, releases a held
   form to the browser (`requestSubmit`) and replays nothing. Held or
   released, never both.

| Question | Options | Tradeoff |
| --- | --- | --- |
| When the chunk is evaluated | (a) on intent only; (b) on intent, or when idle after it is fetched | (a) gives the lowest script at load and puts the whole parse on the first press; (b) costs main-thread time shortly after load and leaves little for the first press |
| What counts as intent | (a) any event in the document; (b) events on marked elements and kept fields | (a) boots for a reader who only moves the mouse; (b) never boots for a reader who only reads, so Subscriptions (a stale read's refresh) never start without (b)'s idle half |
| Scroll near a windowed list | a view mark the loader observes with an `IntersectionObserver` | domains-plus draws 24 rows and spacers (`client/resultsList.ts:57-62`); the rest need the runtime |
| A control with no plain fallback | (a) refuse the page at render; (b) report, as `HandlerUnnamed` is today | (a) is the issue's wording; every `@foldkit/ui` popup trigger is such a control, so (a) refuses domains-plus until each has a form or link behind it |
| A text field without `KeepTyped` on a deferred page | refuse at render, naming it | its typing is lost at the first render (`hydrate.js:220`); this is the one refusal that is always a bug |
| Drift before boot | extend the kept-field mechanism to `checkbox` and `radio`; leave scroll to the components that read it | `KeepTyped` refuses those types today (`356` note, step 1). Whether a component's Mount reads the scroll it finds at boot is to be probed, not assumed |

Needs from the build: the loader must know the chunk's URL to fetch it
without running it. Candidates, to be probed against Vite 8: a chunk emitted
by a `foldkit-ssr/vite` plugin and named through `import.meta.ROLLUP_FILE_URL_…`;
or the client manifest. `import()` cannot be used for the fetch, because it
evaluates.

Needs from upstream: nothing. A dynamic import in the entry is already left
out of the document's preloads (`build.js:191-199`).

Prerequisites in this repository: domains-plus's Subscriptions must be
`deferrable` (its URL and cookie mirrors and its debounce are not vouched
for; `Remote.resume` vouches for Remote's), and a never-seen search must fit
the CPU limit before the GET form is leaned on (#473, #413).

### #427: streaming

Three steps, each a superset of the one before. Each must decide the status
and the response headers before its first byte.

| Step | What is sent early | Needs | Gains |
| --- | --- | --- | --- |
| A. Headers first | the status and headers, with `Link: <sheet>; rel=preload; as=style`; the body is Foldkit's document, unchanged | a `Responded` whose body is a stream of one chunk; the sheet's URL, which the app has (`virtual:foldkit-styles`) | the stylesheet is fetched while the server renders; every Foldkit check still runs; bytes identical to today |
| B. Head first | the document through its stylesheet link, then the body when rendered | the document written by `foldkit-ssr`; the entry script's URL (below); `title`, `lang` and `meta` decided from `init`'s Model | the browser parses the head and starts every head fetch early |
| C. First screen first | the markup above a declared boundary, then the rest, then the resume data | a view split at the boundary: two renders whose prefixes must agree, or a Foldkit region render; the envelope moved off the root's start tag | pays only where a read below the first screen is slow |

Whether a browser and workerd act on a `Link` header before the first body
byte is the first thing to probe; step A is worth nothing if they do not.

**Status and headers.** `status` and `headers` are functions of the Model the
server reached (`index.ts:1622-1623`), so nothing can refuse a late one at
definition time, as the issue asks. A streamed entry instead calls them with
the Model before `prepare`, and the checker calls them again after and
reports a difference. The page cache decides `cache-control` from the reads a
render made (`index.ts:1716-1750`), which is after the first byte: a streamed
first render says `private, no-store` and is still kept for the next visitor,
until the reads are known up front (#435).

**A failure after the first byte** cannot be a `500`. The stream is errored,
not closed, so no cache keeps the partial page; the reader sees what arrived.
Under step A that is nothing, as today.

**The entry script's URL** (steps B and C). Three ways: Foldkit passes the
assets to `renderPage` (upstream, below); a wrapper around the app's
`renderDocument`, like `SSR.keptDocuments`, remembers them from its first
call, so the first page of each isolate is buffered; or a `foldkit-ssr/vite`
virtual module reads them from the client build.

**Step C on domains-plus buys little.** Its reads take no measured time and
the server already draws the first screen only (#415). What delays its first
byte is CPU, which a split view spends twice.

Upstream asks, for steps B and C only:

1. `renderPage(request, { assets })`, or the same on `Rendered`, so an entry
   that writes its own response can name the built script.
2. A `Rendered` variant whose document is a stream of strings that Foldkit
   checks as it passes, or checks whole in development.
3. Proposal 7 (foldkit#1657) stays the larger win: 41 ms of each request.

### #435: reads first

| Option | What changes | Gain |
| --- | --- | --- |
| A. One round trip a pass | `Data.satisfy` plans every active Surface from one Model and reads them together; passes remain for reads another's answer reveals | removes up to two round trips a pass on domains-plus; no declaration, so no checker |
| B. Start reads while the head is sent | with #427 A or B, `prepare` runs as the first bytes leave | the overlap is the whole of `prepare` |
| C. Reads from the Site tree, before `init` | a node declares its Surfaces; the entry starts them from the route alone | nothing beyond A and B: `init` is synchronous and cheap, and a read revealed by an answer cannot be declared by a route |

The issue's checker (reads the render asks for must be a subset of those
started) has nothing to check under A and B, because the reads are still
derived from the Model by the same Surfaces. It becomes meaningful only
under C, and it is cheap to state without C: after `prepare`, a render that
finds `Data.plan(model, actives)` non-empty drew a read nobody made. That is
a diagnostic worth having on its own.

What knowing the reads up front does buy is the cache header: the reads'
policies before the first byte, so a streamed page can say `public`.

### #432: islands

| Option | What it removes | Needs | Upper bound on domains-plus |
| --- | --- | --- | --- |
| A. Use `SSR.static` for the header, hero and footer | the client's drawing and diffing of those regions | nothing; domains-plus calls it nowhere today | hydration time only, to be measured |
| B. Erase static regions' view code from the client build | their thunks and what only they import | a `foldkit-ssr/vite` transform; an answer for a client navigation to a page whose region was never served (`shared.ts:610` draws it from the thunk) | part of the app's own 16.6 KB of 217 |
| C. Surfaces as the unit of hydration | the root view's first call | a Foldkit renderer per subtree under one Model and `update` | first-render time; no library bytes |

`SSR.static` is not free on the client: `SSR.hydrate` reads each region's
`innerHTML` (`client.ts:59-65`), and Foldkit parses that string into a probe
and reads the element again to compare (`hydrate.js:611-618`). A hook that
adopts a subtree without reading it is the small upstream ask here.

None of the three removes Effect, Foldkit or Remote while one region on the
page sends a Message. The spike's byte question is therefore answered by
#421's table already: at most the app's own share.

### How they compose

| | Script before intent | Total script | First byte | Server CPU | Upstream |
| --- | --- | --- | --- | --- | --- |
| #472 loader | to the loader's size | unchanged | unchanged | unchanged; more renders if the form is leaned on | none |
| #427 A | none | none | the headers' cost | unchanged | none |
| #427 B, C | none | none | the head's cost | B unchanged; C higher | wanted |
| #435 A | none | none | fewer round trips | slightly lower | none |
| #432 A | none | none | none | none | none |
| #432 B | none | at most the app's share | none | none | none |
| #432 C | none | none | none | none | large |

- **#472 delivers most of what islands promise for load.** With no script
  run before intent, the client's first render is off the load path, and the
  saving islands offer there is already taken.
- **#472 and resumability are one mechanism.** The loader adds delivery to
  the markers, the queue and `KeepTyped`; it must not grow a second way to
  answer an event.
- **Streaming and the loader do not interact** if the client waits for the
  document: a module script runs after parsing ends, so the loader sees the
  whole root.
- **Streaming and the page cache interact** through the headers, and #435 is
  what resolves it.
- **Streaming does not help the 1102s.** #473 and foldkit#1657 do.

## 5. Recommendation and phases

Build the loader first: it is the one change here that moves a headline
number (script at load, below stock Foldkit's) and needs nothing from
upstream. Take streaming only as far as headers first until a page has a
slow read below its first screen. Fix `Data.satisfy`'s serial reads, record
the islands answer from numbers already in hand, and leave Surface-level
hydration with upstream.

Each phase ships alone and reports its own numbers.

| Phase | Change | Measure | With |
| --- | --- | --- | --- |
| 0 | Probes: the chunk's URL without evaluation under Vite 8; `Link` preload before the body on workerd and Chromium; what a WindowList Mount reads at a late boot | pass or fail, recorded here | scratch probes, run from the package |
| 1 | `Data.satisfy` reads a pass's Surfaces together (#435 A); a diagnostic when a render finds a read nobody made | reads per page; warm CPU of `/?q=` | `scripts/workerd-cpu.mjs`, `test/cpu.test.ts` |
| 2 | The loader (#472): start policy stamped by the server, fetch on idle, run on intent, hold and hand over, release at the deadline; `KeepTyped` required on a deferred page's fields; domains-plus's mirrors deferrable | script at start and in total; Total Blocking Time; first-press to answer at CPU throttle 4; a new search | `scripts/bundle-report.mjs` with a second figure for the loader, `test/bundle.test.ts`; a new timing beside `scripts/search-compare.mjs`; PageSpeed for TBT and Speed Index |
| 3 | Headers first (#427 A), opt-in on `SSR.entry`, with the status and headers checker | time to first byte; first contentful paint with the sheet uncached | solid-domains' `scripts/benchmark.mjs`; Speed Index |
| 4 | `SSR.static` on domains-plus's display regions (#432 A): the spike | hydration time with and without; bytes by #421's table | `scripts/render-baseline.mjs` with a boot scenario |
| 5 | Head first (#427 B), if phase 3's gain and an upstream answer on assets justify it | as phase 3 | as phase 3 |
| Later | #427 C and #432 C, with upstream; #432 B if an app's own code is a real share | | |

Phase 2 waits on #473 or foldkit#1657 only for its default: until a
never-seen search fits the limit, the loader's deadline release sends a
reader to a render that may fail.

## 6. Decisions for the owner

1. **When is the chunk evaluated?** (a) on intent only; (b) on intent or when
   idle after it is fetched. **Recommend (b)**, the issue's own fallback: the
   first press should not pay for the parse, and a page left open must still
   start its Subscriptions. Report script at load, total script and INP
   together either way.
2. **What does a held press do if the chunk is late?** (a) wait without
   limit; (b) release a form to the browser after a deadline; (c) never hold,
   and let the form submit at once. **Recommend (b), at 3 s**, the limit
   `UNTIL_LIMIT_MS` already uses (`client.ts:369`). (c) makes the uncached
   render the normal path, which the owner's comment rules out.
3. **A control with no form or link behind it on a deferred page:** refuse
   at render, or report? **Recommend report** (`HandlerUnnamed`, as now), and
   refuse only a text field without `KeepTyped`. Refusing every popup
   trigger blocks domains-plus on work that changes nothing for a reader
   whose script arrives.
4. **Is intent scoped to marked elements?** **Recommend yes**, with decision
   1's idle half covering the reader who only reads.
5. **Does the loader become domains-plus's default, or wait for #473?**
   **Recommend build now, default after** a never-seen search fits the CPU
   limit.
6. **How far does streaming go now?** (a) headers first; (b) head first;
   (c) first screen first. **Recommend (a)**, then (b) only on phase 3's
   numbers. (c) spends CPU twice on the page whose problem is CPU.
7. **May a streamed page's `status` and `headers` see only the Model before
   `prepare`?** The alternative is that a page whose status depends on a read
   (a missing article's `404`) does not stream. **Recommend: such a page
   does not stream**; the option is per entry and the checker reports a
   status or header that changed after `prepare`.
8. **Which upstream asks go out?** (a) assets to `renderPage`; (b) a
   streamed `Rendered`; (c) adopting a subtree without reading it. **Recommend
   (a) and (c) as comments beside proposal 2**, and hold (b) until phase 3
   shows a gain; proposal 7 stays first.
9. **#435 as written, or as found?** The issue's premise does not match the
   code. **Recommend narrowing it** to the serial reads in `Data.satisfy` and
   the unmade-read diagnostic, and closing the Site-tree half as not needed.
10. **#432:** accept the bound from #421's table as the byte half of the
    spike, and run only the hydration-time half (phase 4)? **Recommend yes**,
    and leave option C with the renderer work (#433).

## 7. Risks, review points, tests

### Risks

| Risk | Where it bites | Guard |
| --- | --- | --- |
| A press handled twice, or not at all | the loader's hold against the form's own submission | one state per held event (held, handed over, released); e2e below |
| The page drifts from the Model before boot | a field typed in, a box ticked | `KeepTyped` required; `checkbox` and `radio` kept or the page refused |
| The loader grows a second copy of `listen` | answering events in two places | the loader decides only hold or pass; `listen` alone makes Messages |
| The first press pays for the parse | INP on a phone | decision 1 (b); INP reported in the budget |
| A reader who never interacts never revalidates | Subscriptions start at boot | the idle start |
| A streamed page fails after `200` | CPU limit, a failed `prepare` | the stream errors, never closes cleanly; streaming stays opt-in while a search exceeds the limit |
| A streamed page skips Foldkit's document checks (B, C) | markup a parser would rebuild | the development checker renders the buffered document and compares bytes; step A skips nothing |
| A header decided too early is wrong | a cookie or status from a read | the checker; decision 7 |
| The first page of an isolate is buffered (assets remembered) | a cold start's first byte | stated, and removed by upstream ask (a) |
| A measure is gamed | script at load falls while total and INP rise | all three in one table, in the `perf` job |

### What a reviewer must check

- The loader's module graph: no import reaches `effect`, `foldkit` or the
  application. A module assertion, as `split.test.ts` does, not a size alone.
- The start policy has one owner, the plan; the loader reads a stamp.
- Every sentence in the README about "before boot" against the loader's
  state machine, the deadline included.
- `unmark` (`client.ts:318`) still runs before adoption, so a form's
  fallback is gone once the runtime answers it.
- Streaming changes no byte of a buffered page; the page cache keeps what it
  kept before.
- The `satisfy` change keeps a family's parent read before its instances.
- No new option duplicates `start`, `deferrable` or `SSR.static`.

### Tests each phase needs

| Phase | Test | Kind |
| --- | --- | --- |
| 1 | a page with three reading Surfaces makes one request a pass; a family still takes two passes; the unmade-read diagnostic fires for a Surface left out of `actives` | unit, with mutations |
| 2 | the loader's chunk holds no module of the three libraries | module assertion |
| 2 | with the chunk held: a submit pressed is answered once by `update` after release, and never posted; with the chunk failed: the form posts once at the deadline | e2e, Chromium, route interception as `built.e2e.ts` does |
| 2 | typing with the chunk held ends in the field and the Model, caret in place | e2e (the #356 test under the loader) |
| 2 | focus stays on the pressed control across the handover | browser test |
| 2 | served elements are still adopted after a late boot | e2e, the `adoption` check |
| 2 | a deferred page's text field without `KeepTyped` is refused, naming it | unit |
| 2 | no layout shift at a late boot | `layoutShift.e2e.ts`, with the boot held |
| 3 | the response's headers arrive before the render finishes; the concatenated body equals the buffered document; a mutation that buffers is caught | unit on the stream's chunks, with a held `prepare` |
| 3 | a status that changes after `prepare` is reported | unit |
| 3 | the no-JS e2e, unchanged | e2e |
| 4 | a static region is adopted, not rebuilt; the page resumes | e2e, the `adoption` check |

Each test is mutation-checked as CLAUDE.md requires. A press test spaces its
events longer than any threshold the loader reads.

## 8. Rejected

| Alternative | Why not |
| --- | --- |
| An inline script that answers before the chunk | #356 chose against it: a nonce, and a second copy of each field's behaviour in DOM code |
| Moving views behind `Resource.lazy` to cut script at load | tried in #423: 0.9 of 214.8 KB, reverted; the weight is libraries |
| A runtime per Surface | two owners of one Model; `SSR-DESIGN.txt` §26 rules it out |
| A serializer of our own, to stream regions | it would have to track Foldkit's markers and build stamp exactly (performance-PLAN.md, "Where it goes") |
| Out-of-order streaming, with placeholders a script fills | a page without scripts would be incomplete or out of order |
| Skipping the equivalence render in production to halve the cost | it is the only check that a resumed first view equals the served page; a per-build check must replace it first, which is #473's subject, not this note's |
| Reads declared on Site nodes, started before `init` (#435 C) | `init` costs nothing measurable, and an answer-revealed read cannot be declared by a route |
| Refreshing a streamed or kept page in `waitUntil` | bound by the same CPU limit |
| A push from another request into an open page stream | one request cannot wake another's stream on Workers |
| Counting "script at load" alone as #472's result | the owner's comment: total script and first-interaction INP beside it, or the change games one number |
