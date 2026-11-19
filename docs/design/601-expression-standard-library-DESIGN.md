# A standard library of types and operations for expressions (#601)

Status: design, 2026-11-19, revised the same day to drop a proposed `Kind` namespace in favour of recognising Effect's own Schemas (section 3.1, and section 9 for why). Nothing here is built. It changes one rule of the expression language: "only operations a query in this repository needed exist" (`docs/expressions.md`, Limits) becomes "a deliberate set of types and operations ships with the language, each defined once and held to one answer on every reader". It interlocks with the solver design ([600-solver-pass-DESIGN.md](./600-solver-pass-DESIGN.md)); section 10 says which of its phases waits on which of these.

The probes behind every claim about SQLite, Postgres, JavaScript, Effect and Z3 are in the session scratchpad's `stdlib-probe/` (scripts, outputs and `RESULTS.md` kept; `node_modules` deleted). Versions: SQLite 3.53.3 (`node:sqlite`), Postgres 18.7 (PGlite 0.5.17, C collation), Postgres 17.10 and 18.6 in Docker initialised `--locale=en_US.UTF-8`, Node 26.5.0, the repository's `effect` 4.1.4, `z3-solver` 5.4.1, `tsc` 7.0.2.

## 1. The decision

An application here states its rules once, as data: "an open account is never overdrawn" is a tree of nodes (`Expr.gte(after.balance, 0)`), not a function. Five programs read that tree, and soon six: the reference judge in memory (which answers true, false or unknown), the SQLite compiler, the Postgres compiler, the page's prediction of a pending write, `Laws.check`, and the solver pass of #600. Each reader is useful only because they all give the same answer.

The language those rules are written in knows little. A value is a number (a JavaScript double), text, a boolean, a literal union or a nullable one. The only named operations are `Expr.add`, `Expr.sub` and `Text.startsWith`. A real domain needs more: a date thirty days after another, a total as quantity times price, a price that must stay exact, an email compared trimmed and lower-cased. Each of those has to be an *operator* the application declares with `Expr.operator`. It then implements the operator once per reader: a JavaScript function for the judge and the page, an SQL builder for the server, and nothing at all for the checker, which then answers `undecided`. Every application pays that cost again, and meets alone the places where SQLite, Postgres and JavaScript quietly disagree.

**Decision: ship a standard library in `foldkit-entity`.** Its value types are Schemas: the readers recognise Effect's own (`Schema.Int`, `Schema.DateTimeUtcFromMillis`, …), and the library ships a Schema only for the four meanings Effect lacks (a decimal at a scale, money, a calendar day, an ordered enumeration). It adds operations over them. Each operation is defined once, with an implementation for every reader, the laws the checker and solver may use, and conformance cases that hold all readers to one answer. The case in one sentence: we pay once for each disagreement between readers and pin or refuse it for everyone, and every rule written with the library becomes one the checker, the solver, the page, the form and the database can act on.

What it is not. It is not a programming language: no user-defined functions with bodies beyond today's `definedAs` (which builds an expression from expressions), no recursion, no loops, no I/O, no randomness, and no clock read inside an operation (the time enters only as a context term, `Expr.now` or `Time.today`, which whoever runs the write reads once and binds as a value). An operation enters only if every reader can implement it exactly or refuse it by name (section 8 states the line). Custom operators stay, for the domain-specific questions no library should own.

**Words used below.** The *readers* are the programs listed above. The *judge* is `evaluate` and `Judge` in `foldkit-entity`, the reference meaning every other reader is tested against; the *page's prediction* is the same judge run in the browser over the rows the page holds, to show a pending write before the server answers. `Laws.check` is the checker: for every declared write and every rule it answers kept, refused or `undecided`; its *interval pass* (`bounds.ts`, being built) bounds each number by constants and uses an operator's *monotonic* law (bigger argument, bigger result) to carry those bounds through it. The *solver* is Z3, which the #600 design adds as an optional second pass. It answers `unsat` when no row and input can break a rule (a proof), or gives a *witness*: concrete values that break it. LIA and NIA are its linear and nonlinear integer arithmetic; #600's first phase refuses NIA. A *conformance case* is a body, rows and the expected answer, run through every reader.

## 2. What the project gains, in three domains

Each domain is written twice: as it must be written today, and with the library. The library's API names are proposals; snippets marked `sketch` do not compile yet. Today's snippets use the shipped API (`Mutation.update`, `Entity.invariant` with `in`, `decrement`), as `packages/remote-drizzle/test/bank.test.ts` does.

### 2.1 A bank account with a transfer and a monthly fee

Today the balance is a `Schema.Number` (a double) stored in a SQLite `real` column (the bank fixture does exactly that). The fee needs a date, which today is either text the language compares as text or a number of milliseconds.

```ts sketch
// Today: a double for money, a number of milliseconds for a date.
balance: Schema.Number,
lastFeeAt: Schema.Number, // ms since the epoch; "a month later" has no meaning here
// The fee: 5.00 as a double, and "once a calendar month" needs an operator per reader.
const monthOf = Expr.operator('bank.monthOf', { input: [Schema.Number], output: Schema.Number })
// + Operators.implement(monthOf, ms => …) for the judge and the page
// + DrizzleOperators.implement(monthOf, ({ args: [ms] }) => sql`…`) for SQLite and again for Postgres
```

What each reader does with that today:

