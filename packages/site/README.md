# `foldkit-site`

In a multi-screen app, route strings, page titles, navigation sections,
breadcrumbs, history rules, and data triggers end up duplicated across parallel
lookup tables. Adding or renaming a route means updating four files by hand, and
a mistyped link target silently sends users to a 404.

`foldkit-site` lets you declare your route topology once as a tree of typed
nodes built on Foldkit's Router. Each node pairs a URL parser and route union
variant with its title, section, history rule, layout, and active `Surface`. One
tree parses URLs, constructs typed link targets (`Site.target`), drives
navigation and breadcrumbs, and selects which data to fetch on the client and
server.

See it running in [`examples/foldkit/routing`](../../examples/foldkit/routing)
and read [Site, Remote and SSR together](../../docs/site-remote-ssr.md) for a
full server-rendered example.

## Install

```sh
pnpm add foldkit-site
```

Peers on `effect` and `foldkit`. Uses `foldkit-surface` for `Site.sources` and
`foldkit-ssr` for `Meta` types.

## A first route tree

This builds a three-route tree (`Home`, `People`, and `Person`), creates a
typed link target for person `3`, and reads its URL, route chain, title, and
navigation section:

```ts
import { Schema, pipe } from 'effect'
import { defineRouteUnion, int, literal, mapTo, root, slash } from 'foldkit/route'
import { Site } from 'foldkit-site'

const AppRoute = defineRouteUnion({
  Home: {},
  People: {},
  Person: { personId: Schema.Number },
})

const Home = Site.route(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home, { title: () => 'Home' })
const People = Site.route(pipe(literal('people'), mapTo(AppRoute.People)), AppRoute.People)
const Person = Site.route(
  pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person)),
  AppRoute.Person,
  { title: ({ personId }) => `Person ${personId}`, section: 'People' },
)

const AppSite = Site.make(Home, Site.mount(People, [Person]))
const target = Site.target(Person, { personId: 3 })
```

Evaluating `target` and the tree helpers produces:

- `target.url` -> `'/people/3'`
- `target.route` -> `AppRoute.Person({ personId: 3 })`
- `Site.chainOf(AppSite, target.route)` -> `[People, Person]`
- `Site.titleOf(AppSite, target.route)` -> `'Person 3'`
- `Site.sectionOf(AppSite, target.route)` -> `'People'`

`Site.route` wraps your existing Foldkit Router (`root`, `literal`, `slash`,
`query`, `mapTo`) and attaches structural metadata to it without re-parsing
URLs.

## What a Site owns

A Site owns **where the application is** in the route tree:

- **Site (`foldkit-site`):** Which route nodes exist, how they nest, their URLs,
  titles, sections, history steps, and which Surfaces belong to each node.
- **Surface (`foldkit-surface`):** What each active location observes in the
  `Model` and which `Message`s it may send.
- **Remote (`foldkit-remote`):** Which server reads those active Surfaces need.
- **Your app (`Model` and `update`):** Application state, Effects, and state
  transitions.

