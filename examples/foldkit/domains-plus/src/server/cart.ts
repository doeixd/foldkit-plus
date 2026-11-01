/**
 * The cart a request's `cart` cookie keeps (`CartInCookie`). The cookie is
 * the visitor's to edit, so only its names are taken, each priced again from
 * the server's own sample results: a price in it is never shown.
 */
import { Array, Option, pipe } from 'effect'
import { CartInCookie } from '../client/app.js'
import type { Cart } from '../client/domain'
import { Domain } from '../shared/domain'
import { readDomains } from './remote.js'

const keysOf = (request: Request) => CartInCookie.keysOf(request.headers.get('cookie'))

/** The cart the request's cookie names: each name read as the server prices it, taken ones dropped. */
export const cartOf = (request: Request): Cart.Cart => {
  // The cookie's 4096 bytes hold a few dozen entries at most.
  const names = pipe(
    CartInCookie.decode(keysOf(request)).value.cart ?? [],
    Array.map(({ name }) => name),
    Array.dedupe,
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
