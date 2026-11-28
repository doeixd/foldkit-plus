/**
 * A Site node whose Surface reads the viewer: the read entry plans again when
 * only the viewer changes. Its `activation` names the route, which is not all
 * the ask reads, so `Data.wiring` must not reuse the plan on the route and the
 * Remote store alone.
 */
import { Option, Schema, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion, literal, mapTo, root } from 'foldkit/route'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Query, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const Item = DomainEntity.define('Item', Schema.Struct({ id: Schema.String, owner: Schema.String }))
const Summary = DomainEntity.select(Item, { id: true, owner: true })
const OwnedBy = Query.define('OwnedBy', { owner: Schema.String }, ({ input }) =>
  Query.from(Item).pipe(
    Query.where(Expr.eq(Item.fields.owner, input.owner)),
    Query.orderBy(Order.asc(Item.fields.id)),
  ),
)

const AppRoute = defineRouteUnion({ Home: {}, About: {} })
const homeRouter = pipe(root, mapTo(AppRoute.Home))
const aboutRouter = pipe(literal('about'), mapTo(AppRoute.About))

const Model = Schema.Struct({
  route: AppRoute,
  signedIn: Schema.Option(Schema.String),
  remote: Remote.Model,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Noted: {}, ...Remote.messages })
const App = Surface.application({ Model, Message })

describe('a Site node that reads the viewer', () => {
  const Data = Remote.make({ model: App.model.remote, entities: [Item], queries: [OwnedBy] })
  let projections = 0
  const Feed = App.surface('Feed', {
    params: { owner: Schema.String },
    model: ({ params }) => {
      projections++
      return { items: Data.query(OwnedBy, { owner: params.owner }, { select: Summary }) }
    },
  })
  const site = Site.make(
    Site.route(homeRouter, AppRoute.Home, {
      surface: {
        surface: Feed,
        viewer: (model: Model) => Option.map(model.signedIn, id => id),
        params: (_, me) => ({ owner: me }),
      },
    }),
    Site.route(aboutRouter, AppRoute.About, {}),
  )
  const sources = Site.sources(site, App.owner, App.model.route)
  const wiring = Data.wiring(sources, { now: () => 1000 })
  const readEntry = wiring.subscriptions['Home.read']

  it('plans its read again when only the viewer changes', () => {
    const base: Model = { route: { _tag: 'Home' }, signedIn: Option.none(), remote: Remote.initial }
    const before = readEntry.modelToDependencies(base)
    expect(before.queries).toEqual([])

    const after = readEntry.modelToDependencies({ ...base, signedIn: Option.some('ada') })
    expect(after.queries).toHaveLength(1)

    const other = readEntry.modelToDependencies({ ...base, signedIn: Option.some('bob') })
    expect(other.queries).toHaveLength(1)
    expect(other.queries[0]).not.toEqual(after.queries[0])
    expect(projections).toBeGreaterThan(0)
  })
})
