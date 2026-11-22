# Deep Adversarial Review & External Verification (`e6cf9aa0b..c645f76b7` + working tree)

Independent deep review using `AGENTS.md` review guidance, two parallel adversarial audits, and **external formal model checking via TLC2 v2.19** (`ReplayProtocol.tla`).

Scope:
- `Transition.idempotent` (`e6cf9aa0b`), `foldkit-sync` convergence (`ae728b5e6`, `235d804f3`)
- `foldkit-remote` replay & settlement (`1616524cd`, `bad8758c4`)
- Revision-carrying write answers (`0e8faee9c`)
- `GuardServer.writer` (`052133ba4`), `metakit` / `entity` fixes (`397ff9101`, `4761c746b`), and uncommitted working-tree changes in `store.ts`, `guard/src/server.ts`, `remote-server/src/index.ts`.

---

## Critical

- [ ] **C1 — Permanent silent client/server divergence on out-of-order execution with revisions (TLC2-verified)**
  - **Files:** `packages/remote/src/ledger.ts:272-290`, `packages/remote/src/replay.ts:217-223`, `packages/remote/src/model.ts:2234-2246`
  - **External verification (TLC2 v2.19, `ReplayProtocol.tla`, 17,098 states, depth 9 counterexample):**
    1. Initial state: `srvVal = 0, rev = 1`, `cliVal = 0, rev = 1`.
    2. Client sends `r1` (seq 1: `add +1`) and `r2` (seq 2: `set 2`) concurrently.
    3. Server executes `r2` first (`srvVal = 2, rev = 2`), then `r1` (`srvVal = 3, rev = 3`).
    4. Live patch `[val = 2, rev = 2]` arrives (`cliVal = 2, cliRev = 2`, `keptBy = {r1, r2}`).
    5. `r2`'s HTTP answer (`val = 2, rev = 2`) arrives first -> `settledLater` marks seq 2 as settled.
    6. `r1`'s HTTP answer (`val = 3, rev = 3`) arrives second:
       - `reconcileMutation` (`ledger.ts:272-280`) drops `r1`'s write purely on client send order (`seq 1 < seq 2`) without checking `entity.revision (3) > store[key].revision (2)`, leaving `cliVal = 2, cliRev = 2`.
       - `settleReplayed` (`replay.ts:217-223`) sees `rightAfter(2, 3)` is `true` and `replayed(add +1, 2) === 3` is `true`, so it schedules **no reread** (`again: []`).
       - Live patch `[val = 3, rev = 3]` matches `echoVal = 3` and is consumed as an echo.
    7. Quiescence: `pending = {}`, `reread = false`, `srvVal = 3`, `cliVal = 2` — **permanent silent divergence**.
  - **Fix:** In `reconcileMutation`, when both `entity.revision` and `store[key]?.revision` are present (and `revisionFields` covers the field), order by server revision (`entity.revision > store[key].revision` is newer; `entity.revision < store[key].revision` is superseded) rather than client send order alone.
  - **TLC2 proof of fix:** With revision-aware superseding in `ReplayProtocol.tla`, TLC2 v2.19 exhaustively checked **30,322 states (11,086 distinct states, depth 14)** with **0 errors**.

---

## High

- [ ] **H1 — Authorization bypass in `GuardServer.writer` `decideUpdate` (`leaving`) via hidden link targets**
  - **Files:** `packages/guard/src/server.ts:842-851, 869-883`
  - **Cause:** `before` comes from `readBefore`, which masks any `one` relation pointing at a row the caller may not read to `null`. Although `decideUpdate` already fetched unmasked link values into `stored` / `was` (lines 842–851), line 880 checks `read.some(key => !sameStored(before[key], after[key]))` against masked `before`.
  - **Counterexample:** `Task` has optional `project: Relation.one(Project)` with Update rule `project.open === true`; `Project` has Read rule `ownerId === viewer.id`. DB holds `Project:p1` (`ownerId: 'alice', open: true`) and `Task:t1` (`project: 'p1'`). Bob (can read `t1`, cannot read `p1`) updates `t1` with `links: { project: Option.none() }`. Masked `before.project` is `null`, `after.project` is `null`, so `sameStored(null, null)` passes; SQL `UPDATE ... WHERE EXISTS (... p1.open = true)` evaluates against stored `p1` (open) and **succeeds**, leaving `t1.project = NULL` in violation of the Update rule.
  - **Fix:** For keys in `read` that are `one` relations, compare against the unmasked `was` / `stored` link value (or fail closed when `exact === false` and `key` is being modified/unlinked while `before[key] === null`).