| Reader | Today |
| --- | --- |
| `Laws.check` | `undecided` for every pair over `balance` once arithmetic is involved (the #600 report) |
| solver (#600) | `balance` as a double needs phase 2's floating-point theory; `bank.monthOf` is a black box |
| page | predicts with the application's JavaScript `monthOf`, which may not match its SQL |
| database | no `CHECK` for whole cents: `checks.ts` translates no `isMultipleOf` |
| Schema | `isMultipleOf(0.01)` accepts 0.1 and 0.2 and refuses their sum, 0.30000000000000004 (probed) |
| types | `add(balance, lastFeeAt)` compiles: both are numbers |

With the library:

```ts sketch
balance: Money.schema('EUR'),          // integer cents in every store; EUR's scale, 2, from ISO 4217
lastFeeOn: Time.Day,                   // a calendar day, 'YYYY-MM-DD'
const Fee = Money.of('EUR', '5.00')

const ChargeFee = Mutation.update('ChargeFee', Account, {
  input: { on: Time.Day },
  from: Open,
  decrement: { balance: Fee },
  set: { lastFeeOn: 'on' },
  when: ({ row, input }) =>
    Expr.and(
      Expr.gte(row.balance, Fee),
      Expr.lt(Time.startOfMonth(row.lastFeeOn), Time.startOfMonth(input.on)),
    ),
})
```

A transfer between two accounts is two rows. Today it is two writes, a withdrawal and a deposit, and nothing states or checks that money is conserved. With aggregates (phase 5) the transfer is a row of its own, and each balance is the sum of its transfers. Conservation then holds by construction, and "never overdrawn" is a rule over a sum:

```ts sketch
const Transfer = Entity.define('Transfer', Schema.Struct({
  id: Schema.String, amount: Money.schema('EUR', { minimum: '0.01' }), on: Time.Day,
})).pipe(Entity.relate({ from: Entity.one(Account), to: Entity.one(Account) }))

// The balance of the account `of` names: what came in less what went out.
const balanceOf = (of: Expr<Id<'Account'>>) =>
  Expr.sub(
    Rows.sum(Transfer.relations.to, Transfer.fields.amount, { of }),
    Rows.sum(Transfer.relations.from, Transfer.fields.amount, { of }),
  )

const SendMoney = Mutation.insert('SendMoney', Transfer, {
  set: { amount: …, on: …, from: …, to: … },
  when: ({ input }) => Expr.gte(balanceOf(input.from), input.amount),
})
```

What becomes possible:

| Who | Gains |
| --- | --- |
| `Laws.check` | `ChargeFee x neverOverdrawn` decided by intervals: `balance >= 500` against the constant fee |
| solver | a withdrawal or transfer with `amount <= balance` proved over integer cents (probed: unsat) |
| solver | an overdraft `when amount <= balance + 100` refused with the witness `balance 0, amount 1` (probed) |
| solver | "a transfer conserves the two balances' sum" proved (probed); "the fee once a month" from dates |
| page | predicts the fee and the new balance exactly; a form refuses "5.001" before sending |
| database | `CHECK (balance = cast(balance as integer))` and the Schema's bounds, generated |
| types | `Expr.add(balance, lastFeeOn)` and adding EUR to USD are type errors |

### 2.2 A booking with a trial

A booking has a start and an end day, a trial that ends thirty days after the start, must not start in the past, and must not overlap another booking of the same room.

Today: the days are text (as the CMS stores `publishedAt`) or milliseconds. "Ends after it starts" works on ISO text with `Collation.binary`, since ISO dates sort as text. "Thirty days after" and "today" are custom operators, and "today" also needs a time zone that nothing in the language carries. "Not overlapping" is a hand-written subquery in a custom source.

With the library:

```ts sketch
const Booking = Entity.define('Booking', Schema.Struct({
  id: Schema.String, start: Time.Day, end: Time.Day, trialEndsOn: Time.Day,
  plan: Schema.Literals(['trial', 'monthly', 'yearly']),
})).pipe(Entity.relate({ room: Entity.one(Room) }))

Booking.pipe(
  Entity.invariant('endsAfterItStarts', ({ after }) => Expr.gt(after.end, after.start)),
  Entity.invariant('trialIsThirtyDays', ({ after }) =>
    Expr.eq(after.trialEndsOn, Time.addDays(after.start, 30))),
)
const Book = Mutation.insert('Book', Booking, {
  set: { start: Time.Day, end: Time.Day, trialEndsOn: Time.Day, plan: … },
  // A `when` refuses the clock terms today; reading `today` here waits on that (section 4.3).
  when: ({ input }) => Expr.and(
    Expr.gte(input.start, Time.today('Europe/Paris')),
    Expr.not(Rows.any(Booking.relations.room,
      Time.overlaps(Booking.fields.start, Booking.fields.end, input.start, input.end),
      { of: input.room })),
  ),
})
```

What becomes possible:

| Who | Gains |
| --- | --- |
| solver | `Extend` (`end += n` days, `n >= 1`) keeps `endsAfterItStarts`: proved (probed) |
| solver | `Reschedule` (`start := s`, `when s >= today`) refused: witness `start -1, end 0, s 0` (probed) |
| solver | `trialIsThirtyDays` proved for every write that sets both through `addDays` |
| solver | overlap: two bookings moved apart searched over two symbolic rows (probed sat with a witness) |
| page | shows "starts in the past" and the trial's end before sending, from the browser's `Intl` zone data |
| database | `CHECK (end > start)` and `CHECK (start = date(start))` (which refuses '2026-02-30', probed) |
| types | `Time.addDays(at, 30)` on a timestamp, or comparing a day with an instant, is refused |

### 2.3 An order with line items, a discount and tax

A line has a quantity and a unit price; the order's subtotal is the sum of quantity times price; a percentage discount and a tax rate each round to cents.

Today none of it can be an expression: there is no multiplication, no sum over related rows, no rounding. The total is computed in a handler and stored, or computed in the page by code the server does not share. `Laws.check` and the solver see nothing.

With the library:

```ts sketch
const Line = Entity.define('Line', Schema.Struct({
  id: Schema.String,
  quantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)), // Effect's own: recognised as it is
  unitPrice: Money.schema('EUR', { minimum: '0.00' }),
})).pipe(Entity.relate({ order: Entity.one(Order) }))

const lineTotal = Number.times(Line.fields.unitPrice, Line.fields.quantity) // money x int -> money
const subtotal = Rows.sum(Line.relations.order, lineTotal)
const discount = Number.percent(subtotal, Order.fields.discountPct, { rounding: 'half-even' })
const tax = Number.scale(Expr.sub(subtotal, discount), Order.fields.taxRate, { rounding: 'half-even' })

Order.pipe(Entity.derived({ total: Derived.of(Expr.add(Expr.sub(subtotal, discount), tax)) }))
```

What becomes possible:

| Who | Gains |
| --- | --- |
| solver | a half-even discount of `p * pct / 100` stays within `[0, p]`: proved with `pct` unknown, 72 ms |
| solver | tax at 8.25% half-even never makes the total less than the net: proved (probed) |
| solver | editing one line keeps the derived total equal to the sum of lines: proved for any line count |
| solver | a rounding bug, `(n + 50) div 100` used as half-up, refused with `n = -50` (probed) |
| page | the new total shows at once when it holds every line of the order, unknown when it does not |
| form | a quantity that would take the order past its credit limit is refused before sending |
| database | line `CHECK`s (quantity >= 1, price >= 0, whole cents); an aggregate rule is the writer's |
| types | `money x money` (cents squared), money plus a count, a USD price on a EUR order: type errors |

## 3. The value types

### 3.1 What a Schema already tells every reader, and the four things it does not

A field declares itself with an Effect Schema, as today, and nothing new is asked of the user to say what a value means. The readers recognise the Schema. Inside the library, the word *kind* names what a reader reads off a Schema ("a safe integer", "an instant in milliseconds"); it extends `storedKindOf` and `orderKindOf` in `expr.ts`, which today read only number, text or boolean from the encoded side. No user-facing API says "kind".

**What Effect's own Schemas already say.** Each one carries an id a reader can match, and `bounds.ts` already reads checks this way (`checkRange`). Probed on the repository's `effect` 4.1.4 (`recognise.mjs`):

| A field declared as | Means | The reader matches | Encoded side |
| --- | --- | --- | --- |
| `Schema.Int` | a safe integer | the check id `effect/schema/isInt` | a number |
| `Schema.Finite` | a float, never NaN or infinite | the check id `effect/schema/isFinite` | a number |
| `Schema.Number` | today's double, NaN admitted | no id: left exactly as it is | a number |
| `Schema.DateTimeUtcFromMillis` | an instant | Declaration `effect/schema/DateTimeUtc`, encoded side a number | a number of ms |
| `Schema.DurationFromMillis` | a fixed length of time | Declaration `effect/schema/Duration` | a number of ms |
| `Schema.Literals([...])` | an unordered enumeration | a union of literals | a string |
| `Schema.String` with a `Collation` | text | as today | a string |

Checks and nullability pass through: `Schema.Int.check(isBetween(…))` still carries `isInt`, and `NullOr(…)` is read through, as `SchemaShape.present` already does. So an existing `Schema.Int` field is an integer to every reader without being declared again. One Schema needs care: `Schema.DateTimeUtc` (ISO text on the wire) carries the same id as `DateTimeUtcFromMillis`, so the reader also checks that the encoded side is a number. A timestamp kept as ISO text gets no timestamp arithmetic; the refusal names `DateTimeUtcFromMillis`.

**What no existing Schema says.** Four things, each of which needs a Schema the library ships, exported from the module that owns its operations:

| Meaning | Shipped Schema | In code | Encoded and stored |
| --- | --- | --- | --- |
| a decimal at a scale | `Decimal.schema({ scale: 2 })` | `BigDecimal`, branded by scale | integer units: 1250 for 12.50 |
| money | `Money.schema('EUR')` | `BigDecimal`, branded by currency | integer minor units |
| a calendar day | `Time.Day` | `'YYYY-MM-DD'` text, branded | the same text |
| an order on an enumeration | `Enum.ordered(['draft', 'review', 'published'])` | the literals | the literal text |

They are needed for three reasons. First, the encoded side must be a JSON scalar: rows travel and are held encoded (the conformance suite's `Timestamp` fixture exists to keep interpreters honest about it), and Remote's runtime JSON and the cursor's `encodeKey` carry numbers and strings, so no new wire tag is needed. Effect's `Schema.BigDecimal` encodes to an object (probed), so a decimal composes it with an encoding to integer units. Second, every reader must agree on one annotation (the scale, the currency, the order), which an application-written refinement would not give them. Third, the brand on the decoded type is what lets the editor refuse a mix.

**What the editor refuses, and what only the declaration refuses.** New operations are typed by the decoded side, as `Expr.eq` already types its right side (`ValueOf`). Probed with `tsc` 7.0.2:

- `DateTimeUtcFromMillis` decodes to `DateTime.Utc` and `DurationFromMillis` to `Duration.Duration`, distinct types. So passing a timestamp where a duration is wanted is an editor error.
- The shipped Schemas brand their decoded types (`Schema.brand` exists, and a plain string is refused where a branded day is wanted). Two scales, two currencies, and a day passed for a timestamp are editor errors.
- `Schema.Int`, `Schema.Finite` and `Schema.Number` all decode to plain `number`, so nothing in the type tells them apart. Where it matters (a float given to `Number.rem` or as `Time.addDays`'s count, which take an integer), the refusal comes where the expression is built (`argumentFor`, extended to the kinds), naming both, not in the editor. An integer with a float simply gives a float, so existing expressions keep compiling and running (section 7).

That is also the compatibility line: a `Schema.Number` field mixes with anything at the type level, as today, and nothing written today stops compiling. A literal is written in the decoded form and encoded through the other side's Schema before any reader sees it, as a `Date` literal against the conformance `Timestamp` field already is. For a branded type that means a constructor: `Decimal.of(2, '12.50')`, `Money.of('EUR', '5.00')`, `Time.day('2026-01-31')`. A literal with more digits than the scale is refused there. One existing type needs widening: `OrderedOperand` admits number, text and `Date`, so a comparison of two `DateTime.Utc` fields needs it extended to the recognised Schemas.

### 3.2 Where the readers disagree, and the rule for each

Every row was probed (`RESULTS.md` has the full table). "Pin" means every reader is made to give one answer, by emitting our own SQL or JavaScript instead of the database's function; "refuse" means the library will not build or run it, and says so.

| Question | SQLite | Postgres | JavaScript | Rule |
| --- | --- | --- | --- | --- |
| int64 max + 1 | becomes a real | error | n/a | integers are safe integers; refuse past ±(2^53-1) |
| 2^53 + 1 | exact | exact | 2^53 | the judge refuses; the solver proves a sum stays in range |
| -7 / 2 on integers | -3 | -3 | -3.5 | no bare `/`; `div` names its rounding |
| -7 % 2 | -1 | -1 | -1 | pin: `rem` truncates, sign of the dividend, integers only |
| 5.5 % 2 | 1 (casts) | 1.5 | 1.5 | refuse `rem` on non-integers |
| 1 / 0 | null | error | Infinity | a literal divisor must be non-zero; a field divisor needs `onZero` |
| round(-2.5) | -3 | -3, or -2 as float8 | -2 | pin: our integer formula, rounding mode named |
| round(1.005, 2) | 1 | 1.01 | 1 (toFixed) | decimals are integers, so there is no binary 1.005 to round |
| cast(2.7 as integer) | 2 | 3 | trunc 2 | never emit `cast` to convert; conversions name a rounding |
| length of an emoji | 1 | 1 | 2 (.length) | pin: code points (`Array.from` in JS) |
| lower('İ'), upper('ß') | unchanged | locale-dependent | 'i̇', 'SS' | pin ASCII-only; full Unicode casing deferred |
| trim tab, NBSP | spaces only | spaces only | all white space | pin: space, tab, LF, CR only |
| 'a' \|\| null | null | null | 'anull' | pin: null-strict concatenation |
| 'a' < 'B' | false | en_US: true | false | as today: text orders only under `binary` or `asciiFold` |
| U+FFFF < U+1F600 | true | true (C) | false | pin: code-point order in JS (`evaluate.ts` already) |
| 'A' like 'a' | true | false | n/a | no pattern language in the first release |
| 2026-01-31 + 1 month | 2026-03-03 | 2026-02-28 | 2026-03-03 | pin Postgres's clamp; our SQLite SQL (0 disagreements in 1,500) |
| +1 month twice vs +2 | 04-03 vs 03-31 | 03-28 vs 03-31 | | `addMonths` is not associative; no such law declared |
| date '2026-02-30' | 2026-03-02 | error | 2026-03-02 | refuse: the Schema and a `CHECK` hold valid days only |
| NY + interval '1 day' | no zones | depends on session zone | n/a | no zoned arithmetic in SQL; zones only where bound |
| timestamptz .123456 | n/a | lost on the way through a Date | ms | timestamps are milliseconds; Postgres stores `bigint` |
| now() twice in a transaction | differs | same | differs | the clock is read once per write, by the server, and bound |
| sum() past int64 | error | exact | n/a | refuse past the safe range; the solver checks sums |
| sum() of no rows | null | null | 0 (reduce) | pin 0 (`coalesce(sum(x), 0)`) |
| min(1, null) | null | least: 1 | 0 | pin null-strict (`case`), never `least`/`min` |
| a suffix of length 0 | whole text | '' | n/a | pin: the empty suffix ends every text, written as a guard |

Four of these surprised: Postgres's `cast(2.7 as integer)` rounds where SQLite truncates; `least(1, null)` is 1 in Postgres where SQLite's `min(1, null)` is null; adding `interval '1 day'` to a `timestamptz` gives a different instant depending on the connection's `TimeZone` setting (12:00 under New York, 13:00 under UTC, on Postgres 17 in Docker); and SQLite's `sum()` raises "integer overflow" where its `+` silently becomes a real.

### 3.3 Each value type

Each type below gives: the Schema that declares it, how it is held in JavaScript, on the wire, in SQLite and in Postgres, how it compares, what missing means, how `Expr.show` prints a literal, and what the checker and solver model it as. Missing is the same for every type: a nullable field (`Schema.NullOr`, or `Schema.OptionFromNullOr` in code) holds SQL null, and every operation is null-strict unless its table says otherwise, so a comparison with a missing value is unknown, as today. A row the page does not hold is unknown to the judge, as today.

**Boolean.** `Schema.Boolean`. JS boolean, JSON boolean, SQLite 0/1, Postgres `boolean`. Equality only (no order, as today). Literal `true`. Checker: finite, enumerated. Solver: `Bool`. Unchanged.

**Integer.** `Schema.Int`, recognised by its `isInt` check, with any further checks: Effect's `isInt` is `Number.isSafeInteger` (probed: `Schema.Int` refuses 2^60 and 1.5). JS number, JSON number, SQLite `integer`, Postgres `bigint` (or `integer` where the Schema bounds it within 32 bits). Numeric order. Literal `42`. Checker: intervals. Solver: `Int` with the safe range assumed of fields and proved of each operation's result (600 §5). The judge refuses an intermediate result outside the safe range, so the page shows unknown rather than a different answer; SQL is exact to 2^63, so the server's answer is right where the page declines. No reader gives a wrong answer; one declines. A stored result outside the range is refused by the field's `CHECK`, and the solver reports any write that could produce one (600 §5).

**Decimal.** `Decimal.schema({ scale })`, scale 0 to 9, shipped from `foldkit-entity/decimal`, the module of its operations. In code an Effect `BigDecimal` branded by its scale (exact, with ten rounding modes, probed), so `12.50` reads and prints as written. Stored and on the wire as an integer count of units of `10^-scale` (12.50 at scale 2 is `1250`): SQLite `integer`, Postgres `bigint`. The reason is the probe: SQLite has no decimal type, its `numeric` affinity turned `'12.50'` into the real 12.5, and every reader already agrees on integer arithmetic. A double cannot hold most cent amounts exactly (0.1 + 0.2 is 0.30000000000000004 on SQLite and in JavaScript), so sums drift, rounding differs by reader (section 3.2), and the solver would need floating-point theory to say anything. Order and indexes are integer ones. Range: ±(2^53-1) units, so ±90 trillion at scale 2. Literal `12.50` (always `scale` digits). Checker: intervals over the integer. Solver: `Int`, exact, linear. This settles #600's open question 2 for every quantity declared a decimal: no floating-point theory is needed for money.

**Float.** `Schema.Finite`, recognised by its `isFinite` check. Only where asked: a measurement, a score. JS double, JSON number, SQLite `real`, Postgres `double precision`. Arithmetic is today's `Expr.add` semantics. Solver: IEEE doubles with `fp.*`, as 600 phase 2 proposes. A field declared `Schema.Number` (which admits NaN, probed) keeps meaning exactly what it means today: an unrecognised double, mixing with every number as now.

**Money.** `Money.schema(currency, { scale?, minimum?, maximum? })` from `foldkit-entity/money`: a decimal whose currency is part of the type (open question 3), scale from ISO 4217, the standard that fixes each currency's minor unit (EUR 2, JPY 0, BHD 3), unless given. Stored as the decimal's integer. Arithmetic only with money of the same currency; multiplication only by an integer or a decimal, never by money. Literal `EUR 12.50`. Rounding names its mode at each operation that can produce a fraction of a unit; the default offered in docs is half-even (banker's rounding), because it does not drift upward over many roundings. Solver: `Int`; the currency is in the type, so the solver never sees it.

**Text.** `Schema.String`, with `Collation.binary` or `Collation.asciiFold` declared where it orders or folds case, as today. Length is in code points everywhere (`Schema.isMaxCodePoints` already exists; `isMaxLength` counts UTF-16 units, a known trap). A lone surrogate reads as U+FFFD and NUL is refused, as today. Literal `'it''s'`. Solver: `String` (600 phase 2).

**Enumeration.** `Schema.Literals(values)`, recognised as it is, for an unordered one. Stored as text (readable, and what the examples do). Unordered: equality and `in`. An order is the one thing the literals do not say, so an ordered enumeration is `Enum.ordered(values)` from `foldkit-entity/enum`: the same `Schema.Literals`, with the order as an annotation every reader reads. Ordered: compared by position, compiled `case x when 'draft' then 0 when 'review' then 1 … end` on both dialects; such a comparison uses no index on the column, which the docs say. Literal `'draft'`. Checker: finite, enumerated. Solver: a finite set (probed with a datatype of three plans).

**Identifier and reference.** An `id` field and a `one` relation's value are text today (`linkExpr` in `expr.ts`). The readers already know a field is an id (its key, or the relation it stores), so no Schema changes: the declaration check treats it as an id of its Entity, so an id is never added to anything, a numeric id included, and an id of one Entity is not compared with another's. Equality and `in` only. Solver: `String`, equality only.

**Date (a calendar day, no zone).** `Time.Day` from `foldkit-entity/time`: Effect has no Schema for a day without a time (a `DateTime` carries a time, so it is not the type here). In code `'YYYY-MM-DD'` text, branded, so plain text is refused where a day is wanted (probed with `Schema.brand`). Wire and SQLite: the same text, which orders correctly as text and keeps indexes; validity is held by the Schema and by `CHECK (x = date(x))`, which refuses `'2026-02-30'` since SQLite normalises it to `'2026-03-02'` (probed). Postgres: `date`. Range 0001-01-01 to 9999-12-31, the range CEL (Google's Common Expression Language, section 9) gives its timestamps. Literal `date'2026-01-31'`. Checker: intervals over the day number. Solver: `Int` days since 1970-01-01, a bijection on that range.

**Time of day.** Deferred. Nothing here needs it yet that a timestamp or a date does not cover, there is no time field in `foldkit-mixins-ui` to draw it, and it brings questions (24:00, leap seconds, a time that a daylight-saving change skips) that are worth answering with a caller. When it comes: milliseconds since midnight, an integer everywhere.

**Timestamp (an instant).** `Schema.DateTimeUtcFromMillis`, recognised by its Declaration id and its number encoding; no wrapper. In code an Effect `DateTime.Utc`. Stored and on the wire as integer milliseconds since the epoch: SQLite `integer`, Postgres `bigint`. That is what `Expr.now` already is (`context.ts`: `Schema.Int` milliseconds) and what Chirp stores. Postgres `timestamptz` is refused as its column: it keeps microseconds, and a value read through a JavaScript `Date` and written back no longer equals the stored one (probed). Literal `ts'2026-01-31T10:00:00.000Z'`. Solver: `Int`.

**Duration.** `Schema.DurationFromMillis`, recognised by its Declaration id; no wrapper. A fixed length, integer milliseconds, an Effect `Duration` in code. (`Schema.Duration` itself encodes to an object, probed, so it is not recognised; the refusal names `DurationFromMillis`.) Not a calendar length: "one month" is not a fixed number of milliseconds, nor is "one day" across a daylight-saving change (the probe's `interval '1 day'` added 23 hours in New York on 8 March). Calendar arithmetic exists only on dates, as named operations (`Time.addDays`, `Time.addMonths`), never as a duration value. This is the split CEL makes (its durations stop at hours), carried one step further. Literal `duration'PT15M'`.

**Lists and sets of scalars.** Deferred to phase 6. A set field (tags from a closed enumeration) would be stored as JSON array text in SQLite and `text[]` in Postgres, with `List.has(field, value)` and `List.size(field)`. Against a related Entity it is worth it only for a small closed set with no identity of its own; anything with identity, order or unbounded growth stays a relation, which every reader already handles (`Expr.exists`).

**JSON and opaque values.** Refused as operands. Equality of JSON differs by reader (key order, number spelling, `jsonb` normalisation), and a rule that reads inside one is a rule over a schema the language does not know. Such a field can still be stored and read by the application; an expression cannot read it.

### 3.4 In the first release, and deferred

| Type | First release | Why |
| --- | --- | --- |
| boolean, text, enumeration, identifier | yes (enumeration order and id checks are new) | cheap; already half there |
| integer, decimal | yes, phase 1 | unblock money and totals; the solver's best theory |
| date, timestamp, duration | yes, phase 3 | the most common reason a custom operator is written |
| money | yes, phase 6 (a decimal plus a currency in the type) | needs decimal and its rounding first |
| float | yes: `Schema.Finite` recognised | arithmetic is today's; solver waits on 600 phase 2 |
| time of day | deferred | no caller, no widget, unanswered edge cases |
| lists, sets | deferred to phase 6 | storage differs by dialect; a relation covers most cases |
| JSON | refused | readers cannot agree on its equality |
| bigint past 2^53 | deferred | JSON cannot carry it; nothing here counts that high |

## 4. The operations

Names follow what exists: `Expr.add`, `Expr.gt`, `Text.startsWith`. New operations live in one module each, grouped by subpath (`foldkit-entity/number`, `/decimal`, `/money`, `/text`, `/time`, `/enum`, `/rows`; the three shipped Schemas live in the subpath of their operations) and imported by name or as an ESM namespace (`import * as Number from 'foldkit-entity/number'`, which bundlers shake member by member), never as members of an object, so a page carries only what it names (section 5). `Number` follows Effect's own module of that name; it shadows the global only in a file that imports it so. `Expr.add`, `Expr.sub` and `Text.startsWith` stay where they are (on the `Expr` and `Text` objects every page already imports) and learn the recognised Schemas; `foldkit-entity/text` re-exports `startsWith` beside the new text operations.

Every operation below is null-strict (a null argument gives null, a predicate over one is unknown) unless its row says otherwise. "Laws" are the `Law` values the operation declares (`law.ts`), which `Conformance.laws` tests, the interval pass of `Laws.check` uses for monotonic ones (`bounds.ts`), and the solver instantiates. "Solver" names the theory: LIA is linear integer arithmetic, NIA nonlinear, which 600 phase 1 refuses.

### 4.1 Numbers (integer, decimal, money, float)

| Operation | Signature | Laws | Interval pass | Solver |
| --- | --- | --- | --- | --- |
| `Expr.add(a, b)`, `Expr.sub(a, b)` | `K x K -> K`, one kind, one scale | as today; associative too on int and decimal | yes (monotonic) | LIA |
| `Number.negate(a)` | `K -> K` | monotonic decreasing; inverse of add with 0 | yes | LIA |
| `Number.times(a, n)` | `K x int -> K`; `int x int -> int` | commutative on int x int; monotonic in each where the other >= 0 | yes for a literal | LIA by a literal, NIA otherwise |
| `Number.scale(a, d, { rounding })` | `decimal(s) x decimal(t) -> decimal(s)` | monotonic in `a` where `d >= 0` | yes for a literal | LIA by a literal (div and mod by a constant) |
| `Number.percent(a, p, { rounding })` | `K x int -> K`: `a * p / 100` | as `scale` | yes for a literal | as `scale` |
| `Number.div(a, b, { rounding, onZero })` | `K x int -> K`, or `int x int -> int` | monotonic in `a` where `b > 0` | for a positive literal | LIA by a literal; NIA otherwise |
| `Number.rem(a, b)` | `int x int -> int`, truncated | range `(-abs b, abs b)` | for a literal | LIA by a literal |
| `Number.abs(a)` | `K -> K` | monotonic within `>= 0`, decreasing within `<= 0` | yes | LIA (`ite`) |
| `Number.min(a, b)`, `Number.max(a, b)` | `K x K -> K` | commutative, associative, idempotent, monotonic | yes | LIA (`ite`) |
| `Number.round(a, { scale, rounding })` | `decimal(s) -> decimal(t)`, `t < s` | monotonic increasing | yes | LIA |
| `Number.toDecimal(i, scale)` | `int -> decimal(scale)`, exact | monotonic increasing | yes | LIA (times `10^scale`) |
| `Number.toInt(d, { rounding })` | `decimal -> int` | monotonic increasing | yes | LIA |
| `Expr.lt` … `gte`, `eq` | `K x K -> boolean`, as today | | yes | LIA |

`K` is one numeric kind (integer, float, decimal at a scale, money in a currency; a plain `Schema.Number` joins any). Two decimals or two amounts must share the scale and currency; an integer with a float gives a float, so existing expressions keep working. A plain literal on either side takes the other side's kind and is checked where the expression is built (a scale-2 literal `12.505` is refused). `rounding` is one of `'half-even'`, `'half-away-from-zero'`, `'floor'`, `'ceiling'`, `'toward-zero'`; it is required, because a default here is a silent decision about money.

**SQL.** No operation compiles to a database's `round`, `/`, `cast`, `least` or `min`, since each of those disagrees (section 3.2). Each compiles to integer arithmetic both dialects agree on, given integers: `+`, `-`, `*`, `%` (truncating in both, probed) and `/` applied to an exact multiple. Here are floor division and half-even rounding of `n / d` for a positive literal `d`, as emitted. Postgres parameters are cast to `bigint`, as `castFor` in `compile.ts` already casts numbers.

```sql
-- q = floor(n / d), exact: n minus its non-negative remainder is a multiple of d
((n - ((n % d) + d) % d) / d)
-- half-even: r = n - q * d
case when 2 * r > d then q + 1
     when 2 * r < d then q
     when ((q % 2) + 2) % 2 = 0 then q
     else q + 1 end
```

The JavaScript is the same formula in safe integers (`(n - (((n % d) + d) % d)) / d`, which does not rest on a rounded quotient). Probed over 2,000 seeded cases including 40 exact halves: SQLite, Postgres and JavaScript gave 0 disagreements, where `Math.round(n / d)` differed from half-even in 120. `min` and `max` compile to `case when a is null or b is null then null when a <= b then a else b end`. `Number.times(money, int)` is `a * b`. `Number.scale(a, d)` with `d` a decimal of scale `t` is `a * d` in units, rounded at `10^t` by the formula above.

**Division by a field** (`Number.div(a, field, …)`) needs `onZero: 'null'`, compiled `case when b = 0 then null else … end` on both dialects and the same in JavaScript: SQLite gives null, Postgres an error and JavaScript Infinity otherwise (probed). The solver treats it as NIA; 600 phase 1 answers `undecided` for it, with the hint to divide by a literal.

**Conformance cases** for each: zero, negatives, each rounding mode at an exact half (2.5, -2.5, 0.125 at scale 2), the largest safe integer and one step past it (refused by the judge), a null in each position, and generated cases (section 6).

### 4.2 Text

| Operation | Signature | SQLite | Postgres | JavaScript | Solver |
| --- | --- | --- | --- | --- | --- |
| `Text.length(t)` | `text -> int`, code points | `length(t)` | `length(t)` | `Array.from(t).length` | `str.len` |
| `Text.lowerAscii(t)`, `upperAscii` | `text -> text`, A-Z only | `lower(t)` | `lower(t collate "C")` | `Collation.foldAscii` | uninterpreted, with laws |
| `Text.trim(t)` | `text -> text` | `trim(t, ' '‖char(9)‖char(10)‖char(13))` | `btrim(t, E' \t\n\r')` | regex over the four | uninterpreted |
| `Text.concat(a, b)` | `text x text -> text` | `a ‖ b` | `a ‖ b` | `a + b`, null-strict | `str.++` |
| `Text.startsWith(t, p)` | as today | as today | as today | as today | `str.prefixof` |
| `Text.endsWith(t, s)` | `text x text -> boolean`, under a collation | `length(s) = 0 or substr(t, -length(s)) = s` | `right(t, length(s)) = s` | by code point | `str.suffixof` |
| `Text.includes(t, s)` | case-sensitive, under a collation | `instr(t, s) > 0` | `strpos(t collate "C", s) > 0` | by code point | `str.contains` |
| `Expr.contains(t, s)` | as today, ASCII case folded | as today | as today | as today | refused (600) |

(`‖` stands for SQL's two-bar concatenation operator in this table.) Probed: code-point length and ASCII lower each gave 0 disagreements over 500 seeded texts with emoji, combining marks, `İ`, `ß` and `Σ`; the ASCII white-space trim gave 0 over 500 texts with tabs, newlines, NBSP and U+3000; `upper` of `'éßa'` is `'éßA'` on all three. `endsWith` needs its guard: SQLite's `substr(t, -0)` is the whole text where Postgres's `right(t, 0)` is empty (probed).

**Laws.** `concat` is associative with `''` as both identities and keeps its operands' collation (`Law.preservesCollation`); `lowerAscii` is idempotent; `length` of a `concat` is the sum (instantiated by the solver as a ground fact).

**Pattern matching** is not in the first release. `LIKE` folds ASCII case in SQLite and not in Postgres (probed), reads `%` and `_` as wildcards, and a regular expression is three dialects (RE2 in CEL, POSIX in Postgres, none in SQLite without an extension). If a caller needs more than prefix, suffix and substring, a small glob (`*` and `?` only, compiled with escapes to `LIKE … ESCAPE` under `binary` on both) is the candidate; regular expressions are refused on purpose.

**Unicode case** (`lower('İ')`, `upper('ß')`) is deferred. JavaScript and Postgres 18's `pg_unicode_fast` collation agree (`'i̇'`, `'SS'`, final sigma `'οδος'`, probed in Docker), Postgres 17 under `en_US.UTF-8` does not (`upper('ß')` is `'ß'`), and SQLite has no Unicode casing without ICU or a function the application registers on its connection, which neither D1 nor a shared Worker binding offers (not probed). The ASCII-only operations are named so, so nobody mistakes them for full casing.

### 4.3 Dates and times

| Operation | Signature | SQLite | Postgres | Solver |
| --- | --- | --- | --- | --- |
| `Time.today(zone)` | `-> date`, a context term | bound parameter | bound parameter | free `Int` |
| `Expr.now` | `-> timestamp`, as today | bound parameter | bound parameter | free `Int` |
| `Time.addDays(d, n)` | `date x int -> date` | `date(d, n ‖ ' days')` | `d + n` | `d + n` |
| `Time.addMonths(d, n)` | `date x int -> date`, clamped | `min(…)` below | `d + make_interval(months => n)` | uninterpreted, with laws |
| `Time.daysBetween(a, b)` | `date x date -> int` | `cast(round(julianday(a) - julianday(b)) as integer)` | `a - b` | `a - b` |
| `Time.startOfMonth(d)` | `date -> date` | `date(d, 'start of month')` | `date_trunc('month', d)::date` | uninterpreted, with laws |
| `Time.part(d, p)` | `date -> int`: year, month, day, weekday | `strftime` | `extract` | uninterpreted |
| `Time.add(t, by)` | `timestamp x duration -> timestamp` | `t + by` | `t + by` | `t + by` |
| `Time.between(a, b)` | `timestamp x timestamp -> duration` | `a - b` | `a - b` | `a - b` |
| `Time.overlaps(s1, e1, s2, e2)` | half-open ranges of one kind | `s1 < e2 and s2 < e1` | same | LIA |
| comparisons | within one kind, as today | text (date), integer | `date`, `bigint` | LIA |

`addMonths` on SQLite, which has no clamping before 3.46's `'floor'` modifier:

```sql
min(date(d, 'start of month', n || ' months', (cast(strftime('%d', d) as integer) - 1) || ' days'),
    date(d, 'start of month', n || ' months', '+1 month', '-1 day'))
```

Probed over 1,500 seeded dates and month counts from -30 to 30: this, Postgres's `+ make_interval`, the same clamp in JavaScript and SQLite's `'floor'` modifier gave 0 disagreements. Its laws: monotonic (non-decreasing) in the date, `addMonths(d, 0) = d`; not associative (31 January plus one month twice is 28 March, plus two months is 31 March, probed), and no such law is declared. `daysBetween` gave 0 disagreements over 1,000 pairs; weekday numbering (0 is Sunday) agreed on SQLite, Postgres and JavaScript.

**Where "today" gets its zone.** "Today" is a calendar day, so it depends on a zone: at 23:30 UTC it is already tomorrow in Paris. `Time.today(zone)` takes the zone as a literal IANA name written in the expression (`'Europe/Paris'`), so the rule says which "today" it means and every reader computes the same day. The server computes it from its clock with `Intl.DateTimeFormat` (Node ships full ICU) and binds it as a parameter, as it binds `Expr.now` for `Entity.sets` (`remote-server/src/index.ts`, `now: Option.some(now)`); SQL never converts zones, which is what keeps the session-`TimeZone` disagreement out. The page computes it the same way from the browser's clock and `Intl`; no zone data ships in the bundle. Near midnight the page's day and the server's can differ, so the page's prediction of a rule over `today` is unknown within a margin (by default one hour either side of the zone's midnight), and the server decides. A zone taken from the viewer is rejected: the server cannot trust it, and the page and server would mean different days (open question 4).

**What is refused.** Converting an instant to a date in a zone inside SQL (SQLite has no zone data; Postgres's answer follows the session), adding a calendar unit to a timestamp, and a duration of months or days.

**Where a clock may be read.** Guard refuses a rule that reads `Expr.now` (`guard/src/index.ts`: "who may do something does not move with the clock here"), and a write's `when` refuses `Expr.now` and `Expr.viewer`. The library makes "may edit within fifteen minutes of posting" expressible (`Expr.lte(Expr.now, Time.add(Post.fields.createdAt, Duration.minutes(15)))`) without a custom operator. Whether a `when` and a Guard rule may read the clock terms is their owners' decision, outside this note; the margin rule above is what the page would need to predict them honestly.

### 4.4 Choice, missing values and membership

| Operation | Signature | SQL (both) | JavaScript | Solver |
| --- | --- | --- | --- | --- |
| `Expr.coalesce(a, b)` | `K? x K -> K` | `coalesce(a, b)` | `a === null ? b : a` | `ite` on defined |
| `Expr.if(c, a, b)` | `boolean x K x K -> K` | `case when c then a else b end` | the same, unknown takes `b` | `ite(isTrue c, a, b)` |
| `Expr.match(e, cases)` | `enum x { [value]: K } -> K` | `case e when 'v1' then … end` | lookup | `ite` chain over a finite set |
| `Expr.in(a, list)` | as today | as today | as today | disjunction (600) |
| `List.has(set, v)` | phase 6 | `exists (select 1 from json_each(s) …)` / `v = any(s)` | `includes` | bounded |

`Expr.if` follows SQL: an unknown condition takes the `else` branch, since that is what `case when` does on both dialects, and the judge does the same. Writing it down matters because it differs from "unknown propagates", which every other operation does.

**An exhaustive case.** `Expr.match(Order.fields.plan, { free: 0, pro: 900, team: 2900 })` is typed by a mapped type over the enumeration's literals: a missing value is a type error ("property 'team' is missing") and an extra one is an excess-property error. The declaration repeats the check at run time (the same keys, no more), since a field typed loosely still reaches it. A null `e` gives null. In the solver it is an `ite` chain over a finite set; probed, "every plan has a price >= 0" is proved and a mispriced `team` is refused with `s = Team`.

### 4.5 Across related rows

| Operation | Meaning | SQL (both dialects) | The page predicts | Checker and solver |
| --- | --- | --- | --- | --- |
| `Rows.count(rel, where?)` | rows pointing here through `rel` | `(select count(*) from t where t.fk = outer.id and …)` | if it holds them all | delta per write |
| `Rows.sum(rel, field, where?)` | sum, 0 for none | `(select coalesce(sum(f), 0) from …)` | if it holds them all | delta per write |
| `Rows.min`, `Rows.max` | null for none | `(select min(f) from …)` | if it holds them all | bounded |
| `Rows.every(rel, p)` | no pointing row fails `p` | `not exists (… where not coalesce(p, false))` | if it holds them all | bounded |
| `Rows.any(rel, p)` | = `Expr.exists(rel, p)` | as today | as today | as today |

`rel` is a `one` relation of the pointing Entity, as `Expr.exists` and `Derived.count` take. The rows counted point at the row judged, or, with `{ of }`, at the row an id names: an input (`{ of: input.room }`, what an insert's `when` needs, since an insert has no row of its own to start from) or a link of the judged row. `Expr.exists` today starts only from the row judged or a path from it; `{ of }` is new in phase 5, and `Rows.any(rel, p, { of })` gives `exists` the same reach. `Rows.every` is two-valued on purpose: a row whose `p` is unknown counts as failing, which `not exists … not coalesce(p, false)` says on both dialects; "every row of none" is true, where Postgres's `bool_and` of no rows is null (probed). `Rows.sum` pins 0 for no rows, where both databases give null (probed); a sum past the safe range is refused by the judge, and SQLite would raise "integer overflow" for it (probed).

**Relation to `Derived`.** A derived member is not an operand today (`docs/expressions.md`, Limits). With aggregates, `Derived.of(expr)` defines a member by an expression over its own row and its related rows, and such a member is an operand, since the expression says what it means to every reader. `Derived.count(rel)` becomes `Derived.of(Rows.count(rel))` with one compile path, so there are not two ways to count. `Derived.make` (a value the application supplies) stays opaque.

**What the page can say.** The judge already answers an `exists` unknown "when no held row holds and the holder may lack one that would" (`Expr.exists`'s doc). An aggregate needs more: the page knows a sum only when it holds every row pointing at this one, which it knows when it read that relation whole (a nested `many` read with no `first`, or a list whose query is exactly `rel = id`). Otherwise it is unknown, with the reason. A pending write moves a held sum by its own delta, so a held order total updates the moment a line changes.

**What the checker and solver can say.** A write to the pointing Entity changes an aggregate by a known amount: an insert adds the row's value, a delete subtracts it, an update adds the difference. So a rule over a sum is a one-step question with the sum as one variable and the delta as a term, linear, and provable for any number of rows (probed: "the total stays the sum after editing one line", unsat). `Rows.min`, `max` and `every` have no such delta (deleting the minimum needs the next one), so they are searched over a bounded number of symbolic rows and reported as checked up to that bound, never as proved.

**What the writer must do.** A rule that reads other rows is only as safe as the writer that judges it. Two concurrent `SendMoney` writes can each read a balance that admits them and together overdraw it. SQLite serialises writers, so the declared writer holds such a rule there; on Postgres the writer must lock the row the aggregate hangs on (`select … for update` of the account) inside the write's transaction, or run serialisable. This belongs to the writer in `foldkit-remote-drizzle` and is part of phase 5's acceptance. D1 commits in batches, not transactions (`docs/agents/traps-cloudflare-and-servers.md`), so there a rule over an aggregate is refused where it is declared, with that reason.

## 5. How an operation is defined once

Today a primitive kernel operator is three separate pieces that nothing ties together: its descriptor in `expr.ts` or `text.ts`, its memory implementation in `memoryTable.ts`, and its SQL implementation in `remote-drizzle/src/operators.ts`. The kernel's three operators are listed by hand in each (`table([startsWith, add, sub])` in both).

**One entry per operation, split by reader, held complete by the type system.** "Defined once" means one entry, with one part per reader and nothing a reader may supply differently. An operation is one definition with five parts, kept in one module per reader so that a page never imports a server's or a solver's part:

| Part | Lives in | Contents |
| --- | --- | --- |
| descriptor and memory implementation | `foldkit-entity/<kind>/<name>.ts` | id, version, signature, description, nulls, collation, laws, the JS function |
| SQL implementation | `foldkit-remote-drizzle/src/kernel/<name>.ts` | a builder per dialect: `{ sqlite, postgres }` |
| solver translation | `foldkit-entity-prove/src/kernel/<name>.ts` | SMT-LIB text from the arguments' terms, and its theory |
| conformance cases | `foldkit-entity/conformance/kernel/<name>.ts` | hand-picked awkward cases; generators come from the kinds |
| documentation | the descriptor's `description` | what it means, its null rule, where readers part and the rule taken |

`foldkit-entity` exports a type-only union of kernel ids, `KernelId`, built from its descriptors. Each reader's table is an object literal checked with `satisfies { readonly [K in KernelId]: SqlImplementation }` (and the same for the solver and the cases): a missing entry is a compile error naming the id, and an extra one an excess-property error. A runtime test enumerates the kernel's descriptors and fails if any reader lacks an entry, any conformance case set is empty, or any declared law has no `Conformance.laws` evidence on both the memory and the SQL implementation. A half-added operation cannot pass CI.

**The judge without a registry of everything.** The judge must run a kernel operation it meets in a node, but a page must not import every implementation to make that possible. So a kernel descriptor carries its memory implementation: the node built by `Number.times(…)` refers to the descriptor, which refers to its function, and a page that never calls `times` never imports either. Application tables (`Operators.memory`, `override`) keep working for custom operators. A pending write that carries a computed assignment by name (`number.times@1`) is resolved against the operators reachable from the writes and queries given to `Remote.make`, not a global list, so `Operators.kernel` stops being "every kernel operator" and becomes "every operator the application's declarations name".

**Where it lives, and what a page carries.** One file per operation, each a package entry (as `foldkit-entity`'s build already makes each source file an entry, #215), re-exported by name from `foldkit-entity/number`, `/decimal`, `/money`, `/text`, `/time`, `/enum` and `/rows`, each subpath an ESM module whose namespace import is shaken per member. Not as members of the `Expr` or `Text` objects: a namespace object keeps every member's module in every page that reads one member (`docs/agents/traps-bundling-and-builds.md`). The kernel's namespaces (`number`, `text`, `time`, `decimal`, `money`, `enum`, `rows`, `choice`, `list`) are reserved: `Expr.operator` refuses an application id under them, as it refuses `foldkit.` today. A bundle budget pins a page that uses one date operation with every other library module `absent`.

**A custom operator keeps working,** unchanged. It becomes provable in one of two ways. Defined by an expression (`definedAs`), it is expanded and is exactly as provable as the library operations it is built from; the library's main effect on custom operators is that most of them become defined ones (`bank.monthOf` is `Time.startOfMonth`). Primitive, it stays a black box to the solver except for the laws it declares, which 600 §4 instantiates as ground facts over the calls in a question (probed: `add_months` with the law "greater for m >= 1" proves `end > start`; without it, a witness). Entity still gains no solver vocabulary for applications: only the kernel's entries have solver translations, which the kernel owns and tests.

## 6. Verification

### 6.1 That the library itself is right

What exists to build on: `foldkit-entity/conformance` runs bodies, rows and expected ids through `evaluate`, Remote's store, SQLite, Postgres (PGlite, and a real Postgres in a locale in CI's `postgres-locale` job) and `Judge`; `Conformance.operator` runs one set of calls through every implementation and compares answers and refusals; `Conformance.laws` tests each declared law over seeded tuples drawn from fixed samples per kind (`conformance/operator.ts`) and returns `Tested` evidence; `examples/entity`'s `language.test.ts` holds SQLite, `evaluate` and `Judge` to one answer over generated rows.

The library extends each:

- [ ] **Generators per value type.** Each type supplies its awkward values (decimal: 0, ±1 unit, an exact half at each scale, the largest safe count of units; date: 29 February, the 28th to 31st of every month, 0001-01-01, 9999-12-31; text: the existing samples plus combining marks and U+10FFFF; timestamp: the epoch, negative instants) and a seeded random generator within its Schema's bounds. `samplesOf` in `conformance/operator.ts` gains them.
- [ ] **Every operation through every reader.** For each kernel operation, every generated and hand-picked case runs through the judge, the page's predictor (the same memory implementation, through `Write.apply` for writes), SQLite, PGlite and a real Postgres in a locale. The solver joins as a ground reader: it asserts the arguments and asks for the result, as 600 §5 proposes. All agree, or all refuse. A disagreement prints the case, each reader's answer and the seed.
- [ ] **A grammar of expressions.** The differential test of 600 phase 0 generates domains from a grammar; its grammar gains the library's operations and kinds, so random nestings (`round(times(sum(…), 3) / 7)`) meet every reader, not only one operation at a time.
- [ ] **The laws, tested.** Every declared law runs through `Conformance.laws` on the memory implementation and `Conformance.lawsBy` on each SQL dialect; the evidence is recorded in both tables (`withEvidence`). An operation claiming a law no implementation passes fails the completeness test of section 5.
- [ ] **Mutation specs.** One per kind's module: a rounding mode swapped, the `onZero` guard dropped, `least` written for `min`, `substr(t, -0)` unguarded, the SQLite month clamp's `min` replaced by its first argument. Each must turn a conformance case red; CI's `mutate:check` keeps the anchors.
- [ ] **The probe's disagreements as cases.** Every row of section 3.2 becomes a conformance case named for it, so the reason a formula exists is a test that fails without it.

Cost in CI: the conformance run is sized by seed count, as 600's differential suite is, with a budget of about 200 generated cases per operation. The probe ran 2,000 rounding cases through SQLite and PGlite in well under a minute, PGlite's start included. At that speed the first release's roughly 45 operations should stay under 30 seconds of the unit project (an estimate, not measured). PGlite's start, which blocks the thread for seconds, happens once in a `beforeAll` (`docs/agents/traps-tests-general.md`).

### 6.2 What it lets us verify about a domain

| Rule | Decided today | With the library | Witness for a broken version |
| --- | --- | --- | --- |
| bank: `WithdrawMoney` keeps `neverOverdrawn` | undecided | solver phase 1, over integer cents | `when amount <= balance + 100`: balance 0, amount 1 |
| bank: `ChargeFee` keeps `neverOverdrawn` | undecided (no fee) | `Laws.check` intervals: fee is a constant | no `when`: balance 0 |
| bank: a transfer conserves money | not expressible | by construction (sums); solver for stored balances | |
| bank: one fee a calendar month | custom operator, undecided | solver phase 2, dates as days | the `when` compares days, not months: two fees in March |
| booking: ends after it starts | as text, undecided under writes | solver phase 2 | `Reschedule` without a bound: start -1, end 0 |
| booking: trial is thirty days | custom operator | solver: `addDays` is `+` | a write setting `start` alone |
| booking: not in the past | custom operator, no zone | server and page agree, page unknown near midnight | |
| booking: no overlap in a room | hand-written source | `when` with `exists`; solver searches two rows | moved by one day: s1 -1, e1 0, s2 0, e2 1 |
| order: discount within the subtotal | not expressible | solver (NIA, 72 ms) or phase 1 with a literal rate | half-up written as `(n + 50) div 100`: n = -50 |
| order: total is the sum of its lines | not expressible | derived; solver proves edits keep it, any line count | |
| order: every plan has a price | `Laws.check` enumerates a literal union | `match` is exhaustive by type | a missing plan: a type error |
| order: within the credit limit | not expressible | phase 5: delta on insert, linear | no `when`: total = limit, line 1 |

**How the phases interlock with #600.**

| Library phase | Solver phase it feeds | What it settles there |
| --- | --- | --- |
| 1: integer, decimal, the single-definition format | 600 phase 1 (integers) | money as `Int`, exact: open question 2 is needed only for `Schema.Finite` |
| 2: `if`, `match`, `coalesce` | 600 phase 1 (`ite` over booleans, literal unions) | nothing open |
| 3: date, timestamp, duration, today | 600 phase 2 (`Expr.now`, context) | dates as `Int` days; `today` as a free `Int` per zone |
| 4: text | 600 phase 2 (text) | which text operations get exact theory terms (table 4.2) |
| 5: aggregates | 600 phase 3 (rules across records) | open question 3 in part: a rule across rows is a rule over an aggregate of a `one` relation |
| 6: money, lists, sets | phases 1 and 3 | money adds nothing for the solver; sets are bounded |

**Beyond checking.**

- **`CHECK` constraints.** `checks.ts` compiles Schema checks and one-row invariants with each table's operators; library operations bring their SQL with them, so `Expr.gt(after.end, after.start)`, `trialIsThirtyDays` and every kind's validity (`x = cast(x as integer)` for a decimal, `x = date(x)` for a date on SQLite) become generated constraints. A rule over an aggregate stays the writer's, reported as `serverOnly` as today.
- **Forms.** `Input.resolve` (`packages/form/src/input.ts`) maps text, number, boolean and literal unions to inputs and leaves a date unresolved. Reading the same recognised Schemas, it maps a `Time.Day` to `DatePicker` and a date range to `Calendar`'s `Selection.Range`, a `Schema.Int` to `NumberField` with step 1, a decimal and money to the amount input `packages/form-recipes` already has (minor units, currency, scale, locale), an enumeration to `Select`. A time of day has no widget yet, which is one reason it is deferred.
- **Crud and the data grid.** Filters and sorts are chosen by the field's Schema: a range for dates and amounts, `in` for an enumeration, an ordered enumeration sorted by position.
- **CMS.** Day, timestamp and money fields instead of ISO text the site parses (`dateOf` in `examples/cms/src/content/site.ts`); `cms.published` stays a defined operator.
- **Guard.** Rules over dates and amounts with no custom operator; a rule over the clock remains Guard's call (section 4.3).
- **Sync.** A document's laws are functions (`holds({ before, after })`) and stay so; a document that wants checkable laws can state them as expressions over its slice once these types and operations exist.
- **Agents.** A tool's input schema (`jsonSchemaOf`) says `{ "type": "string", "format": "date" }` for a date and carries a decimal's scale and a money field's currency, so an agent sends `"2026-01-31"`, not "next Friday".

## 7. Compatibility and migration

- **Nothing breaks on its own.** `Schema.Number` fields keep their meaning (a double, NaN admitted), and `Expr.add` and `Expr.sub` behave as today on them. Recognising Effect's own Schemas could have refused mixes that compile today, so the rules are set not to: an integer with a float gives a float, and a `Schema.Number` mixes with every number, as now. What is refused is new: the shipped Schemas (a decimal, money, a day) mixed with anything else, and a timestamp or duration used as a plain number, which no expression can do today (`OrderedOperand` admits no `DateTime`). `Expr.now` keeps its `Schema.Int` milliseconds, so Chirp's `createdAt: Schema.Number` set from it is unchanged; `Time.now` is the same clock typed as a timestamp. The other added refusal is the reserved kernel namespaces (an application operator named `number.times` must be renamed).
- **A double becomes a decimal** by changing the field's Schema and migrating its column. The library provides a generated migration per dialect that rounds each stored double half-even at the scale into a new integer column, and a report of every row whose double was not within a millionth of a unit of a value at that scale, for review, never silently rounded. The column's type changes from `real` to `integer` (SQLite) or `double precision` to `bigint` (Postgres); `bind`'s column check (`checkColumn` in `remote-drizzle/src/bind.ts`) learns the recognised Schemas and refuses a decimal on a `real` column with that sentence.
- **Dates kept as ISO text** (the CMS's `publishedAt`) become `Time.Day` or `Schema.DateTimeUtcFromMillis` with no data change where the text is already a day or an instant is already milliseconds; ISO instant text to milliseconds is a generated migration.
- **`Expr.show`** prints each type's literal (`12.50`, `EUR 12.50`, `date'2026-01-31'`, `ts'…'`, `duration'PT15M'`) and each operation by name, `(a * 3)` for `times` by a literal; existing output is unchanged.
- **The wire.** Encoded values are JSON scalars, so rows, inputs and cursors travel as today. An operator's `OperatorDescription` (published by `Operators.describeTable`) gains what each argument means through its JSON Schema (`format: date`, a scale, a currency). A client and a server on different deploys already refuse a call to an operator version the other lacks (`missingName`); a new kernel operation is version 1 of a new id, so an old client refuses it by name rather than misreading it.

## 8. Costs and risks

| Cost | Measured or decided |
| --- | --- |
| Bundle per operation a page names | about 175 B brotli (descriptor 120, implementation 55), from `add`/`sub` slices; an estimate |
| Bundle for an operation it does not name | none, held by one module per operation and a budget's `absent` |
| Implementations | about 45 operations x 5 parts (memory, SQL, solver, cases, docs) in the first release |
| Time-zone data | none shipped: zones are computed with `Intl`, which Node and browsers carry |
| Effect modules | `BigDecimal` and `DateTime` only in a page that decodes a decimal or timestamp; not measured |
| CI | under 30 s of conformance in the unit project, sized by seeds (section 6.1) |
| Postgres on a locale | text operations compile under `collate "C"` or are ASCII-only, so the locale does not reach them |

**The line against a programming language.** An operation enters only if (1) every reader implements it exactly, or refuses it by name with a reason; (2) it has conformance cases, including the awkward values of its kinds, that pass on every reader; (3) it is total over its input Schema, or its partiality is a declared answer (`onZero`); (4) it reads nothing but its arguments: no clock, no randomness, no other row except through `Rows`. User-defined functions with bodies, recursion and loops are refused, and so are regular expressions, floating-point money and Unicode casing until every reader can do it.

**Risks.** A second and third semantics for every operation (SQL, the solver) can drift from the judge: the completeness test, the generated conformance cases and the mutation specs are the guard, as they are for the SQL compilers today. `Schema.Int`, `Schema.Finite` and `Schema.Number` all decode to plain `number`, so what tells them apart is caught only where the expression is built: a throw at definition, not an editor error. The shipped Schemas and Effect's `DateTime` and `Duration` types are caught in the editor. A reader that recognises Schemas by their ids depends on Effect keeping those ids (`effect/schema/isInt`, `effect/schema/DateTimeUtc`, …); a test pins each one, so an Effect upgrade that renames one fails there first. Aggregates invite rules whose safety depends on the writer's isolation (section 4.5); refusing them on D1 and requiring a lock on Postgres is part of the design, not an afterthought.

## 9. Rejected alternatives

- **Leave it to custom operators.** That is today, and the cost is in section 2: every application writes the same operators, implements each per reader, meets the same disagreements alone, and gets `undecided` from the checker for all of them.
- **Raw SQL fragments in expressions.** The judge, the page, the checker and the solver cannot read SQL text, and a fragment is one dialect's. It would make every rule that uses one server-only.
- **CEL (Common Expression Language)**, the closest prior art for "one expression, several evaluators". Its language definition gets several things right, and we take them: integer overflow is an error, not a wrap ("Arithmetic operations raise an error when the results exceed the range of the integer type"); there are no implicit numeric conversions (`1 + 1u` does not dispatch); string size counts code points; timestamps and durations are separate types, and durations stop at hours ("Durations greater than the hour granularity, such as days or weeks, are not supported"), with calendar fields read through accessors that take a zone. What it lacks for us: it has no SQL compiler and no notion of SQL's unknown (its errors absorb in `&&` and `||`, a different logic from SQL's three values); it has `double` but no exact decimal; timestamps have nanosecond precision, which no JavaScript `Date` keeps; its regular expressions are RE2, which neither SQLite nor Postgres runs; and its definition does not say what division by zero or a negative remainder gives. Adopting it would mean a CEL-to-SQL compiler and a CEL judge in the browser, then pinning everything section 3.2 pins anyway.
- **JSONLogic.** Portable JSON, but untyped: `{"+": [1, "2"]}` has an answer, which is the class of mistake the recognised Schemas exist to refuse. No dates, no decimals, no SQL.
- **A SQL subset as the language.** Its semantics are the dialects', which disagree exactly where section 3.2 shows; a subset that pins each would be this library written in SQL's syntax, without types.
- **Zod or ArkType refinements, or Effect Schema filters.** They check one value in JavaScript; they are not data a compiler or solver can read. Effect Schema stays the way a field declares what it holds.
- **A `Kind` namespace** (`Kind.int`, `Kind.date`, `Kind.money('EUR')`, an earlier draft of this note). `Kind.int` beside `Schema.Int` is two ways to say one thing, and an existing `Schema.Int` field would have meant nothing to the readers until declared again. Effect's own Schemas already carry ids every reader can match (section 3.1), so the library recognises them and ships a Schema only where Effect says nothing: a scale, a currency, a calendar day, an order. Those live with their operations (`Decimal`, `Money`, `Time`, `Enum`), not in a grab-bag, and no user-facing page needs the word "kind". No recognised Schema needed a wrapper: `DateTimeUtcFromMillis` and `DurationFromMillis` already encode to a number, and `Schema.Int` and `Schema.Finite` to a number with an id.
- **Exact decimals as Postgres `numeric` and SQLite text.** Text does not order as numbers do (`'10.00' < '9.00'`), and SQLite's `numeric` affinity turns `'12.50'` into a double (probed). Integer units agree everywhere and keep indexes (open question 1 keeps the choice visible).

## 10. A plan in phases

Smallest first. Each phase says what a user can do afterwards, what must pass before it is done, the solver phase it feeds, and whether it waits on a decision.

**Phase 1: integers and decimals, and the single-definition format.** A user's `Schema.Int` and `Schema.Finite` fields are recognised as they are; a user declares a decimal with `Decimal.schema({ scale })`, and uses `times` and `scale` by a literal, `negate`, `abs`, `min`, `max`, `round`, `div` by a literal and the conversions; a decimal of another scale, or a decimal and an integer, is refused (in the editor where the types can tell, at definition otherwise). Acceptance: the format of section 5 with `KernelId` and the completeness test; every number row of section 3.2 a conformance case; the half-even differential (0 disagreements in 2,000) in CI; the bank with its balance as `Kind.decimal({ scale: 2 })` (money, with its currency in the type, comes in phase 6), with `ChargeFee x neverOverdrawn` decided by intervals. Feeds 600 phase 1. Waits on question 1.

**Phase 2: choice.** A user writes `Expr.if`, `Expr.match` and `Expr.coalesce`. Acceptance: a `match` missing a value is a type error and a declaration error; `if` with an unknown condition takes `else` on every reader. Feeds 600 phase 1. No decision.

**Phase 3: dates and times.** A user declares a day with `Time.Day`, and `Schema.DateTimeUtcFromMillis` and `Schema.DurationFromMillis` fields are recognised as they are; uses `today`, `addDays`, `addMonths`, `daysBetween`, `startOfMonth`, `part`, `add`, `between` and `overlaps`; a form draws a date picker for a date. Acceptance: the month-clamp and days differentials in CI; the booking's one-row rules generated as `CHECK`s; the page's prediction over `today` unknown near midnight. Feeds 600 phase 2. Waits on questions 2 and 4.

**Phase 4: text.** A user uses `length`, `lowerAscii`, `upperAscii`, `trim`, `concat`, `endsWith` and `includes`. Acceptance: the text differentials (0 in 500 each) in CI, on a Postgres in `en_US.UTF-8` too. Feeds 600 phase 2. No decision.

**Phase 5: across related rows.** A user uses `Rows.sum`, `count`, `min`, `max`, `every` and `any` with `{ of }`, defines members with `Derived.of`, and states rules over aggregates. Acceptance: the order domain with its total derived, edits proved to keep it, and the credit limit decided by delta; the Postgres writer locks the parent row; D1 refuses such a rule where declared. Feeds 600 phase 3. No decision.

**Phase 6: money, lists and sets.** A user declares money with `Money.schema(currency)` and set fields. Acceptance: adding a EUR and a USD amount is a type error; a form draws the amount input for money. Feeds 600 phases 1 and 3. Waits on question 3.

Each phase lands with its README and guide sections (`docs/expressions.md` gains a section per value type), the skill reference for `foldkit-entity`, a changelog entry, mutation specs and a bundle budget pinning unnamed operations absent, as every published change does. Before phase 1, the inventory the issue asks for: today the repository's own sources declare two operators besides the kernel's (`cms.published`, defined; `text.startsWith`, the kernel's) and the examples none; the tests declare about thirty (`acme.concat`, `acme.half`, `bank.opaqueMinus`, `acme.twice`, …), and most of them are operations this library ships.

## 11. Open questions for the maintainer

1. **How a decimal is stored.** Recommended: an integer count of units at the declared scale in every store (SQLite `integer`, Postgres `bigint`), `BigDecimal` in code. Every reader agrees on integer arithmetic, order and indexes are integer ones, and the solver gets exact linear arithmetic. The cost is a range of ±(2^53-1) units and a column that holds 1250 for 12.50 when read by hand. Otherwise: Postgres `numeric(p, s)` and SQLite text, which then needs our own arithmetic in SQLite and loses numeric order there.
2. **Calendar durations.** Recommended: durations are fixed lengths only; months and days are operations on dates (`addMonths` clamped to the month's end, as Postgres and Effect do, `addDays`). Otherwise: refuse months altogether, and a monthly subscription's renewal becomes a custom operator again.
3. **Currency in the type, or in a field.** Recommended: in the type (`Money.schema('EUR')`), so mixing currencies is a type error and the solver never sees one. An application with per-row currencies declares an amount and a currency field and compares only within one currency through a guard (`Expr.eq(a.currency, b.currency)`) until a per-row form is designed. Otherwise: currency as a field from the start, with every arithmetic operation checking equality at run time and the solver carrying it as a variable.
4. **Where "today" gets its zone.** Recommended: a literal IANA zone written in the expression (`Time.today('Europe/Paris')`), computed by the server and bound, computed by the page with `Intl`, and unknown on the page within an hour of that zone's midnight. Otherwise: UTC only, which is wrong for any user not in UTC, or the viewer's zone, which the server cannot trust and which makes the page and the server mean different days.
