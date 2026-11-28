# MetaKit Implementation Plan: Phases 2–6

> **Status (2026-11-28): superseded.** The current plan for MetaKit is [`metakit-PLAN.md`](./metakit-PLAN.md); read it instead. This file is kept as a record of the phases 2–6 implementation plan over the 15-op MetaKit core (domain types, sync and guard, application propagation, concurrency obligations, and resumable TEA).

Grounded in the existing `packages/metakit` implementation (15-op v1 core, `metakit/domain`, `metakit/aggregates`, `metakit/machine`, `metakit/inspect`, `metakit/graph`, `metakit/sql`, `metakit/drizzle`, `metakit/prove`, `metakit/conformance`) and GitHub issues `#601`, `#580`, `#581`, `#480`, `#436`, and `#472`.

---

## Status (2026-11-21)

Succeeded by [metakit-unification-PLAN.md](./metakit-unification-PLAN.md), which carries every open item below.

| Phase | State |
| --- | --- |
| 2 | Built, then independently reviewed and corrected: evaluation is null-strict in every reader, the evaluator refuses unsafe results as typed values, the synchronous checker was rewritten, prover witnesses are replayed, SQL and Drizzle share one lowering, and a seeded parity suite runs on PGlite and SQLite. `Decimal.mul` exists in memory; its SQL lowering is not built. |
| 3 | Built and reviewed. Sync's expression laws and transitions are in `foldkit-sync/metakit` (`SyncDeclared`); the guard check is `GuardCheck.policy` in `foldkit-guard/check`. Neither main entry imports metakit. |
| 4.1 | Built: `foldkit-form/metakit`, `foldkit-agent/metakit`, `foldkit-mixins-form/declared`. |
| 4.2 | Built: `foldkit-surface/writes`, `foldkit-remote/aggregate`. Open in #580: the plan short-circuit covers only a bare Surface and `Remote.observe`; a pending write on a large list still walks it. Open in #586 and #587: see the issues. |
| 5 | Built: `metakit/store`, `metakit/temporal`, writer store capabilities. The out-of-order-edits test from #480 is in, and it found and fixed a defect in `foldkit-remote`. Not built: a Postgres parent-row lock; capability declarations for the Durable Object and sync stores. |
| 6 | Composable machines are built (`Machine.lift`, `Machine.compose`). Partial hydration and Message-scoped splitting are not built: measured on domains-plus, both fall below the thresholds in `metakit-phase-6-DESIGN.md`, which records the baseline, the thresholds and when to reopen. |

---

## Baseline: What Already Exists in `packages/metakit`

Before starting Phase 2, note what is already shipped and tested on `ui-polish` so no work is duplicated:

- **Core (`metakit`):** Closed 15-op v1 `CoreOpId`, `Path`, `Expr`, `Transition` (`make`, `run`, `step`, `can`, `lift`, `footprint`), `Verdict`, `residualize` + `op.laws`, Tier 3 Interval + Zone (DBM) with `Match` case-splitting.
- **Partial Phase 2 (`metakit/domain`, `metakit/aggregates`):** `Money` (currency + scale branded integers), `CalendarDay` (epoch-day integers), `OrderedEnum`, `Rows.sum` / `Rows.count` (`algebra: 'group'`, $O(1)$ deltas, Z3 conservation proof), `Rows.min` / `Rows.max` / `Rows.every` / `Rows.any` (`algebra: 'semilattice'`).
- **Consumers (`metakit/machine`, `metakit/inspect`, `metakit/graph`, `metakit/sql`, `metakit/drizzle`, `metakit/prove`, `metakit/conformance`):** `Prove.machine` (pinning, `allowUnknown`, structured witnesses), `Graph.analyze`, `Graph.pruneStatic`, `Graph.queryReadiness`, `Inspect.fieldSpecs`, `Inspect.toJsonSchema`, `Drizzle.toCheck`/`toWhere`/`toUpdate`, runnable `examples/metakit`, and compiled docs.

---

## Cross-Cutting Quality, Review & Verification Rules (Every Phase)

Every phase below follows the same bout-and-review discipline:

