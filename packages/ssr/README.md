# `foldkit-ssr`

Standard server rendering runs `init` on the server to fetch a post, read a
session, or compute initial state, then embeds those input `Flags` in the HTML
so the browser runs `init` all over again on hydration. Once `init` does real
work, that second run repeats server queries, flashes loading states, and
leaks server-only data into the page.

`foldkit-ssr` hands the browser the **slice of the `Model` the server already
reached**, instead of re-running `init`. You declare a resume plan listing the
fields the browser owns; `SSR.render` runs `init` once, writes that slice onto
the root element, and verifies at render time that the browser's first frame
matches the server's HTML. `SSR.hydrate` then resumes directly from the
rendered DOM.

See it running in [`examples/foldkit/ssr`](../../examples/foldkit/ssr) and
[Site, Remote and SSR together](../../docs/site-remote-ssr.md).

## Install

```sh
pnpm add foldkit-ssr foldkit-surface foldkit effect
```

## A first resumed page

This declares a resume plan (`PostPlan`) that sends `title` and `draft` to the
browser while keeping `serverSecret` on the server, then renders the page:

```ts
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { SSR } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'

const Model = Schema.Struct({ title: Schema.String, draft: Schema.String, serverSecret: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Typed: { draft: Schema.String } })
const initial: Model = { title: 'Hello', draft: '', serverSecret: '' }
const App = Surface.application({ Model, Message, initial, update: m => ({ model: m }) })

export const PostPlan = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.title, App.model.draft),
})

const config = {
  Model,
  init: () => ({ model: { title: 'Hello', draft: 'notes', serverSecret: 'internal-token' } }),
  update: (model: Model) => ({ model }),
  view: (model: Model, h: HtmlBuilder<typeof Message.Type>) => ({
    title: model.title,
    body: h.main([], [h.h1([], [model.title]), h.p([], [model.draft])]),
  }),
  container: null,
}

const result = await Effect.runPromise(SSR.render(config, PostPlan, { buildId: 'b1' }))
```

`result.application.html` contains the rendered root element stamped with both
Foldkit's app attribute and the serialized resume envelope (without
`serverSecret`):

```html
<main data-foldkit-app="..." data-foldkit-plus-resume='{"v":1,"plan":"post","buildId":"b1","state":{"title":"Hello","draft":"notes"}}'>
  <h1>Hello</h1><p>notes</p>
</main>
```

Inject that result into your HTML template with `SSR.page(template, result)` on
the server, and boot in the browser from `'foldkit-ssr/client'`:

```ts
import { SSR as ClientSSR } from 'foldkit-ssr/client'

ClientSSR.hydrate(config, PostPlan, { buildId: 'b1' })
```

Import `'foldkit-ssr/client'` in shared plan and view modules as well as browser
entry points so client bundles exclude `foldkit/experimental/server` (saving
about 200 kB minified / 60 kB gzipped in
[`examples/foldkit/ssr`](../../examples/foldkit/ssr)).

- **`SSR.plan`** declares which `Model` slice crosses to the browser.
- **`SSR.render`** runs `init` once, renders the view against both the server
  `Model` and the browser's resumed `Model`, and fails with `ResumeUnsafe` if
  they differ ([When a page is refused](#when-a-page-is-refused)).
- **`SSR.page`** injects the rendered application into your HTML template via
  Foldkit's `injectIntoTemplate`, with an optional `head` callback.
- **`SSR.hydrate`** verifies the `buildId` and envelope, resumes the `Model`
  without calling `init`, adopts the DOM via `Runtime.hydrate`, and runs the
  plan's `boot` Commands.

## How the handover works

| Concern | Foldkit (`renderToString` + `Runtime.hydrate`) | `foldkit-ssr` (`SSR.render` + `SSR.hydrate`) |
| --- | --- | --- |
| Payload in HTML | Input `Flags` | Plan's `Model` slice (no `Flags`) |
| Where `init` runs | Server, then again in browser | Server only |
| Server-only data | Crosses if `init` needs it | Stays on server unless picked in `state` |
| View reading unsent state | Rebuilt in browser (dev warning) | Refused by `SSR.render` before serving |
| Extra setup | Application config only | One `SSR.plan` |

Ownership across the handover stays cleanly split:

- **Rendering and DOM adoption** stay Foldkit's (`renderToString` and
  `Runtime.hydrate`), gated by a `buildId` check so stale deployments never
  decode mismatched envelopes.
- **Application state** stays in your `Model` and `update`.
- **Normalized server data** crosses via `Remote.resume(Data)` from
  `foldkit-remote`.
- **Browser-only queues** (such as `localStorage` outboxes) join after boot
  via [`prepare`](#what-only-the-browser-has-prepare).

Beyond the handover, you can adopt **static regions** (`SSR.static`) that skip
browser rendering, **resumable pages** (`Resume.builder`) that queue clicks and
typing before boot, and **server-handled forms** (`fallback: 'server'`) that
work with JavaScript disabled.

The rest of this guide uses a post page application (`App`, `Model`, `Message`,
`config`), defined in full under
[The application in these examples](#the-application-in-these-examples).

### Commands `init` would have run: `boot`

Because the browser skips `init`, any startup Commands returned by `init` must
be listed in `boot` (otherwise `SSR.render` refuses the plan with
`UndeclaredStartup`):

<!-- docs-check standalone define ssr-app
import { Effect, Layer, Option, Schema } from 'effect'
import { Command } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion } from 'foldkit/route'
import { Remote } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'

const AppRoute = defineRouteUnion({ Home: {}, Post: { id: Schema.String }, NotFound: {} })
const Model = Schema.Struct({
  route: AppRoute,
  post: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    body: Schema.String,
    excerpt: Schema.String,
    publishedAt: Schema.String,
    liked: Schema.Boolean,
  }),
  draft: Schema.String,
  menuOpen: Schema.Boolean,
  remote: Remote.Model,
})
type Model = typeof Model.Type
const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  altKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})
const Message = defineMessageUnion({
  ...Remote.messages,
  Liked: { id: Schema.String },
  ChangedDraft: { value: Schema.String },
  Renamed: { id: Schema.String, title: Schema.String },
  Pressed: { key: Schema.String, modifiers: Modifiers },
})
type Message = typeof Message.Type
const initial: Model = {
  route: AppRoute.Post({ id: 'p1' }),
  post: { id: 'p1', title: 'Hello', body: '', excerpt: '', publishedAt: '2026-01-01', liked: false },
  draft: '',
  menuOpen: false,
  remote: Remote.initial,
}
const App = Surface.application({ Model, Message, initial, update: (model: Model) => ({ model }) })
const Data = Remote.make({ model: App.model.remote, entities: [] })
const PostActions = App.surface('PostActions', {
  params: { id: Schema.String },
  model: ({ model }) => ({ liked: model.post.liked }),
  messages: [Message.Liked],
})
const Menu = App.surface('Menu', { model: ({ model }) => ({ open: model.menuOpen }) })
const Like = App.surface('Like', {
  model: ({ model }) => ({ id: model.post.id }),
  messages: [Message.Liked],
})
const PostActionsAt = Surface.when(PostActions, App.model.route, AppRoute.Post, route => ({
  id: route.id,
}))
const PostPageAt = Surface.at(Menu, undefined)
const LoadPreferences = Command.define('LoadPreferences', {
  messages: [Message.ChangedDraft],
  execute: Effect.succeed(Message.ChangedDraft({ value: '' })),
})
const config = {
  Model,
  init: () => ({ model: initial }),
  update: (model: Model, _message: Message) => ({ model }),
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: model.post.title,
    body: h.p([], [model.draft]),
  }),
  container: null,
}
declare const template: string
declare const buildId: string
declare const url: string
declare const request: Request
-->
<!-- docs-check
import { SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
  boot: () => [LoadPreferences()],
})
```

Applications using `foldkit-bundle` run their assembly startup Commands here so
`Mirror.kv` restores persisted client state:

```ts sketch
boot: model => assembly.init(model).commands ?? []
```

### Styles in the first paint

Pages styled with `foldkit-mixins` can inline only the CSS classes used during
the render so the first paint is styled before scripts load:

<!-- docs-check
const result = await Effect.runPromise(SSR.render(config, Post, { buildId, url }))
-->

```ts
import { Style } from 'foldkit-mixins'

