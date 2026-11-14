// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 184.2 kB (184,173 bytes) measured on 2026-11-12, after `style.ts` moved to
// `foldkit-mixins/vite`'s `modules` and the page stopped loading the style
// compiler (220.7 kB before); the ceiling is that plus about 2%, rounded up to
// the next 500 bytes.
// 191.0 kB on 2026-11-14, after the UI SDK work: the page draws most of the
// catalog, which gained the Dialog's focus fallback and inert exit, the form
// options on Input and its siblings, NumberField's locale parsing, the toast's
// focus and live regions, Command's key routes and the tree's typeahead. The
// ceiling is that plus about 1%.
const CEILING = 193_000

clientBudget({
  name: 'design-system',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
