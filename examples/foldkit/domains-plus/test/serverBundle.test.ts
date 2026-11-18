// @vitest-environment node
/**
 * The Worker's size budget (#416): the bytes `wrangler deploy` uploads, from
 * the Vite server build bundled as Wrangler does it, as an installed
 * application gets it (`scripts/bundle-report.mjs --server`, which prints the
 * table by package). A new isolate parses and evaluates all of it before its
 * first request.
 */
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { formatServerReport, measureServer } from '../../../../scripts/bundle-report.mjs'
import { record } from '../../../../scripts/perf-report.mjs'

// Raw bytes, not minified. 3,175.4 kB measured on 2026-11-11, plus about 2%.
// Never raise it without saying here what the growth bought. From 3,136.1 kB
// at 85e0f67 (2026-11-02) it grew steadily, about 39 kB over 337 commits with
// no step above 17 kB: the SSR loader and redirect, Remote and Surface
// features the page uses. Not an accident in one commit.
// +9284 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// -610 bytes (#560 review): the read-after half of #544 moved behind the write capability, which
// the Worker's domain never installs, and the wait on a row the server is behind on was added;
// measured with and without both in one tree on 2026-11-14 (3,245,724 against 3,245,114).
// +489 bytes for `policies` on `Data.wiring` (#236), measured in one tree on 2026-11-14 with and
// without it (3,264,148 and 3,264,637). The Worker was over the ceiling already from other
// growth (3,264,148), which this does not cover.
// +10,371 on 2026-11-15 (#560 review): measured 3,259,503. 3,257,666 without the review's UI fixes
// and 3,259,503 with them in one tree, +1,837 raw (their doc comments count here). The Worker was
// over by 8,487 before them (3,264,148 at #236's measure, since cut by the Site and SSR fixes),
// from the wave's A3, F2 and C2 fixes and the growth noted above. Ceiling raised to the reading.
// +13,450 on 2026-11-14, after merging main: measured 3,272,832, +13,282 over main's reading. The
// Worker renders the page, so it carries this branch's kept `WindowList` growth (the focus-holding
// row, reveal, find-in-page stand-ins) and the widgets' source as main's primitives reshaped them;
// not bisected between the two. Ceiling raised to the reading, rounded up.
// +1,500 on 2026-11-15, the widget round on this branch: 3,274,129 against 3,271,654 for main
// (ab3421ba6) in fresh builds of both, +2,475 raw. It read 3,292,532 until two fixes: the
// Sheet's handle keys took `Behaviors.Keys` and `RovingTabindex` into every page that draws a
// Sheet, one-point sheets included (-11.8 kB), and the Select
// and Listbox recipes imported `filledHover` from recipes/field.js, which brought the Input and
// Textarea recipes and their slots (input.js, textarea.js) into a Worker that draws neither
// (-6.6 kB). What remains, by module (raw): sheet.js +1,582 (the handle's key handler and
// separator attributes, and `SnappedTo`), unmapped +429 and recipes/design.js +204 (`filledHover`),
// attr.js +115 and dialog.js +104 (the handle's slot attributes). Ceiling raised to the reading,
// rounded up.
// +7,500 on 2026-11-16: measured 3,281,613 at 028970eaf. Measured parts: +533 for `evaluate`
// refusing an uncollated text order (#569, with and without in one tree) and +2,465 for the
// mutation answer cut to what its caller may read (#578, `readablePatches`, measured against
// the commit before it). The other 4,100 or so is the server's error path from #573 and #575
// (`tell`, `report`, incident ids, the fixed 401 and 403 reasons, and their doc comments, which
// count here), not bisected commit by commit. Ceiling raised to the reading, rounded up.
// +500 on 2026-11-17: measured 3,282,293. The popup rows' inks now come from their panel
// (three `popup.plain-*` tokens and the panel's private properties, 73212841e), which the
// Worker's rendered page carries: 286 of it by a build without the default-look changes,
// 7 more with them.
// +500 on 2026-11-17: CI measured 3,282,566 once a tint and a raised surface were written in
// OKLab (f6661ddf9), which Chrome 157 needs to keep their hue: 273 bytes more than the reading
// above, in the palette text the rendered page carries. Ceiling raised to the reading, rounded up.
// +4,000 on 2026-11-17: CI passed at b606a2c61 under this ceiling (its job prints no size on a pass); a local
// build of HEAD reads 3,286,786. At b1ae69ada CI read 3,283,600 where a local build read 3,286,845, so CI's HEAD is
// about 3,286,5xx. HEAD reads 3,286,636 on CI by the offset of a local build of b1ae69ada (3,286,845
// here against CI's 3,283,600), 4,300 over the last green main's 3,282,3xx. Built in separate trees: +1,272
// from `recipe.add` on every recipe and the default look's theme text, and +3,037 from #593, whose
// `runtimeJson` codec is Remote's Model schema and so is in the Worker too. No module the Worker did not
// carry was added. Ceiling raised to that, rounded up.
// -20,000 on 2026-11-18: that ceiling was an estimate, and the Worker now reads 3,266,801 in a local
// build (CI, by the offset above, about 3,263,5xx), the factory families' work (#589) having taken
// more out than it added. Ceiling: the local reading, rounded up.
const CEILING = 3_267_000

test('the Worker bundle is at most the budgeted size', async () => {
  const report = await measureServer(resolve(import.meta.dirname, '..'))
  record({ kind: 'size', name: 'domains-plus Worker bundle', value: report.bytes, budget: CEILING })
  const message = `${formatServerReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.bytes, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.bytes, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
