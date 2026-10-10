# Plan: a declarative write side for Remote, and where it meets Sync, Form and Crud

**Status:** Phases 0–2 and 4–6 done, 2026-10-10; Phase 3 in part (each
section's *As built*). §15 records the decisions taken while planning, each against the
code that settled it.
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
make true, or deliberately replace. The review's `Operation` is called
`Write` here: `Operation` already names a query operator
(`packages/entity/src/expr.ts:201`), a Sync envelope, a composition edit and
Durable's type parameter.

## 0. Findings

1. **The read side is declarative; the write side is not.** A query body is
   data that four interpreters run and a conformance suite checks. A Remote
   mutation is a name, two Schemas and an opaque Effect, so nothing can tell
   what it changed except the patches its handler chooses to return. One
   edit-and-save is spelled out by hand in up to eight places:

   | Place | What the application writes |
   | --- | --- |
   | `Mutation.make` | input and output contract |
   | `Entity.input` + `Form.make` | the input mapped to Entity fields (this one is shared: `examples/entity` passes the same `EditPostInput` to both) |
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
   declared write, never from the Entity alone.

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
| Commit-driven live publication | **Missing**: `liveHub.changed` is manual; journal settles publish nothing | §5, §7 |
| Server-side mutation idempotency | **Missing** for Remote (`requestId` is client-only); built for Sync (Durable dedupes `opId` with a payload hash) | §5, §7 |
| Durable offline writes | **Built, as Sync** | Bridged (§8) |
| Persistence as configuration | **Missing**: apps wire it by hand (cloudflare) or not at all (registry); does not compose with SSR resume | §9 |
| Reconnect, resume, gap recovery for Remote live | **Partial**: gaps are marked; nothing resubscribes. Sync's transport has the policy | §10 |
| Prefetch on navigation, route data | `Data.satisfy` and `Site.sourcesFor` built; no Remote app adopts prefetch | Not here (router-DESIGN) |
| `delivery: 'durable'` on Remote mutations | — | Reformed: one write, two deliveries (§6) |
| `Operation.make` with traits, a semantic program IR | — | Declined (§13) |
| Convex-level reactive server | — | Out of scope (§13) |

## 2. How the two write paths compare today

| | Remote mutation | Sync edit (registry pattern) |
| --- | --- | --- |
| Owner of the intent | the server, for the length of a request | the journal; the replica's outbox until then |
| Survives a reload or crash | no ("Remote has no outbox", cloudflare's `persistence` in `app.ts`) | yes, once the IndexedDB transaction completes |
| Identity | `requestId`, client-only | `replicaId:localSequence`, deduplicated by Durable |
| Optimistic display | a layer per `requestId`, seen by every read | `EditableEntity.overlay`, applied by hand per view |
| Commit | the handler's own write | `journal.append` in one transaction, then `settle` → `apply` writes the table with a `revision` |
| How other readers learn | `hub.changed` by hand; nothing on Workers | nothing; the app refreshes, or polls |
| Rejection | `MutationFailed` with a message | `rejected` by id; `EditsRefused` dispatched by hand |
| Conflict | the handler's business (CMS: `basedOn`) | last commit wins per cell; `revision` orders row against edit |

Neither column should absorb the other. Remote owns server facts it caches;
Sync owns user intent it has not yet delivered. The plan gives them one
vocabulary for *what changed*, one declared `Write` for *what an edit
means*, and one way for Remote to *show* what Sync still holds.

## 3. Invariants

1. **Server facts enter the Model only through Remote's Messages.**
2. **Undelivered intent is Sync's.** Remote may display a pending edit; it
   never stores, retries or drops one. Deleting Remote's cache is recovery;
   deleting Sync's outbox is data loss.
3. **A write is declared, never inferred from an Entity.** A write is
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
9. **A row's `revision` has one writer.** Either the journal (its commit
   sequence) or Remote writes (a counter), declared per table, never both.
10. **Existing APIs keep working.** `Mutation.make`, `RemoteServer.mutation`,
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
  Use `Form.authoredChanged`, as the CMS does.

**Exit:** a shared DAG over the budget is refused at construction; a NUL case
runs in every conformance subject; `Query.dependencies` separates roles; a
Crud test edits through a nested control after a save and reads `Editing`.

**As built** (`fb5d8ee1`, `70078283`, `41493aaf`, `1d8dcdd1`, `46465bd0`):

- The budget is `maxQueryNodes` (1,000), summed over every predicate of the
  query, each distinct node sized once.
- NUL cases could not be `cases`, whose `expected` is a list of ids, so the
  suite exports `refusals`. Running them found the Drizzle compiler answering
  `[]` for searched text holding NUL from an input; it refuses it now. TanStack
  and LiveStore do not run `contains`, so they refuse these by declaration and
  run nothing new.
- The same cases showed `Data.filtered` and the live-insert membership check
  throwing in `update` on such an input. A refused filter now answers no items
  and `complete: false`; a refused live judgement is `'unknown'`.
- Crud's `requestId` stays `string | null`: moving the editor's and remover's
  Model to `Option` changes their stored shape and every reader, which is its
  own change, not part of this fix.

## 5. Phase 1 — one change vocabulary, impact, refusals, publication

Everything in this phase works with today's opaque handlers.

### 5.1 Change sets and impact

A pure module in `foldkit-remote`: *given what changed and an active
connection, what keeps the connection right?*

```ts
// Proposed: a tagged union built with defineTaggedUnion
type EntityChange =
  | { _tag: 'Changed'; entity: string; id: string; fields: ReadonlyArray<string>; revision: Option<number> }
  | { _tag: 'Created'; entity: string; id: string }
  | { _tag: 'Deleted'; entity: string; id: string }

type Impact =
  | { _tag: 'Unaffected' }
  | { _tag: 'Patched' }
  | { _tag: 'Invalidate'; reason: string }
```

`EntityChange` is the one shape every producer speaks: a `MutationAnswer`
(this phase), a `Write`'s actual changes (§6), a journal settle's applied
`Change`s (§7), a pending Sync edit shown as an overlay (§8). A
`MutationAnswer` patch is `Changed` with the patch's keys and a deletion is
`Deleted`; `Created` comes only from a producer that knows the row is new (an
insert `Write`). A patch for a row the store did not hold is not evidence of
creation: the row may only never have been loaded.

For each active connection with a `Query.define` body:

- no field the body reads changed: `Unaffected`, or `Patched` when selected;
- a predicate field: `belongsEncoded` against the patched row. `yes` for a
  row already in it, or `no` for one not in it, keeps membership; anything
  else, including `yes` for a row not in it, invalidates: where a joining
  row goes is the server's to say until collation is declared;
- an order field of a row in a paginated connection: invalidate, since the
  row that fills its place may not be loaded. This is also the registry's
  "new value in its old position";
- `Deleted`: drop the edge (reconcile already tombstones);
- `Created`: `belongsEncoded`; `no` is `Unaffected`, anything else
  invalidates. This is what makes a create join its list without a
  hand-written `ConnectionChange`, at the cost of one refetch;
- an opaque `Query.make`: invalidate when the entity matches.

`MutationSucceeded` applies the invalidations with `Remote.refresh`'s own
reduction, factored out: `ConnectionInvalidated` marks the connection stale,
and `withRefreshRequested` starts a new generation, which restarts a read of
that connection already in flight (`packages/remote/src/index.ts:2077-2145`,
`model.ts:603`). The second half is not optional: a page requested before
the mutation committed would otherwise land after it with the old
membership. A live `ConnectionInvalidate` takes only the first half today
(`model.ts:926-930`), and gets the second for the same reason.

### 5.2 Typed refusals

A mutation declares what it refuses, as data a client can match:

```ts
// Proposed
const SavePost = Mutation.make('SavePost', {
  Input: PostInput,
  Output: { id: Schema.String },
  Refusal: [Refusal.field('slug', Schema.Literal('taken'))],
})
// Refusal.field(key, reason) → { _tag: 'Field', key, reason }
// Refusal.conflict           → { _tag: 'Conflict', current: Option<number> }
```

A handler refuses with `refuse(Refusal...)`, checked against the declared
union on the server. `MutationStatus.Failed` carries the decoded refusal as
an `Option` beside the transport error. `Crud.editor` dispatches
`Form.Refused({ key, error })` for every `Field` refusal whose key is in the
form, so no app parses a string; `Conflict` becomes the editor's `Conflict`
status, which today only the CMS has. The CMS's `slugTaken` prefix and
`includes('CmsConflict')` move onto it.

### 5.3 Publish what a mutation answers

`RemoteServer` already holds every mutation's outcome, and `liveHub.changed`
already re-reads per principal. So after `run` returns, the server publishes
the outcome's patches (each patch's keys as the fields) and deletions to the
hub itself. A handler's own write has committed by then, unless it opened a
transaction it has not closed, which §7's wrapper covers. Publishing a
returned field that did not change costs a re-read that sends nothing new;
missing one that did is the bug this removes. `liveHub.changed` stays for
writes that are not mutations (a trigger, a job).

