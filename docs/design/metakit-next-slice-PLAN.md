# MetaKit Next-Slice Plan (`#600`, `#606`, `#607`, `#608`)

> **Status (2026-11-28): superseded.** The current plan for MetaKit is [`metakit-PLAN.md`](./metakit-PLAN.md); read it instead. This file is kept as a record of the five-slice plan for Tier 3 `Match` case-splitting, `Prove.machine`, the static dependency graph and SSR pruning, dependent-query readiness, and docs (`#600`, `#606`, `#607`, `#608`).

This plan implements five tightly connected slices surfaced by the open GitHub issues, each anchored in `packages/metakit` with zero Foldkit dependencies, strict type inference, bundle isolation, and an explicit review + verification gate per slice.

```mermaid
flowchart LR
  S1["Slice 1 (#600)\nTier 3 Match Case-Splitting"] --> S2["Slice 2 (#600)\nProve.machine + Pinning + Witnesses"]
  S2 --> S3["Slice 3 (#607 / #608)\nStatic Dependency Graph + SSR Pruning"]
  S3 --> S4["Slice 4 (#606)\nDependent-Query Readiness"]
  S4 --> S5["Slice 5\nExamples, Guides & Docs"]
```

---

## Slice 1: Tier 3 `Match` Case-Splitting (`#600`)

### Requirements
- `AbstractState` in `packages/metakit/src/abstract/check.ts` must evaluate and case-split `Node.Match` in both numeric (`evalInterval`) and boolean (`entailsAtomic`) positions.
- When `on` is a `Path` with a known `eqFact`, evaluate only the matching arm (or `otherwise`).
- When `on` is unknown and its Schema domain is a finite literal union (e.g. `OrderedEnum` `'draft' | 'pending' | 'paid' | 'refunded'`), branch over each candidate value not ruled out by `neqFacts`:
  - Clone `AbstractState`, assume `Eq.is(on, lit)` on each branch, and check that **every** consistent branch entails the goal (`Verdict.and` across branches).
  - For numeric `Match` (e.g. `OrderedEnum.rank` or piecewise pricing tables), compute `Interval.join` across consistent branches, narrowed by `Eq.is(on, lit)`.
- Respect a deterministic branch budget (`MAX_SPLITS`) so large unions degrade cleanly to `Verdict.Unknown` (handing off to Z3) instead of blowing up.

### Deliverables
- Update `packages/metakit/src/abstract/check.ts`: `evalInterval` and `entailsAtomic` support for `Node.Match`.
- Tests in `packages/metakit/test/domain.test.ts`:
  - `OrderedEnum` monotonic rule (`status >= 'paid' => status != 'draft' && status > 'draft'`) now proves **synchronously in Tier 3 (`Proved('zone')`)** without booting Z3.
  - Piecewise pricing table (`Match` on plan tier `'free' | 'pro' | 'enterprise'`) proved synchronously in Tier 3.
  - Refutation test: broken rule over `Match` does NOT return bogus `True`.

### Review & Verification Gate 1
- Verify soundness: ensure `otherwise` arm is checked if any literal in the Schema domain is not listed in `cases`, and that an unconstrained `string` path (no finite `literals`) degrades to `Unknown`.
- Run `tsc -b packages/metakit`, `vitest run packages/metakit/test/domain.test.ts packages/metakit/test/core.test.ts --project unit`.

---

## Slice 2: Strict / Pinned `Prove.machine` & Readable Witnesses (`#600` & `#598`)

### Requirements
- **One machine-wide verification call:** `Prove.machine(machine, options?)` in `packages/metakit/src/prove.ts` verifying every transition in a `Machine`:
  - Options:
    - `pin?: ReadonlyArray<TransitionTag>` — transitions that **must** be `Proved` (any degradation to `Unknown` or `False` marks the report `ok: false` with a `pin-broken` finding).
    - `allowUnknown?: Readonly<Partial<Record<TransitionTag, string>>>` — explicit, non-empty written reason allowing a specific transition to remain `Unknown` (matching `RuntimeOnly` discipline; blank/empty reason throws at call time).
    - `strict?: boolean` (default `true`): `report.ok` is `true` only when every transition is `Proved` or explicitly listed in `allowUnknown`, and every pinned transition is `Proved`.
  - Report shape:
    - `ok: boolean`
    - `entries: ReadonlyArray<MachineProofEntry>` with `{ tag, status: 'proved' | 'refuted' | 'undecided', verdict, witnessSummary?: Option<WitnessReport> }`
    - `format(): string` — concise human-readable report (`PROVED (zone)`, `PROVED (z3)`, `REFUTED`, `UNDECIDED (allowed / failed)`).
- **Readable counterexample witnesses (`WitnessReport`):**
  - When a transition is refuted with a Z3 model witness, compute:
    - `before`: decoded pre-state object
    - `input`: decoded input object
    - `after`: concrete post-state from `Transition.run`
    - `violated`: formatted `Expr.show` strings of the invariants that evaluated to `false` on `after`
    - `reproducer`: ready-to-paste `Transition.run(tag, before, input)` snippet string.

