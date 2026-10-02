import * as UiInput from '@foldkit/ui/input'
import { Array, Effect, Option, Schema, String } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { replaceUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Input } from 'foldkit-mixins-ui'

import { Cart, Item } from '../domain/index.js'
import { cartRouter, productsRouter } from '../route.js'
import {
  AddToCartButtonStyle,
  ProductsPart,
  QuantityButtonStyle,
  SearchInputStyle,
} from '../style.js'
import { buttonView } from './button.js'
import { formatPrice } from './price.js'

// MODEL

export const Model = Schema.Struct({
  products: Schema.Array(Item.Item),
  searchText: Schema.String,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedReplaceSearchUrl: {},
  ChangedRoute: { searchText: Schema.String },
  ChangedSearchInput: { value: Schema.String },
  ClickedAddToCart: { item: Item.Item },
  ClickedIncrementQuantity: { itemId: Schema.String },
  ClickedDecrementQuantity: { itemId: Schema.String },
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  AddedToCart: { item: Item.Item },
  IncrementedQuantity: { itemId: Schema.String },
  DecrementedQuantity: { itemId: Schema.String },
})

export type OutMessage = typeof OutMessage.Type

export type AddedToCart = typeof OutMessage.AddedToCart.Type
export type IncrementedQuantity = typeof OutMessage.IncrementedQuantity.Type
export type DecrementedQuantity = typeof OutMessage.DecrementedQuantity.Type

// INIT

export const init = (products: ReadonlyArray<Item.Item>, searchText = ''): Model => ({
  products,
  searchText,
})

// COMMAND

export const ReplaceSearchUrl = Command.define('ReplaceSearchUrl', {
  args: { url: Schema.String },
  messages: [Message.CompletedReplaceSearchUrl],
  execute: ({ url }) => replaceUrl(url).pipe(Effect.as(Message.CompletedReplaceSearchUrl())),
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    CompletedReplaceSearchUrl: () => ({ model }),

    ChangedRoute: ({ searchText }) => ({
      model:
        searchText === model.searchText
          ? model
          : modifyFields(model, { searchText: () => searchText }),
    }),

    ChangedSearchInput: ({ value }) => ({
      model: modifyFields(model, { searchText: () => value }),
      commands: [
        ReplaceSearchUrl({
          url: productsRouter({
            searchText: Option.liftPredicate(value, String.isNonEmpty),
          }),
        }),
      ],
    }),

    ClickedAddToCart: ({ item }) => ({
      model,
      outMessage: OutMessage.AddedToCart({ item }),
    }),

    ClickedIncrementQuantity: ({ itemId }) => ({
      model,
      outMessage: OutMessage.IncrementedQuantity({ itemId }),
    }),

    ClickedDecrementQuantity: ({ itemId }) => ({
      model,
      outMessage: OutMessage.DecrementedQuantity({ itemId }),
    }),
  })

// VIEW

export type ViewInputs = Readonly<{
  cart: Cart.Cart
}>

type Slots = SlotBuilders<typeof ProductsPart.slots, Message>

const matchingProducts = (
  products: ReadonlyArray<Item.Item>,
  searchText: string,
): ReadonlyArray<Item.Item> => {
  const query = searchText.toLowerCase()
  return String.isEmpty(query)
    ? products
    : Array.filter(products, product => product.name.toLowerCase().includes(query))
}

const cartControlsView = (
  product: Item.Item,
  quantity: number,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  quantity === 0
    ? buttonView(
        'Add to Cart',
        Message.ClickedAddToCart({ item: product }),
        AddToCartButtonStyle.mixin,
        h,
      )
    : h.div(slots.quantityControls.attrs(), [
        buttonView(
          '-',
          Message.ClickedDecrementQuantity({ itemId: product.id }),
          QuantityButtonStyle.mixin,
          h,
        ),
        h.span(slots.quantity.attrs(), [quantity.toString()]),
        buttonView(
          '+',
          Message.ClickedIncrementQuantity({ itemId: product.id }),
          QuantityButtonStyle.mixin,
          h,
        ),
      ])

const productView = (
  product: Item.Item,
  cart: Cart.Cart,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('article')(product.id, slots.product.attrs(), [
    h.div(slots.productDetails.attrs(), [
      h.h3(slots.productName.attrs(), [product.name]),
      h.p(slots.productPrice.attrs(), [formatPrice(product.price)]),
    ]),
    cartControlsView(product, Cart.itemQuantity(product.id)(cart), slots, h),
  ])

const searchView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.search(slots.search.attrs(), [
    UiInput.view(
      {
        id: 'product-search',
        value: model.searchText,
        placeholder: 'Search products...',
        onInput: value => Message.ChangedSearchInput({ value }),
        toView: attributes =>
          h.input([
            ...Input.resolve<undefined, Message>(attributes, [SearchInputStyle.mixin], {
              input: undefined,
              h,
            }).input,
            h.AriaLabel('Search products'),
          ]),
      },
      h,
    ),
  ])

/** The page, drawn through its own Slots: `h` here is the Submodel's, typed by the page's Message. */
export const ProductsPage = SlotView.forMessages<Message>()
  .define(
    ProductsPart.slots,
    ({ model, cart }: Readonly<{ model: Model } & ViewInputs>, slots, h) =>
      h.div(slots.content.attrs(), [
        h.h1(slots.heading.attrs(), ['Products']),
        h.div(slots.card.attrs(), [
          searchView(model, slots, h),
          h.section(
            slots.products.attrs(),
            Array.map(matchingProducts(model.products, model.searchText), product =>
              productView(product, cart, slots, h),
            ),
          ),
          Array.match(cart, {
            onEmpty: () => h.empty,
            onNonEmpty: cart =>
              h.div(slots.goToCart.attrs(), [
                h.a(slots.goToCartLink.attrs([h.Href(cartRouter())]), [
                  `Go to Cart (${Cart.totalItems(cart)})`,
                ]),
              ]),
          }),
        ]),
      ]),
  )
  .pipe(Style.attach(ProductsPart.style))

export const view = Submodel.defineView<Model, Message, ViewInputs>((model, { cart }, h) =>
  ProductsPage({ model, cart }, h),
)
