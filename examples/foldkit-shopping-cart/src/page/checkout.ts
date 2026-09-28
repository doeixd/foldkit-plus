import * as UiTextarea from '@foldkit/ui/textarea'
import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Textarea } from 'foldkit-mixins-ui'

import type { Item } from '../domain/index.js'
import { Message, type Model } from '../main.js'
import { cartRouter, productsRouter } from '../route.js'
import {
  CheckoutSlots,
  CheckoutStyle,
  DeliveryInstructionsStyle,
  PlaceOrderButtonStyle,
} from '../style.js'
import { buttonView } from './button.js'
import { cartTotal, formatPrice, lineTotal } from './price.js'

// VIEW

type Slots = SlotBuilders<typeof CheckoutSlots, Message>

export type ViewInput = Pick<Model, 'cart' | 'deliveryInstructions' | 'orderPlaced'>

const productsHref = productsRouter({ searchText: Option.none() })

const orderPlacedView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.confirmation.attrs(), [
    h.h1(slots.successHeading.attrs(), ['Order placed successfully!']),
    h.article(slots.successPanel.attrs(), [
      h.p(slots.successLead.attrs(), ["Thank you for your order! We'll deliver it soon."]),
      h.p(slots.successNote.attrs(), ['You will receive a confirmation email shortly.']),
    ]),
    h.a(slots.shopLink.attrs([h.Href(productsHref)]), ['Continue Shopping']),
  ])

const emptyView = (slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.p(slots.empty.attrs(), ['Your cart is empty']),
  h.div(slots.emptyActions.attrs(), [
    h.a(slots.shopLink.attrs([h.Href(productsHref)]), ['Start Shopping']),
  ]),
]

const summaryLineView = (cartItem: Item.CartItem, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(cartItem.item.id, slots.line.attrs(), [
    h.div(slots.lineItem.attrs(), [
      h.span(slots.lineName.attrs(), [cartItem.item.name]),
      h.span(slots.lineQuantity.attrs(), [`× ${cartItem.quantity}`]),
    ]),
    h.span(slots.linePrice.attrs(), [formatPrice(lineTotal(cartItem))]),
  ])

const deliveryInstructionsView = (
  deliveryInstructions: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  UiTextarea.view(
    {
      id: 'delivery-instructions',
      value: deliveryInstructions,
      placeholder: 'Special delivery instructions (optional)...',
      onInput: value => Message.UpdatedDeliveryInstructions({ value }),
      toView: attributes => {
        const { label, textarea } = Textarea.resolve<undefined, Message>(
          attributes,
          [DeliveryInstructionsStyle.mixin],
          { input: undefined, h },
        )
        return h.div(slots.field.attrs(), [
          h.label(label, ['Delivery Instructions']),
          // `resolve` types its attributes for any element, InnerHTML included,
          // which `h.textarea` refuses; a mixin cannot supply InnerHTML.
          h.textarea(textarea as Parameters<typeof h.textarea>[0]),
        ])
      },
    },
    h,
  )

const orderFormView = (
  cart: Array.NonEmptyReadonlyArray<Item.CartItem>,
  deliveryInstructions: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.section(slots.summary.attrs(), [
    h.h2(slots.summaryHeading.attrs(), ['Order Summary']),
    h.div(
      slots.lines.attrs(),
      Array.map(cart, cartItem => summaryLineView(cartItem, slots, h)),
    ),
  ]),
  h.div(slots.total.attrs(), [
    h.span(slots.totalLabel.attrs(), ['Total']),
    h.span(slots.totalAmount.attrs(), [formatPrice(cartTotal(cart))]),
  ]),
  deliveryInstructionsView(deliveryInstructions, slots, h),
  h.div(slots.actions.attrs(), [
    h.a(slots.backLink.attrs([h.Href(cartRouter())]), ['Back to Cart']),
    buttonView('Place Order', Message.ClickedPlaceOrder(), PlaceOrderButtonStyle.mixin, h),
  ]),
]

const checkoutView = (
  cart: ViewInput['cart'],
  deliveryInstructions: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Checkout']),
    h.div(
      slots.card.attrs(),
      Array.match(cart, {
        onEmpty: () => emptyView(slots, h),
        onNonEmpty: cart => orderFormView(cart, deliveryInstructions, slots, h),
      }),
    ),
  ])

export const view = SlotView.forMessages<Message>()
  .define(CheckoutSlots, ({ cart, deliveryInstructions, orderPlaced }: ViewInput, slots, h) =>
    orderPlaced ? orderPlacedView(slots, h) : checkoutView(cart, deliveryInstructions, slots, h),
  )
  .pipe(Style.attach(CheckoutStyle))
