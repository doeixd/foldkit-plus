# Declared writes

Updating a database row safely usually requires reading it first to check permissions and preconditions, then updating it in a second statement, while also duplicating validation and optimistic updates on the client. Any concurrent edit between the read and write risks overwriting data, and client previews drift from server rules.

A **declared write** describes a single-row change—which row, what fields it sets or increments, and what conditions must hold—once as data. From that one value, `foldkit-remote-drizzle` compiles a single compare-and-set SQL statement, `foldkit-guard` checks permissions against the exact row version being modified, and `foldkit-remote` renders optimistic updates and early refusals in the browser.

See the runnable example in [`examples/writes`](../examples/writes/README.md).

## Who owns what

| Piece | Package | Responsibility |
| --- | --- | --- |
| Write declaration (`Write`) | `foldkit-entity` | Fields changed, `when` preconditions, increments, `compute` |
| Row & change invariants | `foldkit-entity` | Rules every stored row or update must satisfy |
| Authorization rules | `foldkit-guard` | Who may write which row and field |
| SQL writer & ledger | `foldkit-remote-drizzle` | Single `update ... where` statement and retry ledger |
| Client mutation & outbox | `foldkit-remote` | Operation IDs, optimistic display, local refusals, outbox |

The database row is the single source of truth. The write ledger records which operation IDs have already landed so retries don't double-apply, and the client's optimistic overlay is recomputed from stored rows and dropped as soon as the server answers.

Declared writes target one row by ID. Multi-row transactions use a handler (`RemoteServer.mutation` with `GuardServer.mutation`), and offline multi-device merges belong in Sync (see [Editing server data through a journal](./editing-server-data.md)).

## How one row version decides everything

Every declared write passes through three checks on one version of the row:

1. **Authorization (`Forbidden`):** `foldkit-guard` reads the row at revision `r` and checks write rules.
2. **Statement commit:** The writer executes `update ... set ..., revision = revision + 1 where id = ? and revision = r and <when> and <invariants>`.
3. **Refusal classification:** If no row changed, a follow-up check reports whether the row disappeared, moved past revision `r` (`Conflict`), failed `<when>` (`Unmet`), or broke an invariant (`Invalid`).

On the client, any read of the row combines the committed row with pending `set` fields and pending `increment`/`decrement` amounts (`committed + pending sets + pending increments`), recomputed on read.

## A first precondition: publishing a draft

Suppose a `Product` can only be published when its `status` is `'draft'`. Declare the entity, a `Publish` write, and a `Sell` stock-adjustment write once, then serve `Publish` without writing a custom SQL handler:

```ts
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    stock: Schema.Number,
    revision: Schema.Number,
  }),
)

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
  ),
)

const Sell = Mutation.write(
  'Sell',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
```

