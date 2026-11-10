# The Site tree as one source: data, code and the host (#235, #236, #438)

Status: Proposed 2026-11-10: awaiting the owner's decisions. Nothing here is
built. Every claim about current code names its file and line, read on that
date at `1c1956b`.

Three issues ask for one thing from three sides: an application states its
routes once, and what follows from a route (what it reads, what code it
needs, how the server answers it) should not be written again by hand.

| Issue | Asks | State |
| --- | --- | --- |
| #236 | Site as the data router: viewer-aware node Surfaces, preload on intent, a per-node data policy, `SSR.plan({ site })` | two of four parts built, in other shapes |
| #438 | one client chunk per route, derived from the tree, prefetched on intent | not started |
| #235 | `foldkit-plus/host`: one fetch handler for pages, Remote, auth and assets | not started; half its seams built under #212 |

## 1. The problem

### What an application writes by hand today

`examples/reference` is the recommended stack on one Worker. Its server is
`src/worker.ts` (174 lines) and `src/page.ts` (92 lines):

| Glue | Where | Lines |
| --- | --- | --- |
| A memo that forgets a failed build | `worker.ts:55-65` | 11 |
| Yielded's services in a `ManagedRuntime`, once per isolate | `worker.ts:68-77` | 10 |
| The principal, read per request | `worker.ts:83-92` | 10 |
| Yielded's routes, Remote and the page reader from one config, with two resolvers (`scripted`, `navigation`) | `worker.ts:98-127` | 30 |
| One of those per origin | `worker.ts:131-139` | 9 |
| The template and its build id, read from the assets binding once | `worker.ts:142-152` | 11 |
| Attaching the reader and rendering into the template | `worker.ts:154-161` | 8 |
| Routing: `/assets/`, the `ORIGIN` check, `/auth/`, `/remote`, pages | `worker.ts:163-174` | 12 |
| A request context of the page's own | `page.ts:19-21` | 3 |
| Read as the reader, then a 303 or the render, with an entry made per request | `page.ts:39-49`, `63-91` | 40 |

The same shapes are written again elsewhere:

- `examples/auth/src/host.ts:21-33` routes `/auth/`, `/remote` and pages, and
  `examples/auth/src/page.ts:73` is a second `makeRenderPage` with the same
  `Access.match` (`:99`).
- `examples/cloudflare/src/worker.ts:93-103` is a second forgetful memo for
  auth, and `:135-149` a second router (auth, `/sync` into a Durable Object,
  CORS, Remote), under media's own `serveFetch` (`:156-174`).
- `examples/foldkit/domains-plus/src/server/entry.ts:119-126` routes
  `/remote` *inside* `renderPage`, because the Worker's `main` there is the
  `fetch.js` Foldkit's plugin generates, which the application cannot route
  in front of; `server/cache.ts:47-59` reaches a KV binding through a hidden
  `import('cloudflare:workers')` because that `fetch` receives no `env`.

On the client:

- **Data.** `examples/chirp/src/site.ts:24-30` declares three nodes with no
  Surface, and `examples/chirp/src/app.ts:226-229` writes the same three
  routes again as `Surface.when` entries. One policy covers every route
  (`app.ts:258`, `:263`).
- **Code.** No example splits a page. `Bundle.lazy` appears in no example
  (only in `packages/bundle/README.md:958` and its tests); the two
  `Resource.lazy` uses split one service, Yielded's client
  (`examples/reference/src/client.ts:46`, `examples/auth/src/client.ts:41`).
  Every route's `update` and view ship in the entry chunk.

Chirp no longer has the Worker #235 describes: its server is a SharedWorker
sandbox (`examples/chirp/src/server/worker.ts`, 8 lines, and `host.ts`). The
issue's "200 lines in Chirp" is now `examples/reference`'s 266.

### What each issue still asks

