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

// Brotli bytes. Lower it as #419, #420, #422 and #423 land: never raise it
// without saying here what the growth bought. 210.5 kB measured on 2026-11-02,
// plus about 2%.
const CEILING = 215_000

test('the search page loads at most the budgeted brotli JavaScript', async () => {
  const report = await measure(resolve(import.meta.dirname, '..'))
  expect(report.total.chunks).toBeGreaterThan(0)
  const message = `${formatReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.total.brotli, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.total.brotli, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
