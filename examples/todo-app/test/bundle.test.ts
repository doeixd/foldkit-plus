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
// -321 bytes: the law graph's facts left the page for `Module.graph`'s own path (#537 review): measured with and without the move in one tree on 2026-11-14,
// the page fell by that, and the ceiling with it.
// 164,333 bytes on 2026-11-15 (162.5 kB before): the demo's own code grew, (app) src
// 6.1 to 7.9 kB brotli~ and nothing else moved. It gained the connection strip with
// its offline switch (network.ts), delete with undo, the focus Commands and the
// empty states. Ceiling that plus about 1%, rounded up to the next 500 bytes.
// 169,292 bytes on 2026-11-21, from 165,083: the application opts into `foldkit-surface/writes`
// (`machine.ts`, `surface.ts`), so a Message draws again only the Surfaces that read what it
// writes. It carries 12.2 kB minified of `metakit` (transition, residualize, node, path, eval,
// graph, kind, machine, eq, verdict, expr, core), 1.1 kB of `foldkit-surface/writes`, and
// 1.1 kB of the declarations; the verifier (`writesCheck`) stays out of the build. Ceiling that
// plus about 1%, rounded up to the next 500 bytes.
// 171,558 bytes on 2026-11-21, from 169,292: every Message is declared (`machine.ts`), and
// `update` runs the machine for each and turns the records it emits into Commands. The page
// lost `ops/residualize`, `verdict`, `expr` and `kind` (step 3 of the unification plan moved
// `can` and the reads walker off it) and gained `ops/rows` (evaluation of a fold), the list
// writes (`transitionLists`, `ops/arr`), `transitionOpaque` (the mirrors' two steps),
// `ops/str`, `ops/bool` and `ops/null`: 18.2 kB minified of `metakit` in all, which every
// page of the application runs as its `update`. Ceiling that plus about 1%, rounded up to the
// next 500 bytes.
const CEILING = 173_500

clientBudget({
  name: 'todo-app',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