### 5.4 The request id on the wire

Send `requestId` and pass it to `MutationSource.run`, so a server can
recognise a retry. Deduplicating it is §7's, because it must be atomic with
the write.

**Exit:** a rename updates every selecting view and fetches nothing; a
category change invalidates the category connections and only those; a price
change in a paged, price-ordered connection invalidates it, including with
that page's read in flight; a create refetches the loaded lists it may join
and no others; kitchen-sink's live rename reaches a second client with its
`liveHub.changed` call deleted; the CMS's `refreshedAfterChange` and
`listing` refresh, and its slug and conflict string parsing, are deleted with
its tests unchanged. Impact is a pure table, each rule with a mutation in
`test/*.mutations.ts`.

**As built** (`9b8d94d1`, `1eed5970`, `3ae6aa71`, `2107c3f1`, `8a8da1e8`,
`14c41831`, `b44da484`, `b8118bac`). Where it departed from the above:

- **`requestId` was already on the wire.** `MutationRequest` carried it; the
  server dropped it. §5.4 became passing it to `run`. cms-drizzle, which runs
  an application's mutation inside its own publish (and from a scheduled job
  with no request), names that call `publish:<entry>:<revision>`.
- **Changed means a new value.** A `MutationAnswer` returns more than it
  changed: the CMS returns every column, its unchanged `createdAt` among them,
  which orders the worklist, so counting patch keys refetched it on every
  autosave. `changesOf` compares each field with the base store before the
  answer. That made the planned repeated-answer guard redundant, and it was
  removed.
