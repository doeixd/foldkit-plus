# `foldkit-ssr`: implementation plan

**Status:** Phases 0 and 1 done; Phase 2 next. Written 2026-09-22 against `foldkit`
0.158.2 and this repository at 0.10.0, then revised the same day after an
independent review (see [What review changed](#what-review-changed)).

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

## Decisions

The design leaves these open, or the review found the first answer wrong. Each
is decided here, and a phase can revisit one only with a reason recorded beside
it.

1. **Startup Commands are declared, never dropped silently.** On the server
   Foldkit already drops `init`'s Commands. On the client the adapted `init`
   returns the resumed Model and the Commands of `boot(model)`.
   - For an application assembled with `foldkit-bundle`, `boot` defaults to its
     wirings' startup Commands. That is where `Mirror.kv` restores what a user
     saved (`packages/mirror/src/index.ts:801`), and dropping it would lose it.
   - For any other application, if the server's `init` returned Commands and the
     plan names no `boot`, rendering is refused, naming the Commands. A startup
     Command nobody declared is not quietly skipped.
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
   `data-foldkit-plus-static`. Foldkit reserves a fixed set of `data-foldkit-*`
   names today, and nothing strips others, but a later release may reserve more.
6. **Rendering stays synchronous.** `init` is synchronous on the server, so
   data is loaded before rendering, with `Data.prefetch` for Remote. SSR adds no
   async render path.
7. **Tests use a fresh jsdom per file.** `Runtime.hydrate` returns no handle to
   stop it, so a hydrated program lives until its document goes.
8. **The URL is checked, not trusted.** The runtime never dispatches
   `onUrlChange` at boot, so the route the client starts on is whatever the
   server parsed. The client parses its own URL and refuses (decision 3) if the
   route differs from the one resumed. Static generation has the same check
   against the URL it was built for.

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

### Phase 5: static generation

- The same render at build time for a known URL, written as a file. The
  envelope and decision 8's URL check apply unchanged.
- Test: a page generated for one route resumes on it, and is refused when served
  at another.
- Gate: Phase 2.

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

- Tests: a page rendered with Remote data hydrates with the data present and
  makes no request for it; a list's "load more" works on the client; data no
  Surface needs is not in the payload; retention on the client does not collect
  what was resumed.
- Gate: Phase 3.

### Beyond this plan

These wait on something outside this repository, and are not scheduled:

- **Opaque boundaries** (design Phase 4) wait on Foldkit's "externally owned
  children" primitive.
- **`Runtime.adopt`** would replace the adapted-`init` workaround and let the
  runtime handle startup Commands. It is an upstream change.
- **Removing static code from the client bundle** (design Phase 5) needs a Vite
  plugin, and is worth building only after Phase 4 shows the regions are used.
- **Surfaces as the unit of hydration and binding-level resumability** (design
  Phases 6 and 7) need a different runtime and are research.

## Risks

- **The workaround is not an API.** Skipping `init` through a config whose
  `init` returns a Model relies on Foldkit's current hydration. If Foldkit
  changes how `hydrate` treats `init`, Phase 2 breaks. Its tests will say so the
  day it happens.
- **Refusal relies on an empty build id being refused.** Decision 3 contains a
  page by asking Foldkit to hydrate with a build id it rejects. That is
  Foldkit's documented behaviour for a mismatch, and a Phase 1 test pins it.
- **Development is not production.** With hot reloading, Foldkit keeps the
  previous Model and skips adoption, so a resumed page behaves differently in
  development. Phase 2's tests run the production path.
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
  undeclared ones otherwise.
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
- Decision 4's escape reasoning was wrong: `<` alone is sufficient, and was
  tested.
- `baseline`, the design's central "nothing else crosses" test, the resume
  parts API, and the Phase 0 compatibility list had been dropped silently. Each
  is back.