- [ ] **H2 — `Transition.idempotent` is unsound for `patch` and `patchWhere` (`sets-unread` ignores `key`/`test` reads and refusals)**
  - **Files:** `packages/metakit/src/transitionCommutes.ts:410-417`, `packages/metakit/src/ops/ways.ts:62-72, 104-112`
  - **Cause:** `sets-unread` only checks `touches(setValues(write).flatMap(fieldsRead), fieldsSet(write))`, never checking whether `key` or `test` reads a field modified by `set` or whether `key`/`test` can refuse on the written value.
  - **Counterexamples (all return `Verdict.True()`):**
    1. `Transition.patchWhere(state.list, each => Ord.gt(Num.add(each.n, 1), 0), () => ({ n: Number.MAX_SAFE_INTEGER }))` over `Schema.Int`: Run 1 on `{ n: 5 }` succeeds with `{ n: 9007199254740991 }`; Run 2 refuses (`unsafe-integer`).
    2. `Transition.patch(state.list, 'a', () => ({ id: input.next }))` with `input.next = '\0'`: Run 1 succeeds with `{ id: '\0' }`; Run 2 refuses `Eq.is('\0', 'a')` (`unportable`).
    3. `Transition.patchWhere(state.list, each => Eq.is(each.tag, 'a'), () => ({ tag: input.next }))` with `input.next = '\0'`: Run 1 succeeds; Run 2 refuses.
  - **Fix:** For `sets-unread`, require both `!touches(setValues(write).flatMap(fieldsRead), fieldsSet(write))` AND `(!touches(elementFieldsRead(write), fieldsSet(write)) || steady(write))`.

- [ ] **H3 — `Transition.idempotent` is unsound for `insert` (`idempotent: 'always'` fails on NUL key over empty list)**
  - **Files:** `packages/metakit/src/ops/ways.ts:121`, `packages/metakit/src/transitionLists.ts:157-179`, `packages/metakit/src/transitionCommutes.ts:404-418`
  - **Cause:** `insert` lowers to `If(rowsOver('any', list, { where: Eq.is(each[key], element[key]) }), list, append(list, element))`. On `list = []`, `any` runs 0 iterations and never checks `Eq.is`, appending `{ id: '\0' }`. On Run 2, `Eq.is('\0', '\0')` evaluates and refuses (`unportable`).
  - **Counterexample:** `Transition.insert(state.list, { id: input.id, title: 'x' })` (`id: Schema.String`) on `state = { list: [] }`, `input = { id: '\0' }`: Run 1 succeeds, Run 2 fails with `Refused`, yet `Transition.idempotent` returns `Verdict.True()`.
  - **Fix:** Gate `insert`'s idempotence on `cannotRefuse` for the key expression and element key field (or refuse NUL keys before appending in `insert`).

