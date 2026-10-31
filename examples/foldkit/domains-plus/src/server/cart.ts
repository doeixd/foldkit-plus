/**
 * The cart a page without scripts keeps between requests, in a cookie: the
 * names only, each priced again from the server's own sample results when
 * read, so a cookie cannot carry a price. A scripted page keeps its cart in
 * the Model alone, as upstream's, and writes no cookie.
 */
import { Array, Option, Record, String, pipe } from 'effect'
import { Cookies } from 'effect/http'
import type { Cart } from '../client/domain'
import { Domain } from '../shared/domain'
import { readDomains } from './remote.js'

const COOKIE = 'cart'
/** More names than any cart a person keeps; a cookie naming more is cut here. */
const MAX_NAMES = 50
/** A name holds no `|`, which RFC 6265 allows in a cookie's value where it does not allow `,`. */
const SEPARATOR = '|'

/** The cart the request's cookie names: each name read as the server prices it, taken ones dropped. */
export const cartOf = (request: Request): Cart.Cart => {
  const names = pipe(
    Cookies.parseHeader(request.headers.get('cookie') ?? ''),
    Record.get(COOKIE),
    Option.map(String.split(SEPARATOR)),
    Option.getOrElse((): ReadonlyArray<string> => []),
    Array.dedupe,
    Array.take(MAX_NAMES),
  )
  const read = new Map(readDomains(names).map(({ id, values }) => [id, values]))
  return Array.flatMap(names, name =>
    pipe(
      Option.fromNullishOr(read.get(name)),
      Option.filter(Domain.guards.Available),
      Option.map(({ name, tld, price, renewalPrice, years, isPremium }) =>
        Domain.Available({ name, tld, price, renewalPrice, years, isPremium }),
      ),
      Option.toArray,
    ),
  )
}

/** Whether `request` carries a cart cookie: its page is then that visitor's alone. */
export const hasCart = (request: Request): boolean =>
  Option.isSome(Record.get(Cookies.parseHeader(request.headers.get('cookie') ?? ''), COOKIE))

/** The `set-cookie` that keeps `cart` for a year, or clears it when empty. */
export const cartCookie = (cart: Cart.Cart, secure: boolean): string =>
  [
    `${COOKIE}=${Array.map(cart, ({ name }) => name).join(SEPARATOR)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    cart.length === 0 ? 'Max-Age=0' : 'Max-Age=31536000',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
