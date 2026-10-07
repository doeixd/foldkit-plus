# `foldkit-site`

The deployed route topology of a Foldkit application: which locations exist,
how they nest, what each is called, and what it activates — as data that
compiles down to the primitives the runtime already runs.

## What this package is

Every application with more than one screen answers the same questions: what
places exist, which place are we on, how do places link to each other, and
what does each place show. Foldkit's Router already answers the URL half with
bidirectional parsers. `foldkit-site` answers the structural half: a tree of
stable route nodes over those parsers, with one annotated place for the
metadata (titles, sections, history intent) that applications otherwise
recompute in four parallel tables.

## When it owns the problem

`foldkit-site` owns **where the application is**, and nothing else:

```text
Site        "What location are we at, and what is around it?"
Surface     "What may this location observe, and which Messages may it cause?"
Remote      "What server facts do those observations require?"
```

It owns no Model, runs no Effects, dispatches no Messages, and fetches
nothing. A node lowers to an ordinary Foldkit Router (which it is built
from), an ordinary `Surface.when` (through `Site.sources`), and — in a later
cut — an ordinary Bundle placement. If a feature would need the Site to
become another store, async runtime, or cache, it does not belong here.

## The mental model

```text
Foldkit Router (per node)     URL <-> typed route value
        +
Site tree                       route value -> chain, metadata, Surfaces
        +
Surface / Remote / SSR          the existing consumers of those answers
```

A node is a stable first-class value: mounting it in a tree never mutates
it, so the same node builds targets, hrefs, and inspection wherever it is
mounted. A target is one typed destination — node, route value, and URL from
one declaration — so a link can never point where the parser would not go.

## Install

```sh
pnpm add foldkit-site
```

Peers: `effect`, `foldkit`. `foldkit-surface` is a dependency (for
`Site.sources`).

## 60-second example

```ts
import { Site } from 'foldkit-site'

const Home = Site.route(homeRouter, AppRoute.Home, { title: () => 'Routing' })
const Person = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
})

const AppSite = Site.make(Home, Site.mount(People, []))

// One declaration builds the value and the address together.
const target = Site.target(Person, { personId: 3 })
target.route // AppRoute.Person({ personId: 3 })
target.url // '/people/3'

// And the tree answers structural questions off route values.
Site.chainOf(AppSite, target.route) // [People, Person]
Site.titleOf(AppSite, target.route) // 'Person 3 | Routing'
Site.sectionOf(AppSite, target.route) // 'People'
```

`Site.route` takes an existing full Foldkit Router — `literal`, `slash`,
`query`, `mapTo`, all of it — and the route case it builds. The router stays
the whole URL story; the Site adds hierarchy, metadata, and inspection
without re-parsing anything.

## Core concepts

**Nodes.** `Site.route(router, case, options?)` declares one location. Options
are `title` (a function of the route value), `section`, `history`, and
`surface` (below). The node is frozen; keep the exported value and use it for
targets and hrefs.

**Trees.** `Site.mount(node, children?)` mounts a node under children without
mutating it — children may be bare nodes or mounts. `Site.make(...roots)`
freezes the topology. Two nodes sharing a tag, or one node mounted twice,
throw at `make`: both would make chain inspection ambiguous.

**Targets.** `Site.target(node, params)` is `{ node, route, url }`.
`Site.href(target)` — or `Site.href(node, params)` — is its URL. Because the
URL is built by the node's own router, a round trip holds by construction: a
built URL parses back to the target's route (there is a test proving it).

**Inspection.** `Site.nodeOf(site, route)` and `Site.chainOf(site, route)`
resolve a route value to its node and its root-first chain (`[]` for a tag
the tree does not hold, as an inactive Surface resolves to nothing).
`Site.parentOf`, `Site.ancestorsOf`, `Site.depthOf`, and `Site.nodesOf`
(depth-first, parents before children) cover the rest.

**History.** `Site.historyOf(prev, next)` declares push-vs-replace once: to
another node, a step; within a node, its `history` rule (a string, or a
function for nodes where some param changes are entries of their own, such as
another person, and others are views of one entry, such as another search);
with no previous target, a replace. This unifies the mirror's per-key
spelling with the routed code that used to spell the same rule by hand.

**Attached Surfaces.** A node may name the Surface its route activates:

```ts
const People = Site.route(peopleRouter, AppRoute.People, {
  surface: {
    surface: PeoplePage,
    params: route => ({ searchText: route.searchText }),
  },
})
```

