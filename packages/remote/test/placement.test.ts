/**
 * Where one row falls in a loaded list, by the list's declared order: between
 * loaded edges, at an end only a `Terminal` boundary closes, or outside what
 * is loaded. Plan part two, Phase 9.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Operators, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  RemoteConnections,
  RowPlace,
  entityKey,
  placeIn,
  type Boundary,
  type Connection,
} from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, rank: Schema.Number }),
)
const ByRank = Query.define('ByRank', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.rank))),
)
const ByRankDown = Query.define('ByRankDown', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.desc(Project.fields.rank))),
)
const ByName = Query.define('ByName', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.name))),
)
/** Ranked projects by name: text with no collation, so never placed, though it filters on rank. */
const RankedByName = Query.define('RankedByName', {}, () =>
  Query.from(Project).pipe(
    Query.where(Expr.isNotNull(Project.fields.rank)),
    Query.orderBy(Order.asc(Project.fields.name)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ ...Remote.messages }),
})
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ByRank, ByRankDown, ByName, RankedByName],
})

/** The store holding these rows, each `[id, rank]`; a rank of null is a row without one. */
const storeOf = (rows: ReadonlyArray<readonly [string, number | null]>) =>
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: rows.map(([id]) => ({ entity: 'Project', id, fields: ['id', 'name', 'rank'] })),
      result: {
        settled: [],
        entities: rows.map(([id, rank]) => ({
          entity: 'Project',
          id,
          values: { id, name: id, rank },
        })),
      },
      now: 0,
    },
  ).remote.entities

const terminal: Boundary = { _tag: 'Terminal' }
const cursor: Boundary = { _tag: 'Cursor', cursor: 'c' }
const gap: Boundary = { _tag: 'Unknown' }

/** One segment of these ids, between these boundaries. */
const segment = (ids: ReadonlyArray<string>, start: Boundary, end: Boundary) => ({
  edges: ids.map(id => ({ key: entityKey('Project', id), ref: { entity: 'Project', id } })),
  start,
  end,
})
const list = (...segments: ReturnType<typeof segment>[]): Connection => ({
  segments,
  stale: false,
})

const rows = [
  ['a', 10],
  ['b', 20],
  ['c', 30],
  ['x', 15],
  ['early', 5],
  ['late', 50],
] as const
const store = storeOf(rows)
const at = (connection: Connection, id: string, body = ByRank.body!) =>
  placeIn(store, connection, body, {}, entityKey('Project', id), Operators.kernel)

describe('a row is placed between the edges a list has loaded', () => {
  const whole = list(segment(['a', 'b', 'c'], terminal, terminal))

  it('before the first edge it sorts ahead of', () => {
    expect(at(whole, 'x')).toEqual(RowPlace.Before({ segment: 0, edge: 'Project:b' }))
  })

  it('at either end of a list that both ends close', () => {
    expect(at(whole, 'early')).toEqual(RowPlace.Before({ segment: 0, edge: 'Project:a' }))
    expect(at(whole, 'late')).toEqual(RowPlace.End({ segment: 0 }))
  })

  it('where it goes now when it is one of the list’s own rows that moved', () => {
    const moved = storeOf([...rows.filter(([id]) => id !== 'a'), ['a', 25]])
    expect(placeIn(moved, whole, ByRank.body!, {}, 'Project:a', Operators.kernel)).toEqual(
      RowPlace.Before({ segment: 0, edge: 'Project:c' }),
    )
  })

  it('in an empty list that both ends close', () => {
    expect(at(list(segment([], terminal, terminal)), 'x')).toEqual(RowPlace.End({ segment: 0 }))
  })
})

