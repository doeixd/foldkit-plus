# `foldkit-ssr`

Server rendering for a Foldkit application that hands the browser **the Model
the server reached**, not the inputs to rebuild it. `init` runs once, on the
server. The browser adopts the server's HTML and starts from the slice of the
Model it owns.

**Early.** The API below is built and tested; as a 0.x package it may still
change between minor versions.

```bash
pnpm add foldkit-ssr foldkit-surface foldkit effect
```

```ts sketch
// In outline; `App`, `config` and `template` are the application's own, and
// [A first page](#a-first-page) splits this into its modules.

// Which part of the Model the browser owns.
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})

// Server: render, and write that slice into the page.
const html = SSR.page(template, await Effect.runPromise(SSR.render(config, Post, { buildId, url })))

// Browser (from 'foldkit-ssr/client'): take the page over from the slice, without running init.
SSR.hydrate(config, Post, { buildId })
```

## Why you would use it

Foldkit already renders on the server. What its page carries is the **input**:
the Flags that produced the first Model, which the browser decodes and feeds to
`init` again. That is simple and right when `init` is cheap and its Flags are
small.

It stops being right when `init` does real work: it loads a post, reads a
session, computes something expensive. Then the browser either repeats that
work or has to receive everything `init` read, as Flags, including data the
page never shows. `foldkit-ssr` sends the **result** instead: the fields the
browser owns, and nothing else.

|                                 | Foldkit's own (`renderToString` + `Runtime.hydrate`) | `foldkit-ssr` (`SSR.render` + `SSR.hydrate`)                    |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| The page carries                | The Flags                                            | The plan's slice of the Model; no Flags                         |
| `init` runs                     | On the server, then again in the browser             | On the server only                                              |
| Server-only data                | Crosses if `init` needs it                           | Stays on the server unless the slice includes it                |
| A view that reads unsent state  | Rebuilt in the browser; only development warns       | Refused by `SSR.render`, naming the field, before it is served  |
| What you write                  | Nothing beyond the config                            | A plan                                                          |

Beyond the handover it offers three things you can adopt one at a time:
server-owned **static regions** that never render in the browser, **resumable
pages** that answer clicks and typing before the runtime has booted, and
**forms that work with scripts off**, answered by running `update` on the
server.

## What it owns, and what it does not

It owns **the handover**: which slice crosses, how it is written into the page,
and the checks that the browser can start from it.

- **Rendering and adoption stay Foldkit's.** `SSR.render` calls Foldkit's
  `renderToString` and `SSR.hydrate` calls `Runtime.hydrate`, which adopts the
  server's nodes. `SSR.hydrate` compares the page's build id with its own
  before it reads the envelope, so a Model serialized by another deployment is
  never decoded.
- **The Model stays the application's.** A plan names fields of it; it adds no
  state of its own, and every change after boot goes through `update`.
- **Data belongs to its package.** Remote's store crosses through Remote's own
  part (`Remote.resume`), which decides what to capture.
- **What the browser stored stays the browser's.** The server cannot read a
  queue kept in `localStorage`, so it is never in the page: it joins after
  the first frame ([`prepare`](#what-only-the-browser-has-prepare)).

## The mental model

```text
server   init ──▶ Model ──┬── plan.state ──▶ slice ──▶ envelope   (JSON on the stamped root)
                          └── view ──▶ HTML                        (checked, see below)

browser  envelope ──▶ baseline with the slice set on it ──▶ Model
         Model + the server's HTML ──▶ Runtime.hydrate adopts ──▶ plan.boot Commands
```

The one rule everything else serves: **the browser's first Model renders the
same page the server sent.** The browser's Model is the plan's baseline, by
default the application's `initial`, with the slice set onto it. So
`SSR.render` renders the view twice, once from the server's Model and once from
the browser's, and refuses the plan if the two differ. A view that reads a
field the plan does not send is caught there, on the server, instead of being
silently rebuilt in the browser.

## A first page

The examples in this README share one application, a post page, sketched [at
the end](#the-application-in-these-examples). `App` is its Surface application
from `foldkit-surface`, and `config` is what you would pass to
`makeApplication`, the same object on both sides: any of its four shapes, with
Flags or routing or neither, and `routing`'s callbacks typed from `update`'s
Message as Foldkit types them.

The code is in three modules, because the server and the browser import
different things:

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

```ts
// post.ts, read by both: the plan. Which part of the Model the browser owns;
// the rest starts from the baseline, by default the application's initial Model.
import { Projection } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr/client'

export const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})
```

<!-- docs-check standalone use ssr-app
import { SSR as Plans } from 'foldkit-ssr/client'
const Post = Plans.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})
-->

```ts
// server.ts, per request.
import { Effect } from 'effect'
import { SSR } from 'foldkit-ssr'

const result = await Effect.runPromise(SSR.render(config, Post, { buildId, url: request.url }))
const html = SSR.page(template, result)
```

<!-- docs-check standalone use ssr-app
import { SSR as Plans } from 'foldkit-ssr/client'
const Post = Plans.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
})
-->

```ts
// client.ts, the page's script, instead of Runtime.hydrate.
import { SSR } from 'foldkit-ssr/client'

SSR.hydrate(config, Post, { buildId })
```

`foldkit-ssr/client` is the browser's part: `SSR.plan`, `SSR.resume`,
`SSR.hydrate`, `SSR.static`, `SSR.unbound`, `SSR.serving`, `Resume`, and the attribute names,
Foldkit's root stamp (`FOLDKIT_APP_ATTRIBUTE`) among them. It imports nothing
of `foldkit/experimental/server`, whose renderer and HTML parser `foldkit-ssr`
brings along: about 200 kB minified (60 kB gzipped) off a page's script in the
[SSR example](../../examples/foldkit/ssr). `foldkit-ssr` has all of it and the
server's calls, the same functions, so a plan made from either works with
both. Import `foldkit-ssr/client` in every module the page loads, the plan and
the view included, and `foldkit-ssr` only where the server alone runs.

What each call does:

- **`SSR.plan`** is a declaration. It does no I/O and holds no state. It
  throws only for a plan that could never work, such as two parts with one id.
- **`SSR.render`** is an Effect. It runs `init` once, renders the view twice,
  checks the plan, and returns the rendered application and the envelope it
  carries on the stamped root. It fails with `ResumeUnsafe` when the browser could not start where
  the server did; [the refusals](#when-a-page-is-refused) say why and how to
  fix each.
- **`SSR.page`** is pure: the rendered application in the template, through
  Foldkit's `injectIntoTemplate`. The envelope rides on the rendered root, so
  the template needs no place for it. An optional `head` adds markup before
  `</head>`, given what was rendered.
- **`SSR.hydrate`** reads the envelope, starts Foldkit's runtime from the
  resumed Model, and runs the plan's `boot` Commands. `init` does not run. A
  page with no server render at all starts on the client as usual.

An application with Flags passes `flags` to `SSR.render`. They shape the
server's `init` and never reach the page.

### Commands `init` would have run: `boot`

The browser does not run `init`, so the Commands it returns would run nowhere.
`SSR.render` refuses a plan that would drop them, naming them. Say what the
browser runs on load in `boot`:

<!-- docs-check standalone use ssr-app
import { SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.draft),
  boot: () => [LoadPreferences()],
})
```

An application assembled with `foldkit-bundle` runs its assembly's startup
Commands, which is where a `Mirror.kv` restores what the user saved:

```ts sketch
boot: model => assembly.init(model).commands ?? []
```

### Styles in the first paint

A generated page styled with `foldkit-mixins` can ship the CSS its markup uses
in the head, so it is styled before any script runs. `head` is given the
rendered application and the compiled classes the render drew; `Style.usedDrawn`
writes the CSS of those classes, with the global rules (keyframes, `raise`'s
depth rules) of the Styles they came from, without scanning the HTML. In the
browser, Styles bring their rules as they draw and skip what this sheet already
carries, so nothing is added twice.

<!-- docs-check
const result = await Effect.runPromise(SSR.render(config, Post, { buildId, url }))
-->

```ts
import { Style } from 'foldkit-mixins'

