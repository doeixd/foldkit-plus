# One domain declaration

In most applications, facts about your data—such as products having an owner, stock limits, lifecycle states, and reviews—get duplicated in four places: SQL tables on the server, cache keys and optimistic updates in the browser, validation in forms, and pre-checks inside handlers. Every extra copy drifts over time until the UI permits an action or renders a list that the server rejects.

Foldkit Plus lets you write those facts once in a **domain module** using `foldkit-entity`, `foldkit-guard`, and `foldkit-remote`: Entities and relations, invariants, lifecycle states, guard rules, declared writes, and queries. The domain module stays free of database drivers and UI code, so the server, browser cache, forms, and tests all read one source of truth.

This model is state-based—the stored row is the authoritative fact. If your server is event-sourced, see [When to use another approach](#when-to-use-another-approach).

## Who owns what across the domain

| Responsibility | Owner |
| --- | --- |
| Product fields, relations, derived counts | `foldkit-entity` (`define`, `relate`, `derived`) |
| Single-field format rules | Effect `Schema` on the field |
| Cross-field and transition invariants | `foldkit-entity` (`Entity.invariant`) |
| Named lifecycle states | `foldkit-entity` (`Entity.refine`) |
| Operation-level writes and preconditions | Declared `Write` (`Mutation.update` / `Write`) |
| Filtered and sorted queries | `Query` and `Expr` declarations |
| Read and write authorization rules | `foldkit-guard` using the same `Expr` |
| SQL tables and column mappings | Server (`foldkit-remote-drizzle`'s `bind`) |
| Browser row cache and optimistic layers | Client (`foldkit-remote` in `Model`) |
| Form drafts and submit validation | `foldkit-form` in parent `Model` |
| Editor open state and save status | `foldkit-crud` reading Remote |

Two boundaries keep the domain predictable:

- **Declarations stay explicit:** Adding an Entity or relation adds no automatic endpoints or CRUD lists; every query and write exists only where you declare it.
- **The server writer decides:** Client evaluations and forms compute early hints and optimistic layers from the same rules, while the server's database statement makes the binding decision.

## How one domain feeds the server, client, and checks

Every rule and query in the domain module uses the `Expr` language ([Expressions](./expressions.md)), so three independent consumers interpret the exact same declarations:

1. **The server (`foldkit-remote-drizzle`):** Binds Entities to SQL tables (`bind`), compiles queries and guard rules to SQL (`query`, `source`), attaches `CHECK` constraints (`checkConstraints`), and executes declared writes (`writer`, `GuardServer.writer`).
2. **The browser (`foldkit-remote`, `foldkit-form`, `foldkit-crud`):** Tracks cached rows, applies optimistic write layers, places rows in lists, computes `Data.can` hints, and validates form inputs against `Entity.input`.
3. **Offline checks (`Entity.judge`, `Laws.check`):** Evaluates invariants against test rows and verifies declared writes against every rule without touching a database.

## One rule, three readers

This short example declares an `Item` entity with a stock invariant and a `Hold` write, then checks it with `Entity.judge` and `Laws.check`:

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Laws } from 'foldkit-entity/laws'
import { Mutation } from 'foldkit-remote'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, stock: Schema.Number, reserved: Schema.Number }),
).pipe(
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

const Hold = Mutation.update('Hold', Item, { set: { reserved: Schema.Number } })

// Reader 1: pure reference judge over an in-memory row.
Entity.judge(Item, { after: { id: 'i1', stock: 3, reserved: 5 } })._tag // 'Invalid'

// Reader 2: static analysis of every declared write against every invariant.
Laws.show(Laws.check({ writes: [Hold] }))
// Hold   x reservedWithinStock   refused: Reserved stock cannot exceed the stock
//     before   reserved: 0, stock: 0
//     input    reserved: 1
//     after    reserved: 1, stock: 0
```

Both `Entity.judge` and `Laws.check` run purely on declarations in memory. `Laws.check` immediately flags that `Hold` allows setting `reserved` past `stock`, meaning the third reader—the server writer—must enforce that invariant inside the SQL `UPDATE` where `Hold` commits. All three readers act on one rule written once.

## Building one domain, layer by layer

The sections below walk a single catalog domain from Entity definition through server, client, and agent integration. Each snippet builds on the one above it.

<!-- docs-check standalone -->

### 1. Entities, relations, and derived members

```ts
import { Schema } from 'effect'
import { Derived, Entity, Expr, Order, Query as Body, Relation, Write } from 'foldkit-entity'
import { Laws } from 'foldkit-entity/laws'

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    name: Schema.String.check(Schema.isMinLength(1)),
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)
const ReviewFields = Entity.define('Review', Schema.Struct({ id: Schema.String, stars: Schema.Number }))

