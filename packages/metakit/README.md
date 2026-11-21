# metakit

[Effect `Schema`](https://effect.website) turns your data shapes into inspectable ASTs: one `Schema` gives you TypeScript types, decoding, encoding, JSON Schema, and `Arbitrary` generators. That stops the moment you write a business rule in `Schema.makeFilter(a => a.reserved <= a.balance)` or a state update in a plain TypeScript function. JavaScript closures are opaque, so you end up rewriting the same rule in SQL `CHECK`/`WHERE` clauses, again in UI `disabled` checks, and again in tests—and nothing proves an update cannot break an invariant.

`metakit` is the natural extension of Effect and Effect `Schema` for inspectable rules and single-step transitions. Replace only the opaque closure with a typed expression tree (`Expr.refine`) and a declarative `Transition`; your `Schema`, `Result`, `Option`, and `Effect` pipelines stay untouched while every consumer reads the same rule—validation, SQL/Drizzle, UI & agent affordances, form specs, SSR pruning, and Zone/Z3 proofs.

## See it

Run the live end-to-end example in [`examples/metakit/src/demo.ts`](../../examples/metakit/src/demo.ts) (`pnpm --filter foldkit-example-metakit demo`), or read [Why Effect Schema needs inspectable expressions](./docs/why-metakit.md) for the full breakdown of what changes when rules become data.

## Install

```bash
pnpm add metakit effect
```

Install optional peers only for the subpaths you use:

```bash
pnpm add drizzle-orm      # only for metakit/drizzle
pnpm add -D z3-solver     # only for metakit/prove's Z3 escalation
```

## Before and after

With a plain Effect `Schema` filter, only runtime decode can execute `a => a.reserved <= a.balance`:

```ts sketch
// Opaque closure: SQL cannot read it, UI cannot partially evaluate it, Z3 cannot check it.
const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Schema.check(
    Schema.makeFilter(a => a.balance >= 0 && a.reserved >= 0 && a.reserved <= a.balance),
  ),
)
```

With `metakit`, `Account` is still the exact same Effect `Schema`, but its invariant and `Withdraw` transition are inspectable data:

```ts
import { Effect, Result, Schema } from 'effect'
import { Eq, Expr, Num, Transition, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'
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

// 1. Standard Effect Schema decode still works unchanged:
const invalid = Schema.decodeUnknownResult(Account)({
  id: 'a1',
  balance: 10,
  reserved: 20,
  status: 'open',
})
// Result.isFailure(invalid) -> true

// 2. Partial evaluation disables a button or hides an agent tool before input arrives:
const frozen = { id: 'a1', balance: 50_000, reserved: 10_000, status: 'frozen' as const }
const canWithdraw = Transition.can(Withdraw, { state: frozen })
// Verdict.isFalse(canWithdraw) -> true

// 3. Postgres CHECK constraint generated from the exact same invariant:
const check = Result.getOrThrow(Sql.toCheck(Account, { dialect: 'postgres' }))
// check -> CHECK ((((("balance" >= 0) AND ("reserved" >= 0)) AND ("reserved" <= "balance"))) IS TRUE)

// 4. Synchronous Zone proof (no Z3 boot needed) that Withdraw preserves all invariants:
const proof = await Effect.runPromise(Prove.transition(Account, Withdraw))
// Verdict.isTrue(proof) -> true  (Proved('zone'))
void invalid
void Verdict.isFalse(canWithdraw)
void check
void proof
```

If someone weakens `Withdraw`'s guard by removing `Num.lte(input.amount, Num.sub(state.balance, state.reserved))`, `Prove.machine` fails CI and prints the concrete counterexample:

```text
REFUTED Withdraw [PIN BROKEN]
  before:   {"id":"model-string:0","balance":0,"reserved":0,"status":"open"}
  input:    {"amount":1}
  after:    {"id":"model-string:0","balance":-1,"reserved":0,"status":"open"}
  violated: (((balance >= 0) && (reserved >= 0)) && (reserved <= balance))
  repro:    Transition.run(Withdraw, {"id":"model-string:0","balance":0,"reserved":0,"status":"open"}, {"amount":1})
```

## What the example did

- **`Expr.refine`** compiles a symbolic expression into a real Effect `Schema` filter and attaches its AST to `SchemaAST` annotations, so `Schema` decode, JSON Schema, and `Arbitrary` keep working while static readers inspect the rule.
- **`Path` as a subtype of `Expr`** lets you read `state.balance` inside expressions while `Transition.set` requires a `Path` as its write target.
- **Environment scoping (`Env`)** separates validity from authority at compile time: `Account`'s invariant cannot reference a `principal` because `principal` is not in its `Env`, while a guard built with `Expr.in({ row: Account, principal: Principal }, ...)` can.
- **Partial evaluation (`Expr.residualize`, `Expr.judge`, `Transition.can`)** folds known environment slices into a three-valued `Verdict` (`True`, `False`, or `Unknown` with a reason), keeping missing (`Unknown`) fields separate from runtime `null`.
- **Escape hatch (`Expr.opaque`)** wraps arbitrary JavaScript with optional declared `reads`; it runs in `Expr.eval` and degrades soundly to `Unknown` in static checkers.

## Subpaths by where code runs

| Import | Runs in | Purpose |
| --- | --- | --- |
| `metakit` | Browser / server | `Path`, `Expr`, `Transition`, `Verdict`, the 20-op core (`Bool`, `Eq`, `Null`, `Ord`, `Num`, `Str`, `Arr` + derived helpers), and synchronous Interval + Zone checks (`Abstract`). |
| `metakit/domain` | Browser / server | Currency-safe `Money`, fixed-scale `Decimal` (`Decimal.mul` and `Money.mul` round half-even, in memory only), timezone-free `CalendarDay`, `OrderedEnum`, and `Domain.domainOf`. |
| `metakit/aggregates` | Browser / server | `Rows.sum` (of integers), `Rows.count` (O(1) group deltas) and `Rows.min`, `Rows.max`, `Rows.every`, `Rows.any` (semilattice). Imports no SQL. |
| `metakit/aggregates/sql` | Server | `RowsSql.toSql(aggregate, options)`: an aggregate as a SQL expression. |
| `metakit/machine` | Browser / server | Declarative state machine (`dispatch`, TEA `update`, `canDispatch`, `affordances`, `footprints`). |
| `metakit/inspect` | Browser / server | Form `fieldSpecs` and an enriched `toJsonSchema`, read straight off the Schema. |
| `metakit/graph` | Build / SSR / planner | Static `Graph.analyze` (`affectedBy`, `deadBindings`), SSR `Graph.pruneStatic`, and `Graph.queryReadiness`. |
| `metakit/policy` | Browser / server | Authorization policies (`Policy.make`, `allow`, `can`) and synchronous Tier 3 `checkImplication` / `checkConsistent`. |
| `metakit/temporal` | Server / CI | Setup-time store capability refusals (`checkStoreCapabilities`, `assertStoreCapabilities`) and seeded interleaving walks (`emitWalkObligations`, `runWalk`). |
| `metakit/sql` | Server | `Sql.toCheck`, `Sql.toWhere`, `Sql.toUpdate` as text for Postgres and SQLite. A predicate selects the rows `Expr.eval` holds true, null included. |
| `metakit/drizzle` | Server (optional `drizzle-orm`) | `Drizzle.toCheck`, `Drizzle.toWhere`, `Drizzle.toUpdate`: the same lowering as Drizzle `SQL` over a Drizzle table. |
| `metakit/prove` | Dev / CI only (optional `z3-solver`) | `Prove.invariant`, `Prove.transition`, `Prove.policy`, `Prove.machine` (pinning, `allowUnknown`, replayed counterexamples). |
| `metakit/conformance` | Dev / CI only | `checkOpSoundness` holds each of the 20 operators to one answer from evaluation, partial evaluation and the Tier 3 checker over null, absent keys, NaN and the ends of the safe integer range; `checkResidualizeSoundness` does the same for an expression of yours over values sampled from its Schema. |

## When to use something else

- **Time, concurrency, retries, and I/O:** use `Effect` directly. `Transition` is strictly single-step and synchronous; it emits pure command data (`emits`) rather than running effects.
- **Bidirectional URL or cookie codecs:** use `effect/Schema` transformations; `Expr` is one-way.
- **UI trees, layout, and styling:** keep DOM/CSS structure in your UI layer and embed `Expr` / `Transition` where you need derived values or disabled states.

## Next

- [Why Effect Schema needs inspectable expressions](./docs/why-metakit.md) — what breaks with opaque `Schema.filter` closures and the five implications of making rules data.
- [Write a business rule once and run it in JS, SQL, forms, and proofs](./docs/getting-started.md) — step-by-step tutorial from an Effect `Schema` to SQL, affordances, and a proof.
- [Model domain types and row aggregates](./docs/domain-types.md) — currency-safe `Money`, `CalendarDay`, `OrderedEnum`, and `Rows.*` aggregates.
- [Verify a state machine in CI](./docs/proving-transitions.md) — pin proofs with `Prove.machine`, allow opaque transitions explicitly, and read counterexamples.
- [Prune SSR payloads and gate dependent queries](./docs/resumability-and-queries.md) — static `affectedBy` maps, `Graph.pruneStatic`, and `Graph.queryReadiness`.
