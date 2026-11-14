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
// rounded up to the next 500 bytes.
// 175.3 kB (175,333 bytes) on 2026-11-13: three more sections on the page (the search field,
// the dismissible list, the leaving rows) with the SearchField widget, its recipe and the
// per-row Presence collection; the ceiling is again that plus about 2%.
const CEILING = 179_000

clientBudget({
  name: 'widgets',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
