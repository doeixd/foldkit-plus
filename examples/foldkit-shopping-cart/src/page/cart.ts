import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import type { Cart, Item } from '../domain/index.js'
import { Message } from '../main.js'
import { checkoutRouter, productsRouter } from '../route.js'
import { CartPart, ClearCartButtonStyle, QuantityButtonStyle, RemoveButtonStyle } from '../style.js'
import { buttonView } from './button.js'
import { cartTotal, formatPrice } from './price.js'

// VIEW

type Slots = SlotBuilders<typeof CartPart.slots, Message>

const emptyView = (slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.p(slots.empty.attrs(), ['Your cart is empty']),
  h.div(slots.emptyActions.attrs(), [
    h.a(slots.shopLink.attrs([h.Href(productsRouter({ searchText: Option.none() }))]), [
      'Continue Shopping',
    ]),
  ]),
]

const cartItemView = (cartItem: Item.CartItem, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const itemId = cartItem.item.id

  return h.keyed('article')(itemId, slots.item.attrs(), [
    h.div(slots.itemDetails.attrs(), [
      h.h3(slots.itemName.attrs(), [cartItem.item.name]),
      h.p(slots.itemPrice.attrs(), [`${formatPrice(cartItem.item.price)} each`]),
    ]),
    h.div(slots.itemControls.attrs(), [
      buttonView('-', Message.ClickedDecrementQuantity({ itemId }), QuantityButtonStyle.mixin, h),
      h.span(slots.quantity.attrs(), [cartItem.quantity.toString()]),
      buttonView('+', Message.ClickedIncrementQuantity({ itemId }), QuantityButtonStyle.mixin, h),
      buttonView('Remove', Message.ClickedRemoveCartItem({ itemId }), RemoveButtonStyle.mixin, h),
    ]),
  ])
}

const filledView = (
  cart: Array.NonEmptyReadonlyArray<Item.CartItem>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.section(
    slots.items.attrs(),
    Array.map(cart, cartItem => cartItemView(cartItem, slots, h)),
  ),
  h.div(slots.summary.attrs(), [
    h.div(slots.totalRow.attrs(), [
      h.h3(slots.total.attrs(), ['Total']),
      h.p(slots.total.attrs(), [formatPrice(cartTotal(cart))]),
    ]),
  ]),
  h.div(slots.actions.attrs(), [
    h.a(slots.continueLink.attrs([h.Href(productsRouter({ searchText: Option.none() }))]), [
      'Continue Shopping',
    ]),
    buttonView('Clear Cart', Message.ClickedClearCart(), ClearCartButtonStyle.mixin, h),
    h.a(slots.checkoutLink.attrs([h.Href(checkoutRouter())]), ['Proceed to Checkout']),
  ]),
]

export const view = SlotView.forMessages<Message>()
  .define(CartPart.slots, (cart: Cart.Cart, slots, h) =>
    h.div(slots.content.attrs(), [
      h.h1(slots.heading.attrs(), ['Shopping Cart']),
      h.div(slots.card.attrs(), [
        h.div(
          slots.body.attrs(),
          Array.match(cart, {
            onEmpty: () => emptyView(slots, h),
            onNonEmpty: cart => filledView(cart, slots, h),
          }),
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(CartPart.style))
