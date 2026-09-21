/**
 * data-query-DESIGN §32 Phase 5: route -> Surface -> read requirement, proved
 * with the Router and Surface that already exist rather than anything new.
 *
 * The claim is that routing describes URL state and owns no data loading. A URL
 * parses to a route, the route lives in the Model, `Surface.at` reads it for
 * params or for inactivity, and Remote follows that activation — so navigating
 * is the only thing an application does, and the reads start and stop as a
 * consequence.
 *
 * Every line the design asks to verify is asserted here:
 *
 *   URL parses to AppRoute                        `urlToRoute`
 *   AppRoute lives in Model                       `Model.route`
 *   Surface.at derives params or inactivity       `active`
 *   Data.subscriptions follows Surface activation the dependency assertions
 *   query input comes from Surface params         `ProjectsByOwner` below
 *   navigating away releases read/live/retain     the last two tests
 */
import { Option, Schema, pipe } from 'effect'
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
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, connectionsOf, requirementsOf } from '../src/index.js'

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

// 1. The URL's shape as typed values, and the parser from one to the other.
const AppRoute = defineRouteUnion({
  Home: {},
  Owner: { ownerId: Schema.String },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

// `/owners/:ownerId`, and `/`.
const ownerRouter = pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner))
const homeRouter = pipe(root, mapTo(AppRoute.Home))

const urlToRoute = parseUrlWithFallback(oneOf(ownerRouter, homeRouter), AppRoute.NotFound)

const routeOf = (path: string): AppRoute => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return urlToRoute(url.value)
}

// 2. The route lives in the Model, beside Remote's submodel and nothing else.
const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })

const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

// 3. One Surface, parameterised by what the route carries. Its query's input is
//    that param: the route is where the input comes from, not a second source.
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

/** Params when the route is an owner's, and inactivity otherwise. */
const active = Surface.at(OwnerPage, (model: Model) =>
  model.route._tag === 'Owner' ? { ownerId: model.route.ownerId } : undefined,
)

const at = (path: string): Model => ({ route: routeOf(path), remote: Remote.initial })
const entries = Data.subscriptions({ page: active })
const read = entries['page.read']
const retain = entries.retain

describe('A URL parses to a route, and the route is all the application changes', () => {
  it.each([
    { path: '/', tag: 'Home' },
    { path: '/owners/u1', tag: 'Owner' },
    { path: '/nowhere', tag: 'NotFound' },
  ])('parses $path as $tag', ({ path, tag }) => {
    expect(routeOf(path)._tag).toBe(tag)
  })

  it('carries the param through to the route value', () => {
    const route = routeOf('/owners/u1')
    expect(route).toEqual({ _tag: 'Owner', ownerId: 'u1' })
  })
})

describe('The Surface follows the route, and Remote follows the Surface', () => {
  it('asks for nothing at a route the page is not on', () => {
    const deps = read.modelToDependencies(at('/'))

    expect(deps.requirements).toEqual([])
    expect(deps.queries).toEqual([])
  })

  it('asks for the connection the route names, with the route as its input', () => {
    const deps = read.modelToDependencies(at('/owners/u1'))

    expect(deps.queries).toHaveLength(1)
    // The query's identity is its name and its canonical input — the input
    // being the value the URL carried.
    expect(deps.queries[0]!.identity).toBe(ProjectsByOwner.ref({ ownerId: 'u1' }).identity)
  })

  it('asks for a different connection when the URL names a different owner', () => {
    const one = read.modelToDependencies(at('/owners/u1'))
    const two = read.modelToDependencies(at('/owners/u2'))

    expect(two.queries[0]!.identity).not.toBe(one.queries[0]!.identity)
  })

  it('stops asking when the route leaves the page', () => {
    const on = read.modelToDependencies(at('/owners/u1'))
    const away = read.modelToDependencies(at('/'))

    expect(on.queries).toHaveLength(1)
    expect(away.queries).toEqual([])
    expect(away.requirements).toEqual([])
  })

  it('holds the connection as a retention root while the route is on it, and drops it after', () => {
    const on = retain.modelToDependencies(at('/owners/u1'))
    const away = retain.modelToDependencies(at('/'))

    expect(on.connections.map((c: { identity: string }) => c.identity)).toEqual([
      ProjectsByOwner.ref({ ownerId: 'u1' }).identity,
    ])
    expect(away.connections).toEqual([])
  })
})

describe('What the route does not do', () => {
  it('declares the requirement without fetching: reading a Projection is pure', () => {
    const model = at('/owners/u1')
    const projection = OwnerPage.projection({ ownerId: 'u1' })

    // Nothing has run, so the page is simply not known yet.
    expect(projection.read(model).projects).toEqual({ _tag: 'Initial' })
    // And the requirement is on the Projection, not in a loader beside the route.
    expect(connectionsOf(projection)).toHaveLength(1)
    expect(requirementsOf(projection)).toEqual([])
  })

  it('keeps the route a plain value: two reads of one URL are one route', () => {
    expect(routeOf('/owners/u1')).toEqual(routeOf('/owners/u1'))
  })
})
