// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 166.0 kB (166,001 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. Raised to 171,000 on 2026-11-14: the navigation primitives'
// `keydown` is now a `Keys` route, which brings the router (its named-key table, overlap check
// and answer) into a page that places one; measured 168,200 before and 169,750 after (#554).
// +300 on 2026-11-15 (#560 review): 170,790 without the review's UI fixes and 171,269 with them in
// one tree, +479: the focus return's way back split from its trail and checked for a frame's
// realm, editable text and a summary taking focus, and a portaled panel's region read from the
// sheets through a probe (the popups carry it). Ceiling raised to the reading, rounded up.
const CEILING = 171_300

clientBudget({
  name: 'widgets',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
