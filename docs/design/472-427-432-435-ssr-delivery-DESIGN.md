# How a served page is delivered: the runtime on intent, streaming, islands, reads first (#472, #427, #432, #435)

Status: decided 2026-11-10 (decisions delegated by the owner). Phase 0 is run but for the `Link`
probe (section 5, "Phase 0 results"). Phase 2's loader is built in `foldkit-ssr` and wired into
domains-plus as an opt-in build (`DOMAINS_PLUS_LOADER=1`), not its default: decision 5's
first-press, Total Blocking Time and e2e numbers are not yet measured. Phase 1 is owed (a search
pass makes two client calls).

Four issues ask how a page `foldkit-ssr` renders reaches the browser: when its
bytes leave the server (#427, #435), and how much script the browser needs for
them (#472, #432). They share one request path and one handover, so this note
treats them as one design. Nothing here is built. The choices are in section 6
and the issue actions in section 9. Its place in the wider plan
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
upstream. Take streaming only as far as headers first, and only if it
clears decision 6's bar. Fix `Data.satisfy`'s serial reads if a count shows
them, record the islands answer from numbers already in hand, and leave
Surface-level hydration with upstream.

Phases 1 and 2 touch different packages and do not depend on each other;
phase 2 is the priority, and phase 1 does not hold it up. The table is as
decided in section 6.

Each phase ships alone and reports its own numbers.

| Phase | Change | Measure | With |
| --- | --- | --- | --- |
| 0 | Probes: the chunk's URL without evaluation under Vite 8; `Link` preload before the body on workerd and Chromium, streamed and on the buffered response; what a WindowList Mount reads at a late boot; client calls in a pass of a domains-plus search | pass or fail and the count, recorded here | scratch probes, run from the package |
| 1 | If phase 0 counts more than one client call in a pass: `Data.satisfy` reads a pass's Surfaces together (#435 A), its doc comment changed with it; a diagnostic when a render finds a read nobody made | client calls per page; warm CPU of `/?q=` reported, not expected to move | `scripts/workerd-cpu.mjs`, `test/cpu.test.ts` |
| 2 | The loader (#472): the plan's `start` stamped by the server, fetch on idle, run on intent (and on idle under `'idle'`), hold and hand over, release at 3 s; `KeepTyped` required on a deferred page's typed fields, and taking `checkbox` and `radio`; domains-plus's mirrors deferrable, its plan `start: 'idle'`, the loader its entry if decision 5's numbers hold | script at start and in total; Total Blocking Time; first-press to answer at CPU throttle 4; a new search | `scripts/bundle-report.mjs` with a second figure for the loader, `test/bundle.test.ts`; a new timing beside `scripts/search-compare.mjs`; PageSpeed for TBT and Speed Index |
| 3 | If phase 0's probe passes: the `Link` header alone where that clears decision 6's bar, else headers first (#427 A), opt-in on `SSR.entry`, with the status and headers checker. Kept only if first contentful paint falls by a median of 50 ms | time to first byte; first contentful paint with the sheet uncached | solid-domains' `scripts/benchmark.mjs`; Speed Index |
| 4 | `SSR.static` on domains-plus's display regions (#432 A): the spike, kept if boot is 10 ms faster at CPU throttle 4 | hydration time with and without; bytes by #421's table | `scripts/render-baseline.mjs` with a boot scenario |
| Not planned | Head first (#427 B): reconsidered after phase 3 ships and upstream answers on assets. #427 C: when a page has a measured slow read below its first screen. #432 B: when an app's own code is a real share. #432 C: with #433 | | |

### Phase 0 results

Run 2026-11-10 from the packages, against Vite 8.3.5 and the tree at this note's phase 2 commits.

| Probe | Result |
| --- | --- |
| The chunk's URL without evaluating it | **Pass.** A plugin that calls `this.emitFile({ type: 'chunk', id })` for the module the loader imports dynamically, and writes `import.meta.ROLLUP_FILE_URL_<ref>` into the loader, names the very chunk the `import()` loads (Rolldown gives one module one chunk), and nothing runs it. The address names that one file; a module the chunk shares with another dynamic import is its own file, which `modulepreload` does not fetch. Two warts: the client manifest lists a placeholder asset for the reference (`assets/app-!~{003}~.js`), and the emitted chunk reads as an entry (`isEntry`). Built as `runtimeChunk` (`foldkit-ssr/vite`); `test/loaderBuild.test.ts` holds it. |
| `Link` preload before the body (workerd, Chromium) | **Not run.** It needs a running Worker, and Wrangler was held by another session. Phase 3 waits on it. |
| What a WindowList Mount reads at a late boot | **Read from the code, not probed in a browser.** `WindowList.Track` waits a tick after insert, gives a list opened at a row (`?from=`) its rows above and scrolls by what that moved its first row, then `WindowViewport` reports at once from `getBoundingClientRect()` and `innerHeight`, and on every scroll after. A late boot therefore places the window where the reader has scrolled to, from the reading it takes at boot: no scroll needs keeping by the loader, as decision 4 assumed. |
| Client calls in a pass of a domains-plus search | **Two.** `Data.satisfy` on `init`'s Model for `/?q=acme`, `/?q=vercel`, a never-seen label and `/?q=acme&tld=com` makes two `FoldkitRemoteRead` calls, both in the first pass (`passes: 1` still satisfies), from `TopResults` and `VisibleResults`; `/` makes none. Decision 9's rule (more than one) holds, so phase 1 is to be built; #435 stays open. |

### Phase 2 status

Built: `foldkit-ssr/loader` (`load({ runtime })`), `start` written into the envelope, the hold and
handover through an import-free module both sides share (`handoff.ts`), the 3 s limit moved to an
import-free `marks.ts`, the release at the deadline and at a failed chunk or a refused page,
`KeepTyped` on checkboxes and radios, the `UnkeptField` refusal, and `runtimeChunk`. domains-plus
builds with the loader under `DOMAINS_PLUS_LOADER=1`, which also sets `start: 'idle'` and names its
two mirrors deferrable (with them named, the deferred plan renders: no other refusal).

| domains-plus `vite build`, brotli | Today's entry | Under the loader |
| --- | --- | --- |
| Script at start | 207,071 B, one chunk | 2,317 B (loader 1,973 + the shared import-free chunk 344) |
| Total script | 207,071 B | 209,104 B (+2,033 B: the loader, and `marks.ts` as a chunk of its own) |

Script at start clears decision 5's 10 KB bar; total script is 1% worse.

Owed before it is domains-plus's default (decision 5): the e2e with the chunk held (a press
answered once, typing kept, a box ticked, adoption, no layout shift), and Total Blocking Time and
first-press time at CPU throttle 4 against today's entry, and an account of the 2 KB more total
script (decision 5 asks for no worse). Not run here: Wrangler and the e2e were held by another
session, and no browser measurement of the built Worker was possible without it. The package's
browser tests cover a held press answered once, intent on marked elements only, the 3 s release, a
failed chunk and a refused page releasing at once, and focus kept across the handover
(`packages/ssr/test/loader.browser.test.ts`).

Phase 2 does not wait on #473 or foldkit#1657 (decision 5). A deadline
release still sends a reader to a render that may fail with 1102, as a
press before the script does today; the loader makes that rarer, and #473
is what removes it.

## 6. Decisions

Decided 2026-11-10; the owner delegated them. Each item gives the options
that were on the table, the choice, and the evidence. Six premises of the
draft were re-read against the code at `922b0ab` and corrected; they are
marked **Corrected**.

1. **When is the chunk evaluated?** Options: (a) on intent only; (b) on
   intent, or when idle after it is fetched.
   **Decided: the loader adds no policy of its own; it follows the plan's
   `start`, and domains-plus sets `'idle'`.** **Corrected:** this is not a new
   choice. `Start` already names both (`shared.ts:271`): `'idle'` boots when
   idle or on the first interaction, `'on-interaction'` on the first only
   (`client.ts:528-531`), so (a) and (b) are the two values an application
   already picks between, and a loader option would be a second way to say
   it. Under the loader both fetch the chunk when idle after load; `'idle'`
   also runs it when idle after the fetch. The budget reports script at
   start, total script, Total Blocking Time and first-press time together.
   domains-plus moves to `'on-interaction'` only if, at CPU throttle 4,
   `'idle'` does not lower Total Blocking Time below today's and a first
   press under `'on-interaction'` is answered within 200 ms.

2. **What does a held press do if the chunk is late?** Options: (a) wait
   without limit; (b) release a form to the browser after a deadline; (c)
   never hold.
   **Decided: (b), 3 s counted from the press; a chunk that fails to load
   releases at once.** 3 s is the limit a served page already waits
   (`UNTIL_LIMIT_MS`, `client.ts:369`). The loader cannot import that
   constant from `client.ts`, which imports `effect` (`client.ts:7`), so it
   moves to a module with no imports that both read. A held event that is
   not a form's submission is dropped at the deadline, since the browser has
   nothing to do with it.

3. **A control with no form or link behind it on a deferred page.** Options:
   refuse at render; report.
   **Decided: neither. Refuse only a typed field with a resumable binding
   and no `KeepTyped`, on any plan whose `start` is not `'now'`.**
   **Corrected:** `HandlerUnnamed` is not such a report. It names a handler
   the page cannot name, a closure (`diagnostics.ts:43`, `listen.ts:282-285`);
   nothing today reports a control without a fallback, so "report, as now"
   meant a new diagnostic, fired for every popup trigger on every render
   (domains-plus has three listboxes and a dialog, `client/app.ts:7-8`,
   `:84-86`). A control without a form does nothing when the script never
   arrives on every Foldkit page; `fallback: 'server'` is the existing way to
   give one a form. The field refusal is a new `ResumeUnsafe` reason beside
   `UnkeepableField`, over the types `KeepTyped` accepts
   (`resumable.ts:147-156` lists the ones it does not). It is a breaking
   change for a deferred page in `foldkit-ssr`, and goes in the changelog as
   one. A page that starts `'now'` has the same gap for a shorter time and is
   left alone.

4. **Is intent scoped to marked elements?** Options: any event in the
   document; events on marked elements and kept fields.
   **Decided: marked elements and kept fields, for pointer over, pointer
   down, focus and key.** **Corrected:** this is narrower in element and
   wider in event than today's deferred boot, which starts on any event of a
   bound type anywhere in the root, answered or not (`client.ts:469-474`).
   The loader finds a marked element by reading attribute names up the
   event's path, since the markers are a prefix (`listen.ts:251-259`) and no
   selector matches a prefix of a name; no new attribute is stamped. The
   reader who only reads is covered by `'idle'`. No scroll mark and no
   `IntersectionObserver` are built: under `'idle'` the runtime is normally up
   before a scroll, and under `'on-interaction'` one passive `scroll`
   listener counts as intent.

   *Drift before boot* (the same table in section 4): **decided: the kept
   field mechanism takes `checkbox` and `radio`** (`checked` against
   `defaultChecked`), because the owner's comment on #472 names ticked boxes
   and `select` is kept already (`keep.ts:25-27`). Scroll is left to the
   components that read it, after phase 0's probe of a WindowList Mount.

5. **Does the loader become domains-plus's default, or wait for #473?**
   **Decided: build it and make it domains-plus's default in the same phase,
   on the phase's own numbers, without waiting for #473.** **Corrected:** the
   draft said the loader leans on the GET form more than today. It leans on
   it less. Today no listener exists until the 217 KB chunk has run, so a
   submit pressed before then goes to the browser and to an uncached render
   at once; under the loader the same press is held for up to 3 s. The
   default lands when the e2e shows a held press answered once, script at
   start is under 10 KB brotli, and total script, Total Blocking Time and
   first-press time at CPU throttle 4 are no worse than today's. If one is
   worse, the loader ships in `foldkit-ssr` and domains-plus keeps its
   entry until the number is explained.

6. **How far does streaming go now?** Options: (a) headers first; (b) head
   first; (c) first screen first.
   **Decided: (a) only, and only if it clears a bar; (b) and (c) are not
   built.** domains-plus links one stylesheet whose address the server holds
   (`server/entry.ts:14`, `:43-44`), so a preload has something to name. The
   bar, on a never-seen search with the sheet uncached: Chromium requests
   the sheet before the body's first byte from workerd, and first contentful
   paint falls by a median of 50 ms or more. The render it overlaps is about
   120 ms, which is the most it can gain, and a page served from the page
   cache gains nothing. Phase 0 also probes the change with no stream at
   all: the same `Link` header on the buffered response, through the
   existing `headers` option, for a host that turns it into an early hint.
   If that alone clears the bar, it is the whole of phase 3. If neither
   does, #427 closes with the probe's numbers. (b) is reconsidered only
   after (a) ships and upstream answers on assets; (c) waits for a page with
   a measured slow read below its first screen, which no page here has.

7. **May a streamed page's `status` and `headers` see only the Model before
   `prepare`?** Options: yes, with a checker; a page whose status depends on
   a read does not stream.
   **Decided: such a page does not stream.** Streaming is opt-in for an
   entry. A streamed entry calls `status` and `headers` with the Model
   before `prepare`, calls them again after, and reports a difference as a
   diagnostic in production too, since the cost is two function calls
   (`index.ts:1622-1623`). A streamed first render says `private, no-store`
   and is still kept in the page cache for the next visitor, who is served
   buffered.

8. **Which upstream asks go out?** Options: (a) assets to `renderPage`; (b)
   a streamed `Rendered`; (c) adopting a subtree without reading it.
   **Decided: none now. foldkit#1657 stays the one active ask.** Each of the
   three serves a step that is not yet shown to pay, and an ask without a
   number behind it is weaker than one with. (a) is posted if step A clears
   decision 6's bar, as what head first would need. (c) is posted if phase 4
   shows a static region costs more to adopt than to draw. (b) is not
   posted. The texts are in section 9; the maintainer posts them.

9. **#435 as written, or as found?**
   **Decided: narrow it** to the serial reads in `Data.satisfy` and the
   unmade-read diagnostic, and drop the Site-tree half. Confirmed: `prepare`
   runs before either render (`index.ts:2041-2052`), and inside a pass each
   Surface's read is awaited before the next is planned
   (`remote.ts:1484-1501`). **Corrected:** reading a pass together changes a
   documented behaviour. `satisfy`'s doc comment says a Surface revealed by
   one earlier in `active` is read in the same pass (`domain.ts:555-563`);
   read together, it waits for the next. The default of 8 passes
   (`remote.ts:1472`) still covers a chain shorter than 8, the comment
   changes with the code, and the change is a changelog entry for
   `foldkit-remote`. The phase's measure is client calls a page, not CPU:
   domains-plus prices in process, so its CPU will not move. It is built if
   a count shows a search page making more than one client call in a pass;
   if every pass already makes one, #435 closes with the count. The
   diagnostic is placed where Remote's plan can be read (the `Remote.resume`
   part), not in `foldkit-ssr`.

10. **#432: accept the bound from #421's table as the byte half of the
    spike?**
    **Decided: yes; run only the hydration-time half, and close #432 when
    its numbers are recorded.** No option removes Effect, Foldkit or Remote
    while one region sends a Message, and the app's own code is 16.6 of
    217 KB. domains-plus adopts `SSR.static` on its header, hero and footer
    if booting at CPU throttle 4 is 10 ms or more faster with it; otherwise
    the numbers are recorded and the regions stay as they are. Option B is
    not built (#423 moved 0.9 KB the same way), and option C stays with the
    renderer work (#433).

## 7. Risks, review points, tests

### Risks

| Risk | Where it bites | Guard |
| --- | --- | --- |
| A press handled twice, or not at all | the loader's hold against the form's own submission | one state per held event (held, handed over, released); e2e below |
| The page drifts from the Model before boot | a field typed in, a box ticked | `KeepTyped` required; `checkbox` and `radio` kept or the page refused |
| The loader grows a second copy of `listen` | answering events in two places | the loader decides only hold or pass; `listen` alone makes Messages |
| The first press pays for the parse | INP on a phone | `start: 'idle'` (decision 1); INP reported in the budget |
| A reader who never interacts never revalidates | Subscriptions start at boot | the idle start |
| A streamed page fails after `200` | CPU limit, a failed `prepare` | the stream errors, never closes cleanly; streaming stays opt-in while a search exceeds the limit |
| A streamed page skips Foldkit's document checks (B, C) | markup a parser would rebuild | the development checker renders the buffered document and compares bytes; step A skips nothing |
| A header decided too early is wrong | a cookie or status from a read | the checker; decision 7 |
| The first page of an isolate is buffered (assets remembered) | a cold start's first byte, under head first only, which is not planned | stated, and removed by upstream ask (a) |
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
- The `satisfy` change keeps a family's parent read before its instances,
  and its doc comment no longer promises a same-pass read (decision 9).
- The loader shares the 3 s limit with `client.ts` through a module that
  imports nothing.
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
| 2 | a box ticked with the chunk held is ticked in the Model after boot, once | e2e |
| 2 | pointer over an unmarked element does not run the chunk; over a marked one does | browser test, with `start: 'on-interaction'` |
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

## 9. Issue actions

For the coordinator. None of these is done by this note.

| Issue | Action | New title, or note |
| --- | --- | --- |
| #472 | keep | scope is decisions 1 to 5: the loader follows `start`; holds a press 3 s; refuses an unkept typed field on a deferred plan; keeps `checkbox` and `radio`; becomes domains-plus's default on its own numbers |
| #427 | narrow | "SSR.entry sends its headers first, with a stylesheet preload (opt-in)". Close with the probe's numbers if phase 0 or phase 3 misses decision 6's bar. Head first and first screen first are out of scope until a page has a measured slow read |
| #435 | narrow | "Data.satisfy reads a pass's Surfaces in one round trip, and reports a read a render finds unmade". Say in the issue that reads already start before any view runs, and that the Site-tree declaration is dropped. Close with the count if every pass already makes one client call |
| #432 | narrow | "Spike: SSR.static on domains-plus's display regions, hydration time". The byte half is answered by #421: at most the app's 16.6 KB. Close when phase 4's numbers are recorded; Surface-level hydration stays with #433 |
| #473, #413 | keep | no longer a condition of the loader's default (decision 5) |

Upstream asks. Nothing is posted now; foldkit#1657 stays the one active
ask. The maintainer posts each of these when its condition is met, with the
measured number in place of the bracket.

- **Assets to `renderPage`**, if step A clears decision 6's bar:

  > `renderPage` receives the request alone, and the built entry script and
  > preloads reach only `renderDocument` (the generated fetch module closes
  > over `assets` there). An entry that returns `Responded` with a body it
  > writes itself therefore cannot name the script to load. We send the
  > status and headers of a page before rendering it, which moved first
  > contentful paint by [n] ms on our benchmark, and would send the head the
  > same way if the entry knew the assets. Would you take
  > `renderPage(request, { assets })`, or the same value on the fetch
  > module's options? We work around it today by remembering the assets from
  > the first `renderDocument` call, which leaves the first page of each
  > isolate buffered.

- **Adopting a subtree without reading it**, if phase 4 shows a static
  region costs more to adopt than to draw:

  > Hydration adopts an element whose children are trusted `InnerHTML`
  > without walking them, which is what lets a server-rendered region stay
  > as served. To get there the client has to read the region's `innerHTML`
  > to hand it back, and hydration then parses that string into a probe and
  > reads the element again to compare. For a region the application
  > declares unchanged since the server drew it, that is two serializations
  > and a parse to confirm what was just read from the same element: [n] ms
  > of a [m] ms boot on our page. Would you take a way to say "adopt this
  > element's children as they are", with no string passed and no
  > comparison?

- **A streamed `Rendered`** is not asked for.
