# MetaKit `Fn` — Inspectable, Callable, Verifiable Functions (Design & Implementation Plan)

> **Status (2026-11-28): superseded.** The current plan for MetaKit is [`metakit-PLAN.md`](./metakit-PLAN.md); read it instead. This file is kept as a record of the design and implementation plan for `metakit/fn` (callable, Schema-typed `Expr` functions with `Prove.fn` verification) and `ensures` postconditions on `Transition.make`.

## 1. Motivation & Position in MetaKit

MetaKit currently has three expression/computation abstractions, each leaving one gap:

| Abstraction | Callable inside another `Expr`? | Transparent to SQL / Tier 2 / Z3? | Preconditions & Postconditions? |
|---|---|---|---|
| `Expr.in(slices, build)` | No (closed one-shot expression) | Yes | No |
| `Operation.define(...)` | Yes (as a `ForeignOp` call) | No (opaque black box; requires manual SQL & claims) | Algebraic claims only |
| `Transition.make(...)` | No (state-machine step `state -> next`) | Yes | `when` guard + state invariant preservation |
| **`Fn` (`metakit/fn`)** | **Yes (`fn({ price: $.a, pct: $.b })`)** | **Yes (inlines AST; zero new `CoreOpId`s)** | **Yes (`where` + `returns` Schema + `ensures`)** |

`Fn` fills the missing slot: **a pure, Schema-typed, named-parameter function whose body is a MetaKit `Expr`**, supporting Design-by-Contract verification in Z3 (`Prove.fn`) while remaining directly callable in expressions, SQL, partial evaluation, and plain JS.

For **stateful `before` / `after` functions**, we extend `Transition.make` with an optional `ensures` postcondition rather than creating a second stateful transition system.

---

## 2. Public API Design

### 2.1 Pure Value Functions (`metakit/fn`)

Two entry points producing the same `Fn` value (implementing `Pipeable` and callable as a JS function):

1. **Direct callable (`Fn.make`)** — minimal ceremony for pure helpers:
   ```ts
   import { Schema } from 'effect'
   import { Expr, Num } from 'metakit'
   import { Money } from 'metakit/domain'
   import * as Fn from 'metakit/fn'

   const Usd = Money.make('USD')

   const subtotal = Fn.make(
     { qty: Schema.Int, unitPrice: Usd },
     ({ qty, unitPrice }) => Num.mul(qty, unitPrice),
   )
   ```

2. **Contract-first or progressive `.pipe()` chain (`Fn.params` / `.pipe(...)`)** — left-to-right TypeScript inference with stackable clauses:
   ```ts
   const applyDiscount = Fn.make(
     {
       price: Usd.check(Schema.isGreaterThanOrEqualTo(0)),
       pct: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
     },
     ({ price, pct }) =>
       Num.sub(price, Num.div(Num.mul(price, pct), 100, { rounding: 'half-even' })),
   ).pipe(
     Fn.where(({ price }) => Num.gt(price, 0)),
     Fn.returns(Usd.check(Schema.isGreaterThanOrEqualTo(0))),
     Fn.ensures(({ params, result }) =>
       Expr.all(Num.lte(result, params.price), Num.gte(result, 0)),
     ),
   )
   ```

   Signature-first (useful for defining a contract before its body, or sharing a spec across implementations):
   ```ts
   const DiscountSpec = Fn.params({
     price: Usd.check(Schema.isGreaterThanOrEqualTo(0)),
     pct: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
   }).pipe(
     Fn.where(({ price }) => Num.gt(price, 0)),
     Fn.returns(Usd.check(Schema.isGreaterThanOrEqualTo(0))),
     Fn.ensures(({ params, result }) => Num.lte(result, params.price)),
   )

   const applyDiscount = DiscountSpec.pipe(
     Fn.body(({ price, pct }) =>
       Num.sub(price, Num.div(Num.mul(price, pct), 100, { rounding: 'half-even' })),
     ),
   )
   ```

### 2.2 Calling a `Fn`

A `Fn<Params, Out>` is a callable object with attached methods & metadata:

