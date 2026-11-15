// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 223.2 kB (223,245 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. It was 222.9 kB before the password field
// was drawn with `PasswordInput.view` (its Caps Lock hint and requirements), and
// 224.1 kB while PasswordInput imported the Meter for a `strength` this page never draws.
// 226.2 kB (226,226 bytes) measured on 2026-11-15 with the account page (#438),
// whose bodies are a `Bundle.lazy` chunk: 223.5 kB before it, 225.7 kB with the
// page eager. Left to rolldown's own grouping it was 231.3 kB: it groups the boot
// graph by which dynamic chunks import each module, the bodies' imports differ
// from Yielded's client's, and the one shared chunk became three. `vite.config.ts`
// puts every module two chunks share in one `boot` chunk, so the lazy page costs
// its own 0.5 kB of declaration and placement, and `boot.test.ts` holds the loader
// out of it.
// +500 on 2026-11-15: origin/main (1bbd87d15) read 226,448, this branch 226,767. Not attributed
// to one module: the dumps of both builds differed by under 100 bytes in every package the
// page's first chunk reads, so it is the chunks' brotli moving with the component growth
// (input, toggle, field) of the other pages.
const CEILING = 227_000

clientBudget({
  name: 'auth',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
