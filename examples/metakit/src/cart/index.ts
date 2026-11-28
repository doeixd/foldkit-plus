/**
 * Example 6: E-Commerce Cart, Promotions & Lazy Checkout
 *
 * Exercises:
 * - `Machine.compose` + `Machine.lazyChild` (dynamic import of Checkout sub-machine)
 * - `Transition.stepObserved` (minimal field-level write patches)
 * - `Aggregates.sum` & `Aggregates.count` (O(1) deltas + `AggregatesSql.toSql` in PGlite)
 * - `Domain.Money` + `Domain.OrderedEnum` (loyalty tiers `bronze < silver < gold < platinum`)
 */
import { Schema } from 'effect'
import { Arr, Bool, Eq, Expr, Num, Path, Transition } from '@doeixd/metakit'
import * as Aggregates from '@doeixd/metakit/aggregates'
import { Money, OrderedEnum } from '@doeixd/metakit/domain'
import * as Machine from '@doeixd/metakit/machine'
import { CheckoutState } from './checkout.js'

export const Usd = Money.make('USD')
export const LoyaltyTier = OrderedEnum.make(['bronze', 'silver', 'gold', 'platinum'] as const)

export const CartItem = Schema.Struct({
  id: Schema.String,
  sku: Schema.String,
  unitPrice: Usd.check(Schema.isGreaterThan(0)),
  qty: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
})
export type CartItem = typeof CartItem.Type

export const CartState = Schema.Struct({
  tier: LoyaltyTier.schema,
  items: Schema.Array(CartItem),
  checkout: CheckoutState,
})
export type CartState = typeof CartState.Type

export const AddItem = Transition.make({
  state: CartState,
  input: CartItem,
  when: ({ state }) => Eq.is(state.checkout.step, 'idle'),
  apply: ({ state, input }) => [Transition.insert(state.items, input)],
})

export const SetQuantity = Transition.make({
  state: CartState,
  input: Schema.Struct({
    id: Schema.String,
    qty: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
  }),
  when: ({ state }) => Eq.is(state.checkout.step, 'idle'),
  apply: ({ state, input }) => [
    Transition.patch(state.items, input.id, () => ({ qty: input.qty })),
  ],
})

export const RemoveItem = Transition.make({
  state: CartState,
  input: Schema.Struct({ id: Schema.String }),
  when: ({ state }) => Eq.is(state.checkout.step, 'idle'),
  apply: ({ state, input }) => [Transition.remove(state.items, input.id)],
})

export const UpgradeTier = Transition.make({
  state: CartState,
  input: Schema.Struct({ nextTier: LoyaltyTier.schema }),
  when: ({ state, input }) => LoyaltyTier.gt(input.nextTier, state.tier),
  apply: ({ state, input }) => [Transition.set(state.tier, input.nextTier)],
})

/** Free shipping when loyalty tier is at least `gold` or cart has at least 3 items. */
export const qualifiesForFreeShipping = Expr.in({ cart: CartState }, ({ cart }) =>
  Bool.or(LoyaltyTier.gte(cart.tier, 'gold'), Num.gte(Arr.count(cart.items), 3)),
)

const $cart = Path.from(CartState)

export const CartMachine = Machine.compose({
  state: CartState,
  transitions: { AddItem, SetQuantity, RemoveItem, UpgradeTier },
  lazyChildren: {
    Checkout: () =>
      import('./checkout.js').then(m => Machine.lift($cart.checkout, m.CheckoutMachine)),
  },
})

/** O(1) incremental cart aggregates (also compilable to SQL via `AggregatesSql.toSql`). */
export const CartSubtotal = Aggregates.sum(CartItem, $ => Num.mul($.unitPrice, $.qty))
export const CartItemCount = Aggregates.count(CartItem)
