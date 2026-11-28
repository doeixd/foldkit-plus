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
- **Escape hatch (`Expr.opaque`)** wraps arbitrary JavaScript with optional declared `reads`; it runs in `Expr.eval` and degrades soundly to `Unknown` in static checkers. `Transition.opaque` does the same for a whole step, declared by the paths it reads and writes.
- **Supplied values** are what a transition cannot make: `Transition.make({ …, supplied: { now: Schema.Int } })` reads the time as `supplied.now`, and whoever runs the step passes it once (`Transition.run(t, state, input, { now })`), so the step stays a function of its arguments and a proof holds for every time.
- **Lists** are read by asking a question of each element: `Arr.any(state.todos, todo => todo.done)` (also `every`, `count`, `sum`, `min`, `max`, `find`, `keep`). You write the test as an arrow over a path for the element; what is kept is the expression it returns, so SQL, the checker and `Expr.reads` (which names `todos.*.done`) see it. A list is written by a named way: `Transition.insert` (unless an element has the key), `remove`, `removeWhere`, `patch`, `patchWhere`, `append`, and `include` and `exclude` over a sorted set. A key no element has gives back the state it was given.
- **Commands as data:** `emits: ({ state }) => [Transition.emit('Saved', { id: state.id }, { when: … })]` lists the records a step returns beside its state, read over the state before it; your runtime turns each into a Command.
- **Whether two transitions swap order** is `Transition.commutes(a, b)`: `True` where their footprints and the ways they write say so (two `add`s to a bounded integer, a `patch` and a `remove` of fields apart), otherwise `Unknown` with a `walk` obligation, a test that runs both orders. It never answers `False`.

## Subpaths by where code runs

