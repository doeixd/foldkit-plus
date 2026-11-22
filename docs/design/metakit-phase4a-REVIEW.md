# Adversarial Review — Phase 4 Part A (Checked Custom Algebras, Bouts 4.4–4.12)

Date: 2026-11-22
Commits reviewed: `f035e2735^..9a7a0d72f`
Reviewer: Independent read-only adversarial audit (`research` subagent)

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 3 (C1–C3) | Open |
| High | 8 (H1–H8) | Open |
| Medium | 6 (M1–M6) | Open |
| Low | 3 (L1–L3) | Open |

## Critical

- [ ] **C1. `monotoneForeignTerm.unrefused` (`packages/metakit/src/abstract/rowOf.ts:139-149`, `operationChecks.ts:468`):** Unsound for throwing, null-returning, or non-convex-result monotone operations. `checkOperation` skips non-number results in `monotone`, and `unrefused` checks only corner evaluation without requiring totality or convex result Schema.
- [ ] **C2. `foldkit-remote` `replay.ts` and `optimistic.ts` (`packages/remote/src/replay.ts:144-213`, `optimistic.ts:370-387`):** Calls raw `impl.run(...)` bypassing `applyForeign` (`nulls: 'strict'`, `checkArgs`, `checkResult`, non-finite, NUL checks skipped), and `replayed` blindly replays any `PendingCombine` without verifying `claims.commutative === true && claims.associative === true` or same-operation consistency across chained patches.
- [ ] **C3. `rewriteForeign` (`packages/metakit/src/ops/laws.ts:271-287`, `312-323`):** `admitsNull` misses `Schema.Option` (unwrapped by `present(ast)`), and `!admitsNull(target)` lets `Schema.NullOr` operands pass `allowNull = false` in `absorbing` rewrites (`flagsOr(0x7fffffff, null)` rewrites to `0x7fffffff` while concrete eval returns `null`).

## High

- [ ] **H1. `optimistic.ts` `superseded` (`packages/remote/src/optimistic.ts:509-522`):** Omits `patch.combines` from field stripping and `empty` check, silently dropping unrelated pending `combines` patches or failing to strip settled `combines` fields.
- [ ] **H2. `checkOperation` SQL parity (`packages/metakit/src/operationChecks.ts:205-218`, `478-501`):** `recordedCalls` is empty for operations with no claims (e.g. `flagsAndNot`), emitting a false `Held` parity discharge with 0 SQL queries; SQL parity also skips `null` arguments.
- [ ] **H3. `checkOperation` & `applyForeign` on `nulls: 'own'` (`operationChecks.ts:120-149`, `263-275`, `ops/eval.ts:109-123`):** `sampleArg` never samples `null` for `nulls: 'own'` ops; `applyForeign` overwrites `Refusal` arguments with `ill-typed` for `nulls: 'own'`; strict null/refusal probes only test position 0.
- [ ] **H4. `monotoneForeignTerm.forward` (`packages/metakit/src/abstract/rowOf.ts:130-166`):** Does not require `op.nulls === 'strict'`, unsoundly ignoring `op(null)` for `nulls: 'own'` operations on nullable inputs.
- [ ] **H5. `astOfNode` (`packages/metakit/src/ops/residualize.ts:26-31`, `ops/judge.ts:137`):** Treats foreign `Call` results as non-nullable even though any foreign call can return `null`, enabling unsound rewrites under `nulls: 'own'` operations.
- [ ] **H6. `rewriteForeign` & `judge.ts` `same` (`ops/laws.ts:329`, `ops/residualize.ts:41-44`, `ops/judge.ts:95-98,133`):** `view.unary` keys by `op.id` without `op.version`, collapsing `opV2(opV1(x))` to `opV1(x)`.
- [ ] **H7. `reduce` SQL `identity` lowering (`packages/metakit/src/sql.ts:191-201`, `drizzle.ts:168-182`):** Wraps `identity` in `SqlPiece.Value` directly, bypassing `literal()` (`null`, NUL text, `-0`, non-finite).
- [ ] **H8. `foldkit-entity` `foreignOpOf` regression (`packages/entity/src/expr/primitive.ts:48-67`, `operator.ts:465`):** Non-scalar inputs crash `Operation.define`; core prefixes crash on first call; `claims.invertible.inverse` type mismatch (`ForeignOp` vs `AnyOperation`).

## Medium

- [ ] **M1. `checkOperation` sampling gaps (`packages/metakit/src/operationChecks.ts`):** `associative` `.slice(0, 8)` drops extreme numbers (`MAX_SAFE_INTEGER`, `0.5`, `1e200`); `monotone` passes with 0 runs on non-numeric Schemas and has no deterministic `hand` pair sweep; `rangeEndsOf` skips `Schema.NullOr(Number)`; empty sample pools silently report `Held`; `invertible` passes if `op` always refuses.
- [ ] **M2. `lawObligations` (`packages/metakit/src/operationChecks.ts:588-593`):** Misses custom ops inside `Transition.emit(..., { when })`.
- [ ] **M3. `partialRows` (`packages/metakit/src/ops/partialRows.ts:104-119`):** Folds `Arr.reduce` over a known list with missing implementation to `Lit(Refusal('unsupported'))` instead of keeping it open (`unsupported`).
- [ ] **M4. `Sql.toUpdate` / `Drizzle.toUpdate` (`packages/metakit/src/sql.ts:278`, `drizzle.ts:241`):** Public `foreign` option type omits `ForeignLowerings`.
- [ ] **M5. `Operation.compare` (`packages/metakit/src/operation.ts:169-187`, `435-441`):** Key-order sensitive on `claims` (`JSON.stringify`), and `describeSchema` only formats the last check (blind to stacked checks like `Int` + `isBetween`).
- [ ] **M6. `operationSql.ts` (`packages/metakit/src/operationSql.ts:15-59`, `151-152`):** Uses forgable `Symbol.for`, untagged `{ raw }` hole in `renderPiece`, and duck-typed `isForeignLowerings`.

## Low

- [ ] **L1. `checkOperation` messages (`operationChecks.ts:395`, `429`):** Associativity prints `op(ab, c)` instead of `(a, b, c)`; invertibility passes `desc` instead of `invOp`.
- [ ] **L2. Missing runtime claim checks (`operation.ts:315-334`, `properties.ts:169`):** `Operation.define` checks `identity`/`absorbing` only against `checkArgs[0]` and skips `monotone.length === args.length`; `reduceProperties` omits `side === 'both'` guard.
- [ ] **L3. `Transition.commutes` (`transitionCommutes.ts:302-310`):** `same-operation` checks only `opA.claims`, not `opB.claims`.
