# `foldkit-remote-domain`

If your backend is an event-sourced [Alchemy Domain](https://alchemy.run/domain) server, your page needs to send Commands to Aggregates and read materialized Views without maintaining a second copy of every row or losing optimistic updates while a View catches up.

`foldkit-remote-domain` provides a `RemoteClient` layer (`DomainRemote.layer`) backed directly by an Alchemy Domain Api client. Your Foldkit page reads and writes through `foldkit-remote` just as it would against a SQL server—with normalized caching, optimistic predictions, and structured refusals—while the Domain model remains the single authority.

> **Experimental:** Pinned to `@alchemy.run/domain` and `alchemy` at `2.0.0-beta.86`. For the architectural guide and a full reservation walkthrough, read [An event-sourced domain behind Remote](../../docs/event-sourced-domains.md).

## Install

```bash
pnpm add foldkit-remote-domain foldkit-remote foldkit-entity effect \
  @alchemy.run/domain@2.0.0-beta.86 alchemy@2.0.0-beta.86
```

Requires `@alchemy.run/domain@2.0.0-beta.86`, `alchemy@2.0.0-beta.86`, and `effect >= 4.1.4`. Add `foldkit-guard` when lowering guarded writes.

| Entry | Exports | Runs on |
| --- | --- | --- |
| `foldkit-remote-domain` | `DomainRemote` (`RemoteClient` layer and bindings) | Browser, tests |
| `foldkit-remote-domain/server` | `pageReader` for SSR pre-reads | Rendering server |
| `foldkit-remote-domain/lower` | `Lower.check`, `Lower.write` (compile `Write` to aggregate) | Model host |
| `foldkit-remote-domain/imported` | `Imported.mutation`, `describe`, `show` | Anywhere |
| `foldkit-remote-domain/testing` | `Fixture.make` (in-memory model as `RemoteClient`) | Tests |

## A first View and command

Define your Alchemy Domain model as usual—an Event, Command, Aggregate, View, Model, and Api:

```ts
import * as Domain from '@alchemy.run/domain'
import { Effect, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'

class Renamed extends Domain.Event('Renamed', { name: Schema.String, revision: Schema.Int }) {}

class Rename extends Domain.Command('Rename', {
  target: Schema.String,
  input: { name: Schema.String },
  events: [Renamed],
}) {}

class Note extends Domain.Aggregate('Note', {
  id: Schema.String,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  commands: [Rename],
  decide: {
    Rename: (state, command) => [new Renamed({ name: command.name, revision: state.revision + 1 })],
  },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}

class NoteRow extends Domain.View('NoteRow', {
  from: [Note],
  key: Note,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}

class Notes extends Domain.Model('Notes', { aggregates: [Note], views: [NoteRow] }) {}

class NotesApi extends Domain.Api('NotesApi', {
  model: Notes,
  commands: ['Rename'],
  views: ['NoteRow'],
}) {}
```

Now bind a Foldkit `Entity` and `Mutation` to that Api and build a `RemoteClient` layer:

```ts
const NoteEntity = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)

const RenameNote = Mutation.make('RenameNote', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})

const NoteReads = DomainRemote.view(NoteEntity, NotesApi, 'NoteRow', { revision: 'revision' })

const RenameBinding = DomainRemote.command(RenameNote, NotesApi, 'Rename', {
  entity: NoteEntity,
  target: input => input.id,
  input: input => ({ name: input.name }),
  written: (_reply, input) => ({ name: input.name }),
})

const client = DomainRemote.layer(NotesApi, {
  views: [NoteReads],
  commands: [RenameBinding],
  principal: Effect.succeed(Option.some('ada')),
  denied: () => 'Unauthenticated',
})
```

Provide `NotesApi.layerClientHttp(url)` in the browser (or `NotesApi.layerClientInProcess` on the server) alongside `client`, and `Remote.make` uses it like any other `RemoteClient`:

- **`DomainRemote.view` and `DomainRemote.command`** are pure declarations that validate field names and a numeric `revision` at definition time.
- **`principal`** names the signed-in caller; the adapter refuses writes for a mismatched principal with `RemotePrincipalChanged` (or `RemoteUnauthenticated` when signed out) before touching the network.
- **`denied`** maps middleware refusals to `'Unauthenticated'` or `'Forbidden'`.
- **`written`** supplies the fields a committed command wrote so the UI stays consistent if the View has not caught up yet.

## Choose between Domain and SQL backends

Reach for `foldkit-remote-domain` when an Alchemy Domain model is already your authority: Events are the source of truth, Aggregates decide commands, and Policies or Projections react to them.

If you just want declared writes, optimistic predictions, and structured refusals over SQLite, D1, or Postgres, use `foldkit-remote-server` with `foldkit-remote-drizzle`. In SQL, a write and the row it returns come from the same database transaction, so there is no lagging View to bridge.

Use either `foldkit-remote-domain` or `foldkit-remote-server` as the transport for a given authority—stacking them would authenticate and authorize every call twice. Similarly, keep rows in `Remote.Model` rather than duplicating them with `@alchemy.run/domain/Foldkit`.

## How a write flows from page to View and back

Each step of a write has one owner:

| Responsibility | Owner |
| --- | --- |
| Command decisions and recorded Events | Domain model (`decide`, `evolve`) |
| Row visibility and read authorization | Domain View (`validate`, middleware) |
| Cached rows, optimistic values, pending state, refusals | `Remote.Model` |
| Read-after receipt tokens and row revisions | `Remote.Model` |
| In-memory reply cache (last 1,024 replies to skip duplicate retries) | Adapter (rebuilt on reload) |

Tracing one write end to end:

1. **Page (`Remote`):** `Data.mutate(model, RenameNote, input)` applies the optimistic prediction and marks the write pending.
2. **Adapter:** derives a deterministic `commandId` and calls `client.Rename(target, input, { commandId })`.
3. **Aggregate:** `decide` appends Events and returns a **receipt** (`{ stream, version }`).
4. **Adapter:** queries `NoteRow.snapshot(target, { atLeast })` at that receipt.
5. **View:** folds delivered Events and enforces read rules.
6. **Adapter:** emits `MutationSucceeded` with the updated row—or, if the View is still behind, the fields from `written(reply, input)` plus the receipt as a read-after token.
7. **Page (`Remote`):** replaces the optimistic layer with the authoritative answer, recording the row's **revision** and any active read-after **floor** (`stream@version`).

Remote accepts an incoming row only when its `revision` is at least the revision already held. While a floor is active, subsequent reads pass `{ atLeast: floor(key) }` until the View catches up.

## Handle a View that lags behind its write

After a command commits, `mutate` reads the View at the command's receipt:

| Outcome | What Remote receives |
| --- | --- |
| Command committed, View caught up | `MutationSucceeded` with the View's current row |
| Command committed, View still behind | `MutationSucceeded` with `written(reply, input)` and `after` receipt token |
| Rejection mapped with `refuse` | `RemoteMutationError` carrying the mutation's `Refusal` |
| Rejection mapped with `forbid` / `unauthenticated` / `fail` | `RemoteForbidden`, `RemoteUnauthenticated`, or `RemoteMutationError` |
| Middleware error | `RemoteUnauthenticated` or `RemoteForbidden` (via `denied`) |
| Transport failure or dropped response | `RemoteUnreachable`; Remote retries with the same operation id |

A committed write is never reported as failed, and an older View row never overwrites it. Remote stores active floors in its Model (surviving persistence restores) and surfaces waiting rows under `Data.inspect(model).floors` with reason `ReadAfter`.

### Idempotency and derived command ids

Each Remote write carries a stable `operation` id across retries. The adapter derives Domain's `commandId` as `${mutation}:${operation}:${digest}`, where `digest` hashes `[principal, target, keys, input]`:

| Scenario | SQLite ledgered writer | Raw Domain | Through `foldkit-remote-domain` |
| --- | --- | --- | --- |
| Retry with same input and principal | Returns recorded reply | Returns first receipt | Returns first receipt |
| Same operation, different input | Refused | Silently returns first receipt | New command, decided independently |
| Same operation, different principal | Decided in new scope | Skips `decide`, returns first receipt | New command, decided afresh |

Requests without an `operation` id fail with `RemoteMutationError` (`Data.mutate` always generates one). Lowered writes (`Lower.write`) enforce the full ledger rule on the aggregate side.

## Import a Domain command without a declared Write

When a Domain command has no Foldkit `Write` declaration, wrap it with `Imported.mutation` so pages can still invoke it and audit its schema and field footprint:

```ts
import { Footprint } from 'foldkit-entity'
import { Imported } from 'foldkit-remote-domain/imported'

const ImportedRename = Imported.mutation(NotesApi, 'Rename', {
  entity: NoteEntity,
  footprint: Footprint.declared({ writes: [NoteEntity.fields.name], by: 'the notes team' }),
})

const description = Imported.describe(NotesApi, {
  views: [NoteReads],
  commands: [
    DomainRemote.command(ImportedRename, NotesApi, 'Rename', {
      entity: NoteEntity,
      target: input => input.target,
      input: input => input.input,
    }),
  ],
})
console.log(Imported.show(description))
```

A command's **footprint** is `Derived` (from a `Write`), `Declared` (explicitly listed with `by`), or `Unknown` (conservatively treated as able to write any field). `Imported.show` renders a Markdown summary of schemas, rejections, and footprints that you can snapshot-test to catch upstream Domain schema changes.

## Test a page against an in-memory Domain model

`foldkit-remote-domain/testing` hosts your Domain model in memory with View deliveries paused until you call `drain`, letting client tests exercise real aggregates and lagging Views with no HTTP server:

```ts
import { REMOTE_PROTOCOL_VERSION, RemoteClient } from 'foldkit-remote'
import { Fixture } from 'foldkit-remote-domain/testing'

const shop = Fixture.make(NotesApi, {
  model: Notes,
  given: [{ aggregate: 'Note', id: 'n1', events: [new Renamed({ name: 'Draft', revision: 1 })] }],
  bindings: { views: [NoteReads], commands: [RenameBinding], denied: () => 'Unauthenticated' },
})

const read = Effect.gen(function* () {
  yield* shop.drain
  const client = yield* RemoteClient
  return yield* client.read({
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Note', id: 'n1', fields: ['name', 'revision'] }],
  })
}).pipe(Effect.provide(shop.layer))
```

- `shop.layer` provides both `RemoteClient` and the Api client.
- `shop.commits()` lists Events committed by commands (excluding seeded `given` events).
- `shop.as`, `headers`, `middleware`, `handlers`, and `through` let tests simulate signed-in actors, dropped replies, and out-of-order deliveries.

Note that `given` seeds events through Domain's internal `Model.Internals` helper, which may change across beta releases.

## Pre-read on the server for SSR

`pageReader` from `foldkit-remote-domain/server` reads the Domain model in-process during server rendering. `Remote.resume(Data)` sends the pre-read rows and their revisions to the browser so hydration skips duplicate reads (while live streams ignore frames at or before the hydrated revision, and live lists refresh once as their stream opens).

<!-- docs-check
declare const sessionOf: (request: Request) => Option.Option<string>
-->

```ts
import { Layer } from 'effect'
import { pageReader } from 'foldkit-remote-domain/server'

const reader = pageReader(NotesApi, {
  views: [NoteReads],
  resolvePrincipal: (request: Request) => Effect.succeed(sessionOf(request)),
  middleware: () => Layer.empty,
})
```

- Provide `reader(request, env)` alongside your hosted model Layer to `Data.satisfy` inside `foldkit-ssr`'s `prepare`.
- Build `middleware` directly from the principal returned by `resolvePrincipal`, never from raw HTTP headers.
- `pageReader` is read-only (writes fail `RemoteMutationError`; live streams fail `RemoteLiveError`) and marks all reads private (`PageReads`) so one user's render is never cached for another.

## Bind paged lists and `one` relations

`DomainRemote.query` connects a Remote `Query` to a **paged** Domain Query: Domain chooses the matching row ids and cursor order, and the adapter fetches each listed row through its bound View (dropping any row the View's `validate` hides):

<!-- docs-check standalone
import * as Domain from '@alchemy.run/domain'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Order } from 'foldkit-entity'
import { DomainRemote } from 'foldkit-remote-domain'

class Seeded extends Domain.Event('Seeded', { stock: Schema.Int, revision: Schema.Int }) {}
class Seed extends Domain.Command('Seed', { target: Schema.String, input: { stock: Schema.Int }, events: [Seeded] }) {}
const State = Schema.Struct({ stock: Schema.Int, reserved: Schema.Int, revision: Schema.Int })
const evolve = { Seeded: (state: typeof State.Type, event: Seeded) => ({ ...state, stock: event.stock, revision: event.revision }) }
class Stock extends Domain.Aggregate('Product', {
  id: Schema.String,
  state: State,
  initial: { stock: 0, reserved: 0, revision: 0 },
  commands: [Seed],
  decide: { Seed: (_, { stock }) => [new Seeded({ stock, revision: 1 })] },
  evolve,
}) {}
class ProductRow extends Domain.View('ProductRow', {
  from: [Stock],
  key: Stock,
  state: State,
  initial: { stock: 0, reserved: 0, revision: 0 },
  evolve,
}) {}
class InStock extends Domain.Query('InStock', {
  input: { shelf: Schema.String },
  success: Schema.Struct({ id: Schema.String }),
  paged: true,
}) {}
class Shop extends Domain.Model('Shop', { aggregates: [Stock], views: [ProductRow], queries: [InStock] }) {}
class ShopApi extends Domain.Api('ShopApi', { model: Shop, views: ['ProductRow'], queries: ['InStock'] }) {}
const Product = Entity.define(
  'Product',
  Schema.Struct({ id: Schema.String, stock: Schema.Number, reserved: Schema.Number, revision: Schema.Number }),
)
const Products = DomainRemote.view(Product, ShopApi, 'ProductRow', { revision: 'revision' })
const principal = Effect.succeedNone
const denied = () => 'Unauthenticated' as const
-->

```ts
import { Query } from 'foldkit-remote'

const Stocked = Query.define('Stocked', { shelf: Schema.String }, () =>
  Query.from(Product).pipe(
    Query.where(Expr.gt(Product.fields.stock, Expr.field(Product.fields.reserved))),
    Query.orderBy(Order.asc(Product.fields.id)),
  ),
)

const Listed = DomainRemote.query(Stocked, ShopApi, 'InStock', {
  input: input => ({ shelf: input.shelf }),
  id: entry => entry.id,
})

DomainRemote.layer(ShopApi, { views: [Products], commands: [], queries: [Listed], principal, denied })
```

Key list and relation rules:

- **Forward-only paging:** `first` maps to Domain's `take` and `after` to Domain's cursor. Backward windows (`last`, `before`), `first: 0`, and cursors over 1,024 characters are rejected.
- **Write answers refresh affected lists:** when a write specifies `MutationRequest.lists`, the adapter reads each list at the write's receipt (`atLeast`), omitting lists that have not caught up within `confirmWithin`.
- **Live lists:** opening a stream sends one `ConnectionInvalidate`, then watches every listed row and re-queries 50 ms after a row changes. Rows joining without modifying a currently listed row appear on the next read.
- **`one` relations:** stored as target id or `null` in View state, returned as Remote ref keys (`'Supplier:s1'`), and batch-fetched once per target. `many` relations and relation windows fail with `RemoteReadError`.

## Lower a declared `Write` into an Aggregate

`foldkit-remote-domain/lower` compiles a Foldkit `Write` (including its invariants, transitions, and `foldkit-guard` policies) into an Alchemy Domain aggregate so both SQL and event-sourced hosts execute the exact same rule engine:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Mutation } from 'foldkit-remote'

