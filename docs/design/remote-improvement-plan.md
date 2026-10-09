# Plan: a declarative write side for Remote, and where it meets Sync

**Status:** proposed, 2026-10-09. Nothing here is built.
**Source:** [remote-improvement-DESIGN.md](./remote-improvement-DESIGN.md), an
outside review comparing Foldkit Plus with Convex, Fate and TanStack DB. This
plan checks each of its proposals against the code as of `4c4f9ba4`, and
against how Sync, Durable and Remote work together in the examples. It keeps
what the code still lacks and drops what is built or not yet justified.
**Target packages:** `foldkit-entity`, `foldkit-remote`,
`foldkit-remote-server`, `foldkit-remote-drizzle`, `foldkit-sync`.
**Companions:** [data-query-DESIGN.md](./data-query-DESIGN.md) (the read IR),
[local-execution-DESIGN.md](./local-execution-DESIGN.md) (local evaluation),
[guard-DESIGN.md](./guard-DESIGN.md) (authorization),
[docs/editing-server-data.md](../editing-server-data.md) (durable edits of
server data), [docs/wiring.md](../wiring.md).

Every API below is a **proposal**: names and signatures are what a phase must
make true, or deliberately replace.

## 0. Findings

1. **The read side is declarative; the write side is not.** A query body is
   data that four interpreters run and a conformance suite checks. A Remote
   mutation is a name, two Schemas and an opaque Effect, so nothing can tell
   what it changed except the patches its handler chooses to return. One
   write's effect is spelled out by hand in up to five places:

   | Place | What the application writes |
   | --- | --- |
   | `Mutation.make` | input and output contract |
   | `Data.mutate(..., { optimistic })` | the optimistic patches |
   | `RemoteServer.mutation(descriptor, run)` | the database write, and the patches `run` returns |
   | `hub.changed(ref, fields)` | the fields to publish live, called by hand after the write (`examples/kitchen-sink/src/stack.ts:129`) |
   | `Data.refresh` | whatever else might now be wrong |

   Nothing connects a write to the queries that read what it changed: a
   connection whose membership may have changed stays as it was until the
   application refreshes it or a live event says otherwise.

2. **There are two write paths into the same tables, and they do not meet.**
   An online edit is a Remote mutation. A durable, offline edit is a Sync
   operation that a Durable journal commits and `editsJournal.settle` applies
   to the table (`docs/editing-server-data.md`). Each is sound alone. Between
   them:

   - **Remote is never told when a journal settles a row.** Nothing in
     `packages/sync` imports Remote or emits a change. The registry covers the
     gap with `EditableEntity.overlay` and a `Products.refresh` when an edit
     retires (`examples/registry/src/sync.ts:158-176`); cloudflare polls D1
     every 250 ms (`pollLive`, `examples/cloudflare/src/schema.ts:259, 509`).
   - **Pending Sync edits reach only the views that overlay them by hand.**
     The registry's `rowsOf` lays `retired` and `edits` over Remote's page
     (`app.ts:492-503`). Another view of the same row, `Data.filtered`'s
     membership, or a sorted page sees the server value. The doc admits the
     last: an unabsorbed edit shows its new value in its old position
     (`editing-server-data.md:221-222`). The CMS design hit the same hole from
     the Remote side: "Remote has no overlay without a request today"
     (`cms-DESIGN.md:234`).
   - **One fact is described twice and the copies disagree.** Cloudflare's
     Sync Model is a hand-written `{ done: Boolean }` while its Entity says
     `done: Literals([0, 1])`, and toggling means `done = 1 - done` on the
     Sync path but "set the given value" on the Remote path
     (`schema.ts:75, 98, 193, 567`, `domain.ts:16`).
   - **Offline reload has nothing to overlay.** The registry persists the
     Sync outbox but not Remote's cache, so a reload with the server
     unreachable keeps the edits and shows no rows. Its offline test only
     takes the Sync transport down (`test/page.test.ts:84-93`).
   - **The glue is hand-written in every app:** `onReinstall` retire logic,
     exchange status bridged into the Model by dispatch, absorption on a
     `setInterval`, journal hooks that decode Messages by hand.

3. **Most of the review's roadmap is already built** (see §1). What is
   missing is the write side, and the seam between the two write paths.

## 1. The review's proposals against the code

