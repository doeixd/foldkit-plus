# An event-sourced domain behind Remote

[Alchemy Domain](https://alchemy.run/domain) (`@alchemy.run/domain`) is an
event-sourcing library for Effect, separate from Foldkit Plus. In its words: a
**Command** asks for a change, an **Aggregate** decides it and records
**Events**, a **View** folds Events into a read model, and an **Api** lists
what clients may send and read.

[`foldkit-remote-domain`](../packages/remote-domain/README.md) puts such a
model behind [Remote](remote.md): the page reads its Views and sends its
Commands as it reads and writes any server, and the domain you declared with
[`foldkit-entity`](entity.md) keeps meaning one thing on both sides. This
guide is about how the two fit. The package README is the contract, and
[`examples/writes-domain`](../examples/writes-domain) is the running proof.

The package is experimental and pins one beta of Domain (`2.0.0-beta.86`).

## Rows or Events

Both are authorities a declared domain can run on. The page's code is the same
`Remote.make` either way; what differs is what the server keeps.

| | Rows in a database | An event-sourced model |
| --- | --- | --- |
| The record | the current row | every Event; the row is a fold of them |
| A write lands as | an `UPDATE` the writer derives from the declared write | a Command an Aggregate decides, appending Events |
| A read after a write | sees the write | may come from a View that has not folded it yet |
| Packages | `foldkit-remote-server`, `foldkit-remote-drizzle` | `@alchemy.run/domain`, `foldkit-remote-domain` |
| You also get | SQL constraints, a write ledger, joins | the history, and Domain's Policies, Sagas and Projections reacting to Events |

Choose Events when the history is itself something the business reads or
reacts to, or when a Domain model already exists. Choose rows otherwise:
[declared writes](declared-writes.md) over a table give the page the same
predictions and refusals with no View to wait for.

## Who owns what

| Fact or transition | Owner |
| --- | --- |
| The Events, and whether a Command is accepted | the Domain model: the Aggregate's `decide` and `evolve` |
| The row a reader sees, and whether they may see it | the Domain model: the View, and its `validate` |
| What a write means: its precondition, its guard, the invariants of the row it leaves | the declaration (`Write`, `Guards`, `Entity.invariant`), when the write is lowered; the Aggregate's own `decide` when it is not |
| The page's copy of a row, a pending write and its prediction, a refusal | Remote (`Remote.Model`) |
| The receipt of a write whose View is behind, and each row's revision | Remote, as a read-after token and a row revision |
| Translating between the two | the adapter (`DomainRemote.layer`), which owns no row and decides nothing |

A **receipt** is what a Command answers besides its reply: the stream it
appended to and how many Events that stream now holds. A **revision** is a
number field of the row that every Event of the stream moves; you name it when
you bind the View, and Remote orders two copies of a row by it. "Receipt",
"Command", "Aggregate", "Event", "View", "Rejection", "Story" and "Api" are
Domain's words; "Entity", "declared write", "guard", "invariant", "Refusal"
and "prediction" are this project's.

## The loop

```text
page      Data.mutate(model, ReserveStock, input)    Remote predicts from the declaration; the write is pending
adapter   client.ReserveStock(id, input,             the Command, under a commandId derived from
            { commandId })                             who asks, the operation and the input
Domain    decide -> [StockReserved] appended          the one decision; a refusal is a Rejection
          -> { reply, stream, version }               the receipt
adapter   ProductRow.snapshot(id, { atLeast })        asks the View at the receipt, for a bounded time
Domain    the View folds StockReserved                when the Event is delivered to it
adapter   answers the write: the View's row, or       a Rejection becomes the mutation's Refusal
            the reply's fields with the receipt
page      the answer replaces the prediction;         Remote holds the row to the receipt until a
            a later read carries the receipt            read at it answers
```

The page never reads the Aggregate, and never folds an Event itself. It reads
rows from a View and learns of its own write from the Command's reply.

## Three ways a Command meets a declared write

| | The rules are decided by | The page predicts | Use it when |
| --- | --- | --- | --- |
| **Lower** a declared write (`Lower.write`) | the declaration, run inside the Aggregate's `decide` | yes, from the same declaration | the write fits one Aggregate, and you want one statement of the rules |
| **Bind** a Command you wrote (`DomainRemote.command`) | your `decide` | yes if the page's mutation is a `Mutation.write`: a second statement of the rules, which `Law.check` compares with the first | the model exists, or its `decide` does more than a declared write says |
| **Import** a Command (`Imported.mutation`) | your `decide` | no: the mutation carries no write, only a footprint of the fields it touches | the page only needs to send it |

The rest of this guide lowers one write, because that is where the declared
domain and the Domain model meet most closely.

## The shortest whole path

The domain, declared as it would be for any server. Nothing here knows about
Events.

```ts
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
    status: Schema.Literals(['draft', 'published']),
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

const Product = ProductFields.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
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
    {
      id: 'id',
      expect: 'revision',
      when: () => Expr.eq(Product.fields.status, 'published'),
      increment: { reserved: 'quantity' },
    },
  ),
)
```

The Domain model. `Lower.write` derives the Command, its Rejections, `decide`,
`evolve`, the reply and the View's fold from `ReserveStock`. You write what it
cannot know: the Events, who asks, and how a row comes to exist.

```ts
import * as Domain from '@alchemy.run/domain'
import { Effect, Layer, Option } from 'effect'
import { RpcMiddleware } from 'effect/rpc'
import { Lower } from 'foldkit-remote-domain/lower'

class ProductListed extends Domain.Event('ProductListed', { row: Product.schema }) {}

class StockReserved extends Domain.Event('StockReserved', {
  quantity: Schema.Int,
  reservedAfter: Schema.Number,
  revisionAfter: Schema.Number,
}) {}

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

class ListProduct extends Domain.Command('ListProduct', {
  target: Schema.String,
  input: { row: Product.schema },
  events: [ProductListed],
}) {}

class ProductAggregate extends Domain.Aggregate('Product', {
  id: Schema.String,
  state: Reserved.state,
  initial: Reserved.initial,
  commands: [ListProduct, Reserved.command],
  decide: {
    ListProduct: (_, command) => [new ProductListed({ row: command.row })],
    ReserveStock: Reserved.decide,
  },
  evolve: Reserved.evolve,
  reply: { ReserveStock: Reserved.reply },
}) {}

class NotOwner extends Domain.Rejection('NotOwner') {}

class ProductRow extends Domain.View('ProductRow', {
  from: [ProductAggregate],
  key: ProductAggregate,
  middleware: [Session],
  rejects: [NotOwner],
  state: Reserved.view.state,
  initial: { id: '', ownerId: '', status: 'draft', stock: 0, reserved: 0, revision: 0 },
  evolve: Reserved.view.evolve,
}) {}

const ProductRowLive = ProductRow.toLayer(
  Effect.succeed(
    Effect.fn(function* (_request, row) {
      const user = yield* CurrentUser
      if (row !== null && !Option.exists(user, ({ id }) => id === row.ownerId))
        return yield* new NotOwner()
    }),
  ),
)

class ShopModel extends Domain.Model('Shop', {
  aggregates: [ProductAggregate],
  views: [ProductRow],
}) {}

class ShopApi extends Domain.Api('ShopApi', {
  model: ShopModel,
  commands: ['ListProduct', 'ReserveStock'],
  views: ['ProductRow'],
}) {}
```

The page. It is the page it would be over a SQL server, with the adapter as
its `RemoteClient`.

```ts
import { Optic } from 'effect'
import { Remote } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'
import { ModelRef } from 'foldkit-surface'

const PageModel = Schema.Struct({ remote: Remote.Model })

const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof PageModel.Type>().key('remote'), [
    'remote',
  ]),
  entities: [Product],
  mutations: [ReserveStock],
})

const client = DomainRemote.layer(ShopApi, {
  views: [Reserved.reads(ShopApi, 'ProductRow')],
  commands: [Reserved.binding(ShopApi)],
  principal: Effect.succeed(Option.some('ada')),
  denied: () => 'Unauthenticated',
})
```

### What each call does

- Everything in the first block **declares**. It is the block
  [One domain declaration](entity.md) teaches, and a SQL writer reads the
  same values.
- `Lower.write` **derives**, once, where the module loads. It throws there if
  the write does not fit one Aggregate (below). It does no I/O.
- `Reserved.decide` is the write **landed in memory over the Aggregate's one
  row**, through the chain a server runs (`RemoteServer.write` over
  `GuardServer.writer` over `RemoteServer.memoryWriter`). The guard's Update
  rule, the `expect`, the `when` and the invariant are judged there. Each
  refusal leaves as the Rejection of the same tag (`Conflict`, `Unmet`,
  `Invalid`, `Forbidden`, `Unauthenticated`), and the binding turns it back
  into the mutation's `Refusal` for the page.
- `record` and `apply` are yours because an Event is a stored contract.
  `record` says which outcome the Event carries; `apply` copies it onto a row
  and decides nothing.
- `ProductRowLive` is the View's `validate`: **who may read is the View's to
  say**. The guard's Read rule is not lowered, so "only the owner" is stated
  here a second time, in Domain's terms.
- `DomainRemote.layer` is the only call that performs I/O, and only once the
  Api's own client is provided (`ShopApi.layerClientInProcess`, or
  `ShopApi.layerClientHttp(url)` from a browser).