const html = SSR.page(template, result, {
  head: (_rendered, drawn) => `<style>${Style.usedDrawn(drawn)}</style>`,
})
```

The drawn classes are also on the rendered page (`result.drawn`) for a host
that writes its own head, and `Style.usedIn(rendered.html)` still works for a
caller holding only the HTML.

With `foldkit-mixins/vite`, the stylesheet is a hashed file, and the page
links it from the document's head instead (`renderDocument`'s `head`):
`<link rel="stylesheet" href="${href}" data-foldkit-styles-href>`. A link in
the head is fetched before the first paint; `styles`, below, is written as the
root's last children, so a large page paints unstyled until it has all arrived.

A served page has no template head to write to, so `SSR.render`, `SSR.entry`
and `SSR.handle` take the same function as `styles` instead, carried as the
rendered root's last children. `foldkit-mixins/foundations` writes the theme
into `index.html` only, never into a page the server renders, so a served
page carries the theme's stylesheet here too, beside the classes it draws
(`examples/foldkit/ssr/src/renderPage.ts`):

<!-- docs-check
declare const stylesheet: string
-->

```ts
const styles = (_rendered: { readonly html: string }, drawn: ReadonlySet<string>): string =>
  `<style>${stylesheet}</style><style>${Style.usedDrawn(drawn)}</style>`

SSR.entry(config, Post, { buildId, styles })
```

Without it, every served page flashes unstyled until the script runs. Keep
`styles` to `<style>` and stylesheet `<link>`s. The view does not draw them,
so hydration would remove them from the root, and a page that never renders
again would keep its classes without their rules; `SSR.hydrate` moves them
into the document's head before anything adopts the page, whether it resumes
or is contained, and the browser's Styles find them there and add nothing
twice. A void root holds no children, so styles for one are refused with
`VoidRootWithStyles`, naming the tag. A plan's `meta` rides in the root too,
for the host to move (`SSR.headed`, under Serving pages).

`SSR.generate` takes the same `head`, and answers a `head` that throws `500`,
as it does a render that fails. `SSR.entry` takes no `head`: the host owns
the template in dynamic serving, so a served page carries no per-page head
markup, and the script brings what the first paint needs.

### The head is part of the view

`title`, `lang`, `dir`, `canonical` and `ogUrl` are checked like the body.
Since Foldkit 0.163 nothing gives `canonical` a default from the URL, so a page
that wants one derives it from the route in its Model, as it does its `title`,
and sends the route in `state`.

Foldkit fills `canonical` and `og:url` only into tags the template already has
and adds none, so a render that sets either into a template without
`<link rel="canonical" href="">` or `<meta property="og:url" content="">` is
refused, naming the tag.

### What a page says of itself: `meta`

A search result and a link preview read more than Foldkit's `Document`: a
description, an image, Open Graph, a post's dates and structured data. The
plan's `meta` gives them from the Model:

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

`SSR.page` and `SSR.generate` write the tags (`description`, `og:*`,
`twitter:card`, `article:*`, `robots`, `link rel="alternate"`, and one JSON-LD
script per entry) before `</head>`, every value escaped, and `SSR.render`
checks them like the view: a `meta` that reads a field `state` does not send
is `ViewDependsOnUnsentState`. `SSR.hydrate` keeps them in step with the Model,
so a move to another post replaces the description too. Each carries
`data-foldkit-meta` (`META_ATTRIBUTE`), which is how the browser finds the
ones to replace; leave such tags out of the template.

## Serving pages

### Through Foldkit's fetch handler

Foldkit's server entry is one function, `renderPage(request)`, which
`handleRequest` calls for every request that is not a static file, on Node and
on Workers alike. `SSR.entry` is that function for a plan. The host owns the
template: the entry answers `Rendered`, with the envelope on the rendered
root, and the host injects it into its own template, in development through
the `foldkit` Vite plugin and in production through the fetch handler a
`vite build` emits.

```ts
import { handleRequest } from 'foldkit/experimental/server'

// The server entry.
export const { renderPage } = SSR.entry(config, Post, { buildId })

// A Worker, or any host that hands you a Web Request.
export default {
  fetch: (request: Request) => handleRequest(request, { renderPage, template }),
}
```

```ts standalone
// vite.config.ts, for the dev server and the build id both entries compile in.
import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [foldkit({ ssr: { serverEntry: '/src/entry.server.ts' } })],
})
```

```ts sketch
// entry.server.ts and the browser's entry.ts alike.
buildId: import.meta.env.FOLDKIT_BUILD_ID,
```

`FOLDKIT_BUILD_ID` names the deployment, from the environment: a commit or a
release tag, public and unique per deployment. The plugin compiles it into
both bundles; a script outside Vite, such as a prerender, reads
`process.env.FOLDKIT_BUILD_ID`, the same value the build saw. With it unset,
`import.meta.env.FOLDKIT_BUILD_ID` is undefined in the client, and
`SSR.hydrate`, given no id, contains the page and reports why
([`PageContained`](#diagnostics), reason `NoBuildId`) rather than adopting it.

The client and the server must be built with one id. A page whose stamp is
not the client's is contained and reported as reason `OtherBuild`, naming both
ids. When nothing sets the variable and one `vite build` makes both bundles,
set it in `vite.config.ts` before `foldkit()` reads it, so every environment
of the build sees the same value (a script run after the build does not):

```ts
import { randomUUID } from 'node:crypto'

process.env.FOLDKIT_BUILD_ID ??= randomUUID()
```

Set it even though `@foldkit/vite-plugin` can now generate an id on its own.
The generated one is compiled into Foldkit alone, where `foldkit-ssr` cannot
read it, and the client must compare builds before it reads a page's payload,
so a Model serialized by another deployment is never decoded. Asking Foldkit
to expose that id is [proposal 4](../../docs/upstream-foldkit-ssr.md#proposal-4-expose-the-compiled-build-id).

`GET` and `HEAD` render the page for the request's URL; an application with
Flags passes `flags: request => ...`. `prepare: (model, request) => Effect`
turns the Model `init` gave into the one the page is rendered from, for what
must be read before the render (`Data.satisfy`, [below](#what-the-host-hands-the-page-ssrrequestcontext))
or taken from the request (a cookie). It runs for a posted form too, before
the Message is checked against the active Surfaces and `update` runs, so the
post starts from the Model the page it came from was drawn with, and one
entry, made once, serves every request. A `prepare` that fails is answered
`500` and reported; one that would rather draw the page unread recovers
inside its Effect. A page the prepared Model says to send elsewhere is a
`303` ([`redirect`](#sending-a-page-elsewhere-redirect)). `POST` is handled only for a plan with a
[server fallback](#forms-that-work-without-scripts). `OPTIONS` is answered
`204` and any other method `405`, each with the methods the entry answers in
`allow`. A render that fails or throws, `flags` that reject, and a plan the
render refuses are answered `500` with the reason reported
([`PageFailed`](#diagnostics)), never with a page the browser could not resume.

`headers: (request, model) => ...` is set over the host's own on every
answer: a cache policy for a page that is one visitor's, the CORS answer to a
preflight, which reaches the entry and not the host, or a cookie written from
the Model. `model` is an `Option`: `some` of the Model the server reached for
a rendered page (a posted form's, after `update`), `none` for an answer that
rendered nothing (`OPTIONS`, a `405`, a refused post, a `500`).

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

A `headers` that throws is answered `500`, as a failed render is, and so is
one that sets what is not the application's to set: a name or value `Headers`
refuses (a value holding CR or LF cannot smuggle a second header in), a
header that frames the response (`content-length`, `transfer-encoding`,
`connection` and their kin), or `location`. A value from the Model still
needs encoding for its header, as `encodeURIComponent` does here: a cookie's
value holds no `;` or `,`.

Every rendered page is answered `200` unless `status: (model, request) =>
...` says otherwise. It is given the Model the server reached, which already
says which route it is, so a not-found page is answered `404` without parsing
the URL twice:

```ts
SSR.entry(config, Post, {
  buildId,
  status: model =>
    AppRoute.match(model.route, { Home: () => 200, Post: () => 200, NotFound: () => 404 }),
})
```

The page is rendered and resumed as any other; only the response's status
changes. A status outside `200`–`599`, a `204`, `205` or `304` that cannot
carry the page, or a `status` that throws, is answered `500` and reported.

What the page says of itself (`meta`) belongs in the head, which the host
owns here, and link previews and crawlers read only the served head. The
entry carries a plan's `meta` in the rendered root, between two marker
comments, and `SSR.headed` wraps the host's document renderer to move it
before `</head>`:

```ts
import { injectIntoTemplate, renderDocument as renderShell } from 'foldkit/experimental/server'

// A server entry's document renderer, as the Foldkit Vite plugin takes it
// (export it as `renderDocument`):
const headedShell = SSR.headed(renderShell)

