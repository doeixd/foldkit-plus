# Deep Adversarial Review — Pass 3 (`packages/remote` internals, `packages/durable`, `packages/remote-drizzle`, `packages/remote-server`, `packages/metakit/src/store.ts`)

Independent third-pass adversarial review of:
1. `packages/remote/src/{ledger,model,liveEvents,optimistic,store}.ts` and fixes `2e0563dfc`, `656c4a32e`, `ba5902969`, `eadee3370`.
2. Latest changes in `packages/durable/src/journal.ts`, `packages/sync/src/journal.ts`, `packages/remote-drizzle/src/*`, `packages/remote-server/src/index.ts`, and `packages/metakit/src/store.ts`.

---

## Critical

- [x] **C1 — Partial-delete / partial-clear data corruption & unlocked child/intermediate rows in `withCascade` on read-committed Postgres** (`9bf8c0510`, `3315deff5`)
  - **Files:** `packages/remote-drizzle/src/index.ts:1793-1875`, `packages/remote-server/src/index.ts:2707-2730`
  - **Fix (part 1, `9bf8c0510`):** Throw a `rolledBack` sentinel inside `database.transaction` (both Postgres async and SQLite sync) whenever the final root `DELETE` returns 0 rows (`deleted === false`), rolling back all prior child `clearing` `UPDATE`s and `steps` `DELETE`s.
  - **Fix (part 2, `3315deff5`):** On Postgres, lock the root row `FOR UPDATE`, then lock all cascade steps top-down (`[...steps].reverse()`, with a fixpoint loop for self-cascades) and all cleared child tables' matching rows `FOR UPDATE` before running `statements(tx)`, blocking both concurrent new links to intermediate parents (via FK `FOR KEY SHARE`) and concurrent updates to non-FK columns checked by `cascading`, `clearing`, or `clearBreaks`. In `RemoteServer.write`, also require `parent-serialized` (not `constraint`) when a cleared child Entity has a cross-row invariant (`reaches.length > 0`). Verified with 129/129 tests in `cascade`, `restrict`, `setNull`, and `store` (+ 29/29 in `guard/{cascade,setNull}`).

- [x] **C2 — Split non-atomic reads in `materialize` on D1 corrupt snapshots and can falsely reject valid operations** (`1b401baa4`)
  - **Files:** `packages/durable/src/journal.ts:974-1015`
  - **Fix:** Guard the snapshot `SELECT` with `WHERE key = ${key} AND snapshot_cursor = ${snapshotCursor}`; if a concurrent compaction moved `snapshot_cursor` between round trips, re-read `(cursor, snapshot_cursor, snapshot, last, epoch)` in a single atomic `SELECT`. Verified with 15/15 D1 tests.

---

## High

- [x] **H1 — `reconcileMutation` drops strictly newer revisions after an intervening partial write on another field** (`770e2ff59`)
  - **Files:** `packages/remote/src/ledger.ts:281-294`
  - **Fix:** Accept `entity.revision > held.revision` unconditionally (gating only `entity.revision < held.revision` on `held.revisionFields?.has(field)`) + regression test in `packages/remote/test/replay.test.ts`.

- [x] **H2 — `MutationSucceeded` passes raw, unfiltered `message.entities` to `awaitEchoes` and `settleReplayed`, even when `reconcileMutation` dropped stale fields** (`770e2ff59`)
  - **Files:** `packages/remote/src/ledger.ts`, `packages/remote/src/optimistic.ts`, `packages/remote/src/capability.ts`, `packages/remote/src/model.ts:2220-2255`, `packages/remote/src/replay.ts`
  - **Fix:** Return `applied` from `reconcileMutation` / `settleSuccess`; pass `applied` to `awaitEchoes` and to `settleReplayed`'s rebase step while preserving `answered` for disagreement checks + regression test in `packages/remote/test/replay.test.ts`.

