# metakit

In most TypeScript applications, the same business rule gets written four times: once in a validation callback, once in a SQL `CHECK` or `WHERE` clause, once in a UI button's `disabled` check, and once in tests. Because JavaScript closures are opaque, no tool can read a validator to lower it to SQL, disable a control before user input arrives, or prove that a state update preserves an invariant.

Write the rule once as inspectable data over an [Effect `Schema`](https://effect.website), and let every consumer read the same tree: runtime evaluation, partial evaluation, SQL generation, form/JSON Schema inspection, static dependency analysis, and Zone/Z3 proofs.

`metakit` is that symbolic layer for Effect—it adds inspectable expressions (`Expr`), typed field paths (`Path`), and single-step state transitions (`Transition`) beside `effect/Schema` with zero Foldkit runtime dependency.

## See it

Run the end-to-end example in [`examples/metakit/src/demo.ts`](../../examples/metakit/src/demo.ts) (`pnpm --filter foldkit-example-metakit demo`): one `Account` schema and two transitions drive runtime updates, UI affordances, static SSR pruning, live PGlite + Drizzle queries, form specs, a Tier 3 Zone proof, and a Tier 4 Z3 counterexample witness.

## Install

```bash
pnpm add metakit effect
```

Install optional peers only for the subpaths you use:

```bash
pnpm add drizzle-orm      # only for metakit/drizzle
pnpm add -D z3-solver     # only for metakit/prove's Z3 escalation
```

## First example

Attach an invariant to an Effect `Schema` and define a guarded withdrawal transition:

```ts
import { Schema } from 'effect'
import { Eq, Expr, Num, Transition } from 'metakit'

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

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))) }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})
```

From those two declarations you get:

- **Runtime validation:** `Schema.decodeUnknownResult(Account)({ id: 'a1', balance: 10, reserved: 20, status: 'open' })` returns `Failure`.
- **Early UI/agent affordances:** `Transition.can(Withdraw, { state: frozenAccount })` returns `Verdict.False` before any input is entered, so you can disable the button or hide a tool.
- **Guarded updates:** `Transition.run(Withdraw, openAccount, { amount: 50 })` returns `Result.succeed(nextAccount)` or `Result.fail(Refused)`.
- **SQL `CHECK`:** `Sql.toCheck(Account)` (from `metakit/sql`) compiles to `((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance"))`.
- **Proof:** `Prove.transition(Account, Withdraw)` (from `metakit/prove`) returns `Verdict.True` with `Proved('zone')` synchronously without loading Z3.

## What the example did

- **`Expr.refine`** compiles a symbolic expression into an Effect `Schema` filter and stores the expression tree in `SchemaAST` annotations, so `Schema` decode, JSON Schema, and `Arbitrary` keep working while static readers inspect the rule.
- **`Path` as a subtype of `Expr`** lets you read `state.balance` inside expressions while `Transition.set` requires a `Path` as its write target.
- **Environment scoping (`Env`)** separates validity from authority: `Account`'s invariant cannot reference a `principal` because `principal` is not in its environment, while a guard built with `Expr.in({ row: Account, principal: Principal }, ...)` can.
- **Partial evaluation (`Expr.residualize`, `Expr.judge`, `Transition.can`)** folds known environment slices into a three-valued `Verdict` (`True`, `False`, or `Unknown` with a reason), keeping missing (`Unknown`) fields separate from runtime `null`.
- **Escape hatch (`Expr.opaque`)** wraps arbitrary JavaScript with optional declared `reads`; it runs in `Expr.eval` and degrades soundly to `Unknown` in static checkers.

## Subpaths by where code runs

| Import | Runs in | Purpose |
| --- | --- | --- |
| `metakit` | Browser / server | `Path`, `Expr`, `Transition`, `Verdict`, the 15-op v1 core (`Bool`, `Eq`, `Null`, `Ord`, `Num` + derived helpers), and synchronous Interval + Zone checks (`Abstract`). |
| `metakit/domain` | Browser / server | Currency-safe `Money`, timezone-free `CalendarDay`, `OrderedEnum`, and `Domain.domainOf`. |
| `metakit/aggregates` | Browser / server | `Rows.sum`, `Rows.count` (O(1) group deltas) and `Rows.min`, `Rows.max`, `Rows.every`, `Rows.any` (semilattice). |
| `metakit/machine` | Browser / server | Declarative state machine (`dispatch`, TEA `update`, `canDispatch`, `affordances`, `footprints`). |
| `metakit/inspect` | Browser / server | Form `fieldSpecs`, enriched `toJsonSchema`, and `affordances` without duplicating an interpreter. |
| `metakit/graph` | Build / SSR / planner | Static `Graph.analyze` (`affectedBy`, `deadBindings`), SSR `Graph.pruneStatic`, and `Graph.queryReadiness`. |
| `metakit/sql` | Server | `Sql.toCheck`, `Sql.toWhere`, `Sql.toUpdate` for Postgres and SQLite with NULL-safe equality. |
| `metakit/drizzle` | Server (optional `drizzle-orm`) | `Drizzle.toCheck`, `Drizzle.toWhere`, `Drizzle.toUpdate` returning Drizzle `SQL` ASTs. |
| `metakit/prove` | Dev / CI only | `Prove.invariant`, `Prove.transition`, `Prove.policy`, `Prove.machine` (pinning, `allowUnknown`, counterexample witnesses). |
| `metakit/conformance` | Dev / CI only | Property tests checking forward/backward interval soundness and `residualize` parity via `Arbitrary.schema`. |

## When to use something else

- **Time, concurrency, retries, and I/O:** use `Effect` directly. `Transition` is strictly single-step and synchronous; it emits pure command data (`emits`) rather than running effects.
- **Bidirectional URL or cookie codecs:** use `effect/Schema` transformations; `Expr` is one-way.
- **UI trees, layout, and styling:** keep DOM/CSS structure in your UI layer and embed `Expr` / `Transition` where you need derived values or disabled states.

## Next

- [Write a business rule once and run it in JS, SQL, forms, and proofs](./docs/getting-started.md) — step-by-step tutorial from an Effect `Schema` to SQL, affordances, and a proof.
- [Model domain types and row aggregates](./docs/domain-types.md) — currency-safe `Money`, `CalendarDay`, `OrderedEnum`, and `Rows.*` aggregates.
- [Verify a state machine in CI](./docs/proving-transitions.md) — pin proofs with `Prove.machine`, allow opaque transitions explicitly, and read counterexamples.
- [Prune SSR payloads and gate dependent queries](./docs/resumability-and-queries.md) — static `affectedBy` maps, `Graph.pruneStatic`, and `Graph.queryReadiness`.
