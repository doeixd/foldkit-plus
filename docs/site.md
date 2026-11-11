# Creating a site with `foldkit-site`

`foldkit-site` is the deployed route topology of a Foldkit application:
which locations exist, how they nest, what each is called, and what it
activates — as data that compiles down to the primitives the runtime already
runs. This guide builds a site end to end: nodes, navigation, data fetching
without waterfalls, prefetching, server rendering, and SEO.

The package README is the onboarding reference; this guide is the path
from it to a working application.

## The one rule

```text
Site        "What location are we at, and what is around it?"
Surface     "What may this location observe, and which Messages may it cause?"
Remote      "What server facts do those observations require?"
```

A Site owns no Model, runs no Effects, dispatches no Messages, and fetches
nothing. If a feature would need the Site to become another store, async
runtime, or cache, it does not belong here. Everything below lowers into the
Foldkit Router (URL semantics), `Surface.when` (activation), Bundle
placements (stateful pages), and Remote/SSR (data and rendering).

## 60 seconds: two nodes and a link

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

const Home = Site.route(homeRouter, AppRoute.Home, { title: () => 'Routing' })
const People = Site.route(peopleRouter, AppRoute.People)
const Person = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
})

const AppSite = Site.make(Home, Site.mount(People, [Person]))
```

`Site.route` takes an existing full Foldkit Router — `literal`, `slash`,
`query`, `mapTo`, all of it — and the route case it builds. The router stays
the whole URL story; the Site adds hierarchy, metadata, and inspection
without re-parsing anything. `Site.make` freezes the topology and refuses
two nodes sharing a tag or one node mounted twice, since both would make
chain inspection ambiguous.

One declaration builds the value and the address together, so a link can
never point where the parser would not go:

```ts
const target = Site.target(Person, { personId: 3 })
target.route // AppRoute.Person({ personId: 3 })
target.url // '/people/3'

Site.chainOf(AppSite, target.route) // [People, Person]
Site.titleOf(AppSite, target.route) // 'Person 3 | Routing'
Site.sectionOf(AppSite, target.route) // 'People'
```

A built URL parses back to the target's route (there is a test proving the
round trip). Navigation renders from the tree instead of keeping parallel
tables: sections in tree order, hrefs from `Site.landing`, titles from
`Site.titleOf`, the current section by comparing tags.

## Building nodes: options or builder

The options bag above covers the common case. To annotate in steps, or to
share an annotation bundle across nodes, build incrementally — the options
are sugar over this builder, one implementation:

<!-- docs-check standalone use site-routes
import { Site } from 'foldkit-site'
-->

```ts
const Person = Site.node(personRouter, AppRoute.Person)
  .title(({ personId }) => `Person ${personId} | Routing`)
  .section('People')
  .node
```

Methods — not pipeable fragments — because each stage of a pipe is a
separate generic call and cannot infer the route, while a method already
knows its node's. Named bundles compose through `.pipe` (or free `pipe`)
with no annotation:

```ts
import { type NodeBuilder } from 'foldkit-site'

const inPeopleSection = <R extends { readonly _tag: string }>(b: NodeBuilder<R>) =>
  b.section('People').shortcut(['G', 'P'])

const People = Site.node(peopleRouter, AppRoute.People).pipe(inPeopleSection).node
```

Read `.node` at any stage: every step freezes, so intermediates are usable
nodes too (targets, hrefs), never drafts. The full annotation set is
`title`, `section`, `landing` (the section's nav address, as this node's
params), `shortcut` (the keys that go to its landing; `Site.shortcuts` binds them), `history` (below),
`surface` (below), `layout`, and `view` (below).

Two deliberate absences, both load-bearing. The tag always derives from the
route case — no custom names — because one route case is one node, which is
what keeps chain inspection unambiguous. And there is no `SitePlan` object,
no `Site.prefetch`, no `prepare`: preparation stays caller-composed, as the
data-fetching sections show.

## History, once

Which moves add a history step and which replace the current one is declared
once per node. To another node — or from an unknown location, so Back can
still return to it — is always a step. Within a node, its `history` rule: a
string, or a function for nodes where some param changes are entries of
their own and others are views of one entry:

```ts
const PersonNode = Site.route(personRouter, AppRoute.Person, {
  // Another person is another entry (a step); the default within a node is a replace.
  history: (prev, next) => (prev.personId === next.personId ? 'replace' : 'push'),
})

