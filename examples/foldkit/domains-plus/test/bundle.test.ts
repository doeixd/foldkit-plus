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
// The ceiling is that plus about 1%.
const CEILING = 217_500

test('the search page loads at most the budgeted brotli JavaScript', async () => {
  const report = await measure(resolve(import.meta.dirname, '..'))
  expect(report.total.chunks).toBeGreaterThan(0)
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
