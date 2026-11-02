#!/usr/bin/env node
/**
 * Turns the JSON lines the budget tests wrote to `PERF_REPORT` into a Markdown
 * table (#425), for `$GITHUB_STEP_SUMMARY`:
 *
 *   node scripts/perf-summary.mjs perf-report.jsonl
 *
 * Prints the table and exits 1 when a reading is over its budget or the file
 * holds none, so a job whose tests never wrote cannot pass on an empty table.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ms = value => `${value.toFixed(1)} ms`
const kb = value => `${(value / 1000).toFixed(1)} kB`
const verdict = over => (over ? 'OVER' : 'ok')

export const summarize = lines => {
  const entries = lines.filter(line => line.trim() !== '').map(line => JSON.parse(line))
  let failed = false
  const rows = []
  for (const entry of entries) {
    if (entry.kind === 'cpu') {
      const warmOver = entry.warm > entry.warmBudget
      const coldOver = entry.coldBudget !== null && entry.cold > entry.coldBudget
      failed ||= warmOver || coldOver
      rows.push(
        `| CPU | ${entry.suite}: ${entry.route} | warm ${ms(entry.warm)}, cold ${ms(entry.cold)} | warm ${entry.warmBudget} ms${entry.coldBudget === null ? '' : `, cold ${entry.coldBudget} ms`} | ${verdict(warmOver || coldOver)} |`,
      )
    } else if (entry.kind === 'size') {
      const over = entry.value > entry.budget
      failed ||= over
      rows.push(
        `| Size | ${entry.name} | ${kb(entry.value)} | ${kb(entry.budget)} | ${verdict(over)} |`,
      )
    } else if (entry.kind === 'cls') {
      const over = entry.value >= entry.budget
      failed ||= over
      rows.push(
        `| CLS | domains-plus ${entry.name} | ${entry.value.toFixed(3)} | ${entry.budget} | ${verdict(over)} |`,
      )
    } else throw new Error(`Unknown perf entry kind: ${JSON.stringify(entry)}`)
  }
  if (rows.length === 0) return { markdown: 'No budget wrote a reading.\n', failed: true }
  const markdown = [
    '## Performance budgets',
    '',
    '| Kind | Name | Reading | Limit | |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    "CPU readings are this thread's or workerd's CPU time on a shared runner, so their limits are generous: they catch a route that grew several times over, not a few percent.",
    '',
  ].join('\n')
  return { markdown, failed }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2]
  if (file === undefined) throw new Error('Usage: perf-summary.mjs <PERF_REPORT file>')
  const { markdown, failed } = summarize(readFileSync(file, 'utf8').split('\n'))
  process.stdout.write(markdown)
  process.exitCode = failed ? 1 : 0
}