Serve `Publish` directly with `writer(Db.Product)`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { bind, writer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'

const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const Db = bind({ Product }, { Product: { table: products } })

const server = RemoteServer.make({
  entities: [],
  mutations: [RemoteServer.write(Publish, writer(Db.Product))],
})
```

A draft product transitions to `'published'`; an archived product is refused with `Unmet`; an already published product returns cleanly without altering the row.

What each call does:

- **`Write.update(input, { id, when })`** defines the update declaration and compiles `when` against the Entity's own fields.
- **`Schema.Literal('published')`** pins a constant value in the input schema so decoders reject any other status before reaching the writer.
- **`Mutation.write`** types the mutation's exact refusal union (`Unmet` and `Conflict` for guarded/preconditioned updates; `Taken` for inserts).
- **`writer(Db.Product)`** executes the single SQL `UPDATE` and classifies failures when zero rows match.

## Pinning guards to the written revision

Checking permissions in one query and updating in another leaves a race window if ownership changes in between. Pass `{ revision: 'revision' }` to `GuardServer.writer` so the update statement pins the exact revision the guard inspected (see [`examples/writes/src/server.ts`](../examples/writes/src/server.ts)):

<!-- docs-check standalone
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Mutation } from 'foldkit-remote'
import { bind, writer } from 'foldkit-remote-drizzle'
const User = Schema.Struct({ id: Schema.String })
const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    stock: Schema.Number,
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
const Product = ProductFields.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
)
const Policy = Shop.implement({})
const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
-->
```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'

const Db = bind(
  { Product },
  { Product: { table: products, visible: GuardDrizzle.visible(Policy, [Product]).Product } },
)
const guarded = GuardServer.writer(Product, Policy, writer(Db.Product), { revision: 'revision' })
```

The `visible` clause filters rows by read permissions before guards evaluate. If the row changes between the guard check and the SQL update, `GuardServer.writer` re-evaluates up to three times before failing with `"changed while it was written"`. `GuardServer.validate` reports unpinned guarded writes as `UnpinnedWrites`.

Guard rules that cross to another row (such as team membership) are forwarded to the writer as `requires` clauses inside the SQL `WHERE` so they evaluate atomically on commit; see [Rules that read another row](../packages/guard/README.md#rules-that-read-another-row).

Refusals evaluate in strict security order so callers learn nothing about rows they cannot access:

1. Hidden rows or failed guard rules return `Forbidden`.
2. Stale `expect` revisions return `Conflict`.
3. Failed `when` preconditions return `Unmet`.

Writes whose `when` or `expect` inspects a field hidden by a Read rule are rejected at boot; see [Guard's Serving writes](../packages/guard/README.md#serving-writes).

## Concurrent increments and decrements

Use `increment` or `decrement` to adjust numeric columns atomically in SQL (`stock = stock + ?`) without lost updates:

```ts
const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { stock: 'quantity' } },
  ),
)
```

Increments require a non-nullable numeric field distinct from `id`, `revision`, and `set` fields, and `RemoteServer.write` enforces one of two retry protections:

- **Optimistic revision (`expect: 'revision'`):** Concurrent increments conflict and retries of applied writes return `Conflict`.
- **Write ledger (no `expect`, like `Sell` above):** Concurrent increments both succeed and retries return the ledgered result by operation ID.

Use `decrement` with a `when` precondition reading `{ row, input }` to ensure stock never drops below zero:

```ts
const SellInStock = Mutation.update('SellInStock', Product, {
  input: { quantity: Schema.Int },
  decrement: { stock: 'quantity' },
  when: ({ row, input }) => Expr.lte(input.quantity, row.stock),
})
```

`Mutation.update` expands to the same `Mutation.write` / `Write.update` structure with `decrement` compiled as negated addition (`-quantity`).

## Computed field assignments

Use `compute` to derive a field from the pre-write `row` and `input` inside the same SQL statement using declared operators:

```ts
const suffixed = Expr.operator('acme.suffixed', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})

