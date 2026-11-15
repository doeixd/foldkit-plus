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
// 4,500.2 kB measured on 2026-11-13, 32.8 kB up from 4,467.4 kB before the declared-write
// work, all of it the features' own: `foldkit-entity` +15.6 kB (a Write's `becomes`
// enumeration, footprint and `Entity.refine` states), `foldkit-remote-server` +8.5 kB
// (`RemoteServer.memoryWriter`, held by the namespace object this Worker reads
// `RemoteServer.write` through), `foldkit-remote` +4.7 kB (the write judges, `Data.can`),
// `foldkit-sync` +2.6 kB (laws). The ceiling is 4,500.2 kB plus about 1.7%.
// Never raise it without saying here what the growth bought.
const CEILING = 4_577_000

// The replica side of `foldkit-sync`. A server reaches `Sync` through the namespace
// object, or a shared module does, and the bundler then keeps all of these.
const SYNC_CLIENT_MODULES = ['mount', 'indexedDb', 'presence', 'lww']

test('the Worker bundle is at most the budgeted size', async () => {
  const report = await measureWorker(resolve(import.meta.dirname, '..'), 'src/worker.ts')
  const client = report.files.filter(file =>
    SYNC_CLIENT_MODULES.some(name => file.startsWith('foldkit-sync/') && file.includes(`${name}.`)),
  )
  expect(client, 'the Worker bundles foldkit-sync client modules: import by name').toEqual([])
  record({ kind: 'size', name: 'cloudflare Worker bundle', value: report.bytes, budget: CEILING })
  const message = `${formatServerReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.bytes, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.bytes, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