1. **Exhaustive tables, zero silent fallbacks:** Every new `CoreOpId` must compile across all 6 exhaustive `Record<CoreOpId, ...>` tables (`eval`, `residualize`, `abstract`, `sql`, `drizzle`, `prove`). Missing cases are compile errors.
2. **Database parity (`#601`):** Never emit dialect-divergent DB `round()`, `/`, `cast`, or `least()`. Pin integer/string semantics with seeded JS vs. Postgres (PGlite) vs. SQLite row-for-row parity tests.
3. **Mutation verification:** Every new behavior gets a mutation entry in `test/*.mutations.ts` verified with `pnpm mutate` (100% killed).
4. **Bundle isolation:** Update `scripts/test/publishedBuild.test.ts` so new ops and subpaths tree-shake cleanly and never leak server/dev modules into minimal browser pages.
5. **Zero `any` in public `.d.ts`:** `pnpm --filter <pkg> build` runs `declared-any.mjs` on every published package.
6. **Jev preference review:** Run `npx jev-pref review --hunks --include <file>` on every change that adds/reshapes a published package API, README, or skill reference.
7. **Adversarial bout review:** After each phase's commits, re-read `git diff <phase-start>..HEAD` checking logic, edge cases, `Option` vs `null` boundaries, `Object.hasOwn` prototype safety, `tags:check`, inference (`*.test-d.ts`), and de-slop; fix findings in a follow-up commit before starting the next phase.

---

## Phase 2: Complete Domain Types, Strings, and Collections (`#601`)

### Scope (Delta over Existing `metakit/domain` & `metakit/aggregates`)