const User = Schema.Struct({ id: Schema.String })
const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)
const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const reservedWithinStock = Entity.invariant<typeof ProductFields>(
  'reservedWithinStock',
  ({ after }) => Expr.lte(after.reserved, after.stock),
  { message: 'Reserved stock cannot exceed the stock', path: ['reserved'] },
)
const Product = ProductFields.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
  reservedWithinStock,
)
const Policy = Shop.implement({})
const ReserveStock = Mutation.write(
  'ReserveStock',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { reserved: 'quantity' } },
  ),
)
-->

```ts
import * as Domain from '@alchemy.run/domain'
import { Schema } from 'effect'
import { RpcMiddleware } from 'effect/rpc'
import { Lower } from 'foldkit-remote-domain/lower'

class StockReserved extends Domain.Event('StockReserved', {
  quantity: Schema.Int,
  reservedAfter: Schema.Number,
  revisionAfter: Schema.Number,
}) {}

class ProductListed extends Domain.Event('ProductListed', { row: Product.schema }) {}

class CurrentUser extends Domain.RequestContext<CurrentUser>()(
  'Shop/CurrentUser',
  Schema.OptionFromNullOr(User),
) {}
class Session extends RpcMiddleware.Service<Session, { provides: CurrentUser }>()('Shop/Session') {}

const Reserved = Lower.write(ReserveStock, {
  policy: Policy,
  revision: 'revision',
  principal: CurrentUser,
  middleware: [Session],
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
// Exposes .command, .rejections, .decide, .evolve, .reply, .state, .initial, .view, .binding, .reads
```