- **A list the answer names is kept.** A `connections` change in the answer
  is the server's word on that list (kitchen-sink's confirmed insert), so it
  is not judged again.
- **`Created` is not built.** No producer knows a row is new until §6's
  insert. A patch for a row the store did not hold is judged like any other,
  so a row that may join a list refetches that list.
- **A `Query.make` list refetches after any change to its Entity.** The entity
  example's post list now reads `Refreshing` after an edit, as it should: it
  is sorted by title.
- **Relation pages are not judged.** The CMS kept its history refresh after a
  state change: revisions are a relation page, not a query connection. Its
  worklist and site-pages refreshes are gone.
- **Refusals are one codec, not a list.** `Mutation.make({ Refusal })` takes a
  codec, usually `Schema.Union([Refusal.field(key, reason), Refusal.conflict])`,
  as `Input` and `Output` do. The Model keeps the refusal encoded on its
  `RemoteError`; `Data.refusal(model, requestId, mutation)` decodes it, beside
  its sibling `Data.mutation(model, requestId)`. `RemoteServer.refuse(mutation,
  value, message?)` checks the value against that mutation and records which
  mutation it was made for, so a Source cannot refuse as another. A refusal is
  a 422 over JSON. `Refusal.isField` and `Refusal.isConflict` are schema guards,
  so Crud and the CMS never compare a tag on an unknown value.
- **The CMS's refusals carry a string key.** The slug's key is the content
  type's, so `Cms.refusal.field(key, reason)` is a field of any key, which
  `Refusal.isField` still recognises. `Cms.slugTaken` is removed.
- **Not run:** the CMS end-to-end test (`pnpm e2e`), which starts servers and a
  browser; memory was short. The unit and browser suites of every package
  touched passed, run in groups.

## 6. Phase 2 — a declared `Write`, from form to table, delivered either way

### 6.1 The declaration

`Entity.input` already "reads an operation's input schema against an Entity"
(`packages/entity/src/index.ts:764`): each key maps to a Field, a relation,
or `Entity.unmapped`. A `Write` is that input plus what to do with it, so it
adds no second mapping vocabulary:

```ts
// Proposed. foldkit-entity: pure, frozen data.
const EditPost = Write.update(EditPostInput, {
  id: 'id',             // the input key holding the row's id
  expect: 'revision',   // optional: an input key mapped to the table's revision
})
// Every key mapped to a Field of the Entity is set; unmapped keys are not
// written. Relation keys follow when an example needs them.

// foldkit-remote: a MutationDescriptor that carries its Write.
const EditPostMutation = Mutation.update('EditPost', EditPost)
```

