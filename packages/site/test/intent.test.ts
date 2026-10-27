/**
 * `Site.routing`'s `preload`: an address the reader means to follow is read
 * ahead through the application's own `read`, over the Model as it would be
 * there, and the Model itself is never changed.
 */
import { Effect, Layer, Option, Schema, Stream, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url, fromString } from 'foldkit/url'
import type { Url as UrlValue } from 'foldkit/url'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Query, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
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

const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model, draft: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ClickedLink: { request: UrlRequest },
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

const HomeNode = Site.route(homeRouter, AppRoute.Home)
const OwnerNode = Site.route(ownerRouter, AppRoute.Owner, {
  surface: { surface: OwnerPage, params: route => ({ ownerId: route.ownerId }) },
})
const AppSite = Site.make(HomeNode, OwnerNode)
const routeOf = Site.parse(AppSite, AppRoute.NotFound)
const actives = Site.sources(AppSite, App.owner, App.model.route)

const urlOf = (path: string): UrlValue =>
  Option.getOrThrowWith(fromString(`https://example.test${path}`), () => new Error(path))

const field = {
  dependency: App.model.route.dependency,
  get: (model: Model) => model.route,
  set: (model: Model, route: AppRoute) => modifyFields(model, { route: () => route }),
}

/** The routing with a `read` that records each destination Model it is given. */
const routingWith = (links: Stream.Stream<UrlValue> = Stream.empty) => {
  const read: Array<Model> = []
  const routing = Site.routing<Model, Message, AppRoute, RemoteClient>({
    site: AppSite,
    owner: App.owner,
    route: field,
    parse: routeOf,
    tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
    completed: Message.CompletedNavigation,
    preload: {
      links,
      intended: Message.PointedAtLink,
      read: there => {
        read.push(there)
        return Data.preload(there, actives)
      },
    },
  })
  return { routing, read }
}

const home: Model = { route: AppRoute.Home(), remote: Remote.initial, draft: 'kept' }
const pointed = (path: string) => Message.PointedAtLink({ url: urlOf(path) })
const routed = (
  routing: ReturnType<typeof routingWith>['routing'],
  model: Model,
  message: Message,
) => Option.getOrThrow(routing.route!(model, message))

/** A client that answers each query with two projects, and records which owner was asked. */
const recording = () => {
  const asked: Array<string> = []
  const layer = Layer.succeed(RemoteClient, {
    read: () => Effect.succeed({ settled: [], entities: [] }),
    query: request => {
      const { ownerId } = request.input as { readonly ownerId: string }
      asked.push(ownerId)
      const ids = ['p1', 'p2']
      return Effect.succeed({
        edges: ids.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: ids.map(id => ({
          entity: 'Project',
          id,
          values: { id, name: `name of ${id}`, ownerId },
        })),
        settled: [],
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { asked, layer }
}

describe('reading ahead on intent', () => {
  it('claims the intent beside the click and the change', () => {
    const { routing } = routingWith()
    expect(routing.handles).toEqual(['ClickedLink', 'ChangedUrl', 'PointedAtLink'])
    expect(routing.reduces(pointed('/owners/u1'))).toBe(true)
    expect(routing.contract?.messages).toEqual(['CompletedNavigation', 'PointedAtLink'])
    expect(Object.keys(routing.subscriptions ?? {})).toEqual(['site.intent'])
  })

  it('reads the Model as it would be at the address, and leaves this one alone', () => {
    const { routing, read } = routingWith()
    const answer = routed(routing, home, pointed('/owners/u1'))
    expect(answer.model).toBe(home)
    expect(answer.commands).toHaveLength(1)
    expect(read).toEqual([{ ...home, route: AppRoute.Owner({ ownerId: 'u1' }) }])
  })

  it('reads nothing for the route shown, or an address no node holds', () => {
    const { routing, read } = routingWith()
    const there: Model = { ...home, route: AppRoute.Owner({ ownerId: 'u1' }) }
    for (const [model, path] of [
      [there, '/owners/u1'],
      [home, '/studio/drafts'],
    ] as const) {
      const answer = routed(routing, model, pointed(path))
      expect(answer.model).toBe(model)
      expect(answer.commands ?? []).toEqual([])
    }
    expect(read).toEqual([])
    // Another owner from this one is a destination of its own.
    expect(routed(routing, there, pointed('/owners/u2')).commands).toHaveLength(1)
  })

  it('lands what it read as Messages, so the page draws Ready on arrival', async () => {
    const { routing } = routingWith()
    const [command] = routed(routing, home, pointed('/owners/u1')).commands ?? []
    const client = recording()
    const landed = await Effect.runPromise(command!.effect.pipe(Effect.provide(client.layer)))
    expect(client.asked).toEqual(['u1'])
    if (landed._tag !== 'Preloaded') throw new Error(`expected Preloaded, got ${landed._tag}`)
    // Reduced into the Model as it is by then: a draft typed meanwhile is kept.
    const meanwhile: Model = { ...home, draft: 'typed meanwhile' }
    const after = Data.reduce(meanwhile, landed)
    expect(after.draft).toBe('typed meanwhile')
    expect(after.route).toEqual(AppRoute.Home())
    const arrived: Model = { ...after, route: AppRoute.Owner({ ownerId: 'u1' }) }
    expect(OwnerPage.projection({ ownerId: 'u1' }).read(arrived).projects).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ id: 'p1' }, { id: 'p2' }] },
    })
  })

  it('sends each address `links` gives as the intent Message', async () => {
    const { routing } = routingWith(Stream.make(urlOf('/owners/u1'), urlOf('/')))
    const entry = routing.subscriptions!['site.intent']!
    const sent = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream({}, () => ({}))).pipe(
        Effect.provide(recording().layer),
      ),
    )
    expect(sent).toEqual([pointed('/owners/u1'), pointed('/')])
  })

  it('without `preload`, claims and subscribes to nothing more', () => {
    const plain = Site.routing<Model, Message, AppRoute>({
      site: AppSite,
      route: field,
      parse: routeOf,
      tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
      completed: Message.CompletedNavigation,
    })
    expect(plain.handles).toEqual(['ClickedLink', 'ChangedUrl'])
    expect(plain.subscriptions).toBeUndefined()
    expect(plain.reduces(pointed('/owners/u1'))).toBe(false)
  })

  it('refuses an intent that names no message', () => {
    expect(() =>
      Site.routing<Model, Message, AppRoute, RemoteClient>({
        site: AppSite,
        route: field,
        parse: routeOf,
        tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
        completed: Message.CompletedNavigation,
        preload: {
          links: Stream.empty,
          // @ts-expect-error a bare function names no message tag
          intended: ({ url }: { readonly url: UrlValue }) => Message.PointedAtLink({ url }),
          read: there => Data.preload(there, actives),
        },
      }),
    ).toThrow('Site.routing: preload.intended must be a message constructor')
  })
})
