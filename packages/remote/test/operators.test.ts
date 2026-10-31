/**
 * A list whose body calls an application's operator, judged on the client by
 * the table `Remote.make` is given: expr-operations-DESIGN §5.5. Without the
 * table the client cannot judge the row, so it falls back on the server.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  Entity as DomainEntity,
  Expr,
  Operators,
  Order,
  Write,
  type MemoryOperators,
} from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, entityKey, optimisticOfWrite } from '../src/index.js'
import { live as readLive } from '../src/live.js'
import { Answers } from './answers.js'
import { overlay } from '../src/overlay.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, price: Schema.Number }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

const above = Expr.operator('acme.above', {
  input: [Schema.Number, Schema.Number],
  output: Schema.Boolean,
})
const table = Operators.memory(Operators.implement(above, (price, floor) => price > floor))

const Above = Query.define('Above', { floor: Schema.Number }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(above(Project.fields.price, input.floor)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

const remote = (operators?: MemoryOperators) => {
  const Data = Remote.make({
    mutations: [Answers],
    model: App.model.remote,
    entities: [Project],
    queries: [Above],
    ...(operators === undefined ? {} : { operators }),
  })
  // Live events reach a domain that reads a row live.
  readLive(Data, Summary, 'p0')
  const list = Data.query(Above, { floor: 5 }, { select: Summary, first: 25 })
  const identity = list.ref.identity
  const key = (id: string) => entityKey('Project', id)

  /** The list holding p1 and p2, with p3 (below the floor) in the store only. */
  const loaded = (): Model => {
    const rows = [
      { id: 'p1', name: 'Apollo', price: 10 },
      { id: 'p2', name: 'Borealis', price: 20 },
      { id: 'p3', name: 'Cassini', price: 1 },
    ]
    const stored = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: rows.map(row => ({ entity: 'Project', id: row.id, fields: Object.keys(row) })),
        result: {
          settled: [],
          entities: rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
        },
        now: 0,
      },
    )
    return Data.reduce(stored, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: {
        edges: ['p1', 'p2'].map(id => ({ key: key(id), ref: { entity: 'Project', id } })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    })
  }

  const shown = (model: Model) => ({
    ids: Data.visibleItems(model.remote, identity).map(edge => edge.ref.id),
    stale: model.remote.connections[identity]?.stale === true,
  })

  /** A write's answer moving p1 below the floor. */
  const repriced = (model: Model) =>
    Data.reduce(model, {
      _tag: 'MutationSucceeded',
      requestId: 'm1',
      entities: [{ entity: 'Project', id: 'p1', values: { price: 1 } }],
      deleted: [],
      now: 1,
    })

  /** A pending edit moving p1 below the floor, before any answer. */
  const pending = (model: Model) =>
    overlay(Data, model, 'edit', [{ entity: 'Project', id: 'p1', values: { price: 1 } }])

  /** The server saying p3 was inserted at the list's start. */
  const inserted = (model: Model) =>
    Data.reduce(model, {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'ConnectionInsert',
        cursor: 1,
        connection: identity,
        edge: { key: key('p3'), ref: { entity: 'Project', id: 'p3' } },
        position: 'prepend',
      },
      now: 0,
    })

  return { loaded, shown, repriced, pending, inserted }
}

describe("A list whose body calls an application's operator", () => {
  it('loses a row that stops matching by its table, fetching nothing', () => {
    const { loaded, shown, repriced } = remote(table)
    expect(shown(repriced(loaded()))).toEqual({ ids: ['p2'], stale: false })
  })

  it('is fetched again where the client has no table to judge it by', () => {
    const { loaded, shown, repriced } = remote()
    expect(shown(repriced(loaded()))).toEqual({ ids: ['p1', 'p2'], stale: true })
  })

  it('shows a pending edit taking a row out by its table', () => {
    const { loaded, shown, pending } = remote(table)
    expect(shown(pending(loaded())).ids).toEqual(['p2'])
  })

  it("leaves a pending edit's row where it was without a table to judge it by", () => {
    const { loaded, shown, pending } = remote()
    expect(shown(pending(loaded())).ids).toEqual(['p1', 'p2'])
  })

  it('ignores a live insert of a row its table says does not belong', () => {
    const { loaded, shown, inserted } = remote(table)
    expect(shown(inserted(loaded())).ids).toEqual(['p1', 'p2'])
  })

  it('shows a live insert as declared where it has no table to judge it by', () => {
    const { loaded, shown, inserted } = remote()
    expect([...shown(inserted(loaded())).ids].sort()).toEqual(['p1', 'p2', 'p3'])
  })
})