**#236.** Its 2026-10-28 comment records the viewer (`surface: { surface,
viewer, params }`, `packages/site/src/index.ts:76-80`) and preload on intent
(`Site.routing`'s `preload`, `index.ts:1101-1108`) as built. Its 2026-10-31
comment's first input, Back and Forward from what is held, is built too:
`Site.routing`'s `navigated` (`index.ts:1090`) hands Remote a `Navigated`
Message (`packages/remote/src/model.ts:515`), and `historyWindow`
(`packages/remote/src/remote.ts:386-392`) is the window. Open:

1. a per-node `data` policy (`retain`, `revalidate`);
2. `SSR.plan({ site })`;
3. `preload: 'visible'`;
4. a budget for speculative reads.

**#438.** A chunk per route node, shared code hoisted, the next route's chunk
prefetched on intent, and a module assertion per chunk.

**#235.** Routing, isolate-level services, a request context, an `onError`
for every 500, dev defaults, and a Node adapter; open questions on the Sync
Durable Object, media routes, and (from the 2026-10-28 comment) the template
and build id.

## 2. Ownership

### Today

| Fact | Owner | Where |
| --- | --- | --- |
| The URL algebra: parsing and building | Foldkit's Router | `foldkit/route`; `Site.route` takes a full Router (`site/src/index.ts:504`) |
| Listening for link clicks and URL changes | Foldkit's runtime | `routing: { onUrlRequest, onUrlChange }` (`examples/reference/src/client.ts:36-39`) |
| The route shown | the application Model's route field | written only by `Site.routing` through its `RouteField` (`index.ts:141-145`, `1064`) |
| The topology: nodes, hierarchy, titles, access, meta | `foldkit-site`, as data | `SiteNode` (`index.ts:173-219`) |
| What a route reads | the node's Surface | `Site.sources` (`index.ts:973`), `Site.sourcesFor` (`:1002`) |
| Fetching, the store, freshness, retention | `foldkit-remote` | `Data.wiring`; `PolicyOption` (`remote/src/domain.ts:1157`); `grace`, `budget`, `historyWindow` (`domain.ts:1088-1107`) |
| Reading ahead | Remote does it, Site says when | `Data.preload` (`remote/src/remote.ts:1822`); `Site.routing`'s `preload` |
| What counts as intent | `foldkit-primitives/dom` | `pointedLinks` (`primitives/src/dom/pointed-links.ts:18`) |
| A page's `update` and view, and whether they load late | `foldkit-bundle` | `Bundle.lazy` (`bundle/src/lazy.ts:94`) |
| Which Bundle a route shows | `Site.placement` | `index.ts:1276`; `SitePage` (`:154`) |
| What crosses from server to browser | `foldkit-ssr`'s plan | `plan` (`ssr/src/shared.ts:333`), `surfaces` (`:347`) |
| A page's pre-read, status, headers, page cache | `SSR.entry` | `prepare` (`ssr/src/index.ts:1363`), `status` (`:1415`), `cache` (`:1469`) |
| Page or asset, method refusal, `Accept` | Foldkit | `handleRequest`, `classifyRequest`, `resolveRequestUrl` (`foldkit/experimental/server`) |
| The Worker's generated `fetch` | `@foldkit/vite-plugin` | `fetch(request)` only, no `env` (`dist/build.js:258-264` of 0.28.0) |
| A value from host to `renderPage` | `foldkit-ssr` | `SSR.requestContext` (`ssr/src/requestContext.ts:65`) |
| Remote over HTTP; a page's in-process reader | `foldkit-remote-server/fetch` | `serveFetch` (`remote-server/src/fetch.ts:383`), `pageReader` (`:643`) |
| Who a request is | `foldkit-auth/server` | `AuthServer.resolver`, `requests: 'scripted' \| 'browser' \| 'navigation'` (`auth/src/server.ts:111`, `:139`) |
| Bindings, isolate-level services, the order of routes, the template | **the application**, by hand | section 1 |
| Assets | the platform (`run_worker_first`, the binding) | `examples/reference/wrangler.toml` |

Two of these are settled by earlier notes and bound this one:

- `router-DESIGN.md` section 26 (`:6526`): "The Site graph may describe the
  document topology. It should not become an HTTP router."
- `234-352-cache-DESIGN.md:95-98`: "'Per Surface or route' is the existing
  rule: a policy covers one `Data.subscriptions` call."

### What each proposal would move

| Proposal | Moves | A second owner? |
| --- | --- | --- |
| #236 `retain: '10 minutes'` on a node | how long data is kept, from Remote's store to a route | **Yes.** Retention is the store's: what active Surfaces root, then least recently left within `budget`. A route cannot keep a row another route's budget evicts. |
| #236 `revalidate` on a node | freshness, from Remote's policy to a route | No, if the node only *names* a policy Remote runs. |
| #236 `Site.make(..., { viewer })` | who the viewer is, from the Model to the tree | Built per Surface instead (`viewer: model => Option`), which keeps the Model the owner. |
| #236 `SSR.plan({ site })` | the plan's Surfaces, from the application's list to SSR | `foldkit-site` depends on `foldkit-ssr` (`site/package.json:46`, `index.ts:41`), so SSR cannot import Site. Composition already gives it: section 3. |
| #438 chunks "derived" from the tree | where code is cut, from source (`import()`) to the tree | **Yes**, if Site cut chunks. A bundler cuts where source says `import()`; `Bundle.lazy` owns that. Site can own only *when* a chunk is asked for. |
| #235 `Host` owning routes | the order of non-page routes, from the application to a package | No: nothing owns it now. |
| #235 `Host` owning isolate runtimes | their lifetime, from the application | No, provided it holds no request's principal. |
| #235 `Host.yielded` | pairing resolvers with routes | Belongs in `foldkit-auth/server`, which owns the resolver kinds. |
| #235 a `Host` cache or error page | page caching, the 500 body | **Yes**: `SSR.entry` and `serveFetch` each own theirs. Host adds none. |

So the single-owner reading is:

```text
Site tree          names, per node: the Router case, the Surface, the Bundle, access, meta
  -> Foldkit       routes the URL (client) and classifies the request (server)
  -> Remote        reads, keeps, refreshes what the node's Surface declares
  -> Bundle.lazy   holds the node's code behind an import the author wrote
  -> SSR.entry     prepares, decides status or redirect, renders, caches the page
  -> Host          puts SSR.entry beside /remote, /auth and assets, with services per isolate