| Proposal | Today | In this plan |
| --- | --- | --- |
| Normalized cache, selections, batching, optimistic mutations | Built (`foldkit-remote`) | — |
| Reference interpreter, cross-backend conformance | Built: `foldkit-entity/conformance`, run by `evaluate`, Drizzle on SQLite and PGlite, TanStack DB, LiveStore and Remote matching | Extend (§4) |
| Audit `query-native-FINDINGS` | All five fixed or obsolete; two gaps left | §4 |
| Identity-aware dependencies | Built: `FieldDependency.owner` keyed by token (`expr.ts:204`) | Split by role (§4) |
| Local evaluation of a query body | Built: `Data.filtered` → `Matched { items, complete }`, `belongsEncoded` (`matching.ts`) | — |
| `Complete \| Partial \| Unknown` coverage type | Declined in local-execution §9.5 for `complete: boolean` | Not reopened |
| Live inserts placed by membership | Built: `livePolicyFor` ignores a row the body excludes | — |
| Ordered placement locally | Gated on declared collation (local-execution Phase 4) | Not here |
| Incremental local query engine, indexes, `d2ts` | Not built; an unrelated write costs ~3µs a row | Deferred (§11) |
| Joins and aggregates | data-query Phase 13, gated on callers | Not here |
| Mutation write-set capture, targeted invalidation | **Missing** | §5, §6 |
| Commit-driven live publication | **Missing**: `liveHub.changed` is manual; remote-drizzle has no transaction wrapper; journal settles publish nothing | §7 |
| Server-side mutation idempotency | **Missing** for Remote: `requestId` is client-only. Durable already dedupes Sync operations by `opId` with a payload hash | §5, §7 |
| Durable offline writes | **Built, as Sync**: IndexedDB outbox with strict durability and compare-and-swap, socket push, reconnect with backoff, rejection by id, checkpoints past compaction | Bridge to Remote (§8) |
| Persistence as configuration | **Missing**: `RemotePersistence.save/restore` exist; apps wire them by hand (cloudflare) or not at all (registry) | §9 |
| Reconnect, resume, gap recovery for Remote live | **Partial**: gaps are marked; nothing resubscribes. Sync's transport already has the policy to reuse | §10 |
| `delivery: 'durable'` on Remote mutations | — | Reformed: one operation, two deliveries (§6) |
| `Operation.make` with traits, a semantic program IR | — | Declined (§12) |
| Convex-level reactive server | — | Out of scope (§12) |

## 2. How the two write paths compare today

| | Remote mutation | Sync edit (registry pattern) |
| --- | --- | --- |
| Owner of the intent | the server, for the length of a request | the journal; the replica's outbox until then |
| Survives a reload or crash | no ("Remote has no outbox", `cloudflare/src/cache.ts:3`) | yes, once the IndexedDB transaction completes |
| Identity | `requestId`, client-only, reconciled once | `replicaId:localSequence`, deduplicated by Durable with a payload hash |
| Optimistic display | a layer per `requestId`, seen by every Remote read | `EditableEntity.overlay`, applied by hand in the views that call it |
| Commit | the handler's own write | `journal.append` in one SQLite transaction, then `settle` → `apply` writes the table with a `revision` |
| How other readers learn | `hub.changed` by hand; nothing on Workers | nothing; the app refreshes, or polls |
| Rejection | `MutationFailed` per request | `rejected` by id in the exchange; `EditsRefused` dispatched by hand |
| Conflict | the handler's business | last commit wins per cell; `revision` orders a row against an edit |

Neither column should absorb the other. Remote owns server facts it caches;
Sync owns user intent it has not yet delivered. The plan gives them one
vocabulary for *what changed* and one way for Remote to *show* what Sync
still holds, without moving ownership.

## 3. Invariants

1. **Server facts enter the Model only through Remote's Messages.** A change
   set is a Message payload, not a side channel.
2. **Undelivered intent is Sync's.** Remote may display a pending edit; it
   never stores, retries or drops one. Deleting Remote's cache is recovery;
   deleting Sync's outbox is data loss.
3. **No false completeness.** A local answer is `complete` only under the
   conditions `Data.filtered` already checks; impact analysis that cannot
   prove a connection right invalidates it.
4. **Proving a local update insufficient is a result.** Impact returns
   `Invalidate` with a reason as readily as `Patched`.
5. **Authorization stays at the source.** Static analysis may skip work; it
   never decides what a principal sees. Live re-reads stay per principal.
6. **An opaque handler is assumed to change anything.** Its write set is what
   it returns plus conservative invalidation, never inferred from its input.
7. **Possible, targeted and actual writes are different facts.**
8. **Existing APIs keep working.** `Mutation.make`, `RemoteServer.mutation`,
   `Data.refresh`, `liveHub`, `RemotePersistence`, `EditableEntity` and
   `editsJournal` remain valid.