const html = SSR.page(template, result, {
  head: (_rendered, drawn) => `<style>${Style.usedDrawn(drawn)}</style>`,
})
```

`Style.usedDrawn(drawn)` emits rules and keyframes for the classes rendered in
that pass (also exposed on `result.drawn`; `Style.usedIn(rendered.html)` works
when holding raw HTML). In the browser, Styles skip rules already present in
this sheet. With `foldkit-mixins/vite`, link the hashed CSS asset in `head`
with `<link rel="stylesheet" href="${href}" data-foldkit-styles-href>`.

For dynamic serving via `SSR.entry` (where the host owns `index.html`), pass
`styles` so theme and used-class styles append inside the rendered root and
move to `<head>` when `SSR.hydrate` runs
(`examples/foldkit/ssr/src/renderPage.ts`):

<!-- docs-check
declare const stylesheet: string
-->

```ts
const styles = (_rendered: { readonly html: string }, drawn: ReadonlySet<string>): string =>
  `<style>${stylesheet}</style><style>${Style.usedDrawn(drawn)}</style>`

SSR.entry(config, Post, { buildId, styles })
```

Keep `styles` to `<style>` and stylesheet `<link>` tags; void root elements
cannot hold child style tags (`VoidRootWithStyles`). `SSR.generate` accepts the
same `head` option as `SSR.page` and returns `500` if `head` throws.

### The head is part of the view

`title`, `lang`, `dir`, `canonical`, and `ogUrl` are verified alongside the
body. Derive `canonical` from the route in your `Model` (and include the route
in `state`) whenever needed. Foldkit populates `canonical` and `og:url` into
existing `<link rel="canonical" href="">` or `<meta property="og:url" content="">`
tags in the template and fails the render if the template lacks them.

### What a page says of itself: `meta`

Add `meta` to a plan to populate description, Open Graph, Twitter cards,
article dates, and JSON-LD tags:

<!-- docs-check standalone use ssr-app
import { SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.post),
  meta: model => ({
    description: model.post.excerpt,
    type: 'article',
    article: { published: model.post.publishedAt },
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: model.post.title }],
  }),
})
```

`SSR.page` and `SSR.generate` inject escaped tags carrying
`data-foldkit-meta` (`META_ATTRIBUTE`) before `</head>` (leave matching tags out
of the base template), and `SSR.render` checks that `meta` reads only sent
fields (`ViewDependsOnUnsentState`). `SSR.hydrate` updates those tags on
in-app navigation. `image` accepts an absolute URL (plus `imageSize` and
`imageAlt`), and `article` accepts `authors` and `tags`.

## Serving pages

### Through Foldkit's fetch handler

`SSR.entry` produces Foldkit's `renderPage(request)` handler for `handleRequest`
on Node and Cloudflare Workers:

```ts
import { handleRequest } from 'foldkit/experimental/server'

export const { renderPage } = SSR.entry(config, Post, { buildId })

export default {
  fetch: (request: Request) => handleRequest(request, { renderPage, template }),
}
```

```ts standalone
// vite.config.ts
import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [foldkit({ ssr: { serverEntry: '/src/entry.server.ts' } })],
})
```