## What the page can and cannot predict

The page predicts from the declaration, with no round trip:

- the fields the write sets (`reserved` goes from 2 to 5 as the write starts);
- whether it would be refused, when asked (`Data.can`): the guard, the `when`,
  the invariants.

It waits for the answer for:

- the revision, which the server moves;
- anything a hand-written `decide` does that no declared write states;
- everything an imported Command does: Remote treats its footprint as the
  fields that may have changed, and predicts nothing;
- `Reused`, `NotFound`, and whatever Domain's own Policies or Sagas record
  afterwards.

A prediction never stops a write from being sent. In the example's trace, a
reservation the invariant forbids is sent, decided and refused by the
Aggregate; the page shows the refusal the declaration names.

## One reservation, all the way round

`pnpm --filter foldkit-example-writes-domain loop` runs this model in memory
and prints who held what
([`test/loop.test.ts`](../examples/writes-domain/test/loop.test.ts) pins it):

```text
2. ada reserves 3: the page predicts before anything is sent
  page     shows {"reserved":5,"revision":1}; the write is pending
3. the adapter sends the command; the aggregate decides and records an Event
  domain   {"_tag":"StockReserved","quantity":3,"reservedAfter":5,"revisionAfter":2}
  page     shows {"reserved":5,"revision":2}; the write is applied
  remote   holds the row to the receipt "Product/p1@2"
4. a read while the View is behind keeps the row, and names it behind
  adapter  answers behind ["Product:p1"]
  page     shows {"reserved":5,"revision":2}
5. the View catches up: a read at the receipt answers, and the hold ends
  page     shows {"reserved":5,"revision":2}
  remote   holds 0 rows to a receipt
```

