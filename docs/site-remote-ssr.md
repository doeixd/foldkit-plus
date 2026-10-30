# Site, Remote and SSR together

Three packages, three questions about the same page:

```text
foldkit-site     Where is the reader, and what is around them?
foldkit-remote   What does that page read from the server, and what does the Model already know?
foldkit-ssr      How does a page the server drew become the browser's, without doing it all again?
```

None of them reaches into another. They meet in two places only: the
application's Model, which holds the route and Remote's store side by side,
and **one record of Surfaces**, which says what each page reads. Site makes
that record from the tree, Remote fetches what it asks for, and SSR checks that
the page it hands over carries all of it.

This guide builds one small application with all three: each owner's projects
at `/owners/<id>`, rendered on the server with its data, taken over without
fetching again, built statically, and read ahead on hover. Every snippet is
code from
[`packages/site/test/together.test.ts`](../packages/site/test/together.test.ts),
which compiles and runs it. The CMS example's public site is the same design
at full size (`examples/cms/src/apps/siteApp.ts`).

## Who owns what

| Concern | Owner | What it does not do |
| --- | --- | --- |
| The address and its route value | Foldkit's Router | Know anything beyond one address |
| The tree of places: titles, sections, history, head metadata, which Surface each place activates | `foldkit-site` | Hold state, fetch, or render |
| The route field, and every change to it | the application's Model, through `update` | |
| What a page reads | a Surface (`foldkit-surface`) | Fetch: it only declares |
| Server facts: the store, what is missing, fetching, retention | `foldkit-remote` | Know about routes or pages |
| The handover from server to browser, and the checks that it is whole | `foldkit-ssr` | Own any state; data crosses through Remote's own part |
| Joining the pieces into one `update` and one runtime config | `foldkit-bundle` | Decide anything the pieces decide |

**Each fact has one owner, and the others read it.** The Site never reads
`window.location`; the route is a Model field. Remote never looks at the
route, only at which Surfaces are active. SSR never fetches; it checks that
what the page reads crossed with it.

## The loop, in the browser and on the server

In the browser, one loop runs everything:

```text
link click ─▶ Site.routing ─▶ pushUrl ─▶ URL change ─▶ route field set
                                                            │
     view ◀── Model ◀── Data.reduce ◀── RemoteClient ◀── active Surfaces' reads
```

Setting the route is synchronous. The active pages follow from the route, and
what is missing from what they read; Remote fetches that and reduces the
answers into the Model. Navigation never waits for data.

The server runs the same steps once, ahead of time, and hands over the result:

```text
URL ─▶ route ─▶ Data.satisfy (the same Surfaces, fetched until nothing is missing)
     ─▶ SSR.render (draws it, checks it) ─▶ HTML carrying the route and what was read
     ─▶ SSR.hydrate in the browser: the same Model, so nothing is fetched again
```

## Building it

### The domain: what the server owns

```ts
const Project = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const ProjectCard = Entity.select(Project, { id: true, name: true })

const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.name)),
  ),
)
```

`ProjectCard` is the only fields that will be fetched or sent to the browser.

### The routes: Foldkit's, unchanged

```ts
const AppRoute = defineRouteUnion({
  Home: {},
  Owner: { ownerId: Schema.String },
  NotFound: { path: Schema.String },
})

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const ownerRouter = pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner))
```

