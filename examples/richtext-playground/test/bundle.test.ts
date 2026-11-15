// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 203.8 kB measured on 2026-11-15 with `node scripts/bundle-report.mjs`; the ceiling is that plus
// about 2%, rounded up to the next 500 bytes. Before this, shiki's grammars, TextMate engine and
// regex compiler were in the start chunk (@shikijs/* and oniguruma: about 408 kB minified, 70 kB
// brotli, of 273.6 kB); they are a lazy chunk now (`src/highlight.ts`, 71.6 kB brotli). The
// shipped `formattingToolbar` is `foldkit-mixins-richtext`'s 6.8 kB brotli of that start chunk.
const CEILING = 208_000

clientBudget({
  name: 'richtext-playground',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  // Grammars load after the first frame (`src/highlight.ts`), in a chunk of their own.
  absent: ['@shikijs/langs/typescript', '@shikijs/core/index', 'foldkit-richtext-code-shiki/index'],
})
