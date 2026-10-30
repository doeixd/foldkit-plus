/**
 * The names a label is offered under, and All Results as the filters and
 * the sort arrange them in rows. Each is derived once and kept:
 * `WindowList.windowOf` caches a list's offsets by the identity of its
 * keys, and a scroll derives them again on every frame.
 */
import { Array } from 'effect'
import type { Domain } from '../shared/domain'
import { domainCandidates } from '../shared/domain'
import {
  type AvailabilityFilter,
  DomainListing,
  type SortOrder,
  type TldFilter,
  filterAndSortDomainListings,
  isCompleteCatalogRequired,
} from './domain'
import { groupDomainListings, type DomainListingGroup } from './resultsList.js'

export interface Filters {
  readonly tldFilter: TldFilter
  readonly availabilityFilter: AvailabilityFilter
  readonly sortOrder: SortOrder
}

export interface Arranged {
  readonly groups: ReadonlyArray<DomainListingGroup>
  /** Each group's key, in order: what the list's offsets are cached by. */
  readonly keys: ReadonlyArray<string>
  /** How many listings the rows hold. */
  readonly count: number
}

/** A few of each, so the label typed and the label settled are both kept. */
const KEPT = 8

/** A map that forgets the entry set longest ago once it holds `KEPT`. */
const kept = <A>() => {
  const entries = new Map<string, A>()
  return (key: string, make: () => A): A => {
    const held = entries.get(key)
    if (held !== undefined) return held
    const made = make()
    if (entries.size >= KEPT) entries.delete(entries.keys().next().value!)
    entries.set(key, made)
    return made
  }
}

const namesKept = kept<ReadonlyArray<string>>()

/** Every name a label is offered under, in upstream's order. */
export const namesOf = (label: string): ReadonlyArray<string> =>
  namesKept(label, () => Array.map(domainCandidates(label), ({ name }) => name))

const arrangedKept = kept<Arranged>()

/**
 * All Results for `label` under `filters`, from the prices read so far.
 * Only the Available filter and the price sorts depend on the prices, and
 * a label's prices never change, so how many are read is what keys them.
 */
export const arrangedOf = (
  label: string,
  filters: Filters,
  domains: ReadonlyArray<Domain>,
): Arranged => {
  const read = isCompleteCatalogRequired(filters.availabilityFilter, filters.sortOrder)
    ? `${domains.length}`
    : ''
  const key = `${label}|${filters.tldFilter}|${filters.availabilityFilter}|${filters.sortOrder}|${read}`
  return arrangedKept(key, () => {
    const listings = filterAndSortDomainListings(
      label,
      domains,
      filters.tldFilter,
      filters.availabilityFilter,
      filters.sortOrder,
    )
    const groups = groupDomainListings(listings)
    return { groups, keys: Array.map(groups, ({ id }) => id), count: listings.length }
  })
}

/** Every name of `label` still pending, in upstream's order. */
export const pendingOf = (label: string): ReadonlyArray<DomainListing> =>
  Array.map(domainCandidates(label), DomainListing.Pending)
