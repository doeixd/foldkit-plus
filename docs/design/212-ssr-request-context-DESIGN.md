# A page render's request context and its in-process reader (#212)

Status: designed (2026-10-27), being built. What is left is under
[Deferred](#deferred).

## The problem

One Worker serving pages and Remote (the stack `greenfield.md` recommends)
had to write three pieces of glue, and every such app would write them again
(#212, #231's Chirp):

1. **`renderPage` has no request context.** Foldkit's build emits
   `dist/server/fetch.js`, whose `fetch(request)` calls
   `handleRequest(request, { renderPage, … })`, and `handleRequest` calls
   `renderPage(request)`. A Worker is called `fetch(request, env, ctx)`, and
   the page needs `env` (the D1 binding) to read what it shows. Chirp ran
   `pages.fetch(request)` inside an `AsyncLocalStorage` the Worker owns, which
   the page bundle found under a `Symbol.for` key on `globalThis`, because the
   Vite-built page bundle and the Worker's esbuild bundle are separate module
   graphs.
2. **The page's pre-read went through HTTP to itself.** `Data.satisfy` needs a
   `RemoteClient`. Chirp built `Remote.http(origin + '/remote', { fetch: req
   => serveFetch(…)(req, env) })`, forwarding the cookie, an `Origin` and
   Yielded's CSRF header, so the same Worker's handler would accept the
   request. `examples/auth` builds the same headers for its pre-read.
3. **Routing** assets, `/auth/*`, `/remote` and pages through one handler.

The headers in 2 are the telling part. A page navigation carries no CSRF
header and, followed from a link or typed, no trusted `Origin`, so Yielded's
resolver (`requests: 'scripted'`) refuses its cookie. The pre-read made one up
so that a read for the page passed a check meant for scripts.

## Who owns what

| Fact | Owner |
| --- | --- |
| The bindings (`env`), and so how a request's services are built | the host (the Worker's `fetch`) |
| The Remote server, its Sources' `layer`, its limits | the `serveFetch` config, one value |
| Who a request is | a resolver; for a page, its navigation form |
| What the page reads before it renders | the page (`Data.satisfy` over its `actives`) |
| How a request's value crosses from the host to `renderPage` | `foldkit-ssr` (`SSR.requestContext`) |

The page never sees `env`. The host turns `env` into what the page needs (a
reader) and hands that over with the request.

```text
fetch(request, env)
  /remote  -> serveFetch(remote)(request, env)                      HTTP, as scripts call it
  pages    -> PageContext.attach(request, { reader: pageReader(page)(request, env) })
              -> pages.fetch(request) -> handleRequest -> renderPage(request)
                   -> PageContext.of(request) -> Data.satisfy(...) provided reader -> render
```

## The decision

Three small pieces, each owned by the package whose fact it is.

### 1. `SSR.requestContext<C>(name)`: a value the host attaches to a request

```ts
export const PageContext = SSR.requestContext<{
  readonly reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>
}>('app/page')

// the host
pages.fetch(PageContext.attach(request, { reader }))
// renderPage
Option.match(PageContext.of(request), { onNone: …, onSome: ({ reader }) => … })
```

- **The request is the one value both sides share.** `handleRequest` hands
  `renderPage` the request it was given, so a value keyed by that request
  reaches the page through upstream's `fetch.js` unchanged.
- **It crosses module graphs.** The Worker and the page bundle may each carry
  their own copy of `foldkit-ssr`. The values are kept in one `WeakMap` held
  on `globalThis` under `Symbol.for('foldkit-ssr/request-context')`, and a
  context is known by its name, so two copies made from one source module find
  each other. A `WeakMap` keeps nothing past its request, and never shares one
  request's value with another, unlike a process-wide store or an
  `AsyncLocalStorage` (which also needs `nodejs_compat`).
- **Absence is an `Option`.** A request a host did not attach to (Vite's dev
  server builds its own `Request`; a host that cloned it with `new
  Request(…)`) reads `none`, and the page decides: `examples/auth` answers 500
  and logs why. Attaching a second value under one name to one request throws:
  two hosts disagreeing about a request is a bug.
- **Typed by the definition both sides import.** The value is not checked at
  run time (a binding cannot be decoded); its type is the one the shared
  module declares.

### 2. `pageReader(config)` in `foldkit-remote-server/fetch`: the request's reader, in process

```ts
const remote = { server, resolvePrincipal, layer, headers } // serveFetch's config
serveFetch(remote)
pageReader({ ...remote, resolvePrincipal: pageResolver })(request, env) // Layer<RemoteClient, RemoteUnauthenticated>
```

- **Derived from `serveFetch`'s config.** It takes the same `server`, `layer`
  and limits (`maxIdsPerEntity`, `maxDepth`), so the page reads exactly what
  Remote would answer, through `RemoteServer.handlers` and
  `Remote.clientLayer`, with no HTTP, no JSON and no second copy of the
  server's wiring.
- **The principal is resolved once, when the layer is built.** A refusal fails
  the layer with `RemoteUnauthenticated`, which `Effect.provide(reader)` turns
  into the pre-read's own `Unauthenticated`, the error a 401 over HTTP gave.
- **It reads and nothing else.** A mutation is refused (`RemoteMutationError`)
  and a live open fails (`RemoteLiveError`). A page `GET` is a navigation,
  which another site can start, so its principal may read and must never
  write; a render has no stream to keep (and on Workers one could not be
  woken from another request anyway).
- **`layer` is built per read and closed after.** A pre-read is one Effect
  that ends, so `Effect.provide` closing the layer is right here, where it was
  the trap for a stream.

### 3. `requests: 'navigation'` in `AuthServer.resolver`

The resolver's third kind of request: a page the browser navigates to. Its
cookie is used on a `GET` or `HEAD` without an `Origin` or CSRF check, as any
server-rendered site reads its reader's session for the page they asked for;
a cookie on any other method is refused. It is for `pageReader`, which cannot
write, so the check it drops guards nothing there.

### What the auth example shows

`examples/auth/src/host.ts` is the whole site behind one fetch handler, as a
Worker serves it: Yielded's routes, `/remote`, and pages, each page given its
reader through `PageContext`. `test/host.test.ts` runs that handler with no
network at all: a signed-in reader's notes are in the page, read in process
as them; a visitor is sent home; a request the host did not attach to is a
500 that says why; and a page's reader refuses a write. The Vite dev server is
another process from the auth server, so its entry attaches an HTTP reader
instead, the one place the forwarded headers remain.

## Options considered

1. **Forward `env` and `ctx` into `renderPage(request, context)`** (#212's
   first suggestion). Right, and upstream's: `fetch.js` and `handleRequest`
   are `@foldkit/vite-plugin`'s and Foldkit's, which this repository does not
   change. `SSR.requestContext` is the seam until they do, and a page written
   against it reads its context from one call either way.
2. **`AsyncLocalStorage` owned by the host** (what Chirp did). Needs
   `nodejs_compat`, and a store a host forgets to enter reads `undefined`
   anywhere below it. Keying by the request needs neither.
3. **A property on the `Request`.** Works where the platform's `Request`
   takes an expando; a `WeakMap` keyed by it needs nothing of the platform.
4. **The page builds its reader from `env` itself.** Then the page bundle
   imports the Remote server and its Sources, and the request's services are
   built in two places. The host already holds both.
5. **`Remote.inProcess(handler)` over `serveFetch`'s handler** (#212's second
   suggestion). Every read would be encoded, posted and decoded in process,
   and still need the made-up `Origin` and CSRF header to pass a check that
   does not apply. Calling the handlers directly needs neither.
