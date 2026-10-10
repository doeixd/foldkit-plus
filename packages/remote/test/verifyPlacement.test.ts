/**
 * `verifyPlacement`: a placement is made as usual, the list is fetched too,
 * and the server's first page is compared with the order placed, so a
 * collation that drifts is found by a test rather than a reader.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, type RemoteModel } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, price: Schema.Number }),
)
const ByPrice = Query.define('ByPrice', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.price))),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const make = (verifyPlacement: boolean) =>
  Remote.make({ model: App.model.remote, entities: [Project], queries: [ByPrice], verifyPlacement })

const list = ByPrice.ref({}).identity
const edges = (ids: ReadonlyArray<string>) =>
  ids.map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } }))

/** Two projects loaded, at 10 and 20, and then p1 repriced to 50. */
const repriced = (Data: ReturnType<typeof make>): Model => {
  const stored = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: ['p1', 'p2'].map(id => ({ entity: 'Project', id, fields: ['id', 'price'] })),
      result: {
        settled: [],
        entities: [
          { entity: 'Project', id: 'p1', values: { id: 'p1', price: 10 } },
          { entity: 'Project', id: 'p2', values: { id: 'p2', price: 20 } },
        ],
      },
      now: 0,
    },
  )
  const loaded = Data.reduce(stored, {
    _tag: 'ConnectionMerged',
    connection: list,
    page: { edges: edges(['p1', 'p2']), start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
  })
  return Data.reduce(loaded, {
    _tag: 'MutationSucceeded',
    requestId: 'r1',
    entities: [{ entity: 'Project', id: 'p1', values: { price: 50 } }],
    now: 1,
  })
}

/** The server's page for the list, answering its fetch. */
const served = (Data: ReturnType<typeof make>, model: Model, ids: ReadonlyArray<string>) =>
  Data.reduce(model, {
    _tag: 'ConnectionMerged',
    connection: list,
    refreshes: true,
    page: { edges: edges(ids), start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
  })

const order = (remote: RemoteModel) =>
  make(false)
    .visibleItems(remote, list)
    .map(edge => edge.ref.id)

describe('verifyPlacement', () => {
  it('places, and also fetches the list, keeping the order it placed', () => {
    const Data = make(true)
    const model = repriced(Data)
    expect(order(model.remote)).toEqual(['p2', 'p1'])
    expect(model.remote.connections[list]!.stale).toBe(true)
    expect(model.remote.placed[list]).toEqual(['Project:p2', 'Project:p1'])
  })

  it('records nothing when the server lists the rows as placed, and lets the order go', () => {
    const Data = make(true)
    const checked = served(Data, repriced(Data), ['p2', 'p1'])
    expect(checked.remote.placementMismatches).toEqual([])
    expect(checked.remote.placed[list]).toBeUndefined()
  })

  it('records a disagreement with the server’s order', () => {
    const Data = make(true)
    const checked = served(Data, repriced(Data), ['p1', 'p2'])
    expect(checked.remote.placementMismatches).toEqual([
      {
        connection: list,
        placed: ['Project:p2', 'Project:p1'],
        served: ['Project:p1', 'Project:p2'],
      },
    ])
    // And it is what an inspection shows.
    expect(Data.inspect(checked).placementMismatches).toEqual(checked.remote.placementMismatches)
  })

  it('checks a placement a read made, as an answer’s', () => {
    const Data = make(true)
    const loaded = Data.reduce(repriced(Data), {
      _tag: 'ConnectionMerged',
      connection: list,
      refreshes: true,
      page: { edges: edges(['p2', 'p1']), start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
    })
    const read = Data.reduce(loaded, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'p2', fields: ['price'] }],
      result: {
        settled: [],
        entities: [{ entity: 'Project', id: 'p2', values: { id: 'p2', price: 90 } }],
      },
      now: 2,
    })
    expect(order(read.remote)).toEqual(['p1', 'p2'])
    expect(read.remote.connections[list]!.stale).toBe(true)
    expect(read.remote.placed[list]).toEqual(['Project:p1', 'Project:p2'])
  })

  it('without it, places and fetches nothing', () => {
    const model = repriced(make(false))
    expect(order(model.remote)).toEqual(['p2', 'p1'])
    expect(model.remote.connections[list]!.stale).toBe(false)
    expect(model.remote.placed).toEqual({})
  })
})
