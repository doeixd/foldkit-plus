# `foldkit-host`

A server for a Foldkit Plus application handles four kinds of requests: built
static assets, sign-in routes (`/auth/…`), data requests (`/remote`), and
server-rendered pages. Writing that routing table twice — once for a Cloudflare
Worker and once for a local Node server — risks subtle drift in origin checks,
streamed body cancellation, or how `index.html` and its build id are loaded.

`foldkit-host` gives you small, composable parts for your own `fetch` handler: a
per-isolate initializer (`Host.isolate`), a cached page template loader
(`Host.template`), an origin-checked route dispatcher (`Host.routes`), and a
Node `http` adapter (`Host.node`) that runs the same handler locally.

See all of them wired together in
[`examples/reference/src/worker.ts`](../../examples/reference/src/worker.ts).

## Install

```sh
pnpm add foldkit-host
```

Peers on `foldkit` (for `resolveRequestUrl`).

## A first Worker

This creates a Worker handler that serves `/assets/` from Cloudflare Assets,
requires `env.ORIGIN` to be set for every other route, answers `/health`, and
falls back to the built `index.html`:

```ts
import { Host } from 'foldkit-host'

interface Env {
  readonly ASSETS: Host.Assets
  readonly ORIGIN?: string
}

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

A request to `/assets/app.js` serves the asset even before `ORIGIN` is set. A
request to `/health` returns `200 ok` once `ORIGIN` is configured (or `500` with
`Set ORIGIN to where this application is served.` if unset). Any other path reads
`/index.html` once via `template(env)` and returns it as HTML.

- **`Host.template(binding)`** declares the template read; the first request
  loads `/index.html` and its build id from the binding and shares that result
  across later requests. A missing file or missing build id rejects, so the next
  request retries.
- **`Host.routes(config)`** returns the Worker's `fetch` handler. Paths ending in
  `/` match prefixes (`'/auth/'`); other paths match exactly (`'/remote'`).
  Routes run in the order written, so put more specific paths first.
- **`origin: 'ORIGIN'`** checks that `env.ORIGIN` is a non-empty string on
  every non-asset request. Inside `routes` and `otherwise`, `env.ORIGIN` is
  narrowed to `string`. Without `assets`, pass type parameters explicitly:
  `Host.routes<Env, 'ORIGIN'>({ … })`.

## What each host part owns

| Part | What it owns |
| --- | --- |
| `Host.isolate` | Build a value once per binding, retrying if initialization fails |
| `Host.template` | Read `/index.html` and its build id from assets once per isolate |
| `Host.routes` | Dispatch assets, check `ORIGIN`, match routes, then run `otherwise` |
| `Host.node` | Adapt the same handler to Node's `http` server with origin checks |

Every other concern stays with the package built for it:

- **Page routes and status codes** belong to your fallback entry (`Site.parse`
  from `foldkit-site` and `SSR.entry`'s `status` from `foldkit-ssr`).
- **Response caching** belongs to `SSR.entry`'s `cache` for pages and
  `serveFetch`'s cache for Remote reads.
- **Who is asking** is resolved per request by `foldkit-auth`'s
  `AuthServer.host`; nothing inside `Host.isolate` may hold a user principal.
- **Durable Objects and media routes** are added in your `routes` map because
  Workers require Durable Object classes to be exported from your Worker module.
- **Bindings** (`DB`, `ASSETS`, secrets) are declared in `wrangler.toml` or your
  deployment stack before the host runs.

## How requests are ordered

A request runs through four stages in fixed order:

1. **Assets** (`/assets/` from the binding) run first, so an unconfigured Worker
   still serves its static build.
2. **Origin check** verifies the `ORIGIN` environment variable is set; if missing
   or empty, it returns `500` naming the variable. Configured explicitly rather
   than read from the request header so a Worker reachable on a second host
   (like `workers.dev`) trusts only its configured origin.
3. **Routes** match in order (`'/auth/'` by prefix, `'/remote'` by exact path).
4. **Fallback (`otherwise`)** renders the page.

## Built once per isolate

A Worker's isolate outlives its requests. Use `Host.isolate` to initialize
shared services (such as auth services over D1, a template, or an SSR entry) on
the first request that needs them:

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

`Host.isolate` keys its cache in a `WeakMap` on the binding returned by the
first callback. When local dev servers like Miniflare hand out fresh bindings on
reload, old entries are bypassed and garbage-collected automatically.

- A build that throws or rejects is cleared, so the next request retries while
  concurrent callers wait on and receive the same failure.
- Each `Host.isolate` call keeps its own cache, so two isolates over the same
  binding stay independent.
- Build long-lived Effect services into a `ManagedRuntime` here instead of
  calling `Effect.provide` per request, which closes the layer after every
  response.

## The template and its build

Your page's server code is bundled into the Worker, while `index.html` comes from
the browser build. Pair them with a shared `buildId` so a mismatched Worker and
asset deployment fails loudly instead of hydrating the wrong bundle:

```ts
// vite.config.ts: pass the same buildId to both plugins.
const buildId = crypto.randomUUID()
export const buildMeta = { name: 'build-id', transformIndexHtml: () => [Host.buildTag(buildId)] }
// plugins: [foldkit({ buildId }), buildMeta]
```

`Host.template` reads the tag back as `buildId`, which you pass to `SSR.entry`.
Build your `SSR.entry` once per build via `Host.isolate` over the same binding,
as [`examples/reference/src/worker.ts`](../../examples/reference/src/worker.ts)
does.

## With Remote, auth and pages

In [`examples/reference`](../../examples/reference), `AuthServer.host` is built
once per D1 binding inside `Host.isolate`, returning Yielded Auth's `/auth/`
routes, the scripted resolver for `serveFetch`, and the navigation resolver for
`pageReader`:

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

If you add a Sync WebSocket route here, use `AuthServer.resolver({ requests: 'browser', … })`
rather than `host.scripted`: browser `WebSocket` upgrades carry `Origin` but
cannot send custom CSRF headers.

## On Node

`Host.node` runs the same handler on Node's `http` server for development and
tests, passing a fixed `env`:

```ts
import { createServer } from 'node:http'

