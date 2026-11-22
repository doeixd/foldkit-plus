# Adversarial Review: Phase 1 Completion & Phase 5 (`b7b7e3358..6dab5aff3`)

Independent adversarial soundness, security, and concurrency review of the Phase 1 completion (`foldkit-entity` on metakit, `foldkit-guard`, `num.mulScaled`, lean judge, `any`/`every`, literal sets, next-double narrowing) and Phase 5 (store capabilities, `Transition.commutes`, `metakit/pairs`, obligations registry, `replayOver` / `settleReplayed`).

## Critical

- [ ] **C1 — Security bypass in `GuardServer.writer`: `decideUpdate` discards post-update cross-row guard (`leaving`)**
  - **File:** `packages/guard/src/server.ts:856-904`
  - **Counterexample:** `Update: [isDraft, projectIsOpen]`. Row starts `status: 'draft'` on closed project (`open: false`); attacker updates `status: 'published'`. `before` folds to `Always` (`requires = None`); `after` needs `Row(projectIsOpen)` (`leaving = Some(...)`); `project` didn't change so check passes, and line 903 returns `requires` (`None`) alone.
  - **Fix:** Return conjunction of `requires` and `leaving` (`RowRequirement.All` when both are `Some`).

- [ ] **C2 — `settleReplayed` wipes `kept` for all other pending requests on the same field**
  - **File:** `packages/remote/src/replay.ts:215-225`
  - **Counterexample:** `reqA` (`set 'C'`) and `reqB` (`set 'B'`) pending; live patch `'C'` records both in `kept[title].by`. `reqA` settles (`'C' === 'C'`, no reread) and deletes `title` from `kept`. Late `reqB` answer `'B'` finds no `kept` entry, schedules no reread, and permanently overwrites `store.title` with stale `'B'`.
  - **Fix:** Remove only `requestId` (and non-pending IDs) from `field.by`; delete the field from `kept` only when `by.size === 0`.

- [ ] **C3 — `RemoteServer.write` never checks `row-atomic` against `writer.store`**
  - **File:** `packages/remote-server/src/index.ts:2666-2690`
  - **Counterexample:** Single-row `when`, `invariants`, `ensures`, `increments`, or `assignments` emit no `row-atomic` requirement, allowing registration on `eventual` or read-first D1/`read-committed` stores that `metakit/store` denies.
  - **Fix:** Emit `{ needs: 'row-atomic', judged: writer.judgesInStatement === true ? 'in-statement' : 'read-first' }` whenever a write has single-row rules or computed updates.

## High

- [ ] **H1 — `pairCheck` assumes unwritten fields of an `Insert` satisfy `stateSchema`**
  - **File:** `packages/entity/src/pairCheck.ts:76-89`
  - **Counterexample:** `Account` has `balance: Schema.Int >= 0` with invariant `after.balance >= 0`; `CreateAccount` (`Insert`) omits `balance`. `afterWrites` leaves `next.row.balance` as `state.row.balance` (bounded `>= 0`), falsely proving `Kept`.
  - **Fix:** Widen unwritten fields of an `Insert` to `Schema.Null` in `stateSchemaOf`.

- [ ] **H2 — `lists.ts:refusesNothing` admits `NaN` for `eq.equals` and numbers for `bool.*`**
  - **File:** `packages/metakit/src/abstract/lists.ts:79-108`
  - **Counterexample:** `Arr.count(Arr.keep(items, each => Eq.equals(each, 0)))` over `Schema.Array(Schema.Number)` is proved `True` (`<= Arr.count(items)`), while `[NaN]` returns `Refusal('non-finite')`.
  - **Fix:** Require finite numbers for `eq.equals` and booleans for `bool.and`/`bool.or`/`bool.not`.

- [ ] **H3 — `MulScaled.unrefused` does not check that operands lie in `SAFE`**
  - **File:** `packages/metakit/src/abstract/mulScaled.ts:50-59`
  - **Counterexample:** `Num.mulScaled(0, 2**53, { shift: 0 })` has product `[0, 0] ⊆ SAFE`, so `Abstract.checkInvariant` proves `True`, while `ops/mulScaled.ts:73` refuses `2**53`.
  - **Fix:** Require `Interval.within(args[0]!, SAFE) && Interval.within(args[1]!, SAFE)` in `MulScaled.unrefused`.

