/**
 * All Results as upstream groups them: six names to a virtual row, keyed by
 * the row's first name (`groupDomainListings`, as upstream's
 * `resultsList.ts`), drawn by `foldkit-mixins-ui`'s `WindowList` in the
 * page's own scroll.
 */
import { Array, Schema, pipe } from 'effect'
import { WindowList } from 'foldkit-mixins-ui'
import { DomainListing } from './domain'

const RESULTS_GROUP_SIZE = 6

export const DomainListingGroup = Schema.Struct({
  id: Schema.String,
  listings: Schema.Array(DomainListing),
})
export type DomainListingGroup = typeof DomainListingGroup.Type

export const groupDomainListings = (
  listings: ReadonlyArray<DomainListing>,
): ReadonlyArray<DomainListingGroup> =>
  pipe(
    listings,
    Array.chunksOf(RESULTS_GROUP_SIZE),
    Array.map(listings =>
      DomainListingGroup.make({ id: Array.headNonEmpty(listings).name, listings }),
    ),
  )

export const RESULTS_LIST_ID = 'domain-results'
/**
 * Two rows of three at upstream's desktop row height, until a group is
 * measured; then the mean of those measured, since a group of six names is
 * one height on a desktop and three times it on a phone (#381).
 */
export const RESULTS_GROUP_HEIGHT_PX = 114
/** Groups drawn, and read, past each end of the viewport. */
export const RESULTS_OVERSCAN_GROUPS = 2

export const initResultsList = (): WindowList.Model =>
  WindowList.init({
    id: RESULTS_LIST_ID,
    estimatedHeight: RESULTS_GROUP_HEIGHT_PX,
    unmeasured: 'mean',
    overscan: RESULTS_OVERSCAN_GROUPS,
  })