Pass the same deployment id to both `entry.server.ts` and your client entry
(`buildId: import.meta.env.FOLDKIT_BUILD_ID` in Vite, or `process.env.FOLDKIT_BUILD_ID`
in build scripts). When no environment variable is set during a single
`vite build`, assign one in `vite.config.ts` before calling `foldkit()`:

```ts
import { randomUUID } from 'node:crypto'

process.env.FOLDKIT_BUILD_ID ??= randomUUID()
```

Without a matching `buildId` on both sides, `SSR.hydrate` contains the page
and reports `NoBuildId` or `OtherBuild` (`PageContained` under
[Diagnostics](#diagnostics)) instead of decoding an envelope from another
build.

Request handling in `SSR.entry`:

- **`GET` and `HEAD`:** Runs `flags(request)` (when configured), `init`,
  `prepare(model, request)` (for `Data.satisfy` or reading request cookies),
  and [`redirect`](#sending-a-page-elsewhere-redirect) before rendering.
- **`POST`:** Handled when the plan sets `fallback: 'server'`
  ([Forms that work without scripts](#forms-that-work-without-scripts)).
- **`OPTIONS` and other methods:** Answers `OPTIONS` with `204` and other
  methods with `405` and an `Allow` header.
- **Errors:** Failed renders, `flags`, `prepare`, or `status` callbacks answer
  `500` and report `PageFailed` ([Diagnostics](#diagnostics)).

Use `headers(request, model)` to attach response headers (`model` is
`Option.some(reachedModel)` on rendered pages and `Option.none()` on `OPTIONS`,
`405`, refused posts, or `500`s):

<!-- docs-check standalone use ssr-app
import { SSR } from 'foldkit-ssr'
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})
-->

```ts
SSR.entry(config, Post, {
  buildId,
  headers: (_request, model) => ({
    'cache-control': 'private, no-store',
    vary: 'cookie',
    ...Option.match(model, {
      onNone: () => ({}),
      onSome: ({ post }) => ({
        'set-cookie': `last-read=${encodeURIComponent(post.id)}; Path=/; SameSite=Lax`,
      }),
    }),
  }),
})
```

Throwing inside `headers`, returning invalid header values, or setting
response-framing headers (`content-length`, `transfer-encoding`, `connection`,
`location`) returns `500`. Always URL-encode Model values placed in cookies.

Use `status(model, request)` to return custom HTTP status codes (such as `404`
for `NotFound` routes):

```ts
SSR.entry(config, Post, {
  buildId,
  status: model =>
    AppRoute.match(model.route, { Home: () => 200, Post: () => 200, NotFound: () => 404 }),
})
```

Status codes outside `200`–`599`, bodyless statuses (`204`, `205`, `304`), or
thrown errors answer `500`.

To move a plan's `meta` tags into `<head>` during dynamic serving, wrap the
host's document renderer with `SSR.headed`:

```ts
import { injectIntoTemplate, renderDocument as renderShell } from 'foldkit/experimental/server'

// Export as `renderDocument` from your Vite server entry:
const headedShell = SSR.headed(renderShell)

// Or wrap template injection:
const headedTemplate = SSR.headed((application: Parameters<typeof injectIntoTemplate>[1]) =>
  injectIntoTemplate(template, application),
)
```

`SSR.headed` moves the marked meta block at the end of the root into `<head>`
per request (use `SSR.keptDocuments(SSR.headed(render))` when caching rendered
documents). Root tags that forbid `<meta>` (void tags, tables, `<svg>`, raw
text) fail with `RootRefusesHead`; omitting `SSR.headed` triggers `HeadNotMoved`
on hydration.

### What the host hands the page: `SSR.requestContext`

Because `handleRequest` invokes `renderPage(request)` with no `env` parameter,
use `SSR.requestContext` to attach per-request dependencies (such as
`pageReader`) in your Worker or Node host and read them inside `prepare`:

<!-- docs-check
const actives = { page: PostActionsAt }
-->

```ts
import { Effect, Option, type Layer } from 'effect'
import type { RemoteClient, RemoteUnauthenticated } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr'

// Shared module imported by both the host and server entry.
export const PageContext = SSR.requestContext<{
  readonly reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>
}>('app/page')

// Host attaches per request:
//   pages.fetch(PageContext.attach(request, { reader: pageReader(page)(request, env) }))

export const { renderPage } = SSR.entry(config, Post, {
  buildId,
  prepare: (model, request) =>
    Option.match(PageContext.of(request), {
      onNone: () => Effect.fail(new Error('No reader for this page.')),
      onSome: ({ reader }) => Data.satisfy(model, actives).pipe(Effect.provide(reader)),
    }),
})
```

`PageContext` stores values in a `globalThis` `WeakMap` keyed by registered
symbol so separately bundled Worker and Vite page entries share values by
context name without leaking across requests. Calling `PageContext.attach`
twice with the same name on one `Request` throws, and copying a `Request` via
`new Request(request)` drops attached context (`PageContext.of` returns
`Option.none()`). See [`examples/auth`](../../examples/auth) (`src/host.ts`)
for the full setup.

### Sending a page elsewhere: `redirect`

For protected pages, `redirect(model, request)` inspects the prepared `Model` on
`GET` and `HEAD` requests and returns `Option.some(path)` to answer with `303`
before rendering the view (use [`answerPost`](#answering-a-post-with-a-redirect)
for `POST` forms):

<!-- docs-check
import { Access } from 'foldkit-site'
declare const accessOf: (model: Model) => Access
-->

```ts
export const guarded = SSR.entry(config, Post, {
  buildId,
  prepare: (model, request) =>
    Option.match(PageContext.of(request), {
      onNone: () => Effect.fail(new Error('No reader for this page.')),
      onSome: ({ reader }) => Data.satisfy(model, actives).pipe(Effect.provide(reader)),
    }),
  redirect: model =>
    Access.match(accessOf(model), {
      Denied: ({ url }) => Option.some(url),
      Allowed: () => Option.none(),
      Pending: () => Option.none(),
    }),
})
```

Redirects always set `cache-control: private, no-store` (bypassing `cache` while
keeping any `set-cookie` or `vary` headers from `headers`). Return a same-origin
path starting with a single `/` (never an absolute URL, `//host`, or `/\host`,
which fail with `500`).

### Keeping pages: `cache`

Pages rendered solely from their URL are identical for every visitor. Pass
`cache` to store and reuse public responses:

```ts
import { CacheStore } from 'foldkit-surface'

export const cached = SSR.entry(config, Post, {
  buildId,
  cache: { store: CacheStore.memory(), maxAge: '60 seconds' },
})
```

For each `GET` request, `SSR.entry` tracks every header read by `flags`,
`prepare`, `redirect`, `headers`, or `status`, as well as every `pageReader`
read (`PageReads`):

- **Cached:** When every read header was absent from the request, every
  `pageReader` read was public, status is `200`, and `headers` set no cookie or
  custom `cache-control`, the page is stored under `(buildId, url)` with
  `cache-control: public, max-age=…` and `vary` listing the watched headers.
  Mutations answered by `serveFetch` sharing the store purge affected pages
  automatically.
- **Not cached:** Requests carrying a watched header (such as a session or
  cart cookie), calling `request.clone()`, reading `SSR.requestContext`, or
  returning cookies or non-`200` statuses receive `cache-control: private, no-store`.

On Cloudflare Workers, use `CacheStore.workers(caches.default)` or
`CacheStore.kv(env.CACHE, { keep: '6 hours' })` (which serves stale HTML for
`keep` while clients refresh past `maxAge` via Remote). Wrap `renderDocument`
with `SSR.keptDocuments(SSR.headed(renderShell))` to cache the last 32
template injections per asset set.

Verify cache safety in development with `cache.check` (re-renders and reports
`CachedPageDiffers` on mismatch, ignoring 13-digit timestamps) or in tests with
`SSR.checkCache`:

```ts
export const checked = SSR.checkCache(
  options => SSR.entry(config, Post, { buildId, ...options }),
  [
    () => new Request('https://example.com/posts/1'),
    () => new Request('https://example.com/posts/1', { headers: { cookie: 'session=abc' } }),
  ],
)
```

### At build time

Generate static HTML files, a sitemap, and `robots.txt` for fixed routes:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const pages = await Effect.runPromise(
  SSR.generate(config, Post, {
    buildId,
    template,
    origin: 'https://example.com',
    paths: ['/', '/about', '/docs/intro'],
  }),
)
for (const page of pages) {
  await mkdir(dirname(join('dist', page.file)), { recursive: true })
  await writeFile(join('dist', page.file), page.html)
}
```

Paths map to `<path>/index.html` (or keep `.html` filenames). Generated pages
record their path without query parameters, so `/about?ref=mail` still resumes
and applies `routing.onUrlChange` immediately at boot before URL mirrors run.

```ts
await writeFile(
  'dist/sitemap.xml',
  SSR.sitemap(
    pages.map(page => ({ path: page.path, modified: '2026-09-27' })),
    { origin: 'https://example.com' },
  ),
)
await writeFile('dist/robots.txt', SSR.robots({ origin: 'https://example.com' }))
```

`SSR.sitemap` rejects duplicate paths, paths missing a leading `/`, or invalid
dates. `SSR.robots` supports `disallow` and custom `sitemap` paths.

### As a Vite plugin: `foldkit-ssr/vite`

`staticSite` runs the static build during Vite's `closeBundle` step by loading
a `SiteModule` (`src/site.ts`):

```ts standalone
// vite.config.ts
import { foldkit } from '@foldkit/vite-plugin'
import { staticSite } from 'foldkit-ssr/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [foldkit(), staticSite({ site: { module: '/src/site.ts' } })],
})
```

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})
-->

```ts
// src/site.ts
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'
export const site = {
  origin: 'https://example.com',
  paths: ['/', '/about'],
  config,
  plan: Post,
  head: (_rendered, drawn) => `<style>${Style.usedDrawn(drawn)}</style>`,
  files: 'directory',
  sitemap: true,
  robots: true,
} satisfies SiteModule
```

`config` and `plan` can also be functions of `path` when pages belong to
different apps. Pass `plugins` to `staticSite({ site, plugins })` if your app
relies on build plugins (such as Foldkit's view-identity branding) so generated
HTML matches client hydration. Use `emit` to write extra assets like responsive
image variants (`foldkit-media`'s `materialize`) without colliding with pages or
`public/` files. Outside Vite, call `generateStaticSite(site)`,
`writeEmitted(outDir, emitted)`, and `fileFor(path, layout)`.

### Pages rendered once, at build: `prerendered`

Routes that are identical for every visitor can be pre-rendered during
`vite build` (`ssr.build.prerender: true`) so the host serves static HTML with
zero server CPU. Export `prerenderPaths` and pass it to `SSR.entry`:

```ts
export const prerenderPaths = ['/']

export const { renderPage } = SSR.entry(config, Post, { buildId, prerendered: prerenderPaths })
```

```ts
// vite.config.ts
import { foldkit } from '@foldkit/vite-plugin'

foldkit({
  ssr: {
    serverEntry: '/src/entry.server.ts',
    clientEntry: '/src/entry.ts',
    build: { prerender: true },
  },
})
```

`SSR.entry` checks prerendered routes on every render (including dev): every
`pageReader` read must be public, zero request headers may be inspected (even
absent ones), status must be `200`, and `headers` must emit nothing — otherwise
`renderPage` fails and names the header or private read. Prerendered files record
their path without query strings so `/?q=…` resumes in the browser, while
dynamically rendered pages (such as search results in
`examples/foldkit/domains-plus` that read cookies or `?q=`) stay per-request.

## Checking what the browser will read

List `surfaces` that the browser may activate and `local` fields that start
from the baseline `Model` on purpose so `SSR.render` catches mismatches before
serving:

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.post.id, App.model.post.liked),
  local: [App.model.menuOpen], // intentionally starts from baseline
  surfaces: [
    Surface.when(PostActions, App.model.route, AppRoute.Post, route => ({ id: route.id })),
    Surface.at(Menu, undefined),
  ],
})
```

`SSR.render` refuses the plan if any active `Surface` reads or is activated by a
field missing from `state`, `restored`, and `local`, or if activation differs
between server and client `Model`s. `SSR.inspect(plan, model)` returns the
same coverage report for tests, inspecting each `Surface.each` instance by key
(`Member[u1]`).

### Fields the browser reads again

Fields owned by `foldkit-mirror` (URL or cookie mirrors) can be omitted from
the JSON envelope by listing them in `restored` and reading them in `restore`:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Mirror } from 'foldkit-mirror'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Model = Schema.Struct({
  route: Schema.String,
  results: Schema.Array(Schema.String),
  query: Schema.String,
  tld: Schema.String,
})
type Model = typeof Model.Type
const initial: Model = { route: '/', results: [], query: '', tld: '' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ Searched: {} }),
  initial,
  update: (model: Model) => ({ model }),
})
const SearchInUrl = Mirror.url(App, { name: 'search', fields: [App.model.query, App.model.tld] })
const SearchFilters = App.surface('SearchFilters', {
  model: ({ model }) => ({ query: model.query, tld: model.tld }),
})
-->

