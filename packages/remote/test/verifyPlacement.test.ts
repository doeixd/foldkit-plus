/**
 * `verifyPlacement`: a placement is made as usual, the list is fetched too,
 * and the server's first page is compared with the order placed, so a
 * collation that drifts is found by a test rather than a reader.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Operators, Order, evaluate } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, type PlacementMismatch, type RemoteModel } from '../src/index.js'

/** The placement mismatches `remote` records, as the facts each names. */
const mismatchesOf = (remote: RemoteModel) =>
  remote.diagnostics
    .filter(
      (diagnostic): diagnostic is PlacementMismatch => diagnostic._tag === 'PlacementMismatch',
    )
    .map(({ connection, placed, served }) => ({ connection, placed, served }))

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

/** Two projects loaded, at 10 and 20, the list ending at `end`. */
const loadedTo = (
  Data: ReturnType<typeof make>,
  end: { readonly _tag: 'Terminal' } | { readonly _tag: 'Cursor'; readonly cursor: string },
): Model => {
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
  return Data.reduce(stored, {
    _tag: 'ConnectionMerged',
    connection: list,
    page: { edges: edges(['p1', 'p2']), start: { _tag: 'Terminal' }, end },
  })
}

/** Two projects loaded, at 10 and 20, and then p1 repriced to 50. */
const repriced = (Data: ReturnType<typeof make>): Model =>
  Data.reduce(loadedTo(Data, { _tag: 'Terminal' }), {
    _tag: 'MutationSucceeded',
    requestId: 'r1',
    entities: [{ entity: 'Project', id: 'p1', values: { price: 50 } }],
    now: 1,
  })

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
    expect(model.remote.placed[list]).toEqual({ order: ['Project:p2', 'Project:p1'], dropped: [] })
  })

  it('records a row placing took out that the server still lists', () => {
    const Data = make(true)
    // The list ends where more rows begin, so a row moved past its last is taken out.
    const moved = Data.reduce(loadedTo(Data, { _tag: 'Cursor', cursor: 'after-p2' }), {
      _tag: 'MutationSucceeded',
      requestId: 'r2',
      entities: [{ entity: 'Project', id: 'p1', values: { price: 60 } }],
      now: 2,
    })
    expect(moved.remote.placed[list]).toEqual({ order: ['Project:p2'], dropped: ['Project:p1'] })
    const checked = served(Data, moved, ['p2', 'p1'])
    expect(mismatchesOf(checked.remote)).toEqual([
      { connection: list, placed: ['Project:p2'], served: ['Project:p2'] },
    ])
  })

  it('records nothing when the server lists the rows as placed, and lets the order go', () => {
    const Data = make(true)
    const checked = served(Data, repriced(Data), ['p2', 'p1'])
    expect(mismatchesOf(checked.remote)).toEqual([])
    expect(checked.remote.placed[list]).toBeUndefined()
  })

  it('records a disagreement with the server’s order', () => {
    const Data = make(true)
    const checked = served(Data, repriced(Data), ['p1', 'p2'])
    expect(mismatchesOf(checked.remote)).toEqual([
      {
        connection: list,
        placed: ['Project:p2', 'Project:p1'],
        served: ['Project:p1', 'Project:p2'],
      },
    ])
    // And it is what an inspection shows, said for a log.
    expect(Data.inspect(checked).diagnostics).toEqual(checked.remote.diagnostics)
    expect(checked.remote.diagnostics[0]).toMatchObject({
      _tag: 'PlacementMismatch',
      source: 'foldkit-remote',
      level: 'warning',
      message: `The client placed rows in ${list} as [Project:p2, Project:p1], and the server's first page lists [Project:p1, Project:p2]: the client's order and the server's disagree.`,
    })
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
    expect(read.remote.placed[list]).toEqual({ order: ['Project:p1', 'Project:p2'], dropped: [] })
  })

  it('forgets a placement once retention drops its list, before its page came (#273)', () => {
    const Data = make(true)
    const placed = repriced(Data)
    expect(Object.keys(placed.remote.placed)).toEqual([list])
    const dropped = Data.reduce(placed, {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [] },
    })
    expect(dropped.remote.connections[list]).toBeUndefined()
    expect(dropped.remote.placed).toEqual({})
  })

  it('without it, places and fetches nothing', () => {
    const model = repriced(make(false))
    expect(order(model.remote)).toEqual(['p2', 'p1'])
    expect(model.remote.connections[list]!.stale).toBe(false)
    expect(model.remote.placed).toEqual({})
  })
})

