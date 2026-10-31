import { Schema } from 'effect'

import { Domain } from '../../shared/domain'

export const Cart = Schema.Array(Domain.Available)
export type Cart = typeof Cart.Type

/** A name a cart Message carries: as long as a label and an extension can be, and no longer. */
export const Name = Schema.String.check(Schema.isMaxLength(128))
