import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { products } from '../src/data/products.js'
import { Page, routeTitle } from '../src/main.js'
import { Products } from '../src/page/index.js'
import { ProductsPage } from '../src/page/products.js'
import { AppRoute } from '../src/route.js'
import { stylesheet } from '../src/style.js'
import { apple, banana, on } from './helpers.js'

const filledCart = [
  { item: apple, quantity: 2 },
  { item: banana, quantity: 3 },
]

const productsPage = Products.init(products)

/**
 * Every route but Products, which the page draws through `h.submodel`: an
 * inert draw has no runtime frame to place it in, so the Products page is
 * drawn alone.
 */
const trees = [
  Inert.draw(Page, on(AppRoute.Cart())),
  Inert.draw(Page, on(AppRoute.Cart(), filledCart)),
  Inert.draw(Page, on(AppRoute.Checkout())),
  Inert.draw(Page, on(AppRoute.Checkout(), filledCart)),
  Inert.draw(Page, modifyFields(on(AppRoute.Checkout()), { orderPlaced: () => true })),
  Inert.draw(Page, on(AppRoute.NotFound({ path: '/missing' }))),
  Inert.draw(ProductsPage, { model: productsPage, cart: [] }),
  Inert.draw(ProductsPage, { model: productsPage, cart: filledCart }),
]

const texts = (tree: Html | undefined, tag: string): ReadonlyArray<string> =>
  Inert.byTag(tree, tag).map(Inert.text)

describe('the pages', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    for (const tree of trees) {
      expect(Inert.css(Inert.all(tree!))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree!, stylesheet)).toEqual([])
    }
  })

  // The Products route draws a Submodel, so its nav link is checked in `runtime.test.ts`.
  test.each([
    [AppRoute.Cart(), 'Cart'],
    [AppRoute.Checkout(), 'Checkout'],
  ])('marks the nav link of %o as the current page', (route, section) => {
    const current = Inert.all(Inert.draw(Page, on(route))).filter(
      node => Inert.value(node, 'aria-current') === 'page',
    )
    expect(current.map(Inert.text)).toEqual([section])
  })

  test('marks no nav link on a page no section holds', () => {
    const tree = Inert.draw(Page, on(AppRoute.NotFound({ path: '/missing' })))
    expect(Inert.all(tree).filter(node => Inert.value(node, 'aria-current') !== undefined)).toEqual(
      [],
    )
  })

  test.each([
    [AppRoute.Products({ searchText: Option.none() }), 'Shopping Cart'],
    [AppRoute.Cart(), 'Cart | Shopping Cart'],
    [AppRoute.Checkout(), 'Checkout | Shopping Cart'],
    [AppRoute.NotFound({ path: '/missing' }), 'NotFound | Shopping Cart'],
  ])('titles %o as upstream does', (route, title) => {
    expect(routeTitle(route)).toBe(title)
  })

  test('prices every line and the total to two places', () => {
    const cart = Inert.draw(Page, on(AppRoute.Cart(), filledCart))
    expect(texts(cart, 'p')).toEqual(['$1.50 each', '$0.75 each', '$5.25'])

    const checkout = Inert.draw(Page, on(AppRoute.Checkout(), filledCart))
    expect(texts(checkout, 'span')).toEqual([
      'Apple',
      '× 2',
      '$3.00',
      'Banana',
      '× 3',
      '$2.25',
      'Total',
      '$5.25',
    ])
  })
})

describe('the Products page', () => {
  test('offers Add to Cart for a product not in the cart and its quantity for one that is', () => {
    const tree = Inert.draw(ProductsPage, {
      model: productsPage,
      cart: [{ item: apple, quantity: 2 }],
    })
    const [appleRow, bananaRow] = Inert.byTag(tree, 'article')

    expect(texts(appleRow, 'button')).toEqual(['-', '+'])
    expect(Inert.bySlot(appleRow, 'quantity').map(Inert.text)).toEqual(['2'])
    expect(texts(bananaRow, 'button')).toEqual(['Add to Cart'])
  })

  test.each([
    ['', ['Apple', 'Banana', 'Orange', 'Bread', 'Milk', 'Eggs']],
    ['AN', ['Banana', 'Orange']],
    ['a', ['Apple', 'Banana', 'Orange', 'Bread']],
    ['zzz', []],
  ])('lists the products whose name contains %j, ignoring case', (searchText, names) => {
    const tree = Inert.draw(ProductsPage, {
      model: modifyFields(productsPage, { searchText: () => searchText }),
      cart: [],
    })
    expect(texts(tree, 'h3')).toEqual(names)
  })

  test('links to the cart with its item count only once the cart holds something', () => {
    const goToCart = (cart: typeof filledCart) =>
      Inert.bySlot(Inert.draw(ProductsPage, { model: productsPage, cart }), 'goToCartLink').map(
        Inert.text,
      )

    expect(goToCart([])).toEqual([])
    expect(goToCart(filledCart)).toEqual(['Go to Cart (5)'])
  })
})
