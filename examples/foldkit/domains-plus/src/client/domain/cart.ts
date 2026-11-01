import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect'

import { Domain } from '../../shared/domain'

export const Cart = Schema.Array(Domain.Available)
export type Cart = typeof Cart.Type

/** A name a cart Message carries: as long as a label and an extension can be, and no longer. */
export const Name = Schema.String.check(Schema.isMaxLength(128))

/**
 * A cart's names as its cookie keeps them, apart by a space, which the
 * cookie's form encoding writes as one `+`.
 */
export const CartNames = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Array(Name),
    SchemaTransformation.transform<ReadonlyArray<string>, string>({
      decode: text => (text === '' ? [] : text.split(' ')),
      encode: names => names.join(' '),
    }),
  ),
)

/**
 * The cart as its cookie keeps it: its names alone, so 50 of the longest
 * fit in the cookie's 4096 bytes. A name holds no price, so it decodes to no
 * cart: the server reads the names with `CartNames` and prices each again.
 */
export const CartCookie = CartNames.pipe(
  Schema.decodeTo(
    Cart,
    SchemaTransformation.transformEffect<typeof Cart.Encoded, ReadonlyArray<string>>({
      decode: names =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { message: 'a cart cookie holds names, which only the server prices' },
            names,
          ),
        ),
      encode: cart => Effect.succeed(cart.map(({ name }) => name)),
    }),
  ),
)
