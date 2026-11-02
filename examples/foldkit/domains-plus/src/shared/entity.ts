/**
 * The domain as `foldkit-remote` reads it: a candidate name is an Entity
 * whose id is the name, one of upstream's two cases. The cases spread
 * upstream's own field sets (`domain.ts`), so a `Quote` reads back as the
 * union upstream's listing functions take.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { EdgeCache } from 'foldkit-remote'
import { DomainName, DomainQuote } from './domain'

/** How long a price, and a page of them, is served as it was read. */
export const FRESH_FOR = '60 seconds'

/**
 * A name's price is the same for every visitor, so a server may keep a read
 * of it for `FRESH_FOR` (`EdgeCache.of`); the server proves the read public.
 */
export const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, ...DomainName.fields, ...DomainQuote.fields },
  Unconfirmed: { id: Schema.String, ...DomainName.fields },
}).pipe(Entity.annotate(EdgeCache.of({ maxAge: FRESH_FOR })))

/** Everything a card or a row shows of a name: its case, its price and its terms. */
export const Quote = Entity.select(Domain, {
  _tag: true,
  name: true,
  tld: true,
  price: true,
  renewalPrice: true,
  years: true,
  isPremium: true,
})

/** The most ids one read may name: the whole catalog, with room. */
export const MAX_IDS_PER_READ = 1000

/**
 * The largest request body the endpoint takes, in bytes. Upstream's RPC
 * took 1 KiB of `{ label, offset, limit }`; a read by name carries the
 * names, and the whole catalog (556 names, the Available filter and the price
 * sorts) is about 12 KB of them with the fields.
 */
export const MAX_BODY_BYTES = 32 * 1024
