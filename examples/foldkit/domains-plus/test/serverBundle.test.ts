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
const CEILING = 3_273_000

test('the Worker bundle is at most the budgeted size', async () => {
  const report = await measureServer(resolve(import.meta.dirname, '..'))
  record({ kind: 'size', name: 'domains-plus Worker bundle', value: report.bytes, budget: CEILING })
  const message = `${formatServerReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.bytes, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.bytes, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