const Catalog = Entity.relate(
  { Product: ProductFields, Review: ReviewFields },
  { Review: { product: Relation.one(ProductFields) } },
)
```

Field schemas enforce per-value constraints (`name` length, `status` enum). Declaring relations separately in `Entity.relate` lets mutually referencing Entities resolve cleanly without circular TypeScript inference, keeping storage column names out of the domain.

### 2. Derived members, invariants, and lifecycle states

```ts
const Guarded = Catalog.Product.pipe(
  Entity.derived({ reviewCount: Derived.count(Catalog.Review.relations.product) }),
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

const Draft = Entity.refine(Guarded, 'Draft', { status: 'draft' })
const Published = Entity.refine(Guarded, 'Published', { status: 'published' })
```

Derived counts (`Derived.count`) are computed dynamically by readers so they stay consistent with reviews, invariants enforce multi-field rules, and `Entity.refine` names reusable states. See [Laws](./laws.md) for choosing the right declaration for each rule.

### 3. Authorization guards

```ts
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({ id: Schema.String })

const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

const Product = Guarded.pipe(Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }))
```

Authority stays separate from row validity: an owner cannot violate an invariant, and a valid row grants no permission on its own. `Guards.attach` returns the guarded descriptor that servers bind; see [Auth and Guard](./auth-and-guard.md).

### 4. Declared writes

```ts
import { Mutation, Query } from 'foldkit-remote'

const Publish = Mutation.update('Publish', Product, {
  set: { status: Schema.Literal('published') },
  from: Draft,
  becomes: Published,
})

const Reserve = Mutation.update('Reserve', Product, { set: { reserved: Schema.Number } })
```

Each write specifies the exact fields it updates (`set`) plus optional `from` and `becomes` lifecycle states. Narrowing `status` to `Schema.Literal('published')` lets `Laws.check` prove `becomes: Published` statically.

When an input field name differs from the Entity field or carries extra parameters (such as an `increment` quantity), compose `Entity.input`, `Write.update`, and `Mutation.write` explicitly:

```ts
const PublishLong = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Product, Schema.Struct({ ...Entity.fields(Product, 'id'), status: Schema.Literal('published') })),
    { id: 'id', from: Draft, becomes: Published },
  ),
)
```

Because writes are declarative data, the server needs no custom imperative handler and the browser can predict optimistic updates right away. See [Declared writes](./declared-writes.md) for preconditions, increments, retries, and ledgers.

### 5. Queries and Selections

```ts
const ForSale = Query.define('ForSale', { search: Schema.String }, ({ input }) =>
  Body.from(Published).pipe(
    Body.where(Expr.contains(Product.fields.name, input.search)),
    Body.orderBy(Order.desc(Product.fields.stock)),
  ),
)

const Card = Entity.select(Product, { name: true, stock: true, reviewCount: true })
```

`ForSale` defines which rows match (reusing `Published`) and how they sort, while `Card` selects which fields to fetch. Printing `Body.show(ForSale.body)` displays the exact query structure:

```output
FROM Product
WHERE Product.Published
  AND contains(Product.name, $search)
ORDER BY Product.stock DESC
```

### 6. Checking rules without a database

```ts
Laws.show(Laws.check({ writes: [Publish, Reserve] }))
```

```output
Product
  Draft -> Published   Publish   holds
  Draft                          unreached
  Published                      terminal

Publish   x reservedWithinStock   kept: writes no member it reads
Reserve   x reservedWithinStock   refused: Reserved stock cannot exceed the stock
    before   reserved: 0, stock: 0
    input    reserved: 1
    after    reserved: 1, stock: 0

