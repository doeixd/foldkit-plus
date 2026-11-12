# foldkit-host

The parts of a server's `fetch` handler for a Foldkit Plus application: a
value built once per isolate, the built page template, the order requests are
tried in behind one configured origin, and a Node adapter for the same
handler. Each part is small; the application keeps writing its own handler,
from parts that get the subtle rules right once.

## What it owns, and what it does not

A Worker that serves a Foldkit Plus application answers four kinds of
request: the page's built files, Yielded's `/auth/…` routes, Remote's
`/remote`, and pages. Every package already answers its own kind with one
shape, `(request, env) => Promise<Response>`: `serveFetch` for Remote,
`AuthServer.host(...).routes` for Yielded, an `SSR.entry` through Foldkit's
`handleRequest` for pages. What is left between them is the host's:

| Part | Owns |
| --- | --- |
| `Host.isolate` | a value built once per binding, forgotten if its build fails |
| `Host.template` | the built `index.html` and the build id written into it |
| `Host.routes` | the order: assets, the origin check, the application's routes, then its fallback |
| `Host.node` | the same handler on Node's `http` server, the request target checked against the origin |

It does **not** own:

- **Which paths are pages.** Everything no route took goes to the
  application's fallback. Whether that address is a known page, and its
  status, is the page entry's to decide from its Model (`foldkit-site`'s
  `Site.parse`, `SSR.entry`'s `status`). The host never reads a route tree.
- **Any cache.** It keeps no response and writes no `cache-control`. A page
  is kept only by `SSR.entry`'s `cache`, Remote's reads only by
  `serveFetch`'s; each decides for its own reader.
- **Who is asking.** The principal is read per request by the resolvers
  `foldkit-auth`'s `AuthServer.host` hands Remote and the page reader.
  Nothing `Host.isolate` builds may hold one.
- **Durable Objects and media.** A Durable Object class is exported from the
  Worker's own module, which a library cannot do for an application; it and
  `foldkit-media`'s server are routes the application adds.
- **Infrastructure.** Bindings (D1, assets, secrets) exist before the host
  runs; `wrangler.toml` or an Alchemy stack declares them.

## Mental model

```text
request ─► assets? ─► the origin set? ─► routes, in order ─► otherwise (pages)
           /assets/    500 naming the    '/auth/'  prefix
           from the    variable if not   '/remote' exactly
           binding
```

The assets come first, so a Worker not yet configured still serves its
build; nothing else is answered before the origin check. The origin is
configured (`ORIGIN`), never taken from the request: a Worker reachable at a
second host (`workers.dev` beside a domain) trusts only the one it is told.

## Install

```sh
pnpm add foldkit-host
```

It peers on `foldkit` (for `resolveRequestUrl`); it needs no Effect.

## A sixty-second Worker

```ts
import { Host } from 'foldkit-host'

interface Env {
  readonly ASSETS: Host.Assets
  readonly ORIGIN?: string
}

// The built index.html, read from the assets once per isolate.
const template = Host.template((env: Env) => env.ASSETS)

export default {
  fetch: Host.routes({
    origin: 'ORIGIN',
    assets: { at: '/assets/', binding: (env: Env) => env.ASSETS },
    routes: {
      '/health': async () => new Response('ok'),
    },
    otherwise: async (_request, env) => {
      const { html } = await template(env)
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  }),
}
```

What each call does:

- `Host.template(binding)` declares a read; nothing is fetched until a
  request calls `template(env)`. The first call reads `/index.html` from the
  binding and its build id (below); later calls share that answer. A missing
  file or one with no build id rejects, and the next call reads again.
- `Host.routes(config)` returns the Worker's `fetch`. It performs no I/O of
  its own and keeps nothing between requests: each request is matched
  against the table and handed on. A path ending in `/` takes every path
  under it (`'/auth/'`); any other takes itself alone (`'/remote'`). Routes
  are tried in the order written, so write the more specific first.
- `origin: 'ORIGIN'` names a variable of `Env` that may hold a string; a name
  that does not is a type error. Unset or empty, every request but an asset's
  is answered `500` with the text `Set ORIGIN to where this application is
  served.` and nothing else. Inside the routes and `otherwise`, `env.ORIGIN`
  is typed `string`.
- `Env` is inferred from `assets.binding`'s parameter. Without `assets`, name
  both: `Host.routes<Env, 'ORIGIN'>({ … })`.

## Built once per isolate

A Worker's isolate outlives its requests. What is the same for every reader
(an auth library's services over the database, a template, an entry made for
a build id) is built on the first request that needs it:

