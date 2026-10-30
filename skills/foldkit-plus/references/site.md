# `foldkit-site`

Checked against `foldkit-site` 0.4.4.

The deployed route topology: stable route nodes in a hierarchy, typed
targets, and per-node metadata — compiling to the Router, Surface, and Bundle
primitives the runtime already runs. Pure data: no Model, no Effects, no
Messages, no fetching.

<!-- docs-check
import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, int, literal, slash } from 'foldkit/route'
const AppRoute = defineRouteUnion({
  Home: {},
  People: {},
  Person: { personId: Schema.Number },
})
const personRouter = pipe(literal('people'), slash(int('personId')), Route.mapTo(AppRoute.Person))
const Home = Site.route(pipe(Route.root, Route.mapTo(AppRoute.Home)), AppRoute.Home)
const People = Site.route(pipe(literal('people'), Route.mapTo(AppRoute.People)), AppRoute.People)
-->

```ts
import { Site } from 'foldkit-site'

const Person = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
})
const AppSite = Site.make(Home, Site.mount(People, [Person]))

const target = Site.target(Person, { personId: 3 })
target.route // AppRoute.Person({ personId: 3 })
target.url // '/people/3'
Site.chainOf(AppSite, target.route) // [People, Person]
Site.titleOf(AppSite, target.route) // 'Person 3 | Routing'
```