```

Site stays data: it starts nothing and fetches nothing. Each arrow is a
function from the tree that an existing owner calls.

## 3. Options, per issue

### What must not be duplicated

- **Foldkit's router and navigation.** `foldkit/route` parses and builds;
  `foldkit/navigation` pushes, replaces and loads. `Site.routing` is a
  wiring over them and stays one.
- **Foldkit's request handling.** `handleRequest` already refuses methods,
  tells a missed hashed asset from a page, and negotiates `Accept`;
  `resolveRequestUrl` already pins a Node request to the configured origin.
  A host calls them.
- **`Bundle.lazy` and `Resource.lazy`.** These are `foldkit-bundle`'s, not
  upstream's: Foldkit itself has no code splitting (its `createLazy` memoizes
  a drawing). They are the only two ways a chunk boundary is written here,
  and #438 adds no third.
- **`Data.preload`, `Data.satisfy`, `pageReader`, `SSR.requestContext`.**

### #236: the remaining four parts

**A per-node data policy.** Three options.

1. *The issue's `data: { preload, retain, revalidate }` block, compiled into
   Remote's wiring.* `retain` is a second owner (above). `revalidate.every`
   is what `RemotePolicy.staleWhileRevalidate({ maxAge })` already does for
   an active list: a deadline at `receivedAt + maxAge`, read `Refreshing`,
   never `Loading` (`234-352-cache-DESIGN.md:49-79`). `revalidate.onArrival`
   is what `cacheFirst` already does for a list left and come back to by a
   link, and `historyWindow` is its Back and Forward exception. The block
   would rename three things Remote has.
2. *A typed annotation Site carries and does not read*, as `access<Who>` is:
   `.policy<P>(value)` and `Site.policyOf(site, route)`. Site cannot name
   `RemotePolicy` (Remote is not its dependency), so the type is the
   application's.
3. *No annotation: the policy is picked from the route with the option
   Remote has.* `PolicyOption` takes `(model) => RemotePolicy`
   (`domain.ts:1157`), and the route union's own `match` is exhaustive.
   Section 4 compiles it.

Recommended: 3 now, and 2 only if a second application writes the same
`match`. By the rule `router-DESIGN.md` keeps ("an API lands when it deletes
an application's own code"), 2 trades a five-line checked `match` for an
annotation and a lookup with a default: nothing is deleted.

`Data.subscriptions` users have a second way already, a call per policy
(`234-352-cache-DESIGN.md:95-98`); `Data.wiring` is one call, so it takes
the function.

One limit of 3, for Remote and not for this note: a policy picked by route
covers every Surface active on that route, the session's read included. A
policy per *active entry* inside one `Data.wiring` is the real gap, and it is
Remote's to design.

**`SSR.plan({ site })`.** Already there by composition, with no way to
drift: `examples/reference/src/main.ts:247-251` spreads `Site.sources` into
`actives`, and `:549` gives the plan `Object.values(actives)`. The same
record feeds `Data.wiring` (`:290`), `Data.preload` (`:268`) and the server's
`Data.satisfy` (`page.ts:45`). Recommended: close this part, and port Chirp
to node Surfaces so the second example shows it.

**`'visible'` preloading.** `Site.routing`'s `links` is any
`Stream<Url>` (`index.ts:1103`). A `visibleLinks()` beside `pointedLinks()`
in `foldkit-primitives/dom`, merged by the application, needs no Site
change. It skips `Save-Data` and slow connections, as the 2026-10-31 comment
asks.

**A budget.** Intent is already bounded to one read: one pending timer, the
link the reader stops on (`227-preload-on-intent-DESIGN.md`, "Debouncing").
Only `'visible'` needs a number, and the stream can keep it: at most `n`
distinct addresses per route shown. No Model state and no cancellable lane
in Remote. The owner's "use effect Schedule" comment fits the stream's
pacing (`Stream.schedule`), which is where it would go.

### #438: a chunk per route

1. *A build plugin reads the tree and rewrites page imports.* Rejected. A
   page's `Model` and `Message` Schemas must be in the boot chunk: the
   parent's Schema is built from them. A plugin cannot cut a module between
   its Schema and its `update`, and "a module-level call keeps its module in
   the chunk" (CLAUDE.md) would undo most cuts silently.
2. *The author writes the boundary with `Bundle.lazy`; the tree says when to
   load.* `Site.placement(node, bundle, …)` already pairs a node with its
   Bundle, and a `Bundle.lazy` value is a `Bundle` (`lazy.ts:59-70`), so the
   pairing type-checks today (section 4). What is missing is small: the
   `SitePage` remembering the Bundle's `load`, and three callers of it.
3. *Lazy node views* (`NodeView` as an import). Rejected: it splits the view
   from the `update` that feeds it, and a second lazy mechanism.

Recommended: 2. The three callers:

| When | Who calls `load` | Today |
| --- | --- | --- |
| The reader means to follow a link | `Site.routing`'s `preload`, beside `read(there)` | reads only |
| The server renders, and the browser boots | `SSR`, from the request's route | loads *every* Bundle in `lazy` (`ssr/src/index.ts:691-692`, `client.ts:264`, `:523`) |
| The route arrives with its code unloaded | the page's own `changed` Message, which `Bundle.lazy` answers by loading and yielding it again (`lazy.ts:147-158`) | works, unmeasured |

"Shared Bundles hoisted" is the bundler's job once the boundaries exist:
code two route chunks import lands in a shared chunk without anyone naming
it.

**What it can save is bounded, and should be measured first.** In
domains-plus the application's own source is 16.6 KB of a 210.5 KB entry;
Effect and Foldkit are 91 KB (`performance-PLAN.md:89-101`, `:176-178`). A
route split moves only what one route alone imports. It pays where a route
brings a package of its own: the CMS studio's editor and page builder, a
data grid, Yielded's client (#244 moved that already).

### #235: the host

1. *The issue's `Host.workers({ pages, remote, auth, assets, origin,
   onError })` as one call.* It names the right responsibilities, but hides
   five decisions the three example Workers make differently (who is first,
   CORS, a Durable Object route, media under or over the rest, the
   generated `fetch.js` or a bundled page).
2. *Small parts, each owned where its fact lives, and the one call last, as
   a preset over them.* Every package already speaks one shape,
   `(request, env) => Promise<Response>`: `serveFetch` for Remote, media's
   `serveFetch` with `otherwise` (`media/src/server/fetch.ts:30`, `:43`),
   Yielded's `HttpRouter.toWebHandler`, Foldkit's `handleRequest`.
3. *Nothing: keep the examples as the recipe.* Three copies exist and each
   differs in a way that matters for security (section 7).

Recommended: 2. The parts:

| Part | Owns | Replaces |
| --- | --- | --- |
| `SSR.entry`'s `redirect` | a page that answers with a 303 from the Model it prepared | the entry made per request (`reference/src/page.ts:64-69`, `:81-91`; `auth/src/page.ts:99`) |
| `Host.isolate` | a value built once per binding, forgotten if its build fails | `worker.ts:55-77`; `cloudflare/src/worker.ts:93-103` |
| `Host.template` | the built `index.html` and its build id, from the assets binding | `worker.ts:142-152`, `build.ts`, the `<meta>` in `vite.config.ts` |
| `Host.routes` | the order: assets, the origin check, prefixes, then pages | `worker.ts:163-174`; `auth/src/host.ts:24-29` |
| `AuthServer.host` (in `foldkit-auth/server`) | Yielded's routes, and the scripted and navigation resolvers as a pair | `worker.ts:98-127` |
| `Host.workers`, `Host.node` | the preset over all of the above | the whole file |

What the host does **not** own:

- **Which paths are pages.** Everything no prefix took is a page. Whether it
  is a *known* page is the application's parse (`Site.parse`), and the
  status follows from the Model (`status`, as
  `domains-plus/src/server/entry.ts:108-113`). The host never reads the
  tree, per `router-DESIGN.md` section 26.
- **Page caching and Remote's cache.** `SSR.entry`'s `cache` and
  `serveFetch`'s `cache` stay the only two.
- **The Sync Durable Object and media routes.** A Durable Object class is
  exported from the Worker's main module (`cloudflare/src/worker.ts:81`),
  which a library cannot do for an application. Both are routes the
  application adds to `Host.routes`.
- **Infrastructure** (#207): bindings exist before the host runs.

### How the three compose

One tree, four readers, no reader owning another's fact:

```text
                        Site.make(nodes)
        +-----------------+-----------------+------------------+
        |                 |                 |                  |
  Site.routing      Site.sources      Site.placement      Site.accessOf / metaOf
  (client route)    (what it reads)   (its Bundle)        (who may see it, its head)
        |                 |                 |                  |
   preload on intent: Data.preload(there)  +  load(there's Bundles)        client
   SSR.entry: prepare = Data.satisfy       +  lazy = this route's Bundles  server
              redirect = accessOf, status = route, cache
        |
   Host.routes: assets | /auth | /remote | everything else -> SSR.entry
```

The host's "route table" for pages is therefore one row. The tree reaches
the server through `SSR.entry`, which is where a page's Model exists.

## 4. API sketch

### Reusing what exists (compiled)

Compiled on 2026-11-10 as a temporary `*.test-d.ts` in `examples/chirp/src`
with `pnpm exec tsc -b examples/chirp`, shown to be checked by a deliberate
error, then deleted. `App`, `Data`, `actives`, `freshness` and `Model` are
`examples/chirp/src/app.ts`'s; `AppRoute` and `ChirpSite` are `site.ts`'s.

```ts
import { Schema, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion, literal, mapTo } from 'foldkit/route'
import { Bundle, Link } from 'foldkit-bundle'
import { RemotePolicy } from 'foldkit-remote'
import { Site } from 'foldkit-site'

// #236: a policy per route, through the option Remote already has.
const wiring = Data.wiring(actives, {
  policy: (model: Model) =>
    AppRoute.match(model.route, {
      Home: () => RemotePolicy.staleWhileRevalidate({ maxAge: 20_000 }),
      Profile: () => freshness,
      Status: () => RemotePolicy.cacheFirst,
      NotFound: () => RemotePolicy.cacheFirst,
    }),
})

// #236: one destination's Sources, for a preload or a server's pre-read.
const there = Site.sourcesFor(ChirpSite, App.owner, App.model.route, AppRoute.Home())

// #438: a page whose bodies are a chunk, placed on its node.
const R = defineRouteUnion({ Settings: {} })
const SettingsNode = Site.node(pipe(literal('settings'), mapTo(R.Settings)), R.Settings).node
const SModel = Schema.Struct({ open: Schema.Boolean })
const SMessage = defineMessageUnion({ Arrived: {} })
const Settings = Bundle.lazy(
  { name: 'Settings', Model: SModel, Message: SMessage, init: () => ({ model: { open: false } }) },
  // In an application: () => import('./settings.body.js').then(chunk => chunk.body)
  async () => ({ update: model => ({ model }) }),
)
const PMessage = defineMessageUnion({ GotSettings: { message: SMessage } })
type Parent = { readonly settings: typeof SModel.Type }
const SettingsPage = Site.placement(SettingsNode, Settings, {
  link: Link.field<Parent>()('settings', Link.wrapper(PMessage.GotSettings)),
  changed: () => SMessage.Arrived(),
})
const loadable: Bundle.Loadable = Settings
```

The first block means a list on Home is asked again every 20 seconds while
shown and read `Refreshing` meanwhile; nothing in it fetches. The third
shows that the node and the code are already paired; `SettingsPage` does
not yet remember `Settings.load` (a `Placed` has no `load` member:
`bundle/src/placed.ts`).

### New (pseudocode: none of this exists)

```ts
// PSEUDOCODE. foldkit-site
interface SitePage<…> {
  // …
  /** The page's bodies, when its Bundle is `Bundle.lazy`. */
  readonly code: Option.Option<Loadable>
}

/** The Bundles on a route's chain whose bodies are a chunk. Pure. */
Site.codeFor(site, pages, route): ReadonlyArray<Loadable>

Site.routing({
  // …
  pages: [SettingsPage],
  preload: {
    links: Stream.merge(pointedLinks(), visibleLinks({ atMost: 8 })),
    intended: Message.PointedAtLink,
    read: there => Data.preload(there, actives),
    // New: an intended address also starts `Site.codeFor`'s loads. A load
    // that fails is forgotten, as `Bundle.lazy` forgets it.
  },
})
```

```ts
// PSEUDOCODE. foldkit-primitives/dom
/** Same-origin links scrolled into view, each address once per route shown. */
visibleLinks(options?: { atMost?: number; margin?: string }): Stream.Stream<Url>
// Emits nothing under Save-Data or a 2g connection.
```

```ts
// PSEUDOCODE. foldkit-ssr
SSR.entry(config, plan, {
  prepare: (model, request) => Data.satisfy(model, actives).pipe(Effect.provide(readerOf(request))),
  /** A page answered 303 instead of drawn, decided from the prepared Model. */
  redirect: (model, request) =>
    Access.match(accessOf(model), {
      Denied: ({ url }) => Option.some(url),
      Allowed: () => Option.none(),
      Pending: () => Option.none(),
    }),
  // `lazy` may be a function of the Model, so only this route's bodies load.
  lazy: model => Site.codeFor(AppSite, pages, model.route),
})
```

`redirect` rather than a general `respond`: `location` is a header only the
entry writes (`ssr/src/index.ts:1371`), and a redirect is the one answer two
examples need.

```ts
// PSEUDOCODE. The host, as parts.
import { Host } from 'foldkit-plus/host'

const auth = Host.isolate((env: Env) => env.DB, env =>
  AuthServer.host({ auth: App, services: AuthLive(env), principal: principalOf(env.DB), key: Policy.key }),
)

export default Host.workers<Env>({
  origin: env => env.ORIGIN, // required; a request is answered 500 naming it when unset
  assets: { binding: 'ASSETS', at: '/assets/' },
  // `auth(env)` is the isolate's: built on the first request, shared after.
  routes: async env => {
    const { routes, scripted } = await auth(env)
    return [Host.at('/auth/', routes), Host.exactly('/remote', serveFetch({ server, layer, ...scripted }))]
  },
  pages: {
    template: Host.template('ASSETS'), // index.html and its build id, once per isolate
    entry: buildId => entryFor(buildId), // an SSR.entry
    reader: async env => pageReader({ server, layer, ...(await auth(env)).navigation }),
  },
  onError: (cause, request) => Effect.logError(Cause.pretty(cause)),
})
```

`Host.node(config)` takes the same config and returns a
`(request: Request) => Promise<Response>` with `env` given once, for tests
and other deploys. The reader crosses to the page on the request, through a
context the host declares (`SSR.requestContext`), so `page.ts:19-21` goes.

## 5. Phases

Each ships alone. "Measure" is what the phase records before and after.

| Phase | Ships | Measure | Tests |
| --- | --- | --- | --- |
| **0. Baselines** | `scripts/bundle-report.mjs` reports first-load JS per route (the entry, its static imports, and the route's chunks). Numbers for `examples/reference`, the CMS studio and site, and Chirp in `performance-PLAN.md`. | brotli per route; how much of each entry only one route imports | the report's own test |
| **D1. Chirp on node Surfaces** | `examples/chirp` moves its three `Surface.when` entries onto its nodes and builds `actives` from `Site.sources`. Docs: the route-policy recipe in `packages/site/README.md` and `site.md`. No API. | lines deleted | Chirp's unit and e2e suites unchanged |
| **D2. `visibleLinks`** | `foldkit-primitives/dom` | reads started per page of 50 links, with and without `atMost` | a browser test (`*.browser.test.ts`: layout decides it), with Save-Data emulated; mutations on the cap and the skip |
| **C1. `SitePage.code`, `Site.codeFor`** | `foldkit-site` | none (pure) | unit and type tests; a non-lazy page has none |
| **C2. Load on intent; SSR loads the route's** | `Site.routing`, `SSR.entry` and `SSR.hydrate` taking `lazy` as a function | requests on hover; time from click to drawn, with and without prefetch | `packages/site/test/intent.test.ts` extended; a runtime test that an unloaded page draws after arrival (see Risks); SSR test that another route's body is not loaded |
| **C3. Split one application** | the CMS studio's routes as `Bundle.lazy` pages; a module assertion per chunk, as `examples/auth/test/split.test.ts` | Phase 0's number again; #438's "done when" | `split.test.ts` per route with mutations (an eager import of a body goes red); an e2e that hovers a link and counts the chunk request, as `examples/auth/e2e/auth.e2e.ts:100` counts Yielded's |
| **H1. `SSR.entry`'s `redirect`** | `foldkit-ssr`; `examples/reference` and `examples/auth` make their entry once | `page.ts` lines; CPU per page (`scripts/workerd-cpu.mjs`) should not rise | SSR unit tests (a 303 carries the entry's headers, is never cached, never renders); both examples' e2e |
| **H2. `Host.isolate`, `Host.template`, `Host.routes`, `Host.node`** | the new package; `examples/reference/src/worker.ts` ported | `worker.ts` lines; CPU per request before and after | unit tests on `Host.node`; `examples/reference/test/worker.test.ts` and its e2e on workerd through `Stack.start`; a failed isolate build is retried |
| **H3. `AuthServer.host`** | `foldkit-auth/server`; reference and `examples/auth` ported | lines | the security tests of section 7, on workerd; `node:http` for navigations (Node's `fetch` cannot send one: CLAUDE.md) |
| **H4. `Host.workers` preset; `examples/cloudflare` ported** | the one call, with a Durable Object and media as routes | lines; a deploy of reference | e2e on all three examples |

Order: 0, then D1, H1 and C1 in parallel (disjoint packages), then the rest
of each track. C3 does not start unless Phase 0 shows a route-only share
worth splitting.

## 6. Decisions for the owner

1. **Per-node data policy (#236).**
   (a) the issue's `data` block; (b) a typed `policy` annotation Site
   carries; (c) no annotation, the route `match` on `Data.wiring`'s `policy`.
   *Recommend (c)*, and reject `retain` on a node outright as a second owner
   of retention.
2. **`SSR.plan({ site })` (#236).**
   (a) build it (needs the dependency between `foldkit-site` and
   `foldkit-ssr` turned round); (b) close it as met by
   `Object.values(actives)` over `Site.sources`, and port Chirp.
   *Recommend (b).*
3. **`'visible'` preloading and its budget.**
   (a) a `visibleLinks` stream in `foldkit-primitives/dom` with the cap in
   the stream; (b) a budget in `Site.routing` counting reads in flight;
   (c) not yet. *Recommend (a)*: (b) needs the routing to hear Remote's
   `Preloaded`, which it does not own.
4. **Where a route's chunk is cut (#438).**
   (a) a build plugin from the tree; (b) the author's `Bundle.lazy`, the
   tree deciding when to load. *Recommend (b).* It changes #438's wording
   from "derives one chunk per route" to "loads each route's chunk from the
   tree".
5. **A route that arrives before its code.**
   (a) set the route at once and draw the Bundle's `while`; (b) hold the old
   page until the chunk loads. *Recommend (a).* (b) needs "the route being
   gone to" kept somewhere, the second owner `227-preload-on-intent-DESIGN.md`
   rejected, and a load finishing after a later navigation would set a
   stale route.
6. **Is #438 worth building for today's applications?** Decide after Phase
   0. *Recommend* building C1 and C2 regardless (small, and the SSR change
   stops every lazy body loading on every page) and gating C3 on the
   numbers.
7. **`Host`: one call or parts (#235).**
   (a) `Host.workers` only; (b) parts first, the preset last; (c) nothing.
   *Recommend (b).*
8. **Where the host lives.**
   (a) a new `foldkit-host` package, re-exported as `foldkit-plus/host`;
   (b) inside `packages/plus` as `testing/workers` is
   (`packages/plus/src/testing/workers.ts`). *Recommend (a)*: it runs in
   production and has peers of its own (`foldkit-remote-server`,
   `foldkit-ssr`); `testing/workers` is a development tool.
9. **Who pairs the resolvers.**
   (a) `Host.yielded` in the host; (b) `AuthServer.host` in
   `foldkit-auth/server`. *Recommend (b)*, so the host has no auth peer and
   the package that defines `requests: 'navigation'` is the one that hands
   it only to a reader.
10. **The page build on a Worker.**
    (a) the page bundled into the Worker beside the routes, the template
    read from assets (`examples/reference`); (b) the plugin's generated
    `fetch.js` as `main` (`domains-plus`), which cannot be routed in front
    of and gets no `env`; (c) ask upstream for `fetch(request, env, ctx)`
    forwarded to `renderPage`. *Recommend (a) for the host now and (c)
    filed upstream*; `SSR.requestContext` already makes the page code the
    same either way (`212-ssr-request-context-DESIGN.md`, "Deferred").
11. **The Sync Durable Object and media routes.**
    (a) the host owns them; (b) they are routes the application adds.
    *Recommend (b).*
12. **Unset `ORIGIN`.**
    (a) answer 500 naming the variable, as `worker.ts:167-168` does;
    (b) fall back to the request's own origin in development.
    *Recommend (a) everywhere*: `Stack.start`'s `vars` can already give a
    local stack its origin (#269), so no fallback is needed, and a fallback
    is the failure the 2026-10-29 comment removed.

## 7. Risks, review points, rejected alternatives

### Security: one handler

- **A page's reader must never write, and `/remote` must never trust a
  navigation.** A navigation carries no CSRF header and often no `Origin`
  (CLAUDE.md), so the page's resolver skips both checks; that is safe only
  because `pageReader` refuses mutations and live opens
  (`remote-server/src/fetch.ts:643-670`). If one config could hand the
  navigation resolver to `serveFetch`, any site could write as a signed-in
  reader with a link. `AuthServer.host` must return the two as differently
  typed values that fit only their own consumer. Test: a `POST /remote`
  with a cookie and no CSRF header is 401; a page `GET` with the cookie
  renders as the reader; a write through the page's reader fails.
- **The origin is configured, never the request's.** A Worker reachable at
  two hosts trusts one (`worker.ts:13-15`). On Node the host resolves the
  request target with Foldkit's `resolveRequestUrl` and refuses another
  origin. Test: a sign-in naming another host is refused.
- **Assets are answered before the origin check** (`worker.ts:166-168`), so
  an unconfigured Worker still serves its build. Nothing else may be: review
  that no route is added above it.
- **A WebSocket upgrade carries no header of the application's** (CLAUDE.md),
  so a Sync route added to the host cannot use the scripted resolver. It
  checks `Origin` alone or a subprotocol credential; the host's docs say so
  beside `Host.at`.
- **`onError` receives the cause; the response never does.** A 500's body
  stays fixed text, as `SSR.entry`'s and `serveFetch`'s are.

### Security: caching across principals

- **The host adds no cache and no `cache-control`.** A page is kept only by
  `SSR.entry`'s `cache`, whose rule is that every read was public and the
  render read no request header, the cookie included
  (`ssr/src/index.ts:1451-1469`); anything else is `private, no-store`. A
  read of the host's request context counts as reading every header
  (`ssr/src/pageCache.ts:22-23`), so a page given a reader is never kept
  unless its reads prove public. Review point: `redirect` runs on the
  prepared Model; a 303 must be `private, no-store` and never stored,
  whatever the reads were.
- **Isolate-level values hold no principal.** `Host.isolate` is keyed by a
  binding, and what it builds (Yielded's services, a template) is the same
  for every reader; the principal is read per request
  (`worker.ts:79-92`). Review any value passed to it for a captured
  request. A type cannot enforce this.
- **The store holds one viewer's values.** A policy by route (decision 1)
  changes when reads are asked, not whose they are; a change of viewer is
  still `Data.forget` (`remote/src/remote.ts:370-374`).
- **A preload or a chunk prefetch for a route the reader may not see.** The
  read is refused by the server's guard and dropped
  (`227-preload-on-intent-DESIGN.md`, "Deferred"). The chunk is a public
  asset: a route's *code* is never a secret, and nothing secret may be
  compiled into a body.

### Other risks

- **A lazy page that draws nothing after it loads.** Foldkit renders when
  the root Model changes identity (CLAUDE.md). `Bundle.lazy` loads on the
  first Message and yields it again (`lazy.ts:147-158`); if the page's
  `update` returns the Model it was given for that Message, the view may
  stay on `while` though the body is there. Not yet observed: Phase C2
  starts with a runtime test of exactly this, and if it fails the fix is
  `Bundle.lazy`'s, not Site's.
- **A chunk that no longer exists.** After a deploy, an open tab's route
  chunk may 404. The load Command is `Effect.promise` (`lazy.ts:154`), so a
  rejected import is a defect. What Foldkit's runtime does with it needs a
  probe before C2; the likely answer is that `Site.routing` loads the whole
  document (`Site.Load`, which it already has for addresses no node holds),
  which also picks up the new build.
- **A Message through `update` twice.** A Message that meets an unloaded
  Bundle passes `update` twice (`packages/bundle/README.md:1009-1017`).
  Loading on intent makes this rarer, not impossible (a keyboard reader who
  does not rest on a link).
- **Bindings keyed in a `Map`.** `worker.ts:56` keys by the binding object.
  Miniflare replaces bindings on every reload (CLAUDE.md), so a `Map` keeps
  the old one alive and a dev stack grows. `Host.isolate` uses a `WeakMap`.
- **Layers and streams.** A service that outlives a request is built into a
  `ManagedRuntime` kept by `Host.isolate`, never `Effect.provide`d per
  request; a live stream's layer is `serveFetch`'s concern and stays there.
  The host holds no in-memory hub: one Worker request cannot wake another's
  stream (CLAUDE.md).
- **Module-level calls.** A page split into a declaration and a body keeps
  its body's chunk small only if the declaration module makes no call that
  imports the body's dependencies. The per-chunk module assertion (C3) is
  the check; reading sizes is not.
- **The parts drift from the preset.** `Host.workers` must be written over
  the public parts only, so an application that outgrows it can copy its
  body.

### Rejected

- **Site as the server's router** (a route table of pages in the host).
  `router-DESIGN.md` section 26. A page's status and access need its Model,
  which exists in `SSR.entry`.
- **`Site.link` and an intended-route Model slot.** Rejected in #227's note;
  nothing here revives it.
- **A `SitePlan` or `Site.prepare` object.** `router-DESIGN.md`,
  "Deliberately not built": the chain, the Sources and the head are three
  functions already.
- **`retain` per node.** A second owner of retention.
- **`Remote.inProcess` over HTTP for the page's reads.** Rejected in #212's
  note; `pageReader` calls the handlers.
- **`AsyncLocalStorage` for the request context.** Rejected in #212's note.
- **A host-level response cache or security-header defaults beyond what
  each handler sets.** Two owners of `cache-control`. Dev cookie prefixes
  are Yielded's `Http.make` config, which `AuthServer.host` passes on.
- **Holding the old page during a chunk load.** Decision 5.
