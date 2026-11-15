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
// 2026-11-14, U-WP1 (#551, #556, #531): foldkit-mixins' resolver.js grew 814
// bytes minified (both contributors named in every ownership diagnostic, and a
// child attribute's Mount composed through its own boundary) and behavior.js
// 406 (each Behavior's attachment metadata, which describe reads), measured by
// minifying the two sources before and after. The page then measured 194,714.
// +1146 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// -189 bytes (#560 review): the read-after half of #544 (tokens, floors, waits) moved behind the
// write capability, which this page never installs, -320; asking again a row the server is behind
// on, +131. Measured with and without both in one tree on 2026-11-14 (195,829 against 195,640).
// +58 bytes for `policies` on `Data.wiring` (#236), measured in one tree on 2026-11-14 with and
// without it (197,919 and 197,977): every subscriptions call goes through one function taking
// each key's policy. The page was over the ceiling already from other growth (197,919), which
// this does not cover.
// +1,481 on 2026-11-15 (#560 review): measured 197,500. 197,185 without the review's UI fixes and
// 197,500 with them in one tree, +315 (FocusScope's way back without the trail, but checked for a
// frame's realm; a portaled panel's region read from the sheets through a probe). The other
// 1,166 is U-WP14 and the A3, F2 and C2 fixes the investigation attributed, which put the page
// over before the review. Ceiling raised to the reading, rounded up.
// 199,053 on 2026-11-14, after merging main: +1,553 over main's 197,500, from this branch's
// kept `WindowList` work (the row holding focus kept drawn, revealing a row, find-in-page
// stand-ins; 4.4 kB to 9.7 kB minified) that the page draws. The ceiling is that plus about 1%.
// -500 on 2026-11-15: 198,986 after the theme's storage streams left the `Theme` object (it read
// 199,053 with them); the ceiling is that plus about 1%, rounded up.
const CEILING = 201_000

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