1 entity, 2 states, 2 writes, 1 rule: 2 pairs, 1 kept, 1 refused, 0 undecided
```

`Laws.check` proves `Publish` transitions `Draft -> Published` safely and flags `Reserve` as needing runtime enforcement at commit time. It also notes that `Draft` is unreached because no declared insert write creates drafts yet. Teams often check this report into source control alongside their domain, as in [`examples/writes/LAWS.md`](../examples/writes/LAWS.md).

### 7. Wiring the server

The server maps Entity fields to Drizzle table columns and hands everything else to `source`, `query`, `GuardServer.writer`, and `checkConstraints`:

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { bind, checkConstraints, query, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'

const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  reserved: integer('reserved').notNull(),
  revision: integer('revision').notNull(),
})
const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  stars: integer('stars').notNull(),
  productId: text('product_id').notNull(),
})

const Policy = Shop.implement({})

const Db = bind(
  { Product, Review: Catalog.Review },
  {
    Product: {
      table: products,
      fields: { name: products.title },
      visible: GuardDrizzle.visible(Policy, [Product]).Product,
    },
    Review: { table: reviews, relations: { product: { field: reviews.productId } } },
  },
)

const checks = checkConstraints(Db.Product).constraints.map(check => check.constraint)
const guarded = GuardServer.writer(Product, Policy, writer(Db.Product), { revision: 'revision' })

const server = RemoteServer.make<Option.Option<typeof User.Type>, DrizzleDatabase>({
  entities: [source(Db.Product, { filter: GuardServer.filter(Product, Policy) })],
  queries: [query(ForSale, { entity: Db.Product })],
  mutations: [RemoteServer.write(Publish, guarded), RemoteServer.write(Reserve, guarded)],
})
```

<!-- docs-check
void [checks, server, Card]
-->

Notice `Db` requires no custom SQL for `ForSale`, no handler for `Publish`, and no mapping for `reviewCount` (which `bind` counts automatically from `Review`). This is where rules are enforced authoritatively.

### 8. Wiring the browser

The client creates a `Remote` instance over the exact same `Product`, `ForSale`, `Publish`, and `Reserve` declarations:

```ts
import { Optic } from 'effect'
import { Verdict } from 'metakit'
import { Remote } from 'foldkit-remote'
import { ModelRef } from 'foldkit-surface'

const Model = Schema.Struct({ remote: Remote.Model })

const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof Model.Type>().key('remote'), ['remote']),
  entities: [Product],
  queries: [ForSale],
  mutations: [Publish, Reserve],
})

declare const model: typeof Model.Type

const forSale = Data.query(ForSale, { search: '' }, { select: Card })

const label = Verdict.match(Data.can(model, Publish, { id: 'p1', status: 'published' }), {
  True: () => 'Publish',
  False: () => 'Cannot publish',
  Unknown: () => 'Publish',
})
```

<!-- docs-check
void [forSale, label]
-->

Using those shared declarations, `Remote` keeps cached rows inside your `Model` and adds three capabilities automatically:

- **Optimistic layers:** `Data.mutate` previews changes immediately and clears the overlay once the server settles.
- **List placement:** `ForSale` moves optimistic items into or out of cached query results when every required field is held locally, deferring uncertain lists to the server.
- **Pre-send hints:** `Data.can` returns a `Verdict` (`True`, `False`, or `Unknown`) from cached rows without guessing when fields are absent.

Forms also consume `Entity.input(Product, ...)` directly to generate controls, per-field rules, and invariant markers; see [From declarations to the screen](./declared-data-to-ui.md).

### 9. Wiring an AI agent

An agent exposes capabilities backed by your `Message` union, using `Guards.may` and `GuardAgent.authorize` to gate actions based on the permissions the server sent with each row:

```ts
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { GuardAgent } from 'foldkit-guard/agent'
import { Surface } from 'foldkit-surface'

const Message = defineMessageUnion({ RequestedPublish: { id: Schema.String } })
const App = Surface.application({ Model, Message })

const Asked = Product.pipe(Guards.may)
const Row = Entity.select(Asked, { name: true, may: true })

const ShopAgent = Agent.forApplication(App).withPrincipal(Shop.Principal)

ShopAgent.expose(Message, {
  RequestedPublish: {
    description: 'Publish a product',
    authorize: GuardAgent.authorize('Update', ({ input, model }) =>
      Data.get(Row, input.id).read(model),
    ),
  },
})
```

