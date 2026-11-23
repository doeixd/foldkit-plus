# Adversarial Review — Phase 1 Leftovers (Bouts 1.1–1.5)

Date: 2026-11-23
Commits reviewed: `7c4f58444` (1.1), `97260f04c` (1.2), `e39a16823` (1.3), `89afd1d95` (1.4), `3e3a4db89` (1.5)
Reviewer: Independent read-only adversarial audit (`research` subagent)

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 3 (C1–C3) | Open |
| High | 4 (H1–H4) | Open |
| Medium | 4 (M1–M4) | Open |
| Low | 2 (L1–L2) | Open |

## Critical

- [ ] **C1. Z3 IEEE-754 `Float64` equality uses structural `(= x y)` instead of `fp.eq`, breaking `-0 === +0` (`packages/metakit/src/prove/lower.ts:256-259, 150`):** `FP.prototype.eq` emits structural `=`, where `+0.0 != -0.0`, causing `Eq.isNot(Num.neg(x), x)` over `Schema.Finite` to be falsely proved `True`. Fix: use `z3.And(left.le(right), left.ge(right))` for finite `ZFP` equality in `sameValue` and `declare`.
- [ ] **C2. Z3 `Float64` lowering assumes `Not(isInf())` for non-`Schema.Finite` numbers that reject `NaN` but admit `Infinity` (`packages/metakit/src/prove/shape.ts:179,188`, `prove/lower.ts:137-140`):** `Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))` rejects `NaN` (`info.nan === false`) but accepts `Infinity`, causing `Prove.invariant` to unsoundly exclude `Infinity`. Fix: check `NaN`, `Infinity`, and `-Infinity` in `shape.ts`, and only assert `Not(isInf())` / enter the finite `Float64` branch when all three are rejected.
- [ ] **C3. `arr.has` SQL parity breaks on Postgres `NULL` array elements AND on SQLite booleans vs integers (`packages/metakit/src/sqlLowering.ts:442-447`):** Postgres `3 = ANY(ARRAY[1, NULL]::int[])` returns `NULL` instead of `FALSE`; SQLite `json_each('[true]')` stores `value = 1` so `value = 1` matches `true` and `value = true` matches `1`. Fix: Postgres `COALESCE(${value} = ANY(${list}), FALSE)` (inside the outer NULL guard); SQLite constrain `json_each.type` alongside `value` (or match by needle type).

## High

- [ ] **H1. SQLite `time.addMonths` returns `NULL` for valid dates landing in `9999-12-01..9999-12-31` (`packages/metakit/src/sqlLowering.ts:401`):** `date(..., 'start of month', n || ' months', '+1 month', '-1 day')` overflows `9999-12-31` to `NULL`, making `min(..., NULL)` return `NULL`. Fix: guard `9999-12` to clamp to `'9999-12-31'`.
- [ ] **H2. `lowerCheck` and `prove/solve.ts` wrongly bypass `NullOr`-level refinements when the column is `NULL` (`packages/metakit/src/sqlStatements.ts:36-49`, `prove/solve.ts:154-162`):** Guarding every `info.nullable` field rule with `isNull(at) || rule` bypasses refinements attached directly to a `Schema.NullOr(...)` union (e.g. `Schema.NullOr(Schema.Int).pipe(Expr.refine(x => Bool.not(Null.isNull(x))))`). Fix: only wrap rules when `at` (or an ancestor) is an optional key (`SchemaAST.isOptional`), not a `NullOr` union with its own refinement.
- [ ] **H3. Z3 `num.div` and `num.rem` omit `unsafe(left)` in their refusal condition (`packages/metakit/src/prove/lower.ts:495, 514`):** An unsafe integer literal dividend (e.g. `1e20`) with a safe quotient is treated as unrefused by Z3 while JS refuses `unsafe-integer`. Fix: pass `z3.Or(unsafe(left), unsafe(quotient))` and `z3.Or(unsafe(left), unsafe(remVal))`.
- [ ] **H4. Postgres `num.div` SQL overflows `int4` (`INTEGER`) columns inside `±(2^53-1)` (`packages/metakit/src/sqlLowering.ts:342-365`):** Intermediate `2 * r` and `n - r` overflow `int4` when `|n|, |d| > 10^9`. Fix: cast `rawN` and `rawD` to `bigint` in Postgres (`CAST(... AS bigint)`).

## Medium

- [ ] **M1. `prove/lower.ts` `expr()` rejects `ZFP`, breaking `If` (`min`/`max`/`abs`/`clamp`) and `null.coalesce` on `Schema.Finite` (`packages/metakit/src/prove/lower.ts:92-95`):** Add `|| z3.isFP(value)` to `expr()`.
- [ ] **M2. `time.addDays` and `time.daysBetween` SQL lowering skips `exact('+')` / `exact('-')` overflow guards and fraction checks (`packages/metakit/src/sqlLowering.ts:389-390`):** Use `exact('+')` and `exact('-')`.
- [ ] **M3. Z3 `arr.has` on a literal array containing non-finite numbers (`[NaN]`, `[Infinity]`) misses refusal (`packages/metakit/src/prove/lower.ts:565-581`):** Check literal array elements for non-finite numbers and mark `refused: z3.Bool.val(true)`.
- [ ] **M4. Exponential SQL expansion on nested `num.div` calls (`packages/metakit/src/sqlLowering.ts:342-364`):** Simplify `half-even` / `half-away-from-zero` or reduce repeated subexpressions.

## Low & Test Gaps

- [ ] **L1. Out-of-domain `time.addMonths` underflow below `0001-01-01` diverges across JS, SQLite, and Postgres (`packages/metakit/src/sqlLowering.ts:397-402`):** Document or guard out-of-range underflow.
- [ ] **L2. Test & mutation gaps (`soundness15.test.ts`, `divRem.test.ts`, `time.test.ts`, `arrHas.test.ts`):** Strengthen FP timeout assertion, test `INTEGER` (`int4`) Postgres columns for `num.div`, add `9999-12` parity cases for `time.addMonths`, add boolean/int-mismatch and `NULL`-element parity cases for `arr.has`, and add regression tests for C1, C2, H2, H3, M1, M3.
