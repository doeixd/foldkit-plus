# Plan: a declarative write side for Remote

**Status:** proposed, 2026-10-09. Nothing here is built.
**Source:** [remote-improvement-DESIGN.md](./remote-improvement-DESIGN.md), an
outside review comparing Foldkit Plus with Convex, Fate and TanStack DB. This
plan checks each of its proposals against the code as of `4c4f9ba4`, keeps
the ones the code still lacks, and drops the ones already built or not yet
justified.
**Target packages:** `foldkit-entity`, `foldkit-remote`,
`foldkit-remote-server`, `foldkit-remote-drizzle`.
**Companions:** [data-query-DESIGN.md](./data-query-DESIGN.md) (the read IR),
[local-execution-DESIGN.md](./local-execution-DESIGN.md) (local evaluation),
[guard-DESIGN.md](./guard-DESIGN.md) (authorization),
[docs/editing-server-data.md](../editing-server-data.md) (durable edits),
[docs/wiring.md](../wiring.md).

Every API below is a **proposal**: names and signatures are what a phase must
make true, or deliberately replace.

## 0. The finding

The review's central claim holds, and it is narrower than its roadmap:

> **The read side is declarative; the write side is not.** A query body is
> data that four interpreters run and a conformance suite checks. A mutation
> is a name, two Schemas and an opaque Effect, so nothing can tell what it
> changed except the patches its handler chooses to return.

So one effect of one write is spelled out by hand in up to five places:

| Place | What the application writes |
| --- | --- |
| `Mutation.make` | input and output contract |
| `Data.mutate(..., { optimistic })` | the optimistic patches |
| `RemoteServer.mutation(descriptor, run)` | the database write, and the patches `run` returns |
| `hub.changed(ref, fields)` | the fields to publish live, called by hand after the write (`examples/kitchen-sink/src/stack.ts:129`) |
| `Data.refresh` | whatever else might now be wrong |

Nothing connects a mutation's writes to the queries that read those fields:
after a mutation, a connection whose membership may have changed stays as it
was until the application refreshes it or a live event says otherwise.

The rest of the review's roadmap is largely built already. See §1.

## 1. The review's proposals against the code

| Proposal | Today | In this plan |
| --- | --- | --- |
| Normalized cache, selections, batching, optimistic mutations | Built (`foldkit-remote`) | — |
| Reference interpreter, cross-backend conformance | Built: `foldkit-entity/conformance`, run by `evaluate`, Drizzle on SQLite and PGlite, TanStack DB, LiveStore and Remote matching | Extend (§3) |
| Audit `query-native-FINDINGS` | All five fixed or obsolete (§3 lists two gaps left) | §3 |
| Identity-aware dependencies | Built: `FieldDependency.owner` keyed by token (`expr.ts:204`) | Split by role (§3) |
| Local evaluation of a query body | Built: `Data.filtered` → `Matched { items, complete }`, `belongsEncoded` (`matching.ts`) | — |
| `Complete \| Partial \| Unknown` coverage type | Declined in local-execution §9.5 for `complete: boolean` | Not reopened |
| Live inserts placed by membership | Built: `livePolicyFor` ignores a row the body excludes | — |
| Ordered placement locally | Gated on declared collation (local-execution Phase 4) | Not here |
| Incremental local query engine, indexes, `d2ts` | Not built; measured read cost ~3µs per row per unrelated write | Deferred (§9) |
| Joins and aggregates | data-query Phase 13, gated on callers | Not here |
| Mutation write-set capture and targeted invalidation | **Missing** | §4, §5 |
| Commit-driven live publication | **Missing**: `liveHub.changed` is manual; remote-drizzle has no transaction wrapper | §6 |
| Persistence as configuration | **Missing**: `RemotePersistence.save/restore` exist; apps wire restore and save by hand (`examples/cloudflare/src/cache.ts`, `app.ts`) | §7 |
| Reconnect, resume, gap recovery | **Partial**: gaps are detected and marked; nothing resubscribes or refetches | §8 |
| Server-side mutation idempotency | **Missing**: `requestId` is client-only; `MutationSource.run` never sees it | §4 |
| Durable offline Remote mutations (`delivery: 'durable'`) | Durable edits of server data go through a Sync journal, by design | Declined (§10) |
| `Operation.make` with traits, a semantic program IR | — | Declined (§10) |
| Convex-level reactive server (range dependencies, versioned snapshots, CDC) | — | Out of scope (§10) |

