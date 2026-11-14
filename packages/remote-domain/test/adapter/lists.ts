/**
 * The lists and relations model: products that point at a supplier, a
 * projection that keeps every product's stock in a store of its own, and a
 * paged `Stocked` Query over that store that lists every product in stock,
 * whoever owns it. The `ProductRow` View lets only a product's owner read
 * it, and the `SupplierRow` View hides a supplier that is not listed, so a
 * test can tell what the Query lists from what a reader may see.
 */
import * as Domain from '@alchemy.run/domain'
import { Context, type Duration, Effect, Layer, Optic, Ref, Schema } from 'effect'
import { RpcMiddleware } from 'effect/rpc'
import { Entity, Expr, Order, Relation, Write } from 'foldkit-entity'
import { Mutation, Query, Remote } from 'foldkit-remote'
import { ModelRef } from 'foldkit-surface'
import { DomainRemote } from '../../src/index.js'
import { Fixture, type Given } from '../../src/testing.js'

// ---------------------------------------------------------------- the Domain model

export class Seeded extends Domain.Event('Seeded', {
  ownerId: Schema.String,
  stock: Schema.Int,
  supplier: Schema.NullOr(Schema.String),
}) {}
export class StockReserved extends Domain.Event('StockReserved', {
  reservedAfter: Schema.Int,
  revision: Schema.Int,
}) {}
export class Transferred extends Domain.Event('Transferred', {
  ownerId: Schema.String,
  revision: Schema.Int,
}) {}
export class SupplierAdded extends Domain.Event('SupplierAdded', {
  name: Schema.String,
  listed: Schema.Boolean,
}) {}

export class NotOwner extends Domain.Rejection('NotOwner') {}
export class Moved extends Domain.Rejection('Moved') {}
export class NotListed extends Domain.Rejection('NotListed') {}
export class NoShelf extends Domain.Rejection('NoShelf') {}

export class CurrentActor extends Domain.RequestContext<CurrentActor>()(
  'Lists/CurrentActor',
  Schema.Struct({ id: Schema.String }),
) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {}) {}
export class Session extends RpcMiddleware.Service<Session, { provides: CurrentActor }>()(
  'Lists/Session',
  { error: Unauthorized },
) {}

const SessionLive = Layer.succeed(Session, (effect, { headers }) => {
  const id = headers['x-actor']
  return id === undefined
    ? Effect.fail(new Unauthorized())
    : Effect.provideService(effect, CurrentActor, { id })
})

/** Puts a product on the shelf; the tests seed it with `given` rather than send it. */
export class Seed extends Domain.Command('Seed', {
  target: Schema.String,
  input: { ownerId: Schema.String, stock: Schema.Int, supplier: Schema.NullOr(Schema.String) },
  events: [Seeded],
}) {}

export class AddSupplier extends Domain.Command('AddSupplier', {
  target: Schema.String,
  input: { name: Schema.String, listed: Schema.Boolean },
  events: [SupplierAdded],
}) {}

export class ReserveStock extends Domain.Command('ReserveStock', {
  target: Schema.String,
  middleware: [Session],
  input: { quantity: Schema.Int, revision: Schema.Int },
  events: [StockReserved],
  rejects: [NotOwner, Moved],
  reply: { reserved: Schema.Int, revision: Schema.Int },
}) {}

export class Transfer extends Domain.Command('Transfer', {
  target: Schema.String,
  input: { ownerId: Schema.String },
  events: [Transferred],
}) {}

const ProductState = Schema.Struct({
  ownerId: Schema.String,
  stock: Schema.Int,
  reserved: Schema.Int,
  supplier: Schema.NullOr(Schema.String),
  revision: Schema.Int,
})
type ProductState = typeof ProductState.Type
const noProduct: ProductState = { ownerId: '', stock: 0, reserved: 0, supplier: null, revision: 0 }

const evolveProduct = {
  Seeded: (state: ProductState, event: Seeded): ProductState => ({
    ...state,
    ownerId: event.ownerId,
    stock: event.stock,
    supplier: event.supplier,
    revision: 1,
  }),
  StockReserved: (state: ProductState, event: StockReserved): ProductState => ({
    ...state,
    reserved: event.reservedAfter,
    revision: event.revision,
  }),
  Transferred: (state: ProductState, event: Transferred): ProductState => ({
    ...state,
    ownerId: event.ownerId,
    revision: event.revision,
  }),
}

const SupplierState = Schema.Struct({
  name: Schema.String,
  listed: Schema.Boolean,
  revision: Schema.Int,
})
type SupplierState = typeof SupplierState.Type
const evolveSupplier = {
  SupplierAdded: (state: SupplierState, event: SupplierAdded): SupplierState => ({
    ...state,
    name: event.name,
    listed: event.listed,
    revision: 1,
  }),
}

