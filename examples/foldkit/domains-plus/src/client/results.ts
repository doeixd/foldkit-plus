/**
 * The names a label is offered under, as All Results lists and groups them.
 * Each is derived once per label and kept: `WindowList.windowOf` caches a
 * list's offsets by the identity of its keys, and a scroll derives them
 * again on every frame.
 */
import { Array } from 'effect'
import { domainCandidates } from '../shared/domain'
import { DomainListing } from './domain'
import { groupDomainListings, type DomainListingGroup } from './resultsList.js'

export interface LabelResults {
  readonly names: ReadonlyArray<string>
  readonly groups: ReadonlyArray<DomainListingGroup>
  /** Each group's key, in order: what the list's offsets are cached by. */
  readonly keys: ReadonlyArray<string>
}

/** Labels kept: the one typed and the one settled, and a few before them. */
const KEPT = 8
const kept = new Map<string, LabelResults>()

export const resultsOf = (label: string): LabelResults => {
  const held = kept.get(label)
  if (held !== undefined) return held
  const listings = Array.map(domainCandidates(label), DomainListing.Pending)
  const groups = groupDomainListings(listings)
  const results = {
    names: Array.map(listings, ({ name }) => name),
    groups,
    keys: Array.map(groups, ({ id }) => id),
  }
  if (kept.size >= KEPT) kept.delete(kept.keys().next().value!)
  kept.set(label, results)
  return results
}
