# Plan: a declarative write side for Remote, and where it meets Sync, Form and Crud

**Status:** proposed, 2026-10-09. Nothing here is built.
**Source:** [remote-improvement-DESIGN.md](./remote-improvement-DESIGN.md), an
outside review comparing Foldkit Plus with Convex, Fate and TanStack DB. This
plan checks each of its proposals against the code as of `4c4f9ba4`, and
against how Sync, Durable, Form, Crud, SSR and routing use Remote in the
examples. It keeps what the code still lacks and drops what is built or not
yet justified.
**Target packages:** `foldkit-entity`, `foldkit-remote`,
`foldkit-remote-server`, `foldkit-remote-drizzle`, `foldkit-sync`,
`foldkit-form`, `foldkit-crud`.
**Companions:** [data-query-DESIGN.md](./data-query-DESIGN.md) (the read IR),
[local-execution-DESIGN.md](./local-execution-DESIGN.md) (local evaluation),
[entity-DESIGN.md](./entity-DESIGN.md) (Entity, Form, Crud),
[guard-DESIGN.md](./guard-DESIGN.md) (authorization),
[router-DESIGN.md](./router-DESIGN.md) and [ssr-PLAN.md](./ssr-PLAN.md),
[docs/editing-server-data.md](../editing-server-data.md) (durable edits of
server data), [docs/wiring.md](../wiring.md).

Every API below is a **proposal**: names and signatures are what a phase must
make true, or deliberately replace.

## 0. Findings

