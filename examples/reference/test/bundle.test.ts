// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 241.9 kB (241,860 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// +500 on 2026-11-14 (#533): `Data.capability` and `Data.available` on the write
// capability; without them the page fit the old ceiling, with them it read 247,233.
// +500 on 2026-11-14 (#560 review): the crud editor reads each member an
// invariant reads in a Selection of its own; the page read 247,439 against
// 247,174 from the same tree with the editor before it (CI read 247,530; crud's
// index.js grew 685 bytes minified).
const CEILING = 248_000

clientBudget({
  name: 'reference',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
