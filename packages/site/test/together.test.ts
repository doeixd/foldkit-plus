/**
 * The application `docs/site-remote-ssr.md` builds, whole: Site says where the
 * reader is, Remote what those pages read, SSR how a page crosses from the
 * server. The guide's snippets are this file's code, so they compile and run.
 */
import { Effect, Equal, Layer, Match, Option, Schema, Stream, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url, fromString } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query, Remote, RemoteClient, RemoteData } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr'
import { type SiteModule, generateStaticSite } from 'foldkit-ssr/vite'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

// THE DOMAIN: what the server owns, and the one question the pages ask of it.

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

// THE ROUTES: Foldkit's own routers, one per place.

const AppRoute = defineRouteUnion({
  Home: {},
  Owner: { ownerId: Schema.String },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const ownerRouter = pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner))

// THE APPLICATION: a route field and Remote's store, side by side in one Model.

const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ...Remote.messages,
  ClickedLink: { request: Navigation.UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  PointedAtLink: { url: Url },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

// WHAT A PAGE READS: a Surface, a pure declaration that fetches nothing.

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

// THE SITE: each router, what its place is called, and the Surface it activates.

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

/** Every surfaced node, as Remote's active reads and SSR's checked Surfaces. */
const sources = Site.sources(AppSite, App.owner, App.model.route)

// THE WIRING: Site answers links and the URL, Remote its own Messages.

const Routing = Site.routing<Model, Message, AppRoute>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: App.model.route.dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: routeOf,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
})

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const placements = Parent.assemble(Data.wiring(sources), Routing)

const update = placements.update((model, message) => {
  if (Routing.reduces(message)) return { model }
  return Match.valueTags(message, {
    ClickedLink: () => ({ model }),
    ChangedUrl: () => ({ model }),
    CompletedNavigation: () => ({ model }),
    // The reader may go there next: read what that page will read.
    PointedAtLink: ({ url }) =>
      Option.match(Site.routeAt(AppSite, url), {
        onNone: () => ({ model }),
        onSome: route =>
          Equal.equals(route, model.route)
            ? { model }
            : { model, commands: [Data.preload({ ...model, route }, sources)] },
      }),
  })
})

const initial = (url: Url) => placements.initial({ route: routeOf(url), remote: Remote.initial })

// THE VIEW: an ordinary Foldkit view, reading the route and the Surface.

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

// THE HANDOVER: what crosses from the server's Model to the browser's.

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

/** The runtime config both sides share: the browser runs it, the server renders it. */
const configOf = <Container extends HTMLElement | null>(options: {
  readonly initial: (url: Url) => ReturnType<typeof initial>
  readonly resources: Layer.Layer<RemoteClient>
  readonly container: Container
}) =>
  placements.runtime({
    Model,
    container: options.container,
    initial: options.initial,
    update,
    view,
    routing: {
      onUrlRequest: (request: Navigation.UrlRequest) => Message.ClickedLink({ request }),
      onUrlChange: (url: Url) => Message.ChangedUrl({ url }),
    },
    resources: options.resources,
  })

/** One address's config, its Model prepared: every read its page makes, already answered. */
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

/** A server's page for one address: prepared, rendered with the plan, put in the template. */
const renderPage = (path: string, client: Layer.Layer<RemoteClient>) =>
  Effect.gen(function* () {
    const config = yield* prepare(path, client)
    const rendered = yield* SSR.render(config, plan, { buildId: 'b', url: `${ORIGIN}${path}` })
    return SSR.page(TEMPLATE, rendered)
  })

/** Every address the site has, for a static build: one per owner the server knows. */
const listSite = (owners: Effect.Effect<ReadonlyArray<string>>) =>
  Site.targets(AppSite, [
    Site.paths(
      OwnerNode,
      Effect.map(owners, ids => ids.map(ownerId => ({ params: { ownerId } }))),
    ),
  ])

/** The static build: what `staticSite` evaluates, every listed address rendered as above. */
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

/** The browser: take the served page over, then read from the server as the reader moves. */
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

// TEST FIXTURES

const ORIGIN = 'https://example.test'

const TEMPLATE =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

function urlAt(path: string): Url {
  return Option.getOrThrow(fromString(`${ORIGIN}${path}`))
}

