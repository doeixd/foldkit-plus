// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 283.9 kB (283,892 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. Raised to 293,000 on 2026-11-14: the navigation primitives'
// `keydown` is now a `Keys` route, which brings the router (its named-key table, overlap check
// and answer) into a page that places one; measured 289,727 before and 291,338 after (#554).
// Raised to 293,400 on 2026-11-14 for a live stream naming the revisions it holds (A-WP9): the page
// keeps Remote's live capability and live entry whether it reads live or not, and measured 292,749
// without it and 293,110 with it in one tree (`LiveRequirement.revisions` on the wire, the held
// revisions worked out, the field passed on by the RPC client); +361, rounded up.
const CEILING = 293_400

clientBudget({
  name: 'cms',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  childProcess: true,
})
