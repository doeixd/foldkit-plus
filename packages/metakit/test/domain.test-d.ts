import { Schema } from 'effect'
import { Expr } from 'metakit'
import { CalendarDay, Money, OrderedEnum } from 'metakit/domain'

const Usd = Money.make('USD')
const Eur = Money.make('EUR')
const Usd3 = Money.make('USD', { scale: 3 })

const Ledger = Schema.Struct({
  usd: Usd,
  eur: Eur,
  usd3: Usd3,
  day: CalendarDay.schema,
})

// Same currency + same scale succeeds
Expr.in({ row: Ledger }, ({ row }) => Money.add(row.usd, Money.minor('USD', 100)))

// Currency mismatch is a compile-time error
Expr.in({ row: Ledger }, ({ row }) =>
  // @ts-expect-error EUR cannot be added to USD
  Money.add(row.usd, row.eur),
)

// Scale mismatch is a compile-time error
Expr.in({ row: Ledger }, ({ row }) =>
  // @ts-expect-error scale 3 cannot be compared with scale 2
  Money.lte(row.usd, row.usd3),
)

// OrderedEnum rejects unknown literal
const Status = OrderedEnum.make(['draft', 'paid'] as const)
const Doc = Schema.Struct({ status: Status.schema })
Expr.in({ row: Doc }, ({ row }) =>
  // @ts-expect-error 'archived' is not in Status
  Status.gte(row.status, 'archived'),
)
