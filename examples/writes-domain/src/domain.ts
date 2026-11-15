/**
 * The write both authorities land: a reservation of stock on `examples/writes`'
 * `Product`, declared once. A SQLite server lands it through its writer
 * (`sqlite.ts`); a Domain aggregate decides it through the same chain over the
 * one row it holds (`model.ts`).
 */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Product } from 'foldkit-example-writes/domain'
import { Mutation } from 'foldkit-remote'

/**
 * Reserves stock of a published product at the revision it was read at. It is
 * refused as a conflict when the row moved on, unmet when the product is not
 * published, forbidden to anyone but the owner, and invalid when it would
 * reserve more than the stock.
 */
export const ReserveStock = Mutation.write(
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
