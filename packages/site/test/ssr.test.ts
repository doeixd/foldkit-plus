/**
 * §31.8: the route determines the SSR preparation, through the same Sources.
 *
 * URL → route → target Model → `Site.sourcesFor` → `Data.satisfy` → an SSR
 * plan over those Sources with Remote's resume part → covered inspection and
 * a rendered page carrying the destination's data. Composition expands
 * nothing new here (no dynamic families in this tree), and the browser
 * takeover itself is proved generically in `foldkit-ssr` — this test owns the
 * Site link: the plan's Surfaces are the route's, and the envelope carries
 * what they resolved.
 */
import { Effect, Layer, Option, Schema, Stream, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import {
  defineRouteUnion,
  literal,
  mapTo,
  oneOf,
  parseUrlWithFallback,
  root,
  slash,
  string,
} from 'foldkit/route'
import { fromString } from 'foldkit/url'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Query, Remote, RemoteClient } from 'foldkit-remote'
import { SSR, metaMarkup } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const ProjectSummary = DomainEntity.select(Project, { id: true, name: true })

const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const AppRoute = defineRouteUnion({
  Home: {},
  Owner: { ownerId: Schema.String },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const ownerRouter = pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner))
const urlToRoute = parseUrlWithFallback(oneOf(ownerRouter, homeRouter), AppRoute.NotFound)
const routeOf = (path: string): AppRoute => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return urlToRoute(url.value)
}

const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { route: AppRoute.Home(), remote: Remote.initial },
  update: model => ({ model }),
})
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

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

/** The owner's projects as the page holds them, for its view and its head. */
const projectsOf = (model: Model, ownerId: string) =>
  OwnerPage.projection({ ownerId }).read(model).projects

const HomeNode = Site.node(homeRouter, AppRoute.Home)
  .title(() => 'Projects')
  .meta(() => ({ siteName: 'Projects', description: 'Every project' }))
const OwnerNode = Site.node(ownerRouter, AppRoute.Owner)
  .title(({ ownerId }) => `Projects of ${ownerId}`)
  .surface({ surface: OwnerPage, params: route => ({ ownerId: route.ownerId }) })
  // Read from the data the page resumes, which crosses with it.
  .meta<Model>(({ route, model }) => {
    const read = projectsOf(model, route.ownerId)
    return {
      description:
        read._tag === 'Ready' ? read.value.items.map(item => item.name).join(', ') : undefined,
    }
  })
const AppSite = Site.make(Site.mount(HomeNode.node, [OwnerNode.node]))

/** The server's client: answers the Owner query, records what ran. */
const recording = () => {
  const queries: Array<string> = []
  const layer = Layer.succeed(RemoteClient, {
    read: () => Effect.die('unused: the query payload carries its fields'),
    query: request => {
      const input = request.input as { readonly ownerId: string }
      queries.push(`${request.query}:${input.ownerId}`)
      const ids = ['p1', 'p2']
      return Effect.succeed({
        edges: ids.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: ids.map(id => ({
          entity: 'Project',
          id,
          values: { id, name: `name of ${id}`, ownerId: input.ownerId },
        })),
        settled: [],
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { queries, layer }
}

const view = (model: Model, h: HtmlBuilder<Message>) => {
  const read = model.route._tag === 'Owner' ? projectsOf(model, model.route.ownerId) : undefined
  return {
    title: 'Owner',
    body: h.p(
      [],
      [
        read?._tag === 'Ready'
          ? read.value.items.map(item => item.name).join(', ')
          : (read?._tag ?? 'noroute'),
      ],
    ),
  }
}

describe('serving a route', () => {
  it('prepares the route Model, plans its Sources, and renders its data', async () => {
    const route = routeOf('/owners/u1')
    const there: Model = { route, remote: Remote.initial }
    const active = Site.sourcesFor(AppSite, App.owner, App.model.route, route)
    expect(Object.keys(active)).toEqual(['Owner'])

    const client = recording()
    const prepared = await Effect.runPromise(
      Data.satisfy(there, active).pipe(Effect.provide(client.layer)),
    )
    expect(client.queries).toEqual(['ProjectsByOwner:u1'])

    const plan = SSR.plan(App, {
      id: 'owner',
      state: Projection.pick(App.model.route),
      surfaces: Object.values(active),
      parts: [Remote.resume(Data)],
    })
    expect(SSR.inspect(plan, prepared).surfaces).toMatchObject([
      { name: 'OwnerPage', active: true, sameInBrowser: true, unresumed: [] },
    ])

    const config = {
      Model,
      init: () => ({ model: prepared }),
      update: (model: Model, message: Message) => ({ model: Data.reduce(model, message) }),
      subscriptions: Data.subscriptions({ page: active['Owner']! }),
      view,
      container: null,
    }
    const rendered = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const page = SSR.page(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      rendered,
    )
    expect(page).toContain('name of p1')
    expect(page).toContain('name of p2')
  })

  it('writes the route’s head from the chain, its own data included', async () => {
    const route = routeOf('/owners/u1')
    const active = Site.sourcesFor(AppSite, App.owner, App.model.route, route)
    const prepared = await Effect.runPromise(
      Data.satisfy({ route, remote: Remote.initial }, active).pipe(
        Effect.provide(recording().layer),
      ),
    )
    const plan = SSR.plan(App, {
      id: 'owner',
      state: Projection.pick(App.model.route),
      surfaces: Object.values(active),
      parts: [Remote.resume(Data)],
      meta: model => Site.metaOf(AppSite, model.route, model),
    })
    const config = {
      Model,
      init: () => ({ model: prepared }),
      update: (model: Model) => ({ model }),
      view,
      container: null,
    }
    const rendered = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    expect(rendered.meta).toBe(
      metaMarkup({
        siteName: 'Projects',
        description: 'name of p1, name of p2',
        title: 'Projects of u1',
      }),
    )
  })
})
