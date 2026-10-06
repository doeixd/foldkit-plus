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
the router stays the whole URL story. `Site.mount(node, children?)` never
mutates the node. `Site.make(...roots)` freezes the tree and refuses two
nodes sharing a tag or one node mounted twice.

## Common tasks

**Targets and hrefs.** `Site.target(node, params)` is `{ node, route, url }`;
`Site.href(target)` or `Site.href(node, params)`. A built URL parses back to
the target's route — one declaration, no parallel href builder.

**Inspection.** `Site.nodeOf(site, route)` / `Site.chainOf(site, route)` (`[]`
for an unknown tag); `Site.parentOf`, `Site.ancestorsOf`, `Site.depthOf`,
`Site.nodesOf` (depth-first, parents first).

**Metadata.** `title` (of the route value), `section`, read with
`Site.titleOf` / `Site.sectionOf` (`undefined` when absent). Annotate once;
derive nav, titles, and breadcrumbs from it.

**History.** `Site.historyOf(prev, next)`: another node is a step; within a
node its `history` rule (default replace; a function for nodes where some
param changes are entries of their own); no previous target is a replace.

**Attached Surfaces.** `surface: { surface, params: route => params }` on a
node; `Site.sources(site, App.owner, App.model.route)` is each surfaced node
as its `Surface.when`, keyed by tag, for `Data.wiring` / `subscriptions` /
`satisfy` / SSR `surfaces`. Refuses a foreign surface. Each entry answers its
own tag only.

## Gotchas

- A layout surface active for several tags is not expressible yet (a future
  `whenAny`-shaped extension); each entry answers its own tag.
- Route-local model ownership, link-click/URL-change branches, and shortcuts
  are still per-application code — the lifecycle wiring cut, not this one.
- `Site.target(Node, {})` for param-less routes: params are always explicit.
- Locales are route params when they arrive; themes are preferences, not routes.
