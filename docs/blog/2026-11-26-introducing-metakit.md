---
title: Introducing metakit: inspectable rules and state transitions over Effect Schema
description: How attaching data-driven expressions and transitions to Effect Schema lets one declaration drive runtime validation, SQL, UI disabled states, forms, and proofs.
date: 2026-11-26
author: Foldkit Plus
tags: [metakit, effect, schema, sql, z3]
---

# Introducing metakit: inspectable rules and state transitions over Effect Schema

When you model a domain with [Effect `Schema`](https://effect.website) (Effect v4), one declaration gives you TypeScript types, runtime decoding, JSON Schema, and property-test generators. That stops the moment you write a business rule like `Schema.makeFilter(a => a.reserved <= a.balance)` or a state update in a plain function. JavaScript closures are opaque: nothing outside `decode` can read them. You end up copying the same rule into Postgres or SQLite constraints, UI button `disabled` checks, and server handlers—and the copies drift apart.

If you replace only those opaque closures with typed expression trees stored on the `Schema` itself, every consumer can read the exact same rule and state transition. That library is `metakit`, the expression and transition kernel behind Foldkit Plus. You can run the full walkthrough in [`examples/metakit/src/demo.ts`](../../examples/metakit/src/demo.ts) (`pnpm --filter foldkit-example-metakit demo`).

## Write a rule once on your Effect Schema

Install `metakit` alongside Effect v4 (`pnpm add metakit effect`).

Instead of passing a JavaScript closure to `Schema.makeFilter`, you pass a callback to `Expr.refine`. The callback receives `$`, a typed field accessor built from your `Schema`, and returns an expression tree using `metakit`'s operator modules (`Num` for numbers, `Eq` for equality, `Str` for text, `Bool` for booleans, `Expr.all` to combine conditions with AND):

```ts
import { Result, Schema } from 'effect'
import { Expr, Num } from 'metakit'
import * as Sql from 'metakit/sql'

const Account = Schema.Struct({
  balance: Schema.Int,
  reserved: Schema.Int,
}).pipe(
  Expr.refine($ => Expr.all(Num.gte($.balance, 0), Num.lte($.reserved, $.balance))),
)

const bad = Schema.decodeUnknownResult(Account)({ balance: 10, reserved: 20 })
const check = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
```

What happens when this runs:
- `Account` is still an ordinary Effect `Schema`: `Result.isFailure(bad)` is `true` because `20 <= 10` fails.
- `Sql.toCheck` reads the expression tree stored on `Account`'s `SchemaAST` and returns a `Result` (failing with `SqlUnsupportedError` if a rule uses an operation SQL cannot express). With `{ dialect: 'postgres' }` (or `'sqlite'`), `check` is:
  `CHECK (((("balance" >= 0) AND ("reserved" <= "balance"))) IS TRUE)`
  which drops straight into a `CREATE TABLE` statement.

You write the invariant once. Effect still owns decoding and TypeScript types, while your database enforces the identical constraint.

## How metakit fits with Effect

`metakit` extends Effect rather than wrapping or replacing it:

- **Effect `Schema` stays the source of truth.** Expressions read typed field paths derived directly from your `Schema.Struct`. Your existing `Schema.Int`, `Schema.Literals`, `Schema.NullOr`, `Schema.optional`, and `Schema.Option` fields keep working, and `Expr.rulesOf(schema)` reads both `Expr.refine` rules and built-in Effect bounds like `Schema.isBetween` (returning each rule's path, expression, and message).
- **Standard Effect data types everywhere.** Missing values use `Option`. Fallible calls—such as evaluating an overflowing integer, translating an unsupported expression to SQL, or running a refused transition—return Effect `Result` instead of throwing.
- **Scoped solver proofs with `Layer`.** Asynchronous proofs return an `Effect` backed by a scoped `Solver` service (defaulting to the optional peer `z3-solver`, an SMT solver). You can bound solve time with `{ timeoutMs }` or swap the backend with `Layer.succeed`.
- **Keep I/O in `Effect`.** `metakit` models pure, single-step rules and state updates. Keep clocks, ID generators, network calls, and retries in `Effect`: pass external values like `now` or `id` into a transition through `supplied`, and return side-effect descriptions as plain `emits` records for your runtime to execute.

## Turn one state update into UI hints, SQL, and a proof

Rules alone only check data at rest. Most bugs come from state updates: a UI disables a "Withdraw" button with one condition, an optimistic reducer applies a second, and a server `UPDATE` checks a third.

`Transition.make` declares one guarded state update over your Effect `Schema`. Its guard (`when`) and writes (`apply`, using `Transition.set`, `Transition.add`, or list writes like `Transition.insert` and `Transition.patch`) are expression trees. You can also declare `supplied` values (like `{ now: Schema.Int }`, passed at runtime via `Transition.step(t, state, input, { now })`) and `emits` records:

```ts
import { Effect, Schema } from 'effect'
import { Eq, Expr, Num, Transition, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'

const Account = Schema.Struct({
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int.check(Schema.isGreaterThan(0)) }),
  supplied: { now: Schema.Int },
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
  emits: ({ input, supplied }) => [
    Transition.emit('Withdrawn', { amount: input.amount, at: supplied.now }),
  ],
})

const frozen = { balance: 500, reserved: 100, status: 'frozen' as const }
const canWithdraw = Transition.can(Withdraw, { state: frozen })
const proof = await Effect.runPromise(Prove.transition(Account, Withdraw))
const disabled = Verdict.isFalse(canWithdraw)
const proved = Verdict.isTrue(proof)
```

What happens when this runs:
- `Transition.can` partially evaluates `Withdraw`'s guard with only `{ state: frozen }`—before the user enters an `amount` or `now`. It returns a three-valued `Verdict` (`True`, `False`, or `Unknown` when missing fields still matter). Here `disabled` is `true`, so your UI disables the button and an AI agent hides the tool.
- `Prove.transition` checks whether `Withdraw` can ever break `Account`'s invariant for any valid state and input. Fast synchronous range checks prove `proved === true` immediately without starting Z3.

If someone later deletes `Num.lte(input.amount, ...)` from the guard, `Prove.transition` escalates to Z3 and returns `Verdict.False` carrying a concrete counterexample (`balance: 0, reserved: 0, amount: 1 -> balance: -1`) replayed against your `Schema`. (`Prove.machine` runs this across every transition in a state machine and formats the counterexample report for CI.)

## What metakit unlocks across your project

Because rules and transitions are data instead of closures, every other layer reads the same declaration:

- **Database queries and updates (`metakit/sql`, `metakit/drizzle`, `metakit/relation`, `metakit/aggregates`).** One rule translates to parameterized Postgres and SQLite `CHECK`, `WHERE`, and guarded `UPDATE` statements—as plain SQL text or Drizzle `SQL` fragments. `metakit/relation` compiles cross-table predicates into correlated subqueries, and `metakit/aggregates` computes O(1) incremental `sum`/`count` deltas that match SQL aggregates.
- **Typed domain primitives (`metakit/domain`).** Fixed-scale integer `Money` and `Decimal` (exact half-even rounding in JS, SQL, and Z3), timezone-free `CalendarDay`, `OrderedEnum`, and NUL-free `Text` attach metadata directly to your `Schema`.
- **State machines, forms, and agent tools (`metakit/machine`, `metakit/inspect`).** `Machine.make` and `Machine.compose` group transitions into an executable state machine with live `affordances` (`available`, `disabled`, `pending`). `Inspect.fieldSpecs` and `Inspect.toJsonSchema` extract field kinds, tightest numeric bounds, nullability, `title`/`description` annotations, and domain metadata straight off your `Schema` for forms and AI tool schemas.
- **Static invalidation and SSR pruning (`metakit/graph`).** Because every transition declares which fields it reads and writes, `Graph.analyze` computes which UI bindings a transition can invalidate, and `Graph.pruneStatic` folds fields already known on the server at SSR time so static regions ship zero client reactivity.
- **Concurrency and store checks (`metakit/pairs`, `metakit/store`).** `Transition.commutes` (and `Pairs.pairs`) proves when two transitions produce the same result in either order, while `Store.mount` refuses to start if your declared database isolation level cannot uphold a rule under concurrent writes.
- **Custom domain operations (`metakit/operation`, `metakit/operation/sql`, `metakit/language`).** Register application-specific operations with typed Schemas, optional algebraic claims (`commutative`, `associative`, `identity`, `total`), and Postgres/SQLite SQL templates. `Language.make` bundles operation families for exhaustive JS and SQL registration, and `Conformance.checkOperation` (`metakit/conformance`) fuzz-tests your claims against your JS implementations.

Every subpath is tree-shakeable: browser bundles import `metakit`, `metakit/domain`, `metakit/machine`, and `metakit/inspect` without pulling in SQL translators, Drizzle, or Z3.

## Where to go next

- **Want a step-by-step tutorial?** Follow [Write a business rule once and run it in JS, SQL, forms, and proofs](../../packages/metakit/docs/getting-started.md).
- **Want to explore real domains?** Read the runnable examples under [`examples/metakit/src/`](../../examples/metakit/src/)—including a Treasury FX ledger, a Tech Tree catalog with nested list rules, a Hotel Booking engine, and a Feature-Flag custom language.
- **Writing generic helpers over Effect `Schema`?** Read [Writing a generic helper over a Schema](../guides/generic-schema-helpers.md).