describe('a row past what a list has loaded is outside it', () => {
  it('after the last edge, when more rows follow', () => {
    expect(at(list(segment(['a', 'b', 'c'], terminal, cursor)), 'late')).toEqual(RowPlace.Outside())
  })

  it('before the first edge, when rows precede it', () => {
    expect(at(list(segment(['a', 'b', 'c'], cursor, terminal)), 'early')).toEqual(
      RowPlace.Outside(),
    )
    // Between two loaded edges is loaded, whatever precedes the segment.
    expect(at(list(segment(['a', 'b', 'c'], cursor, terminal)), 'x')).toEqual(
      RowPlace.Before({ segment: 0, edge: 'Project:b' }),
    )
  })

  it('not at all when it was where its page met rows not loaded, and moved', () => {
    // a began a page after rows not loaded, and b ended one before them: each
    // was the boundary, and its old keys are gone, so whether it moved past
    // that boundary cannot be told.
    const first = storeOf([...rows.filter(([id]) => id !== 'a'), ['a', 5]])
    expect(
      placeIn(
        first,
        list(segment(['a', 'b', 'c'], cursor, terminal)),
        ByRank.body!,
        {},
        'Project:a',
        Operators.kernel,
      ),
    ).toMatchObject({ _tag: 'Unknown' })
    const last = storeOf([...rows.filter(([id]) => id !== 'c'), ['c', 25]])
    expect(
      placeIn(
        last,
        list(segment(['a', 'b', 'c'], terminal, cursor)),
        ByRank.body!,
        {},
        'Project:c',
        Operators.kernel,
      ),
    ).toMatchObject({ _tag: 'Unknown' })
    // Any other row past a boundary is outside, as ever.
    expect(at(list(segment(['a', 'b'], terminal, cursor)), 'late')).toEqual(RowPlace.Outside())
  })

  it('in the gap between two loaded segments', () => {
    const gapped = list(segment(['a'], terminal, gap), segment(['c'], gap, terminal))
    expect(at(gapped, 'b')).toEqual(RowPlace.Outside())
    expect(at(gapped, 'late')).toEqual(RowPlace.End({ segment: 1 }))
    expect(at(gapped, 'early')).toEqual(RowPlace.Before({ segment: 0, edge: 'Project:a' }))
  })
})

describe('a row is placed by the order as declared', () => {
  it('descending, nulls first', () => {
    const down = storeOf([
      ['a', 30],
      ['b', 10],
      ['n', null],
    ])
    const loaded = list(segment(['a', 'b'], terminal, terminal))
    expect(placeIn(down, loaded, ByRankDown.body!, {}, 'Project:n', Operators.kernel)).toEqual(
      RowPlace.Before({ segment: 0, edge: 'Project:a' }),
    )
  })
})

describe('what cannot be judged exactly is Unknown, with why', () => {
  it('keys of kinds that do not compare', () => {
    const mixed = Data.reduce(
      { remote: { ...Remote.initial, entities: store } },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'odd', fields: ['id', 'name', 'rank'] }],
        result: {
          settled: [],
          entities: [
            { entity: 'Project', id: 'odd', values: { id: 'odd', name: 'odd', rank: 'ten' } },
          ],
        },
        now: 0,
      },
    ).remote.entities
    expect(
      placeIn(
        mixed,
        list(segment(['odd'], terminal, terminal)),
        ByRank.body!,
        {},
        'Project:x',
        Operators.kernel,
      )._tag,
    ).toBe('Unknown')
  })

  it('a list ordered by text with no declared collation', () => {
    expect(at(list(segment(['a'], terminal, terminal)), 'x', ByName.body!)).toEqual(
      RowPlace.Unknown({ reason: 'it orders by Project.name, text with no declared collation' }),
    )
  })

  it('a row, or a loaded edge, lacking a field the order reads', () => {
    const partial = Data.reduce(
      { remote: { ...Remote.initial, entities: store } },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'p', fields: ['id', 'name'] }],
        result: {
          settled: [],
          entities: [{ entity: 'Project', id: 'p', values: { id: 'p', name: 'p' } }],
        },
        now: 0,
      },
    ).remote.entities
    const loaded = list(segment(['a', 'p', 'c'], terminal, terminal))
    expect(placeIn(partial, loaded, ByRank.body!, {}, 'Project:p', Operators.kernel)).toEqual(
      RowPlace.Unknown({ reason: 'Project:p lacks a field the order reads' }),
    )
    expect(placeIn(partial, loaded, ByRank.body!, {}, 'Project:late', Operators.kernel)).toEqual(
      RowPlace.Unknown({ reason: 'Project:p lacks a field the order reads' }),
    )
  })
})

