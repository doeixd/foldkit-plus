/**
 * What the client may read from the server: the products whose description
 * holds the search, in the order the list's sort names. Edits do not go this
 * way; they are the Sync document's.
 */
import { Schema } from 'effect'
import { Sort } from 'foldkit-crud'
import { Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { Registry } from './domain.js'

/** The orders the registry offers, by name; the query's body says what each one means. */
export const ProductSort = Sort.make(['upc', 'description', 'line', 'status', 'cents'])

const { fields } = Registry.Product

/**
 * The body is the filter and the order, compiled by the server's Drizzle
 * binding: a search folds case, ASCII only, the same in SQLite and Postgres,
 * and `sort` picks the column, or none for the server's id order. The client
 * reads the same body, so it knows which edits can move a row.
 */
export const ProductsQuery = Query.define(
  'Products',
  { sort: ProductSort.Schema, search: Schema.String },
  ({ input }) =>
    Query.from(Registry.Product).pipe(
      Query.where(Expr.contains(fields.description, input.search)),
      Query.orderBy(
        Order.chosen(input.sort, {
          upc: fields.upc,
          description: fields.description,
          line: fields.line,
          status: fields.status,
          cents: fields.cents,
        }),
      ),
    ),
)
