# Deep Adversarial Review — Pass 3 (`packages/remote` internals, `packages/durable`, `packages/remote-drizzle`, `packages/remote-server`, `packages/metakit/src/store.ts`)

Independent third-pass adversarial review of:
1. `packages/remote/src/{ledger,model,liveEvents,optimistic,store}.ts` and fixes `2e0563dfc`, `656c4a32e`, `ba5902969`, `eadee3370`.
2. Latest working-tree changes in `packages/durable/src/journal.ts`, `packages/sync/src/journal.ts`, `packages/remote-drizzle/src/*`, `packages/remote-server/src/index.ts`, and `packages/metakit/src/store.ts`.

---

## Critical

- [ ] **C1 — Partial-delete / partial-clear data corruption and bypassed child rules in `withCascade` on read-committed Postgres**
  - **Files:** `packages/remote-drizzle/src/index.ts:1655-1673, 1742-1810`, `packages/remote-server/src/index.ts:2725-2770`
  - **Cause (two-part):**
    1. In `withCascade`, `clearing` `UPDATE`s, `steps` `DELETE`s, and the root `DELETE` run sequentially inside `database.transaction(async tx => ...)`. When the final root `DELETE` returns 0 rows (`deleted === false` because `rootWhere` became false mid-transaction under `READ COMMITTED`), the callback returns normally and **commits** all earlier child `UPDATE`/`DELETE` statements while `delete()` returns `Forbidden` or `Referenced`.
    2. `writer.foreignKey` returns `true` for every Postgres FK in a cascade/clear tree, so `RemoteServer.write` marks them `judged: 'constraint'` on read-committed Postgres. Yet `withCascade:1800` only locks the root row (`FOR UPDATE`), not intermediate cascade parents or child rows whose non-FK columns are checked by `cascading` (`authorizedBy: 'child'`), `clearing` (`Update` rules), or `clearBreaks` (invariants).
  - **Counterexamples:**
    - `Topic` has `Comment.topic` (`cascade`) and `Note.topic` (`setNull`) with invariant `status === 'published' => topic !== null`. `DeleteTopic(t1)` locks `t1` `FOR UPDATE` and deletes `Comment c1`. Concurrently, `PublishNote(n1)` updates `n1.status = 'published'` (no FK lock on `t1`). `DeleteTopic`'s root `DELETE` sees `clearBreaks` fail, returns 0 rows, and **commits** — `c1` is permanently deleted while `t1` survives and `DeleteTopic` returns `Referenced`.
    - In 2-hop `Org <- Project <- Task`, `AddTask` inserting a locked task commits between `DELETE FROM tasks` and `DELETE FROM projects`, causing either partial commit of sibling `Member` deletes or silent Postgres `ON DELETE CASCADE` deletion omitted from `cascaded`.
  - **Fix:** Throw a rollback sentinel inside `database.transaction` whenever `deleted === false` so the transaction rolls back all prior child `UPDATE`/`DELETE`s; restrict `judged: 'constraint'` on read-committed Postgres to cases actually protected by the root lock (single-hop FK-only checks without mutable non-FK child predicates or multi-hop parents).

- [ ] **C2 — Split non-atomic reads in `materialize` on D1 corrupt snapshots and can falsely reject valid operations**
  - **Files:** `packages/durable/src/journal.ts:959-1011, 1293-1369, 1458-1466`, `packages/sync/src/journal.ts:84-100`
  - **Cause:** `materialize` reads `(cursor, snapshot_cursor, last, epoch)` in statement 1 (line 959) and `snapshot` in statement 2 (line 987). On D1 (`d1: true`), these run as separate round trips with no transaction or batch.
  - **Counterexample:** With `snapshotEvery = 5`, doc is at `cursor = 4, snapshot_cursor = 0, snapshot = S0`. Caller A reads `cursor = 4, snapshot_cursor = 0`. Concurrently, Writer B commits `seq = 5` updating `documents` to `cursor = 5, snapshot_cursor = 5, snapshot = S5`. Caller A then reads `snapshot = S5` and replays ops `1..4` on top of `S5`, producing corrupted state `S5 + op1..4` paired with `cursor = 4` (and on `append`, `validate`/`authorize`/`judge` can permanently reject a valid op with `OperationRejectedError`, which `commitDurably` does not retry).
  - **Fix:** Read `cursor, snapshot_cursor, last, epoch, snapshot` in a single `SELECT` (or `D1.batch` of the metadata+snapshot read and ops tail read).

