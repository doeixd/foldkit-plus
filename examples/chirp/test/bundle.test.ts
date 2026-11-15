// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 236.2 kB (236,202 bytes) measured on 2026-11-10; the ceiling is that plus about 1%,
// rounded up to the next 500 bytes.
// 239.1 kB (239,065 bytes) on CI on 2026-11-12, 65 bytes over: the review
// fixes added the resolver's table of the DOM event each Foldkit handler
// registers (#523) and Remote's per-field read dates (#512). Ceiling that
// plus about 0.5%, rounded up to the next 500 bytes.
// 240,509 bytes on 2026-11-12, from 239,065: the workspace's Effect moved from
// 4.1.1 to 4.1.4, and `effect` is the package that grew (67.3 kB brotli~ in
// the report). Ceiling that plus about 0.5%, rounded up to the next 500 bytes.
// 242,385 bytes on 2026-11-14, from 240,509 at 3c601ebfb: Chirp registers Mutations, so it
// carries the write capability, and the declared-write work added to it (module by module,
// minified: `foldkit-entity` enumerate 2.8 kB, write 0.8, refine 0.6, footprint 0.6;
// `foldkit-remote` canOf 1.1, remote 0.4, mutation 0.4). Ceiling that plus about 0.5%.
// +941 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// -382 bytes: the law graph's facts left the page for `Module.graph`'s own path (#537 review): measured with and without the move in one tree on 2026-11-14,
// the page fell by that, and the ceiling with it.
// +500 (#560 review): asking again a row the server is behind on, a live patch ending a floor,
// and the read-after half moved behind the write capability, which Chirp installs: the move
// costs a page that writes what it saves one that reads (domains-plus -320). Measured with and
// without both in one tree on 2026-11-14: 245,167 against 245,663, +496, rounded up.
// +96 bytes (2026-11-14, fresh builds of 28bf08e31 and HEAD): conformed.js, 136 bytes minified, the obligations' carry
// through `SlotView`'s detach and replace (#552), which a page drawing a slot view pays.
// 2026-11-14, fresh builds of d9fa163eb (245,714) and 8cca4a535 (245,845): +131, all
// foldkit-remote's live revisions (minified: liveReads 315, store 183, liveEntry 135, wire 82,
// remote 52, outboxStore 13), never raised for. Then -1,425 (244,420): Crud.list's `live` takes
// Remote's `liveQuery` from the caller, so Crud no longer keeps liveEvents, liveReads and live
// (5.8 kB minified, `absent` below). Ceiling 245,800 + 131 - 1,425, rounded up.
// +451 (2026-11-14, `foldkit-site` built from b7b4ccd35 and from the route-code change in
// one tree: 244,368 against 244,819): `Site.codeFor`, the code a placed page carries and
// its fetch on intent (#438), which every page on `Site.routing` pays (foldkit-site's
// index 8,739 -> 9,305 minified). Ceiling raised by that, rounded up.
// -236 on 2026-11-15 (#560 review): the Site fixes made the fetch of a route's code on intent
// opt-in (`fetchCode`), measured -236 by that fix; the review's UI fixes add 26 (244,583 against
// 244,609 in one tree). Ceiling lowered by the 236.
const CEILING = 244_814

clientBudget({
  name: 'chirp',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  // It reads nothing live, so none of Remote's live reads may come with Crud.
  absent: ['foldkit-remote/live', 'foldkit-remote/liveReads', 'foldkit-remote/liveEvents'],
})