`Site.sources(site, App.owner, App.model.route)` is each surfaced node as its
`Surface.when`, keyed by tag, for `Data.wiring`, `Data.subscriptions`,
`Data.satisfy`, or an SSR plan's `surfaces`. A surface from another
application is refused here. Each entry answers its own tag only: on a
person page the person surface is active and the people surface is not. A
layout surface active for several tags is not yet expressible — that is a
`Surface.whenAny`-shaped extension, deliberately deferred until a real layout
needs it.

## Routed pages

`Site.placement` states one routed page once — its link, what starts it, and
what its route arrival tells it — so the fold and the drawing never restate
the field, the wrapper, or the slot:

```ts
const PeoplePage = Site.placement(People, PeopleBundle, {
  link: Link.field<Model>()('peoplePage', Link.wrapper(Message.GotPeopleMessage)),
  args: parent => ({
    searchText: parent.route._tag === 'People' ? parent.route.searchText : Option.none(),
  }),
  changed: route => People.Message.ChangedRoute({ route }),
})

const assembly = Bundle.assemble([PeoplePage.placed, Routing])
const update = assembly.update((model, message) =>
  Routing.reduces(message) || message._tag === 'GotPeopleMessage' ? { model } : updateOwn(model, message),
)
```

`placed.update` folds the child's Messages (route it in `update` through the
assembly; the wrapper tag never reaches your own branches) and `placed.view`
draws it. `changed` receives the node's own case value when its route
arrives and returns the child's Message — or nothing when the arrival needs
no answer. Pass the pages to `Site.routing` (`pages: [PeoplePage]`) and the
wiring informs each page whose route arrives, after setting the route field.

Without `changed` a page is never informed. Bundles with OutMessages, and
children that are not Bundles, stay on `Bundle.at` and `Link.child` directly.
With service-needing pages, name the services on both calls:
`Site.routing<Model, Message, AppRoute, RemoteClient>`.

## The lifecycle wiring

`Site.routing` is the application's link-click and URL-change lifecycle as
one wiring, so `update` stops hand-writing those two branches:

```ts
import { modifyFields } from 'foldkit/struct'

const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: App.model.route.dependency,
    get: (model) => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
})

const assembly = Bundle.assemble([Routing, ...pages])
const update = assembly.update((model, message) =>
  Routing.reduces(message) ? { model } : updateOwn(model, message),
)
```

A click on an internal link navigates — pushing or replacing per
`Site.historyOf`, computed from the current route, so entries stay entries.
An external link loads. A URL change sets the route field, or returns the
same Model when the address parses to the route already shown, so an echo of
our own write never re-renders or clears pending state. The application's own
update answers nothing for either message; `reduces` names them for its
guard, the way `Remote.reduces` does.

The wiring claims the click tag and shares the change tag with URL mirrors,
which read their slices first. `CompletedNavigation` is one completion for
the navigation commands — declare the variant, pass the constructor. Route
changes reach child pages through their own Messages only once routed
placements land; until then informing them stays hand-written.

## Common workflows

**Navigation rendering.** Derive the nav from the tree instead of keeping
parallel tables: sections from `Site.sectionOf`, hrefs from `Site.href`,
titles from `Site.titleOf`, and the current section by comparing tags.

**Route changes.** On a URL change, resolve the route value once, then
`Site.chainOf` for the active chain and `Site.historyOf` for the history
step — or hand both branches to `Site.routing` (with `pages` for the routed
placements) and keep only the guard in `update`. What each route *does* with
the change beyond informing its page is still the application's `update`.

**Prefetch and SSR.** `Site.target` plus `Site.chainOf` say which Surfaces a
destination will activate; `Data.satisfy` over `Site.sources` prepares the
Model before a synchronous render. Preparation stays caller-composed — there
is no `prepare` in any plan.

## Limits / when not to use it

- A single-screen application has one node; the tree buys nothing.
- Keyboard shortcuts are still hand-written per application.
- Bundles with OutMessages, and children that are not Bundles, stay on
  `Bundle.at` and `Link.child`: `Site.placement` takes neither `onOut` nor a
  non-Bundle child.
- A node's `history` function sees only its own route values; cross-node
  rules more subtle than "another node is a step" do not exist yet.
- Locales are route params like any other when they arrive; themes are
  preferences, not routes.