1. **Fixed-scale `Decimal` (`packages/metakit/src/domain/decimal.ts`):**
   - `Decimal.make({ scale })` branded integer-scaled Effect `Schema` (`scale` integer `0..12`, validated at definition time).
   - Exact integer-scaled `Decimal.add`, `Decimal.sub`, `Decimal.mul` (with pinned **half-even rounding** via integer arithmetic — zero DB `round()`/`/`/`cast`, matching `#601`'s 2,000-case parity table across JS, SQLite, and Postgres).
   - `Decimal.format` and `Decimal.parse` (`Result<DecimalValue<S>, InvalidDecimalError>`).
2. **Strings & Collections Ops (expanding `CoreOpId` from 15 to 20 ops):**
   - `str.len` (Unicode code-point length — pinned identically across JS `[...s].length`, Postgres `char_length`, SQLite `length`), `str.startsWith`, `str.contains`.
   - `arr.count`, `arr.isEmpty` (total over arrays, lowering cleanly to JS, Postgres `cardinality` / `jsonb_array_length`, SQLite `json_array_length`).
   - Declarative `op.laws` in `residualize.ts` (e.g. `str.startsWith(x, '') -> true`, `str.contains(x, '') -> true`, `str.len(lit) -> [...lit].length`, `arr.isEmpty(x) <=> arr.count(x) === 0`).
   - Tier 3 Interval bounds (`str.len >= 0`, `arr.count >= 0`, `arr.isEmpty` <-> `arr.count == 0` narrowing).
   - Tier 4 Z3 lowering (`Int` length variable `len >= 0` + `Z3.String` theory where supported, degrading soundly to `Unknown` if Z3 returns `unknown` on string constraints).
   - Galois soundness checks in `metakit/conformance` for all 5 new ops.

### Deliverables
- `packages/metakit/src/domain/decimal.ts`, `src/ops/str.ts`, `src/ops/arr.ts`.
- Exhaustive updates across `node.ts`, `ops/eval.ts`, `ops/residualize.ts`, `abstract/check.ts`, `sql.ts`, `drizzle.ts`, `prove.ts`, `conformance.ts`.
- Unit, type (`*.test-d.ts`), PGlite + SQLite parity (seeded 500+ cases for half-even rounding and code-point `str.len`), and mutation tests.
- Updated `packages/metakit/docs/domain-types.md`, `README.md`, and `skills/foldkit-plus/references/metakit.md`.

### Phase 2 Review & Verification Gate
- `pnpm exec tsc -b packages/metakit examples/metakit`
- `pnpm --filter metakit build` (`declared-any.mjs` clean)
- `npx vitest run packages/metakit/test scripts/test/publishedBuild.test.ts -t metakit --project unit`
- `pnpm mutate packages/metakit/test/metakit.mutations.ts` (100% killed)
- `pnpm tags:check && pnpm paths:check && pnpm docs:check`
- `npx jev-pref review --hunks` on public API diff + adversarial diff review.

---

## Phase 3: Prove Generality on Non-Entity Consumers (`foldkit-sync` + `foldkit-guard`)

Validate that `metakit`'s `Expr` + `Transition` work cleanly outside `foldkit-entity` without duplicating interpreters.

### 3.1 `foldkit-sync` Declarative Document Laws
- Allow `foldkit-sync` documents to declare laws and state transitions as `metakit` `Expr` / `Transition` over `{ model }` alongside existing `holds({ before, after })` callbacks (backward-compatible).
- Run `metakit`'s Tier 3 `Abstract.checkTransition` / `Prove.machine` synchronously to detect dead states and invariant violations at definition/test time.
- When a Sync transition is declarative (`Transition`), derive its exact read/write footprint from `Transition.footprint` instead of running `Closure.reads` perturbation (`packages/sync/src/mount.ts:458-463`, noted in `#581`).

### 3.2 `foldkit-guard` Policy Proofs (`#601` §6.3)
- Consolidate entity + guard rules onto the single guarded handle (eliminating unguarded-handle leaks).
- Enforce `#601`'s **soundness boundary**: `Entity.invariant` proofs in `Laws.check` must NEVER assume discretionary `Guard`s as hypotheses (authority changes independently of data validity).
- Add `Guards.check` (Tier 3 synchronous) and `Prove.policy` integration (Tier 4 Z3) over `{ row, principal }`:
  - Policy consistency (detect vacuous / unsatisfiable allow rules).
  - Precise non-disclosure (`Guard.Update && invariants => Member.Read`).
  - Opaque `principal` checks modeled soundly as free `Bool`s (returning `Unknown` rather than bogus `False` when an opaque term is involved).

### Deliverables
- `packages/sync` declarative law/transition adapter + tests (including dead-state detection and zero-perturbation footprint check).
- `packages/guard` `Guards.check` + Z3 policy/non-disclosure tests verifying the guard-free invariant soundness boundary.
- Mutation specs for both `sync` and `guard` proving broken laws and non-disclosure leaks fail tests.

### Phase 3 Review & Verification Gate
- Security review on `foldkit-guard`: verify authorization checks cannot be bypassed and opaque `principal` rules never produce false positives or false negatives.
- `pnpm exec tsc -b packages/metakit packages/sync packages/guard`
- `pnpm --filter foldkit-sync build && pnpm --filter foldkit-guard build`
- `npx vitest run packages/sync/test packages/guard/test --project unit`
- `pnpm mutate` on new sync/guard mutation specs + `pnpm tags:check` + `npx jev-pref review --hunks`.

---

## Phase 4: Non-Interpreter Consumers & Application-Wide Propagation (`#581`, `#580`)

Cash in on the declarations across `form`, `agent`, `surface`, and `remote` without writing new expression interpreters.

### 4.1 Forms & Agents (`foldkit-form`, `foldkit-agent`)
- **`foldkit-form`:** Consume `Inspect.fieldSpecs(schema)` to derive input constraints (`min`, `max`, `exclusiveMin`, `exclusiveMax`, `literals`, `domain` metadata for `Money` / `CalendarDay` / `Decimal`), live `disabled` states from `Transition.can`, and structured validation messages from `Expr.refinementsOf`.
- **`foldkit-agent`:** Consume `Machine.affordances` / `Transition.can` and `Inspect.toJsonSchema` so MCP, WebMCP, and Agent Native tools automatically expose exact parameter schemas and hide/disable tools whose `when` guard is `Verdict.False` in the current state.

### 4.2 Unifying the Five Dependency Graphs (`#581`) & Local IVM (`#580`)
Address the exact gaps audited in `#581` and `#580`:
- **Bridge `Transition.footprint` <-> `Projection.dependencies` (`Surface`):**
  - Use `Graph.analyze` to connect declared `Transition` write paths to `Projection` read paths (`#587`: `Surface.rootView` skips re-rendering unaffected regions by declared paths; `#586`: Bundle placements declare reads; `#588`: Remote Projections declare their store path).
  - Add a dev-mode write-set verifier that checks observed post-`update` field diffs against declared `Transition` writes and `Surface` ownership.
- **Local Incremental View Maintenance (`#580` in `foldkit-remote`):**
  - Short-circuit `modelToDependencies` on unchanged store identity ahead of `askedOf(model)`.
  - Maintain local `Rows.sum` / `Rows.count` (`algebra: 'group'`) query projections in $O(1)$ on insert/update/delete via `insertDelta` / `updateDelta` / `deleteDelta`.
  - Maintain `Rows.min` / `Rows.max` / `Rows.every` / `Rows.any` (`algebra: 'semilattice'`) in $O(1)$ on insert, triggering a targeted rescan only when `requiresRescanOnDelete` fires.

### Deliverables
- `foldkit-form` + `foldkit-agent` adapters consuming `metakit/inspect` and `metakit/machine`.
- `foldkit-surface` + `foldkit-remote` propagation & IVM integration with benchmarks proving $O(1)$ delta updates and skipped unaffected renders.
- Browser tests (`*.browser.test.ts`) verifying live disabled states and form constraints in real DOM.

### Phase 4 Review & Verification Gate
- Performance review: verify zero per-row repeated derivation, zero O(n) scans on `group` aggregate updates, and memoization by store/slice identity.
- `pnpm exec tsc -b packages/form packages/agent packages/surface packages/remote`
- Unit + browser tests for touched packages + `examples/chirp` / `examples/reference` regression run.
- `pnpm tags:check && pnpm writes:check && pnpm paths:check` + `npx jev-pref review --hunks`.

---

## Phase 5: Temporal & Concurrency Obligations (`#480`)

Single-step proving stops at the network boundary. Add the runtime/protocol obligation layer above Tier 4.

### 5.1 Setup-Time Store Capability Refusals
- Inspect `Schema` / `Transition` aggregate invariants (e.g., cross-row `Rows.sum` or multi-row balance conservation) at store/adapter mount time.
- Declare store capability flags (e.g., `supportsParentRowLock: boolean`, `isolation: 'serializable' | 'read-committed' | 'eventual'`).
- **Fail loudly at setup time** if a `Transition` enforces a cross-row aggregate invariant on a store that cannot lock the parent row or guarantee the required isolation level.

### 5.2 Interleaving Obligations (`Obligation(kind: 'walk')`) & `#480` Closure
- For optimistic/async actions (`concurrency.latest`, optimistic rollback, stale-response suppression), emit structured `Obligation({ kind: 'walk', ... })` records alongside static `Proved` / `Refuted` entries.
- Discharge `walk` obligations through seeded `Walk` / `Scenario` interleaving tests (out-of-order responses, reconnect races, concurrent tab settles).
- Complete `#480`'s remaining open e2e test in `examples/reference/e2e/notebook.e2e.ts`: two edits to one note answered out of order — the second edit must remain visible throughout and after a reload.

### Deliverables
- Capability check & setup-time refusal in `metakit` / `foldkit-remote-server` + unit tests proving incompatible mounts throw at definition time.
- `Obligation(kind: 'walk')` type + seeded interleaving test harness.
- `examples/reference/e2e/notebook.e2e.ts` out-of-order edit e2e test (closing `#480`).

### Phase 5 Review & Verification Gate
- Adversarial concurrency review: verify stale responses cannot clobber newer optimistic or committed state, and setup refusals cannot be bypassed with quiet fallbacks.
- `pnpm e2e examples/reference/e2e/notebook.e2e.ts`
- `pnpm exec tsc -b` on touched packages + mutation tests proving removing the capability guard or stale-response check fails tests.

---

## Phase 6: Path-Tracked Resumable TEA (`Meta-Foldkit` + SSR Pruning — `#436`, `#472`)

### Measurement Constraints from `#436` & `#472`
- **`#436` finding:** Pruning `state` alone saves `< 200 B` if full Snabbdom hydration still re-renders static subtrees (forcing `parts.remote` ~20 KB to stay in the resume envelope). Real resume-payload savings require **partial hydration via path-tracked DOM anchors** so static subtrees are skipped on the client.
- **`#472` finding:** Deferring a single 268 KB bundle only shifts ~909 ms of main-thread work onto first tap (hurting INP). Real startup savings require **`Msg`-scoped code splitting** so only the interacted transition's chunk loads and executes.

### Scope
1. **Composable Declarative TEA `Blocks`:**
   - Compose parent/child `Machine`s and TEA `Blocks` by lifting child `Transition`s along `Path<Parent, Child>` via `Transition.lift`, automatically propagating exact read/write footprints up the tree.
2. **SSR Static Pruning + Partial Hydration (`#436`):**
   - Run `Graph.pruneStatic` (`Expr.residualize`) at SSR time over static `Model` slices and server-only flags.
   - Emit **path-tracked DOM anchors** only for `liveBindings`; render `staticValues` directly into HTML and skip them during client resume so `resumePaths` is the *exact* minimal JSON envelope (avoiding double-quote `&quot;` attribute bloat by using `<script type="application/json">`).
3. **`Msg`-Scoped Code Splitting (`#472`):**
   - Split transition handlers / interactive islands by `Message` tag so the initial client runtime only boots the anchor binder; first intent loads and executes only the target `Msg`'s chunk while preserving pre-boot form inputs (`checkbox`, `radio`, text, scroll).

### Deliverables
- Composable `Block` lifting API + tests verifying parent/child footprint propagation and zero hydration drift.
- `foldkit-ssr` integration with `Graph.pruneStatic` + path-tracked DOM anchor binder + `<script type="application/json">` envelope.
- Before/after benchmark script measuring HTML bytes, resume JSON bytes, initial JS bytes, 4x CPU main-thread blocking, and first-interaction INP on a real example app.

### Phase 6 Review & Verification Gate
- **Numbers decide:** Verify measured reduction in resume envelope bytes, 4x CPU main-thread blocking (< 200 ms target from `#472`), and first-interaction INP with zero hydration mismatches in Playwright e2e tests.
- Browser + e2e tests covering pre-boot user input preservation (`checkbox`, `radio`, text input, scroll) and partial-hydration updates.
- Final repo-wide `pnpm check` (`format:check`, `paths:check`, `tags:check`, `writes:check`, `mutate:check`, `typecheck`, `docs:check`, `test`, `demo`, `pack:check`) + `npx jev-pref review --hunks` + docs/skill updates.
