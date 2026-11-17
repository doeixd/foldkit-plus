// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 152.1 kB measured on 2026-11-15; the ceiling is that plus about 2%, rounded up to the next 500
// bytes. The editor and the sections added for the newer primitives load when they near the
// window (`src/entry.ts`), so the start chunk holds the first five sections and no Remote, agent or
// Entity (92.9 kB brotli, in lazy chunks this budget leaves out). Before, with every section in
// the page: 206.8 kB on 2026-11-14, 208.8 kB with the list's later changes. Lazy sections alone,
// with the editor still in the start chunk, measured 219.8 kB: more chunks cost brotli its shared
// dictionary, so the editor's 64 kB was the part worth moving.
const CEILING = 155_500

clientBudget({
  name: 'authoring',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
