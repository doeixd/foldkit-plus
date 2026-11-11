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
// 224.1 kB (224,133 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. It was 222.9 kB before the password field
// was drawn with `PasswordInput.view`, whose `strength` keeps the Meter it never draws.
const CEILING = 229_000

test('the auth client loads at most the budgeted brotli JavaScript', async () => {
  const report = await measure(resolve(import.meta.dirname, '..'))
  expect(report.total.chunks).toBeGreaterThan(0)
  // One source, one reading: a random build id moved it by up to 0.2 kB (#490).
  const again = await measure(resolve(import.meta.dirname, '..'))
  expect(again.total.brotli).toBe(report.total.brotli)
  record({
    kind: 'size',
    name: 'auth client JS, brotli',
    value: report.total.brotli,
    budget: CEILING,
  })
  const message = `${formatReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.total.brotli, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.total.brotli, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