const Rebrand = Mutation.write(
  'Rebrand',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, suffix: Schema.String }),
      { suffix: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      compute: { name: ({ row, input }) => suffixed(row.name, input.suffix) },
    },
  ),
)
```

Register operator implementations in both your server binding and `Remote.make({ operators })` (see [An operator the application implements](../packages/remote-drizzle/README.md#an-operator-the-application-implements)). Unpinned `compute` writes without `expect` require a ledger plus either a revision-pinned guard or a verified commutative operator.

## What every row holds: an invariant

A precondition checks whether *this* write applies; an **invariant** declares what *every* stored row must satisfy regardless of which write touches it:

```ts
const StockFields = Entity.define(
  'Stock',
  Schema.Struct({ id: Schema.String, quantity: Schema.Number, reserved: Schema.Number }),
)
const Stock = StockFields.pipe(
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    { message: 'Reserved stock cannot exceed the quantity', path: ['reserved'] },
  ),
)
```

- **Travels with the Entity:** `StockFields` and `Stock` share the invariant across writes, forms, and server bindings (while guard rules stay attached to the `Guards.attach` descriptor).
- **Evaluated over the post-write row:** The SQL writer folds invariants into `WHERE` using the updated column values (`reserved <= 3`), allowing broken rows to be repaired while refusing writes that leave a row invalid.
- **Strict null semantics:** A `null` operand fails an invariant unless handled explicitly with `Expr.isNull`.
- **Independent of authority:** Admins cannot bypass invariants, and hidden-field violations omit the rule ID and `path` from the `Invalid` refusal.
- **Checked on client and database:** `Data.mutate` rejects definitely-broken writes immediately with `Invalid`, forms display errors at `path` on submit, and `checkConstraints(binding)` generates SQL `CHECK` constraints for defense in depth.

## What every change holds: a transition invariant

Reading `before` alongside `after` in `Entity.invariant` enforces valid state transitions on updates:

```ts
const OrderFields = Entity.define(
  'Order',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['placed', 'shipped']) }),
)
const Order = OrderFields.pipe(
  Entity.invariant(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
)
```

The writer compiles transition invariants into the `UPDATE`'s `WHERE` clause (comparing pre-update columns as `before` and updated expressions as `after`), skipping inserts and deletes. Because SQL `CHECK` constraints inspect a single row, `checkConstraints` omits transition invariants and lists them under `serverOnly`.

## Enforcing a postcondition with `becomes`

Attach `becomes` on a write to guarantee the resulting row satisfies a named `Entity.refine` state:

```ts
const CrateFields = Entity.define(
  'Crate',
  Schema.Struct({ id: Schema.String, stock: Schema.Int, reserved: Schema.Int }),
)
const InStock = Entity.refine(CrateFields, 'InStock', ({ row }) =>
  Expr.gt(row.stock, row.reserved),
)
const SellCrate = Mutation.write(
  'SellCrate',
  Write.update(
    Entity.input(CrateFields, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' }, becomes: InStock },
  ),
)
const soldOut = Write.ensured(SellCrate.write) // { id: 'becomes:InStock', entity: 'Crate', ... }
```

When `becomes` spans finite fields, `Write.update` proves or disproves it at declaration time. For numeric expressions like `SellCrate`, `Write.update` attaches a postcondition (`becomes:InStock`) checked by the writer at commit time (`Invalid` on failure, matched via `Refusal.isInvalidBy(refusal, soldOut)`) and analyzed by `Laws.check`.

For any write to commit, all three checks must pass together: **authorization** (`Forbidden`), **preconditions** (`Unmet`), and **invariants plus postconditions** (`Invalid`).

## Retries: three different guarantees

| Write kind | Retry after lost response | Two concurrent writes from one read |
| --- | --- | --- |
| Sets fixed values (`name = ?`) | Re-applies safely; returns updated row | Later write wins |
| Pinned with `expect: 'revision'` | Returns `Conflict`; client re-reads | Second write returns `Conflict` |
| Increment/compute with ledger | Returns ledgered result; not re-applied | Both writes apply |

Setting `done: true` rather than toggling a boolean is naturally idempotent; revision pinning provides optimistic concurrency; ledgers deduplicate non-idempotent retries by operation ID.

## Operation IDs and retries

Every `Data.mutate` mints a persistent **operation ID** (`crypto.randomUUID()` or 128-bit random ID) distinct from the per-session `requestId`. Retrying a failed write re-sends the exact input, `now`, and operation ID (validated on the server as up to 128 URL-safe characters):

<!-- docs-check
import { Effect } from 'effect'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { Remote } from 'foldkit-remote'
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ ...Remote.messages }),
  initial: { remote: Remote.initial },
  update: model => ({ model }),
})
const Sell = Mutation.write(
  'Sell',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
  ),
)
const Data = Remote.make({ model: App.model.remote, entities: [Product], mutations: [Sell, Publish] })
declare const model: Model
declare const failedModel: Model
-->
```ts
const started = Data.mutate(model, Sell, { id: 'p1', quantity: -2 })
const again = Data.retry(failedModel, started.requestId)
```

When a request fails with `Unreachable` (network drop or 502 gateway response), retrying via `Data.retry` is safe according to the retry guarantee table above.

## Durable writes that outlive page reloads

Passing `{ durable: true }` to `Data.mutate(model, Sell, input, { durable: true })` with `outbox(Data, ...)` stores the write in `KeyValueStore` before sending, flushes queued writes in order across reloads with the same operation ID and timestamp, and partitions queues per principal. Pair durable writes with a ledgered writer on the server; entries arriving past `clockSkew` record server time (`ClockSkewed`). See [Remote's outbox section](../packages/remote/README.md#a-write-that-outlives-the-page-outbox).

## A write ledger

A write ledger stores applied operations inside the same database transaction (or D1 batch) as the row update (see [`examples/writes/src/server.ts`](../examples/writes/src/server.ts)):

<!-- docs-check
import { Option } from 'effect'
import { primaryKey } from 'drizzle-orm/sqlite-core'
type User = typeof User.Type
const ledger = sqliteTable(
  'write_ledger',
  {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
    request: text('request'),
  },
  table => [primaryKey({ columns: [table.scope, table.operation, table.target] })],
)
-->
```ts
const ledgered = writer<Option.Option<User>>(Db.Product, {
  ledger: {
    table: ledger,
    scope: principal => Option.match(principal, { onNone: () => '', onSome: user => user.id }),
  },
})
```

```sql
create table write_ledger (
  scope text not null, operation text not null, target text not null,
  answer text not null, at bigint not null, request text,
  primary key (scope, operation, target)
);
create index write_ledger_at on write_ledger (at);
```

- **`scope` and `target`:** Isolate operation IDs per caller principal and target row.
- **`request` digest:** Detects if an operation ID is reused with different parameters (`alter table write_ledger add column request text` upgrades older tables).
- **Concurrency:** Postgres serializes duplicate operations with a transaction-scoped advisory lock; D1 writes both in one batch so the primary key collision rolls back the duplicate and reads the recorded answer.
- **Retention:** Entries prune automatically after retention expires (default 1 day), indexed by `at`.
- **Inserts and deletes:** Retried inserts return the original created row from the ledger, while colliding IDs without a matching ledger entry return `Taken`.

Ledgered retries skip re-running guards (which already passed when the write landed) and return the row's current state filtered by read permissions.

## Moving the revision from database triggers

If raw SQL or handlers also update the table, install `revisionTrigger` with your migrations so every external update bumps `revision` (the column must be `NOT NULL`, and Sync-managed tables using `applyEdits` omit it):

<!-- docs-check
declare const sqlite: { exec: (sql: string) => void }
-->
```ts
import { revisionTrigger } from 'foldkit-remote-drizzle'

sqlite.exec(revisionTrigger(Db.Product, 'revision'))
```

## Optimistic previews in the browser

While a declared write is in flight, `Data.mutate` layers `set` values and relative `increment` amounts over cached store rows on read:

- Concurrent live updates merge underneath pending increments rather than being clobbered.
- Multiple pending increments sum cleanly, and dismissing one leaves the others intact.
- Queries sort and place optimistic rows whenever all needed fields are held locally.
- Unfetched fields wait for the server response instead of guessing.

Client previews and local refusals (`Invalid` from held invariants or `Forbidden` from held `may` flags; see [What the client may do](../packages/guard/README.md#what-the-client-may-do)) save round trips without replacing server enforcement. Inspect `Write.reads(write)` and `Write.writes(write)` to see which fields a write depends on or modifies.

## Asking before sending: `Data.can`

`Data.can` evaluates held `may` flags, `when` preconditions, and invariants in memory—matching the server's check order—to guide button states:

```ts
import { Verdict } from '@doeixd/metakit'

const answer = Data.can(model, Publish, { id: 'p1', status: 'published' })
const label = Verdict.match(answer, {
  True: () => 'Publish',
  False: () => 'Cannot publish',
  Unknown: ({ reason }) => `Publish (unchecked: ${reason})`,
})
```

`Data.can` answers a `Verdict` from `@doeixd/metakit`, read with `Verdict.match`:

- **`True`:** Held data passes all checks.
- **`False`:** Its `witness` is the `Forbidden`, `Unmet`, or `Invalid` refusal the server returns, as a `CanRefusal`.
- **`Unknown`:** Its `reason` says what is missing locally (rows, fields, operators, input keys, or `may` flags), several joined by `; `.

`Can.toWire` and `Can.fromWire` convert an answer to and from its JSON shape (`Yes`, `No({ refusal })`, `Undecided({ reasons })`), which is what `CanWire` describes.

`Data.can` is strictly an advisory UI hint (`Data.mutate` still sends `Unmet` writes in case local data is stale) and throws on non-declared mutations.

## Checking the prediction against the server

`Law.check` (`foldkit-remote/testing`) executes one declared write on both client and server (with matching `now` and principal) and verifies optimistic predictions and refusals agree:

<!-- docs-check
import { RemoteServer as LawServer } from 'foldkit-remote-server'
const lawServer = LawServer.make({
  entities: [],
  mutations: [LawServer.write(Sell, writer(Db.Product))],
})
declare const principal: undefined
-->
```ts
import { Law } from 'foldkit-remote/testing'

const report = Law.check(Data, {
  model,
  holds: [{ entity: Product, ids: ['p1'] }],
  mutation: Sell,
  input: { id: 'p1', quantity: -2 },
  now: 0,
}).pipe(Effect.provide(Remote.clientLayer(LawServer.handlers(lawServer, principal))))
```

Enable `Remote.make({ verifyPredictions: true })` in development to log `PredictionMismatch` diagnostics whenever a live server response disagrees with a client overlay.

## Failure and recovery

| Outcome | Meaning | Client response |
| --- | --- | --- |
| Written | Row updated (or deleted if hidden) | Replaces optimistic overlay |
| `Forbidden` | Hidden row or failed guard rule | Display refusal; don't retry |
| `Conflict` | Row revision moved past `expect` | Re-read row; let user decide |
| `Unmet` | Row failed `when` or `from` | Show state change |
| `Invalid` | Row broke invariant or `becomes` | Show `message` at `path` |
| `Taken` | Insert ID already exists (409) | Choose a new ID |
| `"changed while it was written"` | Row contended past 3 retries | Retry later |
| `Unreachable` | Network or gateway failure | `Data.retry` (auto if durable) |
| `"needs a database with transactions"` | Non-transactional ledger database | Pass a Drizzle database |

### Database guarantees

| Feature | SQLite | Postgres | D1 |
| --- | --- | --- | --- |
| Revision, `when`, increment, invariant | Single statement | Single statement | Single statement |
| `checkConstraints`, `entityChecks` | In `CREATE TABLE` | `ALTER TABLE ... ADD` | In `CREATE TABLE` |
| Ledger atomicity | Sync transaction | Async tx + advisory lock | Read + single `batch` + PK |
| `revisionTrigger` | Supported | Supported | Supported (SQLite) |

Single-statement checks are atomic on every backend. On D1, the ledger relies on `changes() > 0` and primary-key rollback inside one `batch` to serialize concurrent duplicates.

## Limits

- Declared writes modify a single row by ID; multi-row or bulk writes use handlers.
- Invariants inspect one row at a time; cross-row uniqueness and foreign keys belong in SQL constraints.
- Computed assignments read pre-write fields and input only.
- External permission calls outside the database cannot be pinned atomically with the SQL write.
- Without `revisionTrigger`, revision pinning depends on every writer incrementing `revision`.
- Retrying an increment after its ledger retention expires applies the increment again.

## Next

- Explore the full runnable example in [`examples/writes`](../examples/writes/README.md).
- Decide where rules belong and run static checks in [Laws](./laws.md).
- Learn how `Expr` predicates work across SQL and memory in [Expressions](./expressions.md).