### Deliverables
- Update `packages/metakit/src/prove.ts` with `Prove.machine`, `formatReport`, and `formatWitness`.
- Tests in `packages/metakit/test/prove.test.ts`:
  - Valid `AccountMachine` (`Withdraw`, `Freeze`, `Unfreeze`) -> `ok: true`, all `proved` (`zone`).
  - Machine with `BuggyWithdraw` -> `ok: false`, `refuted`, `witnessSummary` contains exact `before`, `input`, `after`, `violated` invariant text, and pasteable reproducer.
  - Machine with an `Opaque` transition -> `ok: false` in strict mode, `ok: true` when explicitly permitted via `allowUnknown: { Custom: 'reads external clock' }`, throws on blank reason `allowUnknown: { Custom: '   ' }`, and `ok: false` if pinned in `pin: ['Custom']`.
- Add mutation in `packages/metakit/test/metakit.mutations.ts` proving `allowUnknown` refuses blank reasons and `pin` catches degraded proofs.

### Review & Verification Gate 2
- Verify zero `any` leaks in `dist/prove.d.ts` (`declared-any.mjs`).
- Verify `pin` and `allowUnknown` keys are strictly typed by `keyof Transitions & string` (typos fail to compile in `metakit.test-d.ts`).
- Run `tsc -b`, `build`, `vitest run packages/metakit/test/prove.test.ts`, and `pnpm mutate`.

---

## Slice 3: Static Dependency Graph & SSR Live-Frontier Pruning (`#607` & `#608`)