## 4. Phase 0 — close what the findings left

- `evaluate` (`holds`/`sideOf`) and the Drizzle compiler still recurse without
  memoization, so a shared DAG such as `eq(prev, prev)` nested 30 deep is
  exponential at execution even though `walk` and `fieldsIn` are not.
  Memoizing helps `evaluate` but not the compiler, whose SQL text is itself
  exponential in the graph's depth: an expanded-size budget checked once at
  `Query.where`, where the graph is already walked, covers both.
- The conformance suite has Unicode cases but no NUL case, though both
  interpreters refuse NUL.
- `Query.dependencies` returns one `fields` list for `where` and `orderBy`.
  Impact (§5) needs a field's role: a predicate field can change membership,
  an order field position. Report them apart (`predicate`, `order`), keeping
  `fields` as their union.

**Exit:** a shared DAG over the budget is refused at construction, and one
under it evaluates and compiles; a NUL case runs in every conformance
subject; `Query.dependencies` separates roles, tested with a field in both.

## 5. Phase 1 — one change vocabulary, and impact

A pure module in `foldkit-remote` that answers: *given what changed and an
active connection, what keeps the connection right?*

```ts
// Proposed
interface EntityChange {
  readonly entity: string
  readonly id: string
  readonly fields: ReadonlyArray<string> // changed keys; deletion is its own tag
  readonly revision?: number // when the source orders rows, as editsJournal does
}

type Impact =
  | { readonly _tag: 'Unaffected' }
  | { readonly _tag: 'Patched' } // only selected fields changed
  | { readonly _tag: 'Invalidate'; readonly reason: string }
```

`EntityChange` is the one shape every producer speaks, so the rest of the
plan composes:

- a `MutationAnswer`'s patches and deletions (this phase, no server change);
- a structured operation's actual changes (§6);
- a journal settle's applied `Change`s, with their `revision` (§7);
- a pending Sync edit shown as a layer (§8).

For each active connection with a `Query.define` body:

- a change to no field the body reads, on an entity it ranges over:
  `Unaffected`, or `Patched` when the field is selected;
- a predicate field: decide with `belongsEncoded` against the patched row.
  `yes` for a row already in the connection, or `no` for one not in it,
  leaves membership alone; anything else, including `unknown`, invalidates;
- an order field of a row in a paginated connection: invalidate, since the
  row that fills its place may not be loaded (local-execution §9.4). This is
  also the registry's "new value in its old position" case;
- a deletion: drop the edge where present (reconcile already tombstones);
- a connection over an opaque `Query.make`: invalidate when the entity
  matches. Opaque bodies declare nothing, so nothing narrower is sound.

`MutationSucceeded` applies `Invalidate` through the path `Data.refresh` uses.
Before claiming that refetches, follow what restarts a read entry after an
invalidation: a refresh that changes nothing in the plan restarts nothing
(see "It retries is a claim about what restarts it" in `AGENTS.md`).

In the same phase, send `requestId` on the wire and pass it to
`MutationSource.run`, so a server can recognise a retry. Deduplicating it is
§7's, because it has to be atomic with the write.

**Exit:** a rename updates every selecting view and fetches nothing; a
category change invalidates the category connections and only those; a price
change to a row in a paged, price-ordered connection invalidates it; a
connection over an unrelated entity is `Unaffected`; a re-sent mutation
reaches the handler with its `requestId`. Impact is tested as a pure table,
each rule with a mutation in `test/*.mutations.ts`.

## 6. Phase 2 — a structured write, delivered either way

The review's strongest proposal: a mutation whose effect is data, defined
beside the Entity, over the existing `Expr` nodes, frozen like a query body.

```ts
// Proposed
const SetDone = Operation.update(Todo, {
  id: Expr.input('id'),
  set: { done: Expr.input('done') },
})
```

| Stage | When | Derived |
| --- | --- | --- |
| Possible writes: `Todo.done` | definition | which query definitions it can affect |
| Targeted writes: `Todo:t1.done` | `Operation.bind(op, input)` | the optimistic patch |
| Actual changes | execution | the returned patches, and Phase 1's `EntityChange`s |

**`EditableEntity` already is this operation, for one shape.** Its `Change`
is a set of member values for one row of one Entity, and `editsJournal`'s
`apply` is the hand-written interpreter that writes it with a `revision`
guard (`examples/registry/src/server.ts:105-113`). So `Operation.update`
should be designed to subsume that `Change`, not sit beside it: one
declaration, read by

