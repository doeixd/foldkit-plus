# `foldkit-ssr`: implementation plan

**Status:** Phases 0 to 5 done. Next, in order: the Foldkit 0.163 upgrade
(Phase U), Remote's resume (Phase R), delivery through Foldkit's fetch handler
(Phase 6), then the resumable track (Phases A to F). Written 2026-09-22 against
`foldkit` 0.158.2 and this repository at 0.10.0, revised the same day after an
independent review (see [What review changed](#what-review-changed)), and
revised on 2026-09-23 for [what Foldkit 0.159 to 0.163
changed](#what-changed-upstream-foldkit-0159-to-0163) and for
[resumable-DESIGN.md](./resumable-DESIGN.md), whose effect on the phases already
built is [its own section](#what-the-resumable-design-changes-here).

**Source:** [SSR-DESIGN.txt](./SSR-DESIGN.txt), the 3,000-line design. This plan
does not restate it. It records what checking the design against the code found,
decides what the design left open, and orders the work into phases that each end
in a test that can fail. Where it departs from the design, it says so.

## What checking the design found

Every claim below was checked against `node_modules/foldkit` and this
repository, with file and line, and the central one was run.

**Foldkit already has the base the design assumes.** `foldkit/experimental/server`
exports `renderToString`, `injectIntoTemplate` and `toResponse`, with Flags
encoding that checks its round trip and root validation. `Runtime.hydrate`
adopts the server's DOM. So Phase 0 is a port with a known target.

**It does not have any of the three upstream changes the design proposes.**

- An "externally owned children" primitive: missing. Trusted `InnerHTML` keeps
  equivalent children during hydration, which is enough to prototype static
  regions, but there is no general marker.
- Rendering an already-created Model on the server: missing. `init` runs inline
  in `renderToString`.
- `Runtime.adopt`, starting a client from an existing Model: missing.
  `Runtime.hydrate` always calls `init`.

**The workaround the design relies on works.** A client program built with
`makeApplication` from a config whose `init` returns the server's Model, with no
`Flags` key, hydrates the server's DOM without calling the application's own
`init`. This was run: the server's button was the same node afterwards, the
application's `init` was called zero times on the client, and a click moved the
count from 41 to 42. Two traps come with it:

- `Runtime.hydrate` takes a program built by `makeApplication`, not a config,
  and the runtime id comes from the root's stamp, not an option. The design's
  snippet passes a config and a `runtimeId`.
- A config without Flags must **delete** the `Flags` key. The server tests
  `config.Flags !== undefined`, but the client tests `'Flags' in config`, so
  `{ ...config, Flags: undefined }` renders on the server and is then refused
  on the client.

**Five of the design's assumptions about this repository are now wrong.**

- `Projection.pick` merged two fields with the same last key. `post.id` and
  `viewer.id` became one `id`, silently, and `set` wrote one into the other. A
  resume plan picked that way would corrupt state. Fixed in `caa4a8f`: `pick`
  and `compose` now refuse the collision.
- The design's Surface coverage check (§15) compares dependency paths. Remote
  projections have none; their requirements live in metadata. A check on paths
  alone passes every Remote read, so it must also read `RemoteRequirements` and
  `RemoteConnections`, as `Data.why` does.
- `RemotePersistence.snapshotOf` takes the whole entity store, with no filter by
  what active Surfaces require.
- A `Snapshot` restores a connection stale, with `Unknown` boundaries and no
  cursor, on purpose: a persisted cursor may name server state that is gone. That
  is right for a cache that survived a reload and wrong for a page rendered a
  moment ago, which would refetch every list.
- `RemotePersistence.dehydrate` emits JSON with no escaping for a `<script>`,
  and `hydrate` returns `undefined` on a mismatch.

The design's API names are also a little out of date: `App.fields` is
deprecated for `App.model`, `Surface.at` needs its params argument, and
`Surface.when` now gives a plan an activation it can read without running a
callback.

## What changed upstream (Foldkit 0.159 to 0.163)

Foldkit 0.163.0 was published on 2026-09-20; this repository still pins
0.158.2. [foldkit-0.158-to-0.163.md](../foldkit-0.158-to-0.163.md) lists every
change and an upgrade guide. What matters to this plan, with the server API
claims checked against the published 0.163.0 declarations:

- **Foldkit's server is a Web `fetch` handler** (0.159). `handleRequest(request,
  { renderPage, template, containerId? })` classifies the request and calls
  `renderPage(request): Promise<EntryResult>`, where `EntryResult` is
  `Rendered` (a `RenderedApplication` to put in the template) or `Responded` (a
  whole `Response`). `vite build` emits `dist/server/fetch.js`, which a
  Cloudflare Worker can export directly. None of the phases below had a
  delivery step; Phase 6 adds it.
- **A `Rendered` result cannot carry the envelope.** It holds only the
  `RenderedApplication`, and `handleRequest` injects it into one fixed
  template, where `injectIntoTemplate` accepts only the root and Foldkit's own
  payload (Phase 2's finding). `SSR.page` puts the envelope in the template per
  request, which that path has no place for. Phase 6 decides between answering
  with `Responded` and asking upstream for a slot.
- **`canonical` has no default** (0.163). Neither the client nor
  `renderToString` derives it from the URL any more. An application derives it
  from the route in its Model, as it does `title`, or the page has none.
  Decision 9.
- **Hot reloading is now "model preservation"** (0.159): a full reload with the
  Model restored, which skips adoption. Same behaviour, new name; the risk
  below uses it.
- **Messages buffered during boot now reach Subscriptions and Managed
  Resources** (0.163). The resumable track's `EagerStartRequired` may have been
  working around this bug rather than boot order; Phase C finds out.
- **The hydrate-without-`init` workaround is unchanged.** The runtime only
  renamed `hmrModel` to `preservedModel`. `flagsTrap.test.ts` pins the Flags
  half and must stay green through the upgrade.
- **`FOLDKIT_APP_ATTRIBUTE` and `FOLDKIT_FLAGS_ATTRIBUTE` are exported** from
  the server module; `data-foldkit-build` still is not. Decision 5.
- **New event attributes** (`OnBeforeInput`, `OnKeyDownSelf`, and others), and
  `OnInput`/`OnChange` now read a contenteditable host's text. The resumable
  builder's projection table (resumable-DESIGN) accounts for both.
- **`Runtime.adopt` did not ship**, nor did any other change this plan or the
  design asks for. See [Beyond this plan](#beyond-this-plan) for how the ask is
  reframed.

## What the resumable design changes here

[resumable-DESIGN.md](./resumable-DESIGN.md) adds a second thing to the page:
beside the state that crosses, which Message each element causes, so the view
need not run until the first one. It is written as an extension, but it
reaches back into what Phases 1 to 5 built, and checking it against them found
four things it needs that it does not say, and one place it contradicts
itself. Each is decided here or in the phase it lands in.

- **The view check must cover bindings, or rule 6 fails silently.** The
  server's second render, from the browser's Model (Phase 2), would produce
  the same markers, since ordinals only count, but a Message built from a
  field the plan does not send, `OnClick(Liked({ id: model.post.id }))` with
  `post.id` unsent, would differ between the two manifests. A click before
  boot would then dispatch the server's Message and the same click after boot
  the browser's, which is exactly what the design's rule 6 forbids. So the
  second render's manifest must equal the first's, and a binding that differs
  is `ViewDependsOnUnsentState`, naming the element. Phase A.
- **A page is validated whole, at load.** The design's rule 5 refuses the page
  for a marker without a manifest entry; its §2 refuses only the event and
  logs it. The page wins: `SSR.resume` decodes the whole manifest and checks
  every marker in the root against it when the page loads, before any event,
  and a page that fails is refused and contained as any other (decision 3).
  After load no marker can appear, so there is no per-event refusal left to
  define. Phase B.
- **A resumable page must declare its Surfaces.** The manifest is decoded
  through the Message union restricted to the tags active Surfaces may send
  (rule 3). That set comes from the plan's `surfaces` (Phase 3), so a plan
  whose page has bindings and no `surfaces` is refused at render rather than
  decoded against every tag. Phase D.
- **"Active" is the wrong test for deferring boot.** `EagerStartRequired`
  refuses deferral while any Subscription or Managed Resource is active for the
  sent Model. Remote's entries show why that is too blunt, read from
  `packages/remote/src/index.ts`: under the default cache-first policy the read entry plans nothing once
  resumed data is present, so it starts, emits nothing and ends (a refreshing
  policy only refreshes later); the live entry
  subscribes from the cursor in the Model, so a late start misses nothing once
  Phase R sends the cursor; and the retention entry always emits, but
  collecting late is harmless. Asked "is it active?", all three say yes, and
  no page using Remote could ever defer. Asked "does starting late change what
  happens?", all three say no. That cannot be inferred from an entry, so it is
  declared (decision 10), and Phase R declares Remote's.
- **The envelope stays one script, and its version stays 1.** The manifest is
  one more optional field. A page from another build is refused on its build
  id before the envelope is read, so a server and a browser that disagree on
  the envelope's fields cannot meet; the version moves when a field changes
  meaning, not when one is added.

Two things it confirms rather than changes: Phase 4's render context is where
the manifest is collected, as the design says, one context holding regions and
bindings together, and the inert builder already keeps bindings out of static
regions; and Phase 5's generated pages can be resumable like any other,
  but cannot use Phase E's server fallback, since a static host has nothing to
  post to.

## Decisions

The design leaves these open, or the review found the first answer wrong. Each
is decided here, and a phase can revisit one only with a reason recorded beside
it.

1. **Startup Commands are declared, never dropped silently.** On the server
   Foldkit already drops `init`'s Commands. On the client the adapted `init`
   returns the resumed Model and the Commands of `boot(model)`.
   - If the server's `init` returned Commands and the plan names no `boot`,
     rendering is refused, naming the Commands. A startup Command nobody
     declared is not quietly skipped.
   - An application assembled with `foldkit-bundle` names its assembly's
     startup Commands: `boot: model => assembly.init(model).commands ?? []`.
     That is where `Mirror.kv` restores what a user saved.
     *Revised in Phase 2.* This first said `boot` defaults to the wirings'
     startup Commands for a bundle application. `SSR.plan` takes the Surface
     application, which knows nothing of an assembly, so a default would need a
     second way to make a plan. The refusal above already stops a bundle
     application that forgets, naming `Mirror.restore(...)`, so the default
     would save one line and cost an entry point.
   - Subscriptions and managed resources need nothing: the runtime starts them
     from the Model.
2. **Flags never cross.** A handoff config has no `Flags` key at all: it is
   deleted, never set to `undefined`. One helper builds that config, so the
   trap exists in one place.
3. **A page that cannot resume is refused, not re-rendered.** This follows the
   design's §31 and Foldkit's own order. The client:
   - compares the root's build id with its own **before** reading the payload,
     as Foldkit does;
   - decodes the payload through the plan's Schema, refusing a wrong protocol
     version, a wrong plan id, a value that does not decode, or a missing or
     duplicated payload;
   - on any refusal, logs the real reason and contains the page with Foldkit's
     own refusal, by calling `Runtime.hydrate(program, { buildId: '' })`, which
     Foldkit rejects and contains. No containment code is copied.

   A page with no stamped root at all is not a server page: it gets
   `Runtime.run`, a client render. A server page is never re-rendered on the
   client, which for an application with Flags would be impossible anyway, since
   no Flags are sent.
4. **The payload is escaped as Foldkit escapes Flags.** Escaping `<` is what
   keeps `</script`, `<!--` and `<script` out of a
   `<script type="application/json">`, and it was checked. `serializeJsonScript`
   also escapes U+2028 and U+2029, which only matter if the text is ever read
   as JavaScript rather than JSON; it costs nothing.
5. **Attributes use their own namespace.** `data-foldkit-plus-resume` and
   `data-foldkit-plus-static`, and the resumable track's
   `data-foldkit-plus-on-*`. Foldkit reserves a fixed set of `data-foldkit-*`
   names (unchanged through 0.163), and nothing strips others, but a later
   release may reserve more. Foldkit's own names are read from its exported
   constants where it exports them, so a rename upstream is a type error here;
   `data-foldkit-build` is not exported and stays pinned by a test.
6. **Rendering stays synchronous.** `init` is synchronous on the server, so
   data is loaded before rendering, with `Data.prefetch` for Remote. SSR adds no
   async render path.
7. **Tests use a fresh jsdom per file.** `Runtime.hydrate` returns no handle to
   stop it, so a hydrated program lives until its document goes.
8. **The URL is checked, not trusted.** The runtime never dispatches
   `onUrlChange` at boot, so the route the client starts on is whatever the
   server parsed. The client parses its own URL and refuses (decision 3) if the
   route differs from the one resumed. Static generation has the same check
   against the URL it was built for. (Phase 5 revised it for generated pages,
   which compare the path alone.)
9. **Head fields come from the Model.** Since 0.163 nothing derives `canonical`
   from the URL, so a resumed page states it in its view, from the route in its
   Model, like `title`. Phase 2's view check compares only the body, so a head
   field read from a field the plan leaves out would change in the browser
   unnoticed. Phase U extends the check to the head.
10. **Whether an entry may start late is declared, not inferred.** Deferring
    boot (the resumable track's `start: 'idle' | 'on-interaction'`) is refused
    while a Subscription or Managed Resource that is active for the sent Model
    has not been declared deferrable. A plan declares entries by key, and a
    resume part declares its own package's; nothing is deferrable by default,
    because a late WebSocket or timer is a behaviour change.
11. **What the page says an element does is checked like what it shows.** The
    bindings manifest is compared between the server's two renders exactly as
    the body and head are (decision 9), and decoded at load exactly as the
    state is (decision 3). A binding is never trusted from the page further
    than its ordinal.

## Phases

Each phase ends when its tests pass and each has been shown to fail with the
behaviour it pins removed.

### Phase 0: a package that renders and hydrates as Foldkit does

- `packages/ssr`, published as `foldkit-ssr`. The first version re-exported
  Foldkit's server and runtime entry points unchanged, as the design proposed.
  Review refused it as a module that only forwards, and it was right: the
  package exports only what it adds, and an application imports Foldkit's own
  rendering and hydration directly.
- Foldkit ships no tests to port, so parity is proven by the design's
  compatibility list (§32), each item a test through the package: a stamped
  root, a build id and its mismatch, a routing application, Flags, head
  content, a keyed list, a controlled input, a custom element, and trusted
  `InnerHTML`. Each hydrates with the server's nodes kept and the page working,
  or is refused where Foldkit refuses it.
- Gate: nothing. This phase only proves the ground is where the design says.

**Done.** `packages/ssr`, private, with the compatibility list as eight test
files, one per item, run against Foldkit directly. Every hydration test was shown to fail when the server's
root is swapped for a copy before hydrating. Two things learned:

- The container passed to `makeApplication` must be the stamped root itself;
  Foldkit refuses one beside it.
- A view renders a custom element through `CustomElement.define`
  (`foldkit/customElement`) bound with `.withMessage(h)`. The builder has no
  generic element in its public API.

### Phase 1: a resume plan and its envelope

- `SSR.plan(App, { id, state, baseline, boot? })`. `App` must be a runnable
  application, with `init` and `update`. `state` is a writable projection
  (`Projection.pick` or `compose`) of the client-owned Model. `baseline` is the
  Model the client starts from before `state` is set onto it. It is never
  written, since a writable projection's `set` returns a new Model, so a
  baseline Foldkit freezes in development is safe.
- `ResumeEnvelope { v: 1, plan, state }` in a
  `<script type="application/json" data-foldkit-plus-resume>`. The runtime id is
  not in it: it comes from the root's stamp, as the design keeps it.
- Tests: encode and decode round-trip; each refusal in decision 3 is a test,
  including a payload read under the wrong build; each escape in decision 4 is
  a test with a Model string that would otherwise break out of the script.
- Gate: Phase 0.

**Done.** `SSR.plan`, `SSR.envelope`, `SSR.resume` and `serializeJsonScript`,
with a test for the round trip, for nothing outside the slice crossing, for
each refusal and for each escape. Six of seven mutations turned a test red. The
seventh removed a copy of the baseline, which turned out to be redundant: `set`
never writes the Model it is given. The copy came out. The build-id check in
decision 3 belongs with hydration, and is in Phase 2.

### Phase 2: hand the Model over instead of rerunning `init`

- Server: run the application's `init` once, round-trip the plan's slice
  through its Schema, render the view from baseline plus that slice (as
  Foldkit renders from decoded Flags), and write the envelope into the
  **template**, not into `rendered.html`, which `injectIntoTemplate` requires to
  hold only the root and Foldkit's own payload.
- Client: decision 3's checks, then set the slice onto the baseline and hydrate
  a program whose `init` returns that Model plus `boot`'s Commands.
- Tests:
  - the application's `init` is never called on the client; the DOM is adopted,
    not rebuilt; the page works;
  - **nothing outside the slice crosses**: a Model field holding a large value
    left out of the plan does not appear anywhere in the HTML (the design's
    central test);
  - **the view does not depend on what was left out**: the server compares the
    view rendered from baseline plus the round-tripped slice with the one it
    serves, and refuses a plan that makes them differ. In production Foldkit
    silently rebuilds a mismatched subtree, so this is the only place it shows;
  - `injectIntoTemplate` accepts the output;
  - a `Mirror.kv` application restores what was saved, through `boot`;
  - a routing application resumes on its route, and a client URL for another
    route is refused;
  - a config with `Flags: undefined` is refused, pinning the trap in decision 2.
- Gate: Phase 1.

**Done.** `SSR.render`, `SSR.page` and `SSR.hydrate`, with a test file for each
case: the handover (init runs once, on the server; the nodes are adopted; the
page works), Flags that never reach the page, the `Flags: undefined` trap,
`boot`, `Mirror.kv` restoring through `boot`, each `ResumeUnsafe` refusal, a
tampered envelope, a page from another build, a route resumed and a route or
query refused, and a page with no server render. Nine of twelve mutations
turned a test red at first. Two survivors needed tests: a route check that
compared only the path, and the client render of an unstamped page. The third
removed a copy of the options without `flags`, which was redundant, since a
config with no `Flags` key makes Foldkit write no Flags script. The copy came
out. Learned:

- The route the page was rendered for travels in the envelope, and the browser
  compares it with its own path and query (decision 8). The client parses no
  route of its own, which keeps the check free of the application's router.
- Foldkit logs nothing through `console.error` when it refuses a page from
  another build, so the tests check containment, not a log.
- A `Mirror.kv` restore arrives after the storage layer is built, later than
  one tick, so its test waits for the value rather than for a fixed delay.

### Phase 3: check that the plan covers what the client reads

- `SSR.plan(App, { …, local, surfaces })`: `local` names the fields allowed to
  start from the baseline, such as an open menu. The check fails unless every
  field a client Surface reads, and every field that decides which Surfaces are
  active, is in the slice or in `local`. A Remote read counts by its
  requirements and connections, not by dependency paths.
- Activation matters as much as reading: if the client works out a different
  set of active Surfaces from the resumed Model, retention collects the data
  they would have shown.
- `SSR.inspect(plan)`: which Model paths cross the boundary, which are local,
  and which Surface needs each.
- Tests: a Surface reading a field in neither list is reported, naming the
  Surface and the path. A field that decides activation, left out, is reported.
  A Remote read is reported through its metadata.
- Gate: Phase 2.

**Done.** `SSR.plan` takes `local` and `surfaces`, `SSR.inspect(plan, model)`
reports coverage, and `SSR.render` refuses a plan that falls short with
`ResumeUnsafe` `Uncovered`, one line per gap. Eleven mutations each turned a
test red once two tests were added for survivors: a pathless `local` place had
covered everything, and a Surface whose Remote id follows an unsent field was
compared by its paths alone. Decided on the way:

- **The check runs for a Model, at render time.** A Surface's reads follow its
  params, which follow the Model, so the plan alone cannot say what a Surface
  reads. `SSR.inspect` takes the Model for the same reason.
- **Activation is checked twice.** The place a `Surface.when` reads must be sent
  or local. A `Surface.at` callback records no place, so every Surface is also
  worked out from the browser's Model and compared, reads and metadata both.
  That catches an opaque activation that reads an unsent field.
- **Remote reads are reported, not interpreted.** `foldkit-ssr` reads no
  package's metadata key; it reports whatever a projection carries by
  `Metadata.summarize`. Until Phase R gives Remote a resume part, a Surface
  that reads Remote is refused, which is the honest answer: its data would not
  be in the browser.
- **A Surface from another application is refused** when the plan is made, by
  the owner token Surface already carries.

### Phase 4: server-owned static regions

- `SSR.static(id, view)`: rendered on the server with `inertHtml`, without
  Foldkit's hydration markers, which its server refuses inside trusted
  `InnerHTML`. On the client, the markup is read from the DOM before hydration
  (design §21) and handed back as trusted `InnerHTML`, so the region is adopted
  and never rendered on the client.
- Tests: the static view runs once on the server and never on the client; its
  DOM nodes are the same after hydration; a client-only render still works; two
  regions with the same id, and a region the server did not render, are each
  reported (design §30, §31).
- Gate: Phase 2.

**Done.** `SSR.static(id, render)`, with a test for each case above and for a
render leaving no context behind. Eight mutations each turned a test red once
that last test was added; one mutation had broken the syntax, so it was run
again as a real one. What was built differs from the first bullet, for the
better:

- **The server renders a region as ordinary children**, inside an element
  carrying `data-foldkit-plus-static`, not as a serialized string. Foldkit's
  serializer is not exported, and a region rendered inside the render needs
  none. The markers the first bullet worried about are attributes Foldkit puts
  only on keyed elements; a keyed element inside a region keeps them, which is
  harmless because nothing reads them there.
- **A render context says what a region does**, set around one synchronous
  call of the view (design §12): the server's render collects each region, its
  second render (the view check) replays them, so a region's render runs once
  and never reads the browser's Model, and the browser's render adopts the
  snapshots `SSR.hydrate` read before hydrating.
- **A region missing from the page is reported and rendered**, not refused. A
  Message can show a region after the page is live, and refusing would freeze a
  working page. Duplicate ids are refused on the server, where they are made.

### Phase 5: static generation

- The same render at build time for a known URL, written as a file. The
  envelope and decision 8's URL check apply unchanged.
- Test: a page generated for one route resumes on it, and is refused when served
  at another.
- Gate: Phase 2.

**Done.** `SSR.generate(config, plan, { buildId, template, origin, paths,
flags? })` returns each page with the file it is served from. Twelve mutations
each turned a test red. One thing did not apply unchanged:

- **Decision 8 is revised for generated pages.** A static host serves one file
  whatever the query, and for `/about` and `/about/` alike, so checking the
  query would refuse, and freeze, a generated page for every link with a
  tracking parameter. A generated page's envelope records its path and
  `match: "path"`, and the browser compares paths only, ignoring a trailing
  slash and `index.html`. The path is still checked. A page rendered per
  request keeps the full check, since its server saw the query.
- Paths with a query or fragment, and two paths that would be one file, are
  refused before anything renders. `SSR.generate` writes nothing itself: the
  package runs in the browser too, so it returns the files for a build script
  to write.

### Phase R: resume Remote's state

The design's resume parts (§19) are how a package contributes to the envelope:
each part captures a value on the server, restores it on the client, and
describes itself for `SSR.inspect`. Remote is the first part.

`Snapshot` is not what Remote sends. It is built for a cache that survived a
reload, and deliberately keeps no cursors. A page rendered a moment ago should
send the connections whole, boundaries included, and the live cursors, so the
lists show their "load more" correctly and a live subscription resumes where the
server left off. So Remote gains, first, each in its own commit with its own
test:

1. A capture of what given projections require: their entities' fields, and
   their connections with segments and boundaries.
2. A restore of that capture through `updateRemote`, leaving the rest of
   `RemoteModel` (loading, failures, the mutation ledger) at its initial value.
3. Output safe inside a `<script>`, through `serializeJsonScript`.

Then `Remote.resume(Data, { surfaces })` as a part.

- The part also declares Remote's Subscription entries deferrable (decision
  10): a read with its data resumed plans nothing, a live subscription resumes
  from the cursor the envelope carries, and retention running late collects
  late. That is what lets a Remote page use the resumable track's deferred
  boot at all.
- Tests: a page rendered with Remote data hydrates with the data present and
  makes no request for it; a list's "load more" works on the client; data no
  Surface needs is not in the payload; retention on the client does not collect
  what was resumed; a live subscription started after a delay receives what
  was published in between.
- Gate: Phase 3 and Phase U.

### Phase U: move to Foldkit 0.163

Before the phases below, because each would otherwise be built on 0.158
internals and checked again. The repository-wide upgrade is the guide's steps
1 to 3; this phase is its part for `packages/ssr`:

- Read `FOLDKIT_APP_ATTRIBUTE` and `FOLDKIT_FLAGS_ATTRIBUTE` from Foldkit, in
  the source and the tests that spell them (decision 5).
- Every existing test stays green unchanged, the Flags trap and the build-id
  refusal above all; a test that needs changing is a finding for this plan.
- Extend Phase 2's view check to the head: `renderToString` returns `title`,
  `canonical`, `ogUrl`, `lang` and `dir` beside the body, and each must be the
  same from the browser's Model as from the server's, or `SSR.render` refuses
  with `ViewDependsOnUnsentState` (decision 9). Test: a title read from an
  unsent field is refused.
- Say in the README that `canonical` comes from the Model, and word the
  development risk in model-preservation terms.
- Gate: Phase 5, and the repository's own upgrade commits.

### Phase 6: deliver a page through Foldkit's fetch handler

- `SSR.entry(config, plan, { buildId, template, flags? })` returns the
  `renderPage` a Foldkit server entry exports, so `handleRequest` and the
  emitted `fetch.js` serve a resumed page on Node and on Workers alike.
- The envelope is the question (see [what changed
  upstream](#what-changed-upstream-foldkit-0159-to-0163)). The first cut
  answers with `Responded`: the page `SSR.page` builds, as an HTML `Response`,
  keeping `handleRequest`'s request classification and giving up only its
  template injection. The upstream ask is a way for a `Rendered` result to
  carry one more trusted payload script, which would let the envelope go back
  to `Rendered`.
- The design's sketched `foldkit-ssr/vite` plugin, if it is built, extends
  `@foldkit/vite-plugin@0.24`'s `ssr.serverEntry` rather than owning a build
  entry.
- `handleRequest` hands every method but `CONNECT`, `TRACE` and `TRACK` to
  `renderPage`, `POST` included. Until Phase E, `SSR.entry` renders `GET` and
  `HEAD` and answers any other method `405`; Phase E then routes a `POST` to
  the fallback path to `SSR.handle`, with no second route table.
- Tests: `handleRequest` with a page `Request` returns a `Response` that
  resumes; a hashed-asset miss is not answered with the page; a `RenderError`
  or `ResumeUnsafe` becomes an error response, not a page that cannot resume;
  a `POST` is answered `405`.
- Gate: Phase U.

### Phases A to F: resumable pages

Binding-level resumability was parked as research. [resumable-DESIGN.md](./resumable-DESIGN.md)
argues it is not, for Foldkit: a handler is a Message, a value that already
round-trips through the Message Schema, so the page can say which Message each
element causes, and the view need not run until the first one. Its phases are
this plan's next track, in its order, and it is the source for their detail:

- **A. The resumable builder.** `Resume.builder(h)` marks each binding with an
  ordinal and writes the encoded Message, or a member with a hole, into a
  manifest inside the envelope. Built on Phase 4's render context, which gains
  the manifest as a fourth concern. The builder reaches views through
  `Surface.rootView` (`foldkit-surface`) and `SurfaceView.define`
  (`foldkit-mixins-surface`), so both gain the hook, and their skill references
  change in the same commit. Phase 2's view
  check compares the two renders' manifests (decision 11); test that a
  Message built from an unsent field is refused.
- **B. Delegated dispatch.** `Resume.listen`, one capture-phase listener per
  event type at the root, honouring each binding's propagation and default
  action as the eager page does. The manifest is decoded once, at load, through
  the application's Message union restricted to what the plan allows, and
  every marker in the root is checked against it then; a page that fails is
  refused whole (decision 3), which settles the design's rule 5 against its
  §2.
- **C. Deferred boot.** `SSR.hydrate`'s `start: 'now' | 'idle' |
  'on-interaction'`, default `'now'`, with Messages queued before boot and
  replayed after Foldkit's first committed patch. `EagerStartRequired` refuses
  deferral while an entry active for the sent Model is not declared
  deferrable (decision 10), naming it. Re-check on 0.163 whether the
  boot-buffer fix narrows the rule further. The plan's `boot` Commands run at
  boot, so with deferral a `Mirror.kv` restore waits for the first
  interaction; that is the application's choice to make with `start`.
- **D. Coverage and static refusal.** Phase 3's check gains the Message side: a
  binding whose Message no active Surface lists in `messages` is `Uncovered`,
  a page with bindings and no `surfaces` is refused, and a binding inside
  `SSR.static` is refused.
- **E. Server fallback.** `fallback: 'server'` on forms, and `SSR.handle`,
  called from Phase 6's `renderPage` for a posted Message: the server runs
  `init`, `boot`, `update` and its Commands, and renders the result.
- **F. Bundle boundaries**, then `Bundle.lazy`.

Gates: A to D on Phase U, since three of their claims rest on Foldkit internals
(`seedAdoptedState`, a control's value mismatch, and when the root's app
attribute is removed), checked against 0.158.2 and 0.163.0 alike, which tests
pin. E on Phase 6. F on E and a real application that shows the boot chunk is
dominated by Bundle bodies.

The order puts Phase R before this track. A Surface that reads Remote is
refused today (Phase 3), a resumable page still needs its data in the browser
before its first Message arrives, and Phase R's deferrable declarations are
what let a Remote page defer its boot at all.

### Beyond this plan

These wait on something outside this repository, and are not scheduled:

- **Opaque boundaries** (design Phase 4) wait on Foldkit's "externally owned
  children" primitive, still unshipped in 0.163.
- **`Runtime.adopt`** would replace the adapted-`init` workaround and let the
  runtime handle startup Commands. It is an upstream change, and since 0.159 it
  can be asked for in Foldkit's own words: model preservation already starts a
  runtime from a Model, but takes no Commands. `adopt` is the missing third
  boot mode beside `run` (fresh), `hydrate` (Flags into `init`, then adopt)
  and preservation (a Model, then a fresh patch): a Model and its Commands,
  then adopt. With it, Subscriptions could start eagerly while the view waits,
  which is what the resumable track's `EagerStartRequired` works around.
- **Rendering a Model on the server** (`renderModelToString`) is a smaller ask
  than when the design proposed it: since 0.163 a server render depends only on
  config, URL and build id, with no request-derived `canonical` to thread
  through.
- **A payload slot in a `Rendered` result**, so Phase 6 can return `Rendered`.
  New with 0.159.
- **Removing static code from the client bundle** (design Phase 5) needs a Vite
  plugin on `@foldkit/vite-plugin`'s `ssr.serverEntry`, and is worth building
  only once static regions are used.
- **Surfaces as the unit of hydration** (design Phase 6) needs a renderer per
  subtree, an upstream change. Binding-level resumability, the design's Phase
  7, is no longer here: it is Phases A to F above.

## Risks

- **The workaround is not an API.** Skipping `init` through a config whose
  `init` returns a Model relies on Foldkit's current hydration. If Foldkit
  changes how `hydrate` treats `init`, Phase 2 breaks. Its tests will say so the
  day it happens.
- **Refusal relies on an empty build id being refused.** Decision 3 contains a
  page by asking Foldkit to hydrate with a build id it rejects. That is
  Foldkit's documented behaviour for a mismatch, and Phase 2's refusal tests
  pin it.
- **Development is not production.** Under Vite's dev server, Foldkit's model
  preservation restores the previous Model after a reload and skips adoption,
  giving the stamped root a fresh patch, so a resumed page behaves differently
  in development. Phase 2's tests run the production path.
- **The resumable track leans on three Foldkit internals**: that the first
  patch removes attributes the browser's view does not assert, that a
  control's value differing from the vnode is patched to the Model's, and that
  the root's app attribute is removed just before the first committed patch.
  None is an API. Each gets a test that fails the day it changes.
- **The pre-boot window.** Between the first Message and Foldkit's first
  committed patch, events are queued by the delegated listeners, which are
  removed in that commit. A double dispatch or a lost event there is the
  resumable track's likeliest bug, and effect-atom-jsx's first audit found
  exactly that. Phase C tests fire during the window and count dispatches.
- **Foldkit's server module is experimental**, and `handleRequest`,
  `EntryResult` and `toResponse` say so. Phase 6 wraps as little of them as it
  can.
- **Clocks.** Remote's `updatedAt` is the server's clock. A `maxAge` policy on
  the client can refetch data the server just sent if the clocks disagree.

## What review changed

An independent review of the first version found these, each checked against
Foldkit's code or by running it:

- The envelope cannot be appended to `rendered.html`; `injectIntoTemplate`
  refuses it. It goes in the template.
- The first version decoded the payload before Foldkit's build check and, on
  failure, re-rendered the page on the client. That contradicted design §31,
  and is impossible for an application with Flags. Decision 3 now refuses, in
  Foldkit's order, with Foldkit's containment.
- Dropping `init`'s Commands by default would have lost `Mirror.kv`'s restore.
  Decision 1 now defaults `boot` to the wirings' startup Commands, and refuses
  undeclared ones otherwise. (Phase 2 kept the refusal and dropped the default;
  see decision 1.)
- Routing and static generation, both in the design's first release, were
  missing. Decision 8, Phase 2's routing test and Phase 5 add them.
- The coverage check could never fail, since the baseline is a whole Model. It
  now needs `local` declared, and covers the fields that decide activation.
- Nothing caught a view that depends on a field left out of the slice. Phase 2
  now compares the two renders on the server.
- `Hydrated { fresh: true }` would restore lists with a "load more" that does
  nothing, having no cursor. Phase R sends connections whole instead of a
  `Snapshot`.
- The first version said Foldkit's markers would survive inside a static region.
  Foldkit's server refuses them there, so regions are rendered without them.
  (Phase 4 found a simpler way: a region is rendered as ordinary children, and
  the markers, which Foldkit puts only on keyed elements, are harmless there.)
- Decision 4's escape reasoning was wrong: `<` alone is sufficient, and was
  tested.
- `baseline`, the design's central "nothing else crosses" test, the resume
  parts API, and the Phase 0 compatibility list had been dropped silently. Each
  is back.
