# Model domain types and row aggregates

Using plain `number` for money, `Date` for calendar dates, and plain strings for ordered statuses lets subtle bugs compile: adding USD to EUR, shifting a due date across a timezone boundary, or sorting `"pro"` after `"free"` alphabetically.

`metakit/domain` gives you branded integer-backed Effect Schemas that lower to exact integer arithmetic in JavaScript, SQL, and Z3. `metakit/aggregates` adds row summaries (`sum`, `count`, `min`, `max`, `every`, `any`) with O(1) incremental deltas and SQL lowering.

## Currency-safe money (`Money`)

`Money.make(currency, options)` creates an integer-backed Effect `Schema` in minor units (cents by default, `scale: 2`). `Money.add` and `Money.sub` require both operands to share the same currency and scale at compile time.

```ts
import { Schema } from 'effect'
import { Expr, Num } from 'metakit'
import { Money } from 'metakit/domain'

const Usd = Money.make('USD')
const Invoice = Schema.Struct({
  subtotal: Usd,
  discount: Usd,
}).pipe(Expr.refine($ => Expr.all(Num.gte($.subtotal, 0), Num.lte($.discount, $.subtotal))))

const totalExpr = Expr.in({ row: Invoice }, ({ row }) => Money.sub(row.subtotal, row.discount))
const total = Expr.eval(totalExpr, {
  row: { subtotal: Money.minor('USD', 25_00), discount: Money.minor('USD', 5_00) },
})
// total -> 2000 (typed as MoneyValue<'USD', 2>)
// Money.format(total, 'USD') -> '20.00 USD'
```

Passing a `Money.make('EUR')` field to `Money.sub` alongside a `USD` field is a TypeScript error. Because the runtime representation is an integer, SQL `CHECK`/`WHERE` and Z3 proofs avoid floating-point rounding drift.

## Timezone-free dates (`CalendarDay`)

`CalendarDay.schema` stores calendar dates as integer days since `1970-01-01` (no hours, minutes, or local timezone offsets).

```ts
import { CalendarDay } from 'metakit/domain'

const Booking = Schema.Struct({
  checkIn: CalendarDay.schema,
  checkOut: CalendarDay.schema,
}).pipe(Expr.refine($ => CalendarDay.before($.checkIn, $.checkOut)))

const checkIn = CalendarDay.parseIsoUnsafe('2026-06-01')
const checkOut = CalendarDay.parseIsoUnsafe('2026-06-05')
const valid = Schema.is(Booking)({ checkIn, checkOut })
// valid -> true
```

`CalendarDay.addDays` and `CalendarDay.diffDays` lower directly to integer `num.add` and `num.sub`, so Zone and Z3 can prove date-range invariants like `checkOut = checkIn + nights` preserves `checkIn < checkOut`.

## Ordered statuses (`OrderedEnum`)

`OrderedEnum.make(values)` creates a literal-union Schema whose order is its declaration order, with `rank`, `lt`, `lte`, `gt`, `gte`, and `between` helpers that lower to `Expr.match` over integer ranks.

```ts
import { OrderedEnum } from 'metakit/domain'

const Plan = OrderedEnum.make(['free', 'pro', 'enterprise'] as const)
const canUseSso = Expr.in({ plan: Plan.schema }, ({ plan }) => Plan.gte(plan, 'pro'))

Expr.eval(canUseSso, { plan: 'free' }) // false
Expr.eval(canUseSso, { plan: 'enterprise' }) // true
```

Because `OrderedEnum` lowers to `Match` over integer ranks, Tier 3 proves monotonicity (for example, upgrading from `free` to `pro` increases `Plan.rank`) synchronously without calling Z3.

## Row aggregates (`metakit/aggregates`)

`metakit/aggregates` distinguishes two kinds of summaries:

- **Group aggregates** (`Rows.sum`, `Rows.count`) have an inverse, so inserts, deletes, and updates all run in O(1) via `insertDelta`, `deleteDelta`, and `updateDelta`.
- **Semilattice aggregates** (`Rows.min`, `Rows.max`, `Rows.every`, `Rows.any`) are O(1) on insert, and flag `requiresRescanOnDelete: true` so callers know when a delete must rescan.

```ts
import { Result } from 'effect'
import * as Rows from 'metakit/aggregates'

const Entry = Schema.Struct({ amount: Schema.Int, active: Schema.Boolean })
const activeSum = Rows.sum(Entry, $ => Expr.when($.active, { then: $.amount, else: 0 }))

const rows = [
  { amount: 100, active: true },
  { amount: 40, active: false },
]
const initial = activeSum.evaluate(rows) // 100
const afterInsert = initial + activeSum.insertDelta({ amount: 25, active: true }) // 125
const sqlAgg = Result.getOrThrow(activeSum.toSql({ dialect: 'postgres' }))
// sqlAgg.text -> COALESCE(SUM((CASE WHEN "active" THEN "amount" ELSE $1 END)), 0)
```
