/**
 * What the client may ask of the server: the products, in an order the list
 * names, and a batch of edits. An edit to one cell and a paste over many are
 * the same mutation, so the server writes either as one change.
 */
import { Schema } from 'effect'
import { Sort } from 'foldkit-crud'
import { Mutation, Query } from 'foldkit-remote'
import { ProductChange, Registry } from './domain.js'

/** The orders the registry offers, by name; the server says what each one means. */
export const ProductSort = Sort.make(['description', 'cents'])

export const ProductsQuery = Query.make('Products', {
  Input: { sort: ProductSort.Schema },
  Result: Query.connection(Registry.Product),
})

export const EditProductsMutation = Mutation.make('EditProducts', {
  Input: { changes: Schema.Array(ProductChange) },
  Output: { written: Schema.Number },
})
