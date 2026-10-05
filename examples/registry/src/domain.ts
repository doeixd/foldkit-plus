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
    /**
     * The journal sequence of the last edit the table applied to this product,
     * 0 for the seed: how far the table has read the journal, for this row.
     */
    revision: Schema.Int.annotate({ title: 'Revision' }),
  }),
).pipe(
  Entity.annotateMembers({
    id: Display.of(Display.hidden()),
    revision: Display.of(Display.hidden()),
    cents: Display.of(Display.number(cents => (cents / 100).toFixed(2))),
  }),
)

export const Registry = { Product }

/** A row of the registry: every member, in the grid's order, the editable two first. */
export const ProductRow = Entity.select(Product, {
  id: true,
  upc: true,
  description: true,
  cents: true,
  line: true,
  status: true,
  revision: true,
})

/** The columns an edit can change. */
export const EditedColumn = Schema.Literals(['description', 'cents', 'line', 'status'])
export type EditedColumn = typeof EditedColumn.Type

/**
 * One product's edited fields: what a cell edit or a paste asks the server to
 * write. Each is the member's own schema, so the server refuses an empty
 * description or a negative price whatever the client checked.
 */
export const ProductChange = Schema.Struct({
  id: ProductId,
  description: Schema.OptionFromNullOr(Product.fields.description.schema),
  cents: Schema.OptionFromNullOr(Product.fields.cents.schema),
  line: Schema.OptionFromNullOr(Product.fields.line.schema),
  status: Schema.OptionFromNullOr(Product.fields.status.schema),
})
export type ProductChange = typeof ProductChange.Type
