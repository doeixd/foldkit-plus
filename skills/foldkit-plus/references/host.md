# foldkit-host

Checked against `foldkit-host` 0.2.0, `foldkit` 0.170.0.

The parts of a server's `fetch` handler: `Host.isolate` (a value built once
per binding), `Host.template` (the built `index.html` and its build id),
`Host.routes` (assets, the origin check, the application's routes in order,
its fallback) and `Host.node` (the same handler on Node's `http` server). The
application still writes its handler; these parts hold the rules every
Worker here got wrong once.

## What it owns

- **The order** a request is tried in: assets before everything, then the
  configured origin (unset is a `500` naming the variable), then routes as
  written, then `otherwise`.
- **Isolate values** keyed weakly by a binding, rebuilt after a failed build
  or a reloaded binding.
- **The template's build id**, written by `Host.buildTag` in the Vite build.

Not owned: which paths are pages or their status (the page entry's, from its
Model), any cache or `cache-control` (`SSR.entry`'s `cache`, `serveFetch`'s),
the principal (`AuthServer.host`'s resolvers, per request), Durable Objects
and media (routes the application adds), bindings themselves.

## Basic use

```ts
import { Host } from 'foldkit-host'

interface Env {
  readonly DB: object
  readonly ASSETS: Host.Assets
  readonly ORIGIN?: string
}

// Built on the first request for this binding, shared after; a failure is retried.
const servicesOf = Host.isolate(
  (env: Env) => env.DB,
  async env => ({ db: env.DB }),
)
const template = Host.template((env: Env) => env.ASSETS)

export default {
  fetch: Host.routes({
    origin: 'ORIGIN', // a variable of Env holding a string; typed `string` inside the routes
    assets: { at: '/assets/', binding: (env: Env) => env.ASSETS },
    routes: {
      '/auth/': async () => new Response('auth'), // a prefix: ends in `/`
      '/remote': async (_request, env) => new Response(String((await servicesOf(env)).db)),
    },
    otherwise: async (_request, env) => new Response((await template(env)).html),
  }),
}
```

`examples/reference/src/worker.ts` is the whole composition: `AuthServer.host`
inside `Host.isolate` over D1, `serveFetch` with `auth.scripted` at
`/remote`, and the page rendered by `handleRequest` with `pageReader` and
`auth.navigation` in `otherwise`, under the build id `Host.template` read.

## Gotchas

- `Env` is inferred from `assets.binding`'s parameter; without `assets`,
  write `Host.routes<Env, 'ORIGIN'>({ … })`.
- Routes are tried in the order written; put a more specific prefix first.
- Nothing `Host.isolate` builds may capture a request or a principal: it is
  shared by every reader the isolate answers.
- `Host.template` rejects when the assets lack `index.html` or its build id;
  write `Host.buildTag(buildId)` from the Vite build's `transformIndexHtml`,
  with the same id given to `foldkit({ buildId })`. In this workspace a
  `vite.config.ts` imports it by path (`packages/host/src/template.ts`): Node
  loads a config's workspace imports past the source condition.
- A WebSocket route cannot take the scripted resolver: a browser socket sends
  no header of the application's. Check `Origin` alone.
- `Host.node(handler, { env, origin: 'ORIGIN' })` answers `400` for a target
  naming another origin and aborts the request's signal when the client goes.
  `maxBodyBytes` (32 MiB by default) answers `413` for a larger body before the
  handler runs.

## See also

- Package README: https://github.com/doeixd/foldkit-plus/blob/main/packages/host/README.md
- The reference Worker: https://github.com/doeixd/foldkit-plus/blob/main/examples/reference/src/worker.ts
- [auth.md](auth.md) for `AuthServer.host`, [ssr.md](ssr.md) for the page entry.
