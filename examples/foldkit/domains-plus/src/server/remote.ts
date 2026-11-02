/**
 * The prices, served by `foldkit-remote-server` at `/remote`. Every name is
 * read by id: the server finds its label and extension, derives the sample
 * result upstream's `makeDemoDomains` gives for that one name, and asks
 * nothing outside. A name that is no label under a known extension answers
 * nothing, which the client reads as `NotFound`.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import { pageReader, serveFetch } from 'foldkit-remote-server/fetch'
import { makeDemoDomain } from '../shared/demoDomains'
import { store } from './cache.js'
import { Domain as DomainCase, DomainLabel, domainTlds } from '../shared/domain'
import { Domain, MAX_BODY_BYTES, MAX_IDS_PER_READ } from '../shared/entity'

const isLabel = Schema.is(DomainLabel)
const tlds: ReadonlySet<string> = new Set(domainTlds)

/**
 * A name's label and extension, when it is a label under an extension the
 * demo knows. A label holds no dot, so the extension is all after the first
 * (`co.uk`).
 */
const partsOf = (name: string): Option.Option<{ label: string; tld: string }> => {
  const dot = name.indexOf('.')
  const label = name.slice(0, dot)
  const tld = name.slice(dot + 1)
  return dot > 0 && isLabel(label) && tlds.has(tld) ? Option.some({ label, tld }) : Option.none()
}

/** A sample result as the stored row: every case's fields, null where its case has none. */
const rowOf = (domain: DomainCase) =>
  DomainCase.match(domain, {
    Available: ({ name, tld, price, renewalPrice, years, isPremium }) => ({
      id: name,
      values: { _tag: 'Available', id: name, name, tld, price, renewalPrice, years, isPremium },
    }),
    Unconfirmed: ({ name, tld }) => ({
      id: name,
      values: {
        _tag: 'Unconfirmed',
        id: name,
        name,
        tld,
        price: null,
        renewalPrice: null,
        years: null,
        isPremium: null,
      },
    }),
  })

/**
 * The rows for `ids`, each made from its name alone: a read costs what it
 * names, never a label's whole catalog, since a cart cookie names whatever
 * a visitor writes in it.
 */
export const readDomains = (ids: ReadonlyArray<string>) =>
  ids.flatMap(id =>
    Option.toArray(partsOf(id)).map(({ label, tld }) => rowOf(makeDemoDomain(label, tld))),
  )

export const server = RemoteServer.make({
  entities: [RemoteServer.entity(Domain, { read: ({ ids }) => Effect.succeed(readDomains(ids)) })],
})

/** One reader, the public: every read of a price is kept, answered as no one. */
export const served = {
  server,
  resolvePrincipal: () => Effect.void,
  layer: () => Layer.empty,
  maxIdsPerEntity: MAX_IDS_PER_READ,
  cache: { store, visitor: undefined },
}

/** `/remote`, as the Worker and the dev server answer it. */
export const serveRemote = serveFetch({ ...served, maxBodyBytes: MAX_BODY_BYTES })

/** The same server read in this process, for a page's render: no request crosses HTTP. */
export const readPrices = (request: Request) => pageReader(served)(request, undefined)