// A host that hands Foldkit a template instead:
const headedTemplate = SSR.headed((application: Parameters<typeof injectIntoTemplate>[1]) =>
  injectIntoTemplate(template, application),
)
```

Each request's page carries its own `meta`, so nothing of one request reaches
another's document, and `SSR.keptDocuments(SSR.headed(render))` keeps a kept
page's document with its head. A host that leaves the wrapper out serves the
`meta` in the body, where nothing reads it: `SSR.hydrate` then removes it,
reports `HeadNotMoved`, and the head gets it once the page runs. An e2e test
reading a served page's head is the check before deploying. `SSR.headed`
takes the markup only from where the entry put it, at the root's end, so
marker comments a view draws in its own text (a `<style>`) are not moved. A
root a parser does not keep `<meta>` in (a void element, a table's, `svg`,
raw text) is refused (`RootRefusesHead`).
[foldkit#1448](https://github.com/foldkit/foldkit/issues/1448) asks Foldkit
for a per-request head channel, which would retire `SSR.headed`.

### What the host hands the page: `SSR.requestContext`

`handleRequest` calls `renderPage(request)` and nothing more, and the
`fetch(request)` a build emits passes on no Worker's `env`. A page that reads
before it renders (`Data.satisfy`) needs what only the host holds: the
bindings, or a reader built from them. `SSR.requestContext` carries it on the
request. The host attaches a value, and `renderPage`, given the same request
by `handleRequest`, reads it back:

<!-- docs-check
const actives = { page: PostActionsAt }
-->

```ts
import { Effect, Option, type Layer } from 'effect'
import type { RemoteClient, RemoteUnauthenticated } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr'

// One module the host and the server entry both import.
export const PageContext = SSR.requestContext<{
  readonly reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>
}>('app/page')

// The host, a Worker's fetch say:
//   pages.fetch(PageContext.attach(request, { reader: pageReader(page)(request, env) }))

// The server entry, made once. `actives` is the record `Data.wiring` takes.
export const { renderPage } = SSR.entry(config, Post, {
  buildId,
  prepare: (model, request) =>
    Option.match(PageContext.of(request), {
      onNone: () => Effect.fail(new Error('No reader for this page.')),
      onSome: ({ reader }) => Data.satisfy(model, actives).pipe(Effect.provide(reader)),
    }),
})
```

The value is kept for that request alone, in a `WeakMap` on `globalThis`
under a registered symbol, so a Worker's bundle and the page bundle Vite
built, each with its own copy of `foldkit-ssr`, find each other's values by
the context's name. Nothing outlives the request, and no request reads
another's. `of` is `Option.none()` for a request the host attached nothing
to: Vite's dev server builds its own `Request`, and a host that passes on a
copy (`new Request(request)`) drops it. A second value under one name on one
request throws. The value is not checked at run time: its type is the one the
shared module declares.

The reader is `pageReader` from `foldkit-remote-server/fetch`: the request's
Remote client, answered in the same process by the server `serveFetch`
serves. [`examples/auth`](../../examples/auth)'s `src/host.ts` is the whole
site behind one handler; its development server, another process, attaches
an HTTP reader instead.

### Sending a page elsewhere: `redirect`

A page the reader may not see (a notebook asked for by a visitor) is answered
with a `303` to where they belong, decided from the Model `prepare` read as
them. `redirect: (model, request) => Option<string>` says so, in the entry
made once:

```text
GET url -> init -> prepare (read as the reader) -> redirect(model)
        -> some(path): 303, location: path, cache-control: private, no-store
        -> none:       render the page from that same Model
```

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

`redirect` runs for `GET` and `HEAD`, after `prepare` and before anything is
rendered, so the decision and the page come from one read; a page sent
elsewhere never runs its view. A posted form is answered by
[`answerPost`](#answering-a-post-with-a-redirect), not by `redirect`.

- **It is never kept, for anyone.** A redirect is one reader's answer, so it
  says `cache-control: private, no-store` over whatever `headers` set, and
  `cache` never stores it, however public the reads behind it were. The next
  request is decided again.
- **It carries the entry's `headers`,** given the Model the redirect was
  decided on (a cookie written from it, `vary`); only `cache-control` is the
  entry's own.
- **It goes nowhere but a path on this origin.** The path must start with a
  single `/` and, resolved against the request's address, keep its origin:
  an absolute URL (even this origin's), `//elsewhere.test`,
  `/\elsewhere.test` (which a browser reads as `//`), a relative path or a
  scheme is answered `500` and reported, as a `redirect` that throws is. The
  `location` written is the path as resolved.

### Keeping pages: `cache`

A page drawn from its URL alone is the same page for everyone who asks for
that URL, and drawing it again costs the same every time. With `cache`, the
entry keeps such a page and answers the next request for it from a store:

```text
GET url -> kept for this build and url, and the request lacks every header it read?
        -> yes: the kept page
        -> no:  render, watching what the render reads
                every read public, every header it read absent, no cookie set, 200?
                -> keep it, cache-control: public, max-age=…, vary: <headers read>
                -> otherwise cache-control: private, no-store
```

```ts
import { CacheStore } from 'foldkit-surface'

export const cached = SSR.entry(config, Post, {
  buildId,
  cache: { store: CacheStore.memory(), maxAge: '60 seconds' },
})
```

Whether a page may be kept is decided from what its render read, not from
a declaration. The render is handed a request that records each header
`flags`, `prepare`, `redirect`, `headers` or `status` reads; a page is kept only when
every one of them was absent from the request, so it was drawn from the URL
alone. A header read by name (the cart cookie, say) that was absent goes in
`vary`, and the kept page serves only requests that lack it too: a request
with that cookie is drawn for itself, and is never kept. Reading every
header, cloning the request, or reading an `SSR.requestContext` (which may
say who is asking) keeps nothing. Handing the request itself to `fetch` or
`new Request` fails the render, since the platform cannot read the watched
request.

Reads count through `foldkit-remote-server`'s `pageReader`, which notes each
one (`PageReads`): the page is kept only when every read was public, for the
shortest of `maxAge` and their freshness, tagged with the rows they hold. A
write `serveFetch` answers purges, from the same store, the pages holding a
row it names. A read made other than through `pageReader` is not seen, so
`maxAge` is all that bounds it. A page whose `headers` set a cookie or a
`cache-control` of their own, one not `200`, and every post, are not kept;
an unkept page says `private, no-store` unless `headers` said otherwise.

The key is the build id and the full URL, so a deploy never serves another
build's page (the browser would refuse it anyway, as `OtherBuild`).
`CacheStore.workers(caches.default)` keeps pages in the Workers Cache API.

