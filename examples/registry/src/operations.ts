/**
 * What the client may read from the server: the products whose description
 * holds the search, in an order the list names. Edits do not go this way;
 * they are the Sync document's.
 */
import { Schema } from 'effect'
import { Sort } from 'foldkit-crud'
import { Expr } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { Registry } from './domain.js'

/** The orders the registry offers, by name; the server says what each one means. */
export const ProductSort = Sort.make(['upc', 'description', 'line', 'status', 'cents'])

/**
 * The body is the filter, compiled by the server's Drizzle binding into its
 * `where`: a search folds case, ASCII only, the same in SQLite and Postgres.
 * The order is the binding's, from `sort`.
 */
export const ProductsQuery = Query.define(
  'Products',
  { sort: ProductSort.Schema, search: Schema.String },
  ({ input }) =>
    Query.from(Registry.Product).pipe(
      Query.where(Expr.contains(Registry.Product.fields.description, input.search)),
    ),
)
