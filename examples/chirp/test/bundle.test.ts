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
// +290 bytes for the law graph's facts (#537), measured by building the page with and without them in one tree on 2026-11-14: each declared write's `facts` (`Mutation.write`) and the
// domain contract joining them. Ceiling raised by that, rounded up.
const CEILING = 244_500

clientBudget({
  name: 'chirp',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