/** How far a price lies from a target: an order the input decides. */
const distance = Expr.operator('acme.distance', {
  input: [Schema.Number, Schema.Number],
  output: Schema.Number,
})
const distanceTable = Operators.memory(
  Operators.implement(distance, (price, target) => Math.abs(price - target)),
)
const Nearest = Query.define('Nearest', { target: Schema.Number }, ({ input }) =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(distance(Project.fields.price, input.target)))),
)

describe('A list ordered by a call', () => {
  const ordered = (operators?: MemoryOperators) => {
    const Data = Remote.make({
      mutations: [Answers],
      model: App.model.remote,
      entities: [Project],
      queries: [Nearest],
      ...(operators === undefined ? {} : { operators }),
    })
    // Live events reach a domain that reads a row live.
    readLive(Data, Summary, 'p0')
    const list = Data.query(Nearest, { target: 12 }, { select: Summary, first: 25 })
    const identity = list.ref.identity
    // From 12: p1 is 2 away, p2 8 and p3 11.
    const held = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ConnectionMerged',
        connection: identity,
        page: {
          edges: ['p1', 'p2', 'p3'].map(id => ({
            key: entityKey('Project', id),
            ref: { entity: 'Project', id },
          })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
      },
    )
    const rows = [
      { id: 'p1', name: 'Apollo', price: 10 },
      { id: 'p2', name: 'Borealis', price: 20 },
      { id: 'p3', name: 'Cassini', price: 1 },
    ]
    const loaded = Data.reduce(held, {
      _tag: 'ReadReceived',
      requests: rows.map(row => ({ entity: 'Project', id: row.id, fields: Object.keys(row) })),
      result: {
        settled: [],
        entities: rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
      },
      now: 0,
    })
    // p2 moves to 13, 1 away: first.
    const moved = Data.reduce(loaded, {
      _tag: 'MutationSucceeded',
      requestId: 'm1',
      entities: [{ entity: 'Project', id: 'p2', values: { price: 13 } }],
      deleted: [],
      now: 1,
    })
    return {
      shown: {
        ids: Data.visibleItems(moved.remote, identity).map(edge => edge.ref.id),
        stale: moved.remote.connections[identity]?.stale === true,
      },
      // The same move pending, before any answer.
      pending: Data.visibleItems(
        overlay(Data, loaded, 'edit', [{ entity: 'Project', id: 'p2', values: { price: 13 } }])
          .remote,
        identity,
      ).map(edge => edge.ref.id),
      // A live insert of p4, 3 away, which the server put first.
      inserted: Data.visibleItems(
        Data.reduce(
          Data.reduce(loaded, {
            _tag: 'ReadReceived',
            requests: [{ entity: 'Project', id: 'p4', fields: ['id', 'name', 'price'] }],
            result: {
              settled: [],
              entities: [
                { entity: 'Project', id: 'p4', values: { id: 'p4', name: 'Dawn', price: 15 } },
              ],
            },
            now: 0,
          }),
          {
            _tag: 'LiveReceived',
            stream: 's',
            event: {
              _tag: 'ConnectionInsert',
              cursor: 1,
              connection: identity,
              edge: { key: entityKey('Project', 'p4'), ref: { entity: 'Project', id: 'p4' } },
              position: 'prepend',
            },
            now: 0,
          },
        ).remote,
        identity,
      ).map(edge => edge.ref.id),
      // What the client asks of a row the list holds and the store lacks.
      asked: Data.plan(held, list).flatMap(requirement => requirement.fields),
    }
  }

  it('places a row where the call puts it by the table, fetching nothing', () => {
    expect(ordered(distanceTable).shown).toEqual({ ids: ['p2', 'p1', 'p3'], stale: false })
  })

  it('is fetched again where the client has no table to order it by', () => {
    expect(ordered().shown).toEqual({ ids: ['p1', 'p2', 'p3'], stale: true })
  })

  it('shows a live insert where the call puts it, and where the server said without a table', () => {
    expect(ordered(distanceTable).inserted).toEqual(['p1', 'p4', 'p2', 'p3'])
    expect(ordered().inserted).toEqual(['p4', 'p1', 'p2', 'p3'])
  })

  it('shows a pending edit where the call puts its row, and leaves it without a table', () => {
    expect(ordered(distanceTable).pending).toEqual(['p2', 'p1', 'p3'])
    expect(ordered().pending).toEqual(['p1', 'p2', 'p3'])
  })

  it('reads the fields the call reads, to order a row by, only where it can', () => {
    expect(ordered(distanceTable).asked).toContain('price')
    expect(ordered().asked).not.toContain('price')
  })
})