describe('a list a client can place rows in reads what its order needs', () => {
  const Summary = DomainEntity.select(Project, { id: true, name: true })
  const fieldsOf = (query: typeof ByRank | typeof RankedByName) =>
    RemoteConnections.get(Data.query(query, {}, { select: Summary, first: 5 }).metadata)[0]!.select
      .fields

  it('asks for the order’s fields beside what the view selects', () => {
    expect(fieldsOf(ByRank)).toEqual(['id', 'name', 'rank'])
  })

  it('asks for nothing more when the client cannot place rows anyway', () => {
    expect(fieldsOf(RankedByName)).toEqual(['id', 'name'])
  })
})

describe('a row whose Selection stored no id', () => {
  // Ranks only: a Selection that never asked for `id`. The order ties on rank
  // and breaks by id, which each row's key holds.
  const ranked = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: ['a', 'b', 'x'].map(id => ({ entity: 'Project', id, fields: ['rank'] })),
      result: {
        settled: [],
        entities: [
          { entity: 'Project', id: 'a', values: { rank: 10 } },
          { entity: 'Project', id: 'b', values: { rank: 10 } },
          { entity: 'Project', id: 'x', values: { rank: 10 } },
        ],
      },
      now: 0,
    },
  ).remote.entities

  it('is placed by the id its key holds', () => {
    const whole = list(segment(['a', 'b'], terminal, terminal))
    expect(
      placeIn(ranked, whole, ByRank.body!, {}, entityKey('Project', 'x'), Operators.kernel),
    ).toEqual(RowPlace.End({ segment: 0 }))
    const before = list(segment(['b', 'x'], terminal, terminal))
    expect(
      placeIn(ranked, before, ByRank.body!, {}, entityKey('Project', 'a'), Operators.kernel),
    ).toEqual(RowPlace.Before({ segment: 0, edge: 'Project:b' }))
  })
})

describe('a row with a number id', () => {
  const Item = DomainEntity.define(
    'Item',
    Schema.Struct({ id: Schema.Number, rank: Schema.Number }),
  )
  const Newest = Query.define('Newest', {}, () =>
    Query.from(Item).pipe(Query.orderBy(Order.desc(Item.fields.id))),
  )
  const Items = Remote.make({ model: App.model.remote, entities: [Item], queries: [Newest] })
  const items = Items.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [8, 9, 10].map(id => ({ entity: 'Item', id: String(id), fields: ['id', 'rank'] })),
      result: {
        settled: [],
        entities: [8, 9, 10].map(id => ({
          entity: 'Item',
          id: String(id),
          values: { id, rank: 0 },
        })),
      },
      now: 0,
    },
  ).remote.entities

  it('is ordered by its number, never by its key as text', () => {
    const loaded: Connection = {
      segments: [
        {
          edges: [9, 8].map(id => ({
            key: entityKey('Item', String(id)),
            ref: { entity: 'Item', id: String(id) },
          })),
          start: terminal,
          end: terminal,
        },
      ],
      stale: false,
    }
    // As text, '10' sorts below '9' and '8'; as a number it comes first.
    expect(placeIn(items, loaded, Newest.body!, {}, 'Item:10', Operators.kernel)).toEqual(
      RowPlace.Before({ segment: 0, edge: 'Item:9' }),
    )
    // Read without its id, a row's key is text, and its number is not known.
    const unread = Items.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Item', id: '11', fields: ['rank'] }],
        result: { settled: [], entities: [{ entity: 'Item', id: '11', values: { rank: 0 } }] },
        now: 0,
      },
    ).remote.entities
    expect(placeIn(unread, loaded, Newest.body!, {}, 'Item:11', Operators.kernel)).toMatchObject({
      _tag: 'Unknown',
    })
  })
})