```ts
const SearchPlan = SSR.plan(App, {
  id: 'search',
  state: Projection.pick(App.model.route, App.model.results),
  restored: [App.model.query, App.model.tld],
  restore: model => SearchInUrl.reduce(model, window.location.href),
  surfaces: [Surface.at(SearchFilters, undefined)],
})
```

`restore` runs in the browser before adoption (throwing marks the page
`Invalid`); listing a field in both `state` and `restored` is refused.

## State the slice cannot carry

### Parts: another package's state

Packages like `foldkit-remote` supply a **part** that captures only what active
Surfaces read and restores it in the browser:

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route),
  surfaces: [PostPageAt],
  parts: [Remote.resume(Data)],
})
```

`Remote.resume` serializes selected fields, relations, connection boundaries,
and live cursors without re-fetching on boot. `SSR.render` verifies each part
can restore cleanly before serving (`UnrestorablePart`).

### Static regions: parts of the page the server owns

Wrap content that no `Message` updates (such as article prose or highlighted
code) in `SSR.static` so the browser adopts the server's HTML without
shipping its fields in `state`:

<!-- docs-check
import type { Html } from 'foldkit/html'

declare const PostActionsView: (model: Model, h: HtmlBuilder<Message>) => Html
-->

```ts
const view = (model: Model, h: HtmlBuilder<Message>) => ({
  title: 'Post',
  body: h.main(
    [],
    [
      SSR.static('post-copy', ih => [
        ih.h1([], [model.post.title]),
        ih.p([], [model.post.body]),
      ]),
      PostActionsView(model, h),
    ],
  ),
})
```

`ih` is typed as `HtmlBuilder<never>`, preventing event handlers inside static
markup (rendering a handler fails with `BindingInStaticRegion`). When styling a
static region with `foldkit-mixins` Slots, strip the parent `Message` type from
attributes using `SSR.unbound`:

<!-- docs-check
import type { SlotBuilder } from 'foldkit-mixins'

declare const slots: { readonly title: SlotBuilder<Message> }
declare const model: Model
-->

```ts
SSR.static('post-title', ih => [ih.h1(SSR.unbound(slots.title.attrs()), [model.post.title])])
```

If a later `Message` reveals a static region absent from the served HTML, the
browser renders it and reports `StaticRegionMissing`.

### What only the browser has: `prepare`

Browser-only state (such as a `localStorage` write queue or per-tab session id)
joins in two stages so the first client render matches the server's HTML:

1. **`SSR.hydrate`'s `prepare(model) => Effect`** runs on the resumed `Model`
   before DOM adoption; keep this to state the view does not render (such as a
   tab session id).
2. **A `Subscription`** reads the store after the first frame and updates the
   view through a normal `Message`.

For `foldkit-remote/outbox`, pass `durable.session` (never `durable.restore`)
as `prepare`:

<!-- docs-check standalone
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Remote } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const Model = Schema.Struct({ userId: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ ...Remote.messages }),
  initial: { userId: 'ada', remote: Remote.initial },
  update: (model: Model) => ({ model }),
})
const Data = Remote.make({ model: App.model.remote, entities: [] })
const plan = SSR.plan(App, { id: 'outbox', state: Projection.pick(App.model.userId) })
const config = {
  Model,
  init: () => ({ model: App.initial }),
  update: (model: Model) => ({ model }),
  view: (_model: Model, h: HtmlBuilder<never>) => h.p([], []),
  container: null,
}
declare const buildId: string
-->

```ts
import { outbox } from 'foldkit-remote/outbox'

