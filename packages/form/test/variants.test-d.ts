/** A form over a variant Entity (#357), as the types see it. */
import { Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import { Form } from '../src/index.js'

const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const Listing = Form.make(
  'Listing',
  Entity.input(
    Domain,
    Schema.Struct({
      _tag: Domain.fields._tag.schema,
      name: Schema.String,
      price: Schema.optionalKey(Schema.Finite),
    }),
  ),
)

expectTypeOf(Listing.chosen(Listing.initial)).toEqualTypeOf<Option.Option<string>>()
expectTypeOf(Listing.shows(Listing.initial, 'price')).toEqualTypeOf<boolean>()
// @ts-expect-error the form has no key "years"
Listing.shows(Listing.initial, 'years')
