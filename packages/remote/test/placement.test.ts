/**
 * Where one row falls in a loaded list, by the list's declared order: between
 * loaded edges, at an end only a `Terminal` boundary closes, or outside what
 * is loaded. Plan part two, Phase 9.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
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
  placeIn(store, connection, body, {}, entityKey('Project', id))

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
    expect(placeIn(moved, whole, ByRank.body!, {}, 'Project:a')).toEqual(
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

  it('when it was the first edge loaded and moved below it, where rows precede it', () => {
    const moved = storeOf([...rows.filter(([id]) => id !== 'a'), ['a', 5]])
    const loaded = list(segment(['a', 'b', 'c'], cursor, terminal))
    // Its own old edge says nothing of where it is now.
    expect(placeIn(moved, loaded, ByRank.body!, {}, 'Project:a')).toEqual(RowPlace.Outside())
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
    expect(placeIn(down, loaded, ByRankDown.body!, {}, 'Project:n')).toEqual(
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
      placeIn(mixed, list(segment(['odd'], terminal, terminal)), ByRank.body!, {}, 'Project:x')
        ._tag,
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
    expect(placeIn(partial, loaded, ByRank.body!, {}, 'Project:p')).toEqual(
      RowPlace.Unknown({ reason: 'Project:p lacks a field the order reads' }),
    )
    expect(placeIn(partial, loaded, ByRank.body!, {}, 'Project:late')).toEqual(
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
