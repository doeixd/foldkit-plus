/**
 * The domain, declared once: a Product, how each member shows, and the row the
 * registry lists. Neither Remote nor Drizzle appears here; the client and the
 * server each interpret it.
 */
import { Schema } from 'effect'
import { Display } from 'foldkit-crud'
import { Collation, Entity } from 'foldkit-entity'
import { EditableEntity } from 'foldkit-sync/entity'

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
    // How the table orders text already (SQLite's BINARY), said, so a client
    // can order a sorted page as the server does.
    upc: Collation.of(Collation.binary),
    description: Collation.of(Collation.binary),
    line: Collation.of(Collation.binary),
    status: Collation.of(Collation.binary),
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

/** The members an edit can change, in the grid's order. */
export const editedColumns = ['description', 'cents', 'line', 'status'] as const
export const EditedColumn = Schema.Literals(editedColumns)
export type EditedColumn = typeof EditedColumn.Type

/**
 * Edits to products, one per cell: a change is one member's new value, by
 * that member's own schema, so the server refuses an empty description or a
 * negative price whatever the client checked. The client keeps them and lays
 * them over its rows; the server applies them to the table.
 */
export const ProductEdits = EditableEntity.make(Product, { members: editedColumns })
export type ProductChange = typeof ProductEdits.Change.Type
export type ProductEdit = typeof ProductEdits.Edit.Type
