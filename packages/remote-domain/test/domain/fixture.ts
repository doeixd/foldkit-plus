/**
 * The model the behaviour tests probe: a `Product` aggregate (`Seed`,
 * `ReserveStock` behind a session middleware, `Touch`) and a by-id `ProductRow`
 * View that emits an output event for `StockReserved` only, so `Touch` changes
 * the View's state with no output event. Hosted in memory with delivery held
 * until `control.drain`, and called through the Api's in-process client.
 */
import * as Domain from '@alchemy.run/domain'
import * as InMemory from '@alchemy.run/domain/InMemory'
import { Effect, Layer, Schema } from 'effect'
import { RpcMiddleware } from 'effect/rpc'

export class Seeded extends Domain.Event('Seeded', {
  ownerId: Schema.String,
  stock: Schema.Int,
}) {}
export class StockReserved extends Domain.Event('StockReserved', {
  quantity: Schema.Int,
  reservedAfter: Schema.Int,
}) {}
export class Touched extends Domain.Event('Touched', { note: Schema.String }) {}
export class ReservedChanged extends Domain.Event('ReservedChanged', {
  reserved: Schema.Int,
}) {}

export class Invalid extends Domain.Rejection('Invalid', { rule: Schema.String }) {}
export class NotOwner extends Domain.Rejection('NotOwner') {}

export class CurrentActor extends Domain.RequestContext<CurrentActor>()(
  'Probe/CurrentActor',
  Schema.Struct({ id: Schema.String }),
) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {}) {}
export class Session extends RpcMiddleware.Service<Session, { provides: CurrentActor }>()(
  'Probe/Session',
  { error: Unauthorized },
) {}

/** Who the caller is, from the `x-actor` header the call carries. */
export const SessionLive = Layer.succeed(Session, (effect, { headers }) => {
  const id = headers['x-actor']
  return id === undefined
    ? Effect.fail(new Unauthorized())
    : Effect.provideService(effect, CurrentActor, { id })
})

export const ProductId = Schema.String

export class Seed extends Domain.Command('Seed', {
  target: ProductId,
  input: { ownerId: Schema.String, stock: Schema.Int },
  events: [Seeded],
}) {}

export class ReserveStock extends Domain.Command('ReserveStock', {
  target: ProductId,
  middleware: [Session],
  input: { quantity: Schema.Int },
  events: [StockReserved],
  rejects: [Invalid, NotOwner],
  reply: { reserved: Schema.Int },
}) {}

export class Touch extends Domain.Command('Touch', {
  target: ProductId,
  input: { note: Schema.String },
  events: [Touched],
}) {}

/** How many times `ReserveStock`'s `decide` has run, for the tests that say a resend did not. */
export const decided = { count: 0 }

export class Product extends Domain.Aggregate('Product', {
  id: ProductId,
  state: Schema.Struct({
    ownerId: Schema.String,
    stock: Schema.Int,
    reserved: Schema.Int,
    note: Schema.String,
  }),
  initial: { ownerId: '', stock: 0, reserved: 0, note: '' },
  commands: [Seed, ReserveStock, Touch],
  decide: {
    Seed: (_, command) => [new Seeded({ ownerId: command.ownerId, stock: command.stock })],
    ReserveStock: Effect.fn(function* (state, command) {
      decided.count += 1
      const actor = yield* CurrentActor
      if (state.ownerId !== actor.id) return yield* new NotOwner()
      if (state.reserved + command.quantity > state.stock)
        return yield* new Invalid({ rule: 'reservedWithinStock' })
      return [
        new StockReserved({
          quantity: command.quantity,
          reservedAfter: state.reserved + command.quantity,
        }),
      ]
    }),
    Touch: (_, command) => [new Touched({ note: command.note })],
  },
  evolve: {
    Seeded: (state, event) => ({ ...state, ownerId: event.ownerId, stock: event.stock }),
    StockReserved: (state, event) => ({ ...state, reserved: event.reservedAfter }),
    Touched: (state, event) => ({ ...state, note: event.note }),
  },
  reply: { ReserveStock: state => ({ reserved: state.reserved }) },
}) {}

export class ProductRow extends Domain.View('ProductRow', {
  from: [Product],
  key: Product,
  state: Schema.Struct({ stock: Schema.Int, reserved: Schema.Int, note: Schema.String }),
  initial: { stock: 0, reserved: 0, note: '' },
  events: [ReservedChanged],
  evolve: {
    Seeded: (row, event) => ({ ...row, stock: event.stock }),
    StockReserved: (row, event) => ({ ...row, reserved: event.reservedAfter }),
    Touched: (row, event) => ({ ...row, note: event.note }),
  },
  emit: {
    StockReserved: event => new ReservedChanged({ reserved: event.reservedAfter }),
  },
}) {}

export class Shop extends Domain.Model('Shop', {
  aggregates: [Product],
  views: [ProductRow],
}) {}

export class ProductApi extends Domain.Api('ProductApi', {
  model: Shop,
  commands: ['Seed', 'ReserveStock', 'Touch'],
  views: ['ProductRow'],
}) {}

/**
 * The model hosted in memory, with every delivery to a View held until
 * `control.drain`, and the session middleware that trusts `x-actor`.
 */
export const host = () => {
  const { layer: platform, control } = InMemory.make({ manual: true })
  const layer = SessionLive.pipe(
    Layer.provideMerge(Shop.layer(Layer.empty).pipe(Layer.provide(platform))),
  )
  return { layer, control }
}

/** One caller's headers for a call. */
export const as = (actor: string) => ({ 'x-actor': actor })