Every node is an immutable first-class value, so mounting it in a tree leaves
the original node unchanged and lets you build targets and hrefs from the node
anywhere in your app. See [Site and Foldkit's Router](../../docs/site-and-router.md)
for how the Site and Router layers divide responsibilities.

## Declaring nodes, trees, and targets

`Site.route(router, case, options?)` declares one location. Options include
`title` (function of the route value), `section`, `landing` (the section's nav
params), `shortcut` (keys for `Dom.streamFromKeyBindings`, like `'/'` or
`['G', 'H']`), `history`, `access`, and `surface`.

To annotate a node step by step or share reusable bundles of annotations across
nodes, use the `Site.node` builder:

<!-- docs-check standalone define site-routes
import { Effect, Option, Schema, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import {
  defineRouteUnion,
  int,
  literal,
  mapTo,
  oneOf,
  parseUrlWithFallback,
  query,
  root,
  slash,
} from 'foldkit/route'
import { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'

const AppRoute = defineRouteUnion({
  Home: {},
  People: { searchText: Schema.Option(Schema.String) },
  Person: { personId: Schema.Number },
  Nested: {},
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type
const homeRouter = pipe(root, mapTo(AppRoute.Home))
const peopleRouter = pipe(
  literal('people'),
  query(Schema.Struct({ searchText: Schema.OptionFromOptional(Schema.String) })),
  mapTo(AppRoute.People),
)
const personRouter = pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person))
const nestedRouter = pipe(literal('nested'), mapTo(AppRoute.Nested))
const urlToAppRoute = parseUrlWithFallback(
  oneOf(personRouter, peopleRouter, homeRouter, nestedRouter),
  AppRoute.NotFound,
)
const Model = Schema.Struct({ route: AppRoute, bios: Schema.Record(Schema.String, Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
})
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { route: AppRoute.Home(), bios: {} },
  update: (model: Model) => ({ model }),
})
const PeoplePage = App.surface('PeoplePage', {
  params: { searchText: Schema.Option(Schema.String) },
  model: ({ model }) => Projection.struct({ route: model.route }),
})
-->

```ts
import { Site } from 'foldkit-site'

const Person = Site.node(personRouter, AppRoute.Person)
  .title(({ personId }) => `Person ${personId} | Routing`)
  .section('People')
  .node
```

The builder uses methods so TypeScript infers the route type at each stage, and
`.pipe(...)` (or `pipe(builder, bundle)`) composes reusable annotation bundles
without type annotations. Reading `.node` freezes the value at any step.

- **Mounting (`Site.mount` and `Site.make`):** `Site.mount(node, children?)`
  attaches child nodes or subtrees, and `Site.make(...roots)` freezes the tree.
  Duplicate route tags or mounting the same node twice throw at `Site.make` so
  chain inspection stays unambiguous.
- **Targets (`Site.target` and `Site.href`):** `Site.target(node, params)`
  returns `{ node, route, url }`, and `Site.href(target)` (or
  `Site.href(node, params)`) returns its URL string built by the node's own
  router.
- **Parsing and reversing (`Site.parse`, `Site.hrefOf`, `Site.routeAt`):**
  `Site.parse(site, NotFound)` builds your app's URL parser in depth-first tree
  order (parents first; place catch-all `/:slug` routes after specific literal
  routes). `Site.hrefOf(site, route)` formats any route in the tree and refuses
  unknown routes at compile time. `Site.routeAt(site, url)` returns
  `Option.some(route)` when the tree owns the URL or `Option.none()` when it
  belongs to another document that needs a full page load.
- **Inspecting the tree:** `Site.nodeOf`, `Site.chainOf`, `Site.parentOf`,
  `Site.ancestorsOf`, `Site.depthOf`, and `Site.nodesOf` resolve routes to nodes
  and root-first ancestor chains.

To enumerate every concrete URL in the site for static builds or sitemaps, pair
parameterized nodes with `Site.paths` and pass them to `Site.targets`:

<!-- docs-check
const Home = Site.route(homeRouter, AppRoute.Home)
const People = Site.route(peopleRouter, AppRoute.People)
const AppSite = Site.make(Home, Site.mount(People, [Person]))
-->

```ts
const list = Site.paths(People, Effect.succeed([{ params: { searchText: Option.none() } }]))
const people = Site.paths(
  Person,
  Effect.succeed([{ params: { personId: 3 }, modified: '2026-10-01' }]),
)
const listed = Site.targets(AppSite, [list, people])
// Effect resolving to [..., { node: Person, route, url: '/people/3', modified: '2026-10-01' }]
```

Missing `Site.paths` for a parameterized node, duplicate `paths` for one node,
or `paths` for a node outside the tree are refused at compile time. Pass
`Effect.succeed([])` to emit zero URLs for a parameterized node.

## History, navigation, and head metadata

- **History steps (`Site.historyOf(prev, next)`):** Moving to another node (or
  from an unknown route) pushes a history entry. Moving within the same node
  uses that node's `history` option — either `'push'`, `'replace'`, or a
  function `(prev, next) => 'push' | 'replace'` so changing entity IDs pushes
  while changing search filters replaces.
- **Navigation bars and shortcuts:** Read titles with `Site.titleOf` and
  sections with `Site.sectionOf`. `Site.landing(site, section)` finds the first
  node in a section with a `landing` target, and `Site.shortcuts(site, toMessage)`
  produces key bindings for `Dom.streamFromKeyBindings` (refusing shortcuts
  without a landing or duplicate key bindings).
- **Head metadata (`meta` and `indexed`):** Declare `meta: ({ route, model }) => Meta`
  for `foldkit-ssr` search and link-preview tags (`description`, `image`, `type`,
  `article`, `jsonLd`), and `indexed: false` to keep a node and its descendants
  out of sitemaps (`Site.indexedOf`) and search indexes (`noindex`).
  `Site.metaOf(site, route, model)` merges the chain root-first, falling back to
  the node's `title`:

<!-- docs-check standalone use site-routes
import { Site } from 'foldkit-site'
import { SSR } from 'foldkit-ssr'
const AppSite = Site.make(
  Site.route(homeRouter, AppRoute.Home),
  Site.mount(Site.route(peopleRouter, AppRoute.People), [
    Site.route(personRouter, AppRoute.Person),
  ]),
)
-->

```ts
const Person = Site.node(personRouter, AppRoute.Person)
  .title(({ personId }) => `Person ${personId} | Routing`)
  .meta<Model>(({ route, model }) => ({ description: model.bios[route.personId] }))
  .node
const Nested = Site.route(nestedRouter, AppRoute.Nested, { indexed: false })

const plan = SSR.plan(App, {
  id: 'site',
  state: Projection.pick(App.model.route, App.model.bios),
  meta: model => Site.metaOf(AppSite, model.route, model),
})
```

Any Model field read by `meta` must be included in the SSR plan's `state` (such
as the route and resumed fields) so server and client render matching heads.

## Nested layouts and views

`Site.view(site, route, model, h)` draws the deepest matched node's `view`,
wrapped root-first by every ancestor's `layout`:

```ts sketch
const Section = Site.route(sectionRouter, AppRoute.Section, {
  layout: {
    render: (child, model, h) => h.div([], [sidebar(model, h), child]),
  },
  view: {
    render: (model, h) => h.ul([], [/* items */]),
  },
})
```

Each `layout` receives its composed `child` element explicitly without outlets,
context providers, or nested routers. Ancestors contribute `layout` only, and
unknown route tags or viewless leaf nodes fail loudly.

## Activating Surfaces on a route

Attach a `foldkit-surface` Surface directly to a route node so route navigation
activates its data reads automatically:

<!-- docs-check standalone use site-routes
import { Site } from 'foldkit-site'
-->

```ts
const People = Site.route(peopleRouter, AppRoute.People, {
  surface: {
    surface: PeoplePage,
    params: route => ({ searchText: route.searchText }),
  },
})
```

`Site.sources(site, App.owner, App.model.route)` turns every node with a
Surface into a keyed record of `Surface.when` sources for `Data.wiring`,
`Data.subscriptions`, `Data.satisfy`, or an SSR plan's `surfaces` (refusing
Surfaces from another application). On a `Person` route, only `Person`'s
Surface is active; `People`'s stays inactive. `Site.sourcesFor(site, owner, place, target.route)`
returns only the sources on `target.route`'s ancestor chain for prefetching and
SSR.

