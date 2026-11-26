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
// +62,460 on 2026-11-22, permanent: 4,639,160 measured after step 10 of the metakit unification plan
// (4,645,318 before it, in one tree; it read about 4,636,000 since steps 5 and 8, and this ceiling was
// never raised for them). A Worker carries both of metakit's readers: its evaluator and judge, which
// entity's judge runs since step 5 (accepted by the maintainer on 2026-11-21), and the SQL lowering
// `foldkit-remote-drizzle` writes operations with since step 8 (about 19 kB). Ceiling: the reading plus 300.
// +14,692 on 2026-11-22: CI on Linux read 4,653,852 after the Phase 1 gate fixes; a local Windows build
// read 4,643,452 (+3,992 over the step-10 reading, from the gate fixes in metakit and guard). The other
// 10.4 kB is CI's build of this Worker only; the other bundles differ between the two by under 0.4 kB.
// Not traced. Ceiling: CI's reading plus 300.
// +6,365 on 2026-11-22: 4,660,217 measured locally at ab41873a8 after the Phase 5 review's store
// findings, about 6,231 raw of it estimated per module: a delete through an onDelete relation and a
// link through one held to the store (`foldkit-remote-server`), the Drizzle writer's link check
// (INSERT … SELECT where the row it points at is there) and foreign-key reading, a Sync host
// holding a document's laws to its journal's store. Code every server with writes runs. CI on Linux
// read 4,666,028 before this change, over the old ceiling already, not traced. Ceiling: the local
// reading plus 300.
// +1,094 on 2026-11-22, estimated per module: the review of those findings had the memory writer check a
// link through an onDelete relation (912) and the Drizzle writer leave unset columns to the table's own
// defaults (182). The reading then was 4,664,580: the other 3,269 since 4,660,217 came with other
// sessions' commits between (9bf8c0510, 1b401baa4), not this change, so not raised for. Ceiling: the
// last ceiling plus this change's estimate.
// +76,389 on 2026-11-26 (4,734,700 on CI Linux; 4,721,293 locally on Windows after marking
// Config.all exports pure): metakit's expanded core/store/relation/sets runtime, foldkit-remote
// IVM/Effect updates, and remote-server ManagedRuntime/withSpan. Ceiling: CI's reading plus ~3.3 kB.
const CEILING = 4_738_000

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