```ts
// 1. Symbolic call inside any Expr, Transition, Policy, or another Fn:
//    Accepts ExprInput for every parameter (literals, Paths, or compound Exprs).
const total = Expr.in({ cart: Cart }, ({ cart }) =>
  applyDiscount({ price: cart.subtotal, pct: cart.discountPct }),
)

// 2. Direct JS evaluation (fast path — skips Schema decode):
const cents = applyDiscount.run({ price: Money.minor('USD', 2500), pct: 10 })

// 3. Checked JS evaluation (decodes params against Schema, checks `where`,
//    evaluates `body`, validates `returns` + `ensures`, returns Result):
const checked = applyDiscount.runChecked({ price: 2500, pct: 10 })

// 4. Formal verification in Z3:
const verdict = await Effect.runPromise(Prove.fn(applyDiscount))
```

### 2.3 Core Types

```ts
export type ParamSchemas = Readonly<Record<string, Schema.Top>>
export type ParamValues<P extends ParamSchemas> = { readonly [K in keyof P]: P[K]['Type'] }
export type ParamPaths<P extends ParamSchemas> = {
  readonly [K in keyof P]: PathAccessor<ParamValues<P>, P[K]['Type']>
}
export type ArgInputs<P extends ParamSchemas> = {
  readonly [K in keyof P]: ExprInput<never, Path.Read<P[K]['Type']>>
}
export type MergedArgEnv<Args extends Readonly<Record<string, unknown>>> =
  UnionToIntersection<EnvOfInput<Args[keyof Args]>>

export interface FnSpec<P extends ParamSchemas, R> extends Pipeable.Pipeable {
  readonly _tag: 'FnSpec'
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly where: ReadonlyArray<Expr<ParamValues<P>, boolean | null>>
  readonly returns: Option.Option<Schema.Codec<R>>
  readonly ensures: ReadonlyArray<
    Expr<{ readonly params: ParamValues<P>; readonly result: R }, boolean | null>
  >
}

export interface Fn<P extends ParamSchemas, R> extends Pipeable.Pipeable {
  readonly _tag: 'Fn'
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly body: Expr<ParamValues<P>, R>
  readonly where: ReadonlyArray<Expr<ParamValues<P>, boolean | null>>
  readonly returns: Option.Option<Schema.Codec<R>>
  readonly ensures: ReadonlyArray<
    Expr<{ readonly params: ParamValues<P>; readonly result: R }, boolean | null>
  >
  /** Symbolic call: substitutes argument expressions into `body`. */
  <Args extends ArgInputs<P>>(args: Args): Expr<MergedArgEnv<Args>, R>
  /** Direct runtime evaluation over concrete parameter values. */
  readonly run: (args: ParamValues<P>) => R
  /** Validated runtime evaluation checking Schema, `where`, `returns`, and `ensures`. */
  readonly runChecked: (
    args: unknown,
  ) => Result.Result<R, FnContractError>
}
```

### 2.4 Stateful `before` / `after` Postconditions on `Transition.make`

Rather than introducing a second stateful function concept, add an optional `ensures` clause to `Transition.make`:

```ts
const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Usd.check(Schema.isGreaterThan(0)) }),
  when: ({ state, input }) => Num.gte(state.balance, input.amount),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
  // Relational postcondition over { state, input, supplied, next }
  ensures: ({ state, input, next }) =>
    Eq.is(next.balance, Money.sub(state.balance, input.amount)),
})
```

`Prove.transition(Account, Withdraw)` and `Prove.machine(M)` then prove **both**:
1. State invariant preservation (`state ∈ Inv ∧ when ⇒ next ∈ Inv`)
2. Declared `ensures` postconditions (`state ∈ Inv ∧ when ⇒ ensures(state, input, next)`).

---

## 3. AST Substitution & Composition Semantics

### 3.1 Zero New `CoreOpId`s via Hygienic Path Substitution

