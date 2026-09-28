import { Option } from 'effect'
import { type Url, fromString } from 'foldkit/url'

import { products } from '../src/data/products.js'
import type { Cart } from '../src/domain/index.js'
import { Model } from '../src/main.js'
import { Products } from '../src/page/index.js'
import { AppRoute } from '../src/route.js'

export const apple = { id: '1', name: 'Apple', price: 1.5 }
export const banana = { id: '2', name: 'Banana', price: 0.75 }

export const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

/** The Model on `route` holding `cart`, as a first visit leaves the rest. */
export const on = (route: AppRoute, cart: Cart.Cart = []): Model =>
  Model.make({
    route,
    cart,
    deliveryInstructions: '',
    orderPlaced: false,
    productsPage: Products.init(products),
  })
