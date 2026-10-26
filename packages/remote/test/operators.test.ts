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
  type MemoryOperators,
} from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, entityKey } from '../src/index.js'

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
    model: App.model.remote,
    entities: [Project],
    queries: [Above],
    ...(operators === undefined ? {} : { operators }),
  })
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
    Data.overlay(model, 'edit', [{ entity: 'Project', id: 'p1', values: { price: 1 } }])

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