Plain Foldkit routers. [Site and Foldkit's Router](./site-and-router.md) says
what the Site adds to them.

### One Model, two owners

```ts
const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })

const Message = defineMessageUnion({
  ...Remote.messages,
  ClickedLink: { request: Navigation.UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  PointedAtLink: { url: Url },
})

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})
```

`route` is the application's; `remote` is Remote's store, inside the same Model
rather than a cache beside it, so the server can send it as data. `Data` is
Remote bound to that field.

### What a page reads: a Surface

```ts
const OwnerPage = App.surface('OwnerPage', {
  params: { ownerId: Schema.String },
  model: ({ params }) => ({
    projects: Data.query(
      ProjectsByOwner,
      { ownerId: params.ownerId },
      { select: ProjectCard, first: 20 },
    ),
  }),
})

const projectsOf = (model: Model, ownerId: string) =>
  OwnerPage.projection({ ownerId }).read(model).projects
```

This fetches nothing. It is a pure read of the Model that also carries its
requirements: the first twenty `ProjectCard`s of this owner. Read it while the
store lacks them and you get `Initial` or `Loading`, never `undefined`.
Something else decides whether to fetch, and that is the point: the same
declaration serves the browser, the server, the static build and the
prefetch below.

### The tree: where each Surface is active

```ts
const HomeNode = Site.node(homeRouter, AppRoute.Home)
  .title(() => 'Projects')
  .meta(() => ({ siteName: 'Projects', description: 'Who is working on what.' })).node

const OwnerNode = Site.node(ownerRouter, AppRoute.Owner)
  .title(({ ownerId }) => `Projects of ${ownerId}`)
  .surface({ surface: OwnerPage, params: route => ({ ownerId: route.ownerId }) })
  .history((prev, next) => (prev.ownerId === next.ownerId ? 'replace' : 'push'))
  .meta<Model>(({ route, model }) => {
    const read = projectsOf(model, route.ownerId)
    return {
      description:
        read._tag === 'Ready' ? read.value.items.map(item => item.name).join(', ') : undefined,
    }
  }).node

const AppSite = Site.make(Site.mount(HomeNode, [OwnerNode]))

const routeOf = Site.parse(AppSite, AppRoute.NotFound)

const sources = Site.sources(AppSite, App.owner, App.model.route)
```

`.surface` is the seam between Site and Remote. It says: while the route is an
`Owner`, `OwnerPage` is active, with the route's `ownerId` as its param.

`Site.sources` turns every such node into a `Surface.when` over the route
field, keyed by tag (here `{ Owner: … }`). That record is the one thing the
other packages consume:

- `Data.wiring(sources)` in the browser starts and stops the reads as the
  route changes;
- `Data.satisfy(model, sources)` on the server fetches them before drawing;
- the SSR plan's `surfaces` checks they crossed with the page;
- `Data.preload(model, sources)` reads a destination ahead.

`meta` reads the Model, not just the route: an owner's description is the
names of their projects, which are data. It runs wherever the Model holds
them, so the server writes it into the page and the browser keeps it in step.

### The wiring: one `update`, three owners

```ts
import { ModelRef } from 'foldkit-surface'

const Routing = Site.routing<Model, Message, AppRoute, RemoteClient>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: ModelRef.focus(App.model.route).dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: routeOf,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  // The reader means to follow a link: read what that page will read.
  preload: {
    links: pointedLinks(),
    intended: Message.PointedAtLink,
    read: there => Data.preload(there, sources),
  },
})

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const placements = Parent.assemble(Data.wiring(sources), Routing)

const update = placements.update((model, message) => {
  if (Routing.reduces(message)) return { model }
  return Match.valueTags(message, {
    ClickedLink: () => ({ model }),
    ChangedUrl: () => ({ model }),
    CompletedNavigation: () => ({ model }),
    PointedAtLink: () => ({ model }),
  })
})

const initial = (url: Url) => placements.initial({ route: routeOf(url), remote: Remote.initial })
```

`Bundle.assemble` routes each Message to the piece that owns it:

- **Remote's own Messages** (`ReadStarted`, `ReadReceived`, …) go to
  `Data.reduce`, the only writer of the store.
- **The click** goes to `Site.routing`. A link the tree holds navigates, with
  a push or a replace from `.history`. Any other link loads the page in full.
- **The URL change** goes to `Site.routing`, which sets the route field. It
  returns the same Model when the address is the one already shown.
- **`PointedAtLink`** goes to `Site.routing` too, which reads the page ahead
  (below).

The application's own `update` answers none of these, and keeps only what is
its own. `withServices<RemoteClient>()` states that the assembled program needs
a client, which the runtime provides as a Layer; the routing's `read` needs it
too, so `Site.routing` names it fourth.

Nothing here connects a route change to a fetch. The route field changes,
`OwnerPage` is active on that route, and Remote sees what the store lacks.

### The view: ordinary Foldkit

```ts
const view = (model: Model, h: HtmlBuilder<Message>) => ({
  title: Site.titleOf(AppSite, model.route) ?? 'Not found',
  body: h.main(
    [],
    [
      AppRoute.match(model.route, {
        Home: () => h.a([h.Href(Site.href(OwnerNode, { ownerId: 'ada' }))], ['Ada']),
        Owner: ({ ownerId }) =>
          RemoteData.render(projectsOf(model, ownerId), {
            loading: () => h.p([h.AriaBusy(true)], ['Loading…']),
            notFound: () => h.p([], ['No one by that name.']),
            failed: () => h.p([], ['Could not load the projects.']),
            data: page =>
              h.ul(
                [],
                page.items.map(item => h.li([], [item.name])),
              ),
          }),
        NotFound: ({ path }) => h.p([], [`Nothing at ${path}.`]),
      }),
    ],
  ),
})
```

The link's address comes from the node's own router, so it parses back to the
route it names. `RemoteData.render` asks for a drawing of each state.

## On the server: a page with its data in it

### The plan: what crosses

```ts
const plan = SSR.plan(
  {
    owner: App.owner,
    Message,
    // What the browser starts from before the slice is set on it.
    initial: placements.initial({ route: AppRoute.Home(), remote: Remote.initial }).model,
  },
  {
    id: 'projects',
    state: Projection.pick(App.model.route),
    surfaces: Object.values(sources),
    parts: [Remote.resume(Data)],
    meta: model => Site.metaOf(AppSite, model.route, model),
  },
)
```

Each line names an owner:

- **`state`** is the application's slice: only the route. Every other field
  starts from `initial` in the browser.
- **`parts`** are other packages' state, each crossing on its own terms.
  `Remote.resume(Data)` captures exactly what the active Surfaces read, with
  the cursors a "load more" needs. Fields no Surface selects stay on the
  server, and so do loading marks, failures and pending work.
- **`surfaces`** are the Site's sources again. `SSR.render` refuses a page
  where an active Surface reads something neither `state` nor a part sent,
  naming the Surface and the field, so a page that would fetch again in the
  browser never ships.
- **`meta`** is the Site's head for the route, read from the Model the server
  reached.

### Preparing and rendering one address

```ts
const prepare = (path: string, client: Layer.Layer<RemoteClient>) =>
  Data.satisfy(initial(urlAt(path)).model, sources).pipe(
    Effect.map(prepared =>
      configOf({
        initial: () => placements.initial({ route: prepared.route, remote: prepared.remote }),
        resources: client,
        container: null,
      }),
    ),
    Effect.provide(client),
  )

const renderPage = (path: string, client: Layer.Layer<RemoteClient>) =>
  Effect.gen(function* () {
    const config = yield* prepare(path, client)
    const rendered = yield* SSR.render(config, plan, { buildId: 'b', url: `${ORIGIN}${path}` })
    return SSR.page(TEMPLATE, rendered)
  })
```

`Data.satisfy` is the browser's loop run to completion before drawing: it
fetches what the active `sources` lack, pass after pass, until a pass plans
nothing. On `/owners/ada` that is one query; on `/`, none. Sources for other
routes are inactive, so passing all of them fetches no more.

`SSR.render` draws the view from the prepared Model, then draws it again from
the Model the browser will start from (the baseline with the slice and
Remote's capture set on it), and refuses the page if the two differ. That
check is what makes the handover safe. The page carries the route and the
projects as JSON on its root element, with the description from `meta` in its
head.

`configOf` is the runtime config both sides share: `placements.runtime` with
the same `update`, `view` and routing callbacks, given the container (none on
the server) and the client. One config means the server cannot draw a page the
browser would not.

`SSR.inspect(plan, model)` returns the same coverage as data. The test asserts
that `OwnerPage` is active, will be the same in the browser, and has nothing
left unresumed.

### In the browser: take over, fetch nothing

```ts
const takeOver = (container: HTMLElement, buildId: string) =>
  SSR.hydrate(
    configOf({
      initial,
      resources: Remote.clientLayer(Remote.http('/remote')),
      container,
    }),
    plan,
    { buildId },
  )
```

`SSR.hydrate` builds the Model from the baseline, the route and Remote's
capture, and adopts the server's HTML; `init` does not run. Remote's
subscription finds the store already holds what `OwnerPage` reads, and asks
for none of it. From the first click on, it is the browser loop above.

Import `SSR` from `foldkit-ssr/client` in the modules the browser loads; the
server's renderer stays out of the page's script.

## A static site from the same tree

A static host serves files, so every address must be known at build time.
The tree knows its places; only the params come from data:

```ts
const listSite = (owners: Effect.Effect<ReadonlyArray<string>>) =>
  Site.targets(AppSite, [
    Site.paths(
      OwnerNode,
      Effect.map(owners, ids => ids.map(ownerId => ({ params: { ownerId } }))),
    ),
  ])

const staticBuild = (
  client: Layer.Layer<RemoteClient>,
  owners: Effect.Effect<ReadonlyArray<string>>,
) =>
  ({
    origin: ORIGIN,
    paths: () =>
      Effect.runPromise(
        Effect.map(listSite(owners), listed =>
          listed.map(target => ({ path: target.url, modified: target.modified })),
        ),
      ),
    config: (path: string) => Effect.runPromise(prepare(path, client)),
    plan,
    files: 'flat',
    sitemap: true,
  }) satisfies SiteModule
```

`Site.targets` lists the tree in order. A node without params appears once,
and a node with params appears once for each set its `Site.paths` gives. It
refuses a node with params that has no `paths`, so a page cannot be left out
without anyone deciding to. In a real build, `owners` is a server read:
`Data.prefetch` of a query, as the CMS's `listSite` does
(`examples/cms/src/ssr/prerender.ts`).

`staticBuild` is a `SiteModule`, the shape `foldkit-ssr/vite`'s `staticSite`
plugin evaluates after `vite build`. `generateStaticSite` runs the same build
without Vite, as the test does. Each page is prepared and rendered exactly as
the server above renders it, and the sitemap is written from the same list.

## Reading ahead: preload is the same composition

Look again at `preload` in `Site.routing`. `pointedLinks()` from
`foldkit-primitives/dom` says which same-origin link the reader means to
follow: one a mouse or pen rests on, or Tab stops on, for 50 ms (leaving
first cancels it, so a pointer sweeping the list of owners reads one page),
or one a finger lands on, at once. The routing sends `PointedAtLink` for it
and answers that Message itself. When `Site.routeAt` says this application
draws the address, and it is not the route shown, `read` gets the Model with
the route set there, and `Data.preload(there, sources)` reads what that Model
would need.

`Data.preload` is `Data.satisfy` as a Command. Its answers arrive as one
`Preloaded` Message, reduced into the Model as it is by then, so nothing that
happened meanwhile is undone. The route does not change, and the routing
returns the Model it was given; the store just holds the projects already.
When the click comes, the page draws `Ready` at once. There is no loader
cache, preload lane or "intended route" field: what was read waits in the
same store as everything else, until retention next changes.

## Why it is shaped this way

**No loaders.** A route that fetches would make the Site an async runtime
with its own cache beside Remote's. Instead a page declares what it reads,
and the store decides what is missing. Coming back to an owner while the
store still holds their projects fetches nothing. Two pages reading the same project share one entity. A
mutation elsewhere updates every page showing it.

**No waterfalls from nesting.** Requirements are derived, not run in route
order. Sibling reads plan together, and Remote fetches them concurrently. A
read that reveals another (a page naming its blocks) costs another pass of
`satisfy`, one level at a time.

**One declaration, four uses.** Add a node with a Surface and the browser's
reads, the server's preparation, the handover check and the prefetch all
follow, since all four read `sources`.

## When it goes wrong

- **A read fails.** In the browser the page shows `failed`, and the store
  still holds what it held. On the server, `Data.satisfy` fails with the
  read's own error (`RemoteQueryError`, `RemoteReadError`), so the server
  chooses: an error page, or a retry. A static build stops rather than write
  a page without its data.
- **A read keeps revealing more.** `Data.satisfy` stops after a bounded
  number of passes (8 by default) and fails with `RemoteUnsatisfied`, naming
  the Surface, rather than serving a page still loading.
- **The view reads something that does not cross.** `SSR.render` fails with
  `ResumeUnsafe` and names the field or the Surface. Add it to `state`, or to
  `local` when it should start from the baseline on purpose.
- **A served page is out of date, or for another reader.** `SSR.hydrate`'s
  `when` and `fresh` decline it, and `otherwise: 'render'` draws afresh in its
  place. `until` keeps the served page in view until the fresh one has its
  reads, as the CMS's `sitePlan.ts` does.
- **The reader leaves a page.** Its Surface goes inactive, and after a grace
  period Remote collects what nothing else reads. That is safe: the server
  still owns the facts, and coming back fetches them again.

## Where to read next

- [Site and Foldkit's Router](./site-and-router.md): what the Site adds to
  routing, and how.
- [Creating a site](./site.md): the Site's features one at a time.
- [`foldkit-remote` README](../packages/remote/README.md): policies,
  mutations, live data and retention.
- [`foldkit-ssr` README](../packages/ssr/README.md): the handover, static
  regions, resumable pages and forms without scripts.
