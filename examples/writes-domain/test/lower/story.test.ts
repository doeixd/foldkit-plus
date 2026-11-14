// @vitest-environment node
/**
 * The lowered `ReserveStock` on Domain's own terms: a Story over the model,
 * `Aggregate.predict` for the command (its `decide` is synchronous), and
 * `Domain.verify` finding nothing wrong with the derived definitions.
 */
import * as Domain from '@alchemy.run/domain'
import { Story } from '@alchemy.run/domain/Story'
import { Context, DateTime, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  CurrentUser,
  Product,
  ProductListed,
  ProductRow,
  ProductRowLive,
  Reserved,
  Shop,
  StockReserved,
} from '../../src/model.js'

export const listed = new ProductListed({
  row: {
    id: 'p1',
    ownerId: 'ada',
    name: 'Bolt',
    status: 'published',
    stock: 10,
    reserved: 2,
    revision: 1,
  },
})
const ref = Product.ref('p1')
const ada = Option.some({ id: 'ada' })

describe('the lowered ReserveStock as a Domain model', () => {
  it('records StockReserved, folds it into the aggregate and the View, and answers a resent commandId from its record', async () => {
    const commandId = `ReserveStock:op-1:${'a'.repeat(32)}`
    await Effect.runPromise(
      Story.make(Shop, { layer: ProductRowLive })(
        Story.given(ref, listed),
        Story.provide(CurrentUser, ada),
        Story.when(ref, new Reserved.command({ revision: 1, quantity: 3 }), { commandId }),
        Story.then(ref, new StockReserved({ quantity: 3, reservedAfter: 5, revisionAfter: 2 })),
        Story.replied({ reserved: 5, revision: 2 }),
        Story.view(ProductRow, ref, { ...listed.row, reserved: 5, revision: 2 }),
        Story.when(ref, new Reserved.command({ revision: 1, quantity: 3 }), { commandId }),
        Story.then(ref),
        Story.replied({ reserved: 5, revision: 2 }),
      ),
    )
  })

  it('rebuilds the state from given ProductListed and StockReserved, copying the outcome recorded', async () => {
    // Recorded as 7 of a quantity of 4 from 2: the event's outcome is the fact, whatever the rule now computes.
    await Effect.runPromise(
      Story.make(Shop, { layer: ProductRowLive })(
        Story.given(
          ref,
          listed,
          new StockReserved({ quantity: 4, reservedAfter: 7, revisionAfter: 2 }),
        ),
        Story.view(ProductRow, ref, { ...listed.row, reserved: 7, revision: 2 }),
        Story.provide(CurrentUser, ada),
        Story.when(ref, new Reserved.command({ revision: 2, quantity: 4 })),
        Story.rejected(
          new Reserved.rejections.Invalid({
            entity: Option.some('Product'),
            rule: Option.some('reservedWithinStock'),
            message: 'Reserved stock cannot exceed the stock',
            path: ['reserved'],
          }),
        ),
      ),
    )
  })

  it('decides synchronously: predict accepts the command', () => {
    const state = { row: Option.some(listed.row), operations: [] }
    const prediction = Product.predict(state, new Reserved.command({ revision: 1, quantity: 3 }), {
      id: 'p1',
      now: DateTime.makeUnsafe(0),
      context: Context.make(CurrentUser, ada),
    })
    expect(prediction._tag).toBe('Accepted')
    if (prediction._tag !== 'Accepted') return
    expect(prediction.events).toEqual([
      new StockReserved({ quantity: 3, reservedAfter: 5, revisionAfter: 2 }),
    ])
    expect(Option.map(prediction.state.row, row => row.reserved)).toEqual(Option.some(5))
  })

  it('verifies: Domain finds nothing wrong with the derived definitions', () => {
    expect(Domain.verify(Shop)).toEqual([])
  })
})
