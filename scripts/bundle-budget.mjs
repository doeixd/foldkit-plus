/**
 * The client size budget every example's `test/bundle.test.ts` calls: build the
 * example twice from one source, require the two readings to agree (a miss
 * names what differs, #504), record the reading, and hold it between the
 * ceiling and 90% of it. A drop of more than 10% means the ceiling is stale.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { explainDifference, formatReport, measure } from './bundle-report.mjs'
import { record } from './perf-report.mjs'

const script = join(import.meta.dirname, 'bundle-report.mjs')

// A build in a process of its own, for a config that imports `foldkit-ssr/vite`: Vite loads it with
// Node, which inside Vitest resolved it to its TypeScript source and could not load it.
const measureInChild = (dir, dump) => {
  const scratch = mkdtempSync(join(tmpdir(), 'bundle-budget-'))
  const json = join(scratch, 'report.json')
  try {
    execFileSync(process.execPath, [script, dir, '--json', json, '--dump', dump], {
      stdio: 'pipe',
    })
    return JSON.parse(readFileSync(json, 'utf8'))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export const clientBudget = ({ name, dir, ceiling, childProcess = false }) => {
  test(`the ${name} client loads at most the budgeted brotli JavaScript`, async () => {
    const dumps = mkdtempSync(join(tmpdir(), 'bundle-budget-dump-'))
    const [first, second] = [join(dumps, 'first'), join(dumps, 'second')]
    const build = async dump =>
      childProcess ? measureInChild(dir, dump) : await measure(dir, { dump })
    try {
      const report = await build(first)
      expect(report.total.chunks).toBeGreaterThan(0)
      // One source, one reading: a random build id moved it by up to 0.2 kB (#490).
      const again = await build(second)
      expect(
        again.total.brotli,
        again.total.brotli === report.total.brotli
          ? undefined
          : explainDifference(report, again, first, second),
      ).toBe(report.total.brotli)
      record({
        kind: 'size',
        name: `${name} client JS, brotli`,
        value: report.total.brotli,
        budget: ceiling,
      })
      const message = `${formatReport(report)}\n\nbudget: ${ceiling} bytes`
      expect(report.total.brotli, message).toBeLessThanOrEqual(ceiling)
      expect(report.total.brotli, message).toBeGreaterThan(ceiling * 0.9)
    } finally {
      rmSync(dumps, { recursive: true, force: true })
    }
  }, 300_000)
}
