# Site and Foldkit's Router

Foldkit already routes. Its Router turns a URL into a typed route value and a
route value back into a URL, and its runtime turns link clicks and history
moves into Messages. `foldkit-site` does not replace any of that: every node of
a Site is a Foldkit Router, and the Site's parser is Foldkit's `oneOf` and
`parseUrlWithFallback` over them. What the Site adds is everything an
application with several screens used to write around the Router by hand.

```text
Foldkit Router      URL  <->  route value               (one address)
foldkit-site        route value -> place in a tree      (every address, and what is around it)
```

This page says where the line between them falls, what the Site does with
each question it answers, and how it does it.

## What Foldkit gives you

Three pieces, all in Foldkit itself:

**Routers.** Built from combinators, `literal`, `int`, `string`,
`schemaSegment`, `rest`, `query`, joined with `slash` and bound to a route
case with `mapTo`. A router is a biparser: it parses an address into the
route value, and called with the route's params it builds the address back.

```ts
export const personRouter = pipe(
  literal('people'),
  slash(int('personId')),
  Route.mapTo(AppRoute.Person),
)

personRouter({ personId: 3 }) // '/people/3'
```

**One parser.** `oneOf` tries routers in the order you list them, and
`parseUrlWithFallback` gives the route of the first that takes the address, or
your NotFound route:

```ts
const routeParser = Route.oneOf(
  personRouter,
  peopleRouter,
  filesIndexRouter,
  filesRouter,
  nestedRouter,
  homeRouter,
)

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)
```

**Two Messages from the runtime.** `Runtime.makeApplication`'s `routing` takes
`onUrlRequest` and `onUrlChange`. The runtime listens for clicks on links:
a primary click with no modifier key, on an `<a>` with no other `target` and no
`download`. It cancels the browser's own navigation and sends
`onUrlRequest(UrlRequest.Internal({ url }))` for a link on this origin, or
`UrlRequest.External({ href })` for any other. Back, Forward and the
navigation Commands `pushUrl` and `replaceUrl` all send
`onUrlChange(url)`. `init` receives the starting URL.

Foldkit stops there, on purpose. It never moves to a URL by itself: a click
becomes a Message, and `update` decides whether to `pushUrl`, `replaceUrl` or
`load`. Its `Route.Transition` helpers answer which route a change entered or
left, once you have built the transition yourself.

## What the application writes around it

The routing example, before it moved onto `foldkit-site`, shows what that
leaves to the application. Its `update` answered both Messages by hand:

```ts
ClickedLink: ({ request }) =>
  UrlRequest.match<UpdateReturn>(request, {
    Internal: ({ url }) => ({ model, commands: [NavigateInternal({ url: urlToString(url) })] }),
    External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
  }),

ChangedUrl: ({ url }) => {
  const nextRoute = urlToAppRoute(url)
  if (Equal.equals(nextRoute, model.route)) return { model }
  const routeSteps = Match.value(nextRoute).pipe(
    Match.withReturnType<ReadonlyArray<Update.Step<Model, Message>>>(),
    Match.tag('People', peopleRoute => [foldPeopleRouteChanged(peopleRoute)]),
    Match.orElse(() => []),
  )
  return Update.combine(model, [setRoute(nextRoute), ...routeSteps])
},
```

Around those two branches it kept four more tables, each listing the routes
again:

- **Nav sections:** which section each route belongs to, matched route by
  route.
- **Section links:** each section's address, built from its router.
- **Shortcuts:** a literal union of shortcuts, a table from each shortcut to a
  URL, and a key binding for each.
- **Titles:** each route's title, in the view.

Add a route and five places change. Nothing checks that they agree: a section
can link to an address its own router would not build, and a shortcut can name
a page that no longer exists. Every in-app link also used `pushUrl`, so even a
link to the page already shown added a Back step.

## What the Site does with the same routers

A Site is a tree of nodes. A node is one of your existing routers, the route
case it builds, and what you say about that place. Everything the tables above
held is said there, once:

```ts
const PeopleNode = Site.route(peopleRouter, AppRoute.People, {
  title: () => 'People | Routing',
  section: 'People',
  landing: { searchText: Option.none() },
  shortcut: ['G', 'P'],
})
const PersonNode = Site.route(personRouter, AppRoute.Person, {
  title: ({ personId }) => `Person ${personId} | Routing`,
  section: 'People',
  history: (prev, next) => (prev.personId === next.personId ? 'replace' : 'push'),
})

export const AppSite = Site.make(
  HomeNode,
  Site.mount(PeopleNode, [PersonNode]),
  FilesIndexNode,
  FilesNode,
  NestedNode,
)
```

The two `update` branches become one wiring, placed beside the application's
pages:

```ts
const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  route: {
    dependency: ['route'],
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: urlToAppRoute,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  pages: [PeoplePage],
})
```

The same Messages arrive from the same runtime; `makeApplication`'s `routing`
config does not change. The nav, its links, the key bindings and the titles
are read from the tree (`Site.sectionOf`, `Site.landing`, `Site.shortcuts`,
`Site.titleOf`). [The example](../examples/foldkit/routing/src/main.ts) is the
whole application.

## Side by side