---

## High

- [ ] **H1 — `reconcileMutation` drops strictly newer revisions after an intervening partial write on another field**
  - **Files:** `packages/remote/src/ledger.ts:284-292`
  - **Cause:** `if (entity.revision > held.revision) return true` is gated on `held.revisionFields?.has(field) === true`. In `store.ts:113-125` (`fieldsAtRevision`), any partial write at a higher revision resets `revisionFields` to only that write's fields.
  - **Counterexample:** Client sends `r1` (`title: 'A'`), `r2` (`title: 'B'`), `r3` (`likes: 11`). Server executes `r2` (rev 2), `r3` (rev 4), `r1` (rev 5). Answers arrive `r2`, `r3`, `r1`: after `r3`, `held.revision = 4, revisionFields = {'likes'}`. When `r1` arrives (`title: 'A', rev: 5`), `5 > 4` is true, but `revisionFields.has('title')` is `false`, so it falls through to `!newer('Post:p1\0title')` (`false`) and **silently drops** `r1` (rev 5). Client stays permanently stuck at `'B'`.
  - **Fix:** Allow `entity.revision > held.revision` unconditionally (a strictly higher row revision is newer than every revisioned field in `held`), gating only `entity.revision < held.revision` on `held.revisionFields?.has(field) === true`.

- [ ] **H2 — `MutationSucceeded` passes raw, unfiltered `message.entities` to `awaitEchoes` and `settleReplayed`, even when `reconcileMutation` dropped stale fields**
  - **Files:** `packages/remote/src/model.ts:2220-2252`, `packages/remote/src/ledger.ts:272-310`
  - **Counterexamples:**
    - *`awaitEchoes`:* `r2` (`title: 'B', rev 2`) settles first (`echoes` expects `'B'`). Stale `r1` (`title: 'A', rev 1`) settles second: `reconcileMutation` drops `'A'`, but `awaitEchoes` overwrites `echoes.values.title = 'A'`, causing `r2`'s live echo `'B'` to contradict and loop rereads.
    - *`settleReplayed`:* `r2` (`likes: 12, rev 3`) settles first; stale `r1` (`likes: 11, rev 2`) settles second and is dropped by `reconcileMutation`, yet `settleReplayed` receives `{ likes: 11, rev: 2 }`, rebasing `r3` downward from `12` to `11` and triggering a spurious reread.
  - **Fix:** Return the actually-applied writes from `reconcileMutation` / `settleSuccess` and pass only those applied entities to `awaitEchoes` and `settleReplayed`.

- [ ] **H3 — `heardBack` marks the entire row as `heard` on a stream as soon as any single awaited field matches**
  - **Files:** `packages/remote/src/liveEvents.ts:102-110`
  - **Counterexample:** Mutation 1 settles `{ title: 'New' }`; Mutation 2 settles `{ likes: 11 }`. `awaitEchoes` merges them into `echoes[key] = { values: { title: 'New', likes: 11 }, heard: [] }`. Stream delivers Mutation 1's echo `{ title: 'New' }` -> `heardBack` marks `stream` as `heard` for the whole row. Pre-Mutation-2 stale patch `{ likes: 10 }` then passes unchecked and **overwrites `likes: 11` with stale `10`**.
  - **Fix:** Track `heard` per `(field, stream)` (so matching `title` only clears `title` on `stream`, while `likes` remains awaited until `11` is heard on `stream`).

- [ ] **H4 — Non-atomic `INSERT INTO operations` + `UPDATE documents` on D1 permanently bricks a document on crash/timeout**
  - **Files:** `packages/durable/src/journal.ts:1375-1384, 1448-1467, 1551-1562`
  - **Counterexample:** On D1 (`d1: true`), Writer A inserts `(key, opA, sequence = 6)` into `operations` then crashes/times out before updating `documents.cursor` from `5` to `6`. Every subsequent `append` reads `cursor = 5`, computes `sequence = 6`, hits `UNIQUE (key, sequence)` for all 64 retries, and fails permanently with `JournalError`.
  - **Fix:** Execute `INSERT INTO operations` and `INSERT/UPDATE documents` in a single `D1.batch()` (and reconcile `cursor` or guard `compact` with `WHERE snapshot_cursor < ?`).

