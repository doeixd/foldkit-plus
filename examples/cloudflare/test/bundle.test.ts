// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 213.3 kB (213,305 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. 218.5 kB measured on 2026-11-13, against 216.4 kB
// at the same example before the declared-write work: this page registers Mutations, so
// it carries the write capability, and the write's `becomes` enumeration
// (`foldkit-entity` enumerate, footprint, refine: 4.0 kB minified, 2.1 kB brotli) and
// `Data.can` (canOf: 1.1 kB minified) are that capability's own. Read-only pages carry
// none of it (domains-plus is back at its 194.5 kB budget). The ceiling is 218.5 kB
// plus about 2%.
const CEILING = 223_000

clientBudget({
  name: 'cloudflare',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