6. **`pageReader` reusing `serveFetch`'s resolver as is.** Yielded's scripted
   resolver refuses every navigation that carries a cookie, so the page would
   render as a visitor for everyone signed in. The page's resolver is named
   where the reader is made instead.

## Failing loudly

- `PageContext.attach` on a request that already has a value under that name
  throws.
- A context `globalThis` holds under the key that is not this package's
  `WeakMap` throws, naming the key.
- `pageReader`'s layer fails with the resolver's refusal; a mutation or live
  open through it fails, naming why.
- `requests: 'navigation'` refuses a cookie on any method but `GET` and
  `HEAD`.

## Deferred

- **`fetch(request, env, ctx)` forwarded by upstream's `fetch.js`** to
  `renderPage(request, context)`: an upstream change. Until then the context
  rides the request.
- **`SSR.entry` reading the context itself** (passing it to `flags`,
  `headers`, `resources`). No caller needs it yet: the pre-read happens before
  the entry is made, as `examples/auth` does.
- **`foldkit-plus/host`** (#235): the routing in `examples/auth/src/host.ts`,
  isolate-level runtimes, `onError`, and dev defaults, as a package. This
  design is the request-context and reader half it would call.
- **A deployed Worker with SSR** (#228): Foldkit's `ssr.build` needs a server
  entry exporting `renderDocument` and a `clientEntry`, a document pipeline no
  example here uses yet. The host test runs the same `handleRequest` with the
  template instead.
- **Rendering pages through the Worker in development** (#253): Vite's dev
  server builds its own `Request`, so it cannot carry the context; the auth
  example's dev entry attaches an HTTP reader.
