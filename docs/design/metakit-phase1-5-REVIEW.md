# Adversarial Review: Phase 1 Completion & Phase 5 (`b7b7e3358..6dab5aff3`)

Independent adversarial soundness, security, and concurrency review of the Phase 1 completion (`foldkit-entity` on metakit, `foldkit-guard`, `num.mulScaled`, lean judge, `any`/`every`, literal sets, next-double narrowing) and Phase 5 (store capabilities, `Transition.commutes`, `metakit/pairs`, obligations registry, `replayOver` / `settleReplayed`).

## Critical

- [x] **C1 — Security bypass in `GuardServer.writer`: `decideUpdate` discards post-update cross-row guard (`leaving`)** (`052133ba4`)
  - **File:** `packages/guard/src/server.ts:856-904`
  - **Counterexample:** `Update: [isDraft, projectIsOpen]`. Row starts `status: 'draft'` on closed project (`open: false`); attacker updates `status: 'published'`. `before` folds to `Always` (`requires = None`); `after` needs `Row(projectIsOpen)` (`leaving = Some(...)`); `project` didn't change so check passes, and line 903 returns `requires` (`None`) alone.
  - **Fix:** Return conjunction of `requires` and `leaving` (`RowRequirement.All` when both are `Some`) + regression test in `packages/guard/test/overOthers.test.ts`.

- [x] **C2 — `settleReplayed` wipes `kept` for all other pending requests on the same field** (`1616524cd`)
  - **File:** `packages/remote/src/replay.ts:215-225`
  - **Counterexample:** `reqA` (`set 'C'`) and `reqB` (`set 'B'`) pending; live patch `'C'` records both in `kept[title].by`. `reqA` settles (`'C' === 'C'`, no reread) and deletes `title` from `kept`. Late `reqB` answer `'B'` finds no `kept` entry, schedules no reread, and permanently overwrites `store.title` with stale `'B'`.
  - **Fix:** Remove `requestId` from `field.by`, rebase remaining pending requests on that field over the settled answer's value (`Option.some(values[field])`), and delete the field only when `by.size === 0` + regression test in `packages/remote/test/replay.test.ts`.