- [ ] **H4 — `Transition.commutes` returns `True` for `include` + `exclude` on unsorted arrays**
  - **File:** `packages/metakit/src/transitionCommutes.ts:288-289`, `packages/metakit/src/ops/ways.ts:108-109`
  - **Counterexample:** `{ tags: ['c', 'a'] }` with `include('b')` and `exclude('c')` produces `['b', 'a']` vs `['a', 'b']`.
  - **Fix:** Gate `include`/`exclude` commutativity on sorted arrays or maintain sorted order in `setOp`.

- [ ] **H5 — `GuardServer.writer` single-row `Update`/`Delete` TOCTOU**
  - **File:** `packages/guard/src/server.ts:455-505, 926-939`
  - **Counterexample:** Single-row `Update`/`Delete` guards evaluated read-first in memory while forwarding `judgesInStatement: true` and emitting no `row-atomic` requirement when `revision` and `expect` are absent.
  - **Fix:** Emit `{ needs: 'row-atomic', judged: 'read-first' }` in `needs` when `revision === undefined` and the entity has single-row `Update`/`Delete` guards (or require `revision` / SQL check).

- [ ] **H6 — `remote-drizzle` `writer.insert` declares `judgesInStatement: true` but checks invariants in memory**
  - **File:** `packages/remote-drizzle/src/index.ts:2269, 2519-2586`, `packages/remote-server/src/index.ts:2666-2689`
  - **Fix:** Apply `judged: 'in-statement'` in `RemoteServer.write` only to `Update`/`Delete` (or compile `Insert` invariants into SQL).

- [ ] **H7 — `replayOver` drops updates from a second read while pending & `unexpired` expires pending `kept` entries**
  - **File:** `packages/remote/src/replay.ts:48-58, 95-105, 194`
  - **Counterexample:** Read 1 returns `11`, Read 2 returns `15` while `reqA` (`add +1`) is pending — `was.by.has('reqA')` skips updating `kept`, keeping UI at `12` instead of `16`. And `unexpired` drops `kept` at 60s even while `reqA` is still in `pending`.
  - **Fix:** Update existing pending entries in `by` on subsequent reads (`from === 'read'`); never expire `kept` entries that still have IDs in `pending`.

## Medium & Low

- [ ] **M1 — `Temporal.registry.report()` ignores later `Broken` walks** (`packages/metakit/src/temporal.ts:482-487`): require `walks.length > 0 && walks.every(closes)`.
- [ ] **M2 — Vacuous walks & `registry.decide` overwrite** (`packages/metakit/src/temporal.ts:312-342, 561-578`, `packages/metakit/src/pairs.ts:273-301`): reject `runs <= 0`, fail `walkPair` if 0 samples drawn, never overwrite a `refuted` decision.
- [ ] **M3 — `rightAfter` uses `Number.isInteger` instead of `Number.isSafeInteger`** (`packages/remote/src/replay.ts:165-173`): check `Number.isSafeInteger(held.revision) && held.revision < Number.MAX_SAFE_INTEGER`.
- [ ] **M4 — `replayed` inspects only the last patch in a layer** (`packages/remote/src/replay.ts:137-155`): fold all patches for `(key, field)` in order.
- [ ] **M5 — `zone.ts` `addUp` returns `-Infinity` on `-1e308 + -1e308`** (`packages/metakit/src/abstract/zone.ts:24-29`): return `-Number.MAX_VALUE`.
- [ ] **L1 — `ops/kind.ts` `eq.in`/`eq.among` `cannotRefuse` assumes array second arg** (`packages/metakit/src/ops/kind.ts:229-239`).
- [ ] **L2 — `ops/judge.ts` `Lit`/`Opaque` do not normalize `undefined -> null`** (`packages/metakit/src/ops/judge.ts:157, 221`).
- [ ] **L3 — `MutationFailed` retains dead `requestId` keys in `kept` until `pending` drains** (`packages/remote/src/model.ts:2331`).
- [ ] **L4 — `Transition.commutes` `same-literal` treats `+0` and `-0` as equal** (`packages/metakit/src/transitionCommutes.ts:286-287`).
