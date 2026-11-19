# Creating a site with `foldkit-site`

As a Foldkit app grows past one screen, URLs, page titles, navigation sections,
breadcrumbs, route prefetching, and server rendering often scatter across
separate files. Renaming one path forces edits in four places, and a missed
update turns a link into a 404 or fetches data for the wrong screen.

`foldkit-site` puts your route topology in one typed tree built over Foldkit's
Router. Each node pairs a URL parser and route variant with its title, section,
history rule, layout, and data `Surface`. This guide walks through building a
site end to end: routes, navigation, zero-waterfall data fetching, prefetching,
server rendering, and SEO.

See a routed app running in
[`examples/foldkit/routing`](../examples/foldkit/routing), or follow
[Site, Remote and SSR together](./site-remote-ssr.md) to run data-backed SSR.

## How Site, Surface, and Remote divide the work

Every routed screen answers three questions, each owned by one package:

- **Site (`foldkit-site`):** Where are we in the route tree, what metadata does
  this location have, and which child locations surround it?
- **Surface (`foldkit-surface`):** What may this active location observe in the
  `Model`, and which `Message`s may it send?
- **Remote (`foldkit-remote`):** Which server reads do those active Surfaces
  require?
- **Your app (`Model` and `update`):** Application state, Effects, and state
  transitions.

Everything below compiles down to Foldkit's Router (URL parsing and
formatting), `Surface.when` (activation), Bundle placements (stateful pages),
and Remote or SSR (data and rendering).

## Two nodes and a link

This builds a three-route tree (`Home`, `People`, and `Person`), creates a
typed target for person `3`, and inspects its URL, ancestor chain, title, and
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

const Home = Site.route(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home, { title: () => 'Routing' })
const People = Site.route(pipe(literal('people'), mapTo(AppRoute.People)), AppRoute.People)
const Person = Site.route(
  pipe(literal('people'), slash(int('personId')), mapTo(AppRoute.Person)),
  AppRoute.Person,
  { title: ({ personId }) => `Person ${personId} | Routing`, section: 'People' },
)

const AppSite = Site.make(Home, Site.mount(People, [Person]))
const target = Site.target(Person, { personId: 3 })
```

Evaluating `target` and the tree helpers gives:

- `target.route` -> `AppRoute.Person({ personId: 3 })`
- `target.url` -> `'/people/3'`
- `Site.chainOf(AppSite, target.route)` -> `[People, Person]`
- `Site.titleOf(AppSite, target.route)` -> `'Person 3 | Routing'`
- `Site.sectionOf(AppSite, target.route)` -> `'People'`

`Site.route` wraps an existing Foldkit Router (`literal`, `slash`, `query`,
`mapTo`) and attaches hierarchy and metadata without re-parsing URLs.
`Site.make` freezes the topology and rejects duplicate route tags or nodes
mounted twice so chain inspection stays unambiguous. Every built URL parses back
to its target's route, and navigation menus read sections, `Site.landing` hrefs,
and `Site.titleOf` directly from the tree instead of parallel tables.

## Building nodes: options or builder

The options object above handles most routes. To annotate in steps or share an
annotation bundle across nodes, use the `Site.node` builder (the options
object builds on the same implementation):

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

Methods infer the route type across steps, and reusable bundles compose through
`.pipe` (or `pipe`) without type annotations:

```ts
import { type NodeBuilder } from 'foldkit-site'

const inPeopleSection = <R extends { readonly _tag: string }>(b: NodeBuilder<R>) =>
  b.section('People').shortcut(['G', 'P'])

