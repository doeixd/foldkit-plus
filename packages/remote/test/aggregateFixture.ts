/**
 * A domain of invoices for `foldkit-remote/maintained`: one list of every
 * invoice, a filter of the unpaid ones, and the six kinds of metakit
 * aggregate over the rows the list selects. `counting` wraps an aggregate so
 * a test can tell how many rows it was handed.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Ord } from '@doeixd/metakit'
import * as Rows from '@doeixd/metakit/aggregates'
import { Query, Remote, terminal, type RemoteMessage } from '../src/index.js'
import { live } from '../src/live.js'

export const Invoice = DomainEntity.define(
  'Invoice',
  Schema.Struct({
    id: Schema.String,
    cents: Schema.Int,
    status: Schema.String,
    due: Schema.NullOr(Schema.Int),
  }),
)

export const All = Query.define('All', {}, () =>
  Query.from(Invoice).pipe(Query.orderBy(Order.asc(Invoice.fields.id))),
)
export const Unpaid = Query.define('Unpaid', {}, () =>
  Query.from(Invoice).pipe(
    Query.where(Expr.eq(Invoice.fields.status, 'unpaid')),
    Query.orderBy(Order.asc(Invoice.fields.id)),
  ),
)

export const Model = Schema.Struct({ remote: Remote.Model, viewer: Schema.String })
export type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Invoice],
  queries: [All, Unpaid],
  viewer: model => Option.some({ entity: 'User', id: model.viewer }),
})

export const Selected = DomainEntity.select(Invoice, { cents: true, status: true, due: true })
export const list = Data.query(All, {}, { select: Selected, first: 25 })
// A row read live installs what live events and pending writes need.
export const liveRow = live(Data, Selected, 'i1')

/** What the list decodes each row to, as the aggregates read it. */
export const Row = Schema.Struct({
  cents: Schema.Int,
  status: Schema.String,
  due: Schema.NullOr(Schema.Int),
})
export type Row = typeof Row.Type

export const Total = Rows.sum(Row, $ => $.cents)
export const Counted = Rows.count(Row)
export const Overdue = Rows.count(Row, $ => Ord.gt($.due, 10))
export const Earliest = Rows.min(Row, $ => $.due)
export const Largest = Rows.max(Row, $ => $.cents)
export const AllSmall = Rows.every(Row, $ => Ord.lt($.cents, 900))
export const AnyLarge = Rows.any(Row, $ => Ord.gt($.cents, 500))

/** How many rows an aggregate was handed, by how. */
export interface Calls {
  evaluated: number
  inserted: number
  deleted: number
  updated: number
}

/** `sum` with every row it is handed counted. */
export const counting = <R>(
  aggregate: Rows.Sum<R, number>,
): { aggregate: Rows.Sum<R, number>; calls: Calls } => {
  const calls: Calls = { evaluated: 0, inserted: 0, deleted: 0, updated: 0 }
  return {
    calls,
    aggregate: {
      ...aggregate,
      evaluate: rows => {
        calls.evaluated += rows.length
        return aggregate.evaluate(rows)
      },
      insertDelta: row => {
        calls.inserted += 1
        return aggregate.insertDelta(row)
      },
      deleteDelta: row => {
        calls.deleted += 1
        return aggregate.deleteDelta(row)
      },
      replaceTotal: (total, before, after) => {
        calls.updated += 1
        return aggregate.replaceTotal(total, before, after)
      },
    },
  }
}

/** `min` with every row it is handed counted. */
export const countingMin = (
  aggregate: typeof Earliest,
): { aggregate: typeof Earliest; calls: Calls } => {
  const calls: Calls = { evaluated: 0, inserted: 0, deleted: 0, updated: 0 }
  return {
    calls,
    aggregate: {
      ...aggregate,
      evaluate: rows => {
        calls.evaluated += rows.length
        return aggregate.evaluate(rows)
      },
      insertStep: (current, row) => {
        calls.inserted += 1
        return aggregate.insertStep(current, row)
      },
    },
  }
}

export type Values = {
  readonly cents?: number
  readonly status?: string
  readonly due?: number | null
}

export const edgeOf = (id: string) => ({ key: `Invoice:${id}`, ref: { entity: 'Invoice', id } })

/** The server's answer for rows: each given field, at an optional revision. */
export const answered = (
  rows: Readonly<Record<string, Values>>,
  revision?: number,
): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: Object.entries(rows).map(([id, values]) => ({
    entity: 'Invoice',
    id,
    fields: Object.keys(values),
  })),
  result: {
    settled: [],
    entities: Object.entries(rows).map(([id, values]) => ({
      entity: 'Invoice',
      id,
      values,
      ...(revision === undefined ? {} : { revision }),
    })),
  },
  now: 1,
})

/** The list's page as the server sends it: these rows, terminal at both ends unless `more`. */
export const page = (
  ids: ReadonlyArray<string>,
  more = false,
): Extract<RemoteMessage, { readonly _tag: 'ConnectionMerged' }> => ({
  _tag: 'ConnectionMerged',
  connection: list.ref.identity,
  page: {
    edges: ids.map(edgeOf),
    start: terminal,
    end: more ? { _tag: 'Cursor', cursor: 'next' } : terminal,
  },
  now: 0,
})

/** `count` invoices `i0`, `i1`, … with every field held, the list holding them all. */
export const loadedWith = (count: number, viewer = 'u1'): Model => {
  const ids = Array.from({ length: count }, (_, index) => `i${index}`)
  const listed = Data.reduce({ remote: Remote.initial, viewer }, page(ids))
  return Data.reduce(
    listed,
    answered(
      Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            cents: (index * 37) % 1000,
            status: index % 3 === 0 ? 'paid' : 'unpaid',
            due: index % 4 === 0 ? null : index % 50,
          },
        ]),
      ),
    ),
  )
}
