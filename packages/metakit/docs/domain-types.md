# Model domain types and row aggregates

Using plain `number` for money, `Date` for calendar dates, and plain strings for ordered statuses lets subtle bugs compile: adding USD to EUR, shifting a due date across a timezone boundary, or sorting `"pro"` after `"free"` alphabetically.

`metakit/domain`, a subpath of the `metakit` package (`pnpm add metakit effect`), gives you branded integer-backed Effect Schemas, `Money`, `Decimal`, `CalendarDay` and `OrderedEnum`, whose operations are exact integer arithmetic in JavaScript and, with the exception noted under multiplication, in SQL and in the Z3 solver. `metakit/aggregates` adds row summaries (`sum`, `count`, `min`, `max`, `every`, `any`) that update by adding or removing one row's contribution (a delta) instead of adding every row again, and `metakit/aggregates/sql` compiles them to SQL.

The code blocks continue one file: `Schema`, `Expr`, `Num` and the first block's imports stay in scope. `Expr.refine` attaches a rule to a Schema as data, `Expr.in` builds an expression over named inputs, and `Expr.eval` runs one in memory.

## Currency-safe money (`Money`) and fixed-scale decimals (`Decimal`)

`Money.make(currency, options)` creates an integer-backed Effect `Schema` in minor units (cents by default, `scale: 2`). `Money.add` and `Money.sub` require both operands to share the same currency and scale at compile time. For dimensionless fixed-scale numbers (tax rates, weights, percentages), use `Decimal.make({ scale })`. Both store a safe integer count of units of `10^-scale` and offer the same operations: `add`, `sub`, `neg`, `mulInt` (multiply by a whole number), `mul` (multiply by a decimal, below), `min`, `max`, `lt`, `lte`, `gt`, `gte`, `is`, `isNot`, `between`, `parse` and `format`.

```ts
import { Schema } from 'effect'
import { Expr, Num } from 'metakit'
import { Decimal, Money } from 'metakit/domain'

const Usd = Money.make('USD')
const Invoice = Schema.Struct({
  subtotal: Usd,
  discount: Usd,
}).pipe(Expr.refine($ => Expr.all(Num.gte($.subtotal, 0), Num.lte($.discount, $.subtotal))))

const totalExpr = Expr.in({ row: Invoice }, ({ row }) => Money.sub(row.subtotal, row.discount))
const total = Expr.eval(totalExpr, {
  row: { subtotal: Money.minor('USD', 25_00), discount: Money.minor('USD', 5_00) },
})
const text = Money.format(total, 'USD', { scale: 2 })
// total -> 2000 (typed as MoneyValue<'USD', 2>), text -> '20.00 USD'

const tax = Decimal.roundHalfEven(150, 100) // 2 (banker's rounding)
void tax
```

What happened: `Money.minor('USD', 25_00)` builds 25.00 USD as the integer 2500, `Money.sub` took one amount from the other as integers, and `Money.format` wrote 2000 back as `'20.00 USD'`. `Decimal.roundHalfEven(150, 100)` rounds 150 / 100 = 1.5 to the even neighbour, 2.

Passing a `Money.make('EUR')` field to `Money.sub` alongside a `USD` field is a TypeScript error, and so is formatting an amount at a scale other than its own: `Decimal.format(value, { scale })` and `Money.format(amount, code, { scale })` take the scale the value's type carries. `Money.minor`, `Decimal.units`, `parse` and `roundHalfEven` refuse anything that is not a safe integer (beyond ±(2^53 - 1) units a JavaScript number is no longer exact), and `format` throws on one.

### Multiplying two amounts

`Decimal.mul(left, right, { leftScale, rightScale, scale })` multiplies two decimals into one at `scale`, rounding half-even (an exact half goes to the even neighbour, so repeated roundings do not drift upward). `Money.mul(amount, rate, { rateScale })` multiplies an amount by a decimal rate into the amount's currency and scale. You state each operand's scale because the stored integer does not carry it; the types refuse a scale that is not the operand's own, and an operand read from a field is checked against its Schema.

```ts
const Line = Schema.Struct({ net: Usd, vat: Decimal.make({ scale: 3 }) })
const vatExpr = Expr.in({ row: Line }, ({ row }) => Money.mul(row.net, row.vat, { rateScale: 3 }))
const vat = Expr.eval(vatExpr, {
  row: { net: Money.minor('USD', 12_35), vat: Decimal.units(200, 3) },
})
// vat -> 247 (2.47 USD: 12.35 x 0.200)
```

The product is computed exactly in integers. It is evaluated in memory only: SQL lowering refuses it, and the interval, zone and Z3 checkers read it as unknown. A missing operand, or a product of units outside the safe integer range, evaluates to `null`.

## Timezone-free dates (`CalendarDay`)

`CalendarDay.schema` stores calendar dates as integer days since `1970-01-01` (no hours, minutes, or local timezone offsets).

