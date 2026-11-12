# Alchemy Domain as a second authority: receipts, one lowered write, one scenario, the graph import (#544 to #547)

Status: decided 2026-11-12 (decisions delegated by the owner). Nothing here is
built by this note. It is Phase 6 of
[contract-layer-PLAN.md](./contract-layer-PLAN.md) (§6.6), planned whole.

It follows AGENTS.md's "Scope: build the feature": nothing below is deferred
because no application uses it yet. Each thing not built names one of the four
reasons that rule allows (it waits on upstream or on access this environment
lacks, a measured cost, an unsound design, another owner).

"Alchemy" names two things in this repository. `alchemy` and
`@alchemy.run/cloudflare` declare cloud resources (the skill's
`references/alchemy.md`); nothing here touches them. These four issues are
about **`@alchemy.run/domain`**: Commands, Aggregates that `decide` and
`evolve`, Events, typed Rejections, Views, an Api every client is derived from,
and Stories. It is an external library. Before this note it was not installed
anywhere in the workspace, and no code here imports it; only
`contract-layer-PLAN.md`, `docs/effect-ecosystem.md` and
`docs/effect-adjacent-projects.md` mention it.

## 0. Decisions

| # | Question | Decision |
| --- | --- | --- |
| D1 | Which package owns it? | A new package, **`foldkit-remote-domain`** (`packages/remote-domain`), with `@alchemy.run/domain` as a peer. Three entries: the adapter (`.`), the lowering (`./lower`), the import (`./imported`). `examples/writes-domain` is its first consumer. No existing package gains a Domain dependency. |
| D2 | Which side of Remote does the bridge sit on? | **The client's.** It is a `RemoteClient` Layer over the Domain Api's typed client. No Remote server in between. |
| D3 | Where is a receipt kept (#544)? | Two steps. First in the adapter, per View key, as the issue's first slice asks ("the existing seams"). Then **in `Remote.Model`**, as a backend-neutral read-after token and a row revision on Remote's wire (WP7), after which the adapter holds nothing. |
| D4 | What orders two snapshots of one View key? | **The row's revision field**, which the binding must name. The View cursor cannot: it does not move when state changes without an output event (probed, §2). |
| D5 | How is a Remote operation tied to a Domain `commandId`? | `commandId = mutation : operation : digest(principal, target, keys, input)`. A request with no `operation` is refused. A request made for another principal is refused before anything is sent. |
| D6 | What does a write answer when the View has not caught up? | **Committed, with the command's reply as the row's written fields**, and the read left pending. It never answers a committed write as failed, and never with a row older than the write. |
| D7 | How is the write lowered (#545)? | **`decide` runs the existing pipeline**: `RemoteServer.write` over `GuardServer.writer` over an in-memory `EntityWriter` holding the aggregate's row. No second judge is written. |
| D8 | The in-memory writer | **`RemoteServer.memoryWriter(store, entity)`** in `foldkit-remote-server`, the owner of `EntityWriter` and `MemoryStore`. `RemoteServer.memory` can then land declared writes too. |
| D9 | Which write, and where is it declared? | A new `ReserveStock` over `examples/writes`' `Product`, declared in `examples/writes-domain`. `examples/writes/src` belongs to the laws cluster's work packages, which snapshot its writes. |
| D10 | What the author supplies for a lowering | The Event class with `record` and `apply`, the revision field, the request context that names the principal, the event that makes a row exist, and the operator table. Everything else is derived. |
| D11 | The scenario fixture (#546) | One `WriteScenario` value, run by three runners (SQLite, Domain Story, Remote through the adapter). |
| D12 | #547 | `Imported.mutation` and `Imported.describe` are built now: each imported command and View as data, with schemas, bindings checked against Entity fields, and a footprint that is `Derived`, `Declared` or `Unknown`. Graph nodes and per-caller discovery wait on contract-layer Phases 3 and 4, which wait on foldkit/foldkit#1655. |
| D13 | Lists, relations, first paint, Stories as fixtures, tracing | **Built**, as WP8 to WP11, after the first slice. |
| D14 | Effect version | The pilot runs on the workspace's `effect@4.1.1`, where the probe passed. Domain peers on `^4.1.4`. Raising the workspace is the maintainer's call (§10). |
| D15 | Deploys, Durable Objects, the WebSocket protocol | **Not exercised**: this environment has no Cloudflare credentials. Everything runs on `Domain.InMemory` with `clientInProcess`; the HTTP protocol runs against a local server in WP11. |
| D16 | Domain's own Foldkit adapter (`@alchemy.run/domain/Foldkit`) | **Not used**, by design: it folds Domain state into Model fields of the application's own, a second owner beside Remote's store. |

## 1. What exists, and what is external

**In this repository:**

- `examples/writes` declares `Product`, the `Shop` guards (`isOwner`), the
  invariants `reservedWithinStock` and `publishedStaysPublished`, and five
  writes. Its `server.ts` lands them through `GuardServer.writer(…, {
  revision: 'revision' })` over `foldkit-remote-drizzle`'s `writer`, one of them
  with a ledger scoped to the principal. `test/law.test.ts` runs `Law.check`
  over them.
- `RemoteClient` (`packages/remote/src/client.ts:39`) is the transport seam:
  `read`, `query`, `mutate`, `live`. `Law.check` and `Trace.run`
  (`foldkit-remote/testing`) both run through it, so anything that provides a
  `RemoteClient` gets both unchanged.
- `EntityWriter` (`packages/remote-server/src/index.ts:354`) is the seam a
  declared write lands through. It has two implementations:
  `foldkit-remote-drizzle`'s `writer` and the wrapper `GuardServer.writer`
  returns. **No in-memory `EntityWriter` exists**: `RemoteServer.memory` takes
  hand-written `MutationSource`s.
- `Write.bind`, `Write.apply`, `Write.reads`, `Write.writes`, `Write.expected`
  (`packages/entity/src/write.ts:787`), `Entity.judge` / `judgeAgainst`
  (`invariant.ts:312`) and `Query.dependencies(…).reaches` are the pieces the
  issue calls "the existing write binding, predicate evaluation, and invariant
  judge".
- Remote already refuses to let a late live patch overwrite a write's answer:
  until the stream sends the answer's values back, the field is read again
  (#485, `packages/remote/test/echo.test.ts`). A late *read* answer is not
  ordered, because "no server sends a row revision"
  ([decisions-2026-11-12-data-platform.md](./decisions-2026-11-12-data-platform.md),
  #480's one open item).
- `Module` (`packages/surface/src/index.ts:1880`) holds contracts over Model
  paths and Message tags, with six rules. It has no operation, capability or
  law node.

**External: `@alchemy.run/domain@2.0.0-beta.86`** (published 2026-11-12; npm
`latest`). Peers: `effect ^4.1.4`, `alchemy 2.0.0-beta.86` (required), `foldkit
^0.170.0` (optional). Exports the main entry plus `./*` subpaths (`/Story`,
`/InMemory`, `/Foldkit`, `/Cloudflare`).

## 2. What was probed

A scratch project outside the repository (`npm install
@alchemy.run/domain@2.0.0-beta.86 alchemy@2.0.0-beta.86 effect`, Node 22.23.4),
once with `effect@4.1.4` and once with `effect@4.1.1`. One model: a `Product`
aggregate (`Seed`, `ReserveStock` behind a session middleware, `Touch`), a
by-id `ProductRow` View that emits an output event for `StockReserved` only,
an Api, hosted on `InMemory` and called through `clientInProcess`. The probe is
not in the tree; WP1 turns it into a checked-in test. It could not be run from
inside a workspace package, since none has Domain installed.

| # | Finding | Evidence |
| --- | --- | --- |
| P1 | A command answers `{ reply, stream, version }`. `version` counts the stream's events. | `Seed` gave `{ stream: 'Product/p1', version: 1 }`, the next command 2. |
| P2 | `snapshot(key, { atLeast })` waits for the View. With delivery paused (`InMemory.make({ manual: true })`, no `drain`) it failed `ConsistencyTimeout { view, key, stream, version }` after about 10 s. After `control.drain` it answered the new state. | Timestamps 18:14:16 to 18:14:26. |
| P3 | The Api's `ViewClient.snapshot` and `get` take no timeout. Only the in-process View service does (`View.d.ts:287`). | `Api.d.ts:83-130`. |
| P4 | A plain `snapshot` after a commit, with delivery paused, answers the state from before the write. | `reserved: 2` after a commit to 5. |
| P5 | `watch` sends `{ state, cursor }`. A state change with no output event (`Touch`) sends a new state with **the same cursor**. | `…"note":""},"cursor":1` then `…"note":"hello"},"cursor":1`. |
| P6 | A snapshot carries no stream version. A client cannot compare a snapshot with a receipt; only the server can, through `atLeast`. | `Read.d.ts` `Snapshot<S>`. |
| P7 | A resend with the same `commandId` returns the first receipt and does not run `decide`. | `decided` stayed 1. |
| P8 | The same `commandId` with **different input** also returns the first receipt, silently. | Sent `quantity: 1`, got `reserved: 5` back. |
| P9 | The same `commandId` from **another principal** also returns the first receipt. The middleware ran (the caller was authenticated); `decide`'s owner check did not. | `grace` got `ada`'s reply. |
| P10 | A Rejection reaches the client as the class instance, typed; a middleware error is a separate channel. | `{"_tag":"Invalid","rule":"reservedWithinStock"}`. |
| P11 | `decide` may be an `Effect.fn` reading a `RequestContext`; `Aggregate.predict` runs it synchronously. | `predict` gave `Accepted` with events and state. |
| P12 | `Story.given` / `when` / `then` / `replied` / `rejected` / `view` ran green over the same model. | `story Success`. |
| P13 | A command exposes `tag`, `rejects`, `events`, `middleware`, `annotations`, and its fields; a View `definition.state` with `fields`; an Api `commands` and `serves`. | Printed. |
| P14 | `Annotations` holds `description` and `httpApiCacheControl` only. There is no `Api.describe`, `needsApproval` or `access`. | `Annotations.d.ts`; grep of `lib/*.d.ts`. |
| P15 | The whole probe gave the same output on `effect@4.1.1`. | Second install with `--legacy-peer-deps`. |

Not probed: Domain's `Query`, the HTTP and WebSocket protocols, Durable Object
hosting, what an `RpcClientError` looks like when a reply is lost on a real
transport, and the state of the upstream PRs the contract-layer plan gates on
(alchemy-run/alchemy #2567, #2569). `View.snapshot` and a `watch` that carries
a cursor are both in the published beta.86, which is what that gate waited for.

## 3. D1, D2: a package, and the bridge is a `RemoteClient`

### `foldkit-remote-domain`

The contract-layer plan already rules that no existing package depends on
Domain and that the adapter is "a package of its own, with
`@alchemy.run/domain` as a peer" (§6.6). This is that package. Its entries are
separate files, since the lowering runs on a server and must not reach a page:

| Entry | Holds | Runs |
| --- | --- | --- |
| `foldkit-remote-domain` | `DomainRemote` (the `RemoteClient` Layer and its bindings) | the browser, a test |
| `foldkit-remote-domain/lower` | `Lower.check`, `Lower.write` | where the Domain model is hosted |
| `foldkit-remote-domain/imported` | `Imported.mutation`, `Imported.describe` | anywhere |
| `foldkit-remote-domain/testing` | `Fixture` (WP10): a Domain model as a `RemoteClient` for client tests | tests |

Peers: `@alchemy.run/domain` and `alchemy`, each pinned to the exact beta it
was checked against (as `foldkit-remote-drizzle` pins `drizzle-orm`), and
`effect ^4.1.0`. Its `docs/releases.md` row says "experimental: tracks a beta".
Each source file is its own build entry (`mixins-ui/tsdown.config.ts`'s rule),
and it joins `scripts/test/publishedBuild.test.ts`.

Domain is a beta that moved two releases in two weeks. That is a cost the
package carries in its pin and its `behaviour.test.ts` (WP1), which fails when
a release changes what the adapter relies on. It is not a reason to keep the
code out of a package.

### The client's side

The bridge is `Layer<RemoteClient, never, ApiClient>`: it answers Remote's four
calls from the Domain Api's typed client.

- **The issue names the seam.** #544: "use the existing `RemoteClient` read,
  mutate, and live seams". Its error list is the `RemoteClient`'s own:
  `RemoteUnreachable` exists only on that service.
- **`Law.check` and `Trace.run` work unchanged**, because both take a
  `RemoteClient`. #546 needs both.
- **The client keeps the Plus declaration.** The page still registers
  `Mutation.write('ReserveStock', …)`, so prediction, `Data.refusal`,
  `Refusal.isInvalidBy` and the write trace (#477) read the same `Write` they
  read today. Only the authority changes.
- **One hop.** Domain's Api already authenticates (middleware) and decides who
  reads each key (`validate`).

**Not built: `EntitySource` / `MutationSource` / `LiveSource` over Domain
inside a Remote server.** The reason is the design, not demand: it authorizes
every call twice (Remote's guard, then Domain's middleware and `validate`), it
is a second way to reach the same authority, and until WP7 it has nowhere to
carry a receipt.

D16 follows from the one-owner rule. `DomainFoldkit.make(Api)` hands the app
Commands whose results it folds into Model fields of its own. Beside
`Remote.Model` that is two owners of one row.

## 4. D3 to D6: the receipt-aware adapter (#544)

### The invariant

```text
accepted(key) = the newest row of that View key let through, by revision
floor(key)    = the newest receipt of a write to that key whose read is not yet confirmed

a row reaches Remote's store  only if  revision(row) >= revision(accepted(key))
a read of key                 asks     snapshot(key, { atLeast: floor(key) })  while a floor is set
floor(key) clears             when     such a read answers
```

### Where the receipt lives (D3)

**First slice (WP3): in the adapter.** #544 scopes its first slice to "the
existing seams", and `Mutation.write`'s `Output` is `{}`, so the receipt cannot
ride there. The adapter is the only reader of a receipt (P6: nothing but an
`atLeast` read can use one). The cost: this is transport state outside the
Model, and a reload loses it.

`DomainReads` makes it observable in that slice:

```ts
interface PendingRead {
  readonly entity: string
  readonly id: string
  readonly operation: string
  readonly receipt: { readonly stream: string; readonly version: number }
}
class DomainReads extends Context.Service<DomainReads, {
  /** Writes that committed whose View read is not yet confirmed. */
  readonly pending: Effect.Effect<ReadonlyArray<PendingRead>>
  /** Reads the key again at its floor: `true` once the View has the write. */
  readonly confirm: (entity: AnyEntity, id: string) => Effect.Effect<boolean>
}>()('foldkit-remote-domain/DomainReads') {}
```

**Then (WP7): in `Remote.Model`.** "One owner per datum" is the reason to move
it: a floor a reload forgets is a fact kept beside the Model. Remote's wire
gains two optional, backend-neutral things:

```ts
// wire.ts
NormalizedEntity.revision?: number        // the row's revision, when the server has one
MutationResult.after?: ReadAfter          // "a read of these rows is current only at or after this"
ReadBatch.after?: ReadonlyArray<{ entity; id; token }>      // at most 256
LiveRequirement.floors?: ReadonlyArray<{ entity; id; token }>
ReadBatchResult.behind?: ReadonlyArray<{ entity; id }>      // rows the server could not read at their token

const ReadAfter = Schema.Struct({
  token: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),   // opaque to Remote
  rows: Schema.Array(Schema.Struct({ entity: Schema.String, id: Schema.String })),
})
```

- `Remote.Model` keeps `floors` by row key and `revisions` by row key.
- **Revision.** `ReadReceived`, `LiveReceived` and `MutationSucceeded` drop a
  row whose revision is lower than the one held. This closes #480's open item
  ("a late read answer after a refresh … undecidable without a row revision on
  the wire") for every backend: `foldkit-remote-drizzle`'s source sends the
  revision when the binding names one.
- **Token.** A read of a floored row carries its token. A row named in
  `behind` keeps what the store holds and keeps its floor; any other answer
  clears it. `Data.inspect(model)` lists the floors, and `Data.why` gives
  "waiting for the server's read model" as a reason.
- For Domain the token is the receipt, `stream@version`. The adapter becomes
  stateless: `DomainReads` and both maps are deleted in the same change, so
  there is one way to ask what is pending.
- `REMOTE_PROTOCOL_VERSION` moves to 6, since `LiveRequirement` changes
  (`wire.ts:12`'s rule).
- The second backend this serves is already in the tree: D1 read replication
  hands out session bookmarks, which are exactly a read-after token. Wiring
  `foldkit-remote-drizzle` to them is not in WP7, because a D1 replica cannot
  be run here (no account); the wire and the reducer do not depend on it.

### Why revision orders snapshots (D4)

- The cursor does not move on a state-only change (P5). A by-id View that
  declares no `emit` keeps cursor 0 for good. Ordering or deduplicating by
  cursor would hide exactly the changes #544 says must be visible.
- A snapshot has no stream version (P6).
- #545 gives the aggregate an explicit row revision that every event moves, to
  match `expect`. The View state carries it. So the binding names that field,
  typed by the Entity's keys.

Two rows of one key with the same revision and different values mean an event
that did not move the revision. The later one is let through and reported once
with `Effect.logWarning`, naming the View and key.

The live cursor Remote sees is the adapter's own counter, one per `live` call,
starting at `after`. Domain's cursor is not passed through: Remote drops an
event at or before its stream's cursor, so a second state-only change would be
dropped as a duplicate.

### The command id (D5)

P8 and P9 are why the id cannot be the bare operation. Remote's ledger scopes a
record to the principal and refuses an operation recorded for another request
(`packages/remote-drizzle/src/index.ts:1953`). Domain does neither. The adapter
cannot make Domain refuse, so it makes the two cases different commands:

```text
commandId = `${mutation}:${operation}:${digest}`
digest    = a short hash of JSON [principalKey, target, keys ?? null, encoded input]
```

| Case | SQLite ledgered writer | Domain alone | Domain through the adapter |
| --- | --- | --- | --- |
| same operation, same request, same principal | answered from the record | first receipt | first receipt |
| same operation, different input | refused: "recorded for another request" | first receipt, silently | a new command, decided on its own (here `Conflict`, the revision moved) |
| same operation, another principal | another scope: decided afresh | first receipt, `decide` skipped | a new command, decided afresh (here `Forbidden`) |

The middle row still differs from the ledger. `Lower.write` closes it on the
server (§5): the lowered aggregate keeps, per `operation`, the digest it was
first sent with, and `decide` refuses another digest with a `Reused` Rejection.
That is the "further server-side binding" #545 asks the pilot to record, and
it is built. It holds only for a lowered command; an opaque one keeps the
adapter's behaviour, and P8 and P9 are reported upstream (§10).

A `MutationRequest` with no `operation` fails `RemoteMutationError` naming the
missing id: sending it without a `commandId` would make a retry a second
write. `Data.mutate` always mints one.

`config.principal` is `Effect<Option<string>>`, the key of who the Domain
session is. Results carry it as Remote's `principal`. A request whose
`principal` is set and differs fails `RemotePrincipalChanged` and sends
nothing, as Remote's server does (#405).

### `mutate`

1. Refuse a missing operation or a changed principal.
2. If this `commandId` is in the committed record, skip to 4 with its receipt.
   Otherwise send the command with the `commandId`.
3. Map what comes back:

   | Domain | Remote |
   | --- | --- |
   | a Rejection the binding maps to a refusal | `RemoteMutationError` with `refusal` encoded by the mutation's `Refusal` |
   | a Rejection the binding maps to `forbid` | `RemoteForbidden`, with the reason when given |
   | a middleware error | `RemoteUnauthenticated` or `RemoteForbidden`, by `config.denied` |
   | `RpcClientError`, a defect, an interruption by the caller's timeout | `RemoteUnreachable`: the outcome is unknown, and Remote's retry carries the same operation, so the same `commandId` |
   | a receipt | record `{ commandId, receipt, reply }`, raise `floor(key)` |

   The refusal map is typed by the command's `rejects` tags, so a Rejection
   with no entry is a type error. Tag branching goes through `Match.valueTags`
   or the union's own match.
4. Read `snapshot(key, { atLeast: receipt })` under `config.confirmWithin`
   (default 2 seconds; the adapter's own deadline, since P3 gives none and
   Domain's is about 10 s).
   - It answers: accept the row (revision rule), clear the floor, answer
     `MutationResult` with that row in `entities`.
   - `ConsistencyTimeout`, the deadline, or a transport failure: answer
     `MutationResult` with `binding.written(reply, input)` as the row's values
     (D6), and keep the floor.

### Why D6

The write committed; Remote has one state for that, `MutationSucceeded`.
Answering `Unreachable` would call a known commit unknown and, for a write that
is not durable, show it as failed. Answering success with no row releases the
optimistic layer over the old base, so the page shows the value from before
the write. The command's reply is the third thing available, and it is
authoritative for what the write set. With it in `entities`, Remote's own echo
rule (#485) keeps a lagging live patch from overwriting those fields.

`written` is required for a command bound to a declared write. For an opaque
command it is optional; without it the answer names no row, and WP7's floor is
what keeps the old row from being taken as current.

One limit: the reply is not passed through the View's `validate`. In the pilot
the Read rule and the Update rule are both `isOwner`. `DomainRemote.command`
refuses `written` where it is made when the bound Entity has a Read rule that
its Update rule does not imply by name (the same rule list); a domain that
needs it there reads through the View only.

### `read`

For each request, by its Entity's binding: `snapshot(id, { atLeast: floor })`
when a floor is set, a plain `snapshot` otherwise, each under `confirmWithin`.

- `state: null`, or a Rejection from `validate`: the row is absent to this
  caller, answered as `RemoteServer`'s read handler answers a row that is not
  there (hidden and missing read alike, as a guarded Source's do).
- A requested field the View state lacks goes in `settled`.
- A row older than `accepted(key)` is not sent: the batch answers the accepted
  row's values instead.
- `ConsistencyTimeout` or a transport failure: `RemoteUnreachable`. A middleware
  error: `RemoteUnauthenticated`.
- In the first slice a request with `relations` or `windows`, and any `query`,
  fails by name (`RemoteReadError`, `RemoteQueryError`). WP8 builds both.

### `live`

One `watch(id)` per requirement, merged. For each snapshot the watch sends:

- while `floor(key)` is set, the snapshot is only a signal: the adapter reads
  `snapshot(id, { atLeast: floor })` again, and sends that row if it answers
  (confirming the read), nothing if it does not;
- otherwise the revision rule decides whether it is sent;
- a sent row is `EntityPatched` with `changed` the fields that differ from the
  accepted row; `state: null` after a row is `EntityDeleted`.

This is the issue's "use the View's state watch to continue observing it": the
watch is what retries the pending read.

### The binding API

```ts
const Reads = DomainRemote.view(Product, ShopApi, 'ProductRow', { revision: 'revision' })

const Reserve = DomainRemote.command(ReserveStock, ShopApi, 'ReserveStock', {
  target: input => input.id,
  input: input => ({ quantity: input.quantity, revision: input.revision }),
  refusals: {
    Conflict: () => DomainRemote.refuse({ _tag: 'Conflict' }),
    Unmet: () => DomainRemote.refuse({ _tag: 'Unmet' }),
    Invalid: rejection => DomainRemote.refuse(invalidOf(rejection)),
    Forbidden: () => DomainRemote.forbid(),
    NotFound: () => DomainRemote.fail('no such product'),
    Reused: () => DomainRemote.fail('this operation was sent before with another request'),
  },
  written: reply => reply,
})

const Client = DomainRemote.layer(ShopApi, {
  views: [Reads],
  commands: [Reserve],
  principal,                       // Effect<Option<string>>
  denied: error => 'Unauthenticated',
  confirmWithin: '2 seconds',
})
```

For a lowered write, `Lower.write` returns these two bindings ready-made
(`Reserved.binding`, `Reserved.reads`), so an author writes the table above
only for a command Domain declared by hand.

Rules for the implementer:

- View and command names are typed by the Api's own names (`Api.ViewName`,
  `CommandsOf<A>['tag']`), never `string` (#251).
- `revision` is `keyof E['fields'] & string`, refused where the binding is made
  when the field is not stored as a number or the View state lacks it.
- `DomainRemote.view` throws, naming the field, when an Entity field has no
  View state field of that name. This is #547's "fails at the binding
  boundary".
- `refuse`'s argument is typed by the mutation's `Refusal`.
- Every rejection and every type-level constraint has an `@ts-expect-error`
  case of its own in `test/types.test-d.ts`.

## 5. D7 to D10: lowering `ReserveStock` (#545)

### The write (D9)

```ts
// examples/writes-domain/src/domain.ts
import { Product } from 'foldkit-example-writes/domain'

export const ReserveStock = Mutation.write(
  'ReserveStock',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      when: () => Expr.eq(Product.fields.status, 'published'),
      increment: { reserved: 'quantity' },
    },
  ),
)
```

It can be refused each way the issue lists: `Conflict` (a stale revision),
`Forbidden` (not the owner), `Unmet` (not published), `Invalid` naming
`reservedWithinStock`. The implementer confirms `expect`, `when` and
`increment` combine in one `Write.update`; if they do not, that is a
`foldkit-entity` bug to file and fix first.

It is declared in the new example because the laws cluster's work packages own
`examples/writes/src` and keep a snapshot of that example's writes
([541-laws-DESIGN.md](./541-laws-DESIGN.md) WP2). The fixture is still the
issue's: `Product`, `Shop`, both invariants, the `products` and `write_ledger`
tables and `Policy` are imported from `examples/writes`, which gains only an
`exports` map. The example's own `sqlite.ts` registers `ReserveStock` through a
ledgered guarded writer over those tables.

### One judge (D7), and the writer it needs (D8)

`decide` does not restate any rule. It builds, for the one row the aggregate
holds, the same chain a SQLite server builds:

```text
RemoteServer.write(ReserveStock,
  GuardServer.writer(Product, Policy, RemoteServer.memoryWriter(store, Product), { revision: 'revision' }))
  .run({ input, principal, now: ctx.now, operation: none, … })
```

`RemoteServer.memoryWriter(store, entity, { operators? })` is new, in
`foldkit-remote-server`, which owns both `EntityWriter` and `MemoryStore`:

- It declares `preconditions`, `increments`, `assignments`, `invariants`,
  `pins` and `read`, and implements `update`, `insert` and `delete` over the
  store with `Write.apply`, the `when` judged by the entity evaluator,
  `Entity.judgeAgainst`, the `expect` comparison, and the revision moved on by
  one. It decides nothing the Drizzle writer's statement does not.
- It does not declare `requires`, `ledger`, `cascades`, `restricts` or
  `clears`: `RemoteServer.write` and `GuardServer.writer` already refuse, by
  name, a write or a rule that needs one. Each is a later addition with its
  own conformance run.
- It is run against `foldkit-remote-drizzle`'s writer over SQLite on one table
  of cases (update, insert, delete; conflict, unmet, invalid, taken), so the
  two cannot drift.
- `RemoteServer.memory`'s `mutations: store => [RemoteServer.write(M,
  RemoteServer.memoryWriter(store, E))]` then lands a declared write with no
  database, which the first-run and test path lacked.

In `decide`, a success gives the row after, and `record(after, before, input)`
makes the event. A failure is `RemoteForbidden` or a `MutationRefused`; its
refusal is decoded with `ReserveStock.Refusal` and mapped to the generated
Rejection of the same tag. "Changing the shared rule changes both
interpreters' decisions" holds by construction, and a mutation proves it (§8).

The chain is synchronous Effects only (no `sleep`, no promise), which
`Aggregate.predict` needs (P11). A test calls `predict` to hold that.

### What is derived, and what the author gives (D10)

| Part of the Domain model | From |
| --- | --- |
| Command tag | `mutation.name` |
| Command target | the Entity's `id` field schema |
| Command input | the write's input fields, less the id key, plus `operation` and `digest` |
| Rejections `Conflict`, `Unmet`, `Invalid` | the members of `mutation.Refusal` |
| Rejections `Forbidden`, `NotFound`, `Reused` | fixed: Remote's two non-refusal outcomes of a guarded update, and the reused operation of §4 |
| Reply | the fields `Write.writes(write)` names, plus the revision |
| `decide` | the chain above, after the `Reused` check |
| Aggregate state | `{ row: OptionFromNullOr(encoded row), operations: Record<operation, digest> }`, bounded to the last 256 |
| The by-id View's state and `evolve` | the aggregate's row, field for field |
| The adapter's two bindings | all of the above |

| The author supplies | Why it cannot be derived |
| --- | --- |
| `event`: the Event class, e.g. `StockReserved { quantity, reservedAfter, revisionAfter }` | An event's tag and fields are a stored contract, and the declaration has no name for it |
| `record(after, before, input)` and `apply(row, event)` | Which outcome the event carries, and how `evolve` copies it back |
| `revision: 'revision'` | Which field every event moves; `expect` reads it |
| `principal`: the `RequestContext` giving `Option<User>` | Domain's middleware provides it; the guard policy consumes it |
| `listed`: the event that makes a row exist (`ProductListed { row }`) | The write is an update; a row has to come from somewhere |
| `operators` | The memory table the rules are judged by, as a writer names its own |

```ts
const Reserved = Lower.write(ReserveStock, {
  entity: Product,
  policy: Policy,
  revision: 'revision',
  principal: CurrentUser,
  listed: ProductListed,
  event: StockReserved,
  record: (after, _before, input) =>
    new StockReserved({
      quantity: input.quantity,
      reservedAfter: after.reserved,
      revisionAfter: after.revision,
    }),
  apply: (row, event) => ({ ...row, reserved: event.reservedAfter, revision: event.revisionAfter }),
})
// Reserved.command · .rejections · .decide · .evolve · .reply · .state · .view · .binding · .reads
```

`evolve` copies the recorded outcome and repeats no rule, as Domain's own
guidance asks ("events carry the outcome"). The recorded event also carries
the `operation` and `digest`, which is how `evolve` fills `operations`.

### The boundary check

`Lower.check(write, { entity, policy })` returns findings as data, and
`Lower.write` throws listing them:

```ts
type LoweringFinding = Data.TaggedEnum<{
  /** A rule, precondition, invariant or context value reads another row. */
  OutsideBoundary: {
    readonly source: 'when' | 'rule' | 'invariant' | 'context'
    readonly name: string
    readonly reaches: ReadonlyArray<string>
  }
  /** The write reads or sets a member the aggregate's row does not persist. */
  NotPersisted: { readonly member: string }
}>
```

It reads `Query.dependencies(…).reaches` of the `when`, of each Update row
rule and of each invariant, `Write.contextReads(write)`, and `Write.reads` /
`Write.writes` against the Entity's stored fields. CLAUDE.md's trap applies: a
body's `fields` are its own row's, and what it reaches is in `reaches`. The
failing case in the test is a fixture Entity whose `when` is an `Expr.path`
through a relation.

A rule that reads another aggregate is refused, not lowered: one aggregate is
one consistency boundary, and Domain's answer for a rule across two is a Saga
or a Policy. That is Domain's design, not a gap here.

## 6. D11: one scenario, three runners (#546)

```ts
interface WriteScenario {
  readonly name: string
  readonly given: ReadonlyArray<Row>            // encoded rows
  readonly principal: Option.Option<User>
  readonly now: number
  readonly when: readonly [mutation: typeof ReserveStock, input: unknown]
  readonly operation: string
  readonly expect:
    | { readonly _tag: 'Accepted'; readonly row: Partial<Row> }
    | { readonly _tag: 'Refused'; readonly refusal: unknown }
    | { readonly _tag: 'Forbidden' }
}
```

It is #538's sketch (`given`, `when`, `expect`) plus the three fields a
cross-backend run needs: `principal`, `now`, `operation`.

| Runner | Seeds from `given` | Asserts what it owns |
| --- | --- | --- |
| SQLite | `insert` into `products` | the row in the table; the ledger row |
| Domain Story | `Story.given(ref, new ProductListed(…))`, `Story.clock(now)`, `Story.provide(CurrentUser, …)` | `Story.then` the `StockReserved`, `Story.rejected`, `Story.state`, `Story.view` |
| Remote | the same events, on `InMemory` in `manual` mode, read through the adapter | `Law.check`'s report; `Data.refusal`; the value after each delivery |

Each runner returns `ReadonlyArray<{ backend, step, expected, actual }>`. The
common decision and row are compared once, from the scenario. A test feeds a
scenario with a wrong expectation and asserts the report names the backend and
step, so the reporting itself can fail.

The ordering cases run on the Remote runner with two controls:

- the reply: `Trace.run`'s `Respond.mutation(ReserveStock)`, and a transport
  wrapper that runs the command and then fails the call (a lost reply);
- the live observation: `InMemory`'s `control.drain`.

Cases: reply then drain, drain then reply, and a lost reply retried. After each
delivery the test asserts the value Remote shows and the mutation's status.
Domain's history must hold one `StockReserved` (`control.commits`).

**Where `WriteScenario` lives.** Scenarios as data are #538's, which the laws
note declined (its D25) until "a second example hand-writes the harness". This
is that second harness. This note does not decide #538. WP4 keeps the type and
its SQLite runner in `examples/writes-domain/src/scenario`; if the laws note
takes `Scenario` into `foldkit-remote/testing`, WP4's type is replaced by it
and the Domain runner moves to `foldkit-remote-domain/testing`. What the shared
shape must have for that is N4 below.

## 7. D12: #547

### Two directions, one binding table

- **Plus to Domain** (#545): a `Write` becomes a Command and a `decide`.
- **Domain to Plus** (#547): a Command the author did not declare as a `Write`
  becomes a `MutationDescriptor`. `Imported.mutation(Api, 'Touch', { refusals
  })` gives `name` (the tag), `Input` (`{ target, input }` from the command's
  own schemas), `Output` (its reply), `Refusal` (from `rejects`, through the
  refusal map). It carries no `write`, so Remote predicts nothing for it and
  its field impact is unknown.

Both end as entries of §4's binding table, the "adapter's typed operation and
read bindings" the issue links to.

### `Imported.describe`

```ts
Imported.describe(ShopApi, { views: [Reads], commands: [Reserve, Touched] })
// =>
{
  api: 'ShopApi',
  operations: [{
    id: 'ShopApi/ReserveStock',            // api name + command tag: stable
    kind: 'Command',
    description: Option<string>,            // Domain's `annotations.description`
    input: JsonSchema, reply: JsonSchema,
    rejections: [{ tag, schema: JsonSchema, field: Option<string> }],
    mutation: 'ReserveStock',
    footprint:
      | { _tag: 'Derived'; reads: [...]; writes: [...] }                    // Write.reads / Write.writes
      | { _tag: 'Declared'; reads: [...]; writes: [...]; by: string }       // the author's word, and whose
      | { _tag: 'Unknown' },
  }],
  reads: [{ id: 'ShopApi/ProductRow', kind: 'View', entity: 'Product', fields: [...], revision: 'revision' }],
}
```

- A `Declared` footprint names Entity fields by reference
  (`Product.fields.reserved`), so a wrong Entity or field is a type error and
  an error where it is made. `by` is its provenance.
- `Unknown` is a value a consumer must handle, not an empty list, which would
  read as "touches nothing".
- **Impact uses it now.** A `Declared` footprint's `writes` is installed on the
  imported descriptor through the same metadata the write trace reads, so
  `Data.why` and the list-impact path name the fields an opaque command
  touches. With `Unknown`, Remote takes its existing conservative path for a
  mutation with no `write`. The implementer reads `impact.ts` and
  `unpredicted.ts` first and reports the seam used; if none takes a footprint
  without a `Write`, adding one is in WP5, in `foldkit-remote`.
- `field` on a rejection is the form key it shows beside: for `Invalid`, the
  invariant's `path`. The test sends a reservation past the stock through the
  adapter and asserts `Data.refusal` gives `Invalid` with `path: ['reserved']`,
  matched by `Refusal.isInvalidBy(refusal, reservedWithinStock)`: the path a
  form already reads, with no code for Domain in it.
- The format is ours. P14: beta.86 has no `Api.describe` to follow and no
  `needsApproval` or `access` to carry, so the contract-layer plan's §6.4
  fallback applies ("if it does not merge, ours is the format").
- Checked in as `examples/writes-domain/IMPORTED.md`, generated, and compared
  by a test, so a Domain release that changes a schema shows as a diff.

### What waits, on what

| Part of #547 | Waits on |
| --- | --- |
| Imported commands and Views as graph nodes with `causes`, `guards` edges | The graph itself: contract-layer Phase 3, gated on Phase 2 and so on foldkit/foldkit#1655 (upstream). The laws note reached the same answer for Law nodes (its D21). `describe`'s output is what Phase 3 reads. |
| "A caller outside the Surface's access scope cannot **discover** the capability" | The capability catalog, contract-layer Phase 4, behind Phase 3. |
| "Cannot **invoke**" | Nothing: built now, at the authority. WP3 tests that a non-owner's command is `RemoteForbidden` and that a row `validate` hides reads as absent. |

#547 stays open after this plan, holding the first two rows.

### What this needs from the laws note

[541-laws-DESIGN.md](./541-laws-DESIGN.md) decides these; this note only names
them.

| # | Need | Why |
| --- | --- | --- |
| N1 | `Laws.check`'s `pairs` keep naming members by Entity field (the members a law reads, the members a write writes) | A `Derived` footprint and a pair then say the same thing in the same terms, and Phase 3 joins them |
| N2 | `Laws.check` accepts an entry that is not a `Write`: `{ name, entity, footprint }` with `Declared` or `Unknown`, and reads `Unknown` as writing every member | The opaque command's conservative path: it is `Undecided` against every invariant of its Entity, never `Kept` by disjointness |
| N3 | `Laws.evidence`'s `by` can name which interpreter ran (`'test'` with a `where` is enough if `where` may name two files) | `ReserveStock × reservedWithinStock` is an increment, so `Undecided`; WP4 records the SQLite run and the Domain Story as its evidence |
| N4 | If `Scenario` is built: plain data with `principal`, `now` and `operation`, and runners apart from the value | §6's `WriteScenario` is then deleted for it |
| N5 | Nothing in `foldkit-remote-server`: `RemoteServer.memoryWriter` is this plan's (WP2a). A walk of declared writes "through the real writer" can use it where SQLite is not wanted | So the two plans do not build it twice |

## 8. Work packages

Rules for every package, from CLAUDE.md, to be copied into each brief:

- The worktree and index are shared. Stage and commit in one command with
  explicit paths (`git add <new files> && git commit -m … -- <paths>`); never
  `add -A`, stash, reset, rebase, amend or force. Diff your paths in the
  command that commits. Push and report; do not wait for CI.
- Other agents are editing `packages/mixins`, `packages/sync` and
  `packages/durable`, and the laws work packages own `packages/entity`,
  `examples/writes/src` and `test`, and (their WP3, WP4)
  `packages/remote/src/remote.ts`, `can.ts`, `walk.ts` and the export line of
  `testing.ts`. Touch nothing outside the files listed.
- Run tests from the repository root (`npx vitest run <path> --project unit`),
  then `pnpm typecheck:force`, `pnpm format:check`, `pnpm paths:check`,
  `pnpm tags:check`, `pnpm mutate:check`.
- Every test must be able to fail: declare mutations in
  `test/<area>.mutations.ts` and run `pnpm mutate <spec>`.
- Probe Domain before building on it; read the installed `.d.ts`, not memory.
- A change to `foldkit-remote-domain`'s, `foldkit-remote-server`'s or
  `foldkit-remote`'s exports runs `npx jev-pref review --hunks --include <file>`
  with the README and skill reference included, repeats `--include` per file,
  and treats exit code 2 as "not reviewed", said in the report.
- A new export runs `pnpm --filter foldkit-plus generate`, then `pnpm paths`.
- Every public change adds its line under Unreleased in `CHANGELOG.md`, built
  through the temporary-index recipe if another session holds the file.

```text
WP1 (alone: lockfile)
 ├── WP2a (remote-server: memoryWriter) ── WP2b (lower) ──┐
 └── WP3 (adapter) ───────────────────────────────────────┼── WP4 (scenario) ── WP6 (docs)
                    └── WP5 (imported) ───────────────────┘        │
                                                                   └── WP7 (wire: revision, read-after)
                                                                        └── WP8 · WP9 · WP10 · WP11 (parallel)
```

### WP1: the package's skeleton, Domain installed, the probe as a test

- **Issues:** groundwork for #544 to #547.
- **Model:** Sonnet.
- **Owns:** `packages/remote-domain/{package.json,tsconfig.json,tsconfig.build.json,tsdown.config.ts,README.md,LICENSE}`
  (the README a stub WP6 finishes), `packages/remote-domain/src/index.ts`
  (empty of exports but one, `Receipt`, the `{ stream, version }` Schema),
  `packages/remote-domain/test/domain/{behaviour.test.ts,fixture.ts}`;
  `examples/writes-domain/{package.json,tsconfig.json}`;
  `examples/writes/package.json` (an `exports` map: `./domain`, `./server`);
  `pnpm-lock.yaml`; `pnpm-workspace.yaml` (a comment, and only if pnpm needs
  it, a peer rule for Domain's and alchemy's `effect` range);
  `docs/releases.md` (the package's row); `scripts/test/publishedBuild.test.ts`
  (its entry); what `pnpm --filter foldkit-plus generate` and `pnpm paths`
  write.
- **Build:**
  - `foldkit-remote-domain@0.1.0`, laid out as `packages/remote-drizzle` is.
    Peers pinned exactly: `@alchemy.run/domain@2.0.0-beta.86`,
    `alchemy@2.0.0-beta.86`; `effect ^4.1.0`. One build entry per source file.
  - `fixture.ts`: the probe's model (§2), hand-written.
  - `behaviour.test.ts`: one test per row P1 to P12 of §2, each asserting the
    observed value. P2 uses the in-process View service's `timeout`, so it does
    not wait 10 s. Its header says the file pins upstream behaviour and what
    each row is relied on for.
- **Done when:**
  - `pnpm install --frozen-lockfile` passes, and `pnpm-lock.yaml` holds **one**
    `effect` version (`grep -o 'effect@[0-9.]*' pnpm-lock.yaml | sort | uniq
    -c`). A second copy: stop and report, do not override.
  - The tests pass on the workspace's Effect. A failure there that passes on
    4.1.4 in a scratch install: stop and report (§10, item 1).
  - `pnpm pack:check` passes for the new package.
- **Mutations:** none; it tests an external library.

### WP2a: `RemoteServer.memoryWriter`

- **Issues:** #545 (D8).
- **Model:** default. It is a write path: revision, precondition and
  invariants decide what lands.
- **Owns:** `packages/remote-server/src/memoryWriter.ts` (new), its export in
  `packages/remote-server/src/index.ts` (the `RemoteServer` member and the
  type), `packages/remote-server/test/memoryWriter.test.ts` and
  `memoryWriter.mutations.ts`, `packages/remote-drizzle/test/memoryWriterParity.test.ts`,
  `packages/remote-server/README.md` (its section), the
  `skills/foldkit-plus/references/remote.md` lines for it.
- **Build:** §5's contract exactly.
  `RemoteServer.memoryWriter<P>(store: MemoryStore, entity: AnyEntity, options?: { operators?: MemoryOperators }): EntityWriter<P>`.
- **Done when:**
  1. Update, insert and delete each land and answer the row; `Conflict`,
     `Unmet`, `Invalid` and `Taken` are each refused with the writer's own
     error.
  2. The parity test runs one table of cases through it and through
     `foldkit-remote-drizzle`'s writer over SQLite, and compares outcome and
     row.
  3. `RemoteServer.write` refuses, by name, a write over it that needs
     `ledger` (an increment with no `expect`), and `GuardServer.writer` a rule
     that reads another row.
  4. `RemoteServer.memory` with it lands a declared write end to end through
     `Law.check`.
- **Mutations:** drop the `expect` comparison; drop the `when`; skip
  `judgeAgainst`; do not move the revision; apply the increment to the value
  after the sets instead of the row before.

### WP2b: lower `ReserveStock` (#545)

- **Model:** default. It fixes the lowering's shape, spans `foldkit-entity`,
  `foldkit-guard` and `foldkit-remote-server` contracts, and carries
  authorization.
- **Needs:** WP1, WP2a.
- **Owns:** `packages/remote-domain/src/lower/**`,
  `packages/remote-domain/test/lower/**`;
  `examples/writes-domain/src/{domain.ts,sqlite.ts,model.ts}`,
  `examples/writes-domain/test/lower/**`.
- **Build:** §5: `Lower.check`, `Lower.write` (including the `Reused` check and
  the two bindings it returns, typed against WP3's binding types: WP3 commits
  `src/adapter/binding.ts`, types only, first, and says so). In the example:
  `ReserveStock`, the SQLite registration, and `model.ts` with `StockReserved`,
  `ProductListed`, the `Product` aggregate, `ProductRow`, the `Shop` model,
  `ShopApi`, and `CurrentUser` with its session middleware.
- **Done when (each a test):**
  1. Both interpreters agree on the accepted row and on `Conflict`,
     `Forbidden`, `Unmet` and `Invalid` naming `reservedWithinStock`, from one
     table of cases over the same seeded row, principal, input and clock.
  2. A Story checks the emitted `StockReserved`, the state rebuilt from
     `given(ProductListed, StockReserved)`, and that a resend with the same
     `commandId` gives the first receipt with one event in the history.
  3. §4's ledger table, each cell asserted, with a fourth column: the lowered
     aggregate, where a reused operation with another digest is `Reused`.
  4. `Lower.check` gives `OutsideBoundary` for a fixture write whose `when`
     reads through a relation, and `Lower.write` throws naming it.
  5. `Aggregate.predict` gives `Accepted` for the lowered command.
  6. `Domain.verify(Shop)` is empty.
  7. The report lists the inputs the author had to supply and any semantics
     that still differ, for WP6's README.
- **Mutations (`lower.mutations.ts`):** change `reservedWithinStock` to
  `Expr.lt` in `examples/writes/src/domain.ts` and both interpreters' boundary
  case flips (this is "changing the shared rule changes both"); make `evolve`
  add `quantity` instead of copying `reservedAfter`; drop the `reaches` read in
  `Lower.check`; drop the `Reused` comparison; map every refusal to `Conflict`.

### WP3: the receipt-aware adapter (#544)

- **Model:** default. Identity across principals, the wire mapping, and what
  may overwrite what.
- **Needs:** WP1. Parallel with WP2a and WP2b: it tests against WP1's
  hand-written fixture.
- **Owns:** `packages/remote-domain/src/adapter/**`, the adapter's exports in
  `src/index.ts`, `packages/remote-domain/test/adapter/**`,
  `packages/remote-domain/test/types.test-d.ts`.
- **Build:** §4 exactly: `DomainRemote.view`, `.command`, `.refuse`,
  `.forbid`, `.fail`, `.layer`; `DomainReads`; a test transport wrapper
  (`holdReply`, `loseReply`) over the Api client's methods. First commit:
  `binding.ts`, types only.
- **Done when (each a test, on `InMemory` in `manual` mode):**
  1. Delivery paused: the command commits, `DomainReads.pending` holds its
     receipt, the mutation answers with the reply's fields; after `drain`,
     `confirm` is true and `pending` is empty.
  2. A timeout after commit: a second `mutate` of the same operation sends no
     second command (`control.commits` unchanged) and reads with the receipt.
  3. A typed Rejection decodes with the mutation's `Refusal`; a middleware
     error is `RemoteUnauthenticated`; a non-owner is `RemoteForbidden`; a lost
     reply is `RemoteUnreachable`, and the retry carries the same `commandId`.
  4. A state change with no output event reaches `live` as `EntityPatched`.
  5. A snapshot of a lower revision, delivered after a higher one, is not
     sent, on `read` and on `live`.
  6. A request with no operation, and one made for another principal, send
     nothing.
  7. A row `validate` hides reads as absent.
  8. `Law.check` over the fixture's write reports no disagreement.
  9. `written` on an Entity whose Read rules differ from its Update rules
     throws where the binding is made.
  10. `types.test-d.ts`: an unmapped Rejection tag, a `revision` that is not a
      field, a View name the Api does not serve, and a `refuse` value outside
      the mutation's `Refusal` are each a `@ts-expect-error`, one per case.
- **Mutations (`adapter.mutations.ts`):** order by cursor instead of revision;
  pass Domain's cursor through as the live cursor; drop the revision
  comparison; drop `atLeast` from the confirming read; leave the principal out
  of the digest; leave the input out of the digest; resend the command when
  the committed record holds it; answer `Unreachable` on a post-commit
  timeout; clear the floor on an unconfirmed read.

### WP4: one scenario through three backends (#546)

- **Model:** Sonnet. A test fixture with a decided shape.
- **Needs:** WP2b and WP3 merged.
- **Owns:** `examples/writes-domain/src/{shop.ts,demo.ts,main.ts}`,
  `src/scenario/**`, `test/scenario/**`, `test/demo.test.ts`.
- **Build:** §6: `WriteScenario`, the three runners, the mismatch report;
  `shop.ts` (the page's `Data` and the adapter Layer over WP2b's bindings); a
  `demo` that prints each step's outcome per backend, with its transcript
  pinned as the other examples pin theirs.
- **Done when:**
  1. One accepted reservation and one `Invalid` refusal run from the same
     scenario values on all three, with no mismatch.
  2. A lost reply is retried as the same operation: one `StockReserved`, the
     View catches up, Remote shows one reservation.
  3. Reply then live, and live then reply: the value and the mutation's status
     asserted after each delivery.
  4. A scenario with a wrong expectation yields a report naming the backend
     and the step.
  5. Once the laws note's `Laws.check` is merged: a `Laws.evidence` record for
     `ReserveStock × reservedWithinStock` naming these tests (N3). Until then
     the report says it is owed.
- **Mutations (`scenario.mutations.ts`):** in the adapter, a random `commandId`
  per attempt (the duplicate application) and no revision comparison (the
  older observation): each must turn a named ordering test red. In the runner:
  compare nothing for one backend.

### WP5: describe what was imported (#547)

- **Model:** Sonnet for `describe`; if the footprint needs a new seam in
  `foldkit-remote` (§7), that part is the default model's, in a second brief.
- **Needs:** WP3 merged (the binding types); WP2b for the `Derived` case.
- **Owns:** `packages/remote-domain/src/imported/**`,
  `packages/remote-domain/test/imported/**`,
  `examples/writes-domain/IMPORTED.md`, `examples/writes-domain/test/imported.test.ts`.
- **Build:** §7: `Imported.mutation`, `Imported.describe`, the three
  footprints, `Imported.show(description)` (the Markdown).
- **Done when:**
  1. `describe` lists `ReserveStock` with a `Derived` footprint (`reads`:
     `status`, `reserved`, `revision`; `writes`: `reserved`) and an opaque
     command with `Unknown`, both with JSON Schemas and stable ids.
  2. The opaque command is callable through the adapter and answers.
  3. A `Declared` footprint naming another Entity's field is a
     `@ts-expect-error` and throws where it is made.
  4. A `Declared` footprint's fields appear in `Data.why` for a list they
     reach; an `Unknown` one takes the conservative path.
  5. The `Invalid` refusal reaches `Data.refusal` with `path: ['reserved']`.
  6. `IMPORTED.md` is compared with `Imported.show`'s output.
- **Mutations:** answer `Derived` with empty lists for a command with no
  `Write`; drop the Entity check on a `Declared` field; drop the `field` of a
  rejection; treat `Unknown` as touching nothing.

### WP6: README, skill, changelog

- **Model:** Sonnet.
- **Needs:** WP2a to WP5 merged, and their reports. Repeated in small after
  each of WP7 to WP11 by that package itself.
- **Owns:** `packages/remote-domain/README.md`,
  `examples/writes-domain/README.md`, `examples/README.md` (one row),
  `skills/foldkit-plus/references/remote-domain.md` (new),
  `skills/foldkit-plus/SKILL.md` (one table row, and the ownership column says
  the Domain model owns the decision), `skills/foldkit-plus/references/alchemy.md`
  (one pointer line), `docs/design/contract-layer-PLAN.md` (§6.6 status and
  the phase table), `docs/design/README.md` (this note's row), `CHANGELOG.md`.
- **Build:** the package README in CLAUDE.md's order: what it is; who owns
  what (Domain owns the decision and the events, Remote owns the client's copy
  and the pending state, the adapter owns only receipts in flight, and after
  WP7 nothing); §4's invariant; the smallest example (one View, one command);
  then the lowering, with §5's two tables and §4's ledger table as findings;
  failure and recovery (a View behind, a lost reply, a reload); the limits
  (D6's reply rule, D15). It links no design note (`guides.test.ts`).
- **Done when:** every snippet compiles (the skill's `*.test-d.ts` recipe),
  `pnpm docs:check` and the site's guide tests pass, the skill reference's
  first line names the versions checked, and each sentence was checked against
  the merged code.

### WP7: row revisions and read-after tokens on Remote's wire (D3)

- **Issues:** #544 ("Remote preserves its receipt"); #480's open item.
- **Model:** default. Remote's wire, reducer and planner.
- **Needs:** WP4 merged (its ordering tests are the guard), and the laws
  note's WP3 and WP4 merged or their files avoided.
- **Owns:** `packages/remote/src/{wire.ts,model.ts,client.ts,store.ts,plan.ts,inspect.ts,whyReasons.ts}`
  for the parts named in §4, `packages/remote/test/readAfter.test.ts`,
  `revision.test.ts` and their mutation specs,
  `packages/remote-server/src/index.ts` (the handlers pass the fields through;
  `EntitySource` may answer a revision), `packages/remote-drizzle/src/index.ts`
  (the source sends the bound revision), `packages/remote-domain/src/adapter/**`
  (the adapter's two maps and `DomainReads` deleted), the READMEs and
  `references/remote.md`, `482-temporal-laws-MATRIX.md` (two rows).
- **Build:** §4's wire shapes exactly.
- **Done when:**
  1. A read answer of a lower revision than the row held writes nothing, from
     `ReadReceived`, `LiveReceived` and `MutationSucceeded` alike; a row with
     no revision behaves as today.
  2. A floored row's read carries the token; `behind` keeps the floor and the
     held value; any other answer clears it.
  3. A floor survives a persisted Model's reload and is asked again.
  4. `Data.inspect` lists floors; `Data.why` names the reason.
  5. A client at protocol 5 is refused by a server at 6 with
     `RemoteProtocolError`, and the reverse.
  6. WP3's and WP4's tests pass with the adapter stateless.
  7. `heldValue.test.ts`'s walk gains a generator for each new case; what a
     moved seed finds is filed before the seeds are kept.
- **Mutations:** compare revisions with `<=`; clear a floor on `behind`; drop
  the token from a floored read; write a row named in `behind`.

### WP8: lists and relations

- **Model:** default for the design step (it probes Domain's `Query` first and
  fixes the binding), Sonnet for the tests.
- **Needs:** WP7.
- **Owns:** `packages/remote-domain/src/adapter/{query.ts,relations.ts}`, their
  tests, a `Stocked` Query and a `Supplier` Entity in `examples/writes-domain`.
- **Build:**
  - `DomainRemote.query(ProductsQuery, ShopApi, 'ProductList', { input, edge:
    row => ({ id, key }) })`: a Remote `Query` answered by a Domain Query,
    paged with Domain's `after` and `take`, each page `atLeast` the row floors
    it covers. A window Domain cannot serve (backward paging, if the probe
    says so) is refused by name.
  - A `one` relation in a View's state, held as the target's id, read by
    asking the target Entity's own View binding in the same batch.
  - `live` for a query: Domain's `watch` is per key, so a live list is
    re-asked on a row change of any row it holds, and is `ConnectionInvalidate`
    otherwise. If the probe finds a live Query, use it.
- **Done when:** a paged list reads through `Data.query` to its last page; a
  row written through a command appears in the list at or after its receipt;
  a relation's target reads in one batch; `Law.check` with `lists` reports no
  disagreement for `ReserveStock`.

### WP9: first paint from a server render

- **Model:** default (it crosses `foldkit-ssr`'s resume plan).
- **Needs:** WP7.
- **Owns:** `packages/remote-domain/src/adapter/resume.ts`, its test, an
  `ssr.test.ts` in the example.
- **Build:** on the server, the adapter's reads answer through
  `clientInProcess` and Remote's store is resumed by `foldkit-ssr` as it is for
  any backend. The browser's `live` starts from the resumed row's revision, so
  its first watch snapshot of the same revision patches nothing.
- **Done when:** a page rendered on the server and hydrated makes no read
  before its first change, and a change made between render and hydrate
  arrives through `live`. Runs under jsdom with `renderToString`; no deploy.

### WP10: a Domain model as a client-test fixture

- **Model:** Sonnet.
- **Needs:** WP3.
- **Owns:** `packages/remote-domain/src/testing.ts`, its test, one Scene or
  Story test in the example.
- **Build:** `Fixture.make(Api, { model, handlers, bindings, given, as })`
  returns `{ layer: Layer<RemoteClient>, drain, commits }`: the model on
  `InMemory` in `manual` mode, seeded with `given` events, called as `as`. It
  is what WP3's and WP4's tests already build by hand, moved once both exist.
- **Done when:** a client test drives a page against a seeded Domain model
  with no server, and WP3's and WP4's tests use it.

### WP11: one trace, and the HTTP protocol

- **Model:** Sonnet.
- **Needs:** WP3.
- **Owns:** `packages/remote-domain/test/adapter/{trace.test.ts,http.test.ts}`.
- **Build:** a test tracer around `Data.mutate`; the Api served over
  `Domain.protocolHttp` from a local Node server.
- **Done when:** one trace id spans the Remote mutation's span, the adapter's
  call and Domain's `decide` span; a reply lost on the HTTP transport (the
  server closes the socket after committing) reads as `RemoteUnreachable` and
  the retry reuses the receipt. If the adapter breaks propagation, the fix is
  in WP3's files and is made here.

## 9. Not built, and the reason for each

| Item | Reason |
| --- | --- |
| Graph nodes and per-caller discovery for imported operations (§7) | Upstream: contract-layer Phases 3 and 4 wait on foldkit/foldkit#1655 |
| Remote server Sources over Domain (§3) | Design: a second way to reach one authority, authorizing twice |
| `@alchemy.run/domain/Foldkit` Commands beside Remote (D16) | Design: two owners of one row |
| `Aggregate.predict` as the optimistic mechanism (contract-layer Q6) | Design: Remote already predicts from the `Write`, and one mechanism owns pending state. `predict` is used to prove `decide` is synchronous |
| A rule that reads another aggregate, lowered | Domain's design: one aggregate is one boundary. `Lower.check` names it |
| `foldkit-remote-drizzle` sending D1 session bookmarks as read-after tokens | Access: a D1 read replica cannot be run here. WP7's wire is ready for it |
| Durable Object hosting, the WebSocket protocol, a deploy | Access: no Cloudflare credentials |
| `ledger`, `requires`, `cascades`, `restricts`, `clears` on `memoryWriter` | Not deferred for demand: each is a separate conformance run against the Drizzle writer, queued after WP2a as its own packages. `ledger` first, since it lets `Sell` run in memory |

## 10. What needs the maintainer

1. **Effect.** Domain and alchemy peer on `effect ^4.1.4`; the workspace runs
   4.1.1 and `foldkit-plus setup` pins it. The probe passed on both. Raising
   the workspace (Foldkit's `~4.1.0` allows it) touches the lockfile, the
   skill's "tested on" line and `packages/plus/src/setup.ts`, so it is not in
   this plan. Until it is decided, installs may warn of the peer.
2. **Publishing.** `foldkit-remote-domain` is built to be published. Whether
   its first release goes out while Domain is a beta is the maintainer's call;
   the plan leaves it in the matrix as experimental.
3. **Upstream reports this session may not post** (alchemy-run/alchemy):
   - P8 and P9: a `commandId` reused with different input, or by another
     principal, returns the first receipt and skips `decide`. The second
     discloses one caller's reply to another who can address the same
     aggregate.
   - P3: the Api's View client takes no timeout for an `atLeast` read.
   - P6: a snapshot carries no stream version, so a client cannot compare it
     with a receipt.
4. **The plan's gate.** Contract-layer §6.6 waits for alchemy-run/alchemy
   #2567 and #2569 to merge. Their APIs are in beta.86; the PRs' state was not
   read. WP6 rewords the gate to what was observed unless told otherwise.
5. **Jev.** `TYPESAFE_API_KEY` was unset in recent sessions. WP2a, WP3, WP5
   and WP7 change published exports and need the review; without the key they
   report "not reviewed".
6. **No deploy was made or is planned.**