`Mutation.update` returns an ordinary `MutationDescriptor` (`Input` from the
write's input, `Output: { id }`) with the `Write` attached and `Refusal.conflict`
added when `expect` is given. So it registers in `Remote.make`,
`RemoteServer.make`, `Crud.editor` and `Data.mutate` as every mutation does:
no second registry.

| Stage | When | Derived |
| --- | --- | --- |
| Possible writes: `Post.title`, `Post.published` | definition | which query definitions it can affect |
| Targeted writes: `Post:p1.title` | `Write.bind(write, value, fields)` | the optimistic patch |
| Actual changes | execution | the returned patches, and Phase 1's `EntityChange`s |

### 6.2 Readers of one `Write`

- **Form.** Unchanged: `Form.make(name, EditPost.input)` takes the same
  `EntityInput` it takes today. What is new is a baseline: `fill` records the
  values it filled, and `Form.changed(model)` returns the keys the author
  changed since. Validation still decodes the whole input (entity-DESIGN's
  rule); only what is written narrows.
- **Crud.** `Crud.editor({ form, mutation: EditPostMutation })` sees the
  attached `Write` and, on submit, binds it to the value and the form's
  changed keys: the optimistic patch is derived, so cloudflare's `onOut`
  override goes, and the request carries `fields`, the changed keys.
  `DomainLike.mutate` gains the options it lacks and loses its `any`
  parameters. With `expect`, the editor also reads `Moved`: a live or
  refreshed row whose `revision` passed the baseline's while the author
  edited, shown and never applied to the draft (invariant 8).
- **Remote, online.** `RemoteServer.mutation(EditPostMutation)` with no `run`
  compiles the write through the Entity's source. That needs a write
  capability on the source, which remote-drizzle's `bind` provides; a source
  without one makes the handler-less form a type error. The server writes
  `fields ∩ set` (all set keys when `fields` is absent), with
  `where id = ? and revision = ?` under `expect`, and refuses with `Conflict`
  carrying the current revision when no row matched. It returns the written
  fields, and its actual changes are the written fields whose value differed,
  read in the same transaction.
- **Sync, durable.** `EditableEntity` keeps its `Change` as it is: one cell
  per change is the unit its last-commit-wins merge, `overlay` and `held`
  need. What is shared is the interpreter. `editsJournal`'s `apply` today is
  a hand-written single-field update with a revision guard
  (`examples/registry/src/server.ts:105-113`); remote-drizzle's binding
  derives it (`apply = Drizzle.applyEdits(binding, ProductEdits)`), compiling
  each `Change` as a one-field `Write` with the journal's guard. The registry's
  `columnOf` goes with it.

This is the review's `delivery: 'durable'` without its problem: Remote queues
nothing. Durability stays Sync's; the two paths share the meaning of a cell
write, which is what disagreed in cloudflare. Its fix is to make the Sync
path send absolute values through `EditableEntity`, as the registry does,
instead of a relative `ToggledTodo`. And invariant 3 holds: nothing is
generated from the Entity; the `Write` is the grant, which is also where
guard-DESIGN's `Guards.guarded` can read the write's plan (TODO "6. Writes").

### 6.3 Order of `Write` kinds

`update` by id first, then `delete` by id (Crud's remover), then `insert`
with a client-minted id (the CMS and cloudflare already mint ids on the
client; a server-minted id needs the optimistic temp-id story and waits for
an example). `where`-targeted updates and computed values follow only when
an example needs them, each with a conformance case (data-query §6.0.2:
semantics before interpreters). A handler stays the escape hatch, under
invariant 6.

**Exit:** `examples/entity`'s edit and delete, and cloudflare's create,
rename, toggle and delete, are `Write`s: their Drizzle `.set`s, returned
patches and optimistic patches are deleted; the toggle means one thing on
both paths; the registry's `apply` and `columnOf` are derived; a form edit of
one field writes one column; two clients editing different fields of one row
both land; an `expect` write over a moved row refuses with `Conflict`; a
conformance case runs each kind against the reference store, SQLite and
PGlite.

**As built** (`8d04ff9e`, `cf4e42fd`, `7b4aecd1`, `5ba173b1`, `76fa293f`,
`af09300c`). Where it departed from the above:

- **`Write.update(input, { id, expect? })`** is as designed; `Write.bind` takes
  the keys to write, `Write.expected` gives the encoded revision, and both
  `id` and `expect` hold their field as well as their key.
- **`Mutation.update(name, write)`** answers `{}`, not `{ id }`: the client
  named the row. It always declares `Refusal.conflict`.
- **The server takes its writer explicitly**: `RemoteServer.update(mutation,
  writer)`, not a handler-less `RemoteServer.mutation`. Resolving the Entity's
  source inside `RemoteServer.make` would have hidden which table a write
  lands in; the writer must be for the write's Entity, checked where it is
  served.
- **The baseline lives in Crud's editor, not in Form.** The CMS stores form
  Models in its drafts, so a new form field would break saved drafts; the
  editor fills the form, so it keeps what it filled with (`filledWith`) and
  compares by each key's schema (`Schema.toEquivalence`). `Form.changed` was
  not added.
- **`Moved` is Phase 3's.** Telling another client's save from one's own needs
  the baseline to follow an own save's answered revision, and the other's
  row delivered live, which Phase 3 brings.
- **`EditableEntity` keeps its `Change`**, as §15 decided; what is shared is
  the interpreter: `applyEdits(binding)` is a journal's `apply`. A table it
  writes has the journal's sequence as its revision and should not also take
  `expect` writes (§15 decision 7 asked for that to be refused where the
  binding is made; it is documented, not enforced, since the binding does not
  know which writes will use it).
- **Cloudflare's Sync toggle stays a flip.** A journal orders operations and
  dedupes a retry by operation id, so a flip there cannot undo itself; only
  the Remote path, where a retried request could, needed an absolute value.
- **Relation keys, `insert` and `delete` followed** (`985b9ba2`, `e4f1cee2`).
  A `one` relation key is a link: `Write.bind` returns it as a ref in `links`,
  Remote patches it as the ref key (`patchOfWrite`), and the writer sets the
  foreign key. `Mutation.update` and `RemoteServer.update` became
  `Mutation.write` and `RemoteServer.write`, which take any kind. A retried
  insert answers the row it made (`on conflict do nothing`); a delete of a row
  already gone succeeds; a delete from a moved revision is a conflict. Remote
  shows an inserted row (with its id) before the answer, and nothing for a
  delete.
- **`examples/entity`'s edit is a write** (`d0c46f7d`), its editor relation
  included. Its delete, and cloudflare's create, stay handlers on purpose: the
  delete removes the post's comments too, and the create confirms its insert
  into the list, which a declared insert would leave to a refetch.
- **Not built:** a `many` relation or a nested row in a write; `where`-targeted
  and computed-value writes; the conformance case over the reference store (the
  writer runs on SQLite and PGlite in
  `packages/remote-drizzle/test/writer.test.ts`). **Not run:** the registry
  sandbox's e2e test, which now writes through `applyEdits` on sql.js.

## 7. Phase 3 — commit, publish and deduplicate in one transaction

Phase 1 publishes after `run` returns, which is after commit for a handler
that commits as it goes. This phase makes it exact, and makes it work across
requests:

- **Transactions.** A `Write` runs in a transaction it owns. A handler gets
  remote-drizzle's `transaction(...)`, which collects the changes it is told
  about. Each publishes after commit, nothing on rollback, and one
  transaction's changes as one live event (`MutationSucceeded` is already one
  Message per answer; live events are per entity today).
- **Journal settles publish too.** `editsJournal.settle` calls `apply` once
  per committed `Change`; the derived `apply` of §6.2 reports each as a
  `Changed` with the journal sequence as its `revision`.
- **Across requests.** In one process changes go to `liveHub`. On Workers an
  in-memory hub reaches nobody (the Workers trap in `AGENTS.md`), so a live
  source reads a durable log by cursor. For journal-written data that log
  exists: Durable's `operations` table is ordered and gap-free. For Remote
  writes, the transaction appends a change row.
- **Deduplication.** The same transaction writes a `requestId` row; a retry
  finds it and answers with the recorded outcome. Durable's `runEffect` keys
  a result too, but it is not atomic with the write, which reopens the crash
  gap Durable's README documents. Rows are kept for a retention window the
  binding declares, since a retry older than the client's own retry budget
  cannot arrive.

**Exit:** a registry edit settled by the journal reaches another device's
Remote page without `Products.refresh`; a rolled-back transaction publishes
nothing; a two-entity transaction arrives as one event; cloudflare's live
source reads the log instead of diffing a poll; a retried mutation runs once;
a Crud editor open on a row another client saves reads `Moved` with its draft
intact.

**As built, in part** (`37bd989a`, `8b409177`, `b29781d5`):

- **`Moved`, and the rebase it needed.** Writing it found a real bug: a Crud
  editor over a write that `expect`s a revision kept the revision it was
  filled with, so its own second save was refused as a conflict with itself.
  After its own save is applied, the form now takes the revision the save
  moved the row to; a revision moved by anyone else reads `Moved`, the draft
  kept. (A save applied while another client also saves is taken as this
  editor's.) `Input.hidden()` holds text, so a numeric revision key keeps a
  visible control; a hidden number control is a Form gap.
- **Retries without a request log.** The plan put a `requestId` row in the
  write's transaction. D1 has no interactive transactions, so that row could
  not be atomic with the write there. What a retry actually breaks is a
  guarded write, which met its own revision bump and conflicted; the writer
  now reads the row when the guard misses, and one revision past the expected
  one holding exactly these values means the write landed. A guarded delete
  that finds the row gone succeeds; an insert already had `on conflict do
  nothing`. Every declared write is now retry-safe with no store. A handler
  still receives `requestId` to keep a log of its own.
- **Journal settles publish:** `applyEdits(binding, { live })` tells a hub of
  each edit it wrote. The registry does not use it yet: its client is plain
  HTTP with no live stream, and giving its 100k-row grid live rows is a
  change of its own.
- **Not built:** remote-drizzle's `transaction(...)` for handlers, one live
  event per transaction (live events are per entity; a batch event is a new
  wire variant), and the cross-request change log for Workers (cloudflare
  still polls D1). A declared write is one statement, so it is atomic
  already; what remains is for handlers that write several rows, and for
  Workers.

## 8. Phase 4 — Sync's pending edits as Remote overlays

`Data.overlay(model, id, ops)` already shows operations no request owns, in
every read, until `Data.lift`. The bridge uses it with the Sync `opId` as
the id:

- it overlays each pending edit's cell write, and lifts it when the edit
  absorbs (its `revision` reached the row) or is rejected;
- every view of the row, `Data.filtered`'s membership and Phase 1's impact
  see the pending value, so a sorted page invalidates instead of showing the
  new value in the old place;
- Remote still stores nothing: overlays are not persisted, and on reload they
  are rebuilt from Sync's outbox, the only copy (invariant 2).

This replaces most of the registry's glue: `rowsOf`'s two overlays, the
`retired` set and `retiredOf`/`settledOf`, the refresh on retire (Phase 3
delivers the settled row), and the hand-bridged `ExchangeChanged` /
`EditsRefused`, which become the bridge's Messages. A rejection is read as a
`Refusal` of §5.2, so a cell's "not saved: reason" comes from the same place
for both paths. It lives in a `foldkit-sync/remote` subpath, so neither core
package imports the other.

**Exit:** the registry's grid draws through Remote's reads alone, with the
listed glue deleted and its tests unchanged; a second view of an edited
product shows the pending value; a sorted page with a pending edit to its
order field refetches.

### As built

`3e773586`, with `fdc3f5f5` making a repeat reconcile free.

- **`foldkit-sync/remote`'s `RemoteEdits.make(Data, Edits)`.** `reconcile`
  overlays each edit its row has not reached, under an id that is the edit
  itself, encoded and named by the Entity. It relabels one the slice dropped
  as held while the cached row is below it, and lifts it once a read reaches
  it. It returns the newly `held` (the page refreshes their rows) and the
  `replaced`. The held edits live in Remote's overlays, so the registry's
  `retired` field, `retiredOf`, `retiresAny`, `settledOf` and `rowsOf`'s
  overlays are gone, and so are `EditableEntity`'s `overlay`, `held`,
  `newlyHeld`, `settled` and `shows`, which only the registry used.
- **It runs in a new `Sync.mount` hook, `afterUpdate`, not in `update`.**
  Sync replays a durable Message through `update` over the app's `initial`
  Model and refuses one that changes a field outside the shared slice; a
  reconcile there changed `remote` and failed every replica. `afterUpdate`
  follows every live update, facts and reinstalls included, and never
  replay.
- **Remote gains `Data.overlays(model)`**, the ids `overlay` shows. Reading
  `optimistic.layers` would have meant knowing Remote's internal `overlay:`
  prefix.
- The exit: the registry's tests pass with `retired` read from the held
  overlays instead. One new test reads a product through another Selection
  and sees its pending price; another resets the server while an edit is
  held, which only `clear` passes. The registry's e2e tests pass.

**Not built, and why.**

- **A sorted page does not refetch for a pending edit.** A refetch asks the
  server, which does not have the pending value yet, so the edit would still
  show in its old place. Placing a row by a value only the client has is
  the declared-collation work in §12. A committed edit reaches the order
  once the table has it, through the read its held row asks for.
- **`ExchangeChanged` and `EditsRefused` are still bridged by hand** in
  `mountRegistry`, and a refusal is not yet read as a §5.2 `Refusal`. Both
  are about the replica's status rather than the overlays; they are next
  for this seam.

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

**With SSR.** A server-rendered page that also has a saved snapshot gets
facts from both, and the resumed ones are newer. `init` runs after resume
and restores with `merge: 'preserve-existing'`, which keeps what the store
already holds (`persistence.ts:258-271`), so the snapshot fills only what
the page did not carry. The two formats stay separate (§15).

**Exit:** cloudflare replaces `cache.ts`'s wiring with the call; the registry
adopts it, and an e2e test reloads it with **both** transports down and sees
cached rows with pending edits overlaid, then reconnects and converges;
signing in as another user shows none of the first user's rows; a test
resumes an SSR page over an older snapshot and draws the resumed values.

### As built

`Data.persistence({ key, scope, connections?, snapshot?, maxBytes?,
debounce? })` (`78565403`) is a Wiring needing a `KeyValueStore`, assembled
beside `Data.wiring`. It differs from the sketch above:

- **Restore is a Subscription, not `init`.** It runs whenever `key(model)`
  changes, so a change of principal restores that principal's snapshot with
  no extra call; an `init` runs once. The cost is that the rows arrive just
  after the first frame rather than in it.
- **A save waits for its own key's restore.** `Hydrated` takes `from: key`,
  recorded as `RemoteModel.restoredFrom`. The save Subscription writes only
  while `restoredFrom` is the current key, so startup, or a principal not
  yet restored, never writes the empty store over a snapshot. This replaces
  "clear the cache before the new principal's first read": the wiring
  clears nothing. `Data.forget` stays the application's call when its
  principal changes, as cloudflare's `ActorCommitted` makes it.
- **SSR order holds without ordering.** The restore uses
  `preserve-existing`, so a fact the Model already holds, resumed or read
  since the page started, wins over the older snapshot whenever the restore
  lands. It is tested at the reducer, not yet through `foldkit-ssr`'s resume.
- Saving is debounced (250 ms by default) and best-effort. A store that
  cannot be read restores nothing and so saves nothing. A cache past
  `maxBytes` removes its key.
- **cloudflare** uses it with `snapshot: snapshotFor` and
  `KeyValueStore.layerStorage(() => localStorage)` (`5229d911`). Its tests
  drive the wiring's restore and save, including a restore that lands after
  the list's query started.

The registry adopted it after Phase 4: one cache per browser in
`localStorage`, every loaded list kept, since a list's sort and search are its
input. A page test reloads with the journal unreachable and every Remote read
held, and sees the kept rows with the pending edit over them, then converges
once both are back. It runs in jsdom, not as a browser e2e. Here, unlike in
cloudflare, the missing store was a type error: `Sync.mount` types its
`resources` against what the application's Commands and Subscriptions
require.

Not built: naming Sync's storage by the same scope.

**Found:** `placements.runtime({ resources })` does not check `resources`
against what the assembly's wirings and Subscriptions require. cloudflare
type-checks with `resources: Layer.empty`, missing both the Remote client
and the store, and the gap shows only at runtime. It predates this phase;
the fix belongs in Bundle's runtime config.

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

### As built

`6422ec1a`, with a race fixed in `6d08243c`. The live entry restarts itself:

- **No server replays, so recovery is a refetch.** Both the hub and
  cloudflare's poll number events from `after` and replay nothing, so
  "resume from the cursor the refetch returns" had no cursor to use. A
  restart resubscribes from the stored cursor, which keeps the numbering
  contiguous, and emits `RefreshStarted` over the stream's requirements,
  which the read entry refetches as it would for `Data.refresh`.
- **A break is Model state that restarts the entry.** A transport failure
  or a gap marks the stream a gap and counts a restart in
  `RemoteModel.streams`. `restarts` is a dependency of the live entry, and
  `failures` is read at the restart like the cursor, so an applied event
  resetting it restarts nothing. Further breaks while the gap is open are
  ignored, so a dying stream's last events restart it once.
- **A gap no longer heals on an in-order event.** The event ahead was
  dropped, so a later contiguous one hid a loss. Only the restart's
  `GapCleared` closes it, and it does so before resubscribing: when the two
  ran side by side, a resubscribe that failed first landed on the open gap,
  was ignored, and the stream stopped for good.
- **Health is asked per active entry:** `Data.liveStatus(model, active)` is
  `Idle | Live | Reconnecting { attempt, error }`. Keyed by stream alone, a
  stream whose requirements had changed would have left a stale
  `Reconnecting` behind, since nothing prunes per-stream state.
- The backoff is Sync's transport policy, restated rather than shared:
  Remote does not depend on Sync, and the policy is one expression.

The exit's two cases are unit tests, `test/liveRecovery.test.ts`, against a
fake client: a dropped stream whose restart shows a write made while it was
down, and a forced gap restarting once. No e2e drops a real transport yet.
What a stream covers beyond its requirements (a watched list) is the
source's to re-send on open, as cloudflare's poll does.

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
| Placing a joining or created row locally instead of refetching; optimistic inserts placed through the body (`optimistic.ts` uses `prepend`/`append`) | Declared collation (local-execution Phase 4), for ordered connections |
| `Expr` growth: `and`/`or`/`not`, comparisons, `in` | An example query that cannot be written |
| Relation keys, `where`-targeted and computed-value writes, server-minted ids | An example that needs one |
| Disabled fields and Crud's `may` from the write's guard | guard-DESIGN's slices that touch writes (TODO "7. `may`") |
| Range and phantom dependencies for live queries | Field-level invalidation measurably over-fetches |
| Remote live over Sync's socket, one connection per app | An app measurably pays for two |
| Prefetch on navigation in a Remote app | router-DESIGN's adoption gate: a Site + Remote application |
| Versioned snapshots across nodes, CDC | Writers outside Foldkit Plus |

## 13. Declined

- **Remote queueing its own mutations.** Two outboxes would be two owners for
  one fact. Durability is Sync's; Phase 2 shares the interpreter and Phase 4
  shares the display.
- **Generated create/update/delete per Entity.** Invariant 3; entity-DESIGN
  §27 and its "no hidden CRUD endpoints".
- **Rewriting a draft when the server row changes.** Invariant 8.
- **`Operation.make` with declared traits, a "semantic program IR".** A trait
  is a claim nothing checks; operators stay a closed set.
- **A `foldkit-query-plan` package.** Analysis lives in `foldkit-entity` and
  `foldkit-remote`.
- **A coverage tagged union.** local-execution §9.5 chose `complete: boolean`.
- **One snapshot format for SSR and persistence.** §15.
- **Route loaders.** router-DESIGN §9 and §24; reads stay keyed on the Model.
- **A Convex-like server runtime, hosting, distributed transactions.**

## 14. Sequence

```text
0 budget, dependency roles, Crud's save reset
        │
        ▼
1 EntityChange + impact + refusals + publish outcomes + requestId on the wire
        │
        ├──► 2 Write (Form, Crud, Remote, Sync's apply) ──► 3 transactions, log, dedupe
        │                                           │
        └───────────────────────────────────────────┴──► 4 Sync edits as Remote overlays

5 persistence Wiring (independent; its registry e2e waits for 4)
6 gap recovery (independent)
```

Each phase ships as small commits with tests shown to fail by mutation, the
documentation in §11, and `pnpm check` and a Jev review before committing.

## 15. Decisions

Each was an open question in an earlier draft; the reason is the code that
settled it.

1. **Invalidation after a mutation restarts in-flight reads.** `Remote.refresh`
   both marks a connection stale and starts a refresh generation; only the
   second stops a page requested before the commit from landing after it.
   Impact reuses that reduction, factored out of `Remote.refresh`, and the
   live `ConnectionInvalidate` path adopts it too (§5.1).
2. **The live hub publishes mutation outcomes itself.** The server has every
   outcome and the hub already re-reads per principal, so manual
   `hub.changed` for mutations is redundant; over-publishing costs a re-read,
   under-publishing is the bug (§5.3). This moved publication from Phase 3 to
   Phase 1.
3. **The write IR is `Write`, built on `Entity.input`.** `Operation` is taken
   four times. `Entity.input` already maps an operation's input to Entity
   members, so a `Write` adds only `id`, `expect` and the kind; Form needs no
   new parameter, and there is one way to say "this key is that field".
4. **A write is a `MutationDescriptor`, not a new kind of value.**
   `Mutation.update(name, write)` attaches the `Write`, so every place that
   takes a mutation takes it, and a handler-less `RemoteServer.mutation` is
   the only new server shape.
5. **`EditableEntity` keeps its `Change`; the interpreter is what is
   shared.** Its merge, overlay and held logic are per cell, and a cell is a
   one-field update. Remote-drizzle derives `editsJournal`'s `apply` from the
   binding (§6.2), rather than `EditableEntity` deriving its union from
   `Write`s.
6. **Only changed fields are written.** Validation decodes the whole input;
   the request carries the form's changed keys as `fields`, and the server
   writes `fields ∩ set`. Two authors editing different fields then both
   land, matching Sync's per-cell merge, and `expect` is needed only for
   true conflicts.
7. **`revision` is declared per table with one writer** (invariant 9). The
   remote-drizzle binding says whether a table's revision is the journal's
   sequence or a counter Remote writes increment. A `Write` with `expect` on
   a journal-revised table is refused when the binding is made, because a
   counter bump would break the journal's `at <= revision` ordering.
8. **Refusals belong to the mutation.** Handlers refuse too, so the Schema is
   on `MutationDescriptor`; `Mutation.update` adds `Refusal.conflict` when
   the write has `expect`.
9. **A Source that is neither Drizzle nor a journal publishes through its
   outcome.** Decision 2 covers it: whatever `run` returns is published. A
   custom Source that wants Phase 3's transactional log implements the same
   write capability remote-drizzle's binding does.
10. **SSR resume first, snapshot second, `preserve-existing`.** The resumed
    page is newer than any saved snapshot; the snapshot fills gaps (§9).
11. **Two restore formats stay.** Resume carries cursors valid for one page
    load; a snapshot must outlive them, and `RemotePersistence` deliberately
    strips them (`persistence.ts`). One format would make one of them wrong.
12. **A Sync rejection reads as a `Refusal`.** One shape for "not saved" lets
    a cell show the reason without knowing which path refused it (§8).

No question is left open. What remains uncertain is measured, not decided:
single-flight waits on the CMS's round trip, an incremental engine on a read
path that exceeds a frame (§12).
