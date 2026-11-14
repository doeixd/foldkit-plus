// @vitest-environment node
/**
 * The client's size budget (#421): the brotli JavaScript the search page loads
 * at start, from a build against the packages' `dist` as an installed
 * application gets it (`scripts/bundle-report.mjs`, which prints the table by
 * package).
 */
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { formatReport, measure } from '../../../../scripts/bundle-report.mjs'
import { record } from '../../../../scripts/perf-report.mjs'

// Brotli bytes. Lower it as #419, #420, #422 and #423 land: never raise it
// without saying here what the growth bought. 210.5 kB measured on 2026-11-02;
// 215.5 kB that evening, after #428's edge caching and the day's fixes in
// remote, mixins, primitives and ssr (#442, #450, #458 to #460), not bisected.
// The ceiling is that plus about 1%. By 2026-11-09 it read 217.5 kB, every
// step measured with the build id pinned (#490): #473's no-script TLD page
// +524, #470 +232, #489's stale reasons +460, #487's prune +547 (taken back
// when it left `Theme`), #431 +117, smaller fixes the rest. Now 216.9 kB.
// #420 froze `style.ts` into its classes: 217,518 bytes to 191,556 on
// 2026-11-10, measured one after the other in one tree.
// 193,520 bytes on CI on 2026-11-12, 20 over: the review fixes added the
// resolver's tables of each Foldkit handler's DOM event (#523) and of the CSS
// declarations a style key writes, its shorthands included.
// 196.1 kB on 2026-11-14, after the UI SDK work: `WindowList` keeps the row
// holding focus drawn, reveals a row, and can draw find-in-page stand-ins
// (its module went from 4.4 kB to 9.7 kB minified), and the Listbox and
// Combobox gained their invalid state, in-place panels and direction. The
// ceiling is that plus about 1%.
const CEILING = 198_000

test('the search page loads at most the budgeted brotli JavaScript', async () => {
  const report = await measure(resolve(import.meta.dirname, '..'))
  expect(report.total.chunks).toBeGreaterThan(0)
  // One source, one reading: a random build id moved it by up to 0.2 kB (#490).
  const again = await measure(resolve(import.meta.dirname, '..'))
  expect(again.total.brotli).toBe(report.total.brotli)
  // The page sheet's text is the server's: the browser links the file it was written to.
  expect(report.included).not.toContainEqual(expect.stringContaining('/src/server/sheet.ts'))
  // Pruning runs at build time: reading `Theme` must not bring it (#490).
  expect(report.included).not.toContainEqual(expect.stringContaining('theme/prune'))
  // `style.ts` ships as data (#420): nothing compiles a Style or calls a recipe here.
  expect(report.included).not.toContainEqual(expect.stringContaining('foldkit-mixins/styleRules'))
  expect(report.included).not.toContainEqual(expect.stringContaining('foldkit-mixins-ui/recipes/'))
  record({
    kind: 'size',
    name: 'domains-plus client JS, brotli',
    value: report.total.brotli,
    budget: CEILING,
  })
  const message = `${formatReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.total.brotli, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.total.brotli, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
