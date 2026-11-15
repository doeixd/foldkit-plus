// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 136.5 kB (136,537 bytes) measured on 2026-11-11; 140.6 kB (140,579) the same
// day with column filters (#144). Almost all of the 4.0 kB is the grid's, paid
// whether a column filters or not: with every `filter` taken out of this page
// it measured 140,655. The filter union, its Messages and the form live in the
// grid's own modules; making a grid that filters nothing pay nothing needs the
// filter parts in an entry of their own, which is not built. The ceiling is
// the measure plus about 2%, rounded up to the next 500 bytes.
// 2026-11-14, U-WP1 (#551, #556, #531): foldkit-mixins' resolver.js grew 814
// bytes minified (both contributors named in every ownership diagnostic, and a
// child attribute's Mount composed through its own boundary) and behavior.js
// 406 (each Behavior's attachment metadata, which describe reads), measured by
// minifying the two sources before and after. The page then measured 143,531.
const CEILING = 144_000

clientBudget({
  name: 'data-grid',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
