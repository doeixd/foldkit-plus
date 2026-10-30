/**
 * The prices, served by `foldkit-remote-server` at `/remote`. Every name is
 * read by id: the server finds its label and extension, derives the sample
 * result upstream's `makeDemoDomains` gives for that label, and asks
 * nothing outside. A name that is no label under a known extension answers
 * nothing, which the client reads as `NotFound`.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'
import { makeDemoDomains } from '../shared/demoDomains'
import { Domain as DomainCase, DomainLabel } from '../shared/domain'
import { Domain, MAX_BODY_BYTES, MAX_IDS_PER_READ } from '../shared/entity'

const isLabel = Schema.is(DomainLabel)

/** The label a name is read under, when it is one; its extension is checked by the results. */
const labelOf = (name: string): Option.Option<string> => {
  const label = name.slice(0, name.indexOf('.'))
  return isLabel(label) ? Option.some(label) : Option.none()
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

/** The rows for `ids`, each label's sample results made once. */
export const readDomains = (ids: ReadonlyArray<string>) => {
  const byLabel = new Map<string, Array<string>>()
  for (const id of ids) {
    const label = labelOf(id)
    if (Option.isNone(label)) continue
    const wanted = byLabel.get(label.value)
    if (wanted === undefined) byLabel.set(label.value, [id])
    else wanted.push(id)
  }
  return [...byLabel].flatMap(([label, wanted]) => {
    const results = new Map(makeDemoDomains(label).map(domain => [domain.name, domain]))
    return wanted.flatMap(id => Option.toArray(Option.fromNullishOr(results.get(id))).map(rowOf))
  })
}

export const server = RemoteServer.make({
  entities: [RemoteServer.entity(Domain, { read: ({ ids }) => Effect.succeed(readDomains(ids)) })],
})

/** `/remote`, as the Worker and the dev server answer it: one reader, the public. */
export const serveRemote = serveFetch({
  server,
  resolvePrincipal: () => Effect.void,
  layer: () => Layer.empty,
  maxIdsPerEntity: MAX_IDS_PER_READ,
  maxBodyBytes: MAX_BODY_BYTES,
})
