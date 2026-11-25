# MetaKit Unification — Current Status & Handoff

**Branch:** `ui-polish`  
**Master plan:** `docs/design/metakit-unification-PLAN.md`  
**Measurements ledger:** `docs/design/metakit-unification-LEDGER.md`  
**Last updated:** 2026-11-25  

> **Important working rules (`AGENTS.md`):**
> - Stay on `ui-polish` (never create worktrees or branches without asking).
> - Stage and commit with explicit paths (`git add <new> && git commit -m "..." -- <paths>`). Never `git stash`, `git add .`/`-A`, `git checkout --`, or bare `git reset`.
> - Zero `any` in emitted `.d.ts` (`pnpm --filter <pkg> build` runs `declared-any.mjs`).
> - No ternary on `._tag` (`pnpm tags:check` must exit 0).
> - After every bout of work, run an independent adversarial review with the **most capable model** (do not rely on cheap/flash models for implementation or review without full-capability double-checking).

---

## 1. Completed Phases (Committed & Adversarially Reviewed)

| Phase | Scope | Key Commits on `ui-polish` |
| --- | --- | --- |
| **Phase 0 & 1** | CI, kernel, soundness leftovers | Prior commits + `89fd7eb7a`, `be8cf74ef`, `bfd905329` |
| **Phase 2** | One dependency graph (Bouts 2.1–2.6) | `8ac9a987e`, `09a4a00c4`, `a68afc7fd`, `85a169b01`, `4ae1faebc`, `92767cd4a`, `447b68cfd` |
| **Phase 3 (3.1–3.5, 3.7–3.8)** | `Machine.each`, `Transition.move`, `Sheet`/`WindowList` machines, `domains-plus` 30/39 declared, Form `Declared.disabled`, Agent `machineTools` + Phase 3 audit fixes | `0a6d4aa98`, `bf4ea7d2f`, `d448df858`, `d78e57a09`, `9c16a1384`, `e71cdac1c`, `44c136b35` |
| **Phase 4 Part A** | Typed custom operations, `reduce`, `combine`, Entity migration, permissions example | Prior commits (`89fd7eb7a`, `be8cf74ef`, etc.) |
| **Phase 5 (core)** | Store capabilities & orderings (audited 3×) | `ab41873a8` and prior |
| **Phase 6 (6.2–6.9, 6.13–6.15)** | Trusted-region browser probe, `liveSet`, `Binding`, `foldkit-ssr/binder`, hand-over in `SSR.hydrate`, `KeepTyped` extensions, `static.ts` (`BindingInStaticRegion`), security & hand-over audit + fixes | `9e3380092`, `b60aa8d4d`, `8771d6cc9`, `3b86818a8` |
| **Phase 9 (9.1–9.3, 9.5)** | `metakit/language`, `foldkit-agent` `x-metakit-operations`, `metakit/store/check`, `Temporal.protocol` | `8e7337927`, `19be7425f`, `2628828a5` |

---

## 2. Immediate First Actions for the Next Agent

### A. Inspect & Finalize Uncommitted Working-Tree Changes (`packages/bundle`, Bout 3.6 Bundle Part)
Uncommitted edits exist in `packages/bundle/` (`package.json`, `src/{bundle,combinators,declare,parent,placed}.ts`, `tsconfig*.json`, `tsdown.config.ts`, `test/bundleMachine.{test,test-d,mutations}.ts`) plus `pnpm paths`-generated `tsconfig.json` path updates across `packages/*` and `examples/*`.
- **Check before committing:**
  1. Ensure **zero `any`** in `packages/bundle/src/bundle.ts` (`AnyMachine`) and `packages/bundle/src/placed.ts` (`LiftedOf`), and confirm `pnpm --filter foldkit-bundle build` passes `declared-any.mjs`.
  2. Run `pnpm exec tsc -b packages/bundle`, `npx vitest run packages/bundle/test/bundleMachine.test.ts --project unit`, `pnpm mutate packages/bundle/test/bundleMachine.mutations.ts`, and `pnpm tags:check`.
  3. Commit `packages/bundle/*` + `pnpm-lock.yaml` (and `tsconfig.json` path syncs in a clean commit).