| Part | Source |
| --- | --- |
| Command tag, target, input | Derived from mutation name, Entity `id`, and write input fields |
| `Conflict`, `Unmet`, `Invalid` rejections | Derived from the mutation's `Refusal` |
| `Forbidden`, `Unauthenticated`, `NotFound`, `Reused` | Built-in guarded update and idempotency refusals |
| `decide`, `evolve`, reply, View state, adapter bindings | Derived automatically |
| `event`, `record`, `apply`, `listed` | Supplied by you (stored Event contract) |
| `revision`, `principal`, `middleware`, `policy` | Supplied by you (versioning and auth wiring) |

`Lower.check(write)` inspects a write before lowering and returns any single-aggregate blockers (`OutsideBoundary` for cross-row reads, `NotPersisted` for unstored members). Declare the write over the Entity `Guards.attach` returned: over the one you passed to it, `Lower.check` and `Lower.write` throw (`… carries guards on another descriptor of it`) rather than miss its Update rules. Lowered aggregates also remember the last 256 operation digests per row and refuse mismatched reuse with `Reused` (only after the caller passes authorization).

## Failure modes and current limits

- **Lagging Views:** reads wait up to `confirmWithin` (default 2 seconds); if still behind, Remote keeps its optimistic/written row and retries with exponential backoff (1s to 30s). Tokens over 512 characters cannot set a floor.
- **Monotonic revisions:** Remote drops any row or live frame older than the held revision, including resurrected rows after a delete. Ensure every Event advances `revision`.
- **Principal switches:** calling `Data.forget` on sign-out clears all cached rows; the adapter itself caches no rows.
- **Internal defects:** lowered writes log unexpected failures via `RemoteServer.report` (`ServerDefect`) and return only `Internal error, incident <id>` over the wire (mapped to `RemoteUnreachable`).
- **`written` authorization safety:** `DomainRemote.command` refuses `written` if the Entity's Update rules do not imply its Read rules or if a field has its own Read rule. It throws for a mutation whose write is declared over the Entity you passed to `Guards.attach` instead of the one it returned, which holds none of the rules to check.
- **Upstream `2.0.0-beta.86` limits:** tested against `Domain.InMemory` and `Domain.protocolHttp` (not Durable Objects or WebSockets); live reads with relations fail `RemoteLiveError`; each listed row costs one View snapshot (16 concurrent).

## Reference

| Export | Entry | Purpose |
| --- | --- | --- |
| `DomainRemote.view`, `.command`, `.query` | `.` | Bind Views, commands, and paged Queries |
| `DomainRemote.refuse`, `.forbid`, `.unauthenticated`, `.fail` | `.` | Map Domain rejections to Remote errors |
| `DomainRemote.layer`, `Receipt` | `.` | Provide `RemoteClient`; `{ stream, version }` type |
| `pageReader`, `PageReaderConfig` | `./server` | In-process SSR pre-reader |
| `Lower.check`, `Lower.write`, `LoweringFinding` | `./lower` | Compile declared writes into Aggregates |
| `Imported.mutation`, `.describe`, `.show` | `./imported` | Wrap and audit undeclared commands |
| `Fixture.make` | `./testing` | In-memory Domain model as `RemoteClient` |

## Next

- [An event-sourced domain behind Remote](../../docs/event-sourced-domains.md) — full reservation walkthrough and when to choose Domain over SQL.
- [`foldkit-remote`](../remote/README.md) — normalized store, queries, mutations, and live streams.
- [`foldkit-entity`](../entity/README.md) — declaring entities, invariants, and writes once.
