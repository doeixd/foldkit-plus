import { Array, Effect, Equal, Option, Schema } from 'effect'
import { Command, type Runtime, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { products } from './data/products.js'
import { Cart } from './domain/index.js'
import { Cart as CartPage, Checkout, Products } from './page/index.js'
import { AppRoute, cartRouter, checkoutRouter, productsRouter, urlToAppRoute } from './route.js'
import { ShopPage } from './style.js'

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  cart: Cart.Cart,
  deliveryInstructions: Schema.String,
  orderPlaced: Schema.Boolean,
  productsPage: Products.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  GotProductsMessage: { message: Products.Message },
  ClickedIncrementQuantity: { itemId: Schema.String },
  ClickedDecrementQuantity: { itemId: Schema.String },
  ClickedRemoveCartItem: { itemId: Schema.String },
  ClickedClearCart: {},
  UpdatedDeliveryInstructions: { value: Schema.String },
  ClickedPlaceOrder: {},
})

export type Message = typeof Message.Type

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => {
  const route = urlToAppRoute(url)
  const searchText = AppRoute.match(route, {
    Products: ({ searchText }) => Option.getOrElse(searchText, () => ''),
    Cart: () => '',
    Checkout: () => '',
    NotFound: () => '',
  })
  return {
    model: {
      route,
      cart: [],
      deliveryInstructions: '',
      orderPlaced: false,
      productsPage: Products.init(products, searchText),
    },
  }
}

// COMMAND

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const foldProductsOutMessage = Products.OutMessage.match<Update.Step<Model, Message>>({
  AddedToCart:
    ({ item }) =>
    model => ({ model: modifyFields(model, { cart: Cart.addItem(item) }) }),
  IncrementedQuantity:
    ({ itemId }) =>
    model => ({
      model: modifyFields(model, { cart: Cart.incrementQuantity(itemId) }),
    }),
  DecrementedQuantity:
    ({ itemId }) =>
    model => ({
      model: modifyFields(model, { cart: Cart.decrementQuantity(itemId) }),
    }),
})

const foldProducts = Update.foldChild({
  update: Products.update,
  read: (model: Model) => Option.some(model.productsPage),
  write: (model, nextProductsPage) =>
    nextProductsPage === model.productsPage
      ? model
      : modifyFields(model, { productsPage: () => nextProductsPage }),
  toParentMessage: message => Message.GotProductsMessage({ message }),
  foldOutMessage: foldProductsOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),

        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),

    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)

      // A URL a Command wrote (a nav link to the page already shown) comes back
      // here; the route the Model already shows is not a change.
      if (Equal.equals(nextRoute, model.route)) return { model }
      const routed = modifyFields(model, { route: () => nextRoute })
      return AppRoute.match<UpdateReturn>(nextRoute, {
        Products: ({ searchText }) =>
          foldProducts(
            routed,
            Products.Message.ChangedRoute({
              searchText: Option.getOrElse(searchText, () => ''),
            }),
          ),
        Cart: () => ({ model: routed }),
        Checkout: () => ({ model: routed }),
        NotFound: () => ({ model: routed }),
      })
    },

    GotProductsMessage: ({ message }) => foldProducts(model, message),

    ClickedIncrementQuantity: ({ itemId }) => ({
      model: modifyFields(model, {
        cart: Cart.incrementQuantity(itemId),
      }),
    }),

    ClickedDecrementQuantity: ({ itemId }) => ({
      model: modifyFields(model, {
        cart: Cart.decrementQuantity(itemId),
      }),
    }),

    ClickedRemoveCartItem: ({ itemId }) => ({
      model: modifyFields(model, {
        cart: Cart.removeItem(itemId),
      }),
    }),

    ClickedClearCart: () => ({
      model: modifyFields(model, {
        cart: () => [],
      }),
    }),

    UpdatedDeliveryInstructions: ({ value }) => ({
      model: modifyFields(model, {
        deliveryInstructions: () => value,
      }),
    }),

    ClickedPlaceOrder: () => ({
      model: modifyFields(model, {
        orderPlaced: () => true,
        cart: () => [],
        deliveryInstructions: () => '',
      }),
    }),
  })

// VIEW

type Slots = SlotBuilders<typeof ShopPage.slots, Message>

const NavSection = Schema.Literals(['Products', 'Cart', 'Checkout'])
type NavSection = typeof NavSection.Type

const navSectionOf = (route: AppRoute): Option.Option<NavSection> =>
  AppRoute.match(route, {
    Products: () => Option.some('Products' as const),
    Cart: () => Option.some('Cart' as const),
    Checkout: () => Option.some('Checkout' as const),
    NotFound: () => Option.none(),
  })

const productsHref = productsRouter({ searchText: Option.none() })

const navigationHrefBySection: Readonly<Record<NavSection, string>> = {
  Products: productsHref,
  Cart: cartRouter(),
  Checkout: checkoutRouter(),
}

const navLinkTextBySection: Readonly<Record<NavSection, (cartCount: number) => string>> = {
  Products: () => 'Products',
  Cart: cartCount => (cartCount > 0 ? `Cart (${cartCount})` : 'Cart'),
  Checkout: () => 'Checkout',
}

const navigationView = (
  currentRoute: AppRoute,
  cartCount: number,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const currentSection = navSectionOf(currentRoute)

  return h.nav(slots.nav.attrs(), [
    h.ul(
      slots.navList.attrs(),
      Array.map(NavSection.literals, section =>
        h.li(slots.navItem.attrs(), [
          h.a(
            slots.navLink.attrs([
              h.Href(navigationHrefBySection[section]),
              ...(Option.contains(currentSection, section) ? [h.AriaCurrent('page')] : []),
            ]),
            [navLinkTextBySection[section](cartCount)],
          ),
        ]),
      ),
    ),
  ])
}

const notFoundView = (path: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.notFound.attrs(), [
    h.h1(slots.notFoundHeading.attrs(), ['404 - Page Not Found']),
    h.p(slots.notFoundText.attrs(), [`The path "${path}" was not found.`]),
    h.a(slots.link.attrs([h.Href(productsHref)]), ['← Go to Products']),
  ])

export const Page = SlotView.forMessages<Message>()
  .define(ShopPage.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.header(slots.header.attrs(), [
        navigationView(model.route, Cart.totalItems(model.cart), slots, h),
      ]),
      h.main(slots.main.attrs(), [
        AppRoute.match(model.route, {
          Products: () =>
            h.submodel({
              slotId: 'products',
              model: model.productsPage,
              view: Products.view,
              viewInputs: { cart: model.cart },
              toParentMessage: message => Message.GotProductsMessage({ message }),
            }),
          Cart: () => CartPage.view(model.cart, h),
          Checkout: () => Checkout.view(model, h),
          NotFound: ({ path }) => notFoundView(path, slots, h),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(ShopPage.style))

export const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Products: () => 'Shopping Cart',
    Cart: () => 'Cart | Shopping Cart',
    Checkout: () => 'Checkout | Shopping Cart',
    NotFound: () => 'NotFound | Shopping Cart',
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Page(model, h),
})
