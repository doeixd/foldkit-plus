// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 156.5 kB (156,512 bytes) measured on 2026-11-10. 158,655 on 2026-11-12, from
// 158,189 the commit before: server-only Messages (#190) grew `foldkit-sync`'s
// part by 1.4 kB minified, 0.4 kB brotli (its readers, the serverOnly set, two
// error classes), and nothing else moved. The ceiling is that plus about 1%,
// rounded up to the next 500 bytes.
// 160,661 bytes on 2026-11-12: the workspace's Effect moved from 4.1.1 to
// 4.1.4, and `effect` is the package that grew (57.2 kB brotli~ in the report).
// Ceiling that plus about 1%, rounded up to the next 500 bytes.
// +397 bytes for the law graph's facts (#537), measured by building the page with and without them in one tree on 2026-11-14: the Sync contract's `facts` (a law per declared law, a
// transition per durable tag), which `Module.graph` asks for. Ceiling raised by that, rounded up.
const CEILING = 163_000

clientBudget({
  name: 'todo-app',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
