import { Schema } from 'effect'
import { Expr } from 'metakit'
import * as Rows from 'metakit/aggregates'
import { Decimal, Money } from 'metakit/domain'

// The scale a value is formatted at is its own.
Decimal.format(Decimal.units(12345, 4), { scale: 4 })
// @ts-expect-error a scale-4 value cannot be formatted at scale 2
Decimal.format(Decimal.units(12345, 4), { scale: 2 })
// @ts-expect-error the scale is required
Decimal.format(Decimal.units(12345, 4))

Money.format(Money.minor('USD', 12345, 3), 'USD', { scale: 3 })
// @ts-expect-error a scale-3 amount cannot be formatted at scale 2
Money.format(Money.minor('USD', 12345, 3), 'USD', { scale: 2 })
// @ts-expect-error the scale is required
Money.format(Money.minor('USD', 12345, 3), 'USD')
// @ts-expect-error a USD amount cannot be formatted as EUR
Money.format(Money.minor('USD', 12345), 'EUR', { scale: 2 })

const Line = Schema.Struct({
  price: Decimal.make({ scale: 2 }),
  rate: Decimal.make({ scale: 4 }),
  net: Money.make('USD'),
  other: Money.make('EUR'),
})

// `Decimal.mul` states each operand's own scale and types the result by `scale`.
const taxed: Expr.Expr<{ readonly row: typeof Line.Type }, Decimal.DecimalValue<2>> = Expr.in(
  { row: Line },
  ({ row }) => Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 4, scale: 2 }),
)
void taxed
Expr.in({ row: Line }, ({ row }) =>
  // @ts-expect-error the left operand has scale 2, not 4
  Decimal.mul(row.price, row.rate, { leftScale: 4, rightScale: 4, scale: 2 }),
)
Expr.in({ row: Line }, ({ row }) =>
  // @ts-expect-error the right operand has scale 4, not 2
  Decimal.mul(row.price, row.rate, { leftScale: 2, rightScale: 2, scale: 2 }),
)

// `Money.mul` keeps the amount's currency and scale; the rate's scale is its own.
const vat: Expr.Expr<{ readonly row: typeof Line.Type }, Money.MoneyValue<'USD', 2>> = Expr.in(
  { row: Line },
  ({ row }) => Money.mul(row.net, row.rate, { rateScale: 4 }),
)
void vat
Expr.in({ row: Line }, ({ row }) =>
  // @ts-expect-error the rate has scale 4, not 2
  Money.mul(row.net, row.rate, { rateScale: 2 }),
)

// Money and Decimal share their operations, brand-checked the same way.
Expr.in({ row: Line }, ({ row }) =>
  // @ts-expect-error EUR cannot be compared with USD
  Money.isNot(row.net, row.other),
)
Expr.in({ row: Line }, ({ row }) =>
  // @ts-expect-error scale 4 cannot meet scale 2
  Decimal.min(row.price, row.rate),
)

// A sum keeps the contribution's type: a sum of USD is USD, and so are its deltas.
const Ledger = Schema.Struct({ net: Money.make('USD'), note: Schema.String })
const total = Rows.sum(Ledger, $ => $.net)
const identity: Money.MoneyValue<'USD', 2> = total.identity
const delta: Money.MoneyValue<'USD', 2> = total.insertDelta({
  net: Money.minor('USD', 1),
  note: '',
})
void identity
void delta
// @ts-expect-error a sum reads a number, not text
Rows.sum(Ledger, $ => $.note)