const env = { DB: { prepare: () => undefined }, ORIGIN: 'http://localhost:3000' }
createServer(Host.node(answer, { env, origin: 'ORIGIN' }))
```

Because Node passes a raw request target rather than a parsed `Request`,
`Host.node` resolves it against `env.ORIGIN` using Foldkit's
`resolveRequestUrl` and rejects targets pointing to another host with `400`.
Your handler receives a standard `Request` whose `signal` aborts if the client
disconnects, cancelling streamed responses like live reads.

Thrown errors are logged and answered with a fixed `500` response body so
internals never leak. Request bodies are buffered up to `maxBodyBytes` (32 MiB
by default) and rejected above that limit with `413`; use `Host.node` for
development and tests rather than public internet traffic.

## Failure and recovery

- **Unset `ORIGIN`:** Every non-asset request returns `500` naming the missing
  variable, on both Workers and Node. There is no fallback to the request's
  `Host` header.
- **Failed isolate build:** Unmigrated databases or missing assets fail all
  concurrent callers waiting on that initialization and clear the entry so the
  next request retries.
- **Missing template or build id:** Page requests fail with an error naming
  `/index.html`; ensure your build ran `vite build` with `Host.buildTag`.

## Limits

- One `ORIGIN` per deployment.
- No all-in-one preset: your Worker writes its own `Host.routes` call from these
  parts.

## Next

- Serve pages rendered on the server: [`foldkit-ssr`](../ssr/README.md)
- Sign people in and resolve principals: [`foldkit-auth`](../auth/README.md)
- See a full Worker wired with these parts: [`examples/reference`](../../examples/reference/src/worker.ts)
