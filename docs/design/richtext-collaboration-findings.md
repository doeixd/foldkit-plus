# Rich text collaboration: findings

> **Status.** Built on `claude/richtext-commits-review-djbvzn`. The sections run in
> the order the work did: the design, what building it found, a deep review, designs
> for what was left open, and what those designs became. [Implemented](#implemented)
> is current; earlier sections record their moment, and their file and line
> references are to the code as it stood then (`fa02943` for the designs). Where a
> later commit resolved something an earlier section calls open, the entry says so.

## Scope and decisions

This pass makes one rich-text document editable by several people, offline, converging through `foldkit-sync` and `foldkit-durable`, with no CRDT library. It covers text, marks, and block structure.

- **Loro is dropped.** Durable gives every operation one total order, so replicas converge by replaying the same log. What a CRDT would add is intent preservation, and anchoring edits on character identity gives that without one.
- **Translate at edit time:** a command runs against the projected Document as today, and its Transaction is mapped at once onto identity-anchored operations. Every command and its validation is reused.
- **In scope:** character identity, the anchored operation vocabulary, the replica state and its projection to `RichText.Document`, selections held as anchors, the Sync contract, and convergence tests (concurrent edits, offline, reconnect, duplicates, cold restore).
- **Out of scope at the start:** presence, collaborative undo beyond undoing one's own edits, tombstone garbage collection, and the notion-like demo. All but tombstone collection were built later.

## Proposed design

The document is replicated as a log of operations anchored on character ids, ordered by Durable, and projected to the existing `RichText.Document`. Only two pieces are new: the translator and the replica state.

```text
edit path (new pieces marked *):

  command ── run ──> Transaction ── translate* ──> anchored ops
                                                      │
                                         one durable Sync Message
                                                      │
                             Sync outbox ──> Durable journal (total order)
                                                      │
               replica state* <── applyOps (replay / reduce) ──┘
                     │
                  project ──> RichText.Document ──> editor, Markdown, views
```

1. **Character identity.** Each character has an id: the id of the operation that inserted it, plus its index in that insert (`op:3`). The ids are stored as ranges, one per insert, so a typed word costs one record, not one per letter.
2. **Replica state** (the shared Sync slice, Schema-encodable). Blocks form a tree; each block's position is "after sibling X" in its parent. Each block holds its text as spans of character ids, with deleted characters kept as tombstones, because a later operation may anchor on them. Marks are recorded as ranges between two character ids.
3. **Anchored operations**, the payload of one durable Message:
   - insert text after a character
   - delete characters
   - add or remove a mark between two characters
   - split a block at a character, or join two blocks
   - insert, delete, or move a block after a sibling
   - set a block's type or props

   Applying them is pure and total: an anchor that was deleted still resolves through its tombstone. An anchor that never arrived (its operation was rejected) falls back to a defined place rather than throwing.
4. **Projection.** Replica state becomes a canonical `Document`: runs are maximal spans with one mark set, and a run's id is its first character's id. DOM, Markdown, and views read it unchanged.
5. **Translation at edit time.** The existing command runs on the projected Document. Its Transaction is mapped onto anchored operations against the same state, in the same step, so no concurrent change can intervene.
6. **Sync and Durable.** One durable Message carries the operations. Sync's replay and the journal's reduce both apply them, so every replica applies the same log in the same order and converges.
7. **Selection** is held as character anchors in local state and resolved against each new projection, so a remote edit never moves someone's caret.

**Why a server order is enough here.** A replica only sees characters from committed operations or from its own earlier ones, and operations only anchor on characters their author saw. So an operation's anchors always exist before it in the server order: causality holds by construction. The design doc's objection that sequential replay is not causal (§96) applies to positional operations, not anchored ones.

## Findings log

Twenty findings from the research pass, before any code: two block the chosen design, and several make high-frequency text editing expensive on the Sync and Durable of the time. Findings from the build follow first, newest first.

Found while building (newest first):

- **`Sync.transport.socket` gave up after about 1.5 seconds of outage** (five retries from 50 ms) and was then terminal until its layer was rebuilt; `replica.start` kept "surviving" by failing every exchange. A local-first app offline for longer never reconnected. Fixed in `bdf757d` (A1).
- **The server pushed nothing.** `start` exchanged only after a local edit, so a tab that was only reading never saw anyone's typing, and the demo polled every 300 ms. Fixed in `65a2ddf` (A2).
- **A blank document could not be typed into in Chrome.** A click on an empty paragraph lands on the `<p>`, and `rangeToPosition` refused element positions. Fixed in `537846c`; jsdom could not show it.
- **Wrapping a block left its old element on the page**, so the text showed twice until a reload. Fixed in `537846c`.
- **A keystroke typed within milliseconds of a click was lost**: the editor learned the caret from `selectionchange`, which Chrome delivers after the click, and a keystroke before it had no selection. Fixed in `bcc4331` (C1).
- **No Markdown input rule for task lists** (`- [ ] `). Added in `4b58265` (C5).
- **A Message constructor copies its arrays**, so identity-based memoization must key on the constructed Message's own arrays. The demo builds the fact first and applies its ops.
- **The inferred Sync contract type cannot be named**, so examples type it as the low-level `Sync<M, S>`, which hides the durable set. `Sync.durable(message)` (`55cc7f6`, D2) removed the need to redeclare the set; the type itself is still unnamed.
- **Collaborative undo was not supported.** Undo and redo reported `Replaced` with a snapshot, not transactions, so there was nothing to translate into ops. Built as `Replicated.invert` in `bee75cc` and `0801919` (C3).
- **The editor remounted for any document it had not edited itself**, which is every remote change. Fixed by `patchTo` (`cbb16e6`); `replaceChangeSet` also over-marked every run dirty and skipped nested blocks.
- **The DOM patcher ignored a block's attributes and never looked inside a container it kept**, so a ticked task never showed. Fixed in `3c700f1`.
- **A Command's Message can arrive after a Message dispatched later in the same task.** Foldkit forks each Command one microtask after `update`, so two synchronous dispatches both ran before the first one's fact (confirmed by reading the runtime). This is why minting in a Command was unsafe for typing; fixed by `Sync.fact` (finding 10).
- **`Schema.Record` drops a key its key schema refuses** (Effect 4 rc.116) instead of failing, unless decoded with `onExcessProperty: 'error'`. Recorded in AGENTS.md.
- **Running vitest from a package directory tests `dist`**, not the source. Recorded in AGENTS.md.
- **Nothing could tick a task item**: no operation changed a node's props. Fixed by `SetProps` (finding 14).
- **Text typed into a block another replica deleted is lost** (delete wins). Deleting a container is not deleting what it held: a lift keeps the text.
- **The README said nested children were still pending**, long after they shipped. Corrected.

| # | Finding | Where | Kind | Plan |
| --- | --- | --- | --- | --- |
| 1 | `run` and `runAction` do not return the Transaction they built, only the new state, change set, and position map, so edit-time translation has nothing to translate | `richtext/src/transaction.ts:332`, `command.ts:1367` | Blocker | Fixed in `ce1882f`: results carry `transactions`, one per apply |
| 2 | Sync's `replay` and Durable's `reduce` receive only `(shared, message)`: no op id, replica id, or sequence, so replay cannot mint deterministic character ids | `sync/src/sync.ts:182, :336, :612` | Blocker (workaround exists) | Ids travel in the Message; proposed passing the envelope |
| 3 | Adjacent runs with equal marks merge only in top-level blocks; runs inside a quote or list item never merge | `richtext/src/transform.ts:75-79` | Bug | Fixed in `8ece032` |
| 4 | Every `submit` rewrites the whole replica state (committed snapshot + outbox) in one strict IndexedDB transaction: O(document) per keystroke | `sync/src/sync.ts:512`, `indexedDb.ts:111-137` | Performance | Outbox store built in `d4cbc4f` (B2) |
| 5 | Every Durable `append` JSON-decodes and re-encodes the whole snapshot row, with an fsync (about 5 ms per op, measured) | `durable/src/journal.ts:750-792` | Performance | In-memory snapshot and `snapshotEvery` in `930958e` (B3) |
| 6 | Sync has no op coalescing; only the exchange wake is coalesced, so each keystroke is its own outbox entry and journal row | `sync/src/sync.ts:421` | Missing | `coalesce` in `6c6b0ad` (B5) |
| 7 | A `validate` or `reduce` that throws becomes `InvalidOperationError`, not a rejection; the example exchange then fails whole and the client resends the same outbox forever | `examples/sync/src/journal.ts:218` | Bug | Fixed in `85cde8b`: an op that does not decode is rejected |
| 8 | Rejections carry no reason and pending ops have no dependencies, so ops anchored on a rejected insert replay against characters that never existed | `sync/src/sync.ts:83, :625` | Design gap | Defined fallback for a missing anchor |
| 9 | When an exchange reinstalls the shared slice, local state such as a selection is not remapped, and there is no hook to do it | `sync/src/mount.ts:187-201` | Missing | Fixed in `0500e61`: `onReinstall(next, previous)` on `Sync.mount` |
| 10 | A durable Message may not write outside the shared slice, so it cannot advance a local id counter: minting ids needs an intent Message, a Command, then the durable fact | `sync/src/make.ts:295-299`, `docs/replication.md:273` | Sugar | Fixed in `2443aef`: `Sync.fact(message)` applies the fact in the intent's own transition |
| 11 | Run ids are segmentation handles: split on formatting, retired on merge, so two replicas with equal text can hold different run ids | `richtext/src/transaction.ts:532`, `transform.ts:85` | Design note | Never replicate run ids |
| 12 | `ConvertBlock` is delete plus insert with fresh ids for the block and every run, so concurrent edits inside it would be orphaned | `richtext/src/command.ts:810-838` | Design gap | Retype keeps identity in `db7e0e3` (C4) |
| 13 | `InsertNode` and `MoveNode` address blocks by index; `JoinNode` requires the removed block to be the adjacent sibling | `richtext/src/transaction.ts:642` | Design gap | Anchor on sibling ids in the replicated form |
| 14 | There is no operation that changes a node block's props | `richtext/src/transaction.ts:25-116` | Missing | Fixed in `7f59302`: `SetProps` operation and command; there was also no way to tick a task item |
| 15 | Deleted characters must stay as tombstones while any pending op may anchor on them; collecting them needs a low-water mark over replica cursors, which Durable does not track | `docs/benchmarks.md:63-66` | Design gap | Keep tombstones; still open (B6) |
| 16 | Durable compaction nulls payloads but keeps identity rows, so the file does not shrink | `durable/src/journal.ts:850-880` | Rough edge | `Journal.vacuum()` in `35790af` (B4) |
| 17 | A Durable `read` returns every op after the cursor, with no pagination | `examples/sync/src/journal.ts:205-262` | Rough edge | `read(key, after, { limit })` and `more` in `35790af` (B4) |
| 18 | Presence is generic and fine for remote carets, but is not wired into the socket example, has no throttle, and `prune` is manual | `sync/src/presence.ts`, `sync/README.md:973` | Rough edge | Wired in `ecd2c8d` (C6); throttling still open |
| 19 | The LWW clock persists every stamp: one IndexedDB write per allocation | `sync/src/lww.ts:98-117` | Performance | Log |
| 20 | Composition's `Position` is an index, so if pages are ever synced, concurrent inserts or moves would land wrongly after a rebase | `composition/src/operation.ts:23-27` | Design note | The anchors built here could serve it later |

## Design-doc deviations and open questions

The rich-text [design doc](./richtext-DESIGN.md) planned collaboration around Loro. The design here keeps its editing model and changes these sections:

- **§57 and §108 (Loro as the collaboration backend).** Dropped. Sync already gives replication, an outbox, and a server-ordered journal; what it lacks is stable character identity, which the replica module adds. One dependency fewer, and one owner of order (Durable) instead of two.
- **§54 and §96 (convergence).** Convergence comes from a single server order plus ops that only anchor on characters the author has already seen. No commutativity is needed, so there is no CRDT merge proof to maintain. The price: an op cannot commit while the server is unreachable, only queue. That is the Sync model the rest of the project already uses.
- **§51 and §100 (commands produce Transactions).** Unchanged in meaning, clarified in mechanism: commands still run on the Document, and a new translate step maps the resulting Transaction to anchored ops. `run` and `runAction` must return the Transaction (finding 1).
- **§59 and §60 (op identity).** Character ids come from the op that inserted them, minted before dispatch, because replay cannot see the op id (finding 2). If Sync later passes the envelope to replay, the minting step can go.

Open questions, with how each was settled:

1. **Fallback for a missing anchor.** When an op anchors on a character whose insert was rejected: attach to the nearest surviving predecessor, or drop the op. Settled: the text lands at the end of the block it was typed in (D3).
2. **Sync API change or the Command pattern.** Passing `{ opId, replicaId }` to `replay` is a small, general Sync change; the alternative needs no Sync change but adds an intent Message per edit. Settled by `Sync.fact` (finding 10), which applies the fact in the intent's own transition.
3. **Coalescing window.** Merging a typing burst into one op cuts outbox and journal rows, but delays when others see the text. Settled with no window at all (B5).
4. **Tombstone collection.** Deferred. Documents grow with every deletion until a low-water mark exists (B6).

## Status

This section records the state after the first build and the deep review, before the designs below.

All four steps were done and pushed:

1. Core: `run` and `runAction` return the Transaction; nested run merging (finding 3); a set-props op.
2. A replica module in `foldkit-richtext`: anchored state, apply, projection, and translation, with a property test that two replicas applying the same ops in server order project the same Document.
3. Sync wiring: the durable Message, id minting, and selection held as anchors; the example exchange treats a throwing op as a rejection.
4. The Notion-like demo, recording findings here as they came up.

- **Step 1** (`ce1882f`, `8ece032`, `7f59302`): transactions returned, nested merge, `SetProps`.
- **Step 2** (`f35077b`, `0e6fbb1`): `RichText.Replicated`, checked by seeded 400-step sessions over all 11 op kinds and random concurrent merges.
- **Step 3**: `Sync.fact` (`2443aef`), `onReinstall` (`0500e61`), the exchange rejecting what does not decode (`85cde8b`), the patcher reaching attributes and nested blocks (`3c700f1`), `patchTo` (`cbb16e6`), and two browser-only editor bugs (`537846c`).
- **Step 4** (`2196313`): `examples/pages`, a page editor two people edit at once, with a two-replica trace in `pnpm demo`, a mounted test, and a Chromium run covering typing from two windows, to-dos, and an edit made while the server was down, kept through a reload and delivered later. A keystroke cost 1.4 ms at 100 paragraphs and 9.5 ms at 1,000.

Every commit passed format, typecheck, the full suite and the demos, and new guards were mutation-tested. The Jev review could not run: `TYPESAFE_API_KEY` is not set.

**Deep review** (four independent reviewers, every finding checked against the code and each fix mutation-tested), eleven fix commits, `1e6c0d6` to `fa02943`:

- **Text lost in concurrent joins.** Two people pressing Backspace at the starts of consecutive paragraphs deleted one of them. A Join now carries the character it follows. A caret at the start of a joined block also resolved to the wrong place.
- **Sync.** A mapped `Sync.fact` still counted as a fact and carried the child's unmapped Message. `onReinstall` ran at every mount start, and its test only passed by racing. A durable Message's facts were half-applied.
- **Editor.** A page selection outside the editor could become a caret inside it. `patchTo` trusted the caller's document instead of what was drawn. `replaceChangeSet` under-reported. Every confirming exchange patched and reset the caret.
- **Examples.** The pages journal rejected transient storage errors, which dropped users' edits. A duplicated tab shared one replica and lost every edit in one tab.
- **Smaller fixes.** `SetProps` locked nodes with legacy props. Building a state was quadratic (4,000 paragraphs: 2.1 s, now 84 ms). Translation now mirrors `apply`'s skips. Several claims in the docs were narrowed to what the code does.

Still open at that point: server push, the socket transport giving up after 1.5 s, collaborative undo, and per-edit costs that grew with the whole document. Each got a design in the next section.

## Designs for open work

Each design below is grounded in the code as it stood at `fa02943`: file references are where the change goes, and each names the package that owns it. The order at the end puts correctness before cost and cost before features. [Implemented](#implemented) records what each became.

### A. Transport and liveness (foldkit-sync)

**A1. A socket that never gives up.** `layerSocket` retried 5 times (`transport.ts:197-200`), and the budget was counted over the layer's whole life, so the sixth close ever was terminal even after hours of healthy connection. Once terminal, every exchange failed at once (`:313-316`).

- Keep reconnecting forever, with exponential backoff capped (the pages example already capped at 10 s with `modifyDelay`), and reset the backoff whenever a socket opens.
- `maxRetries` changes meaning: it becomes the number of consecutive failed attempts after which queued exchanges *fail fast* rather than wait. It no longer ends the transport. The only terminal state left is the layer's own finalizer.
- The test at `transport.test.ts:329` asserted the old terminal behaviour. It becomes: fails fast while down, and a later exchange succeeds once the server is back.
- Two replica fixes ride with it:
  - A failed exchange publishes `statusChanges` (only success did, `sync.ts:641`), so a UI sees `lastError` without waiting for the next keystroke.
  - `CheckpointRegressionError` sets `lastError` too (it was outside `tapError`, so it failed silently forever).
- `start` retries a failed exchange with backoff instead of waiting for the next `submit` (`sync.ts:644-651`). Otherwise an offline tab that stops typing never delivers its outbox.

**A2. Server push.** No client could receive an unsolicited frame: `layerSocket`'s `onMessage` dropped any frame without a known `id`. Nothing but `submit` could wake `start`.

- Wire: a server-to-client frame `{notify: {cursor}}` with no `id`. Old clients already ignore it, so this is backward compatible. It is a wake-up, not data: the exchange reconciles from the replica's own cursor, which is why a missed or coalesced notify is harmless.
- Server: `serveSocket` takes an optional `changes: Stream<string>` of committed document keys. `Durable.subscribe` is exactly that (key-only, sliding, `journal.ts:457`). It sends `notify` to sockets of that document.
- Client: the `Transport` service gains an optional `changes: Stream<void>`. `layerSocket` emits on `notify` and on every reconnect (a reconnect may have missed pushes). `start` merges it with its existing `wake` queue.
- Then the pages example drops its 300 ms polling loop and calls `start` once.
- Frames were told apart by duck typing (`id` versus `presence`). Give the three kinds disjoint top-level keys (`id`, `presence`, `notify`), and add a test that each listener ignores the other two.

**A3. A replica ahead of a reset server; server identity.** A client cursor beyond the server's makes `read` throw `InvalidCursorError`. That reached the client as an opaque `TransportError` string, *after* the server had already committed the exchange's pending ops, so their acknowledgements were lost (`examples/sync/src/journal.ts:257-278`). The replica then failed the same way forever.

- Server: validate the cursor before appending anything, and answer with a typed `{error: {_tag: 'InvalidCursor', cursor}}`.
- Identity: the journal mints an `epoch` when it is created and returns it on every exchange. `ReplicaState` stores it (`sync.ts:90-101`). A different epoch means the cursor refers to a history this server does not have.
- Recovery on a new epoch: adopt the server's checkpoint unconditionally (the regression check does not apply across epochs), keep the outbox, and resend it.
  - Pending ops are the user's intent and survive.
  - Ops the replica saw committed but the new server lacks are gone, unless another replica still holds them. That is the narrow guarantee to document.
  - Resent ops may anchor on characters the new server never had; they fall back as the missing-anchor rule says.
- Binding a `replicaId` to its actor: the journal records `replicas(replica_id, actor_id)` on first exchange and refuses an op whose replica belongs to another actor. It is application policy in the example's `validate` today, so it belongs in the example journal, with a helper in `foldkit-durable` only if a second caller appears.

### B. Per-edit cost

Nothing below the whole-state level was cached incrementally:

- Each `submit` Schema-encoded the committed document, the outbox and `committedIds`, and wrote them as one IndexedDB blob.
- Each journal append parsed, decoded, re-encoded and rewrote the whole snapshot. `appendAll` did that N times for N ops.
- Each keystroke ran several whole-document passes through `Replicated`.

The measurements so far (1.4 ms per keystroke at 100 paragraphs, 9.5 ms at 1,000) covered only the in-memory part. Neither bench measured storage: `projection.bench.ts` stubs `save`, and the Durable bench's snapshot was `{count}`.

**B0. Measure first.** Add a replicated bench to `packages/richtext/bench` covering `translate`, `applyOps`, `project` and `resolve` at 100, 1,000 and 4,000 paragraphs. Add a Durable bench with a document-sized snapshot. Publish both in `docs/benchmarks.md`. Every change below is judged against these numbers.

**B1. Replicated: reuse, do not rebuild** (foldkit-richtext).

- Projection per entry: cache each projected block by its `Entry` object in a WeakMap. `applyOps` copies only the entries it touches, so an unchanged block keeps its identity and its projection. This turns `project` from O(document) into O(changed blocks). It is also what lets `patchTo`'s diff skip untouched subtrees for free.
- Indexes per state: a lazily built `insertId → block` map answers `findChar` and `eachCovered` directly. A miss scanned every block, and `Delete`, `Mark` and `Unmark` visited every block. The map is cached per state in a WeakMap and carried forward by the draft when ops only add inserts.
- `translate` builds its shadow only for the blocks the transaction touches, rather than for the whole document twice (`replicated.ts:890,897`).
- `resolvePosition` stops copying the whole block record via `startOf(draft(state))` just to read it.

**B2. IndexedDB: an outbox store** (foldkit-sync). Split the single `'state'` key into a `meta` record (revision, cursor, `committedIds`, the committed snapshot) and an `outbox` store keyed by local sequence.

- `submit` writes one outbox row plus the small meta revision in one transaction.
- The committed snapshot is written only by `synchronize`, which is the only thing that changes it.
- `Storage` gains an optional `append(operation, revision)`. A storage without it keeps the whole-state `save`, so memory storages and tests are unchanged.

**B3. Durable: a cached, checkpointed snapshot** (foldkit-durable).

- Keep `{cursor, snapshot}` per key in memory. It is valid while the row's cursor matches, which is one cheap indexed read inside the transaction. This removes the parse and decode per append.
- Write the snapshot every N ops, or on idle, at a recorded `snapshot_cursor`, rather than on every append. `load` becomes that snapshot plus a replay of the ops after it. Compaction may never pass `snapshot_cursor`.
- `appendAll` decodes once, reduces N times and encodes once.

**B4. Read paging and shrinking** (foldkit-durable, foldkit-sync).

- `read(key, after, {limit})` returns `{operations, more}`. The exchange response carries `more`, and the replica exchanges again at once while it is set. A replica returning after a long absence then catches up in bounded steps.
- `compact` keeps each row's `(op_id, payload_hash, sequence)`, because idempotency needs them, and nulls the input, as before. Run `PRAGMA incremental_vacuum` afterwards so the file actually shrinks; it stayed at 520,192 bytes. (Building it showed `incremental_vacuum` does nothing here; see B4 under Implemented.)

**B5. Coalescing, with no timer.** This answers the open question on a coalescing window. Merge only ops that are still in the outbox and not yet in flight, and there is nothing to tune: a burst typed while an exchange is out merges, and a lone keystroke goes out as fast as before.

- Sync: the contract gains an optional `coalesce(last, next) => merged | undefined`, applied in `submit` to the last pending op when that op is not in flight.
- Pages: two `RenamedPage`s for one page merge into the later one. Two `EditedPage`s for one page concatenate their op lists.
- Replicated: to make the concatenated list shrink rather than just share a row, `Insert` gains an optional start index. A tab continuing its own last insert then mints `X.(k+1)` rather than a new insert id, and two adjacent inserts become one `Insert` with longer text. Character ids stay `${insertId}.${index}`, so nothing else changes.

**B6. Tombstone collection: stays deferred, with a named mechanism.** A true low-water mark needs every replica's cursor, and offline replicas make that unknowable. The server already has what it needs:

- Behind the compaction floor, a replica must adopt a checkpoint anyway (`CompactedCursorError`).
- So at compaction the server may rewrite its snapshot without tombstones whose delete committed at or below the floor. That needs the delete's sequence recorded on each span.
- A late op anchored on a purged character takes the missing-anchor fallback.

It is worth building only once B0 shows tombstones dominate the cost.

### C. Editor

**C1. The click-then-type race** (foldkit-richtext-dom). `intentFor` never read the DOM selection. A keystroke ran at the last `Selected` the app saw, and `selectionchange` is asynchronous. `sync` then restored the stale caret and set `lastSelection` to it, so the late `selectionchange` reported nothing: the click was lost.

- Fix: in `onEvent`, for text and delete intents, `readSelection(current)` first. If it differs from `lastSelection`, call `onSelection` synchronously before `onIntent`. The Mount's queue keeps order, so `Selected` lands before `Typed`.
- `compositionstart` reports its selection the same way.

**C2. IME under a remote patch** (foldkit-richtext-dom). `sync` patched unconditionally (`events.ts:393-397`), so a remote edit arriving mid-composition rewrote the text under the IME and moved the selection.

- While `composing()`, `sync` stores the latest state and returns. `compositionend` repairs, dispatches its `InsertText`, then applies the stored state.
- The app's caret is anchored by characters, so it survives the wait. The DOM is untouched during composition, so `composingSelection`'s element positions stay valid; this also settles the open item on composition index positions.
- `patchTo` needs no change: it goes through `attachment.sync`.
- Test: a `patchTo` between `compositionstart` and `compositionend` leaves the composing text alone, and the page then shows both edits.

**C3. Collaborative undo** (foldkit-richtext Replicated, plus the app). Undo becomes a new, forward op that reverses one of *my* edits. Concurrent edits by others are kept.

- `invert(state, ops)` computes inverse ops against the state before the edit applied:
  - Insert → Delete of its range.
  - Delete → **Undelete**, a new op: tombstones keep text and position, so it is the same `eachCovered` walk with `deleted: false`.
  - Mark/Unmark → the prior marks of each range, captured at edit time.
  - InsertBlock → DeleteBlock; DeleteBlock → **UndeleteBlock** (entries are kept).
  - MoveBlock → a move back to the prior parent and sibling.
  - Retype/SetProps → the prior values.
  - Split → Join.
  - Join → **Unjoin**, which restores the removed entry and moves back the spans after the join character, because the removed block's id cannot be reused by a Split.
- The undo stack lives in the tab's Model. It is not shared, and it is grouped with the editor's existing `groupFor`.
- `Undone` dispatches the inverse as an ordinary `EditedPage` fact, so it converges like any edit. Redo is the inverse of the undo.
- The honest limit: a prop inverse is last-writer-wins. It can overwrite a concurrent change to the same prop by someone else.

**C4. ConvertBlock keeps character ids** (foldkit-richtext core). No op changed a block between a text block and a text-holding `Node` in place, so `replaceCarryingText` deleted and re-inserted, and `translate` minted new characters. Anyone else's concurrent typing in that block was lost into the tombstone.

- Add a transaction op `ReshapeBlock{node, to}`, allowed only between text-holding shapes, and a Replicated `Reshape{id, shape}`. The replicated `BlockShape` already models `Node{holds: 'text'}`.
- `ConvertBlock` and `RetypeBlock` on a node use it. Identity is kept, and so is a collaborator's typing.

**C5. A task-list input rule** (foldkit-richtext-markdown). `bulletRule` fires at `- `, so by the time `[ ] ` is typed the caret is in a ListItem's paragraph, and a rule saw only `textBefore`.

- Widen `InputRule.match` with a second argument: the kinds of the enclosing blocks.
- The task rule matches `[ ] ` or `[x] ` at the start of a ListItem paragraph. Its commands lift the block out of the item and wrap it as `[List, TaskItem{checked}]`, and the existing join logic puts it in the preceding list.
- Existing rules ignore the new argument, so none change.

**C6. Presence and remote carets** (foldkit-sync presence, the app, richtext-dom).

- A peer's presence value is `{page, selection: AnchoredSelection, name}`. Each tab resolves peers' selections against its own current body, so a caret follows the characters it sits by, exactly like the local one.
- Draw them through the attachment's existing `decorate` option.
- Transport: one `Sync.socket(url)` yields both the exchange transport and a presence channel on one connection, and rebinds presence on reconnect. `socketPresenceChannel` bound one socket forever.
- Throttle `presence.set` to a frame; it notified on every call.

### D. Application semantics (examples/pages)

**D1. Edits to a deleted page.** `EditedPage` for a missing id was silently a no-op, so an offline person's edits to a page someone else deleted were lost without a trace.

- Recommendation: a trash. `DeletedPage` sets `deletedAt`; edits keep applying; the sidebar hides the page; `RestoredPage` brings it back.
- The alternative is to keep deletion final and say so in the Limits section.

**D2. A nameable contract.** The tests and the demo redeclared the durable tag set because the declared `Sync` type did not expose it. The contract should expose `durable: ReadonlySet<Tag>` (or `Sync.isDurable(contract, message)`), and `mountPages` should export its contract type, so neither is copied by hand.

**D3. The missing-anchor fallback: built, to be confirmed.** The lost anchor's own position is not knowable from the op, so the text lands at the end of the block it was typed in (`replicated.ts:381-389`).

### Order

1. **Correctness, small:** A1, C1, C2, and the typed `InvalidCursor` plus cursor check from A3.
2. **Push:** A2, then remove the pages polling loop.
3. **Cost:** B0, then B1, B2, B5, B3 and B4, each against the bench.
4. **Features:** C3, C4, C5, C6, D1 and D2.
5. **Deferred:** B6, and the epoch recovery from A3 (only a server reset needs it).

### Decisions

Each was left open with a recommendation, and the recommendation was taken:

- **D3:** text with a lost anchor lands at the end of the block it was typed in, rather than the op being dropped.
- **D1:** deleted pages go to a trash rather than deletion being final.
- **C3:** undo reverses only this tab's own edits, with last-writer-wins for props.
- **A3:** a server reset is not handled yet; resending the outbox and accepting the loss of ops no replica holds remains the proposal.

## Implemented

The plan above is built on `claude/richtext-commits-review-djbvzn`, in order, one commit per item. Each commit ran format:check, typecheck:force, test and demo, and its guards were mutation-tested.

**Phase 1: correctness**

- A1, `bdf757d`: the socket reconnects for as long as the layer lives. `start` retries on a backoff, and every failed exchange sets `lastError` and publishes status.
- C1 and C2, `bcc4331`: a keystroke or composition start reports a pending click first, and `sync` holds patches while composing.
- A3 (part), `c3d3fd8`: the example servers refuse a cursor ahead of theirs before appending, using the new `Journal.cursor`.

**Phase 2: push**

- A2, `65a2ddf`: `{ notify: true }` frames, `Transport.changes`, and `start` waking on them. The pages polling loop is gone. Checked in Chromium with two windows and a server restart.

**Phase 3: cost**

- B0 and B1:
  - `20026d7`: `apply` validates once per block; the replicated bench is `packages/richtext/bench/replicated.bench.ts`.
  - `594b2aa`: a layered holders index, per-entry projection reuse, a lazy translate shadow, and SetSelection checked against apply's own index.
  - One keystroke at 100, 1,000 and 4,000 paragraphs went from 1.08, 8.7 and 49 ms to 0.17, 1.9 and 9.6 ms.
- B2, `d4cbc4f`: `Storage.append` and an IndexedDB outbox store (database version 2), so a submit writes one row.
- B5, `6c6b0ad`: `coalesce(last, next)` merges into an operation no exchange has carried. The outbox is marked sent under the replica's lock, and pages merges page edits and renames. The Replicated `Insert` start index was not built, so a merged edit is one operation holding many ops.
- B3, `930958e`: the journal keeps the snapshot in memory, and `snapshotEvery` is new (schema 4). A 2,000-item append went from 2.99 to 1.95 ms, and to 0.91 ms at `snapshotEvery: 50` (`packages/durable/bench/storage.ts`).
- B4, `35790af`: `read(key, cursor, { limit })`, the exchange's `more`, and `Journal.vacuum()`. The design's `incremental_vacuum` does nothing here, because compaction shrinks rows rather than freeing pages. Only `VACUUM` plus a WAL checkpoint shrinks the file.

**Phase 4: features**

- D2, `55cc7f6`: `Sync.durable(message)`.
- C5, `4b58265`: `InputRule.match` gets the enclosing kinds, and `[ ] ` or `[x] ` in a list item makes a task.
- D1, `763a10e`: the trash, with a durable `RestoredPage`.
- C4, `db7e0e3`: `RetypeBlock` takes a `RetypeTarget` including node kinds, so converting a block keeps its identity and a concurrent insert survives. This replaced the proposed `ReshapeBlock`.
- C3:
  - `bee75cc`: `Replicated.invert`, with `Undelete`, `UndeleteBlock` and `Unjoin`, checked by a property test over seeded sessions.
  - `0801919`: undo and redo in pages, grouped by typing.
- C6:
  - `636d417`: the editor's `overlay` Command for decorations from application state.
  - `ecd2c8d`: `transport.socket` shares the sync connection with presence, and pages draws remote carets. Checked in Chromium.

**Follow-up: what was left open**

- Merging adjacent inserts, `4728d69`: `Insert` gains an optional `from`. `translate`'s `continues` option carries text typed at the end of this replica's own insert on that insert, and `Replicated.coalesce` folds the run into one op. Pages coalesces its merged edits with it, so a burst of typing the server has not seen is one `Insert`.
- Presence, `dbe5a27`: a `throttle` option sends at most one value per interval, the latest; a departure goes at once. Pages throttles to 50 ms and still announces only when its page or caret changed.
- A3, `901b47f` and `8eba2d0`: `Journal.epoch(key)` names a document's history and is new after `reset` or in a new file. The replica stores the server's epoch and sends it back; a server that finds another answers from sequence 0, and the replica rebuilds its committed state from that and resends its outbox. Durable's `replicaId` option, which Sync's `journalContract` supplies, binds each replica to its first committing actor and refuses anyone else's operations from it.
- B6, `bb47b1d`: the sequence-per-span design needed the commit sequence inside `update`, which replay never sees, and a server-only purge would have made replicas diverge. It became a `Collect` op instead, committed through the log: each one removes the text the previous one marked deleted and marks what is deleted now, so every replica removes the same text at the same point, and only a replica offline across two collections loses anchors. An insert keeps one deleted character at its end, so a continued insert never reuses an index. The pages server commits one per page every hour.

**Still open**

- Finding 19: the LWW clock's write per stamp.
- A replica that never heard an epoch cannot tell that the server it last saw was reset.
- The epoch rule is copied into each example server; Sync has no server-side exchange helper to hold it.
