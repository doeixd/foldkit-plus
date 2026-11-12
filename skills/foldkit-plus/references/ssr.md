# foldkit-ssr

Checked against `foldkit-ssr` 0.11.0, `foldkit` 0.170.0.

Server rendering that hands the browser **the Model the server reached**, not
the inputs to rebuild it: `init` runs once, on the server, and the browser
starts from the slice of the Model it owns. Early (0.x). Render per request
(`SSR.entry`, through Foldkit's `handleRequest`) or at build time
(`SSR.generate`); a plan is checked against the Surfaces the browser reads.
Opt-in on top: `SSR.static` regions the browser never renders, resumable
pages that answer events before boot (`Resume`, a plan's `start`), forms that
work with scripts off (`fallback: 'server'`), and lazy bundles loaded before
render and boot (`lazy`).

## What it owns

Only the handover from a server render to the browser. Rendering to HTML and
adopting it stay Foldkit's (`foldkit/experimental/server`, `foldkit/runtime`);
`foldkit-ssr` calls them. Placing a served page into its template stays the
host's (`handleRequest`, the Vite plugin's dev server, the fetch handler the
build emits): the envelope rides the stamped root, so the entry answers
`Rendered` and never splices markup into a template. `SSR.page` and
`SSR.generate` place pages only where Plus owns the template: a static file
it writes itself. It adds a **resume plan**: which slice of the Model
crosses, as JSON on the stamped root read back through the slice's own Schema.
Nothing outside the slice crosses, Flags included.

## Basic use

`App` is a runnable `Surface.application`, `config` the application's
`makeApplication` config, `EditorToolbar` one of its Surfaces, and `template`
the built `index.html`:

<!-- docs-check
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
const Model = Schema.Struct({
  draft: Schema.String,
  count: Schema.Number,
  menuOpen: Schema.Boolean,
  query: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ToggledMenu: {} })
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { draft: '', count: 0, menuOpen: false, query: '' },
  update: model => ({ model }),
})
const SearchInUrl = { reduce: (model: Model, _href: string) => model }
const EditorToolbar = App.surface('EditorToolbar', {
  model: ({ model }) => ({ draft: model.draft, menuOpen: model.menuOpen }),
  messages: [Message.ToggledMenu],
})
const config = {
  Model,
  init: () => ({ model: App.initial }),
  update: (model: Model, _message: Message) => ({ model }),
  view: (model: Model, h: HtmlBuilder<Message>) => ({ title: 'Editor', body: h.p([], [model.draft]) }),
  container: null,
}
declare const template: string
declare const buildId: string
declare const url: string
-->

```ts
import { Effect } from 'effect'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count), // what the browser owns
  // baseline defaults to App.initial; boot: model => Commands to run on load
  local: [App.model.menuOpen], // refs that may start from the baseline
  restored: [App.model.query], // fields the browser reads again, left out of the envelope
  restore: model => SearchInUrl.reduce(model, window.location.href), // browser only, before the first render
  surfaces: [Surface.at(EditorToolbar, undefined)], // checked against state + restored + local
})

// server
const result = await Effect.runPromise(SSR.render(config, Editor, { buildId, url }))
const html = SSR.page(template, result) // the envelope rides the stamped root; the host owns the template

// browser, instead of Runtime.hydrate: import { SSR } from 'foldkit-ssr/client'
SSR.hydrate(config, Editor, { buildId })
```

`local` fields start from the baseline and are never sent. `restored` fields
are left out of the envelope and read again by the browser in `restore`, before
the first render, such as a URL or cookie mirror's; `state` must not also send
a restored path.

A page the browser declines (`when: page => …`) or finds stale (`fresh: version => …`) is
contained, or with `otherwise: 'render'` drawn afresh in its place. Give `until: model => …`
(the page's reads answered: `RemoteData.answered`, `QueryBlock.active(...).answered`) so the
served page stays in view while the fresh one draws hidden, and is swapped once it is ready
(at most `UNTIL_LIMIT_MS`, 3 s): otherwise the page blinks to its loading state and back.

What only the browser has (a queue it stored, an id this page load mints) never crosses:
the server cannot read it. `SSR.hydrate`'s `prepare: model => Effect` adds to the resumed
Model, before adoption, only what no view draws; what is drawn arrives after as a Message. A
page with Remote's durable outbox passes `prepare: durable.session` (the session, nothing
read), and the outbox's own Subscription brings the queue after the first frame. Restoring
the queue there instead (`durable.restore`) would draw what the served page lacks, and Foldkit
would rebuild those elements.