```ts
import { Result } from 'effect'
import { CalendarDay } from 'metakit/domain'

const Booking = Schema.Struct({
  checkIn: CalendarDay.schema,
  checkOut: CalendarDay.schema,
}).pipe(Expr.refine($ => CalendarDay.before($.checkIn, $.checkOut)))

const checkIn = CalendarDay.parseIsoUnsafe('2026-06-01')
const checkOut = CalendarDay.parseIsoUnsafe('2026-06-05')
const valid = Schema.is(Booking)({ checkIn, checkOut })
const shown = CalendarDay.toIso(checkOut)
// valid -> true, shown -> Result.succeed('2026-06-05')
```

`CalendarDay.fromIso` and `CalendarDay.toIso` cover years 0001 to 9999 (`CalendarDay.earliest` to `CalendarDay.latest`). Both return a `Result`: `fromIso` fails on a day the month does not have, and `toIso` on a day outside that range or one that is not an integer. The Schema itself holds any safe integer.

`CalendarDay.addDays` and `CalendarDay.diffDays` lower directly to integer `num.add` and `num.sub`, so the zone checker (a built-in arithmetic prover) and Z3 can prove date-range invariants like `checkOut = checkIn + nights` preserves `checkIn < checkOut`.

## Ordered statuses (`OrderedEnum`)

`OrderedEnum.make(values)` creates a literal-union Schema whose order is its declaration order, with `rank`, `lt`, `lte`, `gt`, `gte`, and `between` helpers that lower to `Expr.match` over integer ranks.

```ts
import { OrderedEnum } from 'metakit/domain'

const Plan = OrderedEnum.make(['free', 'pro', 'enterprise'] as const)
const canUseSso = Expr.in({ plan: Plan.schema }, ({ plan }) => Plan.gte(plan, 'pro'))

Expr.eval(canUseSso, { plan: 'free' }) // false
Expr.eval(canUseSso, { plan: 'enterprise' }) // true
```

Because `OrderedEnum` lowers to `Match` over integer ranks, the built-in checkers prove monotonicity (for example, upgrading from `free` to `pro` increases `Plan.rank`) synchronously without calling Z3.

## Row aggregates (`metakit/aggregates`)

`metakit/aggregates` distinguishes two kinds of summaries:

- **Group aggregates** (`Rows.sum`, `Rows.count`) can undo a row's contribution, so inserts, deletes, and updates each take one step, however many rows there are, via `insertDelta`, `deleteDelta`, and `updateDelta`. The delta is exact only over integers (with floats, `0.1 + 0.2 + 0.3 - 0.2` is `0.4000000000000001`), so `Rows.sum` accepts only an integer-valued contribution: `Schema.Int`, `Money` and `Decimal` fields and integer literals, through `+`, `-`, `*`, negation, `Expr.when` and `Expr.match`. Anything else (a `Schema.Number` field, `0.5`) throws where the aggregate is defined.
- **Min, max, every and any** (`Rows.min`, `Rows.max`, `Rows.every`, `Rows.any`) cannot undo a row: an insert takes one step, and a delete of the row that held the answer must look at the remaining rows again.

Which kind an aggregate is comes from what its fold keeps, in `foldProperties` (exported from `metakit`): `sum` and `count` are commutative, associative and invertible over the integers, and `min`, `max`, `every` and `any` are not invertible.

Missing values get SQL's answers: `sum`, `min` and `max` skip a `null`, `sum` of no rows is `0`, and `min` and `max` of no rows are `Option.none()`. A row whose predicate is unknown counts as failing `every` and as not matching `any` or `count`. A `NaN` in `min` or `max` makes the answer `NaN` whatever the order of the rows; declare the field `Schema.Int` or `Schema.Finite` if it should never hold one.

```ts
import { Result } from 'effect'
import * as Rows from 'metakit/aggregates'
import * as RowsSql from 'metakit/aggregates/sql'

const Entry = Schema.Struct({ amount: Schema.Int, active: Schema.Boolean })
const activeSum = Rows.sum(Entry, $ => Expr.when($.active, { then: $.amount, else: 0 }))

const rows = [
  { amount: 100, active: true },
  { amount: 40, active: false },
]
const initial = activeSum.evaluate(rows) // 100
const afterInsert = initial + activeSum.insertDelta({ amount: 25, active: true }) // 125
const sqlAgg = Result.getOrThrow(RowsSql.toSql(activeSum, { dialect: 'postgres' }))
// sqlAgg.text -> COALESCE(SUM((CASE WHEN "active" THEN "amount" WHEN NOT "active" THEN $1 END)), 0)::DOUBLE PRECISION
// sqlAgg.params -> [0]  (the `else: 0`, passed as the parameter $1)
```

To sum a plain column, pass it as the contribution: `Rows.sum(Entry, $ => $.amount)`.

`metakit/aggregates` imports no SQL, so a page can evaluate aggregates without carrying the lowering; `RowsSql.toSql` lives in `metakit/aggregates/sql`. On Postgres it casts `sum`, `min` and `max` to `DOUBLE PRECISION` (exact over the safe integer range, and read as a number by every driver, where a `bigint` arrives as text) and `count` to `INTEGER`. SQLite answers `every` and `any` with `0` or `1`.