A page is kept for its freshness, often a minute, so a URL asked again after
that renders again. `CacheStore.kv(env.CACHE, { keep: '6 hours' })` keeps
pages in Workers KV and serves each for `keep` after it was kept, past a
shorter `maxAge`: the page carries when each of its reads was made, and a
browser whose Remote freshness has a `maxAge`
(`RemotePolicy.staleWhileRevalidate`) reads again what is past it, so the
server renders a page once in `keep` instead of once a minute. KV writes a page only on its second
ask and fails open (`foldkit-remote-server`'s README says how). With
`keep` it is a `PageCacheStore`, which `cache.store` here takes and
`serveFetch` refuses: a read's answer carries no age.

The host draws each page into its document, which parses the page again
(Foldkit's `injectIntoTemplate`), so a kept page would still cost that on
every request. Wrap the server entry's `renderDocument` in
`SSR.keptDocuments` and the document of a kept page is drawn once per set
of assets (the last 32 are held):

```ts
import { renderDocument as renderShell, type DocumentRenderer } from 'foldkit/experimental/server'

export const renderDocument: DocumentRenderer = SSR.keptDocuments(SSR.headed(renderShell))
```

The checker draws a kept page again for each request it serves.
`cache.check` does so on every request a kept page serves, and where the
two differ reports `CachedPageDiffers` and answers with the page drawn
again: a development mode. Times stamped on the page (13 digits within a day
of now, as a read's `updatedAt`) are not compared. `SSR.checkCache(make,
requests)` is the same, for a test: `make` builds the entry from the
`cache` and `diagnostics` it is given, and each request is answered twice;
it rejects a difference, or a set of requests that kept no page. Give it
requests from more than one reader, a visitor's and one with a cookie:

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

Each path becomes `index.html` in its own folder (`/about` is
`about/index.html`); a path ending in `.html` keeps its name. `origin` makes
each path the full URL a routing application parses, and `flags: path => ...`
gives each its own Flags. The pages come back in the order of `paths`, typed as
a tuple, so `const [home, about] = pages` needs no check.

A static host serves one file for every query, and for `/about` and `/about/`
alike, so a generated page records its path alone: `/about?ref=mail` resumes
the page generated for `/about`, and `/other` is refused. The page was made
without the query, and `init` does not run in the browser, so an application
with `routing` starts from the resumed Model given `routing.onUrlChange` of
the URL it is at, as from a navigation, and starts at once whatever its
`start`: one that reads the query (a search box in `?q=`) shows it, and the
part of the page that differs is redrawn; one that does not changes nothing.
The Message goes into the starting Model rather than after boot, so a URL
mirror does not write the served address back over the real one. A
server-rendered page records its path and query, and resumes only there.

A generated site also wants a sitemap and a `robots.txt` that names it.
`SSR.sitemap` takes the pages, with a `modified` date where one is known, and
`SSR.robots` the origin:

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

`modified` is any date `Date` reads, written as its UTC day. A path listed
twice, one not starting with `/`, or a date `Date` cannot read is refused
rather than written into a sitemap a search engine would reject. `robots`
takes `disallow` paths and a `sitemap` path other than `/sitemap.xml`.

### As a Vite plugin: `foldkit-ssr/vite`

`foldkit-ssr/vite` runs the same static build as a `closeBundle` step on the
application's own `vite build`, so a site is generated without a second script.
The application describes its site in a module (`src/site.ts`) and the plugin
evaluates it through a server, so `vite.config.ts` names a file, never
application code:

```ts standalone
// vite.config.ts
import { foldkit } from '@foldkit/vite-plugin'
import { staticSite } from 'foldkit-ssr/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [foldkit(), staticSite({ site: { module: '/src/site.ts' } })],
})
```

`src/site.ts` exports a `SiteModule`: what `SSR.generate` takes, plus where the
pages land. `config` may be one config or a function of the path (a site whose
Model is prepared per page returns its own); `paths` may be a thunk that seeds
and lists; `head` is the same `head`; and `sitemap`/`robots` write their files
from the generated pages. `files` is the host's layout — `'directory'`
(`/about` as `about/index.html`, the default) or `'flat'` (`about.html`, for a
host with clean addresses and no directory indexes):

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

`emit` adds files made from the generated pages, written beside them: what the
pages reference and the build must also serve, such as the image variants
their `srcset`s name (`foldkit-media`'s `materialize`). It takes the pages and
returns `{ file, contents }`s; a path that leaves the output (absolute, `..`)
or lands on a page, the sitemap, robots or another emitted file is refused, and
so is one the client build already wrote, a file from `public/` among them.

`generateStaticSite(site)` is the same build without Vite: it renders every
path and returns `{ pages, sitemap?, robots?, emitted }`; `writeEmitted(outDir,
emitted)` writes the emitted files as the plugin does. `fileFor(path, layout)` maps
one path to the file a host serves it from, so a caller writes the files
itself; `generateStaticSite` refuses two paths that would claim one file.

### Pages rendered once, at build: `prerendered`

A page that is the same for every visitor need not be rendered by the
server at all. Rendered once when the application is built, it is a file
the host serves before any server code runs: on Workers, a static asset,
which costs no CPU.

Foldkit's Vite plugin prerenders pages through the server entry itself
(`ssr.build.prerender`), so `SSR.entry` cannot tell a build's request from a
visitor's. Name those paths in `prerendered`, and export the same list as
`prerenderPaths`, which the plugin reads:

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

A file is given to every visitor, so a prerendered page is held to the rule
`cache` keeps a page by, and stricter on headers, since a file cannot vary:

```text
render "/" -> every read through pageReader public?
           -> no request header read, not even an absent one?
           -> headers set nothing, status 200?
           -> yes: the page, with no headers of its own, written to a file
           -> no:  renderPage rejects naming the read, header or status,
                   and the build fails
```

```text
foldkit-ssr: / is prerendered, a file every visitor is given, but it read the
request's cookie header; render it per request instead (leave it out of prerendered)
```

A read made other than through `pageReader` is not seen. The rule is checked
on every render of the path, a request for it in development included, and
the page cache is not consulted for it.

The page is fresh as of the build, and the server never renders it again.
Its resumed Model says when each read was made, so a browser whose Remote
freshness has a `maxAge` (`RemotePolicy.staleWhileRevalidate`) reads again,
at boot, every read older than that. The client refreshes the data through
Remote, which is cheap; only a deploy renders the page anew.

A request for a prerendered path with no query records its path alone, as
`SSR.generate` does, so the file resumes at `/?q=…` too, and the application
starts from that URL. A prerendered file the entry was not told of is
refused at any other query, and the reason says so.

Until the bundle runs, a file shows the state it was recorded with: the
query reaches the Model only when the browser starts. And the host, not the
entry, decides which requests get the file: Workers static assets match by
path alone, so a prerendered `/` answers `/?q=…` as well, before the Worker
runs. A page whose first paint depends on its query (a search box filled from
`?q=`) is better rendered per request, which records the query and resumes
with nothing redrawn. `examples/foldkit/domains-plus` prerenders nothing for
that reason, and because its pages read the cart cookie.

## Checking what the browser will read

The view check sees what the first render shows. A Surface can read a field the
first view never shows: a like button's state, a menu's contents. Name the
Surfaces the browser may activate, and the fields that may start from the
baseline on purpose:

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.route, App.model.post.id, App.model.post.liked),
  local: [App.model.menuOpen], // starts from the baseline, on purpose
  surfaces: [
    Surface.when(PostActions, App.model.route, AppRoute.Post, route => ({ id: route.id })),
    Surface.at(Menu, undefined),
  ],
})
```

`SSR.render` then refuses the plan, naming the Surface and the field, when an
active Surface reads a field that is in none of `state`, `restored` or `local`,
is activated by one, reads data no part of the plan resumes, or would activate
differently from the Model the browser starts from. The check runs for the
server's Model, because a Surface's reads follow its params.
`SSR.inspect(plan, model)` returns the same findings as data, for a test or a
debugging session: for each Surface, whether it is active, and where each read
comes from, `state`, `restored`, `local` or `missing`.

### Fields the browser reads again

A field a URL or cookie mirror owns is one the browser can read for itself, so
the envelope need not carry it. Name it in `restored` and give `restore` a
function applying the browser's values before the first render:

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

Each restored path is handed the server's value for the coverage check, since
the browser reads the same address or cookie; a path that `state` also sends is
refused. The first render differs from the served page only where the browser's
values differ from the server's, and Foldkit rebuilds that part, as a
navigation would. `restore` runs in the browser alone, before adoption, and may
throw; the page is then contained and reported as `Invalid`.

A `Surface.each` family is one entry of `surfaces`: the envelope carries its
parent's reads with its instances', and coverage inspects each instance by key
(`Member[u1]`), saying which parent reveals it, so a gap names the instance.

## State the slice cannot carry

### Parts: another package's state

Some state is not a field to pick. Remote's normalized store holds whatever the
server read, most of which the page never shows. A **part** is a package's own
contribution to the envelope: it captures what the plan's active Surfaces read,
and restores it in the browser.

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

`Remote.resume` sends each field the Surfaces select, through relations, each
connection with its boundaries, and the live cursors of what it sends, and
nothing else of the store. The browser requests none of it again, and the
coverage check counts those reads as sent. Every part the plan names must be in
the page and restore, or the page is refused whole. The server restores each
part from its own capture before serving, so a part that could not is refused
there (`UnrestorablePart`), not in a user's browser.

### Static regions: parts of the page the server owns

An article body, a product description, highlighted code: a part of the page no
Message changes need not render in the browser at all, and what it reads need
not be sent. Mark it with `SSR.static`:

<!-- docs-check
import type { Html } from 'foldkit/html'

declare const PostActionsView: (model: Model, h: HtmlBuilder<Message>) => Html
-->

```ts
const view = (model: Model, h: HtmlBuilder<Message>) => ({
  title: 'Post', // not the post's title: the browser does not have it
  body: h.main(
    [],
    [
      SSR.static('post-copy', ih => [
        ih.h1([], [model.post.title]),
        ih.p([], [model.post.body]),
      ]),
      PostActionsView(model, h), // the part the browser owns
    ],
  ),
})
```