describe('verifyPlacement over a list ordered by a call', () => {
  /** How far a price lies from a target. */
  const distance = Expr.operator('acme.distance', {
    input: [Schema.Number, Schema.Number],
    output: Schema.Number,
  })
  const Nearest = Query.define('Nearest', { target: Schema.Number }, ({ input }) =>
    Query.from(Project).pipe(
      Query.orderBy(Order.asc(distance(Project.fields.price, input.target))),
    ),
  )
  const table = (run: (price: number, target: number) => number) =>
    Operators.memory(Operators.implement(distance, run))
  const client = table((price, target) => Math.abs(price - target))
  const Data = Remote.make({
    model: App.model.remote,
    entities: [Project],
    queries: [Nearest],
    verifyPlacement: true,
    operators: client,
  })
  const nearest = Nearest.ref({ target: 12 }).identity
  const rows = [
    { id: 'p1', price: 10 },
    { id: 'p2', price: 20 },
    { id: 'p3', price: 1 },
  ]
  /** The list as a server running `server` lists it, from these rows. */
  const page = (server: ReturnType<typeof table>, held: ReadonlyArray<(typeof rows)[number]>) =>
    edges(
      evaluate(Nearest.body!, { target: 12 }, held, { operators: server }).map(row =>
        String(row.id),
      ),
    )
  const moved = rows.map(row => (row.id === 'p2' ? { ...row, price: 13 } : row))

  /** p2 moved to 13 by a write; the list placed it, then the server answers its fetch. */
  const checked = (server: ReturnType<typeof table>) => {
    const stored = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: rows.map(row => ({ entity: 'Project', id: row.id, fields: ['id', 'price'] })),
        result: {
          settled: [],
          entities: rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
        },
        now: 0,
      },
    )
    const loaded = Data.reduce(stored, {
      _tag: 'ConnectionMerged',
      connection: nearest,
      page: { edges: page(server, rows), start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
    })
    const written = Data.reduce(loaded, {
      _tag: 'MutationSucceeded',
      requestId: 'r1',
      entities: [{ entity: 'Project', id: 'p2', values: { price: 13 } }],
      now: 1,
    })
    return {
      placed: written.remote.placed[nearest],
      mismatches: mismatchesOf(
        Data.reduce(written, {
          _tag: 'ConnectionMerged',
          connection: nearest,
          refreshes: true,
          page: {
            edges: page(server, moved),
            start: { _tag: 'Terminal' },
            end: { _tag: 'Terminal' },
          },
        }).remote,
      ),
    }
  }

  it('records nothing when the server orders by the same call', () => {
    const { placed, mismatches } = checked(client)
    // From 12: p2 at 13 is 1 away, p1 2 and p3 11.
    expect(placed).toEqual({ order: ['Project:p2', 'Project:p1', 'Project:p3'], dropped: [] })
    expect(mismatches).toEqual([])
  })

  it('records a server whose implementation orders the call differently', () => {
    // Signed, not absolute: the server lists p3 (1 - 12) first.
    expect(checked(table((price, target) => price - target)).mismatches).toEqual([
      {
        connection: nearest,
        placed: ['Project:p2', 'Project:p3', 'Project:p1'],
        served: ['Project:p3', 'Project:p1', 'Project:p2'],
      },
    ])
  })
})
