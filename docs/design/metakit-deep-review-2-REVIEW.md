# Deep Adversarial Review & External Verification (`e6cf9aa0b..c645f76b7` + working tree)

Independent deep review using `AGENTS.md` review guidance, two parallel adversarial audits, and **external formal model checking via TLC2 v2.19** (`ReplayProtocol.tla`).

Scope:
- `Transition.idempotent` (`e6cf9aa0b`), `foldkit-sync` convergence (`ae728b5e6`, `235d804f3`)
- `foldkit-remote` replay & settlement (`1616524cd`, `bad8758c4`)
- Revision-carrying write answers (`0e8faee9c`)
- `GuardServer.writer` (`052133ba4`), `metakit` / `entity` fixes (`397ff9101`, `4761c746b`), and uncommitted working-tree changes in `store.ts`, `guard/src/server.ts`, `remote-server/src/index.ts`.

---

## Critical

- [x] **C1 — Permanent silent client/server divergence on out-of-order execution with revisions (TLC2-verified)** (`2e0563dfc`)
  - **Files:** `packages/remote/src/ledger.ts:272-290`, `packages/remote/src/replay.ts:217-223`, `packages/remote/src/model.ts:2234-2246`
  - **External verification (TLC2 v2.19, `ReplayProtocol.tla`, 17,098 states, depth 9 counterexample):**
    1. Initial state: `srvVal = 0, rev = 1`, `cliVal = 0, rev = 1`.
    2. Client sends `r1` (seq 1: `add +1`) and `r2` (seq 2: `set 2`) concurrently.
    3. Server executes `r2` first (`srvVal = 2, rev = 2`), then `r1` (`srvVal = 3, rev = 3`).
    4. Live patch `[val = 2, rev = 2]` arrives (`cliVal = 2, cliRev = 2`, `keptBy = {r1, r2}`).
    5. `r2`'s HTTP answer (`val = 2, rev = 2`) arrives first -> `settledLater` marks seq 2 as settled.
    6. `r1`'s HTTP answer (`val = 3, rev = 3`) arrives second: `reconcileMutation` dropped `r1`'s write purely on client send order (`seq 1 < seq 2`) while `settleReplayed` trusted `rightAfter(2, 3)` and scheduled no reread.
  - **Fix:** `reconcileMutation` orders by server revision (`entity.revision > held.revision` lands; `<` drops) whenever both carry revisions for the field + regression test in `packages/remote/test/replay.test.ts`.
  - **TLC2 proof of fix:** Exhaustively checked **30,322 states (11,086 distinct states, depth 14)** with **0 errors**.

---

## High

- [x] **H1 — Authorization bypass in `GuardServer.writer` `decideUpdate` (`leaving`) via hidden link targets** (`eadee3370`)
  - **Files:** `packages/guard/src/server.ts:842-851, 869-883`
  - **Fix:** For keys in `read` that are in `links`, compare against unmasked `stored` link values when available, or fail closed if `before[key] === null` + regression test in `packages/guard/test/overOthers.test.ts`.

- [x] **H2 — `Transition.idempotent` is unsound for `patch` and `patchWhere` (`sets-unread` ignores `key`/`test` reads and refusals)** (`656c4a32e`)
  - **Files:** `packages/metakit/src/transitionCommutes.ts:410-423`
  - **Fix:** For `sets-unread`, also require `!(touches(elementFieldsRead(write), fieldsSet(write)) && !steady(write))` + regression test in `packages/metakit/test/review-phase1-5.test.ts`.

- [x] **H3 — `Transition.idempotent` is unsound for `insert` (`idempotent: 'always'` fails on NUL key over empty list)** (`656c4a32e`)
  - **Files:** `packages/metakit/src/transitionLists.ts:168-184`
  - **Fix:** Validate `isOp(keyValue, keyValue)` via `andOp` in `insert`'s `cond` so uncomparable keys (e.g. NUL) refuse on Run 1 even on an empty list, keeping `insert` genuinely `idempotent: 'always'` while preserving `abstract/lists.ts` `countBounds` + regression test in `packages/metakit/test/review-phase1-5.test.ts`.

- [x] **H4 — `foldkit-sync` `convergence` classifies non-commuting idempotent Messages as `copy: 'harmless'` ("needs no removal of the copy")** (`ba5902969`)
  - **Files:** `packages/sync/src/convergence.ts`, `packages/sync/README.md`, `skills/foldkit-plus/references/sync.md`
  - **Fix:** Clarified in `convergence.ts`, `packages/sync/README.md`, and `skills/foldkit-plus/references/sync.md` that `copy: 'harmless'` covers *immediate back-to-back* copies (`t(t(s)) = t(s)`) and that interleaved redelivery still relies on id deduplication unless the Message also commutes with every durable Message.