The region renders once, on the server, with Foldkit's inert builder, so it
cannot attach a handler. The browser adopts the server's markup as it is and
never runs the render, so this plan sends neither `post.title` nor `post.body`
and the view check still passes. A region changes only with a new document;
content a Message should change belongs in a Surface. A region the browser
needs that is not in the page, say after a Message shows one, is reported
([`StaticRegionMissing`](#diagnostics), once per page) and rendered in the
browser.

`ih` is `HtmlBuilder<never>`, so an attribute that binds one of the page's
Messages does not compile in it. A Slot's attributes are typed with the page's
Message whatever its Mixins add, so a Style looks like a handler to the
compiler. Pass them through `SSR.unbound`, which types them as binding nothing
and throws, when the region is drawn, on a handler or a Submodel's attribute
among them:

<!-- docs-check
import type { SlotBuilder } from 'foldkit-mixins'

declare const slots: { readonly title: SlotBuilder<Message> }
declare const model: Model
-->

```ts
SSR.static('post-title', ih => [ih.h1(SSR.unbound(slots.title.attrs()), [model.post.title])])
```

Attributes `SSR.unbound` returns fit any builder, so one drawing can serve a
region and the live page alike: type it over its builder's Message
(`<M>(h: HtmlBuilder<M>) => …`).

### What only the browser has: `prepare`

The server cannot send what it cannot see. What this browser stored (a
queue of writes kept in `localStorage` or IndexedDB) and what this page
load mints (an id its writes are named by) exist only in the browser. The
rule above still holds, so the first client view is the served page, and
such state is split by whether the view draws it:

```text
envelope ──▶ resumed Model ──▶ prepare: what the view does not draw ──▶ Runtime.hydrate adopts the served page
                                                                          └─▶ a Subscription reads the store ──▶ Message ──▶ update ──▶ drawn
```

`prepare: model => Effect` runs once, on the Model a page resumes, before
anything is adopted, and the runtime starts when it succeeds. Keep it to
what no view draws. What the view draws arrives after, as a Message,
reduced over whatever the Model is by then. A `prepare` that changes what is
drawn makes the first client view differ from the served page: Foldkit
rebuilds every element that differs, and a development build warns that the
server DOM did not match. It must not fail, as `when` must not throw. A page
drawn afresh (no served page, or `otherwise: 'render'`) starts from `init`,
as it would without a server render, and does not run it.

Remote's durable outbox is the case it was made for. A page that makes
durable writes ([`foldkit-remote`'s outbox](../remote/README.md#a-write-that-outlives-the-page-outbox))
resumes from the outbox's `session`:

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

- **The server's page holds none of the queue.** `Remote.resume` carries no
  outbox, and the server has no store to read.
- **`durable.session` mints the page's id and reads nothing.** A durable
  write made before the queue is read is queued at once, not refused.
- **The queue arrives through the outbox's own Subscription.** It reads the
  store after the first frame and sends `OutboxRead`, which keeps any write
  made before it and saves it with the rest. The unsent writes then join the
  page, and every tab on the key shows them.
- **Not `durable.restore`.** As `prepare`, it would read the store before
  adoption and show the queue in a first view the server did not draw. As
  the config's `flags`, it never runs: a resumed page does not run `init`.

[`examples/reference`](../../examples/reference) does this on Workers: a
note added while the server is out of reach survives a reload of the
Worker's page, shows in a second tab, and is sent once the server answers.

### Markup the browser adopts: `SSR.serving`

`SSR.serving()` is true while the view call in progress is the server rendering a page (both
of `render`'s passes), and false while the browser resumes and outside any render. It is for
a view whose element hydration leaves alone, such as a custom element's light DOM, and which
sends markup there that the browser's own code then takes over. The rich-text editor's host is
one: pass `serverRendered: SSR.serving` to `foldkit-richtext-dom`'s `editorAt`, and the page
carries the document instead of an empty editor until the script runs.

## Resumable pages: answering before the runtime boots

Everything above boots Foldkit's runtime as soon as the page loads. A resumable
page waits: it answers clicks and typing from the server's markup, and boots
only when it must, so the first interaction does not wait for the application's
code to start.

```text
server   each handler ──▶ its Message, encoded ──▶ a marker on the element + an entry in the envelope

browser  event ──▶ the markers name its Messages ──▶ queued ──▶ the runtime boots
                                                             ──▶ update runs the queue first
```

It rests on the fact that a Foldkit handler is already a Message value.
`Resume.builder(h)` is `h` that writes those values into the server's markup:

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
        // A Message with a hole: the event fills `value`.
        rh.input([rh.Value(model.draft), rh.OnInput(Message.ChangedDraft)]),
        // Fixed fields beside the hole: the event fills `title`.
        rh.input([rh.OnChange(Message.Renamed, { id: model.post.id })]),
        // A key event fills `key` and `modifiers`.
        rh.div([rh.OnKeyDown(Message.Pressed)], []),
      ],
    ),
  }
}
```

`rh` differs from `h` in two places: `OnInput`, `OnChange`, `OnKeyDown` and
`OnKeyUp` also take a Message's own constructor, and the event fills the field
it leaves open; and `KeepTyped` marks a field whose early typing is kept
([below](#typing-before-the-script-arrives)). The types check it where it is written: the member must be one
of the view's Messages, and leave exactly one string field, or exactly `key`
and `modifiers`. A closure still works. It is not data, so the page cannot
answer that event itself and boots on it instead, letting the live page answer.
`SSR.render` names each such element and event in its result's `unnamed`.
So does a hole form whose field has checks the empty placeholder fails, such
as `Schema.isMinLength(1)`: it cannot be written into the page as data, so it
is treated as a closure.

A Surface renderer gets the same builder through `Resume.view`, and its `rh`
makes only that Surface's Messages:

```ts
const LikeView = Surface.rootView(
  Like,
  undefined,
  Resume.view((like, rh) => rh.button([rh.OnClick(Message.Liked({ id: like.id }))], ['Like'])),
)
```

Then say when the runtime starts:

<!-- docs-check standalone use ssr-app
import { Resume, SSR } from 'foldkit-ssr'
-->

```ts
const Post = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.post),
  surfaces: [PostActionsAt],
  start: 'on-interaction', // or 'idle'; 'now', the default, boots on load
})
```

The event that boots the page is not lost and does not count twice. The
runtime starts from the resumed Model, so its first render is the served
markup and every node is adopted, the input typed into included. The Messages
answered before boot then go through the same `update`, in order, ahead of
anything the live page answers, even an event dispatched in the task that
boots it, so the Model ends where an eager boot would have taken it.

### What a resumable page must declare

- **Its Surfaces.** A Surface's `messages` list is what the page may dispatch
  before boot. A binding whose Message no active Surface lists is refused on
  the server, naming the element and the Message, and the browser refuses a
  page that carries one.
- **What may start late.** A Subscription or Managed Resource that starts at
  boot starts later on a deferred page, which can change what the application
  does. `SSR.render` refuses a deferred plan while one would be active,
  naming each, until the plan declares it:

  <!-- docs-check standalone use ssr-app
  import { Resume, SSR } from 'foldkit-ssr'
  -->

  ```ts
  const Post = SSR.plan(App, {
    id: 'post',
    state: Projection.pick(App.model.post),
    parts: [Remote.resume(Data)], // Remote's entries may start late; its part says so
    start: 'idle',
    deferrable: ['tick'], // this application's own clock may start late
  })
  ```

  For the check to see them, pass the application's `subscriptions` and
  `managedResources` in the config given to `SSR.render`, as you would to
  Foldkit. `boot` Commands run at boot, so a deferred page's `Mirror.kv`
  restore waits for the first interaction.
- **Its fields kept.** On a deferred plan, a field whose binding names its
  typing (a hole-form `OnInput` or `OnChange`; on a checkbox or radio, any
  named `OnChange`, `OnInput` or `OnClick`) must carry `rh.KeepTyped()`, or
  `SSR.render` refuses the page (`UnkeptField`), naming each: what is typed
  into it before boot would be lost at the first render. A page that starts
  `'now'` has the same gap for a shorter time and is not refused.

### Bundles whose code loads on demand

A `Bundle.lazy` from `foldkit-bundle` keeps a bundle's `update` and `view` out
of the boot chunk. Name each in the config's `lazy` list. A sketch, after
`test/lazyFixture.ts`: `Upload` is the lazy bundle, `PlacedUpload` its
placement, and `placements` their `Bundle.assemble`:

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

The server loads the code before it renders, so the page carries the real
view. The browser loads it before it boots and answers from the markers
meanwhile, whatever `start` says. A binding inside a placement dispatches the
parent's Message, as Foldkit's own handlers do, so the plan's Surface lists the
wrapper variant, `Message.GotUploadMessage`.

### Typing before the script arrives

A served page is editable as soon as it is parsed, but its script comes
later, and hydration re-asserts each field's value to the Model's: what was
typed in between would vanish. A field marked `rh.KeepTyped()` keeps it,
whatever the plan's `start`:

<!-- docs-check
declare const h: HtmlBuilder<Message>
declare const model: Model
const rh = Resume.builder(h)
-->

```ts
rh.input([rh.Value(model.draft), rh.OnInput(Message.ChangedDraft), rh.KeepTyped()])
```

```text
parse ──▶ typing (the field holds it) ──▶ script: SSR.hydrate reads the marked fields
      ──▶ each changed one becomes its OnInput Message, first in the queue
      ──▶ first render adopts the served page ──▶ value and caret put back ──▶ update