| Import | Runs in | Purpose |
| --- | --- | --- |
| `metakit` | Browser / server | `Path`, `Expr`, `Transition`, `Verdict`, the 50-op core (`Bool`, `Eq`, `Null`, `Ord`, `Num`, `Str`, `Arr` + derived helpers), the folds over a list (`Arr.any`, `Arr.sum`, …), what each op, fold and way of writing keeps (`opProperties`, `foldProperties`, `writeProperties`), and synchronous Interval + Zone checks (`Abstract`). A path to an `Option` field reads as its value or null. |
| `metakit/relation` | Browser / server | Questions asked of the rows of another kind pointing at a row (`Relation.any`, `every`, `count`, `sum`, `min`, `max`, `reduce`), with `Relation.withRows` for typed in-memory evaluation; SQL writes each as a correlated subquery. |
| `metakit/fn` | Browser / server | `Fn.make` and `Fn.params` define callable expression functions with optional input and output rules. |
| `metakit/operation` | Browser / server | Declare typed expression operations with `Operation.define` and supply their JavaScript with `implement` and `implementations`. Use `Conformance.checkOperation` to test algebraic claims on samples. |
| `metakit/operation/sql` | Server | Dialect-specific SQL & aggregate lowerings (`lowering`, `lowerings`, `piece`) for custom operations. |
| `metakit/language` | Browser / server | Bundles `Operation.define` families (`Language.make`) with exhaustive `implement`, dialect-checked `sql`, and `describe()` handshakes. |
| `metakit/syntax` | Browser / server | Pipeable calls (`dual`, `dualLanguage`), staged builders (`grammar`), and checks (`testLanguage`). |
| `metakit/artifact` | Browser / server | `encodeExpr` and `decodeExpr` round-trip portable expressions. `fingerprint` hashes them. |
| `metakit/tooling` | Dev / build | Index named definitions (`SemanticIndex`). `semanticDiff` shows changes and what they affect. |
| `metakit/domain` | Browser / server | Currency-safe `Money`, fixed-scale `Decimal` (`Decimal.mul` and `Money.mul` round half-even in integers; evaluation, SQL on SQLite and Postgres, the checkers and `Rows.sum` read them, and a product past the safe range is refused), timezone-free `CalendarDay`, `OrderedEnum`, `Text` (text holding no NUL, which the checkers can prove rules over), and `Domain.domainOf`. |
| `metakit/aggregates` | Browser / server | `Rows.sum` (of integers) and `Rows.count`, kept by O(1) deltas, and `Rows.min`, `Rows.max`, `Rows.every`, `Rows.any`, which rescan on a delete of the extreme. Imports no SQL. |
| `metakit/aggregates/sql` | Server | `RowsSql.toSql(aggregate, options)`: an aggregate as a SQL expression. |
| `metakit/machine` | Browser / server | Declarative state machine (`dispatch`, TEA `update`, which returns the records a step emits, and `footprints`); `Machine.canDispatch(machine, tag, partial)` and `Machine.affordances(machine, state)` ask what a partial state allows; `lift` and `compose` build a parent machine from child machines. |
| `metakit/interpreter` | Browser / server | `Interpreter` runs `evalExpr` and `step` in Effect. `withForeign` supplies custom implementations. |
| `metakit/inspect` | Browser / server | Form `fieldSpecs` and an enriched `toJsonSchema`, read straight off the Schema. |
| `metakit/graph` | Build / SSR / planner | Static `Graph.analyze` (`affectedBy`, `deadBindings`), SSR `Graph.pruneStatic`, and `Graph.queryReadiness`. |
| `metakit/graph/match` | Browser / server | `pathsOverlap` compares paths. `affectedTags` names transitions whose writes can affect a reader. |
| `metakit/graph/prune` | Server | `pruneStatic` splits fixed values from live bindings and tracks the paths needed to resume. |
| `metakit/graph/readiness` | Browser / server | `queryReadiness` fills in known parameters and checks if the remaining filter can be prepared. |
| `metakit/policy` | Browser / server | Named rules over a row and a principal (`Policy.make`), and the synchronous `checkImplication` and `checkConsistent`. |
| `metakit/store` | Server | What a store guarantees of concurrent writes (`StoreCapabilities`), and `Store.mount`, which throws where a store is set up to hold a rule it cannot. |
| `metakit/store/check` | Dev / CI only | `checkStore` and `checkStoreEffect` race writers to test a store's declared isolation and locks. |
| `metakit/temporal` | Dev / CI only | `Temporal.requirements` (what each rule needs of its store), `Temporal.obligations` (the pairs of transitions whose order a proof leaves open), and `Temporal.walk`, which runs a scenario's steps in seeded orders. |
| `metakit/pairs` | Dev / CI only | `Pairs.pairs` (each pair of transitions whose footprints overlap, with `Transition.commutes`' answer and the rule behind a `True`), `Pairs.walkPair` (both orders from generated states, compared), and `Pairs.settle`, which walks every pair into `Temporal.registry`, whose `report()` lists what is open, discharged and decided. |
| `metakit/sql` | Server | `Sql.toCheck`, `Sql.toWhere`, `Sql.toUpdate` as text for Postgres and SQLite. A predicate selects the rows `Expr.eval` holds true, null included; rows related to a row are read from the tables you give as `relations`, and a list in a column is refused by name. |
| `metakit/drizzle` | Server (optional `drizzle-orm`) | `Drizzle.toCheck`, `Drizzle.toWhere`, `Drizzle.toUpdate`: the same lowering as Drizzle `SQL` over a Drizzle table. |
| `metakit/prove` | Dev / CI only (optional `z3-solver`) | `Prove.invariant`, `Prove.transition`, `Prove.policy`, `Prove.machine` (pinning, `allowUnknown`, replayed counterexamples). |
| `metakit/conformance` | Dev / CI only | `checkOpSoundness` holds each of the 50 operators to one answer from evaluation, partial evaluation and the Tier 3 checker over null, absent keys, NaN, the ends of the safe integer range and text holding a NUL; `checkAllProperties`, `checkAllFoldProperties` and `checkAllWriteProperties` check what the property tables declare against the evaluator; `checkResidualizeSoundness` does the same for an expression of yours over values sampled from its Schema. |
| `metakit/build` | Browser / server | The functions over nodes (`wrap`, `toNode`, `call`, `evalNode`, `residualizeNode`, `judgeNode`, `readsOfNode`), for a language that builds its own constructors on metakit. |

## When to use something else

- **Time, concurrency, retries, and I/O:** use `Effect` directly. `Transition` is strictly single-step and synchronous; it returns records describing Commands (`emits`) rather than running effects.
- **Bidirectional URL or cookie codecs:** use `effect/Schema` transformations; `Expr` is one-way.
- **UI trees, layout, and styling:** keep DOM/CSS structure in your UI layer and embed `Expr` / `Transition` where you need derived values or disabled states.

## Next

- [Why Effect Schema needs inspectable expressions](./docs/why-metakit.md) — what breaks with opaque `Schema.filter` closures and the five implications of making rules data.
- [Write a business rule once and run it in JS, SQL, forms, and proofs](./docs/getting-started.md) — step-by-step tutorial from an Effect `Schema` to SQL, affordances, and a proof.
- [Model domain types and row aggregates](./docs/domain-types.md) — currency-safe `Money`, `CalendarDay`, `OrderedEnum`, and `Rows.*` aggregates.
- [Verify a state machine in CI](./docs/proving-transitions.md) — pin proofs with `Prove.machine`, allow opaque transitions explicitly, and read counterexamples.
- [Prune SSR payloads and gate dependent queries](./docs/resumability-and-queries.md) — static `affectedBy` maps, `Graph.pruneStatic`, and `Graph.queryReadiness`.
- [Check what a proof of one step cannot](./docs/stores-and-order.md) — refuse a database that cannot hold a rule under concurrent writes, and test the orders replies can arrive in.
- [Writing a generic helper over a Schema](../../docs/guides/generic-schema-helpers.md) — why combining `Schema.Struct` with `Schema.decodeUnknownSync` needs `SchemaOf`.
