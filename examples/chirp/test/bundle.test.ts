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
const CEILING = 239_000

clientBudget({
  name: 'chirp',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