describe('A pending computed assignment', () => {
  /** Text after text. */
  const concat = Expr.operator('acme.concat', {
    input: [Schema.String, Schema.String],
    output: Schema.String,
  })
  const concatTable = Operators.memory(
    Operators.implement(concat, (left, right) => `${left}${right}`),
  )
  const Prefix = Write.update(
    DomainEntity.input(Project, Schema.Struct({ id: Schema.String, prefix: Schema.String }), {
      prefix: DomainEntity.unmapped,
    }),
    { id: 'id', compute: { name: ({ row, input }) => concat(input.prefix, row.name) } },
  )
  const shown = (operators?: MemoryOperators) => {
    const Data = Remote.make({
      mutations: [Answers],
      model: App.model.remote,
      entities: [Project],
      queries: [],
      ...(operators === undefined ? {} : { operators }),
    })
    // Live events reach a domain that reads a row live.
    readLive(Data, Summary, 'p0')
    const stored = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'p1', fields: ['id', 'name', 'price'] }],
        result: {
          settled: [],
          entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name: 'ned', price: 1 } }],
        },
        now: 0,
      },
    )
    const pending = overlay(
      Data,
      stored,
      'edit',
      optimisticOfWrite(Prefix, { id: 'p1', prefix: 'o' }, undefined),
    )
    // The server's live word on what the computation reads, while it is pending.
    const patched = Data.reduce(pending, {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        cursor: 1,
        ref: { entity: 'Project', id: 'p1' },
        values: { name: 'bo' },
        changed: ['name'],
      },
      now: 1,
    })
    const name = (model: Model) => {
      const read = Data.get(Summary, 'p1').read(model)
      return read._tag === 'Ready' ? read.value.name : read._tag
    }
    return { before: name(pending), after: name(patched) }
  }

  it("predicts it by the client's table, over the row as a live change leaves it", () => {
    expect(shown(concatTable)).toEqual({ before: 'oned', after: 'obo' })
  })

  it('shows what the store holds where the client lacks the operator', () => {
    expect(shown()).toEqual({ before: 'ned', after: 'bo' })
  })

  it('predicts nothing from a value an earlier pending write could not work out', () => {
    // The client runs concat but not upper: after `upper`, `name` is not known,
    // so concat over it would be computed from the store's stale value.
    const upper = Expr.operator('acme.upper', { input: [Schema.String], output: Schema.String })
    const Upper = Write.update(DomainEntity.input(Project, Schema.Struct({ id: Schema.String })), {
      id: 'id',
      compute: { name: ({ row }) => upper(row.name) },
    })
    const Data = Remote.make({
      mutations: [Answers],
      model: App.model.remote,
      entities: [Project],
      queries: [],
      operators: concatTable,
    })
    // Live events reach a domain that reads a row live.
    readLive(Data, Summary, 'p0')
    const stored = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'p1', fields: ['id', 'name', 'price'] }],
        result: {
          settled: [],
          entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name: 'ned', price: 1 } }],
        },
        now: 0,
      },
    )
    const first = overlay(Data, stored, 'first', optimisticOfWrite(Upper, { id: 'p1' }, undefined))
    const both = overlay(
      Data,
      first,
      'second',
      optimisticOfWrite(Prefix, { id: 'p1', prefix: 'o' }, undefined),
    )
    const read = Data.get(Summary, 'p1').read(both)
    // Not 'oned': the server will answer 'oNED'.
    expect(read._tag === 'Ready' ? read.value.name : read._tag).toBe('ned')
  })
})
