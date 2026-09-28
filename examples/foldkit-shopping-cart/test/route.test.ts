import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { Message, update } from '../src/main.js'
import { AppRoute, cartRouter, checkoutRouter, productsRouter } from '../src/route.js'
import { on, urlOrThrow } from './helpers.js'

describe('ChangedUrl', () => {
  test.each([
    ['http://localhost/', AppRoute.Products({ searchText: Option.none() })],
    ['http://localhost/?searchText=app', AppRoute.Products({ searchText: Option.some('app') })],
    ['http://localhost/cart', AppRoute.Cart()],
    ['http://localhost/checkout', AppRoute.Checkout()],
  ])('for the route already shown (%s) returns the same Model', (url, route) => {
    const model = on(route)
    const result = update(model, Message.ChangedUrl({ url: urlOrThrow(url) }))

    expect(result.model).toBe(model)
    expect(result.commands ?? []).toEqual([])
  })

  test('for another search text moves to it', () => {
    const model = on(AppRoute.Products({ searchText: Option.none() }))
    const result = update(
      model,
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?searchText=ban') }),
    )

    expect(result.model.route).toEqual(AppRoute.Products({ searchText: Option.some('ban') }))
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