const onePersonTarget = Site.target(PersonNode, { personId: 1 })
const anotherPersonTarget = Site.target(PersonNode, { personId: 2 })
const samePersonTarget = Site.target(PersonNode, { personId: 1 })

Site.historyOf(onePersonTarget, anotherPersonTarget) // 'push'
Site.historyOf(onePersonTarget, samePersonTarget) // 'replace'
```

This unifies the mirror's per-key spelling with the routed code that used to
spell the same rule by hand. Mirrors keep their per-key spelling for plain
fields (a search, a tab); routed params that ask an owner for something are
intents (below), not mirrors — a mirror installs fields but cannot run a
transition.

## Attaching data: Surfaces

A node names the Surface its route activates, with the route's params made
into its own:

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

`Site.sources(site, App.owner, App.model.route)` is each surfaced node as
its `Surface.when`, keyed by tag, for `Data.wiring`, `Data.subscriptions`,
`Data.satisfy`, or an SSR plan's `surfaces`. Each entry answers its own tag
only: on a person page the person Surface is active and the people Surface
is not. A surface from another application is refused here, not at its
reads. `Site.sourcesFor(site, owner, place, target.route)` is the same
entries for the target's chain only — the route-level Sources prefetch and
SSR read.

## The lifecycle wiring: stop hand-writing two branches

`Site.routing` is the application's link-click and URL-change lifecycle as
one wiring:

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

A click on a link the tree holds navigates — pushing or replacing per
`Site.historyOf`, computed from the current route, so entries stay entries.
Any other link loads, on this origin or not (`Site.routeAt`): another
application serves it. A URL change sets the route field, or returns the
same Model when the address parses to the route already shown, so an echo of
the application's own write never re-renders or clears pending state. The
wiring claims the click tag and shares the change tag with URL mirrors,
which read their slices first. `pages` are routed placements (next section),
informed through their own Messages when their route arrives, and
`arrived: (model, route) => ({ model, commands })` is what the application
does after them for a new route (moving focus), never for an echo.

## Stateful pages: one placement

`Site.placement` states one routed page once — its link, what starts it,
and what its route arrival tells it — so the fold and the drawing never
restate the field, the wrapper, or the slot:

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

`placed.update` folds the child's Messages and `placed.view` draws it.
`changed` receives the node's own case value when its route arrives and
returns the child's Message — or nothing when the arrival needs no answer.
Bundles with OutMessages, and children that are not Bundles, stay on
`Bundle.at` and `Link.child` directly.

## Nested rendering without an Outlet

`Site.view(site, route, model, h)` draws the route: the deepest node's view,
wrapped by every ancestor's layout root-first. Ancestors contribute layouts
only — never their views:

```ts sketch
const Section = Site.route(sectionRouter, AppRoute.Section, {
  layout: {
    render: (child, model, h) => h.div([], [sidebar(model, h), child]),
  },
  view: {
    render: (model, h) => h.ul([], [...]),
  },
})
```

A layout receives its composed child explicitly: no Outlet, no context
provider, no hidden route state, no child router. Unknown tags and viewless
leaves fail loudly instead of guessing. What is deliberately deferred:
per-node child models, route-local subscriptions/effects, and layout-spanning
Surfaces — flat routes plus section tags scaled further than assumed, so the
tree grows those when a real nested layout demands them, not before.

## Data fetching: declare, then plan

There are no loaders. A page's Surface declares what it reads; Remote plans
what the store does not satisfy and fetches it. The application never
fetches in step with navigation — navigating only changes the route, and the
reads start and stop as a consequence, through `Data.subscriptions` over the
site's Sources:

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

While the route is elsewhere, the Surface is inactive and its requirements
disappear — including the retention root. This is tested end to end: URL →
route → Model → Surface → requirements → navigate away → requirements gone.

### Preparing a destination: prefetch and preload are one composition

A target's route in a Model, `Site.sourcesFor` for its chain, `Data.satisfy`
to fill them. This is the whole prefetch story — hover prefetch and
programmatic preload share it, since the framework owns the topology half
and the caller owns the one-line preparation:

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

Only the destination's query runs, once; the page navigation will then draw
reads synchronously, already `Ready`. That is the shape for a render with no
Model yet (SSR, a test). In a running application, the same composition is a
Command, `Data.preload(there, active)`: its reads land as one `Preloaded`
Message in the Model as it is by then, rather than as a Model that would undo
what happened while they were out. Satisfying over every Source would fetch
no more — off-chain Surfaces resolve to nothing under the target Model either
way — so the subset is precision and inspection, not a different fetch.

For links, `Site.routing`'s `preload` runs it on intent: `links:
pointedLinks()` says which same-origin link the reader means to follow (a
hover or focus resting 50 ms, a finger at once), the routing sends the
application's `intended` Message, skips an address the tree does not hold and
the route shown, and hands `read` the Model with the route set. The CMS site
does this for every link on its own origin (`examples/cms/src/apps/siteApp.ts`).
A programmatic call before an expected navigation stays the application's.
No loader cache, no preload lane, no second protocol.

### Why there are no waterfalls

Three facts compose into it:

1. **Requirements are declarative, not scheduled.** What a destination
   needs is derived from its Surfaces' projections, not executed from its
   route handlers. Sibling sources plan together and Remote fetches them
   concurrently and coalesced — route nesting never serializes fetching.
2. **Dependence costs passes, not waterfalls.** When one read reveals the
   next (a page naming its cards, a Document naming its Blocks),
   `Data.satisfy` runs its bounded fixed-point: each pass fetches a level
   concurrently, and instances the parent reveals are read in a later pass.
   Only genuine data dependence serializes, and only by level.
3. **Navigation never awaits data.** The route is set synchronously; reads
   follow through subscriptions. There is no "run all loaders, then render"
   gate, so there is nothing to waterfall behind — at the cost the pending-UI
   convention answers: `Initial` and `Loading` mean unknown, a busy line
   carries `aria-busy` and appears only once the wait is noticeable
   (`Utilities.busyReveal`), its space held from the start.

A write that moves a list's membership costs one round trip too: the
request names the first page of each active list its prediction moves
(archiving out of a full list, a row the client cannot place), and the answer
carries those pages beside the rows, written in the reduction that releases
the layer, so the list reads `Ready` throughout (#386; Remote's README,
"Which lists a write moves"). A list the server does not answer is fetched
again, as before. `examples/chirp/test/requests.test.ts` counts the requests
a write costs.

## Intents that wait for their owner

Some addresses ask something of a child that has no Model yet: a selection
for a Builder whose page has not loaded, a preview asked for during the
editor's load. The ask waits in the Model; a `follow` step applies it once
the owner is ready, through the owner's own Messages, then lets it go so the
address follows the owner again:

```ts sketch
const follow = followPending(EditorSlot, {
  pending: model => model.linked,
  release: model => ({ ...model, linked: Option.none() }),
  ready: (_child, model) => PageEditor.status(model) !== 'Loading',
  toMessages: (linked, _child, model) => [/* the ask in the owner's Messages */],
  send: (model, message) => Option.some(stepped(model, Message.GotEditorMessage({ message }))),
})
```

Apply the step outside whatever installs a loaded value (so the owner looks
ready when read), and keep the pending ask where the address Subscription
can rewrite it while it waits — or a reload during the load loses it. There
is deliberately no `target.intents` carrier: URL↔intent mapping is
app-shaped, and a carrier nothing reads would be dead API.

## Server rendering a route

The server does what prefetch does, then renders. URL → route → target
Model → `sourcesFor` → `satisfy` → an SSR plan over those Sources with
Remote's resume part → covered inspection → rendered page carrying the
destination's data:

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

`SSR.inspect` proves the plan covers what the browser's Surfaces will read;
the envelope carries exactly what the resolved Surfaces required — a page
resumes with its data present and asks the server for none of it. Static
generation is the same preparation under the `staticSite` build plugin, with
sitemap and robots derived from the generated pages. The browser takeover
(`when` / `otherwise` / freshness) stays proved in `foldkit-ssr`.

## SEO today

- **Titles** come from the tree: `Site.titleOf(site, route)`, wired into the
  document the view returns (`{ title: routeTitle(model.route), body: ... }`).
  One annotation, derived everywhere — nav, breadcrumbs, titles.
- **Crawlable HTML** comes from SSR or static generation above: fully
  rendered pages with the data in them, plus sitemap and robots from the
  static plugin.
- **Rich head metadata** (per-page descriptions, images, article dates,
  JSON-LD) is a node's `meta`, a function of its route and the Model, and
  `indexed: false` marks a node and those below it `noindex`.
  `Site.metaOf(site, route, model)` merges the chain into SSR's own `Meta`,
  so it is an SSR plan's `meta` as it stands; there is no second meta
  system. The template's canonical/`og:url` tags are still filled from the
  `Document` the view returns.

## Comparison: TanStack Start

The other side, from its docs ([preloading](https://tanstack.com/router/latest/docs/guide/preloading),
[SEO](https://tanstack.com/start/latest/docs/framework/react/guide/seo),
[data loading](https://tanstack.com/router/latest/docs/guide/data-loading)):

| Concern | TanStack Start | `foldkit-site` + Plus |
| --- | --- | --- |
| Route declaration | File-based routes; route tree by convention, with per-route code splitting | Explicit tree over existing Foldkit Routers; no file convention, no codegen — and no per-route code splitting (a document is the split boundary today) |
| Data fetching | `loader` per route, run in parallel before render; `beforeLoad` for context; router cache + Query below | No loaders: Surfaces declare reads, Remote plans and coalesces; the store + retention are the cache, policies are per-domain |
| Waterfalls | Parallel loaders per depth; deferred data for the rest | No loader gate at all; `satisfy` fixed-point per data-dependence level; pending UI by convention |
| Prefetch | Built in: intent/viewport/render strategies, freshness/retention windows, `preloadRoute` | Same composition as navigation (`sourcesFor` + `satisfy`), trigger app-owned; no windows or lanes — Remote policy + retention decide |
| Guards | `beforeLoad` redirects; server functions enforce | Route access would be presentation policy only (unbuilt); authority stays at `RemoteServer`/audience — the split is explicit, not layered |
| Head/SEO | Per-route `head()` meta; SSR + streaming; prerender crawls links | Titles and head metadata (`Site.metaOf`) from the tree; SSR/static HTML + sitemap |
| Mutations + refresh | Router invalidation reruns loaders | Entity/connection patches apply directly; a list whose membership changed comes back in the write's answer (single flight) |
| Server boundary | Server functions alongside routes | Separate by design: documents → SSR, semantic data → `RemoteServer`, HTTP → Effect HttpApi — the Site never becomes an HTTP router |

The deepest difference is not a feature list. TanStack owns the runtime:
its router schedules, caches, preloads, and renders. Foldkit Plus refuses
the second runtime: the Site is pure topology, and every behavior above is
some other package's primitive composed by the caller. That buys one
transition per feature (UI, agent, and Sync meet at the same `update`) and
costs the conveniences a runtime provides — per-route code splitting,
preload lanes, loader caches — which arrive here only as compositions with
proven demand, never as framework.

## Limits: when not to build on Site

- A single-screen application has one node; the tree buys nothing.
- Locales are route params when they arrive; themes are preferences, not
  routes. Neither is built.
- A tree is one document: an address it does not hold is a full load, and
  a generated page of the same application is navigated to, drawn from what
  the browser holds. That is measured, not assumed: a Navigate Command was
  1.3 to 4 times faster than the page's full load, and 3 to 6 after a hover
  (`docs/benchmarks.md`).
- No layout-spanning Surfaces, no per-node child models or route-local
  subscriptions — deliberately, until a real nested layout demands them.
- Status caveat: the in-repo proof is tests plus the routing example
  (Remote-free). Prefetch/SSR *adoption* in a Remote-backed app is the open
  slice; the framework halves are proved and waiting.

## Where to read next

- [`foldkit-site` README](../packages/site/README.md) — API reference.
- [Site and Foldkit's Router](./site-and-router.md) — what the Site adds to
  the Router, and how it works.
- [Site, Remote and SSR together](./site-remote-ssr.md) — one application
  built with all three, every snippet compiled and run.
- [Routing example](../examples/foldkit/routing) — the third cut on Site
  placements and routing, the only app consumer so far.
- [Server-derived state](./remote.md) — Remote's ownership and policies.
- [Agent contract](./agents.md) — the same Model/Message seam agents use.
