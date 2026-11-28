/**
 * Example 6 (lazy child module): Checkout sub-machine loaded on demand via `Machine.lazyChild`.
 */
import { Schema } from 'effect'
import { Bool, Eq, Expr, Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'

export const CheckoutState = Schema.Struct({
  step: Schema.Literals(['idle', 'shipping', 'payment', 'confirmed']),
  shippingSelected: Schema.Boolean,
  paymentAuthorized: Schema.Boolean,
})
export type CheckoutState = typeof CheckoutState.Type

const StartShipping = Transition.make({
  state: CheckoutState,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.step, 'idle'),
  apply: ({ state }) => [Transition.set(state.step, 'shipping')],
})

const SelectShipping = Transition.make({
  state: CheckoutState,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.step, 'shipping'),
  apply: ({ state }) => [
    Transition.set(state.shippingSelected, true),
    Transition.set(state.step, 'payment'),
  ],
})

const AuthorizeAndConfirm = Transition.make({
  state: CheckoutState,
  input: Schema.Struct({ authCodeLength: Schema.Int }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.step, 'payment'),
      state.shippingSelected,
      Bool.not(state.paymentAuthorized),
      Num.gte(input.authCodeLength, 6),
    ),
  apply: ({ state }) => [
    Transition.set(state.paymentAuthorized, true),
    Transition.set(state.step, 'confirmed'),
  ],
  emits: () => [Transition.emit('OrderConfirmed', {})],
})

export const CheckoutMachine = Machine.make({
  state: CheckoutState,
  transitions: { StartShipping, SelectShipping, AuthorizeAndConfirm },
})