export class Product extends Domain.Aggregate('Product', {
  id: Schema.String,
  state: ProductState,
  initial: noProduct,
  commands: [Seed, ReserveStock, Transfer],
  decide: {
    Seed: (_, { ownerId, stock, supplier }) => [new Seeded({ ownerId, stock, supplier })],
    ReserveStock: Effect.fn(function* (state, command) {
      const actor = yield* CurrentActor
      if (state.ownerId !== actor.id) return yield* new NotOwner()
      if (state.revision !== command.revision) return yield* new Moved()
      return [
        new StockReserved({
          reservedAfter: state.reserved + command.quantity,
          revision: state.revision + 1,
        }),
      ]
    }),
    Transfer: (state, command) => [
      new Transferred({ ownerId: command.ownerId, revision: state.revision + 1 }),
    ],
  },
  evolve: evolveProduct,
  reply: { ReserveStock: state => ({ reserved: state.reserved, revision: state.revision }) },
}) {}

export class Supplier extends Domain.Aggregate('Supplier', {
  id: Schema.String,
  state: SupplierState,
  initial: { name: '', listed: false, revision: 0 },
  commands: [AddSupplier],
  decide: {
    AddSupplier: (_, { name, listed }) => [new SupplierAdded({ name, listed })],
  },
  evolve: evolveSupplier,
}) {}

export class ProductRow extends Domain.View('ProductRow', {
  from: [Product],
  key: Product,
  middleware: [Session],
  rejects: [NotOwner],
  state: ProductState,
  initial: noProduct,
  evolve: evolveProduct,
}) {}

export class SupplierRow extends Domain.View('SupplierRow', {
  from: [Supplier],
  key: Supplier,
  middleware: [Session],
  rejects: [NotListed],
  state: SupplierState,
  initial: { name: '', listed: false, revision: 0 },
  evolve: evolveSupplier,
}) {}

/** Every product's stock and what is reserved of it, as the projection keeps it. */
type Shelved = ReadonlyMap<string, { readonly stock: number; readonly reserved: number }>
class Shelf extends Context.Service<Shelf, Ref.Ref<Shelved>>()('Lists/Shelf') {}

export class Listing extends Domain.Projection('Listing', {
  from: [Product],
  key: Product,
  on: [Seeded, StockReserved],
}) {}

const ListingLive = Listing.toLayer(
  Effect.gen(function* () {
    const shelf = yield* Shelf
    return Effect.fn(function* (batch) {
      for (const { key, event } of batch)
        yield* Ref.update(shelf, held => {
          const next = new Map(held)
          const row = next.get(key.id) ?? { stock: 0, reserved: 0 }
          next.set(
            key.id,
            Schema.is(Seeded)(event)
              ? { ...row, stock: event.stock }
              : { ...row, reserved: event.reservedAfter },
          )
          return next
        })
    })
  }),
)

/** Every product with stock left, by id, whoever owns it: the View decides who sees each. */
export class InStock extends Domain.Query('InStock', {
  input: { shelf: Schema.String },
  success: Schema.Struct({ id: Schema.String }),
  paged: true,
  waitsFor: [Listing],
  middleware: [Session],
  rejects: [NoShelf],
}) {}

/** How often the shop listed what is in stock, and judged a product row for who asks: what a live list costs. */
export const calls = { listed: 0, judged: 0 }

const InStockLive = InStock.toLayer(
  Effect.gen(function* () {
    const shelf = yield* Shelf
    return Effect.fn(function* ({ shelf: name }, page) {
      calls.listed++
      if (name !== 'main') return yield* new NoShelf()
      const ids = [...(yield* Ref.get(shelf)).entries()]
        .filter(([, row]) => row.stock > row.reserved)
        .map(([id]) => id)
        .sort()
      const from = page.after === undefined ? 0 : ids.filter(id => id <= page.after!).length
      const entries = ids.slice(from, from + page.take).map(id => ({ id }))
      return { entries, cursor: from + page.take >= ids.length ? null : entries.at(-1)!.id }
    })
  }),
  { take: { default: 2, max: 50 } },
)

/** An unpaged Query, which no list can be read through. */
export class Count extends Domain.Query('Count', {
  success: Schema.Number,
  middleware: [Session],
}) {}

const CountLive = Count.toLayer(
  Effect.gen(function* () {
    const shelf = yield* Shelf
    return Effect.fn(function* () {
      return (yield* Ref.get(shelf)).size
    })
  }),
)

