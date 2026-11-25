import { Option, Schema } from 'effect'
import { Expr } from 'foldkit-entity'
import { Maintained, type MaintainedValue } from 'foldkit-remote/maintained'
import * as Rows from 'metakit/aggregates'
import { expectTypeOf } from 'vitest'
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
  type Row,
} from './aggregateFixture.js'

declare const model: Model

expectTypeOf(Maintained.value(Data, model, list, Total)).toEqualTypeOf<MaintainedValue<number>>()
expectTypeOf(Maintained.value(Data, model, list, Counted)).toEqualTypeOf<MaintainedValue<number>>()
expectTypeOf(Maintained.value(Data, model, list, Earliest)).toEqualTypeOf<
  MaintainedValue<Option.Option<number>>
>()
expectTypeOf(Maintained.value(Data, model, list, Largest).value).toEqualTypeOf<
  Option.Option<number>
>()
expectTypeOf(Maintained.value(Data, model, list, AllSmall).value).toEqualTypeOf<boolean>()
expectTypeOf(
  Maintained.value(Data, model, list, AnyLarge, { where: Unpaid, input: {} }),
).toEqualTypeOf<MaintainedValue<boolean>>()
expectTypeOf(Maintained.value(Data, model, list, Maintained.list)).toEqualTypeOf<
  MaintainedValue<ReadonlyArray<Row>>
>()

const CentsOnly = Rows.sum(Schema.Struct({ cents: Schema.Int }), $ => $.cents)
Maintained.value(Data, model, list, CentsOnly)

const Tax = Rows.sum(Schema.Struct({ tax: Schema.Int }), $ => $.tax)
// @ts-expect-error `tax` is not a field the list selects
Maintained.value(Data, model, list, Tax)

const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Invoice).pipe(Query.where(Expr.eq(Invoice.fields.status, input.status))),
)

// @ts-expect-error `ByStatus` is not registered with this domain
Maintained.value(Data, model, list, Total, { where: ByStatus, input: { status: 'paid' } })

// @ts-expect-error a `where` names the query's input
Maintained.value(Data, model, list, Total, { where: Unpaid })

// @ts-expect-error the list's Model is the domain's
Maintained.value(Data, { remote: model.remote }, list, Total)