const People = Site.node(peopleRouter, AppRoute.People).pipe(inPeopleSection).node
```

Read `.node` at any stage: every step returns a frozen, usable node. The full
annotation set is `title`, `section`, `landing` (the section's nav target
params), `shortcut` (keys bound by `Site.shortcuts`), `history`, `surface`,
`layout`, and `view`.

Node tags always derive from the route case so every route case maps to one
node. Prefetching and server rendering stay caller-composed rather than wrapped
in a separate site plan object.

## History, once

Declare which moves add a browser history step and which replace the current
entry once per node. Moving to another node — or from an unknown URL so Back
returns there — always pushes. Within one node, configure `history` as `'push'`,
`'replace'`, or a comparison function:

```ts
const PersonNode = Site.route(personRouter, AppRoute.Person, {
  // Moving to another person pushes; changing sub-view params replaces.
  history: (prev, next) => (prev.personId === next.personId ? 'replace' : 'push'),
})

const onePersonTarget = Site.target(PersonNode, { personId: 1 })
const anotherPersonTarget = Site.target(PersonNode, { personId: 2 })
const samePersonTarget = Site.target(PersonNode, { personId: 1 })

Site.historyOf(onePersonTarget, anotherPersonTarget) // 'push'
Site.historyOf(onePersonTarget, samePersonTarget) // 'replace'
```

Use `foldkit-mirror` per-key URL mirrors for plain fields like filters or tabs,
and routed params for transitions handled by `update`.

## Attaching data: Surfaces

A node declares which `Surface` its route activates and maps route params into
Surface params:

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

`Site.sources(site, App.owner, App.model.route)` returns a keyed record of
`Surface.when` sources for `Data.wiring`, `Data.subscriptions`,
`Data.satisfy`, or an SSR plan's `surfaces` (refusing Surfaces from another
application). On a `Person` route, only `Person`'s Surface is active.
`Site.sourcesFor(site, owner, place, target.route)` returns the sources for
`target.route`'s chain alone for prefetching and SSR.

## Link clicks and URL changes

`Site.routing` wires link clicks and URL changes once for the whole tree:

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
const PeopleNode = Site.route(peopleRouter, AppRoute.People)
const Person = Site.route(personRouter, AppRoute.Person)
const AppSite = Site.make(Home, Site.mount(PeopleNode, [Person]))

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
<!-- docs-check
const PeoplePage = Site.placement(PeopleNode, PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => PeopleMessage.ChangedRoute({ route }),
})
const pages = [PeoplePage]
-->

```ts
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
  pages: [PeoplePage],
})

