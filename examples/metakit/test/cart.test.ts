import { PGlite } from '@electric-sql/pglite'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Transition } from 'metakit'
import * as AggregatesSql from 'metakit/aggregates/sql'
import { Money } from 'metakit/domain'
import * as Machine from 'metakit/machine'
import {
  AddItem,
  CartItemCount,
  CartMachine,
  CartSubtotal,
  RemoveItem,
  SetQuantity,
  UpgradeTier,
  qualifiesForFreeShipping,
  type CartState,
} from '../src/cart/index.js'

const usd = (cents: number) => Money.minor('USD', cents)

describe('Example 6: E-Commerce Cart, Promotions & Lazy Checkout', () => {
  it('runs list transitions with stepObserved and OrderedEnum tier upgrades', () => {
    const start: CartState = {
      tier: 'bronze',
      items: [],
      checkout: { step: 'idle', shippingSelected: false, paymentAuthorized: false },
    }

    const added = Result.getOrThrow(
      Transition.stepObserved(AddItem, start, {
        id: 'i1',
        sku: 'KB-75',
        unitPrice: usd(12_000),
        qty: 1,
      }),
    )
    expect(added.state.items).toHaveLength(1)
    expect(added.writes.some(w => w.kind === 'membership' && w.path.join('.') === 'items')).toBe(
      true,
    )

    const patched = Result.getOrThrow(
      Transition.stepObserved(SetQuantity, added.state, { id: 'i1', qty: 3 }),
    )
    expect(patched.state.items[0]?.qty).toBe(3)
    expect(
      patched.writes.some(
        w => w.kind === 'keyed-field' && w.key.value === 'i1' && w.field === 'qty',
      ),
    ).toBe(true)

    expect(Expr.holds(qualifiesForFreeShipping, { cart: patched.state })).toBe(false)

    // OrderedEnum: bronze -> gold succeeds, gold -> silver is refused (no `as const` needed!)
    const upgraded = Result.getOrThrow(
      Transition.step(UpgradeTier, patched.state, { nextTier: 'gold' }),
    )
    expect(upgraded.state.tier).toBe('gold')
    expect(Expr.holds(qualifiesForFreeShipping, { cart: upgraded.state })).toBe(true)
    expect(
      Result.isFailure(Transition.step(UpgradeTier, upgraded.state, { nextTier: 'silver' })),
    ).toBe(true)

    const removed = Result.getOrThrow(Transition.step(RemoveItem, upgraded.state, { id: 'i1' }))
    expect(removed.state.items).toHaveLength(0)
  })

  it('resolves Machine.lazyChild on demand and attaches it for unified parent dispatch', async () => {
    expect(CartMachine.lazyChildren.Checkout.isLoaded()).toBe(false)
    const loaded = await CartMachine.lazyChildren.Checkout.resolve()
    expect(CartMachine.lazyChildren.Checkout.isLoaded()).toBe(true)
    const full = Machine.attach(CartMachine, 'Checkout', loaded)

    const state: CartState = {
      tier: 'gold',
      items: [{ id: 'i1', sku: 'KB-75', unitPrice: usd(12_000), qty: 2 }],
      checkout: { step: 'idle', shippingSelected: false, paymentAuthorized: false },
    }

    const [s1] = full.update(state, { _tag: 'CheckoutStartShipping', input: {} })
    expect(s1.checkout.step).toBe('shipping')

    const [s2] = full.update(s1, { _tag: 'CheckoutSelectShipping', input: {} })
    expect(s2.checkout.step).toBe('payment')
    expect(s2.checkout.shippingSelected).toBe(true)

    const [s3, emitted] = full.update(s2, {
      _tag: 'CheckoutAuthorizeAndConfirm',
      input: { authCodeLength: 6 },
    })
    expect(s3.checkout.step).toBe('confirmed')
    expect(emitted).toEqual([{ _tag: 'OrderConfirmed' }])
  })

  it('maintains O(1) cart subtotal deltas and matches AggregatesSql.toSql in PGlite', async () => {
    const itemA = { id: 'i1', sku: 'A', unitPrice: usd(1500), qty: 2 }
    const itemB = { id: 'i2', sku: 'B', unitPrice: usd(2500), qty: 1 }
    const itemA2 = { ...itemA, qty: 4 }

    let total = CartSubtotal.identity
    let count = CartItemCount.identity

    total = CartSubtotal.apply(total, CartSubtotal.insertDelta(itemA))
    count = CartItemCount.apply(count, CartItemCount.insertDelta(itemA))
    total = CartSubtotal.apply(total, CartSubtotal.insertDelta(itemB))
    count = CartItemCount.apply(count, CartItemCount.insertDelta(itemB))
    total = CartSubtotal.apply(total, CartSubtotal.updateDelta(itemA, itemA2))

    expect(total).toBe(CartSubtotal.evaluate([itemA2, itemB]))
    expect(total).toBe(8500)
    expect(count).toBe(2)

    // Verify exact agreement with Postgres SQL aggregate in PGlite
    const db = new PGlite()
    await db.exec(`
      CREATE TABLE cart_items (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL,
        "unitPrice" INTEGER NOT NULL,
        qty INTEGER NOT NULL
      );
      INSERT INTO cart_items (id, sku, "unitPrice", qty) VALUES
        ('i1', 'A', 1500, 4),
        ('i2', 'B', 2500, 1);
    `)
    const sumSql = Result.getOrThrow(AggregatesSql.toSql(CartSubtotal, { dialect: 'postgres' }))
    const countSql = Result.getOrThrow(AggregatesSql.toSql(CartItemCount, { dialect: 'postgres' }))
    const res = await db.query<{ subtotal: string; cnt: string }>(
      `SELECT (${sumSql.text}) AS subtotal, (${countSql.text}) AS cnt FROM cart_items`,
      [...sumSql.params, ...countSql.params],
    )
    expect(Number(res.rows[0]?.subtotal)).toBe(8500)
    expect(Number(res.rows[0]?.cnt)).toBe(2)
    await db.close()
  })
})
