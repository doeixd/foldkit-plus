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
recompute in four parallel tables. [Site and Foldkit's Router](../../docs/site-and-router.md)
draws the line between the two and shows how the Site works, and
[Site, Remote and SSR together](../../docs/site-remote-ssr.md) builds a routed
application with its data rendered on the server.

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
`Site.sources`), and `foldkit-ssr` for the `Meta` a node's head returns.

## 60-second example

```ts
import { Site } from 'foldkit-site'

const Home = Site.route(homeRouter, AppRoute.Home, { title: () => 'Routing' })
const Person = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
})

const AppSite = Site.make(Home, Site.mount(People, [Person]))

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
are `title` (a function of the route value), `section`, `landing` (the
section's nav address as this node's params), `shortcut` (the keys that go to
its landing, as Foldkit's key bindings name them: `'/'`, `['G', 'H']`), `history`, `access` (who may be shown it: see Common workflows), and `surface` (below). The node is frozen; keep the
exported value and use it for targets and hrefs. To annotate in steps, or to
share an annotation bundle across nodes, build incrementally instead — the
options are sugar over this builder:

```ts
const Person = Site.node(personRouter, AppRoute.Person)
  .title(({ personId }) => `Person ${personId} | Routing`)
  .section('People')
  .node
```

Methods — not pipeable fragments — because each stage of a pipe is a
separate generic call and could not infer the route. Read `.node` at any
stage: every step freezes, so intermediates are usable nodes too, never
drafts. Named bundles also compose through `.pipe` (Effect-style, one
bundle; chain for more) or free `pipe(builder, bundle)` — the bundle stays
generic over the builder it meets, so it instantiates with no annotation.

**Trees.** `Site.mount(node, children?)` mounts a node under children without
mutating it — children may be bare nodes or mounts. `Site.make(...roots)`
freezes the topology. Two nodes sharing a tag, or one node mounted twice,
throw at `make`: both would make chain inspection ambiguous.

**Targets.** `Site.target(node, params)` is `{ node, route, url }`.
`Site.href(target)` — or `Site.href(node, params)` — is its URL. Because the
URL is built by the node's own router, a round trip holds by construction: a
built URL parses back to the target's route (there is a test proving it).

**Both directions.** A tree's type carries its routes, so the tree is the
one declaration of address to route and back. `Site.parse(site, NotFound)`
is the application's parser: the first node, in tree order (depth-first,
parents first), whose router takes the whole address, or the fallback; put a
node that takes any segment (`/:slug`) after the nodes whose literal it would
take too. `Site.hrefOf(site, route)` builds a route's address with its node's
router, and refuses at compile time a route no node holds.

**One tree, one document.** A tree holds the routes one application draws.
`Site.routeAt(site, url)` is the route a node reads at an address, as
`Site.parse` reads it, or `None` when no node takes it: an address the tree
does not hold is another document's, reached with a full load, not a
Navigate Command that could only draw NotFound.

**Every address.** `Site.targets(site, paths)` lists the site in tree order:
a node whose route has no params once, and a node with params by its
`Site.paths(node, list)`, where `list` is an Effect giving each address's
params and, for a sitemap, when it last changed:

```ts
const list = Site.paths(People, Effect.succeed([{ params: { searchText: Option.none() } }]))
const people = Site.paths(
  Person,
  Effect.succeed([{ params: { personId: 3 }, modified: '2026-10-01' }]),
)
const listed = Site.targets(AppSite, [list, people])
// an Effect of [..., { node: Person, route, url: '/people/3', modified: '2026-10-01' }]
```

A build renders what it lists, a sitemap keeps what `Site.indexedOf` keeps,
and prefetch can warm it. A node with params and no `paths`, `paths` for a
node the tree does not hold, and `paths` given twice are refused, so no page
is left out unsaid; `Site.paths(node, Effect.succeed([]))` lists none. Its
failures and services are those of the lists, typed.

**Inspection.** `Site.nodeOf(site, route)` and `Site.chainOf(site, route)`
resolve a route value to its node and its root-first chain (`[]` for a tag
the tree does not hold, as an inactive Surface resolves to nothing).
`Site.parentOf`, `Site.ancestorsOf`, `Site.depthOf`, and `Site.nodesOf`
(depth-first, parents before children) cover the rest.

**History.** `Site.historyOf(prev, next)` declares push-vs-replace once: to
another node — or from an unknown location, so Back can still return to it — a
step; within a node, its `history` rule (a string, or a function for nodes
where some param changes are entries of their own, such as another person,
and others are views of one entry, such as another search). This unifies the
mirror's per-key spelling with the routed code that used to spell the same
rule by hand.

**Navigation metadata.** Titles and sections read with `Site.titleOf` and
`Site.sectionOf`. `Site.landing(site, section)` is where the section's nav
item points: the first node of the section that declares a landing, as a
target. `Site.shortcuts(site, toMessage)` is the tree's shortcuts as key
bindings for `Dom.streamFromKeyBindings`, each sending the Message
`toMessage` makes of its node's landing target; a shortcut with no landing,
or one used twice, is refused. Annotate once; derive nav, titles, shortcuts,
and breadcrumbs from it.

**Head metadata.** `meta` is what a node says of itself to a search result
and a link preview: a function of its route and the Model, since a post's
excerpt is data, not an address. It returns `foldkit-ssr`'s `Meta`
(description, image, type, article dates, JSON-LD, ...). `indexed: false`
keeps a node, and every node below it that does not say otherwise, out of
search engines. `Site.metaOf(site, route, model)` reads the route's chain
root first, a deeper node's field replacing its ancestor's, the preview
title falling back to the node's `title`, and `noindex` for an unindexed
route whatever its `meta` says. It is an SSR plan's `meta` as it stands:

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

The plan writes it into the generated page and keeps the head in step as the
reader moves; the Site only says what it is. `meta` must read what crosses
to the browser (the route, a resumed read), as any plan's `meta` must.
`Site.indexedOf(site, route)` is the same flag for a sitemap.

## Nested rendering

`Site.view(site, route, model, h)` draws the route: the deepest node's view,
wrapped by every ancestor's layout root-first. Declare them on nodes:

```ts
const Section = Site.route(sectionRouter, AppRoute.Section, {
  layout: {
    render: (child, model, h) => h.div([], [sidebar(model, h), child]),
  },
  view: {
    render: (model, h) => h.ul([], [...]),
  },
})
```

Ancestors contribute layouts only — never their views. A layout receives its
composed child explicitly: no Outlet, no context provider, no hidden route
state, no child router. Unknown tags and viewless leaves fail loudly instead
of guessing.

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
person page the person surface is active and the people surface is not.
`Site.sourcesFor(site, owner, place, target.route)` is the same entries for
the target's chain only — the route-level Sources prefetch and SSR read. A
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

A click on a link the tree holds navigates — pushing or replacing per
`Site.historyOf`, computed from the current route, so entries stay entries.
Any other link loads, on this origin or not (`Site.routeAt`): another
application serves it. A URL change sets the route field, or returns the
same Model when the address parses to the route already shown, so an echo of
our own write never re-renders or clears pending state. The application's own
update answers nothing for either message; `reduces` names them for its
guard, the way `Remote.reduces` does. What a new route does beyond setting
the field is `arrived: (model, route) => ({ model, commands })`, run after the
routed pages are told and never for an echo: the CMS site moves focus to what
it drew there (`examples/cms/src/apps/siteApp.ts`).

The wiring claims the click tag and shares the change tag with URL mirrors,
which read their slices first. `CompletedNavigation` is one completion for
the navigation commands — declare the variant, pass the constructor. Route
changes reach child pages through their own Messages only once routed
placements land; until then informing them stays hand-written.

## Common workflows

**Navigation rendering.** Derive the nav from the tree instead of keeping
parallel tables: sections in tree order, hrefs from `Site.landing`, titles
from `Site.titleOf`, key bindings from `Site.shortcuts`, and the current
section by comparing tags.

**Route changes.** On a URL change, resolve the route value once, then
`Site.chainOf` for the active chain and `Site.historyOf` for the history
step — or hand both branches to `Site.routing` (with `pages` for the routed
placements) and keep only the guard in `update`. What each route *does* with
the change beyond informing its page is still the application's `update`.

**Who may be shown a page.** A route carries no authorization: the server
guards what a page reads, whatever the route says. What a route may decide is
presentation, sending a visitor to sign in rather than drawing an empty
page. `access` on a node says who may be shown it and the nodes below it,
from what the application knows of the reader (its `Me` row), and where
anyone else goes (from `access.test.ts`):

```ts
const Projects = Site.node(pipe(literal('projects'), mapTo(AppRoute.Projects)), AppRoute.Projects)
  .access<Me>({ allow: me => me.signedIn, otherwise: toSignIn })
  .node