const assembly = Bundle.assemble<Model, Message>()([Routing, ...pages.map(page => page.placed)])
const update = assembly.update((model, message) =>
  Routing.reduces(message) ? { model } : updateOwn(model, message),
)
```

Clicking a link inside the tree pushes or replaces via `Site.historyOf`; links
outside the tree (`Site.routeAt`) perform full document loads. On URL changes,
`Routing` updates the route field (returning the Model unchanged on echoes),
notifies matched `pages`, and runs `arrived(model, route)` for post-navigation
effects such as moving focus. `Routing.reduces(message)` keeps click and
URL-change tags out of `updateOwn` while still letting URL mirrors read their
slices first.

## Stateful pages: one placement

`Site.placement` binds a `foldkit-bundle` page to its node, parent Model field,
wrapper Message, init args, and arrival Message:

<!-- docs-check standalone use site-people -->

```ts
const PeoplePage = Site.placement(PeopleNode, PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => PeopleMessage.ChangedRoute({ route }),
})
```

`PeoplePage.placed.update` folds the child's Messages,
`PeoplePage.placed.view` renders it, and `changed` sends the child Message when
its route arrives. For Bundles with OutMessages or non-Bundle submodels, use
`Bundle.at` and `Link.child` directly.

## Nested rendering without an Outlet

`Site.view(site, route, model, h)` draws the deepest node's `view`, wrapped
root-first by every ancestor's `layout`:

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

Each `layout` receives its composed `child` directly without outlets, context
providers, or nested routers. Ancestors contribute `layout` only, and unknown
tags or viewless leaves fail loudly.

## Data fetching: declare, then plan

Routes declare no loader callbacks. A page's Surface declares what it reads,
and Remote fetches only what the store lacks when `model.route` changes:

<!-- docs-check standalone
import { Effect, Schema, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query, Remote } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import { SSR } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'

const Project = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const ProjectSummary = Entity.select(Project, { id: true, name: true })
const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.name)),
  ),
)
const AppRoute = defineRouteUnion({ Home: {}, Owner: { ownerId: Schema.String } })
const homeRouter = pipe(root, mapTo(AppRoute.Home))
const ownerRouter = pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner))
const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ ...Remote.messages }),
  initial: { route: AppRoute.Home(), remote: Remote.initial },
  update: (model: Model) => ({ model }),
})
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})
-->

```ts
const OwnerPage = App.surface('OwnerPage', {
  params: { ownerId: Schema.String },
  model: ({ params }) => ({
    projects: Data.query(
      ProjectsByOwner,
      { ownerId: params.ownerId },
      { select: ProjectSummary, first: 10 },
    ),
  }),
})
```

When `model.route` leaves `Owner`, `OwnerPage` becomes inactive and its
retention requirements drop automatically.

### Preparing a destination: prefetch and preload are one composition

To warm a route ahead of navigation (or before SSR rendering), construct a
hypothetical Model with `target.route`, collect its chain's active sources with
`Site.sourcesFor`, and call `Data.satisfy`:

<!-- docs-check
const OwnerNode = Site.node(ownerRouter, AppRoute.Owner).surface({
  surface: OwnerPage,
  params: route => ({ ownerId: route.ownerId }),
}).node
const AppSite = Site.make(Site.route(homeRouter, AppRoute.Home), OwnerNode)
declare const model: Model
-->

```ts
const prepare = Effect.gen(function* () {
  const target = Site.target(OwnerNode, { ownerId: 'u1' })
  const there = { ...model, route: target.route }
  const active = Site.sourcesFor(AppSite, App.owner, App.model.route, target.route)
  return yield* Data.satisfy(there, active)
})
```

On the server, `Data.satisfy` prepares the Model before a synchronous render.
In the browser, `Data.preload(there, active)` runs as a Command and merges
fetched rows into the current Model via a `Preloaded` Message. Wire
`Site.routing`'s `preload` option with `pointedLinks()` from
`foldkit-primitives/dom` to preload same-origin links on hover or focus
(`examples/cms/src/apps/siteApp.ts`).

### Why there are no waterfalls

Three design choices eliminate route waterfalls:

1. **Declarative requirements:** Sibling Surfaces plan together and Remote
   batches and deduplicates concurrent reads rather than running sequential
   route handlers.
2. **Bounded fixed-point passes:** When a parent read reveals child IDs (like a
   document revealing its blocks), `Data.satisfy` fetches each dependency level
   concurrently in one pass.
3. **Synchronous navigation:** Setting `model.route` transitions immediately
   without awaiting loaders; `Initial` and `Loading` states render inline with
   `aria-busy` and reserved layout space (`Utilities.busyReveal`).

Mutations that move items between lists name the affected active list pages on
the write so the server returns updated pages in the same round trip (see
`foldkit-remote`'s README and `examples/chirp/test/requests.test.ts`).

## Intents that wait for their owner

When a URL asks for an action on a lazy child whose Model has not loaded yet
(such as selecting a block while the page loads), hold the pending request in
the Model and apply it with `followPending` once the child becomes ready:

```ts sketch
const follow = followPending(EditorSlot, {
  pending: model => model.linked,
  release: model => ({ ...model, linked: Option.none() }),
  ready: (_child, model) => PageEditor.status(model) !== 'Loading',
  toMessages: (linked, _child, model) => [/* owner's Messages */],
  send: (model, message) => Option.some(stepped(model, Message.GotEditorMessage({ message }))),
})
```

Apply `follow` outside the installer that loads the child, and keep the pending
field in URL-synced state so reloads preserve the intent until it runs.

## Server rendering a route

On the server, `SSR.plan` selects the route and active `Site.sources`, pairs
them with `Remote.resume(Data)`, and renders HTML carrying the data so the
browser resumes without re-fetching:

<!-- docs-check
const config = {
  Model,
  init: () => ({ model: App.initial }),
  update: (model: Model) => ({ model }),
  view: (_model: Model, h: HtmlBuilder<never>) => h.p([], []),
  container: null,
}
const active = Site.sources(AppSite, App.owner, App.model.route)
declare const template: string
-->

```ts
const plan = SSR.plan(App, {
  id: 'owner',
  state: Projection.pick(App.model.route),
  surfaces: Object.values(active),
  parts: [Remote.resume(Data)],
})

