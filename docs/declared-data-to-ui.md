# From declarations to the screen

Suppose a product changes price on the server. A catalog list sorted by price needs to move that row to its new position, while a summary card showing only the product's name stays unchanged.

Foldkit Plus drives those decisions from declarations you write once: `Entity` names the fields, `Query` names what filters and orders a list, `Write` describes what a mutation updates, and `Selection` plus `Projection` name what a screen reads. The server owns the source of truth; `foldkit-remote` keeps the client's normalized copy inside your `Model`, and `foldkit-surface` reads from that `Model` without creating a second store.

For offline edits ordered by a server journal, see [Replicated state](./replication.md).

## How one declaration crosses boundaries

Declarations build inspectable values; they perform no database queries or network requests on their own. Instead, interpreters on the server and client read them when data moves across seven steps:

1. **`Entity` and `Schema`** declare each record's `id`, fields, and valid values.
2. **`Query` and `Expr`** declare which fields filter and order a list.
3. **`Write`** declares a single-row insert, update, or delete by `id`.
4. **`Remote`** reconciles incoming row changes against loaded lists in your `Model`.
5. **`Selection`** extracts the exact fields and nested relations a reader wants.
6. **`Projection`** reads a typed slice from your `Model` and tracks its field paths.
7. **`SlotView.region`** skips re-rendering a DOM section when its projected inputs match by identity.

## Declare a field and a query

An `Entity` gives each field a schema and an owner. `Expr` and `Order` build query predicates and sort keys as plain data structures you can inspect:

```ts
import { Schema } from 'effect'
import { Entity, Expr, Order, Query as EntityQuery } from 'foldkit-entity'
import { Query } from 'foldkit-remote'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    price: Schema.Number,
    status: Schema.Literals(['draft', 'published', 'archived']),
    revision: Schema.Number,
  }),
)

const PublishedByPrice = Query.define('PublishedByPrice', {}, () =>
  Query.from(Product).pipe(
    Query.where(Expr.eq(Product.fields.status, 'published')),
    Query.orderBy(Order.asc(Product.fields.price), Order.asc(Product.fields.id)),
  ),
)

const deps = EntityQuery.dependencies(PublishedByPrice.body)
console.log({
  predicate: deps.predicate.map(field => field.key),
  order: deps.order.map(field => field.key),
})
```

Running that prints:

```text
{ predicate: [ 'status' ], order: [ 'price', 'id' ] }
```

`PublishedByPrice` builds the query body once without running SQL or touching a cache. `EntityQuery.dependencies` separates the predicate field (`status`) from the ordering fields (`price`, `id`), letting the Drizzle compiler generate SQL on the server and `foldkit-remote` evaluate row changes on the client.

See [Expressions](./expressions.md) for the full expression language and [One domain declaration](./entity.md) for relations and derived fields.

## Declare a write

A declared write names the target `Entity`, the accepted input schema, which fields it assigns, and an optional `when` precondition checked on the existing row:

```ts
import { Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
  ),
)

console.log({
  tag: Publish.write._tag,
  sets: Publish.write.sets.map(set => set.field.key),
  hasWhen: Publish.write.when !== undefined,
})
```

Running that prints:

```text
{ tag: 'Update', sets: [ 'status' ], hasWhen: true }
```

`Publish` updates one `Product` by `id`, constrains `status` to `'published'`, and checks that the row is currently `'draft'`. A server writer executes the SQL statement and enforces authorization guards and invariants ([Declared writes](./declared-writes.md)).

## From a changed field to a query

When `foldkit-remote` receives a `Product` update that changes `price`, it compares the changed fields against `PublishedByPrice`'s declared `predicate` and `order` dependencies, along with the loaded pages in the cache:

- **Non-matching field:** Changing `name` touches neither `status` nor `price`, so held lists keep their current order without refetching.
- **Ordering or predicate field:** Changing `price` or `status` moves the row inside a loaded segment when all required fields and boundaries are known. When page boundaries or server filters leave the client uncertain, Remote invalidates the connection so active Surfaces refetch.

To inspect why a query is in its current state (`Loading`, stale, or holding a pending write), call `explain` and `why` from `foldkit-remote/why` with your active Surfaces (`options.surfaces`). See [the Remote guide](../packages/remote/README.md) for read states, freshness, and live updates.

## From a Selection to a drawing

An `Entity.select` names the fields and relations a screen needs, and `foldkit-remote` assembles that value from the normalized entity store in your `Model`. When a read visits a product entry and its owner entry, Remote reuses the assembled result while those visited entries keep the same object identity.

At the view layer, `Projection.derive` reuses its computed result while its declared `Model` paths remain identical. When a `SlotView.region` renders a Projection, it compares those projected inputs by identity and skips re-drawing its DOM subtree when nothing changed.

Note the boundary between Remote reads and Model paths:

- A **Remote read** tracks requirements in store metadata rather than a direct `Model` path, so a region reading it evaluates the read on render and skips re-drawing when the returned selection matches.
- A **Projection** over `App.model.<field>` skips re-running `derive` completely while that `Model` slice is unchanged.

Separately, `Bundle` placements, collection items, and `Link.child` views skip re-drawing while the child's `Model` keeps the same object reference (pass `memo: false` to opt out). Ordinary `Projection.derive` always requires an explicit dependency list beside its function; pass `verify: true` in development to catch reads outside that declared list. See [regions in Mixins](../packages/mixins/README.md#regions-redraw-by-the-model-paths-read) and [derivations in Surface](../packages/surface/README.md#derivations).

## What is derived, and what remains explicit

| Concern | Derived automatically | Declared explicitly |
| --- | --- | --- |
| Fields and values | Entity id, field schemas, and relations | Domain definitions and database table bindings |
| Query impact | Predicate and order field dependencies | Loaded pages, server-only filters, live transport |
| Single-row writes | Input schema, updated fields, `when` check | Custom multi-row handlers and server permissions |
| Selected data | Visited store entries reused by identity | Relations resolved at runtime from store rows |
| UI regions | Reused drawings when inputs hold identity | Explicit path dependencies on `Projection.derive` |
| Distributed edits | Committed base plus pending local edits | Journal, transport, and conflict policy |

Two explicit boundaries apply today:

- **Custom server handlers:** A multi-row server handler's side effects are not inferred automatically; declare single-row mutations with `Write` or invalidate affected queries explicitly.
- **Fine-grained DOM patches:** Views do not compile to per-binding DOM patches; use `SlotView.region` and `Projection.derive` (with `verify` in development) to isolate expensive subtrees cleanly.

## Next

- Learn how `Message`s and structural seams keep state consistent: [Who changes application state, and how](./state-model.md)
- Define your own entities, relations, and invariants: [One domain declaration](./entity.md)
- Explore server queries, caching, and optimistic writes: [Remote](../packages/remote/README.md)
