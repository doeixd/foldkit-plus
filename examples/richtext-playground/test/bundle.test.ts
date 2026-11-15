// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 266.2 kB (266,185 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// 272.8 kB on 2026-11-15: the toolbar became `formattingToolbar`, which brings its Keys behavior,
// roving tabindex, shortcut formatting and the editor's slash entries; the hand-built bar and
// `blockStyleMenu` it replaced were smaller (HEAD before the change passed at 272,000).
const CEILING = 274_000

clientBudget({
  name: 'richtext-playground',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
