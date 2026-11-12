// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { formatReport, measure } from '../../../scripts/bundle-report.mjs'
import { record } from '../../../scripts/perf-report.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 136.5 kB (136,537 bytes) measured on 2026-11-11; 140.6 kB (140,579) the same
// day with column filters (#144). Almost all of the 4.0 kB is the grid's, paid
// whether a column filters or not: with every `filter` taken out of this page
// it measured 140,655. The filter union, its Messages and the form live in the
// grid's own modules; making a grid that filters nothing pay nothing needs the
// filter parts in an entry of their own, which is not built. The ceiling is
// the measure plus about 2%, rounded up to the next 500 bytes.
const CEILING = 143_500

test('the data-grid client loads at most the budgeted brotli JavaScript', async () => {
  const report = await measure(resolve(import.meta.dirname, '..'))
  expect(report.total.chunks).toBeGreaterThan(0)
  // One source, one reading: a random build id moved it by up to 0.2 kB (#490).
  const again = await measure(resolve(import.meta.dirname, '..'))
  expect(again.total.brotli).toBe(report.total.brotli)
  record({
    kind: 'size',
    name: 'data-grid client JS, brotli',
    value: report.total.brotli,
    budget: CEILING,
  })
  const message = `${formatReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.total.brotli, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.total.brotli, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