If a row isn't loaded yet or its `may` flag forbids updates, the agent refuses early; the server still verifies guards on commit. See [Agents](./agents.md) and the [guard README](../packages/guard/README.md#agents).

## How refusals map back to declarations

| Failure condition | Client sees | Origin | Recovery |
| --- | --- | --- | --- |
| Caller lacks permission | `Forbidden` | `foldkit-guard` | Unauthorized; keep hidden |
| Row is in wrong state | `Unmet` | Write `from` or `when` | Re-read updated row |
| Row revision changed | `Conflict` | Write `expect` | Re-read and retry |
| Resulting row breaks invariant | `Invalid` + `message` / `path` | `Entity.invariant` | Show error at `path` |
| Input fails schema validation | Field error | Field `Schema` | Fix input in form |

Four edge cases to expect:

- **Stale client prediction:** If another user reduced stock before your `Reserve` arrived, the server returns `Invalid`, Remote discards the optimistic layer, and `Data.refusal` surfaces the reason.
- **Missing fields on client:** When the client lacks `stock`, it sends `Reserve` directly and lets the server decide.
- **Cross-field form invariants:** Form errors from multi-field invariants clear on any edit to the form, since editing another referenced field might satisfy the rule.
- **Database `CHECK` limits:** State invariants compile to SQL `CHECK` constraints via `checkConstraints`, whereas transition invariants (`before` + `after`) are enforced only by the server writer (which logs `ServerOnlyRules` once at startup).

Use `Law.check` from `foldkit-remote/testing` to verify automatically that client predictions match server execution; see [`examples/writes`](../examples/writes/README.md).

## Five rules that prevent drift

- **Declare relations together:** Pass all related Entities to one `Entity.relate` call.
- **Keep Selections declarative:** Selections carry schemas and compile into Remote's requirement graph without fetching directly.
- **Share predicates as values:** One `Expr` drives SQL compilation, in-memory `evaluate`, and browser `Judge`.
- **Bind the guarded descriptor:** Add derived members and invariants to the Entity first, then pass the result of `Guards.attach` to your server binding so guard rules are enforced at startup.
- **Map operation inputs via `Entity.input`:** Forms, `Entity.selectFor`, and `Entity.valuesFor` all derive from that mapping.

## When to use another approach

- **Small domains with no forms:** Remote's built-in `Entity.make` and `Entity.ref` require less ceremony and compose cleanly alongside `foldkit-entity` later.
- **Offline multi-device merging:** Declared writes settle on one server; offline edits that merge across devices belong in [Replicated state](./replication.md) and [Editing server data through a journal](./editing-server-data.md).
- **Event-sourced servers:** If your backend models commands and events with `@alchemy.run/domain`, [`foldkit-remote-domain`](../packages/remote-domain/README.md) bridges those same Remote declarations to your domain; see [`examples/writes-domain`](../examples/writes-domain/README.md).

## Next

| Topic | Guide | Example |
| --- | --- | --- |
| The `Expr` predicate language | [Expressions](./expressions.md) | [`examples/entity`](../examples/entity/README.md) |
| Where rules live and `Laws.check` | [Laws](./laws.md) | [`examples/writes`](../examples/writes/README.md) |
| Preconditions, increments, and ledgers | [Declared writes](./declared-writes.md) | [`examples/writes`](../examples/writes/README.md) |
| Permissions and sessions | [Auth and Guard](./auth-and-guard.md) | [`examples/auth`](../examples/auth/README.md) |
| Named reusable expressions | [Operators](./operators.md) | — |
| Full `foldkit-entity` API | [`foldkit-entity` README](../packages/entity/README.md) | — |
| Reading entities through Remote | [Remote](../packages/remote/README.md#entities-declared-with-foldkit-entity) | — |
| Binding entities to SQL tables | [Drizzle `bind`](../packages/remote-drizzle/README.md#binding-a-foldkit-entity-domain) | — |
