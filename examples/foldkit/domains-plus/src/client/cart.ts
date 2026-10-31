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
import { Resume } from 'foldkit-ssr/client'
import type { AvailableDomain } from '../shared/domain'
import type { Model } from './app.js'
import { CART_BUTTON_ID, CART_CLOSE_BUTTON_ID } from './command.js'
import { formatPrice, formatRegistrationPrice, formatRenewalPrice } from './domain'
import { icons } from './iconData.js'
import { Message } from './message.js'
import { CartSheetLook, CartSheetStyle, type Page, SheetLook } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

/** What the cart's controls read: its domains and its sheet. */
export type CartInput = Pick<Model, 'cart' | 'cartSheet'>

/** The cart's section on a page without scripts, which its link in the header goes to. */
const PLAIN_CART_ID = 'cart'

const count = (model: Pick<Model, 'cart'>): number => Array.length(model.cart)

export const cartButton = (model: CartInput, slots: Slots, h: H): Html =>
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
export const cartAnnouncement = (model: Pick<Model, 'cart'>, slots: Slots, h: H): Html =>
  h.p(slots.srOnly.attrs([h.Id('cart-announcement'), h.AriaLive('polite'), h.AriaAtomic(true)]), [
    count(model) === 0
      ? 'Your cart is empty.'
      : `${count(model)} ${count(model) === 1 ? 'domain' : 'domains'} in your cart.`,
  ])

/** A link to the cart for a page without scripts, where the Cart button opens nothing. */
export const plainCartLink = (model: Pick<Model, 'cart'>, slots: Slots, h: H): Html =>
  h.a(slots.plainCartLink.attrs([h.Href(`#${PLAIN_CART_ID}`)]), [
    Icon.draw(icons.cart, h, { size: '18px' }),
    h.span(slots.cartLabel.attrs(), ['Cart']),
    ...(count(model) === 0 ? [] : [h.span(slots.cartCount.attrs(), [`${count(model)}`])]),
  ])

/** The cart's names, each with the control that takes it out. */
const items = (
  model: Pick<Model, 'cart'>,
  remove: (domain: AvailableDomain) => Html,
  slots: Slots,
  h: H,
): Html =>
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
            remove(domain),
          ]),
        ),
      ),
  })

const total = (model: Pick<Model, 'cart'>, slot: Slots['cartTotal'], h: H): Html =>
  h.div(slot.attrs(), [
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
  ])

export const cartSheet = (model: CartInput, slots: Slots, h: H): Html =>
  Sheet.view(
    {
      model: model.cartSheet,
      onMessage: message => Message.GotCartSheetMessage({ message }),
      mixins: [CartSheetStyle.mixin, SheetLook.mixin, CartSheetLook.mixin],
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
                      items(
                        model,
                        domain =>
                          h.button(
                            slots.iconButton.attrs([
                              h.Type('button'),
                              h.AriaLabel(`Remove ${domain.name}`),
                              h.OnClick(Message.ClickedRemoveCartDomain({ name: domain.name })),
                            ]),
                            [Icon.draw(icons.close, h, { size: '18px' })],
                          ),
                        slots,
                        h,
                      ),
                      total(model, slots.cartTotal, h),
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

/**
 * The cart on a page without scripts, where the sheet cannot open: a
 * section at the page's end, each name with a form that posts its removal
 * to the server, which runs `update` and draws the page again.
 */
export const plainCart = (model: Pick<Model, 'cart'>, slots: Slots, h: H): Html => {
  const rh = Resume.builder(h)
  return h.section(slots.plainCart.attrs([h.Id(PLAIN_CART_ID), h.AriaLabel('Your cart')]), [
    h.h2(slots.sectionTitle.attrs(), ['Your cart']),
    items(
      model,
      domain =>
        rh.form(
          slots.cartForm.attrs([rh.OnSubmit(Message.ClickedRemoveDomain({ name: domain.name }))]),
          [
            h.button(
              slots.iconButton.attrs([h.Type('submit'), h.AriaLabel(`Remove ${domain.name}`)]),
              [Icon.draw(icons.close, h, { size: '18px' })],
            ),
          ],
        ),
      slots,
      h,
    ),
    total(model, slots.plainCartTotal, h),
  ])
}
