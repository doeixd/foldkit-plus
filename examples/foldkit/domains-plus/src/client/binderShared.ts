/** Shared lightweight schemas and foreign formatters for the `domains-plus` binder and its lazy chunks. */
import { Schema } from 'effect'
import * as Operation from '@doeixd/metakit/operation'

export interface CartDomain {
  readonly _tag: 'Available'
  readonly name: string
  readonly tld: string
  readonly price: number
  readonly renewalPrice: number
  readonly years: number
  readonly isPremium: boolean
}

export const CartDomainSchema = Schema.Struct({
  _tag: Schema.Literal('Available'),
  name: Schema.String,
  tld: Schema.String,
  price: Schema.Number,
  renewalPrice: Schema.Number,
  years: Schema.Number,
  isPremium: Schema.Boolean,
})

export const BinderModelSchema = Schema.Struct({
  cart: Schema.Array(CartDomainSchema),
})
export type BinderModel = typeof BinderModelSchema.Type

export const NameInput = Schema.Struct({ name: Schema.String })

export const formatCartLabel = Operation.define({
  id: 'domains.formatCartLabel',
  version: 1,
  args: [Schema.Number] as const,
  returns: Schema.String,
  nulls: 'strict',
})

export const formatCartAnnouncement = Operation.define({
  id: 'domains.formatCartAnnouncement',
  version: 1,
  args: [Schema.Number] as const,
  returns: Schema.String,
  nulls: 'strict',
})

export const binderForeign = Operation.implementations(
  'domains-binder',
  Operation.implement(formatCartLabel, count => `Cart, ${count} domains`),
  Operation.implement(formatCartAnnouncement, count =>
    count === 0
      ? 'Your cart is empty.'
      : `${count} ${count === 1 ? 'domain' : 'domains'} in your cart.`,
  ),
)
