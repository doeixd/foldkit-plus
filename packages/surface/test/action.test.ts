/**
 * Action: a named capability that ends in an existing Message, its input
 * decoded before `toMessage` sees it.
 */
import { Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Action } from '../src/index.js'

const Message = defineMessageUnion({
  AddedToCart: { productId: Schema.String, count: Schema.Number },
})
type Message = typeof Message.Type

const AddToCart = Action.define({
  name: 'addToCart',
  description: 'Add a product to the cart',
  input: Schema.Struct({ productId: Schema.String, count: Schema.optional(Schema.Number) }),
  toMessage: input => Message.AddedToCart({ productId: input.productId, count: input.count ?? 1 }),
})

describe('Action', () => {
  it('makes its Message from input its Schema decodes, and refuses the rest', () => {
    expect(Action.run(AddToCart, { productId: 'p1' })).toEqual(
      Result.succeed(Message.AddedToCart({ productId: 'p1', count: 1 })),
    )
    const refused = Action.run(AddToCart, { productId: 7 })
    expect(Result.isFailure(refused)).toBe(true)
    expect(Action.is(AddToCart)).toBe(true)
    expect(Action.is({ name: 'addToCart' })).toBe(false)
  })

  it('is typed by its name, input and Message', () => {
    expectTypeOf(AddToCart.name).toEqualTypeOf<'addToCart'>()
    expectTypeOf(Action.run(AddToCart, {})).toEqualTypeOf<
      Result.Result<Message, Schema.SchemaError>
    >()
  })

  it('needs a name', () => {
    expect(() =>
      Action.define({ name: '', description: 'x', input: Schema.Struct({}), toMessage: () => 0 }),
    ).toThrow('an Action needs a name')
  })
})