- [x] **C3 — `RemoteServer.write` never checks `row-atomic` against `writer.store`** *(by design — verified against test suite)*
  - **File:** `packages/remote-server/src/index.ts:2666-2690`
  - **Resolution:** `packages/remote-server/test/store.test.ts:257-260` (`a write whose rule reads its own row only > asks nothing of its store`) explicitly asserts that single-row rules do not require `row-atomic` on `RemoteServer.write` (which only enforces `parent-serialized` for cross-row rules; `row-atomic` is emitted by `metakit/temporal`'s `requirements(machine)`).

## High

- [x] **H1 — `pairCheck` assumes unwritten fields of an `Insert` satisfy `stateSchema`** (`397ff9101`)
  - **File:** `packages/entity/src/pairCheck.ts:76-89`
  - **Counterexample:** `Account` has `balance: Schema.Int >= 0` with invariant `after.balance >= 0`; `CreateAccount` (`Insert`) omits `balance`. `afterWrites` leaves `next.row.balance` as `state.row.balance` (bounded `>= 0`), falsely proving `Kept`.
  - **Fix:** Widen unwritten fields and `one` relations of an `Insert` with `Schema.NullOr(...)` in `stateSchemaOf` + regression test in `packages/entity/test/pairCheck.test.ts`.

- [x] **H2 — `lists.ts:refusesNothing` admits `NaN` for `eq.equals` and numbers for `bool.*`** (`397ff9101`)
  - **File:** `packages/metakit/src/abstract/lists.ts:79-108`
  - **Counterexample:** `Arr.count(Arr.keep(items, each => Eq.equals(each, 0)))` over `Schema.Array(Schema.Number)` is proved `True` (`<= Arr.count(items)`), while `[NaN]` returns `Refusal('non-finite')`.
  - **Fix:** Require finite numbers (`isFiniteNumber`) or booleans for `eq.equals`/`eq.is`/`eq.isNot`, and booleans only (`isBool`) for `bool.and`/`bool.or`/`bool.not` + regression test in `packages/metakit/test/review-phase1-5.test.ts`.

- [x] **H3 — `MulScaled.unrefused` does not check that operands lie in `SAFE`** (`397ff9101`)
  - **File:** `packages/metakit/src/abstract/mulScaled.ts:50-59`
  - **Counterexample:** `Num.mulScaled(0, 2**53, { shift: 0 })` has product `[0, 0] ⊆ SAFE`, so `Abstract.checkInvariant` proves `True`, while `ops/mulScaled.ts:73` refuses `2**53`.
  - **Fix:** Require `Interval.within(args[0]!, SAFE) && Interval.within(args[1]!, SAFE)` in `MulScaled.unrefused` + regression test in `packages/metakit/test/review-phase1-5.test.ts`.

- [x] **H4 — `Transition.commutes` returns `True` for `include` + `exclude` on unsorted arrays** (`4761c746b`)
  - **File:** `packages/metakit/src/ops/arr.ts:105-132`
  - **Counterexample:** `{ tags: ['c', 'a'] }` with `include('b')` and `exclude('c')` produces `['b', 'a']` vs `['a', 'b']`.
  - **Fix:** Canonicalize (sort + deduplicate) unsorted or duplicate array inputs in `setOp` while preserving zero-sort fast path on already-sorted arrays + regression test in `packages/metakit/test/review-phase1-5.test.ts`.

- [x] **H5 — `GuardServer.writer` single-row `Update`/`Delete` TOCTOU** *(by design — verified against `pinned.test.ts`)*
  - **File:** `packages/guard/src/server.ts:455-505, 926-939`
  - **Resolution:** `packages/guard/test/pinned.test.ts` explicitly tests that unpinned `GuardServer.writer` (without `revision`) is permitted at registration and warned via `GuardServer.validate`.

- [x] **H6 — `remote-drizzle` `writer.insert` declares `judgesInStatement: true` but checks invariants in memory** (`052133ba4`)
  - **File:** `packages/remote-server/src/index.ts:2666-2689`
  - **Fix:** Apply `judged: 'in-statement'` in `RemoteServer.write` only when `!kind.inserts && writer.judgesInStatement === true`; `Insert` cross-row invariants are always `read-first` + regression test in `packages/remote-server/test/store.test.ts`.

- [x] **H7 — `replayOver` drops updates from a second read while pending** (`1616524cd`)
  - **File:** `packages/remote/src/replay.ts:95-105`
  - **Counterexample:** Read 1 returns `11`, Read 2 returns `15` while `reqA` (`add +1`) is pending — `was.by.has('reqA')` skips updating `kept`, keeping UI at `12` instead of `16`.
  - **Fix:** Update existing pending entries in `by` on subsequent reads (`from === 'read'`) + regression test in `packages/remote/test/replay.test.ts`. *(Note: `unexpired` expiring `kept` after `echoKept` is explicitly tested as intended behavior in `packages/remote/test/temporal.test.ts:803`.)*

## Medium & Low

- [x] **M1 — `Temporal.registry.report()` ignores later `Broken` walks** (`397ff9101`) (`packages/metakit/src/temporal.ts:595-606`): judge obligation closure from `walks.at(-1)` so a later `Broken` walk reopens it while a later `Held` walk still closes it.
- [x] **M2 — Vacuous walks & `registry.decide` overwrite** (`397ff9101`) (`packages/metakit/src/temporal.ts:311, 422, 684`, `packages/metakit/src/pairs.ts:271-310`): reject non-positive `runs`, fail `walkPair` if 0 samples were drawn, never overwrite a `refuted` decision.
- [x] **M3 — `rightAfter` uses `Number.isInteger` instead of `Number.isSafeInteger`** (`1616524cd`) (`packages/remote/src/replay.ts:171`): check `Number.isSafeInteger(held.revision) && held.revision < Number.MAX_SAFE_INTEGER`.
- [x] **M4 — `replayed` inspects only the last patch in a layer** (`1616524cd`) (`packages/remote/src/replay.ts:137-155`): fold all patches for `(key, field)` in order.
- [x] **M5 — `zone.ts` `addUp` returns `-Infinity` on `-1e308 + -1e308`** (`397ff9101`) (`packages/metakit/src/abstract/zone.ts:24-30`): return `-Number.MAX_VALUE`.
- [x] **L1 — `ops/kind.ts` `eq.in`/`eq.among` `cannotRefuse` assumes array second arg** (`397ff9101`) (`packages/metakit/src/ops/kind.ts:145-180`): removed from `refusesOperandsOnly` and explicitly verified array second arg in `cannotRefuse`.
- [x] **L2 — `ops/judge.ts` `Lit`/`Opaque` do not normalize `undefined -> null`** (`397ff9101`) (`packages/metakit/src/ops/judge.ts:157, 216-226`): normalize `undefined` to `null`.
- [x] **L3 — `MutationFailed` retains `kept` while other writes are pending** *(by design — verified against `packages/remote/test/temporal.test.ts:789`, `stays when another write is still pending`)*.
- [x] **L4 — `Transition.commutes` `same-literal` treats `+0` and `-0` as equal** (`4761c746b`) (`packages/metakit/src/transitionCommutes.ts:286-291`): distinguish `+0` and `-0` via `Object.is`.