When a route's Surface also depends on the signed-in user (such as a home feed),
supply `viewer` so the Surface activates only once the viewer resolves to
`Option.some(me)`:

<!-- docs-check standalone
import { Option, Schema, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion, mapTo, root } from 'foldkit/route'
import { Entity } from 'foldkit-entity'
import { Remote, RemoteData } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import { Projection, Surface } from 'foldkit-surface'

const AppRoute = defineRouteUnion({ Home: {} })
const homeRouter = pipe(root, mapTo(AppRoute.Home))
const Account = Entity.define('Account', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Account] })
const Session = App.surface('Session', {
  model: () => ({ me: Data.get(Entity.select(Account, { id: true }), 'me') }),
})
const HomeFeed = App.surface('HomeFeed', {
  params: { ownerId: Schema.String },
  model: ({ params }) => ({ ownerId: Projection.fromReader(Schema.String, () => params.ownerId) }),
})
-->

```ts
const viewerOf = (model: Model): Option.Option<{ readonly id: string }> =>
  RemoteData.match(Surface.read(Session, model).me, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: me => Option.some(me),
    Refreshing: me => Option.some(me),
    Failed: () => Option.none(),
    NotFound: () => Option.none(),
  })

const Home = Site.route(homeRouter, AppRoute.Home, {
  surface: { surface: HomeFeed, viewer: viewerOf, params: (_, me) => ({ ownerId: me.id }) },
})
```

If `viewerOf` returns `Option.none()` (while loading or after sign-out),
`HomeFeed` stays inactive without custom gating in `update`. `Data.satisfy` on
the server resolves `Session` first and `HomeFeed` in the next pass so SSR
renders the feed complete.

## Routed pages

`Site.placement` connects a stateful `foldkit-bundle` page to a route node —
naming its Model field, Message wrapper, initialization args, and the Message to
send when the route arrives:

