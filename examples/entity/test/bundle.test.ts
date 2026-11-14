// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 213.4 kB (213,380 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// +500 on 2026-11-14 (#533): `Data.capability` and `Data.available` on the write
// capability, 273 bytes measured with and without them (218,816 against 218,543).
// +500 on 2026-11-14 (#542): a form judging invariants over the row it edits
// (`form.over`, the edit-time judgement) and the Crud editor that sets it, 383
// bytes measured with and without them (218,816 against 218,433).
// +500 on 2026-11-14 (#560 review): CI read 219,013 with the review's fixes
// (the editor's judged reads, the Keys and bound-slot changes); locally the page
// read 218,827, and 218,838 with the editor before its judged reads, so no single
// module of crud's is the growth: brotli over the whole page moved it.
// +918 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// -370 bytes: the law graph's facts left the page for `Module.graph`'s own path (#537 review): measured with and without the move in one tree on 2026-11-14,
// the page fell by that, and the ceiling with it.
// -1,519 on 2026-11-14 (220,522 to 219,003 in fresh builds of 8cca4a535 and the change): Crud.list's
// `live` takes Remote's `liveQuery` from the caller, so Crud no longer keeps liveEvents, liveReads
// and live (5.8 kB minified, `absent` below). Ceiling lowered by that, rounded up.
const CEILING = 219_150

clientBudget({
  name: 'entity',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  // Its lists read nothing live, so none of Remote's live reads may come with Crud.
  absent: ['foldkit-remote/live', 'foldkit-remote/liveReads', 'foldkit-remote/liveEvents'],
})