```

There is no inline script: the field itself holds what was typed, and an
`OnInput` Message carries the whole value, so the value when the script runs
says all the keystrokes would. A page with a Content Security Policy needs no
nonce for it. When the script runs, `SSR.hydrate` reads each marked field
whose value differs from what the server rendered and turns it into the
field's `OnInput` Message (else its `OnChange`), with the hole filled. These
go ahead of anything the page answers afterwards, once each, in document
order, so a page that waits to boot replays the early typing first. The first
render starts from the resumed Model, so it adopts every node and resets the
field; the field's value and selection are put back as it commits, and the
Message then finds the field already holding its value and writes nothing.
The caret stays where it was, and focus never moves. A field inside a lazy
bundle is replayed once the bundle's code has loaded.

Only a field the page can replay may be marked: an `input` that takes text, a
`textarea` or a `select`, built by `rh` (`rh.input`, not `h.input`), with
`OnInput` or `OnChange` given a Message member; or a checkbox or radio, whose
`checked` is compared with what the server rendered and replays its `OnChange`
(else `OnInput`, else `OnClick`) Message, in either form. A radio the person
moved off replays nothing, since the browser sent it no change; the one now
checked replays its own. The resumable builder marks
the bindings of the elements it builds; on an element `h` builds, the hole
forms are plain closures to the page and nothing names the Message to replay.
Anything else is refused on the server (`UnkeepableField`), naming the
element. What is not kept: an unmarked field (re-asserted to the served value,
as before); a key press or click before the script (the browser's own, so a
form submitted then posts, which `fallback: 'server'` answers; under
[the loader](#the-runtime-on-intent-foldkit-ssrloader) a marked one is held); a page that is
contained, declined or stale; and an IME composition in progress at boot,
which the first render's reset ends, though its text is kept. A value the
browser restored into the field on a reload or a history visit is kept like
typing, since it is what the field shows.

`KeepTyped` answers the typing as soon as the script runs, not before. Until
the bundle is parsed no code of the application is in the page, so nothing
but the field changes: the address stays, and text derived from the query (a
heading, pending results) shows what the server rendered. When the script
runs, the replayed Message is the first `update` sees, and the page draws its
effects as it would any Message's. Typing is the interaction a page started
`'idle'` or `'on-interaction'` waits for, so such a page starts at once when
something was typed before its script; only a lazy bundle still loading
holds the queue undrawn.

Answering sooner takes code that runs before the bundle, which only an inline
script can be. `foldkit-ssr` writes none: it would need a Content Security
Policy nonce and a second copy of the field's behaviour in plain DOM code. An
application that keeps one (upstream's foldkit-domains writes `?q=` and fills
its pending cards from one) may write the address only on a page recorded for
its path alone (`SSR.generate`, or `SSR.entry`'s `prerendered`), which, opened
at another query, starts from that URL; a page rendered per request is
refused at any query but its own. Markup such a script changes is the
served page no longer, and Foldkit reconciles it at hydration to the Model's
first render.

### The runtime on intent: `foldkit-ssr/loader`

`start` defers the runtime's boot, not its code: the entry script still
imports the application, so the whole chunk is fetched and evaluated at load.
`foldkit-ssr/loader` is an entry script that imports nothing of `effect`,
Foldkit or the application (about 2 KB brotli), and runs the chunk when the
plan's `start` says:

```ts sketch
// src/client/loader.ts, the page's entry script
import { load } from 'foldkit-ssr/loader'

load({ runtime: () => import('./entry.js') }) // entry.ts calls SSR.hydrate
```

```text
load ──▶ read start from the envelope
  'now'            ──▶ run the chunk
  'idle'           ──▶ fetch the chunk now ──▶ idle after load, chunk here: run it
  'on-interaction' ──▶ fetch the chunk now ──▶ first intent: run it
until SSR.hydrate takes over: a marked event ──▶ held (a submission prevented)
SSR.hydrate ──▶ starts now ──▶ answers each held event from the markers, once
```

- **`start` stays the plan's.** The server writes it into the envelope, and
  the loader adds no policy of its own; the chunk it runs starts at once,
  since the loader already waited as the plan said.
- **Intent** is a pointer over or down, focus, or a key on an element the
  server marked (a binding of any event, or a kept field), or under
  `'on-interaction'` a scroll. A pointer crossing unmarked text runs nothing;
  a reader who only reads is covered by `'idle'`.
- **Held, then answered once.** An event of a type the markers name, on a
  marked element, is held until `SSR.hydrate` claims the loader; a form's
  submission is prevented while held. `SSR.hydrate` answers each from the
  markers, as it answers events on a deferred page, so it reaches `update`
  once. An event on a kept field is not held: the field keeps it in its own
  state, which `SSR.hydrate` reads.
- **Released, never both.** A held event the runtime has not taken 3 s after
  it happened (`UNTIL_LIMIT_MS`) is released: a submission goes to the
  browser (`requestSubmit`, with its submitter), so a GET form or a
  `fallback: 'server'` form still works; anything else is dropped. A chunk
  that fails to load releases everything at once and holds nothing after,
  and a page that does not resume (another build, declined, contained)
  releases what was held as `SSR.hydrate` refuses it.
- **Fetched without running.** With `runtimeChunk` from `foldkit-ssr/vite`
  naming the same module, a client build writes the chunk's address into the
  loader, which fetches it as it starts, at load and before any idle or intent,
  with `<link rel="modulepreload">`:

  ```ts sketch
  plugins: [foldkit({ ssr: { clientEntry: '/src/client/loader.ts', … } }),
            runtimeChunk({ entry: '/src/client/entry.ts' })]
  ```

  Fetching is not running: a press before the chunk runs still waits for its
  evaluation, which a page that evaluates at once (no loader) has begun
  already. Without it, or under the development server, the chunk is fetched
  as it runs. A modulepreload fetches that one file; a chunk the runtime shares
  with another dynamic import is fetched when the runtime runs.

## Forms that work without scripts

A form whose `OnSubmit` names a Message can be answered by the server, before
any script has run or with scripts blocked, because `update` is pure and the
server can run it. This example is a to-do list, not the post page: its Model
holds `draft` and `todos`, its Message `Added({ title })` and `Typed({ value
})`, and the `TodoList` Surface lists both. The plan opts in:

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

The Message carries the title because a post without scripts fills it: the
server starts from `init`, whose draft is empty. With scripts on, it is the
Message as drawn, so a submit within a frame of the typing sends the text
drawn before it ([`docs/state-model.md`](../../docs/state-model.md#messages-carry-intent-not-results-worked-out-from-the-last-frame)).
A form that need not work without scripts sends `Added()` and reads
`model.draft` in `update` instead.

With scripts on, nothing changes: the page answers the submit and the form
never posts. Without them, the server wrote the form to post the Message to the
page's own URL, and `SSR.entry` hands that post to `SSR.handle`. A form given
its own `Method` is left as the view draws it, with no Message field: a
search form is `rh.Method('get')` and sends its named fields as the address,
and one given `Method('post')` posts no Message, which the entry answers
`400`.

```text
POST ──▶ decode the Message ──▶ set the posted fields into it (the typed `title`)
     ──▶ init, prepare, then boot and its Commands ──▶ update, and every Command after it
     ──▶ the page, rendered