## Gotchas

- **Link the stylesheet in the document's head, not in `styles`.** `styles` is
  written as the root's last children, hundreds of KB into the page, so it
  paints unstyled and shifts (domains-plus's CLS was 0.88). With
  `foldkit-mixins/vite`'s `styles({ sheet })`, the document's `head`
  (`renderDocument`'s option) carries `<link rel="stylesheet" href
  data-foldkit-styles-href>` and the page writes no sheet at all.
- **A served page with `foldkit-mixins` styles and no linked sheet needs `styles`, or it flashes
  unstyled.** `foundations()` writes the theme into `index.html` alone; a page
  `SSR.entry` renders carries no head of its own. Give `SSR.entry` (and
  `SSR.render`, `SSR.handle`)
  `` styles: (_rendered, drawn) => `<style>${stylesheet}</style><style>${Style.usedDrawn(drawn)}</style>` ``:
  the theme's stylesheet and the CSS of each class the page draws, in the
  rendered root; `SSR.hydrate` moves them into the head before adopting, and
  the browser's Styles find them there and add none twice. See
  `examples/foldkit/ssr/src/renderPage.ts`.
- **Render from Remote data by preparing it first.** `SSR.render` and
  `SSR.generate` render the Model `init` returns; nothing is fetched during a
  render. Build that Model with `Data.satisfy(model, actives)` in
  `SSR.entry`'s `prepare: (model, request) => Effect<Model>`, which runs after
  `init` for `GET`, `HEAD` and a posted form (before its Message is checked),
  so one entry serves every request; a failed `prepare` is a reported `500`.
  `Data.satisfy` reads
  every active Surface pass after pass until nothing is missing, so a read that
  depends on another (a page's Blocks on its document) is made too. `init`
  stays the application's own (with a `foldkit-bundle` assembly,
  `placements.initial(...)`); `prepare` reads from the Model it returns.
- **Import `foldkit-ssr/client` in the browser.** It holds `plan`, `resume`,
  `hydrate`, `static`, `serving` and the attribute names (including
  `FOLDKIT_APP_ATTRIBUTE`) and imports nothing from the server, about 200 kB
  minified less than `foldkit-ssr`, which carries Foldkit's renderer. Import
  `foldkit-ssr` only in server code. `SSR.hydrate` takes the same
  `makeApplication` config; `SSR.entry(..., { headers: (request, model) =>
  … })` sets headers on every response it answers (`model` is `some` of the
  Model a rendered or posted page reached, `none` where nothing rendered, so a
  cookie is written from it) and answers OPTIONS itself. A header `Headers`
  refuses (CR or LF in a value), one that frames the response, or `location`
  is a `500`.

- `init`'s Commands never run on a resumed page. `SSR.render` fails with
  `ResumeUnsafe` `UndeclaredStartup` until the plan names them in `boot`. A
  `foldkit-bundle` app (`Mirror.kv` restore): `boot: model => assembly.init(model).commands ?? []`.
- A reader's theme or scheme in the first frame: served per request, read a
  cookie in `flags` into the Model and its `state`, with `vary: cookie`; the
  view cannot draw `<html>`, so the template still carries
  `Themes.script`/`Theme.schemeScript()`, the keeping Command writes both the
  cookie and storage, and `boot` applies the Model's theme. Generated at build
  time, only a head script (`head`) can: the Model catches up in `boot`.
- A view that reads a field outside `state` fails with `ResumeUnsafe`
  `ViewDependsOnUnsentState`, in its body or its head (`title`, `lang`, `dir`,
  `canonical`, `ogUrl`). Add the field to `state` or stop reading it. Foldkit
  0.163 gives `canonical` no default: derive it from the route in the Model.
  Foldkit fills `canonical` and `og:url` only into tags the template has; a
  render that sets one into a template without its tag is refused.
- `SSR.plan({ meta: model => Meta })` writes the description, `og:*`,
  `twitter:card`, `article:*`, `robots`, alternates and JSON-LD into the head,
  escaped and checked like the view, and `SSR.hydrate` replaces them as the
  Model changes. `Meta` is typed (`import type { Meta } from 'foldkit-ssr'`).
- A Surface in `surfaces` that reads or is activated by a field in none of
  `state`, `restored` or `local`, reads Remote data no part resumes, or activates
  differently from the browser's Model fails with `Uncovered`. A
  `Surface.each` family is one entry: the envelope carries its parent's reads
  with its instances', and coverage inspects each instance (`Child[key]`,
  with which parent reveals it).
- `parts: [Remote.resume(Data)]` sends what the active Surfaces read from
  Remote's store (fields through relations, connection boundaries, live
  cursors) and nothing else; the browser refetches none of it. A part that
  cannot restore its own capture fails with `UnrestorablePart`; a page missing
  a part, or carrying an unknown one, is refused (`Invalid`).
  `SSR.inspect(plan, model)` shows each read's cover. The check runs for the
  server's Model, since a Surface's reads follow its params.
- `SSR.static('id', ih => [...])` in a view: rendered once on the server with
  the inert builder (no handlers), adopted as trusted `InnerHTML` in the
  browser, never rendered there, so what it reads need not be in `state`. It
  changes only with a new document; anything a Message changes belongs in a
  Surface. Duplicate ids fail with `DuplicateStaticRegion`. `ih` is
  `HtmlBuilder<never>`, so a Slot's attributes (typed with the page's Message)
  go in through `SSR.unbound(slots.title.attrs())`, which throws on a handler
  or a Submodel's attribute among them; what it returns fits any builder.
- `SSR.serving()`: true while the server renders a page, false in the browser and outside a
  render; `foldkit-richtext-dom`'s `editorAt(hostId, { serverRendered: SSR.serving })` sends
  the document's markup in the editor's host, which the browser's editor adopts.
- In the browser a page whose envelope cannot resume (`ResumeRefused`:
  `Missing`, `Duplicate`, `Unreadable`, `Protocol`, `Plan`, `Invalid`,
  `Route`) is contained with the reason reported, never re-rendered.
- **Give the client and the server one build id.** Both pass `buildId:
  import.meta.env.FOLDKIT_BUILD_ID`, which the `foldkit` Vite plugin compiles
  in from the environment (a commit, a release tag). Unset, the client gets
  `undefined` and contains every page (`NoBuildId`); two builds with
  different ids contain it too (`OtherBuild`). When nothing sets it and one
  `vite build` makes both bundles, write `process.env.FOLDKIT_BUILD_ID ??=
  randomUUID()` in `vite.config.ts` before `foldkit()` reads it. A script run
  outside Vite reads `process.env.FOLDKIT_BUILD_ID`.
- What SSR keeps going past is a diagnostic on `foldkit-surface`'s channel
  (`Diagnostics`, re-exported), by default Effect's log (an error on
  `console.error`): `PageContained`
  (`reason`: `NoBuildId`, `OtherBuild` or the refusal's), `StaticRegionMissing`,
  `BundleUnloaded`, `PageFailed` (a `500`), `HandlerUnnamed`, `CachedPageDiffers`,
  `HeadNotMoved`.
  `SSR.hydrate(config, plan, { buildId, diagnostics })` takes a reporter, since
  a refusal comes before any runtime's `resources`; `SSR.entry`'s
  `diagnostics(diagnostic, request)` covers everything the request runs. Test
  with `Diagnostics.collect()`.
- A Surface renderer: `Surface.rootView(S, params, Resume.view((m, rh) => ...))`;
  `rh` makes only the Surface's Messages. No cast: the builder is generic over
  the `h` it is given.
- `const rh = Resume.builder(h)` in a view: `h` plus hole forms,
  `rh.OnInput(Message.ChangedSearch)`, `rh.OnChange(Message.Renamed, { id })`,
  `rh.OnKeyDown(Message.Pressed)`; the member must leave one string field (or
  `key` and `modifiers`), checked by the types. The server marks each
  element's event with every binding's ordinal in the order Foldkit chains
  them (`data-foldkit-plus-on-click="0 1"`), `*` for a handler it cannot
  describe (a closure, `OnKeyDownPreventDefault`), and writes each binding's
  Foldkit attribute and encoded Message into the envelope. A binding built
  from an unsent field fails with `ViewDependsOnUnsentState`; the plan needs
  the app's Message Schema (make it from `App`), else `UnencodableBinding`.
  A hole form whose field refuses the empty placeholder (`isMinLength(1)`) is
  marked `*` too. `SSR.render`'s result lists every `*` as `unnamed`
  (`{ element, event }`); on a deferred page `SSR.entry` and `SSR.generate`
  report each once per process (`HandlerUnnamed`).
- A Surface's `messages` is the allow list for the page's bindings. A binding
  whose Message no Surface active for the served Model lists is `Uncovered`
  (naming element and tag); bindings with no `surfaces` in the plan are
  `UndeclaredSurfaces`; a handler inside `SSR.static` (only a nested `rh` can
  put one there) is `BindingInStaticRegion`.
- In the browser, `Resume.bindings(plan, document, root, model)` decodes the
  page's bindings, keeps them to what the active Surfaces list, and checks
  its markers (a `ResumeRefused` otherwise), then
  `Resume.listen(root, { bindings, onAnswer, events? })` gives each event one answer,
  `{ event, messages, unnamed? }`: the Messages its bindings dispatch in
  Foldkit's order, and at a `*` the element it stopped at. It returns the
  function that removes the listeners. `SSR.hydrate` uses both itself.
- `start: 'idle' | 'on-interaction'` on the plan (default `'now'`) makes
  `SSR.hydrate` answer from the markers and boot on the first event or when
  idle. The booting event counts once: a completed answer is queued, replayed
  after boot and stopped; one that met a `*` goes on to the live page. On the
  server such a plan is refused (`EagerStartRequired`) naming each
  Subscription, and each Managed Resource the sent Model asks for, that would
  start late, unless `deferrable: ['key']` names it or a part vouches for it
  (`Remote.resume` does for Remote's entries). Pass the app's `subscriptions`
  and `managedResources` in the config given to `SSR.render` so the check sees
  them.
  A helper that takes the builder is typed `ResumableBuilder<Message>`
  (`import type { ResumableBuilder } from 'foldkit-ssr'`); it is the only
  builder type the package exports.
- `rh.KeepTyped()` on a field keeps what is typed into it before the script
  runs, on any `start`: `rh.input([rh.Value(model.draft),
  rh.OnInput(Message.ChangedDraft), rh.KeepTyped()])`. `SSR.hydrate` reads the
  field, replays a changed value as its `OnInput` (else `OnChange`) Message
  ahead of anything else, and puts back the value and caret its first render
  reset. No inline script, so no CSP nonce. Only an `input` that takes text, a
  `textarea` or a `select` that `rh` builds (`rh.input`, not `h.input`: only
  `rh`'s elements are marked) with a hole-form binding, or a checkbox or radio
  (its `checked` against the served one, replayed as its named `OnChange`,
  else `OnInput`, else `OnClick`; a radio moved off replays nothing): anything
  else is `UnkeepableField` on the server. On a plan whose `start` is not
  `'now'`, a field with such a binding and no `KeepTyped` is refused
  (`UnkeptField`, breaking in 0.12). An IME composition in progress at boot
  ends. Nothing answers the typing before the bundle runs (no `?q=`, no
  derived text): that takes an inline script, which `foldkit-ssr` does not
  write; once it runs, a page started `'idle'`/`'on-interaction'` with kept
  typing starts at once and draws it.
- `foldkit-ssr/loader` is an entry script that imports nothing of `effect`,
  Foldkit or the app (about 2 KB brotli): `load({ runtime: () =>
  import('./entry.js') })`, where `entry.ts` calls `SSR.hydrate`. It follows
  the plan's `start`, which the server writes into the envelope: `'now'`
  runs the chunk at once; `'idle'` fetches it idle after load and runs it
  idle again; `'on-interaction'` fetches it the same way and runs it on a
  pointer over or down, focus or key on a marked element (a binding or a kept
  field), or a scroll. Until `SSR.hydrate` takes over it holds each event a
  marker names (a submission prevented; not one on a kept field), and
  `SSR.hydrate`, starting at once, answers each from the markers, once. A held
  event not taken 3 s after it happened (`UNTIL_LIMIT_MS`) is released: a
  submission goes to the browser (`requestSubmit`), anything else is dropped;
  a chunk that fails to load, or a page that does not resume, releases at
  once. `runtimeChunk({ entry: '/src/client/entry.ts' })` from
  `foldkit-ssr/vite` writes the chunk's address into the loader so a build
  fetches it with `<link rel="modulepreload">` without running it; there is
  no other way to name it.
- `SSR.generate` returns pages as a tuple of `paths`: `const [home, about]`.
  `SSR.sitemap(pages, { origin })` (each `{ path, modified? }`) and
  `SSR.robots({ origin, sitemap?, disallow? })` write the two files a static
  host serves beside them; `Site.targets` lists the pages.
- `staticSite` (`foldkit-ssr/vite`) takes `emit(pages)`: files made from the
  generated pages, written beside them (`foldkit-media`'s `materialize` writes
  the image variants the pages name). A path outside the output, or on a file
  the build or the client build writes, is refused.
- `SSR.page(template, result, { head? })` and `SSR.generate` take
  `head: (rendered, drawn) => string`, put before `</head>`: with
  `foldkit-mixins`, `` (_rendered, drawn) => `<style>${Style.usedDrawn(drawn)}</style>` ``
  ships a generated page's CSS in its first paint without scanning the HTML.
  `SSR.render`, `SSR.entry` and
  `SSR.handle` take the same function as `styles`, carried as the rendered
  root's last children for a served page, which has no template head to
  write to; `SSR.hydrate` moves them into the head (hydration would remove
  them), and styles for a void root are refused with `VoidRootWithStyles`.
- `SSR.entry(config, plan, { buildId, flags?, prepare?, redirect?, headers?, resources?, origins?, styles?, status?, answerPost?, prerendered?, diagnostics?, cache? })` returns the
  `{ renderPage }` a Foldkit server entry exports for `handleRequest` (or the
  `foldkit` Vite plugin's dev server). `GET` and `HEAD` render, `POST` is
  handled for a plan with `fallback: 'server'`; other methods get `405`; a
  refused, failed or throwing render, or `flags` that reject, get `500` with
  the reason reported. A page is `200` unless `status: (model, request) =>
  number` gives another from the server's Model (`404` for a NotFound route);
  one outside 200–599 is a `500`. It answers `Rendered`, with the envelope on the rendered
  root beside Foldkit's own stamps. A plan's `meta` rides in the root between
  marker comments; wrap the host's document renderer in `SSR.headed(render)`
  to move it before `</head>`, or `SSR.hydrate` reports `HeadNotMoved` (the
  served head lacked it) and removes it. A void root refuses it
  (`RootRefusesHead`: void, table, `svg`, raw-text roots).
- `redirect: (model, request) => Option<string>` (#235) answers a `GET`/`HEAD`
  `303` to the path from the Model `prepare` made, before any render (the view
  never runs), so one entry decides access and draws the page from one read:
  `Access.match(accessOf(model), { Denied: ({ url }) => Option.some(url), … })`.
  It carries the entry's `headers` (given that Model) with `cache-control:
  private, no-store` over theirs, and `cache` never keeps it. The path must
  start with one `/` and stay on the request's origin (an absolute URL,
  `//host`, `/\host`, a relative path are a reported `500`). A post is
  `answerPost`'s.
- `cache: { store, maxAge, check? }` (`PageCache`, #428) keeps a `GET`/`HEAD`
  page by build id and full URL when it was drawn from the URL alone: every
  read through `pageReader` public (`PageReads`), every request header that
  `flags`/`prepare`/`redirect`/`headers`/`status` read absent (they get a request that
  records reads; reading all headers, `clone`, or an `SSR.requestContext`
  keeps nothing; handing it to `fetch`/`new Request` fails), no `set-cookie`
  or own `cache-control`, status 200. Kept for the shortest of `maxAge` and
  its reads, `cache-control: public, max-age=…`, `vary` with the absent
  headers read; served only to requests lacking them. Anything else says
  `private, no-store`. `store: CacheStore.kv(env.CACHE, { keep: '6 hours' })`
  serves a kept page for `keep`, past its freshness, from Workers KV (a
  client with `RemotePolicy.staleWhileRevalidate` re-reads stale reads);
  it is a `PageCacheStore`, which `serveFetch` refuses. Wrap the entry's `renderDocument` in
  `SSR.keptDocuments(render)`, or the host parses a kept page again every
  request. Checker: `check` draws a kept page again and reports
  `CachedPageDiffers` (times within a day of now are not compared);
  `SSR.checkCache(options => SSR.entry(config, plan, { buildId, ...options }),
  requests)` rejects a difference or no kept page.
- `lazy: [Upload]` in the config (each a `Bundle.lazy`): `SSR.render` loads
  the bodies first; `SSR.hydrate` loads them before boot, answering from the
  markers meanwhile whatever `start` is, then replays. A placement's view
  takes `rh` (`Placed.view(model, rh)`); a binding inside it is recorded as
  the parent's wrapped Message (`hole` one wrapper down, `depth`), so the
  Surface lists `Message.GotUploadMessage`. Server markup stamps each
  placement root `data-foldkit-plus-slot="Upload@upload"` (`SLOT_ATTRIBUTE`).
- `fallback: 'server'` on the plan: a form with a named `rh.OnSubmit(Message)`
  and no `Method` is written `method="post"` to its own URL with a hidden
  `foldkit-plus-message` input (the Message encoded). `SSR.handle(request,
  config, plan, { buildId, flags?, prepare?, styles?, resources? })`, which `SSR.entry` calls for `POST`,
  decodes it, lets posted fields named as the Message's own override them,
  requires a tag an active Surface lists, rebuilds the Model (`init`, then the
  plan's `boot`), runs `update` and each Command under `config.resources`
  (Foldkit's `resources` Layer), and answers with the rendered page. A form
  inside a placement posts the wrapped Message and a `foldkit-plus-depth`
  field, so its fields are filled inside the wrapper. Bad posts are `400`
  (`FallbackRefused`); a failing Command is `500`, and so is a post whose
  Commands do not settle within 100 steps (a Command that reschedules itself,
  a poll, cannot run on the server); a Command yielding no Message folds
  nothing in.
- A whole page without scripts (search and filters as a GET of the URL
  mirror's keys, plain controls shown under `@media (scripting: none)`,
  paging links for a virtual list, a cart through the fallback): give a GET
  form `rh.Method('get')`, since with a fallback an `rh.form` with no
  `Method` whose `OnSubmit` names a Message posts it, and one with a `Method`
  is left as drawn; draw both kinds of control on both sides,
  never in `<noscript>`; keep state between posts in a cookie the entry reads
  and validates, since a post starts from `init`, and write it back in
  `headers` from the Model the post reached. The guide is
  https://github.com/doeixd/foldkit-plus/blob/main/docs/progressive-enhancement.md,
  worked on `examples/foldkit/domains-plus`.
- `renderPage(request)` gets nothing but the request, so what the host holds
  (a Worker's `env`, a reader built from it) rides on it:
  `const PageContext = SSR.requestContext<C>('app/page')` in a module both
  import; the host calls `pages.fetch(PageContext.attach(request, value))`,
  and `renderPage` reads `PageContext.of(request)`, an `Option` (none under
  Vite's dev server, which builds its own `Request`). It crosses bundles by
  name. The reader for `Data.satisfy` is `foldkit-remote-server/fetch`'s
  `pageReader`; `examples/auth/src/host.ts` wires both.
- `SSR.entry`'s `resources: request => Layer`, built for a post alone, gives its Commands their own
  services (who posted: `AuthServer.resolver({ …, requests: 'browser' })`
  from `foldkit-auth`). A plan with a server fallback requires `origins`: a
  post whose `Origin` is not among them is `403`, since a form cannot carry a
  CSRF header. `origins: 'same-origin'` takes only the origin the request
  was addressed to (a dev server's unknown port); behind a proxy that
  terminates TLS or rewrites the host it refuses every post (`http://` URL,
  `https://` Origin), so pass the public origin there
  (`origins: ['https://example.com']`). `answerPost: 'redirect'`
  answers a handled post `303` to its own path and query (relative, never
  another origin) instead of the page, so a reload does not post again (a
  plan without `fallback: 'server'` given it throws when the entry is made);
  what the post changed reaches the next `GET` only through what `headers`
  wrote from the Model it reached (a cookie), which `prepare` reads back.
- The route check compares path and query with the URL the server rendered.
  A page from `SSR.generate(config, plan, { buildId, template, origin, paths })`
  records its path alone, since a static host ignores the query: it resumes at
  `/about?ref=x` or `/about/`, not at `/other`, and at a query starts from
  the Model `routing.onUrlChange` of that URL gives (the differing part is
  redrawn). Each result has `file`
  (`about/index.html`) and `html` to write. A page Foldkit's plugin
  prerenders through `SSR.entry` (`ssr.build.prerender`) needs
  `SSR.entry(..., { prerendered: prerenderPaths })`, the list the entry module
  also exports as `prerenderPaths`; otherwise the file is refused at `?q=…`.
  Such a page is one file every visitor is given (#469), so its render is
  held to `cache`'s rule and stricter: every `pageReader` read public, no
  request header read at all (absent included), `headers` setting nothing,
  status 200. Otherwise `renderPage` rejects naming the read
  (`CachedRead.Private({ read })`, e.g. `Price a`), header or status, and the
  build fails; it answers with no headers and skips the page cache. It is
  fresh as of the build: a client with `RemotePolicy.staleWhileRevalidate`
  re-reads at boot every read older than `maxAge`, and the server never
  renders it again. Until the bundle runs a file shows its recorded state,
  and Workers static assets match by path alone (a prerendered `/` answers
  `/?q=…`), so a page whose first paint reads its query (a search box from
  `?q=`) is rendered per request instead.
- `Projection.pick` refuses two fields with the same last key (`post.id` and
  `viewer.id`), which would otherwise merge into one.
- Lower level: `SSR.envelope(plan, model, { route? })` and
  `SSR.resume(plan, document, { route? })`. The envelope rides the stamped
  root as `data-foldkit-plus-resume`, beside Foldkit's own stamps, so any host
  injects the page whole.

## Known traps

Met in applications on this stack: what failed, and what to do instead.

- **Without one build id on both sides, `SSR.hydrate` contains the server's
  page instead of resuming it** ([#210](https://github.com/doeixd/foldkit-plus/issues/210)).
  `import.meta.env` is undefined under `tsx`, so a module both Vite and `tsx`
  load throws on a bare `import.meta.env.FOLDKIT_BUILD_ID`. Read it only in
  entries Vite transforms, read `process.env` in scripts, and make a server
  entry they share a factory that takes the id.
- **Server markup must be what a parser builds from it.** Rows put straight in
  a `<table>` gain a `tbody` when parsed, and Foldkit refuses to serialize a
  view whose parse differs, so every server-rendered page with that table
  failed while DOM-built tests passed. Write the `tbody`, and test markup by
  rendering it to a string and parsing it back.
- **A property set through a generic write is client-only.** `h.Prop` (and a
  custom element's property) is left out of a server render, so a form tool
  reading the markup misses it. Check what reaches the markup by rendering to
  a string, not by assuming.
- **Any import from `foldkit/experimental/server` brings the server along.** A
  browser entry that took one constant from it grew from 700 KB to 880 KB.
  Check the bundle's size after an import from a package that also runs on a
  server.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/ssr/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/foldkit/ssr
- https://github.com/doeixd/foldkit-plus/tree/main/examples/reference (pages
  rendered in a Worker as the reader, with `SSR.requestContext`)
