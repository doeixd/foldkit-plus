/**
 * `aggregated` types its value by the aggregate, takes an aggregate only over
 * fields the list selects, and a `where` only of a query the domain registers,
 * with that query's input.
 */
import { Option, Schema } from 'effect'
import { Expr } from 'foldkit-entity'
import * as Rows from 'metakit/aggregates'
import { expectTypeOf } from 'vitest'
import { aggregated, type Aggregated } from '../src/aggregate.js'
import { Query } from '../src/index.js'
import {
  AllSmall,
  AnyLarge,
  Counted,
  Data,
  Earliest,
  Invoice,
  Largest,
  Total,
  Unpaid,
  list,
  type Model,
} from './aggregateFixture.js'

declare const model: Model

expectTypeOf(aggregated(Data, model, list, Total)).toEqualTypeOf<Aggregated<number>>()
expectTypeOf(aggregated(Data, model, list, Counted)).toEqualTypeOf<Aggregated<number>>()
expectTypeOf(aggregated(Data, model, list, Earliest)).toEqualTypeOf<
  Aggregated<Option.Option<number>>
>()
expectTypeOf(aggregated(Data, model, list, Largest).value).toEqualTypeOf<Option.Option<number>>()
expectTypeOf(aggregated(Data, model, list, AllSmall).value).toEqualTypeOf<boolean>()
expectTypeOf(aggregated(Data, model, list, AnyLarge, { where: Unpaid, input: {} })).toEqualTypeOf<
  Aggregated<boolean>
>()

// An aggregate over some of the fields the list selects is accepted.
const CentsOnly = Rows.sum(Schema.Struct({ cents: Schema.Int }), $ => $.cents)
aggregated(Data, model, list, CentsOnly)

const Tax = Rows.sum(Schema.Struct({ tax: Schema.Int }), $ => $.tax)
// @ts-expect-error `tax` is not a field the list selects
aggregated(Data, model, list, Tax)

const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Invoice).pipe(Query.where(Expr.eq(Invoice.fields.status, input.status))),
)

// @ts-expect-error `ByStatus` is not registered with this domain
aggregated(Data, model, list, Total, { where: ByStatus, input: { status: 'paid' } })

// @ts-expect-error a `where` names the query's input
aggregated(Data, model, list, Total, { where: Unpaid })

// @ts-expect-error the list's Model is the domain's
aggregated(Data, { remote: model.remote }, list, Total)