When `fn(args)` is called inside an expression:
1. Build an argument map `argNodes: Record<keyof P, Node.Node>` via `toNode(args[k])`.
2. Walk `fn.body.node` with `Node.substitutePaths`:
   - Any path whose root segment `segments[0]` is a parameter name `k` in `P`:
     - If `segments.length === 1`: replace with `argNodes[k]`.
     - If `segments.length > 1` (e.g. `param.field.sub` where `param` is a struct Schema):
       - If `argNodes[k]` is a `Node.Path`: concatenate `[...argNodes[k].segments, ...segments.slice(1)]` (preserving `ast`!).
       - If `argNodes[k]` is a `Node.Lit` object: project the nested literal field at build time.
       - Otherwise (a computed struct expression): fail loudly with a clear error explaining that nested field reads on a parameter require a Path or literal argument.
   - Any `Rows` binder (`each`, `each#1`, …) inside `fn.body` is alpha-renamed if it collides with an outer `Rows` binder (using `currentEach()` depth).
3. **Result:** Calling `fn(args)` returns a plain `Expr` containing only standard `Node`s. Consequently:
   - `Sql.toWhere`, `Sql.toCheck`, `Drizzle.toWhere` lower `fn(args)` automatically.
   - `Expr.residualize` and `Expr.judge` partially evaluate `fn(args)` automatically.
   - `Abstract.checkInvariant` and `Prove.invariant` analyze `fn(args)` automatically.
   - Calling `fnA` inside `fnB` composes naturally (and is guaranteed acyclic because JS values cannot self-reference during construction).

### 3.2 Handling Nullable Arguments

If a parameter `p` has non-null Schema `T` (e.g. `Schema.Int`), `ArgInputs<P>` requires `ExprInput<never, T>` (cannot pass `number | null` without `Null.coalesce`). If a parameter Schema explicitly allows `null` (`Schema.NullOr(Schema.Int)`), `Path.Read<P[K]['Type']>` includes `null`, and the body handles nullability explicitly.

---

## 4. Formal Verification (`Prove.fn` & Call-Site Contracts)

### 4.1 `Prove.fn(fn, options?)`

Given `fn: Fn<P, R>`, `Prove.fn` constructs a `SolverProblem` over slice `['params'] -> fn.paramsSchema`:

- **`given` (assumptions):**
  1. All AST refinements collected from `fn.paramsSchema` (`collectAstRefinements`).
  2. Every `w` in `fn.where` (with parameter paths prefixed under `params` or kept at root to match `body`).
- **`goals` (proof obligations):**
  1. **Well-definedness (no refusal):** `fn.body` never refuses under `given` (no integer overflow, no NUL refusal, no unmatched `Match`, no division by zero).
  2. **Return Schema refinements:** If `Option.isSome(fn.returns)`, every refinement collected from `fn.returns.value` holds when its root path is substituted with `fn.body.node`!
  3. **Postconditions (`fn.ensures`):** Every `e` in `fn.ensures` holds with `result` substituted by `fn.body.node` and `params.*` mapped to the parameter slice!

If Z3 returns `unsat`, `Prove.fn` returns `Verdict.True` (proved for ALL inputs!).
If Z3 returns `sat`, `witness.ts` extracts a concrete parameter assignment, replays `fn.body` and the violated goal, and returns `Verdict.False({ witness })` showing the exact failing input!

### 4.2 Call-Site Precondition Verification (Phase 4)

When `fn` has non-empty `where` clauses, calling `fn(args)` can optionally record a lightweight precondition obligation (or expose `fn.precondition(args)` returning the substituted `where` `Expr`!):
- `fn.precondition({ price: $.subtotal, pct: $.rate })` -> returns `Expr` (`Num.gt($.subtotal, 0)`).
- Callers can include `fn.precondition(args)` in `Transition.when` or assert `Prove.invariant(Schema, Expr.implies(callerGuard, fn.precondition(args)))`.
- In `Transition.make` / `Prove.machine`, we can also support automatic call-site obligation checking via a `Fn.checked(fn, args)` or opt-in `verifyPreconditions: true` mode.

---

## 5. Runtime Execution & Inspection

- **`fn.run(args)`**: calls `Expr.evaluate(fn.body, args)` directly.
- **`fn.runChecked(rawArgs)`**:
  1. Decodes `rawArgs` with `fn.paramsSchema` -> fails with `FnContractError({ phase: 'params', ... })`.
  2. Evaluates each `w` in `fn.where` -> if not `true`, fails with `FnContractError({ phase: 'where', ... })`.
  3. Evaluates `fn.body` -> catches `Node.Refusal` as `FnContractError({ phase: 'body', ... })`.
  4. If `fn.returns` is `Some`, validates result against `returns` -> fails with `FnContractError({ phase: 'returns', ... })`.
  5. Evaluates each `e` in `fn.ensures` with `{ params, result }` -> if not `true`, fails with `FnContractError({ phase: 'ensures', ... })`.