| Question | Foldkit Router | `foldkit-site` |
| --- | --- | --- |
| What route is this URL? | `parseUrlWithFallback(oneOf(...), NotFound)`, routers in the order you list | The same, built from the tree: `Site.parse(site, NotFound)`, nodes in tree order |
| What URL is this route? | Call its router: `personRouter({ personId: 3 })` | `Site.target(PersonNode, { personId: 3 })` gives the route value and its URL together; `Site.hrefOf(site, route)` builds from any route value |
| Which page is around this one? | Not asked | `Site.chainOf`, `parentOf`, `ancestorsOf`, `sectionOf` |
| What is it called? | Not asked | `Site.titleOf`, and `Site.metaOf` for the page's head |
| Where does the nav point? Which keys go there? | Not asked | `Site.landing(site, section)`, `Site.shortcuts(site, toMessage)` |
| A click on a link on this origin | `UrlRequest.Internal`; `update` decides | Navigates if the tree holds the address; any other address loads the page in full |
| Add a Back step, or replace? | `update` picks `pushUrl` or `replaceUrl` | Declared per node; `Site.historyOf` decides |
| A URL change | `onUrlChange`; `update` sets the route | Sets the route field and tells the pages whose route arrived |
| The URL the Model already shows | Arrives like any other | Returns the same Model: no render, nothing told |
| What the page reads from the server | Not asked | The Surface a node names: `Site.sources`, `Site.sourcesFor` |
| Every address, for a build or a sitemap | Not asked | `Site.targets(site, paths)` |
| Drawing the page | Your view, matching on the route | Your view, or `Site.view`: the deepest node's view inside each ancestor's layout |

## How it works

### A node is a router plus annotations

`Site.route(router, routeCase, options)` keeps the router you pass and reads
the tag from the route case, so one route case is one node. Nothing about the
URL is reimplemented: a node's address is always `node.router.build(params)`,
so a link built through the Site parses back to the route it was built from.
Nodes are frozen values, and mounting one in a tree does not change it, so the
exported node builds targets and hrefs wherever it is used.

### The tree is indexed once

`Site.make(...roots)` freezes the topology and walks it once, at definition,
so a bad tree fails where it is declared. The walk keeps three things for that
tree, in a `WeakMap`:

- each node's parent;
- each tag's node, refusing two nodes with one tag or one node mounted twice,
  since either would make "which node is this route?" ambiguous;
- the parser: `parseUrlWithFallback(oneOf(...routers))` over every node's
  router, in tree order (depth-first, parents first).

So `Site.parse` is Foldkit's parser with the list taken from the tree, and
`Site.routeAt(site, url)` is the same parse with `None` instead of a
fallback. Every other lookup (`chainOf`, `titleOf`, `sectionOf`, `metaOf`) is
a map read and a walk up the parents.

### `Site.routing` is the two branches, written once

It is a Bundle wiring, placed with `Bundle.assemble` beside the pages. It
claims the click Message, so the application's own `update` never sees one,
and handles the URL-change Message before passing it on.
`Routing.reduces(message)` names both for the application's guard.

On a **click**:

```text
UrlRequest.External                      -> load the page in full
UrlRequest.Internal, the tree holds it   -> pushUrl or replaceUrl, per Site.historyOf
UrlRequest.Internal, no node takes it    -> load the page in full
```

The last line is the difference from Foldkit's own split. Foldkit calls a link
internal when it is on this origin. The Site calls it internal when this
application draws it. A link to `/docs` served by another app on the same
domain is a full load, not a Navigate Command that could only draw NotFound.

`Site.historyOf(current, next)` adds a Back step for a move to another node,
or from an address the tree does not hold, so Back can return there. A move
within one node replaces the current entry, unless the node's `history` rule
says otherwise. In the example, another person is a step and another search
of the people list is a replace.

On a **URL change** the wiring parses the address with your `parse`. If the
result is the route the Model already shows, it returns the same Model, so
nothing renders and nothing pending is cleared. Your own `replaceUrl`, or a
URL mirror's write, comes back as exactly such a change. Otherwise it runs,
in order:

1. set the route field;
2. each routed page (`Site.placement`) whose node the route belongs to is
   told, through the page's own Message;
3. `arrived(model, route)`, if you gave one, for anything else a new route
   does, such as moving focus.

The navigation Commands it returns are ordinary Foldkit Commands
(`pushUrl`, `replaceUrl`, `load`) that answer with your `completed`
Message. The wiring shares the URL-change tag with URL mirrors, which read
their own slices of the address first.

### The rest reads the tree and nothing else

`Site.view` composes functions: the deepest node's view, wrapped by each
ancestor's layout, root first. A layout receives its child as an argument;
there is no Outlet and no nested router. `Site.sources` turns each node's
`surface` into a `Surface.when` on the route field, keyed by tag, so the
reads a page declares start when its route is shown and stop when it is not.
`Site.targets` runs each node's `Site.paths` Effect to list every address,
for a static build and a sitemap.

## What the Site does not do

- **It does not parse anything new.** The routers are the URL story, and
  `literal`, `query`, `rest` and `schemaSegment` behave as Foldkit says. A
  catch-all router (`/:slug`) still belongs after the nodes whose literal it
  would also take, as it does in `oneOf`.
- **It holds no state.** The route is a field of your Model, written in
  `update` through the `set` you give. The Site never reads `window.location`.
- **It does not fetch or wait.** There are no loaders: navigating sets the
  route at once, and the Surfaces a node names declare what Remote fetches as
  a result.
- **It does not change the runtime.** `makeApplication`'s `routing` config and
  its two Messages are the same with or without a Site.

## When the Router alone is enough

A single screen, or a few screens without sections, nav, shortcuts or titles
to keep in step, needs only Foldkit's Router and two `update` branches. Reach
for the Site when you start keeping a second list of your routes: a nav, a
title per route, a sitemap, or a page that must hear when its route arrives.

## Where to read next

- [`foldkit-site` README](../packages/site/README.md): the API.
- [Creating a site](./site.md): a site end to end, with data, prefetch, SSR
  and SEO.
- [Routing example](../examples/foldkit/routing/src/main.ts): the application
  this page quotes.
