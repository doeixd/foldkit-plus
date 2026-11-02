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

// Raw bytes, not minified. 4,828.0 kB measured on 2026-11-02, plus about 2%.
// Never raise it without saying here what the growth bought.
const CEILING = 4_925_000

test('the Worker bundle is at most the budgeted size', async () => {
  const report = await measureWorker(resolve(import.meta.dirname, '..'), 'src/worker.ts')
  record({ kind: 'size', name: 'cloudflare Worker bundle', value: report.bytes, budget: CEILING })
  const message = `${formatServerReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.bytes, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.bytes, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
