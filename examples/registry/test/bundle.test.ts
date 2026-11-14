// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 243.6 kB (243,616 bytes) measured on 2026-11-11; 249.5 kB (249,539) the same
// day with column filters (#144): about 4 kB of it the grid's, which any grid
// pays whether a column filters or not (see examples/data-grid's budget), and
// the rest the page's filter input and price bounds. The ceiling is the
// measure plus about 2%, rounded up to the next 500 bytes.
// 2026-11-14, U-WP1 (#551, #556, #531): foldkit-mixins' resolver.js grew 814
// bytes minified (both contributors named in every ownership diagnostic, and a
// child attribute's Mount composed through its own boundary) and behavior.js
// 406 (each Behavior's attachment metadata, which describe reads), measured by
// minifying the two sources before and after. The page then measured 255,014.
const CEILING = 255_500

clientBudget({
  name: 'registry',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
