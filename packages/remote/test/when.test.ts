/**
 * Why a Surface is active, as a value rather than a callback.
 *
 * local-execution-DESIGN phase 5, closing data-query-DESIGN §31.10 and the one
 * line §29.1 asked for that `Data.explain` could not report.
 *
 * `Surface.at` takes an arbitrary function of the Model. That is correct and
 * opaque: nothing can say *why* a Surface is on without running it, so there is
 * no route-to-Surface manifest, no prefetch analysis, and no heading on an
 * explanation. `Surface.when` says the same thing with the place and the tag as
 * values.
 *
 * The other half matters as much: a Projection cannot carry which Surface reads
 * it, because several may. So `explain` is *given* the active Surfaces — the
 * same record `subscriptions` takes — and reports all of them.
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
import { Query, Remote, connectionsOf } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

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

const urlToRoute = parseUrlWithFallback(
  oneOf(
    pipe(literal('owners'), slash(string('ownerId')), mapTo(AppRoute.Owner)),
    pipe(root, mapTo(AppRoute.Home)),
  ),
  AppRoute.NotFound,
)

const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

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
      { select: Summary, first: 10 },
    ),
  }),
})

/** The same activation, said twice: as a callback, and as values. */
const byCallback = Surface.at(OwnerPage, (model: Model) =>
  model.route._tag === 'Owner' ? { ownerId: model.route.ownerId } : undefined,
)
const byTag = Surface.when(OwnerPage, App.model.route, AppRoute.Owner, route => ({
  ownerId: route.ownerId,
}))

const at = (path: string): Model => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return { route: urlToRoute(url.value), remote: Remote.initial }
}

const projects = (ownerId: string) =>
  Data.query(ProjectsByOwner, { ownerId }, { select: Summary, first: 10 })

describe('Surface.when activates exactly as Surface.at did', () => {
  it.each(['/owners/u1', '/', '/nowhere'])('agrees about %s', path => {
    const model = at(path)
    const callback = byCallback.projectionOf(model)
    const tagged = byTag.projectionOf(model)

    expect(tagged === undefined).toBe(callback === undefined)
    if (tagged !== undefined && callback !== undefined) {
      expect(connectionsOf(tagged)).toEqual(connectionsOf(callback))
    }
  })

  it('passes the tagged value to the params, so the route feeds the query', () => {
    const projection = byTag.projectionOf(at('/owners/u7'))

    expect(connectionsOf(projection!)[0]!.identity).toBe(
      ProjectsByOwner.ref({ ownerId: 'u7' }).identity,
    )
  })
})

describe('What Surface.when says that Surface.at cannot', () => {
  it('names the place and the tag, without running anything', () => {
    expect(byTag.activation).toEqual({ path: ['route'], tag: 'Owner' })
  })

  it('leaves a callback placement with nothing to read, which is honest', () => {
    expect(byCallback.activation).toBeUndefined()
  })

  it('is not router-specific: any tagged value at any path activates', () => {
    // A route is one kind of tagged Model state. Nothing here knows about URLs.
    const Mode = defineMessageUnion({ Editing: { id: Schema.String }, Idle: {} })
    const Shell = Schema.Struct({ mode: Mode, remote: Remote.Model })
    const ShellApp = Surface.application({
      Model: Shell,
      Message: defineMessageUnion({ ...Remote.messages }),
    })
    const ShellData = Remote.make({
      model: ShellApp.model.remote,
      entities: [Project],
      queries: [ProjectsByOwner],
    })
    const Editor = ShellApp.surface('Editor', {
      params: { id: Schema.String },
      model: ({ params }) => ({
        projects: ShellData.query(
          ProjectsByOwner,
          { ownerId: params.id },
          { select: Summary, first: 10 },
        ),
      }),
    })
    const active = Surface.when(Editor, ShellApp.model.mode, Mode.Editing, mode => ({
      id: mode.id,
    }))

    expect(active.activation).toEqual({ path: ['mode'], tag: 'Editing' })
    expect(active.projectionOf({ mode: Mode.Idle(), remote: Remote.initial })).toBeUndefined()
    expect(
      active.projectionOf({ mode: Mode.Editing({ id: 'p1' }), remote: Remote.initial }),
    ).toBeDefined()
  })

  it('refuses something that is not tagged, naming the Surface', () => {
    expect(() =>
      Surface.when(OwnerPage, App.model.route, {} as never, () => ({ ownerId: 'u1' })),
    ).toThrow('Surface.when: expected a tagged constructor for "OwnerPage"')
  })
})

describe('An explanation can finally name its Surface', () => {
  const actives = { page: byTag }

  it('reports the Surfaces reading the connection, and why each is active', () => {
    const explained = Data.explain(at('/owners/u1'), projects('u1'), { surfaces: actives })

    expect(explained.surfaces).toEqual(['OwnerPage'])
    expect(explained.activation).toEqual([{ surface: 'OwnerPage', path: ['route'], tag: 'Owner' }])
  })

  it('reports none where the Surface is inactive, rather than guessing', () => {
    const explained = Data.explain(at('/'), projects('u1'), { surfaces: actives })

    expect(explained.surfaces).toEqual([])
  })

  it('reports none for a connection no active Surface reads', () => {
    // The Surface is on, but for a different owner: a different connection.
    const explained = Data.explain(at('/owners/u1'), projects('u2'), { surfaces: actives })

    expect(explained.surfaces).toEqual([])
  })

  it('names every Surface reading one connection, not the first', () => {
    const second = Surface.when(OwnerPage, App.model.route, AppRoute.Owner, route => ({
      ownerId: route.ownerId,
    }))
    const explained = Data.explain(at('/owners/u1'), projects('u1'), {
      surfaces: { page: byTag, panel: second },
    })

    expect(explained.surfaces).toEqual(['OwnerPage', 'OwnerPage'])
  })

  it('omits the members entirely when it was given no Surfaces', () => {
    const explained = Data.explain(at('/owners/u1'), projects('u1'))

    expect(explained).not.toHaveProperty('surfaces')
    expect(explained).not.toHaveProperty('activation')
  })

  it('has a Surface but no activation for a callback placement', () => {
    const explained = Data.explain(at('/owners/u1'), projects('u1'), {
      surfaces: { page: byCallback },
    })

    expect(explained.surfaces).toEqual(['OwnerPage'])
    expect(explained.activation).toEqual([])
  })
})
