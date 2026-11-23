# Adversarial Review — Phase 1 Leftovers (Bouts 1.1–1.5)

Date: 2026-11-23
Commits reviewed: `7c4f58444` (1.1), `97260f04c` (1.2), `e39a16823` (1.3), `89afd1d95` (1.4), `3e3a4db89` (1.5)
Reviewer: Independent read-only adversarial audit (`research` subagent)

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 3 (C1–C3) | Resolved (3/3) |
| High | 4 (H1–H4) | Resolved (4/4) |
| Medium | 4 (M1–M4) | Resolved (4/4) |
| Low | 2 (L1–L2) | Resolved (2/2) |

## Critical

- [x] **C1. Z3 IEEE-754 `Float64` equality uses structural `(= x y)` instead of `fp.eq`, breaking `-0 === +0` (`packages/metakit/src/prove/lower.ts:256-259, 150`):** Fixed in `429be3bde` (`z3.And(left.le(right), left.ge(right))` in `sameValue` and `declare`).
- [x] **C2. Z3 `Float64` lowering assumes `Not(isInf())` for non-`Schema.Finite` numbers that reject `NaN` but admit `Infinity` (`packages/metakit/src/prove/shape.ts:179,188`, `prove/lower.ts:137-140`):** Fixed in `429be3bde` (`PathInfo.finite` checks `!is(NaN) && !is(Infinity) && !is(-Infinity)`).
- [x] **C3. `arr.has` SQL parity breaks on Postgres `NULL` array elements AND on SQLite booleans vs integers (`packages/metakit/src/sqlLowering.ts:442-447`):** Fixed in Commit B (this commit: Postgres `COALESCE(${value} = ANY(${list}), FALSE)`; SQLite constrains `json_each.type` by `needleKind`).

## High

- [x] **H1. SQLite `time.addMonths` returns `NULL` for valid dates landing in `9999-12-01..9999-12-31` (`packages/metakit/src/sqlLowering.ts:401`):** Fixed in Commit B (guarded `9999-12` month-end clamp to `'9999-12-31'`).
- [x] **H2. `lowerCheck` and `prove/solve.ts` wrongly bypass `NullOr`-level refinements when the column is `NULL` (`packages/metakit/src/sqlStatements.ts:36-49`, `prove/solve.ts:154-162`):** Fixed in `429be3bde` (`FieldInfo.optional` tracks `SchemaAST.isOptional` separately from `nullable`; `abstract/check.ts`, `sqlStatements.ts`, and `prove/solve.ts` guard only `info.optional`).
- [x] **H3. Z3 `num.div` and `num.rem` omit `unsafe(left)` in their refusal condition (`packages/metakit/src/prove/lower.ts:495, 514`):** Fixed in `429be3bde` (`z3.Or(unsafe(left), unsafe(quotient))` / `z3.Or(unsafe(left), unsafe(remVal))`).
- [x] **H4. Postgres `num.div` SQL overflows `int4` (`INTEGER`) columns inside `±(2^53-1)` (`packages/metakit/src/sqlLowering.ts:342-365`):** Fixed in Commit B (casts `rawN` and `rawD` to `bigint` in Postgres).

## Medium

- [x] **M1. `prove/lower.ts` `expr()` rejects `ZFP`, breaking `If` (`min`/`max`/`abs`/`clamp`) and `null.coalesce` on `Schema.Finite` (`packages/metakit/src/prove/lower.ts:92-95`):** Fixed in `429be3bde` (added `|| z3.isFP(value)`).
- [x] **M2. `time.addDays` and `time.daysBetween` SQL lowering skips `exact('+')` / `exact('-')` overflow guards and fraction checks (`packages/metakit/src/sqlLowering.ts:389-390`):** Fixed in Commit B (delegated to `exact('+')` and `exact('-')`).
- [x] **M3. Z3 `arr.has` on a literal array containing non-finite numbers (`[NaN]`, `[Infinity]`) misses refusal (`packages/metakit/src/prove/lower.ts:565-581`):** Fixed in `429be3bde` (marks literal array containing non-finite numbers as refused).
- [x] **M4. Exponential SQL expansion on nested `num.div` calls (`packages/metakit/src/sqlLowering.ts:342-364`):** Fixed in Commit B (simplified `ceiling`, `half-even`, and `half-away-from-zero` to halve `qFloor` duplication).

## Low & Test Gaps

- [x] **L1. Out-of-domain `time.addMonths` underflow below `0001-01-01` diverges across JS, SQLite, and Postgres (`packages/metakit/src/sqlLowering.ts:397-402`):** Documented `CalendarDay` `0001-01-01..9999-12-31` domain contract alongside the `9999-12` guard.
- [x] **L2. Test & mutation gaps (`soundness15.test.ts`, `divRem.test.ts`, `time.test.ts`, `arrHas.test.ts`):** Added regression tests for C1, C2, C3 (Postgres `NULL` array elements & SQLite booleans vs ints), H1 (`9999-12`), H2 (`NullOr`-level refinement), H3 (`1e20` dividend), H4 (Postgres `INTEGER` `int4` column), M1 (`If`/`Null.coalesce` on `Schema.Finite`), and M3 (`[NaN]`).
