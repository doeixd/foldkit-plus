// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 213.4 kB (213,380 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// +500 on 2026-11-14 (#533): `Data.capability` and `Data.available` on the write
// capability, 273 bytes measured with and without them (218,816 against 218,543).
// +500 on 2026-11-14 (#542): a form judging invariants over the row it edits
// (`form.over`, the edit-time judgement) and the Crud editor that sets it, 383
// bytes measured with and without them (218,816 against 218,433).
// +500 on 2026-11-14 (#560 review): CI read 219,013 with the review's fixes
// (the editor's judged reads, the Keys and bound-slot changes); locally the page
// read 218,827, and 218,838 with the editor before its judged reads, so no single
// module of crud's is the growth: brotli over the whole page moved it.
const CEILING = 219_500

clientBudget({
  name: 'entity',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