const ROWS = [
  { id: 'p1', name: 'Analytical Engine', ownerId: 'ada' },
  { id: 'p2', name: 'Notes on the Engine', ownerId: 'ada' },
  { id: 'p3', name: 'Difference Engine', ownerId: 'charles' },
]

/** A server held in memory: answers the one query, and records each it was asked. */
const server = () => {
  const asked: Array<string> = []
  const layer = Layer.succeed(RemoteClient, {
    read: () => Effect.die('unused: the query carries its fields'),
    query: request => {
      const { ownerId } = request.input as { readonly ownerId: string }
      asked.push(`${request.query}:${ownerId}`)
      const rows = ROWS.filter(row => row.ownerId === ownerId)
      return Effect.succeed({
        edges: rows.map(row => ({ entity: 'Project', id: row.id, key: `Project:${row.id}` })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
        settled: [],
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { asked, layer }
}

describe('Site, Remote and SSR together', () => {
  it('serves a route with its data and its head, asking the server once', async () => {
    const { asked, layer } = server()
    const html = await Effect.runPromise(renderPage('/owners/ada', layer))
    expect(asked).toEqual(['ProjectsByOwner:ada'])
    expect(html).toContain('<li>Analytical Engine</li>')
    expect(html).toContain('<title>Projects of ada</title>')
    expect(html).toContain('content="Analytical Engine, Notes on the Engine"')
    expect(html).not.toContain('Difference Engine')
  })

  it('covers every Surface the browser will read', async () => {
    const { layer } = server()
    const prepared = await Effect.runPromise(
      Data.satisfy(initial(urlAt('/owners/ada')).model, sources).pipe(Effect.provide(layer)),
    )
    expect(SSR.inspect(plan, prepared).surfaces).toMatchObject([
      { name: 'OwnerPage', active: true, sameInBrowser: true, unresumed: [] },
    ])
  })

  it('reads nothing for a route whose page reads nothing', async () => {
    const { asked, layer } = server()
    const html = await Effect.runPromise(renderPage('/', layer))
    expect(asked).toEqual([])
    expect(html).toContain('href="/owners/ada"')
  })

  it('builds every address the tree lists, each page with its own data, and a sitemap', async () => {
    const { asked, layer } = server()
    const build = staticBuild(layer, Effect.succeed(['ada', 'charles']))
    const built = await Effect.runPromise(
      generateStaticSite({ ...build, buildId: 'b', template: TEMPLATE }),
    )
    expect(built.pages.map(page => [page.path, page.file])).toEqual([
      ['/', 'index.html'],
      ['/owners/ada', 'owners/ada.html'],
      ['/owners/charles', 'owners/charles.html'],
    ])
    expect(built.pages[2]?.html).toContain('<li>Difference Engine</li>')
    expect(asked).toEqual(['ProjectsByOwner:ada', 'ProjectsByOwner:charles'])
    expect(built.sitemap).toContain('<loc>https://example.test/owners/charles</loc>')
  })

  it('preloads the page a pointed-at link leads to, and nothing for the page shown', async () => {
    const { asked, layer } = server()
    const home = initial(urlAt('/')).model
    const pointed = update(home, Message.PointedAtLink({ url: urlAt('/owners/charles') }))
    const [preload] = pointed.commands ?? []
    if (preload === undefined) throw new Error('no preload')
    const preloaded = await Effect.runPromise(preload.effect.pipe(Effect.provide(layer)))
    expect(asked).toEqual(['ProjectsByOwner:charles'])
    const after = update(home, preloaded).model
    // Still home: the reads are in the store, waiting for the route.
    expect(after.route).toEqual(AppRoute.Home())
    expect(projectsOf(after, 'charles')).toMatchObject({ _tag: 'Ready' })

    const there = { ...home, route: AppRoute.Owner({ ownerId: 'charles' }) }
    expect(
      update(there, Message.PointedAtLink({ url: urlAt('/owners/charles') })).commands ?? [],
    ).toEqual([])
  })

  it('navigates a link the tree holds, and loads one it does not', () => {
    const home = initial(urlAt('/')).model
    const click = (path: string) =>
      update(
        home,
        Message.ClickedLink({
          request: Navigation.UrlRequest.Internal({ url: urlAt(path) }),
        }),
      ).commands?.map(command => command.name)
    expect(click('/owners/ada')).toEqual(['Site.Navigate'])
    expect(click('/admin')).toEqual(['Site.Load'])
  })
})
