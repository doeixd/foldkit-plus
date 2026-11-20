# Write a business rule once and run it in JS, SQL, forms, and proofs

Most apps write the same rule four times: once in a TypeScript validator, once in a SQL `CHECK` or `WHERE` clause, once to disable a button before the user submits, and once in tests to make sure updates cannot break it. When one copy drifts, bugs slip through.

This guide takes you from a plain Effect `Schema` to one inspectable rule that validates values, generates Postgres SQL, disables UI actions when a row is frozen, and proves a withdrawal cannot overdraw an account. The full runnable version lives in [`examples/metakit/src/demo.ts`](../../../examples/metakit/src/demo.ts).

## Prerequisites

Install `metakit` alongside `effect`. Add `z3-solver` as a dev dependency if you want SMT counterexamples in tests.

```bash
pnpm add metakit effect
pnpm add -D z3-solver
```

## 1. Attach an inspectable invariant to an Effect Schema

An Effect `Schema` describes the shape of a record. `Expr.refine` attaches a data-level expression (`Expr`) to that schema instead of an opaque JavaScript callback, so every tool can read it.

```ts
import { Result, Schema } from 'effect'
import { Eq, Expr, Num, Transition } from 'metakit'

export const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)
```

Decoding with `Schema.decodeUnknownSync(Account)` now enforces `balance >= 0`, `reserved >= 0`, and `reserved <= balance` at runtime, just like `Schema.filter`.

## 2. Generate SQL `CHECK` and `WHERE` from the same rule

Because the invariant is data rather than a closure, `metakit/sql` compiles it to SQL without re-writing it.

```ts
import * as Sql from 'metakit/sql'

const check = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
// check.text ->
//   ((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance"))

const openHigh = Expr.in({ row: Account }, ({ row }) =>
  Expr.all(Eq.is(row.status, 'open'), Num.gte(row.balance, 20_000)),
)
const where = Result.getOrThrow(Sql.toWhere(openHigh, { dialect: 'postgres', rowPrefix: ['row'] }))
// where.text   -> (("status" IS NOT DISTINCT FROM $1) AND ("balance" >= $2))
// where.params -> ['open', 20000]
```

`Eq.is` compiles to `IS NOT DISTINCT FROM` in Postgres (`IS` in SQLite), so nullable columns match JavaScript equality.

## 3. Declare a guarded transition and disable actions early

A `Transition` pairs a boolean guard (`when`) with simultaneous field writes (`apply`). You can evaluate it against a full `{ state, input }` pair to run the update, or against a partial `{ state }` to know whether the action is allowed before the user types an amount.

```ts
import * as Machine from 'metakit/machine'

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.gt(input.amount, 0),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const Freeze = Transition.make({
  state: Account,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.status, 'open'),
  apply: ({ state }) => [Transition.set(state.status, 'frozen')],
})

export const AccountMachine = Machine.make({
  state: Account,
  transitions: { Withdraw, Freeze },
})

const frozen = { id: 'a1', balance: 50_000, reserved: 10_000, status: 'frozen' as const }
const affordances = AccountMachine.affordances(frozen)
// affordances -> { available: [], disabled: ['Withdraw', 'Freeze'], pending: [] }
```

On an open account, `Freeze` is `available` (its guard needs no input) and `Withdraw` is `pending` (it needs `input.amount`). On a frozen account, both become `disabled` without a separate UI check.

## 4. Prove that every transition preserves the schema invariants

`Prove.machine` checks every transition in `AccountMachine`. It runs a fast synchronous Zone check first and only boots Z3 if it needs a counterexample or non-linear reasoning.

```ts
import { Effect } from 'effect'
import * as Prove from 'metakit/prove'

const report = await Effect.runPromise(
  Prove.machine(AccountMachine, { pin: ['Withdraw', 'Freeze'] }),
)
// report.ok -> true
// report.format():
//   PROVED (zone) Withdraw [pinned]
//   PROVED (zone) Freeze [pinned]
```

If someone removes `Num.lte(input.amount, Num.sub(state.balance, state.reserved))` from `Withdraw`, `report.ok` becomes `false` and `report.format()` prints the exact `before`, `input`, `after`, violated invariant, and a copy-pasteable `Transition.run(...)` reproducer.

## Next

- Model currency-safe money, dates, ordered statuses, and sums: [Model domain types and row aggregates](./domain-types.md).
- Pin proofs and handle opaque JavaScript transitions in CI: [Verify a state machine in CI](./proving-transitions.md).
- Compute update maps, shrink SSR payloads, and gate dependent queries: [Prune SSR payloads and gate dependent queries](./resumability-and-queries.md).