const durable = outbox(Data, { key: model => `outbox:${model.userId}`, scope: model => model.userId })

SSR.hydrate(config, plan, { buildId, prepare: durable.session })
```

`durable.session` mints the tab's session id immediately so early writes queue
safely, and the outbox Subscription delivers stored writes via `OutboxRead`
after the first frame. See [`examples/reference`](../../examples/reference).

### Markup the browser adopts: `SSR.serving`

`SSR.serving()` returns `true` during `SSR.render` passes and `false` in the
browser, allowing custom elements (such as `foldkit-richtext-dom`'s
`editorAt({ serverRendered: SSR.serving })`) to emit initial light DOM on the
server.

## Resumable pages: answering before the runtime boots

A resumable page waits to boot Foldkit's runtime until idle or first user
interaction, capturing clicks and typing from encoded element markers and
replaying them in order once the runtime starts:

1. On the server, `Resume.builder(h)` encodes each handler's `Message` onto the
   element as a marker attribute and stores its schema binding in the envelope.
2. In the browser, events on marked elements queue their `Message`s and
   trigger runtime boot.
3. `SSR.hydrate` adopts the server DOM from the resumed `Model`, then runs
   queued `Message`s through `update` in order before any live events.

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const view = (model: Model, h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return {
    title: 'Post',
    body: rh.main(
      [],
      [
        rh.button([rh.OnClick(Message.Liked({ id: model.post.id }))], ['Like']),
        rh.input([rh.Value(model.draft), rh.OnInput(Message.ChangedDraft)]),
        rh.input([rh.OnChange(Message.Renamed, { id: model.post.id })]),
        rh.div([rh.OnKeyDown(Message.Pressed)], []),
      ],
    ),
  }
}
```