## When it goes wrong

Each row is held by a test; the paths are under
[`packages/remote-domain/test`](../packages/remote-domain/test) and
[`examples/writes-domain/test`](../examples/writes-domain/test).

| What happens | What the page shows | Held by |
| --- | --- | --- |
| The Aggregate rejects the Command | the prediction is taken back; `Data.refusal` gives the mutation's `Refusal` (`Conflict`, `Unmet`, `Invalid` with the invariant's id, message and path); the stream gains no Event | `loop.test.ts` steps 6 and 7; `adapter.test.ts`, "decodes a typed Rejection" |
| The write was made at a revision the row has left | `Conflict`, as above. It is decided by the `expect` inside `decide`, not by the stream's version | `loop.test.ts` step 7; `scenario.test.ts` |
| The Command committed and its View is behind | the write is applied, with the reply's fields as the row. Remote holds the row to the receipt, a read at it names the row `behind`, and the page keeps what it has until the View answers | `adapter.test.ts`, "a write whose View is behind"; `loop.test.ts` steps 3 to 5 |
| A View frame older than the row arrives late | nothing changes: Remote drops a row of a lower revision | `ordering.test.ts`, "an observation older than one already shown" |
| The reply is lost after the commit | the write fails `Unreachable` and the prediction is taken back, though the Event exists. The retry is the same operation and so the same `commandId`; Domain answers it from its record and does not decide again | `ordering.test.ts`, "a lost reply"; `http.test.ts` |
| The same operation is sent again with other input | the adapter gives it another `commandId`, so Domain decides it. A lowered Aggregate remembers its last 256 operations and rejects this one `Reused`, which the page sees as a failed write with a message; a visitor, or someone the guard refuses, hears the guard instead | `lower/ledger.test.ts` |
| The middleware refuses who asks | `RemoteUnauthenticated` or `RemoteForbidden`, as the layer's `denied` says | `adapter.test.ts`, "answers a middleware refusal" |
| A reader may not see the row | it reads as absent, as a guarded SQL read of a hidden row does | `adapter.test.ts`, "reads a row validate hides as absent" |
| The page reloads while a row is held to a receipt | the hold is in `Remote.Model`: a reload that restores the store restores it, and one that restores nothing holds nothing | the README's "Failure and recovery" |