- [x] **H5 — Stale reads rejected by `olderThanHeld` still pollute `kept` and `included` (`bad8758c4`)** (`2e0563dfc`)
  - **Files:** `packages/remote/src/replay.ts:90-96`
  - **Fix:** Skip rows in `replayOver` where `olderThanHeld(under, revision)` is true + regression test in `packages/remote/test/replay.test.ts`.

- [x] **H6 — Out-of-order settle after a live patch double-counts remaining pending writes (`1616524cd` + `bad8758c4`)** (`2e0563dfc`)
  - **Files:** `packages/remote/src/replay.ts:210-270`, `packages/remote/src/model.ts:2232-2252`
  - **Fix:** Pass `earlier` (still-pending requests sent before `requestId`) into `settleReplayed` and mark them in `included` so out-of-order answers do not double-count earlier pending `add`s + regression test in `packages/remote/test/replay.test.ts`.

---

## Medium

- [x] **M1 — `writer.revision` bypasses member Read rules and is not checked by `GuardServer.validate` (`0e8faee9c`)** (`eadee3370`)
  - **Files:** `packages/guard/src/server.ts:1404-1425`
  - **Fix:** Flag `writer.revision` / pinned revision field against `readRuled(attachment, ...)` in `GuardServer.validate` + regression test in `packages/guard/test/overOthers.test.ts`.

- [x] **M2 — `replayOver` ignores reads whose `revision` advanced when the field returned to the same value (ABA)** (`2e0563dfc`)
  - **Files:** `packages/remote/src/replay.ts:99-105`
  - **Fix:** Include all fields of a read in `replayOver` whenever `revision > under.revision` + regression test in `packages/remote/test/replay.test.ts`.

- [x] **M3 — `checkWriteProperties` misses `insert` NUL-key idempotence bug** (`656c4a32e`)
  - **Files:** `packages/metakit/src/writeChecks.ts:84-88`
  - **Fix:** Added `'\0'` to `insert` literals in `writeChecks.ts` (verified by `properties-rows.test.ts`).

- [x] **M4 — `Temporal.walkAsync` lacks duplicate step-name validation** (`656c4a32e`)
  - **Files:** `packages/metakit/src/temporal.ts:356-375`
  - **Fix:** Validate unique `step.name`s and known `after` references upfront in `walkAsync` + regression test in `packages/metakit/test/review-phase1-5.test.ts`.

---

## Low & De-slop

- [x] **L1 — Dead `Path` branch in `cannotRefuse` for `eq.in` / `eq.among`** (`656c4a32e`) (`packages/metakit/src/ops/kind.ts:169-176`): removed unreachable `Path` branch.
- [x] **L2 — `replayed` `setWrites` branch** *(intentional — verified against `packages/remote/test/replay.mutations.ts:17-20`, which mutates `setWrites` to verify `replay.ts` reads `metakit`'s `setWrites` rather than hardcoding)*.
- [x] **L3 — Doc-claim mismatch on `EntityWriter.checksTargets`** (`packages/remote-server/src/index.ts:544-548` vs `packages/remote-drizzle/src/index.ts:1640`): doc now says `answering Invalid` matching `remote-drizzle` (`RemoteServer.invalid`).
- [x] **L4 — Sync docs understate which pairs `convergence` lists** (`ba5902969`) (`packages/sync/README.md`, `skills/foldkit-plus/references/sync.md`): updated to read/write overlap.
- [x] **L5 — `convergence` does not validate unknown or duplicate `tags`** (`ba5902969`) (`packages/sync/src/convergence.ts:63-86`): deduplicates `tags` and throws explicitly on unknown tags + test in `packages/sync/test/convergenceRead.test.ts`.
- [x] **L6 — `overlaps` in `temporal.ts` does not handle `*` wildcard segments** (`656c4a32e`) (`packages/metakit/src/temporal.ts:124-126`): delegates to `Path.meets`.

---

## Verified Clean

- `0e8faee9c` hidden-row isolation (`entities: []` when `writer.read` returns `None`, `readablePatches` drops unreadable rows), `fieldsAtRevision` reset on advancing write answers, and SQLite/Postgres `revisionTrigger` double-bump guards.
- `235d804f3` (`pairs.ts` unsampled-walk check, `convergence.ts` `Held`-gated `order-matters`).
- `397ff9101` & `4761c746b` (`pairCheck.ts` insert widening, `abstract/lists.ts`, `abstract/mulScaled.ts`, `abstract/zone.ts`, `ops/arr.ts` canonicalization, `ops/judge.ts`, `transitionCommutes.ts` `+0`/`-0`).
- Working tree `metakit/store.ts` `Judged = 'constraint'` and `GuardServer.writer` `checksTargets`/`foreignKey` forwarding.