<!-- docs-check standalone define site-people
import { Option, Schema, pipe } from 'effect'
import { Submodel } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import {
  defineRouteUnion,
  int,
  literal,
  mapTo,
  oneOf,
  parseUrlWithFallback,
  query,
  root,
  slash,
} from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url } from 'foldkit/url'
import { Bundle, Link } from 'foldkit-bundle'
import { Site } from 'foldkit-site'
import { ModelRef, Surface } from 'foldkit-surface'

const AppRoute = defineRouteUnion({
  Home: {},
  People: { searchText: Schema.Option(Schema.String) },
  Person: { personId: Schema.Number },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type
const homeRouter = pipe(root, mapTo(AppRoute.Home))
const peopleRouter = pipe(
  literal('people'),
  query(Schema.Struct({ searchText: Schema.OptionFromOptional(Schema.String) })),
  mapTo(AppRoute.People),
)
const personRouter = pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person))
const urlToAppRoute = parseUrlWithFallback(
  oneOf(personRouter, peopleRouter, homeRouter),
  AppRoute.NotFound,
)
const Home = Site.route(homeRouter, AppRoute.Home)
const People = Site.route(peopleRouter, AppRoute.People)
const Person = Site.route(personRouter, AppRoute.Person)
const AppSite = Site.make(Home, Site.mount(People, [Person]))

const PeopleModel = Schema.Struct({ searchInput: Schema.String, found: Schema.Array(Schema.String) })
type PeopleModel = typeof PeopleModel.Type
const PeopleMessage = defineMessageUnion({
  ChangedRoute: { route: AppRoute.People },
  Picked: { name: Schema.String },
})
type PeopleMessage = typeof PeopleMessage.Type
const PeopleBundle = Bundle.make('People', {
  Model: PeopleModel,
  Message: PeopleMessage,
  args: Schema.Struct({ searchText: Schema.Option(Schema.String) }),
  init: ({ searchText }) => ({
    model: { searchInput: Option.getOrElse(searchText, () => ''), found: [] },
  }),
  update: (model, message) =>
    PeopleMessage.match(message, {
      ChangedRoute: ({ route }) => ({
        model: { searchInput: Option.getOrElse(route.searchText, () => ''), found: [] },
      }),
      Picked: ({ name }) => ({ model: { ...model, found: [...model.found, name] } }),
    }),
  view: Submodel.defineView<PeopleModel, PeopleMessage>((model, h: HtmlBuilder<PeopleMessage>) =>
    h.p([], [model.searchInput]),
  ),
})
const Model = Schema.Struct({ route: AppRoute, peoplePage: PeopleModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  GotPeopleMessage: { message: PeopleMessage },
})
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const updateOwn = (model: Model, _message: Message) => ({ model })
-->

```ts
const PeoplePage = Site.placement(People, PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => PeopleMessage.ChangedRoute({ route }),
})
```

<!-- docs-check
const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: ModelRef.focus(App.model.route).dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  pages: [PeoplePage],
})
-->

Assemble `PeoplePage.placed` alongside `Site.routing` so `assembly.update`
forwards wrapper Messages and `Routing` notifies `PeoplePage` via `changed`
whenever `People` becomes active:

```ts
const assembly = Bundle.assemble<Model, Message>()([PeoplePage.placed, Routing])
const update = assembly.update((model, message) =>
  Routing.reduces(message) ? { model } : updateOwn(model, message),
)
```

For Bundles with OutMessages or non-Bundle submodels, continue using
`Bundle.at` and `Link.child`. If placed pages require Effect services, pass
them on both calls: `Site.routing<Model, Message, AppRoute, RemoteClient>`.

## Link clicks and URL changes

`Site.routing` wires link clicks and URL changes once for the whole tree so
your `update` skips hand-writing both branches:

<!-- docs-check standalone use site-people
const PeoplePage = Site.placement(People, PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => PeopleMessage.ChangedRoute({ route }),
})
const pages = [PeoplePage]
-->

```ts
import { modifyFields } from 'foldkit/struct'
import { ModelRef } from 'foldkit-surface'

const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: ModelRef.focus(App.model.route).dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
})

const assembly = Bundle.assemble<Model, Message>()([Routing, ...pages.map(page => page.placed)])
const update = assembly.update((model, message) =>
  Routing.reduces(message) ? { model } : updateOwn(model, message),
)
```