## 2. Invariants

Kept from the review where the code already honours them, so a phase cannot
quietly break them:

1. **Server facts enter the Model only through Remote's Messages.** A change
   set is a Message payload, not a side channel.
2. **No false completeness.** A local answer is `complete` only under the
   conditions `Data.filtered` already checks; impact analysis that cannot
   prove a connection right invalidates it.
3. **Proving a local update insufficient is a result, not a failure.**
   Impact returns `Invalidate` with a reason as readily as `Patch`.
4. **Authorization stays at the source.** Static analysis may skip work; it
   never decides what a principal sees. Live re-reads stay per principal.
5. **An opaque handler is assumed to change anything.** Its write set is
   whatever it returns plus conservative invalidation, never inferred from its
   input Schema.
6. **Possible, targeted and actual writes are different facts.** A
   definition's write set must not stand in for what an execution changed.
7. **Existing APIs keep working.** `Mutation.make`, `RemoteServer.mutation`,
   `Data.refresh`, `liveHub` and `RemotePersistence` remain valid.

## 3. Phase 0 — close what the findings left

The query-native findings are fixed, with two gaps:

- `evaluate` (`holds`/`sideOf`) and the Drizzle compiler (`predicate`/`side`)
  still recurse without memoization, so a shared DAG such as
  `eq(prev, prev)` nested 30 deep stays exponential at execution even though
  `walk` and `fieldsIn` are not. Memoizing helps `evaluate` (per row) but not
  the compiler, whose SQL text is itself exponential in the graph's depth: an
  expanded-size budget checked once at `Query.where`, where the graph is
  already walked, covers both.
- The conformance suite has Unicode cases but no NUL case, though both
  interpreters refuse NUL.

And one addition the later phases need:

- `Query.dependencies` returns one `fields` list for `where` and `orderBy`
  together. Impact (§4) needs to know a field's role: a predicate field can
  change membership, an order field position. Report them apart
  (`predicate`, `order`), keeping `fields` as their union.

**Exit:** a shared DAG whose expanded size is over the budget is refused at
construction, and one under it evaluates and compiles; a NUL case runs in every conformance subject;
`Query.dependencies` separates roles, with a test where a field is in both.

## 4. Phase 1 — change sets and impact (pure)

A pure module in `foldkit-remote` that answers: *given what a write changed
and an active connection, what keeps the connection right?*

```ts
// Proposed
interface EntityChange {
  readonly entity: string
  readonly id: string
  readonly fields: ReadonlyArray<string> // changed keys; deletion is its own tag
}

type Impact =
  | { readonly _tag: 'Unaffected' }
  | { readonly _tag: 'Patched' }            // only selected fields changed
  | { readonly _tag: 'Invalidate'; readonly reason: string }
```

It is built from what a `MutationAnswer` already carries (patches and
deletions), so it needs no server change to start. For each active
connection with a `Query.define` body:

- a change to no field the body reads, on an entity it ranges over:
  `Unaffected` or `Patched`;
- a change to a predicate field: decide with `belongsEncoded` against the
  patched row. `yes` for a row already in the connection, or `no` for a row
  not in it, leaves membership alone; anything else, including `unknown`,
  invalidates;
