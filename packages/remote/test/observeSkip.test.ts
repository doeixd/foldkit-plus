/**
 * `observeEntry` read-plan skipping through `Data.wiring`: a `Surface.when`
 * (whose `activation.path` is declared) reuses its last read plan without
 * re-evaluating its projection while neither the store nor the activation path
 * changes, re-runs as soon as the activation path changes, and an opaque
 * `Surface.at` (unknown reads) never skips.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { askReads } from '../src/active.js'
import { Query, Remote } from '../src/index.js'

const Item = DomainEntity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Summary = DomainEntity.select(Item, { id: true, name: true })
const ById = Query.define('ById', { id: Schema.String }, ({ input }) =>
  Query.from(Item).pipe(
    Query.where(Expr.eq(Item.fields.id, input.id)),
    Query.orderBy(Order.asc(Item.fields.id)),
  ),
)

const DetailRoute = Schema.TaggedStruct('Detail', { id: Schema.String })
const HomeRoute = Schema.TaggedStruct('Home', {})
const Route = Schema.Union([HomeRoute, DetailRoute])

const Model = Schema.Struct({
  filter: Schema.String,
  route: Route,
  remote: Remote.Model,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Filtered: { filter: Schema.String },
  ...Remote.messages,
})

const App = Surface.application({ Model, Message })

const makeDomain = () => Remote.make({ model: App.model.remote, entities: [Item], queries: [ById] })

describe('observeEntry read-plan skipping', () => {
  it('derives declared read paths for Surface.when and undefined for opaque Surface.at', () => {
    const Data = makeDomain()
    const DetailSurface = App.surface('Detail', {
      params: { id: Schema.String },
      model: ({ params }) => ({
        items: Data.query(ById, { id: params.id }, { select: Summary, first: 1 }),
      }),
    })
    const WhenDetail = Surface.when(DetailSurface, App.model.route, DetailRoute, route => ({
      id: route.id,
    }))
    const OpaqueDetail = Surface.at(DetailSurface, model =>
      model.route._tag === 'Detail' ? Option.some({ id: model.route.id }) : Option.none(),
    )

    expect(askReads(WhenDetail)).toEqual([['route']])
    expect(askReads(OpaqueDetail)).toBeUndefined()
  })

  it('skips projection evaluation when unrelated fields change for Surface.when, and re-runs when route changes', () => {
    const Data = makeDomain()
    let whenProjections = 0
    const DetailSurface = App.surface('Detail', {
      params: { id: Schema.String },
      model: ({ params }) => {
        whenProjections++
        return { items: Data.query(ById, { id: params.id }, { select: Summary, first: 1 }) }
      },
    })
    const WhenDetail = Surface.when(DetailSurface, App.model.route, DetailRoute, route => ({
      id: route.id,
    }))
    const wiring = Data.wiring({ detail: WhenDetail }, { now: () => 1000 })
    const readEntry = wiring.subscriptions['detail.read']

    const base: Model = {
      filter: '',
      route: { _tag: 'Detail', id: 'item-1' },
      remote: Remote.initial,
    }
    const first = readEntry.modelToDependencies(base)
    expect(whenProjections).toBe(1)

    // Unrelated field `filter` changes while `route` and `remote` are identical -> skipped!
    const second = readEntry.modelToDependencies({ ...base, filter: 'abc' })
    expect(second).toBe(first)
    expect(whenProjections).toBe(1)

    // `route` changes -> re-runs immediately!
    const third = readEntry.modelToDependencies({
      ...base,
      route: { _tag: 'Detail', id: 'item-2' },
    })
    expect(third).not.toBe(first)
    expect(whenProjections).toBe(2)
  })

  it('never skips projection evaluation for an opaque Surface.at whose reads are unknown', () => {
    const Data = makeDomain()
    let opaqueProjections = 0
    const DetailSurface = App.surface('DetailOpaque', {
      params: { id: Schema.String },
      model: ({ params }) => {
        opaqueProjections++
        return { items: Data.query(ById, { id: params.id }, { select: Summary, first: 1 }) }
      },
    })
    const OpaqueDetail = Surface.at(DetailSurface, model =>
      model.route._tag === 'Detail' ? Option.some({ id: model.route.id }) : Option.none(),
    )
    const wiring = Data.wiring({ opaque: OpaqueDetail }, { now: () => 1000 })
    const readEntry = wiring.subscriptions['opaque.read']

    const base: Model = {
      filter: '',
      route: { _tag: 'Detail', id: 'item-1' },
      remote: Remote.initial,
    }
    readEntry.modelToDependencies(base)
    readEntry.modelToDependencies({ ...base, filter: 'abc' })
    expect(opaqueProjections).toBe(2)
  })
})