- **Link clicks:** Links inside the tree navigate via push or replace according
  to `Site.historyOf`; external URLs and addresses outside `AppSite`
  (`Site.routeAt`) fall back to full document loads.
- **URL changes:** Updates the route field and skips echoes when the parsed
  route matches the active one. Add `arrived: (model, route) => ({ model, commands })`
  for post-navigation side effects like moving focus (`examples/cms/src/apps/siteApp.ts`).
- **History vs push:** Provide `navigated: (model, kind) => model` to learn
  whether a route change came from `'history'` (Back/Forward) or `'push'` before
  setting the route — Remote uses this to keep lists intact on Back instead of
  refetching:

```ts sketch
const Navigating = Site.routing<Model, Message, AppRoute, RemoteClient>({
  // ...site, route, parse, tags, and completed as above
  navigated: (model, kind) => Data.reduce(model, { _tag: 'Navigated', kind }),
})
```

`Routing.reduces(message)` guards `updateOwn` from handling click or URL-change
tags directly, while still letting `foldkit-mirror` URL mirrors read their
slices first.

## Guarding which routes a visitor sees

Route access rules control presentation — redirecting an unauthenticated visitor
to `/sign-in` instead of flashing an empty screen. Always enforce data
authorization on the server with `foldkit-guard` and `RemoteServer`.

Attach `access` to a node to specify who may see it and its descendants, plus
where anyone else should go:

<!-- docs-check standalone
import { Option, Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, query } from 'foldkit/route'
import { Site } from 'foldkit-site'

const AppRoute = defineRouteUnion({
  Home: {},
  SignIn: { returnTo: Schema.Option(Schema.String) },
  Projects: {},
})
interface Me {
  readonly signedIn: boolean
}
const SignIn = Site.route(
  pipe(
    literal('sign-in'),
    query(Schema.Struct({ returnTo: Schema.OptionFromOptional(Schema.String) })),
    mapTo(AppRoute.SignIn),
  ),
  AppRoute.SignIn,
)
const toSignIn = (requested: string) => Site.target(SignIn, { returnTo: Option.some(requested) })
-->

```ts
const Projects = Site.node(pipe(literal('projects'), mapTo(AppRoute.Projects)), AppRoute.Projects)
  .access<Me>({ allow: me => me.signedIn, otherwise: toSignIn })
  .node
```

Call `Site.accessOf(site, route, who)` and branch with `Access.match`:

- **`Allowed`:** Render the route.
- **`Pending`:** `who` is `Option.none()` (still loading); show a loading
  state instead of flashing sign-in.
- **`Denied`:** Replace the URL with `otherwise(requested)` in the browser, or
  return a `303` redirect on the server. Mounting the `otherwise` target inside
  a subtree protected by the same rule throws at runtime to prevent redirect
  loops.

## Setting a data policy per route

A route node does not carry a caching policy of its own; instead, pass a
function of the `Model` to `Data.wiring` and exhaustively match `model.route`
with your route union's `match`:

<!-- docs-check standalone
import { Option, Schema, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
import { Remote, RemotePolicy } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import { Surface } from 'foldkit-surface'

const AppRoute = defineRouteUnion({ Home: {}, Profile: { handle: Schema.String } })
const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [] })
const Home = App.surface('Home', { model: () => ({}) })
const Profile = App.surface('Profile', {
  params: { handle: Schema.String },
  model: () => ({}),
})
const AppSite = Site.make(
  Site.route(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home, {
    surface: { surface: Home, params: () => undefined },
  }),
  Site.route(pipe(literal('people'), slash(string('handle')), mapTo(AppRoute.Profile)), AppRoute.Profile, {
    surface: { surface: Profile, params: ({ handle }) => ({ handle }) },
  }),
)
const editor = Data.active('editor', () => Option.none())
-->

```ts
const timeline = RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 })
const profile = RemotePolicy.staleWhileRevalidate({ maxAge: 15_000 })

const wiring = Data.wiring(Site.sources(AppSite, App.owner, App.model.route), {
  policy: (model: Model) =>
    AppRoute.match(model.route, {
      Home: () => timeline,
      Profile: () => profile,
    }),
})
```

To override `policy` for one specific Surface (such as an always-fresh side
editor), pass `policies` keyed by Surface name — TypeScript checks every key
against the active record:

```ts
const withEditor = Data.wiring(
  { ...Site.sources(AppSite, App.owner, App.model.route), editor },
  {
    policy: (model: Model) =>
      AppRoute.match(model.route, { Home: () => timeline, Profile: () => profile }),
    policies: { editor: RemotePolicy.networkOnly, Profile: RemotePolicy.cacheFirst },
  },
)
```

See `examples/chirp/src/app.ts` and `examples/chirp/test/site.test.ts` for this
wiring tested per route.

## Preloading links on hover or focus

Pass `preload` to `Site.routing` with `pointedLinks()` from
`foldkit-primitives/dom` to warm a destination route before the user clicks:

```ts sketch
import { pointedLinks } from 'foldkit-primitives/dom'

const Routing = Site.routing<Model, Message, AppRoute, RemoteClient>({
  // ...site, route, parse, tags, and completed as above
  preload: {
    links: pointedLinks(),
    intended: Message.PointedAtLink, // PointedAtLink: { url: Url }
    read: there => Data.preload(there, actives),
  },
})
```

`pointedLinks()` emits same-origin links when a pointer or keyboard focus rests
on them for 50 ms (`pointedLinks({ rest: '100 millis' })` adjusts the delay),
or immediately on touchstart. Links with `data-preload="none"` are skipped.
`Site.routing` ignores the current route and external addresses, passes `read`
the target `Model` with `route` set, and `Data.preload` writes fetched rows
into `Remote` without updating `model.route`.

To also preload links currently visible in the viewport, merge
`visibleLinks({ atMost: 8 })` (skipped automatically under Save-Data, 2g, or
hidden tabs):

```ts sketch
links: Stream.merge(pointedLinks(), visibleLinks({ atMost: 8 })),
```

## Code-splitting routes

Combine `Bundle.lazy` (from `foldkit-bundle`) with `Site.placement` so a
route's `update` and `view` live in a separate bundler chunk while its `Model`,
`Message`s, and `init` stay in the boot bundle:

```ts sketch
import { Site, fetchCode } from 'foldkit-site'

const Account = Bundle.lazy(
  { name: 'Account', Model: AccountModel, Message: AccountMessage, init },
  () => import('./account.body.js').then(chunk => chunk.body),
)
const AccountPage = Site.placement(AccountNode, Account, {
  link: Link.field<Model>()('account', Link.wrapper(Message.GotAccountMessage)),
  changed: () => AccountMessage.Arrived(),
})
const Routing = Site.routing<Model, Message, AppRoute, RemoteClient>({
  // ...site, route, parse, tags, and completed as above
  pages: [AccountPage],
  preload: { links: pointedLinks(), intended: Message.PointedAtLink, read, code: fetchCode },
})
// Pass `lazy: model => Routing.codeFor(model.route)` to SSR.entry and SSR.hydrate.
```

Each lazy route chunk loads once on whichever happens first:

1. **Link hover or focus:** `preload`'s `code: fetchCode` loads
   `Routing.codeFor(there)`.
2. **Server render:** `SSR.entry`'s `lazy` loads `Routing.codeFor(model.route)`.
3. **Hydration:** `SSR.hydrate`'s `lazy` loads the chunks for the resumed Model.
4. **In-app navigation:** `Bundle.lazy` loads the chunk when `changed` runs.
5. **Client-only start:** `init: () => Routing.boot(model)` dispatches route
   arrival to load the starting route's chunk.

Lazy placements require a `changed` handler so arriving via Back or keyboard
shortcuts still triggers chunk loading. See `examples/auth`'s `/account` route
for bundle-size measurements and chunking configuration.

## Limits

- **Single-screen apps:** A one-route app needs only a Foldkit Router, not a
  route tree.
- **Bundles with OutMessages:** Use `Bundle.at` and `Link.child` directly;
  `Site.placement` covers parent-wrapped Bundles without `onOut`.
- **Cross-node history rules:** `history` inspects transitions within one node;
  moves between distinct nodes always push a history step.
- **Layout-level Surfaces:** Attach Surfaces to individual route nodes;
  Surfaces spanning multiple route tags are not supported.
- **Locales and themes:** Model locales as route params when needed; keep UI
  themes as user preferences outside the route tree.

## Next

- See how Sites build on Foldkit Routers: [Site and Foldkit's Router](../../docs/site-and-router.md)
- Walk through navigation, prefetching, and SSR step by step: [Creating a site](../../docs/site.md)
- Connect a Site to Remote and SSR end to end: [Site, Remote and SSR together](../../docs/site-remote-ssr.md)