`OnInput`, `OnChange`, `OnKeyDown`, and `OnKeyUp` accept a `Message`
constructor directly when one string field (or `key` + `modifiers`) remains
open for the event to fill. Closure handlers and fields with placeholder checks
(such as `Schema.isMinLength(1)`) boot immediately when triggered and appear in
`result.unnamed`. Inside a `Surface` view, use `Resume.view`:

```ts
const LikeView = Surface.rootView(
  Like,
  undefined,
  Resume.view((like, rh) => rh.button([rh.OnClick(Message.Liked({ id: like.id }))], ['Like'])),
)
```

Set `start` on your plan to `'on-interaction'` or `'idle'` (default `'now'`):

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.post),
  surfaces: [PostActionsAt],
  start: 'on-interaction',
})
```

### What a resumable page must declare

- **Allowed `messages` on Surfaces:** Every `rh` binding's `Message` must
  appear in an active `Surface`'s `messages` array (`UndeclaredSurfaces` or
  `Uncovered` otherwise).
- **`deferrable` Subscriptions and Managed Resources:** Any Subscription or
  Managed Resource active at boot on a deferred plan must be listed in
  `deferrable` (`EagerStartRequired` otherwise; `Remote.resume(Data)` declares
  its own entries automatically). Pass `subscriptions` and `managedResources` to
  `SSR.render` so the check sees them.
- **`rh.KeepTyped()` on deferred inputs:** Inputs with named `OnInput` or
  `OnChange` handlers on a deferred plan must include `rh.KeepTyped()`
  (`UnkeptField` otherwise).

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const DeferredPost = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.post),
  parts: [Remote.resume(Data)],
  start: 'idle',
  deferrable: ['tick'],
})
```

### Bundles whose code loads on demand

List lazy `foldkit-bundle` modules (via `Bundle.lazy`) in your config's `lazy`
option so both server render and browser boot load the chunks before adopting:

```ts sketch
const config = {
  Model,
  init: () => placements.init({ title: 'Uploads', upload }),
  update: placements.update(),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return { title: model.title, body: rh.main([], [PlacedUpload.view(model, rh)]) }
  },
  container: null,
  subscriptions: placements.subscriptions(),
  lazy: [Upload],
}
```

For route-split apps, pass `lazy: model => Routing.codeFor(model.route)` and
include the fields `lazy` reads in `state` (`LazyDependsOnUnsentState`
otherwise). Inside a placement, list the parent wrapper `Message` on the
plan's `Surface`.

### Typing before the script arrives

Adding `rh.KeepTyped()` preserves text typed (or browser-restored) into an
`input`, `textarea`, `select`, checkbox, or radio before hydration finishes:

<!-- docs-check
declare const h: HtmlBuilder<Message>
declare const model: Model
const rh = Resume.builder(h)
-->

```ts
rh.input([rh.Value(model.draft), rh.OnInput(Message.ChangedDraft), rh.KeepTyped()])
```

1. While scripts load, the DOM element holds the typed value (requiring no
   inline script or CSP nonce).
2. At `SSR.hydrate`, changed fields emit their `OnInput` (or `OnChange` /
   `OnClick` for radios and checkboxes) `Message` at the front of the boot
   queue.
3. The first render adopts the served DOM, restores the typed value and caret
   position in the same task, and reduces the queued `Message`.

Only `rh`-built inputs with a named `Message` member accept `rh.KeepTyped()`
(`UnkeepableField` otherwise). Any active IME composition ends on the first
render while keeping its text.

### The runtime on intent: `foldkit-ssr/loader`

Even with `start: 'on-interaction'`, importing `SSR.hydrate` evaluates your
app bundle at load time. Use the ~2 KB `foldkit-ssr/loader` entry script so
the main bundle loads only when `start` triggers:

```ts sketch
// src/client/loader.ts
import { load } from 'foldkit-ssr/loader'

load({ runtime: () => import('./entry.js') }) // entry.ts calls SSR.hydrate
```

`load` reads `start` from the envelope: `'now'` imports immediately; `'idle'`
waits for browser idle; `'on-interaction'` waits for pointer, focus, key, or
scroll intent on a marked element. Marked events are held (up to 3 seconds via
`UNTIL_LIMIT_MS`) and passed to `SSR.hydrate` so they run once. Pair with
`runtimeChunk` from `foldkit-ssr/vite` to emit `<link rel="modulepreload">` for
the deferred bundle:

```ts sketch
plugins: [foldkit({ ssr: { clientEntry: '/src/client/loader.ts' } }), runtimeChunk({ entry: '/src/client/entry.ts' })]
```

