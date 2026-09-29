/**
 * `args` as a factory of the parent seed: static placement config where the
 * child needs static configuration, derived args where its initial state
 * depends on information only the parent knows at startup (route, auth,
 * workspace, ...). A factory runs once per initialization from the same base
 * seed and its result is retained; it never re-runs against live state.
 */
import { Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'

const Route = Schema.Union([
  Schema.TaggedStruct('People', { searchText: Schema.String }),
  Schema.TaggedStruct('Home', {}),
])
type Route = typeof Route.Type

const PeopleModel = Schema.Struct({ searchText: Schema.String, submitted: Schema.String })
type PeopleModel = typeof PeopleModel.Type
const PeopleMessage = defineMessageUnion({
  SearchChanged: { text: Schema.String },
  Submitted: {},
  Reset: {},
})
type PeopleMessage = typeof PeopleMessage.Type

const People = Bundle.make('People', {
  Model: PeopleModel,
  Message: PeopleMessage,
  args: Schema.Struct({ searchText: Schema.String }),
  init: ({ searchText }) => ({ model: { searchText, submitted: '' } }),
  update: (model, message, { searchText }) => {
    switch (message._tag) {
      case 'SearchChanged':
        return { model: { ...model, searchText: message.text } }
      case 'Submitted':
        return { model: { ...model, submitted: model.searchText } }
      case 'Reset':
        return { model: { ...model, searchText } }
    }
  },
})

const searchFromRoute = (route: Route): string => (route._tag === 'People' ? route.searchText : '')

const Model = Schema.Struct({
  route: Route,
  people: PeopleModel,
  ticks: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Ticked: {},
  ...Bundle.declare(People, 'people').cases,
})
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const placePeople = (calls?: { count: number }) =>
  Page.at(Bundle.declare(People, 'people'), {
    args: parent => {
      if (calls !== undefined) calls.count += 1
      return { searchText: searchFromRoute(parent.route) }
    },
  })

describe('args as a factory of the parent seed', () => {
  it('derives init args from the seed rest gives', () => {
    const assembly = Page.assemble(placePeople())
    const alice = assembly.initial({
      route: { _tag: 'People', searchText: 'alice' },
      ticks: 0,
    })
    expect(alice.model.people).toEqual({ searchText: 'alice', submitted: '' })
    const home = assembly.initial({ route: { _tag: 'Home' }, ticks: 0 })
    expect(home.model.people).toEqual({ searchText: '', submitted: '' })
  })

  it('retains the derived args for update instead of re-running the factory', () => {
    const calls = { count: 0 }
    const assembly = Page.assemble(placePeople(calls))
    const first = assembly.initial({ route: { _tag: 'People', searchText: 'alice' }, ticks: 0 })
    expect(calls.count).toBe(1)
    const update = assembly.update()
    const typed = update(first.model, {
      _tag: 'GotPeopleMessage',
      message: PeopleMessage.SearchChanged({ text: 'bob' }),
    })
    expect(typed.model.people.searchText).toBe('bob')
    expect(calls.count).toBe(1)
    // The route moved on, but Reset restores the seed's text, not the new route's.
    const moved: Model = {
      ...typed.model,
      route: { _tag: 'People', searchText: 'carol' },
    }
    const reset = update(moved, { _tag: 'GotPeopleMessage', message: PeopleMessage.Reset() })
    expect(reset.model.people.searchText).toBe('alice')
    expect(calls.count).toBe(1)
  })

  it('sees the same base seed whatever the placement order', () => {
    const CounterModel = Schema.Struct({ count: Schema.Number })
    const CounterMessage = defineMessageUnion({ Incremented: {} })
    const Counter = Bundle.make('Counter', {
      Model: CounterModel,
      Message: CounterMessage,
      args: Schema.Struct({ start: Schema.Number }),
      init: ({ start }) => ({ model: { count: start } }),
      update: model => ({ model: { count: model.count + 1 } }),
    })
    const TwoModel = Schema.Struct({ a: CounterModel, b: CounterModel })
    type TwoModel = typeof TwoModel.Type
    const GotA = Link.wrapper('GotAMessage', CounterMessage)
    const GotB = Link.wrapper('GotBMessage', CounterMessage)
    const TwoMessage = defineMessageUnion({ ...GotA.cases, ...GotB.cases })
    type TwoMessage = typeof TwoMessage.Type
    const readsSibling = (seed: unknown) =>
      (seed as { readonly a?: { readonly count: number } }).a?.count ?? -1
    const a = Counter.at(Link.field<TwoModel>()('a', GotA), { args: { start: 1 } })
    const bFromSibling = () =>
      Counter.at(Link.field<TwoModel>()('b', GotB), {
        args: seed => ({ start: readsSibling(seed) }),
      })
    const first = Bundle.assemble<TwoModel, TwoMessage>()([a, bFromSibling()]).initial({})
    const second = Bundle.assemble<TwoModel, TwoMessage>()([bFromSibling(), a]).initial({})
    expect(first.model.b).toEqual({ count: -1 })
    expect(second.model).toEqual(first.model)
  })

  it('checks a derived result against the args Schema, naming the placement', () => {
    const bad = Page.at(Bundle.declare(People, 'people'), {
      args: () => ({ searchText: 42 }) as unknown as { readonly searchText: string },
    })
    expect(() => Page.assemble(bad).initial({ route: { _tag: 'Home' }, ticks: 0 })).toThrow(
      /People@people: args do not match the bundle's args Schema/,
    )
  })

  it('leaves static args untouched', () => {
    const placed = Page.at(Bundle.declare(People, 'people'), {
      args: { searchText: 'static' },
    })
    expect(placed.hasDynamicArgs).toBe(false)
    expect(
      Page.assemble(placed).initial({ route: { _tag: 'Home' }, ticks: 0 }).model.people,
    ).toEqual({ searchText: 'static', submitted: '' })
    expect(placePeople().hasDynamicArgs).toBe(true)
  })

  it('derives a placement summary from the factory result, for Module', () => {
    const assembly = Page.assemble(placePeople())
    assembly.initial({ route: { _tag: 'People', searchText: 'alice' }, ticks: 0 })
    expect(assembly.placements[0]?.argsSummary).toBe('{"searchText":"alice"}')
  })

  it('derives per use on a Model no initialization produced', () => {
    const calls = { count: 0 }
    const assembly = Page.assemble(placePeople(calls))
    const update = assembly.update()
    const model: Model = {
      route: { _tag: 'People', searchText: 'alice' },
      people: { searchText: 'typed', submitted: '' },
      ticks: 0,
    }
    const reset = update(model, {
      _tag: 'GotPeopleMessage',
      message: PeopleMessage.Reset(),
    })
    // No initialization ran, so Reset restores this Model's own seed, and the
    // factory ran for this update alone, without retaining.
    expect(reset.model.people.searchText).toBe('alice')
    expect(calls.count).toBe(1)
    const moved: Model = { ...model, route: { _tag: 'People', searchText: 'carol' } }
    const resetAgain = update(moved, {
      _tag: 'GotPeopleMessage',
      message: PeopleMessage.Reset(),
    })
    expect(resetAgain.model.people.searchText).toBe('carol')
    expect(calls.count).toBe(2)
  })

  it('resolves a standalone init from the parent minus its own field', () => {
    let sawOwn = false
    const placed = Page.at(Bundle.declare(People, 'people'), {
      args: parent => {
        sawOwn = 'people' in parent
        return { searchText: searchFromRoute(parent.route) }
      },
    })
    const result = placed.init({
      route: { _tag: 'People', searchText: 'alice' },
      people: { searchText: 'stale', submitted: 'stale' },
      ticks: 0,
    })
    expect(result.model.people).toEqual({ searchText: 'alice', submitted: '' })
    expect(sawOwn).toBe(false)
  })
})

describe('a factory feeding Subscriptions', () => {
  const QueryModel = Schema.Struct({ matches: Schema.Boolean })
  type QueryModel = typeof QueryModel.Type
  const QueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
  type QueryMessage = typeof QueryMessage.Type
  const Query = Bundle.make('Query', {
    Model: QueryModel,
    Message: QueryMessage,
    args: Schema.Struct({ query: Schema.String }),
    init: () => ({ model: { matches: false } }),
    update: (model, message) => ({ model: { matches: message.matches } }),
    subscriptions: ({ query }) =>
      Subscription.make<QueryModel, QueryMessage>()(entry => ({
        changes: entry(
          {},
          {
            modelToDependencies: () => ({}),
            dependenciesToStream: () =>
              Stream.make(QueryMessage.Changed({ matches: query.length > 0 })),
          },
        ),
      })),
  })
  const SubModel = Schema.Struct({ filter: Schema.String, query: QueryModel })
  type SubModel = typeof SubModel.Type
  const SubMessage = defineMessageUnion({ ...Bundle.declare(Query, 'query').cases })
  type SubMessage = typeof SubMessage.Type
  const SubPage = Bundle.parent({ Model: SubModel, Message: SubMessage })
  const placeQuery = () =>
    SubPage.at(Bundle.declare(Query, 'query'), {
      args: parent => ({ query: parent.filter }),
    })

  it('builds Subscriptions from the retained args once initial ran', () => {
    const assembly = SubPage.assemble(placeQuery())
    assembly.initial({ filter: '(dark)' })
    expect(Object.keys(assembly.subscriptions())).toEqual(['Query@query/changes'])
  })

  it('says to run initial first when Subscriptions are read too early', () => {
    const assembly = SubPage.assemble(placeQuery())
    expect(() => assembly.subscriptions()).toThrow(/no initialization has derived yet/)
  })
})

describe('a factory on a collection', () => {
  const RowModel = Schema.Struct({ count: Schema.Number })
  const RowMessage = defineMessageUnion({ Incremented: {} })
  const Row = Bundle.make('Row', {
    Model: RowModel,
    Message: RowMessage,
    args: Schema.Struct({ start: Schema.Number }),
    init: ({ start }) => ({ model: { count: start } }),
    update: model => ({ model: { count: model.count + 1 } }),
  })
  const GotRowsMessage = Link.keyedWrapper('GotRowsMessage', RowMessage)
  const RowsModel = Schema.Struct({
    filter: Schema.String,
    rows: Schema.Record(Schema.String, RowModel),
  })
  type RowsModel = typeof RowsModel.Type
  const RowsMessage = defineMessageUnion({ ...GotRowsMessage.cases })
  type RowsMessage = typeof RowsMessage.Type
  const RowsPage = Bundle.parent({ Model: RowsModel, Message: RowsMessage })
  const placeRows = (calls?: { count: number }) =>
    Row.each(Link.collection<RowsModel>()('rows', GotRowsMessage), {
      args: parent => {
        if (calls !== undefined) calls.count += 1
        return { start: parent.filter.length }
      },
    })

  it('ignores a Message for a missing item before any initialization', () => {
    const assembly = RowsPage.assemble(placeRows())
    const parent: RowsModel = { filter: 'ab', rows: {} }
    const result = assembly.update()(parent, GotRowsMessage.make('gone', RowMessage.Incremented()))
    expect(result.model).toBe(parent)
  })

  it('derives item args from the seed once and retains them', () => {
    const calls = { count: 0 }
    const assembly = RowsPage.assemble(placeRows(calls))
    const seeded = assembly.initial({ filter: 'abc' })
    expect(calls.count).toBe(1)
    const rows = assembly.placements[0]
    if (rows === undefined) throw new Error('no placement')
    const added = rows.add('a')(seeded.model)
    expect(added.model.rows).toEqual({ a: { count: 3 } })
    const ticked = assembly.update()(
      added.model,
      GotRowsMessage.make('a', RowMessage.Incremented()),
    )
    expect(ticked.model.rows).toEqual({ a: { count: 4 } })
    expect(calls.count).toBe(1)
  })
})
describe('a factory through assembly.runtime', () => {
  it('derives args for init and Subscriptions from the runtime seed', () => {
    const assembly = Page.assemble(placePeople())
    const config = assembly.runtime({
      initial: { route: { _tag: 'People', searchText: 'alice' }, ticks: 0 },
    })
    expect(config.init().model.people).toEqual({ searchText: 'alice', submitted: '' })
    expect(Object.keys(config.subscriptions)).toEqual([])
  })
})
describe('a factory on an optional child', () => {
  const GotMaybe = Link.wrapper('GotMaybeMessage', PeopleMessage)
  const MaybeModel = Schema.Struct({ maybe: Schema.Option(PeopleModel), ticks: Schema.Number })
  type MaybeModel = typeof MaybeModel.Type
  const MaybeMessage = defineMessageUnion({ ...GotMaybe.cases })
  type MaybeMessage = typeof MaybeMessage.Type
  const MaybePage = Bundle.parent({ Model: MaybeModel, Message: MaybeMessage })
  const calls = { count: 0 }
  const maybe = People.at(Link.optional<MaybeModel>()('maybe', GotMaybe), {
    args: parent => {
      calls.count += 1
      return { searchText: `derived:${parent.ticks}` }
    },
  })

  it('skips the factory when rest starts the child as None', () => {
    const assembly = MaybePage.assemble(maybe)
    const result = assembly.initial({ maybe: Option.none(), ticks: 0 })
    expect(result.model.maybe).toEqual(Option.none())
    expect(calls.count).toBe(0)
  })

  it('derives from the seed when rest leaves the child out', () => {
    const assembly = MaybePage.assemble(maybe)
    const result = assembly.initial({ ticks: 3 })
    expect(result.model.maybe).toEqual(Option.some({ searchText: 'derived:3', submitted: '' }))
    expect(calls.count).toBe(1)
  })
})
