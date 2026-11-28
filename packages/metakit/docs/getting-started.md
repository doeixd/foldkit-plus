# Write a business rule once and run it in JS, SQL, forms, and proofs

Effect `Schema` already gives you types, runtime decoding, and JSON Schema from one shape—until you add a cross-field rule with `Schema.makeFilter` or an update function in plain TypeScript. Because JavaScript closures are opaque, you end up repeating the same rule in SQL `CHECK`/`WHERE` clauses, in UI `disabled` checks, and in tests.

`@doeixd/metakit` extends Effect `Schema` by keeping those rules and single-step transitions as inspectable data. This tutorial takes you from an ordinary Effect `Schema` to one rule that validates values, generates Postgres SQL, disables UI actions when a row is frozen, and proves a withdrawal cannot overdraw an account. For the deeper design rationale, see [Why Effect Schema needs inspectable expressions](./why-metakit.md); the full runnable version lives in [`examples/metakit/src/demo.ts`](../../../examples/metakit/src/demo.ts).

## Prerequisites

Install `@doeixd/metakit` alongside `effect`. `z3-solver` is a general-purpose solver; add it as a dev dependency only if you want counterexamples for transitions the built-in checks cannot decide (this tutorial's proof does not need it).

```bash
pnpm add @doeixd/metakit effect
pnpm add -D z3-solver
```

The four steps below build one file. Keep every block in it, in order, as an ES module (step 4 uses top-level `await`), and run it with your TypeScript runner. Each step's result is shown in a comment under the code.

## 1. Attach an inspectable invariant to an Effect Schema

An Effect `Schema` describes the shape of a record. `Expr.refine` attaches a data-level expression (`Expr`, a small tree of operations such as `Num.gte`) to that schema instead of an opaque JavaScript callback, so every tool can read it. In `Expr.refine($ => …)`, `$` stands for the record being checked, so `$.balance` is its `balance` field.

```ts
import { Result, Schema } from 'effect'
import { Eq, Expr, Num, Transition } from '@doeixd/metakit'

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

Decoding with `Schema.decodeUnknownSync(Account)` now enforces `balance >= 0`, `reserved >= 0`, and `reserved <= balance` at runtime, as a `Schema.makeFilter` rule would. A value that breaks one fails to decode.

## 2. Generate SQL `CHECK` and `WHERE` from the same rule

Because the invariant is data rather than a closure, `@doeixd/metakit/sql` compiles it to SQL without re-writing it.

```ts
import * as Sql from '@doeixd/metakit/sql'

const check = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
// check ->
//   CHECK ((((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance"))) IS TRUE)

const openHigh = Expr.in({ row: Account }, ({ row }) =>
  Expr.all(Eq.is(row.status, 'open'), Num.gte(row.balance, 20_000)),
)
const where = Result.getOrThrow(Sql.toWhere(openHigh, { dialect: 'postgres', rowPrefix: ['row'] }))
// where.text   -> (("status" IS NOT DISTINCT FROM $1) AND ("balance" >= $2))
// where.params -> ['open', 20000]
```

What happened: `toCheck` wrote the `CHECK` clause for your migration, and `toWhere` wrote a `WHERE` clause with its values as parameters. `Expr.in({ row: Account }, …)` builds an expression over a named input, here the row, and `rowPrefix: ['row']` says paths under `row` are columns, so `row.status` becomes `"status"`.

The check ends in `IS TRUE` because SQL lets a `CHECK` pass when its result is null; here a null result fails, as it does when the Schema decodes the value. `Eq.is` compiles to `IS NOT DISTINCT FROM` in Postgres (`IS` in SQLite), so it answers of a null column as `Expr.eval`, metakit's in-memory evaluator, does. The same predicate selects the same rows on both databases and in `Expr.eval`.

## 3. Declare a guarded transition and disable actions early

A `Transition` is one state change: a boolean guard (`when`) with the field writes (`apply`) that happen together when the guard holds. A `Machine` is a named set of transitions over one Schema. You can evaluate a transition against a full `{ state, input }` pair to run the update, or against a partial `{ state }` to know whether the action is allowed before the user types an amount.

```ts
import * as Machine from '@doeixd/metakit/machine'

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
const affordances = Machine.affordances(AccountMachine, frozen)
// affordances -> { available: [], disabled: ['Withdraw', 'Freeze'], pending: [] }

const withdraw = Machine.intent(AccountMachine, 'Withdraw')
const admission = withdraw.can({ state: frozen }) // False
const message = withdraw.message({ amount: 500 }) // { _tag: 'Withdraw', input: { amount: 500 } }
```

`Machine.affordances` sorts every transition into `available` (its guard is true now), `disabled` (false now) or `pending` (it still needs input). On an open account, `Freeze` is `available` (its guard needs no input) and `Withdraw` is `pending` (it needs `input.amount`). On a frozen account, both are `disabled` without a separate UI check. To turn that into a button, put `disabled` on the button whose Message tag is in the `disabled` list.

Use paths from `state` as write targets. Use `Transition.pathsOf(stateSchema, inputSchema, suppliedSchemas)` to get the same typed accessors outside a transition callback. `input` and `supplied` paths also work in read expressions.

Use `Machine.intent` when the same control checks a transition and builds its message. The guard's `Verdict` is `Unknown` while it needs input. For a transition declared with `supplied: { now: Schema.Int }`, the host attaches the clock value by passing `{ ...message, supplied: { now } }` to `dispatch`. Dispatch checks the guard against the current state.

`Transition.stepObserved(Withdraw, account, { amount: 500 })` returns `{ state, emitted, writes }` on success. A same-value assignment adds no entry to `writes`. Other entries name a state path, a list with changed membership, or a field of a keyed row. Lifted paths start at the parent state, and opaque writes report the whole subtree they write.

## 4. Prove that every transition preserves the schema invariants

`Prove.machine` checks that no state a transition's guard allows can break a rule of the Schema. It runs the built-in interval and zone checkers first and starts Z3 only for a goal they cannot decide. `pin` names the transitions that must stay proved.

```ts
import { Effect } from 'effect'
import * as Prove from '@doeixd/metakit/prove'

const report = await Effect.runPromise(
  Prove.machine(AccountMachine, { pin: ['Withdraw', 'Freeze'] }),
)
// report.ok -> true
// report.format():
//   PROVED (zone) Withdraw [pinned]
//   PROVED (zone) Freeze [pinned]
```

If someone removes `Num.lte(input.amount, Num.sub(state.balance, state.reserved))` from `Withdraw`, `report.ok` becomes `false` and `report.format()` prints a state and input that break the rule: the exact `before`, `input`, `after`, the violated rule, and a `Transition.run(...)` call that repeats it. Try it: delete that guard line, run the file again, and compare with the report in [Verify a state machine in CI](./proving-transitions.md).

## 5. Write a generic helper over a Schema

When you write a generic helper that both builds a wrapper Schema (`Schema.Struct`, `Schema.Array`, `Expr.refine`, `Inspect.fieldSpecs`) and decodes it synchronously (`Schema.decodeUnknownSync`), constrain the type parameter to `SchemaOf` (`Schema.Top & Schema.ConstraintDecoder<unknown>`) exported from `@doeixd/metakit`:

```ts
import { Schema } from 'effect'
import type { SchemaOf } from '@doeixd/metakit'

export const decodeTable = <S extends SchemaOf>(row: S, input: unknown) =>
  Schema.decodeUnknownSync(Schema.Struct({ rows: Schema.Array(row) }))(input)
```

Using only `Schema.Top` fails on `decodeUnknownSync` (`DecodingServices` is `unknown`, not `never`); using only `Schema.ConstraintDecoder<unknown>` fails on `Schema.Struct` / `Schema.Array` because it lacks `Schema.Top`'s combinators. When your helper only constructs or inspects Schemas (without decoding), `Schema.Top` alone is enough.

If you attach `Schema.annotate({ title, description })` alongside `Expr.refine(...)` and also pass the Schema to Effect's `Schema.toJsonSchemaDocument`, place `.annotate(...)` **before** `Expr.refine(...)` (`@doeixd/metakit/inspect` reads annotations in either order, while Effect's generator reads annotations placed before the refinement).

## Next

- Model currency-safe money, dates, ordered statuses, and sums: [Model domain types and row aggregates](./domain-types.md).
- Pin proofs and handle opaque JavaScript transitions in CI: [Verify a state machine in CI](./proving-transitions.md).
- Compute update maps, shrink SSR payloads, and gate dependent queries: [Prune SSR payloads and gate dependent queries](./resumability-and-queries.md).