- [ ] **H4 — `foldkit-sync` `convergence` classifies non-commuting idempotent Messages as `copy: 'harmless'` ("needs no removal of the copy")**
  - **Files:** `packages/sync/src/convergence.ts:10-13, 38-43, 73-85`, `packages/sync/README.md:826-829`, `skills/foldkit-plus/references/sync.md:374-375`, `examples/todo-app/test/sync.convergence.ts:315-362`
  - **Cause:** `Transition.idempotent` only proves immediate consecutive repetition `t(t(s)) = t(s)`. Calling `copy: 'harmless'` ("needs no removal of the copy") for non-commuting durable Messages is false under interleaved redelivery.
  - **Counterexample (in `examples/todo-app`):** `SubmittedTodo` (`insert`), `RenamedList` (`set`), `RenamedTodo` (`patch`), `DeletedTodo` (`remove`) are all marked `copy: 'harmless'`. If Replica A commits `SubmittedTodo('n1')` and Replica B commits `DeletedTodo('n1')`, redelivering `SubmittedTodo('n1')` without id-deduplication **resurrects** `'n1'`. Similarly, redelivering `RenamedList('A')` after `RenamedList('B')` overwrites `'B'` back to `'A'`.
  - **Fix:** Require `t` to also commute with every durable Message (including itself) before declaring `'harmless'` without id-removal, or explicitly scope `'harmless'` in both API/docs to *back-to-back* redelivery (keeping id-deduplication mandatory for interleaved redelivery).

- [ ] **H5 — Stale reads rejected by `olderThanHeld` still pollute `kept` and `included` (`bad8758c4`)**
  - **Files:** `packages/remote/src/layers.ts:249-257`, `packages/remote/src/replay.ts:76-118`, `packages/remote/src/model.ts:1966, 2466`
  - **Cause:** `writeEntities` ignores rows where `olderThanHeld(held, write.revision)` is true, but `keepsRead` / `replayOver` does not check `olderThanHeld(under, row.revision)`.
  - **Counterexample:** `store[Post:1]` holds `{ likes: 11, revision: 2 }`. Client sends `req1` (`+1`), showing `12`. Stale read `{ likes: 10, revision: 1 }` arrives: `writeEntities` rejects it (`store` stays `11` at rev 2), but `replayOver` writes `kept[Post:1]['likes'] = { by: { req1: Some(10) }, included: {'req1'} }`. `unincluded` suppresses `req1`'s `+1`, dropping UI from `12` to `11` and triggering spurious rereads for pending `set`s.
  - **Fix:** Skip rows in `replayOver` where `olderThanHeld(under, row.revision)` is true.

