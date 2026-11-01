// @vitest-environment node
/**
 * The cart's cookie keeps names alone (`Cart.CartCookie`), so a cart of 50
 * of the longest names a search makes still fits the cookie's 4096 bytes.
 */
import { Option, Record, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'
import { CartInCookie, init } from '../src/client/app.js'
import { Cart } from '../src/client/domain'
import { Domain } from '../src/shared/domain'
import { supportedTlds } from '../src/shared/tld'

const request = { url: 'https://domains.test/' }
const opened = init(Option.getOrThrow(fromString(request.url))).model

// The longest name a search makes: a 63-character label and the longest extension.
const tld = supportedTlds.reduce((longest, tld) => (tld.length > longest.length ? tld : longest))
const longest = (at: number) =>
  Domain.Available({
    name: `${String(at).padStart(2, '0')}${'a'.repeat(61)}.${tld}`,
    tld,
    price: 12,
    renewalPrice: 12,
    years: 1,
    isPremium: false,
  })
const cartOf = (count: number) =>
  modifyFields(opened, { cart: () => Array.from({ length: count }, (_, at) => longest(at)) })

/** The names the cookie `setCookie` writes holds, read as the server reads them. */
const namesIn = (setCookie: string) =>
  Record.get(CartInCookie.keysOf(setCookie.split(';')[0]!), CartInCookie.keys.cart).pipe(
    Option.flatMap(Schema.decodeOption(Cart.CartNames)),
  )

describe('the cart cookie', () => {
  test('holds 50 of the longest names, and reads them back', () => {
    const cart = cartOf(50).cart
    expect(cart[0]!.name).toHaveLength(63 + 1 + tld.length)
    const setCookie = Option.getOrThrow(CartInCookie.setCookie(cartOf(50), request))
    expect(namesIn(setCookie)).toEqual(Option.some(cart.map(({ name }) => name)))
  })

  test('past what the cookie holds, sets nothing', () => {
    expect(CartInCookie.setCookie(cartOf(52), request)).toEqual(Option.none())
  })

  test('holds no price, so it decodes to no cart', () => {
    const keys = CartInCookie.keysOf(Option.getOrThrow(CartInCookie.setCookie(cartOf(1), request)))
    expect(CartInCookie.decode(keys).issues.map(issue => issue.key)).toEqual(['cart'])
  })
})
