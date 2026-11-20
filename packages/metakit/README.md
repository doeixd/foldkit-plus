# metakit

In most TypeScript applications, the same business rule gets written four times: once in a `Schema.filter` closure, once in a SQL `CHECK` or `WHERE` clause, once in a UI button's `disabled` check, and once in tests. Because JavaScript closures are opaque, no tool can read a filter to lower it to SQL, disable a control before user input arrives, or prove that a state update preserves an invariant.

Write the rule once as inspectable data over an [Effect `Schema`](https://effect.website), and let every consumer read the same tree: runtime evaluation, partial evaluation, SQL generation, interval/zone checking, and Z3 proving.

`metakit` is that symbolic layer for Effect—it adds inspectable expressions, typed field paths, and single-step state transitions beside `effect/Schema` without introducing a second type system or runtime framework.

## Install

```bash
pnpm add metakit effect
```

Install `z3-solver` as a dev dependency only if you use `metakit/prove`'s Tier 4 SMT escalation:

```bash
pnpm add -D z3-solver
```

## First example

Attach an invariant to an Effect `Schema` and define a guarded withdrawal transition. The same declaration validates data at runtime, predicts whether a button should be disabled, lowers to SQL `CHECK`, and is proved invariant-preserving:

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
    Expr.all(Eq.is(state.status, 'open'), Num.lte(input.amount, Num.sub(state.balance, state.reserved))),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})
```

What you get from those two declarations:

- `Schema.decodeUnknownResult(Account)({ id: 'a1', balance: 10, reserved: 20, status: 'open' })` fails at runtime (`Failure`).
- `Transition.can(Withdraw, { state: frozenAccount })` returns `Verdict.False` before any input is entered, so you can disable the button or hide an agent tool.
- `Transition.run(Withdraw, openAccount, { amount: 50 })` returns `Result.succeed(nextAccount)` or `Result.fail(Refused)`.
- `Sql.toCheck(Account)` (from `metakit/sql`) compiles to `CHECK (((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance")))`.
- `Prove.transition(Account, Withdraw)` (from `metakit/prove`) returns `Verdict.True` with `Proved('zone')` synchronously without loading Z3.

## What the example did

- **`Expr.refine`** compiles a symbolic expression into a real `Schema.makeFilter` and stores the expression tree in `SchemaAST` annotations, so `Schema` decode, JSON Schema, and `Arbitrary` keep working while static readers inspect the rule.
- **`Path` as a subtype of `Expr`** lets you read `state.balance` directly inside expressions while `Transition.set` requires a `Path` as its write target.
- **Environment scoping (`Env`)** separates validity from authority: `Account`'s invariant cannot reference a `principal` because `principal` is not in its environment, while a guard built with `Expr.in({ row: Account, principal: Principal }, ...)` can.
- **Partial evaluation (`Expr.residualize`, `Expr.judge`, `Transition.can`)** folds known environment slices into a Kleene three-valued `Verdict` (`True`, `False`, or `Unknown` with a reason), keeping epistemic `Unknown` strictly separate from runtime `null`.
- **Escape hatch (`Expr.opaque`)** wraps arbitrary JavaScript with optional declared `reads`; it executes in `Expr.eval` and degrades soundly to `Unknown` in static checkers.

## Subpaths by where code runs

| Import | Runs in | Purpose |
| --- | --- | --- |
| `metakit` | Browser / server | `Path`, `Expr`, `Transition`, `Verdict`, the 15-op v1 primitive set (`Bool`, `Eq`, `Null`, `Ord`, `Num` + derived `min`, `max`, `abs`, `clamp`, `between`, `isNotNull`, `implies`), and Tier 3 Interval + Zone checks (`Abstract`). |
| `metakit/domain` | Browser / server | Integer-backed `Money` (compile-time currency & scale safety), timezone-free `CalendarDay`, `OrderedEnum`, and `Domain.domainOf`. |
| `metakit/aggregates` | Browser / server | `Rows.sum`, `Rows.count` (`algebra: 'group'` with $O(1)$ IVM deltas), and `Rows.min`, `Rows.max`, `Rows.every`, `Rows.any` (`algebra: 'semilattice'`). |
| `metakit/machine` | Browser / server | Framework-independent declarative state machine (`dispatch`, TEA `update`, `canDispatch`, `affordances`, `footprints`). |
| `metakit/inspect` | Browser / server | Non-interpreter Schema & Transition inspector (`fieldSpecs`, enriched `toJsonSchema`, `affordances`) for forms and AI agent tools. |
| `metakit/sql` | Server | `Sql.toCheck`, `Sql.toWhere`, `Sql.toUpdate` (parameterized Postgres/SQLite lowering with `IS NOT DISTINCT FROM` / `IS` null safety). |
| `metakit/drizzle` | Server (optional `drizzle-orm`) | `Drizzle.toWhere`, `Drizzle.toUpdate` lowering directly to Drizzle `SQL` ASTs. |
| `metakit/prove` | Dev / CI only | `Prove.invariant`, `Prove.transition`, `Prove.policy` — runs Tier 3 Zone first, dynamically imports `z3-solver` only when Tier 3 returns `Unknown` or needs a concrete counterexample witness. |
| `metakit/conformance` | Dev / CI only | Property tests verifying forward/backward Galois soundness and `residualize` parity via Effect's `Arbitrary.schema`. |

## When to use something else

- **Time, concurrency, retries, and I/O:** use `Effect` directly. `Transition` is strictly single-step and synchronous; it emits pure command data (`emits`) rather than running effects.
- **Bidirectional URL or cookie codecs:** use `effect/Schema` transformations or prisms; `Expr` is one-way.
- **UI trees, layout, and styling:** keep DOM/CSS structure in your UI layer and embed `Expr` / `Transition` where you need derived values or disabled states.
