// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { formatReport } from '../../../scripts/bundle-report.mjs'
import { record } from '../../../scripts/perf-report.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 283.9 kB (283,892 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
const CEILING = 290_000

// The build runs in a process of its own: this config imports `foldkit-ssr/vite`, which Vite loads
// with Node, and inside Vitest Node resolved it to its TypeScript source and could not load it.
const measure = (example: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'cms-bundle-'))
  const json = join(dir, 'report.json')
  try {
    execFileSync(
      process.execPath,
      [resolve(import.meta.dirname, '../../../scripts/bundle-report.mjs'), example, '--json', json],
      { stdio: 'pipe' },
    )
    return JSON.parse(readFileSync(json, 'utf8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the cms client loads at most the budgeted brotli JavaScript', () => {
  const report = measure(resolve(import.meta.dirname, '..'))
  expect(report.total.chunks).toBeGreaterThan(0)
  // One source, one reading: a random build id moved it by up to 0.2 kB (#490).
  const again = measure(resolve(import.meta.dirname, '..'))
  expect(again.total.brotli).toBe(report.total.brotli)
  record({
    kind: 'size',
    name: 'cms client JS, brotli',
    value: report.total.brotli,
    budget: CEILING,
  })
  const message = `${formatReport(report)}\n\nbudget: ${CEILING} bytes`
  expect(report.total.brotli, message).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(report.total.brotli, message).toBeGreaterThan(CEILING * 0.9)
}, 300_000)
