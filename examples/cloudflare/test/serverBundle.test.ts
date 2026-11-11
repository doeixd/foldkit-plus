// @vitest-environment node
/**
 * The Worker's size budget (#416): `src/worker.ts` bundled as Wrangler does
 * it, against the packages' `dist` (`scripts/bundle-report.mjs --worker`,
 * which prints the table by package). A new isolate parses and evaluates all
 * of it before its first request.
 */
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { formatServerReport, measureWorker } from '../../../scripts/bundle-report.mjs'
import { record } from '../../../scripts/perf-report.mjs'

// Raw bytes, not minified. 4,410.2 kB measured on 2026-11-11, plus about 1.7%.
// The ceiling fell 413.8 kB from 4,898.8: the Worker called `Sync.forApplication`,
// and the `Sync` namespace object kept every client module (mount, transport
// sockets, presence, IndexedDB, LWW) and what they import, 492 kB in a fresh
// build. It imports `forApplication` by name now. Since the 4,817.6 kB of
// 2026-11-03, the Sync journal's refusals and typed upcasting (#190) added
// 14.5 kB of real server code (`foldkit-sync` `sync`, `journal`, `refusal`,
// `migrations`, `errors`).
// Never raise it without saying here what the growth bought.
const CEILING = 4_485_000

test('the Worker bundle is at most the budgeted size', async () => {
  const report = await measureWorker(resolve(import.meta.dirname, '..'), 'src/worker.ts')
  record({ kind: 'size', name: 'cloudflare Worker bundle', value: report.bytes, budget: CEILING })
  const message = `${formatServerReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.bytes, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.bytes, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