```

`Site.accessOf(site, route, who)` decides it, root first: `Allowed`;
`Pending` while `who` is `Option.none()` (the reader's `Me` still loading),
for a loading state rather than a sign-in page flashed at someone signed in;
`Denied` with the URL to go to (`otherwise` gets the address asked for, so a
sign-in page can return to it). Read it with `Access.match`. The view draws
from it, `update` replaces the URL on `Denied` after a route change or when
`Me` arrives, and a server answers `Denied` with a 303 before rendering. An
`otherwise` whose target the same rule covers throws, at any address: a
sign-in page mounted under the rule it serves would otherwise send each
refused reader to a longer `returnTo` for ever. A rule given in a node's
options names the reader it reads (`allow: (me: Me) => …`); `accessOf`
cannot check that its `who` is that reader, so pass the one the rules read.

**Prefetch and SSR.** `Site.target` plus `Site.chainOf` say which Surfaces a
destination will activate; `Site.sourcesFor(site, owner, place, target.route)`
is those as Sources — `Data.satisfy` over them, with the route set to the
target's, prepares the Model before a synchronous render. Preparation stays
caller-composed — there is no `prepare` in any plan.

## Limits / when not to use it

- A single-screen application has one node; the tree buys nothing.
- Bundles with OutMessages, and children that are not Bundles, stay on
  `Bundle.at` and `Link.child`: `Site.placement` takes neither `onOut` nor a
  non-Bundle child.
- A node's `history` function sees only its own route values; cross-node
  rules more subtle than "another node is a step" do not exist yet.
- Locales are route params like any other when they arrive; themes are
  preferences, not routes.
