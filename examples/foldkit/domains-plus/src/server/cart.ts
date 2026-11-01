/**
 * The cart a request's `cart` cookie keeps (`CartInCookie`): its names
 * alone (`Cart.CartCookie`). The cookie is the visitor's to edit, so each
 * name is priced again from the server's own sample results, and a taken or
 * unknown one is dropped.
 */
import { Array, Option, Record, Schema, pipe } from 'effect'
import { CartInCookie } from '../client/app.js'
import { Cart } from '../client/domain'
import { Domain } from '../shared/domain'
import { readDomains } from './remote.js'

const keysOf = (request: Request) => CartInCookie.keysOf(request.headers.get('cookie'))

/** More names than any cart a person keeps; short names could pack hundreds into the cookie. */
const MAX_NAMES = 50

/** The cart the request's cookie names: each name read as the server prices it, taken ones dropped. */
export const cartOf = (request: Request): Cart.Cart => {
  const names = pipe(
    Record.get(keysOf(request), CartInCookie.keys.cart),
    Option.flatMap(Schema.decodeOption(Cart.CartNames)),
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

/** Whether `request` carries a cart: its page is then that visitor's alone. */
export const hasCart = (request: Request): boolean => Object.keys(keysOf(request)).length > 0
