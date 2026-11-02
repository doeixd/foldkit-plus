import { Array } from 'effect'

import { Domain, domainCandidates } from './domain'

const demoPrices: Readonly<Record<string, number>> = {
  com: 12,
  dev: 12,
  app: 9.99,
  io: 34.99,
  ai: 80,
  xyz: 2.99,
  org: 9.99,
  me: 13.99,
  net: 13.5,
  tech: 7.99,
  space: 1.99,
  cloud: 7.99,
  studio: 21.99,
  sh: 33,
  design: 39.99,
  co: 25.99,
  site: 1.99,
  online: 3.99,
  store: 4.99,
  agency: 5.99,
  world: 3.99,
  run: 19.99,
  page: 9.99,
  tools: 24.99,
}

/** The sample result for one name, `label.tld`: what `makeDemoDomains(label)` gives for it. */
export const makeDemoDomain = (label: string, tld: string): Domain => {
  const domain = { name: `${label}.${tld}`, tld }
  const isUnconfirmed =
    Array.contains(['vercel', 'google', 'github', 'foldkit'], label) &&
    Array.contains(['com', 'dev'], tld)

  if (isUnconfirmed) {
    return Domain.Unconfirmed(domain)
  } else {
    const price = (Object.hasOwn(demoPrices, tld) ? demoPrices[tld] : undefined) ?? 19.99
    return Domain.Available({
      ...domain,
      price,
      renewalPrice: price,
      years: 1,
      isPremium: false,
    })
  }
}

export const makeDemoDomains = (label: string): ReadonlyArray<Domain> =>
  Array.map(domainCandidates(label), ({ tld }) => makeDemoDomain(label, tld))
