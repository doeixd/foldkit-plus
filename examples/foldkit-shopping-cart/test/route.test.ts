import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { Message, init, update } from '../src/main.js'
import { Products } from '../src/page/index.js'
import { AppRoute, cartRouter, checkoutRouter, productsRouter } from '../src/route.js'
import { urlOrThrow } from './helpers.js'

describe('ChangedUrl', () => {
  test.each([
    ['http://localhost/', AppRoute.Products({ searchText: Option.none() })],
    ['http://localhost/?searchText=app', AppRoute.Products({ searchText: Option.some('app') })],
    ['http://localhost/cart', AppRoute.Cart()],
    ['http://localhost/checkout', AppRoute.Checkout()],
  ])('for the route already shown (%s) returns the same Model', (url, route) => {
    const model = init(urlOrThrow(url)).model
    expect(model.route).toEqual(route)
    const result = update(model, Message.ChangedUrl({ url: urlOrThrow(url) }))

    expect(result.model).toBe(model)
    expect(result.commands ?? []).toEqual([])
  })

  test.each([
    ['http://localhost/', ''],
    ['http://localhost/?searchText=ban', 'ban'],
  ])('entering %s delivers the search without writing another URL', (url, searchText) => {
    const model = update(
      init(urlOrThrow('http://localhost/?searchText=app')).model,
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/cart') }),
    ).model
    const result = update(model, Message.ChangedUrl({ url: urlOrThrow(url) }))

    expect(result.model.productsPage.searchText).toBe(searchText)
    expect(result.commands ?? []).toEqual([])
  })

  test('a navigation echo keeps the typed search and emits no second write', () => {
    const model = init(urlOrThrow('http://localhost/')).model
    const typed = update(
      model,
      Message.GotProductsMessage({
        message: Products.Message.ChangedSearchInput({ value: 'ban' }),
      }),
    )
    expect(typed.commands).toHaveLength(1)
    const echo = Message.ChangedUrl({ url: urlOrThrow('http://localhost/?searchText=ban') })
    const routed = update(typed.model, echo)
    expect(routed.model.productsPage).toBe(typed.model.productsPage)
    expect(routed.commands ?? []).toEqual([])
    expect(update(routed.model, echo).model).toBe(routed.model)
  })
})

describe('initial search', () => {
  test.each([
    ['http://localhost/?searchText=app', 'app'],
    ['http://localhost/?searchText=green%20tea', 'green tea'],
    ['http://localhost/', ''],
    ['http://localhost/cart', ''],
  ])('%s starts with %j', (url, searchText) => {
    expect(init(urlOrThrow(url)).model.productsPage.searchText).toBe(searchText)
  })
})

describe('the routers', () => {
  test.each([
    [productsRouter({ searchText: Option.none() }), '/'],
    [productsRouter({ searchText: Option.some('app') }), '/?searchText=app'],
    [cartRouter(), '/cart'],
    [checkoutRouter(), '/checkout'],
  ])('print %s', (printed, expected) => {
    expect(printed).toBe(expected)
  })
})
