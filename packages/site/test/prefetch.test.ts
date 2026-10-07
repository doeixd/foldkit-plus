/**
 * §31.7: a target prefetches through the exact Surfaces navigation will use.
 *
 * A target's route in a Model, `Site.sourcesFor` for its chain, `Data.satisfy`
 * to fill them: no loader, no second protocol. Hover prefetch and programmatic
 * preload share this composition — the framework owns the topology half, the
 * caller owns the one-line preparation.
 */
import { Effect, Layer, Schema, Stream, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
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
  Archive: { name: Schema.String },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(root, mapTo(AppRoute.Home))
const ownerRouter = pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner))
const archiveRouter = pipe(literal('archive'), slash(string('name')), mapTo(AppRoute.Archive))

const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
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
const ArchivePage = App.surface('ArchivePage', {
  params: { name: Schema.String },
  model: ({ params }) => ({
    projects: Data.query(
      ProjectsByOwner,
      { ownerId: params.name },
      { select: ProjectSummary, first: 10 },
    ),
  }),
})

const HomeNode = Site.route(homeRouter, AppRoute.Home)
const OwnerNode = Site.route(ownerRouter, AppRoute.Owner, {
  surface: { surface: OwnerPage, params: route => ({ ownerId: route.ownerId }) },
})
const ArchiveNode = Site.route(archiveRouter, AppRoute.Archive, {
  surface: { surface: ArchivePage, params: route => ({ name: route.name }) },
})

const AppSite = Site.make(HomeNode, OwnerNode, ArchiveNode)

/** A client that answers its query and records which inputs were asked. */
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

describe('prefetching a target', () => {
  it('fills the destination through its own Sources, and nothing else', async () => {
    const target = Site.target(OwnerNode, { ownerId: 'u1' })
    expect(target.url).toBe('/owners/u1')

    // The caller sets the route; the site says which Sources that activates.
    const there: Model = { route: target.route, remote: Remote.initial }
    const active = Site.sourcesFor(AppSite, App.owner, App.model.route, target.route)
    expect(Object.keys(active)).toEqual(['Owner'])

    const client = recording()
    const prepared = await Effect.runPromise(
      Data.satisfy(there, active).pipe(Effect.provide(client.layer)),
    )

    // Only the destination's query ran, once.
    expect(client.queries).toEqual(['ProjectsByOwner:u1'])
    // And the page navigation will draw reads synchronously: already Ready.
    expect(OwnerPage.projection({ ownerId: 'u1' }).read(prepared).projects).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ id: 'p1' }, { id: 'p2' }] },
    })
    // Satisfied already: preparing again asks nothing.
    const again = await Effect.runPromise(
      Data.satisfy(prepared, active).pipe(Effect.provide(client.layer)),
    )
    expect(again).toBe(prepared)
    expect(client.queries).toHaveLength(1)
  })

  it('fetches no more than satisfying over every Source would', async () => {
    const target = Site.target(ArchiveNode, { name: 'old' })
    const there: Model = { route: target.route, remote: Remote.initial }
    const subset = Site.sourcesFor(AppSite, App.owner, App.model.route, target.route)
    expect(Object.keys(subset)).toEqual(['Archive'])

    const viaSubset = recording()
    const prepared = await Effect.runPromise(
      Data.satisfy(there, subset).pipe(Effect.provide(viaSubset.layer)),
    )
    const viaAll = recording()
    await Effect.runPromise(
      Data.satisfy(there, Site.sources(AppSite, App.owner, App.model.route)).pipe(
        Effect.provide(viaAll.layer),
      ),
    )
    // Off-chain Sources resolve to nothing under the target Model either way.
    expect(viaSubset.queries).toEqual(['ProjectsByOwner:old'])
    expect(viaAll.queries).toEqual(viaSubset.queries)
    expect(ArchivePage.projection({ name: 'old' }).read(prepared).projects).toMatchObject({
      _tag: 'Ready',
    })
  })
})
