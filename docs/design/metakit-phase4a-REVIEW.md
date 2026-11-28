# Adversarial Review — Phase 4 Part A (Checked Custom Algebras, Bouts 4.4–4.12)

Date: 2026-11-22
Commits reviewed: `f035e2735^..9a7a0d72f`
Reviewer: Independent read-only adversarial audit (`research` subagent)

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 3 (C1–C3) | Resolved (3/3) |
| High | 8 (H1–H8) | Resolved (8/8) |
| Medium | 6 (M1–M6) | Resolved (6/6) |
| Low | 3 (L1–L3) | Resolved (3/3) |

## Critical

- [x] **C1. `monotoneForeignTerm.unrefused` (`packages/metakit/src/abstract/rowOf.ts:139-149`, `operationChecks.ts:468`):** Fixed in `8202d42ff` (convex result Schema + integrality check in `unrefused`) and `bf2a0e3f2` (monotone totality enforced in `checkOperation`).
- [x] **C2. `foldkit-remote` `replay.ts` and `optimistic.ts` (`packages/remote/src/replay.ts:144-213`, `optimistic.ts:370-387`):** Fixed in `c5407440d` (routed through `applyForeign` + `implementationsMeta`, enforced `commutative === true && associative === true` and same-op consistency across chained patches).
- [x] **C3. `rewriteForeign` (`packages/metakit/src/ops/laws.ts:271-287`, `312-323`):** Fixed in `8202d42ff` (`admitsNull` includes `optionInner(ast)`; `astWithin` and `withinSchema` enforce `allowNull`).

## High

- [x] **H1. `optimistic.ts` `superseded` (`packages/remote/src/optimistic.ts:509-522`):** Fixed in `c5407440d` (included `patch.combines` in field stripping and `empty` check).
- [x] **H2. `checkOperation` SQL parity (`packages/metakit/src/operationChecks.ts:205-218`, `478-501`):** Fixed in `bf2a0e3f2` (baseline samples always run for parity even with no claims; `null` arguments included in parity; 0 recorded calls fails parity).
- [x] **H3. `checkOperation` & `applyForeign` on `nulls: 'own'` (`operationChecks.ts:120-149`, `263-275`, `ops/eval.ts:109-123`):** Fixed in `8202d42ff` (`applyForeign` propagates `Refusal` before `checkArgs` for `nulls: 'own'`) and `bf2a0e3f2` (`sampleArg` includes `null` for `nulls: 'own'`, and strict/own null+refusal probes cover every argument position).
- [x] **H4. `monotoneForeignTerm.forward` (`packages/metakit/src/abstract/rowOf.ts:130-166`):** Fixed in `8202d42ff` (`abstractOf` requires `op.nulls === 'strict'`).
- [x] **H5. `astOfNode` (`packages/metakit/src/ops/residualize.ts:26-31`, `ops/judge.ts:137`):** Fixed in `8202d42ff` (foreign `Call` result ASTs wrapped in `Schema.NullOr(op.result).ast`).
- [x] **H6. `rewriteForeign` & `judge.ts` `same` (`ops/laws.ts:329`, `ops/residualize.ts:41-44`, `ops/judge.ts:95-98,133`):** Fixed in `8202d42ff` (keyed by `Node.foreignName(op)` including version).
- [x] **H7. `reduce` SQL `identity` lowering (`packages/metakit/src/sql.ts:191-201`, `drizzle.ts:168-182`):** Fixed in `8202d42ff` (lowered through `sqlLowering.literal()`).
- [x] **H8. `foldkit-entity` `foreignOpOf` regression (`packages/entity/src/expr/primitive.ts:48-67`, `operator.ts:465`):** Fixed in Commit 4 (this commit: upfront core-prefix validation, non-scalar input routing to `Opaque`, and `claims.invertible.inverse` adaptation).

## Medium

- [x] **M1. `checkOperation` sampling gaps (`packages/metakit/src/operationChecks.ts`):** Fixed in `bf2a0e3f2` (`associative` preserves extreme numbers, `monotone` runs deterministic `hand` sweep and fails on 0 pairs, `rangeEndsOf` unwraps `present`, empty sample pools fail, `invertible` fails if every forward call refuses).
- [x] **M2. `lawObligations` (`packages/metakit/src/operationChecks.ts:588-593`):** Fixed in `bf2a0e3f2` (walks `emit.when`).
- [x] **M3. `partialRows` (`packages/metakit/src/ops/partialRows.ts:104-119`):** Fixed in `8202d42ff` (keeps `Arr.reduce` open when implementation is missing).
- [x] **M4. `Sql.toUpdate` / `Drizzle.toUpdate` (`packages/metakit/src/sql.ts:278`, `drizzle.ts:241`):** Fixed in `8202d42ff` (widened `foreign` option to `| ForeignLowerings`).
- [x] **M5. `Operation.compare` (`packages/metakit/src/operation.ts:169-187`, `435-441`):** Fixed in `8202d42ff` (canonical key-sorted JSON for `claims`, all checks formatted in `describeSchema`).
- [x] **M6. `operationSql.ts` (`packages/metakit/src/operationSql.ts:15-59`, `151-152`):** Fixed in `8202d42ff` (private Symbols for `PIECE_TAG`, `RAW_TAG`, `LOWERINGS_TAG`; runtime hole validation in `piece` and `renderPiece`).

## Low

- [x] **L1. `checkOperation` messages (`operationChecks.ts:395`, `429`):** Fixed in `bf2a0e3f2` (prints `(a, b, c)` for associativity; passes `invOp` for invertibility).
- [x] **L2. Missing runtime claim checks (`operation.ts:315-334`, `properties.ts:169`):** Fixed in `8202d42ff` (validates `identity`/`absorbing` against arg 2 and result, checks `monotone.length === args.length`, guards `side === 'both'` in `reduceProperties`).
- [x] **L3. `Transition.commutes` (`transitionCommutes.ts:302-310`):** Fixed in `8202d42ff` (checks both `opA.claims` and `opB.claims`).
