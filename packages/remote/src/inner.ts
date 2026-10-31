/**
 * What `foldkit-remote/why` reads of a bound domain that its public face does
 * not offer: how the domain reads its lists, as one `WhyReader` per Model.
 * Held beside the domain rather than on it, so a page that never explains a
 * read keeps none of the explanation code.
 */
import type { WhyReader } from './whyReasons.js'

const readers = new WeakMap<object, (model: never) => WhyReader>()

/** Records how `domain` reads its lists; `bindDomain` calls it once per domain. */
export const withWhyReader = <Domain extends object, AppModel>(
  domain: Domain,
  reader: (model: AppModel) => WhyReader,
): Domain => {
  readers.set(domain, reader)
  return domain
}

/** How a domain `Remote.make` bound reads its lists. */
export const whyReaderOf = <AppModel>(domain: object): ((model: AppModel) => WhyReader) => {
  const reader = readers.get(domain)
  if (reader === undefined) throw new Error('Remote: explain a domain made by Remote.make')
  return reader as (model: AppModel) => WhyReader
}