### B. Double-Check the Three Flash-Written Phase 6 Modules
These were written by a faster/cheaper model and committed in `8771d6cc9` (with security fixes in `3b86818a8`):
- `packages/ssr/src/keep.ts` + `packages/ssr/test/keepState.{test,mutations}.ts` (Bout 6.8)
- `packages/ssr/src/static.ts` + `packages/ssr/test/staticRegion.{test,mutations}.ts` (Bout 6.9)
- `packages/ssr/test/trustedRegion.browser.test.ts` (Bout 6.2)

Verify any remaining edge cases:
- `keep.ts`: `restorePageState` currently resets hardcoded `['aria-pressed', 'aria-expanded', 'open']` on `data-fk-binder-touched` elements; consider recording the exact changed attribute names in `data-fk-binder-touched` so untouched attributes are never clobbered (Phase 6 audit #12).
- `client.ts`: async `options.prepare` gap between `claimBinder().take()` and `adoptFrom()`, and `plan.restore` interaction when `binderSnapshot.mutated === true` (Phase 6 audit #6 & #7).

---

## 3. Remaining Work (Ordered Checklist)

### Quick Wins (Close Out Phases 3, 5, and 9)
1. **Phase 5 Bout 5.1 (Cleanup):**
   - Fix doc comment L3 on `EntityWriter.checksTargets` in `packages/remote-server/src/index.ts`.
   - Pin L1's safe extra read in `packages/remote/test/`.
   - Add `packages/durable/test/store.test-d.ts` holding `foldkit-durable`'s `StoreCapabilities` equal to metakit's.
2. **Phase 3 Bout 3.6 (Remote Part):**
   - `packages/remote/src/{domain,can}.ts`: reducer steps as writers of store paths in `Graph.of`; store rows readable as paths (`$.remote.store.Quote.<name>`) by transition guards; `Data.can` asks the machine.
   - Declare `ClickedAddDomain` (#31 of 39) in `examples/foldkit/domains-plus/src/client/machine.ts` using store-path reads + `Transition.insert`.
   - Clean up any dead arms in `examples/foldkit/domains-plus/src/client/app.ts`'s `own` fallback.
3. **Phase 9 Bouts 9.4, 9.6, 9.7:**
   - **Bout 9.4:** Adopt `checkStore` (`metakit/store/check`) in tests for `packages/remote-server/test`, `packages/remote-drizzle/test`, `packages/durable/test`, and `packages/sync/test`.
   - **Bout 9.6:** Permissions consumers in `examples/metakit` (maintained total over rows using `reduce` with `flags.or`/`flags.xor`; Sync replica with `combine` convergence report & 2-replica walk).
   - **Bout 9.7:** Phase 9 adversarial review + fixes.

### Medium-Sized Remaining Slices
4. **Phase 6 Bouts 6.10–6.12 (`domains-plus` on the Binder):**
   - **Bout 6.10:** Wire `examples/foldkit/domains-plus` onto `foldkit-ssr/binder` (bindings for cart/filter anchors, binder entry, hand-over to `SSR.hydrate`).
   - **Bout 6.11:** Add `examples/foldkit/domains-plus/e2e/binder.e2e.ts` (press before runtime loads -> load -> press after hand-over; verify zero rebuilt elements; navigation to unserved page).
   - **Bout 6.12:** Run `scripts/phase6-baseline.mjs` & `scripts/bundle-budget.mjs` (two runs) and record measurements in `docs/design/metakit-unification-LEDGER.md` (targets: < 20 kB compressed script before first press, < 200 ms blocking, 0 rebuilt elements, envelope <= 10,741 B).

### Large Remaining Phases
5. **Phase 4 Part B (Maintained Values & 100k-Row Placement — Bouts 4.13–4.24):**
   - Already done: Bout 4.2 (`foldkit-remote/maintained` row deltas, aggregates, ordered lists; commits `f414a1d42`, `c2b4d08c0`) and Bout 4.13 partial (comparison-count bench & linear scan; `aa6b81d99`, `36a7643f9`).
   - **Bout 4.13 (finish) & 4.16:** Binary-search placement over validated order keys (`packages/remote/src/layers.ts`, `placement.ts`) + indexes above 400 rows (`packages/remote/src/maintained/index*.ts`). Gate: <= 17 comparisons and < 16 ms pending placement at 100,000 rows.
   - **Bout 4.14:** Coverage (`packages/remote/src/maintained/coverage.ts`).
   - **Bout 4.15:** Offline `asOf` (`packages/remote/src/maintained/asOf.ts`, `persist.ts`).
   - **Bout 4.17:** Server totals & Postgres parent-row lock (`packages/remote-drizzle/src/index.ts`, `packages/durable/src/journal.ts`). Gate: one of two overdrawing transfers refused on Postgres.
   - **Bout 4.18:** Durable Object change replay (`packages/durable/src`).
   - **Bout 4.19:** Dependent queries (`packages/remote/src/domain.ts`).
   - **Bout 4.20–4.22:** Fold kinds (`maintained/fold.ts`), lists & joins (`maintained/list.ts`, `join.ts`), `classify` (`maintained/classify.ts`).
   - **Bout 4.23:** Rescan report & differentials (`packages/remote/test/maintained*.ts`).
   - **Bout 4.24:** Phase 4 Part B adversarial review + fixes.

6. **Phase 7 (Script Cut Along Messages — Bouts 7.1–7.10):**
   - **Bout 7.1 (Gate):** Measure transitions + Command code share via `scripts/bundle-report.mjs` after Phase 6.12 (threshold: >= 25% of script before first press; if below, cut by Surface & child machine only, keep failure handling).
   - **Bout 7.2:** Lazy child machines (`Machine.compose({ cart: () => import(...) })`) and `Transition.lazy` (`packages/metakit/src/{machine,transition}.ts`).
   - **Bout 7.3:** Manifest contract & Vite plugin (`packages/ssr/src/vite/manifest.ts`, absorbs `runtimeChunk.ts`).
   - **Bout 7.4–7.5:** Loading policy (idle / pointerover / focus / touchstart / 3s wait) and chunk-failure handling in `packages/ssr/src/binder.ts`.
   - **Bout 7.6:** Runtime takes arms as chunks arrive in `packages/surface/src/declared.ts`.
   - **Bout 7.7–7.10:** `domains-plus` cut by Message, `e2e/chunks.e2e.ts`, ledger measurements, ordering review.

7. **Phase 8 (Examples, Guides, Skill, Site, Post — Bouts 8.1–8.10):**
   - **Bouts 8.1–8.4:** Migrate remaining examples (`reference`, `chirp`, `registry`, `cms`, `pages`, `writes`, `writes-domain`, `cloudflare`, `auth`, `entity`, `remote`, `sync`, `todo`) to declared Messages + write verifier.
   - **Bouts 8.5–8.8:** Task guides (per `docs/agents/writing-docs.md`, each checked by a cold reader) + upgrade guide for Phases 1–4 breaks.
   - **Bout 8.9:** Update `skills/foldkit-plus/` (`SKILL.md` and references, all snippets compiled) and `examples/site/src/catalog.ts`.
   - **Bout 8.10:** Blog post in `examples/site/public/blog/`.

8. **Final Developer-Experience Audit:**
   - Inference without annotations across `Expr`, `Transition`, `Machine`, `Declared.of`, `Graph.of`, `Rows`, `Operation`, `Maintained`, `Binding`, `Language`.
   - Negative error locations & messages, compile cost (rule 21 instantiation counts), and refusal text audit (rule 20).