```

The Message must be one the page's active Surfaces list. Commands run under the
config's `resources` Layer, as Foldkit's runtime would provide them, and under
the post's own, which `SSR.entry`'s `resources: request => Layer` builds once
for it: who is asking, a client bound to them. Where both provide a service,
the post's is the one its Commands get, so a client bound to the request
replaces one bound to nobody. A render runs no Command; it reads the request
through `flags`. A post the
server cannot use is answered `400` with the reason (`FallbackRefused`); a
Command that fails is answered `500`. The browser's loop runs for the life of
the page, so a Command that reschedules itself, a poll or a tick, is ordinary
there; on the server a post that has not settled within 100 Messages and
Commands is answered `500`, naming the last Command. `SSR.handle(request,
config, plan, { buildId, flags?, resources? })` can also be called from an
entry of your own.

A form a cookie session authorizes is a cross-site request forgery target,
and a form cannot carry a CSRF header. `SSR.entry`'s `origins` names the
origins a form may be posted from; a post whose `Origin` (every browser sends
one on a `POST`) is not among them is answered `403` before its body is read
or `flags` and `resources` run. `origins: 'same-origin'` takes a post from
the origin the request was addressed to and no other, for a site whose
address the entry cannot know when it is made (a dev server's port). It
compares with the request's own URL, so **behind a proxy that terminates TLS
or rewrites the host** (nginx, Fly, Render), where the server sees
`http://host` and the browser sends `Origin: https://host`, every post is
refused `403`. There, pass the public origin, `origins:
['https://example.com']`, never `'same-origin'`. A page served with `Referrer-Policy:
no-referrer` posts `Origin: null` even to its own site; such a post, or one
with no `Origin` at all, is taken when its Fetch Metadata `Sec-Fetch-Site`,
which no page or form can set, says `same-origin`, and refused without it. A plan with a server fallback requires `origins`, since a post
runs `flags`, the config's `resources` and its own as whoever the cookie says
posted: an entry made without them throws. An entry of your own that calls
`SSR.handle` checks `Origin` itself.

### Answering a post with a redirect

The page a post renders sits at the address the form posted to, so a reload
asks to post again. That is harmless for an idempotent Message and wrong for
one that orders or sends something. `answerPost: 'redirect'` answers the post
`303` to the same address instead, and the browser asks for it with a `GET`
(Post/Redirect/Get):

```text
POST /todos ──▶ update, and its Commands ──▶ 303, Location: /todos, headers(request, some(model))
GET  /todos ──▶ init, prepare ──▶ the page, rendered
```

```ts
SSR.entry(config, Todos, {
  buildId,
  origins: ['https://example.com'],
  answerPost: 'redirect',
  // What the post changed has to outlive it: the next request starts from `init`.
  headers: (_request, model) =>
    Option.match(model, {
      onNone: () => ({}),
      onSome: ({ todos }) => ({
        'set-cookie': `todos=${encodeURIComponent(JSON.stringify(todos))}; Path=/; HttpOnly; SameSite=Lax`,
      }),
    }),
})
```

The `Location` is the posted address's path and query, relative, so the
browser resolves it against the address it posted to and it can name no
other origin, whatever `Host` the request claimed. The `GET` starts from
`init` and `prepare`, so whatever the post changed reaches it only through
what `headers` wrote (a cookie) or a store of the application's; `prepare`
reads it back. The page shows nothing else of the post: a message about its
outcome is a one-shot cookie the application writes and `prepare` reads. A
refused post is still a `400`, and a failing Command a `500`.

### A whole page without scripts

A form that posts is one part of a page that works with JavaScript off. The
rest is the application's, and
[`examples/foldkit/domains-plus`](../../examples/foldkit/domains-plus) does
all of it; [Pages that work without JavaScript](../../docs/progressive-enhancement.md)
is the guide. What the port needed from this package:

- **Render what is shown.** `SSR.render` fetches nothing, so read first, in
  `prepare` (`Data.satisfy`); send the reading
  Surfaces' data with `parts: [Remote.resume(Data)]` and list the Surfaces
  in `surfaces`, so the browser reads none of it again.
- **Give a GET form its method.** With a fallback, a form `rh` builds whose
  `OnSubmit` names a Message posts it; a search or filter form is a GET of
  the address the URL mirror reads, and `rh.Method('get')` leaves it one.
- **Draw the plain controls on both sides.** Show them under
  `@media (scripting: none)` and hide the scripted ones there; a control in
  `<noscript>` is not drawn by the view, and the page would not be the one
  the browser renders first.
- **Keep state between posts yourself.** A post starts from `init`, so what
  must outlive it lives in a cookie the entry reads in `prepare`, validated
  as it is read, and `headers(request, model)` writes it back from the Model
  the post reached. With that, answer posts with a redirect
  (`answerPost: 'redirect'`), so a reload does not post again.
- **Wait for the takeover in a scripted test.** The served page works on its
  own, so a click before boot posts. The root loses `data-foldkit-plus-resume`
  as the page boots.

## A reader's preferences in the first frame

A theme, a light or dark choice, a density: a reader expects the page to open
in what they chose, not in the default and then theirs. Under the rule above,
the first frame shows whatever the server knew when it rendered.

**Rendered per request, the server can know it, from a cookie.** It is the
[example's](../../examples/foldkit/ssr) count, by the same route:

```text
request cookie ─▶ flags ─▶ init ─▶ Model.theme ─┬─ view draws it
                                                 └─ plan.state carries it, so the browser resumes with it
```

```ts
import { Option, Record, Schema, pipe } from 'effect'
import { Cookies } from 'effect/http'
import { Theme, Themes } from 'foldkit-mixins/theme'

const themes = Themes.make(
  { plain: Theme.make({}), dense: Theme.make({ shape: { density: 0.85 } }) },
  { initial: 'plain' },
)

/** The kept theme for a request, or the initial one for a missing or unknown cookie. */
export const readThemeCookie = (cookieHeader: string) =>
  pipe(
    Cookies.parseHeader(cookieHeader),
    Record.get('theme'),
    Option.flatMap(Schema.decodeUnknownOption(themes.Name)),
    Option.getOrElse(() => themes.initial),
  )
```

Read it in `flags: request => …`, keep it in the plan's `state` (leaving it out
is refused: the view reads a field the browser would not have), and answer
with `cache-control: private` and `vary: cookie`, as the example does: such a
page is one reader's, and no shared cache may keep it.

What the view draws is then right in the first frame. What it cannot draw is
`<html>`: `Themes` shows a theme by an attribute there, and `color-scheme`
lives there. The view renders the application's root only, so:

- the host's template carries a head script, `Themes.script(themes)` (and
  `Theme.schemeScript()`). It is static text, so a template that is the same
  for every request holds it, and it reads the name the Command kept in
  `localStorage`;
- the Command that keeps a choice keeps it twice, the cookie for the server
  and storage for the script: `Themes.choose(themes, name)`, then
  `document.cookie = 'theme=…; Path=/; Max-Age=31536000; SameSite=Lax'`
  (`Secure` on HTTPS);
- the plan's `boot` applies the Model's theme (`Themes.apply`), so storage that
  was refused or cleared costs one frame, not the visit.

**Generated at build time** (`SSR.generate`), there is no reader to ask, and
every page is built in the default. No change inside the application helps:
its script runs after the browser may have painted. The head script alone
draws the first frame, written through the generator's `head`; the Model
catches up in `boot`. `foldkit-mixins/theme` ships the pairs: `schemeScript`
and `chooseScheme`, `Themes.script` and `Themes.choose`, `Theme.knobScript`
and `Theme.chooseKnobs`.

## When a page is refused

