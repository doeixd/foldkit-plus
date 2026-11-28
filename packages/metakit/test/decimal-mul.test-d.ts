import { Schema } from 'effect'
import { Expr, Num } from '@doeixd/metakit'
import * as Rows from '@doeixd/metakit/aggregates'
import { Decimal, Money } from '@doeixd/metakit/domain'

const Pair = Schema.Struct({
  a: Schema.Int,
  b: Schema.Int,
  maybe: Schema.NullOr(Schema.Int),
  price: Decimal.make({ scale: 2 }),
  rate: Decimal.make({ scale: 4 }),
})
type Env = { readonly row: typeof Pair.Type }

// A product of integers is a number, and null where an operand may be.
const sure: Expr.Expr<Env, number> = Expr.in({ row: Pair }, ({ row }) =>
  Num.mulScaled(row.a, row.b, { shift: 2 }),
)
void sure
const unsure: Expr.Expr<Env, number | null> = Expr.in({ row: Pair }, ({ row }) =>
  Num.mulScaled(row.a, row.maybe, { shift: 2 }),
)
void unsure
Expr.in({ row: Pair }, ({ row }): Expr.Expr<Env, number> =>
  // @ts-expect-error an operand that may be null makes the result nullable
  Num.mulScaled(row.a, row.maybe, { shift: 2 }),
)

// The number of places is required, and is a number.
// @ts-expect-error no shift
Num.mulScaled(1, 2)
// @ts-expect-error the shift is a number of places, not text
Num.mulScaled(1, 2, { shift: '2' })

// A decimal product is a decimal at the result scale, and `Rows.sum` takes it.
const total = Rows.sum(Pair, $ =>
  Decimal.mul($.price, $.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
)
const answer: Decimal.DecimalValue<2> = total.evaluate([])
void answer

// The same, for an amount and a rate, as `domain-types.md` writes it.
const Bill = Schema.Struct({ net: Money.make('USD'), vat: Decimal.make({ scale: 3 }) })
const totalVat = Rows.sum(Bill, $ => Money.mul($.net, $.vat, { rateScale: 3 }))
totalVat.evaluate([{ net: Money.minor('USD', 12_35), vat: Decimal.units(200, 3) }])