- [ ] **H6 — Out-of-order settle after a live patch double-counts remaining pending writes (`1616524cd` + `bad8758c4`)**
  - **Files:** `packages/remote/src/replay.ts:242-253`, `packages/remote/src/optimistic.ts:344-366`
  - **Cause:** When `kept` was populated by a live patch (`included: undefined`), `req1` (`+1`) and `req2` (`+1`) both execute on the server (`10 -> 11 -> 12`). Live patch `11` (rev 2) arrives, then `req2`'s answer (`12`, rev 3) arrives before `req1`'s answer. `settleReplayed` rebases `req1` in `kept` to `Option.some(12)` with `included: undefined`. `resolvedPatches` then applies `req1` (`+1`) over `12` -> UI jumps to **`13`** (past the server's `12`) until `req1` settles.
  - **Fix:** When `requestId` settles with an answer that may already include an earlier pending request (i.e., `pendingId` was sent before `requestId` or has unknown server ordering relative to `requestId`), mark `pendingId` in `included` (just like `from === 'read'`) instead of rebasing it un-included over `values[field]`.

---

## Medium

- [ ] **M1 — `writer.revision` bypasses member Read rules and is not checked by `GuardServer.check` (`0e8faee9c`)**
  - **Files:** `packages/remote-server/src/index.ts:3021-3061, 3759-3764`, `packages/guard/src/server.ts:926, 1394-1413`
  - **Counterexample:** `Post` has `version` with Read rule `only(admin)`. `Drizzle.writer(PostBinding, { revision: 'version' })` wrapped in `GuardServer.writer(..., { revision: 'version' })` passes `GuardServer.check` for a mutation without `expect`. When a non-admin updates `likes`, `version` is stripped from `values` but leaked as `entities[0].revision`.
  - **Fix:** Check `writer.revision` (and `GuardServer.writer`'s `revision`) against `readRuled(attachment, ...)` in `GuardServer.check` (and/or omit `revision` from the answer when the revision field is denied by a Read rule for the principal).

- [ ] **M2 — `replayOver` ignores reads whose `revision` advanced when the field returned to the same value (ABA)**
  - **Files:** `packages/remote/src/replay.ts:92-97`
  - **Counterexample:** `store` has `{ likes: 10, revision: 1 }`; client sends `req1` (`+1`) to an unrevisioned writer. Server runs `req1` (`10 -> 11`, rev 2) then another user unlikes (`11 -> 10`, rev 3). Read `{ likes: 10, revision: 3 }` arrives: `Equal.equals(10, 10)` is `true`, so `replayOver` skips `likes` (`kept` stays empty). Unrevisioned answer `{ likes: 11 }` then overwrites `store` to `11` with `again: []` — permanently stuck at `11` while server holds `10`.
  - **Fix:** In `replayOver` (`from === 'read'`), also include fields when `row.revision !== undefined && under?.revision !== undefined && row.revision > under.revision`.

- [ ] **M3 — `checkWriteProperties` misses both `insert` and `patch`/`patchWhere` idempotence bugs**
  - **Files:** `packages/metakit/src/writeChecks.ts:92-105, 121-135`
  - **Fix:** Include NUL-bearing strings in sampled states and test `patch`/`patchWhere` writes that modify fields read by `key` or `test`.

- [ ] **M4 — `Temporal.walkAsync` lacks duplicate step-name validation**
  - **Files:** `packages/metakit/src/temporal.ts:358-382` (compare `walk` at `243-257`)
  - **Fix:** Validate unique `step.name`s and known `after` references upfront in `walkAsync` as `walk` does.

---

## Low & De-slop

- [ ] **L1 — Dead `Path` branch in `cannotRefuse` for `eq.in` / `eq.among`** (`packages/metakit/src/ops/kind.ts:170-176`): `cannotRefuse` on a `Path` calls `admitsNoRefusable`, which returns `false` for `SchemaAST.isArrays`, making the `Path` branch unreachable.
- [ ] **L2 — Dead branch in `replayed`** (`packages/remote/src/replay.ts:155-158`): `replays(setWrites, 'set')` is always `false` (`setWrites.commutes.set === 'same-literal'`).
- [ ] **L3 — Doc-claim mismatch on `EntityWriter.checksTargets`** (`packages/remote-server/src/index.ts:544-548` vs `packages/remote-drizzle/src/index.ts:1640`): doc says `answering Unmet`, whereas `remote-drizzle` returns `Invalid` (`RemoteServer.invalid`).
- [ ] **L4 — Sync docs understate which pairs `convergence` lists** (`packages/sync/README.md:822-823`, `skills/foldkit-plus/references/sync.md:372-373`): say *"when both Messages write one path"*, whereas `Pairs.pairs` lists any read/write or write/write overlap.
- [ ] **L5 — `convergence` does not validate unknown or duplicate `tags`** (`packages/sync/src/convergence.ts:63-86`): duplicate tags duplicate walks; unknown tags throw a raw `TypeError` inside `Transition.idempotent`.
- [ ] **L6 — `overlaps` in `temporal.ts` does not handle `*` wildcard segments** (`packages/metakit/src/temporal.ts:125-128`): use `Path.meets` instead of manual segment equality.

---

## Verified Clean

- `0e8faee9c` hidden-row isolation (`entities: []` when `writer.read` returns `None`, `readablePatches` drops unreadable rows), `fieldsAtRevision` reset on advancing write answers, and SQLite/Postgres `revisionTrigger` double-bump guards.
- `235d804f3` (`pairs.ts` unsampled-walk check, `convergence.ts` `Held`-gated `order-matters`).
- `397ff9101` & `4761c746b` (`pairCheck.ts` insert widening, `abstract/lists.ts`, `abstract/mulScaled.ts`, `abstract/zone.ts`, `ops/arr.ts` canonicalization, `ops/judge.ts`, `transitionCommutes.ts` `+0`/`-0`).
- Working tree `metakit/store.ts` `Judged = 'constraint'` and `GuardServer.writer` `checksTargets`/`foreignKey` forwarding.
