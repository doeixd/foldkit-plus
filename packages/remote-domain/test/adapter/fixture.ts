/**
 * The adapter's model: WP1's probe model (`test/domain/fixture.ts`) with what
 * the adapter needs that the probe did not: a revision every event moves, a
 * `ReserveStock` that expects one, a View that carries every field of the
 * Entity and lets only the owner read, and the Plus declarations the page
 * keeps (the `Product` Entity, its guards, the `ReserveStock` write).
 */
import * as Domain from '@alchemy.run/domain'
import * as InMemory from '@alchemy.run/domain/InMemory'
import { Effect, Layer, Option, Schema } from 'effect'
import { RpcMiddleware } from 'effect/rpc'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Mutation } from 'foldkit-remote'

// ---------------------------------------------------------------- the Domain model

export class Seeded extends Domain.Event('Seeded', {
  ownerId: Schema.String,
  stock: Schema.Int,
}) {}
export class StockReserved extends Domain.Event('StockReserved', {
  reservedAfter: Schema.Int,
  revision: Schema.Int,
}) {}
export class Touched extends Domain.Event('Touched', {
  note: Schema.String,
  revision: Schema.Int,
}) {}
export class Transferred extends Domain.Event('Transferred', {
  ownerId: Schema.String,
  revision: Schema.Int,
}) {}
export class ReservedChanged extends Domain.Event('ReservedChanged', {
  reserved: Schema.Int,
}) {}

export class Invalid extends Domain.Rejection('Invalid', { rule: Schema.String }) {}
export class NotOwner extends Domain.Rejection('NotOwner') {}
export class Moved extends Domain.Rejection('Moved', { revision: Schema.Int }) {}
export class Missing extends Domain.Rejection('Missing') {}

export class CurrentActor extends Domain.RequestContext<CurrentActor>()(
  'Adapter/CurrentActor',
  Schema.Struct({ id: Schema.String }),
) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {}) {}
export class Session extends RpcMiddleware.Service<Session, { provides: CurrentActor }>()(
  'Adapter/Session',
  { error: Unauthorized },
) {}

/** Who the caller is, from the `x-actor` header the call carries. */
export const SessionLive = Layer.succeed(Session, (effect, { headers }) => {
  const id = headers['x-actor']
  return id === undefined
    ? Effect.fail(new Unauthorized())
    : Effect.provideService(effect, CurrentActor, { id })
})

export class Seed extends Domain.Command('Seed', {
  target: Schema.String,
  input: { ownerId: Schema.String, stock: Schema.Int },
  events: [Seeded],
}) {}

export class ReserveStock extends Domain.Command('ReserveStock', {
  target: Schema.String,
  middleware: [Session],
  input: { quantity: Schema.Int, revision: Schema.Int },
  events: [StockReserved],
  rejects: [Invalid, NotOwner, Moved, Missing],
  reply: { reserved: Schema.Int, revision: Schema.Int },
}) {}

/** Changes the note: a state change the View emits no output event for. */
export class Touch extends Domain.Command('Touch', {
  target: Schema.String,
  input: { note: Schema.String },
  events: [Touched],
}) {}

/** Gives the product to another owner, who alone reads it from then on. */
export class Transfer extends Domain.Command('Transfer', {
  target: Schema.String,
  input: { ownerId: Schema.String },
  events: [Transferred],
}) {}

export class Product extends Domain.Aggregate('Product', {
  id: Schema.String,
  state: Schema.Struct({
    ownerId: Schema.String,
    stock: Schema.Int,
    reserved: Schema.Int,
    note: Schema.String,
    revision: Schema.Int,
  }),
  initial: { ownerId: '', stock: 0, reserved: 0, note: '', revision: 0 },
  commands: [Seed, ReserveStock, Touch, Transfer],
  decide: {
    Seed: (_, command) => [new Seeded({ ownerId: command.ownerId, stock: command.stock })],
    ReserveStock: Effect.fn(function* (state, command) {
      if (state.revision === 0) return yield* new Missing()
      const actor = yield* CurrentActor
      if (state.ownerId !== actor.id) return yield* new NotOwner()
      if (state.revision !== command.revision) return yield* new Moved({ revision: state.revision })
      if (state.reserved + command.quantity > state.stock)
        return yield* new Invalid({ rule: 'reservedWithinStock' })
      return [
        new StockReserved({
          reservedAfter: state.reserved + command.quantity,
          revision: state.revision + 1,
        }),
      ]
    }),
    Touch: (state, command) => [new Touched({ note: command.note, revision: state.revision + 1 })],
    Transfer: (state, command) => [
      new Transferred({ ownerId: command.ownerId, revision: state.revision + 1 }),
    ],
  },
  evolve: {
    Seeded: (state, event) => ({
      ...state,
      ownerId: event.ownerId,
      stock: event.stock,
      revision: 1,
    }),
    StockReserved: (state, event) => ({
      ...state,
      reserved: event.reservedAfter,
      revision: event.revision,
    }),
    Touched: (state, event) => ({ ...state, note: event.note, revision: event.revision }),
    Transferred: (state, event) => ({ ...state, ownerId: event.ownerId, revision: event.revision }),
  },
  reply: { ReserveStock: state => ({ reserved: state.reserved, revision: state.revision }) },
}) {}