## Forms that work without scripts

Forms built with `rh.form` and `rh.OnSubmit(Message)` can execute `update` on
the server when JavaScript is blocked or still loading by setting
`fallback: 'server'`:

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR } from 'foldkit-ssr'

const Model = Schema.Struct({
  draft: Schema.String,
  todos: Schema.Array(Schema.Struct({ title: Schema.String })),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Added: { title: Schema.String }, Typed: { value: Schema.String } })
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { draft: '', todos: [] },
  update: (model: Model) => ({ model }),
})
const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ draft: model.draft, todos: model.todos }),
  messages: [Message.Added, Message.Typed],
})
const config = {
  Model,
  init: () => ({ model: App.initial }),
  update: (model: Model, _message: Message) => ({ model }),
  view: (model: Model, h: HtmlBuilder<Message>) => ({ title: 'Todos', body: h.p([], [model.draft]) }),
  container: null,
}
declare const buildId: string
-->

```ts
const Todos = SSR.plan(App, {
  id: 'todos',
  state: Projection.pick(App.model.draft, App.model.todos),
  surfaces: [Surface.at(TodoList, undefined)],
  fallback: 'server',
})
```

<!-- docs-check
declare const h: HtmlBuilder<Message>
declare const model: Model
const rh = Resume.builder(h)
-->

```ts
rh.form(
  [rh.OnSubmit(Message.Added({ title: model.draft }))],
  [rh.input([rh.Name('title'), rh.Value(model.draft), rh.OnInput(Message.Typed)])],
)
```

With scripts running, Foldkit handles `OnSubmit` in the browser. Without
scripts, the server emits `method="post"` and a hidden Message field; on
`POST`, `SSR.handle` decodes the Message, merges posted form fields (like
`title`), verifies it against active `Surface`s (`400` `FallbackRefused` on
invalid input), runs `init`, `prepare`, `boot`, `update`, and up to 100
follow-up Commands (providing request-scoped `resources` over `config.resources`),
and returns the updated page (`500` if a Command fails).

Give plain search forms `rh.Method('get')` so they submit query parameters
instead of posting a Message.

Every `SSR.entry` using `fallback: 'server'` requires `origins` (such as
`origins: ['https://example.com']` behind reverse proxies, or `'same-origin'`
in local dev) and rejects unmatched `Origin` / `Sec-Fetch-Site` headers with
`403` before reading the body.

### Answering a post with a redirect

Set `answerPost: 'redirect'` (Post/Redirect/Get) so non-idempotent posts answer
`303` to the same path and browser reloads send `GET` instead of re-posting:

```ts
SSR.entry(config, Todos, {
  buildId,
  origins: ['https://example.com'],
  answerPost: 'redirect',
  headers: (_request, model) =>
    Option.match(model, {
      onNone: () => ({}),
      onSome: ({ todos }) => ({
        'set-cookie': `todos=${encodeURIComponent(JSON.stringify(todos))}; Path=/; HttpOnly; SameSite=Lax`,
      }),
    }),
})
```

1. `POST /todos` runs `update` and Commands, writes cookies via `headers`, and
   responds `303` with relative `Location: /todos`.
2. `GET /todos` runs `init` and `prepare` (reading the cookie or store) and
   renders the new page.

### A whole page without scripts

See [Pages that work without JavaScript](../../docs/progressive-enhancement.md)
and [`examples/foldkit/domains-plus`](../../examples/foldkit/domains-plus) for
combining `prepare`, GET forms, `(scripting: none)` styles, cookies, and
E2E tests.

## A reader's preferences in the first frame

To avoid flashing a default theme before scripts run, pass user preferences
from a request cookie into `flags` and include the preference field in `state`
alongside `cache-control: private` and `vary: cookie`:

```ts
import { Option, Record, Schema, pipe } from 'effect'
import { Cookies } from 'effect/http'
import { Theme, Themes } from 'foldkit-mixins/theme'

const themes = Themes.make(
  { plain: Theme.make({}), dense: Theme.make({ shape: { density: 0.85 } }) },
  { initial: 'plain' },
)

export const readThemeCookie = (cookieHeader: string) =>
  pipe(
    Cookies.parseHeader(cookieHeader),
    Record.get('theme'),
    Option.flatMap(Schema.decodeUnknownOption(themes.Name)),
    Option.getOrElse(() => themes.initial),
  )
```

For `<html>` attributes (`color-scheme` and theme classes) and statically
generated pages, include `Themes.script(themes)` / `Theme.schemeScript()` in
the document `<head>`, persist choices to both cookie and `localStorage` via
`Themes.choose`, and call `Themes.apply` in `boot`.

## When a page is refused

`SSR.render` fails with `ResumeUnsafe` before serving a broken page.

| `reason` | Cause | Fix |
| --- | --- | --- |
| `ViewDependsOnUnsentState` | View or `meta` reads unsent `Model` field | Add field to `state` or `restored` |
| `LazyDependsOnUnsentState` | `lazy(model)` differs between server and client | Add field `lazy` reads to `state` |
| `UndeclaredStartup` | `init` returned Commands missing from `boot` | List startup Commands in `boot` |
| `Uncovered` | Active Surface reads unsent field or sends unlisted Message | Send field (`state`/`restored`/`local`) or list Message |
| `UnrestorablePart` | A plan part failed to restore its capture | Fix the part's capture/restore codec |
| `DuplicateStaticRegion` | Two `SSR.static` regions share an id | Give each region a unique id |
| `BindingInStaticRegion` | Event handler inside an `SSR.static` region | Move interactive element into a Surface |
| `UndeclaredSurfaces` | Page has bindings but plan omits `surfaces` | List active Surfaces in `surfaces` |
| `UnencodableBinding` | Missing Message Schema or non-constructor Message | Create plan from `App`; use Message constructors |
| `EagerStartRequired` | Deferred plan starts a Subscription or resource late | Add id to `deferrable` or set `start: 'now'` |
| `VoidRootWithStyles` | `styles` passed for a void HTML root element | Use `SSR.generate` `head` or a non-void root |
| `UnkeepableField` | `KeepTyped` on unsupported element or `h` builder | Use `rh` input/textarea/select/checkbox/radio + member |
| `UnkeptField` | Deferred plan input with named handler lacks `KeepTyped` | Add `rh.KeepTyped()` or set `start: 'now'` |
| `UngeneratablePath` | `SSR.generate` path cannot map to a file | Remove query/fragment; keep paths distinct |