```ts
interface Database {
  readonly prepare: (sql: string) => unknown
}
interface AppEnv {
  readonly DB: Database
  readonly ORIGIN?: string
}

const servicesOf = Host.isolate(
  (env: AppEnv) => env.DB,
  async env => ({ db: env.DB, startedAt: Date.now() }),
)

export const answer: Host.Handler<AppEnv> = async (_request, env) =>
  new Response(String((await servicesOf(env)).startedAt))
```

- The value is keyed by the binding `key` returns, in a `WeakMap`: Miniflare
  hands out new bindings on every reload and poisons the old ones, so a value
  built over a reloaded binding is built again rather than served stale, and
  the old one can be collected.
- A build that throws or rejects is forgotten, and the next call builds
  again; every call waiting on it meanwhile sees the same failure.
- Each `Host.isolate` keeps its own values, so two over one binding never
  read each other's.
- Build a service that outlives a request into a `ManagedRuntime` here,
  never `Effect.provide` it per request: a provided layer closes when its
  effect ends.

## The template and its build

The page's server code is bundled into the Worker, but the template is the
browser build's output. The two are paired by an id the build writes into
`index.html`, with the same id `@foldkit/vite-plugin` compiles into the
browser's script:

```ts
// vite.config.ts: one id per build, given to both plugins.
const buildId = crypto.randomUUID()
export const buildMeta = { name: 'build-id', transformIndexHtml: () => [Host.buildTag(buildId)] }
// plugins: [foldkit({ buildId }), buildMeta]
```

`Host.template` reads it back as `buildId`, which the page entry renders
under (`SSR.entry`'s `buildId`), so a Worker deployed beside another build's
page fails loudly instead of rendering a page its script will not adopt.
Make the entry once per build with `Host.isolate` over the same binding, as
[`examples/reference/src/worker.ts`](../../examples/reference/src/worker.ts)
does.

## With Remote, auth and pages

`examples/reference`'s Worker is the whole composition: `AuthServer.host`
built once per D1 binding (`Host.isolate`) gives Yielded's routes, the
scripted resolver `serveFetch` takes and the navigation resolver the page's
`pageReader` takes; the routes are `'/auth/'` and `'/remote'`, and
`otherwise` renders the page as the reader. Its shape:

<!-- docs-check
type Served = Host.Configured<AppEnv & { readonly ASSETS: Host.Assets }, 'ORIGIN'>
declare const hostOf: (env: Served) => Promise<{
  readonly auth: (request: Request) => Promise<Response>
  readonly remote: Host.Handler<Served>
  readonly page: Host.Handler<Served>
}>
-->

```ts
export const worker = Host.routes({
  origin: 'ORIGIN',
  assets: { at: '/assets/', binding: (env: AppEnv & { readonly ASSETS: Host.Assets }) => env.ASSETS },
  routes: {
    '/auth/': async (request, env) => (await hostOf(env)).auth(request),
    '/remote': async (request, env) => (await hostOf(env)).remote(request, env),
  },
  otherwise: async (request, env) => (await hostOf(env)).page(request, env),
})
```

A Sync route added here cannot take the scripted resolver: a browser's
`WebSocket` sends no header of the application's, so a socket checks
`Origin` alone or a credential in a subprotocol.

## On Node

`Host.node` serves the same handler from Node's `http` server, for
development and tests, with `env` given once:

```ts
import { createServer } from 'node:http'

const env = { DB: { prepare: () => undefined }, ORIGIN: 'http://localhost:3000' }
createServer(Host.node(answer, { env, origin: 'ORIGIN' }))
```

A Worker is handed a `Request` the platform built. Node hands over a raw
request target, which may be an absolute URL or a `//host/…` naming another
origin, so `Host.node` resolves it against the configured origin with
Foldkit's `resolveRequestUrl` and answers `400` for one that leaves it,
before the handler runs. The handler gets a `Request` with the method,
headers and body, and a signal that aborts when the client goes; a streamed
answer (a live read) is cancelled then. A handler that throws is logged and
answered `500` with fixed text, never the error.

## Failure and recovery

- **Unset origin.** Every request but an asset's is `500` naming the
  variable, on Workers and on Node. There is no fallback to the request's
  own host: that is the failure the check exists to stop. A local stack
  sets it (`Stack.start`'s `vars`).
- **A failed isolate build** (a database not yet migrated, assets not yet
  uploaded) fails the requests waiting on it and is forgotten; the next
  request builds again.
- **No template, or no build id.** The page requests fail with the error
  naming the file; build the page (`vite build`) with `Host.buildTag`.

## Limits

- One origin per deployment.
- No preset. A Worker writes its `Host.routes` call itself; a one-call
  preset over these parts is deferred until several applications share the
  same glue.
