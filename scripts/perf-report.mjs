/**
 * The performance budgets' readings, for `scripts/perf-summary.mjs` (#425).
 * With `PERF_REPORT=<file>` set, each budget test appends its readings to the
 * file as JSON lines, passing or not: a miss is when the numbers matter. With
 * it unset nothing is written.
 */
import { appendFileSync } from 'node:fs'

/** @param {Record<string, unknown>} entry */
export const record = entry => {
  const file = process.env.PERF_REPORT
  if (file !== undefined && file !== '') appendFileSync(file, `${JSON.stringify(entry)}\n`)
}

/**
 * Reads `routes` through `Cpu.budget` with no limit, records every reading,
 * then fails over the budget as `Cpu.budget` does, so a miss is reported with
 * its numbers.
 */
export const cpuBudget = async (suite, budget, meter, config) => {
  const readings = await budget(meter, {
    ...config,
    warm: Number.POSITIVE_INFINITY,
    cold: undefined,
  })
  for (const reading of readings)
    record({
      kind: 'cpu',
      suite,
      route: reading.route,
      warm: reading.warm,
      cold: reading.cold,
      warmBudget: config.warm,
      coldBudget: config.cold ?? null,
    })
  const over = readings.filter(
    reading =>
      reading.warm > config.warm || (config.cold !== undefined && reading.cold > config.cold),
  )
  if (over.length > 0)
    throw new Error(
      `Over the CPU budget (warm ${config.warm} ms${config.cold === undefined ? '' : `, cold ${config.cold} ms`}): ` +
        over.map(reading => reading.route).join(', ') +
        '\n' +
        readings
          .map(
            reading =>
              `  ${reading.route}: cold ${reading.cold.toFixed(2)} ms, warm ${reading.warm.toFixed(2)} ms`,
          )
          .join('\n'),
    )
  return readings
}