- **Remote, online:** `RemoteServer.mutation` runs the compiled update and
  returns the written fields; the client derives the optimistic patch;
- **Sync, durable:** the same operation is the payload of a Sync fact, and
  `editsJournal`'s `apply` is derived from it (the compiled update with the
  revision guard), instead of written per application.

This is the review's `delivery: 'durable'` without its problem: Remote does
not queue anything. Durability stays Sync's; what the two paths share is the
operation's meaning, which is what disagreed in cloudflare.

Start with `update` by id with literal or input values. `insert`, `delete`,
`where`-targeted updates and computed values (`updatedAt`) follow only when
an example needs them, each with a conformance case: writes get the same rule
as operators (data-query §6.0.2), semantics before interpreters. A handler
stays the escape hatch, under invariant 6.

**Exit:** cloudflare's toggle is one operation on both paths, and its
hand-written Sync Model goes; the registry's `apply` and `columnOf` are
derived; a conformance case runs an operation against the reference store,
SQLite and PGlite and compares the rows.

## 7. Phase 3 — publish on commit, from both paths

Two commit points exist, and both know exactly what they changed:

- a structured operation, or a handler inside an explicit remote-drizzle
  `transaction(...)` that collects the changes it is told about;
- `editsJournal.settle`, which calls `apply` once per committed `Change`.

Each publishes its `EntityChange`s **after commit**, nothing on rollback, and
one transaction's changes as one live event, so a view never draws half of
it (`MutationSucceeded` is already one Message per answer; live events are
per entity today).

Where they publish to depends on the host. In one process, the existing
`liveHub`. Across requests, as on Workers, an in-memory hub reaches nobody
(the Workers trap in `AGENTS.md`), so a live source reads a durable log by
cursor. For journal-written data that log already exists: Durable's
`operations` table is ordered and gap-free. For Remote mutations, the commit
writes a change row in the same transaction.

Server deduplication of a Remote `requestId` belongs in that same
transaction: a dedupe row written with the change, so a retry finds it.
Durable's `runEffect` keys a result too, but it is not atomic with the
mutation's own write, which reopens the crash gap Durable's README
documents.

**Exit:** kitchen-sink's rename reaches a second client's live view with the
`liveHub.changed` call in `stack.ts` deleted; a registry edit settled by the
journal reaches another device's Remote page without `Products.refresh`; a
rolled-back transaction publishes nothing; a two-entity transaction arrives
as one event; cloudflare's live source reads the log instead of diffing a
poll; a retried mutation runs once.

## 8. Phase 4 — Sync's pending edits as a Remote layer

Remote already has the right mechanism: an optimistic layer, seen by every
read, owned by a `requestId` and released when it settles. What it lacks is a
layer owned by someone else. Add one keyed by an external owner (a Sync
`opId`), installed and released by Message:

- the bridge installs a layer from each pending edit's `Operation.bind`, and
  releases it when the edit absorbs (its `revision` reached the row) or is
  rejected;
- every view of the row, `Data.filtered`'s membership and Phase 1's impact
  see the pending value, so a sorted page invalidates instead of showing the
  new value in the old place;
- Remote still stores nothing: on reload the layer is rebuilt from Sync's
  outbox, which stays the only copy (invariant 2).

This replaces most of the registry's glue: `rowsOf`'s two overlays, the
`retired` set and `retiredOf`/`settledOf`, the refresh on retire (Phase 3
delivers the settled row), and the hand-bridged `ExchangeChanged` /
`EditsRefused` dispatches, which become the bridge's Messages. It lives in a
`foldkit-sync/remote` subpath, so neither core package imports the other.

**Exit:** the registry's grid draws through Remote's reads alone, with the
listed glue deleted and its tests unchanged; a second view of an edited
product shows the pending value; a sorted page with a pending edit to its
order field refetches.

## 9. Phase 5 — persistence as a Wiring, offline end to end

Turn cloudflare's hand wiring into one call, following the KV mirror's
precedent of `restore` as a Wiring's `init`:

```ts
// Proposed
RemotePersistence.wiring(Data, {
  key: 'remote-cache',
  scope: model => /* the principal */,
  connections: [AllTodos],
  maxBytes: 5_000_000,
})
```

- `init` restores and reduces `Hydrated` with `merge: 'replace'`;
- a Subscription saves when the snapshot changes, debounced;
- a scope change (sign-out, another principal) clears the cache before the
  new principal's first read;
