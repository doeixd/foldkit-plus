// @vitest-environment jsdom
/**
 * The application on the real Foldkit runtime, with the browser's URL and
 * history: the Products Submodel's OutMessages reaching the cart, the search
 * written to the URL, and a whole order from the first click to the receipt.
 */
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'

import { Message, Model, init, update, view } from '../src/main.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const start = (path: string) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  window.history.replaceState(null, '', path)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)

  Runtime.run(
    Runtime.makeApplication({
      Model,
      init,
      update,
      view,
      container,
      routing: {
        onUrlRequest: request => Message.ClickedLink({ request }),
        onUrlChange: url => Message.ChangedUrl({ url }),
      },
    }),
  )
}

const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 3_000 })

const textsOf = (selector: string, within: ParentNode = document): ReadonlyArray<string> =>
  Array.from(within.querySelectorAll(selector)).map(element => element.textContent ?? '')

const named = <E extends Element>(
  selector: string,
  name: string,
  within: ParentNode = document,
) => {
  const found = Array.from(within.querySelectorAll<E>(selector)).find(
    element => element.textContent === name,
  )
  if (found === undefined) throw new Error(`no ${selector} named ${name}`)
  return found
}

const link = (name: string) => named<HTMLAnchorElement>('a', name)

const button = (name: string) => named<HTMLButtonElement>('button', name)

/** The row of the product or cart line named `item`. */
const rowOf = (item: string): Element => {
  const row = named('h3', item).closest('article')
  if (row === null) throw new Error(`no row for ${item}`)
  return row
}

const buttonIn = (item: string, name: string) =>
  named<HTMLButtonElement>('button', name, rowOf(item))

const navLinks = () => textsOf('nav a')

const currentNavLink = () => textsOf('nav a[aria-current="page"]')

const productNames = () => textsOf('article h3')

const type = (selector: string, value: string) => {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  if (field === null) throw new Error(`no ${selector}`)
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

test('the Products page changes the cart through its OutMessages', async () => {
  start('/')
  await waitFor(() => expect(document.title).toBe('Shopping Cart'))
  expect(currentNavLink()).toEqual(['Products'])
  expect(navLinks()).toEqual(['Products', 'Cart', 'Checkout'])

  buttonIn('Apple', 'Add to Cart').click()
  await waitFor(() => expect(navLinks()).toEqual(['Products', 'Cart (1)', 'Checkout']))
  expect(textsOf('button', rowOf('Apple'))).toEqual(['-', '+'])

  buttonIn('Apple', '+').click()
  await waitFor(() => expect(textsOf('span', rowOf('Apple'))).toEqual(['2']))
  expect(textsOf('main a')).toEqual(['Go to Cart (2)'])

  buttonIn('Apple', '-').click()
  await waitFor(() => expect(textsOf('span', rowOf('Apple'))).toEqual(['1']))
  buttonIn('Apple', '-').click()
  await waitFor(() => expect(textsOf('button', rowOf('Apple'))).toEqual(['Add to Cart']))
  expect(navLinks()).toEqual(['Products', 'Cart', 'Checkout'])
  expect(textsOf('main a')).toEqual([])
})

test('the search filters the products and replaces the URL, not adding to history', async () => {
  start('/')
  await waitFor(() => expect(productNames()).toHaveLength(6))
  const historyLength = window.history.length

  type('#product-search', 'an')
  await waitFor(() => expect(window.location.search).toBe('?searchText=an'))
  expect(productNames()).toEqual(['Banana', 'Orange'])
  expect(window.history.length).toBe(historyLength)
  expect(currentNavLink()).toEqual(['Products'])

  type('#product-search', '')
  await waitFor(() => expect(window.location.search).toBe(''))
  expect(productNames()).toHaveLength(6)
})

test('a copied search URL filters the first page and follows back/forward navigation', async () => {
  start('/?searchText=app')
  await waitFor(() => expect(productNames()).toEqual(['Apple']))
  expect(document.querySelector<HTMLInputElement>('#product-search')?.value).toBe('app')

  link('Cart').click()
  await waitFor(() => expect(document.title).toBe('Cart | Shopping Cart'))
  link('Products').click()
  await waitFor(() => expect(productNames()).toHaveLength(6))
  expect(document.querySelector<HTMLInputElement>('#product-search')?.value).toBe('')

  window.history.back()
  await waitFor(() => expect(document.title).toBe('Cart | Shopping Cart'))
  window.history.back()
  await waitFor(() => expect(productNames()).toEqual(['Apple']))
  expect(document.querySelector<HTMLInputElement>('#product-search')?.value).toBe('app')

  window.history.forward()
  await waitFor(() => expect(document.title).toBe('Cart | Shopping Cart'))
  window.history.forward()
  await waitFor(() => expect(productNames()).toHaveLength(6))
  expect(document.querySelector<HTMLInputElement>('#product-search')?.value).toBe('')
})

test('an order goes from the cart through checkout to the receipt', async () => {
  start('/')
  await waitFor(() => expect(productNames()).toHaveLength(6))
  buttonIn('Apple', 'Add to Cart').click()
  await waitFor(() => expect(buttonIn('Apple', '+')).toBeInstanceOf(HTMLButtonElement))
  buttonIn('Banana', 'Add to Cart').click()
  buttonIn('Milk', 'Add to Cart').click()

  await waitFor(() => expect(link('Go to Cart (3)')).toBeInstanceOf(HTMLAnchorElement))
  link('Go to Cart (3)').click()
  await waitFor(() => expect(document.title).toBe('Cart | Shopping Cart'))
  expect(window.location.pathname).toBe('/cart')
  expect(currentNavLink()).toEqual(['Cart (3)'])
  expect(productNames()).toEqual(['Apple', 'Banana', 'Milk'])

  buttonIn('Apple', '+').click()
  buttonIn('Banana', 'Remove').click()
  await waitFor(() => expect(productNames()).toEqual(['Apple', 'Milk']))
  expect(textsOf('main p')).toEqual(['$1.50 each', '$4.00 each', '$7.00'])

  link('Proceed to Checkout').click()
  await waitFor(() => expect(document.title).toBe('Checkout | Shopping Cart'))
  expect(textsOf('main h2')).toEqual(['Order Summary'])

  type('#delivery-instructions', 'Leave at the door')
  await waitFor(() =>
    expect(document.querySelector<HTMLTextAreaElement>('#delivery-instructions')?.value).toBe(
      'Leave at the door',
    ),
  )

  button('Place Order').click()
  await waitFor(() => expect(textsOf('main h1')).toEqual(['Order placed successfully!']))
  expect(navLinks()).toEqual(['Products', 'Cart', 'Checkout'])

  link('Continue Shopping').click()
  await waitFor(() => expect(document.title).toBe('Shopping Cart'))
})

test('Clear Cart empties the cart and shows the empty state', async () => {
  start('/')
  await waitFor(() => expect(productNames()).toHaveLength(6))
  buttonIn('Eggs', 'Add to Cart').click()
  await waitFor(() => expect(link('Cart (1)')).toBeInstanceOf(HTMLAnchorElement))

  link('Cart (1)').click()
  await waitFor(() => expect(productNames()).toEqual(['Eggs']))
  button('Clear Cart').click()
  await waitFor(() => expect(textsOf('main p')).toEqual(['Your cart is empty']))
  expect(navLinks()).toEqual(['Products', 'Cart', 'Checkout'])
})
