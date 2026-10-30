/**
 * The cart: the Cart button in the header with its count, a polite live
 * region saying the count, and the cart itself, a `Sheet` at the window's
 * right edge, as upstream's panel stands. Nothing is reserved or bought.
 */
import { Array, Number, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import type { SlotBuilders } from 'foldkit-mixins'
import { Sheet } from 'foldkit-mixins-ui'
import type { Model } from './app.js'
import { CART_BUTTON_ID, CART_CLOSE_BUTTON_ID } from './command.js'
import { formatPrice, formatRegistrationPrice, formatRenewalPrice } from './domain'
import { icons } from './iconData.js'
import { Message } from './message.js'
import { CartSheetStyle, type Page, SheetLook } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

const count = (model: Model): number => Array.length(model.cart)

export const cartButton = (model: Model, slots: Slots, h: H): Html =>
  h.button(
    slots.cartButton.attrs([
      h.Id(CART_BUTTON_ID),
      h.Type('button'),
      h.AriaLabel(`Cart, ${count(model)} domains`),
      h.AriaHasPopup('dialog'),
      h.AriaControls(model.cartSheet.dialog.id),
      h.OnClick(Message.ClickedCart()),
    ]),
    [
      Icon.draw(icons.cart, h, { size: '18px' }),
      h.span(slots.cartLabel.attrs(), ['Cart']),
      ...(count(model) === 0 ? [] : [h.span(slots.cartCount.attrs(), [`${count(model)}`])]),
    ],
  )

/** What the live region says, kept on the page so a change is announced. */
export const cartAnnouncement = (model: Model, slots: Slots, h: H): Html =>
  h.p(slots.srOnly.attrs([h.Id('cart-announcement'), h.AriaLive('polite'), h.AriaAtomic(true)]), [
    count(model) === 0
      ? 'Your cart is empty.'
      : `${count(model)} ${count(model) === 1 ? 'domain' : 'domains'} in your cart.`,
  ])

const items = (model: Model, slots: Slots, h: H): Html =>
  Array.match(model.cart, {
    onEmpty: () =>
      h.p(slots.cartNote.attrs(), [
        'Your next idea starts with a name. Search for a domain to add it here.',
      ]),
    onNonEmpty: domains =>
      h.ul(
        slots.cartItems.attrs(),
        Array.map(domains, domain =>
          h.keyed('li')(domain.name, slots.cartItem.attrs(), [
            h.div(
              [],
              [
                h.strong(slots.cartName.attrs(), [domain.name]),
                h.span(slots.cartTerms.attrs(), [formatRegistrationPrice(domain)]),
                h.span(slots.cartRenewal.attrs(), [formatRenewalPrice(domain)]),
              ],
            ),
            h.button(
              slots.iconButton.attrs([
                h.Type('button'),
                h.AriaLabel(`Remove ${domain.name}`),
                h.OnClick(Message.ClickedRemoveCartDomain({ name: domain.name })),
              ]),
              [Icon.draw(icons.close, h, { size: '18px' })],
            ),
          ]),
        ),
      ),
  })

export const cartSheet = (model: Model, slots: Slots, h: H): Html =>
  Sheet.view(
    {
      model: model.cartSheet,
      onMessage: message => Message.GotCartSheetMessage({ message }),
      mixins: [CartSheetStyle.mixin, SheetLook.mixin],
      hasDescription: true,
      draw: sheet =>
        h.dialog(
          sheet.dialog,
          sheet.isVisible
            ? [
                h.div(sheet.backdrop),
                h.section(
                  [...sheet.panel, h.AriaLabel('Your cart')],
                  [
                    h.div(slots.cartPanel.attrs(), [
                      h.div(slots.cartHeading.attrs(), [
                        h.h2(sheet.title, ['Your cart']),
                        h.button(
                          [
                            ...sheet.closeButton,
                            ...sheet.initialFocus,
                            h.Id(CART_CLOSE_BUTTON_ID),
                            h.AriaLabel('Close cart panel'),
                          ],
                          [Icon.draw(icons.close, h, { size: '18px' })],
                        ),
                      ]),
                      items(model, slots, h),
                      h.div(slots.cartTotal.attrs(), [
                        h.span([], ['Registration total']),
                        h.strong(
                          [],
                          [
                            formatPrice(
                              pipe(
                                model.cart,
                                Array.map(domain => domain.price),
                                Number.sumAll,
                              ),
                            ),
                          ],
                        ),
                      ]),
                      h.p(sheet.description, [
                        'Demo cart with sample prices and availability. No domains are reserved. No purchases are made.',
                      ]),
                    ]),
                  ],
                ),
              ]
            : [],
        ),
    },
    h,
  )
