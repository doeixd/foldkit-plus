// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 206.8 kB (206,805 bytes) measured on 2026-11-14; the ceiling is that plus about 2%, rounded up
// to the next 500 bytes. The page draws every section at once, so it carries Remote and the
// agent for the editor (about 64 kB brotli between them, with Entity); a page drawing only the
// primitives' sections loads none of it.
const CEILING = 211_000

clientBudget({
  name: 'authoring',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