- [ ] **H5 — `insertedWhile` emits explicit `NULL` for Postgres `serial` / `generatedByDefaultAsIdentity` columns**
  - **Files:** `packages/remote-drizzle/src/index.ts:1600-1625, 2696-2701`
  - **Counterexample:** Any Postgres table with `seq: serial('seq')` (`hasDefault: true, default: undefined, defaultFn: undefined`) and an `onDelete` relation fails every `insert` with `null value in column "seq" violates not-null constraint`.
  - **Fix:** Omit columns with `column.hasDefault && column.default === undefined && column.defaultFn === undefined` from `insertedWhile`'s column list (or emit `sql`default`` where supported).

---

## Medium

- [ ] **M1 — `applyEntityEvent` calls `writeEntities` and `clearFloors` when `heardBack` strips all fields (`written = {}`)**
  - **Files:** `packages/remote/src/liveEvents.ts:179-196`
  - **Counterexample:** Contradicting live patch `{ title: 'A' }` at `rev: 3` on a stream at floor `'f1'` yields `written = {}`, yet `writeEntities` wipes `revisionFields` to empty, bumps `revision` to `3`, and `clearFloors` clears `'f1'` despite writing zero fields (and resurrects tombstones).
  - **Fix:** When `Object.keys(written).length === 0`, skip `writeEntities` and `clearFloors`.

- [ ] **M2 — `visibleStore` resurrects a tombstoned row when a pending relative patch resolves to `{}`**
  - **Files:** `packages/remote/src/optimistic.ts:228-241`
  - **Counterexample:** User starts `r1` (`{ values: {}, adds: { likes: 1 } }`) on `Post:p1`; live `EntityDeleted` tombstones `base['Post:p1']`. `resolvedPatches` emits `{ values: {} }`, and `writeEntities` sets `tombstone: false`, resurrecting the deleted row as an empty stub instead of `NotFound`.
  - **Fix:** Filter out resolved patches with `Object.keys(patch.values).length === 0` before calling `writeEntities`.

- [ ] **M3 — Target-existence oracle on hidden rows in `targetsOf` / `refuseGone`**
  - **Files:** `packages/remote-drizzle/src/index.ts:1584-1648, 2603, 2728`
  - **Counterexample:** `targetsOf` / `refuseGone` check `target.table` without `target.visible`, so linking a hidden `Topic` ID succeeds (or returns `Taken`) while linking a nonexistent ID returns `Invalid`, leaking target existence.

- [ ] **M4 — `onDeleteOf` does not verify the foreign key's target table or column**
  - **Files:** `packages/remote-drizzle/src/bind.ts:259-272, 504`
  - **Counterexample:** A FK on `column` referencing a different table/column than `relation.target()`'s `id` still gets added to `keyed`, causing `writer.foreignKey` to falsely return `true`.

---

## Low & De-slop

- [ ] **L1 — `superseded` strips `adds` from an earlier layer, preventing `settleReplayed` from recognizing a later-executed replay** (`packages/remote/src/optimistic.ts:459-505`, `packages/remote/src/model.ts:2246`): causes a spurious reread when `r1` (`add +1`) runs on the server *after* `r2` (`set 2`) and `r2` answers first.
- [ ] **L2 — `packages/remote-server/src/index.ts:2733` fails `pnpm tags:check`** (`ternary on a tag: member._tag === 'Relation'` in uncommitted working-tree diff).
- [ ] **L3 — Doc & error-ordering mismatches:** `packages/durable/README.md:429` omits `isolates` from the `StoreCapabilities` field list; `packages/remote-server/src/index.ts:2742-2779` runs `mount()` before the unsupported-cascade check (`2856`), throwing `StoreRefused` instead of the unsupported-cascade message.

---

## Verified Clean
- `2e0563dfc` `reconcileMutation` vs `newer(key)` tombstone protection, `replay.ts` `earlier -> included`, `656c4a32e` (`metakit` `insert` `andOp` & `idempotent` & `commutes`), `ba5902969` (`sync`), `eadee3370` (`guard/src/server.ts`).
- `Judged = 'constraint'` on SQLite/D1 (`remote-drizzle`'s `foreignKey` explicitly returns `false` for `SQLiteTable`), `null` links in `targetsOf`, and `metakit/src/store.ts` `gives()` / `StoreRefused`.