1. **The read side is declarative; the write side is not.** A query body is
   data that four interpreters run and a conformance suite checks. A Remote
   mutation is a name, two Schemas and an opaque Effect, so nothing can tell
   what it changed except the patches its handler chooses to return. One
   edit-and-save is spelled out by hand in up to eight places:

   | Place | What the application writes |
   | --- | --- |
   | `Mutation.make` | input and output contract |
   | `Entity.input` + `Form.make` | the same input again, mapped to Entity fields |
   | `Data.mutate(..., { optimistic })` | the optimistic patch, rebuilt from the form value; Crud's editor cannot pass one, so cloudflare overrides its `onOut` (`examples/cloudflare/src/app.ts:184-200`) |
   | `RemoteServer.mutation(descriptor, run)` | the Drizzle `.set({...})` from the input, and the patches `run` returns |
   | `hub.changed(ref, fields)` | the fields to publish live, by hand (`examples/kitchen-sink/src/stack.ts:129`) |
   | `Data.refresh` | what else might now be wrong (CMS's `refreshedAfterChange` and `listing`, `examples/cms/src/apps/app.ts:185, 262-273`) |
   | an error prefix | a field-level refusal encoded in the error string and parsed back (`CmsSlugTaken: <key>:`, `packages/cms/src/slug.ts:6-8`; `CmsConflict` by `includes`) |
   | `basedOn` | a conflict check, written once by the CMS for its drafts |

   Nothing connects a write to the queries that read what it changed: a
   connection whose membership may have changed stays as it was until the
   application refreshes it or a live event says otherwise, and a create joins
   no list unless the server names one. cms-example-FINDINGS #19 recorded the
   cost: a handler that returned no patch left the store with the old title,
   and "every application meets this".

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
     membership, or a sorted page sees the server value; the doc admits an
     unabsorbed edit shows its new value in its old position
     (`editing-server-data.md:221-222`). Remote already has the piece that
     fixes this, unused here: `Data.overlay(model, id, ops)` / `Data.lift`,
     request-less layers every read draws (`packages/remote/src/index.ts:473-483`),
     which the CMS editor uses (`packages/cms/src/editor.ts:781`).
   - **One fact is described twice and the copies disagree.** Cloudflare's
     Sync Model is a hand-written `{ done: Boolean }` while its Entity says
     `done: Literals([0, 1])`, and toggling flips on the Sync path but stores
     the given value on the Remote path (`schema.ts:75, 98, 193, 567`,
     `domain.ts:16`).
   - **Offline reload has nothing to overlay.** The registry persists the
     Sync outbox but not Remote's cache. Its offline test only takes the Sync
     transport down (`test/page.test.ts:84-93`).
   - **The glue is hand-written in every app:** `onReinstall` retire logic,
     exchange status bridged by dispatch, absorption on a `setInterval`.

3. **Form and Crud stop where the write begins.** A form submits the whole
   decoded input and keeps no baseline, so nothing knows which fields the
   user changed. It is filled once and never learns the row moved on the
   server meanwhile. Crud's editor forwards the value to `data.mutate`
   through a `DomainLike` whose `mutate(model, mutation: any, input: any)`
   takes no options (`packages/crud/src/index.ts:117-127`). Server refusals
   reach fields only through `Form.Refused`, dispatched by hand after parsing
   a string. Entity-DESIGN deliberately refuses to derive endpoints from an
   Entity ("Existence of an Entity does not imply authority",
   `entity-DESIGN.md:3239`), so whatever closes this must start from a
   declared operation, never from the Entity alone.

4. **SSR and persistence restore Remote two ways that do not compose.** SSR
   resumes through `Remote.resume` (cursors included, `resume.ts`);
   persistence restores a `RemotePersistence` snapshot (no cursors). No app
   uses both, and nothing says which wins when both have the row.
   `Data.satisfy` is built and is the SSR prefetch; route-level data stays
   ordinary `Data.active` reads keyed on `model.route`, as router-DESIGN
   decided.

5. **Most of the review's roadmap is already built** (see §1).

## 1. The review's proposals against the code

| Proposal | Today | In this plan |
| --- | --- | --- |
| Normalized cache, selections, batching, optimistic mutations | Built (`foldkit-remote`) | — |
| Reference interpreter, cross-backend conformance | Built: `foldkit-entity/conformance`, run by `evaluate`, Drizzle on SQLite and PGlite, TanStack DB, LiveStore and Remote matching | Extend (§4) |
| Audit `query-native-FINDINGS` | All five fixed or obsolete; two gaps left | §4 |
| Identity-aware dependencies | Built: `FieldDependency.owner` keyed by token (`expr.ts:204`) | Split by role (§4) |
| Local evaluation of a query body | Built: `Data.filtered` → `Matched { items, complete }`, `belongsEncoded` | — |
| `Complete \| Partial \| Unknown` coverage type | Declined in local-execution §9.5 for `complete: boolean` | Not reopened |
| Live inserts placed by membership | Built: `livePolicyFor` | — |
| Request-less optimistic layers | Built: `Data.overlay` / `Data.lift` | Used for Sync (§8) |
| Ordered placement locally | Gated on declared collation | Not here |
| Incremental local query engine, indexes, `d2ts` | Not built; an unrelated write costs ~3µs a row | Deferred (§12) |
| Joins and aggregates | data-query Phase 13, gated on callers | Not here |
| Mutation write-set capture, targeted invalidation | **Missing** | §5, §6 |
| Typed mutation errors, field-level refusals | **Missing**: errors are messages; CMS encodes keys in a prefix | §5 |
| Commit-driven live publication | **Missing**: `liveHub.changed` is manual; journal settles publish nothing | §7 |
| Server-side mutation idempotency | **Missing** for Remote (`requestId` is client-only); built for Sync (Durable dedupes `opId` with a payload hash) | §5, §7 |
| Durable offline writes | **Built, as Sync** | Bridged (§8) |
| Persistence as configuration | **Missing**: apps wire it by hand (cloudflare) or not at all (registry); does not compose with SSR resume | §9 |
| Reconnect, resume, gap recovery for Remote live | **Partial**: gaps are marked; nothing resubscribes. Sync's transport has the policy | §10 |
| Prefetch on navigation, route data | `Data.satisfy` and `Site.sourcesFor` built; no Remote app adopts prefetch | Not here (router-DESIGN) |
| `delivery: 'durable'` on Remote mutations | — | Reformed: one operation, two deliveries (§6) |
| `Operation.make` with traits, a semantic program IR | — | Declined (§13) |
| Convex-level reactive server | — | Out of scope (§13) |

## 2. How the two write paths compare today

| | Remote mutation | Sync edit (registry pattern) |
| --- | --- | --- |
| Owner of the intent | the server, for the length of a request | the journal; the replica's outbox until then |
| Survives a reload or crash | no ("Remote has no outbox", `cloudflare/src/cache.ts:3`) | yes, once the IndexedDB transaction completes |
| Identity | `requestId`, client-only | `replicaId:localSequence`, deduplicated by Durable |
| Optimistic display | a layer per `requestId`, seen by every read | `EditableEntity.overlay`, applied by hand per view |
| Commit | the handler's own write | `journal.append` in one transaction, then `settle` → `apply` writes the table with a `revision` |
| How other readers learn | `hub.changed` by hand; nothing on Workers | nothing; the app refreshes, or polls |
| Rejection | `MutationFailed` with a message | `rejected` by id; `EditsRefused` dispatched by hand |
| Conflict | the handler's business (CMS: `basedOn`) | last commit wins per cell; `revision` orders row against edit |

Neither column should absorb the other. Remote owns server facts it caches;
Sync owns user intent it has not yet delivered. The plan gives them one
vocabulary for *what changed*, one declared operation for *what a write
means*, and one way for Remote to *show* what Sync still holds.

## 3. Invariants

1. **Server facts enter the Model only through Remote's Messages.**
2. **Undelivered intent is Sync's.** Remote may display a pending edit; it
   never stores, retries or drops one. Deleting Remote's cache is recovery;
   deleting Sync's outbox is data loss.
3. **A write is declared, never inferred from an Entity.** An operation is
   authority someone granted; an Entity is a shape (entity-DESIGN §27).
4. **No false completeness.** Impact analysis that cannot prove a connection
   right invalidates it, and says why.
5. **Authorization stays at the source.** Static analysis may skip work; it
   never decides what a principal sees.
6. **An opaque handler is assumed to change anything.** Its write set is what
   it returns plus conservative invalidation.
7. **Possible, targeted and actual writes are different facts.**
8. **A form's draft is the author's.** No server change rewrites it; the
   author is told and chooses (the CMS's reload-or-overwrite).
9. **Existing APIs keep working.** `Mutation.make`, `RemoteServer.mutation`,
   `Data.refresh`, `liveHub`, `RemotePersistence`, `EditableEntity`,
   `editsJournal`, `Crud.editor({ form, mutation })` remain valid.

## 4. Phase 0 — close what the findings left

- **Expression budget.** `evaluate` and the Drizzle compiler still recurse
  without memoization, so a shared DAG such as `eq(prev, prev)` nested 30
  deep is exponential at execution. Memoizing helps `evaluate` but not the
  compiler, whose SQL text is itself exponential: an expanded-size budget
  checked once at `Query.where` covers both.
- **NUL conformance case.** Both interpreters refuse NUL; the suite never
  asks.
- **Dependency roles.** `Query.dependencies` reports `where` and `orderBy`
  fields together. Report `predicate` and `order` apart, keeping `fields` as
  their union.
- **Crud's editor forgets its save on some edits.** It clears `requestId`
  only on `Changed` (`packages/crud/src/index.ts:655-656`), so an edit
  through a nested `Control` or `RowAdded`/`RowRemoved` leaves the status at
  `Saved`, against its README ("An edit after a save returns to `Editing`").
  Use `Form.authoredChanged`, as the CMS does; hold it as an `Option`.

**Exit:** a shared DAG over the budget is refused at construction; a NUL case
runs in every conformance subject; `Query.dependencies` separates roles; a
Crud test edits through a nested control after a save and reads `Editing`.

## 5. Phase 1 — one change vocabulary, impact, and typed refusals

### 5.1 Change sets and impact

A pure module in `foldkit-remote`: *given what changed and an active
connection, what keeps the connection right?*

```ts
// Proposed
interface EntityChange {
  readonly entity: string
  readonly id: string
  readonly fields: ReadonlyArray<string> // deletion is its own tag
  readonly revision?: number // when the source orders rows, as editsJournal does
}

type Impact =
  | { readonly _tag: 'Unaffected' }
  | { readonly _tag: 'Patched' }
  | { readonly _tag: 'Invalidate'; readonly reason: string }
```

`EntityChange` is the one shape every producer speaks: a `MutationAnswer`
(this phase), a structured operation's actual changes (§6), a journal
settle's applied `Change`s (§7), a pending Sync edit shown as a layer (§8).

For each active connection with a `Query.define` body:

- no field the body reads changed: `Unaffected`, or `Patched` when selected;
- a predicate field: `belongsEncoded` against the patched row. `yes` for a
  row already in it, or `no` for one not in it, keeps membership; anything
  else invalidates;
- an order field of a row in a paginated connection: invalidate, since the
  row that fills its place may not be loaded. This is also the registry's
  "new value in its old position";
- a deletion: drop the edge (reconcile already tombstones);
- a created row: `belongsEncoded`; `yes` on a terminal end places it, as
  `LiveInsertion` does for live inserts; otherwise invalidate. This is what
  makes a create join its list without a hand-written `ConnectionChange`;
- an opaque `Query.make`: invalidate when the entity matches.

`MutationSucceeded` applies `Invalidate` through the path `Data.refresh` uses.
Before claiming that refetches, follow what restarts a read entry after an
invalidation (see "It retries is a claim about what restarts it" in
`AGENTS.md`).

### 5.2 Typed refusals

A mutation declares what it refuses, as data a client can match:

```ts
// Proposed
const SavePost = Mutation.make('SavePost', {
  Input: PostInput,
  Output: { id: Schema.String },
  Refusal: Schema.Union([
    Refusal.field('slug', 'taken'),       // { _tag: 'Field', key: 'slug', reason: 'taken' }
    Refusal.conflict,                     // { _tag: 'Conflict', current: revision }
  ]),
})
```

`MutationStatus.Failed` carries the decoded refusal beside the transport
error. `Crud.editor` dispatches `Form.Refused({ key, error })` for every
`Field` refusal whose key is in the form, so no app parses a string; a
`Conflict` becomes the editor's `Conflict` status, which today only the CMS
has. The CMS's `slugTaken` prefix and `includes('CmsConflict')` move onto it.

### 5.3 The request id on the wire

Send `requestId` and pass it to `MutationSource.run`, so a server can
recognise a retry. Deduplicating it is §7's, because it must be atomic with
the write.

**Exit:** a rename updates every selecting view and fetches nothing; a
category change invalidates the category connections and only those; a price
change in a paged, price-ordered connection invalidates it; a create joins a
loaded terminal list it belongs to; the CMS's `refreshedAfterChange` and
`listing` refresh, and its slug and conflict string parsing, are deleted with
its tests unchanged. Impact is a pure table, each rule with a mutation in
`test/*.mutations.ts`.

## 6. Phase 2 — a structured write, from form to table, delivered either way

A mutation whose effect is data, declared beside the Entity over the
existing `Expr` nodes and frozen like a query body:

```ts
// Proposed
const EditPost = Operation.update(Post, {
  id: Expr.input('id'),
  set: { title: Expr.input('title'), published: Expr.input('published') },
  expect: 'revision', // optional: refuse with Conflict if the row moved on
})
```

| Stage | When | Derived |
| --- | --- | --- |
| Possible writes: `Post.title`, `Post.published` | definition | which query definitions it can affect |
| Targeted writes: `Post:p1.title` | `Operation.bind(op, input)` | the optimistic patch |
| Actual changes | execution | the returned patches, and Phase 1's `EntityChange`s |

### 6.1 Readers of one operation

- **Form.** The operation's `set` keys and their Entity fields are what
  `Entity.input` maps by hand today: `Form.make` can take the operation, and
  its labels, controls and checks come out as they do now. `fill` records the
  values it filled as a baseline, so a submit knows which keys the author
  changed; the bound operation writes only those, which narrows its write
  set and so its impact.
- **Crud.** `Crud.editor({ form, operation })` derives the mutation input and
  the optimistic patch, so cloudflare's `onOut` override goes. `DomainLike`
  gains the options it lacks and loses its `any` parameters. The editor's
  status gains `Conflict` from §5.2 and `Moved`: the row's `revision` passed
  the baseline's while the author edited (Phase 3 delivers it live), shown
  and never applied to the draft (invariant 8).
- **Remote, online.** `RemoteServer.mutation` runs the compiled update and
  returns the written fields.
- **Sync, durable.** `EditableEntity`'s `Change` is already a single-row
  field set, and `editsJournal`'s `apply` is a hand-written interpreter of it
  with a revision guard (`examples/registry/src/server.ts:105-113`). The same
  operation is the payload of a Sync fact, and `apply` is derived from it.

This is the review's `delivery: 'durable'` without its problem: Remote queues
nothing. Durability stays Sync's; the two paths share the operation's
meaning, which is what disagreed in cloudflare. And it keeps invariant 3:
nothing is generated from the Entity; the operation is the grant, which is
also where guard-DESIGN's `Guards.guarded` can read the write's plan (TODO
"6. Writes").

Start with `update` by id with literal or input values, then `delete` by id
(Crud's remover), then `insert` with a client-minted id (the CMS and
cloudflare already mint ids on the client). `where`-targeted updates and
computed values follow only when an example needs them, each with a
conformance case (data-query §6.0.2: semantics before interpreters). A
handler stays the escape hatch, under invariant 6.

**Exit:** `examples/entity`'s edit and delete, and cloudflare's create,
rename, toggle and delete, are operations: their `Mutation.make`s, Drizzle
`.set`s, returned patches and optimistic patches are deleted, and the toggle
means one thing on both paths; the registry's `apply` and `columnOf` are
derived; a form edit of one field writes one column; a conformance case runs
each operation against the reference store, SQLite and PGlite.

## 7. Phase 3 — publish on commit, from both paths

Two commit points exist, and both know what they changed: a structured
operation (or a handler inside a remote-drizzle `transaction(...)` that
collects the changes it is told about), and `editsJournal.settle`, which
calls `apply` once per committed `Change`. Each publishes its
`EntityChange`s **after commit**, nothing on rollback, and one transaction's
changes as one live event.

In one process they publish to `liveHub`. Across requests, as on Workers,
an in-memory hub reaches nobody (the Workers trap in `AGENTS.md`), so a live
source reads a durable log by cursor. For journal-written data that log
exists: Durable's `operations` table is ordered and gap-free. For Remote
mutations, the commit writes a change row in the same transaction, and with
it the `requestId` dedupe row, so a retry finds it. Durable's `runEffect`
keys a result too, but it is not atomic with the mutation's own write.

**Exit:** kitchen-sink's rename reaches a second client with the
`liveHub.changed` call deleted; a registry edit settled by the journal reaches
another device's Remote page without `Products.refresh`; a rolled-back
transaction publishes nothing; a two-entity transaction arrives as one event;
cloudflare's live source reads the log instead of diffing a poll; a retried
mutation runs once; a Crud editor open on a row another client saves reads
`Moved` with its draft intact.

## 8. Phase 4 — Sync's pending edits as Remote overlays

`Data.overlay(model, id, ops)` already shows operations no request owns, in
every read, until `Data.lift`. The bridge uses it with the Sync `opId` as
the id:

- it overlays each pending edit's bound operation, and lifts it when the
  edit absorbs (its `revision` reached the row) or is rejected;
- every view of the row, `Data.filtered`'s membership and Phase 1's impact
  see the pending value, so a sorted page invalidates instead of showing the
  new value in the old place;
- Remote still stores nothing: overlays are not persisted, and on reload they
  are rebuilt from Sync's outbox, the only copy (invariant 2).

This replaces most of the registry's glue: `rowsOf`'s two overlays, the
`retired` set and `retiredOf`/`settledOf`, the refresh on retire (Phase 3
delivers the settled row), and the hand-bridged `ExchangeChanged` /
`EditsRefused`, which become the bridge's Messages. A rejection carries its
reason the way §5.2's refusals do, so a cell reads it from one place. It
lives in a `foldkit-sync/remote` subpath, so neither core package imports
the other.

**Exit:** the registry's grid draws through Remote's reads alone, with the
listed glue deleted and its tests unchanged; a second view of an edited
product shows the pending value; a sorted page with a pending edit to its
order field refetches.

## 9. Phase 5 — persistence as a Wiring, and its order with SSR

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

- `init` restores and reduces `Hydrated`;
- a Subscription saves when the snapshot changes, debounced;
- a scope change (sign-out, another principal) clears the cache before the
  new principal's first read, and the same scope names Sync's storage, so
  the two cannot disagree about whose data is on the device;
- never saved: overlays and optimistic layers, the mutation ledger, live
  cursors, gaps.

**With SSR.** A page that was server-rendered and also has a saved snapshot
gets facts from both. The resumed ones are newer: restore the snapshot with
`merge: 'preserve-existing'` after resume, so it fills only what the page
did not carry. The two formats stay separate on purpose (resume carries
cursors for one page load; a snapshot must outlive them).

**Exit:** cloudflare replaces `cache.ts`'s wiring with the call; the registry
adopts it, and an e2e test reloads it with **both** transports down and sees
cached rows with pending edits overlaid, then reconnects and converges;
signing in as another user shows none of the first user's rows; a test
resumes an SSR page over an older snapshot and draws the resumed values.

## 10. Phase 6 — recover from a gap

A gap or a stream error marks the stream and stops. Sync's socket transport
already has the policy (requeue in-flight work, jittered backoff from 50 ms
to 5 s, fail fast past a retry limit, `packages/sync/src/transport.ts`);
reuse it:

- resubscribe with backoff after a stream error, from the stored cursor;
- on a gap, invalidate what the stream covers, refetch, and resume from the
  cursor the refetch returns;
- expose stream health as Model state, as Sync exposes `ReplicaStatus`.

**Exit:** a test drops the transport mid-stream and a write made meanwhile
reaches the view after reconnect; a forced gap converges without a reload.

## 11. Documentation

Each phase updates the package README, the skill reference (`remote`,
`sync`, `entity` for Form and Crud) and `CHANGELOG.md` in the same change.
Beyond those:

- `docs/editing-server-data.md` is rewritten when Phase 4 changes the
  pattern it teaches.
- `cms-DESIGN.md:234` says "Remote has no overlay without a request today";
  `Data.overlay` exists. Correct it with Phase 4.
- `TODO.md`'s reference-app line says the registry has no search; it does
  (`examples/registry/src/operations.ts`).
- `persistence.ts:9` says snapshots are "for SSR"; SSR uses `Remote.resume`.

## 12. Deferred, with the condition that opens each

| Item | Opens when |
| --- | --- |
| Single-flight: a mutation's answer carries the refetch of what it invalidated (router-DESIGN, deferred on a benchmark) | Phase 1 lands; measure the CMS's save-then-refetch round trip |
| Incremental local query maintenance and indexes (possibly `d2ts`) | A measured read path exceeds a frame; local-execution's §3.3 memo first |
| Optimistic Remote inserts placed through the body (`optimistic.ts` uses `prepend`/`append`) | Phase 1's create rule lands; same call |
| Ordered local placement | Declared collation (local-execution Phase 4) |
| `Expr` growth: `and`/`or`/`not`, comparisons, `in` | An example query that cannot be written |
| `where`-targeted and computed-value operations | An example that needs one |
| Disabled fields and Crud's `may` from the operation's guard | guard-DESIGN's slices that touch writes (TODO "7. `may`") |
| Range and phantom dependencies for live queries | Field-level invalidation measurably over-fetches |
| Remote live over Sync's socket, one connection per app | An app measurably pays for two |
| Prefetch on navigation in a Remote app | router-DESIGN's adoption gate: a Site + Remote application |
| Versioned snapshots across nodes, CDC | Writers outside Foldkit Plus |

## 13. Declined

- **Remote queueing its own mutations.** Two outboxes would be two owners for
  one fact. Durability is Sync's; Phase 2 shares the operation and Phase 4
  shares the display.
- **Generated create/update/delete per Entity.** Invariant 3; entity-DESIGN
  §27 and its "no hidden CRUD endpoints".
- **Rewriting a draft when the server row changes.** Invariant 8: Crud reads
  `Moved`; the author chooses.
- **`Operation.make` with declared traits, a "semantic program IR".** A trait
  is a claim nothing checks; operators stay a closed set.
- **A `foldkit-query-plan` package.** Analysis lives in `foldkit-entity` and
  `foldkit-remote`.
- **A coverage tagged union.** local-execution §9.5 chose `complete: boolean`.
- **One snapshot format for SSR and persistence.** §9.
- **Route loaders.** router-DESIGN §9 and §24; reads stay keyed on the Model.
- **A Convex-like server runtime, hosting, distributed transactions.**

## 14. Sequence

```text
0 budget, dependency roles, Crud's save reset
        │
        ▼
1 EntityChange + impact + typed refusals + requestId on the wire
        │
        ├──► 2 Operation (Form, Crud, Remote, Sync) ──► 3 publish on commit
        │                                       │
        └───────────────────────────────────────┴──► 4 Sync edits as Remote overlays

5 persistence Wiring (independent; its registry e2e waits for 4)
6 gap recovery (independent)
```

Each phase ships as small commits with tests shown to fail by mutation, the
documentation in §11, and `pnpm check` and a Jev review before committing.

## 15. Open questions

- Does `Invalidate` refetch the visible page by itself, or does the plan need
  a refresh floor bump? Answer in Phase 1 from the read entry's restart
  condition, with a test, before writing the docs.
- Does `Form.make` take an operation in place of `Entity.input`, or does
  `Entity.input` grow an operation form? The second keeps one way to say
  "this key is that field".
- Does `Operation.update` replace `EditableEntity`'s `Change`, or does
  `EditableEntity.make` derive its `Change` union from operations? The
  second keeps `merge`/`overlay`/`stamped`, which Phase 4 still needs.
- `expect: 'revision'` needs a revision column. Is that an Entity
  declaration (one field the operation bumps), so `editsJournal` and Remote
  order a row the same way?
- Is a refusal's Schema part of `Mutation.make`, or of the operation, with
  `Mutation.make` gaining it only for handlers?
- Where does a change row live for a Source that is neither Drizzle nor a
  journal? An explicit `publish` hook on `MutationSource` is the likely
  answer.