- [x] **H3 — `heardBack` marks the entire row as `heard` on a stream as soon as any single awaited field matches** (`770e2ff59`)
  - **Files:** `packages/remote/src/liveEvents.ts:93-118`
  - **Fix:** Track `heard` per `(stream, field)` via `${stream}\u0000${field}` (backward-compatible with bare `stream`) + regression test in `packages/remote/test/replay.test.ts`.

- [x] **H4 — Non-atomic `INSERT INTO operations` + `UPDATE documents` on D1 permanently bricks a document on crash/timeout** (`1b401baa4`)
  - **Files:** `packages/durable/src/journal.ts:1484-1505`
  - **Fix:** Self-heal `documents.cursor` to `MAX(operations.sequence)` on D1 constraint violations before retrying in `commitDurably`. Verified with 15/15 D1 tests.

- [x] **H5 — `insertedWhile` emits explicit `NULL` for Postgres `serial` / `generatedByDefaultAsIdentity` columns** (`9bf8c0510`)
  - **Files:** `packages/remote-drizzle/src/index.ts:1619-1625`
  - **Fix:** Emit `nextval(pg_get_serial_sequence(tableName, column.name))` for Postgres `hasDefault` columns with no JS default/defaultFn/onUpdateFn instead of `null`.

---

## Medium

- [x] **M1 — `applyEntityEvent` calls `writeEntities` and `clearFloors` when `heardBack` strips all fields (`written = {}`)** (`770e2ff59`)
  - **Files:** `packages/remote/src/liveEvents.ts:184-205`
  - **Fix:** Skip `writeEntities` and `clearFloors` when `Object.keys(written).length === 0`.

- [x] **M2 — `visibleStore` resurrects a tombstoned row when a pending relative patch resolves to `{}`** (`770e2ff59`)
  - **Files:** `packages/remote/src/optimistic.ts:230-241`
  - **Fix:** Filter out resolved patches with `Object.keys(patch.values).length === 0` before calling `writeEntities` + regression test in `packages/remote/test/replay.test.ts`.

- [ ] **M3 — Target-existence oracle on hidden rows in `targetsOf` / `refuseGone`** (`packages/remote-drizzle/src/index.ts:1584-1648`)
  - **Note:** Structural design decision — `targetsOf` checks FK existence against `target.table` (matching Postgres FK constraint semantics, which also checks existence regardless of row visibility); callers guarding private targets attach a `Link` rule checking the target's Read rule.

- [x] **M4 — `onDeleteOf` does not verify the foreign key's target table or column** (`9bf8c0510`)
  - **Files:** `packages/remote-drizzle/src/bind.ts:258-286, 520-536`
  - **Fix:** Verify `foreignTable` name and `foreignColumns[0].name` against the relation target's table and id column before adding to `keyed`.

---

## Low & De-slop

- [ ] **L1 — `superseded` strips `adds` from an earlier layer, preventing `settleReplayed` from recognizing a later-executed replay** (`packages/remote/src/optimistic.ts:459-505`): conservative (only causes a safe extra reread when `r1` executes after `r2` and `r2` answers first).
- [x] **L2 — `packages/remote-server/src/index.ts:2733` `pnpm tags:check` failure** *(already resolved by the other session using `Match.tagsExhaustive`)*.
- [x] **L3 — `packages/durable/README.md:429` omitted `isolates` from `StoreCapabilities` field list** (`1b401baa4`).

---

## Verified Clean
- `2e0563dfc` `reconcileMutation` vs `newer(key)` tombstone protection, `replay.ts` `earlier -> included`, `656c4a32e` (`metakit` `insert` `andOp` & `idempotent` & `commutes`), `ba5902969` (`sync`), `eadee3370` (`guard/src/server.ts`).
- `Judged = 'constraint'` on SQLite/D1 (`remote-drizzle`'s `foreignKey` explicitly returns `false` for `SQLiteTable`), `null` links in `targetsOf`, and `metakit/src/store.ts` `gives()` / `StoreRefused`.
