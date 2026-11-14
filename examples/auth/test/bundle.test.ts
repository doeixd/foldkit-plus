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
// 231.3 kB (231,276 bytes) measured on 2026-11-14 with the account page (#438),
// whose bodies are a `Bundle.lazy` chunk: 223.5 kB before it. The page, its
// placement and `preload` cost 2.2 kB (225.7 kB with the page eager); the
// other 5.6 kB is the split. Rolldown groups the boot graph by which dynamic
// chunks import each module, and the bodies' imports differ from Yielded's
// client's, so the one shared chunk becomes three; deferring the 0.5 kB
// bodies costs more than it saves here, and the example keeps it to show the
// route-code path.
const CEILING = 236_000

clientBudget({
  name: 'auth',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
