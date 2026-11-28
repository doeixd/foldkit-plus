import { Schema } from 'effect'
import { inertHtml as h } from 'foldkit/html'
import { Arr, Path } from '@doeixd/metakit'
import { Binding } from '../src/index.js'

const Model = Schema.Struct({
  cart: Schema.Array(Schema.Struct({ name: Schema.String })),
})
type Model = typeof Model.Type

const m = Path.from(Model)

const CartBindings = Binding.define({
  count: Binding.text(Arr.count(m.cart)),
  order: Binding.order(m.cart, 'name'),
})

CartBindings.anchor('count')
CartBindings.attr(h, 'order')

// @ts-expect-error 'missingKey' is not a declared binding key
CartBindings.anchor('missingKey')

// @ts-expect-error 'missingKey' is not a declared binding key
CartBindings.attr(h, 'missingKey')