export class ProductRow extends Domain.View('ProductRow', {
  from: [Product],
  key: Product,
  middleware: [Session],
  rejects: [NotOwner],
  state: Schema.Struct({
    ownerId: Schema.String,
    stock: Schema.Int,
    reserved: Schema.Int,
    note: Schema.String,
    revision: Schema.Int,
  }),
  initial: { ownerId: '', stock: 0, reserved: 0, note: '', revision: 0 },
  events: [ReservedChanged],
  evolve: {
    Seeded: (row, event) => ({ ...row, ownerId: event.ownerId, stock: event.stock, revision: 1 }),
    StockReserved: (row, event) => ({
      ...row,
      reserved: event.reservedAfter,
      revision: event.revision,
    }),
    Touched: (row, event) => ({ ...row, note: event.note, revision: event.revision }),
    Transferred: (row, event) => ({ ...row, ownerId: event.ownerId, revision: event.revision }),
  },
  emit: {
    StockReserved: event => new ReservedChanged({ reserved: event.reservedAfter }),
  },
}) {}

/** Only the owner reads a row. */
export const ProductRowLive = ProductRow.toLayer(
  Effect.succeed(
    Effect.fn(function* (_request, row) {
      const actor = yield* CurrentActor
      if (row !== null && row.ownerId !== actor.id) return yield* new NotOwner()
    }),
  ),
)

export class Shop extends Domain.Model('Shop', {
  aggregates: [Product],
  views: [ProductRow],
}) {}

export class ShopApi extends Domain.Api('ShopApi', {
  model: Shop,
  commands: ['Seed', 'ReserveStock', 'Touch', 'Transfer'],
  views: ['ProductRow'],
}) {}

/**
 * The model hosted in memory, with every delivery to a View held until
 * `control.drain`, and the session middleware that trusts `x-actor`.
 */
export const host = () => {
  const { layer: platform, control } = InMemory.make({ manual: true })
  const layer = SessionLive.pipe(
    Layer.provideMerge(Shop.layer(ProductRowLive).pipe(Layer.provide(platform))),
  )
  return { layer, control }
}

// ---------------------------------------------------------------- what the page declares

export const User = Schema.Struct({ id: Schema.String })

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    reserved: Schema.Number,
    note: Schema.String,
    revision: Schema.Number,
  }),
)

const StaffFields = Entity.define(
  'StaffProduct',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    reserved: Schema.Number,
    note: Schema.String,
    revision: Schema.Number,
  }),
)

const NotedFields = Entity.define(
  'NotedProduct',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    reserved: Schema.Number,
    note: Schema.String,
    revision: Schema.Number,
  }),
)

export const ShopGuards = Guards.declare(
  'ShopGuards',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
    isStaff: guard.principal(),
    ownsStaffProduct: guard.row(StaffFields, user => Expr.eq(StaffFields.fields.ownerId, user.id)),
    ownsNoted: guard.row(NotedFields, user => Expr.eq(NotedFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

/** The owner reads a product and changes it. */
export const ProductEntity = ProductFields.pipe(
  Guards.attach(ShopGuards, { row: { Read: [ShopGuards.isOwner], Update: [ShopGuards.isOwner] } }),
)

/** A product its staff may change but only its owner may read: a reply would show staff a row they cannot read. */
export const StaffProduct = StaffFields.pipe(
  Guards.attach(ShopGuards, {
    row: { Read: [ShopGuards.ownsStaffProduct], Update: [ShopGuards.isStaff] },
  }),
)

/** A product whose note only staff read, though its owner reads and changes the rest. */
export const NotedProduct = NotedFields.pipe(
  Guards.attach(ShopGuards, {
    row: { Read: [ShopGuards.ownsNoted], Update: [ShopGuards.ownsNoted] },
    members: { note: { Read: [ShopGuards.isStaff] } },
  }),
)

/** Reserves stock at the revision read: a write the page predicts and Domain decides. */
export const Reserve = Mutation.write(
  'ReserveStock',
  Write.update(
    Entity.input(
      ProductEntity,
      Schema.Struct({ id: Schema.String, quantity: Schema.Int, revision: Schema.Number }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { reserved: 'quantity' } },
  ),
)

/** A write declared as another mutation, for the tests that need a second one. */
export const Note = Mutation.make('Note', {
  Input: { id: Schema.String, note: Schema.String },
  Output: {},
})

export const invalidOf = (rejection: Invalid) => ({
  _tag: 'Invalid' as const,
  entity: Option.some('Product'),
  rule: Option.some(rejection.rule),
  message: 'Reserved stock cannot exceed the stock',
  path: ['reserved'],
})