Two guarantees are narrower than they may look:

- **Idempotency is Domain's, keyed by `commandId`.** The adapter also keeps the
  replies of the last 1,024 Commands that answered, only to spare a retry its
  call. Domain itself answers a resent `commandId` with the first receipt
  whatever input or caller it comes with; the adapter derives the id from the
  caller, the operation and the input so that it never resends one for a
  different request.
- **A View behind is waited for, not forced.** The adapter waits
  `confirmWithin` (2 seconds unless you set it) for a read at a receipt, then
  says `behind`; Remote asks again after 1 second, doubling to at most 30.

## Where lowering stops

One Aggregate is one consistency boundary, so a lowered write may read and set
only the row its Aggregate holds. `Lower.check(write)` returns what keeps a
write out, as data, and `Lower.write` throws listing it:

```ts
const findings = Lower.check(ReserveStock.write) // [] here
```

- `OutsideBoundary`: a `when`, a guard rule, an invariant or a context value
  that reads another row, named with the relations it follows.
- `NotPersisted`: a member the write reads or sets that is not a stored field
  of its Entity.

A rule across two Aggregates is Domain's to model, as a Policy or a Saga;
nothing here derives one. `Lower.write` takes an update only (not a create or
a delete), names its row by `id`, and keeps no write ledger.

## Testing it

| What you want to know | Use | In the example |
| --- | --- | --- |
| The Aggregate records and rejects what it should | Domain's `Story` (`given`, `when`, `then`, `rejected`, `view`) and `Domain.verify` | `test/lower/story.test.ts` |
| The declarations agree with each other | `Laws.check`, which reads only declarations | [Laws](laws.md) |
| Two authorities decide a write alike | `Scenario` from `foldkit-remote/testing`, run on each | `test/scenario/scenario.test.ts`, `test/lower/parity.test.ts` |
| The page behaves against the real model | `Fixture.make` from `foldkit-remote-domain/testing`: the model in memory, View deliveries held until you `drain` | `src/scenario/world.ts` |
| The page's prediction matches what Domain answers | `Law.check` through the adapter | `packages/remote-domain/test/adapter/adapter.test.ts`, "the law over the write" |

## Limits

- **A beta, pinned.** The adapter relies on behaviour of
  `@alchemy.run/domain@2.0.0-beta.86` that its own
  `test/domain/behaviour.test.ts` records, and breaks when a release changes it.
- **Tested in memory and over local HTTP.** Nothing here is deployed; Domain's
  Durable Object hosts and WebSocket protocol are not exercised.
- **Not exercised: evolving an Event's schema, and models with Policies or
  Sagas.** The adapter reads Views and sends Commands and has no part in
  either, but no test here runs one.
- **Lists are a paged Domain Query's, read forward; relations are `one`
  relations held as ids.** The README's "Lists and one relations" has the
  detail.
- **It is not a second layer over a Remote server.** A page reaches one
  authority or the other. And it does not use `@alchemy.run/domain/Foldkit`,
  which folds Domain state into Model fields of the application's own: beside
  `Remote.Model` that would be two owners of one row.

## Where to go next

- [`foldkit-remote-domain`'s README](../packages/remote-domain/README.md):
  every binding, lists, `one` relations, first paint from a server render, the
  command id, and each failure in detail.
- [`examples/writes-domain`](../examples/writes-domain): the model above with
  SQLite and memory beside it, deciding one write alike.
- [One domain declaration](entity.md) and [Declared writes](declared-writes.md):
  the declarations this guide lowers.
- [Alchemy Domain's own documentation](https://alchemy.run/domain) for
  Aggregates, Views, Policies, Sagas and hosting.
