/**
 * The Domain authority: `ReserveStock` lowered into a `Product` aggregate.
 * Only the events, who asks and how a row comes to exist are written here;
 * the command, its Rejections, `decide`, the View's `evolve` and the adapter's
 * bindings are derived from the declaration in `domain.ts`.
 */
import * as Domain from '@alchemy.run/domain'
import * as InMemory from '@alchemy.run/domain/InMemory'
import { Effect, Layer, Option, Schema } from 'effect'
import { RpcMiddleware } from 'effect/rpc'
import { Product as ProductEntity, User } from 'foldkit-example-writes/domain'
import { Policy } from 'foldkit-example-writes/server'
import type { CommandBinding, ViewBinding } from 'foldkit-remote-domain'
import { Lower } from 'foldkit-remote-domain/lower'
import { ReserveStock } from './domain.js'

/** A product put on sale: the event that makes a row exist, carrying all of it. */
export class ProductListed extends Domain.Event('ProductListed', { row: ProductEntity.schema }) {}

/** A reservation that landed: the outcome it reached, which the aggregate and its View copy. */
export class StockReserved extends Domain.Event('StockReserved', {
  quantity: Schema.Int,
  reservedAfter: Schema.Number,
  revisionAfter: Schema.Number,
}) {}

/** Who asks, as the session middleware provides it: none for a visitor. */
export class CurrentUser extends Domain.RequestContext<CurrentUser>()(
  'WritesDomain/CurrentUser',
  Schema.OptionFromNullOr(User),
) {}

/** Who the caller is, from the `x-user` header the call carries. */
export class Session extends RpcMiddleware.Service<Session, { provides: CurrentUser }>()(
  'WritesDomain/Session',
) {}

export const SessionLive = Layer.succeed(Session, (effect, { headers }) =>
  Effect.provideService(
    effect,
    CurrentUser,
    Option.map(Option.fromUndefinedOr(headers['x-user']), id => ({ id })),
  ),
)

export const Reserved = Lower.write(ReserveStock, {
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

/** Lists a product: the command a row comes from. It decides nothing of `ReserveStock`'s. */
export class ListProduct extends Domain.Command('ListProduct', {
  target: Schema.String,
  input: { row: ProductEntity.schema },
  events: [ProductListed],
}) {}

export class Product extends Domain.Aggregate('Product', {
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

/** A row asked for by someone other than its owner: it reads as absent to them. */
export class NotOwner extends Domain.Rejection('NotOwner') {}

/** A product by id, as its owner reads it. */
export class ProductRow extends Domain.View('ProductRow', {
  from: [Product],
  key: Product,
  middleware: [Session],
  rejects: [NotOwner],
  state: Reserved.view.state,
  initial: {
    id: '',
    ownerId: '',
    name: '',
    status: 'draft',
    stock: 0,
    reserved: 0,
    revision: 0,
  },
  evolve: Reserved.view.evolve,
}) {}

/** Only the owner reads a row, as `examples/writes`' Read rule says. */
export const ProductRowLive = ProductRow.toLayer(
  Effect.succeed(
    Effect.fn(function* (_request, row) {
      const user = yield* CurrentUser
      if (row !== null && !Option.exists(user, ({ id }) => id === row.ownerId))
        return yield* new NotOwner()
    }),
  ),
)

export class Shop extends Domain.Model('Shop', {
  aggregates: [Product],
  views: [ProductRow],
}) {}

export class ShopApi extends Domain.Api('ShopApi', {
  model: Shop,
  commands: ['ListProduct', 'ReserveStock'],
  views: ['ProductRow'],
}) {}

/** The adapter's bindings of the command and the View, derived. */
export const ReserveBinding: CommandBinding<typeof ReserveStock, typeof ShopApi> =
  Reserved.binding(ShopApi)
export const ProductReads: ViewBinding<typeof ProductEntity, typeof ShopApi> = Reserved.reads(
  ShopApi,
  'ProductRow',
)

/** The model hosted in memory, deliveries to the View held until `control.drain`. */
export const host = () => {
  const { layer: platform, control } = InMemory.make({ manual: true })
  const layer = SessionLive.pipe(
    Layer.provideMerge(Shop.layer(ProductRowLive).pipe(Layer.provide(platform))),
  )
  return { layer, control }
}