- **`Inspect.fn(fn)`** (Phase 3): returns `{ params: FieldSpec[], returns: Option<FieldSpec>, hasWhere, hasEnsures, jsonSchema }` for forms, docs, and AI agent tool definitions.

---

## 6. Phased Implementation Plan

### Phase 1 — Core `metakit/fn` Module & Hygienic Substitution
- **Files:**
  - `packages/metakit/src/fn.ts` (exported as `metakit/fn` in `package.json` & `tsdown.config.ts`)
  - `packages/metakit/src/node.ts` (verify `substitutePaths` handles struct-path projection cleanly)
- **Deliverables:**
  - `Fn.make`, `Fn.params`, `Fn.where`, `Fn.returns`, `Fn.ensures`, `Fn.body`
  - Callable `fn(args)` with hygienic AST substitution, `fn.precondition(args)`, `fn.run`, `fn.runChecked`
  - `FnContractError` (`Data.TaggedError`)
  - Unit tests + type tests (`*.test-d.ts`) + export matrix check (zero TS2883, zero `any` in `.d.ts`)

### Phase 2 — Z3 Formal Verification (`Prove.fn`)
- **Files:**
  - `packages/metakit/src/prove/fn.ts`
  - `packages/metakit/src/prove.ts` (export `fn` as `Prove.fn`)
- **Deliverables:**
  - `Prove.fn(fn, options?)` verifying well-definedness, `returns` Schema refinements, and `ensures` postconditions under `paramsSchema` + `where`
  - Concrete counterexample witness extraction & replay when a postcondition or return refinement is violated
  - Z3 proof tests covering arithmetic, `Money`, `Decimal`, `OrderedEnum`, `CalendarDay`, and `Sets` functions

### Phase 3 — Stateful `ensures` on `Transition.make` & `Prove.transition` / `Prove.machine`
- **Files:**
  - `packages/metakit/src/transition.ts`
  - `packages/metakit/src/prove/transition.ts`
  - `packages/metakit/src/prove/machine.ts`
- **Deliverables:**
  - Optional `ensures?: ({ state, input, supplied, next }) => Expr<..., boolean | null>` on `Transition.make`
  - `Prove.transition` and `Prove.machine` prove both state invariant preservation and `ensures` postconditions
  - `Transition.step` remains zero-overhead; optional `verifyEnsures` check in test helpers

### Phase 4 — SQL / Drizzle / Inspection / Composition Polish
- **Files:**
  - `packages/metakit/src/inspect.ts` (`Inspect.fn`)
  - `examples/metakit/test/fnShowcase.test.ts`
  - `packages/metakit/test/fn.mutations.ts`
- **Deliverables:**
  - End-to-end tests: nested `Fn` calls lowered to PGlite Postgres & `node:sqlite`, partially evaluated via `Expr.residualize`, verified in Z3, and exported via `Inspect.fn`
  - Mutation specs killing every guard in `fn.ts` and `prove/fn.ts`
  - Update `packages/metakit/README.md` and `skills/foldkit-plus/references/metakit.md`

---

## 7. Non-Goals & Guardrails

- **No general recursion:** `Fn` represents total, terminating, first-order expressions so SQL lowering, partial evaluation, and Z3 proofs remain decidable and guaranteed to terminate. Bounded iteration stays in `Arr.*` / `Relation.*` folds.
- **No new `CoreOpId`s:** `Fn` compiles away to existing `Node` primitives on call; zero changes required in `sqlLowering.ts`, `abstract/ops.ts`, or `conformance.ts`.
- **No `any` in emitted `.d.ts`:** All exported types (`Fn`, `FnSpec`, `ParamSchemas`, `ArgInputs`, `FnContractError`) must pass `node scripts/declared-any.mjs .` and two-module `emitDeclarationOnly` checks.
