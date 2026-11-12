# From declarations to the screen

A product changes price. A list sorted by price may need to move it; a card
showing its name does not need a new name. Foldkit Plus can make some of those
decisions from the application's declarations: the Entity names the fields, a
Query names what determines membership and order, and a Selection names what a
reader wants. Remote compares a change with those declarations and the data the
client holds. At the view, a Projection and a region can avoid drawing work
when their inputs have not changed.

The server owns server facts. Remote holds the client's representation in the
application Model; a Surface observes it and does not become another owner.
Local UI state belongs to the Model and changes through Messages and `update`.
For offline edits whose authoritative order is a journal, see
[Replicated state](./replication.md).

## The path, and what is known where

One change can cross several boundaries:

```text
Entity and Schema  ->  fields, identity and valid values
Query and Expr     ->  fields a filter and an order read
Write              ->  a declared operation on one row
Remote             ->  reconcile the change and affected connections
Selection          ->  assemble the fields a reader asked for
Projection         ->  read a value from the application Model
Region             ->  reuse a drawing when its inputs have not changed
```

The declarations describe possible work; they do not fetch or mutate data
when they are built. A server or client interpreter acts on them later. Some
dependencies are obtained from expression structure, some are supplied with a
Projection, and some are the actual entity entries visited at runtime. This is
not a single automatic graph for every line of TypeScript: the boundaries and
limits below matter.

## Declare a field and a question

An Entity gives a field a schema and an owner. `Expr` and `Order` then use that
field in inspectable values:

```ts
import { Schema } from 'effect'
import { Entity, Expr, Order } from 'foldkit-entity'
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
```

The query describes published Products ordered by price. `Expr.eq` is a value,
not a database call, and the query body is built once. `Query.dependencies`
can describe the body's fields, distinguishing the predicate's `status`
from the order's `price` and `id`. An interpreter can evaluate a body over rows it holds
or compile it to SQL. A field's schema checks its values; the expression says
how the field is used. Types and schemas alone do not reveal the behavior of an
arbitrary function.

The complete API and a worked server/client example are in the
[`foldkit-entity` guide](../packages/entity/README.md) and
[`examples/entity`](../examples/entity/README.md).

## Declare a write

A declared write says which Entity and input it uses, what it changes, and
optionally when it may happen. The following, over the same `Product`, is the
precondition example from [Declared writes](./declared-writes.md):

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
```

`Publish` describes an update to one Product by id. Its input maps `status`
to the Product field, and the literal constrains it to `published`; `when`
reads the old status. The declaration performs no write. A server writer
executes it and reports the result; a guarded writer enforces policy at the
server. Declared computed assignments and increments can also inform the
client's prediction while the answer is pending. The guide explains which
guarantees require revisions or an operation ledger.

One declaration is not permission to change a row. Authorization and
invariants are separate decisions, and the server remains the authority. A
declared write covers one row by id; a custom multi-row server handler is
ordinary code, and the declaration does not automatically describe everything
that handler writes.

## From a changed field to a query

Return to the published-products query: suppose Remote receives a Product
change that touches `price`. The held connection's query declares `price` in
its ordering. Remote can compare the changed fields with the query's predicate
and order dependencies, then consider the actual row, loaded pages and
available information. Its impact decision can keep a connection, place a row
where that is safe, or invalidate it so an active read can fetch again.

That decision is narrower than “price changed, refresh everything.” A change
to a selected value can update what a row displays without necessarily changing
which rows match or their order. Conversely, a price change can alter a sorted
list's order or bring a row across a page boundary. When the client cannot
establish the right placement—for example, it lacks a required value or the
server applies a filter the client cannot judge—it must not claim to know the
answer. The [Remote guide](../packages/remote/README.md) describes reads,
freshness, live changes and connection behavior.

For an existing read, `explain` from `foldkit-remote/why` describes its query
and dependencies; `why` from the same subpath explains the current read state,
and takes the active Surfaces (`options.surfaces`) to tell which ones read it. Those explanations are
inspectable data, useful when a list is stale, loading, or showing a pending
write. They do not promise a single causal trace through every server, client
and renderer.

## From a Selection to a drawing

An `Entity.select` says which fields and relations a reader needs. A Remote read
uses that Selection to assemble a value from the Model's normalized store.
For a project and its owner's name, the read depends on the project entry and
the owner entry it reaches. Remote can reuse a result when the entries visited
by that read still match by identity. The Selection gives the relation's shape;
the current record supplies the particular owner id.

At the Model boundary, a Projection names a value to read and may carry Model
path dependencies. `Projection.derive` can reuse its result while the declared
paths are unchanged. A `SlotView.region` can consume a Projection: during a
normal render it compares the values at its paths by identity and can reuse its
previous drawing when the inputs hold. The region's drawing receives the
projected value, rather than needing the whole Model.

There is an important Remote distinction: a Remote read names requirements in
metadata, not a Model path. A region over such a read reads it on each render
and can reuse its drawing when the read gives the same fields. A derivation
that names the Remote store's Model field can avoid re-reading while that store
holds. See [regions in the Mixins README](../packages/mixins/README.md#regions-redraw-by-the-model-paths-read)
and [derivations in Surface](../packages/surface/README.md#derivations) for the
actual APIs and examples.

A `SlotView.region` is declared where the application wants one. Separately, a
Bundle placement's view, a collection's items and a `Link.child` drawn without
view inputs are kept while the child's Model is the same object (`memo: false`
opts out). Either way the root view may still run and reach the drawing;
reusing it is not the same claim as scheduling a single DOM text binding. Ordinary `Projection.derive` takes an explicit list
of dependencies beside a TypeScript function: that function must read only
what the list names. A schema cannot infer arbitrary code's reads.

## What is derived, and what remains explicit

| Concern | What Foldkit Plus knows today | What still needs a decision |
| --- | --- | --- |
| Fields and values | Entity identity, member schemas and declared relations | The application declares its domain and storage bindings |
| Query impact | Query expressions expose predicate and order dependencies; Remote compares changes against held connections | Runtime rows, pages, server filters and delivery determine what can be placed or must be fetched |
| Writes | A declared single-row Write describes its input, assignments and conditions | A custom handler's arbitrary effects are not inferred; the server checks authority |
| Selected data | Selections describe fields and relations; Remote tracks entries visited by reads | A particular relation's target is resolved from the data held at runtime |
| UI regions | Projections describe reads; regions and placed views can reuse drawings | Plain TypeScript derivations declare their dependencies; a normal root render can still reach the region |
| Distributed edits | Sync distinguishes a committed base from pending edits replayed over it | The journal, transport, authorization and failure policy govern convergence; no global atomicity is implied |

[Message write sets](https://github.com/doeixd/foldkit-plus/issues/439) (an
invalidation map from a write to the lists it reaches) are still a proposal,
and views compiled to fine-grained patches were closed as not planned
([#433](https://github.com/doeixd/foldkit-plus/issues/433)); neither is a
current guarantee. A region reuses its drawing by the identity of the values
at its declared paths, so a derivation that reads more than it names shows a
stale value; `Projection.derive`'s `verify` option checks that in development.

The distinction lets the same application use inspectable expressions where
they pay for themselves and ordinary Foldkit code elsewhere. Declarations can
identify candidate consequences; data still has to cross the network, policy
must be enforced, and a runtime must do the work.
