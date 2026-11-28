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
| **Phase 3 (3.1–3.8 — DONE)** | `Machine.each`, `Transition.move`, `Sheet`/`WindowList` machines, `domains-plus` 31/39 declared, `Bundle.make({ machine })`, Remote `storeRowPath` + `Can.withMachine`, Form `Declared.disabled`, Agent `machineTools` + Phase 3 audit fixes | `0a6d4aa98`, `bf4ea7d2f`, `d448df858`, `d78e57a09`, `9c16a1384`, `e71cdac1c`, `44c136b35`, `50dd7295f`, `d25530175` |
| **Phase 4 Part A & B (DONE)** | Typed custom operations, `reduce`, `combine`, Entity migration, permissions example; maintained values (`foldkit-remote/maintained`: deltas, binary-search placement 17 comps / 2.8 ms at 100k rows, `coverage`, `asOf`, `classify`, `indexes`, `dependentQuery`, `Maintained.reduce`, `Maintained.join`, seeded differentials), Postgres `SELECT ... FOR UPDATE` parent lock + stored totals + D1 aggregate refusal, Durable Object `Journal.replay` + Phase 4 Part B audit fixes | Prior commits + `d2bded751`, `8986268f6`, `224000091`, `d4beb0f6f`, `c9b1c0172` |
| **Phase 5 (DONE)** | Store capabilities & orderings + Bout 5.1 cleanup (`checksTargets` doc, `JournalStore === StoreCapabilities` type test) | `ab41873a8`, `12c2faa99` |
| **Phase 6 (6.2–6.15 — DONE)** | Trusted-region browser probe, `liveSet`, `Binding`, `foldkit-ssr/binder`, hand-over in `SSR.hydrate` (with slice-preserving merge), `KeepTyped` extensions, `static.ts`, `domains-plus` on `DOMAINS_PLUS_BINDER=1` + `e2e/binder.e2e.ts` (2/2 passing, 0 rebuilt elements) + ledger measurements (binder chunk 4.18 kB brotli, stays opt-in due to 50.4 kB shared `effect/Schema` + `metakit` chunk), security & deep-review audits | `9e3380092`, `b60aa8d4d`, `8771d6cc9`, `3b86818a8`, `ad6a70b90`, `9b76bd4ac`, `2be4d1b31` |
| **Phase 7 (7.1–7.10 — DONE)** | `Transition.lazy`, `Machine.lazyChild`/`Machine.compose({ lazyChildren })`, `Manifest<Tag>` + `defineManifest` + `manifestFromChunks` + `manifestPlugin` (`foldkit-ssr/vite`), binder intent-prefetch (`pointerover`/`focusin`/`touchstart`/idle) + 3 s timeout + single-retry `aria-disabled` & form-POST fallback, `Declared.of` `registerArm`/`lazyTags`, `domains-plus` lazy `addDomain` chunk (**327 B brotli**) + `e2e/chunks.e2e.ts` (2/2 passing) | `b57c52c7c` |
| **Phase 8 (8.1–8.10 — DONE)** | Verified zero deleted APIs across examples; wrote 8 task guides under `docs/guides/`, `docs/upgrading-metakit.md`, and `docs/blog/2026-11-25-metakit-unification.md`; updated `skills/foldkit-plus/references/{metakit,ssr,surface}.md` and `examples/site/src/catalog.ts` (`tsc -b examples/site` pass) | Phase 8 commit |
| **Final DX Audit (DONE)** | Verified zero-annotation inference across `Operation.define`, `Language.make`, `Transition.make`/`combine`, `Machine.make`, `Declared.of`, `Binding.define`, `defineManifest`, and `Temporal.protocol` (`tsc -b examples/kitchen-sink` pass; caught & fixed `foldkit-surface/declared` import in `docs/guides/declare-update.md`) | Phase 8 commit |
| **Phase 9 (9.1–9.6 — DONE)** | `metakit/language`, `foldkit-agent` `x-metakit-operations`, `metakit/store/check` + store adapter tests (`remote-server`, `remote-drizzle`, `durable`, `sync`), `Temporal.protocol`, `examples/metakit` permissions language + differential tests | `8e7337927`, `19be7425f`, `2628828a5`, `12c2faa99`, `acccb125b` |

---

## 2. Minor Open Review Follow-Ups

None — all review follow-ups (including `packages/ssr/src/client.ts` async `options.prepare` hand-over, `plan.restore` shallow merge, `packages/bundle/src/bundle.ts` `Machine | undefined` inference, and all 18 adversarial deep-review findings) are resolved.

---

## 3. Remaining Work

All phases (Phases 0–9) and the Final Developer-Experience Audit of `docs/design/metakit-unification-PLAN.md` are complete on `ui-polish`. Only the two non-blocking follow-ups in Section 2 and pushing/CI remain.
