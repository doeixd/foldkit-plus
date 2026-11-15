// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 351.5 kB (351,459 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// 362.0 kB (362,001 bytes) on 2026-11-14, after merging main: the same kept package work that
// raised the widgets page by 3,524 bytes (the SearchField widget, WindowList's larger follower,
// Resizable, Sidebar), +3,501 over the old ceiling; the ceiling is that plus about 2%.
const CEILING = 369_500

clientBudget({
  name: 'site',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  childProcess: true,
})