- never saved: optimistic layers (Phase 4 rebuilds Sync's from the outbox),
  the mutation ledger, live cursors, gaps.

**Exit:** cloudflare replaces `cache.ts`'s wiring with the call; the registry
adopts it, and an e2e test reloads it with **both** transports down and sees
cached rows with the pending edits laid over them, then reconnects and
converges; signing in as another user shows none of the first user's rows.

## 10. Phase 6 — recover from a gap

A gap or a stream error marks the stream and stops. Sync's socket transport
already has the missing policy (requeue in-flight work, jittered backoff from
50 ms to 5 s, fail fast past a retry limit, `transport.ts:367-562`); reuse it
rather than writing a second:

- resubscribe with backoff after a stream error, from the stored cursor;
- on a gap, invalidate what the stream covers, refetch, and resume from the
  cursor the refetch returns;
- expose stream health as Model state, as Sync exposes `ReplicaStatus`.

**Exit:** a test drops the transport mid-stream and a write made meanwhile
reaches the view after reconnect; a forced gap converges without a reload.

## 11. Deferred, with the condition that opens each

| Item | Opens when |
| --- | --- |
| Incremental local query maintenance and indexes (possibly `d2ts`) | A measured read path in an example exceeds a frame; local-execution's §3.3 memo comes first |
| Optimistic Remote inserts placed through the body (`optimistic.ts` still uses `prepend`/`append`) | Phase 1 lands; same `belongsEncoded` call, could join it |
| Ordered local placement | Declared collation (local-execution Phase 4) |
| `Expr` growth: `and`/`or`/`not`, comparisons, `in` | An example query that cannot be written; each by data-query §6.0.2 |
| `insert`/`delete` operations, and a Sync row-create path | An example that creates rows offline |
| Range and phantom dependencies for live queries | Phase 3 publishes, and field-level invalidation measurably over-fetches |
| Remote live over Sync's socket, one connection per app | Phases 3 and 6 land and an app measurably pays for two |
| Versioned snapshots across nodes, CDC | A deployment with writers outside Foldkit Plus |

## 12. Declined

- **Remote queueing its own mutations.** Two outboxes would be two owners for
  one fact. Durability is Sync's; Phase 2 shares the operation and Phase 4
  shares the display.
- **`Operation.make` with declared traits, and a "semantic program IR".** A
  trait such as `Deterministic` is a claim nothing checks. Operators stay a
  closed set with stated semantics; `Operation.update` is a write over that
  set, not an extension point.
- **A `foldkit-query-plan` package.** Analysis is small and pure, and lives
  in `foldkit-entity` (dependencies) and `foldkit-remote` (impact).
- **A coverage tagged union.** local-execution §9.5 chose `complete: boolean`.
- **A Convex-like server runtime, hosting, distributed transactions across
  external APIs.**

## 13. Sequence

```text
0 budget + dependency roles ──► 1 EntityChange + impact + requestId on the wire
                                  │
                                  ├──► 2 Operation.update (Remote + Sync) ──► 3 publish on commit
                                  │                                   │
                                  └───────────────────────────────────┴──► 4 Sync edits as Remote layers

5 persistence Wiring (independent; its registry e2e waits for 4)
6 gap recovery (independent)
```

Each phase ships as small commits with tests shown to fail by mutation; the
package README, the skill reference (`remote`, `sync`) and `CHANGELOG.md`
updated in the same change; `docs/editing-server-data.md` rewritten when
Phase 4 changes the pattern it teaches; and `pnpm check` and a Jev review
before committing.

## 14. Open questions

- Does `Invalidate` after a mutation refetch the visible page by itself, or
  does the plan need a refresh floor bump? Answer in Phase 1 from the read
  entry's restart condition, with a test, before writing the docs.
- Does `Operation.update` replace `EditableEntity`'s `Change`, or does
  `EditableEntity.make` derive its `Change` union from operations? The second
  keeps `merge`/`overlay`/`stamped`, which Phase 4 still needs.
- `editsJournal`'s guard is `revision <= at`; a Remote mutation has no
  revision. Do structured updates write one, so both paths order a row the
  same way?
- Should the layer of Phase 4 carry Sync's rejection reason, so a view reads
  "not saved: reason" from Remote, or stay status-free with rejections read
  from the bridge?
- Where does a change row live for a Source that is neither Drizzle nor a
  journal? An explicit `publish` hook on `MutationSource` is the likely answer.
- Stale doc: `TODO.md`'s reference-app line says the registry has no search;
  it does (`examples/registry/src/operations.ts`). Fix with Phase 4's docs.
