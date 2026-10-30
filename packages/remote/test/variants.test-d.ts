/** Variants of an Entity (#357): a Remote read of a variant Selection is its union. */
import { Schema } from 'effect'
import { Entity as Domain } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import { Selection, type SelectionValueOf } from '../src/index.js'

const Listing = Domain.defineVariants('Listing', {
  Available: { id: Schema.String, name: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const Quote = Selection.from(Domain.select(Listing, { _tag: true, name: true, price: true }))

expectTypeOf<SelectionValueOf<typeof Quote>>().toEqualTypeOf<
  | { readonly _tag: 'Available'; readonly name: string; readonly price: number }
  | { readonly _tag: 'Unconfirmed'; readonly name: string }
>()