In the browser, `SSR.hydrate` checks `buildId` first, then `SSR.resume`
verifies the envelope (`Missing`, `Duplicate`, `Unreadable`, `Protocol`,
`Plan`, `Invalid`, or `Route`).

### A page the browser does not take over

Pass `when(document)` and `fresh(plan.version)` to decline stale or
wrong-viewer pages (such as an author opening a cached visitor page). Add
`otherwise: 'render'` and `until(model)` (capped at `UNTIL_LIMIT_MS`, 3 s) to
keep the served HTML visible while rendering the fresh app off-screen until
`until` returns `true` (`examples/cms/src/ssr/sitePlan.ts`):

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})
import type { Diagnostic } from 'foldkit-ssr'
declare const when: (document: Document) => boolean
declare const Site: { readonly answered: (model: Model) => boolean }
declare const send: (diagnostic: Diagnostic) => Effect.Effect<void>
-->

```ts
SSR.hydrate(config, Post, { buildId, when, otherwise: 'render', until: Site.answered })
```

## Diagnostics

`foldkit-ssr` reports typed diagnostics through `Diagnostics.Reporter`
(defaulting to Effect's log).

| `_tag` | `level` | When |
| --- | --- | --- |
| `PageContained` | `error` | Browser declined or refused resume (`NoBuildId`, `OtherBuild`, or `ResumeRefused`) |
| `StaticRegionMissing` | `error` | Browser rendered a static region absent from served HTML (`region`) |
| `BundleUnloaded` | `error` | Lazy bundle bodies failed to load before boot (`error`) |
| `PageFailed` | `error` | `SSR.entry` returned `500` from `headers` or render failure (`url`, `cause`) |
| `HandlerUnnamed` | `warning` | Closure handler on deferred page forces immediate boot on trigger |

Pass `diagnostics` to `SSR.hydrate` or `SSR.entry` (and use
`Diagnostics.collect()` in tests):

```ts
SSR.hydrate(config, Post, { buildId, diagnostics: diagnostic => send(diagnostic) })

SSR.entry(config, Post, {
  buildId,
  diagnostics: (diagnostic, request) =>
    Effect.logError(`${request.method} ${request.url}: ${diagnostic.message}`),
})
```

## Costs and limits

- **Double render check:** `SSR.render` renders the view twice (server Model and
  resumed Model); `SSR.static` regions render once.
- **Kept fields write twice on boot:** Hydration resets the control to the
  served value and `SSR.hydrate` restores typed text and selection in the same
  task (ending any active IME composition while keeping its text).
- **Development vs production:** Under Vite dev server, Foldkit's model
  preservation skips DOM adoption after HMR reloads.
- **Closure handlers:** Handlers written as closures instead of `Message`
  constructors appear in `result.unnamed` and trigger immediate boot on
  interaction (`HandlerUnnamed`).

## Lower-level API

- **`SSR.envelope(plan, model, { route? })`** and **`SSR.resume(plan, document, { route? })`**:
  encode and decode the JSON resume attribute (escaping `<`, U+2028, U+2029, `&`,
  and `"`).
- **`SSR.inspect(plan, model)`**: inspect Surface coverage as data.
- **`Resume.bindings(plan, document, root, model)`** and **`Resume.listen(root, { bindings, onAnswer, events? })`**:
  decode bindings and handle pre-boot DOM events manually.
- **Attribute constants:** `RESUME_ATTRIBUTE`, `STATIC_ATTRIBUTE`,
  `BINDING_ATTRIBUTE`, `SLOT_ATTRIBUTE`, `KEEP_ATTRIBUTE`, and `FALLBACK_FIELD`.

## The application in these examples

The `App` used across the sections above defines a post page (`Model`,
`Message`, `AppRoute`), `Data` (`Remote.make`), `PostActions`/`Menu`/`Like`
Surfaces (`PostActionsAt`, `PostPageAt`), and `LoadPreferences`:

<!-- docs-check standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion } from 'foldkit/route'
import { Remote } from 'foldkit-remote'
-->

```ts
const AppRoute = defineRouteUnion({ Home: {}, Post: { id: Schema.String }, NotFound: {} })

const Model = Schema.Struct({
  route: AppRoute,
  post: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    body: Schema.String,
    excerpt: Schema.String,
    publishedAt: Schema.String,
    liked: Schema.Boolean,
  }),
  draft: Schema.String,
  menuOpen: Schema.Boolean,
  remote: Remote.Model,
})

const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  altKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})

const Message = defineMessageUnion({
  ...Remote.messages,
  Liked: { id: Schema.String },
  ChangedDraft: { value: Schema.String },
  Renamed: { id: Schema.String, title: Schema.String },
  Pressed: { key: Schema.String, modifiers: Modifiers },
})
```

## Next

- Serve SSR pages on Cloudflare Workers or Node: [`foldkit-host`](../host/README.md)
- Make forms and search pages work with JavaScript off: [Pages that work without JavaScript](../../docs/progressive-enhancement.md)
- Wire Site, Remote, and SSR in one app: [Site, Remote and SSR together](../../docs/site-remote-ssr.md)
