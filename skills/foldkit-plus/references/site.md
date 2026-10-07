# `foldkit-site`

The deployed route topology: stable route nodes in a hierarchy, typed
targets, and per-node metadata — compiling to the Router, Surface, and Bundle
primitives the runtime already runs. Pure data: no Model, no Effects, no
Messages, no fetching.

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
the first declaring node as a target. `shortcut` names the keys that go
there; bindings stay application-owned, derived with the name validated
against the Message union. Annotate once; derive nav, titles, shortcuts, and
breadcrumbs from it.

**History.** `Site.historyOf(prev, next)`: another node, or an unknown
location, is a step; within a node its `history` rule (default replace; a
function for nodes where some param changes are entries of their own).

**Lifecycle.** `Site.routing<Model, Message, Route>({ site, owner, route,
parse, tags: { clicked, changed }, completed })` is the link-click and
URL-change lifecycle as one wiring: internal clicks navigate per
`historyOf`, external links load, URL changes set the route field (or touch
nothing on an echo). The app's own update guards with `Routing.reduces`.
Needs a completion variant and a structural route field (`{ dependency, get,
set }` — a union field is a union of refs, no single `ModelRef` accepts it).

**Attached Surfaces.** `surface: { surface, params: route => params }` on a
node; `Site.sources(site, App.owner, App.model.route)` is each surfaced node
as its `Surface.when`, keyed by tag, for `Data.wiring` / `subscriptions` /
`satisfy` / SSR `surfaces`. Refuses a foreign surface. Each entry answers its
own tag only. `Site.sourcesFor(site, App.owner, App.model.route,
target.route)` is the same entries for the target's chain only — what
prefetch/SSR read; prepare caller-side with `Data.satisfy({ ...model, route:
target.route }, active)`. Unknown tags resolve to no Sources. No `SitePlan`
object yet (chain is `chainOf`; head/access arrive with real consumers).

**Nested rendering.** `layout: { render: (child, model, h) => ... }` wraps
everything under the node; `view: { render: (model, h) => ... }` draws its
own route. `Site.view(site, route, model, h)` is the leaf's view in every
ancestor layout, root-first; ancestors never draw their views. Unknown tags
and viewless leaves fail loudly.

**Routed pages.** `Site.placement(node, bundle, { link, args, changed?,
key?, when?, onMessage? })`: the link states the relationship once;
`placed.update` folds, `placed.view` draws. `changed: route => childMsg`
tells the child on arrival (`undefined` = nothing needed; absent = never
informed). `Site.routing({ ..., pages: [...] })` informs arrivals. Bundles
with OutMessages and non-Bundle children stay on `Bundle.at` / `Link.child`.

## Gotchas

- A layout surface active for several tags is not expressible yet (a future
  `whenAny`-shaped extension); each entry answers its own tag.
- Route-local model ownership and shortcuts are still per-application
  code. Bundles with OutMessages and non-Bundle children stay on
  `Bundle.at` / `Link.child`.
- `Site.target(Node, {})` for param-less routes: params are always explicit.
- Locales are route params when they arrive; themes are preferences, not routes.