### Requirements
- New subpath `metakit/graph` (`packages/metakit/src/graph.ts`) providing pure static analysis over a `Machine` and a record of named view `Expr` bindings (`Record<BindingId, Expr<Model, unknown>>`):
  1. **`Graph.analyze(machine, bindings)`:**
     - `affectedBy`: `{ readonly [Tag in MsgTag]: ReadonlyArray<BindingId> }` — exact set of bindings whose `reads` overlap with `transition.writes` via `Path.isPrefix` (either direction: writing `account` affects `account.balance`, and writing `account.balance` affects `account`; unbounded `Option.none()` reads are conservatively affected by every write).
     - `bindingReads`: per-binding `Option<ReadonlyArray<ReadonlyArray<string>>>`.
     - `liveModelPaths`: deduplicated minimal set of `Model` paths read by any binding or read/written by any transition.
     - `deadBindings`: bindings that depend on NO path written by any transition in `machine` (provably static across the machine's lifetime — zero client subscriptions needed).
  2. **`Graph.pruneStatic(bindings, staticSlice)`:**
     - Runs `Expr.residualize(binding, staticSlice)` on every binding.
     - Splits into:
       - `staticValues`: `{ readonly [K]?: unknown }` for bindings that folded completely to `Lit` (can be rendered directly to HTML and dropped from the client bundle / resume payload).
       - `liveBindings`: remaining residual `Expr`s.
       - `resumePaths`: exact minimal `Model` paths still read by `liveBindings` (the exact JSON subset SSR must serialize for resumability).
     - Preserves strict `null` vs `Unknown` separation (a known `null` in `staticSlice` folds to `staticValues`, not `liveBindings`).

### Deliverables
- Create `packages/metakit/src/graph.ts`, expose `./graph` in `package.json` & `tsconfig.json`.
- Tests in `packages/metakit/test/graph.test.ts` and type tests in `metakit.test-d.ts`:
  - `affectedBy` precision: `Freeze` only affects `status`-reading bindings, NOT `availableBalance`; `Withdraw` affects `availableBalance`, NOT `statusLabel`; opaque binding with unbounded reads is conservatively affected by all writes.
  - `deadBindings`: binding reading only `model.id` (never written by any transition) is classified as dead/static.
  - `pruneStatic`: substituting `{ featureFlag: false }` folds guarded view expressions into `staticValues` and shrinks `resumePaths` to exclude pruned branches.
- Update `scripts/test/publishedBuild.test.ts` to ensure `graph.js` never leaks into a page importing only `Expr.eval` + `Num.lte`.

### Review & Verification Gate 3
- Verify `Path.isPrefix` symmetry: writing parent `['account']` invalidates child `['account', 'balance']`, AND writing child `['account', 'balance']` invalidates parent `['account']`.
- Verify `affectedBy` has zero duplicate binding IDs and deterministic ordering.
- Run `tsc -b`, `build`, `vitest`, `publishedBuild.test.ts -t metakit`, `paths:check`.

---

## Slice 4: Dependent-Query Readiness (`#606`)

### Requirements
- Implement `Graph.queryReadiness(expr, partialEnv, options?: { readonly rowPrefix?: ReadonlyArray<string> })` in `packages/metakit/src/graph.ts` returning:
  - `{ readonly ready: true; readonly residual: Expr<Env, A> }` when all required paths outside `rowPrefix` (e.g. `params.*`) are satisfied, or
  - `{ readonly ready: false; readonly missing: Option<ReadonlyArray<ReadonlyArray<string>>>; readonly residual: Expr<Env, A> }` naming the exact upstream paths still needed before a dependent query/selection can run (e.g. `['params', 'countryId']` for a cascading dropdown).

### Deliverables
- Tests in `packages/metakit/test/graph.test.ts`:
  - Cascading dropdown query (`countryId` + `regionId` -> `cities`): missing `params.countryId` reports `ready: false, missing: [['params', 'countryId']]`; supplying `params: { countryId: 'US' }` makes it `ready: true` with a simplified residual ready for `Sql.toWhere` or `Drizzle.toWhere`.
  - Short-circuited branch (`params.all === true || row.countryId === params.countryId`): supplying `params: { all: true }` reports `ready: true` even without `countryId`.

---

## Slice 5: Examples, Task Guides & Documentation

All documentation follows `docs/agents/writing-docs.md`: one page = one job = one reader, problem-first openings before naming MetaKit, every term explained at first use, small runnable examples with visible output, every snippet compiled by `pnpm docs:check`, and a cold-reader pass before calling done.

### 5.1 Runnable Example (`examples/metakit`)
- **Files:** `examples/metakit/package.json`, `tsconfig.json`, `src/demo.ts`, `test/demo.test.ts` (registered in root `tsconfig.json` and `package.json`'s `demo:run`).
- **What it demonstrates end-to-end (one declaration, every consumer):**
  1. Bank account + invoice domain using `Money`, `CalendarDay`, `OrderedEnum`, `Expr.refine`, and `Rows.sum`.
  2. Guarded `Transition`s + `Machine.make` driving runtime `update`, `affordances`, and `Graph.analyze` (`affectedBy`, `deadBindings`, `pruneStatic`).
  3. Live PGlite + Drizzle `toCheck` / `toWhere` / `toUpdate` execution.
  4. `Inspect.fieldSpecs` + `Inspect.toJsonSchema` output for forms and agent tools.
  5. `Prove.machine` printing a Tier 3 `PROVED (zone)` summary AND a Tier 4 Z3 `REFUTED` counterexample witness with reproducer for a deliberately weakened transition.

### 5.2 Task Guides (`packages/metakit/docs/`)
Short, focused task guides (under 1,200 words each, heading names the task):
- `packages/metakit/docs/getting-started.md` — Tutorial: from an Effect `Schema` to validated data, SQL `CHECK`/`WHERE`, disabled buttons, and a Zone/Z3 proof.
- `packages/metakit/docs/domain-types.md` — How to model currency-safe `Money`, timezone-free `CalendarDay`, `OrderedEnum`, and `Rows.*` aggregates.
- `packages/metakit/docs/proving-transitions.md` — How to verify a `Machine` in CI with `Prove.machine`, pin proofs, allow `Opaque` transitions explicitly, and read counterexample witnesses.
- `packages/metakit/docs/resumability-and-queries.md` — How to compute static `affectedBy` maps, prune SSR resume payloads (`Graph.pruneStatic`), and gate dependent queries (`Graph.queryReadiness`).

### 5.3 Landing Page, Changelog & Agent Skill
- Update `packages/metakit/README.md` (~200 lines) linking to `examples/metakit` and the task guides.
- Update `CHANGELOG.md` under `Unreleased`.
- Add `metakit` to `skills/foldkit-plus/SKILL.md` and a concise `skills/foldkit-plus/references/metakit.md` (with every snippet type-checked against published package names).

### Review & Verification Gate 5
- `pnpm docs:check` passes with every code block in `packages/metakit/README.md` and `packages/metakit/docs/*.md` compiled.
- `pnpm --filter foldkit-example-metakit demo` runs cleanly and prints the full output; `vitest run examples/metakit/test --project unit` passes.
- Cold-reader check on README and guides (first 150 words name a reader problem, no undefined terms, no pseudo-code, no inflated prose).

---

## Final Review & Full-Repo Verification Checklist

After all five slices are committed:
1. **Adversarial code review:** check every new file for soundness bugs, prototype-safe lookups (`Object.hasOwn`), `Option` for absence (no `T | null | undefined` leaks), zero `any` in public `.d.ts`, and de-slop.
2. **Type & inference checks:** `pnpm exec tsc -b packages/metakit` (all `*.test-d.ts` pass).
3. **Build & bundle checks:** `pnpm --filter metakit build` (`declared-any.mjs` clean) + `vitest run scripts/test/publishedBuild.test.ts --project unit -t metakit`.
4. **Full test & mutation suite:** `vitest run packages/metakit/test --project unit` + `pnpm mutate packages/metakit/test/metakit.mutations.ts` + `pnpm mutate:check`.
5. **Repo-wide lint & docs:** `oxfmt --check`, `pnpm paths:check`, `pnpm tags:check`, `pnpm docs:check`, and update `packages/metakit/README.md` + `CHANGELOG.md`.
