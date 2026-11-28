---
title: Stop writing the same business rule four times
description: How metakit replaces opaque JavaScript closures on Effect Schema with inspectable rules and state transitions that drive runtime checks, UI disabled states, SQL, and Z3 proofs.
date: 2026-11-26
author: Foldkit Plus
tags: [metakit, effect, schema, sql, z3]
---

# Stop writing the same business rule four times

Every backend starts with a simple rule: *an account's reserved hold can never exceed its balance, and a withdrawal can only touch the unreserved remainder.*

You write that rule once in your [Effect `Schema`](https://effect.website) validator, copy it into your UI to disable the **Withdraw** button, and copy it a third time into a Postgres `UPDATE ... WHERE` clause. When one copy drifts, TypeScript cannot catch it because plain JavaScript filter functions are opaque.

**`metakit`** replaces only those opaque closures with typed expression trees stored directly on your Effect v4 `Schema`. One declaration drives runtime decoding, UI disabled states, parameterized Postgres or SQLite SQL, and automated proofs. You can read the complete runnable walkthrough in [`examples/metakit/src/demo.ts`](../../examples/metakit/src/demo.ts).

Here is the drift bug you are trying to eliminate:

```ts sketch
// 1. Runtime validation (opaque closure)
const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).check(Schema.makeFilter(a => a.balance >= 0 && a.reserved >= 0 && a.reserved <= a.balance))

// 2. UI disabled check
const disabled = account.status !== 'open' || amount > account.balance - account.reserved

// 3. Server SQL — someone forgot `- reserved`
await sql`UPDATE accounts SET balance = balance - ${amount}
          WHERE id = ${id} AND status = 'open' AND balance >= ${amount}`
```

Copy #3 compiles, passes unit tests where `reserved` is `0`, and drains held funds in production.

## Put the rule on your Effect Schema once

Install `metakit` alongside Effect v4 (`pnpm add metakit effect`).

Instead of `Schema.makeFilter`, attach the rule with `Expr.refine` from `metakit`. Its callback receives `$`, a typed field accessor built from your `Schema.Struct`, and returns a data tree using operator helpers (`Num` for numbers, `Eq` for equality, `Expr.all` for logical AND). Pass `Account` to `Sql.toCheck` from `metakit/sql` to translate the same rule into a database constraint:

```ts
import { Result, Schema } from 'effect'
import { Expr, Num } from 'metakit'
import * as Sql from 'metakit/sql'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)

const bad = Schema.decodeUnknownResult(Account)({
  id: 'acct_1',
  balance: 10,
  reserved: 20,
  status: 'open',
})
const check: string = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
```

What happened:

- `Account` is still an ordinary Effect `Schema`: `Result.isFailure(bad)` is `true` because `20 <= 10` fails.
- `Sql.toCheck` returns an Effect `Result` (failing if a rule uses an operation SQL cannot express). Unwrapping it gives a plain SQL string you can drop into `CREATE TABLE`:

```sql
CHECK ((((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance"))) IS TRUE)
```

(`IS TRUE` ensures `NULL` values do not silently slip past a SQL `CHECK` constraint.)

## Drive UI disabled states and SQL from one transition

Data-at-rest checks only catch bad rows after the fact. Most drift happens in state updates: the UI checks one condition, the reducer applies a second, and the database runs a third.

`Transition.make` declares one guarded state update over `Account` (reusing `Account` from above). Its guard (`when`) and list of field writes (`apply`, using `Transition.set`) are expression trees. Three consumers read that same `Withdraw` declaration:

```ts
import { Result, Schema } from 'effect'
import { Eq, Expr, Num, Transition, Verdict } from 'metakit'
import * as Sql from 'metakit/sql'

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int.check(Schema.isGreaterThan(0)) }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const frozen = { id: 'acct_1', balance: 500, reserved: 100, status: 'frozen' as const }
const open = { id: 'acct_1', balance: 500, reserved: 100, status: 'open' as const }

const canFrozen = Transition.can(Withdraw, { state: frozen })
const canOpen = Transition.can(Withdraw, { state: open })
const next = Transition.run(Withdraw, open, { amount: 50 })
const update = Result.getOrThrow(
  Sql.toUpdate('accounts', Withdraw, { amount: 50 }, {
    dialect: 'postgres',
    whereId: { column: 'id', value: 'acct_1' },
  }),
)
```

What happened:

- **UI before the user types an amount:** `Transition.can` partially evaluates `when` with only `{ state }` and returns a three-valued `Verdict` (`True`, `False`, or `Unknown`). For `frozen`, `Verdict.isFalse(canFrozen)` is `true` so your UI disables the button immediately. For `open`, `Verdict.isUnknown(canOpen)` is `true` because the outcome still depends on `amount`, so the button stays enabled while waiting for input.
- **Runtime execution:** `Transition.run` validates the input and guard, then returns `Result.succeed({ id: 'acct_1', balance: 450, reserved: 100, status: 'open' })`.
- **Parameterized SQL:** `Sql.toUpdate` returns `{ text, params }`. All values are bound as parameters (`update.params` is `[50, 'open', 50, 'acct_1']`, never interpolated), identifiers are double-quoted, and arithmetic is clamped so Postgres rejects JavaScript safe-integer overflows just like JS does:

```sql
UPDATE "accounts"
SET "balance" = CAST(NULLIF(NULLIF(LEAST(GREATEST((CAST("balance" AS numeric) - $1), -9007199254740992), 9007199254740992), 9007199254740992), -9007199254740992) AS bigint)
WHERE (("id" = $4) AND (("status" IS NOT DISTINCT FROM $2) AND ($3 <= CAST(NULLIF(NULLIF(LEAST(GREATEST((CAST("balance" AS numeric) - "reserved"), -9007199254740992), 9007199254740992), 9007199254740992), -9007199254740992) AS bigint))))
```

Pass `update.text` and `update.params` straight to `pg`, `postgres.js`, or Drizzle.

## Catch the forgotten `- reserved` bug before CI ships it

Now introduce the exact bug from the opening snippet: check `amount <= balance` instead of `amount <= balance - reserved`. Group your transitions into a state machine with `Machine.make` (`metakit/machine`) and pass it to `Prove.machine` (`metakit/prove`, backed by the optional peer `z3-solver`, an automated theorem prover):

```ts
import { Effect, Schema } from 'effect'
import { Eq, Expr, Num, Transition, Verdict } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'

const BuggyWithdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int.check(Schema.isGreaterThan(0)) }),
  when: ({ state, input }) =>
    Expr.all(Eq.is(state.status, 'open'), Num.lte(input.amount, state.balance)),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const Ledger = Machine.make({ state: Account, transitions: { Withdraw: BuggyWithdraw } })
const report = await Effect.runPromise(Prove.machine(Ledger))
const fixedProof = await Effect.runPromise(Prove.transition(Account, Withdraw))
const fixedOk = Verdict.isTrue(fixedProof)
```

`Prove.machine` checks whether any valid state and input can break `Account`'s invariant. For `BuggyWithdraw`, Z3 finds a failing case, replays it against your real `Account` `Schema`, and `report.format()` prints:

```text
REFUTED Withdraw
  before:   {"balance":1,"reserved":1,"status":"open"}
  input:    {"amount":1}
  after:    {"balance":0,"reserved":1,"status":"open"}
  violated: (((balance >= 0) && (reserved >= 0)) && (reserved <= balance))
  repro:    Transition.run(Withdraw, {"balance":1,"reserved":1,"status":"open"}, {"amount":1})
```

You get a minimal, copy-pasteable reproduction without writing a fuzz test.

For the fixed `Withdraw` transition, `Prove.transition` proves `fixedOk === true` synchronously using fast built-in arithmetic checks—without even starting Z3.

## Reuse verified functions and run them through Effect

Real domains share calculations across guards, transitions, and queries. `Fn.params` (`metakit/fn`) declares a typed function with preconditions (`where`), a return `Schema` (`returns`), and postconditions (`ensures`). Calling it inside an expression inlines its tree so it still translates to SQL and proves in Z3 with `Prove.fn`.

To evaluate expressions, transitions, or functions inside an Effect program, `metakit/interpreter` provides `Interpreter` as an Effect `Context.Reference`. You can `yield*` it directly and layer tracing spans, audit observers, or custom-operator allowlists using standard Effect `Layer`s:

```ts
import { Effect, Schema } from 'effect'
import { Num, Verdict } from 'metakit'
import * as Fn from 'metakit/fn'
import * as Interpreter from 'metakit/interpreter'
import * as Prove from 'metakit/prove'

const NonNeg = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))

const netAvailable = Fn.params({ balance: NonNeg, reserved: NonNeg })
  .where(({ balance, reserved }) => Num.lte(reserved, balance))
  .returns(NonNeg)
  .ensures(({ params, result }) => Num.lte(result, params.balance))
  .body(({ balance, reserved }) => Num.sub(balance, reserved))

const proved = Verdict.isTrue(await Effect.runPromise(Prove.fn(netAvailable)))

const available = await Effect.runPromise(
  Effect.gen(function* () {
    const interp = yield* Interpreter.Interpreter
    return yield* interp.runFn(netAvailable, { balance: 500, reserved: 120 }, { checked: true })
  }),
)
```

What happened:

- `Prove.fn(netAvailable)` verifies in Z3 that `netAvailable` never overflows, always satisfies `NonNeg`, and always holds `result <= balance` whenever `reserved <= balance` (`proved === true`).
- `interp.runFn(..., { checked: true })` validates the parameters, checks `where`, evaluates the body, checks `returns` and `ensures`, and returns `380` (omitting `checked` skips the extra contract checks for hot paths).
- Functions compose with `andThen`, `partial`, `ifElse`, and boolean combinators (`Fn.and`, `Fn.or`, `Fn.not`) while carrying their contracts forward.

## The rest of the toolkit

Every subpath is tree-shakeable. Browser bundles that import `metakit`, `metakit/domain`, `metakit/machine`, or `metakit/inspect` never pull in `metakit/sql`, `metakit/drizzle`, or `z3-solver`:

- **Domain types (`metakit/domain`):** Fixed-scale `Money` and `Decimal` with exact half-even rounding in JS, SQL, and Z3, plus `CalendarDay`, `OrderedEnum`, `Id`, and fractional-index `Ordinal` ordering keys.
- **Cross-table rules (`metakit/relation`, `metakit/aggregates`, `metakit/drizzle`):** Typed foreign-key relations (including self-referential trees and composite keys) that compile to Drizzle or raw SQL subqueries, plus O(1) incremental `sum` and `count` deltas.
- **Concurrency checks (`metakit/pairs`, `metakit/store`):** `Transition.commutes` proves when two transitions give the same result in either order, and `Store.mountEffect` checks your declared database isolation level at startup, failing with `StoreRefused` if it cannot uphold your rules under concurrent writes.
- **Custom operations (`metakit/operation`, `metakit/language`):** Register domain-specific operators with typed Schemas and SQL templates, then supply their JS implementations once via `Interpreter.layer({ foreign })`.
- **Forms and JSON Schema (`metakit/inspect`):** `Inspect.fieldSpecs` and `Inspect.toJsonSchema` extract field kinds, numeric bounds, and nullability straight off your `Schema`.

## Where to go next

- **Want a step-by-step tutorial?** Follow [Write a business rule once and run it in JS, SQL, forms, and proofs](../../packages/metakit/docs/getting-started.md).
- **Want to see complete domains?** Browse [`examples/metakit/src/`](../../examples/metakit/src/)—including a Treasury FX ledger, a Hotel Booking engine, a Tech Tree catalog, and an E-Commerce cart.
- **Writing generic helpers over Effect `Schema`?** Read [Writing a generic helper over a Schema](../guides/generic-schema-helpers.md).