`Site.route(router, case, options?)` takes an existing full Foldkit Router;
the router stays the whole URL story. `Site.node(router, case)` is the same
node as an incremental builder (`.title(...)`, `.section(...)`, ...,
`.node`) — methods, not pipeable fragments, so the route infers through
every step; named bundles compose through `.pipe` (or free `pipe`) with no
annotation; `Site.route`'s options are sugar over it. `Site.mount(node,
children?)` never mutates the node. `Site.make(...roots)` freezes the tree
and refuses two nodes sharing a tag or one node mounted twice.

## Common tasks

**Targets and hrefs.** `Site.target(node, params)` is `{ node, route, url }`;
`Site.href(target)` or `Site.href(node, params)`. A built URL parses back to
the target's route — one declaration, no parallel href builder.

**Inspection.** `Site.nodeOf(site, route)` / `Site.chainOf(site, route)` (`[]`
for an unknown tag); `Site.parentOf`, `Site.ancestorsOf`, `Site.depthOf`,
`Site.nodesOf` (depth-first, parents first).

**Metadata.** `title` (of the route value), `section`, read with
`Site.titleOf` / `Site.sectionOf` (`undefined` when absent). `landing` is a
section's nav address as its node's params; `Site.landing(site, section)` is
the first declaring node as a target. `shortcut` is a Foldkit
`KeySequence` (`'/'`, `['G', 'H']`) going to the node's landing;
`Site.shortcuts(site, target => Message.Pressed({ url: target.url }))` is
every one as `Dom.streamFromKeyBindings` bindings (no landing, or keys used
twice, throws). Annotate once; derive nav, titles, shortcuts, and
breadcrumbs from it.

**Head metadata.** `.meta<Model>(({ route, model }) => Meta)` (or the `meta`
option) says what a node's page tells a search result and a link preview, as
`foldkit-ssr`'s `Meta`; `indexed: false` marks a node and the nodes below it
`noindex`. `Site.metaOf(site, route, model)` merges the chain root first
(deeper fields win; the preview title falls back to `title`) and is an SSR
plan's `meta` directly: `meta: model => Site.metaOf(AppSite, model.route,
model)`. `Site.indexedOf(site, route)` is the flag for a sitemap.

**Both directions and every address.** `Site.parse(site, NotFound)` is the
app's URL parser from the tree (first node in tree order whose router takes
the address; a catch-all `/:slug` node goes after the literals it would
shadow); `Site.hrefOf(site, route)` builds an address back, typed to the
tree's routes. `Site.targets(site, [Site.paths(Post, listPosts), ...])` is an
Effect of every `{ node, route, url, modified? }`: paramless nodes once,
param nodes from their `paths` Effect (refused when missing; list none with
`Effect.succeed([])`). Feed a static build and a sitemap (filter with
`Site.indexedOf`). `Site.routeAt(site, url)` is the route at an address as
an `Option`: `None` means another document serves it (a full load).

**Who may be shown a page.** `.access<Me>({ allow: me => me.signedIn,
otherwise: requested => Site.target(SignIn, { returnTo: Option.some(requested) }) })`
on a node covers it and the nodes below it. `Site.accessOf(site, route, who:
Option<Who>)` is `Access.Allowed`, `Pending` (who unknown: draw loading), or
`Denied({ url })`: replace the URL in `update`, or answer a 303 on the
server. Presentation only; the server guards the data. A target the refusing
rule also covers (a sign-in page mounted under it) throws; in a node's
options, annotate the reader (`allow: (me: Me) => …`).

**History.** `Site.historyOf(prev, next)`: another node, or an unknown
location, is a step; within a node its `history` rule (default replace; a
function for nodes where some param changes are entries of their own).

**Lifecycle.** `Site.routing<Model, Message, Route>({ site, owner, route,
parse, tags: { clicked, changed }, completed })` is the link-click and
URL-change lifecycle as one wiring: clicks on links the tree holds navigate
per `historyOf`, every other link loads (another document), URL changes set the route field (or touch
nothing on an echo). The app's own update guards with `Routing.reduces`.
Needs a completion variant and a structural route field (`{ dependency, get,
set }` — a union field is a union of refs, no single `ModelRef` accepts it).
To read a page ahead when the reader means to follow a link, add
`preload: { links: pointedLinks(), intended: Message.PointedAtLink, read:
there => Data.preload(there, actives) }` (`pointedLinks` from
`foldkit-primitives/dom`; `PointedAtLink: { url: Url }` in the app's union)
and name the services: `Site.routing<Model, Message, Route, RemoteClient>`.
A link counts after a hover or focus rests 50 ms on it, and at once for a
finger. The routing claims `intended`, skips addresses the tree does not hold
and the route shown, and hands `read` the Model with the route set; the Model
itself is unchanged, and the reads land as Remote's `Preloaded`. Do not add
an "intended route" Model field or extra `Surface.at` entries for it.

**Attached Surfaces.** `surface: { surface, params: route => params }` on a
node; `Site.sources(site, App.owner, App.model.route)` is each surfaced node
as its `Surface.when`, keyed by tag, for `Data.wiring` / `subscriptions` /
`satisfy` / SSR `surfaces`. Refuses a foreign surface. Each entry answers its
own tag only. `Site.sourcesFor(site, App.owner, App.model.route,
target.route)` is the same entries for the target's chain only — what
prefetch/SSR read; prepare caller-side with `Data.satisfy({ ...model, route:
target.route }, active)`. Unknown tags resolve to no Sources. There is no
`SitePlan` object: the chain is `Site.chainOf`, the head `Site.metaOf`.
A Surface keyed by who is signed in (a home feed) takes `viewer: (model) =>
Option<Viewer>` beside `params: (route, viewer) => params`; it is active on
its route only while `viewer` is `Some`, so the app writes no `Surface.at`
gating. The Site does not fetch the viewer: keep the read that names it (a
`Session` Surface over `Me`) among the actives, and `Data.satisfy` reads it
before the feed. Without `viewer`, a second `params` argument does not compile.

**Nested rendering.** `layout: { render: (child, model, h) => ... }` wraps
everything under the node; `view: { render: (model, h) => ... }` draws its
own route. `Site.view(site, route, model, h)` is the leaf's view in every
ancestor layout, root-first; ancestors never draw their views. Unknown tags
and viewless leaves fail loudly.

**Routed pages.** `Site.placement(node, bundle, { link, args, changed?,
key?, when?, onMessage? })`: the link states the relationship once;
`placed.update` folds, `placed.view` draws. `changed: route => childMsg`
tells the child on arrival (`undefined` = nothing needed; absent = never
informed). `Site.routing({ ..., pages: [...] })` informs arrivals, and `arrived: (model, route) => Update.Return` runs after
them for a new route (focus, say), never for an echo. Bundles
with OutMessages and non-Bundle children stay on `Bundle.at` / `Link.child`.

## Gotchas

- A layout surface active for several tags is not expressible yet (a future
  `whenAny`-shaped extension); each entry answers its own tag.
- Route-local model ownership is still per-application code.
- `Site.target(Node, {})` for param-less routes: params are always explicit.
- Locales are route params when they arrive; themes are preferences, not routes.

## Known traps

Met in applications on this stack: what failed, and what to do instead.

- **Foldkit's `string` route segment neither encodes nor decodes.** A slug
  `a/b` built `/site/a/b`, which parsed as `a` plus a stray segment, and a
  browser's `a%20b` read back as `a%20b`. Route text that is not URL-safe
  through `schemaSegment` with an encoding Schema
  ([examples/cms](https://github.com/doeixd/foldkit-plus/tree/main/examples/cms)'s
  `src/content/siteRoutes.ts`, `Slug`).
- **Foldkit draws the next screen before a navigation's Command runs.** A
  scroll offset recorded on `navigate` or `popstate` was already clamped to
  the new, shorter page, and a restore made when the entry changed was undone
  by the loading state drawn after it. Record the offset at the reader's
  action, and hold a restore until the screen has settled.
- **A route change the application made comes back as a `UrlChanged`** for
  the address already shown: make it a no-op (see [mirror.md](mirror.md)).

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/site/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/reference (a
  viewer-keyed node, `access` and `preload` in one app)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/chirp