A refusal never shows a user a half-working page. On the server it is an error
before anything is served; in the browser the page is contained, as Foldkit
contains a page from another build, and the reason is reported
([`PageContained`](#diagnostics)).

On the server, `SSR.render` fails with `ResumeUnsafe`, whose `reason` is one
of:

| `reason`                   | What it means                                                                 | The fix                                                             |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ViewDependsOnUnsentState` | The view, or its head, renders differently from the browser's Model           | Add the field the message names to `state`, name it `restored` with a `restore`, or stop the view reading it |
| `UndeclaredStartup`        | `init` returned Commands and the plan has no `boot`                           | Name them in `boot`                                                  |
| `Uncovered`                | An active Surface reads or is activated by an unsent field, or a binding sends a Message no active Surface lists | Send the field, name it `restored` or `local`, or list the Message on the Surface |
| `UnrestorablePart`         | A part cannot restore its own capture                                          | A bug in that part                                                   |
| `DuplicateStaticRegion`    | Two `SSR.static` regions share an id                                          | Give each its own id                                                 |
| `BindingInStaticRegion`    | A handler inside an `SSR.static` region                                        | Move the element out, into a Surface                                 |
| `UndeclaredSurfaces`       | The page has bindings and the plan no `surfaces`                              | Name the Surfaces the page may activate                              |
| `UnencodableBinding`       | The plan has no Message Schema, or a binding's Message does not encode through it | Make the plan from the application; build the Message with its constructor |
| `EagerStartRequired`       | A deferred plan would start a Subscription or Managed Resource late           | Declare it in `deferrable`, or start `'now'`                         |
| `VoidRootWithStyles`       | `styles` were given for a view whose root is void and holds nothing           | Put the styles in the template's head with `SSR.generate`, or return an element root |
| `UnkeepableField`          | `KeepTyped` on an element that holds nothing typed or ticked, one `h` built rather than `rh`, or with no binding that names its Message | Mark only a text `input`, `textarea`, `select`, checkbox or radio that `rh` builds, and give its binding the Message's member |
| `UnkeptField`              | A deferred plan has a field whose binding names its typing and no `KeepTyped` | Add `rh.KeepTyped()`, or start `'now'`                               |
| `UngeneratablePath`        | `SSR.generate` was given a path no file can be served at                      | Leave out the query and fragment; keep paths to distinct files      |

In the browser, `SSR.hydrate` checks in Foldkit's order: the build id first,
then the envelope. `SSR.resume` reads the envelope off the stamped root and
returns its refusal as `ResumeRefused`: a page with no stamped root or more
than one, a root with no envelope (`Missing`, also for a second root as
`Duplicate`), `Unreadable` JSON, another `Protocol` version or `Plan`, state,
parts or bindings that are `Invalid`, or a `Route` other than the one the page
was rendered for. A page is resumed whole or not at all.

### A page the browser does not take over

A page can be declined before anything is adopted: `when(document)` says
whether to take it over (a page rendered for a visitor, opened by an author),
and `fresh(plan.version)` whether its data is still current. A declined or
stale page is contained, as a refused one is, unless `otherwise: 'render'`
runs the application afresh in its place.

Drawn afresh at once, the page would show the fresh application's first draw,
usually its loading state, until its reads answer: the page blinks to "Loading"
and back. `until(model)` keeps the served page in view meanwhile. The fresh
application draws in a hidden element beside it, and when a Model it has drawn
satisfies `until`, it takes the page's place in one step, with the served
page's id. It never waits longer than `UNTIL_LIMIT_MS` (3 s). The CMS site
(`examples/cms/src/ssr/sitePlan.ts`) declines a page opened by an author, and
waits for the route's read and its Blocks' reads, which its `Site.answered`
checks with `RemoteData.answered` and `QueryBlock.active(...).answered`:

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

The served page stays as it was served while it waits: its links are plain
links, and nothing it shows becomes live.

## Diagnostics

What SSR meets and keeps going past, a page it contains or a request it
answers `500`, is a typed diagnostic, reported through `Diagnostics.Reporter`
(`foldkit-surface`'s channel, re-exported here), which by default is
Effect's log: the browser's console, or a server's or Worker's log.

| `_tag`                | `level`   | When                                                                                                          |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `PageContained`       | `error`   | The browser contained the page instead of resuming it: `reason` is `NoBuildId`, `OtherBuild` or the `ResumeRefused` reason |
| `StaticRegionMissing` | `error`   | A static region the browser drew is not in the server's page, so it was rendered in the browser (`region`)   |
| `BundleUnloaded`      | `error`   | A lazy bundle's bodies did not load, and the page booted without them (`error`)                               |
| `PageFailed`          | `error`   | `SSR.entry` answered `500`: `headers` threw, or the page could not be rendered (`url`, `cause`)              |
| `HandlerUnnamed`      | `warning` | A handler the page cannot name keeps a page that waits to boot from answering it, once per process            |

A page's refusals happen before any runtime starts, so the reporter in its
`resources` is not in effect yet: `SSR.hydrate` takes its own. `SSR.entry`
takes one with the request beside it, used for everything that request runs, a
posted form's Commands included. `SSR.generate` reports to the reporter in
its Effect's context.

```ts
SSR.hydrate(config, Post, { buildId, diagnostics: diagnostic => send(diagnostic) })

SSR.entry(config, Post, {
  buildId,
  diagnostics: (diagnostic, request) =>
    Effect.logError(`${request.method} ${request.url}: ${diagnostic.message}`),
})
```

In a test, `Diagnostics.collect()` gives a reporter and the array it fills.

## Costs and limits

- **`SSR.render` renders the view twice.** That is the view check. A static
  region's render runs once.
- **`SSR.hydrate` relies on how Foldkit hydrates today.** It gives Foldkit a
  config whose `init` returns the resumed Model, and removes the `Flags` key,
  which Foldkit would otherwise require a payload for. The tests pin both, and
  fail the day Foldkit changes.
  [foldkit#1449](https://github.com/foldkit/foldkit/issues/1449) asks whether
  Foldkit would support this directly.
- **A resumable page leans on two Foldkit behaviours,** each pinned by a test
  here and by Foldkit's own: the first patch removes attributes the browser's
  view does not assert, and a control's value is re-asserted to the Model's.
  What the server wrote for the browser's script alone (the envelope, the
  markers, a placement's slot, a fallback form's method and hidden field) is
  taken off as the page boots, before Foldkit records the served page, so a
  development build does not report it as markup the view disagrees with.
  It does not depend on `Runtime.hydrate` rendering its first frame before
  it returns, which Foldkit does today without promising it: until that
  frame commits (`Render.afterCommit`), the page keeps answering from its
  markers and sends the live page what only it can answer.
- **A kept field is written twice at boot.** Hydration re-asserts the served
  value, and the page writes the typed one back with its selection, in the
  same task, so nothing paints between. The write ends an IME composition
  in progress; leaving a changed control alone is
  [proposal 6](../../docs/upstream-foldkit-ssr.md#proposal-6-leave-a-control-the-person-changed-alone-at-hydration).
- **Development is not production.** Under Vite's dev server, Foldkit's model
  preservation restores the previous Model after a reload and skips adoption.
- **A closure handler makes its event wait for boot.** `SSR.render`'s result
  lists each under `unnamed` (`{ element: 'button#point', event:
  'pointerdown' }`), and on a page that waits to boot `SSR.entry` and
  `SSR.generate` report each once per process (`HandlerUnnamed`), naming
  the fix.

## Lower-level API

`SSR.render` and `SSR.hydrate` are built from pieces usable on their own:

- **`SSR.envelope(plan, model, { route? })`** returns the envelope for a
  Model, as JSON, and **`SSR.resume(plan, document, { route? })`** reads it back
  as a `Result`. `SSR.render` carries it on the stamped root, beside Foldkit's
  own stamps; the JSON escapes `<` as Foldkit escapes its Flags, and U+2028
  and U+2029, and the attribute escapes `&` and `"` besides, so no string in
  the Model can break out of the value. The browser reads it, then takes the
  attribute off as the page boots.
- **`SSR.inspect(plan, model)`**: the plan's coverage as data.
- **`Resume.bindings(plan, document, root, model)`** decodes and checks a
  page's bindings, and **`Resume.listen(root, { bindings, onAnswer, events? })`**
  answers events from the markers, one `{ event, messages, unnamed? }` per
  event. `events` is the envelope's list of every event the markers name;
  without it `listen` reads every element's attributes to find them.
  `SSR.hydrate` uses both, passing the list; they are there for a custom
  boot.
- **Attribute names**, for tools and tests: `RESUME_ATTRIBUTE` (the envelope
  on the stamped root), `STATIC_ATTRIBUTE`, `BINDING_ATTRIBUTE` (a prefix,
  followed by the event), `SLOT_ATTRIBUTE` (a placement's root while the server
  renders), `KEEP_ATTRIBUTE` (a kept field, naming the binding that replays
  it) and `FALLBACK_FIELD` (the posted Message).

## The application in these examples

A post page. `App` is `Surface.application({ Model, Message, initial, update
})`. The Surfaces (`PostActions`, `Menu`, `Like`), `Data` (a `Remote.make`
domain over `App.model.remote`) and `LoadPreferences` (a `Command.define`) are
the application's own; a Surface a resumable page dispatches from lists its
Messages (`messages: [Message.Liked]`). `PostActionsAt` and `PostPageAt` are Surfaces placed
for a plan, as `Surface.when(PostActions, App.model.route, AppRoute.Post, route
=> ({ id: route.id }))` places one in
[the coverage example](#checking-what-the-browser-will-read).

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

## See also

- [What the tests prove](./test/README.md).
- [What this package asks of Foldkit](../../docs/upstream-foldkit-ssr.md).
- [Site, Remote and SSR together](../../docs/site-remote-ssr.md): a routed
  application rendered with its server data, taken over, and built statically.