- a change to an order field of a row in a paginated connection:
  invalidate, since the row that fills its place may not be loaded (the
  review's example, and local-execution §9.4);
- a deletion: drop the edge where present (reconcile already tombstones);
- a connection over an opaque `Query.make`: invalidate when the entity
  matches. Opaque bodies declare nothing, so nothing narrower is sound.

`MutationSucceeded` then applies `Invalidate` through the same path
`Data.refresh` uses. Before claiming that this refetches, follow what restarts
a read entry after an invalidation: a refresh that changes nothing in the
plan restarts nothing (see "It retries is a claim about what restarts it" in
`AGENTS.md`).

In the same phase, send the `requestId` on the wire and pass it to
`MutationSource.run`, so a server can deduplicate a retried mutation. The
client already reconciles once per id; the server cannot tell a retry from a
second request.

**Exit:** a rename updates every selecting view and fetches nothing; a
category change invalidates the category connections and only those; a price
change to a row in a paged, price-ordered connection invalidates it; a
connection over an unrelated entity is `Unaffected`; a mutation re-sent with
its `requestId` reaches the handler with that id. Impact is tested as a pure
table against `evaluate`-derived expectations, and each rule has a mutation
in `test/*.mutations.ts`.

## 5. Phase 2 — a structured write: `Operation.update`

The review's strongest proposal, scoped to one operation first. A mutation
whose effect is data, defined beside the Entity:

```ts
// Proposed
const RenameProduct = Mutation.define('RenameProduct', {
  Input: { id: Schema.String, name: Schema.String },
  operation: Operation.update(Product, {
    id: Expr.input('id'),
    set: { name: Expr.input('name') },
  }),
})
```

The operation is frozen data over the existing `Expr` nodes, owned by
`foldkit-entity` like a query body. From it:

| Stage | When | Derived |
| --- | --- | --- |
| Possible writes: `Product.name` | definition | which query definitions it can affect |
| Targeted writes: `Product:p1.name` | `Operation.bind(op, input)` | the optimistic patch, with no `optimistic` option |
| Actual changes | execution | the patches returned, and the `EntityChange`s Phase 1 reads |

Each interpreter does what it does for query bodies today: the Drizzle
binding compiles the update and returns the written row's selected fields;
`remote-server` runs it as a `MutationSource` with the source's
authorization; the client derives the optimistic patch. `RemoteServer.mutation`
with a handler stays as the escape hatch, under invariant 5.

Start with `update` by id with literal or input values. `insert`, `delete`,
`where`-targeted updates and computed values (`updatedAt`) follow only when
an example needs them, each with a conformance case: the write side gets the
same rule as operators (data-query §6.0.2), semantics before interpreters.

**Exit:** `examples/registry` or `examples/kitchen-sink` drops its hand-written
optimistic patch and its returned patches for one mutation, and behaves the
same; a conformance case runs the operation against the reference store,
SQLite and PGlite and compares the resulting rows.

## 6. Phase 3 — publish on commit

`liveHub.changed` is called by application code, after the write and outside
any transaction, naming the fields again. With Phase 2's actual changes in
hand, the server can:

- run a structured operation (or a handler, through an explicit
  `transaction(...)` wrapper in remote-drizzle that collects the changes it
  is told about) inside a database transaction;
- publish the collected changes to the hub **after commit**, and nothing on
  rollback;
- deliver one transaction's changes to a subscriber as one live event, so a
  view never draws half of it. `MutationSucceeded` is already one Message per
  answer; live events are per entity today.

Across processes and requests the hub is not enough: on Workers an in-memory
hub reaches nobody (see the Workers trap in `AGENTS.md`), and
`examples/cloudflare` polls D1 instead. The commit path therefore writes a
change log row in the same transaction, which a polling `LiveSource` reads.
The in-memory hub stays for a single process.

**Exit:** kitchen-sink's rename reaches a second client's live view with the
`liveHub.changed` call in `stack.ts` deleted; a rolled-back
transaction publishes nothing; a two-entity transaction arrives as one event;
the cloudflare example reads the change log instead of diffing a poll.

## 7. Phase 4 — persistence as a Wiring

Turn the cloudflare example's hand wiring into one call, following the KV
mirror's precedent of `restore` as a Wiring's `init`:

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
  new principal's first read, so no private row is drawn for the next one;
- what is never saved stays never saved: optimistic layers, the mutation
  ledger, live cursors, gaps.

**Exit:** `examples/cloudflare` replaces `cache.ts`'s wiring with the call;
an e2e test loads, goes offline, reloads and sees cached rows, then signs in
as another user and sees none of the first user's.

## 8. Phase 5 — recover from a gap

A gap or a stream error marks the stream and stops. Add the missing half:

- resubscribe with backoff after a stream error, from the stored cursor;
- on a gap, invalidate what the stream covers, refetch, and resume from the
  cursor the refetch returns, so no event between the two is lost or doubled;
- expose stream health as Model state (`Data.live` status), not a log.

**Exit:** a test drops the transport mid-stream and a write made meanwhile
reaches the view after reconnect; a forced gap converges to the server's
state without a page reload.

## 9. Deferred, with the condition that opens each

| Item | Opens when |
| --- | --- |
| Incremental local query maintenance and indexes (TanStack DB-style, possibly `d2ts`) | A measured read path in an example exceeds a frame; today an unrelated write costs ~3µs a row (local-execution §16.1.1), and the §3.3 memo comes first |
| Optimistic inserts placed through the body (`optimistic.ts` still uses declared `prepend`/`append`) | Phase 1 lands, since it is the same `belongsEncoded` call; small, and could join it |
| Ordered local placement | Declared collation (local-execution Phase 4) |
| `Expr` growth: `and`/`or`/`not`, comparisons, `in` | An example query that cannot be written; each by data-query §6.0.2 |
| Range and phantom dependencies for live queries | Phase 3 publishes, and table-or-field invalidation measurably over-fetches |
| Versioned snapshot delivery across nodes, CDC | A deployment with more than one writer outside Foldkit Plus |

## 10. Declined

- **`delivery: 'durable'` on Remote mutations.** Durable edits of server data
  are Sync's: a journal owns them, the table is its read model, Remote caches
  it ([editing-server-data.md](../editing-server-data.md),
  `examples/registry`). A second durable path would be two owners for one
  fact. What Remote may add is the server-side `requestId` (Phase 1), which a
  bridge can use.
- **`Operation.make` with declared traits, and a "semantic program IR".** A
  trait such as `Deterministic` is a claim nothing checks. Operators stay a
  closed set with stated semantics and conformance cases; `Operation.update`
  is a write over that set, not an extension point.
- **A `foldkit-query-plan` package.** Analysis is small and pure and lives in
  `foldkit-entity` (dependencies) and `foldkit-remote` (impact).
- **A coverage tagged union.** local-execution §9.5 chose `complete: boolean`
  and recorded why; nothing here needs more.
- **A Convex-like server runtime, hosting, distributed transactions across
  external APIs.**

## 11. Sequence

```text
0 findings + dependency roles ──► 1 change sets + impact + requestId on the wire
                                     │
                                     ├──► 2 Operation.update ──► 3 publish on commit
                                     │
4 persistence Wiring (independent)   5 gap recovery (independent)
```

Each phase ships as small commits with tests shown to fail by mutation, the
package README, the skill reference and `CHANGELOG.md` updated in the same
change, and `pnpm check` and a Jev review before committing.

## 12. Open questions

- Does `Invalidate` after a mutation refetch the visible page by itself, or
  does the plan need a refresh floor bump? Answer in Phase 1 from the read
  entry's restart condition, with a test, before writing the docs.
- Should `Operation.update` live on `Mutation.define` (a new form beside
  `Mutation.make`), or be a separate value a server binds? The first is one
  declaration; the second keeps `Mutation` a contract.
- Where does a change log row live for a Source that is not Drizzle? An
  explicit `publish` hook on `MutationSource` is the likely answer.
- Server-side deduplication by `requestId` needs a store and a retention
  window; does it belong to remote-server, or to the application's Source?
