// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 222.2 kB (222,247 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// +36 bytes over 227,000 on 2026-11-14 (226,702 at 28bf08e31, fresh builds of both): conformed.js, 137 bytes minified,
// the obligations' carry through `SlotView`'s detach and replace (#552), and a few bytes of Schema and Sync.
const CEILING = 227_500

clientBudget({
  name: 'pages',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
