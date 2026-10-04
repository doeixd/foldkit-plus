/**
 * The domain, declared once: a Product, how each member shows, and the row the
 * registry lists. Neither Remote nor Drizzle appears here; the client and the
 * server each interpret it.
 */
import { Schema } from 'effect'
import { Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'

export const ProductId = Schema.String.pipe(Schema.brand('ProductId'))
export type ProductId = typeof ProductId.Type

export const Status = Schema.Literals(['Active', 'Discontinued', 'Pending'])

/** A price in whole cents, so a sum or a comparison never meets a rounding error. */
const Cents = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: ProductId,
    upc: Schema.String.annotate({ title: 'UPC' }),
    description: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Description' }),
    line: Schema.String.annotate({ title: 'Line' }),
    status: Status.annotate({ title: 'Status' }),
    cents: Cents.annotate({ title: 'Price' }),
  }),
).pipe(
  Entity.annotateMembers({
    id: Display.of(Display.hidden()),
    cents: Display.of(Display.number(cents => (cents / 100).toFixed(2))),
  }),
)

export const Registry = { Product }

/** A row of the registry: every member, as the grid shows it. */
export const ProductRow = Entity.select(Product, {
  id: true,
  upc: true,
  description: true,
  line: true,
  status: true,
  cents: true,
})

/**
 * One product's edited fields: what a cell edit or a paste asks the server to
 * write. Each is the member's own schema, so the server refuses an empty
 * description or a negative price whatever the client checked.
 */
export const ProductChange = Schema.Struct({
  id: ProductId,
  description: Schema.OptionFromNullOr(Product.fields.description.schema),
  cents: Schema.OptionFromNullOr(Product.fields.cents.schema),
})
export type ProductChange = typeof ProductChange.Type