const render = Effect.gen(function* () {
  const rendered = yield* SSR.render(config, plan, { buildId: 'b' })
  return SSR.page(template, rendered)
})
```

`SSR.inspect` verifies that the plan covers every active Surface before serving,
and `staticSite` builds static HTML pages, sitemaps, and `robots.txt` at build
time.

## SEO and head metadata

- **Titles:** Read `Site.titleOf(site, route)` for your document `{ title, body }`,
  navigation bars, and breadcrumbs from one source.
- **Crawlable HTML:** Server rendering and `staticSite` emit populated HTML
  alongside generated sitemaps and `robots.txt`.
- **Rich head tags:** Define `meta: ({ route, model }) => Meta` and `indexed: false`
  on nodes, then pass `Site.metaOf(site, route, model)` to your SSR plan's
  `meta` option for `description`, Open Graph, `twitter:*`, `noindex`, and
  JSON-LD tags.

## Comparison: TanStack Start

| Concern | TanStack Start | `foldkit-site` + Plus |
| --- | --- | --- |
| Route declaration | File-based routes with per-route code splitting | Explicit tree over Foldkit Routers |
| Data fetching | Parallel `loader` per route + router cache | Surfaces declare reads; Remote plans and caches |
| Waterfalls | Parallel loaders; deferred promises for child data | Bounded fixed-point passes; non-blocking UI |
| Prefetch | Built-in strategies, freshness windows, `preloadRoute` | `sourcesFor` + `Data.satisfy`; Remote sets policy |
| Guards | `beforeLoad` redirects; server functions enforce | Presentation `access`; server enforces via `Guard` |
| Head and SEO | Per-route `head()` meta; SSR and crawler | `Site.metaOf` from the tree; SSR + sitemap |
| Mutations | Router invalidation reruns loaders | Direct patches + single-flight list updates |
| Server boundary | Server functions alongside routes | Split: SSR for HTML, `RemoteServer` for data |

TanStack owns the runtime (scheduling, caching, preloading, and rendering).
Foldkit Plus keeps `foldkit-site` as pure topology so UI, server sync, and AI
agents share one `Model` and `update` transition.

## Limits: when not to build on Site

- **Single-screen apps:** A single route needs only a Foldkit Router.
- **Preferences and locales:** Keep themes outside the route tree; model
  locales as route parameters when needed.
- **Cross-document links:** Addresses outside the tree trigger full page loads.
  In repo benchmarks (`docs/benchmarks.md`), in-tree `Navigate` commands ran 1.3
  to 4 times faster than full loads (and 3 to 6 times faster after hover
  preload).
- **Per-node submodels and layout Surfaces:** Use `Site.placement` for routed
  pages and attach Surfaces to individual route nodes rather than layout
  wrappers.

## Next

- See the API and routing workflows: [`foldkit-site` README](../packages/site/README.md)
- Separate URL parsing from tree topology: [Site and Foldkit's Router](./site-and-router.md)
- Run a complete SSR, Remote, and Site app: [Site, Remote and SSR together](./site-remote-ssr.md)