export class Shop extends Domain.Model('ListShop', {
  aggregates: [Product, Supplier],
  views: [ProductRow, SupplierRow],
  projections: [Listing],
  queries: [InStock, Count],
}) {}

export class ShopApi extends Domain.Api('ListShopApi', {
  model: Shop,
  commands: ['ReserveStock', 'Transfer'],
  views: ['ProductRow', 'SupplierRow'],
  queries: ['InStock', 'Count'],
}) {}

const owned = <Row extends { readonly ownerId: string }>(row: Row | null) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor
    if (row !== null && row.ownerId !== actor.id) return yield* new NotOwner()
  })

const handlers = Layer.mergeAll(
  ProductRow.toLayer(
    Effect.succeed(
      Effect.fn(function* (_request, row) {
        calls.judged++
        yield* owned(row)
      }),
    ),
  ),
  SupplierRow.toLayer(
    Effect.succeed(
      Effect.fn(function* (_request, row) {
        if (row !== null && !row.listed) return yield* new NotListed()
      }),
    ),
  ),
  ListingLive,
  InStockLive,
  CountLive,
).pipe(Layer.provide(Layer.effect(Shelf, Ref.make<Shelved>(new Map()))))

// ---------------------------------------------------------------- what the page declares

const SupplierFields = Entity.define(
  'Supplier',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    listed: Schema.Boolean,
    revision: Schema.Number,
  }),
)

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

export const Related = Entity.relate(
  { Product: ProductFields, Supplier: SupplierFields },
  {
    Product: { supplier: Relation.one(SupplierFields, { optional: true }) },
    Supplier: { products: Relation.many(ProductFields) },
  },
)

/** Products in stock on a shelf, by id: what the page holds and places a write in. */
export const Stocked = Query.define('Stocked', { shelf: Schema.String }, () =>
  Query.from(Related.Product).pipe(
    Query.where(Expr.gt(Related.Product.fields.stock, Expr.field(Related.Product.fields.reserved))),
    Query.orderBy(Order.asc(Related.Product.fields.id)),
  ),
)

export const Reserve = Mutation.write(
  'ReserveStock',
  Write.update(
    Entity.input(
      Related.Product,
      Schema.Struct({ id: Schema.String, quantity: Schema.Int, revision: Schema.Number }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { reserved: 'quantity' } },
  ),
)

export const Products = DomainRemote.view(Related.Product, ShopApi, 'ProductRow', {
  revision: 'revision',
})
export const Suppliers = DomainRemote.view(Related.Supplier, ShopApi, 'SupplierRow', {
  revision: 'revision',
})
export const Listed = DomainRemote.query(Stocked, ShopApi, 'InStock', {
  input: input => ({ shelf: input.shelf }),
  id: entry => entry.id,
})
export const Reserving = DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target: input => input.id,
  input: input => ({ quantity: input.quantity, revision: input.revision }),
  refusals: {
    NotOwner: () => DomainRemote.forbid(),
    Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
  },
  written: reply => reply,
})

export const PageModel = Schema.Struct({ remote: Remote.Model })
export type PageModel = typeof PageModel.Type

export const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<PageModel>().key('remote'), ['remote']),
  entities: [Related.Product, Related.Supplier],
  queries: [Stocked],
  mutations: [Reserve],
})

const product = (id: string, ownerId: string, stock: number, supplier: string | null): Given => ({
  aggregate: 'Product',
  id,
  events: [new Seeded({ ownerId, stock, supplier })],
})

/**
 * The shop seeded: ada owns p1, p2, p4 and p5, grace owns p3; p6 has no
 * stock. p1 and p2 come from the listed s1, p4 from the unlisted s2.
 */
export const shop = (
  options: { readonly as?: string; readonly confirmWithin?: Duration.Input } = {},
) =>
  Fixture.make(ShopApi, {
    model: Shop,
    handlers,
    middleware: SessionLive,
    as: options.as ?? 'ada',
    given: [
      product('p1', 'ada', 10, 's1'),
      product('p2', 'ada', 5, 's1'),
      product('p3', 'grace', 5, null),
      product('p4', 'ada', 5, 's2'),
      product('p5', 'ada', 5, null),
      product('p6', 'ada', 0, null),
      {
        aggregate: 'Supplier',
        id: 's1',
        events: [new SupplierAdded({ name: 'Acme', listed: true })],
      },
      {
        aggregate: 'Supplier',
        id: 's2',
        events: [new SupplierAdded({ name: 'Hush', listed: false })],
      },
    ],
    bindings: {
      views: [Products, Suppliers],
      commands: [Reserving],
      queries: [Listed],
      denied: () => 'Unauthenticated',
      confirmWithin: options.confirmWithin ?? '200 millis',
    },
  })
