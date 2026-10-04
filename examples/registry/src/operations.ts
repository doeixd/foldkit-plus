/**
 * What the client may read from the server: the products, in an order the
 * list names. Edits do not go this way; they are the Sync document's.
 */
import { Sort } from 'foldkit-crud'
import { Query } from 'foldkit-remote'
import { Registry } from './domain.js'

/** The orders the registry offers, by name; the server says what each one means. */
export const ProductSort = Sort.make(['description', 'cents'])

export const ProductsQuery = Query.make('Products', {
  Input: { sort: ProductSort.Schema },
  Result: Query.connection(Registry.Product),
})
