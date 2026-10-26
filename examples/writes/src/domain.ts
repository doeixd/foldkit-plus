/**
 * What client and server share: one Entity, who may change it, what every row
 * of it holds, what every change of it holds, and five declared writes. Nothing here runs a query or touches a table.
 */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Mutation } from 'foldkit-remote'

export const User = Schema.Struct({ id: Schema.String })
export type User = typeof User.Type

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)

export const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

/** What every product holds, whoever writes it: no more reserved than is in stock. */
export const reservedWithinStock = Entity.invariant<typeof ProductFields>(
  'reservedWithinStock',
  ({ after }) => Expr.lte(after.reserved, after.stock),
  { message: 'Reserved stock cannot exceed the stock', path: ['reserved'] },
)

/** A draft and a published product are both valid; going from one back to the other is not. */
export const publishedStaysPublished = Entity.invariant<typeof ProductFields>(
  'publishedStaysPublished',
  ({ before, after }) =>
    Expr.or(
      Expr.not(Expr.eq(before.status, 'published')),
      Expr.not(Expr.eq(after.status, 'draft')),
    ),
  { message: 'A published product does not go back to draft', path: ['status'] },
)

/**
 * A product is its owner's to read and to change, and whoever changes it holds
 * its invariants: who may is a rule, what every row and change holds an invariant.
 */
export const Product = ProductFields.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
  reservedWithinStock,
  publishedStaysPublished,
)

/** A guarded rename: the rules decide who may, the writer's revision pin when it lands. */
export const Rename = Mutation.write(
  'Rename',
  Write.update(Entity.input(Product, Schema.Struct({ id: Schema.String, name: Schema.String })), {
    id: 'id',
  }),
)

/**
 * A transition that makes sense from one state only: a draft is published.
 * An archived product is not; a published one already is, so publishing it
 * again changes nothing and is answered as written, as a retry would be.
 */
export const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, status: Schema.Literal('published') }),
    ),
    { id: 'id', when: () => Expr.eq(Product.fields.status, 'draft') },
  ),
)

/** Sets a product back to draft, which its transition invariant allows only of one never published. */
export const Revert = Mutation.write(
  'Revert',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal('draft') })),
    { id: 'id' },
  ),
)

/**
 * A computed write: the stock moves by the quantity where it commits. It
 * expects the revision it was read at, so a retry of one that landed is a
 * conflict, never a second restock.
 */
export const Restock = Mutation.write(
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

/**
 * A sale takes from the stock where it commits, expecting no revision: two
 * sales made from one read both land. The server's writer for it keeps a
 * ledger, so a retry of a sale is never sold twice; it is answered with the row
 * as it now is.
 */
export const Sell = Mutation.write(
  'Sell',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
